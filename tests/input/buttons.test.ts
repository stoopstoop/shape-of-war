import { describe, expect, it } from 'vitest';
import { hitButton, layoutButtons, rectCentre, ZERO_INSETS } from '../../src/input/buttons';
import { createInputState, createModel, pointerDown, pointerUp, pollModel } from '../../src/input/model';
import type { Insets } from '../../src/input/types';

// Representative CSS viewports; real Fold 7 values are measured at G0.
const COVER = { w: 960, h: 412 }; // about 21:9
const MAIN = { w: 840, h: 756 }; // about 10:9
const INSETS: Insets = { top: 10, right: 48, bottom: 20, left: 32 };

describe('layoutButtons', () => {
  it('21:9 without insets', () => {
    const r = layoutButtons(COVER.w, COVER.h, ZERO_INSETS);
    // Bomb: centre x 960 - 56 = 904 (bottom right, v2.1 reach), visual bottom 16 px above
    // bottom, centre y 412 - 16 - 32 = 364.
    expect(r.bomb).toEqual({ x: 860, y: 320, w: 88, h: 88 });
    // Super: 12 px gap above bomb visual, centre y 364 - 32 - 12 - 28 = 292.
    expect(r.super).toEqual({ x: 866, y: 254, w: 76, h: 76 });
    // Pause: visual 40 square 12 px inside top right, centre (960 - 32, 32).
    expect(r.pause).toEqual({ x: 900, y: 4, w: 56, h: 56 });
  });

  it('21:9 with insets', () => {
    const r = layoutButtons(COVER.w, COVER.h, INSETS);
    // Centre x 56 in from the safe right edge: 960 - 48 - 56 = 856.
    expect(r.bomb).toEqual({ x: 812, y: 300, w: 88, h: 88 });
    expect(r.super).toEqual({ x: 818, y: 234, w: 76, h: 76 });
    expect(r.pause).toEqual({ x: 852, y: 14, w: 56, h: 56 });
  });

  it('10:9 without insets', () => {
    const r = layoutButtons(MAIN.w, MAIN.h, ZERO_INSETS);
    expect(r.bomb).toEqual({ x: 740, y: 664, w: 88, h: 88 });
    expect(r.super).toEqual({ x: 746, y: 598, w: 76, h: 76 });
    expect(r.pause).toEqual({ x: 780, y: 4, w: 56, h: 56 });
  });

  it('10:9 with insets', () => {
    const r = layoutButtons(MAIN.w, MAIN.h, INSETS);
    expect(r.bomb).toEqual({ x: 692, y: 644, w: 88, h: 88 });
    expect(r.super).toEqual({ x: 698, y: 578, w: 76, h: 76 });
    expect(r.pause).toEqual({ x: 732, y: 14, w: 56, h: 56 });
  });

  it('keeps every hit rect on screen and inside insets at the top and bottom', () => {
    for (const vp of [COVER, MAIN]) {
      for (const ins of [ZERO_INSETS, INSETS]) {
        const r = layoutButtons(vp.w, vp.h, ins);
        for (const rect of [r.bomb, r.super, r.pause]) {
          expect(rect.x).toBeGreaterThanOrEqual(0);
          expect(rect.y).toBeGreaterThanOrEqual(0);
          expect(rect.x + rect.w).toBeLessThanOrEqual(vp.w);
          expect(rect.y + rect.h).toBeLessThanOrEqual(vp.h);
        }
        expect(r.bomb.y + r.bomb.h).toBeLessThanOrEqual(vp.h - ins.bottom);
        expect(r.pause.y).toBeGreaterThanOrEqual(ins.top);
        expect(r.pause.x + r.pause.w).toBeLessThanOrEqual(vp.w - ins.right);
        expect(rectCentre(r.super).x).toBe(rectCentre(r.bomb).x);
        expect(rectCentre(r.super).y).toBeLessThan(rectCentre(r.bomb).y);
      }
    }
  });
});

describe('hitButton', () => {
  const r = layoutButtons(COVER.w, COVER.h, ZERO_INSETS);

  it('hits each button at its centre', () => {
    const c = (k: 'bomb' | 'super' | 'pause'): [number, number] => {
      const p = rectCentre(r[k]);
      return [p.x, p.y];
    };
    expect(hitButton(r, ...c('bomb'))).toBe('bomb');
    expect(hitButton(r, ...c('super'))).toBe('super');
    expect(hitButton(r, ...c('pause'))).toBe('pause');
  });

  it('uses circles for bomb and super, so rect corners miss', () => {
    expect(hitButton(r, r.bomb.x + 1, r.bomb.y + r.bomb.h - 1)).toBeNull();
  });

  it('resolves the bomb and super overlap to the nearer centre', () => {
    const b = rectCentre(r.bomb);
    const s = rectCentre(r.super);
    // Centres 72 px apart; overlap band is 34 to 44 px above the bomb centre.
    expect(b.y - s.y).toBe(72);
    expect(hitButton(r, b.x, b.y - 35)).toBe('bomb');
    expect(hitButton(r, b.x, b.y - 40)).toBe('super');
  });

  it('misses open arena', () => {
    expect(hitButton(r, 200, 200)).toBeNull();
  });
});

describe('edge trigger', () => {
  it('fires once per press', () => {
    const m = createModel(COVER.w, COVER.h);
    const out = createInputState();
    const b = rectCentre(m.buttons.bomb);
    pointerDown(m, 7, b.x, b.y);
    expect(pollModel(m, out).bomb).toBe(true);
    expect(pollModel(m, out).bomb).toBe(false);
    expect(pollModel(m, out).bomb).toBe(false); // still held
    pointerUp(m, 7);
    expect(pollModel(m, out).bomb).toBe(false);
    pointerDown(m, 8, b.x, b.y);
    expect(pollModel(m, out).bomb).toBe(true);
    expect(pollModel(m, out).bomb).toBe(false);
  });

  it('a second finger on a held button does not fire again', () => {
    const m = createModel(COVER.w, COVER.h);
    const out = createInputState();
    const s = rectCentre(m.buttons.super);
    pointerDown(m, 1, s.x, s.y);
    expect(pollModel(m, out).superPressed).toBe(true);
    pointerDown(m, 2, s.x, s.y);
    expect(pollModel(m, out).superPressed).toBe(false);
    pointerUp(m, 2); // not the owner, button stays held
    expect(m.latch.super.id).toBe(1);
  });

  it('a press between polls is not lost even if released before the poll', () => {
    const m = createModel(COVER.w, COVER.h);
    const out = createInputState();
    const p = rectCentre(m.buttons.pause);
    pointerDown(m, 3, p.x, p.y);
    pointerUp(m, 3);
    expect(pollModel(m, out).pause).toBe(true);
    expect(pollModel(m, out).pause).toBe(false);
  });

  it('a button press never creates a stick', () => {
    const m = createModel(COVER.w, COVER.h);
    const b = rectCentre(m.buttons.bomb);
    expect(pointerDown(m, 1, b.x, b.y)).toBe('bomb');
    expect(m.move.active || m.aim.active).toBe(false);
  });

  it('pause works inside the right edge guard strip', () => {
    const m = createModel(COVER.w, COVER.h);
    expect(pointerDown(m, 1, COVER.w - 10, 30)).toBe('pause');
  });

  it('buttons coexist with held sticks', () => {
    const m = createModel(COVER.w, COVER.h);
    const out = createInputState();
    pointerDown(m, 1, 200, 200);
    pointerDown(m, 2, 700, 200);
    const b = rectCentre(m.buttons.bomb);
    pointerDown(m, 3, b.x, b.y);
    const s = pollModel(m, out);
    expect(s.bomb).toBe(true);
    expect(s.move.active && s.aim.active).toBe(true);
  });
});
