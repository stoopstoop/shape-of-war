// The harmonic plan (v2.1 melody, Ryan at GE: "entrance note and kill notes and musical
// contributions not consistent nor impactful enough on the melody and harmony"). Pure, no Web
// Audio, no PRNG.
//
// A key (v2.1 tunes) is a scale plus one chord per bar of its loop. Every melodic contribution
// reads the chord of its own bar from the active key: motifs, entrance phrases, kill notes, kill
// resolutions, chord hits and hit ticks. The rule is chord tones on strong steps (the beats,
// every fourth sixteenth) and scale tones on weak steps, so the melody always agrees with the
// bed's pad and bass. Every function takes the key last and defaults to DEFAULT_KEY, the
// original 8 bar loop: i, VI, III, VII in A minor (Am, F, C, G), two bars each. tunes.ts holds
// the other keys.
import { pitchClass } from './scale';

/** Sixteenths per bar (4/4). The track re-exports this. */
export const STEPS_PER_BAR = 16;
/** Bars in the default loop. The track re-exports this. */
export const LOOP_BARS = 8;
/** Bars each chord lasts in the default loop. */
export const BARS_PER_CHORD = 2;
/** Steps per beat; a step on a beat is strong. */
export const BEAT_STEPS = 4;

/** A chord name such as 'Am', 'F' or 'C#m'. */
export type ChordName = string;

export interface Harmony {
  readonly name: ChordName;
  /** Roman numeral in the key ('i', 'VI', 'bII', ...). */
  readonly numeral: string;
  /** Pitch class of the root, C = 0. */
  readonly root: number;
  /** Semitones above the root of the triad tones, root first, ascending. */
  readonly intervals: readonly number[];
  /** Pitch classes of the triad, root first. */
  readonly tones: readonly number[];
}

/** A key: a scale and the chord of every bar of a loop. Pure data, JSON serialisable. */
export interface Key {
  /** Pitch class of the tonic, C = 0. */
  readonly tonic: number;
  /** Pitch classes of the scale, tonic first. */
  readonly scale: readonly number[];
  /** One chord per bar of the loop; the loop length is bars.length. */
  readonly bars: readonly Harmony[];
}

/** Pure: a triad from a root pitch class and its third (3 minor, 4 major). */
export function triad(name: ChordName, numeral: string, root: number, third: number): Harmony {
  const intervals = [0, third, 7];
  return { name, numeral, root, intervals, tones: intervals.map((i) => (root + i) % 12) };
}

export const HARMONIES: Readonly<Record<'Am' | 'F' | 'C' | 'G', Harmony>> = {
  Am: triad('Am', 'i', 9, 3),
  F: triad('F', 'VI', 5, 4),
  C: triad('C', 'III', 0, 4),
  G: triad('G', 'VII', 7, 4),
};

/** The default progression, one entry per chord (two bars each). */
export const PROGRESSION: readonly ChordName[] = ['Am', 'F', 'C', 'G'];

/** Pure: a per bar chord list from chords that each last `barsEach` bars. */
export function barsOf(chords: readonly Harmony[], barsEach: number): Harmony[] {
  const out: Harmony[] = [];
  for (const h of chords) for (let i = 0; i < barsEach; i++) out.push(h);
  return out;
}

/** The default key: A natural minor (A B C D E F G), Am F C G two bars each. */
export const DEFAULT_KEY: Key = {
  tonic: 9,
  scale: [9, 11, 0, 2, 4, 5, 7],
  bars: barsOf([HARMONIES.Am, HARMONIES.F, HARMONIES.C, HARMONIES.G], BARS_PER_CHORD),
};

/** Bar index wrapped into a loop of `bars` bars, default 8 (negatives wrap too). */
export function loopBar(bar: number, bars: number = LOOP_BARS): number {
  const b = Math.trunc(bar);
  const n = Math.max(1, Math.trunc(bars));
  return ((b % n) + n) % n;
}

/** Pure: the chord of a bar (any integer, wrapped into the key's loop). */
export function harmonyForBar(bar: number, key: Key = DEFAULT_KEY): Harmony {
  return key.bars[loopBar(bar, key.bars.length)] ?? HARMONIES.Am;
}

/** Pure: the chord sounding at an absolute step. */
export function harmonyAtStep(step: number, key: Key = DEFAULT_KEY): Harmony {
  return harmonyForBar(Math.floor(step / STEPS_PER_BAR), key);
}

/** Pure: true on a beat (steps 0, 4, 8 and 12 of a bar). Works for absolute steps too. */
export function isStrongStep(step: number): boolean {
  return ((Math.trunc(step) % BEAT_STEPS) + BEAT_STEPS) % BEAT_STEPS === 0;
}

export function inChord(midi: number, h: Harmony): boolean {
  return h.tones.includes(pitchClass(midi));
}

export function inScale(midi: number, key: Key = DEFAULT_KEY): boolean {
  return key.scale.includes(pitchClass(midi));
}

/** Nearest MIDI note (ties go down) accepted by `ok`. */
function nearest(midi: number, ok: (m: number) => boolean): number {
  const m = Math.round(midi);
  for (let d = 0; d <= 12; d++) {
    if (ok(m - d)) return m - d;
    if (ok(m + d)) return m + d;
  }
  return m;
}

/** Pure: the nearest chord tone (ties go down). */
export function snapToChord(midi: number, h: Harmony): number {
  return nearest(midi, (m) => inChord(m, h));
}

/** Pure: the nearest scale tone of the key (ties go down). */
export function snapToScale(midi: number, key: Key = DEFAULT_KEY): number {
  return nearest(midi, (m) => inScale(m, key));
}

/**
 * Pure: the pitch a melodic note plays at an absolute step: the nearest chord tone of that
 * step's bar on a strong step, the nearest scale tone on a weak one.
 */
export function fitPitch(midi: number, step: number, key: Key = DEFAULT_KEY): number {
  return isStrongStep(step) ? snapToChord(midi, harmonyAtStep(step, key)) : snapToScale(midi, key);
}

/** Pure: true when a pitch obeys the rule at an absolute step (the stress test checks this). */
export function fitsHarmony(midi: number, step: number, key: Key = DEFAULT_KEY): boolean {
  return isStrongStep(step) ? inChord(midi, harmonyAtStep(step, key)) : inScale(midi, key);
}

/**
 * Pure: move `n` chord tones up (positive) or down (negative) from a pitch. The start need not
 * be a chord tone; the result always is (for n = 0, the nearest chord tone).
 */
export function stepChordTone(midi: number, h: Harmony, n: number): number {
  const k = Math.trunc(n);
  if (k === 0) return snapToChord(midi, h);
  const dir = k > 0 ? 1 : -1;
  let m = Math.round(midi);
  for (let left = Math.abs(k); left > 0; ) {
    m += dir;
    if (inChord(m, h)) left--;
  }
  return m;
}

/** Pure: the chord root nearest to `base` (ties go down), so transposed shapes move least. */
export function rootNear(h: Harmony, base: number): number {
  const b = Math.round(base);
  const below = b - ((pitchClass(b) - h.root + 12) % 12);
  return b - below <= below + 12 - b ? below : below + 12;
}

/**
 * Pure: chord tone `deg` counted from the root nearest `base`. 0 is that root, 1 the third, 2 the
 * fifth, 3 the root an octave up; negative degrees go down (-1 is the fifth below).
 */
export function chordToneMidi(h: Harmony, deg: number, base: number): number {
  const d = Math.trunc(deg);
  const n = h.intervals.length;
  const oct = Math.floor(d / n);
  const idx = d - oct * n;
  return rootNear(h, base) + oct * 12 + (h.intervals[idx] ?? 0);
}

/** One note of a phrase shape: a chord degree on a rhythm. */
export interface PhraseNote {
  /** Steps after the phrase start. */
  readonly at: number;
  /** Chord degree, as chordToneMidi. */
  readonly deg: number;
  readonly dur: number;
  readonly vel: number;
}

/** A phrase note placed at an absolute step and pitched in that step's chord. */
export interface PlacedNote {
  readonly step: number;
  readonly midi: number;
  readonly dur: number;
  readonly vel: number;
}

/**
 * Pure: a phrase shape transposed into the harmony. The shape (rhythm and chord degree
 * contour) never changes; each note takes the chord of its own bar, so a phrase that crosses a
 * chord change still agrees with the bed.
 */
export function transposePhrase(shape: readonly PhraseNote[], start: number, base: number, key: Key = DEFAULT_KEY): PlacedNote[] {
  return shape.map((n) => {
    const step = start + n.at;
    return { step, midi: chordToneMidi(harmonyAtStep(step, key), n.deg, base), dur: n.dur, vel: n.vel };
  });
}
