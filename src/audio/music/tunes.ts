// The tune library (v2.1 tunes, Ryan at G2.1: "need multiple tunes so the user does not get
// annoyed by the same repetitive tune"). Pure data and pure helpers, no Web Audio, no PRNG.
//
// Each tune is an original composition with its own key, tempo, loop length, chord plan, bed
// timbres, drum pattern, bass line and arp figure. Everything melodic (motifs, entrance phrases,
// kill notes, chord hits, hit ticks) reads the active tune's key through harmony.ts, so every
// contribution transposes into the tune's key and chords. Every tune is minor flavoured (natural
// minor, dorian or phrygian), so the tonic's minor pentatonic is always inside the scale.
//
// Voice budget rules every tune keeps (the bed peak test checks them at full threat):
// - nothing but the pad release, the new pad, bass, kick, hat and arp may sound across a bar line
//   (a kick needs 0.32 s before the next downbeat, a clap 0.14 s);
// - no clap in steps 0 to 3 (the old pad is still releasing);
// - kicks may overlap one other kick only in the middle of a bar.
import { barsOf, DEFAULT_KEY, HARMONIES, triad, type ChordName, type Harmony, type Key } from './harmony';
import { A4 } from './scale';

export const TUNE_IDS = ['neon', 'tide', 'ember', 'orbit'] as const;
export type TuneId = (typeof TUNE_IDS)[number];

/** Tempo range every tune keeps (brief: 100 to 132 BPM). */
export const BPM_MIN = 100;
export const BPM_MAX = 132;

export interface DrumHit {
  readonly step: number;
  readonly vel: number;
}

export interface HatHit extends DrumHit {
  /** In between sixteenth, gated by intensity (mix.hat16). */
  readonly sub: boolean;
}

/** One bass note: a chord degree counted from the chord's bass root (0 root, 1 third, 2 fifth, 3 octave). */
export interface BassHit {
  readonly step: number;
  readonly deg: number;
  readonly dur: number;
  readonly vel: number;
}

/**
 * An arp figure: two contours in pentatonic degrees relative to the chord anchor (even bars,
 * odd bars), steps that always rest (never 0 or 8) and the chance that another weak step rests.
 */
export interface ArpFigure {
  readonly a: readonly number[];
  readonly b: readonly number[];
  readonly rests: readonly number[];
  readonly restP: number;
}

export interface Drums {
  readonly kick: readonly DrumHit[];
  /** Added in the last bar of the loop. */
  readonly kickTurn: readonly DrumHit[];
  /** The clap, heard only under the high threat lift. */
  readonly perc: readonly DrumHit[];
  /** Added to the clap in odd bars. */
  readonly percOdd: readonly DrumHit[];
  readonly hat: readonly HatHit[];
}

/** Oscillator waves of the bed. Pure data, read by the engine. */
export interface BedTimbre {
  readonly bass: OscillatorType;
  readonly pad: OscillatorType;
  readonly arp: OscillatorType;
  /** Cents each of the two pad oscillators is detuned, one up and one down. */
  readonly padDetune: number;
}

/** How the track voices one chord. */
export interface ChordVoicing {
  readonly name: ChordName;
  readonly harmony: Harmony;
  /** Sub bass root, MIDI. */
  readonly bass: number;
  /** Pad voicing, three notes, MIDI. */
  readonly pad: readonly number[];
  /** Arp and motif anchor as a pentatonic degree above the tune root. */
  readonly arpAnchor: number;
}

export interface Tune {
  readonly id: TuneId;
  readonly name: string;
  /** One line on the character, for the hand-off and the debug overlay. */
  readonly mood: string;
  readonly bpm: number;
  /** Seconds per sixteenth. */
  readonly stepSec: number;
  /** MIDI root of the tune's minor pentatonic (degree 0), within a fourth of A4. */
  readonly root: number;
  readonly key: Key;
  /** Bars in the loop (8 or 16), key.bars.length. */
  readonly loopBars: number;
  /** Voicing per chord name used in the key. */
  readonly voicings: Readonly<Record<string, ChordVoicing>>;
  readonly bass: readonly BassHit[];
  /** The bass line of a varied pass. */
  readonly bassAlt: readonly BassHit[];
  readonly arp: ArpFigure;
  /** The arp figure of a varied pass. */
  readonly arpAlt: ArpFigure;
  readonly drums: Drums;
  readonly bed: BedTimbre;
}

const hit = (step: number, vel: number): DrumHit => ({ step, vel });
const bh = (step: number, deg: number, dur: number, vel: number): BassHit => ({ step, deg, dur, vel });
const hh = (step: number, vel: number, sub: boolean): HatHit => ({ step, vel, sub });

/** Pure: the sub bass root of a chord, E2 to D#3. */
export function bassRoot(h: Harmony): number {
  return 40 + ((h.root - 4 + 12) % 12);
}

/** Pure: a close pad voicing, every chord tone between G3 and F#4, ascending. */
export function padVoicing(h: Harmony): number[] {
  return h.tones.map((pc) => 55 + ((pc - 7 + 12) % 12)).sort((a, b) => a - b);
}

/** Pure: a voicing from a chord and its arp anchor. */
function voiced(harmony: Harmony, arpAnchor: number): ChordVoicing {
  return { name: harmony.name, harmony, bass: bassRoot(harmony), pad: padVoicing(harmony), arpAnchor };
}

/** Pure: a voicing table keyed by chord name. */
function voicings(list: readonly ChordVoicing[]): Record<string, ChordVoicing> {
  const out: Record<string, ChordVoicing> = {};
  for (const v of list) out[v.harmony.name] = v;
  return out;
}

const STEPS16: readonly number[] = Array.from({ length: 16 }, (_, s) => s);
const ODD_STEPS: readonly number[] = STEPS16.filter((s) => s % 2 === 1);
const EIGHTHS: readonly number[] = STEPS16.filter((s) => s % 2 === 0);

// ---------------------------------------------------------------------------------------
// Neon Drive: the original track. A natural minor, 120 BPM, Am F C G two bars each, four on
// the floor. Its first pass is note for note the v2.1 bed.

const NEON: Tune = {
  id: 'neon',
  name: 'Neon Drive',
  mood: 'driving four on the floor, A minor, square arp over a saw pad',
  bpm: 120,
  stepSec: 60 / 120 / 4,
  root: A4,
  key: DEFAULT_KEY,
  loopBars: 8,
  voicings: voicings([
    { name: 'Am', harmony: HARMONIES.Am, bass: 45, pad: [57, 60, 64], arpAnchor: 0 },
    { name: 'F', harmony: HARMONIES.F, bass: 41, pad: [57, 60, 65], arpAnchor: 1 },
    { name: 'C', harmony: HARMONIES.C, bass: 48, pad: [55, 60, 64], arpAnchor: 3 },
    { name: 'G', harmony: HARMONIES.G, bass: 43, pad: [55, 59, 62], arpAnchor: 2 },
  ]),
  bass: EIGHTHS.map((s) => bh(s, 0, 2, s % 8 === 0 ? 1 : 0.78)),
  // Varied pass: an octave bounce with a push on the and of one.
  bassAlt: [bh(0, 0, 2, 1), bh(2, 3, 1, 0.7), bh(3, 0, 1, 0.75), bh(4, 3, 2, 0.8), bh(6, 0, 2, 0.75), bh(8, 0, 2, 1), bh(10, 3, 2, 0.75), bh(12, 2, 2, 0.8), bh(14, 3, 2, 0.75)],
  arp: {
    a: [0, 2, 4, 2, 1, 3, 5, 3, 0, 2, 4, 5, 4, 2, 1, 2],
    b: [4, 2, 0, 2, 3, 1, -1, 1, 0, 2, 4, 6, 5, 4, 2, 1],
    rests: [],
    restP: 0.12,
  },
  // Varied pass: an eighth note arpeggio that climbs and turns.
  arpAlt: {
    a: [0, 0, 2, 2, 4, 4, 5, 5, 4, 4, 2, 2, 3, 3, 1, 1],
    b: [5, 5, 4, 4, 2, 2, 0, 0, 1, 1, 3, 3, 4, 4, 2, 2],
    rests: ODD_STEPS,
    restP: 0.08,
  },
  drums: {
    kick: [hit(0, 1), hit(4, 0.9), hit(8, 0.9), hit(12, 0.9)],
    // Step 13, not 14: its decay ends before the downbeat.
    kickTurn: [hit(13, 0.7)],
    perc: [hit(4, 1), hit(12, 1)],
    percOdd: [hit(14, 0.45)],
    hat: STEPS16.map((s) => (s % 2 === 1 ? hh(s, 0.45, true) : hh(s, s % 4 === 2 ? 1 : 0.6, false))),
  },
  bed: { bass: 'triangle', pad: 'sawtooth', arp: 'square', padDetune: 9 },
};

// ---------------------------------------------------------------------------------------
// Glass Tide: B dorian, 104 BPM, 16 bars, half time. The raised sixth gives the major IV (E).

const T_BM = triad('Bm', 'i', 11, 3);
const T_E = triad('E', 'IV', 4, 4);
const T_D = triad('D', 'III', 2, 4);
const T_A = triad('A', 'VII', 9, 4);
const T_FSM = triad('F#m', 'v', 6, 3);

const TIDE: Tune = {
  id: 'tide',
  name: 'Glass Tide',
  mood: 'half time and floating, B dorian, triangle arp in eighths over a soft pad',
  bpm: 104,
  stepSec: 60 / 104 / 4,
  root: 71,
  key: { tonic: 11, scale: [11, 1, 2, 4, 6, 8, 9], bars: barsOf([T_BM, T_E, T_D, T_A, T_BM, T_E, T_FSM, T_A], 2) },
  loopBars: 16,
  voicings: voicings([voiced(T_BM, 0), voiced(T_E, 2), voiced(T_D, 1), voiced(T_A, -1), voiced(T_FSM, 3)]),
  bass: [bh(0, 0, 3, 1), bh(3, 0, 3, 0.7), bh(6, 2, 2, 0.75), bh(8, 0, 4, 0.9), bh(12, 3, 2, 0.7), bh(14, 2, 2, 0.65)],
  // Varied pass: long notes walking root, third, fifth.
  bassAlt: [bh(0, 0, 6, 1), bh(6, 0, 2, 0.7), bh(8, 1, 4, 0.85), bh(12, 2, 4, 0.8)],
  arp: {
    a: [0, 0, 2, 2, 3, 3, 5, 5, 4, 4, 2, 2, 3, 3, 1, 1],
    b: [5, 5, 3, 3, 2, 2, 0, 0, 1, 1, 2, 2, 4, 4, 2, 2],
    rests: ODD_STEPS,
    restP: 0.1,
  },
  // Varied pass: rippling groups of three sixteenths.
  arpAlt: {
    a: [0, 2, 4, 0, 2, 4, 5, 4, 2, 4, 5, 7, 5, 4, 2, 1],
    b: [5, 4, 2, 5, 4, 2, 1, 2, 0, 1, 2, 4, 2, 1, 0, -1],
    rests: [3, 7, 11, 15],
    restP: 0.1,
  },
  drums: {
    kick: [hit(0, 1), hit(10, 0.85)],
    kickTurn: [hit(13, 0.65)],
    perc: [hit(8, 1)],
    percOdd: [hit(6, 0.4)],
    hat: [hh(2, 1, false), hh(3, 0.5, true), hh(6, 1, false), hh(7, 0.5, true), hh(10, 1, false), hh(11, 0.5, true), hh(12, 0.4, true), hh(14, 1, false), hh(15, 0.5, true)],
  },
  bed: { bass: 'sine', pad: 'triangle', arp: 'triangle', padDetune: 6 },
};

// ---------------------------------------------------------------------------------------
// Ember Gate: G phrygian, 128 BPM, 8 bars, a galloping bass. The flat second (Ab) falls back
// to the tonic at the loop point.

const T_GM = triad('Gm', 'i', 7, 3);
const T_AB = triad('Ab', 'bII', 8, 4);
const T_EB = triad('Eb', 'bVI', 3, 4);
const T_FM = triad('Fm', 'vii', 5, 3);

const EMBER: Tune = {
  id: 'ember',
  name: 'Ember Gate',
  mood: 'dark and urgent, G phrygian, galloping saw bass and sixteenth hats',
  bpm: 128,
  stepSec: 60 / 128 / 4,
  root: 67,
  key: { tonic: 7, scale: [7, 8, 10, 0, 2, 3, 5], bars: [T_GM, T_GM, T_AB, T_GM, T_EB, T_EB, T_FM, T_AB] },
  loopBars: 8,
  voicings: voicings([voiced(T_GM, 0), voiced(T_AB, 2), voiced(T_EB, 1), voiced(T_FM, 2)]),
  bass: [
    bh(0, 0, 1, 1),
    bh(2, 0, 1, 0.7),
    bh(3, 0, 1, 0.8),
    bh(4, 3, 1, 0.8),
    bh(6, 0, 1, 0.7),
    bh(7, 0, 1, 0.75),
    bh(8, 0, 1, 0.95),
    bh(10, 0, 1, 0.7),
    bh(11, 0, 1, 0.8),
    bh(12, 3, 1, 0.8),
    bh(14, 2, 1, 0.75),
    bh(15, 0, 1, 0.7),
  ],
  // Varied pass: an eighth note octave pump.
  bassAlt: EIGHTHS.map((s) => bh(s, s % 4 === 2 ? 3 : 0, 2, s % 8 === 0 ? 1 : 0.8)),
  arp: {
    a: [0, 1, 2, 1, 0, 1, 3, 2, 0, 1, 2, 4, 3, 2, 1, 0],
    b: [2, 1, 0, -1, 0, 1, 2, 1, 3, 2, 1, 0, 1, 2, 3, 2],
    rests: [6, 14],
    restP: 0.1,
  },
  // Varied pass: a stabbing figure, two sixteenths and a rest.
  arpAlt: {
    a: [0, 2, 2, 3, 3, 5, 4, 4, 0, 2, 2, 3, 4, 4, 2, 2],
    b: [4, 3, 3, 2, 2, 0, 1, 1, 2, 1, 1, 0, -1, -1, 0, 0],
    rests: [2, 5, 10, 13],
    restP: 0.05,
  },
  drums: {
    kick: [hit(0, 1), hit(3, 0.8), hit(8, 0.95), hit(11, 0.8)],
    kickTurn: [hit(13, 0.7)],
    perc: [hit(4, 1), hit(12, 1)],
    percOdd: [hit(14, 0.45)],
    hat: STEPS16.filter((s) => s % 4 !== 0).map((s) => hh(s, s % 4 === 2 ? 1 : 0.45, s % 2 === 1)),
  },
  bed: { bass: 'sawtooth', pad: 'square', arp: 'sawtooth', padDetune: 12 },
};

// ---------------------------------------------------------------------------------------
// Low Orbit: F# natural minor, 112 BPM, 16 bars, a broken beat. i iv VI v, then i VII VI VII.

const T_FSM2 = triad('F#m', 'i', 6, 3);
const T_BM2 = triad('Bm', 'iv', 11, 3);
const T_D2 = triad('D', 'VI', 2, 4);
const T_CSM = triad('C#m', 'v', 1, 3);
const T_E2 = triad('E', 'VII', 4, 4);

const ORBIT: Tune = {
  id: 'orbit',
  name: 'Low Orbit',
  mood: 'broken beat and wide, F# minor, sine arp in syncopated pairs over a wide saw pad',
  bpm: 112,
  stepSec: 60 / 112 / 4,
  root: 66,
  key: { tonic: 6, scale: [6, 8, 9, 11, 1, 2, 4], bars: barsOf([T_FSM2, T_BM2, T_D2, T_CSM, T_FSM2, T_E2, T_D2, T_E2], 2) },
  loopBars: 16,
  voicings: voicings([voiced(T_FSM2, 0), voiced(T_BM2, 2), voiced(T_D2, 1), voiced(T_CSM, 3), voiced(T_E2, -1)]),
  bass: [bh(0, 0, 2, 1), bh(3, 0, 1, 0.7), bh(4, 3, 2, 0.8), bh(7, 0, 1, 0.7), bh(8, 0, 2, 0.95), bh(10, 2, 2, 0.75), bh(12, 0, 1, 0.8), bh(14, 3, 2, 0.75)],
  // Varied pass: held roots that open to the fifth.
  bassAlt: [bh(0, 0, 4, 1), bh(6, 0, 2, 0.75), bh(8, 2, 4, 0.85), bh(12, 1, 2, 0.7), bh(14, 2, 2, 0.7)],
  arp: {
    a: [0, 1, 1, 3, 2, 1, 1, 0, 1, 3, 3, 4, 5, 4, 4, 2],
    b: [4, 3, 3, 2, 1, 0, 0, 1, 0, -1, -1, 1, 2, 1, 1, 0],
    rests: [2, 6, 10, 14],
    restP: 0.1,
  },
  // Varied pass: dotted eighths across the bar.
  arpAlt: {
    a: [0, 0, 0, 2, 2, 2, 4, 4, 3, 3, 3, 5, 5, 5, 4, 4],
    b: [5, 5, 5, 4, 4, 4, 2, 2, 1, 1, 1, 0, 0, 0, 1, 1],
    rests: [1, 2, 4, 5, 7, 9, 10, 12, 13, 15],
    restP: 0,
  },
  drums: {
    kick: [hit(0, 1), hit(6, 0.8), hit(10, 0.9)],
    kickTurn: [hit(13, 0.65)],
    perc: [hit(4, 1), hit(12, 1)],
    percOdd: [hit(7, 0.4)],
    hat: STEPS16.filter((s) => s % 2 === 0 || s === 5 || s === 13 || s === 15).map((s) =>
      s % 2 === 0 ? hh(s, s % 4 === 2 ? 0.9 : 0.6, false) : hh(s, 0.4, true),
    ),
  },
  bed: { bass: 'square', pad: 'sawtooth', arp: 'sine', padDetune: 15 },
};

/** Every tune, in selection order. Index 0 is the original track. */
export const TUNES: readonly Tune[] = [NEON, TIDE, EMBER, ORBIT];

export const DEFAULT_TUNE: Tune = NEON;

/** Pure: a tune by id (the default for an unknown id). */
export function tuneById(id: string): Tune {
  return TUNES.find((t) => t.id === id) ?? DEFAULT_TUNE;
}

/** Pure: the bar wrapped into a tune's loop. */
export function tuneBar(t: Tune, bar: number): number {
  const b = Math.trunc(bar);
  return ((b % t.loopBars) + t.loopBars) % t.loopBars;
}

/** Pure: the pass of the loop a bar is in (0 for the first time through). */
export function passOf(t: Tune, bar: number): number {
  return Math.floor(Math.trunc(bar) / t.loopBars);
}

/** Pure: the voicing of a bar's chord in a tune. */
export function voicingForBar(t: Tune, bar: number): ChordVoicing {
  const h = t.key.bars[tuneBar(t, bar)] ?? HARMONIES.Am;
  return t.voicings[h.name] ?? voiced(h, 0);
}

// ---------------------------------------------------------------------------------------
// Fills (a 2 bar fill at a phase change). Shared by every tune; the run takes the tune's
// chords. Bar 0 opens the hats to every sixteenth; bar 1 adds kicks, a clap roll that decays
// before the bar line, a hat roll and a chord tone run in place of the arp.

export const FILL_BARS = 2;
export const FILL_KICK: readonly DrumHit[] = [hit(0, 1), hit(4, 0.9), hit(8, 0.9), hit(10, 0.75), hit(12, 0.9), hit(13, 0.7)];
export const FILL_PERC: readonly DrumHit[] = [hit(4, 1), hit(8, 0.6), hit(12, 1), hit(13, 0.7), hit(14, 0.85)];
/** Chord degrees of the run, one per sixteenth, counted from the chord root nearest an octave under the tune root. */
export const FILL_RUN: readonly number[] = [0, 1, 2, 3, 1, 2, 3, 4, 2, 3, 4, 5, 3, 4, 5, 6];

// ---------------------------------------------------------------------------------------
// Boss hook (wave B). A dark, half time variant of the active tune is wave B's job; for now the
// entry returns the active tune unchanged.

/** Pure: the tune a boss fight of this tier plays over. Stub: the active tune. */
export function bossTuneFor(tier: number, active: Tune): Tune {
  void tier;
  return active;
}
