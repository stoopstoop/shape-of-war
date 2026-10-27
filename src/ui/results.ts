// Results screen (docs/01 section 10): title, score, stars, par, best, level hash.
// Buttons: Next (success only), Retry, Menu.
import { button, createScreen, el, type Screen } from './dom';
import type { LevelResult } from './flow';
import { formatInt, starGlyphs } from './format';

export interface ResultsActions {
  next(): void;
  retry(): void;
  menu(): void;
}

/** Pure: the text lines shown for a result. */
export function resultLines(r: LevelResult): { title: string; score: string; stars: string; detail: string } {
  const title = r.mode === 'endless' ? 'Game over' : r.success ? `Level ${r.levelIndex} complete` : `Level ${r.levelIndex} failed`;
  const best = `Best ${formatInt(r.best)}${r.newBest ? '  New best' : ''}`;
  return {
    title,
    score: formatInt(r.score),
    stars: starGlyphs(r.stars),
    detail: `Par ${formatInt(r.par)}  ${best}\nLevel #${r.hash}`,
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
  const starsEl = el('div', 'sow-stars');
  const detail = el('div', 'sow-sub');
  const row = el('div', 'sow-row');
  const next = button('Next', actions.next);
  row.append(next, button('Retry', actions.retry), button('Menu', actions.menu));
  s.root.append(title, score, starsEl, detail, row);
  return {
    ...s,
    showResult(r) {
      const t = resultLines(r);
      title.textContent = t.title;
      score.textContent = t.score;
      starsEl.textContent = t.stars;
      detail.textContent = t.detail;
      next.style.display = r.success && r.mode === 'adventure' ? '' : 'none';
      s.show();
    },
  };
}
