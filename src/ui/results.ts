// Results screen (docs/01 section 10): title, score, stars, par, best, level hash.
// Endless: score, high score badge, best and the endless seed (docs/01 section 2.2), no stars.
// Both modes: the Space physics level in effect when the run ended, omitted when Off (docs/11
// SPEC 3.6, one score table with the physics level on the results line).
// Buttons: Next (Adventure success only), Retry, Menu.
import type { SpaceLevelSetting } from '../core/settings';
import { button, createScreen, el, type Screen } from './dom';
import type { LevelResult } from './flow';
import { formatInt, starGlyphs } from './format';
import { SPACE_ROW_LABEL, spaceLabel } from './settings';

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

/** Pure: "Space physics: Medium", or '' when the level is off or unknown. */
export function physicsLine(level: SpaceLevelSetting | undefined): string {
  if (level === undefined || level === 'off') return '';
  return `${SPACE_ROW_LABEL}: ${spaceLabel(level)}`;
}

export interface ResultText {
  title: string;
  score: string;
  stars: string;
  detail: string;
  badge: string;
  /** Space physics line, '' when off. */
  physics: string;
}

/** Pure: the text lines shown for a result. */
export function resultLines(r: LevelResult): ResultText {
  const physics = physicsLine(r.space);
  if (r.mode === 'endless') {
    return {
      title: 'Game over',
      score: formatInt(r.score),
      stars: '',
      detail: `Best ${formatInt(r.best)}\nEndless seed ${r.seed ?? 0}`,
      badge: badgeText(r),
      physics,
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
    physics,
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
  const physics = el('div', 'sow-sub');
  physics.setAttribute('data-results', 'physics');
  const row = el('div', 'sow-row');
  const next = button('Next', actions.next);
  row.append(next, button('Retry', actions.retry), button('Menu', actions.menu));
  s.root.append(title, score, badge, starsEl, detail, physics, row);
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
      physics.textContent = t.physics;
      physics.style.display = t.physics === '' ? 'none' : '';
      next.style.display = r.success && r.mode === 'adventure' ? '' : 'none';
      s.show();
    },
  };
}
