// Main menu (docs/01 section 10, W2 cut): title "Shape of War", Adventure, Settings.
// Endless exists in the flow but its button stays hidden until W3.
import { button, createScreen, el, type Screen } from './dom';

export const GAME_TITLE = 'Shape of War';
/** W3 turns this on with the Endless mode. */
export const SHOW_ENDLESS = false;

export interface MenuActions {
  adventure(): void;
  endless(): void;
  settings(): void;
}

export interface MenuScreen extends Screen {
  /** Subtitle under the buttons, for example "Level 3  Seed 42". */
  setInfo(text: string): void;
}

export function createMenuScreen(parent: HTMLElement, actions: MenuActions): MenuScreen {
  const s = createScreen(parent);
  const title = el('div', 'sow-title', GAME_TITLE);
  const row = el('div', 'sow-row');
  const endless = button('Endless', actions.endless);
  endless.style.display = SHOW_ENDLESS ? '' : 'none';
  row.append(button('Adventure', actions.adventure), endless, button('Settings', actions.settings));
  const info = el('div', 'sow-sub', '');
  s.root.append(title, row, info);
  return {
    ...s,
    setInfo(text) {
      info.textContent = text;
    },
  };
}
