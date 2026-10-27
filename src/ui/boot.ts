// Boot screen (B7, docs/01 section 10): title and "Tap to start". The tap is the user activation
// main.ts uses for fullscreen, the landscape lock and the AudioContext resume, so it fires on
// pointerup (docs/04 section 6), anywhere on the screen.
import { createScreen, el, type Screen } from './dom';
import { GAME_TITLE } from './menu';

export const TAP_TO_START = 'Tap to start';

export function createBootScreen(parent: HTMLElement, onTap: () => void): Screen {
  const s = createScreen(parent);
  s.root.style.background = 'rgba(2, 4, 12, 0.85)';
  s.root.append(el('div', 'sow-title', GAME_TITLE), el('div', 'sow-sub', TAP_TO_START));
  let armed = -1;
  s.root.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    armed = e.pointerId;
  });
  s.root.addEventListener('pointerup', (e) => {
    e.preventDefault();
    if (armed !== e.pointerId) return;
    armed = -1;
    onTap();
  });
  s.root.addEventListener('pointercancel', () => {
    armed = -1;
  });
  return s;
}
