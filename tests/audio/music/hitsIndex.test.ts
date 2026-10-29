// Hit ticks and shield deflects through the real entry points, with a fake audio clock.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Kind } from '../../../src/game/world';
import { DEFLECT_GAIN, deflectMidi, HIT_DUR_SEC, hitGain, hitMidi } from '../../../src/audio/music/hits';
import { initMusic, musicState, setMusicVolume, startMusic, type MusicGraph, type NoteLog } from '../../../src/audio/music/index';
import { KILL_LEAD_SEC, type KillSource } from '../../../src/audio/music/kills';
import { TICK_MS } from '../../../src/audio/music/scheduler';
import { STEPS_PER_BAR } from '../../../src/audio/music/track';
import { Bus } from '../../../src/core/events';
import { FakeContext, FakeNode, FakeTimer } from './fakeAudio';

let ctx: FakeContext;
let timer: FakeTimer;
let bus: Bus;
let log: (NoteLog & { now: number })[];
let uninstall: () => void;

function advance(sec: number): void {
  const n = Math.round(sec / (TICK_MS / 1000));
  for (let i = 0; i < n; i++) {
    ctx.currentTime += TICK_MS / 1000;
    timer.fire();
  }
}

/** The sim reuses one payload object; so does this helper. */
const payload = { x: 0, y: 0, kind: Kind.Grunt, id: 1, blocked: false };
function hit(kind: Kind, blocked = false): void {
  payload.kind = kind;
  payload.blocked = blocked;
  bus.emit('fx:hit', payload);
}

const role = (r: NoteLog['role']): (NoteLog & { now: number })[] => log.filter((n) => n.role === r);

/** Most notes inside any half open window [t, t + width). */
function maxInWindow(notes: readonly NoteLog[], width: number): number {
  const times = notes.map((n) => n.time).sort((a, b) => a - b);
  let best = 0;
  for (let i = 0; i < times.length; i++) {
    let n = 0;
    for (let j = i; j < times.length && (times[j] ?? Infinity) < (times[i] ?? 0) + width; j++) n++;
    best = Math.max(best, n);
  }
  return best;
}

beforeEach(() => {
  ctx = new FakeContext();
  timer = new FakeTimer();
  bus = new Bus();
  log = [];
  const graph: MusicGraph = { ctx, master: new FakeNode() };
  uninstall = initMusic({ tune: 'neon', bus, graph: () => graph, timer, visibility: null, volume: 50, onNote: (n) => log.push({ ...n, now: ctx.currentTime }) });
});

afterEach(() => uninstall());

describe('hit sounds in the music loop', () => {
  it('a hit sounds its kind tick right after the tick, never in the past', () => {
    startMusic(3);
    advance(0.6);
    hit(Kind.Bulwark);
    advance(0.05);
    const h = role('hit');
    expect(h).toHaveLength(1);
    const n = h[0];
    expect(n?.source).toBe('bulwark');
    expect(n?.kind).toBe('bulwark');
    expect(n?.time).toBeCloseTo((n?.now ?? 0) + KILL_LEAD_SEC, 9);
    expect(n?.time ?? 0).toBeGreaterThanOrEqual(n?.now ?? Infinity);
    expect(n?.midi).toBe(hitMidi('bulwark', Math.floor((n?.step ?? 0) / STEPS_PER_BAR)));
    expect(n?.gain).toBe(hitGain('bulwark'));
    // A hit is not a kill.
    expect(role('kill')).toHaveLength(0);
    expect(musicState().kills.seen).toBe(0);
  });

  it('each kind hit gives its own tick; non enemies give none', () => {
    startMusic(3);
    advance(0.6);
    const kinds: [Kind, KillSource][] = [
      [Kind.Bulwark, 'bulwark'],
      [Kind.Splime, 'splime'],
      [Kind.SnakeHead, 'snake'],
      [Kind.GravityWell, 'well'],
      [Kind.Spawner, 'spawner'],
      [Kind.Charger, 'charger'],
    ];
    for (const [k] of kinds) {
      hit(k);
      advance(0.2);
    }
    for (const k of [Kind.Ship, Kind.Geom, Kind.Drone, Kind.None]) hit(k);
    advance(0.2);
    expect(role('hit').map((n) => n.source)).toEqual(kinds.map(([, s]) => s));
    expect(new Set(role('hit').map((n) => `${n.source}:${n.midi}`)).size).toBe(kinds.length);
  });

  it('a shield block is a deflect, not a tick', () => {
    startMusic(3);
    advance(0.6);
    hit(Kind.Bulwark, true);
    advance(0.05);
    expect(role('hit')).toHaveLength(0);
    const d = role('deflect');
    expect(d).toHaveLength(1);
    expect(d[0]?.kind).toBeNull();
    expect(d[0]?.gain).toBe(DEFLECT_GAIN);
    expect(d[0]?.midi).toBe(deflectMidi(Math.floor((d[0]?.step ?? 0) / STEPS_PER_BAR)));
  });

  it('hammering one kind gives at most 8 ticks a second; blocks at most 4 deflects', () => {
    startMusic(3);
    advance(0.6);
    // Six hits on every 25 ms tick for 4 s: 240 a second.
    for (let i = 0; i < 160; i++) {
      for (let j = 0; j < 6; j++) hit(Kind.Splime);
      advance(TICK_MS / 1000);
    }
    const h = role('hit');
    expect(maxInWindow(h, 1)).toBeLessThanOrEqual(8);
    expect(h.length).toBeGreaterThanOrEqual(24);
    log = [];
    for (let i = 0; i < 160; i++) {
      for (let j = 0; j < 6; j++) hit(Kind.Bulwark, true);
      advance(TICK_MS / 1000);
    }
    const d = role('deflect');
    expect(maxInWindow(d, 1)).toBeLessThanOrEqual(4);
    expect(d.length).toBeGreaterThanOrEqual(12);
  });

  it('only one hit sound at a time, so mixed kinds share the lane and rotate', () => {
    startMusic(3);
    advance(0.6);
    for (let i = 0; i < 120; i++) {
      hit(Kind.Splime);
      hit(Kind.Bulwark);
      hit(Kind.Charger);
      if (i % 3 === 0) hit(Kind.Bulwark, true);
      advance(TICK_MS / 1000);
    }
    const all = log.filter((n) => n.role === 'hit' || n.role === 'deflect').sort((a, b) => a.time - b.time);
    for (let i = 1; i < all.length; i++) expect((all[i]?.time ?? 0) - (all[i - 1]?.time ?? 0)).toBeGreaterThanOrEqual(HIT_DUR_SEC - 1e-9);
    // Every kind is heard, not only the first one emitted each tick.
    expect(new Set(role('hit').map((n) => n.source))).toEqual(new Set(['splime', 'bulwark', 'charger']));
    expect(role('deflect').length).toBeGreaterThan(0);
  });

  it('volume 0, a pause and a hidden tab play no hits', () => {
    setMusicVolume(0);
    startMusic(3);
    advance(0.6);
    hit(Kind.Bulwark);
    hit(Kind.Bulwark, true);
    advance(0.2);
    setMusicVolume(50);
    bus.emit('game:pause');
    hit(Kind.Splime);
    advance(0.2);
    bus.emit('game:resume');
    advance(0.2);
    expect(role('hit')).toHaveLength(0);
    expect(role('deflect')).toHaveLength(0);
  });

  it('hits never steal: six motif layers at full threat and a hit storm leave the bed and motifs whole', () => {
    startMusic(21);
    bus.emit('sim:threat', { level: 1 });
    for (const k of ['snake', 'bulwark', 'splime', 'weaver', 'grunt', 'charger'] as const) bus.emit('sim:enemyEnter', { kind: k, live: 3 });
    for (let i = 0; i < 800; i++) {
      hit(i % 2 === 0 ? Kind.Bulwark : Kind.Splime, i % 5 === 0);
      hit(Kind.SnakeHead);
      advance(TICK_MS / 1000);
    }
    const s = musicState();
    expect(s.bedSteals).toBe(0);
    expect(s.motifSteals).toBe(0);
    expect(s.voices).toBeLessThanOrEqual(16);
    expect(role('hit').length).toBeGreaterThan(0);
  });
});
