import { describe, expect, it } from 'vitest';
import { buildLattice } from '../../../src/render/lattice/layout';
import {
  addHeatPulse,
  createHeat,
  HEAT_END_FRAC,
  HEAT_KILL,
  heatBand,
  heatBombFor,
  heatFade,
  resetHeat,
  stepHeat,
  writeHeatColours,
} from '../../../src/render/lattice/heat';
import { arena } from './fixtures';

const A = arena('rect', 1800, 1100);

describe('heat maths', () => {
  it('band is 1 on the front and 0 at the half width', () => {
    expect(heatBand(0, 20)).toBe(1);
    expect(heatBand(20, 20)).toBe(0);
    expect(heatBand(-20, 20)).toBe(0);
    expect(heatBand(10, 20)).toBeCloseTo(0.75, 9);
    expect(heatBand(0, 0)).toBe(0);
  });

  it('fade runs linearly from 1 to HEAT_END_FRAC', () => {
    expect(heatFade(0)).toBe(1);
    expect(heatFade(1)).toBe(HEAT_END_FRAC);
    expect(heatFade(0.5)).toBeCloseTo((1 + HEAT_END_FRAC) / 2, 9);
  });

  it('bomb pulse reaches the arena diagonal', () => {
    const p = heatBombFor(1800, 1100);
    expect(p.speed * p.life).toBeGreaterThanOrEqual(Math.hypot(1800, 1100));
  });
});

describe('heat field', () => {
  it('a kill pulse warms a ring of nodes in its colour, then sleeps', () => {
    const L = buildLattice(A, 25);
    const h = createHeat(L.count);
    addHeatPulse(h, 0, 0, 0xff0000, HEAT_KILL);
    expect(h.awake).toBe(true);
    for (let f = 0; f < 6; f++) stepHeat(h, L, 1 / 60);
    let warm = 0;
    for (let i = 0; i < L.free; i++) {
      if ((h.r[i] ?? 0) > 0.05) warm++;
      expect(h.g[i]).toBe(0);
      expect(h.b[i]).toBe(0);
      expect(h.r[i] ?? 0).toBeLessThanOrEqual(1);
    }
    expect(warm).toBeGreaterThan(4);
    const bytes = new Uint8Array(L.count * 4);
    expect(writeHeatColours(h, bytes)).toBe(true);
    expect(writeHeatColours(h, bytes)).toBe(false);
    for (let f = 0; f < 300; f++) stepHeat(h, L, 1 / 60);
    expect(h.awake).toBe(false);
    expect(Math.max(...Array.from(h.r))).toBe(0);
  });

  it('many overlapping pulses never exceed full heat (max blend)', () => {
    const L = buildLattice(A, 25);
    const h = createHeat(L.count);
    for (let k = 0; k < 40; k++) addHeatPulse(h, 0, 0, 0xffffff, HEAT_KILL);
    for (let f = 0; f < 10; f++) stepHeat(h, L, 1 / 60);
    expect(Math.max(...Array.from(h.r))).toBeLessThanOrEqual(1);
  });

  it('ignores invalid pulses and reset cools everything', () => {
    const L = buildLattice(A, 25);
    const h = createHeat(L.count);
    addHeatPulse(h, Number.NaN, 0, 0xff0000, HEAT_KILL);
    expect(h.awake).toBe(false);
    addHeatPulse(h, 0, 0, 0xff0000, { ...HEAT_KILL, life: 0 });
    expect(h.awake).toBe(false);
    addHeatPulse(h, 0, 0, 0xff0000, HEAT_KILL);
    stepHeat(h, L, 1 / 60);
    resetHeat(h);
    expect(h.awake).toBe(false);
    stepHeat(h, L, 1 / 60);
    expect(Math.max(...Array.from(h.r))).toBe(0);
  });
});
