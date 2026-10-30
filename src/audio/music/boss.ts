// Boss motifs (v3 wave B, docs/12 "Design: boss music", docs/13 SPEC 3.9). Pure, no Web Audio, no
// PRNG. One registry entry per BossId: a motif builder, a timbre, a register and a gain.
//
// A boss motif is a pure function of (boss id, phase, bar) on the stateless hash01, with no seed,
// so a boss sounds the same on every level (docs/13 replaces the seed rule for bosses only). It is
// a 2 or 4 bar loop of 4 to 8 notes in its main line, in A at 120 BPM, every pitch inside the
// tier scale:
//   tier 1: A minor pentatonic        A C D E G
//   tier 2: harmonic minor            A B C D E F G#
//   tier 3: phrygian                  A Bb C D E F G
//   tier 4: natural minor (wave C writes Prism's quoting loop)
// The motif plays over its tier's boss bed (tunes.ts BOSS_TUNES), whose chords come from the
// same scale. On the downbeat and the half bar a note moves to the nearest pitch that is both a
// chord tone and in the tier scale, so the line agrees with the bed and never leaves its scale.
//
// Phases: phase 1 plays the main line (one voice). Each later phase adds one voice from the next
// bar: an octave double of the main line or a counter line, at most BOSS_VOICE_MAX in all. Every
// voice is monophonic, so voices equal notes sounding at once.
//
// Tier 3 (v3 wave C) bends three of those rules, each as optional data on the spec:
//   phaseCounts: voices per phase, so a boss can lose voices as it loses parts (Bastion);
//   phaseTempo:  2 plays the line at double time, steps and durations halved (Twins phase 2);
//   lap:         each pass of the loop climbs `rise` scale degrees for `laps` passes, then resets (Tempest);
//   canon:       a phase voice that plays the main line `bars` bars late (Twins).
// Prism (entry 10) is present with empty lines: it builds no notes until wave C fills it, and
// every key exists so the registry test catches a missing id.
import { hash01 } from '../../core/rng';
import { BOSS_IDS, type BossId, type BossTier } from '../../levelgen/leveldef';
import { BOSS_VOICE_MAX } from './engine';
import { harmonyForBar, inChord, type Harmony } from './harmony';
import { timbre, type Timbre } from './layers';
import { pitchClass } from './scale';
import { STEPS_PER_BAR } from './track';
import { BOSS_KEYS } from './tunes';

/** Semitones above A of each tier scale, ascending. */
export const TIER_SCALES: Readonly<Record<BossTier, readonly number[]>> = {
  1: [0, 3, 5, 7, 10],
  2: [0, 2, 3, 5, 7, 8, 11],
  3: [0, 1, 3, 5, 7, 8, 10],
  4: [0, 2, 3, 5, 7, 8, 10],
};

/** Pitch class of A. */
const A_PC = 9;
export const MOTIF_LOOP_NOTES_MIN = 4;
export const MOTIF_LOOP_NOTES_MAX = 8;
/** Steps inside a bar where a note snaps to a chord tone (the downbeat and the half bar). */
export const SNAP_STEPS: readonly number[] = [0, 8];

/** Pure: true when a MIDI note is in the tier's scale. */
export function inTierScale(midi: number, tier: BossTier): boolean {
  return TIER_SCALES[tier].includes((pitchClass(midi) - A_PC + 12) % 12);
}

/**
 * Pure: tier scale degree to MIDI. Degree 0 is `root` (an A), one scale length up is the A an
 * octave higher, negative degrees go down.
 */
export function tierMidi(degree: number, tier: BossTier, root: number): number {
  const sc = TIER_SCALES[tier];
  const n = sc.length;
  const d = Math.trunc(degree);
  const oct = Math.floor(d / n);
  return root + oct * 12 + (sc[d - oct * n] ?? 0);
}

/** Pure: the nearest pitch that is a chord tone and in the tier scale (ties go down). */
export function snapTierChord(midi: number, h: Harmony, tier: BossTier): number {
  const m = Math.round(midi);
  const ok = (x: number): boolean => inChord(x, h) && inTierScale(x, tier);
  for (let d = 0; d <= 12; d++) {
    if (ok(m - d)) return m - d;
    if (ok(m + d)) return m + d;
  }
  return m;
}

/** One note of a composed boss line, in steps from the loop start and tier degrees from the register. */
export interface BossNoteDef {
  readonly step: number;
  readonly deg: number;
  readonly dur: number;
  readonly vel: number;
  /** Glide in from this degree, or null. */
  readonly from: number | null;
}

/** What a phase adds from the next bar: the main line doubled by `shift` semitones, or a counter line. */
export type PhaseVoice =
  | { readonly type: 'octave'; readonly shift: 12 | -12 }
  | { readonly type: 'voice'; readonly line: readonly BossNoteDef[] }
  | { readonly type: 'canon'; readonly bars: number };

/** Each pass of the loop climbs `rise` scale degrees, for `laps` passes, then starts again. */
export interface LapRise {
  readonly rise: number;
  readonly laps: number;
}

/** One note of a boss motif bar. */
export interface BossMotifNote {
  /** Step inside the bar, 0 to 15. */
  readonly step: number;
  readonly midi: number;
  /** Glide start pitch, or null. */
  readonly fromMidi: number | null;
  readonly durSteps: number;
  readonly vel: number;
  /** 0 the main line, 1 and 2 the voices phases add. */
  readonly voice: number;
}

export type BossMotifBuilder = (phase: number, bar: number) => readonly BossMotifNote[];

export interface BossMotifSpec {
  readonly id: BossId;
  readonly tier: BossTier;
  /** 2 or 4; 0 for an empty entry. */
  readonly loopBars: number;
  /** MIDI A the degrees count from (45 A2, 57 A3, 69 A4). */
  readonly register: number;
  readonly timbre: Timbre;
  /** Gain of one voice at full fade, before the boss budget scale. */
  readonly gain: number;
  readonly main: readonly BossNoteDef[];
  /** Index 0 is what phase 2 adds, index 1 what phase 3 adds. */
  readonly phaseVoices: readonly PhaseVoice[];
  /** Voices sounding per phase (index 0 is phase 1; the last entry holds). Absent: 1, then one more per phase. */
  readonly phaseCounts?: readonly number[];
  /** Tempo per phase (index 0 is phase 1; the last entry holds). 2 plays the line at double time. Absent: 1. */
  readonly phaseTempo?: readonly (1 | 2)[];
  /** A climb per pass of the loop, or absent. */
  readonly lap?: LapRise;
  /** One line on what the motif mirrors (docs/12 presentation table). */
  readonly character: string;
  readonly motif: BossMotifBuilder;
}

export type BossMotifRegistry = Readonly<Record<BossId, BossMotifSpec>>;

// ---------------------------------------------------------------------------------------
// Timbres. Low lines carry an upper partner or a square so a phone speaker hears them.

export const BOSS_TIMBRES = {
  // A thump with an octave above it: the heartbeat.
  heart: timbre('heart', 'triangle', { wave: 'square', detune: 1200 }, 'lowpass', 760, 1.2, 0.004, 0.18),
  // Two saws a semitone apart through a dark lowpass: the chromatic wobble rides on one pitch.
  murk: timbre('murk', 'sawtooth', { wave: 'sawtooth', detune: 100 }, 'lowpass', 650, 4, 0.05, 0.2, 0.35),
  // A plucked square, bright enough to hear the rotation.
  spin: timbre('spin', 'square', { wave: 'triangle', detune: 1200 }, 'bandpass', 1600, 1.6, 0.003, 0.1),
  // A saw over a square an octave down, gliding up: the wind up.
  flare: timbre('flare', 'sawtooth', { wave: 'square', detune: -1200 }, 'lowpass', 1700, 2, 0.005, 0.1, 0.12),
  // Glassy staccato: a square and a sine an octave up through a highpass.
  mirror: timbre('mirror', 'square', { wave: 'sine', detune: 1200 }, 'highpass', 1500, 1, 0.001, 0.05),
  // A slow, low saw with a sine an octave down, long glides.
  abyss: timbre('abyss', 'sawtooth', { wave: 'sine', detune: -1200 }, 'lowpass', 520, 3, 0.1, 0.3, 0.6),
  // A square over a saw an octave down through a dark lowpass: a plated tread.
  bulwark: timbre('bulwark', 'square', { wave: 'sawtooth', detune: -1200 }, 'lowpass', 900, 1.4, 0.005, 0.14),
  // A fast pluck: a square with a slightly sharp saw through a bandpass, short enough for sixteenths.
  gale: timbre('gale', 'square', { wave: 'sawtooth', detune: 7 }, 'bandpass', 2200, 1.4, 0.002, 0.06),
  // A soft reed: a triangle with a saw a few cents off, so two voices a bar apart stay distinct.
  echo: timbre('echo', 'triangle', { wave: 'sawtooth', detune: 5 }, 'lowpass', 1800, 1, 0.01, 0.14),
  // The entry, phase and defeat stingers: a bright saw over a square an octave down.
  bossSting: timbre('bossSting', 'sawtooth', { wave: 'square', detune: -1200 }, 'lowpass', 2600, 1, 0.003, 0.3),
} as const satisfies Readonly<Record<string, Timbre>>;

// ---------------------------------------------------------------------------------------
// Composed lines.

function n(step: number, deg: number, dur: number, vel = 1, from: number | null = null): BossNoteDef {
  return { step, deg, dur, vel, from };
}

interface SpecInput {
  readonly tier: BossTier;
  readonly loopBars: number;
  readonly register: number;
  readonly timbre: Timbre;
  readonly gain: number;
  readonly main: readonly BossNoteDef[];
  readonly phaseVoices: readonly PhaseVoice[];
  readonly phaseCounts?: readonly number[];
  readonly phaseTempo?: readonly (1 | 2)[];
  readonly lap?: LapRise;
  readonly character: string;
}

function empty(tier: BossTier, character: string): SpecInput {
  return { tier, loopBars: 0, register: 57, timbre: BOSS_TIMBRES.bossSting, gain: 0, main: [], phaseVoices: [], character };
}

/** Tempest's lap: 32 sixteenths over two bars. Each beat runs a triad (up, up, up, back), a degree above the beat before. */
function arpLine(): BossNoteDef[] {
  const shape = [0, 2, 4, 2];
  const vels = [1, 0.7, 0.8, 0.7];
  const bases = [0, 1, 2, 1, 2, 3, 4, 3];
  const out: BossNoteDef[] = [];
  bases.forEach((base, beat) => shape.forEach((d, i) => out.push(n(beat * 4 + i, base + d, 1, vels[i] ?? 0.7))));
  return out;
}

// Degrees: tier 1 (pentatonic) 0 A, 1 C, 2 D, 3 E, 4 G, 5 A up. Tiers 2 and 3 (seven notes)
// 0 A, 1 B or Bb, 2 C, 3 D, 4 E, 5 F, 6 G# or G, 7 A up.
const INPUTS: Readonly<Record<BossId, SpecInput>> = {
  // Low two note heartbeat, A2 then E3, once a bar. Phase 2 doubles it an octave up.
  warden: {
    tier: 1,
    loopBars: 2,
    register: 45,
    timbre: BOSS_TIMBRES.heart,
    gain: 0.09,
    main: [n(0, 0, 2), n(3, 3, 3, 0.75), n(16, 0, 2), n(19, 3, 3, 0.75)],
    phaseVoices: [{ type: 'octave', shift: 12 }],
    character: 'low two note heartbeat, A2 and E3, once a bar',
  },
  // A wobbling drone on A2 (the partner a semitone up makes the chromatic wobble), gliding in from
  // G2, with a short high chirp. Phase 2 adds a pulsing counter line around E3.
  brood: {
    tier: 1,
    loopBars: 2,
    register: 45,
    timbre: BOSS_TIMBRES.murk,
    gain: 0.08,
    main: [n(0, 0, 6, 1, -1), n(7, 10, 1, 0.6), n(8, 1, 8, 0.9, 0), n(16, 0, 12, 1, -1), n(29, 12, 1, 0.6)],
    phaseVoices: [{ type: 'voice', line: [n(4, 3, 2, 0.6), n(12, 3, 2, 0.6), n(20, 4, 2, 0.6), n(28, 3, 2, 0.6)] }],
    character: 'wobbling chromatic drone on A2 with a short high chirp',
  },
  // Eight note rotating arpeggio: up four quarters, then back down from the octave. Phase 2
  // doubles it an octave up.
  spindle: {
    tier: 1,
    loopBars: 2,
    register: 57,
    timbre: BOSS_TIMBRES.spin,
    gain: 0.07,
    main: [n(0, 0, 3), n(4, 1, 3, 0.8), n(8, 2, 3, 0.9), n(12, 3, 3, 0.8), n(16, 5, 3), n(20, 4, 3, 0.8), n(24, 3, 3, 0.9), n(28, 2, 3, 0.8)],
    phaseVoices: [{ type: 'octave', shift: 12 }],
    character: 'eight note arpeggio rotating up, then reversing down',
  },
  // A beat of rest, a four note rising wind up through the raised seventh (E F G# A), one low hit
  // on the dash, then silence. Phase 2 doubles it an octave up, phase 3 adds a low pulse.
  ember: {
    tier: 2,
    loopBars: 2,
    register: 57,
    timbre: BOSS_TIMBRES.flare,
    gain: 0.08,
    main: [n(4, 4, 2, 0.6, 3), n(6, 5, 3, 0.7, 4), n(10, 6, 2, 0.85, 5), n(12, 7, 4, 1, 6), n(16, -7, 4, 1)],
    phaseVoices: [
      { type: 'octave', shift: 12 },
      { type: 'voice', line: [n(0, -3, 2, 0.7), n(8, -3, 2, 0.7), n(24, -1, 2, 0.6), n(28, -1, 2, 0.7)] },
    ],
    character: 'rising four note wind up, one low hit, a beat of silence',
  },
  // Bright staccato with rests in a glassy timbre, around E5 to B5. Phase 2 adds an echo a step
  // behind, phase 3 doubles the line an octave down.
  mirage: {
    tier: 2,
    loopBars: 2,
    register: 69,
    timbre: BOSS_TIMBRES.mirror,
    gain: 0.06,
    main: [n(0, 4, 1), n(3, 2, 1, 0.8), n(6, 6, 1, 0.9), n(10, 7, 1), n(17, 8, 1, 0.85), n(22, 4, 1, 0.8), n(27, 5, 1, 0.9)],
    phaseVoices: [
      { type: 'voice', line: [n(1, 2, 1, 0.5), n(11, 4, 1, 0.5), n(23, 2, 1, 0.5), n(28, 3, 1, 0.5)] },
      { type: 'octave', shift: -12 },
    ],
    character: 'bright glassy staccato with rests',
  },
  // A slow low glide over four bars, A2 down to F2, E2 and up to G#2, then a downward sweep from
  // A4 to A3. Phase 2 adds a slow counter line, phase 3 doubles the glide an octave up.
  gravitas: {
    tier: 2,
    loopBars: 4,
    register: 45,
    timbre: BOSS_TIMBRES.abyss,
    gain: 0.09,
    main: [n(0, 0, 14, 1, 1), n(16, -2, 14, 0.9, 0), n(32, -3, 14, 0.9, -2), n(48, -1, 10, 0.9, -3), n(58, 7, 6, 0.7, 14)],
    phaseVoices: [
      { type: 'voice', line: [n(8, 4, 6, 0.6), n(24, 2, 6, 0.6), n(40, 3, 6, 0.6), n(56, 4, 4, 0.6)] },
      { type: 'octave', shift: 12 },
    ],
    character: 'slow wobbling low glide with a downward sweep',
  },
  // A heavy march on quarter notes from A2, leaning on B flat (the phrygian second) and D. Phase 1
  // (four turrets) plays three voices: the march, an octave double and a high counter line. Each
  // later phase drops one voice (the counter line, then the double) until the march stands alone.
  bastion: {
    tier: 3,
    loopBars: 2,
    register: 45,
    timbre: BOSS_TIMBRES.bulwark,
    gain: 0.09,
    main: [n(0, 0, 3), n(4, 1, 3, 0.8), n(8, 0, 3, 0.95), n(12, 3, 2, 0.75), n(16, 0, 3), n(20, 1, 3, 0.8), n(24, 2, 3, 0.9), n(28, 1, 2, 0.8)],
    phaseVoices: [
      { type: 'octave', shift: 12 },
      { type: 'voice', line: [n(6, 8, 2, 0.6), n(14, 7, 2, 0.6), n(22, 9, 2, 0.6), n(30, 8, 2, 0.6)] },
    ],
    phaseCounts: [3, 2, 1],
    character: 'heavy quarter note march, a voice drops per phase as turrets fall',
  },
  // A sixteenth arpeggio: every beat runs a triad (up, up, up, back) a degree above the last, so
  // the bar climbs, and each lap (two bars) starts two degrees higher for four laps, then resets.
  // Phase 2 doubles it an octave down, phase 3 adds a driving quarter note pulse on A2.
  tempest: {
    tier: 3,
    loopBars: 2,
    register: 57,
    timbre: BOSS_TIMBRES.gale,
    gain: 0.06,
    main: arpLine(),
    phaseVoices: [
      { type: 'octave', shift: -12 },
      { type: 'voice', line: [n(0, -7, 2), n(4, -7, 2, 0.7), n(8, -6, 2, 0.9), n(12, -7, 2, 0.7), n(16, -7, 2), n(20, -7, 2, 0.7), n(24, -5, 2, 0.9), n(28, -6, 2, 0.7)] },
    ],
    lap: { rise: 2, laps: 4 },
    character: 'fast sixteenth arpeggio that rises each lap',
  },
  // A two bar line, four notes a bar, that the second voice plays a bar later (a canon). Phase 2
  // (one body down) is the line alone at double time.
  twins: {
    tier: 3,
    loopBars: 2,
    register: 57,
    timbre: BOSS_TIMBRES.echo,
    gain: 0.07,
    main: [n(0, 0, 4), n(4, 2, 2, 0.8), n(6, 1, 2, 0.7), n(8, 4, 6, 0.9), n(16, 5, 2, 0.8), n(18, 4, 2, 0.7), n(24, 3, 4, 0.9), n(28, 0, 4, 0.8)],
    phaseVoices: [{ type: 'canon', bars: 1 }],
    phaseCounts: [2, 1],
    phaseTempo: [1, 2],
    character: 'two voice canon a bar apart; solo at double time once one body falls',
  },
  prism: empty(4, 'wave C: quotes bosses 1 to 9'),
};

// ---------------------------------------------------------------------------------------
// Builder.

const SALT_BOSS = 0x6b05;
const SALT_ANSWER = 0x6b15;
const SALT_MOVE = 0x6b25;

function bossIndex(id: BossId): number {
  return (BOSS_IDS as readonly BossId[]).indexOf(id);
}

/** Hash lane of a boss id: no seed, so a boss sounds the same on every level. */
function lane(id: BossId, salt: number): number {
  return (Math.imul(bossIndex(id) + 1, SALT_BOSS) ^ Math.imul(salt, 0x27d4eb2d)) >>> 0;
}

/** Pure: voices sounding in a phase (1 in phase 1, one more per later phase), at most BOSS_VOICE_MAX. */
export function voicesForPhase(spec: Pick<BossMotifSpec, 'phaseVoices' | 'main' | 'phaseCounts'>, phase: number): number {
  if (spec.main.length === 0) return 0;
  const counts = spec.phaseCounts;
  if (counts && counts.length > 0) {
    const i = Math.min(counts.length, Math.max(1, Math.trunc(phase))) - 1;
    return Math.max(1, Math.min(BOSS_VOICE_MAX, counts[i] ?? 1));
  }
  const extra = Math.max(0, Math.min(spec.phaseVoices.length, Math.trunc(phase) - 1));
  return Math.min(BOSS_VOICE_MAX, 1 + extra);
}

/** Pure: scale degrees a pass climbs above the first (0 with no lap). */
export function lapClimb(lap: LapRise | undefined, pass: number): number {
  if (!lap || lap.laps <= 0) return 0;
  const p = Math.trunc(pass);
  return lap.rise * (((p % lap.laps) + lap.laps) % lap.laps);
}

/** Pure: a line at double time: steps and durations halved (a duration stays at least one step). */
export function doubleTime(line: readonly BossNoteDef[]): BossNoteDef[] {
  return line.map((x) => ({ ...x, step: Math.floor(x.step / 2), dur: Math.max(1, Math.round(x.dur / 2)) }));
}

/**
 * Pure: the main line for one pass of the loop. Every odd pass may answer: its last note moves
 * one scale degree up or down, both decided by hash01 of (boss id, phase, pass).
 */
export function mainForPass(spec: Pick<BossMotifSpec, 'id' | 'main' | 'lap'>, phase: number, pass: number): BossNoteDef[] {
  const climb = lapClimb(spec.lap, pass);
  const out = spec.main.map((x) => ({ ...x, deg: x.deg + climb, from: x.from === null ? null : x.from + climb }));
  const last = out[out.length - 1];
  const p = Math.trunc(pass);
  if (last && p % 2 !== 0) {
    const key = Math.trunc(phase) * 64 + (((p % 8) + 8) % 8);
    if (hash01(lane(spec.id, SALT_ANSWER), key) < 0.5) {
      const up = hash01(lane(spec.id, SALT_MOVE), key) >= 0.5;
      out[out.length - 1] = { ...last, deg: last.deg + (up ? 1 : -1) };
    }
  }
  return out;
}

type Shape = Pick<BossMotifSpec, 'id' | 'tier' | 'register' | 'loopBars' | 'main' | 'phaseVoices' | 'phaseCounts' | 'phaseTempo' | 'lap'>;

/** Pure: the tempo of a phase (1 or 2). */
export function tempoForPhase(spec: Pick<BossMotifSpec, 'phaseTempo'>, phase: number): 1 | 2 {
  const t = spec.phaseTempo;
  if (!t || t.length === 0) return 1;
  return t[Math.min(t.length, Math.max(1, Math.trunc(phase))) - 1] ?? 1;
}

const mod = (a: number, m: number): number => ((a % m) + m) % m;

/** `lb` is the bar inside the loop the line plays; `bar` is the real bar, which picks the chord. */
function placeLine(line: readonly BossNoteDef[], spec: Shape, lb: number, bar: number, voice: number, shift: number): BossMotifNote[] {
  const key = BOSS_KEYS[spec.tier];
  const out: BossMotifNote[] = [];
  for (const x of line) {
    if (Math.floor(x.step / STEPS_PER_BAR) !== lb) continue;
    const step = x.step % STEPS_PER_BAR;
    let midi = tierMidi(x.deg, spec.tier, spec.register);
    if (SNAP_STEPS.includes(step)) midi = snapTierChord(midi, harmonyForBar(bar, key), spec.tier);
    const to = midi + shift;
    const from = x.from === null ? null : tierMidi(x.from, spec.tier, spec.register) + shift;
    out.push({ step, midi: to, fromMidi: from === to ? null : from, durSteps: x.dur, vel: x.vel, voice });
  }
  return out;
}

/**
 * Pure: every note of one bar of a boss motif in a phase. `bar` counts from the bar the motif
 * joined (bar 0 of the boss bed), so the chords line up with BOSS_KEYS.
 */
export function buildBossBar(spec: Shape, phase: number, bar: number): BossMotifNote[] {
  if (spec.main.length === 0 || spec.loopBars <= 0) return [];
  const b = Math.trunc(bar);
  const tempo = tempoForPhase(spec, phase);
  // At double time the loop is half as long, so it comes round twice as often.
  const loop = Math.max(1, Math.round(spec.loopBars / tempo));
  const lineAt = (pass: number): BossNoteDef[] => {
    const line = mainForPass(spec, phase, pass);
    return tempo === 2 ? doubleTime(line) : line;
  };
  const main = lineAt(Math.floor(b / loop));
  const out = placeLine(main, spec, mod(b, loop), b, 0, 0);
  const voices = voicesForPhase(spec, phase);
  for (let v = 1; v < voices; v++) {
    const pv = spec.phaseVoices[v - 1];
    if (!pv) continue;
    if (pv.type === 'octave') out.push(...placeLine(main, spec, mod(b, loop), b, v, pv.shift));
    else if (pv.type === 'canon') {
      // The same line, `bars` bars late: silent until the first bar it can play.
      const from = b - Math.trunc(pv.bars);
      if (from >= 0) out.push(...placeLine(lineAt(Math.floor(from / loop)), spec, mod(from, loop), b, v, 0));
    } else out.push(...placeLine(tempo === 2 ? doubleTime(pv.line) : pv.line, spec, mod(b, loop), b, v, 0));
  }
  return out.sort((a, c) => a.step - c.step || a.voice - c.voice);
}

function makeSpec(id: BossId): BossMotifSpec {
  const i = INPUTS[id];
  const shape: Shape = {
    id,
    tier: i.tier,
    register: i.register,
    loopBars: i.loopBars,
    main: i.main,
    phaseVoices: i.phaseVoices,
    ...(i.phaseCounts ? { phaseCounts: i.phaseCounts } : {}),
    ...(i.phaseTempo ? { phaseTempo: i.phaseTempo } : {}),
    ...(i.lap ? { lap: i.lap } : {}),
  };
  return {
    ...shape,
    timbre: i.timbre,
    gain: i.gain,
    character: i.character,
    motif: (phase, bar) => buildBossBar(shape, phase, bar),
  };
}

/** One entry per boss. Written as a literal so tsc rejects a new BossId without an entry. */
function buildRegistry(): BossMotifRegistry {
  return Object.freeze({
    warden: makeSpec('warden'),
    brood: makeSpec('brood'),
    spindle: makeSpec('spindle'),
    ember: makeSpec('ember'),
    mirage: makeSpec('mirage'),
    gravitas: makeSpec('gravitas'),
    bastion: makeSpec('bastion'),
    tempest: makeSpec('tempest'),
    twins: makeSpec('twins'),
    prism: makeSpec('prism'),
  });
}

/** The boss motif registry. Prism (10) is present and empty until wave C. */
export const BOSS_MOTIFS: BossMotifRegistry = buildRegistry();

/** Pure: the ids missing from a registry (none for BOSS_MOTIFS; the registry test checks it). */
export function missingBossIds(reg: Partial<Record<BossId, unknown>>): BossId[] {
  return BOSS_IDS.filter((id) => reg[id] === undefined);
}
