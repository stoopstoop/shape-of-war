import { describe, expect, it } from 'vitest';
import { hash01 } from '../../../src/render/color';
import {
  GAP_MS,
  initialGovernor,
  MAX_NOTCH,
  nextGovernor,
  OVERLOAD_HOLD_SEC,
  OVERLOAD_MS,
  smoothFrameMs,
  type GovernorState,
} from '../../../src/render/lattice/governor';

const SLOW = OVERLOAD_MS + 5;
const FAST = 16.7;

/** Feed frames of frameMs from t0 for seconds at 60 Hz; returns the state. */
function feed(s: GovernorState, frameMs: number, t0: number, seconds: number): GovernorState {
  let st = s;
  for (let t = t0; t <= t0 + seconds + 1e-9; t += 1 / 60) st = nextGovernor(st, { frameMs, nowSec: t });
  return st;
}

describe('lattice spacing governor', () => {
  it('starts at the tier spacing', () => {
    expect(initialGovernor()).toEqual({ notch: 0, overSince: -1 });
  });

  it('does not step before 3 s of sustained overload', () => {
    const s = feed(initialGovernor(), SLOW, 0, OVERLOAD_HOLD_SEC - 0.05);
    expect(s.notch).toBe(0);
  });

  it('steps one notch down after 3 s of sustained overload', () => {
    const s = feed(initialGovernor(), SLOW, 0, OVERLOAD_HOLD_SEC + 0.02);
    expect(s.notch).toBe(1);
  });

  it('a calm frame restarts the 3 s streak', () => {
    let s = feed(initialGovernor(), SLOW, 0, 2.5);
    s = nextGovernor(s, { frameMs: FAST, nowSec: 2.52 });
    s = feed(s, SLOW, 2.54, 2.5);
    expect(s.notch).toBe(0);
  });

  it('never steps back up inside a level, however calm', () => {
    let s = feed(initialGovernor(), SLOW, 0, 3.1);
    expect(s.notch).toBe(1);
    s = feed(s, 4, 3.2, 60);
    expect(s.notch).toBe(1);
  });

  it('only ever steps down over a fuzzed load trace, at most once per 3 s, and stops at the cap', () => {
    let s = initialGovernor();
    let last = 0;
    let lastStepAt = -Infinity;
    for (let f = 0; f < 60 * 120; f++) {
      const t = f / 60;
      const ms = hash01(f) < 0.7 ? SLOW + hash01(f + 9999) * 20 : FAST;
      s = nextGovernor(s, { frameMs: ms, nowSec: t });
      expect(s.notch).toBeGreaterThanOrEqual(last);
      expect(s.notch - last).toBeLessThanOrEqual(1);
      if (s.notch > last) {
        expect(t - lastStepAt).toBeGreaterThanOrEqual(OVERLOAD_HOLD_SEC);
        lastStepAt = t;
      }
      last = s.notch;
    }
    const capped = feed({ notch: MAX_NOTCH, overSince: -1 }, SLOW, 0, 30);
    expect(capped.notch).toBe(MAX_NOTCH);
  });

  it('returns the same state object when nothing changes (no allocation per frame)', () => {
    const s = initialGovernor();
    expect(nextGovernor(s, { frameMs: FAST, nowSec: 1 })).toBe(s);
    const streak = nextGovernor(s, { frameMs: SLOW, nowSec: 1 });
    expect(streak).not.toBe(s);
    expect(nextGovernor(streak, { frameMs: SLOW, nowSec: 1.5 })).toBe(streak);
  });

  it('ignores a non finite measurement', () => {
    const s = feed(initialGovernor(), Number.NaN, 0, 10);
    expect(s.notch).toBe(0);
  });

  it('smooths frame intervals and skips gaps', () => {
    expect(smoothFrameMs(0, 16)).toBe(16);
    expect(smoothFrameMs(16, 26)).toBeCloseTo(17, 6);
    expect(smoothFrameMs(16, GAP_MS + 1)).toBe(16);
    expect(smoothFrameMs(16, -1)).toBe(16);
    let avg = 0;
    for (let i = 0; i < 200; i++) avg = smoothFrameMs(avg, 25);
    expect(avg).toBeCloseTo(25, 3);
  });
});
