// Results screen (docs/01 section 10): title, score, stars, par, best, level hash.
// Endless: score, high score badge, best and the endless seed (docs/01 section 2.2), no stars.
// Buttons: Next (Adventure success only), Retry, Menu.
import { button, createScreen, el, type Screen } from './dom';
import type { LevelResult } from './flow';
import { formatInt, starGlyphs } from './format';

export interface ResultsActions {
  next(): void;
  retry(): void;
  menu(): void;
}

/** Pure: Endless badge text for a top 10 rank (1 based, 0 when outside the table). */
export function badgeText(r: LevelResult): string {
  if (r.mode !== 'endless') return '';
  const rank = r.rank ?? 0;
  if (rank === 1) return 'New high score';
  if (rank > 1) return `Top 10: #${rank}`;
  return '';
}

/** Pure: the text lines shown for a result. */
export function resultLines(r: LevelResult): { title: string; score: string; stars: string; detail: string; badge: string } {
  if (r.mode === 'endless') {
    return {
      title: 'Game over',
      score: formatInt(r.score),
      stars: '',
      detail: `Best ${formatInt(r.best)}\nEndless seed ${r.seed ?? 0}`,
      badge: badgeText(r),
    };
  }
  const title = r.success ? `Level ${r.levelIndex} complete` : `Level ${r.levelIndex} failed`;
  const best = `Best ${formatInt(r.best)}${r.newBest ? '  New best' : ''}`;
  return {
    title,
    score: formatInt(r.score),
    stars: starGlyphs(r.stars),
    detail: `Par ${formatInt(r.par)}  ${best}\nLevel #${r.hash}`,
    badge: '',
  };
}

export interface ResultsScreen extends Screen {
  showResult(r: LevelResult): void;
}

export function createResultsScreen(parent: HTMLElement, actions: ResultsActions): ResultsScreen {
  const s = createScreen(parent);
  const title = el('div', 'sow-title');
  const score = el('div', 'sow-title');
  score.style.fontSize = 'clamp(24px, 6vmin, 52px)';
  const badge = el('div', 'sow-badge');
  const starsEl = el('div', 'sow-stars');
  const detail = el('div', 'sow-sub');
  const row = el('div', 'sow-row');
  const next = button('Next', actions.next);
  row.append(next, button('Retry', actions.retry), button('Menu', actions.menu));
  s.root.append(title, score, badge, starsEl, detail, row);
  return {
    ...s,
    showResult(r) {
      const t = resultLines(r);
      title.textContent = t.title;
      score.textContent = t.score;
      badge.textContent = t.badge;
      badge.style.display = t.badge === '' ? 'none' : '';
      starsEl.textContent = t.stars;
      starsEl.style.display = t.stars === '' ? 'none' : '';
      detail.textContent = t.detail;
      next.style.display = r.success && r.mode === 'adventure' ? '' : 'none';
      s.show();
    },
  };
}
