// Boss cues (G3C window cue wave): the window cue that follows 'sim:bossWindow', the crack
// stingers and voice drop that follow 'sim:bossCrack', and the boss hit tick that follows
// 'fx:hit'. Pure state machines first, then the real entry points with a fake audio clock.
// The two new events are not in core/events.ts yet, so the tests emit them through a loose bus.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bossCrack, bossEnter } from '../../../src/audio/music/bossLife';
import {
  BOSS_TICK_GAP_SEC,
  BOSS_TICK_GATE_INIT,
  BOSS_TICK_RATE_MAX,
  CUE_TIMBRES,
  KIND_BOSS,
  KIND_BOSS_PART,
  LAND_STALE_SEC,
  PAD_MAX_SEC,
  PAD_SEG_SEC,
  RISE_GAP_SEC,
  WINDOW_IDLE,
  bossTickVoice,
  crackKeeps,
  crackVoice,
  gateBossTick,
  isBossHitKind,
  planWindow,
  windowEvent,
  windowVoice,
  type WindowCue,
  type WindowDue,
} from '../../../src/audio/music/bossCue';
import { BED_VOICE_MAX, MUSIC_VOICE_CAP } from '../../../src/audio/music/engine';
import { harmonyForBar } from '../../../src/audio/music/harmony';
import { initMusic, musicState, setMusicVolume, startMusic, stopMusic, type MusicGraph, type NoteLog } from '../../../src/audio/music/index';
import { BOSS_CUE_RESERVE, GAIN_CEILING } from '../../../src/audio/music/lifecycle';
import { TICK_MS } from '../../../src/audio/music/scheduler';
import { BAR_SEC } from '../../../src/audio/music/track';
import { BOSS_KEYS } from '../../../src/audio/music/tunes';
import { hash01 } from '../../../src/core/rng';
import { Bus } from '../../../src/core/events';
import { Kind } from '../../../src/game/world';
import type { EnemyKind } from '../../../src/levelgen/leveldef';
import { FakeContext, FakeNode, FakeTimer } from './fakeAudio';

const TICK = TICK_MS / 1000;
const harmony = harmonyForBar(0, BOSS_KEYS[4]);

describe('window cue state machine', () => {
  const run = (st: WindowCue, now: number): { st: WindowCue; due: readonly WindowDue[] } => planWindow(st, now);

  it('a run up lands the second note on the estimated opening, the first a gap before, rising', () => {
    let st = windowEvent(WINDOW_IDLE, 'prism', false, 2, 10);
    expect(st.openAt).toBe(12);
    let due: WindowDue[] = [];
    for (let t = 10; t < 12.3; t += 0.025) {
      const r = run(st, t);
      st = r.st;
      due = due.concat(r.due);
    }
    const rise = due.find((d) => d.kind === 'rise');
    const land = due.find((d) => d.kind === 'land');
    expect(due.filter((d) => d.kind === 'rise')).toHaveLength(1);
    expect(due.filter((d) => d.kind === 'land')).toHaveLength(1);
    expect(land?.time).toBe(12);
    expect(rise?.time ?? 0).toBeCloseTo(12 - RISE_GAP_SEC, 9);
    expect(windowVoice('land', harmony).midi).toBeGreaterThan(windowVoice('rise', harmony).midi);
    expect(st.rise).toBe(2);
  });

  it('cue lands within one scheduler tick of the window opening across 16 cycles with handler jitter', () => {
    const CYCLE = 3.5;
    const RUN_UP = 2;
    const WINDOW = 1.2;
    let st: WindowCue = WINDOW_IDLE;
    const errors: number[] = [];
    const lands: number[] = [];
    for (let k = 0; k < 16; k++) {
      const base = k * CYCLE;
      const open = base + RUN_UP;
      const close = open + WINDOW;
      const events: { ms: number; open: boolean; left: number }[] = [];
      for (let i = 0; base + i * 0.05 < open - 1e-9; i++) {
        const sim = base + i * 0.05;
        events.push({ ms: Math.round((sim + hash01(k, i) * 0.02) * 1000), open: false, left: open - sim });
      }
      events.push({ ms: Math.round((open + hash01(k, 99) * 0.02) * 1000), open: true, left: WINDOW });
      events.push({ ms: Math.round((close + hash01(k, 98) * 0.02) * 1000), open: false, left: 0 });
      for (let ms = Math.round(base * 1000); ms < Math.round((base + CYCLE) * 1000); ms++) {
        for (const e of events) if (e.ms === ms) st = windowEvent(st, 'prism', e.open, e.left, ms / 1000);
        if (ms % TICK_MS === 0) {
          const r = run(st, ms / 1000);
          st = r.st;
          for (const d of r.due) if (d.kind === 'land') lands.push(d.time - open);
        }
      }
      errors.push(...lands.splice(0));
    }
    expect(errors).toHaveLength(16);
    for (const e of errors) expect(Math.abs(e)).toBeLessThanOrEqual(TICK);
  });

  it('open true starts a pad at the landing that runs the window length in overlapping segments; open false damps and ends it', () => {
    let st = windowEvent(WINDOW_IDLE, 'prism', false, 0.4, 5);
    for (let t = 5; t < 5.38; t += 0.025) st = run(st, t).st;
    st = windowEvent(st, 'prism', true, 1.2, 5.4);
    const pad: number[] = [];
    let now = 5.4;
    for (; now < 6.6; now += 0.025) {
      const r = run(st, now);
      st = r.st;
      for (const d of r.due) if (d.kind === 'pad') pad.push(d.time);
    }
    expect(pad[0]).toBeCloseTo(5.4, 9);
    expect(pad.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < pad.length; i++) expect((pad[i] ?? 0) - (pad[i - 1] ?? 0)).toBeCloseTo(PAD_SEG_SEC, 9);
    expect((pad[pad.length - 1] ?? 0) + PAD_SEG_SEC).toBeGreaterThanOrEqual(6.6 - 0.05);
    // An early close ends the pad at once and books a damp.
    let early = windowEvent(WINDOW_IDLE, 'prism', true, 5, 20);
    early = run(early, 20).st;
    early = windowEvent(early, 'prism', false, 0, 20.5);
    const r = run(early, 20.5);
    expect(r.due.filter((d) => d.kind === 'pad')).toHaveLength(0);
    expect(r.due.filter((d) => d.kind === 'damp')).toHaveLength(1);
    expect(run(r.st, 21).due).toEqual([]);
  });

  it('open true with no run up plays the landing at once and skips the first note', () => {
    const st = windowEvent(WINDOW_IDLE, 'prism', true, 1, 3);
    const r = run(st, 3);
    expect(r.due.map((d) => d.kind)).toEqual(['land', 'pad']);
    expect(r.due[0]?.time ?? 0).toBeGreaterThan(3);
  });

  it('pad length is clamped, an unknown length gets a default, and another boss starts fresh', () => {
    const long = windowEvent(WINDOW_IDLE, 'warden', true, 60, 0);
    expect(long.padEnd).toBeLessThanOrEqual(PAD_MAX_SEC + 0.1);
    const unknown = windowEvent(WINDOW_IDLE, 'warden', true, 0, 0);
    expect(unknown.padEnd).toBeGreaterThan(1);
    const other = windowEvent(long, 'tempest', false, 1, 1);
    expect(other.open).toBe(false);
    expect(other.id).toBe('tempest');
  });

  it('a run up that moves far later starts a new estimate, and a landing long past is dropped', () => {
    let st = windowEvent(WINDOW_IDLE, 'prism', false, 1, 0);
    st = windowEvent(st, 'prism', false, 1, 0.1);
    expect(st.openAt).toBe(1);
    st = windowEvent(st, 'prism', false, 2, 0.3);
    expect(st.openAt).toBeCloseTo(2.3, 9);
    expect(st.rise).toBe(0);
    const stale = run(st, 2.3 + LAND_STALE_SEC + 0.1);
    expect(stale.due).toEqual([]);
    expect(stale.st.openAt).toBeNull();
  });
});

describe('crack rules', () => {
  const note = (voice: number, step: number): { voice: number; step: number } => ({ voice, step });

  it('each stage drops the highest voice left; the main line thins to the beat when nothing else remains', () => {
    expect(crackKeeps(3, 0, note(2, 3))).toBe(true);
    expect(crackKeeps(3, 1, note(2, 0))).toBe(false);
    expect(crackKeeps(3, 1, note(1, 3))).toBe(true);
    expect(crackKeeps(3, 2, note(1, 0))).toBe(false);
    expect(crackKeeps(3, 2, note(0, 3))).toBe(true);
    expect(crackKeeps(1, 1, note(0, 3))).toBe(false);
    expect(crackKeeps(1, 1, note(0, 4))).toBe(true);
    expect(crackKeeps(2, 2, note(0, 6))).toBe(false);
    expect(crackKeeps(2, 2, note(0, 8))).toBe(true);
  });

  it('a stage counts once, only for the live boss, and a new boss starts uncracked', () => {
    const b = bossEnter(null, 'bastion', 3, 0);
    const one = bossCrack(b, 'bastion', 1);
    expect(one.cracked).toBe(1);
    expect(bossCrack(one, 'bastion', 1)).toBe(one);
    expect(bossCrack(one, 'tempest', 2)).toBe(one);
    expect(bossCrack(one, 'bastion', 2).cracked).toBe(2);
    expect(bossCrack({ ...one, downStep: 4 }, 'bastion', 2).cracked).toBe(1);
    expect(bossEnter(one, 'tempest', 3, 20).cracked).toBe(0);
  });

  it('stage 2 is lower and longer than stage 1 on every chord', () => {
    for (let bar = 0; bar < 8; bar++) {
      const h = harmonyForBar(bar, BOSS_KEYS[3]);
      const a = crackVoice(1, h);
      const b = crackVoice(2, h);
      expect(b.midi).toBeLessThan(a.midi);
      expect(b.dur).toBeGreaterThan(a.dur);
      expect(a.timbre).toBe(CUE_TIMBRES.crack);
      expect(b.timbre).toBe(CUE_TIMBRES.crackDeep);
    }
  });
});

describe('boss hit tick rules', () => {
  it('the kind mirrors match the sim enum', () => {
    expect(KIND_BOSS).toBe(Kind.Boss);
    expect(KIND_BOSS_PART).toBe(Kind.BossPart);
    expect(isBossHitKind(Kind.Boss)).toBe(true);
    expect(isBossHitKind(Kind.BossPart)).toBe(true);
    expect(isBossHitKind(Kind.Grunt)).toBe(false);
    expect(isBossHitKind(undefined)).toBe(false);
  });

  it('at most 10 ticks in any second under a 1 kHz hit stream', () => {
    let g = BOSS_TICK_GATE_INIT;
    const times: number[] = [];
    for (let ms = 0; ms < 3000; ms++) {
      const r = gateBossTick(g, ms / 1000);
      g = r.gate;
      if (r.ok) times.push(ms / 1000);
    }
    for (let i = 0; i < times.length; i++) {
      const inSecond = times.filter((t) => t >= (times[i] ?? 0) && t < (times[i] ?? 0) + 1 - 1e-6);
      expect(inSecond.length).toBeLessThanOrEqual(BOSS_TICK_RATE_MAX);
    }
    expect(times.length).toBeGreaterThanOrEqual(28);
    expect(BOSS_TICK_GAP_SEC).toBeCloseTo(0.1, 9);
  });

  it('the tick sits low and alternates root and fifth', () => {
    const a = bossTickVoice(harmony, 0);
    const b = bossTickVoice(harmony, 1);
    expect(b.midi).toBeGreaterThan(a.midi);
    expect(a.midi).toBeLessThan(66);
  });
});

describe('gain budget', () => {
  it('the cue reserve is part of the boss budget and the pad and tick fit inside it', () => {
    expect(windowVoice('pad', harmony).gain + bossTickVoice(harmony, 0).gain).toBeLessThanOrEqual(BOSS_CUE_RESERVE + 1e-9);
    expect(BOSS_CUE_RESERVE).toBeLessThan(GAIN_CEILING / 4);
  });
});

// ---------------------------------------------------------------------------------------
// Through the real entry points.

interface LooseBus {
  emit(k: string, payload: unknown): void;
}

let ctx: FakeContext;
let timer: FakeTimer;
let bus: Bus;
let loose: LooseBus;
let graph: MusicGraph | null;
let log: (NoteLog & { now: number })[];
let uninstall: () => void;

function advance(sec: number, each?: () => void): void {
  const n = Math.round(sec / TICK);
  for (let i = 0; i < n; i++) {
    ctx.currentTime += TICK;
    each?.();
    timer.fire();
  }
}

const role = (r: NoteLog['role']): (NoteLog & { now: number })[] => log.filter((n) => n.role === r);
const SIX: EnemyKind[] = ['grunt', 'wanderer', 'weaver', 'pinwheel', 'dart', 'snake'];

beforeEach(() => {
  ctx = new FakeContext();
  timer = new FakeTimer();
  bus = new Bus();
  loose = bus as unknown as LooseBus;
  graph = { ctx, master: new FakeNode() };
  log = [];
  setMusicVolume(50);
  uninstall = initMusic({ tune: 'neon', bus, graph: () => graph, timer, visibility: null, volume: 50, onNote: (n) => log.push({ ...n, now: ctx.currentTime }) });
});

afterEach(() => {
  stopMusic();
  uninstall();
});

describe('window cue through the bus', () => {
  const CYCLE = 3.5;
  const RUN_UP = 2;
  const WINDOW = 1.2;

  /** Play `cycles` windows of one boss; returns each cycle's opening and closing time on the audio clock. */
  function playCycles(cycles: number, extra?: () => void): { open: number; close: number }[] {
    const out: { open: number; close: number }[] = [];
    const start = ctx.currentTime + TICK;
    for (let k = 0; k < cycles; k++) {
      const open = start + k * CYCLE + RUN_UP;
      const close = open + WINDOW;
      out.push({ open, close });
    }
    let i = 0;
    const end = start + cycles * CYCLE;
    advance(end - ctx.currentTime, () => {
      const t = ctx.currentTime;
      const k = Math.min(cycles - 1, Math.floor((t - start) / CYCLE));
      const w = out[k];
      if (!w) return;
      i++;
      // The handler runs up to 20 ms after the sim emitted the event: the sim clock is `t - jit`.
      const jit = hash01(k, i) * 0.02;
      const sim = t - jit;
      if (sim < w.open - 1e-9) loose.emit('sim:bossWindow', { id: 'prism', open: false, secondsLeft: w.open - sim });
      else if (sim < w.close - 1e-9) {
        if (!opened.has(k)) {
          opened.add(k);
          loose.emit('sim:bossWindow', { id: 'prism', open: true, secondsLeft: WINDOW });
        }
      } else if (!closed.has(k)) {
        closed.add(k);
        loose.emit('sim:bossWindow', { id: 'prism', open: false, secondsLeft: 0 });
      }
      extra?.();
    });
    return out;
  }
  const opened = new Set<number>();
  const closed = new Set<number>();

  beforeEach(() => {
    opened.clear();
    closed.clear();
    startMusic(33);
    advance(1.3);
    loose.emit('sim:bossEnter', { id: 'prism', tier: 4 });
    advance(BAR_SEC * 2);
  });

  it('16 cycles with jitter: the landing is within one scheduler tick of the opening, the first note a gap before, a pad and a damp each cycle', () => {
    const cycles = playCycles(16);
    const lands = role('bossWindow').filter((n) => n.cue === 'land');
    const rises = role('bossWindow').filter((n) => n.cue === 'rise');
    expect(lands).toHaveLength(16);
    expect(rises).toHaveLength(16);
    cycles.forEach((w, k) => {
      const land = lands[k];
      const rise = rises[k];
      expect(Math.abs((land?.time ?? 0) - w.open), `cycle ${k}`).toBeLessThanOrEqual(TICK + 1e-9);
      expect(Math.abs((land?.time ?? 0) - (rise?.time ?? 0) - RISE_GAP_SEC)).toBeLessThanOrEqual(TICK);
      expect(land?.midi ?? 0).toBeGreaterThan(rise?.midi ?? 99);
      const pads = role('bossWindow').filter((n) => n.cue === 'pad' && n.time >= w.open - 0.05 && n.time <= w.close + 0.2);
      expect(pads.length, `cycle ${k}`).toBeGreaterThanOrEqual(3);
      expect(pads.length).toBeLessThanOrEqual(5);
      expect(Math.max(...pads.map((p) => p.time))).toBeLessThanOrEqual(w.close + 0.15);
      const damps = role('bossWindow').filter((n) => n.cue === 'damp' && n.time >= w.close - 0.01 && n.time <= w.close + 0.2);
      expect(damps, `cycle ${k}`).toHaveLength(1);
    });
  });

  it('nothing plays at volume 0, with no boss, or after the boss dies', () => {
    setMusicVolume(0);
    playCycles(1);
    expect(role('bossWindow')).toHaveLength(0);
    setMusicVolume(50);
    loose.emit('sim:bossWindow', { id: 'warden', open: true, secondsLeft: 1 });
    advance(0.5);
    expect(role('bossWindow')).toHaveLength(0);
    bus.emit('sim:bossDown', { id: 'prism', x: 0, y: 0 });
    loose.emit('sim:bossWindow', { id: 'prism', open: true, secondsLeft: 1 });
    advance(0.5);
    expect(role('bossWindow')).toHaveLength(0);
  });

  it('every window sound is audible and inside the cue register', () => {
    playCycles(2);
    for (const n of role('bossWindow')) {
      expect(n.midi ?? 0).toBeGreaterThanOrEqual(40);
      expect(n.midi ?? 0).toBeLessThanOrEqual(96);
      expect(n.gain).toBeGreaterThan(0);
    }
  });
});

describe('crack through the bus', () => {
  beforeEach(() => {
    startMusic(51);
    advance(1.3);
    loose.emit('sim:bossEnter', { id: 'prism', tier: 4 });
    advance(BAR_SEC * 2);
    bus.emit('sim:bossPhase', { id: 'prism', phase: 3, phases: 4 });
    advance(BAR_SEC * 3);
  });

  it('one stinger per stage, stage 2 lower, repeats ignored; each stage thins the motif for the rest of the fight', () => {
    const voices = (from: number): Set<number> => new Set(role('boss').filter((n) => n.now > from).map((n) => n.voice ?? 0));
    expect(voices(0).size).toBe(2);
    const t1 = ctx.currentTime;
    loose.emit('sim:bossCrack', { id: 'prism', stage: 1 });
    loose.emit('sim:bossCrack', { id: 'prism', stage: 1 });
    advance(BAR_SEC * 3);
    expect(role('bossCrack')).toHaveLength(1);
    expect([...voices(t1)]).toEqual([0]);
    const t2 = ctx.currentTime;
    loose.emit('sim:bossCrack', { id: 'prism', stage: 2 });
    loose.emit('sim:bossCrack', { id: 'prism', stage: 2 });
    loose.emit('sim:bossCrack', { id: 'prism', stage: 1 });
    advance(BAR_SEC * 3);
    const cracks = role('bossCrack');
    expect(cracks.map((n) => n.voice)).toEqual([1, 2]);
    expect(cracks[1]?.midi ?? 99).toBeLessThan(cracks[0]?.midi ?? 0);
    const after = role('boss').filter((n) => n.now > t2);
    expect(after.length).toBeGreaterThan(0);
    for (const n of after) expect(n.step % 4, `step ${n.step}`).toBe(0);
    // Still thinned a long way on, and the first stage's stinger did not repeat.
    advance(BAR_SEC * 6);
    expect(role('bossCrack')).toHaveLength(2);
    for (const n of role('boss').filter((x) => x.now > t2 + BAR_SEC)) expect(n.voice).toBe(0);
  });

  it('a crack for another boss, or after the down, does nothing', () => {
    loose.emit('sim:bossCrack', { id: 'warden', stage: 1 });
    bus.emit('sim:bossDown', { id: 'prism', x: 0, y: 0 });
    loose.emit('sim:bossCrack', { id: 'prism', stage: 1 });
    advance(BAR_SEC);
    expect(role('bossCrack')).toHaveLength(0);
  });
});

describe('boss hit tick through the bus', () => {
  const hit = (kind: Kind): void => bus.emit('fx:hit', { x: 0, y: 0, kind, id: 1, blocked: false });

  it('ticks on boss hits at most 10 a second, lower than an enemy tick, and not before the boss enters', () => {
    startMusic(7);
    advance(1.3);
    hit(Kind.Boss);
    advance(0.3);
    expect(role('bossTick')).toHaveLength(0);
    loose.emit('sim:bossEnter', { id: 'bastion', tier: 3 });
    advance(0.5);
    advance(3, () => {
      hit(Kind.Boss);
      hit(Kind.BossPart);
    });
    const ticks = role('bossTick');
    expect(ticks.length).toBeGreaterThanOrEqual(25);
    for (const t of ticks) {
      const inSecond = ticks.filter((x) => x.time >= t.time && x.time < t.time + 1 - 1e-6);
      expect(inSecond.length).toBeLessThanOrEqual(BOSS_TICK_RATE_MAX);
    }
    advance(0.5, () => hit(Kind.Grunt));
    const enemy = role('hit');
    expect(enemy.length).toBeGreaterThan(0);
    for (const e of enemy) expect(e.midi ?? 0).toBeGreaterThan(Math.max(...ticks.map((t) => t.midi ?? 0)));
  });

  it('a blocked hit on a closed core still plays the deflect, not a tick', () => {
    startMusic(7);
    advance(1.3);
    loose.emit('sim:bossEnter', { id: 'bastion', tier: 3 });
    advance(0.5);
    bus.emit('fx:hit', { x: 0, y: 0, kind: Kind.Boss, id: 1, blocked: true });
    advance(0.3);
    expect(role('deflect').length).toBeGreaterThan(0);
    expect(role('bossTick')).toHaveLength(0);
  });
});

describe('voice cap with every cue at once', () => {
  it('16 voices, the bed never stolen, boss class inside the pool share, over a long fight', () => {
    startMusic(51);
    bus.emit('sim:threat', { level: 1 });
    for (const k of SIX) bus.emit('sim:enemyEnter', { kind: k, live: 1 });
    advance(BAR_SEC * 3);
    loose.emit('sim:bossEnter', { id: 'prism', tier: 4 });
    bus.emit('sim:bossPhase', { id: 'prism', phase: 4, phases: 4 });
    let maxVoices = 0;
    let maxBoss = 0;
    let n = 0;
    advance(40, () => {
      n++;
      const t = n * TICK;
      const phase = t % 3.5;
      if (phase < 2) loose.emit('sim:bossWindow', { id: 'prism', open: false, secondsLeft: 2 - phase });
      else if (phase < 2 + TICK) loose.emit('sim:bossWindow', { id: 'prism', open: true, secondsLeft: 1.2 });
      else if (phase >= 3.2 && phase < 3.2 + TICK) loose.emit('sim:bossWindow', { id: 'prism', open: false, secondsLeft: 0 });
      if (n === 200) loose.emit('sim:bossCrack', { id: 'prism', stage: 1 });
      if (n === 900) loose.emit('sim:bossCrack', { id: 'prism', stage: 2 });
      bus.emit('fx:hit', { x: 0, y: 0, kind: Kind.Boss, id: 1, blocked: false });
      bus.emit('fx:hit', { x: 0, y: 0, kind: Kind.Grunt, id: 2, blocked: false });
      const st = musicState();
      maxVoices = Math.max(maxVoices, st.voices);
      maxBoss = Math.max(maxBoss, st.bossVoices);
    });
    const st = musicState();
    expect(maxVoices).toBeLessThanOrEqual(MUSIC_VOICE_CAP);
    expect(st.bedSteals).toBe(0);
    expect(maxBoss).toBeLessThanOrEqual(MUSIC_VOICE_CAP - BED_VOICE_MAX);
    expect(role('bossWindow').length).toBeGreaterThan(40);
    expect(role('bossCrack')).toHaveLength(2);
    expect(role('bossTick').length).toBeGreaterThan(100);
  });
});

