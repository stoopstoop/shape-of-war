// The composed base track (SPEC 3.9, docs/10 wave A, v2.1 tunes). 4/4, 16 steps per bar. The
// active tune (tunes.ts) decides key, tempo, loop length, chords, voicings, bass line, drums and
// arp figure; the default is the original A minor, 120 BPM, 8 bar loop of Am F C G. Pure: a bar
// is a function of (seed, bar, tune, fill) built on the stateless hash01. No PRNG, no Web Audio.
//
// Variation inside a tune (so a 3 minute level does not repeat verbatim):
// - every second pass of the loop (passes 1, 3, 5, ...) swaps the arp figure or the bass line
//   for the tune's alternate, chosen by hash per pass;
// - the arp's hashed rotation, rests and shifts are keyed by the pass modulo 4 as well, so four
//   consecutive passes never voice the arp the same way;
// - a 2 bar fill (FILL_BARS) can replace the drums and the arp at a phase change (index.ts
//   decides when; buildBar takes the fill bar).
import { hash01 } from '../../core/rng';
import { chordToneMidi, fitPitch, STEPS_PER_BAR, type ChordName } from './harmony';
import { pentatonicMidi } from './scale';
import {
  DEFAULT_TUNE,
  FILL_BARS,
  FILL_KICK,
  FILL_PERC,
  FILL_RUN,
  passOf,
  tuneBar,
  voicingForBar,
  type ArpFigure,
  type BassHit,
  type ChordVoicing,
  type DrumHit,
  type HatHit,
  type Tune,
  type TrackId,
} from './tunes';

export { LOOP_BARS, loopBar, STEPS_PER_BAR, type ChordName } from './harmony';

/** The default tune's tempo. */
export const BPM = 120;
/** One sixteenth at 120 BPM: 0.125 s (the default tune; a tune carries its own stepSec). */
export const STEP_SEC = 60 / BPM / 4;
export const BAR_SEC = STEP_SEC * STEPS_PER_BAR;

export type Layer = 'bass' | 'pad' | 'kick' | 'perc' | 'hat' | 'arp';
/** Bottom to top, the order layers are listed in mixes and tests. */
export const LAYERS: readonly Layer[] = ['bass', 'pad', 'kick', 'perc', 'hat', 'arp'];

/** A chord as the track voices it: name, harmony, bass root, pad voicing and arp anchor. */
export type Chord = ChordVoicing;

/** What the loop does on a pass: plays as composed, or swaps the arp or the bass line. */
export type PassVariant = 'none' | 'arp' | 'bass';

/** Which bar of a 2 bar fill a bar is, or null outside a fill. */
export type FillBar = 0 | 1 | null;

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
  /** Bar inside the tune's loop. */
  readonly bar: number;
  readonly chord: ChordName;
  readonly tune: TrackId;
  /** Pass of the loop (0 the first time through). */
  readonly pass: number;
  readonly variant: PassVariant;
  readonly fill: FillBar;
  /** Sorted by step, then by layer order. */
  readonly notes: readonly TrackNote[];
}

/** Pure: the current chord of a bar, as the tune voices it. */
export function chordForBar(bar: number, tune: Tune = DEFAULT_TUNE): Chord {
  return voicingForBar(tune, bar);
}

function note(layer: Layer, step: number, midi: number | null, durSteps: number, vel: number, sub = false): TrackNote {
  return { layer, step, midi, durSteps, vel, sub };
}

const drums = (layer: Layer, hits: readonly DrumHit[]): TrackNote[] => hits.map((h) => note(layer, h.step, null, 1, h.vel));

/** Bass: the tune's line, each note a chord degree from the chord's bass root. */
export function bassNotes(chord: Chord, tune: Tune = DEFAULT_TUNE, alt = false): TrackNote[] {
  const line: readonly BassHit[] = alt ? tune.bassAlt : tune.bass;
  return line.map((b) => note('bass', b.step, b.deg === 0 ? chord.bass : chordToneMidi(chord.harmony, b.deg, chord.bass), b.dur, b.vel));
}

/** Pad: the chord held for the bar. */
export function padNotes(chord: Chord): TrackNote[] {
  return chord.pad.map((m) => note('pad', 0, m, STEPS_PER_BAR, 1));
}

/** Kick: the tune's pattern, with its turnaround added in the last bar of the loop. */
export function kickNotes(bar: number, tune: Tune = DEFAULT_TUNE): TrackNote[] {
  const out = drums('kick', tune.drums.kick);
  if (tuneBar(tune, bar) === tune.loopBars - 1) out.push(...drums('kick', tune.drums.kickTurn));
  return out;
}

/**
 * Perc (the high threat lift only): a noise clap on the tune's backbeat, with its ghost added in
 * odd bars. Every clap decays before the bar line, so the bed peak (the pad crossfade on the
 * downbeat) is unchanged.
 */
export function percNotes(bar: number, tune: Tune = DEFAULT_TUNE): TrackNote[] {
  const out = drums('perc', tune.drums.perc);
  if (tuneBar(tune, bar) % 2 === 1) out.push(...drums('perc', tune.drums.percOdd));
  return out;
}

/** Hat: the tune's pattern; sub hits are the in between sixteenths. */
export function hatNotes(tune: Tune = DEFAULT_TUNE): TrackNote[] {
  return tune.drums.hat.map((h: HatHit) => note('hat', h.step, null, 1, h.vel, h.sub));
}

const SALT_ROT = 0x0a11;
const SALT_REST = 0x0b22;
const SALT_SHIFT = 0x0c33;
const SALT_VARIANT = 0x0d44;
const ARP_MIN = -2;
const ARP_MAX = 8;
const SHIFT_P = 0.15;
/** Passes after which the arp's hashed voicing repeats. */
const ARP_RENDERINGS = 4;

/** Seed folded with a salt, so each decision uses an independent hash lane. */
function lane(seed: number, salt: number): number {
  return (seed ^ Math.imul(salt, 0x27d4eb2d)) >>> 0;
}

/** Pure: a per tune salt, so two tunes vary on different passes for the same seed. */
function tuneSalt(t: Tune): number {
  return t.bpm * 131 + t.root;
}

/** Pure: what a pass of the loop does. Pass 0 and every even pass play as composed. */
export function passVariant(seed: number, pass: number, tune: Tune = DEFAULT_TUNE): PassVariant {
  const p = Math.trunc(pass);
  if (p % 2 === 0) return 'none';
  return hash01(lane(seed >>> 0, SALT_VARIANT + tuneSalt(tune)), p) < 0.5 ? 'arp' : 'bass';
}

/**
 * Arp: sixteenths on the tune's minor pentatonic. The figure's contour is rotated by a per bar
 * hash, then each step may rest or move one degree, also by hash. The figure's rest steps always
 * rest; steps 0 and 8 never do. Beats snap to the nearest chord tone (harmony.ts fitPitch), so
 * the arp agrees with the pad. `pass` keys the hashes (modulo ARP_RENDERINGS); pass 0 is the
 * original voicing. `alt` plays the tune's alternate figure.
 */
export function arpNotes(seed: number, bar: number, chord: Chord, tune: Tune = DEFAULT_TUNE, pass = 0, alt = false): TrackNote[] {
  const fig: ArpFigure = alt ? tune.arpAlt : tune.arp;
  const lb = tuneBar(tune, bar);
  const ren = ((Math.trunc(pass) % ARP_RENDERINGS) + ARP_RENDERINGS) % ARP_RENDERINGS;
  const contour = lb % 2 === 0 ? fig.a : fig.b;
  const rot = Math.floor(hash01(lane(seed, SALT_ROT), lb + ren * 64) * 4) * 4;
  const out: TrackNote[] = [];
  for (let s = 0; s < STEPS_PER_BAR; s++) {
    const abs = lb * STEPS_PER_BAR + s;
    const key = abs + ren * 4096;
    if (s % 8 !== 0 && (fig.rests.includes(s) || hash01(lane(seed, SALT_REST), key) < fig.restP)) continue;
    const h = hash01(lane(seed, SALT_SHIFT), key);
    const shift = h < SHIFT_P ? -1 : h > 1 - SHIFT_P ? 1 : 0;
    const rel = contour[(s + rot) % STEPS_PER_BAR] ?? 0;
    const deg = Math.min(ARP_MAX, Math.max(ARP_MIN, chord.arpAnchor + rel + shift));
    out.push(note('arp', s, fitPitch(pentatonicMidi(deg, tune.root), abs, tune.key), 1, s % 4 === 0 ? 0.9 : 0.65));
  }
  return out;
}

/** Pure: the hats of a fill bar: every sixteenth, rising; bar 1 rises harder into the bar line. */
export function fillHats(fill: 0 | 1): TrackNote[] {
  const lo = fill === 0 ? 0.4 : 0.5;
  const span = fill === 0 ? 0.45 : 0.5;
  const out: TrackNote[] = [];
  for (let s = 0; s < STEPS_PER_BAR; s++) out.push(note('hat', s, null, 1, lo + (span * s) / (STEPS_PER_BAR - 1)));
  return out;
}

/** Pure: the run that replaces the arp in a fill's second bar: chord tones climbing on sixteenths. */
export function fillRun(chord: Chord, tune: Tune = DEFAULT_TUNE): TrackNote[] {
  return FILL_RUN.map((deg, s) => note('arp', s, chordToneMidi(chord.harmony, deg, tune.root - 12), 1, s % 4 === 0 ? 0.9 : 0.7));
}

/**
 * Pure: a structural fill (a phase change in the form): the last FILL_BARS bars of every odd
 * pass, leading back into the loop as composed. Null outside those bars.
 */
export function structuralFill(tune: Tune, bar: number): FillBar {
  if (bar < 0 || passOf(tune, bar) % 2 !== 1) return null;
  const k = tuneBar(tune, bar) - (tune.loopBars - FILL_BARS);
  return k === 0 ? 0 : k === 1 ? 1 : null;
}

const LAYER_ORDER: Readonly<Record<Layer, number>> = { bass: 0, pad: 1, kick: 2, perc: 3, hat: 4, arp: 5 };

/** Pure: every note of one bar of the base track. */
export function buildBar(seed: number, bar: number, tune: Tune = DEFAULT_TUNE, fill: FillBar = null): BarPattern {
  const s = seed >>> 0;
  const chord = chordForBar(bar, tune);
  const pass = Math.max(0, passOf(tune, bar));
  const variant = passVariant(s, pass, tune);
  const kick = fill === 1 ? drums('kick', FILL_KICK) : kickNotes(bar, tune);
  const perc = fill === 1 ? drums('perc', FILL_PERC) : percNotes(bar, tune);
  const hat = fill === null ? hatNotes(tune) : fillHats(fill);
  const arp = fill === 1 ? fillRun(chord, tune) : arpNotes(s, bar, chord, tune, pass, variant === 'arp');
  const notes = [...bassNotes(chord, tune, variant === 'bass'), ...padNotes(chord), ...kick, ...perc, ...hat, ...arp].sort(
    (a, b) => a.step - b.step || LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer],
  );
  return { bar: tuneBar(tune, bar), chord: chord.name, tune: tune.id, pass, variant, fill, notes };
}
