// Pure render contract helpers for the v2 enemies (docs/10-v2-plan.md wave C render contract).
// No pixi.js import. Each function maps one World field (w.t phase or age) to a visual value,
// so the renderer stays a thin mirror and every tell is unit tested. Render only: nothing here
// is read by the simulation, and variation comes from hash01, never a PRNG.
import { clampNum } from './color';

// Charger: w.t phase seconds in [0, 2.7). Wind up [0, 1.0), dash [1.0, 1.5), rest after.
export const CHARGER_CYCLE = 2.7;
export const CHARGER_WINDUP = 1.0;
export const CHARGER_DASH_END = 1.5;
/** Lane line length in arena units (render contract). */
export const CHARGER_LANE_LEN = 600;
/** Last part of the wind up where the lane flickers bright: the dash is about to start. */
const CHARGER_LANE_WARN = 0.2;
const CHARGER_LANE_FLICKER_HZ = 15;
/** Dash streak length at the start of the dash, arena units. */
export const CHARGER_STREAK_LEN = 140;

/**
 * Pure: lane line alpha for a Charger phase. 0 outside the wind up. Rises from 0.2 to 0.8
 * across the wind up, then flickers between 1 and 0.6 in the last 0.2 s before the dash.
 */
export function chargerLaneAlpha(phase: number): number {
  if (!(phase >= 0) || !(phase < CHARGER_WINDUP)) return 0;
  const left = CHARGER_WINDUP - phase;
  if (left <= CHARGER_LANE_WARN) return Math.floor(left * CHARGER_LANE_FLICKER_HZ * 2) % 2 === 0 ? 1 : 0.6;
  return 0.2 + 0.6 * (phase / (CHARGER_WINDUP - CHARGER_LANE_WARN));
}

/** Pure: whether the lane line shows (the wind up). */
export function chargerLaneVisible(phase: number): boolean {
  return chargerLaneAlpha(phase) > 0;
}

/** Pure: whether a Charger phase is inside the dash. */
export function chargerDashing(phase: number): boolean {
  return phase >= CHARGER_WINDUP && phase < CHARGER_DASH_END;
}

/** Pure: dash streak fade, 1 at the dash start falling to 0 at its end, 0 outside the dash. */
export function chargerStreak(phase: number): number {
  if (!chargerDashing(phase)) return 0;
  return 1 - (phase - CHARGER_WINDUP) / (CHARGER_DASH_END - CHARGER_WINDUP);
}

/** Dash speed from the plan (u/s), for the streak length while the dash builds up. */
const CHARGER_DASH_SPEED = 720;

/**
 * Pure: dash streak length behind the Charger. Grows with the distance dashed so far, capped at
 * CHARGER_STREAK_LEN, so the streak never reaches back past the dash start. 0 outside the dash.
 */
export function chargerStreakLen(phase: number): number {
  if (!chargerDashing(phase)) return 0;
  return Math.min(CHARGER_STREAK_LEN, (phase - CHARGER_WINDUP) * CHARGER_DASH_SPEED);
}

// Blink: w.t phase in [0, 2.6). Drift [0, 2.2), warp [2.2, 2.6). (w.vx, w.vy) hold the destination.
export const BLINK_WARP_START = 2.2;
export const BLINK_CYCLE = 2.6;
/** Destination ring radius at the start and end of the warp (it closes onto the landing). */
export const BLINK_RING_R0 = 34;
export const BLINK_RING_R1 = 14;

/** Pure: 0 at the warp start, 1 at its end, 0 outside the warp. */
function warpProgress(phase: number): number {
  if (!(phase >= BLINK_WARP_START) || !(phase < BLINK_CYCLE)) return 0;
  return (phase - BLINK_WARP_START) / (BLINK_CYCLE - BLINK_WARP_START);
}

/** Pure: whether a Blink is in its warp phase. */
export function blinkWarping(phase: number): boolean {
  return phase >= BLINK_WARP_START && phase < BLINK_CYCLE;
}

/** Pure: alpha of the Blink body. 1 while drifting; during the warp the ghost fades 1 to 0. */
export function blinkGhostAlpha(phase: number): number {
  if (!blinkWarping(phase)) return 1;
  return clampNum(1 - warpProgress(phase), 0, 1);
}

export interface BlinkRing {
  /** Arena units. */
  r: number;
  alpha: number;
}

/** Pure: destination ring for a phase, written into out. Alpha 0 outside the warp. */
export function blinkRing(phase: number, out: BlinkRing): BlinkRing {
  if (!blinkWarping(phase)) {
    out.r = BLINK_RING_R0;
    out.alpha = 0;
    return out;
  }
  const p = warpProgress(phase);
  out.r = BLINK_RING_R0 + (BLINK_RING_R1 - BLINK_RING_R0) * p;
  out.alpha = 0.35 + 0.65 * p;
  return out;
}

/**
 * Pure: whether a Blink landed between two drawn phases. The phase wraps from the warp back to
 * the drift when it jumps. A NaN prev (slot not seen yet) never counts.
 */
export function blinkArrived(prev: number, cur: number): boolean {
  return prev >= BLINK_WARP_START && cur < prev && cur < BLINK_WARP_START;
}

// Mine: w.t seconds since the drop. Arms at 0.8, removed at 12, blinks over the last 2 s.
export const MINE_ARM = 0.8;
export const MINE_LIFE = 12;
export const MINE_BLINK_SEC = 2;
const MINE_BLINK_HZ = 8;
/** Alpha while unarmed: visible, clearly not live. */
export const MINE_DIM = 0.3;
/** Blink off phase alpha: dim, never invisible, because an armed mine still kills. */
export const MINE_BLINK_LOW = 0.35;

/** Pure: whether a Mine is armed at age t. */
export function mineArmed(t: number): boolean {
  return t >= MINE_ARM;
}

/** Pure: Mine alpha at age t. Dim until armed, solid, then blinking in the last 2 s. */
export function mineAlpha(t: number): number {
  if (!(t >= MINE_ARM)) return MINE_DIM;
  const left = MINE_LIFE - t;
  if (left >= MINE_BLINK_SEC) return 1;
  if (left <= 0) return MINE_BLINK_LOW;
  return Math.floor(left * MINE_BLINK_HZ * 2) % 2 === 0 ? 1 : MINE_BLINK_LOW;
}

// Slime: w.t seconds since the drop in [0, 8). Grows from half to full radius over 0.3 s.
export const SLIME_LIFE = 8;
export const SLIME_GROW = 0.3;
export const SLIME_BLINK_SEC = 2;
const SLIME_BLINK_HZ = 4;
export const SLIME_BLINK_LOW = 0.35;
/** Nominal Slime radius, the render contract w.radius. */
export const SLIME_RADIUS = 40;

/** Pure: Slime radius scale at age t: 0.5 at the drop, eased out to 1 at 0.3 s, then 1. */
export function slimeScale(t: number): number {
  if (!(t > 0)) return 0.5;
  if (t >= SLIME_GROW) return 1;
  const u = t / SLIME_GROW;
  return 0.5 + 0.5 * (1 - (1 - u) * (1 - u));
}

/** Pure: Slime alpha at age t. Solid, then blinking softly in the last 2 s of 8. */
export function slimeAlpha(t: number): number {
  const left = SLIME_LIFE - t;
  if (!(left < SLIME_BLINK_SEC)) return 1;
  if (left <= 0) return SLIME_BLINK_LOW;
  return Math.floor(left * SLIME_BLINK_HZ * 2) % 2 === 0 ? 1 : SLIME_BLINK_LOW;
}

/** Pure: whether a Slime was dropped this frame (for the splat), from its age. */
export function slimeFresh(t: number): boolean {
  return t >= 0 && t < SLIME_GROW;
}

/** Number of baked Slime outlines; hash01(id) picks one and a fixed turn, so puddles differ. */
export const SLIME_VARIANTS = 4;

/** Pure: Slime outline variant index 0..SLIME_VARIANTS-1 from hash01(id) in [0, 1). */
export function slimeVariant(h: number): number {
  const v = Math.floor(clampNum(h, 0, 0.999999) * SLIME_VARIANTS);
  return clampNum(v, 0, SLIME_VARIANTS - 1);
}

// Splime: w.t seconds since its last drop in [0, 3.5). Swells over the last 0.5 s.
export const SPLIME_DROP = 3.5;
export const SPLIME_SWELL_SEC = 0.5;
export const SPLIME_SWELL_MAX = 0.2;

/** Pure: Splime body scale. 1 until 0.5 s before the drop, then smoothstep up to 1.2. */
export function splimeSwell(t: number): number {
  const start = SPLIME_DROP - SPLIME_SWELL_SEC;
  if (!(t > start)) return 1;
  const u = clampNum((t - start) / SPLIME_SWELL_SEC, 0, 1);
  return 1 + SPLIME_SWELL_MAX * u * u * (3 - 2 * u);
}

// Trail rates for the enemy trails (particles per second per entity), through the shared pool.
export const SWIRL_TRAIL_RATE = 30;
export const CHARGER_DASH_TRAIL_RATE = 90;
