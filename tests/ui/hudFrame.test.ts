// B6 regression: every HUD element (score, multiplier, objective, par, lives, bombs, pause, super
// ring and label, bomb button) lies outside the arena on the cover (21:9) and main (10:9) screens.
import { describe, expect, it } from 'vitest';
import { SHIP_SPEED } from '../../src/game/ship';
import { layoutButtons } from '../../src/input/buttons';
import type { Insets, Rect } from '../../src/input/types';
import { generateLevel } from '../../src/levelgen/generator';
import type { SuperKind } from '../../src/levelgen/leveldef';
import { fitArena } from '../../src/render/layout';
import { playRect, superHint, superLabel } from '../../src/ui/hud';
import { hudFrame, hudRects, MAIN_RIGHT, mainBottom, mainTop, overlayPadding, overlaps, type HudFrame } from '../../src/ui/hudFrame';

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

    it(`${name}: no HUD element overlaps the play rect`, () => {
      for (const f of frames([...views])) {
        for (const r of hudRects(f)) {
          expect(overlaps(r, f.playRect), `${label(f)} rect ${JSON.stringify(r)}`).toBe(false);
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

describe('B9 main screen arena scale: on-screen ship speed', () => {
  // Estimated Fold 7 CSS viewports (DPR 2.625) and the seed Thumbs used for the B9 table.
  const MAIN = { w: 832, h: 750 };
  const COVER = { w: 960, h: 411 };
  const SEED = 12345;
  const LEVELS = [1, 6, 20] as const;
  /** Main screen px/s at 61450aa (B6 fixed bands), measured by Thumbs in run 0122. */
  const AT_B6: Record<(typeof LEVELS)[number], number> = { 1: 297, 6: 266, 20: 207 };

  interface Row {
    level: number;
    arena: string;
    preB6Main: number;
    main: number;
    cover: number;
    arrangement: string;
  }

  function pxPerSec(scale: number): number {
    return SHIP_SPEED * scale;
  }

  function row(level: number): Row {
    const { width: aw, height: ah } = generateLevel(SEED, level).arena;
    const m = hudFrame(MAIN.w, MAIN.h, ZERO, aw, ah);
    const c = hudFrame(COVER.w, COVER.h, ZERO, aw, ah);
    // Pre-B6: the legacy docs/01 top band play rect, buttons drawn over the arena.
    const pre = fitArena(aw, ah, playRect(MAIN.w, MAIN.h, ZERO, 'main'));
    return {
      level,
      arena: `${aw}x${ah}`,
      preB6Main: pxPerSec(pre.scale),
      main: pxPerSec(m.fit.scale),
      cover: pxPerSec(c.fit.scale),
      arrangement: m.arrangement,
    };
  }

  const rows = LEVELS.map(row);

  it('prints the table and the pre-B6 reference matches the Thumbs measurement', () => {
    console.log(
      ['level arena preB6 B6 main cover main/pre main/cover arrangement']
        .concat(
          rows.map((r) =>
            [
              `L${r.level}`,
              r.arena,
              r.preB6Main.toFixed(0),
              AT_B6[r.level as (typeof LEVELS)[number]],
              r.main.toFixed(1),
              r.cover.toFixed(1),
              `${((100 * r.main) / r.preB6Main).toFixed(1)}%`,
              `${((100 * r.main) / r.cover).toFixed(1)}%`,
              r.arrangement,
            ].join(' '),
          ),
        )
        .join('\n'),
    );
    expect(rows.map((r) => Math.round(r.preB6Main))).toEqual([349, 311, 224]);
  });

  it('main is never slower than cover by more than 5 percent, on every Adventure level 1 to 30', () => {
    for (let level = 1; level <= 30; level++) {
      const r = row(level);
      expect(r.main, `L${level} ${r.arena}`).toBeGreaterThanOrEqual(0.95 * r.cover);
    }
  });

  it('main is faster than at B6 on levels 1, 6 and 20', () => {
    for (const r of rows) expect(r.main, `L${r.level}`).toBeGreaterThan(AT_B6[r.level as (typeof LEVELS)[number]] + 5);
  });

  it('level 20 main is within 5 percent of pre-B6; levels 1 and 6 reach the best the HUD allows (88 percent or more)', () => {
    const [l1, l6, l20] = rows;
    expect(l20?.main ?? 0).toBeGreaterThanOrEqual(0.95 * (l20?.preB6Main ?? Infinity));
    expect(l1?.main ?? 0).toBeGreaterThanOrEqual(0.88 * (l1?.preB6Main ?? Infinity));
    expect(l6?.main ?? 0).toBeGreaterThanOrEqual(0.88 * (l6?.preB6Main ?? Infinity));
  });

  it('why 95 percent is out of reach on levels 1 and 6: no HUD-clear rect with the stacked buttons gets there', () => {
    // The arena is width limited on main, so any HUD element whose x range meets the arena must
    // sit above or below it. The super-over-bomb stack is 88 px wide, so it is either a column
    // (arena width W - MAIN_RIGHT) or a bottom band (arena height H - top band - stack band).
    const buttons = layoutButtons(MAIN.w, MAIN.h, ZERO);
    const columnRect = { x: 0, y: 0, w: MAIN.w - MAIN_RIGHT, h: MAIN.h };
    const bandRect = { x: 0, y: 0, w: MAIN.w, h: MAIN.h - mainTop(buttons, ZERO) - mainBottom(buttons, MAIN.h, ZERO) };
    expect(mainBottom(buttons, MAIN.h, ZERO)).toBe(158);
    expect(mainTop(buttons, ZERO)).toBe(60);
    expect(MAIN_RIGHT).toBe(92);
    for (const r of rows.slice(0, 2)) {
      const [aw, ah] = r.arena.split('x').map(Number) as [number, number];
      const best = Math.max(fitArena(aw, ah, columnRect).scale, fitArena(aw, ah, bandRect).scale);
      expect(pxPerSec(best), `L${r.level}`).toBeLessThan(0.95 * r.preB6Main);
      expect(r.main).toBeCloseTo(pxPerSec(best), 6);
    }
  });

  it('main bands are measured, not fixed: top band 60, bottom band 158, column 92 at zero insets', () => {
    const tb = hudFrame(MAIN.w, MAIN.h, ZERO, 1800, 1000);
    expect(tb.arrangement).toBe('topBottom');
    expect(tb.playRect).toEqual({ x: 0, y: 60, w: 832, h: 750 - 60 - 158 });
    const tr = hudFrame(MAIN.w, MAIN.h, ZERO, 960, 720);
    expect(tr.arrangement).toBe('topRight');
    expect(tr.playRect).toEqual({ x: 0, y: 60, w: 832 - 92, h: 690 });
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
