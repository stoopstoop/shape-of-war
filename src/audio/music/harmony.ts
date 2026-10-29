// The harmonic plan (v2.1 melody, Ryan at GE: "entrance note and kill notes and musical
// contributions not consistent nor impactful enough on the melody and harmony"). Pure, no Web
// Audio, no PRNG.
//
// The 8 bar loop is i, VI, III, VII in A minor (Am, F, C, G), two bars each. Every melodic
// contribution reads the chord of its own bar from here: motifs, entrance phrases, kill notes,
// kill resolutions and chord hits. The rule is chord tones on strong steps (the beats, every
// fourth sixteenth) and A natural minor scale tones on weak steps, so the melody always agrees
// with the bed's pad and bass.
import { pitchClass } from './scale';

/** Sixteenths per bar (4/4). The track re-exports this. */
export const STEPS_PER_BAR = 16;
/** Bars in the loop. The track re-exports this. */
export const LOOP_BARS = 8;
/** Bars each chord lasts. */
export const BARS_PER_CHORD = 2;
/** Steps per beat; a step on a beat is strong. */
export const BEAT_STEPS = 4;

export type ChordName = 'Am' | 'F' | 'C' | 'G';

export interface Harmony {
  readonly name: ChordName;
  /** Roman numeral in A minor. */
  readonly numeral: 'i' | 'VI' | 'III' | 'VII';
  /** Pitch class of the root, C = 0. */
  readonly root: number;
  /** Semitones above the root of the triad tones, root first, ascending. */
  readonly intervals: readonly number[];
  /** Pitch classes of the triad, root first. */
  readonly tones: readonly number[];
}

function triad(name: ChordName, numeral: Harmony['numeral'], root: number, third: number): Harmony {
  const intervals = [0, third, 7];
  return { name, numeral, root, intervals, tones: intervals.map((i) => (root + i) % 12) };
}

export const HARMONIES: Readonly<Record<ChordName, Harmony>> = {
  Am: triad('Am', 'i', 9, 3),
  F: triad('F', 'VI', 5, 4),
  C: triad('C', 'III', 0, 4),
  G: triad('G', 'VII', 7, 4),
};

/** The progression, one entry per chord (two bars each). */
export const PROGRESSION: readonly ChordName[] = ['Am', 'F', 'C', 'G'];

/** Pitch classes of A natural minor: A B C D E F G. */
const SCALE_PCS: readonly number[] = [9, 11, 0, 2, 4, 5, 7];

/** Bar index wrapped into the 8 bar loop (negatives wrap too). */
export function loopBar(bar: number): number {
  const b = Math.trunc(bar);
  return ((b % LOOP_BARS) + LOOP_BARS) % LOOP_BARS;
}

/** Pure: the chord of a bar (any integer, wrapped into the loop). */
export function harmonyForBar(bar: number): Harmony {
  return HARMONIES[PROGRESSION[Math.floor(loopBar(bar) / BARS_PER_CHORD)] ?? 'Am'];
}

/** Pure: the chord sounding at an absolute step. */
export function harmonyAtStep(step: number): Harmony {
  return harmonyForBar(Math.floor(step / STEPS_PER_BAR));
}

/** Pure: true on a beat (steps 0, 4, 8 and 12 of a bar). Works for absolute steps too. */
export function isStrongStep(step: number): boolean {
  return ((Math.trunc(step) % BEAT_STEPS) + BEAT_STEPS) % BEAT_STEPS === 0;
}

export function inChord(midi: number, h: Harmony): boolean {
  return h.tones.includes(pitchClass(midi));
}

export function inScale(midi: number): boolean {
  return SCALE_PCS.includes(pitchClass(midi));
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

/** Pure: the nearest A natural minor tone (ties go down). */
export function snapToScale(midi: number): number {
  return nearest(midi, inScale);
}

/**
 * Pure: the pitch a melodic note plays at an absolute step: the nearest chord tone of that
 * step's bar on a strong step, the nearest scale tone on a weak one.
 */
export function fitPitch(midi: number, step: number): number {
  return isStrongStep(step) ? snapToChord(midi, harmonyAtStep(step)) : snapToScale(midi);
}

/** Pure: true when a pitch obeys the rule at an absolute step (the stress test checks this). */
export function fitsHarmony(midi: number, step: number): boolean {
  return isStrongStep(step) ? inChord(midi, harmonyAtStep(step)) : inScale(midi);
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
export function transposePhrase(shape: readonly PhraseNote[], start: number, base: number): PlacedNote[] {
  return shape.map((n) => {
    const step = start + n.at;
    return { step, midi: chordToneMidi(harmonyAtStep(step), n.deg, base), dur: n.dur, vel: n.vel };
  });
}
