import { describe, expect, it } from 'vitest';
import { initialFlow, reduceFlow, simRunning, type FlowAction, type FlowState, type LevelResult } from '../../src/ui/flow';

function run(s: FlowState, ...actions: FlowAction[]): FlowState {
  return actions.reduce(reduceFlow, s);
}

function result(success: boolean, levelIndex = 1): LevelResult {
  return { mode: 'adventure', levelIndex, score: 1200, stars: 1, success, par: 1000, best: 1200, newBest: true, hash: 'abcd1234' };
}

const start: FlowAction = { type: 'start', mode: 'adventure', levelIndex: 1 };

describe('flow state machine', () => {
  it('boots to the menu with the sim stopped', () => {
    const s = initialFlow();
    expect(s.screen).toBe('menu');
    expect(simRunning(s)).toBe(false);
  });

  it('menu to playing to results to menu', () => {
    let s = run(initialFlow(), start);
    expect(s.screen).toBe('playing');
    expect(s.run).toBe(1);
    expect(simRunning(s)).toBe(true);
    s = reduceFlow(s, { type: 'over', result: result(true) });
    expect(s.screen).toBe('results');
    expect(s.result?.score).toBe(1200);
    s = reduceFlow(s, { type: 'menu' });
    expect(s.screen).toBe('menu');
    expect(s.result).toBeNull();
  });

  it('Next advances the level only after success', () => {
    const won = run(initialFlow(), start, { type: 'over', result: result(true) }, { type: 'next' });
    expect(won.screen).toBe('playing');
    expect(won.levelIndex).toBe(2);
    expect(won.run).toBe(2);
    const lost = run(initialFlow(), start, { type: 'over', result: result(false) });
    expect(reduceFlow(lost, { type: 'next' })).toBe(lost);
  });

  it('Retry rebuilds the same level', () => {
    const s = run(initialFlow(), { type: 'start', mode: 'adventure', levelIndex: 3 }, { type: 'over', result: result(false, 3) }, { type: 'retry' });
    expect(s.screen).toBe('playing');
    expect(s.levelIndex).toBe(3);
    expect(s.run).toBe(2);
  });

  it('pause freezes, resume continues the same run, restart rebuilds', () => {
    const playing = run(initialFlow(), start);
    const paused = reduceFlow(playing, { type: 'pause' });
    expect(paused.screen).toBe('paused');
    expect(simRunning(paused)).toBe(false);
    const resumed = reduceFlow(paused, { type: 'resume' });
    expect(resumed.screen).toBe('playing');
    expect(resumed.run).toBe(playing.run);
    const restarted = reduceFlow(paused, { type: 'restart' });
    expect(restarted.run).toBe(playing.run + 1);
  });

  it('quit from pause goes to the menu', () => {
    expect(run(initialFlow(), start, { type: 'pause' }, { type: 'quit' }).screen).toBe('menu');
  });

  it('auto pauses on visibility hidden only while playing', () => {
    const playing = run(initialFlow(), start);
    expect(reduceFlow(playing, { type: 'hidden' }).screen).toBe('paused');
    const menu = initialFlow();
    expect(reduceFlow(menu, { type: 'hidden' })).toBe(menu);
    const results = run(playing, { type: 'over', result: result(true) });
    expect(reduceFlow(results, { type: 'hidden' })).toBe(results);
  });

  it('ignores a second game:over and stray actions', () => {
    const results = run(initialFlow(), start, { type: 'over', result: result(true) });
    expect(reduceFlow(results, { type: 'over', result: result(false) })).toBe(results);
    const menu = initialFlow();
    for (const a of [{ type: 'resume' }, { type: 'pause' }, { type: 'retry' }, { type: 'next' }] as FlowAction[]) {
      expect(reduceFlow(menu, a)).toBe(menu);
    }
    const playing = run(menu, start);
    expect(reduceFlow(playing, start)).toBe(playing);
  });

  it('settings returns to where it was opened from', () => {
    const fromMenu = run(initialFlow(), { type: 'openSettings' });
    expect(fromMenu.screen).toBe('settings');
    expect(reduceFlow(fromMenu, { type: 'closeSettings' }).screen).toBe('menu');
    const fromPause = run(initialFlow(), start, { type: 'pause' }, { type: 'openSettings' });
    expect(fromPause.screen).toBe('settings');
    expect(simRunning(fromPause)).toBe(false);
    expect(reduceFlow(fromPause, { type: 'closeSettings' }).screen).toBe('paused');
    const playing = run(initialFlow(), start);
    expect(reduceFlow(playing, { type: 'openSettings' })).toBe(playing);
  });

  it('clamps the start level to at least 1', () => {
    expect(run(initialFlow(), { type: 'start', mode: 'adventure', levelIndex: -4 }).levelIndex).toBe(1);
  });

  it('menu to level select and back, or start from it', () => {
    const levels = run(initialFlow(), { type: 'openLevels' });
    expect(levels.screen).toBe('levels');
    expect(simRunning(levels)).toBe(false);
    expect(reduceFlow(levels, { type: 'closeLevels' }).screen).toBe('menu');
    const s = reduceFlow(levels, { type: 'start', mode: 'adventure', levelIndex: 4 });
    expect(s.screen).toBe('playing');
    expect(s.levelIndex).toBe(4);
    expect(reduceFlow(s, { type: 'openLevels' })).toBe(s);
  });

  it('endless: start, game over, retry builds a new run, no Next', () => {
    let s = run(initialFlow(), { type: 'start', mode: 'endless', levelIndex: 1 });
    expect(s.mode).toBe('endless');
    s = reduceFlow(s, { type: 'over', result: { ...result(false), mode: 'endless', rank: 1, seed: 5 } });
    expect(reduceFlow(s, { type: 'next' })).toBe(s);
    const again = reduceFlow(s, { type: 'retry' });
    expect(again.run).toBe(s.run + 1);
    expect(again.mode).toBe('endless');
  });
});
