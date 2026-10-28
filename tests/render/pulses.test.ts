import { describe, expect, it } from 'vitest';
import {
  addPulse,
  clearPulses,
  createPulsePool,
  easeOut,
  PULSE_BAR,
  PULSE_RING,
  PULSE_STREAK,
  pulseAlpha,
  pulseLive,
  SHOCK_LIFE,
  SHOCK_R0,
  SHOCK_R1,
  shockRadius,
  stepPulses,
} from '../../src/render/pulses';

describe('shockwave maths', () => {
  it('easeOut runs 0 to 1, clamped, monotone', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
    let prev = -1;
    for (let k = 0; k <= 20; k++) {
      const v = easeOut(k / 20);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('ring races out: past halfway radius before a third of its life', () => {
    expect(shockRadius(SHOCK_R0, SHOCK_R1, 0)).toBe(SHOCK_R0);
    expect(shockRadius(SHOCK_R0, SHOCK_R1, 1)).toBe(SHOCK_R1);
    expect(shockRadius(SHOCK_R0, SHOCK_R1, 0.3)).toBeGreaterThan((SHOCK_R0 + SHOCK_R1) / 2);
  });

  it('alpha is 1 at birth, 0 at and after death, falling for every shape', () => {
    for (const s of [PULSE_RING, PULSE_BAR, PULSE_STREAK]) {
      expect(pulseAlpha(s, 0)).toBe(1);
      expect(pulseAlpha(s, 1)).toBe(0);
      expect(pulseAlpha(s, -0.1)).toBe(0);
      expect(pulseAlpha(s, Number.NaN)).toBe(0);
      expect(pulseAlpha(s, 0.5)).toBeLessThan(pulseAlpha(s, 0.2));
    }
  });
});

describe('pulse pool', () => {
  it('adds, ages and expires pulses, counting live', () => {
    const p = createPulsePool(4);
    expect(addPulse(p, PULSE_RING, 0, 0, 0, SHOCK_R0, SHOCK_R1, SHOCK_LIFE, 0xff00ff, 1)).toBe(0);
    expect(p.live).toBe(1);
    expect(pulseLive(p, 0)).toBe(true);
    expect(stepPulses(p, 0.05)).toBe(1);
    for (let f = 0; f < 10; f++) stepPulses(p, 0.05);
    expect(p.live).toBe(0);
    expect(pulseLive(p, 0)).toBe(false);
  });

  it('clamps a long frame to 0.1 s of ageing', () => {
    const p = createPulsePool(2);
    addPulse(p, PULSE_RING, 0, 0, 0, 1, 2, SHOCK_LIFE, 0, 1);
    expect(stepPulses(p, 5)).toBe(1);
    expect(p.age[0]).toBeCloseTo(0.1, 6);
  });

  it('rejects invalid input and clamps strength', () => {
    const p = createPulsePool(4);
    expect(addPulse(p, PULSE_BAR, Number.NaN, 0, 0, 1, 1, 1, 0, 1)).toBe(-1);
    expect(addPulse(p, PULSE_BAR, 0, 0, 0, 1, 1, 0, 0, 1)).toBe(-1);
    expect(addPulse(p, PULSE_BAR, 0, 0, 0, 1, 1, 1, 0, 0)).toBe(-1);
    const id = addPulse(p, PULSE_BAR, 0, 0, Number.NaN, 1, 1, 1, 0, 5);
    expect(p.strength[id]).toBe(1);
    expect(p.rot[id]).toBe(0);
    expect(p.fresh[id]).toBe(1);
  });

  it('a full pool recycles the oldest slot and never exceeds cap', () => {
    const p = createPulsePool(3);
    for (let i = 0; i < 10; i++) addPulse(p, PULSE_RING, i, 0, 0, 1, 2, 1, 0, 1);
    expect(p.live).toBe(3);
    expect(p.x[0]).toBe(9);
  });

  it('clear kills every pulse', () => {
    const p = createPulsePool(3);
    addPulse(p, PULSE_STREAK, 0, 0, 0, 1, 2, 1, 0, 1);
    clearPulses(p);
    expect(p.live).toBe(0);
    expect(stepPulses(p, 0.01)).toBe(0);
  });
});
