// Kill voicing, pure parts: per kind sounds, pitches, chord hits and the call and response gate.
import { describe, expect, it } from 'vitest';
import { Kind } from '../../../src/game/world';
import { harmonyForBar, inChord, isStrongStep } from '../../../src/audio/music/harmony';
import {
  ACCENT_GAIN_MAX,
  barLineAtOrAfter,
  CHORD_COOLDOWN_STEPS,
  CHORD_GAIN,
  CHORD_MIN_VOICES,
  chordHit,
  chordMidis,
  chordStepFor,
  enemyOf,
  gateBomb,
  gateKill,
  isBigSource,
  isKillSlot,
  KILL_BASE,
  KILL_BUDGET_MAX,
  KILL_BUDGET_MIN,
  KILL_GAIN_LIFT,
  KILL_GATE_INIT,
  KILL_SLOTS,
  KILL_SPACING,
  KILL_SPECS,
  killBudget,
  killMidi,
  killNoteMidi,
  kindSource,
  RESOLVE_GAIN,
  RESOLVE_KILLS,
  resolveMidi,
  slotAtOrAfter,
  snapDownPentatonic,
  sourceFor,
  sourceForColour,
  type KillAction,
  type KillGate,
  type KillInput,
  type KillSource,
} from '../../../src/audio/music/kills';
import { LAYER_KINDS, LAYERS_FULL } from '../../../src/audio/music/layers';
import { ACCENT_RESERVE } from '../../../src/audio/music/lifecycle';
import { inPentatonic, pitchClass } from '../../../src/audio/music/scale';
import { chordForBar, LOOP_BARS } from '../../../src/audio/music/track';

const SOURCES = Object.keys(KILL_SPECS) as KillSource[];

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

  it('Mine and Sower and segment and Snake have different home pitches and voices', () => {
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

  it('every source home pitch (the hit tick family) is pentatonic, moves with the chord, inside D2 to C7', () => {
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

describe('chord hits, kill note pitches and scale helpers', () => {
  it('a chord hit is the full triad of its bar plus the root up; a big one adds the root down', () => {
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      const h = harmonyForBar(bar);
      const c = chordMidis(bar, false);
      expect(c).toHaveLength(4);
      for (const m of c) expect(inChord(m, h)).toBe(true);
      expect([...c].sort((a, b) => a - b)).toEqual(c);
      expect(new Set(c.map(pitchClass))).toEqual(new Set(h.tones));
      expect(pitchClass(c[0] ?? 0)).toBe(h.root);
      expect((c[3] ?? 0) - (c[0] ?? 0)).toBe(12);
      const big = chordMidis(bar, true);
      expect(big).toHaveLength(5);
      expect(big[0]).toBe((c[0] ?? 0) - 12);
    }
    // The A minor bars ring the pad's triad.
    expect(new Set(chordMidis(0, false).map(pitchClass))).toEqual(new Set(chordForBar(0).pad.map(pitchClass)));
  });

  it('a chord hit under a resolution leaves the top root to it and shares the reserve', () => {
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      const plain = chordHit(bar, true, false);
      expect(plain.gain).toBe(CHORD_GAIN);
      const under = chordHit(bar, true, true);
      expect(under.midis).not.toContain(resolveMidi(bar));
      expect(under.midis.length).toBe(plain.midis.length - 1);
      expect(under.gain + RESOLVE_GAIN).toBeLessThanOrEqual(ACCENT_RESERVE + 1e-12);
    }
  });

  it('kill notes climb the arpeggio of their bar from the root nearest A4', () => {
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      const h = harmonyForBar(bar);
      const run = [0, 1, 2, 3, 4, 5].map((i) => killNoteMidi(bar, i));
      for (let i = 1; i < run.length; i++) expect(run[i] ?? 0).toBeGreaterThan(run[i - 1] ?? 0);
      for (const m of run) expect(inChord(m, h)).toBe(true);
      expect(pitchClass(run[0] ?? 0)).toBe(h.root);
      expect(Math.abs((run[0] ?? 0) - KILL_BASE)).toBeLessThanOrEqual(6);
      // The resolution is the root an octave above the run's first note.
      expect(resolveMidi(bar)).toBe((run[0] ?? 0) + 12);
    }
    expect([0, 1, 2, 3].map((i) => killNoteMidi(0, i))).toEqual([69, 72, 76, 81]);
    expect([0, 1, 2].map((i) => killNoteMidi(2, i))).toEqual([65, 69, 72]);
  });

  it('kill slots are the off beat sixteenths', () => {
    expect(KILL_SLOTS).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
    for (const s of KILL_SLOTS) expect(isStrongStep(s)).toBe(false);
    expect(slotAtOrAfter(0)).toBe(1);
    expect(slotAtOrAfter(1)).toBe(1);
    expect(slotAtOrAfter(16)).toBe(17);
    expect(isKillSlot(31)).toBe(true);
    expect(isKillSlot(32)).toBe(false);
    expect(barLineAtOrAfter(17)).toBe(32);
    expect(barLineAtOrAfter(32)).toBe(32);
    expect(chordStepFor(5)).toBe(16);
  });

  it('kill note voices are the kind timbre made brighter, and louder than v2.0', () => {
    for (const s of SOURCES) {
      const spec = KILL_SPECS[s];
      expect(spec.noteTimbre.id).toBe(spec.timbre.id);
      expect(spec.noteTimbre.partner).not.toBeNull();
      if (spec.timbre.filter !== 'highpass') expect(spec.noteTimbre.filterHz).toBeGreaterThan(spec.timbre.filterHz);
      expect(spec.noteGain).toBeCloseTo(spec.gain * KILL_GAIN_LIFT, 12);
      expect(20 * Math.log10(spec.noteGain / spec.gain)).toBeGreaterThanOrEqual(6);
    }
  });

  it('helpers', () => {
    expect(snapDownPentatonic(65)).toBe(64);
    expect(snapDownPentatonic(71)).toBe(69);
    expect(snapDownPentatonic(69)).toBe(69);
  });
});

const ROOM = (): number => 6;
const NONE = (): number => 0;

function input(over: Partial<KillInput>): KillInput {
  return { step: 0, level: 1, big: false, durSteps: 1, noteRoom: ROOM, chordRoom: ROOM, resolveRoom: ROOM, ...over };
}

/** Run kills (one per entry, at that step) through the gate and collect the actions. */
function run(steps: readonly number[], over: Partial<KillInput> = {}, g0: KillGate = KILL_GATE_INIT): { gate: KillGate; actions: KillAction[] } {
  let g = g0;
  const actions: KillAction[] = [];
  for (const step of steps) {
    const r = gateKill(g, input({ ...over, step }));
    g = r.gate;
    actions.push(r.action);
  }
  return { gate: g, actions };
}

type NoteAction = Extract<KillAction, { type: 'note' }>;
type ChordAction = Extract<KillAction, { type: 'chord' }>;
const notesOf = (a: readonly KillAction[]): NoteAction[] => a.filter((x): x is NoteAction => x.type === 'note');

describe('call and response gate', () => {
  it('budget grows with threat from 3 to 6 per bar', () => {
    expect(killBudget(0)).toBe(KILL_BUDGET_MIN);
    expect(KILL_BUDGET_MIN).toBeGreaterThanOrEqual(RESOLVE_KILLS);
    expect(killBudget(1)).toBe(KILL_BUDGET_MAX);
    expect(killBudget(0.5)).toBeGreaterThan(KILL_BUDGET_MIN);
    expect(killBudget(Number.NaN)).toBe(KILL_BUDGET_MIN);
    expect(killBudget(5)).toBe(KILL_BUDGET_MAX);
  });

  it('a kill lands on the next off beat slot, the first of the bar is the root', () => {
    const r = gateKill(KILL_GATE_INIT, input({ step: 32 }));
    expect(r.action).toEqual({ type: 'note', step: 33, index: 0, dur: 1, resolveAt: null });
    const r2 = gateKill(KILL_GATE_INIT, input({ step: 35, durSteps: 2 }));
    expect(r2.action).toEqual({ type: 'note', step: 35, index: 0, dur: 2, resolveAt: null });
  });

  it('kills in a bar climb the arpeggio on successive slots; the third books the resolution', () => {
    // A burst in one tick fills the next slots, at most a beat late; later ones keep the sfx only.
    const burst = run([32, 32, 32], { streaks: false });
    const n = notesOf(burst.actions);
    expect(n.map((a) => a.step)).toEqual([33, 35]);
    expect(n.map((a) => a.index)).toEqual([0, 1]);
    expect(burst.actions[2]).toEqual({ type: 'none', why: 'spacing' });
    expect(burst.gate.used).toBe(2);
    const spread = run([32, 36, 40, 44], { streaks: false });
    const sn = notesOf(spread.actions);
    expect(sn.map((a) => a.step)).toEqual([33, 37, 41, 45]);
    expect(sn.map((a) => a.index)).toEqual([0, 1, 2, 3]);
    expect(sn.map((a) => a.resolveAt)).toEqual([null, null, 48, null]);
    expect(spread.gate.resolveAt).toBe(48);
  });

  it('the count starts again each bar and the resolution keeps the bar line clear', () => {
    const a = run([32, 36, 40, 46, 48, 52], { streaks: false, durSteps: 2 });
    const n = notesOf(a.actions);
    // Slot 47 rings one step only: kill notes never ring over a bar line.
    expect(n.find((x) => x.step === 47)?.dur).toBe(1);
    // Bar 3 resolved on step 48 for three steps, so the next bar's first kill takes slot 51.
    const next = n.filter((x) => x.step >= 48);
    expect(next.map((x) => x.step)).toEqual([51, 53]);
    expect(next.map((x) => x.index)).toEqual([0, 1]);
  });

  it('bars of fewer than three kills never resolve', () => {
    const a = run([32, 40, 48, 56], { streaks: false });
    expect(notesOf(a.actions).every((x) => x.resolveAt === null)).toBe(true);
  });

  it('the bar budget holds at any threat, and every note is on a slot', () => {
    for (const level of [0, 0.5, 1]) {
      const steps: number[] = [];
      for (let s = 0; s < 16 * 8; s += 2) steps.push(s);
      const { actions } = run(steps, { level, streaks: false });
      const perBar = new Map<number, number>();
      for (const x of notesOf(actions)) perBar.set(Math.floor(x.step / 16), (perBar.get(Math.floor(x.step / 16)) ?? 0) + 1);
      for (const c of perBar.values()) expect(c).toBeLessThanOrEqual(killBudget(level));
      expect(actions.some((x) => x.type === 'none' && x.why === 'budget')).toBe(true);
      for (const x of notesOf(actions)) expect(isKillSlot(x.step)).toBe(true);
    }
  });

  it('the same kills in the same order give the same notes', () => {
    const steps = [3, 3, 4, 9, 17, 17, 18, 30, 33, 40, 41, 41, 41, 60];
    expect(run(steps).actions).toEqual(run(steps).actions);
  });

  it('three kills in one beat land a chord hit on the next bar downbeat', () => {
    const { gate, actions } = run([36, 37, 38]);
    expect(actions[0]?.type).toBe('note');
    expect(actions[1]?.type).toBe('note');
    expect(actions[2]).toEqual({ type: 'chord', step: 48, big: false, withResolve: false });
    expect(gate.chordAt).toBe(48);
    // Kills under the ring are absorbed; after it they climb again from the root.
    const later = run([48, 49, 56], {}, gate);
    expect(later.actions[0]).toEqual({ type: 'none', why: 'chord' });
    expect(later.actions[1]).toEqual({ type: 'none', why: 'chord' });
    expect(later.actions[2]).toMatchObject({ type: 'note', step: 57, index: 0 });
  });

  it('kills before a pending chord hit still climb, and ring no further than its downbeat', () => {
    const big = gateKill(KILL_GATE_INIT, input({ step: 40, big: true }));
    expect(big.action).toEqual({ type: 'chord', step: 48, big: true, withResolve: false });
    const r = gateKill(big.gate, input({ step: 46, durSteps: 2 }));
    expect(r.action).toEqual({ type: 'note', step: 47, index: 0, dur: 1, resolveAt: null });
  });

  it('no resolution where a chord hit is due; a chord hit over a resolution says so', () => {
    const bomb = gateBomb(KILL_GATE_INIT, 33, ROOM);
    expect(bomb.action).toEqual({ type: 'chord', step: 48, big: true, withResolve: false });
    const a = run([33, 37, 41], { streaks: false }, bomb.gate);
    expect(notesOf(a.actions).map((x) => x.resolveAt)).toEqual([null, null, null]);
    const b = run([33, 37, 41], { streaks: false });
    expect(b.gate.resolveAt).toBe(48);
    const late = gateBomb(b.gate, 44, ROOM);
    expect(late.action).toEqual({ type: 'chord', step: 48, big: true, withResolve: true });
  });

  it('a segment burst never makes a streak, so the head still lands a big chord hit', () => {
    let g = KILL_GATE_INIT;
    for (let i = 0; i < 8; i++) g = gateKill(g, input({ step: 33, streaks: false })).gate;
    // The burst climbs 1, 3, 5 and books the resolution; the head's big hit lands under it.
    expect(g.resolveAt).toBe(48);
    const head = gateKill(g, input({ step: 33, big: true }));
    expect(head.action).toEqual({ type: 'chord', step: 48, big: true, withResolve: true });
  });

  it('streak chords wait for the cooldown; big kills and bombs only skip a line already taken', () => {
    const first = run([36, 37, 38]);
    expect(first.gate.chordAt).toBe(48);
    // Another streak for the next bar line is inside the two bar cooldown: no chord.
    const second = run([56, 57, 58], {}, first.gate);
    expect(second.actions.some((x) => x.type === 'chord')).toBe(false);
    // Two bars on, a streak lands again.
    const third = run([68, 69, 70], {}, first.gate);
    expect(third.actions[2]).toMatchObject({ type: 'chord', step: 80 });
    expect(80 - 48).toBe(CHORD_COOLDOWN_STEPS);
    // A big kill a bar later lands regardless; a bomb for the same line is absorbed.
    const big = gateKill(first.gate, input({ step: 52, big: true }));
    expect(big.action).toMatchObject({ type: 'chord', step: 64, big: true });
    expect(gateBomb(big.gate, 60, ROOM).action).toEqual({ type: 'none', why: 'chord' });
    // A bomb on a bar line lands on it.
    expect(gateBomb(KILL_GATE_INIT, 64, ROOM).action).toMatchObject({ type: 'chord', step: 64 });
  });

  it('never steals: no free voice means sfx only, and a chord hit needs two', () => {
    expect(gateKill(KILL_GATE_INIT, input({ step: 32, noteRoom: NONE })).action).toEqual({ type: 'none', why: 'voices' });
    const oneVoice = (): number => 1;
    // A big kill without room for a chord falls back to a note.
    expect(gateKill(KILL_GATE_INIT, input({ step: 32, big: true, chordRoom: oneVoice })).action.type).toBe('note');
    expect(gateBomb(KILL_GATE_INIT, 32, oneVoice).action).toEqual({ type: 'none', why: 'voices' });
    expect(CHORD_MIN_VOICES).toBe(2);
    // No room for the resolution: the third note still sounds, the bar just does not resolve.
    const a = run([32, 36, 40], { streaks: false, resolveRoom: NONE });
    expect(notesOf(a.actions)).toHaveLength(3);
    expect(notesOf(a.actions).every((x) => x.resolveAt === null)).toBe(true);
  });

  it('room is asked for the slot and length the note will take', () => {
    const asked: number[][] = [];
    const probe = (s: number, n: number): number => {
      asked.push([s, n]);
      return 1;
    };
    gateKill(KILL_GATE_INIT, input({ step: 46, durSteps: 2, noteRoom: probe }));
    expect(asked).toEqual([[47, 1]]);
  });

  it('gains fit the accent reserve; no kill note rings into a chord hit or a resolution', () => {
    for (const s of SOURCES) expect(KILL_SPECS[s].noteGain).toBeLessThanOrEqual(ACCENT_RESERVE);
    expect(CHORD_GAIN).toBeLessThanOrEqual(ACCENT_RESERVE);
    expect(RESOLVE_GAIN).toBeLessThanOrEqual(ACCENT_RESERVE);
    expect(ACCENT_GAIN_MAX).toBeLessThanOrEqual(ACCENT_RESERVE);
    for (const s of SOURCES) expect(KILL_SPECS[s].durSteps).toBeLessThanOrEqual(KILL_SPACING);
    const steps: number[] = [];
    for (let i = 0; i < 400; i++) steps.push(Math.floor(i * 1.3));
    const { actions } = run(steps, { durSteps: 2, level: 1 });
    const n = notesOf(actions);
    const chords = actions.filter((x): x is ChordAction => x.type === 'chord').map((x) => x.step);
    const resolves = n.map((x) => x.resolveAt).filter((x): x is number => x !== null);
    const accents = [...chords, ...resolves];
    expect(chords.length).toBeGreaterThan(0);
    expect(resolves.length).toBeGreaterThan(0);
    for (const x of n) for (const a of accents) expect(x.step >= a || x.step + x.dur <= a, `note ${x.step} accent ${a}`).toBe(true);
    for (const x of n) expect(Math.floor((x.step + x.dur - 1) / 16)).toBe(Math.floor(x.step / 16));
  });
});

