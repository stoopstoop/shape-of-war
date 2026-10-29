// Kill voicing (v2 fixes, Ryan at GD: "not every kill needs to contribute to the musical
// composition but a well balanced incorporation"; v2.1 melody, Ryan at GE: kill notes "not
// consistent nor impactful enough on the melody and harmony"). Pure, no Web Audio.
//
// Call and response. The bed calls on the beats; kills answer on the off beat sixteenths of the
// bar (KILL_SLOTS, steps 1, 3, 5 ... 15). Each kill note climbs the current chord's arpeggio with
// the kill count in the bar: root, third, fifth, root up, and on. Every enemy kind keeps its own
// voice (its motif timbre, made percussive and brighter); the harmony decides the pitch. A kill
// takes the first free slot at or after it, at most a beat late, then a gate decides:
//   - at most killBudget(threat) kill notes per bar (3 when calm, 6 when crowded),
//   - only when the voice budget has a free voice (kill accents never steal).
// A bar with RESOLVE_KILLS or more kill notes resolves to the root of the next chord on the
// bar line, in the bright lead voice. A streak (3 kills landing in one beat), a big kill (snake,
// spawner, well) or a bomb lands on the downbeat of the next bar as a full chord hit; kills
// before it still climb, kills under its ring are absorbed. Kills the gate drops keep the
// existing sfx only.
//
// The source comes from the fx:kill kind field (kindSource); the colour is only a fallback for
// a payload without a kind. So a Mine pop is not a Sower kill, and Snake segments in a head's
// death burst have their own voice. Segments never count toward a streak, so a burst still ends
// in the head's big chord.
import type { Events } from '../../core/events';
import type { EnemyKind } from '../../levelgen/leveldef';
import { chordToneMidi, harmonyForBar } from './harmony';
import { brighten, LAYERS_FULL, TIMBRES, type Timbre } from './layers';
import { A4, inPentatonic, pentatonicMidi } from './scale';
import { chordForBar, STEPS_PER_BAR } from './track';
import { DEFAULT_TUNE, type Tune } from './tunes';

/** The fx:kill colour, taken from the bus type so audio never imports src/render. */
export type KillColour = Events['fx:kill']['colour'];

/**
 * What was killed: an enemy kind, a gravity well or spawner, a Snake body segment in a head's
 * death burst, or a dropped hazard popping (Mine, Slime).
 */
export type KillSource = EnemyKind | 'well' | 'spawner' | 'segment' | 'mine' | 'slime';

/** Steps per beat. */
export const BEAT_STEPS = 4;
/** Kill notes per bar at threat 0 and at threat 1. Calm still fits a resolving run of three. */
export const KILL_BUDGET_MIN = 3;
export const KILL_BUDGET_MAX = 6;
/** Minimum distance between kill notes, steps (an eighth). */
export const KILL_SPACING = 2;
/** The per bar rhythm kill notes fill: the off beat sixteenths, answering the beats. */
export const KILL_SLOTS: readonly number[] = [1, 3, 5, 7, 9, 11, 13, 15];
/** Most steps a kill may wait for a free slot; later it keeps the sfx only. */
export const KILL_MAX_DELAY = 4;
/** Kill notes climb the chord's arpeggio from the chord root nearest this note (A4). */
export const KILL_BASE = A4;
/** Kill notes in one bar that make the bar resolve to the root on the next bar line. */
export const RESOLVE_KILLS = 3;
/** Resolution length, steps; the next bar's kills start after it. */
export const RESOLVE_STEPS = 3;
/** Gain of the resolution note. */
export const RESOLVE_GAIN = 0.1;
/** Kills landing in one beat that make a streak. */
export const STREAK_KILLS = 3;
/** Chord length, steps. */
export const CHORD_STEPS = 6;
/** A streak chord waits at least this long after the last chord, steps (two bars). */
export const CHORD_COOLDOWN_STEPS = 2 * STEPS_PER_BAR;
/** A chord needs at least this many free voices; with fewer it is skipped. */
export const CHORD_MIN_VOICES = 2;
/** Summed gain of one chord hit, shared by its notes. */
export const CHORD_GAIN = 0.16;
/** Kill notes are this factor above the v2.0 kill gains (+6 dB, v2.1 melody item 4). */
export const KILL_GAIN_LIFT = 2;
/** Most gain kill accents add at any instant (one note, one resolution or one chord hit). */
export const ACCENT_GAIN_MAX = 0.16;
/** Lead from the audio clock to the earliest grid step a kill may land on, seconds. */
export const KILL_LEAD_SEC = 0.03;
/** Kills waiting for the next tick; more than this in one tick fall back to sfx only. */
export const KILL_QUEUE_MAX = 32;

export interface KillSpec {
  readonly source: KillSource;
  /** The source's percussive timbre (hit ticks build on it). */
  readonly timbre: Timbre;
  /** The kill note voice: the percussive timbre made brighter for the lead line. */
  readonly noteTimbre: Timbre;
  /** Pentatonic degree above A4 (before the chord anchor is added); the hit tick pitch family. */
  readonly degree: number;
  readonly durSteps: 1 | 2;
  /** v2.0 kill gain, the base hit ticks scale from. */
  readonly gain: number;
  /** Kill note gain: gain x KILL_GAIN_LIFT. */
  readonly noteGain: number;
}

/** Kill length cap for the envelope release, seconds, so every timbre reads as a hit. */
const KILL_RELEASE = 0.2;

/** Pure: a motif timbre made percussive for a kill: fast attack, no glide, a pluck release. */
export function killTimbre(t: Timbre): Timbre {
  return { ...t, attack: Math.min(t.attack, 0.004), release: KILL_RELEASE, glideSec: 0 };
}

interface SpecInput {
  readonly degree: number;
  readonly durSteps: 1 | 2;
  readonly gain: number;
}

function spec(source: KillSource, base: Timbre, i: SpecInput): KillSpec {
  const timbre = killTimbre(base);
  return { source, timbre, noteTimbre: brighten(timbre), ...i, noteGain: i.gain * KILL_GAIN_LIFT };
}

// Registers roughly follow the motif registers (D3 to E6 at the Am anchor), raised where the
// motif sits too low to read as a hit on a phone speaker. Short kills are high or light kinds.
const ENEMY_INPUTS: Readonly<Record<EnemyKind, SpecInput>> = {
  bulwark: { degree: -8, durSteps: 2, gain: 0.08 },
  splime: { degree: -7, durSteps: 2, gain: 0.07 },
  snake: { degree: -6, durSteps: 2, gain: 0.07 },
  grunt: { degree: -5, durSteps: 1, gain: 0.07 },
  charger: { degree: -3, durSteps: 1, gain: 0.065 },
  weaver: { degree: -2, durSteps: 1, gain: 0.07 },
  wanderer: { degree: 0, durSteps: 2, gain: 0.065 },
  swirl: { degree: 1, durSteps: 1, gain: 0.06 },
  pinwheel: { degree: 2, durSteps: 2, gain: 0.055 },
  dart: { degree: 5, durSteps: 1, gain: 0.05 },
  blink: { degree: 6, durSteps: 1, gain: 0.05 },
  sower: { degree: 8, durSteps: 1, gain: 0.05 },
};

function enemySpec(kind: EnemyKind): KillSpec {
  return spec(kind, LAYERS_FULL[kind].timbre, ENEMY_INPUTS[kind]);
}

/** One entry per source. Written as a literal so tsc rejects a new EnemyKind without one. */
export const KILL_SPECS: Readonly<Record<KillSource, KillSpec>> = Object.freeze({
  grunt: enemySpec('grunt'),
  wanderer: enemySpec('wanderer'),
  weaver: enemySpec('weaver'),
  pinwheel: enemySpec('pinwheel'),
  dart: enemySpec('dart'),
  snake: enemySpec('snake'),
  charger: enemySpec('charger'),
  bulwark: enemySpec('bulwark'),
  blink: enemySpec('blink'),
  swirl: enemySpec('swirl'),
  sower: enemySpec('sower'),
  splime: enemySpec('splime'),
  well: spec('well', TIMBRES.gong, { degree: -10, durSteps: 2, gain: 0.08 }),
  spawner: spec('spawner', TIMBRES.clank, { degree: 4, durSteps: 2, gain: 0.06 }),
  segment: spec('segment', TIMBRES.rattle, { degree: 3, durSteps: 1, gain: 0.045 }),
  mine: spec('mine', TIMBRES.pop, { degree: 7, durSteps: 1, gain: 0.05 }),
  slime: spec('slime', TIMBRES.blip, { degree: -4, durSteps: 1, gain: 0.045 }),
});

/** The resolution voice: the bright lead. */
export const RESOLVE_TIMBRE: Timbre = TIMBRES.lead;

/** The chord accent timbre. */
export const CHORD_TIMBRE: Timbre = TIMBRES.chime;

/**
 * Kill sources by the numeric value of the sim's Kind (src/game/world.ts), indexed by value.
 * Audio never imports src/game, so the order is mirrored here; tests/audio/music/kills.test.ts
 * checks every entry against the real enum. null: the ship, geoms, drones and pickups.
 */
const KIND_SOURCES: readonly (KillSource | null)[] = [
  null, // None
  null, // Ship
  'grunt',
  'wanderer',
  'weaver',
  'pinwheel',
  'dart',
  'snake', // SnakeHead
  'segment', // SnakeBody
  'well', // GravityWell
  'spawner',
  null, // Geom
  null, // Drone
  null, // WeaponPickup
  'charger',
  'bulwark',
  'blink',
  'swirl',
  'sower',
  'mine',
  'splime',
  'slime',
];

/** Pure: the source for a sim Kind value, or null for a kind with no sound (or out of range). */
export function kindSource(kind: number): KillSource | null {
  return Number.isInteger(kind) ? (KIND_SOURCES[kind] ?? null) : null;
}

/**
 * Pure: the source of an fx:kill or fx:hit. The kind field decides; the colour is read only
 * when the kind is missing (undefined, not a number, or Kind.None from an old emitter).
 */
export function sourceFor(kind: number | undefined, colour: KillColour | undefined): KillSource | null {
  if (typeof kind === 'number' && Number.isFinite(kind) && kind !== 0) return kindSource(kind);
  return colour === undefined ? null : sourceForColour(colour);
}

/**
 * Pure: the source of an fx:kill by its colour, the fallback for a payload without a kind.
 * By colour a Mine reads as a Sower and a Snake segment as the Snake; index.ts only counts a
 * colour followed by an 'explode' sfx, so colour only segments stay silent.
 */
export function sourceForColour(c: KillColour): KillSource | null {
  switch (c) {
    case 'blue':
      return 'grunt';
    case 'purple':
      return 'wanderer';
    case 'green':
      return 'weaver';
    case 'magenta':
      return 'pinwheel';
    case 'orange':
      return 'dart';
    case 'cyan':
      return 'snake';
    case 'charger':
      return 'charger';
    case 'bulwark':
      return 'bulwark';
    case 'blink':
      return 'blink';
    case 'swirl':
      return 'swirl';
    case 'sower':
      return 'sower';
    case 'splime':
      return 'splime';
    case 'red':
      return 'well';
    case 'yellow':
      return 'spawner';
    default:
      return null;
  }
}

/** Pure: the enemy kind a source is, or null for wells, spawners, segments and dropped hazards. */
export function enemyOf(s: KillSource): EnemyKind | null {
  switch (s) {
    case 'well':
    case 'spawner':
    case 'segment':
    case 'mine':
    case 'slime':
      return null;
    default:
      return s;
  }
}

/** Pure: big kills resolve into a chord: the snake, spawners and gravity wells. */
export function isBigSource(s: KillSource): boolean {
  return s === 'snake' || s === 'spawner' || s === 'well';
}

/**
 * Pure: a source's home pitch at a bar: its pentatonic degree moved with the bar's chord anchor.
 * Distinct per source; hit ticks are built on it (hits.ts). Kill notes use killNoteMidi.
 */
export function killMidi(spec: Pick<KillSpec, 'degree'>, bar: number, tune: Tune = DEFAULT_TUNE): number {
  return pentatonicMidi(spec.degree + chordForBar(bar, tune).arpAnchor, tune.root);
}

/** Pure: the nearest pentatonic note at or below a MIDI note. */
export function snapDownPentatonic(midi: number): number {
  let m = Math.round(midi);
  while (!inPentatonic(m)) m--;
  return m;
}

/**
 * Pure: the pitch of the kill note with this index in its bar (0 for the first): the bar
 * chord's arpeggio climbing from the root nearest A4 (root, third, fifth, root up, ...).
 */
export function killNoteMidi(bar: number, index: number, tune: Tune = DEFAULT_TUNE): number {
  return chordToneMidi(harmonyForBar(bar, tune.key), Math.max(0, Math.trunc(index)), KILL_BASE);
}

/** Pure: the resolution at a bar line: the root of that bar's chord, an octave above the run's start. */
export function resolveMidi(bar: number, tune: Tune = DEFAULT_TUNE): number {
  return chordToneMidi(harmonyForBar(bar, tune.key), 3, KILL_BASE);
}

/**
 * Pure: a full chord hit at a bar: root, third, fifth and the root up, from the root nearest A4.
 * A big hit (bomb, big kill) adds the root an octave down.
 */
export function chordMidis(bar: number, big: boolean, tune: Tune = DEFAULT_TUNE): number[] {
  const h = harmonyForBar(bar, tune.key);
  const degs = big ? [-3, 0, 1, 2, 3] : [0, 1, 2, 3];
  return degs.map((d) => chordToneMidi(h, d, KILL_BASE));
}

/**
 * Pure: the notes and summed gain of a chord hit. When a resolution already sounds on the same
 * bar line the hit leaves the top root to it and shares what is left of the accent reserve.
 */
export function chordHit(bar: number, big: boolean, withResolve: boolean, tune: Tune = DEFAULT_TUNE): { midis: number[]; gain: number } {
  const all = chordMidis(bar, big, tune);
  if (!withResolve) return { midis: all, gain: CHORD_GAIN };
  const top = resolveMidi(bar, tune);
  return { midis: all.filter((m) => m !== top), gain: ACCENT_GAIN_MAX - RESOLVE_GAIN };
}

/** Pure: kill notes allowed per bar at a threat level. */
export function killBudget(level: number): number {
  const l = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  return KILL_BUDGET_MIN + Math.round(l * (KILL_BUDGET_MAX - KILL_BUDGET_MIN));
}

/** Pure: true when an absolute step is a kill slot. */
export function isKillSlot(step: number): boolean {
  const s = ((Math.trunc(step) % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR;
  return KILL_SLOTS.includes(s);
}

/** Pure: the first kill slot at or after an absolute step. */
export function slotAtOrAfter(step: number): number {
  let s = Math.ceil(step);
  while (!isKillSlot(s)) s++;
  return s;
}

/** Pure: the first bar line at or after an absolute step. */
export function barLineAtOrAfter(step: number): number {
  return Math.ceil(step / STEPS_PER_BAR) * STEPS_PER_BAR;
}

/** Gate state, in absolute steps. */
export interface KillGate {
  /** Bar the budget counts for, and kill notes used in it. */
  readonly bar: number;
  readonly used: number;
  /** Step of the last kill note, and the step it ends on. */
  readonly lastNote: number;
  readonly noteEnd: number;
  /** Beat the streak counts for, and kills landed in it. */
  readonly beat: number;
  readonly beatKills: number;
  /** Start of the last chord hit, and the step it ends on. */
  readonly chordAt: number;
  readonly chordEnd: number;
  /** Bar line of the last booked resolution. */
  readonly resolveAt: number;
}

export const KILL_GATE_INIT: KillGate = {
  bar: -1,
  used: 0,
  lastNote: -1e9,
  noteEnd: -1e9,
  beat: -1,
  beatKills: 0,
  chordAt: -1e9,
  chordEnd: -1e9,
  resolveAt: -1e9,
};

export type KillAction =
  | { readonly type: 'none'; readonly why: 'chord' | 'budget' | 'spacing' | 'voices' }
  | {
      readonly type: 'note';
      readonly step: number;
      /** Kill notes before this one in its bar: the arpeggio degree. */
      readonly index: number;
      readonly dur: number;
      /** Bar line the bar resolves on, when this note is the one that makes it resolve. */
      readonly resolveAt: number | null;
    }
  | { readonly type: 'chord'; readonly step: number; readonly big: boolean; readonly withResolve: boolean };

export interface KillInput {
  /** Earliest grid step the kill may land on. */
  readonly step: number;
  /** Smoothed threat 0 to 1. */
  readonly level: number;
  readonly big: boolean;
  readonly durSteps: number;
  /** False for kills that never count toward a streak (Snake segments). Default true. */
  readonly streaks?: boolean;
  /** Free accent voices for a note at a step for some steps. */
  readonly noteRoom: (step: number, steps: number) => number;
  /** Free accent voices for a chord hit at a bar line. */
  readonly chordRoom: (step: number) => number;
  /** Free accent voices for a resolution at a bar line. */
  readonly resolveRoom: (step: number) => number;
}

export interface GateResult {
  readonly gate: KillGate;
  readonly action: KillAction;
}

/** Pure: the bar line a streak, big kill or bomb chord hit lands on. */
export function chordStepFor(step: number): number {
  return barLineAtOrAfter(step);
}

function chord(g: KillGate, step: number, big: boolean): GateResult {
  const withResolve = g.resolveAt === step;
  return { gate: { ...g, beatKills: 0, chordAt: step, chordEnd: step + CHORD_STEPS }, action: { type: 'chord', step, big, withResolve } };
}

/** True when [s, s + 1) falls under a chord ring or a resolution. */
function blocked(g: KillGate, s: number): 'chord' | 'resolve' | null {
  if (s >= g.chordAt && s < g.chordEnd) return 'chord';
  if (s >= g.resolveAt && s < g.resolveAt + RESOLVE_STEPS) return 'resolve';
  return null;
}

/** Pure: the longest a note at slot s may ring: its own length, cut at the bar line and any booked accent. */
function fitDur(g: KillGate, s: number, want: number): number {
  let end = s + Math.max(1, Math.min(KILL_SPACING, Math.round(want)));
  end = Math.min(end, barLineAtOrAfter(s + 1));
  if (g.chordAt > s) end = Math.min(end, g.chordAt);
  if (g.resolveAt > s) end = Math.min(end, g.resolveAt);
  return Math.max(1, end - s);
}

/** Pure: decide one kill. */
export function gateKill(g: KillGate, k: KillInput): GateResult {
  const s = k.step;
  const beat = Math.floor(s / BEAT_STEPS);
  const counted: KillGate = { ...g, beat, beatKills: (beat === g.beat ? g.beatKills : 0) + (k.streaks === false ? 0 : 1) };
  const cStep = chordStepFor(s);
  const pending = g.chordAt === cStep;
  const cooled = cStep - g.chordAt >= CHORD_COOLDOWN_STEPS;
  const wantsChord = !pending && (k.big || (counted.beatKills >= STREAK_KILLS && cooled));
  if (wantsChord && k.chordRoom(cStep) >= CHORD_MIN_VOICES) return chord(counted, cStep, k.big);
  // A note: the first free slot at or after the kill, at most KILL_MAX_DELAY late.
  let why: 'chord' | 'spacing' = 'spacing';
  for (let c = slotAtOrAfter(Math.max(s, g.lastNote + KILL_SPACING, g.noteEnd)); c <= s + KILL_MAX_DELAY; c = slotAtOrAfter(c + 1)) {
    const b = blocked(counted, c);
    if (b !== null) {
      if (b === 'chord') why = 'chord';
      continue;
    }
    const bar = Math.floor(c / STEPS_PER_BAR);
    const used = bar === g.bar ? g.used : 0;
    if (used >= killBudget(k.level)) return { gate: counted, action: { type: 'none', why: 'budget' } };
    const dur = fitDur(counted, c, k.durSteps);
    if (k.noteRoom(c, dur) < 1) return { gate: counted, action: { type: 'none', why: 'voices' } };
    let resolveAt: number | null = null;
    const line = (bar + 1) * STEPS_PER_BAR;
    if (used + 1 === RESOLVE_KILLS && counted.chordAt !== line && k.resolveRoom(line) >= 1) resolveAt = line;
    const gate: KillGate = {
      ...counted,
      bar,
      used: used + 1,
      lastNote: c,
      noteEnd: c + dur,
      resolveAt: resolveAt ?? counted.resolveAt,
    };
    return { gate, action: { type: 'note', step: c, index: used, dur, resolveAt } };
  }
  return { gate: counted, action: { type: 'none', why } };
}

/** Pure: a bomb always lands as a big chord hit on the next bar line, unless one is already due there. */
export function gateBomb(g: KillGate, step: number, chordRoom: (step: number) => number): GateResult {
  const cStep = chordStepFor(step);
  if (g.chordAt === cStep) return { gate: g, action: { type: 'none', why: 'chord' } };
  if (chordRoom(cStep) < CHORD_MIN_VOICES) return { gate: g, action: { type: 'none', why: 'voices' } };
  return chord(g, cStep, true);
}
