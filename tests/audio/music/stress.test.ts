// Deterministic load test (v2 fixes, GD "some glitches"): 60 s of a 400 entity wave with a
// jittery, stalling main thread, enemy churn, a steady stream of kills, about 3000 non lethal
// hits (some of them shield blocks) and four bombs. Asserts no note is ever scheduled in the
// past, the music never has more than 16 voices sounding, no step is lost to a stall, the kill
// gate holds its budget and hit sounds hold their rate limits. Jitter comes from hash01, so
// every run is identical.
import { Kind } from '../../../src/game/world';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MUSIC_VOICE_CAP, type VoiceClass, type VoiceTrace } from '../../../src/audio/music/engine';
import { initMusic, musicState, startMusic, type MusicGraph, type NoteLog } from '../../../src/audio/music/index';
import { HIT_DUR_SEC } from '../../../src/audio/music/hits';
import { fitsHarmony, harmonyAtStep, inChord, inScale } from '../../../src/audio/music/harmony';
import { isKillSlot, KILL_BUDGET_MAX } from '../../../src/audio/music/kills';
import { STEPS_PER_BAR } from '../../../src/audio/music/track';
import { TUNES, type TuneId } from '../../../src/audio/music/tunes';
import { endlessTune, startTune } from '../../../src/audio/music/select';
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
/** Kills as combat sends them: kind and colour (a Mine pop carries the Sower colour). */
const KILLS: readonly [Kind, Events['fx:kill']['colour']][] = [
  [Kind.Grunt, 'blue'],
  [Kind.Weaver, 'green'],
  [Kind.Dart, 'orange'],
  [Kind.SnakeHead, 'cyan'],
  [Kind.Charger, 'charger'],
  [Kind.Splime, 'splime'],
  [Kind.GravityWell, 'red'],
  [Kind.Spawner, 'yellow'],
  [Kind.Mine, 'sower'],
  [Kind.Slime, 'slime'],
];
/** Kinds that take non lethal hits; Bulwark hits are shield blocks one time in three. */
const HIT_KINDS: readonly Kind[] = [Kind.Bulwark, Kind.Splime, Kind.SnakeHead, Kind.Charger, Kind.GravityWell, Kind.Spawner];

const SLACK_SEC = 1e-6;

/** Most spans sounding at once (start inclusive, end exclusive). */
function peakConcurrency(list: readonly Span[]): number {
  const ev: [number, number][] = [];
  for (const s of list) {
    if (!(s.end > s.start)) continue;
    // The engine pool counts a voice ending within a microsecond of a start as ended (float
    // drift on a step length that is not a binary fraction, such as 112 BPM); so does this sweep.
    ev.push([s.start, 1], [s.end - SLACK_SEC, -1]);
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

function setup(tune?: TuneId): void {
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
    ...(tune ? { tune } : {}),
    onNote: (n) => notes.push({ ...n, now: ctx.currentTime }),
  });
}



/**
 * Drive 60 s of play. Each timer tick lands 25 ms plus 0 to 30 ms late; about one tick in 40
 * is a 120 to 200 ms stall (a heavy frame, GC or a bomb).
 */
function simulate(seconds: number): { kills: number; bombs: number; hits: number; blocks: number } {
  startMusic(0x5eed);
  for (const k of ROSTER) bus.emit('sim:enemyEnter', { kind: k, live: 60 });
  let i = 0;
  let sinceThreat = 0;
  let kills = 0;
  let bombs = 0;
  let hits = 0;
  let blocks = 0;
  // The sim reuses one hit payload; so does this driver.
  const hitFx = { x: 0, y: 0, kind: Kind.Grunt, id: 1, blocked: false };
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
      const [kind, colour] = KILLS[Math.floor(hash01(i * 7 + k, 0xc010) * KILLS.length)] ?? [Kind.Grunt, 'blue'];
      if (kind === Kind.SnakeHead) for (let s = 0; s < 6; s++) bus.emit('fx:kill', { x: 0, y: 0, colour: 'cyan', kind: Kind.SnakeBody, id: 100 + s });
      bus.emit('fx:kill', { x: 0, y: 0, colour, kind, id: 1 });
      bus.emit('sfx', 'explode');
      kills++;
    }
    // Hits: 0 to 4 per tick (about 50 a second, some 3000 in 60 s), from mixed kinds.
    const nh = Math.floor(hash01(i, 0x4171) * 5.4);
    for (let k = 0; k < nh; k++) {
      const kind = HIT_KINDS[Math.floor(hash01(i * 5 + k, 0x4172) * HIT_KINDS.length)] ?? Kind.Bulwark;
      hitFx.kind = kind;
      hitFx.blocked = kind === Kind.Bulwark && hash01(i * 5 + k, 0x4173) < 1 / 3;
      bus.emit('fx:hit', hitFx);
      hits++;
      if (hitFx.blocked) blocks++;
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
  return { kills, bombs, hits, blocks };
}

/** Most notes inside any half open window [t, t + width). */
function maxInWindow(list: readonly NoteLog[], width: number): number {
  const times = list.map((n) => n.time).sort((a, b) => a - b);
  let best = 0;
  let j = 0;
  for (let i = 0; i < times.length; i++) {
    while (j < times.length && (times[j] ?? Infinity) < (times[i] ?? 0) + width) j++;
    best = Math.max(best, j - i);
  }
  return best;
}

describe.each(TUNES.map((t) => [t.id, t] as const))('60 s of a 400 entity wave under timing jitter, tune %s', (id, tune) => {
  beforeEach(() => setup(id));
  afterEach(() => uninstall());

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
    const st = musicState();
    // Stalls up to 200 ms are inside the 250 ms lookahead: no hole in the beat.
    expect(st.skippedSteps).toBe(0);
    // The bed is never cut short, and kill accents and hit sounds never cut a motif.
    expect(st.bedSteals).toBe(0);
    expect(st.motifSteals).toBe(0);
  });

  it('about 3000 hits: rate limited per kind, deflects apart, cap and clock still hold', () => {
    const run = simulate(60);
    expect(run.hits).toBeGreaterThan(2500);
    expect(run.hits).toBeLessThan(3600);
    expect(run.blocks).toBeGreaterThan(100);
    const hits = notes.filter((n) => n.role === 'hit');
    const deflects = notes.filter((n) => n.role === 'deflect');
    // Each kind is heard; at most 8 ticks a second per kind, 4 deflects a second.
    const bySource = new Map<string, NoteLog[]>();
    for (const h of hits) bySource.set(h.source ?? '', [...(bySource.get(h.source ?? '') ?? []), h]);
    expect(new Set(bySource.keys())).toEqual(new Set(['bulwark', 'splime', 'snake', 'charger', 'well', 'spawner']));
    for (const list of bySource.values()) expect(maxInWindow(list, 1)).toBeLessThanOrEqual(8);
    expect(deflects.length).toBeGreaterThan(20);
    expect(maxInWindow(deflects, 1)).toBeLessThanOrEqual(4);
    // Balanced: a share of hits is heard, never all of them.
    expect(hits.length + deflects.length).toBeLessThan(run.hits / 3);
    expect(hits.length).toBeGreaterThan(300);
    // One hit sound at a time.
    const lane = [...hits, ...deflects].sort((a, b) => a.time - b.time);
    for (let i = 1; i < lane.length; i++) expect((lane[i]?.time ?? 0) - (lane[i - 1]?.time ?? 0)).toBeGreaterThanOrEqual(HIT_DUR_SEC - 1e-9);
    // No hit is scheduled in the past, and the voice cap holds with hits counted.
    for (const n of [...hits, ...deflects]) expect(n.time).toBeGreaterThanOrEqual(n.now);
    for (const s of spans.values()) expect(s.start).toBeGreaterThanOrEqual(s.scheduledAt);
    expect(peakConcurrency([...spans.values()])).toBeLessThanOrEqual(MUSIC_VOICE_CAP);
    const st = musicState();
    expect(st.skippedSteps).toBe(0);
    expect(st.bedSteals).toBe(0);
    expect(st.motifSteals).toBe(0);
    // Kill notes keep their budget beside the hits.
    const perBar = new Map<number, number>();
    for (const k of notes.filter((n) => n.role === 'kill')) perBar.set(Math.floor(k.step / STEPS_PER_BAR), (perBar.get(Math.floor(k.step / STEPS_PER_BAR)) ?? 0) + 1);
    for (const c of perBar.values()) expect(c).toBeLessThanOrEqual(KILL_BUDGET_MAX);
    // Mine and Slime pops and burst segments are voiced by kind.
    const sources = new Set(notes.filter((n) => n.role === 'kill').map((n) => n.source));
    for (const s of ['mine', 'slime', 'segment']) expect(sources.has(s as never)).toBe(true);
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
    // Chord hits and resolutions sit on bar lines; kill notes on the off beat slots.
    for (const c of notes.filter((n) => n.role === 'chord' || n.role === 'resolve')) expect(c.step % STEPS_PER_BAR).toBe(0);
    for (const k of kills) expect(isKillSlot(k.step)).toBe(true);
    expect(notes.filter((n) => n.role === 'resolve').length).toBeGreaterThan(3);
    const s = musicState().kills;
    expect(s.notes).toBeGreaterThan(20);
    // Chord hits only take free voices (they never steal), so how many land with six motifs live
    // depends on where the tune's motif notes fall against its downbeats: 4 on the original tune
    // (unchanged since v2.1), at least 2 on every other.
    expect(s.chords).toBeGreaterThanOrEqual(id === 'neon' ? 4 : 2);
    // Well balanced: a share of kills is heard, never all of them.
    expect(s.notes + s.chords).toBeLessThan(s.seen / 2);
  });

  it('every scheduled pitch agrees with the harmony: chord tones on the beats, scale tones between', () => {
    simulate(60);
    const pitched = notes.filter((n) => n.midi !== null);
    const byRole = new Map<string, number>();
    for (const n of pitched) {
      const midi = n.midi ?? 0;
      const h = harmonyAtStep(n.step, tune.key);
      expect(n.tune).toBe(id);
      const what = `${n.role} ${n.layer ?? n.kind ?? n.source ?? ''} step ${n.step} midi ${midi}`;
      byRole.set(n.role, (byRole.get(n.role) ?? 0) + 1);
      // Everything is in the tune's scale.
      expect(inScale(midi, tune.key), what).toBe(true);
      switch (n.role) {
        case 'bed':
          if (n.layer === 'arp') expect(fitsHarmony(midi, n.step, tune.key), what).toBe(true);
          else expect(inChord(midi, h), what).toBe(true);
          break;
        case 'motif':
          expect(fitsHarmony(midi, n.step, tune.key), what).toBe(true);
          break;
        case 'stinger':
        case 'kill':
        case 'resolve':
        case 'chord':
          // The melodic contributions are chord tones wherever they land.
          expect(inChord(midi, h), what).toBe(true);
          break;
        case 'hit':
        case 'deflect':
          // Off grid ticks: in the scale (checked above).
          break;
      }
    }
    for (const r of ['bed', 'motif', 'stinger', 'kill', 'resolve', 'chord', 'hit', 'deflect']) expect(byRole.get(r) ?? 0, r).toBeGreaterThan(0);
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
    uninstall = initMusic({ bus, graph: () => graph, timer, visibility: null, volume: 60, tune: id, onNote: (n) => notes.push({ ...n, now: ctx.currentTime }) });
    simulate(20);
    expect(notes.map((n) => `${n.role}:${n.layer ?? n.kind ?? n.source ?? ''}:${n.step}:${n.midi ?? ''}`)).toEqual(a);
  });
});

describe('Endless under load: the tune rotates mid wave', () => {
  beforeEach(() => setup());
  afterEach(() => uninstall());

  it('crosses a tune and tempo change with the cap, the clock and the beat intact', () => {
    bus.emit('game:start', { mode: 'endless', levelIndex: 1 });
    const first = startTune(0x5eed, 'endless');
    const next = endlessTune(0x5eed, 1);
    expect(next.id).not.toBe(first.id);
    simulate(100);
    expect(musicState().tune).toBe(next.id);
    expect(notes.some((n) => n.tune === first.id)).toBe(true);
    expect(notes.some((n) => n.tune === next.id && n.role === 'bed')).toBe(true);
    for (const n of notes) expect(n.time).toBeGreaterThanOrEqual(n.now);
    for (const s of spans.values()) expect(s.start).toBeGreaterThanOrEqual(s.scheduledAt);
    expect(peakConcurrency([...spans.values()])).toBeLessThanOrEqual(MUSIC_VOICE_CAP);
    // Every pitch is in its own tune's scale.
    for (const n of notes) if (n.midi !== null) expect(inScale(n.midi, (n.tune === next.id ? next : first).key), `${n.role} ${n.step}`).toBe(true);
    const st = musicState();
    expect(st.skippedSteps).toBe(0);
    expect(st.bedSteals).toBe(0);
    expect(st.motifSteals).toBe(0);
    // The pad still plays every bar across the switch.
    const bars = new Set(notes.filter((n) => n.role === 'bed' && n.layer === 'pad').map((n) => Math.floor(n.step / STEPS_PER_BAR)));
    for (let b = 0; b <= Math.max(...bars); b++) expect(bars.has(b)).toBe(true);
  });
});
