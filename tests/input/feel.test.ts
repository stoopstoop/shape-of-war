// B9 reproduction: the move stick feels limited, resisted and slow at v1.0.0 on the Z Fold 7.
// These tests drive the whole input path the way the browser does (device px divided by DPR
// gives clientX in CSS px), then hand the InputState to the real ship step and fixed timestep
// loop. They pass at 4fbdaf7, which shows that touch to InputState to ship velocity is not
// where the regression lives. See the hand-off for the causes found outside src/input/.
import { describe, expect, it } from 'vitest';
import { createLoop, type LoopClock } from '../../src/core/loop';
import { SHIP_SPEED, stepShip } from '../../src/game/ship';
import { createWorld, inlineRectLevel } from '../../src/game/world';
import { hitButton } from '../../src/input/buttons';
import { createInputState, createModel, pointerDown, pointerMove, pollModel, reanchorModel, syncSticks } from '../../src/input/model';
import type { TouchModel } from '../../src/input/model';
import { DEAD_ZONE, STICK_RADIUS, stickVector } from '../../src/input/stick';
import type { InputState } from '../../src/input/types';
import { hudFrame } from '../../src/ui/hudFrame';

/** Z Fold 7 CSS viewports at the Chrome default DPR, landscape. */
const FOLD = [
  { name: 'main', cssW: 832, cssH: 750, dpr: 2.625 },
  { name: 'cover', cssW: 960, cssH: 411, dpr: 2.625 },
] as const;
const DPRS = [1, 2, 2.625, 3] as const;
const ZERO = { top: 0, right: 0, bottom: 0, left: 0 };
const ARENA = { w: 1080, h: 780 }; // a typical generated level 6 arena

/** What the browser reports for a touch at device pixel (px, py): clientX = px / dpr. */
function client(dpr: number, px: number, py: number): { x: number; y: number } {
  return { x: px / dpr, y: py / dpr };
}

/** Left thumb start, in the left half, clear of the edge guard and the buttons. */
function leftStart(cssW: number, cssH: number): { x: number; y: number } {
  return { x: cssW * 0.22, y: cssH * 0.55 };
}

function mag(s: { x: number; y: number }): number {
  return Math.hypot(s.x, s.y);
}

/** Down at the start, then one pointermove of `devicePx` straight right. Returns the state after that one event. */
function oneEventDrag(m: TouchModel, dpr: number, devicePx: number): InputState {
  const st = createInputState();
  const s = leftStart(m.cssW, m.cssH);
  expect(pointerDown(m, 1, s.x, s.y)).toBe('move');
  const p = client(dpr, s.x * dpr + devicePx, s.y * dpr);
  pointerMove(m, 1, p.x, p.y);
  return syncSticks(m, st);
}

describe('B9: full deflection at Fold DPR', () => {
  for (const scr of FOLD) {
    for (const dpr of DPRS) {
      it(`${scr.name} screen, DPR ${dpr}: a 120 CSS px drag reads magnitude 1 on the first move event`, () => {
        const m = createModel(scr.cssW, scr.cssH, ZERO);
        const st = oneEventDrag(m, dpr, STICK_RADIUS * dpr);
        expect(st.move.active).toBe(true);
        expect(mag(st.move)).toBeCloseTo(1, 9);
        expect(st.move.x).toBeCloseTo(1, 9);
      });
    }
  }

  it('the throw is CSS px: full speed needs 120 * DPR device px, about 315 on the Fold', () => {
    const scr = FOLD[0];
    const m = createModel(scr.cssW, scr.cssH, ZERO);
    // 120 device px is only 45.7 CSS px at DPR 2.625, a third of the throw.
    const st = oneEventDrag(m, scr.dpr, 120);
    const css = 120 / scr.dpr;
    expect(mag(st.move)).toBeCloseTo((css / STICK_RADIUS - DEAD_ZONE) / (1 - DEAD_ZONE), 9);
    expect(mag(st.move)).toBeLessThan(0.31);
  });

  it('overshooting the rim stays at magnitude 1 (no clamp below 1)', () => {
    const scr = FOLD[0];
    const m = createModel(scr.cssW, scr.cssH, ZERO);
    const st = oneEventDrag(m, scr.dpr, 3 * STICK_RADIUS * scr.dpr);
    expect(mag(st.move)).toBeCloseTo(1, 9);
  });
});

describe('B9: no lag or smoothing between events', () => {
  it('each pointermove sets the output from that event alone, out and back', () => {
    const m = createModel(832, 750, ZERO);
    const st = createInputState();
    const s = leftStart(832, 750);
    pointerDown(m, 1, s.x, s.y);
    for (const dx of [10, 60, 120, 30, 0, -120, 5]) {
      pointerMove(m, 1, s.x + dx, s.y);
      syncSticks(m, st);
      expect(st.move.x).toBeCloseTo(stickVector(dx, 0).x, 12);
    }
  });

  it('poll returns the latest move with no extra step of delay', () => {
    const m = createModel(832, 750, ZERO);
    const st = createInputState();
    const s = leftStart(832, 750);
    pointerDown(m, 1, s.x, s.y);
    pointerMove(m, 1, s.x, s.y - STICK_RADIUS);
    expect(pollModel(m, st).move.y).toBeCloseTo(-1, 9);
  });
});

describe('B9: reanchor and HUD routing do not shrink deflection', () => {
  for (const scr of FOLD) {
    it(`${scr.name}: relayout reanchor with HUD button insets mid drag keeps magnitude 1`, () => {
      const f = hudFrame(scr.cssW, scr.cssH, ZERO, ARENA.w, ARENA.h);
      const m = createModel(scr.cssW, scr.cssH, f.buttonInsets);
      const st = oneEventDrag(m, scr.dpr, STICK_RADIUS * scr.dpr);
      // main.ts relayout() calls touch.reanchor(frame.buttonInsets) on every screen change.
      expect(reanchorModel(m, scr.cssW, scr.cssH, f.buttonInsets)).toEqual([]);
      syncSticks(m, st);
      expect(mag(st.move)).toBeCloseTo(1, 9);
      const s = leftStart(scr.cssW, scr.cssH);
      pointerMove(m, 1, s.x, s.y + STICK_RADIUS);
      expect(mag(syncSticks(m, st).move)).toBeCloseTo(1, 9);
    });

    it(`${scr.name}: no button hit area anywhere in the left half (bomb and super sit bottom right)`, () => {
      const f = hudFrame(scr.cssW, scr.cssH, ZERO, ARENA.w, ARENA.h);
      const maxX = scr.cssW / 2;
      for (let x = 30; x < maxX; x += 10) {
        for (let y = 0; y <= scr.cssH; y += 10) expect(hitButton(f.buttons, x, y)).toBeNull();
      }
    });
  }
});

describe('B9: stick to ship speed', () => {
  it('full deflection gives ship speed 420 u/s on the first sim step', () => {
    const m = createModel(832, 750, ZERO);
    const st = oneEventDrag(m, 2.625, STICK_RADIUS * 2.625);
    const w = createWorld(inlineRectLevel());
    const x0 = w.x[0] ?? 0;
    stepShip(w, 1 / 120, pollModel(m, st));
    expect(w.vx[0]).toBeCloseTo(SHIP_SPEED, 9);
    expect((w.x[0] ?? 0) - x0).toBeCloseTo(SHIP_SPEED / 120, 9);
  });

  for (const fps of [120, 60, 30, 20]) {
    it(`fixed timestep loop at ${fps} fps moves the ship 420 u per second of wall time`, () => {
      const m = createModel(832, 750, ZERO);
      const st = oneEventDrag(m, 2.625, STICK_RADIUS * 2.625);
      const w = createWorld(inlineRectLevel());
      w.x[0] = -600; // room to travel 420 u inside the 1400 u fixture arena
      const slot: { cb: ((now: number) => void) | null } = { cb: null };
      let t = 0;
      const clock: LoopClock = {
        now: () => t,
        request: (cb) => {
          slot.cb = cb;
          return 1;
        },
        cancel: () => {
          slot.cb = null;
        },
      };
      const loop = createLoop({ step: (dt) => stepShip(w, dt, pollModel(m, st)), render: () => undefined }, clock);
      loop.start();
      const frameMs = 1000 / fps;
      for (let i = 0; i < fps; i++) {
        t += frameMs;
        slot.cb?.(t);
      }
      loop.stop();
      // Within one sim step of exact: 420 u per second, whatever the frame rate.
      expect(Math.abs((w.x[0] ?? 0) + 600 - SHIP_SPEED)).toBeLessThanOrEqual(SHIP_SPEED / 120 + 1e-6);
    });
  }
});
