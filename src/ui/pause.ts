// Pause screen (docs/01 section 10): Resume, Restart level, Settings, Quit to menu.
import { button, createScreen, el, type Screen } from './dom';

export interface PauseActions {
  resume(): void;
  restart(): void;
  settings(): void;
  quit(): void;
}

export function createPauseScreen(parent: HTMLElement, actions: PauseActions): Screen {
  const s = createScreen(parent);
  const row = el('div', 'sow-row');
  row.append(
    button('Resume', actions.resume),
    button('Restart', actions.restart),
    button('Settings', actions.settings),
    button('Quit', actions.quit),
  );
  s.root.append(el('div', 'sow-title', 'Paused'), row);
  return s;
}
