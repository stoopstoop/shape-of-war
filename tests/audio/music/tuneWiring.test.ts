// B20 (device at 5a3b958: three Adventure levels, the tune did not change, music 2 of 5). The
// tune wiring end to end with a fake audio clock: levels 1, 2 and 3 of run seed 42 through
// startMusic and stopMusic (what main.ts applyMusicCue does on Next) play three different tunes,
// the screen flow's cues start a new tune on Next, Retry and level select, no two consecutive
// levels share a tune over 1000 run seeds (and no three in a row repeat one), the bed's brighter
// waves are trimmed to the original track's loudness, and a bomb's chord rests the arp.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMusicEngine } from '../../../src/audio/music/engine';
import { initMusic, musicState, startMusic, stopMusic, type MusicGraph, type NoteLog } from '../../../src/audio/music/index';
import { TICK_MS } from '../../../src/audio/music/scheduler';
import { startTune, tuneIndexForKey, tuneIndexForLevelSeed } from '../../../src/audio/music/select';
import { bedWaveTrim, DEFAULT_TUNE, tuneById, TUNES, WAVE_WEIGHT, type TrackId, type TuneId } from '../../../src/audio/music/tunes';
import { Bus } from '../../../src/core/events';
import { hash01 } from '../../../src/core/rng';
import { levelSeed } from '../../../src/levelgen/leveldef';
import { reduceFlow, initialFlow, type FlowAction, type FlowState, type LevelResult } from '../../../src/ui/flow';
import { musicCue } from '../../../src/ui/musicFlow';
import { FakeContext, FakeGain, FakeNode, FakeTimer } from './fakeAudio';

let ctx: FakeContext;
let timer: FakeTimer;
let bus: Bus;
let log: NoteLog[];
let uninstall: () => void;

function setup(tune?: TuneId): void {
  ctx = new FakeContext();
  timer = new FakeTimer();
  bus = new Bus();
  log = [];
  const graph: MusicGraph = { ctx, master: new FakeNode() };
  uninstall = initMusic({ bus, graph: () => graph, timer, visibility: null, volume: 50, ...(tune ? { tune } : {}), onNote: (n) => log.push(n) });
}

function advance(sec: number, threat?: number): void {
  const n = Math.round(sec / (TICK_MS / 1000));
  for (let i = 0; i < n; i++) {
    if (threat !== undefined && i % 4 === 0) bus.emit('sim:threat', { level: threat });
    ctx.currentTime += TICK_MS / 1000;
    timer.fire();
  }
}

beforeEach(() => setup());
afterEach(() => uninstall());

const RUN_SEEDS_1000 = Array.from({ length: 1000 }, (_, i) => Math.floor(hash01(i, 0xb20) * 4294967296));

describe('B20: levels 1, 2 and 3 of run seed 42 through startMusic and stopMusic', () => {
  it('play three different tunes, and every note of a level is in its own tune', () => {
    const ids: (TrackId | null)[] = [];
    for (const n of [1, 2, 3]) {
      const before = log.length;
      expect(startMusic(levelSeed(42, n) >>> 0)).toBe(true);
      ids.push(musicState().tune);
      advance(6, 0.25);
      const own = log.slice(before);
      expect(own.length).toBeGreaterThan(0);
      for (const note of own) expect(note.tune).toBe(ids[ids.length - 1]);
      // Level end: the results screen stops the music (cue 'stop').
      stopMusic();
      expect(musicState().tune).toBeNull();
    }
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => id !== null)).toBe(true);
  });

  it('startMusic over a playing run (no stop first) still switches tune and restarts from bar 0', () => {
    startMusic(levelSeed(42, 1));
    advance(5, 0.3);
    const first = musicState().tune;
    expect(musicState().nextStep).toBeGreaterThan(16);
    const before = log.length;
    startMusic(levelSeed(42, 2));
    expect(musicState().tune).not.toBe(first);
    // Only the first lookahead window is booked, from step 0, in the new tune.
    expect(musicState().nextStep).toBeLessThan(4);
    const fresh = log.slice(before);
    expect(Math.min(...fresh.map((n) => n.step))).toBe(0);
    for (const n of fresh) expect(n.tune).toBe(musicState().tune);
  });

  it('the screen flow (Next, Retry, level select) drives the cues main.ts applies', () => {
    // The rig does what main.ts dispatch does: reduce, then apply musicCue with the new level's seed.
    const run = 42;
    let flow: FlowState = initialFlow(1);
    const heard: (TrackId | null)[] = [];
    const ok: LevelResult = { mode: 'adventure', levelIndex: 1, score: 1, stars: 1, success: true, par: 1, best: 1, newBest: false, hash: 'h' };
    const act = (a: FlowAction): void => {
      const prev = flow;
      const next = reduceFlow(prev, a);
      if (next === prev) return;
      flow = next;
      const cue = musicCue(prev, next);
      if (cue === 'start') {
        startMusic(levelSeed(run, next.levelIndex) >>> 0);
        heard.push(musicState().tune);
      } else if (cue === 'stop') {
        stopMusic();
      }
      advance(1, 0.2);
    };
    act({ type: 'start', mode: 'adventure', levelIndex: 1 });
    act({ type: 'over', result: ok });
    act({ type: 'next' });
    act({ type: 'over', result: ok });
    act({ type: 'next' });
    expect(heard).toHaveLength(3);
    expect(new Set(heard).size).toBe(3);
    // Retry plays the same level, so the same tune.
    act({ type: 'over', result: { ...ok, success: false } });
    act({ type: 'retry' });
    expect(heard[3]).toBe(heard[2]);
  });
});

describe('B20: selection over 1000 run seeds', () => {
  it('no two consecutive levels share a tune', () => {
    for (const r of RUN_SEEDS_1000) {
      let prev = tuneIndexForLevelSeed(levelSeed(r, 1));
      for (let n = 2; n <= 30; n++) {
        const cur = tuneIndexForLevelSeed(levelSeed(r, n));
        if (cur === prev) expect.fail(`run ${r} levels ${n - 1} and ${n} share tune ${cur}`);
        prev = cur;
      }
    }
  });

  it('no three consecutive levels repeat a tune, and every four in a block play all four', () => {
    for (const r of RUN_SEEDS_1000) {
      const seq = Array.from({ length: 30 }, (_, i) => tuneIndexForLevelSeed(levelSeed(r, i + 1)));
      for (let i = 2; i < seq.length; i++) expect(new Set([seq[i - 2], seq[i - 1], seq[i]]).size).toBe(3);
    }
    // A block of four keys (k = 4m to 4m + 3) is a permutation of the four tunes.
    for (let m = 0; m < 500; m++) {
      expect(new Set([0, 1, 2, 3].map((p) => tuneIndexForKey(4 * m + p, 4))).size).toBe(4);
    }
    // Across the 2^32 wrap too.
    expect(new Set([0xfffffffe, 0xffffffff, 0].map((k) => tuneIndexForKey(k, 4))).size).toBe(3);
  });

  it('every tune opens a run about equally often (no bias to one tune on level 1)', () => {
    const counts = new Array<number>(TUNES.length).fill(0);
    for (const r of RUN_SEEDS_1000) counts[tuneIndexForLevelSeed(levelSeed(r, 1))] = (counts[tuneIndexForLevelSeed(levelSeed(r, 1))] ?? 0) + 1;
    for (const c of counts) {
      expect(c).toBeGreaterThan(180);
      expect(c).toBeLessThan(320);
    }
  });

  it('the startMusic tune is the selection tune', () => {
    for (const r of RUN_SEEDS_1000.slice(0, 50)) {
      for (const n of [1, 2, 3]) {
        startMusic(levelSeed(r, n));
        expect(musicState().tune).toBe(startTune(levelSeed(r, n), 'adventure').id);
      }
    }
  });
});

describe('B20: bed loudness trim', () => {
  it('never boosts, leaves the original track and the drums alone, and pulls back saw and square basses', () => {
    for (const t of TUNES) {
      for (const layer of ['bass', 'pad', 'arp', 'kick', 'hat', 'perc'] as const) {
        const k = bedWaveTrim(layer, t.bed);
        expect(k).toBeGreaterThan(0);
        expect(k).toBeLessThanOrEqual(1);
        if (layer === 'kick' || layer === 'hat' || layer === 'perc' || t.id === DEFAULT_TUNE.id) expect(k).toBe(1);
      }
    }
    expect(bedWaveTrim('bass', tuneById('ember').bed)).toBeCloseTo(WAVE_WEIGHT.triangle / WAVE_WEIGHT.sawtooth, 9);
    expect(bedWaveTrim('bass', tuneById('orbit').bed)).toBeCloseTo(WAVE_WEIGHT.triangle / WAVE_WEIGHT.square, 9);
    expect(bedWaveTrim('bass', tuneById('ember').bed)).toBeLessThan(0.8);
    expect(bedWaveTrim('bass', tuneById('orbit').bed)).toBeLessThan(0.8);
  });

  it('the engine applies it: an Ember bass note peaks lower than the same note on Neon', () => {
    const peakOf = (id: TuneId): number => {
      const c = new FakeContext();
      const e = createMusicEngine(c, new FakeNode(), 0.2);
      const before = c.gains.length;
      e.play({ layer: 'bass', midi: 40, time: 0.1, dur: 0.25, gain: 0.2 }, tuneById(id).bed);
      const envs = c.gains.slice(before).filter((g: FakeGain) => g.gain.calls.some((x) => x.fn === 'lin'));
      return Math.max(...envs.flatMap((g: FakeGain) => g.gain.calls.filter((x) => x.fn === 'lin').map((x) => x.v)));
    };
    const neon = peakOf('neon');
    expect(neon).toBeGreaterThan(0);
    expect(peakOf('ember') / neon).toBeCloseTo(bedWaveTrim('bass', tuneById('ember').bed), 6);
    expect(peakOf('tide') / neon).toBeCloseTo(1, 6);
  });
});

describe('B20: the tune is heard at early level threat', () => {
  it.each(TUNES.map((t) => [t.id] as const))('tune %s plays its arp at threat 0.25', (id) => {
    uninstall();
    setup(id);
    startMusic(11);
    advance(8, 0.25);
    const arps = log.filter((n) => n.role === 'bed' && n.layer === 'arp');
    expect(arps.length).toBeGreaterThan(16);
    for (const n of arps) expect(n.tune).toBe(id);
  });

  it("a bomb's chord rests the arp for the chord's length", () => {
    uninstall();
    setup('neon');
    startMusic(3);
    advance(4, 0.3);
    bus.emit('fx:bomb', { x: 0, y: 0 });
    advance(3, 0.3);
    const chords = log.filter((n) => n.role === 'chord');
    expect(chords.length).toBeGreaterThan(0);
    const at = chords[0]?.step ?? -1;
    const arpUnder = log.filter((n) => n.role === 'bed' && n.layer === 'arp' && n.step >= at && n.step < at + 6);
    expect(arpUnder).toHaveLength(0);
    // The arp is back after the chord.
    expect(log.some((n) => n.role === 'bed' && n.layer === 'arp' && n.step >= at + 6)).toBe(true);
  });
});
