import { describe, expect, it } from 'vitest';
import { confine, createConfineResult, isInside } from '../../src/game/arena';
import type { ArenaDef, ArenaShape, Obstacle } from '../../src/levelgen/leveldef';

function arena(shape: ArenaShape, width: number, height: number, cornerRadius = 0, obstacles: Obstacle[] = []): ArenaDef {
  return { shape, width, height, cornerRadius, obstacles, spawnPoint: { x: 0, y: 0 } };
}

const COS30 = Math.cos(Math.PI / 6);
const R = 10;

const shapes: ArenaDef[] = [
  arena('rect', 1400, 900),
  arena('roundRect', 1400, 900, 120),
  arena('circle', 1000, 1000),
  arena('hexagon', 1200, 1200 * COS30),
  arena('rectObstacles', 1400, 900, 0, [
    { cx: 300, cy: 0, w: 60, h: 400 },
    { cx: -350, cy: 200, w: 200, h: 40 },
  ]),
];

/** Independent containment check per shape, with a small tolerance. */
function contained(a: ArenaDef, x: number, y: number, r: number): boolean {
  const eps = 1e-3;
  const hx = a.width / 2;
  const hy = a.height / 2;
  switch (a.shape) {
    case 'rect':
    case 'rectObstacles': {
      if (Math.abs(x) > hx - r + eps || Math.abs(y) > hy - r + eps) return false;
      for (const o of a.obstacles) {
        const qx = Math.max(o.cx - o.w / 2, Math.min(x, o.cx + o.w / 2));
        const qy = Math.max(o.cy - o.h / 2, Math.min(y, o.cy + o.h / 2));
        if (Math.hypot(x - qx, y - qy) < r - eps) return false;
      }
      return true;
    }
    case 'roundRect': {
      if (Math.abs(x) > hx - r + eps || Math.abs(y) > hy - r + eps) return false;
      const c = a.cornerRadius;
      const dx = Math.abs(x) - (hx - c);
      const dy = Math.abs(y) - (hy - c);
      if (dx > 0 && dy > 0) return Math.hypot(dx, dy) <= c - r + eps;
      return true;
    }
    case 'circle':
      return Math.hypot(x, y) <= a.width / 2 - r + eps;
    case 'hexagon': {
      const apo = (a.width / 2) * COS30;
      for (let i = 0; i < 6; i++) {
        const t = Math.PI / 6 + (i * Math.PI) / 3;
        if (x * Math.cos(t) + y * Math.sin(t) > apo - r + eps) return false;
      }
      return true;
    }
  }
}

describe('arena confine', () => {
  for (const a of shapes) {
    it(`${a.shape}: keeps a circle inside from a sweep of points`, () => {
      const out = createConfineResult();
      for (let gx = -1200; gx <= 1200; gx += 37) {
        for (let gy = -900; gy <= 900; gy += 41) {
          const res = confine(a, gx, gy, R, out);
          expect(contained(a, res.x, res.y, R)).toBe(true);
          if (res.hit) {
            expect(Math.hypot(res.nx, res.ny)).toBeCloseTo(1, 6);
            // The point moved along the reported normal.
            const dot = (res.x - gx) * res.nx + (res.y - gy) * res.ny;
            expect(dot).toBeGreaterThan(0);
          }
        }
      }
    });

    it(`${a.shape}: leaves the centre untouched`, () => {
      const res = confine(a, 0, 0, R);
      expect(res.hit).toBe(false);
      expect(res.x).toBe(0);
      expect(res.y).toBe(0);
    });
  }

  it('rect pushes out through the right wall with an inward normal', () => {
    const res = confine(shapes[0] as ArenaDef, 800, 0, R);
    expect(res.hit).toBe(true);
    expect(res.x).toBeCloseTo(690);
    expect(res.nx).toBeCloseTo(-1);
    expect(res.ny).toBeCloseTo(0);
  });

  it('circle projects radially', () => {
    const res = confine(shapes[2] as ArenaDef, 600, 600, R);
    expect(Math.hypot(res.x, res.y)).toBeCloseTo(490);
    expect(res.nx).toBeCloseTo(-Math.SQRT1_2);
  });

  it('wall obstacle pushes a circle out along the shortest axis', () => {
    const a = shapes[4] as ArenaDef;
    // Overlapping the left face of the vertical wall at cx 300, w 60 (x from 270 to 330).
    const res = confine(a, 265, 0, R);
    expect(res.hit).toBe(true);
    expect(res.x).toBeCloseTo(260);
    expect(res.nx).toBeCloseTo(-1);
    // Centre inside the wall, nearer the right face.
    const res2 = confine(a, 325, 50, R);
    expect(res2.x).toBeCloseTo(340);
    expect(res2.nx).toBeCloseTo(1);
    // Clear of the wall: untouched.
    expect(isInside(a, 200, 0, R)).toBe(true);
  });

  it('wall obstacle corner pushes out diagonally', () => {
    const a = shapes[4] as ArenaDef;
    // Near the top right corner of the wall (330, -200).
    const res = confine(a, 335, -205, R);
    expect(Math.hypot(res.x - 330, res.y + 200)).toBeCloseTo(R);
  });

  it('roundRect corner region is rounded', () => {
    const a = shapes[1] as ArenaDef;
    expect(isInside(a, 690, 440, R)).toBe(false);
    const res = confine(a, 690, 440, R);
    const cx = 700 - 120;
    const cy = 450 - 120;
    expect(Math.hypot(res.x - cx, res.y - cy)).toBeCloseTo(110);
  });

  it('hexagon vertex and flat edge limits', () => {
    const a = shapes[3] as ArenaDef;
    const apo = 600 * COS30;
    const top = confine(a, 0, -2000, R);
    expect(top.y).toBeCloseTo(-(apo - R));
    const right = confine(a, 2000, 0, R);
    expect(right.x).toBeCloseTo((apo - R) / COS30);
  });
});
