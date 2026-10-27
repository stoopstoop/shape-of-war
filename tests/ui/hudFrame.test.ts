// B6 regression: every HUD element (score, multiplier, objective, par, lives, bombs, pause, super
// ring and label, bomb button) lies outside the arena on the cover (21:9) and main (10:9) screens.
import { describe, expect, it } from 'vitest';
import { layoutButtons } from '../../src/input/buttons';
import type { Insets, Rect } from '../../src/input/types';
import type { SuperKind } from '../../src/levelgen/leveldef';
import { superHint, superLabel } from '../../src/ui/hud';
import { hudFrame, hudRects, overlayPadding, overlaps, type HudFrame } from '../../src/ui/hudFrame';

const ZERO: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

const COVER_VIEWS: Array<[number, number]> = [
  [960, 411],
  [904, 388],
  [1176, 504],
  [840, 360],
];
const MAIN_VIEWS: Array<[number, number]> = [
  [832, 750],
  [794, 716],
  [1092, 984],
  [884, 800],
];
const INSETS: Insets[] = [ZERO, { top: 0, right: 0, bottom: 0, left: 32 }, { top: 24, right: 0, bottom: 16, left: 0 }];
/** Generator bounds: height 700 to 1100, width up to 1800, aspect 1.0 to 1.8; Endless 1600 x 1000. */
const ARENAS: Array<[number, number]> = [
  [700, 700],
  [1100, 1100],
  [1260, 700],
  [1800, 1000],
  [1600, 1000],
];

function inside(inner: Rect, outer: Rect, eps = 1e-6): boolean {
  return (
    inner.x >= outer.x - eps &&
    inner.y >= outer.y - eps &&
    inner.x + inner.w <= outer.x + outer.w + eps &&
    inner.y + inner.h <= outer.y + outer.h + eps
  );
}

function frames(views: Array<[number, number]>): HudFrame[] {
  const out: HudFrame[] = [];
  for (const [w, h] of views) for (const ins of INSETS) for (const [aw, ah] of ARENAS) out.push(hudFrame(w, h, ins, aw, ah));
  return out;
}

function label(f: HudFrame): string {
  return `${f.cssW}x${f.cssH} ${f.arrangement} arena ${Math.round(f.arena.w)}x${Math.round(f.arena.h)}`;
}

describe('B6 HUD frame keeps the HUD off the arena', () => {
  for (const [name, views] of [
    ['cover 21:9', COVER_VIEWS],
    ['main 10:9', MAIN_VIEWS],
  ] as const) {
    it(`${name}: no HUD element overlaps the arena`, () => {
      for (const f of frames([...views])) {
        for (const r of hudRects(f)) {
          expect(overlaps(r, f.arena), `${label(f)} rect ${JSON.stringify(r)}`).toBe(false);
        }
      }
    });

    it(`${name}: arena sits in the play rect and HUD elements stay on screen`, () => {
      const screen = (f: HudFrame): Rect => ({ x: 0, y: 0, w: f.cssW, h: f.cssH });
      for (const f of frames([...views])) {
        expect(inside(f.arena, f.playRect), label(f)).toBe(true);
        for (const r of hudRects(f)) expect(inside(r, screen(f)), `${label(f)} ${JSON.stringify(r)}`).toBe(true);
      }
    });
  }

  it('cover uses side columns and the super ring sits in the right column, not bottom centre', () => {
    const f = hudFrame(960, 411, ZERO, 1800, 1000);
    expect(f.cls).toBe('cover');
    expect(f.arrangement).toBe('sides');
    expect(f.buttons.super.x).toBeGreaterThanOrEqual(f.arena.x + f.arena.w);
    expect(f.boxes.superLabel.x).toBeGreaterThanOrEqual(f.arena.x + f.arena.w);
    expect(f.boxes.score.x + f.boxes.score.w).toBeLessThanOrEqual(f.arena.x);
  });

  it('main picks the arrangement with the larger arena', () => {
    expect(hudFrame(832, 750, ZERO, 1800, 1000).arrangement).toBe('topBottom');
    expect(hudFrame(832, 750, ZERO, 1100, 1100).arrangement).toBe('topRight');
  });

  it('button rects match what Thumbs lays out from the frame insets', () => {
    for (const f of [...frames(COVER_VIEWS), ...frames(MAIN_VIEWS)]) {
      expect(layoutButtons(f.cssW, f.cssH, f.buttonInsets)).toEqual(f.buttons);
    }
  });

  it('shrinks the play rect rather than shrinking the HUD: arena still fills most of the screen', () => {
    for (const f of frames(COVER_VIEWS)) expect(f.arena.h / f.cssH, label(f)).toBeGreaterThan(0.5);
    for (const f of frames(MAIN_VIEWS)) expect(Math.max(f.arena.w / f.cssW, f.arena.h / f.cssH), label(f)).toBeGreaterThan(0.55);
  });

  it('fit matches the arena rect and is centred in the play rect', () => {
    const f = hudFrame(960, 411, { top: 0, right: 0, bottom: 0, left: 32 }, 1600, 1000);
    expect(f.fit.x).toBeCloseTo(f.playRect.x + f.playRect.w / 2);
    expect(f.fit.y).toBeCloseTo(f.playRect.y + f.playRect.h / 2);
    expect(f.arena.w).toBeCloseTo(1600 * f.fit.scale);
  });
});

describe('pause, results and intro overlays stay clear of the HUD rings', () => {
  function contentOf(f: HudFrame): Rect {
    const p = overlayPadding(f);
    return { x: p.left, y: p.top, w: f.cssW - p.left - p.right, h: f.cssH - p.top - p.bottom };
  }

  it('overlay content never overlaps the rings, pause or any HUD text on either screen', () => {
    for (const f of [...frames(COVER_VIEWS), ...frames(MAIN_VIEWS)]) {
      const c = contentOf(f);
      for (const r of hudRects(f)) expect(overlaps(c, r), `${label(f)} ${JSON.stringify(r)}`).toBe(false);
      expect(c.w).toBeGreaterThan(300);
      expect(c.h).toBeGreaterThan(300);
    }
  });

  it('padding includes the safe area insets', () => {
    const f = hudFrame(960, 411, { top: 0, right: 0, bottom: 0, left: 32 }, 1600, 1000);
    expect(overlayPadding(f).left).toBeGreaterThanOrEqual(32);
  });
});

describe('B6 super ring label', () => {
  const kinds: SuperKind[] = ['homing', 'detonate', 'turbo'];

  it('names the super kind', () => {
    expect(superLabel('homing')).toBe('SUPER: HOMING');
    expect(superLabel('detonate')).toBe('SUPER: DETONATE');
    expect(superLabel('turbo')).toBe('SUPER: TURBO');
  });

  it('hints that it charges with geoms, and never mentions a sidekick or upgrade', () => {
    expect(superHint(0)).toBe('charges with geoms');
    expect(superHint(0.5)).toBe('charges with geoms');
    for (const k of kinds) {
      for (const c of [0, 0.5, 1]) {
        const text = `${superLabel(k)} ${superHint(c)}`.toLowerCase();
        expect(text).not.toMatch(/sidekick|upgrade|drone/);
      }
    }
  });
});
