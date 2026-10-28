// Deterministic load test (v2 fixes, GD "some glitches"): 60 s of a 400 entity wave with a
// jittery, stalling main thread, enemy churn, a steady stream of kills and four bombs. Asserts
// no note is ever scheduled in the past, the music never has more than 16 voices sounding,
// no step is lost to a stall and the kill gate holds its budget. Jitter comes from hash01,
// so every run is identical.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MUSIC_VOICE_CAP, type VoiceClass, type VoiceTrace } from '../../../src/audio/music/engine';
import { initMusic, musicState, startMusic, type MusicGraph, type NoteLog } from '../../../src/audio/music/index';
import { KILL_BUDGET_MAX } from '../../../src/audio/music/kills';
import { STEPS_PER_BAR } from '../../../src/audio/music/track';
import { Bus, type Events } from '../../../src/core/events';
import { hash01 } from '../../../src/core/rng';
import type { EnemyKind } from '../../../src/levelgen/leveldef';
import { FakeContext, FakeNode, FakeTimer } from './fakeAudio';

interface Span {
  cls: VoiceClass;
  start: number;
  end: number;
  scheduledAt: number;
}

let ctx: FakeContext;
let timer: FakeTimer;
let bus: Bus;
let notes: (NoteLog & { now: number })[];
let spans: Map<number, Span>;
let uninstall: () => void;

const ROSTER: readonly EnemyKind[] = ['grunt', 'weaver', 'dart', 'snake', 'charger', 'splime'];
const COLOURS: readonly Events['fx:kill']['colour'][] = ['blue', 'green', 'orange', 'cyan', 'charger', 'splime', 'red', 'yellow'];

/** Most spans sounding at once (start inclusive, end exclusive). */
function peakConcurrency(list: readonly Span[]): number {
  const ev: [number, number][] = [];
  for (const s of list) {
    if (!(s.end > s.start)) continue;
    ev.push([s.start, 1], [s.end, -1]);
  }
  // Ends sort before starts at the same instant: a voice ending at t frees its slot for t.
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0;
  let best = 0;
  for (const [, d] of ev) {
    cur += d;
    best = Math.max(best, cur);
  }
  return best;
}

beforeEach(() => {
  ctx = new FakeContext();
  timer = new FakeTimer();
  bus = new Bus();
  notes = [];
  spans = new Map();
  const graph: MusicGraph = { ctx, master: new FakeNode() };
  const trace: VoiceTrace = {
    start: (id, cls, start, end, scheduledAt) => spans.set(id, { cls, start, end, scheduledAt }),
    cut: (id, at) => {
      const s = spans.get(id);
      if (s) s.end = Math.min(s.end, at);
    },
  };
  uninstall = initMusic({
    bus,
    graph: () => graph,
    timer,
    visibility: null,
    volume: 60,
    trace,
    onNote: (n) => notes.push({ ...n, now: ctx.currentTime }),
  });
});

afterEach(() => uninstall());

/**
 * Drive 60 s of play. Each timer tick lands 25 ms plus 0 to 30 ms late; about one tick in 40
 * is a 120 to 200 ms stall (a heavy frame, GC or a bomb).
 */
function simulate(seconds: number): { kills: number; bombs: number } {
  startMusic(0x5eed);
  for (const k of ROSTER) bus.emit('sim:enemyEnter', { kind: k, live: 60 });
  let i = 0;
  let sinceThreat = 0;
  let kills = 0;
  let bombs = 0;
  const bombAt = [10, 25, 40, 55];
  const out = new Set<EnemyKind>();
  while (ctx.currentTime < seconds) {
    const stall = hash01(i, 0x57a1) < 0.025 ? 0.12 + hash01(i, 0x57a2) * 0.08 : 0;
    const dt = 0.025 + hash01(i, 0x5a17) * 0.03 + stall;
    const t = ctx.currentTime + dt;
    // Threat: up to a full 400 entity wave in 4 s, a dip after each bomb.
    sinceThreat += dt;
    if (sinceThreat >= 0.1) {
      sinceThreat = 0;
      const afterBomb = bombAt.some((b) => t >= b && t < b + 3);
      bus.emit('sim:threat', { level: afterBomb ? 0.35 : Math.min(1, t / 4) });
    }
    // Churn: every 8 s a kind exits, coming back 3 s later (inside its 2 bar tail or after it).
    const slot = Math.floor(t / 8);
    const kind = ROSTER[slot % ROSTER.length] ?? 'grunt';
    const phase = t - slot * 8;
    if (phase < 3 && !out.has(kind) && slot > 0) {
      out.add(kind);
      bus.emit('sim:enemyExit', { kind });
    } else if (phase >= 3 && out.has(kind)) {
      out.delete(kind);
      bus.emit('sim:enemyEnter', { kind, live: 1 });
    }
    // Kills: about 15 a second, with bursts of 5 and snake segment bursts.
    const h = hash01(i, 0x1c11);
    const n = h < 0.03 ? 5 : h < 0.4 ? 1 : 0;
    for (let k = 0; k < n; k++) {
      const colour = COLOURS[Math.floor(hash01(i * 7 + k, 0xc010) * COLOURS.length)] ?? 'blue';
      if (colour === 'cyan') for (let s = 0; s < 6; s++) bus.emit('fx:kill', { x: 0, y: 0, colour: 'cyan' });
      bus.emit('fx:kill', { x: 0, y: 0, colour });
      bus.emit('sfx', 'explode');
      kills++;
    }
    for (const b of bombAt) {
      if (ctx.currentTime < b && t >= b) {
        bus.emit('fx:bomb', { x: 0, y: 0 });
        bus.emit('sfx', 'bomb');
        bombs++;
      }
    }
    ctx.currentTime = t;
    timer.fire();
    i++;
  }
  return { kills, bombs };
}

describe('60 s of a 400 entity wave under timing jitter', () => {
  it('never schedules in the past, never exceeds the voice cap, never drops a step', () => {
    const run = simulate(60);
    expect(run.bombs).toBe(4);
    expect(run.kills).toBeGreaterThan(500);
    expect(notes.length).toBeGreaterThan(1500);
    // No note handed to the engine starts before the audio clock at that moment.
    for (const n of notes) expect(n.time).toBeGreaterThanOrEqual(n.now);
    for (const s of spans.values()) expect(s.start).toBeGreaterThanOrEqual(s.scheduledAt);
    // At most 16 music voices sound at once, stolen voices counted until their fade ends.
    expect(peakConcurrency([...spans.values()])).toBeLessThanOrEqual(MUSIC_VOICE_CAP);
    const st = musicState();    // Stalls up to 200 ms are inside the 250 ms lookahead: no hole in the beat.
    expect(st.skippedSteps).toBe(0);
    // The bed is never cut short, and kill accents never cut a motif.
    expect(st.bedSteals).toBe(0);
    expect(st.motifSteals).toBe(0);
  });

  it('the bed plays every bar and the kill gate keeps its budget', () => {
    simulate(60);
    const bars = new Set(notes.filter((n) => n.role === 'bed' && n.layer === 'pad').map((n) => Math.floor(n.step / STEPS_PER_BAR)));
    const lastBar = Math.max(...bars);
    for (let b = 0; b <= lastBar; b++) expect(bars.has(b)).toBe(true);
    const kills = notes.filter((n) => n.role === 'kill');
    const perBar = new Map<number, number>();
    for (const k of kills) perBar.set(Math.floor(k.step / STEPS_PER_BAR), (perBar.get(Math.floor(k.step / STEPS_PER_BAR)) ?? 0) + 1);
    for (const c of perBar.values()) expect(c).toBeLessThanOrEqual(KILL_BUDGET_MAX);
    // One kill note per sixteenth at most.
    expect(new Set(kills.map((k) => k.step)).size).toBe(kills.length);
    // Chords sit on beat lines.
    for (const c of notes.filter((n) => n.role === 'chord')) expect(c.step % 4).toBe(0);
    const s = musicState().kills;
    expect(s.notes).toBeGreaterThan(20);
    expect(s.chords).toBeGreaterThanOrEqual(4);
    // Well balanced: a share of kills is heard, never all of them.
    expect(s.notes + s.chords).toBeLessThan(s.seen / 2);
  });

  it('is deterministic: the same run schedules the same notes', () => {
    simulate(20);
    const a = notes.map((n) => `${n.role}:${n.layer ?? n.kind ?? n.source ?? ''}:${n.step}:${n.midi ?? ''}`);
    uninstall();
    ctx = new FakeContext();
    timer = new FakeTimer();
    bus = new Bus();
    notes = [];
    const graph: MusicGraph = { ctx, master: new FakeNode() };
    uninstall = initMusic({ bus, graph: () => graph, timer, visibility: null, volume: 60, onNote: (n) => notes.push({ ...n, now: ctx.currentTime }) });
    simulate(20);
    expect(notes.map((n) => `${n.role}:${n.layer ?? n.kind ?? n.source ?? ''}:${n.step}:${n.midi ?? ''}`)).toEqual(a);
  });
});
