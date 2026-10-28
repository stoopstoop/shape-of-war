// Music follows the screen flow (SPEC 3.9 rule 6, docs/10 wave D): a level start starts it, quit and
// game over stop it, and nothing in a menu ever starts it. The rig below does what main.ts's
// dispatch does with the cue (reduce, skip a no-op, ask musicCue, call start or stop), against a
// fake music port, so the whole flow is exercised without a browser.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  bootFlow,
  initialFlow,
  reduceFlow,
  simRunning,
  type FlowAction,
  type FlowState,
  type LevelResult,
  type Mode,
} from '../../src/ui/flow';
import { inPlay, musicCue, type MusicCue } from '../../src/ui/musicFlow';

function result(success: boolean, mode: Mode = 'adventure'): LevelResult {
  return { mode, levelIndex: 1, score: 100, stars: 0, success, par: 1000, best: 100, newBest: false, hash: 'h' };
}

/** Every action the reducer knows, with both outcomes of a game over. */
const ACTIONS: readonly FlowAction[] = [
  { type: 'tapStart' },
  { type: 'start', mode: 'adventure', levelIndex: 1 },
  { type: 'start', mode: 'endless', levelIndex: 1 },
  { type: 'pause' },
  { type: 'hidden' },
  { type: 'resume' },
  { type: 'restart' },
  { type: 'quit' },
  { type: 'over', result: result(true) },
  { type: 'over', result: result(false) },
  { type: 'next' },
  { type: 'retry' },
  { type: 'menu' },
  { type: 'openSettings' },
  { type: 'openLevels' },
  { type: 'closeLevels' },
  { type: 'closeSettings' },
];

interface Rig {
  flow: FlowState;
  /** Calls the fake music port received, in order. */
  log: string[];
  /** True between a start and the next stop, as the engine's playing flag would be. */
  live: boolean;
}

function createRig(flow: FlowState = bootFlow()): Rig {
  return { flow, log: [], live: false };
}

/** The same steps as main.ts dispatch: reduce, return on no change, then act on the cue. */
function step(rig: Rig, action: FlowAction): MusicCue {
  const prev = rig.flow;
  const next = reduceFlow(prev, action);
  if (next === prev) return 'none';
  rig.flow = next;
  const cue = musicCue(prev, next);
  if (cue === 'start') {
    rig.log.push(`start:${next.mode}:${next.levelIndex}`);
    rig.live = true;
  } else if (cue === 'stop') {
    rig.log.push('stop');
    rig.live = false;
  }
  return cue;
}

function run(rig: Rig, ...actions: FlowAction[]): Rig {
  for (const a of actions) step(rig, a);
  return rig;
}

const start = (mode: Mode = 'adventure', levelIndex = 1): FlowAction => ({ type: 'start', mode, levelIndex });

describe('musicCue: the pure table', () => {
  const menu = initialFlow(3);
  const playing = reduceFlow(menu, start('adventure', 3));
  const paused = reduceFlow(playing, { type: 'pause' });

  it('a new level while playing is a start, from the menu, from level select, and from results', () => {
    expect(musicCue(menu, playing)).toBe('start');
    const levels = reduceFlow(menu, { type: 'openLevels' });
    expect(musicCue(levels, reduceFlow(levels, start('adventure', 2)))).toBe('start');
    const results = reduceFlow(playing, { type: 'over', result: result(true) });
    expect(musicCue(results, reduceFlow(results, { type: 'next' }))).toBe('start');
    expect(musicCue(results, reduceFlow(results, { type: 'retry' }))).toBe('start');
  });

  it('Restart from pause is a start, so the track begins again at bar 0', () => {
    expect(musicCue(paused, reduceFlow(paused, { type: 'restart' }))).toBe('start');
  });

  it('game over and quit are stops, from playing and from paused', () => {
    expect(musicCue(playing, reduceFlow(playing, { type: 'over', result: result(false) }))).toBe('stop');
    expect(musicCue(paused, reduceFlow(paused, { type: 'over', result: result(false) }))).toBe('stop');
    expect(musicCue(playing, reduceFlow(playing, { type: 'quit' }))).toBe('stop');
    expect(musicCue(paused, reduceFlow(paused, { type: 'quit' }))).toBe('stop');
  });

  it('pause and resume are not cues here, the bus carries them to the engine', () => {
    expect(musicCue(playing, paused)).toBe('none');
    expect(musicCue(paused, reduceFlow(paused, { type: 'resume' }))).toBe('none');
    expect(musicCue(playing, reduceFlow(playing, { type: 'hidden' }))).toBe('none');
  });

  it('settings opened from pause keeps the run, settings opened from the menu has none', () => {
    const fromPause = reduceFlow(paused, { type: 'openSettings' });
    expect(inPlay(fromPause)).toBe(true);
    expect(musicCue(paused, fromPause)).toBe('none');
    expect(musicCue(fromPause, reduceFlow(fromPause, { type: 'closeSettings' }))).toBe('none');
    const fromMenu = reduceFlow(menu, { type: 'openSettings' });
    expect(inPlay(fromMenu)).toBe(false);
    expect(musicCue(menu, fromMenu)).toBe('none');
  });

  it('inPlay is true only for playing, paused and settings from pause', () => {
    expect(inPlay(bootFlow())).toBe(false);
    expect(inPlay(menu)).toBe(false);
    expect(inPlay(reduceFlow(menu, { type: 'openLevels' }))).toBe(false);
    expect(inPlay(playing)).toBe(true);
    expect(inPlay(paused)).toBe(true);
    expect(inPlay(reduceFlow(playing, { type: 'over', result: result(true) }))).toBe(false);
  });
});

describe('menus never start music', () => {
  it('boot, menu, level select and settings from the menu make no music call at all', () => {
    const rig = run(
      createRig(),
      { type: 'tapStart' },
      { type: 'openSettings' },
      { type: 'closeSettings' },
      { type: 'openLevels' },
      { type: 'closeLevels' },
      { type: 'openSettings' },
      { type: 'closeSettings' },
    );
    expect(rig.flow.screen).toBe('menu');
    expect(rig.log).toEqual([]);
    expect(rig.live).toBe(false);
  });

  it('the results screen and the menu after it are silent, and a second game over adds nothing', () => {
    const rig = run(createRig(), { type: 'tapStart' }, start());
    rig.log.length = 0;
    run(rig, { type: 'over', result: result(true) }, { type: 'over', result: result(true) }, { type: 'menu' });
    expect(rig.log).toEqual(['stop']);
    expect(rig.flow.screen).toBe('menu');
    expect(rig.live).toBe(false);
  });

  it('actions that need a different screen do nothing and call nothing', () => {
    const rig = run(createRig(), { type: 'resume' }, { type: 'restart' }, { type: 'next' }, { type: 'retry' }, { type: 'quit' });
    expect(rig.flow.screen).toBe('boot');
    expect(rig.log).toEqual([]);
  });

  it('every reachable screen and action: music is live exactly while a run is, and a start only happens into play', () => {
    const seen = new Set<string>();
    const queue: Rig[] = [createRig()];
    let transitions = 0;
    while (queue.length > 0) {
      const from = queue.shift();
      if (from === undefined) break;
      for (const action of ACTIONS) {
        const rig: Rig = { flow: from.flow, log: [], live: from.live };
        const prev = rig.flow;
        const cue = step(rig, action);
        transitions++;

        // Music is on exactly when a run is live: never in boot, menu, level select, results, or settings from the menu.
        expect(rig.live, `${prev.screen} --${action.type}--> ${rig.flow.screen}`).toBe(inPlay(rig.flow));
        if (cue === 'start') {
          expect(rig.flow.screen).toBe('playing');
          expect(simRunning(rig.flow)).toBe(true);
          expect(rig.flow.run).toBe(prev.run + 1);
        }
        if (cue === 'stop') {
          expect(inPlay(prev)).toBe(true);
          expect(inPlay(rig.flow)).toBe(false);
          expect(from.live).toBe(true); // never a stop when nothing plays
        }
        // Pause, resume, the auto pause and the settings round trip never touch the music from here.
        if (['pause', 'hidden', 'resume', 'openSettings', 'closeSettings', 'openLevels', 'closeLevels', 'tapStart', 'menu'].includes(action.type)) {
          expect(cue, action.type).toBe('none');
        }

        const key = `${rig.flow.screen}|${rig.flow.mode}|${rig.flow.settingsFrom}|${rig.flow.result !== null}|${rig.live}`;
        if (!seen.has(key)) {
          seen.add(key);
          queue.push({ flow: rig.flow, log: [], live: rig.live });
        }
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(10); // the walk really covered the screens
    expect(transitions).toBeGreaterThan(150);
    const screens = new Set([...seen].map((k) => k.split('|')[0]));
    for (const s of ['boot', 'menu', 'levels', 'playing', 'paused', 'results', 'settings']) expect(screens.has(s), s).toBe(true);
    expect([...seen].some((k) => k.startsWith('settings|') && k.endsWith('|true'))).toBe(true); // settings from pause, music live
    expect([...seen].some((k) => k.startsWith('settings|') && k.endsWith('|false'))).toBe(true); // settings from the menu, silent
  });
});

describe('a run, as the player meets it', () => {
  it('level start starts, pause and resume stay out of it, game over stops', () => {
    const rig = run(createRig(), { type: 'tapStart' }, start('adventure', 4));
    expect(rig.log).toEqual(['start:adventure:4']);
    run(rig, { type: 'pause' }, { type: 'resume' }, { type: 'hidden' }, { type: 'resume' });
    expect(rig.log).toEqual(['start:adventure:4']);
    run(rig, { type: 'over', result: result(true) });
    expect(rig.log).toEqual(['start:adventure:4', 'stop']);
  });

  it('Next and Retry start again, each from bar 0, and leaving to the menu does not stop twice', () => {
    const rig = run(createRig(), { type: 'tapStart' }, start('adventure', 4), { type: 'over', result: result(true) });
    run(rig, { type: 'next' }, { type: 'over', result: result(false) }, { type: 'retry' }, { type: 'over', result: result(false) }, { type: 'menu' });
    expect(rig.log).toEqual([
      'start:adventure:4',
      'stop',
      'start:adventure:5',
      'stop',
      'start:adventure:5',
      'stop',
    ]);
  });

  it('Restart from pause starts the same level again without a stop first', () => {
    const rig = run(createRig(), { type: 'tapStart' }, start('adventure', 2), { type: 'pause' }, { type: 'restart' });
    expect(rig.log).toEqual(['start:adventure:2', 'start:adventure:2']);
    expect(rig.live).toBe(true);
  });

  it('Quit from pause stops, and so does quit while playing', () => {
    const a = run(createRig(), { type: 'tapStart' }, start(), { type: 'pause' }, { type: 'quit' });
    expect(a.log).toEqual(['start:adventure:1', 'stop']);
    const b = run(createRig(), { type: 'tapStart' }, start(), { type: 'quit' });
    expect(b.log).toEqual(['start:adventure:1', 'stop']);
  });

  it('settings from pause: the run, and its music, survive; leaving to the menu from there stops it', () => {
    const rig = run(createRig(), { type: 'tapStart' }, start(), { type: 'pause' }, { type: 'openSettings' }, { type: 'closeSettings' });
    expect(rig.log).toEqual(['start:adventure:1']);
    expect(rig.live).toBe(true);
    // main.ts leaveSettings (Play seed): close settings back to pause, then quit to the menu, then start a new game.
    run(rig, { type: 'openSettings' }, { type: 'closeSettings' }, { type: 'quit' });
    expect(rig.log).toEqual(['start:adventure:1', 'stop']);
    run(rig, start('adventure', 1));
    expect(rig.log).toEqual(['start:adventure:1', 'stop', 'start:adventure:1']);
  });

  it('Endless starts on its own run and a new Endless game after game over starts again', () => {
    const rig = run(createRig(), { type: 'tapStart' }, start('endless'), { type: 'over', result: result(false, 'endless') }, { type: 'retry' });
    expect(rig.log).toEqual(['start:endless:1', 'stop', 'start:endless:1']);
  });
});

describe('main.ts wiring', () => {
  const mainPath = fileURLToPath(new URL('../../src/main.ts', import.meta.url));
  /** The source with whole line and trailing // comments removed, so prose cannot satisfy or break a check. */
  const code = readFileSync(mainPath, 'utf8')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
  const count = (needle: string): number => code.split(needle).length - 1;

  it('the music engine is reached only through the pure cue, plus one guarded retry after the first tap', () => {
    expect(count('startMusic(')).toBe(2); // applyMusicCue and retryMusic
    expect(count('stopMusic(')).toBe(1); // applyMusicCue
    expect(count('musicCue(prev, next)')).toBe(1); // inside dispatch
    expect(code).toMatch(/const retryMusic = \(\): void => \{[^}]*flow\.screen !== 'playing'/);
  });

  it('the music bus is wired once through the port, after installAudio, and starts nothing by itself', () => {
    expect(count('initMusic(')).toBe(0); // glue: wireMusic owns initMusic
    expect(count('wireMusic(bus')).toBe(1);
    expect(code.indexOf('wireMusicPort(settingsModel.state.music)')).toBeGreaterThan(code.indexOf('installAudio('));
  });

  it('every pause and resume reaches the bus, so the music hears fold, hidden tab and the stress hook too', () => {
    expect(count("{ type: 'pause' }")).toBe(1); // only the game:pause handler
    expect(count("{ type: 'resume' }")).toBe(1); // only the game:resume handler
    expect(count("{ type: 'hidden' }")).toBe(0);
    expect(count('requestPause()')).toBeGreaterThanOrEqual(2); // fold and hidden tab
    expect(count('requestResume()')).toBeGreaterThanOrEqual(1); // the stress button
  });

  it('the Music slider calls the wireMusic port and the engine, and boot pushes through the same settings effect', () => {
    expect(code).toMatch(/setMusicVolume: \(v\) => \{[^}]*setMusicEngineVolume\(v\);[^}]*wireMusicPort\(v\);/);
    expect(code).toMatch(/const wireMusicPort = \(volume: number\): void => \{[^}]*wireMusic\(bus, \{ volume \}\)/);
    expect(code).toMatch(/const applyEffectsTier = \(tier: EffectsTierSetting\): void => setEffectsTier\(tier\);/);
    expect(code).toMatch(/setEffectsTier: \(tier\) => applyEffectsTier\(tier\)/);
  });
});
