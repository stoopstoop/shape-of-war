// Kill voicing (v2 fixes, Ryan at GD: "not every kill needs to contribute to the musical
// composition but a well balanced incorporation"). Pure, no Web Audio.
//
// Every enemy kind has its own kill note: its motif timbre made percussive, at its own
// pentatonic degree (moved with the bar's chord anchor, like the motifs), one or two sixteenths
// long. Gravity wells and spawners have their own sounds too. A kill is placed on the next
// sixteenth of the track grid, then a gate decides whether it sounds:
//   - at most killBudget(threat) kill notes per bar (2 when calm, 6 when crowded),
//   - at least an eighth between kill notes,
//   - a stateless hash of the kill's order in the level thins the rest (about 7 in 10 pass),
//   - only when the voice budget has a free voice (kill accents never steal).
// Kills the gate drops keep the existing sfx only. A streak (3 kills landing in one beat), a big
// kill (snake, spawner, well) or a bomb resolves into one chord on the next beat instead of a
// cluster of notes; kills inside a pending or sounding chord are absorbed by it.
//
// The source comes from the fx:kill kind field (kindSource); the colour is only a fallback for
// a payload without a kind. So a Mine pop is not a Sower kill, and Snake segments in a head's
// death burst have their own voice. Segments never count toward a streak, so a burst still ends
// in the head's big chord.
import { hash01 } from '../../core/rng';
import type { Events } from '../../core/events';
import type { EnemyKind } from '../../levelgen/leveldef';
import { LAYERS_FULL, TIMBRES, type Timbre } from './layers';
import { inPentatonic, pentatonicMidi } from './scale';
import { chordForBar, STEPS_PER_BAR } from './track';

/** The fx:kill colour, taken from the bus type so audio never imports src/render. */
export type KillColour = Events['fx:kill']['colour'];

/**
 * What was killed: an enemy kind, a gravity well or spawner, a Snake body segment in a head's
 * death burst, or a dropped hazard popping (Mine, Slime).
 */
export type KillSource = EnemyKind | 'well' | 'spawner' | 'segment' | 'mine' | 'slime';

/** Steps per beat. */
export const BEAT_STEPS = 4;
/** Kill notes per bar at threat 0 and at threat 1. */
export const KILL_BUDGET_MIN = 2;
export const KILL_BUDGET_MAX = 6;
/** Minimum distance between kill notes, steps (an eighth). */
export const KILL_SPACING = 2;
/** Share of eligible kills that sound, decided by hash of the kill order. */
export const KILL_ACCEPT = 0.7;
/** Kills landing in one beat that make a streak. */
export const STREAK_KILLS = 3;
/** Chord length, steps. */
export const CHORD_STEPS = 6;
/** A streak chord waits at least this long after the last chord, steps (one bar). */
export const CHORD_COOLDOWN_STEPS = STEPS_PER_BAR;
/** A chord needs at least this many free voices; with fewer it is skipped. */
export const CHORD_MIN_VOICES = 2;
/** Summed gain of one chord, shared by its notes. */
export const CHORD_GAIN = 0.09;
/** Most gain kill accents add at any instant (one note or one chord, never both). */
export const ACCENT_GAIN_MAX = 0.09;
/** Lead from the audio clock to the earliest grid step a kill may land on, seconds. */
export const KILL_LEAD_SEC = 0.03;
/** Kills waiting for the next tick; more than this in one tick fall back to sfx only. */
export const KILL_QUEUE_MAX = 32;

const SALT_KILL = 0x6b11;

export interface KillSpec {
  readonly source: KillSource;
  readonly timbre: Timbre;
  /** Pentatonic degree above A4 (before the chord anchor is added); distinct per source. */
  readonly degree: number;
  readonly durSteps: 1 | 2;
  readonly gain: number;
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
  const i = ENEMY_INPUTS[kind];
  return { source: kind, timbre: killTimbre(LAYERS_FULL[kind].timbre), ...i };
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
  well: { source: 'well', timbre: TIMBRES.gong, degree: -10, durSteps: 2, gain: 0.08 },
  spawner: { source: 'spawner', timbre: TIMBRES.clank, degree: 4, durSteps: 2, gain: 0.06 },
  segment: { source: 'segment', timbre: TIMBRES.rattle, degree: 3, durSteps: 1, gain: 0.045 },
  mine: { source: 'mine', timbre: TIMBRES.pop, degree: 7, durSteps: 1, gain: 0.05 },
  slime: { source: 'slime', timbre: TIMBRES.blip, degree: -4, durSteps: 1, gain: 0.045 },
});

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
 * Pure: a kill note's pitch at a bar: the source's pentatonic degree moved with the bar's chord
 * anchor, like the motifs. Degrees are distinct per source, so two kinds never share a pitch.
 */
export function killMidi(spec: Pick<KillSpec, 'degree'>, bar: number): number {
  return pentatonicMidi(spec.degree + chordForBar(bar).arpAnchor);
}

/** Pure: the nearest pentatonic note at or below a MIDI note. */
export function snapDownPentatonic(midi: number): number {
  let m = Math.round(midi);
  while (!inPentatonic(m)) m--;
  return m;
}

/**
 * Pure: the chord accent at a bar: the pad voicing an octave up, snapped into the pentatonic.
 * A big chord (bomb, big kill) adds the lowest note an octave down.
 */
export function chordMidis(bar: number, big: boolean): number[] {
  const up: number[] = [];
  for (const m of chordForBar(bar).pad) {
    const n = snapDownPentatonic(m + 12);
    if (!up.includes(n)) up.push(n);
  }
  up.sort((a, b) => a - b);
  const low = up[0];
  return big && low !== undefined ? [low - 12, ...up] : up;
}

/** Pure: kill notes allowed per bar at a threat level. */
export function killBudget(level: number): number {
  const l = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  return KILL_BUDGET_MIN + Math.round(l * (KILL_BUDGET_MAX - KILL_BUDGET_MIN));
}

/** Pure: true when the kill with this order in the level passes the thinning hash. */
export function killPasses(seed: number, ordinal: number): boolean {
  return hash01((seed ^ Math.imul(SALT_KILL, 0x27d4eb2d)) >>> 0, ordinal) < KILL_ACCEPT;
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
  /** Start of the last chord, and the step it ends on. */
  readonly chordAt: number;
  readonly chordEnd: number;
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
};

export type KillAction =
  | { readonly type: 'none'; readonly why: 'chord' | 'budget' | 'spacing' | 'hash' | 'voices' }
  | { readonly type: 'note'; readonly step: number }
  | { readonly type: 'chord'; readonly step: number; readonly big: boolean };

export interface KillInput {
  readonly seed: number;
  /** Order of this kill in the level, from 0. */
  readonly ordinal: number;
  /** Grid step the kill lands on. */
  readonly step: number;
  /** Smoothed threat 0 to 1. */
  readonly level: number;
  readonly big: boolean;
  readonly durSteps: number;
  /** Free accent voices for a note at `step`. */
  readonly noteRoom: number;
  /** Free accent voices for a chord at `chordStepFor(...)`. */
  readonly chordRoom: number;
  /** False for kills that never count toward a streak (Snake segments). Default true. */
  readonly streaks?: boolean;
}

export interface GateResult {
  readonly gate: KillGate;
  readonly action: KillAction;
}

/** Pure: the beat line a streak or big kill chord lands on (the next beat, after any kill note). */
export function chordStepFor(g: KillGate, step: number): number {
  let s = (Math.floor(step / BEAT_STEPS) + 1) * BEAT_STEPS;
  while (s < g.noteEnd) s += BEAT_STEPS;
  return s;
}

/** Pure: the beat line a bomb chord lands on (this step when it is on a beat, else the next). */
export function bombStepFor(g: KillGate, step: number): number {
  let s = Math.ceil(step / BEAT_STEPS) * BEAT_STEPS;
  while (s < g.noteEnd) s += BEAT_STEPS;
  return s;
}

function chord(g: KillGate, step: number, big: boolean): GateResult {
  return { gate: { ...g, beatKills: 0, chordAt: step, chordEnd: step + CHORD_STEPS }, action: { type: 'chord', step, big } };
}

/** Pure: decide one kill. */
export function gateKill(g: KillGate, k: KillInput): GateResult {
  const s = k.step;
  if (s < g.chordEnd) return { gate: g, action: { type: 'none', why: 'chord' } };
  const bar = Math.floor(s / STEPS_PER_BAR);
  const beat = Math.floor(s / BEAT_STEPS);
  const next: KillGate = {
    ...g,
    bar,
    used: bar === g.bar ? g.used : 0,
    beat,
    beatKills: (beat === g.beat ? g.beatKills : 0) + (k.streaks === false ? 0 : 1),
  };
  const cStep = chordStepFor(next, s);
  const cooled = cStep - g.chordAt >= CHORD_COOLDOWN_STEPS;
  const wantsChord = k.big || (next.beatKills >= STREAK_KILLS && cooled);
  if (wantsChord && k.chordRoom >= CHORD_MIN_VOICES) return chord(next, cStep, k.big);
  if (next.used >= killBudget(k.level)) return { gate: next, action: { type: 'none', why: 'budget' } };
  if (s - g.lastNote < KILL_SPACING || s < g.noteEnd) return { gate: next, action: { type: 'none', why: 'spacing' } };
  if (!killPasses(k.seed, k.ordinal)) return { gate: next, action: { type: 'none', why: 'hash' } };
  if (k.noteRoom < 1) return { gate: next, action: { type: 'none', why: 'voices' } };
  const dur = Math.max(1, Math.min(KILL_SPACING, Math.round(k.durSteps)));
  return { gate: { ...next, used: next.used + 1, lastNote: s, noteEnd: s + dur }, action: { type: 'note', step: s } };
}

/** Pure: a bomb always resolves into a big chord on the next beat, unless a chord is already due. */
export function gateBomb(g: KillGate, step: number, chordRoom: number): GateResult {
  if (step < g.chordEnd) return { gate: g, action: { type: 'none', why: 'chord' } };
  if (chordRoom < CHORD_MIN_VOICES) return { gate: g, action: { type: 'none', why: 'voices' } };
  return chord(g, bombStepFor(g, step), true);
}
