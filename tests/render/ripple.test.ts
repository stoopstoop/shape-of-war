import { describe, expect, it } from 'vitest';
import type { ArenaDef } from '../../src/levelgen/leveldef';
import {
  addRipple,
  RIPPLE_LIFE,
  RIPPLE_SPEED,
  rippleDisplace,
  rippledGridPaths,
  stepRipples,
  type Ripple,
} from '../../src/render/ripple';

const ARENA: ArenaDef = { shape: 'rect', width: 400, height: 300, cornerRadius: 0, obstacles: [], spawnPoint: { x: 0, y: 0 } };

describe('grid ripple', () => {
  it('displaces points near the wave front and leaves far points alone', () => {
    const list: Ripple[] = [];
    addRipple(list, 0, 0, 30);
    stepRipples(list, 0.1);
    const front = 0.1 * RIPPLE_SPEED;
    const out = { x: 0, y: 0 };
    rippleDisplace(front + 70, 0, list, out);
    expect(Math.abs(out.x)).toBeGreaterThan(0.5);
    expect(out.y).toBeCloseTo(0, 6);
    rippleDisplace(front + 1000, 0, list, out);
    expect(out.x).toBe(0);
  });

  it('expires after its life', () => {
    const list: Ripple[] = [];
    addRipple(list, 0, 0, 30);
    stepRipples(list, RIPPLE_LIFE + 0.01);
    expect(list).toHaveLength(0);
  });

  it('builds one path per grid segment and bends it while a ripple is live', () => {
    const flat = rippledGridPaths(ARENA, []);
    expect(flat.length).toBeGreaterThan(0);
    for (const p of flat) expect(p.length % 2).toBe(0);
    const list: Ripple[] = [];
    addRipple(list, 0, 0, 30);
    stepRipples(list, 0.1);
    const bent = rippledGridPaths(ARENA, list);
    expect(bent).not.toEqual(flat);
  });
});
