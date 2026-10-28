import { describe, expect, it } from 'vitest';
import {
  COAST_SNAP_SPEED,
  createThrustOut,
  SPACE_TABLE,
  stepThrust,
  thrustAccel,
  type ThrustLevel,
} from '../../src/core/physics';
import { mulberry32 } from '../../src/core/rng';

const LEVELS: ThrustLevel[] = ['low', 'medium', 'high'];
const DT = 1 / 120;

/** Hold dir from rest for n steps of dt; returns the final out. */
function holdFromRest(level: ThrustLevel, n: number, dt: number, dirX = 1, dirY = 0): { vx: number; vy: number; holdT: number } {
  const o = createThrustOut();
  for (let i = 0; i < n; i++) stepThrust(level, o.vx, o.vy, dirX, dirY, true, o.holdT, dt, 1, o);
  return o;
}

describe('SPACE_TABLE', () => {
  it('matches the plan table', () => {
    expect(SPACE_TABLE.low).toEqual({ aMin: 1200, tau: 0.6, aMax: 2400, vMax: 420, drag: 4, brake: 2.5 });
    expect(SPACE_TABLE.medium).toEqual({ aMin: 800, tau: 0.8, aMax: 2000, vMax: 460, drag: 2.5, brake: 2.0 });
    expect(SPACE_TABLE.high).toEqual({ aMin: 500, tau: 1.0, aMax: 1800, vMax: 520, drag: 1.2, brake: 1.6 });
    expect(COAST_SNAP_SPEED).toBe(3);
  });
});

describe('thrust acceleration', () => {
  it.each(LEVELS)('%s reaches aMax at tau ln(aMax / aMin) and never exceeds it', (level) => {
    const r = SPACE_TABLE[level];
    const tStar = r.tau * Math.log(r.aMax / r.aMin);
    expect(thrustAccel(r, 0)).toBeCloseTo(r.aMin, 9);
    expect(thrustAccel(r, tStar * 0.99)).toBeLessThan(r.aMax);
    expect(thrustAccel(r, tStar)).toBeCloseTo(r.aMax, 6);
    for (let t = 0; t <= 10; t += 0.01) expect(thrustAccel(r, t)).toBeLessThanOrEqual(r.aMax);
    expect(thrustAccel(r, 1e6)).toBe(r.aMax);
  });

  it('plan values for the hold time to aMax', () => {
    const plan: Record<ThrustLevel, number> = { low: 0.42, medium: 0.73, high: 1.28 };
    for (const l of LEVELS) {
      const r = SPACE_TABLE[l];
      expect(r.tau * Math.log(r.aMax / r.aMin)).toBeCloseTo(plan[l], 2);
    }
  });

  it('a step from rest applies thrustAccel at the post step hold time', () => {
    const r = SPACE_TABLE.medium;
    const o = stepThrust('medium', 0, 0, 1, 0, true, 0.5, DT, 1, createThrustOut());
    expect(o.vx).toBeCloseTo(thrustAccel(r, 0.5 + DT) * DT, 9);
    expect(o.holdT).toBeCloseTo(0.5 + DT, 12);
  });
});

describe('from rest to vMax', () => {
  const plan: Record<ThrustLevel, number> = { low: 0.28, medium: 0.43, high: 0.71 };
  const times: Record<ThrustLevel, number> = { low: 0, medium: 0, high: 0 };

  it.each(LEVELS)('%s reaches vMax in the plan time within 5 percent', (level) => {
    const r = SPACE_TABLE[level];
    const o = createThrustOut();
    let steps = 0;
    while (Math.hypot(o.vx, o.vy) < r.vMax - 1e-9 && steps < 10000) {
      stepThrust(level, o.vx, o.vy, 1, 0, true, o.holdT, DT, 1, o);
      steps++;
    }
    const t = steps * DT;
    times[level] = t;
    expect(Math.abs(t - plan[level]) / plan[level]).toBeLessThan(0.05);
    expect(Math.hypot(o.vx, o.vy)).toBeCloseTo(r.vMax, 9);
  });

  it('low < medium < high', () => {
    expect(times.low).toBeGreaterThan(0);
    expect(times.low).toBeLessThan(times.medium);
    expect(times.medium).toBeLessThan(times.high);
  });
});

describe('drift after release', () => {
  it.each(LEVELS)('%s keeps 36.8 percent of its speed after 1 / drag seconds', (level) => {
    const r = SPACE_TABLE[level];
    const n = Math.round(1 / r.drag / DT);
    expect(n * DT).toBeCloseTo(1 / r.drag, 9);
    const o = createThrustOut();
    o.vx = r.vMax * 0.6;
    o.vy = r.vMax * 0.8;
    for (let i = 0; i < n; i++) stepThrust(level, o.vx, o.vy, 0, 0, false, o.holdT, DT, 1, o);
    expect(Math.abs(Math.hypot(o.vx, o.vy) / r.vMax - 0.368)).toBeLessThan(1e-3);
  });

  it('snaps to 0 under 3 u/s', () => {
    const o = stepThrust('high', 2.99, 0, 0, 0, false, 0, DT, 1, createThrustOut());
    expect(o.vx).toBe(0);
    expect(o.vy).toBe(0);
    const p = createThrustOut();
    p.vx = 100;
    let steps = 0;
    while (p.vx !== 0 && steps < 100000) {
      stepThrust('high', p.vx, p.vy, 0, 0, false, p.holdT, DT, 1, p);
      if (p.vx !== 0) expect(p.vx).toBeGreaterThanOrEqual(COAST_SNAP_SPEED);
      steps++;
    }
    expect(p.vx).toBe(0);
    expect(steps).toBeLessThan(100000);
  });
});

describe('brake assist and hold time', () => {
  it.each(LEVELS)('%s reversing changes speed brake times faster than pushing along', (level) => {
    const r = SPACE_TABLE[level];
    const holdT = 0.1;
    const fwd = stepThrust(level, 100, 0, 1, 0, true, holdT, DT, 1, createThrustOut());
    const rev = stepThrust(level, 100, 0, -1, 0, true, holdT, DT, 1, createThrustOut());
    const dFwd = fwd.vx - 100;
    const dRev = 100 - rev.vx;
    expect(dRev / dFwd).toBeCloseTo(r.brake, 9);
  });

  it('holdT resets on release and survives a direction change', () => {
    const o = holdFromRest('medium', 60, DT);
    expect(o.holdT).toBeCloseTo(0.5, 9);
    stepThrust('medium', o.vx, o.vy, 0, 1, true, o.holdT, DT, 1, o);
    expect(o.holdT).toBeCloseTo(0.5 + DT, 9);
    stepThrust('medium', o.vx, o.vy, -1, 0, true, o.holdT, DT, 1, o);
    expect(o.holdT).toBeCloseTo(0.5 + 2 * DT, 9);
    stepThrust('medium', o.vx, o.vy, 0, 0, false, o.holdT, DT, 1, o);
    expect(o.holdT).toBe(0);
  });

  it('off passes velocity through and clears holdT', () => {
    const o = stepThrust('off', 12, -7, 1, 0, true, 3, DT, 1, createThrustOut());
    expect(o).toEqual({ vx: 12, vy: -7, holdT: 0 });
  });
});

describe('step size', () => {
  it.each(LEVELS)('%s: 1/120 and 1/60 agree within 2 percent after a hold', (level) => {
    for (const secs of [0.25, 0.5]) {
      const a = holdFromRest(level, Math.round(secs * 120), 1 / 120, 0.6, 0.8);
      const b = holdFromRest(level, Math.round(secs * 60), 1 / 60, 0.6, 0.8);
      const sa = Math.hypot(a.vx, a.vy);
      const sb = Math.hypot(b.vx, b.vy);
      expect(Math.abs(sa - sb) / sa).toBeLessThan(0.02);
    }
  });

  it.each(LEVELS)('%s: pure drag agrees within 1e-9 across step sizes', (level) => {
    const a = createThrustOut();
    const b = createThrustOut();
    a.vx = b.vx = 400;
    a.vy = b.vy = -100;
    for (let i = 0; i < 60; i++) stepThrust(level, a.vx, a.vy, 0, 0, false, 0, 1 / 120, 1, a);
    for (let i = 0; i < 30; i++) stepThrust(level, b.vx, b.vy, 0, 0, false, 0, 1 / 60, 1, b);
    expect(Math.abs(a.vx - b.vx)).toBeLessThan(1e-9);
    expect(Math.abs(a.vy - b.vy)).toBeLessThan(1e-9);
  });
});

describe('robustness', () => {
  it('speed never exceeds vMax * slowFactor over 1000 fuzzed held steps', () => {
    const r = mulberry32(1234);
    const o = createThrustOut();
    for (let i = 0; i < 1000; i++) {
      const level = LEVELS[Math.floor(r() * 3)] ?? 'medium';
      const row = SPACE_TABLE[level];
      const slow = r() < 0.5 ? 1 : 0.5 + r() * 0.5;
      const ang = r() * Math.PI * 2;
      const mag = r();
      const vAng = r() * Math.PI * 2;
      const v0 = r() * row.vMax * slow;
      stepThrust(level, Math.cos(vAng) * v0, Math.sin(vAng) * v0, Math.cos(ang) * mag, Math.sin(ang) * mag, true, r() * 3, r() * 0.05, slow, o);
      expect(Math.hypot(o.vx, o.vy)).toBeLessThanOrEqual(row.vMax * slow * (1 + 1e-12));
    }
  });

  it('a hold sequence under slow stays under the slowed cap', () => {
    const o = createThrustOut();
    for (let i = 0; i < 600; i++) {
      stepThrust('high', o.vx, o.vy, 1, 0, true, o.holdT, DT, 0.8, o);
      expect(Math.hypot(o.vx, o.vy)).toBeLessThanOrEqual(520 * 0.8 * (1 + 1e-12));
    }
    expect(o.vx).toBeCloseTo(416, 6);
  });

  it('no NaN at dt 0', () => {
    for (const l of LEVELS) {
      for (const held of [true, false]) {
        for (const v of [0, 1, 500]) {
          const o = stepThrust(l, v, 0, held ? -1 : 0, 0, held, 0, 0, 1, createThrustOut());
          expect(Number.isNaN(o.vx) || Number.isNaN(o.vy) || Number.isNaN(o.holdT)).toBe(false);
        }
      }
      const z = stepThrust(l, 0, 0, 0, 0, true, 0, 0, 0, createThrustOut());
      expect(Number.isNaN(z.vx)).toBe(false);
    }
  });
});
