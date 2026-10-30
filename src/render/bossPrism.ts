// Pure Prism look (docs/12 wave V3-D Glow brief, roster row 10). No pixi.js import. The Prism is a
// faceted gem: its outline hue cycles along its length (one full cycle in 3 s from the sim clock),
// a chromatic ghost trails it, the outline tints toward the colour of the boss it quotes in each
// phase and runs to white over the 0.5 s before the 1.2 s damage window of its 4 s cycle. Every
// helper maps (vertex index, time, cycle time, phase) to a hue, a colour, a weight or an alpha. None
// reads the World and none is read by the simulation. Line weight is the tier 4 multiplier (x2.4,
// bossLook.ts) on the boss layer; saturation follows applyNeon through the saturation argument (a
// shimmer at neon 0 is muted, never off) and glow width and alpha stay applyNeon's.
import { BOSS_PRISM, MODE_DYING, MODE_ENTERING, MODE_PHASE, tierWeight } from './bossLook';
import { clampNum, hslToRgbInt } from './color';
import type { EffectsTier } from './effects';
import { mixRgb } from './mapFx';
import type { PaletteKey } from './neon';

export { BOSS_PRISM } from './bossLook';

function finite(v: number, d: number): number {
  return Number.isFinite(v) ? v : d;
}

function frac(v: number): number {
  return v - Math.floor(v);
}

// Hue cycle ----------------------------------------------------------------------------------------

/** One full hue cycle along the outline takes this many seconds of the sim clock (w.time). */
export const PRISM_HUE_SEC = 3;

/**
 * Pure: hue in degrees [0, 360) of an outline position at a time. index may be fractional (a facet
 * takes the position of the outline vertex it springs from); count is the outline vertex count. The
 * pattern travels along increasing index and repeats exactly every PRISM_HUE_SEC.
 */
export function prismHue(index: number, count: number, timeSec: number): number {
  const n = Math.max(1, finite(count, 1));
  return frac(finite(index, 0) / n - finite(timeSec, 0) / PRISM_HUE_SEC) * 360;
}

/** The chromatic ghost sits this many degrees around the wheel from the outline hue. */
export const PRISM_GHOST_HUE = 150;
/** Ghost offset as a share of the body radius, and its share of the outline alpha. */
export const PRISM_GHOST_OFFSET = 0.045;
export const PRISM_GHOST_ALPHA = 0.5;

/** Pure: the ghost hue for an outline hue (degrees). */
export function prismGhostHue(hue: number): number {
  return (((finite(hue, 0) + PRISM_GHOST_HUE) % 360) + 360) % 360;
}

export interface Offset2 {
  x: number;
  y: number;
}

/** Pure: ghost offset in arena units for a body radius, turning once per hue cycle. */
export function prismGhostOffset(timeSec: number, radius: number, out: Offset2): Offset2 {
  const a = (finite(timeSec, 0) / PRISM_HUE_SEC) * Math.PI * 2;
  const d = Math.max(0, finite(radius, 0)) * PRISM_GHOST_OFFSET;
  out.x = Math.cos(a) * d;
  out.y = Math.sin(a) * d;
  return out;
}

// Damage cycle -------------------------------------------------------------------------------------

/** The 4 s damage cycle: 2.3 s colour, 0.5 s run to white, 1.2 s white window (roster row 10). */
export const PRISM_CYCLE_SEC = 4;
export const PRISM_COLOUR_SEC = 2.3;
export const PRISM_RUN_SEC = 0.5;
export const PRISM_WINDOW_SEC = 1.2;
/** Cycle time at which the window opens. */
export const PRISM_WINDOW_START: number = PRISM_COLOUR_SEC + PRISM_RUN_SEC;
/** The white flash at the window opening: seconds it takes to fade, then a steady pulse. */
export const PRISM_FLASH_SEC = 0.3;
export const PRISM_FLASH_HOLD = 0.2;
export const PRISM_FLASH_HZ = 6;

/** Pure: whiteness 0 to 1 of the outline at cycle time c: 0 in colour, a smooth run up, 1 in the window. */
export function prismWhite(c: number): number {
  const t = finite(c, 0);
  if (t < PRISM_COLOUR_SEC) return 0;
  if (t >= PRISM_WINDOW_START) return 1;
  const u = (t - PRISM_COLOUR_SEC) / PRISM_RUN_SEC;
  return u * u * (3 - 2 * u);
}

/** Pure: true while the shield is down (cycle time inside the white window). */
export function prismWindowOpen(c: number): boolean {
  const t = finite(c, 0);
  return t >= PRISM_WINDOW_START && t < PRISM_CYCLE_SEC;
}

/**
 * Pure: the white flash strength at cycle time c. 0 outside the window; 1 as it opens, fading over
 * PRISM_FLASH_SEC to a steady shimmer of at most PRISM_FLASH_HOLD for the rest of the window.
 */
export function prismFlash(c: number): number {
  const t = finite(c, 0);
  if (!prismWindowOpen(t)) return 0;
  const tw = t - PRISM_WINDOW_START;
  const burst = clampNum(1 - tw / PRISM_FLASH_SEC, 0, 1);
  const hold = PRISM_FLASH_HOLD * (0.5 + 0.5 * Math.cos(tw * PRISM_FLASH_HZ * Math.PI * 2));
  return Math.max(burst, hold);
}

/** Render side clock of the cycle: the offset (seconds) that aligns w.time to the sim cycle. */
export interface PrismClock {
  offset: number;
}

export function createPrismClock(): PrismClock {
  return { offset: 0 };
}

function wrap(v: number, m: number): number {
  return ((v % m) + m) % m;
}

/**
 * Pure on the clock: cycle time in [0, PRISM_CYCLE_SEC) for the render. While the sim reports the
 * counter window (exposed) the clock locks to it (window start plus exposedT), so the white run up
 * of the next cycle lands exactly 3.5 s after. Between windows it free runs on w.time. It never shows
 * the white run up or window while the shield is up: entering, phase change and dying read as
 * colour, and a free run that reaches the window without the sim's say reads as colour too.
 */
export function prismCycle(clock: PrismClock, timeSec: number, mode: number, exposed: boolean, exposedT: number): number {
  const now = finite(timeSec, 0);
  if (exposed) {
    const tw = clampNum(finite(exposedT, 0), 0, PRISM_WINDOW_SEC - 1e-6);
    clock.offset = PRISM_WINDOW_START + tw - now;
    return PRISM_WINDOW_START + tw;
  }
  if (mode === MODE_ENTERING || mode === MODE_PHASE || mode === MODE_DYING) return 0;
  const c = wrap(now + clock.offset, PRISM_CYCLE_SEC);
  return c >= PRISM_WINDOW_START ? 0 : c;
}

// Colour -------------------------------------------------------------------------------------------

/**
 * Colour key each phase borrows (roster row 10: 1 ring and pods, 2 arms and a dash, 3 pull and warp
 * lanes, 4 turrets and a tether): the first boss named for the phase, Warden blue, Spindle yellow,
 * Gravitas violet, Bastion red.
 */
export const PRISM_PHASE_KEYS: readonly PaletteKey[] = ['bossBlue', 'bossYellow', 'bossViolet', 'bossRed'];

/** Pure: the borrowed colour key for a phase (1 to 4; anything else reads as phase 1). */
export function prismPhaseKey(phase: number): PaletteKey {
  const p = Math.round(finite(phase, 1));
  return PRISM_PHASE_KEYS[clampNum(p, 1, PRISM_PHASE_KEYS.length) - 1] ?? 'bossBlue';
}

/** How far the rainbow leans toward the borrowed colour. */
export const PRISM_TINT_MIX = 0.4;
/** Base saturation (before the neon multiplier), floor, and lightness of the rainbow. */
export const PRISM_SAT = 0.9;
export const PRISM_SAT_MIN = 0.3;
export const PRISM_LIGHT = 0.62;

/**
 * Pure: rainbow saturation for the neon saturation multiplier (applyNeon, 0.4 at slider 0 to 1.3 at
 * 100). Muted at neon 0, never zero, and it rises with the slider up to full.
 */
export function prismSaturation(neonSat: number): number {
  return clampNum(PRISM_SAT * finite(neonSat, 1), PRISM_SAT_MIN, 1);
}

/** Pure: one outline colour from a hue (degrees), the saturation, the borrowed RGB and the whiteness. */
export function prismColour(hue: number, sat: number, borrowed: number, white: number): number {
  const rainbow = hslToRgbInt(hue, sat, PRISM_LIGHT);
  return mixRgb(mixRgb(rainbow, borrowed, PRISM_TINT_MIX), 0xffffff, white);
}

/** Pure: the colour of the whole body (glow sprite tint): the hue at the first vertex. */
export function prismBodyColour(timeSec: number, sat: number, borrowed: number, white: number): number {
  return prismColour(prismHue(0, 1, timeSec), sat, borrowed, white);
}

/** Glow sprite boost: whiteness adds a little, the window flash a lot (a multiplier, never a SPEC 4 write). */
export const PRISM_WHITE_GLOW = 0.35;
export const PRISM_FLASH_GLOW = 0.9;

/** Pure: glow sprite multiplier from the whiteness and the window flash. */
export function prismGlowMul(white: number, flash: number): number {
  return 1 + PRISM_WHITE_GLOW * clampNum(finite(white, 0), 0, 1) + PRISM_FLASH_GLOW * clampNum(finite(flash, 0), 0, 1);
}

/** Pure: ghost alpha (0 to PRISM_GHOST_ALPHA): it fades out as the outline goes white. */
export function prismGhostAlpha(white: number): number {
  return PRISM_GHOST_ALPHA * (1 - clampNum(finite(white, 0), 0, 1));
}

// Weight -------------------------------------------------------------------------------------------

/** Outline line widths (arena units) of the gem layer: all multiples of the base line. */
export interface PrismWidths {
  outline: number;
  facet: number;
  ghost: number;
}

/** Pure: the gem line widths for a base line width and a tier (tier 4: x2.4 on the outline). */
export function prismWidths(baseLine: number, tier = 4): PrismWidths {
  const w = Math.max(0, finite(baseLine, 0)) * tierWeight(tier);
  return { outline: w, facet: w * 0.5, ghost: w * 0.7 };
}

// Gem geometry -------------------------------------------------------------------------------------

/** Body radius the gem is laid out at (the Prism table radius, roster row 10). */
export const PRISM_BODY_R = 90;
/** Gem corners, and the radius of the inner table as a share of the body radius. */
export const PRISM_CORNERS = 8;
export const PRISM_TABLE_R = 0.52;

/** One drawn segment: its ends in body units, the outline index it takes its hue from, and its kind. */
export interface PrismSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Fractional outline vertex index the hue is read at. */
  at: number;
  facet: boolean;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

function corner(k: number, r: number): [number, number] {
  const a = (k * Math.PI) / 4;
  return [r2(Math.cos(a) * r), r2(Math.sin(a) * r)];
}

/** Pure: a valid outline vertex count (a multiple of 8 from 8 to 24). */
export function prismVerts(n: number): number {
  const m = Math.round(finite(n, 24) / PRISM_CORNERS);
  return clampNum(m, 1, 3) * PRISM_CORNERS;
}

/** Pure: the closed outline of n vertices (flat x, y pairs) for radius R: the octagon, edges subdivided. */
export function prismOutline(n: number, R: number): number[] {
  const v = prismVerts(n);
  const per = v / PRISM_CORNERS;
  const pts: number[] = [];
  for (let c = 0; c < PRISM_CORNERS; c++) {
    const [ax, ay] = corner(c, R);
    const [bx, by] = corner(c + 1, R);
    for (let j = 0; j < per; j++) {
      const u = j / per;
      pts.push(r2(ax + (bx - ax) * u), r2(ay + (by - ay) * u));
    }
  }
  return pts;
}

/**
 * Pure: every segment of the gem for an outline vertex count: v outline segments, the eight table
 * edges and sixteen crown spokes (each table corner to the two outline corners beside it).
 */
export function buildPrismSegments(n: number, R: number): PrismSegment[] {
  const v = prismVerts(n);
  const per = v / PRISM_CORNERS;
  const out: PrismSegment[] = [];
  const o = prismOutline(v, R);
  for (let k = 0; k < v; k++) {
    const j = (k + 1) % v;
    out.push({ x0: o[k * 2] ?? 0, y0: o[k * 2 + 1] ?? 0, x1: o[j * 2] ?? 0, y1: o[j * 2 + 1] ?? 0, at: k, facet: false });
  }
  const tr = R * PRISM_TABLE_R;
  for (let c = 0; c < PRISM_CORNERS; c++) {
    const [tx, ty] = corner(c + 0.5, tr);
    const [nx, ny] = corner(c + 1.5, tr);
    out.push({ x0: tx, y0: ty, x1: nx, y1: ny, at: (c + 1) * per, facet: true });
    const [ax, ay] = corner(c, R);
    const [bx, by] = corner(c + 1, R);
    out.push({ x0: tx, y0: ty, x1: ax, y1: ay, at: c * per, facet: true });
    out.push({ x0: tx, y0: ty, x1: bx, y1: by, at: (c + 1) * per, facet: true });
  }
  return out;
}

const SEGMENT_CACHE = new Map<number, PrismSegment[]>();

/** Pure (memoised): the segments of a gem laid out at PRISM_BODY_R for an outline vertex count. */
export function prismSegments(n: number): readonly PrismSegment[] {
  const v = prismVerts(n);
  let s = SEGMENT_CACHE.get(v);
  if (!s) {
    s = buildPrismSegments(v, PRISM_BODY_R);
    SEGMENT_CACHE.set(v, s);
  }
  return s;
}

// Level of detail ----------------------------------------------------------------------------------

/**
 * The cost ladder: reduce the outline vertex count first (24, 16, 8), then drop the ghost. Level 0 is
 * the full gem; each step down is cheaper.
 */
export interface PrismLod {
  verts: number;
  ghost: boolean;
}

export const PRISM_LODS: readonly PrismLod[] = [
  { verts: 24, ghost: true },
  { verts: 16, ghost: true },
  { verts: 8, ghost: true },
  { verts: 8, ghost: false },
];

/** Pure: a valid ladder level for any number. */
export function prismLodLevel(level: number): number {
  return clampNum(Math.round(finite(level, 0)), 0, PRISM_LODS.length - 1);
}

/** Pure: the ladder rung for a level. */
export function prismLod(level: number): PrismLod {
  return PRISM_LODS[prismLodLevel(level)] ?? { verts: 24, ghost: true };
}

/** Pure: the ladder level an effects tier starts at: High full, Standard 16 vertices, Low 8 and no ghost. */
export function prismLodFor(effects: EffectsTier): number {
  return effects === 'high' ? 0 : effects === 'standard' ? 1 : PRISM_LODS.length - 1;
}

/** Pure: segments drawn per layer at a level (the cost of the ladder rung). */
export function prismSegmentCount(level: number): number {
  return prismSegments(prismLod(level).verts).length;
}

/** Pure: true for the Prism boss index. */
export function isPrism(id: number): boolean {
  return id === BOSS_PRISM;
}
