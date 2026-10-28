// Pure lattice spacing governor (v2 SPEC addendum 3.8 rule 3, docs/10 wave D). Same pattern as
// src/core/perf.ts: the caller injects measurements, the policy returns the next state and never
// mutates its input. It steps the spacing one notch coarser after 3 s of sustained overload and
// never steps back inside a level, so the grid does not flicker. A new level starts from
// initialGovernor().

export interface GovernorInput {
  /** Smoothed render frame interval, ms. */
  frameMs: number;
  /** Seconds, monotonic. */
  nowSec: number;
}

export interface GovernorState {
  /** Notches coarser than the tier spacing, 0..MAX_NOTCH. Only ever grows inside a level. */
  notch: number;
  /** Time the current overload streak began, or -1. */
  overSince: number;
}

/** Overload: frames slower than about 54 fps. */
export const OVERLOAD_MS = 18.5;
export const OVERLOAD_HOLD_SEC = 3;
/** At most three notches: 25 u standard reaches 50 u, 16 u high reaches 33 u. */
export const MAX_NOTCH = 3;
/** Intervals above this are a pause, a hidden tab or a fold, not load: the streak restarts. */
export const GAP_MS = 120;
/** Smoothing factor of the frame interval moving average per frame. */
export const FRAME_EMA = 0.1;

export function initialGovernor(): GovernorState {
  return { notch: 0, overSince: -1 };
}

/**
 * Pure: next governor state. Steps down one notch after OVERLOAD_HOLD_SEC of overload. Returns
 * the input object itself when nothing changes, so the per frame call allocates nothing.
 */
export function nextGovernor(s: GovernorState, m: GovernorInput): GovernorState {
  const over = Number.isFinite(m.frameMs) && m.frameMs > OVERLOAD_MS;
  if (!over || s.notch >= MAX_NOTCH) return s.overSince < 0 ? s : { notch: s.notch, overSince: -1 };
  if (s.overSince < 0) return { notch: s.notch, overSince: m.nowSec };
  if (m.nowSec - s.overSince >= OVERLOAD_HOLD_SEC) return { notch: s.notch + 1, overSince: -1 };
  return s;
}

/**
 * Pure: fold one frame interval into the moving average. A gap (pause, hidden tab) or a bad
 * value leaves the average alone; the caller also restarts the streak then.
 */
export function smoothFrameMs(avg: number, frameMs: number): number {
  if (!(frameMs > 0) || frameMs > GAP_MS) return avg;
  if (!(avg > 0)) return frameMs;
  return avg + (frameMs - avg) * FRAME_EMA;
}
