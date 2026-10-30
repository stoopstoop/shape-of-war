// Boss cues (G3C window cue wave). Pure, no Web Audio. Three things the fight needed to be heard:
//   window: 'sim:bossWindow' { id, open, secondsLeft }. Run up events (open false, secondsLeft
//           counting down) give an estimate of when the window opens; a rising two note cue lands
//           on it (the first note a short gap before, the second on the opening). On open true a
//           bright shimmer pad sounds for the window length, in short overlapping segments so an
//           early close leaves almost no tail; on open false after a window a short damp plays.
//   crack:  'sim:bossCrack' { id, stage }: a crack stinger once per stage (stage 2 lower and
//           longer), and the boss motif loses one voice for the rest of the fight (crackKeeps).
//   tick:   a boss hit tick on 'fx:hit' for the boss kinds, at most BOSS_TICK_RATE_MAX a second,
//           lower and rounder than the enemy hit ticks (hits.ts).
// The two payloads are mirrored here and the bus is read through BossCueBus until core/events.ts
// carries them (hand-off Requests); at runtime the bus accepts any key.
import type { BossId } from '../../levelgen/leveldef';
import { chordToneMidi, type Harmony } from './harmony';
import { timbre, type Timbre } from './layers';
import { BOSS_PAD_GAIN, BOSS_STING_GAIN, BOSS_TICK_GAIN } from './lifecycle';

export interface BossWindowEvent {
  readonly id: BossId;
  readonly open: boolean;
  readonly secondsLeft: number;
}
export interface BossCrackEvent {
  readonly id: BossId;
  readonly stage: number;
}
export interface BossCueEvents {
  'sim:bossWindow': BossWindowEvent;
  'sim:bossCrack': BossCrackEvent;
}
/** The subscribe half of the core bus, for the two keys above. */
export interface BossCueBus {
  on<K extends keyof BossCueEvents>(k: K, h: (payload: BossCueEvents[K]) => void): () => void;
}

/** Notes of the rise and the landing are scheduled when they are this close (100 ms ahead). */
export const WINDOW_LOOKAHEAD_SEC = 0.1;
/** Gap from the first note of the rise to the landing, seconds. */
export const RISE_GAP_SEC = 0.18;
export const RISE_NOTE_SEC = 0.16;
export const LAND_NOTE_SEC = 0.4;
/** A landing later than this behind the clock is dropped rather than played late. */
export const LAND_STALE_SEC = 0.25;
/** A run up estimate this far before, or this far after, the held one starts a new cycle (a stall delays an estimate, so late is wider). */
export const ESTIMATE_EARLY_SEC = 0.12;
export const ESTIMATE_LATE_SEC = 0.25;
/** Delay from an event to a sound it triggers on the spot, so it is never in the past. */
export const CUE_LEAD_SEC = 0.03;
/** Pad segment length, the overlap that joins segments, the longest pad and the pad when the length is unknown. */
export const PAD_SEG_SEC = 0.3;
export const PAD_OVERLAP_SEC = 0.05;
export const PAD_MAX_SEC = 8;
export const PAD_DEFAULT_SEC = 3;
export const DAMP_SEC = 0.22;

export const CUE_TIMBRES = {
  // A clean bell: a triangle with a sine an octave up through a bright lowpass.
  rise: timbre('windowRise', 'triangle', { wave: 'sine', detune: 1200 }, 'lowpass', 5200, 0.8, 0.003, 0.16),
  // Two saws a few cents apart beat slowly: the shimmer.
  pad: timbre('windowPad', 'sawtooth', { wave: 'sawtooth', detune: 14 }, 'lowpass', 4200, 0.8, 0.05, 0.1),
  // A soft low square falling away.
  damp: timbre('windowDamp', 'triangle', { wave: 'square', detune: -1200 }, 'lowpass', 700, 1, 0.003, 0.14, 0.14),
  // A saw against a square a tritone up: the clash is the crack.
  crack: timbre('crack', 'sawtooth', { wave: 'square', detune: 600 }, 'lowpass', 3600, 1.5, 0.001, 0.1, 0.06),
  crackDeep: timbre('crackDeep', 'sawtooth', { wave: 'square', detune: 600 }, 'lowpass', 2200, 1.5, 0.002, 0.3, 0.2),
  // A round thock, lower than any enemy tick.
  tick: timbre('bossTick', 'square', { wave: 'triangle', detune: -1200 }, 'bandpass', 900, 2, 0.001, 0.05),
} as const satisfies Readonly<Record<string, Timbre>>;

// ---------------------------------------------------------------------------------------
// Window state machine.

export interface WindowCue {
  readonly id: BossId | null;
  /** Estimated audio time the window opens (the landing), or null with no run up. */
  readonly openAt: number | null;
  /** 0 nothing scheduled, 1 the first note scheduled or skipped, 2 the landing scheduled. */
  readonly rise: 0 | 1 | 2;
  /** True from open true to open false. */
  readonly open: boolean;
  /** Start of the next pad segment, or null. */
  readonly padNext: number | null;
  readonly padEnd: number;
  /** Time the damp is due, or null. */
  readonly dampAt: number | null;
}

export const WINDOW_IDLE: WindowCue = { id: null, openAt: null, rise: 0, open: false, padNext: null, padEnd: 0, dampAt: null };

/**
 * Pure: one 'sim:bossWindow' read at audio time `at`. A run up event estimates the opening as
 * at + secondsLeft; handler delay only ever makes an estimate late, so within one cycle the
 * earliest estimate wins (until the landing is scheduled). Open true starts the pad at the
 * landing; open false after a window starts the damp and ends the pad.
 */
export function windowEvent(st: WindowCue, id: BossId, open: boolean, secondsLeft: number, at: number): WindowCue {
  const left = Number.isFinite(secondsLeft) ? Math.max(0, secondsLeft) : 0;
  const cur = st.id === id ? st : { ...WINDOW_IDLE, id };
  if (open) {
    if (cur.open) return left > 0 ? { ...cur, padEnd: at + Math.min(left, PAD_MAX_SEC) } : cur;
    const cued = cur.rise === 2 && cur.openAt !== null && Math.abs(at - cur.openAt) <= LAND_STALE_SEC;
    const land = cued && cur.openAt !== null ? cur.openAt : at + CUE_LEAD_SEC;
    const length = left > 0 ? Math.min(left, PAD_MAX_SEC) : PAD_DEFAULT_SEC;
    // Without a run up the first note is skipped (rise 1) and the landing plays at once.
    return { id, openAt: land, rise: cued ? 2 : 1, open: true, padNext: land, padEnd: Math.max(land, at) + length, dampAt: null };
  }
  if (cur.open) return { ...WINDOW_IDLE, id, dampAt: at + CUE_LEAD_SEC };
  if (left <= 0) return cur;
  const est = at + left;
  if (cur.openAt !== null && est >= cur.openAt - ESTIMATE_EARLY_SEC && est <= cur.openAt + ESTIMATE_LATE_SEC) {
    return cur.rise === 2 ? cur : { ...cur, openAt: Math.min(cur.openAt, est) };
  }
  return { ...cur, openAt: est, rise: 0 };
}

/** One sound the window state asks for. `time` may be behind the clock; the engine starts it at once then. */
export interface WindowDue {
  readonly kind: 'rise' | 'land' | 'pad' | 'damp';
  readonly time: number;
  readonly dur: number;
}

/** Pure: what to schedule at audio time `now` (called every scheduler tick), and the state after. */
export function planWindow(st: WindowCue, now: number, horizon = WINDOW_LOOKAHEAD_SEC): { readonly st: WindowCue; readonly due: readonly WindowDue[] } {
  const due: WindowDue[] = [];
  const until = now + horizon;
  let cur = st;
  if (cur.openAt !== null && cur.rise < 2) {
    const land = cur.openAt;
    if (!cur.open && land < now - LAND_STALE_SEC) {
      cur = { ...cur, openAt: null, rise: 0 };
    } else {
      if (cur.rise === 0 && land - RISE_GAP_SEC < until) {
        const t = land - RISE_GAP_SEC;
        if (t >= now) due.push({ kind: 'rise', time: t, dur: RISE_NOTE_SEC });
        cur = { ...cur, rise: 1 };
      }
      if (cur.rise === 1 && land < until) {
        due.push({ kind: 'land', time: land, dur: LAND_NOTE_SEC });
        cur = { ...cur, rise: 2 };
      }
    }
  }
  while (cur.padNext !== null && cur.padNext < until) {
    const t = cur.padNext;
    const len = Math.min(PAD_SEG_SEC, cur.padEnd - t);
    if (len <= 0.02) {
      cur = { ...cur, padNext: null };
      break;
    }
    due.push({ kind: 'pad', time: t, dur: len + PAD_OVERLAP_SEC });
    cur = { ...cur, padNext: t + PAD_SEG_SEC >= cur.padEnd - 0.02 ? null : t + PAD_SEG_SEC };
  }
  if (cur.dampAt !== null && cur.dampAt < until) {
    due.push({ kind: 'damp', time: Math.max(cur.dampAt, now), dur: DAMP_SEC });
    cur = { ...cur, dampAt: null };
  }
  return { st: cur, due };
}

export interface CueVoice {
  readonly midi: number;
  readonly fromMidi: number | null;
  readonly gain: number;
  readonly timbre: Timbre;
}

/** Pure: pitch, glide, gain and timbre of a window sound on a chord. The rise climbs from the root to the fifth. */
export function windowVoice(kind: WindowDue['kind'], h: Harmony): CueVoice {
  switch (kind) {
    case 'rise':
      return { midi: chordToneMidi(h, 0, 72), fromMidi: null, gain: BOSS_STING_GAIN, timbre: CUE_TIMBRES.rise };
    case 'land':
      return { midi: chordToneMidi(h, 2, 72), fromMidi: null, gain: BOSS_STING_GAIN, timbre: CUE_TIMBRES.rise };
    case 'pad':
      return { midi: chordToneMidi(h, 3, 72), fromMidi: null, gain: BOSS_PAD_GAIN, timbre: CUE_TIMBRES.pad };
    case 'damp': {
      const midi = chordToneMidi(h, 0, 45);
      return { midi, fromMidi: midi + 7, gain: BOSS_STING_GAIN, timbre: CUE_TIMBRES.damp };
    }
  }
}

// ---------------------------------------------------------------------------------------
// Crack.

/** Pure: the crack stinger of a stage on a chord and its length in seconds. Stage 2 and up is lower and longer. */
export function crackVoice(stage: number, h: Harmony): CueVoice & { readonly dur: number } {
  if (stage >= 2) {
    const midi = chordToneMidi(h, 0, 50);
    return { midi, fromMidi: midi + 12, gain: BOSS_STING_GAIN, timbre: CUE_TIMBRES.crackDeep, dur: 0.55 };
  }
  const midi = chordToneMidi(h, 0, 62);
  return { midi, fromMidi: midi + 12, gain: BOSS_STING_GAIN, timbre: CUE_TIMBRES.crack, dur: 0.22 };
}

/**
 * Pure: true when a boss motif note still sounds after `cracked` stages. Each stage drops the
 * highest voice left; voice 0 stays, but once nothing else is left to drop it thins to the beat.
 * `voices` is how many voices the phase sounds, `step` the note's step inside its bar.
 */
export function crackKeeps(voices: number, cracked: number, note: { readonly voice: number; readonly step: number }): boolean {
  const c = Math.max(0, Math.trunc(cracked));
  if (c === 0) return true;
  if (note.voice >= Math.max(1, voices - c)) return false;
  return c < voices || note.voice !== 0 || note.step % 4 === 0;
}

// ---------------------------------------------------------------------------------------
// Boss hit tick.

/** Kind values of Kind.Boss and Kind.BossPart (src/game/world.ts, mirrored; tests check them against the enum). */
export const KIND_BOSS = 22;
export const KIND_BOSS_PART = 23;
export const BOSS_TICK_RATE_MAX = 10;
export const BOSS_TICK_GAP_SEC = 1 / BOSS_TICK_RATE_MAX;
export const BOSS_TICK_SEC = 0.07;

/** Pure: true for the sim kinds whose damage gets the boss tick. */
export function isBossHitKind(kind: number | undefined): boolean {
  return kind === KIND_BOSS || kind === KIND_BOSS_PART;
}

export interface BossTickGate {
  /** Time of the last tick. */
  readonly last: number;
  /** Ticks played, so the pitch can alternate. */
  readonly count: number;
}

export const BOSS_TICK_GATE_INIT: BossTickGate = { last: -1e9, count: 0 };

/** Pure: decide one boss tick at time t. */
export function gateBossTick(g: BossTickGate, t: number): { readonly ok: boolean; readonly gate: BossTickGate } {
  if (t - g.last < BOSS_TICK_GAP_SEC) return { ok: false, gate: g };
  return { ok: true, gate: { last: t, count: g.count + 1 } };
}

/** Pure: the tick pitch, the chord root and fifth around E3 in turn, a thock below every enemy tick. */
export function bossTickVoice(h: Harmony, count: number): CueVoice {
  return { midi: chordToneMidi(h, count % 2 === 0 ? 0 : 2, 52), fromMidi: null, gain: BOSS_TICK_GAIN, timbre: CUE_TIMBRES.tick };
}
