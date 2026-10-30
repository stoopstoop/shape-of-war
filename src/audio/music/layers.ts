// Enemy layers (SPEC 3.9, docs/10 wave D). One registry entry per EnemyKind: a stinger degree,
// a 2 bar motif, a timbre, a register and a gain. Pure: a motif bar is a function of
// (seed, kind, bar) built on the stateless hash01. No PRNG, no Web Audio.
//
// Degrees are A minor pentatonic degrees above A4 (degree 0 is A4, 5 is A5, -5 is A3). A phrase
// is 2 bars (32 steps) and lines up with the base track's chord changes; each phrase is
// transposed by its chord's arp anchor, then every note is fitted to the harmonic plan
// (harmony.ts): chord tones on the beats, scale tones between.
//
// The entrance stinger (v2.1 melody) is a short phrase per kind, 3 to 5 notes written as chord
// degrees on a fixed rhythm. The same kind always plays the same shape; the chord decides the
// pitches, so it always agrees with the bed.
import { hash01 } from '../../core/rng';
import type { EnemyKind } from '../../levelgen/leveldef';
import {
  chordToneMidi,
  fitPitch,
  harmonyAtStep,
  harmonyForBar,
  isStrongStep,
  stepChordTone,
  transposePhrase,
  type PhraseNote,
  type PlacedNote,
} from './harmony';
import { A4, pentatonicMidi } from './scale';
import { chordForBar, LOOP_BARS, loopBar, STEPS_PER_BAR } from './track';
import { DEFAULT_TUNE, type Tune } from './tunes';

export const PHRASE_BARS = 2;
export const PHRASE_STEPS = STEPS_PER_BAR * PHRASE_BARS;
export const MOTIF_MIN_NOTES = 4;
export const MOTIF_MAX_NOTES = 8;
/** Longest entrance phrase, steps (end of its last note). */
export const STINGER_STEPS = 10;
/** Entrance phrase notes per kind. */
export const STINGER_MIN_NOTES = 3;
export const STINGER_MAX_NOTES = 5;
/** Entrance phrases sit no lower than A3, so a low kind's phrase still reads on a phone. */
export const STINGER_BASE_MIN = 57;
/**
 * Melodic lift (v2.1 melody, item 4): motif layer gains are this factor above the v2.0 mix
 * (+6 dB). The budget in lifecycle.ts lowers the bed to make room.
 */
export const MOTIF_GAIN_LIFT = 2;

/** Every EnemyKind, in registry order (v1 kinds first, then v2). */
export const LAYER_KINDS = [
  'grunt',
  'wanderer',
  'weaver',
  'pinwheel',
  'dart',
  'snake',
  'charger',
  'bulwark',
  'blink',
  'swirl',
  'sower',
  'splime',
] as const satisfies readonly EnemyKind[];

/** Cut 1 keeps motifs for these kinds only (the first three v1 kinds). */
export const CUT1_KEEP: readonly EnemyKind[] = ['grunt', 'wanderer', 'weaver'];

export type TimbreId =
  | 'pulse'
  | 'drift'
  | 'reed'
  | 'bell'
  | 'zip'
  | 'slide'
  | 'windup'
  | 'heavy'
  | 'glass'
  | 'spiral'
  | 'tick'
  | 'wobble'
  // Kill accents only (kills.ts): gravity well, spawner, and the kill chord.
  | 'gong'
  | 'clank'
  | 'chime'
  // Kill accents for a Snake segment, a Mine pop and a Slime pop (kills.ts).
  | 'rattle'
  | 'pop'
  | 'blip'
  // The Bulwark shield deflect (hits.ts).
  | 'deflect'
  // The bright lead: the root a run of kill notes resolves to (kills.ts).
  | 'lead';

/** Boss motif and boss stinger timbres (boss.ts), kept out of TIMBRES so the enemy table is unchanged. */
export type BossTimbreId = 'heart' | 'murk' | 'spin' | 'flare' | 'mirror' | 'abyss' | 'bulwark' | 'gale' | 'echo' | 'prism' | 'bossSting';

export interface Partner {
  readonly wave: OscillatorType;
  /** Cents relative to the main oscillator. */
  readonly detune: number;
}

/** How one kind sounds. Read by the engine; times in seconds. */
export interface Timbre {
  readonly id: TimbreId | BossTimbreId;
  readonly wave: OscillatorType;
  /** Optional second oscillator, mixed at equal level. */
  readonly partner: Partner | null;
  readonly filter: BiquadFilterType;
  readonly filterHz: number;
  readonly q: number;
  readonly attack: number;
  readonly release: number;
  /** Pitch glide from the note's `fromMidi`, 0 for none. */
  readonly glideSec: number;
}

export interface PatternNote {
  /** Step inside the 2 bar phrase, 0 to 31. */
  readonly step: number;
  /** Degree relative to the kind's register and the phrase's chord anchor. */
  readonly rel: number;
  readonly dur: number;
  readonly vel: number;
  /** Glide in from the previous note's pitch (or one degree below when it is the same). */
  readonly glide: boolean;
  /** The loop's answering note only: the degrees it moved (already added to rel). */
  readonly answer?: number;
}

/** How a seed varies the composed pattern. */
export type Variation = 'none' | 'walk' | 'rotate' | 'offset';

export interface MotifNote {
  /** Step inside the bar, 0 to 15. */
  readonly step: number;
  readonly midi: number;
  /** Glide start pitch, or null. */
  readonly fromMidi: number | null;
  readonly durSteps: number;
  readonly vel: number;
}

export type MotifBuilder = (seed: number, bar: number, tune?: Tune) => readonly MotifNote[];

export interface LayerSpec {
  readonly kind: EnemyKind;
  /** The entrance phrase: chord degrees on a rhythm, the same shape every time. */
  readonly phrase: readonly PhraseNote[];
  /** Register: the base pentatonic degree above A4, distinct per kind. */
  readonly register: number;
  readonly timbre: Timbre;
  /** Layer gain at full fade, before the motif budget scale. */
  readonly gain: number;
  /** The composed 2 bar shape. Empty when the motif is cut (cut 1); the stinger stays. */
  readonly pattern: readonly PatternNote[];
  readonly variation: Variation;
  /** One line on the behaviour the motif mirrors (docs/10 wave D design). */
  readonly character: string;
  readonly motif: MotifBuilder;
}

export type LayerRegistry = Readonly<Record<EnemyKind, LayerSpec>>;

// ---------------------------------------------------------------------------------------
// Timbres.

export function timbre(
  id: TimbreId | BossTimbreId,
  wave: OscillatorType,
  partner: Partner | null,
  filter: BiquadFilterType,
  filterHz: number,
  q: number,
  attack: number,
  release: number,
  glideSec = 0,
): Timbre {
  return { id, wave, partner, filter, filterHz, q, attack, release, glideSec };
}

export const TIMBRES: Readonly<Record<TimbreId, Timbre>> = {
  pulse: timbre('pulse', 'square', null, 'lowpass', 1400, 1, 0.004, 0.12),
  drift: timbre('drift', 'sine', { wave: 'triangle', detune: 7 }, 'lowpass', 2400, 0.7, 0.06, 0.2),
  reed: timbre('reed', 'triangle', null, 'bandpass', 1800, 3, 0.006, 0.06),
  bell: timbre('bell', 'sine', { wave: 'sine', detune: 1200 }, 'lowpass', 5000, 0.7, 0.002, 0.2),
  zip: timbre('zip', 'sawtooth', null, 'highpass', 900, 1.5, 0.002, 0.05),
  slide: timbre('slide', 'sawtooth', null, 'lowpass', 900, 2, 0.04, 0.2, 0.22),
  windup: timbre('windup', 'square', null, 'bandpass', 1200, 2, 0.01, 0.06, 0.3),
  heavy: timbre('heavy', 'square', { wave: 'triangle', detune: -1200 }, 'lowpass', 520, 1.5, 0.008, 0.16),
  glass: timbre('glass', 'square', null, 'highpass', 2000, 2, 0.001, 0.03),
  spiral: timbre('spiral', 'triangle', { wave: 'triangle', detune: 12 }, 'lowpass', 3500, 1, 0.003, 0.09),
  tick: timbre('tick', 'sine', null, 'highpass', 1200, 0.7, 0.001, 0.02),
  wobble: timbre('wobble', 'sine', { wave: 'sawtooth', detune: 14 }, 'lowpass', 600, 3, 0.08, 0.25, 0.45),
  gong: timbre('gong', 'sine', { wave: 'triangle', detune: 700 }, 'lowpass', 1800, 0.8, 0.003, 0.4),
  clank: timbre('clank', 'square', { wave: 'square', detune: 1902 }, 'bandpass', 2200, 2.5, 0.001, 0.12),
  chime: timbre('chime', 'triangle', { wave: 'sine', detune: 1200 }, 'lowpass', 4200, 0.7, 0.004, 0.5),
  rattle: timbre('rattle', 'sawtooth', null, 'bandpass', 1500, 6, 0.001, 0.05),
  pop: timbre('pop', 'triangle', null, 'bandpass', 2600, 4, 0.001, 0.05),
  blip: timbre('blip', 'sine', { wave: 'sine', detune: 500 }, 'lowpass', 2000, 0.7, 0.002, 0.08),
  // A square and a triangle an inharmonic 2.45 apart through a narrow band: a ringing metal
  // ping, with a short drop from a tone above.
  deflect: timbre('deflect', 'square', { wave: 'triangle', detune: 1551 }, 'bandpass', 3200, 6, 0.001, 0.07, 0.012),
  // Two detuned saws through an open lowpass: the brightest voice in the mix, for the root a
  // run of kill notes resolves to.
  lead: timbre('lead', 'sawtooth', { wave: 'sawtooth', detune: 9 }, 'lowpass', 5200, 0.9, 0.003, 0.3),
};

/** Lowpass and bandpass cutoffs a bright voice opens to at least. */
export const BRIGHT_MIN_HZ = 3200;
/** Factor a bright voice opens a lowpass or bandpass by. */
export const BRIGHT_HZ_MUL = 2.5;
/** Widest bandpass Q a bright voice keeps. */
export const BRIGHT_Q_MAX = 1.5;

/**
 * Pure: a brighter version of a timbre for the lead line (entrance phrases and kill notes): the
 * filter opens (lowpass and bandpass to at least BRIGHT_MIN_HZ, the band wider), and a timbre
 * with one oscillator gains a triangle an octave up. The id and envelope are kept.
 */
export function brighten(t: Timbre): Timbre {
  const open = t.filter === 'lowpass' || t.filter === 'bandpass';
  const filterHz = open ? Math.max(BRIGHT_MIN_HZ, t.filterHz * BRIGHT_HZ_MUL) : t.filterHz;
  const q = t.filter === 'bandpass' ? Math.min(t.q, BRIGHT_Q_MAX) : t.q;
  const partner: Partner = t.partner ?? { wave: 'triangle', detune: 1200 };
  return { ...t, filterHz, q, partner };
}

// ---------------------------------------------------------------------------------------
// Composed patterns. Each is monophonic: a note ends at or before the next starts, wrapping
// at the phrase end, so one kind holds at most one voice.

function p(step: number, rel: number, dur: number, vel = 1, glide = false): PatternNote {
  return { step, rel, dur, vel, glide };
}

const PATTERNS: Readonly<Record<EnemyKind, readonly PatternNote[]>> = {
  // Steady pulse on the quarters, a lift on the fourth beat of each bar.
  grunt: [p(0, 0, 2), p(4, 0, 2, 0.7), p(8, 0, 2, 0.85), p(12, 2, 2, 0.7), p(16, 0, 2), p(20, 0, 2, 0.7), p(24, 0, 2, 0.85), p(28, -1, 2, 0.7)],
  // Drifting walk at uneven spacing; the degrees are replaced by a seeded random walk.
  wanderer: [p(0, 0, 5), p(6, 1, 4, 0.8), p(10, 2, 5, 0.9), p(16, 1, 5), p(22, 0, 4, 0.8), p(27, -1, 4, 0.85)],
  // Off beat sidesteps, alternating up and down.
  weaver: [p(2, 0, 1), p(6, 2, 1, 0.8), p(10, 0, 1, 0.9), p(18, -1, 1), p(22, 1, 1, 0.8), p(26, -2, 1, 0.9)],
  // A four note cycle turning twice; the seed picks where the cycle starts.
  pinwheel: [p(0, 0, 2), p(4, 1, 2, 0.75), p(8, 2, 2, 0.85), p(12, 3, 2, 0.75), p(16, 0, 2), p(20, 1, 2, 0.75), p(24, 2, 2, 0.85), p(28, 3, 2, 0.75)],
  // Two fast sixteenth runs; the seed moves them in the phrase.
  dart: [p(8, 0, 1, 0.7), p(9, 1, 1, 0.8), p(10, 2, 1, 0.9), p(11, 3, 1), p(24, 1, 1, 0.7), p(25, 2, 1, 0.8), p(26, 3, 1, 0.9), p(27, 4, 1)],
  // Long notes sliding into each other.
  snake: [p(0, 0, 8, 1, true), p(8, 1, 8, 0.9, true), p(16, -1, 8, 1, true), p(24, 1, 8, 0.9, true)],
  // Rising wind up, then silence for the dash and the rest. Twice per phrase.
  charger: [p(0, 0, 3, 0.7, true), p(3, 1, 3, 0.85, true), p(6, 2, 4, 1, true), p(16, 0, 3, 0.7, true), p(19, 1, 3, 0.85, true), p(22, 3, 4, 1, true)],
  // A heavy low pair, twice.
  bulwark: [p(0, 0, 3), p(3, 0, 4, 0.8), p(16, 0, 3), p(19, -1, 4, 0.8)],
  // Bright staccato pairs with gaps; the seed moves the pairs.
  blink: [p(0, 0, 1), p(1, 2, 1, 0.8), p(10, 1, 1), p(11, 3, 1, 0.8), p(20, 0, 1), p(21, 4, 1, 0.8)],
  // A looping spiral arpeggio: up in thirds, step back, again from one higher.
  swirl: [p(0, 0, 2), p(2, 2, 2, 0.8), p(4, 4, 2, 0.9), p(6, 3, 2, 0.8), p(16, 1, 2), p(18, 3, 2, 0.8), p(20, 5, 2, 0.9), p(22, 4, 2, 0.8)],
  // Sparse ticks; the seed moves them.
  sower: [p(0, 0, 1), p(12, 0, 1, 0.7), p(22, -1, 1, 0.85), p(28, 0, 1, 0.6)],
  // Slow wobbling glide between two low notes.
  splime: [p(0, 0, 8, 1, true), p(8, 2, 8, 0.9, true), p(16, 0, 8, 1, true), p(24, 2, 8, 0.9, true)],
};

// ---------------------------------------------------------------------------------------
// Builder.

const SALT_KIND = 0x4c41;
const SALT_WALK = 0x0d11;
const SALT_ROT = 0x0e22;
const SALT_OFF = 0x0f33;
const SALT_ANSWER = 0x1044;
const WALK_LIMIT = 3;
const ANSWER_MOVES: readonly number[] = [-2, -1, 1, 2];

function kindIndex(kind: EnemyKind): number {
  return (LAYER_KINDS as readonly EnemyKind[]).indexOf(kind);
}

/** Seed folded with the kind and a salt, so each decision uses its own hash lane. */
function lane(seed: number, kind: EnemyKind, salt: number): number {
  return (seed ^ Math.imul(salt, 0x27d4eb2d) ^ Math.imul(kindIndex(kind) + 1, SALT_KIND)) >>> 0;
}

/** Phrase inside the loop: 0 to 3 in an 8 bar loop, 0 to 7 in a 16 bar one. */
export function phraseOf(bar: number, loopBars: number = LOOP_BARS): number {
  return Math.floor(loopBar(bar, loopBars) / PHRASE_BARS);
}

/** Pure: the pattern after the seed's variation for one phrase. Still sorted and monophonic. */
export function varyPattern(
  pattern: readonly PatternNote[],
  variation: Variation,
  seed: number,
  kind: EnemyKind,
  phrase: number,
): PatternNote[] {
  const n = pattern.length;
  if (n === 0) return [];
  let out: PatternNote[] = pattern.map((x) => ({ ...x }));
  if (variation === 'walk') {
    let rel = 0;
    out = out.map((x, i) => {
      if (i > 0) {
        const up = hash01(lane(seed, kind, SALT_WALK), phrase * 16 + i) >= 0.5;
        rel = Math.min(WALK_LIMIT, Math.max(-WALK_LIMIT, rel + (up ? 1 : -1)));
      }
      return { ...x, rel };
    });
  } else if (variation === 'rotate') {
    const r = Math.floor(hash01(lane(seed, kind, SALT_ROT), 0) * n);
    out = out.map((x, i) => ({ ...x, rel: pattern[(i + r) % n]?.rel ?? x.rel }));
  } else if (variation === 'offset') {
    const k = Math.floor(hash01(lane(seed, kind, SALT_OFF), 0) * 4) * 2;
    out = out.map((x) => ({ ...x, step: (x.step + k) % PHRASE_STEPS })).sort((a, b) => a.step - b.step);
  }
  // The last phrase of every 8 bars answers: its final note moves one or two degrees, up or down by seed.
  if (phrase % 4 === 3) {
    const last = out[n - 1];
    const move = ANSWER_MOVES[Math.floor(hash01(lane(seed, kind, SALT_ANSWER), 3) * ANSWER_MOVES.length)] ?? 1;
    if (last) out[n - 1] = { ...last, rel: last.rel + move, answer: move };
  }
  return out;
}

/** Pure: the notes of one bar of a motif. */
export function buildMotifBar(
  spec: Pick<LayerSpec, 'kind' | 'register' | 'pattern' | 'variation'>,
  seed: number,
  bar: number,
  tune: Tune = DEFAULT_TUNE,
): MotifNote[] {
  if (spec.pattern.length === 0) return [];
  const key = tune.key;
  const root = tune.root;
  const lb = loopBar(bar, tune.loopBars);
  const phrase = phraseOf(lb, tune.loopBars);
  const half = lb % PHRASE_BARS;
  const anchor = chordForBar(lb, tune).arpAnchor;
  const notes = varyPattern(spec.pattern, spec.variation, seed >>> 0, spec.kind, phrase);
  const degreeOf = (x: PatternNote): number => spec.register + anchor + x.rel;
  const out: MotifNote[] = [];
  notes.forEach((x, i) => {
    if (Math.floor(x.step / STEPS_PER_BAR) !== half) return;
    const deg = degreeOf(x);
    const step = x.step % STEPS_PER_BAR;
    let from: number | null = null;
    if (x.glide) {
      const prev = notes[(i + notes.length - 1) % notes.length];
      const prevDeg = prev ? degreeOf(prev) : deg;
      from = pentatonicMidi(prevDeg !== deg ? prevDeg : deg - 1, root);
    }
    // Chord tone on a beat, scale tone between (a glide start is pentatonic, so in the scale).
    // An answering note on a beat moves by chord tones, so snapping never undoes the answer.
    const abs = lb * STEPS_PER_BAR + step;
    const midi =
      x.answer !== undefined && isStrongStep(abs)
        ? stepChordTone(fitPitch(pentatonicMidi(deg - x.answer, root), abs, key), harmonyAtStep(abs, key), x.answer)
        : fitPitch(pentatonicMidi(deg, root), abs, key);
    out.push({ step, midi, fromMidi: from, durSteps: x.dur, vel: x.vel });
  });
  return out;
}

/** Pure: the base an entrance phrase is transposed around: the A of the kind's octave, at least A3. */
export function stingerBase(register: number): number {
  return Math.max(STINGER_BASE_MIN, pentatonicMidi(Math.floor(register / 5) * 5, A4));
}

/** Pure: the first pitch of a kind's entrance phrase if it started on a bar's downbeat. */
export function stingerMidi(spec: Pick<LayerSpec, 'register' | 'phrase'>, bar: number, tune: Tune = DEFAULT_TUNE): number {
  const first = spec.phrase[0];
  return chordToneMidi(harmonyForBar(bar, tune.key), first?.deg ?? 0, stingerBase(spec.register));
}

/**
 * Pure: a kind's entrance phrase placed from an absolute step, every note in the chord of its
 * own bar (in the tune's key). Monophonic: each note ends at or before the next starts.
 */
export function stingerPhrase(spec: Pick<LayerSpec, 'register' | 'phrase'>, start: number, tune: Tune = DEFAULT_TUNE): PlacedNote[] {
  return transposePhrase(spec.phrase, start, stingerBase(spec.register), tune.key);
}

function ph(at: number, deg: number, dur: number, vel = 1): PhraseNote {
  return { at, deg, dur, vel };
}

// Entrance phrases in chord degrees (0 root, 1 third, 2 fifth, 3 root up, -1 fifth below), one
// per kind, each a small picture of the motif's character.
const PHRASES: Readonly<Record<EnemyKind, readonly PhraseNote[]>> = {
  // Marching: root, root, fifth, octave.
  grunt: [ph(0, 0, 2), ph(2, 0, 2, 0.8), ph(4, 2, 2, 0.9), ph(6, 3, 3)],
  // A drift up and back.
  wanderer: [ph(0, 1, 3), ph(3, 0, 3, 0.8), ph(6, 2, 4)],
  // A zigzag.
  weaver: [ph(0, 0, 1), ph(1, 2, 1, 0.85), ph(2, 1, 1, 0.85), ph(3, 3, 2)],
  // A turning cycle that comes back round.
  pinwheel: [ph(0, 0, 1), ph(1, 1, 1, 0.8), ph(2, 2, 1, 0.85), ph(3, 3, 1, 0.9), ph(4, 2, 2)],
  // A fast run up.
  dart: [ph(0, 0, 1, 0.8), ph(1, 1, 1, 0.85), ph(2, 2, 1, 0.9), ph(3, 3, 2)],
  // Slow, low and coiling.
  snake: [ph(0, 0, 3), ph(3, 1, 3, 0.9), ph(6, 0, 4)],
  // Winding up to a leap.
  charger: [ph(0, 0, 2, 0.8), ph(2, 1, 2, 0.85), ph(4, 2, 2, 0.9), ph(6, 4, 3)],
  // Heavy: root twice, down to the fifth below.
  bulwark: [ph(0, 0, 2), ph(2, 0, 2, 0.85), ph(4, -1, 4)],
  // Bright pairs with gaps.
  blink: [ph(0, 2, 1), ph(2, 4, 1, 0.85), ph(4, 3, 2)],
  // A spiral: up, step back, up again.
  swirl: [ph(0, 0, 1), ph(1, 1, 1, 0.85), ph(2, 2, 1, 0.9), ph(3, 1, 1, 0.85), ph(4, 3, 2)],
  // Seeds falling: octave, fifth, root.
  sower: [ph(0, 3, 1), ph(3, 2, 1, 0.85), ph(6, 0, 2)],
  // A wobble between root and fifth that settles on the third.
  splime: [ph(0, 0, 3), ph(3, 2, 3, 0.9), ph(6, 1, 4)],
};

// ---------------------------------------------------------------------------------------
// Registry.

interface SpecInput {
  readonly register: number;
  readonly timbre: TimbreId;
  readonly gain: number;
  readonly variation: Variation;
  readonly character: string;
}

const INPUTS: Readonly<Record<EnemyKind, SpecInput>> = {
  grunt: { register: -5, timbre: 'pulse', gain: 0.06, variation: 'none', character: 'steady quarter pulse, A3' },
  wanderer: { register: 0, timbre: 'drift', gain: 0.06, variation: 'walk', character: 'drifting random walk, A4' },
  weaver: { register: -2, timbre: 'reed', gain: 0.07, variation: 'none', character: 'off beat dodges up and down, E4' },
  pinwheel: { register: 3, timbre: 'bell', gain: 0.05, variation: 'rotate', character: 'rotating four note cycle, E5' },
  dart: { register: 5, timbre: 'zip', gain: 0.045, variation: 'offset', character: 'fast sixteenth runs, A5' },
  snake: { register: -7, timbre: 'slide', gain: 0.07, variation: 'none', character: 'long sliding notes, E3' },
  charger: { register: -3, timbre: 'windup', gain: 0.06, variation: 'none', character: 'rising wind up, then silence, D4' },
  bulwark: { register: -10, timbre: 'heavy', gain: 0.08, variation: 'none', character: 'heavy low pair, A2' },
  blink: { register: 6, timbre: 'glass', gain: 0.045, variation: 'offset', character: 'bright staccato pairs with gaps, C6' },
  swirl: { register: 1, timbre: 'spiral', gain: 0.05, variation: 'rotate', character: 'looping spiral arpeggio, C5' },
  sower: { register: 8, timbre: 'tick', gain: 0.05, variation: 'offset', character: 'sparse high ticks, E6' },
  splime: { register: -9, timbre: 'wobble', gain: 0.07, variation: 'none', character: 'slow wobbling glide between two low notes, C3' },
};

function makeSpec(kind: EnemyKind, keepMotif: boolean): LayerSpec {
  const i = INPUTS[kind];
  const pattern: readonly PatternNote[] = keepMotif ? PATTERNS[kind] : [];
  const shape = { kind, register: i.register, pattern, variation: i.variation };
  return {
    kind,
    phrase: PHRASES[kind],
    register: i.register,
    timbre: TIMBRES[i.timbre],
    gain: i.gain * MOTIF_GAIN_LIFT,
    pattern,
    variation: i.variation,
    character: i.character,
    motif: (seed, bar, tune) => buildMotifBar(shape, seed, bar, tune),
  };
}

/** One entry per kind. Written as a literal so tsc rejects a new EnemyKind without an entry. */
function buildRegistry(keep: (kind: EnemyKind) => boolean): LayerRegistry {
  const e = (k: EnemyKind): LayerSpec => makeSpec(k, keep(k));
  return Object.freeze({
    grunt: e('grunt'),
    wanderer: e('wanderer'),
    weaver: e('weaver'),
    pinwheel: e('pinwheel'),
    dart: e('dart'),
    snake: e('snake'),
    charger: e('charger'),
    bulwark: e('bulwark'),
    blink: e('blink'),
    swirl: e('swirl'),
    sower: e('sower'),
    splime: e('splime'),
  });
}

/** The full registry: every kind has a stinger and a motif. */
export const LAYERS_FULL: LayerRegistry = buildRegistry(() => true);

/**
 * Cut 1 (docs/10 cut order): motifs for kinds outside `keep` (default the first three) become
 * empty patterns that build no notes; every key and every stinger stays.
 */
export function cutMotifs(keep: readonly EnemyKind[] = CUT1_KEEP): LayerRegistry {
  return buildRegistry((k) => keep.includes(k));
}
