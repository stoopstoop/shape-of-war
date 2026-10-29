// The tune library through the real entry points, with a fake audio clock: a level plays its
// tune (musicState().tune), consecutive levels differ, the bed takes the tune's tempo, voicings
// and waves, Endless rotates every 3 segments with a fill before the switch, a threat phase
// change earns a fill, and the boss hook returns the tier boss bed.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initMusic, musicState, selectBossTune, startMusic, stopMusic, type MusicGraph, type NoteLog } from '../../../src/audio/music/index';
import { inScale } from '../../../src/audio/music/harmony';
import { TICK_MS } from '../../../src/audio/music/scheduler';
import { endlessTune, startTune } from '../../../src/audio/music/select';
import { STEPS_PER_BAR } from '../../../src/audio/music/track';
import { BOSS_TUNES, DEFAULT_TUNE, FILL_KICK, tuneById, TUNES, type TuneId } from '../../../src/audio/music/tunes';
import { Bus } from '../../../src/core/events';
import { levelSeed, segmentSeed } from '../../../src/levelgen/leveldef';
import { FakeContext, FakeNode, FakeTimer } from './fakeAudio';

let ctx: FakeContext;
let timer: FakeTimer;
let bus: Bus;
let log: (NoteLog & { now: number })[];
let uninstall: () => void;

function setup(tune?: TuneId): void {
  ctx = new FakeContext();
  timer = new FakeTimer();
  bus = new Bus();
  log = [];
  const graph: MusicGraph = { ctx, master: new FakeNode() };
  uninstall = initMusic({ bus, graph: () => graph, timer, visibility: null, volume: 50, ...(tune ? { tune } : {}), onNote: (n) => log.push({ ...n, now: ctx.currentTime }) });
}

function advance(sec: number, threat?: number): void {
  const n = Math.round(sec / (TICK_MS / 1000));
  for (let i = 0; i < n; i++) {
    if (threat !== undefined && i % 4 === 0) bus.emit('sim:threat', { level: threat });
    ctx.currentTime += TICK_MS / 1000;
    timer.fire();
  }
}

const bed = (layer: NoteLog['layer']): (NoteLog & { now: number })[] => log.filter((n) => n.role === 'bed' && n.layer === layer);

beforeEach(() => setup());
afterEach(() => uninstall());

describe('a level plays its tune', () => {
  it('musicState().tune is the level tune, and five consecutive levels never repeat back to back', () => {
    expect(musicState().tune).toBeNull();
    expect(musicState().bpm).toBe(0);
    const run = 0x229578a8;
    let prev: TuneId | null = null;
    for (let i = 1; i <= 8; i++) {
      const seed = levelSeed(run, i);
      startMusic(seed);
      const want = startTune(seed, 'adventure');
      expect(musicState().tune).toBe(want.id);
      expect(musicState().bpm).toBe(want.bpm);
      expect(musicState().tune).not.toBe(prev);
      prev = musicState().tune;
      // Retry: the same level gets the same tune.
      startMusic(seed);
      expect(musicState().tune).toBe(want.id);
    }
    stopMusic();
    expect(musicState().tune).toBeNull();
  });

  it.each(TUNES.map((t) => [t.id] as const))('tune %s: the bed takes its tempo, its pad voicings and its waves', (id) => {
    uninstall();
    setup(id);
    const t = tuneById(id);
    startMusic(5);
    advance(t.loopBars * STEPS_PER_BAR * t.stepSec + 1, 1);
    expect(musicState().tune).toBe(id);
    const pads = bed('pad');
    for (const n of pads) expect(n.tune).toBe(id);
    // One pad chord a bar, spaced a bar of the tune apart.
    const downbeats = [...new Set(pads.map((n) => n.time))];
    for (let i = 1; i < downbeats.length; i++) expect((downbeats[i] ?? 0) - (downbeats[i - 1] ?? 0)).toBeCloseTo(STEPS_PER_BAR * t.stepSec, 9);
    for (const n of pads) {
      const v = t.voicings[t.key.bars[Math.floor(n.step / STEPS_PER_BAR) % t.loopBars]?.name ?? ''];
      expect(v?.pad).toContain(n.midi);
    }
    // No enemies, so every oscillator is the bed's (kick and LFO are sines).
    const waves = new Set(ctx.oscs.map((o) => o.type));
    expect(waves).toEqual(new Set<OscillatorType>(['sine', t.bed.bass, t.bed.pad, t.bed.arp]));
    for (const n of log) if (n.midi !== null) expect(inScale(n.midi, t.key)).toBe(true);
  });
});

describe('Endless', () => {
  it('starts on block 0 of the Endless rotation and moves to a different tune and tempo after 3 segments, with a fill first', () => {
    const seed = segmentSeed(0x1234, 0);
    bus.emit('game:start', { mode: 'endless', levelIndex: 1 });
    startMusic(seed);
    const first = startTune(seed, 'endless');
    const next = endlessTune(seed, 1);
    expect(next.id).not.toBe(first.id);
    expect(musicState().tune).toBe(first.id);
    advance(80, 0.5);
    expect(musicState().tune).toBe(first.id);
    advance(20, 0.5);
    expect(musicState().tune).toBe(next.id);
    expect(musicState().bpm).toBe(next.bpm);
    // The switch lands on a bar line near 90 s of play, after a 2 bar fill in the old tune.
    const firstNew = log.find((n) => n.tune === next.id);
    expect(firstNew).toBeDefined();
    const switchStep = firstNew?.step ?? 0;
    expect(switchStep % STEPS_PER_BAR).toBe(0);
    const switchBar = switchStep / STEPS_PER_BAR;
    const t0 = log.find((n) => n.step === 0)?.time ?? 0;
    expect((firstNew?.time ?? 0) - t0).toBeGreaterThan(84);
    expect((firstNew?.time ?? 0) - t0).toBeLessThan(96);
    const fillKicks = bed('kick').filter((n) => Math.floor(n.step / STEPS_PER_BAR) === switchBar - 1).map((n) => n.step % STEPS_PER_BAR);
    expect(fillKicks).toEqual(FILL_KICK.map((k) => k.step));
    // Every note before the switch is the old tune, every note after the new, in its scale.
    for (const n of log) {
      expect(n.tune).toBe(n.step < switchStep ? first.id : next.id);
      if (n.midi !== null) expect(inScale(n.midi, (n.tune === next.id ? next : first).key), `${n.role} ${n.step}`).toBe(true);
      expect(n.time).toBeGreaterThanOrEqual(n.now);
    }
    // Steps sit on the old grid, then the new one, with no hole.
    const kicks = [...new Set(log.filter((n) => n.role === 'bed').map((n) => `${n.step}:${n.time}`))].map((s) => s.split(':').map(Number) as [number, number]);
    for (const [step, time] of kicks) {
      const expected = step < switchStep ? t0 + step * first.stepSec : t0 + switchStep * first.stepSec + (step - switchStep) * next.stepSec;
      expect(time).toBeCloseTo(expected, 6);
    }
    expect(musicState().skippedSteps).toBe(0);
  });

  it('a game:start that arrives just after the music started restarts it in the right mode', () => {
    const seed = segmentSeed(0xbeef, 0);
    // Pick an Endless seed whose two selections differ, so the restart is visible.
    let s = seed;
    while (startTune(s, 'endless').id === startTune(s, 'adventure').id) s++;
    startMusic(s);
    expect(musicState().tune).toBe(startTune(s, 'adventure').id);
    bus.emit('game:start', { mode: 'endless', levelIndex: 1 });
    expect(musicState().tune).toBe(startTune(s, 'endless').id);
    // Back to Adventure from the menu.
    bus.emit('game:start', { mode: 'adventure', levelIndex: 1 });
    expect(musicState().tune).toBe(startTune(s, 'adventure').id);
    // Well into a run, a stray game:start does not restart the music.
    advance(5);
    const step = musicState().nextStep;
    bus.emit('game:start', { mode: 'endless', levelIndex: 1 });
    expect(musicState().nextStep).toBe(step);
  });
});

describe('fills at a phase change', () => {
  it('the high threat lift turning on plays a 2 bar fill: open hats, then the fill kicks and the run', () => {
    uninstall();
    setup('neon');
    startMusic(9);
    advance(4, 0.2);
    expect(musicState().lift).toBe(false);
    const before = log.length;
    advance(8, 1);
    expect(musicState().lift).toBe(true);
    const after = log.slice(before);
    const bars = new Map<number, number[]>();
    for (const n of after.filter((x) => x.role === 'bed' && x.layer === 'hat')) {
      const b = Math.floor(n.step / STEPS_PER_BAR);
      bars.set(b, [...(bars.get(b) ?? []), n.step % STEPS_PER_BAR]);
    }
    const open = [...bars.entries()].filter(([, steps]) => new Set(steps).size === STEPS_PER_BAR).map(([b]) => b);
    expect(open.length).toBeGreaterThanOrEqual(2);
    const fillBar = open[1] ?? -1;
    const kicks = after.filter((n) => n.role === 'bed' && n.layer === 'kick' && Math.floor(n.step / STEPS_PER_BAR) === fillBar).map((n) => n.step % STEPS_PER_BAR);
    expect(kicks).toEqual(FILL_KICK.map((k) => k.step));
  });
});

describe('boss hook', () => {
  it('selectBossTune returns the tier boss bed, idle or playing any tune', () => {
    for (const tier of [1, 2, 3, 4] as const) expect(selectBossTune(tier)).toBe(BOSS_TUNES[tier]);
    startMusic(levelSeed(7, 3));
    expect(tuneById(musicState().tune ?? '')).toBeDefined();
    for (const tier of [1, 2, 3, 4] as const) expect(selectBossTune(tier)).toBe(BOSS_TUNES[tier]);
  });
});
