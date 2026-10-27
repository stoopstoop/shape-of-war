// Screen flow state machine (docs/01 section 10). Pure: main.ts feeds it actions translated from
// bus events and DOM taps, then renders whatever screen the state names.

// 'boot' is the "Tap to start" screen (B7); its tap is also the fullscreen and audio unlock
// gesture. The level intro card and the Endless "Ready" text run inside 'playing' with the sim
// held by the intro gate in ui/intro.ts.
export type ScreenId = 'boot' | 'menu' | 'levels' | 'playing' | 'paused' | 'results' | 'settings';
export type Mode = 'adventure' | 'endless';

export interface LevelResult {
  mode: Mode;
  levelIndex: number;
  score: number;
  stars: 0 | 1 | 2 | 3;
  success: boolean;
  par: number;
  best: number;
  newBest: boolean;
  hash: string;
  /** Endless: 1 based rank in the top 10, 0 when outside it. */
  rank?: number;
  /** Endless: the endless seed, shown so a run can be reproduced. */
  seed?: number;
}

export interface FlowState {
  readonly screen: ScreenId;
  readonly mode: Mode;
  readonly levelIndex: number;
  /** Increments whenever a level must be built fresh: start, next, retry, restart. */
  readonly run: number;
  /** Screen the settings screen returns to. */
  readonly settingsFrom: 'menu' | 'paused';
  readonly result: LevelResult | null;
}

export type FlowAction =
  | { type: 'tapStart' }
  | { type: 'start'; mode: Mode; levelIndex: number }
  | { type: 'pause' }
  | { type: 'hidden' }
  | { type: 'resume' }
  | { type: 'restart' }
  | { type: 'quit' }
  | { type: 'over'; result: LevelResult }
  | { type: 'next' }
  | { type: 'retry' }
  | { type: 'menu' }
  | { type: 'openSettings' }
  | { type: 'openLevels' }
  | { type: 'closeLevels' }
  | { type: 'closeSettings' };

export function initialFlow(levelIndex = 1): FlowState {
  return { screen: 'menu', mode: 'adventure', levelIndex, run: 0, settingsFrom: 'menu', result: null };
}

/** The flow at app launch: the boot screen, which goes to the menu on its tap. */
export function bootFlow(levelIndex = 1): FlowState {
  return { ...initialFlow(levelIndex), screen: 'boot' };
}

/** Pure: true while the simulation should step. */
export function simRunning(s: FlowState): boolean {
  return s.screen === 'playing';
}

/** Pure: the level a game:start, Next or Retry should build. */
function play(s: FlowState, mode: Mode, levelIndex: number): FlowState {
  return { ...s, screen: 'playing', mode, levelIndex, run: s.run + 1, result: null };
}

/**
 * Pure reducer. An action that does not apply to the current screen returns the same object,
 * so callers can skip work with a reference check (a second game:over is ignored, for example).
 */
export function reduceFlow(s: FlowState, a: FlowAction): FlowState {
  switch (a.type) {
    case 'tapStart':
      return s.screen === 'boot' ? { ...s, screen: 'menu' } : s;
    case 'start':
      return s.screen === 'menu' || s.screen === 'levels' ? play(s, a.mode, Math.max(1, Math.floor(a.levelIndex))) : s;
    case 'pause':
    case 'hidden':
      return s.screen === 'playing' ? { ...s, screen: 'paused' } : s;
    case 'resume':
      return s.screen === 'paused' ? { ...s, screen: 'playing' } : s;
    case 'restart':
      return s.screen === 'paused' ? play(s, s.mode, s.levelIndex) : s;
    case 'quit':
      return s.screen === 'paused' || s.screen === 'playing' ? { ...s, screen: 'menu', result: null } : s;
    case 'over':
      return s.screen === 'playing' || s.screen === 'paused' ? { ...s, screen: 'results', result: a.result } : s;
    case 'next':
      return s.screen === 'results' && s.result !== null && s.result.success && s.mode === 'adventure'
        ? play(s, s.mode, s.levelIndex + 1)
        : s;
    case 'retry':
      return s.screen === 'results' ? play(s, s.mode, s.levelIndex) : s;
    case 'menu':
      return s.screen === 'results' ? { ...s, screen: 'menu', result: null } : s;
    case 'openSettings':
      return s.screen === 'menu' || s.screen === 'paused' ? { ...s, screen: 'settings', settingsFrom: s.screen } : s;
    case 'openLevels':
      return s.screen === 'menu' ? { ...s, screen: 'levels' } : s;
    case 'closeLevels':
      return s.screen === 'levels' ? { ...s, screen: 'menu' } : s;
    case 'closeSettings':
      return s.screen === 'settings' ? { ...s, screen: s.settingsFrom } : s;
  }
}
