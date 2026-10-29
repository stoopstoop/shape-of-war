import { describe, expect, it } from 'vitest';
import { rectCentre } from '../../src/input/buttons';
import { createModel, pointerDown, pointerMove, pointerUp } from '../../src/input/model';
import { KNOB_RADIUS, STICK_RADIUS } from '../../src/input/stick';
import { buttonVisuals, stickVisuals } from '../../src/input/visuals';

describe('stickVisuals', () => {
  it('is null for idle sticks', () => {
    expect(stickVisuals(createModel(900, 400))).toEqual({ move: null, aim: null });
  });

  it('puts the ring at the origin and the knob at the finger while inside the ring', () => {
    const m = createModel(900, 400);
    pointerDown(m, 1, 200, 200);
    pointerMove(m, 1, 290, 200);
    const v = stickVisuals(m);
    expect(v.move?.ring).toEqual({ x: 200, y: 200, r: STICK_RADIUS });
    expect(v.move?.knob).toEqual({ x: 290, y: 200, r: KNOB_RADIUS });
  });

  it('ring and knob follow the centre when the finger goes past the ring', () => {
    const m = createModel(900, 400);
    pointerDown(m, 1, 200, 200);
    pointerMove(m, 1, 500, 200);
    const v = stickVisuals(m);
    expect(v.move?.ring).toEqual({ x: 380, y: 200, r: STICK_RADIUS });
    expect(v.move?.knob).toEqual({ x: 500, y: 200, r: KNOB_RADIUS });
    expect(v.aim).toBeNull();
    pointerUp(m, 1);
    expect(stickVisuals(m).move).toBeNull();
  });

  it('is JSON serialisable', () => {
    const m = createModel(900, 400);
    pointerDown(m, 1, 700, 100);
    const v = stickVisuals(m);
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });
});

describe('buttonVisuals', () => {
  it('centres visuals on the hit rects with doc 04 sizes and tracks held', () => {
    const m = createModel(900, 400);
    const b = rectCentre(m.buttons.bomb);
    pointerDown(m, 1, b.x, b.y);
    const v = buttonVisuals(m);
    expect(v.map((x) => [x.id, x.shape, x.size, x.held])).toEqual([
      ['bomb', 'circle', 64, true],
      ['super', 'circle', 56, false],
      ['pause', 'square', 40, false],
    ]);
    expect([v[0]?.x, v[0]?.y]).toEqual([b.x, b.y]);
  });
});
