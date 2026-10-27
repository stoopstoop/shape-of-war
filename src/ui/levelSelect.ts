// Level select (docs/01 section 10): grid of unlocked levels with best stars. Pages of 12, newest
// page first, because page scrolling is blocked by the document touchmove guard.
import type { AdventureScores } from '../core/settings';
import { button, createScreen, el, type Screen } from './dom';
import { formatInt, starGlyphs } from './format';

export const LEVELS_PER_PAGE = 12;

export interface LevelEntry {
  index: number;
  stars: 0 | 1 | 2 | 3;
  best: number;
}

export interface LevelPage {
  entries: LevelEntry[];
  /** 0 based, clamped. */
  page: number;
  pages: number;
}

/** Pure: page count for `unlocked` levels. */
export function pageCount(unlocked: number, perPage = LEVELS_PER_PAGE): number {
  return Math.max(1, Math.ceil(Math.max(1, Math.floor(unlocked)) / perPage));
}

/** Pure: levels 1..unlocked on page `page`, each with its stored best score and stars. */
export function levelPage(unlocked: number, scores: Readonly<AdventureScores>, page: number, perPage = LEVELS_PER_PAGE): LevelPage {
  const top = Math.max(1, Math.floor(unlocked));
  const pages = pageCount(top, perPage);
  const p = Math.min(pages - 1, Math.max(0, Math.floor(page)));
  const entries: LevelEntry[] = [];
  for (let i = p * perPage + 1; i <= Math.min(top, (p + 1) * perPage); i++) {
    const rec = scores[String(i)];
    entries.push({ index: i, stars: rec?.stars ?? 0, best: rec?.best ?? 0 });
  }
  return { entries, page: p, pages };
}

/** Pure: two line label on a level button. */
export function levelButtonLabel(e: LevelEntry): string {
  return `${e.index}\n${starGlyphs(e.stars)}`;
}

export interface LevelSelectActions {
  play(index: number): void;
  back(): void;
}

export interface LevelSelectScreen extends Screen {
  open(unlocked: number, scores: Readonly<AdventureScores>): void;
}

export function createLevelSelect(parent: HTMLElement, a: LevelSelectActions): LevelSelectScreen {
  const s = createScreen(parent);
  const title = el('div', 'sow-title', 'Level select');
  title.style.fontSize = 'clamp(22px, 5vmin, 40px)';
  const grid = el('div', 'sow-grid');
  const info = el('div', 'sow-sub', '');
  const row = el('div', 'sow-row');
  let unlocked = 1;
  let scores: Readonly<AdventureScores> = {};
  let page = 0;
  const prev = button('Prev', () => paint(page - 1));
  const next = button('Next', () => paint(page + 1));
  row.append(prev, next, button('Back', a.back));
  s.root.append(title, grid, info, row);

  function paint(p: number): void {
    const lp = levelPage(unlocked, scores, p);
    page = lp.page;
    grid.replaceChildren(
      ...lp.entries.map((e) => {
        const b = button(levelButtonLabel(e), () => a.play(e.index));
        if (e.best > 0) b.title = `Best ${formatInt(e.best)}`;
        return b;
      }),
    );
    info.textContent = `Page ${lp.page + 1} of ${lp.pages}`;
    prev.style.visibility = lp.page > 0 ? 'visible' : 'hidden';
    next.style.visibility = lp.page < lp.pages - 1 ? 'visible' : 'hidden';
  }

  return {
    ...s,
    open(u, sc) {
      unlocked = u;
      scores = sc;
      paint(pageCount(u) - 1);
      s.show();
    },
  };
}
