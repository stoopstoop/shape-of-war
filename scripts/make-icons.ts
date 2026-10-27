// Generates the four PWA icons in public/icons/ from inline SVG. No dependencies, no external art.
// Run: node scripts/make-icons.ts   (Node 22.18 or later strips the types itself)
//
// The inline SVGs below are the source of truth. SVG has no rasteriser in Node, so a tiny one
// renders the subset used here: one background <rect> and stacked <polygon> outline strokes with
// round joins. Stacked translucent strokes give the neon glow. Output is deterministic.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const VIEWBOX = 512;

// Cyan triangle, apex up, centred on its bounding box. Glow layers first, hot core last.
function layers(points: string): string {
  const glow = '#00e5ff';
  const rows: ReadonlyArray<readonly [number, string, number]> = [
    [60, glow, 0.05],
    [48, glow, 0.07],
    [38, glow, 0.09],
    [28, glow, 0.13],
    [20, glow, 0.2],
    [14, '#00f0ff', 1],
    [5, '#d2ffff', 1],
  ];
  return rows
    .map(
      ([w, c, o]) =>
        `<polygon points="${points}" fill="none" stroke="${c}" stroke-width="${w}" stroke-opacity="${o}" stroke-linejoin="round"/>`,
    )
    .join('');
}

function svgDoc(points: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">` +
    `<rect width="${VIEWBOX}" height="${VIEWBOX}" fill="#000000"/>${layers(points)}</svg>`
  );
}

// "any" icon: circumradius 190. Farthest vertex plus widest glow stays inside the 512 canvas.
const ANY_SVG = svgDoc('256,113.5 420.54,398.5 91.46,398.5');
// "maskable" icon: circumradius 140. Farthest vertex 160.4 from centre, plus 30 of glow reach,
// is 190.4, inside the 204.8 radius (central 80 percent) safe zone.
const MASKABLE_SVG = svgDoc('256,151 377.24,361 134.76,361');

interface Layer {
  readonly rgb: readonly [number, number, number];
  readonly halfWidth: number;
  readonly opacity: number;
}

interface Parsed {
  readonly background: readonly [number, number, number];
  readonly points: ReadonlyArray<readonly [number, number]>;
  readonly layers: readonly Layer[];
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (m === null) throw new Error(`bad colour ${hex}`);
  return [parseInt(m[1] ?? '0', 16), parseInt(m[2] ?? '0', 16), parseInt(m[3] ?? '0', 16)];
}

function attrs(tag: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of tag.matchAll(/([\w-]+)="([^"]*)"/g)) {
    out.set(m[1] ?? '', m[2] ?? '');
  }
  return out;
}

function need(a: Map<string, string>, key: string): string {
  const v = a.get(key);
  if (v === undefined) throw new Error(`missing attribute ${key}`);
  return v;
}

function parsePoints(raw: string): ReadonlyArray<readonly [number, number]> {
  return raw
    .trim()
    .split(/\s+/)
    .map((pair): readonly [number, number] => {
      const [x, y] = pair.split(',').map(Number);
      if (x === undefined || y === undefined || Number.isNaN(x) || Number.isNaN(y)) {
        throw new Error(`bad point ${pair}`);
      }
      return [x, y];
    });
}

function parseSvg(svg: string): Parsed {
  const rect = /<rect\s+([^>]*?)\/>/.exec(svg);
  if (rect === null) throw new Error('no background rect');
  const background = hexToRgb(need(attrs(rect[1] ?? ''), 'fill'));
  const polys = [...svg.matchAll(/<polygon\s+([^>]*?)\/>/g)];
  if (polys.length === 0) throw new Error('no polygons');
  const first = attrs(polys[0]?.[1] ?? '');
  const points = parsePoints(need(first, 'points'));
  const parsedLayers = polys.map((p): Layer => {
    const a = attrs(p[1] ?? '');
    return {
      rgb: hexToRgb(need(a, 'stroke')),
      halfWidth: Number(need(a, 'stroke-width')) / 2,
      opacity: Number(need(a, 'stroke-opacity')),
    };
  });
  return { background, points, layers: parsedLayers };
}

/** Pure: distance from point (px, py) to segment a-b. */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2));
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

/** Pure: distance from a point to the closed polygon outline. */
function distToOutline(px: number, py: number, pts: ReadonlyArray<readonly [number, number]>): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a === undefined || b === undefined) continue;
    best = Math.min(best, distToSegment(px, py, a[0], a[1], b[0], b[1]));
  }
  return best;
}

/** Pure: rasterise the parsed SVG to packed RGB bytes, with one pixel of analytic anti-aliasing. */
function rasterise(p: Parsed, size: number): Uint8Array {
  const scale = VIEWBOX / size;
  const rgb = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = distToOutline((x + 0.5) * scale, (y + 0.5) * scale, p.points);
      let r = p.background[0];
      let g = p.background[1];
      let b = p.background[2];
      for (const layer of p.layers) {
        const coverage = Math.max(0, Math.min(1, (layer.halfWidth - d) / scale + 0.5)) * layer.opacity;
        r += (layer.rgb[0] - r) * coverage;
        g += (layer.rgb[1] - g) * coverage;
        b += (layer.rgb[2] - b) * coverage;
      }
      const i = (y * size + x) * 3;
      rgb[i] = Math.round(r);
      rgb[i + 1] = Math.round(g);
      rgb[i + 2] = Math.round(b);
    }
  }
  return rgb;
}

const CRC_TABLE: readonly number[] = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of buf) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

/** Pure: encode packed RGB bytes as an 8-bit truecolour PNG. */
function encodePng(rgb: Uint8Array, size: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour RGB
  header[10] = 0; // compression
  header[11] = 0; // filter method
  header[12] = 0; // no interlace
  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type none
    raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

function main(): void {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
  mkdirSync(outDir, { recursive: true });
  const jobs: ReadonlyArray<readonly [string, string, number]> = [
    ['icon-192.png', ANY_SVG, 192],
    ['icon-512.png', ANY_SVG, 512],
    ['icon-maskable-192.png', MASKABLE_SVG, 192],
    ['icon-maskable-512.png', MASKABLE_SVG, 512],
  ];
  for (const [name, svg, size] of jobs) {
    const png = encodePng(rasterise(parseSvg(svg), size), size);
    writeFileSync(join(outDir, name), png);
    console.log(`wrote public/icons/${name} (${size}x${size}, ${png.length} bytes)`);
  }
}

main();
