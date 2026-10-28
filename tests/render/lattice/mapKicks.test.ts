import { describe, expect, it } from 'vitest';
import { RIPPLE_KILL_BIG } from '../../../src/render/fx';
import {
  bombKickFor,
  heatPulseFor,
  KICK_BOMB,
  KICK_KILL,
  KICK_KILL_BIG,
  SUPER_FORCE_ACCEL,
  SUPER_PULSE_SEC,
  superForceAccel,
  superPulseDue,
} from '../../../src/render/lattice/kicks';
import { HEAT_DEATH, HEAT_KILL, HEAT_KILL_BIG, HEAT_SUPER } from '../../../src/render/lattice/heat';
import { RING_END_FRAC, ringFade } from '../../../src/render/lattice/sim';

describe('shockwave kick maths', () => {
  it('bomb ring outlives the arena diagonal at its speed', () => {
    for (const [w, h] of [
      [1800, 1100],
      [2400, 2400],
    ] as const) {
      const k = bombKickFor(w, h);
      expect(k.t).toBe('ring');
      expect(k.strength).toBe(KICK_BOMB.strength);
      expect(k.speed * k.life).toBeGreaterThanOrEqual(Math.hypot(w, h));
      expect(k.life).toBeGreaterThanOrEqual(KICK_BOMB.life);
    }
  });

  it('bomb ring for a degenerate arena keeps the base life', () => {
    expect(bombKickFor(0, -5).life).toBe(KICK_BOMB.life);
  });

  it('ring fade holds near full early and ends at RING_END_FRAC', () => {
    expect(ringFade(0)).toBe(1);
    expect(ringFade(1)).toBe(RING_END_FRAC);
    expect(ringFade(5)).toBe(RING_END_FRAC);
    expect(ringFade(0.3)).toBeGreaterThan(0.9);
    let prev = 1.0001;
    for (let k = 0; k <= 10; k++) {
      const v = ringFade(k / 10);
      expect(v).toBeLessThan(prev);
      prev = v;
    }
  });

  it('super field throbs within the peak and is 0 for bad time', () => {
    for (let t = 0; t < 3; t += 0.05) expect(Math.abs(superForceAccel(t))).toBeLessThanOrEqual(SUPER_FORCE_ACCEL + 1e-9);
    expect(superForceAccel(Number.NaN)).toBe(0);
    expect(superForceAccel(0)).toBe(0);
  });

  it('super pulses fire once per period regardless of frame rate', () => {
    for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
      let n = 0;
      let prev = 0;
      const frames = Math.round((SUPER_PULSE_SEC * 10.5) / dt);
      for (let f = 1; f <= frames; f++) {
        const t = f * dt;
        if (superPulseDue(prev, t)) n++;
        prev = t;
      }
      expect(n).toBe(10);
    }
    expect(superPulseDue(1, 1)).toBe(false);
    expect(superPulseDue(Number.NaN, 1)).toBe(false);
  });

  it('kill kick is stronger than before but below the big kill', () => {
    expect(KICK_KILL.strength).toBeGreaterThan(380);
    expect(KICK_KILL.strength).toBeLessThan(KICK_KILL_BIG.strength);
  });

  it('heat pulse per event', () => {
    expect(heatPulseFor('death', 0)).toBe(HEAT_DEATH);
    expect(heatPulseFor('super', 0)).toBe(HEAT_SUPER);
    expect(heatPulseFor('bomb', 1)).toBeNull();
    expect(heatPulseFor('geom', 1)).toBeNull();
    expect(heatPulseFor('kill', 0)).toBeNull();
    expect(heatPulseFor('kill', 0.1)).toBe(HEAT_KILL);
    expect(heatPulseFor('kill', RIPPLE_KILL_BIG)).toBe(HEAT_KILL_BIG);
  });
});
