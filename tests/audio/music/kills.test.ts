// Kill voicing, pure parts: per kind sounds, pitches, chords and the selection gate.
import { describe, expect, it } from 'vitest';
import { Kind } from '../../../src/game/world';
import {
  ACCENT_GAIN_MAX,
  bombStepFor,
  CHORD_COOLDOWN_STEPS,
  CHORD_GAIN,
  CHORD_STEPS,
  chordMidis,
  chordStepFor,
  enemyOf,
  gateBomb,
  gateKill,
  isBigSource,
  KILL_ACCEPT,
  KILL_BUDGET_MAX,
  KILL_BUDGET_MIN,
  KILL_GATE_INIT,
  KILL_SPACING,
  KILL_SPECS,
  killBudget,
  killMidi,
  killPasses,
  kindSource,
  snapDownPentatonic,
  sourceFor,
  sourceForColour,
  STREAK_KILLS,
  type KillGate,
  type KillInput,
  type KillSource,
} from '../../../src/audio/music/kills';
import { LAYER_KINDS, LAYERS_FULL } from '../../../src/audio/music/layers';
import { ACCENT_RESERVE } from '../../../src/audio/music/lifecycle';
import { inPentatonic, pitchClass } from '../../../src/audio/music/scale';
import { chordForBar, LOOP_BARS, STEPS_PER_BAR } from '../../../src/audio/music/track';

const SOURCES = Object.keys(KILL_SPECS) as KillSource[];

function input(over: Partial<KillInput>): KillInput {
  return { seed: 1, ordinal: 0, step: 0, level: 1, big: false, durSteps: 1, noteRoom: 6, chordRoom: 6, ...over };
}

/** First ordinal at or after `from` that passes the thinning hash for seed 1. */
function passing(from: number): number {
  let o = from;
  while (!killPasses(1, o)) o++;
  return o;
}

describe('kill sounds per kind', () => {
  it('every enemy kind, the well, the spawner, segments, Mines and Slime have a kill sound', () => {
    for (const k of LAYER_KINDS) expect(KILL_SPECS[k].source).toBe(k);
    expect(SOURCES).toHaveLength(LAYER_KINDS.length + 5);
    for (const s of ['well', 'spawner', 'segment', 'mine', 'slime'] as const) {
      expect(KILL_SPECS[s].source).toBe(s);
      expect(enemyOf(s)).toBeNull();
    }
    for (const k of LAYER_KINDS) expect(enemyOf(k)).toBe(k);
  });

  it('maps every sim Kind to its source; non enemies map to nothing', () => {
    const expected: [Kind, KillSource | null][] = [
      [Kind.None, null],
      [Kind.Ship, null],
      [Kind.Grunt, 'grunt'],
      [Kind.Wanderer, 'wanderer'],
      [Kind.Weaver, 'weaver'],
      [Kind.Pinwheel, 'pinwheel'],
      [Kind.Dart, 'dart'],
      [Kind.SnakeHead, 'snake'],
      [Kind.SnakeBody, 'segment'],
      [Kind.GravityWell, 'well'],
      [Kind.Spawner, 'spawner'],
      [Kind.Geom, null],
      [Kind.Drone, null],
      [Kind.WeaponPickup, null],
      [Kind.Charger, 'charger'],
      [Kind.Bulwark, 'bulwark'],
      [Kind.Blink, 'blink'],
      [Kind.Swirl, 'swirl'],
      [Kind.Sower, 'sower'],
      [Kind.Mine, 'mine'],
      [Kind.Splime, 'splime'],
      [Kind.Slime, 'slime'],
    ];
    for (const [k, s] of expected) expect(kindSource(k), `kind ${k}`).toBe(s);
    // Every source but the kinds above is covered, and out of range values are silent.
    expect(new Set(expected.map(([, s]) => s).filter((s) => s !== null))).toEqual(new Set(SOURCES));
    expect(kindSource(Kind.Slime + 1)).toBeNull();
    expect(kindSource(-1)).toBeNull();
    expect(kindSource(2.5)).toBeNull();
  });

  it('the kind decides; the colour is only a fallback for a missing kind', () => {
    // A Mine pop carries the Sower colour but sounds as a Mine.
    expect(sourceFor(Kind.Mine, 'sower')).toBe('mine');
    expect(sourceFor(Kind.Sower, 'sower')).toBe('sower');
    expect(sourceFor(Kind.SnakeBody, 'cyan')).toBe('segment');
    expect(sourceFor(Kind.Grunt, 'cyan')).toBe('grunt');
    // A known non enemy kind does not fall back to its colour.
    expect(sourceFor(Kind.Ship, 'blue')).toBeNull();
    // Missing kind: the colour path.
    expect(sourceFor(undefined, 'blue')).toBe('grunt');
    expect(sourceFor(Kind.None, 'cyan')).toBe('snake');
    expect(sourceFor(Number.NaN, 'green')).toBe('weaver');
    expect(sourceFor(undefined, undefined)).toBeNull();
  });

  it('Mine and Sower kills and segment and Snake kills sound different notes', () => {
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      expect(killMidi(KILL_SPECS.mine, bar)).not.toBe(killMidi(KILL_SPECS.sower, bar));
      expect(killMidi(KILL_SPECS.segment, bar)).not.toBe(killMidi(KILL_SPECS.snake, bar));
    }
    expect(KILL_SPECS.mine.timbre.id).not.toBe(KILL_SPECS.sower.timbre.id);
    expect(KILL_SPECS.segment.timbre.id).not.toBe(KILL_SPECS.snake.timbre.id);
    expect(isBigSource('segment') || isBigSource('mine') || isBigSource('slime')).toBe(false);
  });

  it('each source has its own timbre, and enemies use their motif timbre made percussive', () => {
    expect(new Set(SOURCES.map((s) => KILL_SPECS[s].timbre.id)).size).toBe(SOURCES.length);
    for (const k of LAYER_KINDS) {
      const t = KILL_SPECS[k].timbre;
      expect(t.id).toBe(LAYERS_FULL[k].timbre.id);
      expect(t.wave).toBe(LAYERS_FULL[k].timbre.wave);
      expect(t.attack).toBeLessThanOrEqual(0.004);
      expect(t.glideSec).toBe(0);
    }
  });

  it('every kill note is in A minor pentatonic, moves with the chord, inside D2 to C7', () => {
    for (const s of SOURCES) {
      const spec = KILL_SPECS[s];
      for (let bar = 0; bar < LOOP_BARS; bar++) {
        const m = killMidi(spec, bar);
        expect(inPentatonic(m)).toBe(true);
        expect(m).toBeGreaterThanOrEqual(38);
        expect(m).toBeLessThanOrEqual(96);
      }
      // The A minor bars sit lower than the C major bars (anchor 0 against 3).
      expect(killMidi(spec, 0)).toBeLessThan(killMidi(spec, 4));
    }
  });

  it('at every bar each source has its own pitch', () => {
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      const pitches = new Set(SOURCES.map((s) => killMidi(KILL_SPECS[s], bar)));
      expect(pitches.size).toBe(SOURCES.length);
    }
  });

  it('kill gains and the chord fit inside the accent reserve', () => {
    for (const s of SOURCES) expect(KILL_SPECS[s].gain).toBeLessThanOrEqual(ACCENT_RESERVE);
    expect(CHORD_GAIN).toBeLessThanOrEqual(ACCENT_RESERVE);
    expect(ACCENT_GAIN_MAX).toBeLessThanOrEqual(ACCENT_RESERVE);
    for (const s of SOURCES) expect(KILL_SPECS[s].durSteps).toBeLessThanOrEqual(KILL_SPACING);
  });

  it('maps fx:kill colours to sources; non enemy colours map to nothing', () => {
    expect(sourceForColour('blue')).toBe('grunt');
    expect(sourceForColour('cyan')).toBe('snake');
    expect(sourceForColour('red')).toBe('well');
    expect(sourceForColour('yellow')).toBe('spawner');
    expect(sourceForColour('splime')).toBe('splime');
    expect(sourceForColour('ship')).toBeNull();
    expect(sourceForColour('geom')).toBeNull();
    expect(sourceForColour('slime')).toBeNull();
    // Each enemy kind's colour maps back to it.
    const colours = ['blue', 'purple', 'green', 'magenta', 'orange', 'cyan', 'charger', 'bulwark', 'blink', 'swirl', 'sower', 'splime'] as const;
    expect(colours.map((c) => sourceForColour(c))).toEqual([...LAYER_KINDS]);
    expect(isBigSource('snake') && isBigSource('well') && isBigSource('spawner')).toBe(true);
    expect(isBigSource('grunt')).toBe(false);
  });
});

describe('chords and scale helpers', () => {
  it('chords are pentatonic chord tones, three notes, a big chord adds the low octave', () => {
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      const c = chordMidis(bar, false);
      expect(c).toHaveLength(3);
      for (const m of c) expect(inPentatonic(m)).toBe(true);
      expect([...c].sort((a, b) => a - b)).toEqual(c);
      const big = chordMidis(bar, true);
      expect(big).toHaveLength(4);
      expect(big[0]).toBe((c[0] ?? 0) - 12);
    }
    // The A minor bars ring the full triad.
    expect(chordMidis(0, false).map(pitchClass)).toEqual(chordForBar(0).pad.map(pitchClass));
  });

  it('helpers', () => {
    expect(snapDownPentatonic(65)).toBe(64);
    expect(snapDownPentatonic(71)).toBe(69);
    expect(snapDownPentatonic(69)).toBe(69);
  });
});

describe('selection rule', () => {
  it('budget grows with threat from 2 to 6 per bar', () => {
    expect(killBudget(0)).toBe(KILL_BUDGET_MIN);
    expect(killBudget(1)).toBe(KILL_BUDGET_MAX);
    let prev = 0;
    for (let l = 0; l <= 1; l += 0.01) {
      expect(killBudget(l)).toBeGreaterThanOrEqual(prev);
      prev = killBudget(l);
    }
    expect(killBudget(Number.NaN)).toBe(KILL_BUDGET_MIN);
  });

  it('the thinning hash is deterministic, about 7 in 10, and depends on the seed', () => {
    let pass = 0;
    for (let o = 0; o < 10000; o++) if (killPasses(42, o)) pass++;
    expect(pass / 10000).toBeGreaterThan(KILL_ACCEPT - 0.03);
    expect(pass / 10000).toBeLessThan(KILL_ACCEPT + 0.03);
    const a = Array.from({ length: 64 }, (_, o) => killPasses(42, o));
    expect(Array.from({ length: 64 }, (_, o) => killPasses(42, o))).toEqual(a);
    expect(Array.from({ length: 64 }, (_, o) => killPasses(43, o))).not.toEqual(a);
  });

  it('a steady stream never exceeds the bar budget or the spacing, and not every kill sounds', () => {
    for (const level of [0, 0.5, 1]) {
      let g: KillGate = KILL_GATE_INIT;
      const notes: number[] = [];
      let kills = 0;
      // One kill every 3 steps (about 2.7 a second) for 16 bars: never a streak.
      for (let step = 0; step < 16 * STEPS_PER_BAR; step += 3) {
        const r = gateKill(g, input({ ordinal: kills++, step, level }));
        g = r.gate;
        if (r.action.type === 'note') notes.push(r.action.step);
        expect(r.action.type).not.toBe('chord');
      }
      const perBar = new Map<number, number>();
      for (const s of notes) perBar.set(Math.floor(s / STEPS_PER_BAR), (perBar.get(Math.floor(s / STEPS_PER_BAR)) ?? 0) + 1);
      for (const n of perBar.values()) expect(n).toBeLessThanOrEqual(killBudget(level));
      for (let i = 1; i < notes.length; i++) expect((notes[i] ?? 0) - (notes[i - 1] ?? 0)).toBeGreaterThanOrEqual(KILL_SPACING);
      expect(notes.length).toBeGreaterThan(0);
      expect(notes.length).toBeLessThan(kills);
    }
  });

  it('the same kills in the same order give the same notes', () => {
    const run = (): string[] => {
      let g: KillGate = KILL_GATE_INIT;
      const out: string[] = [];
      for (let i = 0; i < 200; i++) {
        const r = gateKill(g, input({ ordinal: i, step: i * 2 + (i % 3), level: (i % 10) / 10 }));
        g = r.gate;
        out.push(r.action.type);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('three kills in one beat resolve into one chord on the next beat, not a cluster', () => {
    let g: KillGate = KILL_GATE_INIT;
    const o = passing(0);
    const a = gateKill(g, input({ ordinal: o, step: 33 }));
    expect(a.action).toEqual({ type: 'note', step: 33 });
    g = a.gate;
    const b = gateKill(g, input({ ordinal: o + 1, step: 34 }));
    expect(b.action.type).toBe('none');
    g = b.gate;
    const c = gateKill(g, input({ ordinal: o + 2, step: 34 }));
    expect(STREAK_KILLS).toBe(3);
    expect(c.action).toEqual({ type: 'chord', step: 36, big: false });
    g = c.gate;
    // Kills before and while the chord sounds are absorbed.
    for (const s of [35, 36, 40, 36 + CHORD_STEPS - 1]) expect(gateKill(g, input({ ordinal: 9, step: s })).action).toEqual({ type: 'none', why: 'chord' });
    expect(gateKill(g, input({ ordinal: passing(10), step: 36 + CHORD_STEPS })).action.type).toBe('note');
  });

  it('a segment burst never makes a streak, so the head still resolves into a big chord', () => {
    let g: KillGate = KILL_GATE_INIT;
    const o = passing(0);
    const first = gateKill(g, input({ ordinal: o, step: 33, streaks: false }));
    expect(first.action).toEqual({ type: 'note', step: 33 });
    g = first.gate;
    for (let i = 1; i < 8; i++) {
      const r = gateKill(g, input({ ordinal: o + i, step: 33, streaks: false }));
      expect(r.action.type).toBe('none');
      g = r.gate;
    }
    expect(g.beatKills).toBe(0);
    const head = gateKill(g, input({ ordinal: o + 8, step: 33, big: true }));
    expect(head.action).toEqual({ type: 'chord', step: 36, big: true });
  });

  it('streak chords wait for the cooldown, big kills and bombs do not', () => {
    let g: KillGate = KILL_GATE_INIT;
    for (let i = 0; i < 3; i++) g = gateKill(g, input({ ordinal: 100 + i, step: 1 })).gate;
    expect(g.chordAt).toBe(4);
    // A second streak right after the chord ends is still inside the cooldown.
    let h = g;
    let chords = 0;
    for (let i = 0; i < 3; i++) {
      const r = gateKill(h, input({ ordinal: 200 + i, step: 4 + CHORD_STEPS }));
      h = r.gate;
      if (r.action.type === 'chord') chords++;
    }
    expect(chords).toBe(0);
    // After the cooldown it fires again.
    let k = g;
    const late = 4 + CHORD_COOLDOWN_STEPS;
    for (let i = 0; i < 3; i++) {
      const r = gateKill(k, input({ ordinal: 300 + i, step: late }));
      k = r.gate;
      if (r.action.type === 'chord') chords++;
    }
    expect(chords).toBe(1);
    // A big kill right after the first chord: a big chord on the next beat.
    expect(gateKill(g, input({ ordinal: 400, step: 4 + CHORD_STEPS, big: true })).action).toEqual({ type: 'chord', step: 12, big: true });
    // A bomb on a beat line sounds there; off the beat on the next one.
    expect(gateBomb(KILL_GATE_INIT, 8, 6).action).toEqual({ type: 'chord', step: 8, big: true });
    expect(gateBomb(KILL_GATE_INIT, 9, 6).action).toEqual({ type: 'chord', step: 12, big: true });
    expect(gateBomb(g, 5, 6).action).toEqual({ type: 'none', why: 'chord' });
  });

  it('never steals: no free voice means sfx only, and a chord needs two', () => {
    const o = passing(0);
    expect(gateKill(KILL_GATE_INIT, input({ ordinal: o, step: 3, noteRoom: 0 })).action).toEqual({ type: 'none', why: 'voices' });
    expect(gateBomb(KILL_GATE_INIT, 3, 1).action).toEqual({ type: 'none', why: 'voices' });
    // A big kill without room for a chord falls back to a single note.
    expect(gateKill(KILL_GATE_INIT, input({ ordinal: o, step: 3, big: true, chordRoom: 1 })).action).toEqual({ type: 'note', step: 3 });
  });

  it('a chord never starts under a sounding kill note', () => {
    const o = passing(0);
    const g = gateKill(KILL_GATE_INIT, input({ ordinal: o, step: 7, durSteps: 2 })).gate;
    expect(g.noteEnd).toBe(9);
    expect(chordStepFor(g, 7)).toBe(12);
    expect(bombStepFor(g, 7)).toBe(12);
  });
});
