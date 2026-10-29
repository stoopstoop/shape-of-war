// The composed base track (SPEC 3.9, docs/10 wave A). A minor, 120 BPM, 4/4, 16 steps per
// bar, 8 bar loop, chords Am F C G two bars each (the harmonic plan lives in harmony.ts and
// chordForBar exposes it per bar). Pure: a bar is a function of (seed, bar).
// Bass, pad, kick, perc and hat are fixed by the composition; only the arp reads the seed, through
// the stateless hash01. No PRNG, no Web Audio.
import { hash01 } from '../../core/rng';
import { fitPitch, harmonyForBar, LOOP_BARS, loopBar, STEPS_PER_BAR, type ChordName, type Harmony } from './harmony';
import { pentatonicMidi } from './scale';

export { LOOP_BARS, loopBar, STEPS_PER_BAR, type ChordName } from './harmony';

export const BPM = 120;
/** One sixteenth at 120 BPM: 0.125 s. */
export const STEP_SEC = 60 / BPM / 4;
export const BAR_SEC = STEP_SEC * STEPS_PER_BAR;

export type Layer = 'bass' | 'pad' | 'kick' | 'perc' | 'hat' | 'arp';
/** Bottom to top, the order layers are listed in mixes and tests. */
export const LAYERS: readonly Layer[] = ['bass', 'pad', 'kick', 'perc', 'hat', 'arp'];

export interface Chord {
  readonly name: ChordName;
  /** The chord's harmony: root, triad intervals and pitch classes. */
  readonly harmony: Harmony;
  /** Sub bass root, MIDI. */
  readonly bass: number;
  /** Pad voicing, three notes, MIDI. */
  readonly pad: readonly number[];
  /** Arp anchor as a pentatonic degree above A4. */
  readonly arpAnchor: number;
}

const CHORDS: Readonly<Record<ChordName, Chord>> = {
  Am: { name: 'Am', harmony: harmonyForBar(0), bass: 45, pad: [57, 60, 64], arpAnchor: 0 },
  F: { name: 'F', harmony: harmonyForBar(2), bass: 41, pad: [57, 60, 65], arpAnchor: 1 },
  C: { name: 'C', harmony: harmonyForBar(4), bass: 48, pad: [55, 60, 64], arpAnchor: 3 },
  G: { name: 'G', harmony: harmonyForBar(6), bass: 43, pad: [55, 59, 62], arpAnchor: 2 },
};

export interface TrackNote {
  readonly layer: Layer;
  /** Step inside the bar, 0 to 15. */
  readonly step: number;
  /** MIDI note, or null for unpitched layers (kick, hat). */
  readonly midi: number | null;
  readonly durSteps: number;
  /** Velocity 0 to 1, multiplied by the layer gain. */
  readonly vel: number;
  /** Hat only: true for the in between sixteenths, gated by intensity. */
  readonly sub: boolean;
}

export interface BarPattern {
  /** Bar inside the loop, 0 to 7. */
  readonly bar: number;
  readonly chord: ChordName;
  /** Sorted by step, then by layer order. */
  readonly notes: readonly TrackNote[];
}

/** Pure: the current chord of a bar, as the track voices it. */
export function chordForBar(bar: number): Chord {
  return CHORDS[harmonyForBar(bar).name];
}

function note(layer: Layer, step: number, midi: number | null, durSteps: number, vel: number, sub = false): TrackNote {
  return { layer, step, midi, durSteps, vel, sub };
}

/** Sub bass: eighths on the root, downbeats accented. */
export function bassNotes(chord: Chord): TrackNote[] {
  const out: TrackNote[] = [];
  for (let s = 0; s < STEPS_PER_BAR; s += 2) out.push(note('bass', s, chord.bass, 2, s % 8 === 0 ? 1 : 0.78));
  return out;
}

/** Pad: the chord held for the bar. */
export function padNotes(chord: Chord): TrackNote[] {
  return chord.pad.map((m) => note('pad', 0, m, STEPS_PER_BAR, 1));
}

/** Kick: four on the floor, a pickup one sixteenth after beat four in the last bar of the loop. */
export function kickNotes(bar: number): TrackNote[] {
  const out = [0, 4, 8, 12].map((s) => note('kick', s, null, 1, s === 0 ? 1 : 0.9));
  // Step 13, not 14: its decay ends before the downbeat, so the bed never holds more than
  // BED_VOICE_MAX voices at the loop point and six motifs still fit in the cap.
  if (loopBar(bar) === LOOP_BARS - 1) out.push(note('kick', 13, null, 1, 0.7));
  return out;
}

/**
 * Perc (the high threat lift only): a noise clap on the backbeat, steps 4 and 12, with a ghost
 * on step 14 in odd bars. The ghost decays before the bar line, so the bed peak (the pad
 * crossfade on the downbeat) is unchanged.
 */
export function percNotes(bar: number): TrackNote[] {
  const out = [note('perc', 4, null, 1, 1), note('perc', 12, null, 1, 1)];
  if (loopBar(bar) % 2 === 1) out.push(note('perc', 14, null, 1, 0.45));
  return out;
}

/** Hat: eighths with the off beats accented, plus quieter in between sixteenths. */
export function hatNotes(): TrackNote[] {
  const out: TrackNote[] = [];
  for (let s = 0; s < STEPS_PER_BAR; s++) {
    if (s % 2 === 1) out.push(note('hat', s, null, 1, 0.45, true));
    else out.push(note('hat', s, null, 1, s % 4 === 2 ? 1 : 0.6));
  }
  return out;
}

// Composed contours in pentatonic degrees relative to the chord anchor. Even bars rise,
// odd bars answer and fall back.
const CONTOUR_A: readonly number[] = [0, 2, 4, 2, 1, 3, 5, 3, 0, 2, 4, 5, 4, 2, 1, 2];
const CONTOUR_B: readonly number[] = [4, 2, 0, 2, 3, 1, -1, 1, 0, 2, 4, 6, 5, 4, 2, 1];

const SALT_ROT = 0x0a11;
const SALT_REST = 0x0b22;
const SALT_SHIFT = 0x0c33;
const ARP_MIN = -2;
const ARP_MAX = 8;
const REST_P = 0.12;
const SHIFT_P = 0.15;

/** Seed folded with a salt, so each decision uses an independent hash lane. */
function lane(seed: number, salt: number): number {
  return (seed ^ Math.imul(salt, 0x27d4eb2d)) >>> 0;
}

/**
 * Arp: square sixteenths on the pentatonic. The composed contour is rotated by a per bar
 * hash, then each step may rest or move one degree, also by hash. Steps 0 and 8 never rest.
 * Beats snap to the nearest chord tone (harmony.ts fitPitch), so the arp agrees with the pad.
 */
export function arpNotes(seed: number, bar: number, chord: Chord): TrackNote[] {
  const lb = loopBar(bar);
  const contour = lb % 2 === 0 ? CONTOUR_A : CONTOUR_B;
  const rot = Math.floor(hash01(lane(seed, SALT_ROT), lb) * 4) * 4;
  const out: TrackNote[] = [];
  for (let s = 0; s < STEPS_PER_BAR; s++) {
    const key = lb * STEPS_PER_BAR + s;
    if (s % 8 !== 0 && hash01(lane(seed, SALT_REST), key) < REST_P) continue;
    const h = hash01(lane(seed, SALT_SHIFT), key);
    const shift = h < SHIFT_P ? -1 : h > 1 - SHIFT_P ? 1 : 0;
    const rel = contour[(s + rot) % STEPS_PER_BAR] ?? 0;
    const deg = Math.min(ARP_MAX, Math.max(ARP_MIN, chord.arpAnchor + rel + shift));
    out.push(note('arp', s, fitPitch(pentatonicMidi(deg), key), 1,s % 4 === 0 ? 0.9 : 0.65));
  }
  return out;
}

const LAYER_ORDER: Readonly<Record<Layer, number>> = { bass: 0, pad: 1, kick: 2, perc: 3, hat: 4, arp: 5 };

/** Pure: every note of one bar of the base track. */
export function buildBar(seed: number, bar: number): BarPattern {
  const chord = chordForBar(bar);
  const notes = [
    ...bassNotes(chord),
    ...padNotes(chord),
    ...kickNotes(bar),
    ...percNotes(bar),
    ...hatNotes(),
    ...arpNotes(seed >>> 0, bar, chord),
  ].sort((a, b) => a.step - b.step || LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer]);
  return { bar: loopBar(bar), chord: chord.name, notes };
}
