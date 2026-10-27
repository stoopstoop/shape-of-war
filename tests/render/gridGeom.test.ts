import { describe, expect, it } from 'vitest';
import type { ArenaDef, ArenaShape, Obstacle } from '../../src/levelgen/leveldef';
import { GRID_LINE_PX, gridLineWidth, WALL_LINE_PX, wallPasses } from '../../src/render/grid';
import { gridSegments, halfExtent, linePositions, subtractObstacles } from '../../src/render/gridGeom';

describe('grid and wall stroke widths (device independent px, never snapped)', () => {
  it('grid width is GRID_LINE_PX in CSS px at any world scale, unrounded', () => {
    for (const s of [0.37, 0.61, 0.8, 1, 1.43]) {
      expect(gridLineWidth(s) * s).toBeCloseTo(GRID_LINE_PX, 10);
    }
    expect(gridLineWidth(0.61)).not.toBe(Math.round(gridLineWidth(0.61)));
  });

  it('crisp walls: halos widest first, core last at full alpha, scaled by the neon width', () => {
    const p = wallPasses(0.5, 1.2, 0.7, 'crisp');
    expect(p).toHaveLength(3);
    const core = p[p.length - 1];
    expect(core?.alpha).toBe(1);
    expect((core?.width ?? 0) * 0.7).toBeCloseTo(WALL_LINE_PX * 1.2, 10);
    for (let i = 1; i < p.length; i++) expect(p[i]?.width ?? 0).toBeLessThan(p[i - 1]?.width ?? 0);
  });

  it('crisp walls at neon 0 keep only the core; the bloom source is one thick core', () => {
    expect(wallPasses(0, 1, 1, 'crisp')).toEqual([{ width: WALL_LINE_PX, alpha: 1 }]);
    const b = wallPasses(0.5, 1, 1, 'bloom');
    expect(b).toHaveLength(1);
    expect(b[0]?.width ?? 0).toBeGreaterThan(WALL_LINE_PX);
  });
});

function arena(shape: ArenaShape, width: number, height: number, cornerRadius = 0, obstacles: Obstacle[] = []): ArenaDef {
  return { shape, width, height, cornerRadius, obstacles, spawnPoint: { x: 0, y: 0 } };
}

/** Every segment end point must lie inside the shape (with a small tolerance). */
function inside(a: ArenaDef, x: number, y: number): boolean {
  const eps = 1e-6;
  switch (a.shape) {
    case 'circle':
      return Math.hypot(x, y) <= a.width / 2 + eps;
    case 'hexagon': {
      const r = a.width / 2;
      const h = a.height / 2;
      if (Math.abs(y) > h + eps) return false;
      return Math.abs(x) <= r - (Math.abs(y) / h) * (r / 2) + eps;
    }
    default:
      return Math.abs(x) <= a.width / 2 + eps && Math.abs(y) <= a.height / 2 + eps;
  }
}

describe('grid geometry', () => {
  it('line positions are multiples of the spacing strictly inside', () => {
    expect(linePositions(120, 50)).toEqual([-100, -50, 0, 50, 100]);
    expect(linePositions(100, 50)).toEqual([-50, 0, 50]);
  });

  it('rect lines span the full arena', () => {
    const a = arena('rect', 1000, 800);
    expect(halfExtent(a, 'v', 0)).toBe(400);
    expect(halfExtent(a, 'h', 0)).toBe(500);
    expect(halfExtent(a, 'v', 600)).toBe(-1);
  });

  it('circle chords shrink toward the edge', () => {
    const a = arena('circle', 1000, 1000);
    expect(halfExtent(a, 'v', 0)).toBe(500);
    expect(halfExtent(a, 'v', 300)).toBeCloseTo(400, 6);
  });

  it('round rect corners cut the chord', () => {
    const a = arena('roundRect', 1000, 800, 100);
    expect(halfExtent(a, 'v', 0)).toBe(400);
    expect(halfExtent(a, 'v', 500)).toBeCloseTo(300, 6);
  });

  it('hexagon edges slope to the side vertices', () => {
    const a = arena('hexagon', 1000, 866);
    expect(halfExtent(a, 'v', 0)).toBeCloseTo(433, 6);
    expect(halfExtent(a, 'v', 500)).toBeCloseTo(0, 6);
    expect(halfExtent(a, 'h', 0)).toBeCloseTo(500, 6);
    expect(halfExtent(a, 'h', 433)).toBeCloseTo(250, 6);
  });

  it('obstacles split lines', () => {
    const a = arena('rectObstacles', 1000, 800, 0, [{ cx: 0, cy: 0, w: 100, h: 200 }]);
    expect(subtractObstacles(a, 'v', 0, -400, 400)).toEqual([-400, -100, 100, 400]);
    expect(subtractObstacles(a, 'v', 60, -400, 400)).toEqual([-400, 400]);
  });

  it('every segment end lies inside its arena, for every shape', () => {
    const shapes: ArenaDef[] = [
      arena('rect', 1200, 800),
      arena('roundRect', 1200, 800, 120),
      arena('circle', 900, 900),
      arena('hexagon', 1000, 866),
      arena('rectObstacles', 1400, 900, 0, [{ cx: 200, cy: -100, w: 150, h: 300 }]),
    ];
    for (const a of shapes) {
      const segs = gridSegments(a);
      expect(segs.length).toBeGreaterThan(0);
      expect(segs.length % 4).toBe(0);
      for (let i = 0; i < segs.length; i += 2) expect(inside(a, segs[i] ?? 0, segs[i + 1] ?? 0)).toBe(true);
    }
  });
});
