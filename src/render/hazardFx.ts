// Pure boss hazard look (docs/13 "Hazard primitives", docs/12 wave V3-A Glow item 3). No pixi.js
// import. Kind.BossHazard reads w.a (primitive), w.t (age), w.rot, w.radius, w.vx and w.vy (a ring
// with w.vy 2 has a second gap on w.rot + pi, the Warden phase 2 ring). Every
// lethal hazard first shows its tier telegraph as a thin dim form of the same geometry, then turns
// bright and full width at lethal with a short flash. The planner writes sprite instances into a
// SpriteBuf (fxSprites.ts): one pooled geometry, no allocation, no Graphics.clear per frame.
import { hazardTelegraph } from '../game/bosses/kit';
import { tierOf, tierWeight } from './bossLook';
import { clampNum } from './color';
import { F_BAR, pushArc, pushBand, pushLine, pushSprite, type FxHalo, type SpriteBuf } from './fxSprites';

export const HAZARD_LANE = 0;
export const HAZARD_RING = 1;
export const HAZARD_SWEEP = 2;
export const HAZARD_TETHER = 3;
export const HAZARD_PULL = 4;

/**
 * Telegraph seconds per tier, a mirror of hazardTelegraph(tier) in src/game/bosses/kit.ts (Swarm,
 * wave A, not on main when this was written): 1.0, 0.8, 0.6, 0.6. See the hand-off request to
 * import kit.ts once it merges.
 */
export const HAZARD_TELEGRAPH_SEC: Readonly<Record<1 | 2 | 3 | 4, number>> = { 1: 1.0, 2: 0.8, 3: 0.6, 4: 0.6 };

/** Pure: telegraph seconds for a tier, read from the sim's table (glue after wave A merged). */
export function hazardTelegraphSec(tier: number): number {
  return hazardTelegraph(tierOf(tier));
}

/** Telegraph alpha ramps from TELE_A0 to TELE_A1 over the telegraph; lethal is 1. */
export const TELE_A0 = 0.22;
export const TELE_A1 = 0.5;
/** Telegraph line thickness as a share of the lethal thickness (the thin form). */
export const TELE_THICK = 0.35;
/** Seconds of the bright flash when a hazard turns lethal. */
export const LETHAL_FLASH_SEC = 0.12;

/** Pure: whether a hazard of this age is past its tier telegraph (lethal). */
export function hazardLethal(age: number, tier: number): boolean {
  return Number.isFinite(age) && age >= hazardTelegraphSec(tier);
}

/**
 * Pure: hazard alpha from its age and tier. Thin and dim during the telegraph (0.22 rising to 0.5),
 * then 1 once lethal. A NaN age reads as a fresh telegraph.
 */
export function hazardTelegraphAlpha(age: number, tier: number): number {
  const tele = hazardTelegraphSec(tier);
  const a = Number.isFinite(age) ? Math.max(0, age) : 0;
  if (a >= tele) return 1;
  return TELE_A0 + (TELE_A1 - TELE_A0) * (a / tele);
}

/** Thickness multiplier and flash for a hazard age: TELE_THICK while telegraphing, 1 lethal. */
export interface HazardForm {
  lethal: boolean;
  alpha: number;
  thick: number;
  /** 1 at the lethal edge, fading to 0 over LETHAL_FLASH_SEC. */
  flash: number;
}

/** Pure: the drawn form of a hazard at an age. */
export function hazardForm(age: number, tier: number, out: HazardForm): HazardForm {
  const tele = hazardTelegraphSec(tier);
  const a = Number.isFinite(age) ? Math.max(0, age) : 0;
  out.lethal = a >= tele;
  out.alpha = hazardTelegraphAlpha(a, tier);
  out.thick = out.lethal ? 1 : TELE_THICK;
  out.flash = out.lethal ? clampNum(1 - (a - tele) / LETHAL_FLASH_SEC, 0, 1) : 0;
  return out;
}

/** The drawn part of a gapped ring: from a0 over span radians (counter clockwise). */
export interface GapArc {
  a0: number;
  span: number;
  /** Gap edges, the angles the notch ticks sit at. */
  gap0: number;
  gap1: number;
}

/**
 * Pure: the drawn arc of a ring whose gap has half angle halfGap centred on rot. The arc runs from
 * the gap's far edge (rot + halfGap) round to its near edge (rot - halfGap + 2 pi). A half gap of
 * 0 or less draws the full circle; pi or more draws nothing.
 */
export function ringGapArc(rot: number, halfGap: number, out: GapArc): GapArc {
  const r = Number.isFinite(rot) ? rot : 0;
  const g = clampNum(Number.isFinite(halfGap) ? halfGap : 0, 0, Math.PI);
  out.a0 = r + g;
  out.span = Math.PI * 2 - 2 * g;
  out.gap0 = r - g;
  out.gap1 = r + g;
  return out;
}

/** Pure: gap count of a ring from w.vy (1 or 2; the sim writes 2 for the Warden phase 2 ring). */
export function ringGapCount(vy: number): number {
  return Number.isFinite(vy) && Math.round(vy) >= 2 ? 2 : 1;
}

/**
 * Pure: the drawn arcs of a ring with gaps gaps of half angle halfGap, the first centred on rot and
 * the second (gaps 2) on rot + pi, written into out[0] and out[1]. Returns the number of arcs. Two
 * gaps leave two arcs of pi - 2 halfGap each; gaps that meet or overlap leave nothing to draw.
 */
export function ringGapArcs(rot: number, halfGap: number, gaps: number, out: readonly GapArc[]): number {
  const a = out[0];
  if (!a) return 0;
  if (ringGapCount(gaps) === 1) {
    ringGapArc(rot, halfGap, a);
    return a.span > 0 ? 1 : 0;
  }
  const b = out[1];
  if (!b) return 0;
  const r = Number.isFinite(rot) ? rot : 0;
  const g = clampNum(Number.isFinite(halfGap) ? halfGap : 0, 0, Math.PI / 2);
  const span = Math.PI - 2 * g;
  if (!(span > 0)) return 0;
  a.a0 = r + g;
  a.span = span;
  a.gap0 = r - g;
  a.gap1 = r + g;
  b.a0 = r + Math.PI + g;
  b.span = span;
  b.gap0 = r + Math.PI - g;
  b.gap1 = r + Math.PI + g;
  return 2;
}

/** Ring segment length target in arena units, and the segment count bounds. */
export const RING_SEG_U = 28;
export const RING_SEG_MIN = 12;
export const RING_SEG_MAX = 48;

/** Pure: segments used for an arc of radius r over span radians. */
export function ringSegments(r: number, span: number): number {
  if (!(r > 0) || !(span > 0)) return 0;
  return clampNum(Math.ceil((r * span) / RING_SEG_U), RING_SEG_MIN, RING_SEG_MAX);
}

/** Pure: angle of sweep arm k of n, the first at rot. */
export function sweepArmAngle(rot: number, k: number, n: number): number {
  const arms = Math.max(1, Math.round(n));
  return rot + (k * Math.PI * 2) / arms;
}

/** Pure: arm count from w.vy (1 to 3). */
export function sweepArms(vy: number): number {
  return clampNum(Math.round(Number.isFinite(vy) ? vy : 1), 1, 3);
}

/** Pull ripples move inward this many times per second; two are on screen at once. */
export const PULL_RIPPLE_HZ = 0.7;
export const PULL_RIPPLES = 2;
/** The pull is never lethal: its alpha never passes this. */
export const PULL_ALPHA = 0.32;

/** Pure: radius fraction (1 at the edge, 0 at the centre) of pull ripple k at age t. */
export function pullRipple(age: number, k: number): number {
  const t = Number.isFinite(age) ? Math.max(0, age) : 0;
  const p = (t * PULL_RIPPLE_HZ + k / PULL_RIPPLES) % 1;
  return 1 - p;
}

/** Pure: pull alpha at an age: fades in over 0.3 s, never above PULL_ALPHA. */
export function pullAlpha(age: number): number {
  const t = Number.isFinite(age) ? Math.max(0, age) : 0;
  return PULL_ALPHA * clampNum(t / 0.3, 0, 1);
}

// Geometry constants (docs/13 hazard table starting values, used only where a field is missing).
export const RING_BAND = 14;
export const SWEEP_HALF = 12;
export const TETHER_HALF = 10;
/** Base core line thickness of hazard edges before the tier weight, arena units. */
export const HAZARD_LINE = 1.5;
/** Kill zone fill alpha, lethal and telegraph. */
export const ZONE_FILL = 0.2;
export const ZONE_FILL_TELE = 0.06;
/** Tether hum: alpha wobble rate and depth on the render clock. */
export const TETHER_HUM_HZ = 7;
export const TETHER_HUM = 0.15;
/** Notch tick half length either side of the ring radius. */
export const NOTCH_HALF = 14;

/** Everything the planner needs about one hazard, read from the World by the renderer. */
export interface HazardInput {
  type: number;
  x: number;
  y: number;
  rot: number;
  radius: number;
  vx: number;
  vy: number;
  age: number;
  tier: number;
  tint: number;
  /** Render clock seconds (tether hum). */
  timeSec: number;
}

const form: HazardForm = { lethal: false, alpha: 0, thick: 0, flash: 0 };
const ringArcs: readonly GapArc[] = [
  { a0: 0, span: 0, gap0: 0, gap1: 0 },
  { a0: 0, span: 0, gap0: 0, gap1: 0 },
];

/** White mixed into a hazard at its lethal flash, as an alpha boost and a thicker core. */
function flashBoost(f: HazardForm): number {
  return 1 + 0.6 * f.flash;
}

function planLane(h: HazardInput, b: SpriteBuf, halo: Readonly<FxHalo>, f: HazardForm): number {
  const len = Math.max(0, h.vx);
  const hw = Math.max(1, h.radius);
  const dx = Math.cos(h.rot);
  const dy = Math.sin(h.rot);
  const x1 = h.x + dx * len;
  const y1 = h.y + dy * len;
  const nx = -dy * hw;
  const ny = dx * hw;
  const w = HAZARD_LINE * tierWeight(h.tier) * f.thick * flashBoost(f);
  const a = f.alpha;
  let n = pushBand(b, h.x, h.y, x1, y1, 2 * hw, a * (f.lethal ? ZONE_FILL : ZONE_FILL_TELE), h.tint);
  n += pushLine(b, h.x + nx, h.y + ny, x1 + nx, y1 + ny, w, a, h.tint, halo);
  n += pushLine(b, h.x - nx, h.y - ny, x1 - nx, y1 - ny, w, a, h.tint, halo);
  n += pushLine(b, h.x, h.y, x1, y1, w * 0.6, a * 0.7, h.tint, halo);
  return n;
}

function planRing(h: HazardInput, b: SpriteBuf, halo: Readonly<FxHalo>, f: HazardForm): number {
  const r = h.radius;
  if (!(r > 1)) return 0;
  const arcs = ringGapArcs(h.rot, h.vx, h.vy, ringArcs);
  const w = (f.lethal ? RING_BAND * 0.45 : HAZARD_LINE * tierWeight(h.tier) * TELE_THICK * 2) * flashBoost(f);
  const na = Math.max(0.6, f.alpha);
  const tw = HAZARD_LINE * tierWeight(h.tier);
  let n = 0;
  for (let k = 0; k < arcs; k++) {
    const arc = ringArcs[k];
    if (!arc) continue;
    // Segments follow each arc length, so a two gap ring stays inside HAZARD_MAX_INSTANCES.
    n += pushArc(b, h.x, h.y, r, arc.a0, arc.span, ringSegments(r, arc.span), w, f.alpha, h.tint, halo);
    // Gap notch: a radial tick at each gap edge, brighter than the telegraph so the way out reads.
    if (arc.span < Math.PI * 2 - 1e-3) {
      n += pushNotch(b, h, r, arc.gap0, tw, na, halo);
      n += pushNotch(b, h, r, arc.gap1, tw, na, halo);
    }
  }
  return n;
}

function pushNotch(b: SpriteBuf, h: HazardInput, r: number, g: number, tw: number, na: number, halo: Readonly<FxHalo>): number {
  const c = Math.cos(g);
  const s = Math.sin(g);
  return pushLine(b, h.x + c * (r - NOTCH_HALF), h.y + s * (r - NOTCH_HALF), h.x + c * (r + NOTCH_HALF), h.y + s * (r + NOTCH_HALF), tw, na, h.tint, halo);
}

function planSweep(h: HazardInput, b: SpriteBuf, halo: Readonly<FxHalo>, f: HazardForm): number {
  const len = Math.max(0, h.vx);
  const arms = sweepArms(h.vy);
  const w = HAZARD_LINE * tierWeight(h.tier) * (f.lethal ? 2 : TELE_THICK * 2) * flashBoost(f);
  let n = 0;
  for (let k = 0; k < arms; k++) {
    const a = sweepArmAngle(h.rot, k, arms);
    const x1 = h.x + Math.cos(a) * len;
    const y1 = h.y + Math.sin(a) * len;
    n += pushBand(b, h.x, h.y, x1, y1, 2 * SWEEP_HALF, f.alpha * (f.lethal ? ZONE_FILL : ZONE_FILL_TELE), h.tint);
    n += pushLine(b, h.x, h.y, x1, y1, w, f.alpha, h.tint, halo);
  }
  return n;
}

function planTether(h: HazardInput, b: SpriteBuf, halo: Readonly<FxHalo>, f: HazardForm): number {
  const hum = f.lethal ? 1 - TETHER_HUM + TETHER_HUM * Math.sin(h.timeSec * TETHER_HUM_HZ * Math.PI * 2) : 1;
  const a = f.alpha * hum;
  const w = HAZARD_LINE * tierWeight(h.tier) * (f.lethal ? 2.4 : TELE_THICK * 2) * flashBoost(f);
  let n = pushBand(b, h.x, h.y, h.vx, h.vy, 2 * TETHER_HALF, a * (f.lethal ? ZONE_FILL : ZONE_FILL_TELE), h.tint);
  n += pushLine(b, h.x, h.y, h.vx, h.vy, w, a, h.tint, halo);
  return n;
}

function planPull(h: HazardInput, b: SpriteBuf, halo: Readonly<FxHalo>): number {
  const R = h.radius;
  if (!(R > 1)) return 0;
  const a = pullAlpha(h.age);
  const w = HAZARD_LINE * tierWeight(h.tier) * 0.6;
  let n = pushArc(b, h.x, h.y, R, 0, Math.PI * 2, ringSegments(R, Math.PI * 2), w, a, h.tint, halo);
  for (let k = 0; k < PULL_RIPPLES; k++) {
    const f = pullRipple(h.age, k);
    const r = R * f;
    if (r < 8) continue;
    // Ripples brighten as they close in, so the pull reads as inward.
    n += pushArc(b, h.x, h.y, r, 0, Math.PI * 2, ringSegments(r, Math.PI * 2), w, a * (0.35 + 0.65 * (1 - f)), h.tint, halo);
  }
  return n;
}

/**
 * Pure on the buffer: write the instances of one hazard. Unknown types draw nothing. Returns the
 * number of instances written.
 */
export function planHazard(h: HazardInput, b: SpriteBuf, halo: Readonly<FxHalo>): number {
  if (h.type === HAZARD_PULL) return planPull(h, b, halo);
  hazardForm(h.age, h.tier, form);
  if (h.type === HAZARD_LANE) return planLane(h, b, halo, form);
  if (h.type === HAZARD_RING) return planRing(h, b, halo, form);
  if (h.type === HAZARD_SWEEP) return planSweep(h, b, halo, form);
  if (h.type === HAZARD_TETHER) return planTether(h, b, halo, form);
  return 0;
}

/** Entrance ring: a full pulsing ring at radius r (bossLook.ts entranceRing), thin, never lethal. */
export function planEntranceRing(b: SpriteBuf, x: number, y: number, r: number, alpha: number, tint: number, tier: number, halo: Readonly<FxHalo>): number {
  if (!(alpha > 0) || !(r > 1)) return 0;
  const w = HAZARD_LINE * tierWeight(tier);
  let n = pushArc(b, x, y, r, 0, Math.PI * 2, ringSegments(r, Math.PI * 2), w, alpha, tint, halo);
  // Four inward ticks mark it as a spawn point, not a lethal ring.
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const c = Math.cos(a);
    const s = Math.sin(a);
    if (pushSprite(b, F_BAR, x + c * (r - 9), y + s * (r - 9), a, 18, w, alpha, tint)) n++;
  }
  return n;
}

/** Most instances one hazard can write (a full ring with notch, or a pull), for the layer cap. */
export const HAZARD_MAX_INSTANCES = 2 * RING_SEG_MAX * (1 + PULL_RIPPLES) + 8;

/** Live hazards at most (docs/13 boss rule 5 and flag 2: 6, 8 for lane bursts). */
export const HAZARD_LIVE_MAX = 8;

/** Sprite layer capacity: ring and lane worst cases for 8 hazards plus the entrance ring. */
export const HAZARD_SPRITE_CAP = 1024;

