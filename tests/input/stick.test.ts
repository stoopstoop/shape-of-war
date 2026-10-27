import { describe, expect, it } from 'vitest';
import { createModel, EDGE_GUARD, halfFor, inEdgeGuard, pointerDown, pointerMove, pointerUp } from '../../src/input/model';
import { DEAD_ZONE, STICK_RADIUS, stickVector } from '../../src/input/stick';

const W = 900;
const H = 400;
// Points well away from buttons (bomb and super sit at bottom centre, pause top right).
const LEFT = { x: 200, y: 200 };
const RIGHT = { x: 700, y: 200 };

describe('stickVector', () => {
  it('is zero inside the dead zone', () => {
    const r = STICK_RADIUS * DEAD_ZONE * 0.99;
    const v = stickVector(r, 0);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.kx).toBeCloseTo(r);
  });

  it('starts from zero just outside the dead zone and reaches 1 at the rim', () => {
    const just = stickVector(STICK_RADIUS * DEAD_ZONE + 0.001, 0);
    expect(just.x).toBeGreaterThan(0);
    expect(just.x).toBeLessThan(0.001);
    expect(stickVector(STICK_RADIUS, 0).x).toBeCloseTo(1);
    expect(stickVector(0, -STICK_RADIUS).y).toBeCloseTo(-1);
  });

  it('rescales linearly between dead zone and rim', () => {
    const half = STICK_RADIUS * (DEAD_ZONE + (1 - DEAD_ZONE) / 2);
    expect(stickVector(half, 0).x).toBeCloseTo(0.5);
  });

  it('clamps knob and output to the 120 px radius', () => {
    const v = stickVector(300, 400);
    expect(Math.hypot(v.kx, v.ky)).toBeCloseTo(STICK_RADIUS);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(0.6);
    expect(v.y).toBeCloseTo(0.8);
  });

  it('keeps output within [-1, 1] on both axes', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const v = stickVector(Math.cos(a) * 1000, Math.sin(a) * 1000);
      expect(Math.abs(v.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(v.y)).toBeLessThanOrEqual(1);
    }
  });

  it('handles a zero offset', () => {
    expect(stickVector(0, 0)).toEqual({ x: 0, y: 0, kx: 0, ky: 0 });
  });
});

describe('DPR independence', () => {
  it('gives the same output for the same CSS px drag at DPR 1, 2 and 3', () => {
    // Pointer Events report CSS px; a 90 CSS px drag is 90, 180, 270 device px.
    const outs = [1, 2, 3].map((dpr) => {
      const m = createModel(W, H);
      const devDrag = 90 * dpr;
      pointerDown(m, 1, LEFT.x, LEFT.y);
      pointerMove(m, 1, LEFT.x + devDrag / dpr, LEFT.y);
      return { x: m.move.x, px: m.move.px };
    });
    expect(outs[1]).toEqual(outs[0]);
    expect(outs[2]).toEqual(outs[0]);
    expect(outs[0]?.px).toBe(LEFT.x + 90);
  });

  it('caps knob travel at 120 CSS px regardless of drag length', () => {
    const m = createModel(W, H);
    pointerDown(m, 1, LEFT.x, LEFT.y);
    pointerMove(m, 1, LEFT.x + 500, LEFT.y);
    expect(m.move.px).toBe(LEFT.x + 120);
    expect(m.move.x).toBeCloseTo(1);
  });
});

describe('half assignment', () => {
  it('splits at the canvas midline', () => {
    expect(halfFor(W, W / 2 - 1)).toBe('move');
    expect(halfFor(W, W / 2)).toBe('aim');
  });

  it('first touch on the left is move, on the right is aim', () => {
    const m = createModel(W, H);
    expect(pointerDown(m, 1, RIGHT.x, RIGHT.y)).toBe('aim');
    expect(pointerDown(m, 2, LEFT.x, LEFT.y)).toBe('move');
    expect(m.aim.id).toBe(1);
    expect(m.move.id).toBe(2);
    expect(m.move.ox).toBe(LEFT.x);
    expect(m.aim.oy).toBe(RIGHT.y);
  });

  it('origin floats to wherever the thumb lands', () => {
    const m = createModel(W, H);
    pointerDown(m, 1, 77, 311);
    expect([m.move.ox, m.move.oy]).toEqual([77, 311]);
    expect(m.move.active).toBe(true);
    expect([m.move.x, m.move.y]).toEqual([0, 0]);
  });

  it('a stick that drifts across the midline stays the same stick', () => {
    const m = createModel(W, H);
    pointerDown(m, 1, 400, 200);
    pointerMove(m, 1, 520, 200);
    expect(m.move.x).toBeCloseTo(1);
    expect(m.aim.active).toBe(false);
  });
});

describe('release', () => {
  it('frees only its own stick', () => {
    const m = createModel(W, H);
    pointerDown(m, 1, LEFT.x, LEFT.y);
    pointerDown(m, 2, RIGHT.x, RIGHT.y);
    pointerMove(m, 2, RIGHT.x + 120, RIGHT.y);
    pointerUp(m, 1);
    expect(m.move.active).toBe(false);
    expect([m.move.x, m.move.y]).toEqual([0, 0]);
    expect(m.aim.active).toBe(true);
    expect(m.aim.x).toBeCloseTo(1);
  });

  it('ignores moves and ups from unknown pointers', () => {
    const m = createModel(W, H);
    pointerDown(m, 1, LEFT.x, LEFT.y);
    pointerMove(m, 9, LEFT.x + 100, LEFT.y);
    pointerUp(m, 9);
    expect(m.move.active).toBe(true);
    expect(m.move.x).toBe(0);
  });

  it('a freed half can be retaken by a new finger', () => {
    const m = createModel(W, H);
    pointerDown(m, 1, LEFT.x, LEFT.y);
    pointerUp(m, 1);
    expect(pointerDown(m, 5, 300, 100)).toBe('move');
    expect(m.move.ox).toBe(300);
  });
});

describe('edge guard', () => {
  it('ignores starts within 24 px of the left or right edge', () => {
    expect(EDGE_GUARD).toBe(24);
    expect(inEdgeGuard(W, 23)).toBe(true);
    expect(inEdgeGuard(W, 24)).toBe(false);
    expect(inEdgeGuard(W, W - 23)).toBe(true);
    expect(inEdgeGuard(W, W - 24)).toBe(false);
    const m = createModel(W, H);
    expect(pointerDown(m, 1, 10, 200)).toBe('ignored');
    expect(pointerDown(m, 2, W - 10, 200)).toBe('ignored');
    expect(m.move.active).toBe(false);
    expect(m.aim.active).toBe(false);
  });

  it('a guarded touch does not block the next real one', () => {
    const m = createModel(W, H);
    pointerDown(m, 1, 5, 200);
    expect(pointerDown(m, 2, LEFT.x, LEFT.y)).toBe('move');
  });
});

describe('third pointer', () => {
  it('is ignored when both sticks are held', () => {
    const m = createModel(W, H);
    pointerDown(m, 1, LEFT.x, LEFT.y);
    pointerDown(m, 2, RIGHT.x, RIGHT.y);
    expect(pointerDown(m, 3, LEFT.x + 50, LEFT.y)).toBe('ignored');
    expect(pointerDown(m, 4, RIGHT.x - 50, RIGHT.y)).toBe('ignored');
    pointerMove(m, 3, LEFT.x + 200, LEFT.y);
    expect(m.move.id).toBe(1);
    expect(m.move.x).toBe(0);
    pointerUp(m, 3);
    expect(m.move.active).toBe(true);
  });

  it('still presses a button', () => {
    const m = createModel(W, H);
    pointerDown(m, 1, LEFT.x, LEFT.y);
    pointerDown(m, 2, RIGHT.x, RIGHT.y);
    const b = m.buttons.bomb;
    expect(pointerDown(m, 3, b.x + b.w / 2, b.y + b.h / 2)).toBe('bomb');
    expect(m.latch.bomb.pending).toBe(true);
  });
});
