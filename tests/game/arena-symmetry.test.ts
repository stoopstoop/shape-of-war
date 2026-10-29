// Move symmetry audit: wall confinement and the slide normal must mirror for left and right walls.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/rng';
import { confine, createConfineResult } from '../../src/game/arena';
import type { ArenaDef } from '../../src/levelgen/leveldef';
import { SYMMETRIC_ARENAS } from './symmetry-helpers';

/**
 * Bit exact for every shape except the hexagon. confineHex walks its edges in one winding order,
 * so a mirrored point is projected from the other end of the mirrored edge and the result can
 * differ in the last bits (measured up to about 1e-13 u). That is rounding, not a bias: it has
 * no sign preference and sits far below Float32 store resolution. Fix requested from the
 * arena.ts owner (fold x to its absolute value before the edge walk).
 */
function tolFor(arena: ArenaDef): number {
  return arena.shape === 'hexagon' ? 1e-9 : 0;
}

function near(a: number, b: number, tol: number): void {
  if (tol === 0) expect(a).toBe(b);
  else expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
}

function mirrorCheck(arena: ArenaDef, seed: number): void {
  const tol = tolFor(arena);
  const r = mulberry32(seed);
  const a = createConfineResult();
  const b = createConfineResult();
  const span = Math.max(arena.width, arena.height) * 0.7;
  for (let i = 0; i < 4000; i++) {
    const x = (r() * 2 - 1) * span;
    const y = (r() * 2 - 1) * span;
    const rad = 4 + r() * 20;
    confine(arena, x, y, rad, a);
    confine(arena, -x, y, rad, b);
    near(a.x + b.x, 0, tol);
    near(b.y, a.y, tol);
    near(a.nx + b.nx, 0, tol);
    near(b.ny, a.ny, tol);
    expect(b.hit).toBe(a.hit);
  }
}

describe('confine mirror symmetry', () => {
  for (const [name, arena] of SYMMETRIC_ARENAS) {
    it(`${name}: confine(-x, y) mirrors confine(x, y) including the push normal`, () => {
      mirrorCheck(arena, 0xa11 + name.length);
    });
  }

  it('left and right walls clamp a straight run to the same distance from centre', () => {
    for (const [, arena] of SYMMETRIC_ARENAS) {
      const right = confine(arena, 5000, 0, 10, createConfineResult());
      const left = confine(arena, -5000, 0, 10, createConfineResult());
      expect(right.x).toBeGreaterThan(0);
      expect(left.x).toBe(-right.x);
      expect(left.nx).toBe(1);
      expect(right.nx).toBe(-1);
    }
  });
});
