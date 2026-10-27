// Main menu (docs/01 section 10): title "Shape of War", Continue (Adventure at the highest
// unlocked level), Level select, Endless, Settings.
import { button, createScreen, el, type Screen } from './dom';

export const GAME_TITLE = 'Shape of War';
export const SHOW_ENDLESS = true;

export interface MenuActions {
  adventure(): void;
  levels(): void;
  endless(): void;
  settings(): void;
}

export interface MenuScreen extends Screen {
  /** Subtitle under the buttons, for example "Level 3  Seed 42". */
  setInfo(text: string): void;
  /** Label on the Adventure button, for example "Continue  L3". */
  setContinue(text: string): void;
}

/** Pure: Adventure button label. */
export function continueLabel(unlocked: number): string {
  return unlocked > 1 ? `Continue  L${Math.floor(unlocked)}` : 'Adventure';
}

export function createMenuScreen(parent: HTMLElement, actions: MenuActions): MenuScreen {
  const s = createScreen(parent);
  const title = el('div', 'sow-title', GAME_TITLE);
  const row = el('div', 'sow-row');
  const adventure = button('Adventure', actions.adventure);
  const endless = button('Endless', actions.endless);
  endless.style.display = SHOW_ENDLESS ? '' : 'none';
  row.append(adventure, button('Level select', actions.levels), endless, button('Settings', actions.settings));
  const info = el('div', 'sow-sub', '');
  s.root.append(title, row, info);
  return {
    ...s,
    setInfo(text) {
      info.textContent = text;
    },
    setContinue(text) {
      adventure.textContent = text;
    },
  };
}
