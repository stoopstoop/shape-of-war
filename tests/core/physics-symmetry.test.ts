// Move symmetry audit (GE note on 13b7d96): stepThrust must be an exact mirror under x negation.
// Every branch in stepThrust (brake assist dot product, speed cap, drag, coast snap) is checked
// with the velocity and the stick both negated in x.
import { describe, expect, it } from 'vitest';
import { createThrustOut, SPACE_TABLE, stepThrust, type SpaceLevel } from '../../src/core/physics';
import { mulberry32 } from '../../src/core/rng';

const LEVELS: readonly SpaceLevel[] = ['off', 'low', 'medium', 'high'];
const DT = 1 / 120;

describe('stepThrust mirror symmetry', () => {
  for (const level of LEVELS) {
    it(`${level}: negating vx and dirX negates out.vx exactly and keeps vy and holdT`, () => {
      const r = mulberry32(0x5e11 + level.length);
      const a = createThrustOut();
      const b = createThrustOut();
      const vCap = level === 'off' ? 420 : SPACE_TABLE[level].vMax;
      for (let i = 0; i < 5000; i++) {
        // Speeds up to 1.3 x cap so the clamp branch runs; tiny speeds so the coast snap runs.
        const tiny = i % 7 === 0;
        const vx = (r() * 2 - 1) * (tiny ? 4 : vCap * 1.3);
        const vy = (r() * 2 - 1) * (tiny ? 4 : vCap * 1.3);
        const ang = r() * Math.PI * 2;
        const mag = r();
        const dx = Math.cos(ang) * mag;
        const dy = Math.sin(ang) * mag;
        const held = r() < 0.75;
        const holdT = r() * 3;
        const slow = r() < 0.2 ? 0.8 : 1;
        stepThrust(level, vx, vy, dx, dy, held, holdT, DT, slow, a);
        stepThrust(level, -vx, vy, -dx, dy, held, holdT, DT, slow, b);
        expect(a.vx + b.vx).toBe(0);
        expect(b.vy).toBe(a.vy);
        expect(b.holdT).toBe(a.holdT);
      }
    });
  }

  it('brake assist fires for both reversal directions alike', () => {
    for (const level of ['low', 'medium', 'high'] as const) {
      const row = SPACE_TABLE[level];
      const right = stepThrust(level, row.vMax, 0, -1, 0, true, 0, DT, 1, createThrustOut());
      const left = stepThrust(level, -row.vMax, 0, 1, 0, true, 0, DT, 1, createThrustOut());
      expect(row.vMax - right.vx).toBeGreaterThan(0);
      expect(row.vMax - right.vx).toBe(left.vx + row.vMax);
    }
  });
});
