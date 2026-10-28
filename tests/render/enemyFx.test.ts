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
  SPLIME_RING_R0,
  SPLIME_SWELL_MAX,
  SPLIME_SWELL_SEC,
  splimeDropRing,
  splimeSwell,
  CHARGER_LANE_A0,
  CHARGER_LANE_HALF,
  chargerChevrons,
  type BlinkRing,
  type SplimeRing,
} from '../../src/render/enemyFx';
import { DROP_SEC as SIM_SPLIME_DROP } from '../../src/game/enemies/splime';
import {
  CYCLE as SIM_CHARGER_CYCLE,
  DASH_END as SIM_CHARGER_DASH_END,
  def as chargerDef,
  LANE_LENGTH as SIM_CHARGER_LANE,
  WINDUP_SEC as SIM_CHARGER_WINDUP,
} from '../../src/game/enemies/charger';

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

  it('is bright from the first frame of the wind up (GC)', () => {
    expect(chargerLaneAlpha(0)).toBe(CHARGER_LANE_A0);
    expect(CHARGER_LANE_A0).toBeGreaterThanOrEqual(0.4);
  });

  it('puts at least one chevron on any lane longer than the body, more on longer lanes', () => {
    expect(chargerChevrons(0)).toBe(0);
    expect(chargerChevrons(30)).toBe(0);
    expect(chargerChevrons(60)).toBe(1);
    expect(chargerChevrons(CHARGER_LANE_LEN)).toBeGreaterThan(chargerChevrons(200));
    expect(chargerChevrons(Number.NaN)).toBe(0);
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
  it('uses the sim drop interval, so the tell actually comes round (GC)', () => {
    expect(SPLIME_DROP).toBe(SIM_SPLIME_DROP);
    expect(SPLIME_SWELL_SEC).toBeLessThan(SPLIME_DROP / 2);
  });

  it('is 1 until the swell window before the drop, then swells monotonically to the cap', () => {
    const start = SPLIME_DROP - SPLIME_SWELL_SEC;
    for (const t of [0, 0.5, start - 0.01, start]) expect(splimeSwell(t)).toBe(1);
    let prev = 1;
    for (const t of sweep(start + 0.01, SPLIME_DROP, 0.01)) {
      const s = splimeSwell(t);
      expect(s).toBeGreaterThan(prev);
      expect(s).toBeLessThanOrEqual(1 + SPLIME_SWELL_MAX);
      prev = s;
    }
    expect(splimeSwell(SPLIME_DROP)).toBeCloseTo(1 + SPLIME_SWELL_MAX, 9);
    expect(splimeSwell(Number.NaN)).toBe(1);
  });

  it('shows a drop ring only in the tell window, growing to the puddle radius and brightening', () => {
    const out: SplimeRing = { r: 0, alpha: 0 };
    const start = SPLIME_DROP - SPLIME_SWELL_SEC;
    for (const t of [0, 1, start, Number.NaN]) expect(splimeDropRing(t, out).alpha).toBe(0);
    let prevR = 0;
    let prevA = 0;
    for (const t of sweep(start + 0.01, SPLIME_DROP, 0.01)) {
      splimeDropRing(t, out);
      expect(out.r).toBeGreaterThan(prevR);
      expect(out.alpha).toBeGreaterThan(prevA);
      expect(out.r).toBeGreaterThanOrEqual(SPLIME_RING_R0);
      expect(out.r).toBeLessThanOrEqual(SLIME_RADIUS);
      prevR = out.r;
      prevA = out.alpha;
    }
    splimeDropRing(SPLIME_DROP, out);
    expect(out.r).toBeCloseTo(SLIME_RADIUS, 6);
    expect(out.alpha).toBeCloseTo(1, 6);
  });
});

describe('render constants match the sim (read only imports)', () => {
  it('charger timings and lane length', () => {
    expect(CHARGER_WINDUP).toBe(SIM_CHARGER_WINDUP);
    expect(CHARGER_DASH_END).toBe(SIM_CHARGER_DASH_END);
    expect(CHARGER_CYCLE).toBeCloseTo(SIM_CHARGER_CYCLE, 9);
    expect(CHARGER_LANE_LEN).toBe(SIM_CHARGER_LANE);
  });

  it('the charger lane band is exactly the hitbox wide', () => {
    expect(CHARGER_LANE_HALF).toBe(chargerDef.radius);
  });
});
