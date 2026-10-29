// Stick follow (V-A5): past the ring the centre follows the finger, so a flip responds at once
// from any landing spot. Scenario reused from Forge's tests/game/move-symmetry-input.test.ts:
// main screen 832 x 750, 260 px drag, 2 s hold, 1800 px/s flip, one pointermove per sim step.
import { describe, expect, it } from 'vitest';
import { setShipSpace, SHIP_ID, stepShip } from '../../src/game/ship';
import { createWorld, inlineRectLevel } from '../../src/game/world';
import { createInputState, createModel, pointerDown, pointerMove, pointerUp, reanchorModel, syncSticks } from '../../src/input/model';
import type { TouchModel } from '../../src/input/model';
import { followCentre, STICK_RADIUS, stickVector } from '../../src/input/stick';
import type { Track } from '../../src/input/stick';
import type { SpaceLevel } from '../../src/core/physics';

const DT = 1 / 120;
const MAIN_W = 832;
const MAIN_H = 750;
const WANT = 260;
const SPEED = 1800;

interface FlipResult {
  /** Steps after the flip starts before output stops being full in the hold direction. */
  fullSteps: number;
  /** Steps after the flip starts until output points the other way. */
  reverseSteps: number;
  /** Ship travel past the flip point in the hold direction, u. */
  drift: number;
  /** Output x for every flip step, signed so the hold direction is positive. */
  trace: number[];
}

const clampX = (x: number): number => (x < 0 ? 0 : x > MAIN_W ? MAIN_W : x);

/**
 * A thumb lands at ox on the chosen stick, slides to ox + dir * WANT (clamped to the canvas),
 * holds 2 s, then sweeps to ox - dir * WANT at SPEED. The ship is driven by the stick output with
 * x multiplied by mirror, so an aim stick landing mirrored on the right can drive the same ship.
 */
function thumbFlip(stick: 'move' | 'aim', ox: number, dir: 1 | -1, level: SpaceLevel, mirror: 1 | -1 = 1): FlipResult {
  const m = createModel(MAIN_W, MAIN_H);
  const inp = createInputState();
  const y = MAIN_H * 0.6;
  expect(pointerDown(m, 1, ox, y)).toBe(stick);
  const t: Track = m[stick];
  const w = createWorld({
    ...inlineRectLevel(),
    arena: { shape: 'rect', width: 8000, height: 900, cornerRadius: 0, obstacles: [], spawnPoint: { x: 0, y: 0 } },
  });
  setShipSpace(w, level);
  const drive = (): void => {
    syncSticks(m, inp);
    inp.move.active = t.active;
    inp.move.x = t.x * mirror;
    inp.move.y = t.y;
    stepShip(w, DT, inp);
  };
  const hold = clampX(ox + dir * WANT);
  for (let i = 0; i < 240; i++) {
    pointerMove(m, 1, hold, y);
    drive();
  }
  const x0 = w.x[SHIP_ID] ?? 0;
  const target = clampX(ox - dir * WANT);
  let fx = hold;
  let fullSteps = -1;
  let reverseSteps = -1;
  let far = 0;
  const trace: number[] = [];
  for (let i = 1; i <= 480; i++) {
    fx = dir > 0 ? Math.max(target, fx - SPEED * DT) : Math.min(target, fx + SPEED * DT);
    pointerMove(m, 1, fx, y);
    drive();
    const out = t.x * dir + 0; // + 0 turns -0 into 0 so traces compare by value
    trace.push(out);
    if (fullSteps < 0 && out < 0.999) fullSteps = i;
    if (reverseSteps < 0 && out < 0) reverseSteps = i;
    const along = ((w.x[SHIP_ID] ?? 0) - x0) * dir * mirror;
    if (along > far) far = along;
  }
  return { fullSteps, reverseSteps, drift: far, trace };
}

describe('V-A5: the flip is symmetric from a left landing at x 140', () => {
  for (const level of ['off', 'low', 'medium', 'high'] as const) {
    it(`${level}: right hold then flip equals left hold then flip, steps and drift`, () => {
      const fromRight = thumbFlip('move', 140, 1, level);
      const fromLeft = thumbFlip('move', 140, -1, level);
      expect(fromRight.fullSteps).toBe(fromLeft.fullSteps);
      expect(fromRight.reverseSteps).toBe(fromLeft.reverseSteps);
      expect(fromRight.drift).toBe(fromLeft.drift);
      expect(fromRight.trace).toEqual(fromLeft.trace);
    });
  }

  it('output leaves full on the first flip event in both directions', () => {
    expect(thumbFlip('move', 140, 1, 'medium').fullSteps).toBe(1);
    expect(thumbFlip('move', 140, -1, 'medium').fullSteps).toBe(1);
  });

  it('the scenario does move the ship (drift is not trivially zero)', () => {
    expect(thumbFlip('move', 140, 1, 'medium').drift).toBeGreaterThan(0);
    expect(thumbFlip('move', 140, 1, 'high').drift).toBeGreaterThan(0);
  });
});

describe('V-A5: a right landing mirrored matches the left landing', () => {
  // The aim stick landing at 832 - 140 = 692 is the mirror image of the move stick at 140.
  const mirrorX = MAIN_W - 140;
  for (const level of ['medium', 'high'] as const) {
    for (const dir of [1, -1] as const) {
      it(`${level}, hold ${dir > 0 ? 'right' : 'left'} on the left vs the mirrored hold on the right`, () => {
        const left = thumbFlip('move', 140, dir, level);
        const right = thumbFlip('aim', mirrorX, dir === 1 ? -1 : 1, level, -1);
        expect(right.fullSteps).toBe(left.fullSteps);
        expect(right.reverseSteps).toBe(left.reverseSteps);
        expect(right.drift).toBe(left.drift);
        expect(right.trace).toEqual(left.trace);
      });
    }
  }
});

describe('V-A5: any landing in the move half gives the same flip', () => {
  it('steps and drift at Medium and High do not depend on the landing x', () => {
    for (const level of ['medium', 'high'] as const) {
      const ref = thumbFlip('move', 140, 1, level);
      for (const ox of [120, 180, 250, 330, 400]) {
        for (const dir of [1, -1] as const) {
          const r = thumbFlip('move', ox, dir, level);
          expect(r.fullSteps).toBe(ref.fullSteps);
          expect(r.reverseSteps).toBe(ref.reverseSteps);
          expect(r.drift).toBeCloseTo(ref.drift, 9);
        }
      }
    }
  });
});

describe('followCentre', () => {
  it('leaves the centre alone for a finger on or inside the ring', () => {
    expect(followCentre(100, 100, 100 + STICK_RADIUS, 100)).toEqual({ x: 100, y: 100 });
    expect(followCentre(100, 100, 150, 60)).toEqual({ x: 100, y: 100 });
  });

  it('puts the finger on the ring edge along the drag direction', () => {
    const c = followCentre(100, 100, 400, 500);
    expect(c.x).toBeCloseTo(400 - STICK_RADIUS * 0.6, 9);
    expect(c.y).toBeCloseTo(500 - STICK_RADIUS * 0.8, 9);
    expect(Math.hypot(400 - c.x, 500 - c.y)).toBeCloseTo(STICK_RADIUS, 9);
  });

  it('clamps the centre to the canvas bounds', () => {
    expect(followCentre(50, 50, -500, -500, 800, 600)).toEqual({ x: 0, y: 0 });
    expect(followCentre(750, 550, 2000, 2000, 800, 600)).toEqual({ x: 800, y: 600 });
  });
});

function inside(t: Track, m: TouchModel): boolean {
  return t.ox >= 0 && t.ox <= m.cssW && t.oy >= 0 && t.oy <= m.cssH;
}

describe('the centre never leaves the canvas', () => {
  it('for both sticks under wild drags far off every edge', () => {
    for (const [w, h] of [
      [832, 750],
      [960, 411],
    ] as const) {
      const m = createModel(w, h);
      expect(pointerDown(m, 1, w * 0.2, h * 0.5)).toBe('move');
      expect(pointerDown(m, 2, w * 0.8, h * 0.5)).toBe('aim');
      for (let i = 0; i < 2000; i++) {
        const a = i * 0.37;
        const r = 50 + ((i * 97) % 1500);
        pointerMove(m, 1, w * 0.2 + Math.cos(a) * r, h * 0.5 + Math.sin(a * 1.3) * r);
        pointerMove(m, 2, w * 0.8 + Math.sin(a * 0.7) * r, h * 0.5 + Math.cos(a) * r);
        expect(inside(m.move, m)).toBe(true);
        expect(inside(m.aim, m)).toBe(true);
        expect(Math.hypot(m.move.x, m.move.y)).toBeLessThanOrEqual(1 + 1e-12);
        expect(Math.hypot(m.aim.x, m.aim.y)).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
  });

  it('a finger off the canvas edge still reads full output toward it', () => {
    const m = createModel(MAIN_W, MAIN_H);
    pointerDown(m, 1, 140, 400);
    pointerMove(m, 1, -300, 400);
    expect(m.move.ox).toBe(0);
    expect(m.move.x).toBeCloseTo(-1, 9);
  });

  it('a followed centre still inside the canvas survives a reanchor', () => {
    const m = createModel(MAIN_W, MAIN_H);
    pointerDown(m, 1, 140, 400);
    pointerMove(m, 1, 600, 400);
    expect(reanchorModel(m, MAIN_W, MAIN_H)).toEqual([]);
    expect(m.move.active).toBe(true);
  });
});

describe('a drag within the ring moves nothing', () => {
  it('the centre stays at the landing and output matches the offset from it', () => {
    const m = createModel(MAIN_W, MAIN_H);
    pointerDown(m, 1, 200, 400);
    pointerDown(m, 2, 600, 400);
    for (let i = 0; i < 200; i++) {
      const a = i * 0.29;
      const r = (i % 12) * 10; // 0 to 110 px, inside the 120 px ring
      pointerMove(m, 1, 200 + Math.cos(a) * r, 400 + Math.sin(a) * r);
      pointerMove(m, 2, 600 + Math.sin(a) * r, 400 + Math.cos(a) * r);
      expect([m.move.ox, m.move.oy]).toEqual([200, 400]);
      expect([m.aim.ox, m.aim.oy]).toEqual([600, 400]);
      const v = stickVector(200 + Math.cos(a) * r - 200, 400 + Math.sin(a) * r - 400);
      expect(m.move.x).toBe(v.x);
      expect(m.move.y).toBe(v.y);
    }
  });

  it('a drag exactly to the ring edge does not move the centre', () => {
    const m = createModel(MAIN_W, MAIN_H);
    pointerDown(m, 1, 200, 400);
    pointerMove(m, 1, 200 + STICK_RADIUS, 400);
    expect(m.move.ox).toBe(200);
    expect(m.move.x).toBeCloseTo(1, 9);
  });
});

describe('landing and release', () => {
  it('keeps the landing point after the centre follows, and a new touch resets it', () => {
    const m = createModel(MAIN_W, MAIN_H);
    pointerDown(m, 1, 140, 450);
    pointerMove(m, 1, 600, 450);
    expect([m.move.lx, m.move.ly]).toEqual([140, 450]);
    expect(m.move.ox).toBe(480);
    pointerUp(m, 1);
    expect(m.move.active).toBe(false);
    expect([m.move.x, m.move.y]).toEqual([0, 0]);
    pointerDown(m, 2, 200, 300);
    expect([m.move.ox, m.move.oy, m.move.lx, m.move.ly]).toEqual([200, 300, 200, 300]);
  });

  it('the dead zone still applies around the followed centre', () => {
    const m = createModel(MAIN_W, MAIN_H);
    pointerDown(m, 1, 140, 400);
    pointerMove(m, 1, 600, 400); // centre now 480
    pointerMove(m, 1, 485, 400); // 5 px from the centre, inside the dead zone
    expect(m.move.ox).toBe(480);
    expect(m.move.x).toBe(0);
  });
});
