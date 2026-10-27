import { describe, expect, it } from 'vitest';
import { layoutButtons } from '../../src/input/buttons';
import { createInputState, createModel, pointerDown, pointerMove, pollModel, reanchorModel } from '../../src/input/model';

// Unfolded 10:9 main screen to folded 21:9 cover screen (shorter), and back.
const MAIN = { w: 840, h: 756 };
const COVER = { w: 960, h: 412 };

describe('reanchorModel', () => {
  it('cancels a stick whose origin is now outside the canvas', () => {
    const m = createModel(MAIN.w, MAIN.h);
    pointerDown(m, 1, 200, 600); // below the cover screen height
    pointerMove(m, 1, 320, 600);
    expect(m.move.x).toBeCloseTo(1);
    const cancelled = reanchorModel(m, COVER.w, COVER.h);
    expect(cancelled).toEqual([1]);
    expect(m.move.active).toBe(false);
    expect([m.move.x, m.move.y]).toEqual([0, 0]);
    expect(pollModel(m, createInputState()).move).toEqual({ active: false, x: 0, y: 0 });
  });

  it('keeps a stick whose origin is still inside', () => {
    const m = createModel(MAIN.w, MAIN.h);
    pointerDown(m, 2, 600, 200);
    pointerMove(m, 2, 600, 80);
    expect(reanchorModel(m, COVER.w, COVER.h)).toEqual([]);
    expect(m.aim.active).toBe(true);
    expect(m.aim.y).toBeCloseTo(-1);
  });

  it('cancels only the stick that left, not the other', () => {
    const m = createModel(COVER.w, COVER.h);
    pointerDown(m, 1, 200, 200);
    pointerDown(m, 2, 900, 200); // right of the narrower main width
    const cancelled = reanchorModel(m, MAIN.w, MAIN.h);
    expect(cancelled).toEqual([2]);
    expect(m.move.active).toBe(true);
    expect(m.aim.active).toBe(false);
  });

  it('a cancelled pointer no longer drives the stick', () => {
    const m = createModel(MAIN.w, MAIN.h);
    pointerDown(m, 1, 200, 600);
    reanchorModel(m, COVER.w, COVER.h);
    pointerMove(m, 1, 300, 200);
    expect(m.move.active).toBe(false);
    expect(pointerDown(m, 3, 150, 150)).toBe('move');
  });

  it('recomputes button rects and uses new insets', () => {
    const m = createModel(MAIN.w, MAIN.h);
    const ins = { top: 0, right: 40, bottom: 10, left: 0 };
    reanchorModel(m, COVER.w, COVER.h, ins);
    expect(m.buttons).toEqual(layoutButtons(COVER.w, COVER.h, ins));
    expect([m.cssW, m.cssH]).toEqual([COVER.w, COVER.h]);
    reanchorModel(m, MAIN.w, MAIN.h); // keeps the last insets when none given
    expect(m.buttons).toEqual(layoutButtons(MAIN.w, MAIN.h, ins));
  });

  it('new half split and edge guard use the new width', () => {
    const m = createModel(COVER.w, COVER.h);
    reanchorModel(m, MAIN.w, MAIN.h);
    expect(pointerDown(m, 1, 430, 300)).toBe('aim');
    expect(pointerDown(m, 2, MAIN.w - 20, 300)).toBe('ignored');
  });
});
