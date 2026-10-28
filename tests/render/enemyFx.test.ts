// Render contract helpers for the v2 enemies (docs/10 wave C render contract). Pure, no pixi.js.
import { describe, expect, it } from 'vitest';
import {
  BLINK_CYCLE,
  BLINK_RING_R0,
  BLINK_RING_R1,
  BLINK_WARP_START,
  blinkArrived,
  blinkGhostAlpha,
  blinkRing,
  blinkWarping,
  CHARGER_CYCLE,
  CHARGER_DASH_END,
  CHARGER_LANE_LEN,
  CHARGER_STREAK_LEN,
  CHARGER_WINDUP,
  chargerDashing,
  chargerLaneAlpha,
  chargerLaneVisible,
  chargerStreak,
  chargerStreakLen,
  MINE_ARM,
  MINE_BLINK_LOW,
  MINE_DIM,
  MINE_LIFE,
  mineAlpha,
  mineArmed,
  SLIME_BLINK_LOW,
  SLIME_GROW,
  SLIME_LIFE,
  SLIME_RADIUS,
  SLIME_VARIANTS,
  slimeAlpha,
  slimeFresh,
  slimeScale,
  slimeVariant,
  SPLIME_DROP,
  SPLIME_SWELL_MAX,
  splimeSwell,
  type BlinkRing,
} from '../../src/render/enemyFx';

function sweep(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let t = lo; t < hi; t += step) out.push(t);
  return out;
}

describe('charger phase to lane visibility', () => {
  it('matches the plan timings', () => {
    expect(CHARGER_WINDUP).toBe(1.0);
    expect(CHARGER_DASH_END).toBe(1.5);
    expect(CHARGER_CYCLE).toBe(2.7);
    expect(CHARGER_LANE_LEN).toBe(600);
  });

  it('shows the lane for the whole wind up and never outside it', () => {
    for (const t of sweep(0, CHARGER_WINDUP, 0.01)) {
      expect(chargerLaneVisible(t)).toBe(true);
      const a = chargerLaneAlpha(t);
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThanOrEqual(1);
    }
    for (const t of [1.0, 1.2, 1.49, 1.5, 2, 2.69, -0.1, Number.NaN]) {
      expect(chargerLaneVisible(t)).toBe(false);
      expect(chargerLaneAlpha(t)).toBe(0);
    }
  });

  it('brightens across the wind up and flickers bright just before the dash', () => {
    let prev = 0;
    for (const t of sweep(0, 0.79, 0.01)) {
      const a = chargerLaneAlpha(t);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
    const warn = new Set(sweep(0.81, 1.0, 0.005).map((t) => chargerLaneAlpha(t)));
    expect(warn).toEqual(new Set([1, 0.6]));
  });

  it('dash and streak only between 1.0 and 1.5, streak fades and its length grows to the cap', () => {
    for (const t of [0, 0.5, 0.99, 1.5, 2.0]) {
      expect(chargerDashing(t)).toBe(false);
      expect(chargerStreak(t)).toBe(0);
      expect(chargerStreakLen(t)).toBe(0);
    }
    expect(chargerStreak(1.0)).toBeCloseTo(1, 9);
    let prevFade = 2;
    let prevLen = -1;
    for (const t of sweep(1.0, 1.5, 0.01)) {
      expect(chargerDashing(t)).toBe(true);
      const f = chargerStreak(t);
      const l = chargerStreakLen(t);
      expect(f).toBeLessThan(prevFade);
      expect(l).toBeGreaterThanOrEqual(prevLen);
      expect(l).toBeLessThanOrEqual(CHARGER_STREAK_LEN);
      prevFade = f;
      prevLen = l;
    }
    expect(chargerStreakLen(1.4)).toBe(CHARGER_STREAK_LEN);
  });
});

describe('blink phase to ghost alpha and destination ring', () => {
  it('body is solid while drifting', () => {
    for (const t of sweep(0, BLINK_WARP_START, 0.05)) {
      expect(blinkWarping(t)).toBe(false);
      expect(blinkGhostAlpha(t)).toBe(1);
    }
  });

  it('ghost fades from 1 to 0 across the warp, strictly falling', () => {
    expect(BLINK_WARP_START).toBe(2.2);
    expect(BLINK_CYCLE).toBe(2.6);
    expect(blinkGhostAlpha(2.2)).toBeCloseTo(1, 9);
    expect(blinkGhostAlpha(2.4)).toBeCloseTo(0.5, 6);
    expect(blinkGhostAlpha(2.5999)).toBeLessThan(0.01);
    let prev = 2;
    for (const t of sweep(2.2, 2.6, 0.01)) {
      const a = blinkGhostAlpha(t);
      expect(a).toBeLessThan(prev);
      expect(a).toBeGreaterThanOrEqual(0);
      prev = a;
    }
  });

  it('destination ring shows only during the warp and closes onto the landing', () => {
    const ring: BlinkRing = { r: 0, alpha: 0 };
    expect(blinkRing(1.0, ring).alpha).toBe(0);
    expect(blinkRing(2.6, ring).alpha).toBe(0);
    let prevR = Number.POSITIVE_INFINITY;
    let prevA = 0;
    for (const t of sweep(2.2, 2.6, 0.01)) {
      blinkRing(t, ring);
      expect(ring.alpha).toBeGreaterThan(prevA);
      expect(ring.r).toBeLessThan(prevR);
      expect(ring.r).toBeLessThanOrEqual(BLINK_RING_R0);
      expect(ring.r).toBeGreaterThanOrEqual(BLINK_RING_R1);
      prevR = ring.r;
      prevA = ring.alpha;
    }
  });

  it('arrival fires once when the phase wraps out of the warp', () => {
    expect(blinkArrived(2.58, 0.01)).toBe(true);
    expect(blinkArrived(2.3, 0.0)).toBe(true);
    expect(blinkArrived(2.1, 2.15)).toBe(false);
    expect(blinkArrived(2.3, 2.35)).toBe(false);
    expect(blinkArrived(1.0, 0.1)).toBe(false);
    expect(blinkArrived(Number.NaN, 0.1)).toBe(false);
  });
});

describe('mine arming', () => {
  it('is dim and unarmed under 0.8 s, solid after', () => {
    expect(MINE_ARM).toBe(0.8);
    for (const t of [0, 0.3, 0.79]) {
      expect(mineArmed(t)).toBe(false);
      expect(mineAlpha(t)).toBe(MINE_DIM);
    }
    for (const t of [0.8, 1, 5, 9.99]) {
      expect(mineArmed(t)).toBe(true);
      expect(mineAlpha(t)).toBe(1);
    }
    expect(MINE_DIM).toBeLessThan(0.5);
  });

  it('blinks in the last 2 s of 12, never invisible', () => {
    expect(MINE_LIFE).toBe(12);
    const seen = new Set(sweep(10.01, 12, 0.01).map((t) => mineAlpha(t)));
    expect(seen).toEqual(new Set([1, MINE_BLINK_LOW]));
    expect(mineAlpha(12)).toBe(MINE_BLINK_LOW);
    expect(MINE_BLINK_LOW).toBeGreaterThan(0);
  });
});

describe('slime age to radius scale and blink', () => {
  it('grows from half to full radius over 0.3 s, monotonic, then stays full', () => {
    expect(SLIME_RADIUS).toBe(40);
    expect(SLIME_GROW).toBe(0.3);
    expect(slimeScale(0)).toBe(0.5);
    expect(slimeScale(Number.NaN)).toBe(0.5);
    expect(slimeScale(0.3)).toBe(1);
    expect(slimeScale(5)).toBe(1);
    let prev = 0.5;
    for (const t of sweep(0.005, 0.3, 0.005)) {
      const s = slimeScale(t);
      expect(s).toBeGreaterThan(prev);
      expect(s).toBeLessThan(1 + 1e-9);
      prev = s;
    }
  });

  it('is solid until 6 s and blinks softly in the last 2 s of 8', () => {
    expect(SLIME_LIFE).toBe(8);
    for (const t of [0, 1, 5.99]) expect(slimeAlpha(t)).toBe(1);
    const seen = new Set(sweep(6.01, 8, 0.01).map((t) => slimeAlpha(t)));
    expect(seen).toEqual(new Set([1, SLIME_BLINK_LOW]));
    expect(slimeAlpha(8)).toBe(SLIME_BLINK_LOW);
  });

  it('is fresh (splat) only during the grow', () => {
    expect(slimeFresh(0)).toBe(true);
    expect(slimeFresh(0.29)).toBe(true);
    expect(slimeFresh(0.3)).toBe(false);
    expect(slimeFresh(-1)).toBe(false);
  });

  it('variant index covers every outline and stays in range', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) seen.add(slimeVariant(i / 100));
    expect(seen.size).toBe(SLIME_VARIANTS);
    expect(slimeVariant(0.99999999)).toBe(SLIME_VARIANTS - 1);
    expect(slimeVariant(-1)).toBe(0);
    expect(slimeVariant(5)).toBe(SLIME_VARIANTS - 1);
  });
});

describe('splime phase to swell', () => {
  it('is 1 until 0.5 s before the drop, then swells monotonically to the cap', () => {
    expect(SPLIME_DROP).toBe(3.5);
    for (const t of [0, 1, 2.9, 3.0]) expect(splimeSwell(t)).toBe(1);
    let prev = 1;
    for (const t of sweep(3.01, 3.5, 0.01)) {
      const s = splimeSwell(t);
      expect(s).toBeGreaterThan(prev);
      expect(s).toBeLessThanOrEqual(1 + SPLIME_SWELL_MAX);
      prev = s;
    }
    expect(splimeSwell(3.5)).toBeCloseTo(1 + SPLIME_SWELL_MAX, 9);
    expect(splimeSwell(Number.NaN)).toBe(1);
  });
});
