// Enemy layers through the real entry points with a fake audio clock and timer.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BED_VOICE_MAX, MOTIF_VOICE_MAX, MUSIC_VOICE_CAP } from '../../../src/audio/music/engine';
import {
  initMusic,
  musicState,
  startMusic,
  stopMusic,
  wireMusic,
  type MusicGraph,
  type MusicOptions,
  type NoteLog,
} from '../../../src/audio/music/index';
import { inChord, harmonyAtStep } from '../../../src/audio/music/harmony';
import { CUT1_KEEP, LAYER_KINDS, LAYERS_FULL } from '../../../src/audio/music/layers';

/** Notes in a kind's entrance phrase. */
const phraseLen = (k: EnemyKind): number => LAYERS_FULL[k].phrase.length;
import { GAIN_CEILING, STINGER_GAIN } from '../../../src/audio/music/lifecycle';
import { START_LEAD_SEC, TICK_MS } from '../../../src/audio/music/scheduler';
import { BAR_SEC, STEP_SEC, STEPS_PER_BAR } from '../../../src/audio/music/track';
import { Bus } from '../../../src/core/events';
import type { EnemyKind } from '../../../src/levelgen/leveldef';
import { FakeContext, FakeNode, FakeTimer } from './fakeAudio';

let ctx: FakeContext;
let timer: FakeTimer;
let bus: Bus;
let graph: MusicGraph | null;
let log: NoteLog[];
let uninstall: () => void;
let maxVoices = 0;

const T0 = START_LEAD_SEC; // audio time of step 0 when started at time 0
const stepTime = (step: number): number => T0 + step * STEP_SEC;

function advance(sec: number, check?: () => void): void {
  const n = Math.round(sec / (TICK_MS / 1000));
  for (let i = 0; i < n; i++) {
    ctx.currentTime += TICK_MS / 1000;
    timer.fire();
    maxVoices = Math.max(maxVoices, musicState().voices);
    check?.();
  }
}

function install(extra: Partial<MusicOptions> = {}): void {
  uninstall?.();
  uninstall = initMusic({ tune: 'neon',
    bus,
    graph: () => graph,
    timer,
    visibility: null,
    volume: 50,
    onNote: (n) => log.push(n),
    ...extra,
  });
}

const of = (kind: EnemyKind, role: NoteLog['role']): NoteLog[] => log.filter((n) => n.kind === kind && n.role === role);

beforeEach(() => {
  ctx = new FakeContext();
  timer = new FakeTimer();
  bus = new Bus();
  graph = { ctx, master: new FakeNode() };
  log = [];
  maxVoices = 0;
  install();
});

afterEach(() => {
  uninstall();
});

describe('enemy layers in the music loop', () => {
  it('stinger on the next sixteenth, motif on the next bar line with a one bar fade in', () => {
    startMusic(11);
    advance(0.6);
    const next = musicState().nextStep;
    bus.emit('sim:enemyEnter', { kind: 'grunt', live: 1 });
    advance(0.2);
    const st = of('grunt', 'stinger');
    // The whole entrance phrase, from the next sixteenth, on the grid, in the chord.
    expect(st).toHaveLength(phraseLen('grunt'));
    expect(st[0]?.step).toBe(next);
    expect(st[0]?.time).toBeCloseTo(stepTime(next), 9);
    expect(st[0]?.gain).toBe(STINGER_GAIN);
    st.forEach((n, i) => {
      expect(n.step).toBe(next + (LAYERS_FULL.grunt.phrase[i]?.at ?? -1));
      expect(n.time).toBeCloseTo(stepTime(n.step), 9);
      expect(inChord(n.midi ?? 0, harmonyAtStep(n.step))).toBe(true);
      expect(n.gain).toBeLessThanOrEqual(STINGER_GAIN);
    });
    // Quantized to the audio clock: never in the past, at most one lookahead plus a step ahead.
    expect(st[0]?.time ?? 0).toBeGreaterThanOrEqual(0.6);
    advance(BAR_SEC * 3);
    const motif = of('grunt', 'motif');
    const join = Math.ceil((next + 1) / STEPS_PER_BAR) * STEPS_PER_BAR;
    expect(motif.length).toBeGreaterThan(0);
    expect(Math.min(...motif.map((n) => n.step))).toBeGreaterThanOrEqual(join);
    expect(motif[0]?.time).toBeCloseTo(stepTime(motif[0]?.step ?? 0), 9);
    // Fade in: notes inside the join bar are quieter than the same pattern step a phrase later.
    const inFade = motif.filter((n) => n.step < join + STEPS_PER_BAR);
    const full = motif.filter((n) => n.step >= join + STEPS_PER_BAR);
    expect(inFade.length).toBeGreaterThan(0);
    expect(Math.max(...inFade.map((n) => n.gain))).toBeLessThan(Math.max(...full.map((n) => n.gain)));
  });

  it('exit tail: the motif keeps playing for 2 bars, then stops', () => {
    startMusic(12);
    bus.emit('sim:enemyEnter', { kind: 'grunt', live: 1 });
    advance(BAR_SEC * 4);
    const exitStep = musicState().nextStep;
    bus.emit('sim:enemyExit', { kind: 'grunt' });
    advance(BAR_SEC * 5);
    const leave = Math.ceil((exitStep + 2 * STEPS_PER_BAR) / STEPS_PER_BAR) * STEPS_PER_BAR;
    const after = of('grunt', 'motif').filter((n) => n.step >= exitStep);
    expect(after.length).toBeGreaterThan(0);
    expect(Math.max(...after.map((n) => n.step))).toBeLessThan(leave);
    expect(Math.max(...after.map((n) => n.step))).toBeGreaterThanOrEqual(leave - STEPS_PER_BAR);
    expect(musicState().layers).toEqual([]);
    expect(musicState().motifVoices).toBe(0);
  });

  it('re-entry during the tail keeps the motif going with no gap', () => {
    startMusic(13);
    bus.emit('sim:enemyEnter', { kind: 'grunt', live: 1 });
    advance(BAR_SEC * 4);
    bus.emit('sim:enemyExit', { kind: 'grunt' });
    advance(BAR_SEC * 1.5);
    bus.emit('sim:enemyEnter', { kind: 'grunt', live: 1 });
    advance(BAR_SEC * 6);
    expect(of('grunt', 'stinger')).toHaveLength(2 * phraseLen('grunt'));
    const steps = of('grunt', 'motif').map((n) => n.step);
    const first = Math.min(...steps);
    const last = Math.max(...steps);
    // Grunt pulses every quarter: no gap longer than one beat from join to the end.
    const sorted = [...steps].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect((sorted[i] ?? 0) - (sorted[i - 1] ?? 0)).toBeLessThanOrEqual(4);
    expect(last - first).toBeGreaterThan(STEPS_PER_BAR * 9);
    expect(musicState().layers).toEqual(['grunt']);
  });

  it('6 kinds plus the bed at full threat stay within 16 voices, steal motifs first, and sum under 1.0', () => {
    startMusic(14);
    bus.emit('sim:threat', { level: 1 });
    advance(1);
    const six: EnemyKind[] = ['snake', 'splime', 'bulwark', 'wanderer', 'charger', 'grunt'];
    for (const k of six) bus.emit('sim:enemyEnter', { kind: k, live: 1 });
    advance(BAR_SEC * 10, () => {
      expect(musicState().voices).toBeLessThanOrEqual(MUSIC_VOICE_CAP);
      expect(musicState().motifVoices).toBeLessThanOrEqual(6 + 1);
    });
    expect(maxVoices).toBeLessThanOrEqual(MUSIC_VOICE_CAP);
    expect(musicState().layers).toEqual(six);
    // Motifs fit beside the bed: the cap never cut a bed voice.
    expect(musicState().bedSteals).toBe(0);
    // Summed layer gain, conservatively: for every step, the loudest note of each bed layer and
    // of each motif kind over the bar before it (pads and long notes sustain), plus a stinger.
    const lastStep = Math.max(...log.map((n) => n.step));
    let checked = 0;
    for (let s = 3 * STEPS_PER_BAR; s <= lastStep; s++) {
      const loudest = new Map<string, number>();
      for (const n of log) {
        if (n.step > s || n.step <= s - STEPS_PER_BAR || n.role === 'stinger') continue;
        const key = n.role === 'bed' ? `bed:${n.layer ?? ''}` : `motif:${n.kind ?? ''}`;
        loudest.set(key, Math.max(loudest.get(key) ?? 0, n.gain));
      }
      const sum = [...loudest.values()].reduce((a, b) => a + b, 0);
      expect(sum + STINGER_GAIN, `step ${s}`).toBeLessThanOrEqual(GAIN_CEILING + 1e-9);
      checked++;
    }
    expect(checked).toBeGreaterThan(STEPS_PER_BAR * 4);
    expect(log.some((n) => n.role === 'motif' && n.kind === 'snake')).toBe(true);
  });

  it('the bed alone never holds more than BED_VOICE_MAX voices, even at full threat', () => {
    startMusic(20);
    bus.emit('sim:threat', { level: 1 });
    advance(BAR_SEC * 9);
    expect(maxVoices).toBeLessThanOrEqual(BED_VOICE_MAX);
    expect(BED_VOICE_MAX + MOTIF_VOICE_MAX).toBe(MUSIC_VOICE_CAP);
    expect(MOTIF_VOICE_MAX).toBe(6);
  });

  it('12 kinds at once: still capped at 16 voices', () => {
    startMusic(15);
    bus.emit('sim:threat', { level: 1 });
    for (const k of LAYER_KINDS) bus.emit('sim:enemyEnter', { kind: k, live: 1 });
    advance(BAR_SEC * 6, () => expect(musicState().voices).toBeLessThanOrEqual(MUSIC_VOICE_CAP));
    expect(of('sower', 'motif').length + of('blink', 'motif').length).toBeGreaterThan(0);
  });

  it('level restart restarts the loop and the layers from bar 0 deterministically', () => {
    const run = (): NoteLog[] => {
      log = [];
      // No threat change: the smoother is tick phase sensitive, the patterns must not be.
      startMusic(99);
      advance(0.3);
      bus.emit('sim:enemyEnter', { kind: 'pinwheel', live: 1 });
      bus.emit('sim:enemyEnter', { kind: 'wanderer', live: 2 });
      advance(BAR_SEC * 3);
      bus.emit('sim:enemyExit', { kind: 'pinwheel' });
      advance(BAR_SEC * 3);
      const t0 = log[0]?.time ?? 0;
      const r = (x: number): number => Math.round(x * 1e6) / 1e6;
      return log.map((n) => ({ ...n, time: r(n.time - t0), gain: r(n.gain) }));
    };
    const a = run();
    // Restart mid level with layers live: startMusic again from a later clock (whole ticks,
    // so the threat smoother sees the same tick times).
    bus.emit('sim:enemyEnter', { kind: 'bulwark', live: 1 });
    ctx.currentTime += 15 * (TICK_MS / 1000);
    const b = run();
    expect(b.length).toBeGreaterThan(20);
    expect(b).toEqual(a);
    expect(b.some((n) => n.kind === 'bulwark')).toBe(false);
  });

  it('pause holds layers silent and resumes them on the next bar line', () => {
    startMusic(16);
    bus.emit('sim:enemyEnter', { kind: 'snake', live: 1 });
    advance(BAR_SEC * 3);
    bus.emit('game:pause');
    const n = log.length;
    advance(BAR_SEC * 3);
    expect(log.length).toBe(n);
    bus.emit('game:resume');
    advance(BAR_SEC * 2);
    expect(of('snake', 'motif').length).toBeGreaterThan(0);
    expect(musicState().layers).toEqual(['snake']);
  });

  it('volume 0 schedules no layer notes but keeps layer state', () => {
    install({ volume: 0 });
    startMusic(17);
    bus.emit('sim:enemyEnter', { kind: 'dart', live: 5 });
    advance(BAR_SEC * 2);
    expect(log).toHaveLength(0);
    expect(musicState().layers).toEqual(['dart']);
  });

  it('cut 1 keeps every stinger and only the first three motifs', () => {
    install({ motifKinds: CUT1_KEEP });
    startMusic(18);
    for (const k of ['grunt', 'snake', 'blink'] as const) bus.emit('sim:enemyEnter', { kind: k, live: 1 });
    advance(BAR_SEC * 4);
    for (const k of ['grunt', 'snake', 'blink'] as const) expect(of(k, 'stinger')).toHaveLength(phraseLen(k));
    expect(of('grunt', 'motif').length).toBeGreaterThan(0);
    expect(of('snake', 'motif')).toHaveLength(0);
    expect(of('blink', 'motif')).toHaveLength(0);
  });

  it('events before startMusic are ignored; game:over clears the layers', () => {
    bus.emit('sim:enemyEnter', { kind: 'grunt', live: 1 });
    startMusic(19);
    expect(musicState().layers).toEqual([]);
    bus.emit('sim:enemyEnter', { kind: 'grunt', live: 1 });
    expect(musicState().layers).toEqual(['grunt']);
    bus.emit('game:over', { score: 0, stars: 0, levelIndex: 1, mode: 'adventure' });
    expect(musicState().playing).toBe(false);
    expect(musicState().layers).toEqual([]);
    stopMusic();
  });
});

describe('wireMusic', () => {
  it('is idempotent per bus and starts levels through levelStart', () => {
    uninstall();
    const opts = { graph: () => graph, timer, visibility: null, onNote: (n: NoteLog) => log.push(n) };
    const w1 = wireMusic(bus, opts);
    const w2 = wireMusic(bus, opts);
    expect(w2).toBe(w1);
    expect(w1.levelStart(5)).toBe(true);
    bus.emit('sim:enemyEnter', { kind: 'weaver', live: 1 });
    advance(0.3);
    // One subscription only: one stinger, not two.
    expect(of('weaver', 'stinger')).toHaveLength(phraseLen('weaver'));
    bus.emit('game:quit');
    expect(musicState().playing).toBe(false);
    w1.unwire();
    expect(wireMusic(bus, opts)).not.toBe(w1);
    uninstall = (): void => wireMusic(bus).unwire();
  });

  it('a second initMusic replaces the first instead of doubling handlers', () => {
    install();
    startMusic(6);
    bus.emit('sim:enemyEnter', { kind: 'weaver', live: 1 });
    advance(0.3);
    expect(of('weaver', 'stinger')).toHaveLength(phraseLen('weaver'));
  });
});
