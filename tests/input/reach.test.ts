// v2.1 button reach: the bomb and super hit areas sit a short thumb roll down and right of the aim
// rest zone on both Fold screens, and the aim ring at full deflection from any anchor in the zone
// never covers them.
import { describe, expect, it } from 'vitest';
import { BOMB_HIT, hitButton, layoutButtons, PAUSE_HIT, rectCentre, STACK_RIGHT, stackCentreX, SUPER_HIT } from '../../src/input/buttons';
import { EDGE_GUARD, halfFor, inEdgeGuard } from '../../src/input/model';
import { aimRestZone, distToRect, REACH_MAX, REACH_MIN, reachGap, REST_H, REST_W, ringClearance } from '../../src/input/reach';
import { STICK_RADIUS } from '../../src/input/stick';
import type { ButtonRects, Insets, Rect } from '../../src/input/types';
import { hudFrame, overlaps } from '../../src/ui/hudFrame';

/** Estimated Z Fold 7 CSS viewports, landscape. */
const FOLD = [
  { name: 'main', w: 832, h: 750 },
  { name: 'cover', w: 960, h: 411 },
] as const;
const ZERO: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const INSETS: Insets[] = [
  ZERO,
  { top: 0, right: 0, bottom: 0, left: 32 },
  { top: 24, right: 0, bottom: 16, left: 0 },
  { top: 0, right: 32, bottom: 0, left: 0 },
];
/** Generator bounds plus Endless: both main arrangements (right column and bottom band) occur. */
const ARENAS: Array<[number, number]> = [
  [700, 700],
  [1100, 1100],
  [1260, 700],
  [1800, 1000],
  [1600, 1000],
];

interface Case {
  label: string;
  w: number;
  h: number;
  insets: Insets;
  buttons: ButtonRects;
  play: Rect | null;
  arrangement: string;
}

function insLabel(i: Insets): string {
  return `insets ${i.top},${i.right},${i.bottom},${i.left}`;
}

/** Every Fold layout the game can show: the HUD frame cases plus the bare safe area layout. */
function cases(): Case[] {
  const out: Case[] = [];
  for (const vp of FOLD) {
    for (const ins of INSETS) {
      out.push({
        label: `${vp.name} bare ${insLabel(ins)}`,
        w: vp.w,
        h: vp.h,
        insets: ins,
        buttons: layoutButtons(vp.w, vp.h, ins),
        play: null,
        arrangement: 'bare',
      });
      for (const [aw, ah] of ARENAS) {
        const f = hudFrame(vp.w, vp.h, ins, aw, ah);
        out.push({
          label: `${vp.name} ${f.arrangement} ${aw}x${ah} ${insLabel(ins)}`,
          w: vp.w,
          h: vp.h,
          insets: ins,
          buttons: f.buttons,
          play: f.playRect,
          arrangement: f.arrangement,
        });
      }
    }
  }
  return out;
}

/** Anchors on a 10 px grid over the zone, edges and corners included. */
function anchors(z: Rect): Array<[number, number]> {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = z.x; x < z.x + z.w; x += 10) xs.push(x);
  for (let y = z.y; y < z.y + z.h; y += 10) ys.push(y);
  xs.push(z.x + z.w);
  ys.push(z.y + z.h);
  const out: Array<[number, number]> = [];
  for (const x of xs) for (const y of ys) out.push([x, y]);
  return out;
}

const ALL = cases();

describe('aim rest zone', () => {
  it('covers both main arrangements and the cover columns', () => {
    const seen = new Set(ALL.map((c) => c.arrangement));
    for (const a of ['sides', 'topRight', 'topBottom', 'bare']) expect(seen.has(a), a).toBe(true);
  });

  it('is a real region in the aim half, clear of the edge guard and every button, on both screens', () => {
    for (const c of ALL) {
      const z = aimRestZone(c.w, c.h, c.insets);
      expect(z.w, c.label).toBe(REST_W);
      expect(z.h, c.label).toBe(REST_H);
      for (const [x, y] of anchors(z)) {
        expect(halfFor(c.w, x), c.label).toBe('aim');
        expect(inEdgeGuard(c.w, x), c.label).toBe(false);
        expect(hitButton(c.buttons, x, y), `${c.label} at ${x},${y}`).toBeNull();
      }
      expect(z.x + z.w, c.label).toBeLessThan(c.w - c.insets.right - EDGE_GUARD);
    }
  });

  it('lies over the arena play rect on the cover and in the main right column layout', () => {
    for (const c of ALL) {
      if (c.play === null || c.arrangement === 'topBottom') continue;
      const z = aimRestZone(c.w, c.h, c.insets);
      const p = c.play;
      const inside = z.x >= p.x && z.y >= p.y && z.x + z.w <= p.x + p.w && z.y + z.h <= p.y + p.h;
      expect(inside, c.label).toBe(true);
    }
  });

  it('distToRect is zero inside and euclidean outside', () => {
    const r = { x: 0, y: 0, w: 10, h: 10 };
    expect(distToRect(r, 5, 5)).toBe(0);
    expect(distToRect(r, 13, 14)).toBe(5);
    expect(distToRect(r, -3, 5)).toBe(3);
  });
});

describe('bomb and super reach from the rest zone', () => {
  it(`roll from the zone to each hit circle edge is ${REACH_MIN} to ${REACH_MAX} CSS px on both screens`, () => {
    for (const c of ALL) {
      const z = aimRestZone(c.w, c.h, c.insets);
      for (const id of ['bomb', 'super'] as const) {
        const g = reachGap(z, c.buttons[id]);
        expect(g, `${c.label} ${id}`).toBeGreaterThanOrEqual(REACH_MIN);
        expect(g, `${c.label} ${id}`).toBeLessThanOrEqual(REACH_MAX);
      }
    }
  });

  it('the aim ring at full deflection from any anchor in the zone never overlaps bomb or super', () => {
    for (const c of ALL) {
      const z = aimRestZone(c.w, c.h, c.insets);
      for (const id of ['bomb', 'super'] as const) {
        const r = c.buttons[id];
        const p = rectCentre(r);
        expect(ringClearance(z, r), `${c.label} ${id}`).toBeGreaterThanOrEqual(0);
        for (const [ax, ay] of anchors(z)) {
          // Ring of radius STICK_RADIUS at the anchor versus the hit circle: centres far enough apart.
          const d = Math.hypot(p.x - ax, p.y - ay);
          expect(d, `${c.label} ${id} anchor ${ax},${ay}`).toBeGreaterThanOrEqual(STICK_RADIUS + r.w / 2);
        }
      }
    }
  });

  it('both buttons sit towards the bottom right corner from the zone', () => {
    for (const c of ALL) {
      const z = aimRestZone(c.w, c.h, c.insets);
      for (const id of ['bomb', 'super'] as const) {
        const p = rectCentre(c.buttons[id]);
        expect(p.x, `${c.label} ${id}`).toBeGreaterThan(z.x + z.w);
        expect(p.y, `${c.label} ${id}`).toBeGreaterThanOrEqual(z.y + z.h);
      }
      expect(rectCentre(c.buttons.bomb).y, c.label).toBeGreaterThan(rectCentre(c.buttons.super).y);
    }
  });

  it('no button overlaps the arena play rect, and bomb and super stay inside the safe area', () => {
    for (const c of ALL) {
      if (c.play !== null) {
        for (const r of [c.buttons.bomb, c.buttons.super, c.buttons.pause]) expect(overlaps(r, c.play), c.label).toBe(false);
      }
      for (const r of [c.buttons.bomb, c.buttons.super]) {
        expect(r.x, c.label).toBeGreaterThanOrEqual(c.insets.left);
        expect(r.x + r.w, c.label).toBeLessThanOrEqual(c.w - c.insets.right);
        expect(r.y + r.h, c.label).toBeLessThanOrEqual(c.h - c.insets.bottom);
      }
    }
  });

  it('hit sizes stay at or above the 44 px minimum (SPEC 5)', () => {
    for (const c of ALL) {
      for (const r of [c.buttons.bomb, c.buttons.super, c.buttons.pause]) {
        expect(r.w, c.label).toBeGreaterThanOrEqual(44);
        expect(r.h, c.label).toBeGreaterThanOrEqual(44);
      }
      expect(c.buttons.bomb.w).toBe(BOMB_HIT);
      expect(c.buttons.super.w).toBe(SUPER_HIT);
      expect(c.buttons.pause.w).toBe(PAUSE_HIT);
    }
  });

  it('the main screen bottom band layout no longer puts the bomb at bottom centre', () => {
    const f = hudFrame(832, 750, ZERO, 1800, 1000);
    expect(f.arrangement).toBe('topBottom');
    expect(rectCentre(f.buttons.bomb)).toEqual({ x: 832 - STACK_RIGHT, y: 750 - 48 });
    expect(rectCentre(f.buttons.super)).toEqual({ x: 832 - STACK_RIGHT, y: 750 - 120 });
  });
});

describe('stackCentreX', () => {
  it('sits STACK_RIGHT in from the right edge of a wide button area', () => {
    expect(stackCentreX(832, ZERO)).toBe(832 - STACK_RIGHT);
    expect(stackCentreX(960, { top: 0, right: 40, bottom: 0, left: 0 })).toBe(920 - STACK_RIGHT);
  });

  it('clamps inside a column narrower than the stack offset needs', () => {
    // Main right column: 92 px wide, the bomb hit circle (88) must stay inside it.
    expect(stackCentreX(832, { top: 0, right: 0, bottom: 0, left: 740 })).toBe(784);
    // Cover right column: 112 px wide, no clamp needed.
    expect(stackCentreX(960, { top: 0, right: 0, bottom: 0, left: 848 })).toBe(904);
  });
});
