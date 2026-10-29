// Kill accents and the intensity lift through the real entry points, with a fake audio clock.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Kind } from '../../../src/game/world';
import { LIFT_CUTOFF_MUL, masterCutoff } from '../../../src/audio/music/intensity';
import { initMusic, musicState, setMusicVolume, startMusic, type MusicGraph, type NoteLog } from '../../../src/audio/music/index';
import { harmonyForBar, inChord } from '../../../src/audio/music/harmony';
import { CHORD_GAIN, CHORD_TIMBRE, isKillSlot, KILL_LEAD_SEC, KILL_SPECS, killNoteMidi, resolveMidi } from '../../../src/audio/music/kills';
import { pitchClass } from '../../../src/audio/music/scale';
import { START_LEAD_SEC, TICK_MS } from '../../../src/audio/music/scheduler';
import { BAR_SEC, buildBar, STEP_SEC, STEPS_PER_BAR, type FillBar } from '../../../src/audio/music/track';
import { DEFAULT_TUNE } from '../../../src/audio/music/tunes';
import { Bus, type Events } from '../../../src/core/events';
import { FakeContext, FakeNode, FakeTimer } from './fakeAudio';

let ctx: FakeContext;
let timer: FakeTimer;
let bus: Bus;
let graph: MusicGraph | null;
let log: (NoteLog & { now: number })[];
let uninstall: () => void;

const T0 = START_LEAD_SEC;
const BEAT_SEC = STEP_SEC * 4;

function advance(sec: number): void {
  const n = Math.round(sec / (TICK_MS / 1000));
  for (let i = 0; i < n; i++) {
    ctx.currentTime += TICK_MS / 1000;
    timer.fire();
  }
}

type Colour = Events['fx:kill']['colour'];

/** The sim's colour per kind, as combat sends it (a Mine pop carries the Sower colour). */
const COLOUR_OF: Partial<Record<Kind, Colour>> = {
  [Kind.Grunt]: 'blue',
  [Kind.Weaver]: 'green',
  [Kind.Dart]: 'orange',
  [Kind.SnakeHead]: 'cyan',
  [Kind.SnakeBody]: 'cyan',
  [Kind.GravityWell]: 'red',
  [Kind.Bulwark]: 'bulwark',
  [Kind.Swirl]: 'swirl',
  [Kind.Sower]: 'sower',
  [Kind.Mine]: 'sower',
};

/** A scored kill (or a pop): 'fx:kill' then the 'explode' sfx. */
function kill(kind: Kind, colour: Colour = COLOUR_OF[kind] ?? 'white'): void {
  bus.emit('fx:kill', { x: 0, y: 0, colour, kind, id: 1 });
  bus.emit('sfx', 'explode');
}


const role = (r: NoteLog['role']): (NoteLog & { now: number })[] => log.filter((n) => n.role === r);
const barOf = (n: NoteLog | undefined): number => Math.floor((n?.step ?? 0) / STEPS_PER_BAR);

beforeEach(() => {
  ctx = new FakeContext();
  timer = new FakeTimer();
  bus = new Bus();
  graph = { ctx, master: new FakeNode() };
  log = [];
  uninstall = initMusic({ tune: 'neon',
    bus,
    graph: () => graph,
    timer,
    visibility: null,
    volume: 50,
    onNote: (n) => log.push({ ...n, now: ctx.currentTime }),
  });
});

afterEach(() => {
  uninstall();
});

describe('kill accents in the music loop', () => {
  it('a kill sounds on the next off beat sixteenth, the root of the chord, never in the past', () => {
    startMusic(1);
    advance(0.7);
    const at = ctx.currentTime;
    kill(Kind.Grunt);
    advance(0.05);
    const k = role('kill');
    expect(k).toHaveLength(1);
    const n = k[0];
    expect(n?.source).toBe('grunt');
    expect(n?.kind).toBe('grunt');
    // On the grid, on an off beat slot at or after the tick time plus the lead.
    expect(((n?.time ?? 0) - T0) / STEP_SEC).toBeCloseTo(n?.step ?? -1, 6);
    expect(isKillSlot(n?.step ?? 0)).toBe(true);
    expect(n?.time ?? 0).toBeGreaterThanOrEqual((n?.now ?? 0) + KILL_LEAD_SEC - 1e-9);
    expect((n?.time ?? 0) - at).toBeLessThan(TICK_MS / 1000 + KILL_LEAD_SEC + 2 * STEP_SEC + 1e-9);
    expect(n?.midi).toBe(killNoteMidi(barOf(n), 0));
    expect(musicState().kills).toEqual({ seen: 1, notes: 1, chords: 0 });
  });

  it('kills a bar apart each start the arpeggio on the root; a well kill lands a chord hit', () => {
    startMusic(2);
    advance(0.5);
    const kinds = [Kind.Grunt, Kind.Weaver, Kind.Dart, Kind.Bulwark, Kind.Swirl, Kind.GravityWell] as const;
    for (let i = 0; i < 40; i++) {
      kill(kinds[i % kinds.length] ?? Kind.Grunt);
      advance(BAR_SEC);
    }
    const sources = new Set(role('kill').map((n) => n.source));
    expect(sources.size).toBeGreaterThanOrEqual(5);
    for (const n of role('kill')) {
      expect(n.midi).toBe(killNoteMidi(barOf(n), 0));
      expect(pitchClass(n.midi ?? 0)).toBe(harmonyForBar(barOf(n)).root);
    }
    // The well is a big kill: a chord hit on a bar line rather than a note.
    expect(role('kill').some((n) => n.source === 'well')).toBe(false);
    expect(role('chord').length).toBeGreaterThanOrEqual(4);
    for (const c of role('chord')) expect(c.step % STEPS_PER_BAR).toBe(0);
    // No bar had three notes, so nothing resolved.
    expect(role('resolve')).toHaveLength(0);
  });

  it('three kills in a bar climb root, third, fifth and resolve to the next root on the bar line', () => {
    startMusic(3);
    advance(0.6);
    // Wait for the start of a bar so all three land in it.
    while (musicState().nextStep % STEPS_PER_BAR !== 2) advance(TICK_MS / 1000);
    for (let i = 0; i < 3; i++) {
      kill(Kind.Grunt);
      advance(BEAT_SEC);
    }
    advance(BAR_SEC);
    const k = role('kill');
    expect(k).toHaveLength(3);
    const bar = barOf(k[0]);
    for (const n of k) expect(barOf(n)).toBe(bar);
    expect(k.map((n) => n.midi)).toEqual([0, 1, 2].map((i) => killNoteMidi(bar, i)));
    const r = role('resolve');
    expect(r).toHaveLength(1);
    expect(r[0]?.step).toBe((bar + 1) * STEPS_PER_BAR);
    expect(r[0]?.midi).toBe(resolveMidi(bar + 1));
    expect(pitchClass(r[0]?.midi ?? 0)).toBe(harmonyForBar(bar + 1).root);
    expect(r[0]?.time ?? 0).toBeGreaterThanOrEqual(r[0]?.now ?? Infinity);
  });

  it('a snake segment burst climbs in its own voice, and the head lands a big chord hit under the resolution', () => {
    startMusic(4);
    advance(0.5);
    // combat.ts order: the burst (fx:kill per segment, no explode), then the head's kill pair.
    for (let i = 0; i < 8; i++) bus.emit('fx:kill', { x: 0, y: 0, colour: 'cyan', kind: Kind.SnakeBody, id: 10 + i });
    kill(Kind.SnakeHead);
    advance(2.5);
    const k = role('kill');
    expect(k.length).toBeGreaterThanOrEqual(1);
    expect(k.length).toBeLessThanOrEqual(3);
    for (const n of k) {
      expect(n.source).toBe('segment');
      expect(n.kind).toBeNull();
    }
    expect(k.map((n) => n.midi)).toEqual(k.map((n, i) => killNoteMidi(barOf(n), i)));
    // One big chord hit on the next bar line after the burst.
    const c = role('chord');
    expect(c.length).toBeGreaterThanOrEqual(4);
    const line = (barOf(k[0]) + 1) * STEPS_PER_BAR;
    for (const n of c) expect(n.step).toBe(line);
    expect(musicState().kills.seen).toBe(9);
  });

  it('a Mine pop and a Sower kill are told apart by source', () => {
    startMusic(5);
    advance(0.5);
    kill(Kind.Mine);
    advance(BAR_SEC);
    kill(Kind.Sower);
    advance(BAR_SEC);
    const k = role('kill');
    expect(k.map((n) => n.source)).toEqual(['mine', 'sower']);
    expect(k[0]?.kind).toBeNull();
    expect(k[1]?.kind).toBe('sower');
    expect(KILL_SPECS.mine.noteTimbre.id).not.toBe(KILL_SPECS.sower.noteTimbre.id);
  });

  it('without a kind the colour decides; colour only segments and stray explodes are not kills', () => {
    startMusic(6);
    advance(0.5);
    // An old emitter: segments with no kind come without an explode and stay silent.
    for (let i = 0; i < 8; i++) bus.emit('fx:kill', { x: 0, y: 0, colour: 'cyan', kind: Kind.None, id: 1 });
    advance(0.2);
    bus.emit('sfx', 'shot');
    bus.emit('sfx', 'explode');
    advance(0.2);
    expect(role('kill')).toHaveLength(0);
    expect(role('chord')).toHaveLength(0);
    expect(musicState().kills.seen).toBe(0);
    kill(Kind.None, 'blue');
    advance(0.2);
    expect(role('kill').map((n) => n.source)).toEqual(['grunt']);
  });

  it('a bomb lands one big chord hit on the next bar downbeat', () => {
    startMusic(5);
    advance(0.61);
    bus.emit('fx:bomb', { x: 0, y: 0 });
    advance(2.5);
    const c = role('chord');
    expect(c.length).toBe(5);
    const step = c[0]?.step ?? -1;
    expect(step % STEPS_PER_BAR).toBe(0);
    for (const n of c) {
      expect(n.step).toBe(step);
      expect(n.time).toBeGreaterThanOrEqual(n.now);
      expect(inChord(n.midi ?? 0, harmonyForBar(barOf(n)))).toBe(true);
    }
    expect(c.reduce((a, n) => a + n.gain, 0)).toBeLessThanOrEqual(CHORD_GAIN + 1e-12);
    expect(CHORD_TIMBRE.id).toBe('chime');
  });

  it('a burst of kills in one beat gives a chord hit instead of a cluster', () => {
    startMusic(7);
    advance(0.6);
    for (let i = 0; i < 8; i++) kill(Kind.Grunt);
    advance(2.5);
    expect(role('chord').length).toBe(4);
    expect(role('kill').length).toBeLessThanOrEqual(3);
  });

  it('music volume 0 plays no accents', () => {
    setMusicVolume(0);
    startMusic(8);
    advance(0.5);
    kill(Kind.Grunt);
    bus.emit('fx:bomb', { x: 0, y: 0 });
    advance(2.5);
    expect(role('kill')).toHaveLength(0);
    expect(role('chord')).toHaveLength(0);
    setMusicVolume(50);
  });

  it('kill accents never steal: six motif layers at full threat leave the bed and motifs whole', () => {
    startMusic(21);
    bus.emit('sim:threat', { level: 1 });
    for (const k of ['snake', 'bulwark', 'splime', 'weaver', 'grunt', 'charger'] as const) bus.emit('sim:enemyEnter', { kind: k, live: 3 });
    for (let i = 0; i < 400; i++) {
      kill(i % 2 === 0 ? Kind.Grunt : Kind.Weaver);
      advance(0.1);
    }
    const s = musicState();
    expect(s.bedSteals).toBe(0);
    expect(s.motifSteals).toBe(0);
    expect(s.voices).toBeLessThanOrEqual(16);
  });
});

describe('intensity lift through the loop', () => {
  it('quiet is the bed only; high threat lifts the arp an octave, adds perc and opens the filter', () => {
    const seed = 77;
    startMusic(seed);
    advance(BAR_SEC * 2);
    const quiet = log.filter((n) => n.role === 'bed');
    expect(new Set(quiet.map((n) => n.layer))).toEqual(new Set(['pad']));
    log = [];
    bus.emit('sim:threat', { level: 1 });
    advance(BAR_SEC * 3);
    expect(musicState().lift).toBe(true);
    const loud = log.filter((n) => n.role === 'bed' && n.step >= 2 * STEPS_PER_BAR + STEPS_PER_BAR);
    const layers = new Set(loud.map((n) => n.layer));
    for (const l of ['bass', 'pad', 'kick', 'perc', 'hat', 'arp']) expect(layers.has(l as never)).toBe(true);
    // Arp an octave above the composed line (or above the fill run: the lift turning on is a
    // phase change, so a 2 bar fill follows it).
    const arp = loud.filter((n) => n.layer === 'arp');
    expect(arp.length).toBeGreaterThan(0);
    for (const n of arp) {
      const b = Math.floor(n.step / STEPS_PER_BAR);
      const at = (fill: FillBar): number | null =>
        buildBar(seed, b, DEFAULT_TUNE, fill).notes.find((x) => x.layer === 'arp' && x.step === n.step % STEPS_PER_BAR)?.midi ?? null;
      const options = [at(null), at(1)].filter((m): m is number => m !== null).map((m) => m + 12);
      expect(options).toContain(n.midi);
    }
    // Perc on the backbeat (the fill's roll adds 8 and 13).
    for (const n of loud.filter((x) => x.layer === 'perc')) expect([4, 8, 12, 13, 14]).toContain(n.step % STEPS_PER_BAR);
    // The lowpass ends up opened past the plain threat curve.
    const master = ctx.filters[0];
    const last = master?.frequency.calls.filter((c) => c.fn === 'target').at(-1)?.v ?? 0;
    expect(last).toBeGreaterThan(masterCutoff(0.9) * (LIFT_CUTOFF_MUL - 0.1));
  });

  it('a steady threat stops sending cutoff updates', () => {
    startMusic(3);
    bus.emit('sim:threat', { level: 0.5 });
    advance(4);
    const master = ctx.filters[0];
    const before = master?.frequency.calls.length ?? 0;
    advance(4);
    // 160 ticks at a settled threat: no more than a couple of tail updates.
    expect((master?.frequency.calls.length ?? 0) - before).toBeLessThanOrEqual(2);
  });
});
