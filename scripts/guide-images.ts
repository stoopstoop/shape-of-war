// Generates the player guide shape images in docs/player-guide/img/shapes/ from the real shape
// registry (src/render/shapeSpecs.ts) and the real palette (src/render/neon.ts).
// Run: node scripts/guide-images.ts   (Node 22.18 or later strips the types itself)
//
// src/ modules use extensionless imports, which bare Node cannot resolve, so they load through a
// vite dev server in middleware mode (ssrLoadModule) and the server is closed before any file is
// written. Only types are imported statically. The server runs with configFile false (no PWA
// plugin, no git build id lookup), ws false (no HMR port) and watch null (no file watcher), so
// the script cannot clash with a running dev server and exits cleanly.
//
// Output is deterministic: no clock, no PRNG, every number fixed to 2 decimals, so two runs give
// byte identical files. The geometry is the spec's own arena units, drawn through one shared
// scale group, so relative sizes between kinds stay true.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import type { PaletteKey } from '../src/render/neon';
import type { ShapeLayer, ShapePrim, ShapeSpec } from '../src/render/shapeSpecs';

type ShapeSpecsModule = typeof import('../src/render/shapeSpecs');
type NeonModule = typeof import('../src/render/neon');
type WeaponsModule = typeof import('../src/game/weapons');

/** Image size in px. Every glyph image and every contact sheet cell is this square. */
export const CANVAS = 256;
/** Where the arena origin lands inside a cell. Leaves a strip at the bottom for the label. */
const CENTRE_X = 128;
const CENTRE_Y = 120;
/** The widest glyph (glow included) must fit within this many px of the centre. */
const FIT_HALF = 108;
/** The smallest nominal radius must still be at least this many px on screen. */
const MIN_RADIUS_PX = 12;
/** Shared scale is rounded down to a multiple of 1 / SCALE_STEPS_PER_UNIT. */
const SCALE_STEPS_PER_UNIT = 20;
const LABEL_Y = 246;
const LABEL_SIZE = 13;
const SHEET_COLUMNS = 6;
/** Where the images go, relative to the repo root. */
const OUT_DIR = join('docs', 'player-guide', 'img', 'shapes');

/** One stacked translucent stroke under the core line: width multiple of the layer width. */
export interface GlowPass {
  readonly widthMul: number;
  readonly alpha: number;
}

export interface RenderStyle {
  /** Wide to narrow, drawn first. Only layers with glow true get them. */
  readonly glow: readonly GlowPass[];
  /** Core stroke width multiple of the layer width. */
  readonly coreWidthMul: number;
  readonly palette: Readonly<Record<PaletteKey, number>>;
}

export interface Glyph {
  /** File name, with extension. */
  readonly file: string;
  /** Display name drawn under the shape. */
  readonly label: string;
  readonly spec: ShapeSpec;
}

// ---------------------------------------------------------------------------------------------
// Pure helpers

/** Pure: fixed 2 decimal number, with negative zero printed as 0.00. */
export function fmt(n: number): string {
  const s = n.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

/** Pure: 0xRRGGBB to a lowercase "#rrggbb" string. */
export function hex(rgb: number): string {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** Pure: escape text for an SVG text node or attribute. */
export function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Pure: channel wise multiply of two 0xRRGGBB colours, like a Pixi tint on a coloured stroke. */
export function multiplyRgb(a: number, b: number): number {
  const ch = (shift: number): number => Math.round((((a >> shift) & 0xff) * ((b >> shift) & 0xff)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Pure: "GravityWell" to "Gravity Well". */
export function displayName(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

/** Pure: "rapid" to "Rapid". */
function capitalise(s: string): string {
  return s.length === 0 ? s : `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

/**
 * Pure: the vertices Pixi's regularPoly builds (ShapePath.regularPoly in pixi.js 8): the first
 * vertex sits at angle -90 degrees plus rot, and the rest step round the other way. So a rot 0
 * polygon has a vertex pointing up (-y), not along +x.
 */
export function regularPolyPoints(r: number, sides: number, rot: number): number[] {
  const n = Math.max(Math.trunc(sides), 3);
  const start = -Math.PI / 2 + rot;
  const delta = (Math.PI * 2) / n;
  const pts: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = start - i * delta;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

/** Pure: "x,y x,y ..." for a flat coordinate list. */
function pointsAttr(pts: readonly number[]): string {
  const pairs: string[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) pairs.push(`${fmt(pts[i] ?? 0)},${fmt(pts[i + 1] ?? 0)}`);
  return pairs.join(' ');
}

/**
 * Pure: the bare SVG element for one prim, in arena units around the origin, or null when the
 * prim draws nothing (a line of under two points). poly closes, line stays open, rect is
 * centred, circle and regularPoly are centred on the origin.
 */
export function primElement(p: ShapePrim): string | null {
  switch (p.t) {
    case 'poly':
      return `<polygon points="${pointsAttr(p.pts)}"/>`;
    case 'line':
      return p.pts.length < 4 ? null : `<polyline points="${pointsAttr(p.pts)}"/>`;
    case 'circle':
      return `<circle cx="0.00" cy="0.00" r="${fmt(p.r)}"/>`;
    case 'rect':
      return `<rect x="${fmt(-p.w / 2)}" y="${fmt(-p.h / 2)}" width="${fmt(p.w)}" height="${fmt(p.h)}"/>`;
    case 'regularPoly':
      return `<polygon points="${pointsAttr(regularPolyPoints(p.r, p.sides, p.rot))}"/>`;
  }
}

/** Pure: colour of one layer: its baked colour (white when null) times the view tint. */
export function layerRgb(spec: ShapeSpec, layer: ShapeLayer, pal: RenderStyle['palette']): number {
  const base = layer.colour === null ? 0xffffff : pal[layer.colour];
  return spec.tint === null ? base : multiplyRgb(base, pal[spec.tint]);
}

/** Pure: the colour a kind is known by: its view tint, else its first baked non white colour. */
export function kindRgb(spec: ShapeSpec, pal: RenderStyle['palette']): number {
  if (spec.tint !== null) return pal[spec.tint];
  for (const l of spec.layers) {
    if (l.colour !== null && l.colour !== 'white') return pal[l.colour];
  }
  return 0xffffff;
}

/** Pure: every distinct layer colour of a spec as hex, kind colour first. */
export function colourList(spec: ShapeSpec, pal: RenderStyle['palette']): string[] {
  const out: string[] = [hex(kindRgb(spec, pal))];
  for (const l of spec.layers) {
    const h = hex(layerRgb(spec, l, pal));
    if (!out.includes(h)) out.push(h);
  }
  return out;
}

/** Pure: one `<g>` of stroked prims. Lines stay open. Empty when no prim draws. */
function strokeGroup(l: ShapeLayer, width: number, rgb: number, alpha: number): string[] {
  const els = l.prims.map(primElement).filter((e): e is string => e !== null);
  if (els.length === 0) return [];
  return [
    `<g fill="none" stroke="${hex(rgb)}" stroke-opacity="${fmt(alpha)}" stroke-width="${fmt(width)}" stroke-linejoin="round" stroke-linecap="round">`,
    ...els.map((e) => `  ${e}`),
    '</g>',
  ];
}

/** Pure: one `<g>` of filled prims. Open lines are never filled, as in the renderer. */
function fillGroup(l: ShapeLayer, rgb: number): string[] {
  const els = l.prims
    .filter((p) => p.t !== 'line')
    .map(primElement)
    .filter((e): e is string => e !== null);
  if (els.length === 0) return [];
  return [`<g fill="${hex(rgb)}" fill-opacity="${fmt(l.fill)}" stroke="none">`, ...els.map((e) => `  ${e}`), '</g>'];
}

/**
 * Pure: the SVG lines of one glyph in arena units around the origin, in the order the renderer
 * draws them (src/render/shapes.ts buildContext): every glow layer's halos first, then for each
 * layer its fill and its core stroke. Layer alpha scales the halos and the core line.
 */
export function glyphLines(spec: ShapeSpec, style: RenderStyle): string[] {
  const lines: string[] = [];
  for (const l of spec.layers) {
    if (!l.glow || l.width <= 0) continue;
    const rgb = layerRgb(spec, l, style.palette);
    for (const g of style.glow) lines.push(...strokeGroup(l, l.width * g.widthMul, rgb, g.alpha * l.alpha));
  }
  for (const l of spec.layers) {
    const rgb = layerRgb(spec, l, style.palette);
    if (l.fill > 0) lines.push(...fillGroup(l, rgb));
    if (l.width > 0) lines.push(...strokeGroup(l, l.width * style.coreWidthMul, rgb, l.alpha));
  }
  return lines;
}

/** Pure: farthest distance from the origin of any point of one prim. */
function primReach(p: ShapePrim): number {
  switch (p.t) {
    case 'poly':
    case 'line': {
      let best = 0;
      for (let i = 0; i + 1 < p.pts.length; i += 2) best = Math.max(best, Math.hypot(p.pts[i] ?? 0, p.pts[i + 1] ?? 0));
      return best;
    }
    case 'circle':
      return p.r;
    case 'rect':
      return Math.hypot(p.w / 2, p.h / 2);
    case 'regularPoly':
      return p.r;
  }
}

/** Pure: how far a glyph reaches from the origin in arena units, stroke and glow included. */
export function glyphExtent(spec: ShapeSpec, style: RenderStyle): number {
  const widest = Math.max(0, ...style.glow.map((g) => g.widthMul));
  let best = 0;
  for (const l of spec.layers) {
    const mul = l.glow ? Math.max(widest, style.coreWidthMul) : style.coreWidthMul;
    const half = l.width > 0 ? (l.width * mul) / 2 : 0;
    for (const p of l.prims) best = Math.max(best, primReach(p) + half);
  }
  return best;
}

/**
 * Pure: the one scale factor (px per arena unit) shared by every image. The widest glyph extent
 * must fit within fitHalf px of the centre; the result is rounded down to a multiple of 0.05.
 * Throws when that leaves the smallest nominal radius under minRadiusPx on screen, so a
 * change that makes a kind unreadable fails the run and never ships a tiny glyph.
 */
export function chooseScale(
  extents: readonly number[],
  radii: readonly number[],
  fitHalf: number,
  minRadiusPx: number,
): number {
  const widest = Math.max(...extents);
  const scale = Math.floor((fitHalf / widest) * SCALE_STEPS_PER_UNIT) / SCALE_STEPS_PER_UNIT;
  const smallest = Math.min(...radii);
  if (smallest * scale < minRadiusPx) {
    throw new Error(`scale ${scale} leaves radius ${smallest} u at ${smallest * scale} px, under ${minRadiusPx} px`);
  }
  return scale;
}

/** Pure: shape group plus label for one cell, in cell coordinates (0..CANVAS). */
export function cellLines(g: Glyph, scale: number, style: RenderStyle): string[] {
  const label = hex(kindRgb(g.spec, style.palette));
  return [
    `<g transform="translate(${fmt(CENTRE_X)} ${fmt(CENTRE_Y)}) scale(${fmt(scale)})">`,
    ...glyphLines(g.spec, style).map((l) => `  ${l}`),
    '</g>',
    `<text x="${fmt(CANVAS / 2)}" y="${fmt(LABEL_Y)}" fill="${label}" font-family="sans-serif" font-size="${LABEL_SIZE}" text-anchor="middle">${xmlEscape(g.label)}</text>`,
  ];
}

function svgOpen(w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
}

/** Pure: the full SVG document for one glyph. Black background, 256 by 256 viewBox. */
export function glyphSvg(g: Glyph, scale: number, style: RenderStyle): string {
  return [
    svgOpen(CANVAS, CANVAS),
    `<rect width="${CANVAS}" height="${CANVAS}" fill="#000000"/>`,
    ...cellLines(g, scale, style),
    '</svg>',
    '',
  ].join('\n');
}

/** Pure: the contact sheet: every glyph in a grid at the same shared scale, each labelled. */
export function sheetSvg(glyphs: readonly Glyph[], scale: number, style: RenderStyle, columns: number): string {
  const rows = Math.ceil(glyphs.length / columns);
  const width = columns * CANVAS;
  const height = rows * CANVAS;
  const frame = hex(style.palette.grid);
  const body: string[] = [];
  glyphs.forEach((g, i) => {
    const x = (i % columns) * CANVAS;
    const y = Math.floor(i / columns) * CANVAS;
    body.push(`<g transform="translate(${fmt(x)} ${fmt(y)})">`);
    body.push(
      `  <rect x="0.50" y="0.50" width="${CANVAS - 1}" height="${CANVAS - 1}" fill="none" stroke="${frame}" stroke-opacity="0.50"/>`,
    );
    body.push(...cellLines(g, scale, style).map((l) => `  ${l}`));
    body.push('</g>');
  });
  return [svgOpen(width, height), `<rect width="${width}" height="${height}" fill="#000000"/>`, ...body, '</svg>', ''].join(
    '\n',
  );
}

// ---------------------------------------------------------------------------------------------
// Edge: load the registry through vite, build the glyph list, write the files

export interface Loaded {
  readonly specs: ShapeSpecsModule;
  readonly neon: NeonModule;
  readonly weapons: WeaponsModule;
  /** Kind enum value to enum key, from the runtime Kind object (src/game/world.ts). */
  readonly kindNames: ReadonlyMap<number, string>;
}

async function load(server: ViteDevServer, url: string, names: readonly string[]): Promise<Record<string, unknown>> {
  const mod: Record<string, unknown> = await server.ssrLoadModule(url);
  const missing = names.filter((n) => !(n in mod));
  if (missing.length > 0) throw new Error(`${url} is missing exports: ${missing.join(', ')}`);
  return mod;
}

/** Pure: enum value to key from a TypeScript numeric enum object (forward keys only). */
function enumNames(kind: unknown): ReadonlyMap<number, string> {
  if (typeof kind !== 'object' || kind === null) throw new Error('src/game/world.ts: Kind is not an object');
  const out = new Map<number, string>();
  for (const [key, value] of Object.entries(kind)) {
    if (typeof value === 'number') out.set(value, key);
  }
  return out;
}

async function loadAll(root: string): Promise<Loaded> {
  const server = await createServer({
    configFile: false,
    root,
    server: { middlewareMode: true, ws: false, watch: null },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    const specs = await load(server, '/src/render/shapeSpecs.ts', [
      'ALL_KINDS',
      'PICKUP_VARIANTS',
      'UNKNOWN_SPEC',
      'pickupSlot',
      'slimeSlot',
      'specFor',
      'specForSlot',
    ]);
    const neon = await load(server, '/src/render/neon.ts', ['NEON_DEFAULT', 'computePalette', 'neonParams', 'neonRender']);
    const weapons = await load(server, '/src/game/weapons.ts', ['WEAPON_KINDS']);
    const world = await load(server, '/src/game/world.ts', ['Kind']);
    return {
      specs: specs as ShapeSpecsModule,
      neon: neon as NeonModule,
      weapons: weapons as WeaponsModule,
      kindNames: enumNames(world.Kind),
    };
  } finally {
    await server.close();
  }
}

/** Pure: the render style at the default neon setting, from the real neon module. */
function styleFrom(neon: NeonModule): RenderStyle {
  const params = neon.neonParams(neon.NEON_DEFAULT);
  const r = neon.neonRender(params);
  return {
    glow: [
      { widthMul: r.haloWidthMul, alpha: r.haloAlpha },
      { widthMul: r.innerWidthMul, alpha: r.innerAlpha },
    ],
    coreWidthMul: r.coreWidthMul,
    palette: neon.computePalette(params.saturation),
  };
}

/**
 * Pure: the glyph list in registry order: one per Kind, with each weapon pickup variant right
 * after the plain Weapon Pickup. Kind.Slime is the first Slime outline variant, so slime.svg
 * is that outline. Throws if the pickup or Slime slots do not line up with the registry.
 */
export function buildGlyphs(l: Loaded): Glyph[] {
  const { specs, kindNames, weapons } = l;
  if (specs.PICKUP_VARIANTS + 1 !== weapons.WEAPON_KINDS.length) {
    throw new Error('pickup variants and WEAPON_KINDS disagree');
  }
  const glyphs: Glyph[] = [];
  for (const kind of specs.ALL_KINDS) {
    const key = kindNames.get(kind);
    if (key === undefined) throw new Error(`no Kind key for value ${kind}`);
    const spec = specs.specFor(kind);
    if (spec === specs.UNKNOWN_SPEC) throw new Error(`Kind ${key} has no registry entry`);
    glyphs.push({ file: `${key.toLowerCase()}.svg`, label: displayName(key), spec });
    if (key === 'WeaponPickup') {
      for (let w = 1; w <= specs.PICKUP_VARIANTS; w += 1) {
        const weapon = weapons.WEAPON_KINDS[w];
        if (weapon === undefined) throw new Error(`no weapon name for pickup index ${w}`);
        glyphs.push({
          file: `${key.toLowerCase()}-${weapon.toLowerCase()}.svg`,
          label: `${displayName(key)} (${capitalise(weapon)})`,
          spec: specs.specForSlot(specs.pickupSlot(w)),
        });
      }
    }
    if (key === 'Slime' && spec !== specs.specForSlot(specs.slimeSlot(0))) {
      throw new Error('Kind.Slime is not the first Slime outline variant');
    }
  }
  const files = new Set(glyphs.map((g) => g.file));
  if (files.size !== glyphs.length) throw new Error('duplicate output file names');
  return glyphs;
}

async function main(): Promise<void> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const loaded = await loadAll(root);
  const style = styleFrom(loaded.neon);
  const glyphs = buildGlyphs(loaded);
  const scale = chooseScale(
    glyphs.map((g) => glyphExtent(g.spec, style)),
    glyphs.map((g) => g.spec.radius),
    FIT_HALF,
    MIN_RADIUS_PX,
  );
  const outDir = join(root, OUT_DIR);
  mkdirSync(outDir, { recursive: true });
  console.log(`shared scale ${fmt(scale)} px per arena unit (widest glyph fits ${FIT_HALF} px, smallest radius at least ${MIN_RADIUS_PX} px)`);
  for (const g of glyphs) {
    writeFileSync(join(outDir, g.file), glyphSvg(g, scale, style));
    const px = g.spec.radius * scale;
    console.log(`wrote ${join(OUT_DIR, g.file)}  ${colourList(g.spec, style.palette).join(' ')}  radius ${g.spec.radius} u = ${fmt(px)} px`);
  }
  writeFileSync(join(outDir, '_all.svg'), sheetSvg(glyphs, scale, style, SHEET_COLUMNS));
  console.log(`wrote ${join(OUT_DIR, '_all.svg')}  contact sheet, ${glyphs.length} cells, ${SHEET_COLUMNS} columns`);
}

// Run only when started as a script, so tests can import the pure functions above.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
