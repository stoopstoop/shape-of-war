// G2.1 ring overlap: wherever a thumb lands, the stick ring at full deflection (STICK_RADIUS around
// the drawn centre, which stick follow can drag further) never covers a button hit rect. The drawn
// ring is pushed clear by the anchor clamp; output is still measured from the landing, so the
// landing reads zero. Also: a start inside a button rect is that button, and a stick finger dragged
// over a button never fires it.
import { describe, expect, it } from 'vitest';
import { hitButton, layoutButtons, rectCentre, ZERO_INSETS } from '../../src/input/buttons';
import { buttonList, clearCentre, pushesFrom, rayExit, RING_CLEAR, ringClear } from '../../src/input/clear';
import { createInputState, createModel, inEdgeGuard, pointerDown, pointerMove, pointerUp, pollModel, reanchorModel } from '../../src/input/model';
import type { TouchModel } from '../../src/input/model';
import { distToRect } from '../../src/input/reach';
import { DEAD_ZONE, STICK_RADIUS, stickVector } from '../../src/input/stick';
import { stickVisuals } from '../../src/input/visuals';
import type { ButtonRects, Insets, Rect } from '../../src/input/types';
import { hudFrame } from '../../src/ui/hudFrame';

const FOLD = [
  { name: 'main', w: 832, h: 750 },
  { name: 'cover', w: 960, h: 411 },
] as const;
const GRID = 20;
/** Drag directions and distances tried from every landing (stick follow moves the centre). */
const DIRS = 12;
const DRAG_STEP = 40;
const DRAG_MAX = 520;

interface Layout {
  label: string;
  w: number;
  h: number;
  insets: Insets;
  buttons: ButtonRects;
}

/** Bare safe area layout plus the HUD frame layouts main.ts hands to reanchor, on both screens. */
function layouts(): Layout[] {
  const out: Layout[] = [];
  for (const vp of FOLD) {
    out.push({ label: `${vp.name} bare`, w: vp.w, h: vp.h, insets: ZERO_INSETS, buttons: layoutButtons(vp.w, vp.h, ZERO_INSETS) });
    for (const [aw, ah] of [
      [700, 700],
      [1800, 1000],
    ] as const) {
      const f = hudFrame(vp.w, vp.h, ZERO_INSETS, aw, ah);
      out.push({ label: `${vp.name} ${f.arrangement} ${aw}x${ah}`, w: vp.w, h: vp.h, insets: f.buttonInsets, buttons: f.buttons });
    }
  }
  return out;
}

function axis(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let v = lo; v < hi; v += GRID) out.push(v);
  out.push(hi);
  return out;
}

/** Overlap in CSS px between the ring at (x, y) and the nearest button hit rect (0 means clear). */
function overlap(b: ButtonRects, x: number, y: number): number {
  let worst = 0;
  for (const r of buttonList(b)) worst = Math.max(worst, STICK_RADIUS - distToRect(r, x, y));
  return worst;
}

function ringOf(m: TouchModel, which: 'move' | 'aim'): { x: number; y: number } {
  const v = stickVisuals(m)[which];
  expect(v).not.toBeNull();
  return v === null ? { x: Number.NaN, y: Number.NaN } : { x: v.ring.x, y: v.ring.y };
}

function expectClear(m: TouchModel, which: 'move' | 'aim', label: string): void {
  const c = ringOf(m, which);
  expect(overlap(m.buttons, c.x, c.y), label).toBe(0);
  expect(c.x >= 0 && c.x <= m.cssW && c.y >= 0 && c.y <= m.cssH, `${label} ring centre on canvas`).toBe(true);
}

const ALL = layouts();

describe('clear.ts pure geometry', () => {
  const bomb: Rect = { x: 800, y: 300, w: 88, h: 88 };

  it('leaves a clear spot alone', () => {
    expect(clearCentre([bomb], 500, 340)).toEqual({ x: 500, y: 340 });
    expect(ringClear([bomb], 800 - RING_CLEAR, 340)).toBe(true);
  });

  it('pushes away from the nearest rect by the overlap amount', () => {
    // 100 px left of the rect: 20 px of overlap, pushed straight left by 20.
    const c = clearCentre([bomb], 700, 340);
    expect(c.y).toBe(340);
    expect(700 - c.x).toBeCloseTo(20, 1);
    expect(distToRect(bomb, c.x, c.y)).toBeGreaterThanOrEqual(RING_CLEAR);
  });

  it('pushes radially off a corner', () => {
    const c = clearCentre([bomb], 750, 250);
    const g = Math.hypot(c.x - 800, c.y - 300);
    expect(g).toBeGreaterThanOrEqual(RING_CLEAR);
    expect(g).toBeLessThan(RING_CLEAR + 0.1);
    expect((800 - c.x) / (300 - c.y)).toBeCloseTo(1, 6);
  });

  it('pushesFrom offers the four axis exits for a point inside a rect, plus the radial one outside', () => {
    expect(pushesFrom(bomb, 840, 340)).toHaveLength(4);
    expect(pushesFrom(bomb, 700, 340)).toHaveLength(5);
  });

  it('finds a clear spot from a corridor where no single push is clear (cover column)', () => {
    const b = layoutButtons(960, 411, ZERO_INSETS);
    const list = buttonList(b);
    // Between pause and super in the right column: up hits pause, down hits super and bomb.
    const c = clearCentre(list, 880, 160, 960, 411);
    expect(ringClear(list, c.x, c.y)).toBe(true);
    expect(c.x).toBeLessThan(880);
    expect(c.x >= 0 && c.y >= 0 && c.y <= 411).toBe(true);
  });

  it('rayExit returns the first clear distance along a ray', () => {
    const t = rayExit([bomb], 840, 340, -1, 0);
    expect(840 - t).toBeLessThanOrEqual(800 - RING_CLEAR);
    expect(840 - t).toBeGreaterThan(800 - RING_CLEAR - 0.1);
  });
});

describe('aim half landings on a 20 px grid, both Fold screens', () => {
  for (const L of ALL) {
    it(`${L.label}: landing on a button is the button; every other landing reads zero and its ring, then every drag, stays clear`, () => {
      let sticks = 0;
      let clamped = 0;
      for (const x of axis(Math.ceil(L.w / 2), L.w)) {
        for (const y of axis(0, L.h)) {
          const m = createModel(L.w, L.h, L.insets);
          expect(m.buttons).toEqual(L.buttons);
          const label = `${L.label} land ${x},${y}`;
          const r = pointerDown(m, 1, x, y);
          const b = hitButton(m.buttons, x, y);
          if (b !== null) {
            expect(r, label).toBe(b);
            expect(m.aim.active || m.move.active, label).toBe(false);
            continue;
          }
          if (inEdgeGuard(L.w, x)) {
            expect(r, label).toBe('ignored');
            continue;
          }
          expect(r, label).toBe('aim');
          sticks++;
          expect([m.aim.x, m.aim.y], label).toEqual([0, 0]);
          expect([m.aim.ox, m.aim.oy], label).toEqual([x, y]);
          if (m.aim.cx !== 0 || m.aim.cy !== 0) clamped++;
          expectClear(m, 'aim', label);
          for (let k = 0; k < DIRS; k++) {
            const a = (k / DIRS) * Math.PI * 2;
            for (let d = DRAG_STEP; d <= DRAG_MAX; d += DRAG_STEP) {
              pointerMove(m, 1, x + Math.cos(a) * d, y + Math.sin(a) * d);
              expectClear(m, 'aim', `${label} drag ${k} ${d}`);
            }
            pointerMove(m, 1, x, y);
            expectClear(m, 'aim', `${label} back ${k}`);
          }
          pointerUp(m, 1);
        }
      }
      expect(sticks).toBeGreaterThan(100);
      expect(clamped, 'some landings near the buttons needed the clamp').toBeGreaterThan(0);
    });
  }
});

describe('move half landings with stick follow toward the buttons', () => {
  for (const L of ALL) {
    it(`${L.label}: the move ring never covers a button even when dragged across the screen`, () => {
      for (const x of axis(30, Math.floor(L.w / 2) - 1)) {
        for (const y of axis(0, L.h)) {
          if (y % 60 !== 0) continue;
          const m = createModel(L.w, L.h, L.insets);
          if (pointerDown(m, 1, x, y) !== 'move') continue;
          expectClear(m, 'move', `${L.label} move ${x},${y}`);
          for (let fx = x; fx <= L.w + 200; fx += 40) {
            for (const fy of [y, L.h, 0]) {
              pointerMove(m, 1, fx, fy);
              expectClear(m, 'move', `${L.label} move ${x},${y} drag ${fx},${fy}`);
            }
          }
        }
      }
    });
  }
});

describe('the clamp moves only the drawing, never the output', () => {
  it('a landing just left of the super reads zero, and a drag reads the same as without the clamp', () => {
    const m = createModel(960, 411);
    const s = rectCentre(m.buttons.super);
    const lx = m.buttons.super.x - 40;
    expect(pointerDown(m, 1, lx, s.y)).toBe('aim');
    expect(Math.hypot(m.aim.cx, m.aim.cy)).toBeGreaterThan(70);
    expect([m.aim.x, m.aim.y]).toEqual([0, 0]);
    pointerMove(m, 1, lx - 60, s.y + 10);
    const v = stickVector(-60, 10);
    expect([m.aim.x, m.aim.y]).toEqual([v.x, v.y]);
    // The knob is drawn at the drawn centre plus the same knob offset.
    const sv = stickVisuals(m).aim;
    expect(sv?.knob.x).toBeCloseTo(m.aim.ox + m.aim.cx - 60, 9);
    expect(sv?.knob.y).toBeCloseTo(m.aim.oy + m.aim.cy + 10, 9);
  });

  it('the dead zone still holds around the landing for a clamped stick', () => {
    const m = createModel(960, 411);
    const lx = m.buttons.bomb.x - 30;
    const ly = rectCentre(m.buttons.bomb).y;
    expect(pointerDown(m, 1, lx, ly)).toBe('aim');
    expect(m.aim.cx).toBeLessThan(0);
    pointerMove(m, 1, lx - STICK_RADIUS * DEAD_ZONE * 0.9, ly);
    expect([m.aim.x, m.aim.y]).toEqual([0, 0]);
  });

  it('far from the buttons nothing is clamped', () => {
    const m = createModel(832, 750);
    pointerDown(m, 1, 200, 300);
    pointerDown(m, 2, 520, 300);
    pointerMove(m, 2, 560, 340);
    expect([m.move.cx, m.move.cy, m.aim.cx, m.aim.cy]).toEqual([0, 0, 0, 0]);
  });

  it('a reanchor reclamps a held stick against the new button rects', () => {
    const m = createModel(960, 411);
    pointerDown(m, 1, 760, 300);
    expect(reanchorModel(m, 832, 750)).toEqual([]);
    expectClear(m, 'aim', 'after unfold');
    expect(reanchorModel(m, 960, 411)).toEqual([]);
    expectClear(m, 'aim', 'after fold');
  });

  it('a new touch resets the clamp offset', () => {
    const m = createModel(960, 411);
    pointerDown(m, 1, m.buttons.super.x - 20, rectCentre(m.buttons.super).y);
    expect(m.aim.cx).not.toBe(0);
    pointerUp(m, 1);
    pointerDown(m, 2, 600, 150);
    expect([m.aim.cx, m.aim.cy]).toEqual([0, 0]);
  });
});

describe('buttons fire only on a new touch inside their rect', () => {
  it('every point of each hit rect, corners included, is the button and never a stick', () => {
    for (const vp of FOLD) {
      const b = layoutButtons(vp.w, vp.h, ZERO_INSETS);
      for (const id of ['bomb', 'super', 'pause'] as const) {
        const r = b[id];
        for (const fx of [0, 0.02, 0.5, 0.98, 1]) {
          for (const fy of [0, 0.02, 0.5, 0.98, 1]) {
            const m = createModel(vp.w, vp.h);
            const res = pointerDown(m, 1, r.x + r.w * fx, r.y + r.h * fy);
            expect(['bomb', 'super', 'pause']).toContain(res);
            expect(m.move.active || m.aim.active).toBe(false);
          }
        }
      }
    }
  });

  it('an aim finger dragged across bomb, super and pause and released on bomb never fires', () => {
    for (const vp of FOLD) {
      const m = createModel(vp.w, vp.h);
      const out = createInputState();
      expect(pointerDown(m, 1, vp.w * 0.6, vp.h * 0.5)).toBe('aim');
      for (const id of ['bomb', 'super', 'pause', 'bomb'] as const) {
        const c = rectCentre(m.buttons[id]);
        for (let i = 1; i <= 10; i++) {
          pointerMove(m, 1, c.x + (i - 5), c.y + (5 - i));
          const s = pollModel(m, out);
          expect(s.bomb || s.superPressed || s.pause).toBe(false);
          expect(s.aim.active).toBe(true);
        }
      }
      pointerUp(m, 1);
      const s = pollModel(m, out);
      expect(s.bomb || s.superPressed || s.pause).toBe(false);
      for (const id of ['bomb', 'super', 'pause'] as const) expect(m.latch[id].id).toBe(-1);
    }
  });

  it('a move finger dragged over every button never fires either', () => {
    const m = createModel(960, 411);
    const out = createInputState();
    expect(pointerDown(m, 4, 150, 200)).toBe('move');
    for (const id of ['pause', 'super', 'bomb'] as const) {
      const c = rectCentre(m.buttons[id]);
      pointerMove(m, 4, c.x, c.y);
      const s = pollModel(m, out);
      expect(s.bomb || s.superPressed || s.pause).toBe(false);
    }
  });

  it('a new finger on bomb while the aim finger sits over it fires exactly once', () => {
    const m = createModel(960, 411);
    const out = createInputState();
    const c = rectCentre(m.buttons.bomb);
    pointerDown(m, 1, 600, 200);
    pointerMove(m, 1, c.x, c.y);
    expect(pollModel(m, out).bomb).toBe(false);
    expect(pointerDown(m, 2, c.x, c.y)).toBe('bomb');
    expect(pollModel(m, out).bomb).toBe(true);
    expect(pollModel(m, out).bomb).toBe(false);
    pointerUp(m, 1); // the stick finger lifting does not release the bomb finger
    expect(m.latch.bomb.id).toBe(2);
  });
});
