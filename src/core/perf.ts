// Render divisor policy (docs/04 section 13). Pure: main.ts feeds it measurements each frame.
// Sim always stays at 120 Hz; only the render rate changes.

export interface DivisorInput {
  /** Mean step plus render time of rendered frames, ms. */
  avgWorkMs: number;
  /** Mean animation frame interval, ms. */
  avgFrameMs: number;
  /** Frames in the rolling window. Policy waits for a full window before dropping on load. */
  samples: number;
  /** cssW / cssH. Main screen is below MAIN_ASPECT. */
  aspect: number;
  bloomOn: boolean;
  /** Seconds, monotonic. */
  nowSec: number;
}

export interface DivisorState {
  divisor: 1 | 2;
  /** Time the low load streak began, or -1. */
  lowSince: number;
}

export const MAIN_ASPECT = 1.5;
export const DROP_WORK_MS = 9.5;
export const RAISE_WORK_MS = 6.5;
export const RAISE_HOLD_SEC = 5;
/** Above this rAF interval the display is not delivering 120 Hz, so halving would give 30 fps. */
export const SLOW_DISPLAY_MS = 12;
export const POLICY_WINDOW = 120;

export function initialDivisorState(): DivisorState {
  return { divisor: 1, lowSince: -1 };
}

/** Returns the next state. Never mutates the input. */
export function nextDivisor(s: DivisorState, m: DivisorInput): DivisorState {
  if (m.samples >= POLICY_WINDOW && m.avgFrameMs > SLOW_DISPLAY_MS) {
    // Display runs at 60 Hz or worse: render every frame we get.
    return { divisor: 1, lowSince: -1 };
  }
  const main = m.aspect < MAIN_ASPECT;
  if (main && m.bloomOn) return { divisor: 2, lowSince: -1 };
  if (s.divisor === 1) {
    if (m.samples >= POLICY_WINDOW && m.avgWorkMs > DROP_WORK_MS) return { divisor: 2, lowSince: -1 };
    return { divisor: 1, lowSince: -1 };
  }
  // Divisor 2: return to 120 Hz render only on the cover screen after a sustained low load.
  if (main || m.avgWorkMs >= RAISE_WORK_MS) return { divisor: 2, lowSince: -1 };
  const since = s.lowSince < 0 ? m.nowSec : s.lowSince;
  if (m.nowSec - since >= RAISE_HOLD_SEC) return { divisor: 1, lowSince: -1 };
  return { divisor: 2, lowSince: since };
}
