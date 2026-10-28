// v2 enemy glyphs (docs/10 wave C Glow item 2). Pure registry checks, no pixi.js: every new Kind
// has a real glyph, silhouettes differ when drawn at a 12 u radius, and Slime reads as a floor
// hazard (translucent, smooth, soft rim, floor layer), never as an enemy.
import { describe, expect, it } from 'vitest';
import { Kind } from '../../src/game/world';
import { SLIME_VARIANTS } from '../../src/render/enemyFx';
import {
  ALL_KINDS,
  BULWARK_SHIELD_HALF,
  BULWARK_SHIELD_R,
  isFloorSlot,
  KIND_NUM,
  MAX_SLOT,
  SHAPE_SPECS,
  SLIME_SLOT_BASE,
  SLIME_SPECS,
  SLIME_WOBBLE,
  slimeEdge,
  slimeSlot,
  specForSlot,
  UNKNOWN_SPEC,
  visualSlot,
  type DrawnKind,
  type ShapePrim,
  type ShapeSpec,
} from '../../src/render/shapeSpecs';

const V2: readonly DrawnKind[] = [Kind.Charger, Kind.Bulwark, Kind.Blink, Kind.Swirl, Kind.Sower, Kind.Mine, Kind.Splime, Kind.Slime];
const V1_ENEMIES: readonly DrawnKind[] = [
  Kind.Grunt,
  Kind.Wanderer,
  Kind.Weaver,
  Kind.Pinwheel,
  Kind.Dart,
  Kind.SnakeHead,
  Kind.SnakeBody,
  Kind.Spawner,
  Kind.Geom,
];

/** Outline sample points of one prim (closed polys closed, lines open). */
function primPoints(p: ShapePrim): [number, number][] {
  const out: [number, number][] = [];
  const edge = (x1: number, y1: number, x2: number, y2: number): void => {
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 0.2));
    for (let i = 0; i <= n; i++) out.push([x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
  };
  const path = (pts: readonly number[], closed: boolean): void => {
    const n = pts.length / 2;
    for (let i = 0; i + 1 < n + (closed ? 1 : 0); i++) {
      const j = (i + 1) % n;
      edge(pts[i * 2] ?? 0, pts[i * 2 + 1] ?? 0, pts[j * 2] ?? 0, pts[j * 2 + 1] ?? 0);
    }
  };
  switch (p.t) {
    case 'poly':
      path(p.pts, true);
      break;
    case 'line':
      path(p.pts, false);
      break;
    case 'circle':
      for (let i = 0; i < 128; i++) out.push([Math.cos((i / 128) * 6.2832) * p.r, Math.sin((i / 128) * 6.2832) * p.r]);
      break;
    case 'rect':
      path([-p.w / 2, -p.h / 2, p.w / 2, -p.h / 2, p.w / 2, p.h / 2, -p.w / 2, p.h / 2], true);
      break;
    case 'regularPoly': {
      const pts: number[] = [];
      for (let i = 0; i < p.sides; i++) {
        const a = -Math.PI / 2 + p.rot + (i / p.sides) * Math.PI * 2;
        pts.push(Math.cos(a) * p.r, Math.sin(a) * p.r);
      }
      path(pts, true);
      break;
    }
  }
  return out;
}

/** Cells (1 u grid) touched by the glyph's stroked lines, scaled so its extent is 12 u. */
function silhouette(spec: ShapeSpec): Set<string> {
  const pts: [number, number][] = [];
  for (const l of spec.layers) if (l.width > 0) for (const p of l.prims) pts.push(...primPoints(p));
  let ext = 0;
  for (const [x, y] of pts) ext = Math.max(ext, Math.hypot(x, y));
  const k = ext > 0 ? 12 / ext : 1;
  const cells = new Set<string>();
  for (const [x, y] of pts) cells.add(`${Math.floor(x * k)},${Math.floor(y * k)}`);
  return cells;
}

/** Share of cells that differ: |A xor B| / |A or B|. */
function difference(a: Set<string>, b: Set<string>): number {
  let both = 0;
  for (const c of a) if (b.has(c)) both++;
  const union = a.size + b.size - both;
  return union > 0 ? (union - both) / union : 0;
}

describe('v2 enemy glyphs', () => {
  it('every new Kind has a real glyph, not the magenta placeholder', () => {
    for (const k of V2) {
      const s = SHAPE_SPECS[k];
      expect(s).not.toBe(UNKNOWN_SPEC);
      expect(s.tint).not.toBe('magenta');
      expect(s.layers.some((l) => l.width > 0)).toBe(true);
      expect(ALL_KINDS).toContain(k);
    }
  });

  it('each enemy wears its own palette key; the Mine wears its Sower colour', () => {
    expect(SHAPE_SPECS[Kind.Charger].tint).toBe('charger');
    expect(SHAPE_SPECS[Kind.Bulwark].tint).toBe('bulwark');
    expect(SHAPE_SPECS[Kind.Blink].tint).toBe('blink');
    expect(SHAPE_SPECS[Kind.Swirl].tint).toBe('swirl');
    expect(SHAPE_SPECS[Kind.Sower].tint).toBe('sower');
    expect(SHAPE_SPECS[Kind.Mine].tint).toBe('sower');
    expect(SHAPE_SPECS[Kind.Splime].tint).toBe('splime');
    expect(SHAPE_SPECS[Kind.Slime].tint).toBe('slime');
  });

  it('silhouettes differ at a 12 u radius: each new glyph against every other enemy glyph', () => {
    const all = [...V1_ENEMIES, ...V2];
    const sil = new Map(all.map((k) => [k, silhouette(SHAPE_SPECS[k])]));
    for (const a of V2) {
      for (const b of all) {
        if (a === b) continue;
        const d = difference(sil.get(a) ?? new Set(), sil.get(b) ?? new Set());
        expect(d, `kind ${a} vs ${b}`).toBeGreaterThanOrEqual(0.6);
      }
    }
  });

  it('Bulwark carries the shield arc from the render contract: radius 26 u, plus and minus 60 degrees', () => {
    expect(BULWARK_SHIELD_R).toBe(26);
    expect(BULWARK_SHIELD_HALF).toBeCloseTo(Math.PI / 3, 9);
    const arc = SHAPE_SPECS[Kind.Bulwark].layers[1]?.prims[0];
    expect(arc?.t).toBe('line');
    if (arc?.t === 'line') {
      const n = arc.pts.length / 2;
      for (let i = 0; i < n; i++) expect(Math.hypot(arc.pts[i * 2] ?? 0, arc.pts[i * 2 + 1] ?? 0)).toBeCloseTo(26, 1);
      // Centred on the heading (+x): first and last points mirror across the x axis.
      expect(arc.pts[1]).toBeCloseTo(-(arc.pts[arc.pts.length - 1] ?? 0), 6);
      expect(Math.atan2(arc.pts[arc.pts.length - 1] ?? 0, arc.pts[arc.pts.length - 2] ?? 0)).toBeCloseTo(Math.PI / 3, 2);
    }
    expect(SHAPE_SPECS[Kind.Bulwark].radius).toBeGreaterThanOrEqual(BULWARK_SHIELD_R);
  });

  it('Blink ring has a gap toward the heading', () => {
    const ring = SHAPE_SPECS[Kind.Blink].layers[0]?.prims[0];
    expect(ring?.t).toBe('line');
    if (ring?.t === 'line') {
      const n = ring.pts.length / 2;
      for (let i = 0; i < n; i++) expect(ring.pts[i * 2] ?? 0).toBeLessThan(13 * Math.cos(0.5));
    }
  });

  it('Splime has a soft filled nucleus without a halo and a droplet off the rear', () => {
    const s = SHAPE_SPECS[Kind.Splime];
    const nucleus = s.layers.find((l) => l.fill > 0.3 && !l.glow);
    expect(nucleus).toBeDefined();
    const body = s.layers[0]?.prims[0];
    expect(body?.t).toBe('poly');
    if (body?.t === 'poly') {
      // The rear of the body dips: the drip notch.
      const xs = body.pts.filter((_, i) => i % 2 === 0);
      expect(Math.min(...xs)).toBeGreaterThan(-16);
      expect(Math.max(...xs)).toBeGreaterThan(15.5);
    }
    const drop = s.layers[1]?.prims[0];
    expect(drop?.t).toBe('poly');
    if (drop?.t === 'poly') expect(Math.max(...drop.pts.filter((_, i) => i % 2 === 0))).toBeLessThan(-15);
  });
});

describe('slime reads as a floor hazard', () => {
  it('translucent fill, a soft rim under full alpha and no bright core', () => {
    for (const s of SLIME_SPECS) {
      const filled = s.layers.filter((l) => l.fill > 0);
      expect(filled.length).toBeGreaterThan(0);
      for (const l of filled) expect(l.fill).toBeLessThanOrEqual(0.25);
      for (const l of s.layers) if (l.width > 0) expect(l.alpha).toBeLessThan(1);
      const rim = Math.max(...s.layers.filter((l) => l.width > 0).map((l) => l.alpha));
      const inner = Math.min(...s.layers.filter((l) => l.width > 0).map((l) => l.alpha));
      expect(rim).toBeGreaterThan(inner); // the rim is the brightest line
    }
  });

  it('no hard polygon: every outline is smooth (many points, small turn per vertex)', () => {
    for (const s of SLIME_SPECS) {
      for (const l of s.layers) {
        for (const p of l.prims) {
          expect(p.t).toBe('poly');
          if (p.t !== 'poly') continue;
          const n = p.pts.length / 2;
          expect(n).toBeGreaterThanOrEqual(40);
          for (let i = 0; i < n; i++) {
            const a = (i + n - 1) % n;
            const c = (i + 1) % n;
            const ux = (p.pts[i * 2] ?? 0) - (p.pts[a * 2] ?? 0);
            const uy = (p.pts[i * 2 + 1] ?? 0) - (p.pts[a * 2 + 1] ?? 0);
            const vx = (p.pts[c * 2] ?? 0) - (p.pts[i * 2] ?? 0);
            const vy = (p.pts[c * 2 + 1] ?? 0) - (p.pts[i * 2 + 1] ?? 0);
            const turn = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
            expect(turn).toBeLessThan(0.35);
          }
        }
      }
    }
  });

  it('edge wobble differs per variant and stays within the bound around 40 u', () => {
    const outlines = SLIME_SPECS.map((s) => JSON.stringify(s.layers[1]?.prims));
    expect(new Set(outlines).size).toBe(SLIME_VARIANTS);
    for (let seed = 1; seed <= SLIME_VARIANTS; seed++) {
      for (let a = 0; a < 6.28; a += 0.05) {
        const r = slimeEdge(a, seed);
        expect(r).toBeGreaterThanOrEqual(40 * (1 - SLIME_WOBBLE) - 1e-9);
        expect(r).toBeLessThanOrEqual(40 * (1 + SLIME_WOBBLE) + 1e-9);
      }
    }
  });

  it('draws on the floor layer from its per id variant slot; no enemy does', () => {
    const slots = new Set<number>();
    for (let i = 0; i < 64; i++) {
      const s = visualSlot(Kind.Slime, 0, i / 64);
      slots.add(s);
      expect(isFloorSlot(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(SLIME_SLOT_BASE);
      expect(s).toBeLessThanOrEqual(MAX_SLOT);
      expect(SLIME_SPECS).toContain(specForSlot(s));
    }
    expect(slots.size).toBe(SLIME_VARIANTS);
    expect(slimeSlot(0)).toBe(SLIME_SLOT_BASE);
    expect(isFloorSlot(Kind.Slime)).toBe(true);
    for (const k of ALL_KINDS) if (k !== Kind.Slime) expect(isFloorSlot(visualSlot(k, 0, 0.5))).toBe(false);
  });

  it('kind numbers for the renderer match the enum and form one contiguous v2 range', () => {
    expect(KIND_NUM.charger).toBe(Kind.Charger);
    expect(KIND_NUM.slime).toBe(Kind.Slime);
    const ks = Object.values(KIND_NUM).sort((a, b) => a - b);
    for (let i = 1; i < ks.length; i++) expect((ks[i] ?? 0) - (ks[i - 1] ?? 0)).toBe(1);
  });
});
