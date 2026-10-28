// Music policy for the screen flow (SPEC 3.9 rule 6, docs/10 wave D). Music plays in play and never
// in menus: a level start starts it, quit and game over stop it. Pause, a hidden tab and a fold
// suspend it through the bus (src/audio/music/index.ts listens to game:pause and game:resume), so
// this module only decides the two cues that cannot come from the bus. Pure: main.ts feeds it the
// flow before and after each action and calls startMusic or stopMusic for the cue it returns.
import type { FlowState } from './flow';

export type MusicCue = 'start' | 'stop' | 'none';

/**
 * Pure: true while a run is live, so music may be running or suspended. That is the playing
 * screen, the pause screen, and the settings screen when it was opened from pause (the run is
 * still there behind it). Boot, menu, level select, results and settings from the menu are not.
 */
export function inPlay(s: FlowState): boolean {
  return s.screen === 'playing' || s.screen === 'paused' || (s.screen === 'settings' && s.settingsFrom === 'paused');
}

/**
 * Pure: what the music does when the flow goes from `prev` to `next`.
 * - 'start': a new level was built and is playing (start, Next, Retry, Restart). startMusic
 *   restarts from bar 0, so a Restart from pause needs no stop first.
 * - 'stop': a run ended or was left (game over, quit, leaving settings opened from pause to the menu).
 * - 'none': everything else, including pause, resume and opening settings from pause.
 */
export function musicCue(prev: FlowState, next: FlowState): MusicCue {
  if (next.run !== prev.run && next.screen === 'playing') return 'start';
  if (inPlay(prev) && !inPlay(next)) return 'stop';
  return 'none';
}
