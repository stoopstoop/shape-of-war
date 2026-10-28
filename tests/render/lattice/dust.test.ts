import { describe, expect, it } from 'vitest';
import {
  createDust,
  DUST_ALPHA,
  DUST_COUNT,
  DUST_SPEED_MAX,
  dustAlpha,
  insideArena,
  seedDust,
  stepDust,
  wrap,
} from '../../../src/render/lattice/dust';
import { arena } from './fixtures';

describe('dust motes', () => {
  it('allocates about 200 motes once', () => {
    const d = createDust();
    expect(d.count).toBe(DUST_COUNT);
    expect(DUST_COUNT).toBeGreaterThanOrEqual(150);
    expect(DUST_COUNT).toBeLessThanOrEqual(250);
    const x = d.x;
    seedDust(d, 1800, 1100);
    stepDust(d, 1 / 60);
    expect(d.x).toBe(x); // same arrays: seeding and stepping never reallocate
  });

  it('seeds deterministically inside the arena box', () => {
    const a = createDust();
    const b = createDust();
    seedDust(a, 1800, 1100);
    seedDust(b, 1800, 1100);
    expect(Array.from(a.x)).toEqual(Array.from(b.x));
    for (let i = 0; i < a.count; i++) {
      expect(Math.abs(a.x[i] ?? 0)).toBeLessThanOrEqual(900);
      expect(Math.abs(a.y[i] ?? 0)).toBeLessThanOrEqual(550);
      expect(Math.hypot(a.vx[i] ?? 0, a.vy[i] ?? 0)).toBeLessThanOrEqual(DUST_SPEED_MAX + 1e-3);
    }
  });

  it('drifts slowly and wraps inside the box', () => {
    const d = createDust();
    seedDust(d, 1000, 600);
    for (let f = 0; f < 60 * 120; f++) stepDust(d, 1 / 60);
    for (let i = 0; i < d.count; i++) {
      expect(Math.abs(d.x[i] ?? 0)).toBeLessThanOrEqual(500);
      expect(Math.abs(d.y[i] ?? 0)).toBeLessThanOrEqual(300);
    }
  });

  it('wrap keeps values in [-h, h)', () => {
    expect(wrap(0, 10)).toBe(0);
    expect(wrap(11, 10)).toBeCloseTo(-9, 9);
    expect(wrap(-11, 10)).toBeCloseTo(9, 9);
  });

  it('stays dim', () => {
    const d = createDust();
    seedDust(d, 1000, 600);
    for (let i = 0; i < d.count; i++) {
      for (const t of [0, 1.3, 7.9]) {
        const a = dustAlpha(d, i, t);
        expect(a).toBeGreaterThan(0);
        expect(a).toBeLessThanOrEqual(DUST_ALPHA + 1e-9);
      }
    }
  });

  it('insideArena follows the shape and the obstacles', () => {
    const c = arena('circle', 1000, 1000);
    expect(insideArena(c, 0, 0)).toBe(true);
    expect(insideArena(c, 480, 480)).toBe(false);
    const o = arena('rectObstacles', 1000, 600, { obstacles: [{ cx: 0, cy: 0, w: 100, h: 100 }] });
    expect(insideArena(o, 0, 0)).toBe(false);
    expect(insideArena(o, 200, 0)).toBe(true);
  });
});
