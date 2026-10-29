// B12: every flow and sim transition that has a cue plays it exactly once, through the same steps
// main.ts runs (reduce, skip a no op, hand prev and next to the port), against a fake sink.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CueName } from '../../src/audio/cues';
import { CUES } from '../../src/audio/cues';
import {
  createCuePort,
  createTapGate,
  flowCue,
  MIN_TAP_GAP_MS,
  simCues,
  type CuePort,
  type SimSnapshot,
} from '../../src/ui/cueFlow';
import { setTapSound } from '../../src/ui/dom';
import { bootFlow, reduceFlow, type FlowAction, type FlowState, type LevelResult, type Mode } from '../../src/ui/flow';
import { createPauseScreen } from '../../src/ui/pause';
import { createResultsScreen } from '../../src/ui/results';
import { asParent, buttonsLabelled, installFakeDocument } from './fakeDom';

function result(success: boolean, mode: Mode = 'adventure'): LevelResult {
  return { mode, levelIndex: 1, score: 100, stars: 0, success, par: 1000, best: 100, newBest: false, hash: 'h' };
}

interface Rig {
  flow: FlowState;
  log: CueName[];
  port: CuePort;
}

function rig(): Rig {
  const log: CueName[] = [];
  return { flow: bootFlow(1), log, port: createCuePort((c) => log.push(c)) };
}

/** What main.ts's dispatch does with the cue port. */
function act(r: Rig, a: FlowAction): void {
  const prev = r.flow;
  const next = reduceFlow(prev, a);
  if (next === prev) return;
  r.flow = next;
  r.port.flow(prev, next);
}

function snap(shipActive: boolean, charge: number): SimSnapshot {
  return { shipActive, charge };
}

describe('cue names', () => {
  it('every cue the port can play exists in the synth table', () => {
    for (const c of ['levelComplete', 'levelFail', 'respawn', 'superReady', 'superActivate', 'uiTap'] as const) {
      expect(CUES[c]).toBeDefined();
    }
  });
});

describe('flowCue', () => {
  const playing = reduceFlow(reduceFlow(bootFlow(1), { type: 'tapStart' }), { type: 'start', mode: 'adventure', levelIndex: 1 });

  it('entering results plays levelComplete on success and levelFail on failure', () => {
    expect(flowCue(playing, reduceFlow(playing, { type: 'over', result: result(true) }))).toBe('levelComplete');
    expect(flowCue(playing, reduceFlow(playing, { type: 'over', result: result(false) }))).toBe('levelFail');
  });

  it('an Endless game over is a fail', () => {
    expect(flowCue(playing, reduceFlow(playing, { type: 'over', result: result(false, 'endless') }))).toBe('levelFail');
  });

  it('game over from pause plays too', () => {
    const paused = reduceFlow(playing, { type: 'pause' });
    expect(flowCue(paused, reduceFlow(paused, { type: 'over', result: result(true) }))).toBe('levelComplete');
  });

  it('no other transition has a flow cue', () => {
    const paused = reduceFlow(playing, { type: 'pause' });
    expect(flowCue(bootFlow(1), reduceFlow(bootFlow(1), { type: 'tapStart' }))).toBeNull();
    expect(flowCue(playing, paused)).toBeNull();
    expect(flowCue(paused, reduceFlow(paused, { type: 'resume' }))).toBeNull();
    expect(flowCue(paused, reduceFlow(paused, { type: 'quit' }))).toBeNull();
    const results = reduceFlow(playing, { type: 'over', result: result(true) });
    expect(flowCue(results, reduceFlow(results, { type: 'retry' }))).toBeNull();
    expect(flowCue(results, reduceFlow(results, { type: 'menu' }))).toBeNull();
    expect(flowCue(results, results)).toBeNull();
  });
});

describe('flow cues through the dispatch rig', () => {
  it('a complete, next, fail, retry, fail run plays each result cue once per result', () => {
    const r = rig();
    act(r, { type: 'tapStart' });
    act(r, { type: 'start', mode: 'adventure', levelIndex: 1 });
    expect(r.log).toEqual([]);
    act(r, { type: 'over', result: result(true) });
    expect(r.log).toEqual(['levelComplete']);
    act(r, { type: 'over', result: result(false) }); // a second game:over is ignored by the reducer
    expect(r.log).toEqual(['levelComplete']);
    act(r, { type: 'next' });
    act(r, { type: 'over', result: result(false) });
    expect(r.log).toEqual(['levelComplete', 'levelFail']);
    act(r, { type: 'retry' });
    act(r, { type: 'pause' });
    act(r, { type: 'over', result: result(false) });
    act(r, { type: 'menu' });
    expect(r.log).toEqual(['levelComplete', 'levelFail', 'levelFail']);
  });

  it('quit never plays a result cue', () => {
    const r = rig();
    act(r, { type: 'tapStart' });
    act(r, { type: 'start', mode: 'endless', levelIndex: 1 });
    act(r, { type: 'pause' });
    act(r, { type: 'quit' });
    expect(r.log).toEqual([]);
  });
});

describe('simCues', () => {
  it('respawn plays once when the ship comes back after the delay', () => {
    expect(simCues(snap(false, 0), snap(true, 0))).toEqual(['respawn']);
    expect(simCues(snap(true, 0), snap(false, 0))).toEqual([]); // the death itself
    expect(simCues(snap(false, 0), snap(false, 0))).toEqual([]); // waiting
  });

  it('no respawn after the last life (timer done, ship stays inactive)', () => {
    expect(simCues(snap(false, 0), snap(false, 0))).toEqual([]);
  });

  it('superReady plays when the charge reaches full, not while it stays full', () => {
    expect(simCues(snap(true, 0.9), snap(true, 1))).toEqual(['superReady']);
    expect(simCues(snap(true, 1), snap(true, 1))).toEqual([]);
  });

  it('superActivate plays when a full charge is spent', () => {
    expect(simCues(snap(true, 1), snap(true, 0))).toEqual(['superActivate']);
    expect(simCues(snap(true, 0.5), snap(true, 0.4))).toEqual([]);
  });

  it('a quiet step returns the shared empty list', () => {
    const a = simCues(snap(true, 0.2), snap(true, 0.3));
    expect(a).toBe(simCues(snap(true, 0.3), snap(true, 0.4)));
  });
});

describe('sim cues through the port', () => {
  it('a death, respawn, charge and spend sequence plays each cue once', () => {
    const log: CueName[] = [];
    const port = createCuePort((c) => log.push(c));
    port.arm(snap(true, 0));
    const steps = [
      snap(true, 0.5),
      snap(false, 0.5), // died
      snap(false, 0.5),
      snap(false, 0.5),
      snap(true, 0.5), // respawned: the charge survives a death
      snap(true, 0.5),
      snap(true, 1), // full
      snap(true, 1),
      snap(true, 1),
      snap(true, 0), // spent
      snap(true, 0),
    ];
    for (const s of steps) port.sim(s);
    expect(log).toEqual(['respawn', 'superReady', 'superActivate']);
  });

  it('respawn plays once over a full death sequence', () => {
    const log: CueName[] = [];
    const port = createCuePort((c) => log.push(c));
    port.arm(snap(true, 0));
    for (const s of [snap(false, 0), snap(false, 0), snap(false, 0), snap(true, 0), snap(true, 0)]) port.sim(s);
    expect(log).toEqual(['respawn']);
  });

  it('arming a new world does not read a charge reset as a super', () => {
    const log: CueName[] = [];
    const port = createCuePort((c) => log.push(c));
    port.arm(snap(true, 0));
    port.sim(snap(true, 1));
    port.arm(snap(true, 0)); // Retry built a fresh world
    port.sim(snap(true, 0));
    expect(log).toEqual(['superReady']);
  });

  it('a throwing sink never breaks the port', () => {
    const port = createCuePort(() => {
      throw new Error('no audio');
    });
    expect(() => port.sim(snap(true, 1))).not.toThrow();
    expect(() => port.tap(0)).not.toThrow();
  });
});

describe('uiTap', () => {
  afterEach(() => {
    setTapSound(null);
    vi.unstubAllGlobals();
  });

  it('the gate allows one tap per gap', () => {
    const g = createTapGate(80);
    expect(g.allow(0)).toBe(true);
    expect(g.allow(40)).toBe(false);
    expect(g.allow(80)).toBe(true);
    expect(MIN_TAP_GAP_MS).toBe(80);
  });

  it('each button tap plays uiTap once, a press with no release plays nothing', () => {
    const root = installFakeDocument();
    const log: CueName[] = [];
    const port = createCuePort((c) => log.push(c));
    let now = 0;
    setTapSound(() => port.tap(now));
    const acted: string[] = [];
    createResultsScreen(asParent(root), { next: () => acted.push('next'), retry: () => acted.push('retry'), menu: () => acted.push('menu') });
    createPauseScreen(asParent(root), { resume: () => acted.push('resume'), restart: () => undefined, settings: () => undefined, quit: () => undefined });
    buttonsLabelled(root, 'Retry')[0]?.tap();
    expect(log).toEqual(['uiTap']);
    now = 500;
    buttonsLabelled(root, 'Resume')[0]?.tap();
    expect(log).toEqual(['uiTap', 'uiTap']);
    now = 1000;
    buttonsLabelled(root, 'Menu')[0]?.fire('pointerdown');
    expect(log).toHaveLength(2);
    now = 1020;
    buttonsLabelled(root, 'Menu')[0]?.fire('pointerup');
    expect(log).toHaveLength(3);
    now = 1040; // a second tap inside the gap still acts but makes no sound
    buttonsLabelled(root, 'Retry')[0]?.tap();
    expect(log).toHaveLength(3);
    expect(acted).toEqual(['retry', 'resume', 'menu', 'retry']);
  });

  it('a throwing tap sound still runs the button', () => {
    const root = installFakeDocument();
    setTapSound(() => {
      throw new Error('no audio');
    });
    let n = 0;
    createResultsScreen(asParent(root), { next: () => undefined, retry: () => n++, menu: () => undefined });
    buttonsLabelled(root, 'Retry')[0]?.tap();
    expect(n).toBe(1);
  });
});

describe('main.ts wiring', () => {
  const src = readFileSync(fileURLToPath(new URL('../../src/main.ts', import.meta.url)), 'utf8');
  it('dispatch hands every flow change to the cue port, the step reads the sim, a new world arms it', () => {
    expect(src).toContain('cues.flow(prev, next)');
    expect(src).toContain('cues.sim(readSim())');
    expect(src).toContain('cues.arm(readSim())');
    expect(src).toContain('setTapSound(');
  });
});
