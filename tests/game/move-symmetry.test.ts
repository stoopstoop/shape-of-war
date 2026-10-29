// Move symmetry audit (GE note on 13b7d96: "left side appears to react slightly faster than right
// side, right side drifts more"). A mirrored input stream must give a mirrored ship path on a
// mirror symmetric arena under every space level, and the turn around from full right to full
// left must take exactly as long and drift exactly as far as left to right. Checked on stepShip
// directly and through the real fixed timestep loop driving stepGame with no gravity wells.
import { describe, expect, it } from 'vitest';
import { createLoop, SIM_DT, type LoopClock } from '../../src/core/loop';
import { SPACE_TABLE, type SpaceLevel } from '../../src/core/physics';
import { mulberry32 } from '../../src/core/rng';
import { stepGame } from '../../src/game/game';
import { setShipSpace, SHIP_ID, stepShip } from '../../src/game/ship';
import { createWorld, inlineRectLevel, type World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import type { ArenaDef } from '../../src/levelgen/leveldef';
import { makeGame } from './helpers';
import { mirrorInput, moveInput, SYMMETRIC_ARENAS } from './symmetry-helpers';

const LEVELS: readonly SpaceLevel[] = ['off', 'low', 'medium', 'high'];
const DT = 1 / 120;

/**
 * Hexagon confinement walks its six edges in one winding order, so a mirrored point is projected
 * from the opposite end of the mirrored edge and can differ in the last bits (about 1e-13 u,
 * see arena-symmetry.test.ts). Every other shape is bit exact. The tolerance is far below the
 * Float32 store resolution and a thousand times below one device pixel.
 */
function tolFor(shape: ArenaDef['shape']): number {
  return shape === 'hexagon' ? 1e-6 : 0;
}

function expectMirror(ax: number, bx: number, ay: number, by: number, tol: number): void {
  if (tol === 0) {
    expect(ax + bx).toBe(0);
    expect(by).toBe(ay);
  } else {
    expect(Math.abs(ax + bx)).toBeLessThanOrEqual(tol);
    expect(Math.abs(ay - by)).toBeLessThanOrEqual(tol);
  }
}

/** Seeded stream of holds, releases, partial and over unit deflections, flips and wall runs. */
function stream(seed: number, n: number): InputState[] {
  const r = mulberry32(seed);
  const out: InputState[] = [];
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    if (i % 24 === 0) {
      const mode = r();
      if (mode < 0.2) {
        mx = 0;
        my = 0;
      } else if (mode < 0.4) {
        // Hard horizontal flip, the GE turn around case.
        mx = mx > 0 ? -1 : 1;
        my = 0;
      } else {
        const a = r() * Math.PI * 2;
        const mag = mode < 0.7 ? r() : 1 + r() * 0.4;
        mx = Math.cos(a) * mag;
        my = Math.sin(a) * mag;
      }
    }
    // A long run right then left so both side walls are met and slid along.
    if (i >= 200 && i < 500) out.push(moveInput(1, 0.3));
    else if (i >= 500 && i < 800) out.push(moveInput(-1, -0.3));
    else out.push(moveInput(mx, my));
  }
  return out;
}

function worldOn(arena: ArenaDef, level: SpaceLevel): World {
  const w = createWorld({ ...inlineRectLevel(), arena });
  setShipSpace(w, level);
  return w;
}

function shipX(w: World): number {
  return w.x[SHIP_ID] ?? 0;
}

function shipVx(w: World): number {
  return w.vx[SHIP_ID] ?? 0;
}

interface Turn {
  /** Steps after the flip until vx changes sign. */
  reverseSteps: number;
  /** Steps after the flip until speed reaches 95 percent of the cap the other way. */
  settleSteps: number;
  /** Overshoot past the flip point in the original direction, u. */
  drift: number;
}

/** Hold dir for 2 s (the GE device test), flip to -dir, measure. Wide arena so no wall is met. */
function turnAround(level: SpaceLevel, dir: 1 | -1): Turn {
  const wide: ArenaDef = { shape: 'rect', width: 8000, height: 900, cornerRadius: 0, obstacles: [], spawnPoint: { x: 0, y: 0 } };
  const w = worldOn(wide, level);
  const hold = moveInput(dir, 0);
  const flip = moveInput(-dir, 0);
  for (let i = 0; i < 240; i++) stepShip(w, DT, hold);
  const x0 = shipX(w);
  const cap = level === 'off' ? 420 : SPACE_TABLE[level].vMax;
  let reverseSteps = -1;
  let settleSteps = -1;
  let far = 0;
  for (let i = 1; i <= 600; i++) {
    stepShip(w, DT, flip);
    const along = (shipX(w) - x0) * dir;
    if (along > far) far = along;
    if (reverseSteps < 0 && shipVx(w) * dir < 0) reverseSteps = i;
    if (settleSteps < 0 && -shipVx(w) * dir >= cap * 0.95) settleSteps = i;
  }
  return { reverseSteps, settleSteps, drift: far };
}

describe('stepShip mirror symmetry', () => {
  for (const level of LEVELS) {
    for (const [name, arena] of SYMMETRIC_ARENAS) {
      it(`${level} on ${name}: x negated input gives a mirrored path, velocity and hold time`, () => {
        const a = worldOn(arena, level);
        const b = worldOn(arena, level);
        const inputs = stream(0x51de + name.length * 7 + level.length, 1100);
        const tol = tolFor(arena.shape);
        for (const inp of inputs) {
          stepShip(a, DT, inp);
          stepShip(b, DT, mirrorInput(inp));
          expectMirror(shipX(a), shipX(b), a.y[SHIP_ID] ?? 0, b.y[SHIP_ID] ?? 0, tol);
          expectMirror(shipVx(a), shipVx(b), a.vy[SHIP_ID] ?? 0, b.vy[SHIP_ID] ?? 0, tol * 120);
          expect(b.ship.holdT).toBe(a.ship.holdT);
        }
      });
    }
  }
});

describe('turn around time is direction independent', () => {
  for (const level of LEVELS) {
    it(`${level}: full right to full left equals full left to full right`, () => {
      const rl = turnAround(level, 1);
      const lr = turnAround(level, -1);
      expect(rl.reverseSteps).toBeGreaterThan(0);
      expect(rl.settleSteps).toBeGreaterThan(0);
      expect(lr.reverseSteps).toBe(rl.reverseSteps);
      expect(lr.settleSteps).toBe(rl.settleSteps);
      expect(lr.drift).toBe(rl.drift);
    });
  }
});

/** Manual clock: frame intervals from a seeded jitter so both runs see the same frame pattern. */
function jitterClock(seed: number): { clock: LoopClock; frame(): void } {
  const r = mulberry32(seed);
  let now = 0;
  let cb: ((t: number) => void) | null = null;
  const clock: LoopClock = {
    now: () => now,
    request: (f) => {
      cb = f;
      return 1;
    },
    cancel: () => {
      cb = null;
    },
  };
  return {
    clock,
    frame(): void {
      // 8 to 20 ms frames plus an occasional 70 ms hitch that hits the 50 ms clamp.
      now += r() < 0.03 ? 70 : 8 + r() * 12;
      const f = cb;
      if (f !== null) f(now);
    },
  };
}

interface LoopRun {
  xs: number[];
  ys: number[];
  steps: number;
}

/** Real createLoop driving stepGame. Input is chosen by sim step index, as a polled stick would be. */
function runLoop(arena: ArenaDef, level: SpaceLevel, inputs: InputState[], mirror: boolean): LoopRun {
  const { w } = makeGame({ arena, hazards: { wells: [], spawners: [] } });
  setShipSpace(w, level);
  const xs: number[] = [];
  const ys: number[] = [];
  let step = 0;
  const jc = jitterClock(0xc10c);
  const loop = createLoop(
    {
      step(dt): void {
        const base = inputs[Math.min(step, inputs.length - 1)] ?? moveInput(0, 0);
        stepGame(w, dt, mirror ? mirrorInput(base) : base);
        xs.push(shipX(w));
        ys.push(w.y[SHIP_ID] ?? 0);
        step++;
      },
      render(): void {},
    },
    jc.clock,
  );
  loop.start();
  while (step < inputs.length) jc.frame();
  loop.stop();
  return { xs, ys, steps: step };
}

describe('real fixed timestep loop, no gravity wells', () => {
  for (const level of LEVELS) {
    for (const [name, arena] of SYMMETRIC_ARENAS) {
      it(`${level} on ${name}: mirrored input through createLoop and stepGame mirrors the path`, () => {
        const inputs = stream(0x100b + name.length + level.length * 3, 900);
        const a = runLoop(arena, level, inputs, false);
        const b = runLoop(arena, level, inputs, true);
        expect(b.steps).toBe(a.steps);
        const tol = tolFor(arena.shape);
        for (let i = 0; i < a.xs.length; i++) {
          expectMirror(a.xs[i] ?? 0, b.xs[i] ?? 0, a.ys[i] ?? 0, b.ys[i] ?? 0, tol);
        }
      });
    }

    it(`${level}: 2 s hold then flip through the loop turns around in the same steps both ways`, () => {
      const arena = SYMMETRIC_ARENAS[0]?.[1];
      if (arena === undefined) throw new Error('no arena');
      const inputs: InputState[] = [];
      // Short hold from the left of centre so the 1400 u rect wall is not reached before the flip.
      for (let i = 0; i < 240; i++) inputs.push(moveInput(i < 60 ? -1 : 1, 0));
      for (let i = 0; i < 240; i++) inputs.push(moveInput(-1, 0));
      const a = runLoop(arena, level, inputs, false);
      const b = runLoop(arena, level, inputs, true);
      for (let i = 0; i < a.xs.length; i++) expect((a.xs[i] ?? 0) + (b.xs[i] ?? 0)).toBe(0);
      expect(SIM_DT).toBe(DT);
    });
  }
});
