// Pure boss and boss part shape specs (docs/12 wave V3-A "Design: the boss roster", Glow visual
// column). No pixi.js import. Boss colours are baked into the layers (the view tint stays white)
// so the white core reads white; parts are drawn white and tinted with the boss colour per frame.
// Each boss has BOSS_OPEN_STEPS prebuilt specs, one per openness step, so a shell opening swaps a
// shared context (no Graphics.clear, no allocation per frame). Line widths carry the tier weight
// (bossLook.ts) and every boss has a second concentric rim at 0.6 alpha. A boss body radius is 44
// to 90 u; the largest enemy is 24 u, so a boss never reads as an enemy even where hues are close.
import {
  BOSS_BROOD,
  BOSS_COUNT,
  BOSS_OPEN_STEPS,
  BOSS_EMBER,
  BOSS_GRAVITAS,
  BOSS_MIRAGE,
  BOSS_RIM_ALPHA,
  BOSS_SPINDLE,
  BOSS_WARDEN,
  bossColourOf,
  bossIndex,
  bossTierOf,
  tierHaloMul,
  tierWeight,
} from './bossLook';
import { MIRAGE_ARC_HALF } from './bossTier2';
import type { PaletteKey } from './neon';
import type { ShapeLayer, ShapePrim, ShapeSpec } from './shapeSpecs';

/** Base core line width on the boss layer before the tier weight, arena units. */
export const BOSS_LINE = 2.5;
/** Rim radius as a multiple of the body radius. Outside every open plate. */
export const BOSS_RIM = 1.18;

/**
 * Body radius each spec is drawn at. The renderer scales a view by BossView.radius over this, so a
 * boss of any size keeps its silhouette. Waves A and B have their own (tier 2 match the BOSS_TABLE
 * radii: Ember 44, Mirage 50, Gravitas 60); later ids share 60.
 */
export const BOSS_BODY_R: readonly number[] = [56, 60, 50, 44, 50, 60, 60, 60, 60, 60];

/** Pure: the body radius a boss index's specs are drawn at. */
export function bossBodyR(id: number): number {
  return BOSS_BODY_R[bossIndex(id)] ?? 60;
}

/** White core radius as a share of the body radius, closed and fully open, per wave A boss. */
const CORE_FRAC: readonly (readonly [number, number])[] = [
  [0.16, 0.24],
  [0.2, 0.28],
  [0.12, 0.17],
  [0.13, 0.2],
  [0.16, 0.26],
  [0.14, 0.22],
];
const CORE_FRAC_GENERIC: readonly [number, number] = [0.16, 0.24];

/** Pure: white core radius share of the body radius for a boss index at openness o (0 to 1). */
export function bossCoreFrac(id: number, o: number): number {
  const f = CORE_FRAC[bossIndex(id)] ?? CORE_FRAC_GENERIC;
  const u = Math.max(0, Math.min(1, Number.isFinite(o) ? o : 0));
  return f[0] + (f[1] - f[0]) * u;
}

interface LayerOpts {
  fill?: number;
  colour?: PaletteKey | null;
  glow?: boolean;
  alpha?: number;
  haloMul?: number;
}

function layer(prims: readonly ShapePrim[], width: number, o: LayerOpts = {}): ShapeLayer {
  return {
    prims,
    width,
    fill: o.fill ?? 0,
    colour: o.colour ?? null,
    glow: o.glow ?? true,
    alpha: o.alpha ?? 1,
    haloMul: o.haloMul ?? 1,
  };
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function polar(r: number, a: number): [number, number] {
  return [r2(Math.cos(a) * r), r2(Math.sin(a) * r)];
}

/** Open polyline along a circle arc of radius r from a0 to a1 (radians), n segments. */
function arc(r: number, a0: number, a1: number, n: number): ShapePrim {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) pts.push(...polar(r, a0 + ((a1 - a0) * i) / n));
  return { t: 'line', pts };
}

/** Closed outline of n points at radius rad(theta). */
function radialPoly(n: number, rad: (theta: number) => number): ShapePrim {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(...polar(rad(a), a));
  }
  return { t: 'poly', pts };
}

/** Pure: openness of a prebuilt step (0 to 1). */
export function stepOpenness(step: number): number {
  const n = BOSS_OPEN_STEPS - 1;
  const s = Math.max(0, Math.min(n, Math.round(Number.isFinite(step) ? step : 0)));
  return s / n;
}

/** Second concentric rim, shared by every boss. */
function rim(R: number, w: number, colour: PaletteKey, haloMul: number): ShapeLayer {
  return layer([{ t: 'circle', r: r2(R * BOSS_RIM) }], w * 0.6, { colour, alpha: BOSS_RIM_ALPHA, haloMul });
}

/** White inner core: dim when closed, a bright filled disc when open. */
function whiteCore(r: number, w: number, o: number): ShapeLayer {
  return layer([{ t: 'circle', r: r2(r) }], w * 0.5, { colour: 'white', fill: lerp(0.2, 1, o), glow: o >= 0.5 });
}

/** Warden shell plate: one trapezoid per hexagon edge, between rIn and rOut over plus and minus half. */
export function wardenPlate(k: number, rIn: number, rOut: number, half: number): ShapePrim {
  const a = (k * Math.PI) / 3 + Math.PI / 6;
  return { t: 'poly', pts: [...polar(rOut, a - half), ...polar(rOut, a + half), ...polar(rIn, a + half), ...polar(rIn, a - half)] };
}

/** Warden plate radii and angular half width at an openness: plates slide out and narrow. */
export function wardenPlateGeom(o: number, R: number): { rIn: number; rOut: number; half: number } {
  const slide = 0.16 * R * o;
  const half = (28 * Math.PI) / 180 - ((10 * Math.PI) / 180) * o;
  return { rIn: 0.6 * R + slide, rOut: 0.92 * R + slide, half };
}

/**
 * Warden (blue): a double hexagon. The six outer plates slide shut when guarded and slide out to
 * a bright core when vulnerable. The inner hexagon fills as the shell opens.
 */
function wardenSpec(o: number): ShapeSpec {
  const id = BOSS_WARDEN;
  const R = bossBodyR(id);
  const w = BOSS_LINE * tierWeight(bossTierOf(id));
  const hm = tierHaloMul(bossTierOf(id));
  const c = bossColourOf(id);
  const g = wardenPlateGeom(o, R);
  const plates: ShapePrim[] = [];
  for (let k = 0; k < 6; k++) plates.push(wardenPlate(k, g.rIn, g.rOut, g.half));
  return {
    tint: null,
    radius: r2(R * BOSS_RIM),
    layers: [
      layer(plates, w, { colour: c, fill: lerp(0.18, 0.06, o), haloMul: hm }),
      layer([{ t: 'regularPoly', r: r2(0.44 * R), sides: 6, rot: 0 }], w * 0.8, { colour: c, fill: lerp(0.05, 0.3, o), haloMul: hm }),
      whiteCore(bossCoreFrac(id, o) * R, w, o),
      rim(R, w, c, hm),
    ],
  };
}

/** Pure: Brood blob outline radius at theta for body radius R (a soft, lumpy round body). */
export function broodEdge(theta: number, R: number): number {
  return R * (1 + 0.06 * Math.cos(3 * theta + 0.4) + 0.035 * Math.cos(5 * theta + 1.3));
}

/**
 * Brood (green): a rounded blob with a membrane over its nucleus. Its three pods are separate
 * BossPart entities. While the pods live the membrane is bright and the nucleus dim; with the pods
 * gone the membrane fades and the nucleus burns white.
 */
function broodSpec(o: number): ShapeSpec {
  const id = BOSS_BROOD;
  const R = bossBodyR(id);
  const w = BOSS_LINE * tierWeight(bossTierOf(id));
  const hm = tierHaloMul(bossTierOf(id));
  const c = bossColourOf(id);
  return {
    tint: null,
    radius: r2(R * BOSS_RIM),
    layers: [
      layer([radialPoly(48, (a) => broodEdge(a, R))], w, { colour: c, fill: 0.1, haloMul: hm }),
      layer([{ t: 'circle', r: r2(0.52 * R) }], w * 0.7, { colour: c, alpha: lerp(0.95, 0.25, o), glow: o < 0.5, haloMul: hm }),
      whiteCore(bossCoreFrac(id, o) * R, w, o),
      rim(R, w, c, hm),
    ],
  };
}

/** Pure: Spindle four point star outline for body radius R (points on the axes). */
export function spindleStar(R: number): ShapePrim {
  const pts: number[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    pts.push(...polar(k % 2 === 0 ? R : 0.36 * R, a));
  }
  return { t: 'poly', pts };
}

/**
 * Spindle (yellow): a four point star with a bright core (always hittable). Its long beam arms
 * are sweep hazards drawn by the hazard layer; the star carries short arm stubs along its facing.
 */
function spindleSpec(o: number): ShapeSpec {
  const id = BOSS_SPINDLE;
  const R = bossBodyR(id);
  const w = BOSS_LINE * tierWeight(bossTierOf(id));
  const hm = tierHaloMul(bossTierOf(id));
  const c = bossColourOf(id);
  return {
    tint: null,
    radius: r2(R * BOSS_RIM),
    layers: [
      layer([spindleStar(R)], w, { colour: c, fill: 0.08, haloMul: hm }),
      layer([{ t: 'circle', r: r2(0.3 * R) }], w * 0.6, { colour: c, haloMul: hm }),
      whiteCore(bossCoreFrac(id, o) * R, w, o),
      rim(R, w, c, hm),
    ],
  };
}

/** Ember nose length as a multiple of the body radius: the arrowhead points past the rim. */
export const EMBER_NOSE = 1.3;

/** Pure: Ember arrowhead outline for body radius R, nose on +x (the facing), a notched tail. */
export function emberArrow(R: number): ShapePrim {
  return {
    t: 'poly',
    pts: [r2(EMBER_NOSE * R), 0, r2(-0.8 * R), r2(0.85 * R), r2(-0.35 * R), 0, r2(-0.8 * R), r2(-0.85 * R)],
  };
}

/**
 * Ember (orange, tier 2): an arrowhead with an inner chevron that fills as it opens (hittable only
 * resting or stunned). The view turns with the facing, so the nose points along the dash. The flame
 * and spark trails, the wind up lane and the Mine pulse are render effects (renderer.ts).
 */
function emberSpec(o: number): ShapeSpec {
  const id = BOSS_EMBER;
  const R = bossBodyR(id);
  const w = BOSS_LINE * tierWeight(bossTierOf(id));
  const hm = tierHaloMul(bossTierOf(id));
  const c = bossColourOf(id);
  const chevron: ShapePrim = { t: 'poly', pts: [r2(0.6 * R), 0, r2(-0.38 * R), r2(0.42 * R), r2(-0.12 * R), 0, r2(-0.38 * R), r2(-0.42 * R)] };
  return {
    tint: null,
    radius: r2(Math.max(R * BOSS_RIM, EMBER_NOSE * R)),
    layers: [
      layer([emberArrow(R)], w, { colour: c, fill: lerp(0.1, 0.16, o), haloMul: hm }),
      layer([chevron], w * 0.7, { colour: c, fill: lerp(0.05, 0.4, o), haloMul: hm }),
      whiteCore(bossCoreFrac(id, o) * R, w, o),
      rim(R, w, c, hm),
    ],
  };
}

/** Mirage shield ring radius as a multiple of the body radius. */
export const MIRAGE_SHIELD = 1.0;

/**
 * Pure: Mirage shield ring with its open arc centred on +x (the view turns it to the arc angle), at
 * the full 70 degree opening. The renderer draws the closing (entrance, phase change) and the bright
 * window over it on the sprite layer, so one prebuilt ring serves every state.
 */
export function mirageShield(R: number): ShapePrim {
  const g = MIRAGE_ARC_HALF;
  return arc(r2(MIRAGE_SHIELD * R), g, Math.PI * 2 - g, 40);
}

/** Pure: the two arc lip ticks at the gap edges of the shield, across the ring. */
export function mirageLips(R: number): ShapePrim[] {
  const g = MIRAGE_ARC_HALF;
  const r0 = 0.84 * R;
  const r1 = 1.12 * R;
  return [
    { t: 'line', pts: [...polar(r0, g), ...polar(r1, g)] },
    { t: 'line', pts: [...polar(r0, -g), ...polar(r1, -g)] },
  ];
}

/**
 * Mirage (magenta, tier 2): a shield ring with a 70 degree open arc (shots count only through it),
 * bright lips at the arc edges, a diamond lens inside and the white core.
 */
function mirageSpec(o: number): ShapeSpec {
  const id = BOSS_MIRAGE;
  const R = bossBodyR(id);
  const w = BOSS_LINE * tierWeight(bossTierOf(id));
  const hm = tierHaloMul(bossTierOf(id));
  const c = bossColourOf(id);
  return {
    tint: null,
    radius: r2(R * BOSS_RIM),
    layers: [
      layer([mirageShield(R)], w, { colour: c, haloMul: hm }),
      layer(mirageLips(R), w * 0.8, { colour: c, haloMul: hm }),
      layer([{ t: 'regularPoly', r: r2(0.55 * R), sides: 4, rot: 0 }], w * 0.7, { colour: c, fill: lerp(0.06, 0.28, o), haloMul: hm }),
      whiteCore(bossCoreFrac(id, o) * R, w, o),
      rim(R, w, c, hm),
    ],
  };
}

/** Gravitas ring radii as multiples of the body radius: outer, middle (three arcs), inner, core. */
export const GRAVITAS_RINGS: readonly [number, number, number, number] = [0.95, 0.7, 0.48, 0.3];

/** Pure: the middle ring of Gravitas, three arcs of 100 degrees with 20 degree gaps. */
export function gravitasMiddle(R: number): ShapePrim[] {
  const r = r2(GRAVITAS_RINGS[1] * R);
  const out: ShapePrim[] = [];
  for (let k = 0; k < 3; k++) {
    const a0 = (k * 2 * Math.PI) / 3 + (10 * Math.PI) / 180;
    out.push(arc(r, a0, a0 + (100 * Math.PI) / 180, 12));
  }
  return out;
}

/**
 * Gravitas (violet, tier 2): a filled core inside three concentric rings (the middle one in three
 * arcs, so its turn reads), a white core that burns once the anchors are gone. The anchors are
 * BossPart entities; the faint lines joining them and the lattice pull are render effects.
 */
function gravitasSpec(o: number): ShapeSpec {
  const id = BOSS_GRAVITAS;
  const R = bossBodyR(id);
  const w = BOSS_LINE * tierWeight(bossTierOf(id));
  const hm = tierHaloMul(bossTierOf(id));
  const c = bossColourOf(id);
  const [r0, , r2i, rc] = GRAVITAS_RINGS;
  return {
    tint: null,
    radius: r2(R * BOSS_RIM),
    layers: [
      layer([{ t: 'circle', r: r2(r0 * R) }], w, { colour: c, fill: 0.05, haloMul: hm }),
      layer(gravitasMiddle(R), w * 0.8, { colour: c, alpha: 0.85, haloMul: hm }),
      layer([{ t: 'circle', r: r2(r2i * R) }], w * 0.7, { colour: c, haloMul: hm }),
      layer([{ t: 'circle', r: r2(rc * R) }], w * 0.6, { colour: c, fill: lerp(0.5, 0.85, o), haloMul: hm }),
      whiteCore(bossCoreFrac(id, o) * R, w, o),
      rim(R, w, c, hm),
    ],
  };
}

/** Side count of the placeholder outline for the bosses after wave B (wave C replaces them). */
const GENERIC_SIDES: readonly number[] = [6, 6, 4, 3, 10, 8, 4, 5, 7, 6];

/**
 * Bosses built in later waves: a double polygon in the boss colour, a white core that opens when
 * vulnerable and the rim. Placeholder so every id draws a boss, never the magenta glyph.
 */
function genericSpec(id: number, o: number): ShapeSpec {
  const R = bossBodyR(id);
  const t = bossTierOf(id);
  const w = BOSS_LINE * tierWeight(t);
  const hm = tierHaloMul(t);
  const c = bossColourOf(id);
  const sides = GENERIC_SIDES[bossIndex(id)] ?? 6;
  return {
    tint: null,
    radius: r2(R * BOSS_RIM),
    layers: [
      layer([{ t: 'regularPoly', r: R, sides, rot: 0 }], w, { colour: c, fill: 0.08, haloMul: hm }),
      layer([{ t: 'regularPoly', r: r2(0.55 * R), sides, rot: Math.PI / sides }], w * 0.7, { colour: c, haloMul: hm }),
      whiteCore(bossCoreFrac(id, o) * R, w, o),
      rim(R, w, c, hm),
    ],
  };
}

/** Pure: the spec for a boss index at an openness step (0 to BOSS_OPEN_STEPS - 1). */
export function buildBossSpec(id: number, step: number): ShapeSpec {
  const b = bossIndex(id);
  const o = stepOpenness(step);
  if (b === BOSS_WARDEN) return wardenSpec(o);
  if (b === BOSS_BROOD) return broodSpec(o);
  if (b === BOSS_SPINDLE) return spindleSpec(o);
  if (b === BOSS_EMBER) return emberSpec(o);
  if (b === BOSS_MIRAGE) return mirageSpec(o);
  if (b === BOSS_GRAVITAS) return gravitasSpec(o);
  return genericSpec(b, o);
}

/** Every boss spec, indexed by id x BOSS_OPEN_STEPS + step. Built once. */
export const BOSS_SPECS: readonly ShapeSpec[] = Array.from({ length: BOSS_COUNT * BOSS_OPEN_STEPS }, (_, i) =>
  buildBossSpec(Math.floor(i / BOSS_OPEN_STEPS), i % BOSS_OPEN_STEPS),
);

/**
 * Pure: the exposed variant of a boss spec (ED1). The white core layer is dropped (the cue draws it
 * as fragments) and every other layer is drawn white, so the view tint carries the colour: the
 * tier colour, or the hot red of the flicker. Same geometry, so a swap never moves a line.
 */
export function exposedBossSpec(spec: ShapeSpec): ShapeSpec {
  return {
    tint: null,
    radius: spec.radius,
    layers: spec.layers.filter((l) => l.colour !== 'white').map((l) => ({ ...l, colour: null })),
  };
}

/** Every exposed boss spec, indexed like BOSS_SPECS. Built once. */
export const EXPOSED_BOSS_SPECS: readonly ShapeSpec[] = BOSS_SPECS.map(exposedBossSpec);

// Boss parts (Kind.BossPart, w.a): 0 pod, 1 anchor, 2 turret. Drawn white, tinted with the boss colour.

export const PART_POD = 0;
export const PART_ANCHOR = 1;
export const PART_TURRET = 2;
export const PART_TYPES = 3;
/** Radius each part spec is drawn at; the renderer scales by w.radius over this. */
export const PART_R: readonly number[] = [12, 14, 16];

/** Pure: a valid part type for any number (pod for anything unknown). */
export function partType(a: number): number {
  return a === PART_ANCHOR || a === PART_TURRET ? a : PART_POD;
}

/** Pure: the radius a part type's spec is drawn at. */
export function partR(a: number): number {
  return PART_R[partType(a)] ?? 12;
}

/** Pure: the spec of a part type at a boss tier (the tier sets the line weight). */
export function buildPartSpec(a: number, tier: number): ShapeSpec {
  const type = partType(a);
  const w = 1.6 * tierWeight(tier);
  const hm = tierHaloMul(tier);
  const R = partR(type);
  if (type === PART_ANCHOR) {
    return {
      tint: null,
      radius: R + 4,
      layers: [
        layer([{ t: 'poly', pts: [R, 0, 0, R, -R, 0, 0, -R] }], w, { fill: 0.15, haloMul: hm }),
        layer([{ t: 'circle', r: r2(R * 0.4) }], w * 0.6, { fill: 0.8, glow: false }),
      ],
    };
  }
  if (type === PART_TURRET) {
    return {
      tint: null,
      radius: R + 10,
      layers: [
        layer([{ t: 'rect', w: R * 1.6, h: R * 1.6 }], w, { fill: 0.12, haloMul: hm }),
        layer([{ t: 'line', pts: [r2(R * 0.5), 0, r2(R * 1.5), 0] }], w * 0.9, { haloMul: hm }),
        layer([{ t: 'circle', r: r2(R * 0.3) }], 0, { fill: 1, glow: false }),
      ],
    };
  }
  return {
    tint: null,
    radius: R + 4,
    layers: [
      layer([{ t: 'circle', r: R }], w, { fill: 0.18, haloMul: hm }),
      layer([{ t: 'circle', r: r2(R * 0.38) }], 0, { fill: 1, glow: false }),
    ],
  };
}

/** Every part spec, indexed by type x 4 + (tier - 1). Built once. */
export const PART_SPECS: readonly ShapeSpec[] = Array.from({ length: PART_TYPES * 4 }, (_, i) => buildPartSpec(Math.floor(i / 4), (i % 4) + 1));

/**
 * Boss hazard registry glyph: a gapped ring. Hazards draw through the hazard sprite layer
 * (hazardFx.ts), never through this; it exists so the registry covers Kind.BossHazard and a hit
 * flash or fallback reads the right hue.
 */
export const HAZARD_GLYPH: ShapeSpec = {
  tint: 'bossRed',
  radius: 14,
  layers: [
    layer(
      [
        {
          t: 'line',
          pts: Array.from({ length: 21 }, (_, i) => {
            const a = Math.PI / 6 + ((Math.PI * 2 - Math.PI / 3) * i) / 20;
            return polar(12, a);
          }).flat(),
        },
      ],
      2,
    ),
  ],
};
