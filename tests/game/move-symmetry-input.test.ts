// Move symmetry audit, input side (read only use of src/input). The sim is mirror exact
// (move-symmetry.test.ts), so this file models the GE turn around test on the real touch model:
// the move stick origin is fixed where the thumb lands (stick.ts beginTrack) and the knob is
// clamped to the ring (stick.ts stickVector), so a finger that overshoots the ring must travel
// back the overshoot before the output drops below full. A left thumb on the left half of the
// main screen can overshoot rightward up to the right screen edge (pointer capture keeps it
// past the midline and over the HUD right column) but leftward only to x = 0. So the right hold
// banks more overshoot, the flip back to left starts later, and the ship drifts further right.
import { describe, expect, it } from 'vitest';
import { setShipSpace, SHIP_ID, stepShip } from '../../src/game/ship';
import { createWorld, inlineRectLevel } from '../../src/game/world';
import { createInputState, createModel, pointerDown, pointerMove, syncSticks } from '../../src/input/model';
import { STICK_RADIUS, stickVector } from '../../src/input/stick';
import type { SpaceLevel } from '../../src/core/physics';
import { MAIN_RIGHT } from '../../src/ui/hudFrame';

const DT = 1 / 120;
/** Main screen CSS size used across the HUD tests. */
const MAIN_W = 832;
const MAIN_H = 750;

interface FlipResult {
  /** Steps after the flip starts before the stick output stops being full in the hold direction. */
  fullSteps: number;
  /** Steps after the flip starts until the stick output points the other way. */
  reverseSteps: number;
  /** Ship travel past the flip point in the hold direction, u. */
  drift: number;
}

/**
 * A thumb lands at ox, slides to ox + dir * want (clamped to the canvas, as the screen edge does),
 * holds 2 s, then sweeps to ox - dir * want at speed px/s. One pointermove per sim step.
 */
function thumbFlip(ox: number, dir: 1 | -1, want: number, speed: number, level: SpaceLevel): FlipResult {
  const clampX = (x: number): number => (x < 0 ? 0 : x > MAIN_W ? MAIN_W : x);
  const m = createModel(MAIN_W, MAIN_H);
  const inp = createInputState();
  const y = MAIN_H * 0.6;
  expect(pointerDown(m, 1, ox, y)).toBe('move');
  const w = createWorld({
    ...inlineRectLevel(),
    arena: { shape: 'rect', width: 8000, height: 900, cornerRadius: 0, obstacles: [], spawnPoint: { x: 0, y: 0 } },
  });
  setShipSpace(w, level);
  const hold = clampX(ox + dir * want);
  for (let i = 0; i < 240; i++) {
    pointerMove(m, 1, hold, y);
    syncSticks(m, inp);
    stepShip(w, DT, inp);
  }
  const x0 = w.x[SHIP_ID] ?? 0;
  const target = clampX(ox - dir * want);
  let fx = hold;
  let fullSteps = -1;
  let reverseSteps = -1;
  let far = 0;
  for (let i = 1; i <= 480; i++) {
    const stepPx = speed * DT;
    fx = dir > 0 ? Math.max(target, fx - stepPx) : Math.min(target, fx + stepPx);
    pointerMove(m, 1, fx, y);
    syncSticks(m, inp);
    stepShip(w, DT, inp);
    if (fullSteps < 0 && inp.move.x * dir < 0.999) fullSteps = i;
    if (reverseSteps < 0 && inp.move.x * dir < 0) reverseSteps = i;
    const along = ((w.x[SHIP_ID] ?? 0) - x0) * dir;
    if (along > far) far = along;
  }
  return { fullSteps, reverseSteps, drift: far };
}

describe('stick maths is mirror symmetric', () => {
  it('stickVector(-dx, dy) mirrors stickVector(dx, dy), dead zone and clamp included', () => {
    for (let dx = -300; dx <= 300; dx += 3.7) {
      for (let dy = -200; dy <= 200; dy += 9.1) {
        const a = stickVector(dx, dy);
        const b = stickVector(-dx, dy);
        expect(a.x + b.x).toBe(0);
        expect(b.y).toBe(a.y);
      }
    }
  });
});

describe('GE turn around on the main screen: overshoot room is one sided', () => {
  // A left thumb landing mid left of the main screen.
  const ox = 140;
  const want = 260; // a firm flick overshoots the 120 px ring well past its edge
  const speed = 1800; // px/s finger sweep on the flip

  it('the move half spans past the HUD right column only because pointer capture keeps the touch', () => {
    // Rightward room runs to the canvas edge, through the aim half and the HUD column.
    expect(MAIN_W - ox).toBeGreaterThan(want);
    expect(MAIN_W - MAIN_RIGHT - ox).toBeGreaterThan(want);
    // Leftward room ends at x = 0, less than the overshoot a firm hold reaches.
    expect(ox).toBeLessThan(want);
    expect(ox).toBeGreaterThan(STICK_RADIUS);
  });

  for (const level of ['off', 'low', 'medium', 'high'] as const) {
    it(`${level}: flipping out of a right hold stays at full right longer and drifts further`, () => {
      const fromRight = thumbFlip(ox, 1, want, speed, level);
      const fromLeft = thumbFlip(ox, -1, want, speed, level);
      expect(fromRight.fullSteps).toBeGreaterThan(fromLeft.fullSteps);
      expect(fromRight.reverseSteps).toBeGreaterThan(fromLeft.reverseSteps);
      expect(fromRight.drift).toBeGreaterThan(fromLeft.drift);
    });

    it(`${level}: with room both ways (no edge clamp) the same thumb flip is symmetric`, () => {
      const mid = 400; // still in the move half, more than want from x = 0
      const fromRight = thumbFlip(mid, 1, 200, speed, level);
      const fromLeft = thumbFlip(mid, -1, 200, speed, level);
      expect(fromLeft.fullSteps).toBe(fromRight.fullSteps);
      expect(fromLeft.reverseSteps).toBe(fromRight.reverseSteps);
      expect(fromLeft.drift).toBe(fromRight.drift);
    });
  }

  it('reports the size of the effect for the hand-off (medium)', () => {
    const r = thumbFlip(ox, 1, want, speed, 'medium');
    const l = thumbFlip(ox, -1, want, speed, 'medium');
    // Right hold banks want - R = 140 px of overshoot, left only ox - R = 20 px: 120 px more
    // finger travel at 1800 px/s is about 67 ms, 8 sim steps, of extra full right thrust.
    expect(r.fullSteps - l.fullSteps).toBeGreaterThanOrEqual(7);
    expect(r.fullSteps - l.fullSteps).toBeLessThanOrEqual(9);
  });
});
