// Pure boss and boss part shape specs (docs/12 wave V3-A "Design: the boss roster", Glow visual
// column). No pixi.js import. Boss colours are baked into the layers (the view tint stays white)
// so the white core reads white; parts are drawn white and tinted with the boss colour per frame.
// Each boss has BOSS_OPEN_STEPS prebuilt specs, one per openness step, so a shell opening swaps a
// shared context (no Graphics.clear, no allocation per frame). Line widths carry the tier weight
// (bossLook.ts) and every boss has a second concentric rim at 0.6 alpha. A boss body radius is 44
// to 90 u; the largest enemy is 24 u, so a boss never reads as an enemy even where hues are close.
import {
  BOSS_BASTION,
  BOSS_BROOD,
  BOSS_COUNT,
  BOSS_TEMPEST,
  BOSS_TWINS,
  BOSS_OPEN_STEPS,
  BOSS_EMBER,
  BOSS_GRAVITAS,
  BOSS_MIRAGE,
  BOSS_PRISM,
  BOSS_RIM_ALPHA,
  BOSS_SPINDLE,
  BOSS_WARDEN,
  bossColourOf,
  bossIndex,
  bossTierOf,
  tierHaloMul,
  tierWeight,
} from './bossLook';
import { prismOutline } from './bossPrism';
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
 * radii: Ember 44, Mirage 50, Gravitas 60; tier 3 too: Bastion 70, Tempest 46, Twins 44; Prism 90). A
 * well is 24 u, so the smallest boss body is 1.8 times a well and carries a second rim.
 */
export const BOSS_BODY_R: readonly number[] = [56, 60, 50, 44, 50, 60, 70, 46, 44, 90];

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
  [0.12, 0.26],
  [0.13, 0.2],
  [0.16, 0.24],
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

// Tier 3 (wave C). Line weight is x3.0 and the outer glow stroke 1.5 times wider (haloMul), both on
// the boss layer only; the glow alpha and width still come from applyNeon through shapes.ts. Every
// detail layer is a fraction of the core weight so the thick lines stay readable on a 44 u body.

/** Bastion keep: a square wall turned to the diagonals, where the four corner turrets sit. */
export const BASTION_WALL = 1.0;
export const BASTION_INNER = 0.72;

/** Pure: the four wall to inner wall struts (one per corner) of the Bastion keep. */
export function bastionStruts(R: number): ShapePrim[] {
  const out: ShapePrim[] = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    out.push({ t: 'line', pts: [...polar(BASTION_INNER * R, a), ...polar(BASTION_WALL * R, a)] });
  }
  return out;
}

/**
 * Bastion (bright red, tier 3): a fortress. A thick square wall, an inner wall joined to it by four
 * corner struts, a keep ring and a core that burns hot when it opens (two turrets down). Corner
 * turrets are BossPart entities (PART_TURRET); the keep heats as they fall (bossTier3.ts).
 */
function bastionSpec(o: number): ShapeSpec {
  const id = BOSS_BASTION;
  const R = bossBodyR(id);
  const w = BOSS_LINE * tierWeight(bossTierOf(id));
  const hm = tierHaloMul(bossTierOf(id));
  const c = bossColourOf(id);
  const core = bossCoreFrac(id, o) * R;
  return {
    tint: null,
    radius: r2(R * BOSS_RIM),
    layers: [
      layer([{ t: 'regularPoly', r: r2(BASTION_WALL * R), sides: 4, rot: Math.PI / 4 }], w, { colour: c, fill: lerp(0.1, 0.05, o), haloMul: hm }),
      layer([{ t: 'regularPoly', r: r2(BASTION_INNER * R), sides: 4, rot: Math.PI / 4 }], w * 0.7, { colour: c, fill: lerp(0.06, 0.02, o), haloMul: hm }),
      layer(bastionStruts(R), w * 0.5, { colour: c, alpha: 0.85, haloMul: hm }),
      layer([{ t: 'circle', r: r2(0.4 * R) }], w * 0.6, { colour: c, fill: lerp(0.1, 0.45, o), haloMul: hm }),
      layer([{ t: 'circle', r: r2(core * 1.7) }], 0, { colour: c, fill: lerp(0, 0.9, o), glow: o >= 0.5 }),
      whiteCore(core, w, o),
      rim(R, w, c, hm),
    ],
  };
}

/** Tempest kite: nose length, wing reach and tail length as multiples of the body radius. */
export const TEMPEST_NOSE = 1.7;
export const TEMPEST_WING = 0.72;
export const TEMPEST_TAIL = 0.8;

/** Pure: Tempest kite outline scaled by k, nose on +x (the facing): a long kite, widest ahead of centre. */
export function tempestKite(R: number, k: number): ShapePrim {
  const s = R * k;
  return { t: 'poly', pts: [r2(TEMPEST_NOSE * s), 0, r2(0.15 * s), r2(TEMPEST_WING * s), r2(-TEMPEST_TAIL * s), 0, r2(0.15 * s), r2(-TEMPEST_WING * s)] };
}

/**
 * Tempest (bright red, tier 3): a long kite with two streamers, an inner kite that fills as it rests
 * and a Slime sac in the tail (the trail it drops). The view turns with the facing, so the nose
 * leads the lap and the dash. The Slime drips and the hot dash afterimage are render effects.
 */
function tempestSpec(o: number): ShapeSpec {
  const id = BOSS_TEMPEST;
  const R = bossBodyR(id);
  const w = BOSS_LINE * tierWeight(bossTierOf(id));
  const hm = tierHaloMul(bossTierOf(id));
  const c = bossColourOf(id);
  const streamers: ShapePrim[] = [1, -1].map((s) => ({
    t: 'line' as const,
    pts: [r2(0.15 * R), r2(s * TEMPEST_WING * R), r2(-1.05 * R), r2(s * 0.5 * R)],
  }));
  const sac: ShapePrim = { t: 'poly', pts: [r2(-0.2 * R), 0, r2(-0.42 * R), r2(0.2 * R), r2(-0.64 * R), 0, r2(-0.42 * R), r2(-0.2 * R)] };
  return {
    tint: null,
    radius: r2(Math.max(R * BOSS_RIM, TEMPEST_NOSE * R)),
    layers: [
      layer([tempestKite(R, 1)], w, { colour: c, fill: lerp(0.1, 0.16, o), haloMul: hm }),
      layer(streamers, w * 0.5, { colour: c, alpha: 0.85, haloMul: hm }),
      layer([tempestKite(R, 0.5)], w * 0.7, { colour: c, fill: lerp(0.05, 0.4, o), haloMul: hm }),
      layer([sac], w * 0.4, { colour: 'slime', fill: 0.7, alpha: 0.9, glow: false }),
      whiteCore(bossCoreFrac(id, o) * R, w, o),
      rim(R, w, c, hm),
    ],
  };
}

/** Twins link lug reach (multiple of the body radius): the sockets the tether runs between. */
export const TWINS_LUG = 1.32;
/** Radius and offset (multiples of the body radius) of the two interlocked rings inside a body. */
export const TWINS_LINK_R = 0.36;
export const TWINS_LINK_OFF = 0.3;

/** Pure: closed n point approximation of a circle of radius r centred at (cx, 0). */
export function ringPoly(cx: number, r: number, n: number): ShapePrim {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(r2(cx + Math.cos(a) * r), r2(Math.sin(a) * r));
  }
  return { t: 'poly', pts };
}

/**
 * Twins (bright red, tier 3): one body of the pair (the sim draws each body with this spec; their
 * tether is a sim hazard drawn on the hazard layer). A round body carrying two interlocked rings,
 * the sign of the pair, and a link lug at each side for the tether. Each body keeps its own core.
 */
function twinsSpec(o: number): ShapeSpec {
  const id = BOSS_TWINS;
  const R = bossBodyR(id);
  const w = BOSS_LINE * tierWeight(bossTierOf(id));
  const hm = tierHaloMul(bossTierOf(id));
  const c = bossColourOf(id);
  const lugs: ShapePrim[] = [1, -1].map((s) => ({ t: 'line' as const, pts: [r2(s * R), 0, r2(s * TWINS_LUG * R), 0] }));
  return {
    tint: null,
    radius: r2(Math.max(R * BOSS_RIM, TWINS_LUG * R)),
    layers: [
      layer([{ t: 'circle', r: R }], w, { colour: c, fill: lerp(0.1, 0.16, o), haloMul: hm }),
      layer(lugs, w * 0.9, { colour: c, haloMul: hm }),
      layer([ringPoly(-TWINS_LINK_OFF * R, TWINS_LINK_R * R, 20), ringPoly(TWINS_LINK_OFF * R, TWINS_LINK_R * R, 20)], w * 0.5, {
        colour: c,
        fill: lerp(0.04, 0.3, o),
        alpha: 0.85,
        haloMul: hm,
      }),
      whiteCore(bossCoreFrac(id, o) * R, w, o),
      rim(R, w, c, hm),
    ],
  };
}

/**
 * Prism (multicolour, tier 4): a faceted gem. This static spec is the dim base the hue cycling gem
 * overlay (prismFx.ts, bossPrism.ts) draws over: the full 24 vertex outline (so the glow halo has the
 * gem's silhouette), the white core that opens in the damage window, and the rim. The cycling hue, the
 * chromatic ghost and the run to white are render effects, not part of any spec.
 */
function prismSpec(o: number): ShapeSpec {
  const id = BOSS_PRISM;
  const R = bossBodyR(id);
  const w = BOSS_LINE * tierWeight(bossTierOf(id));
  const hm = tierHaloMul(bossTierOf(id));
  const c = bossColourOf(id);
  return {
    tint: null,
    radius: r2(R * BOSS_RIM),
    layers: [
      layer([{ t: 'poly', pts: prismOutline(24, R) }], w, { colour: c, fill: lerp(0.04, 0.1, o), alpha: 0.3, haloMul: hm }),
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
  if (b === BOSS_BASTION) return bastionSpec(o);
  if (b === BOSS_TEMPEST) return tempestSpec(o);
  if (b === BOSS_TWINS) return twinsSpec(o);
  return prismSpec(o);
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
/**
 * Twins' second body (sim PartType.Twin, src/game/bosses/types.ts): a full size boss body, not a small
 * part. It has no part spec of its own: it draws with the Twins boss body spec (partVisualSlot).
 */
export const PART_TWIN = 3;
/**
 * Brood's Broodling (sim PartType.Broodling, 20 u): a small green pod body with a yellow pod and a
 * nose along its heading (w.rot). Unlike the white parts it bakes both its colours (broodlingSpec).
 */
export const PART_BROODLING = 4;
/** Part types that have a part spec (pod, anchor, turret, Broodling). The twin body draws as a boss body. */
export const PART_TYPES = 4;
/** The part type behind each spec index (a part spec is PART_SPECS[index x 4 + tier - 1]). */
export const PART_SPEC_TYPES: readonly number[] = [PART_POD, PART_ANCHOR, PART_TURRET, PART_BROODLING];
/** Radius each white part spec is drawn at (pod, anchor, turret); the renderer scales by w.radius over this. */
export const PART_R: readonly number[] = [12, 14, 16];
/** Radius the Broodling spec is drawn at: the sim radius (BROODLING.radius), so its scale is 1. */
export const BROODLING_R = 20;

/** Pure: a valid white part type for any number (pod for anything unknown, the twin body and the Broodling). */
export function partType(a: number): number {
  return a === PART_ANCHOR || a === PART_TURRET ? a : PART_POD;
}

/** Pure: true for Brood's Broodling (w.a is PART_BROODLING). */
export function isBroodlingPart(a: number): boolean {
  return a === PART_BROODLING;
}

/** Pure: index of a part in PART_SPEC_TYPES (0 pod, 1 anchor, 2 turret, 3 Broodling; pod for anything else). */
export function partSpecIndex(a: number): number {
  return isBroodlingPart(a) ? 3 : partType(a);
}

/** Pure: true for the Twins second body (w.a is PART_TWIN). */
export function isTwinPart(a: number): boolean {
  return a === PART_TWIN;
}

/** Pure: the radius a part's spec is drawn at (the Twins body radius for the twin body). */
export function partR(a: number): number {
  if (isTwinPart(a)) return bossBodyR(BOSS_TWINS);
  if (isBroodlingPart(a)) return BROODLING_R;
  return PART_R[partType(a)] ?? 12;
}

/** Pure: Broodling pod body outline radius at theta for draw radius R (a small lumpy round body). */
export function broodlingEdge(theta: number, R: number): number {
  return broodEdge(theta, 0.84 * R);
}

/** Pure: the Broodling nose, a triangle on +x (the heading) that pokes just past the body (1.12 R). */
export function broodlingNose(R: number): ShapePrim {
  return { t: 'poly', pts: [r2(1.12 * R), 0, r2(0.6 * R), r2(0.3 * R), r2(0.6 * R), r2(-0.3 * R)] };
}

/**
 * Pure: Broodling spec at a boss tier. Brood's two tone: a green body and nose (the boss hue) around a
 * yellow pod (the Brood pods accent, bossIdentity.ts). Both colours are baked, so the view tint stays
 * white, and the nose points along +x so the view rotation is the heading.
 */
export function broodlingSpec(tier: number): ShapeSpec {
  const w = 1.6 * tierWeight(tier);
  const hm = tierHaloMul(tier);
  const R = BROODLING_R;
  const c = bossColourOf(BOSS_BROOD);
  return {
    tint: null,
    radius: R + 6,
    layers: [
      layer([radialPoly(32, (a) => broodlingEdge(a, R))], w, { colour: c, fill: 0.16, haloMul: hm }),
      layer([broodlingNose(R)], w * 0.9, { colour: c, fill: 0.55, haloMul: hm }),
      layer([{ t: 'circle', r: r2(0.36 * R) }], w * 0.6, { colour: 'yellow', fill: 0.85, glow: false }),
    ],
  };
}

/** Pure: the spec of a part type at a boss tier (the tier sets the line weight). */
export function buildPartSpec(a: number, tier: number): ShapeSpec {
  if (isBroodlingPart(a)) return broodlingSpec(tier);
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

/** Every part spec, indexed by spec index x 4 + (tier - 1) (PART_SPEC_TYPES order). Built once. */
export const PART_SPECS: readonly ShapeSpec[] = Array.from({ length: PART_TYPES * 4 }, (_, i) =>
  buildPartSpec(PART_SPEC_TYPES[Math.floor(i / 4)] ?? PART_POD, (i % 4) + 1),
);

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
