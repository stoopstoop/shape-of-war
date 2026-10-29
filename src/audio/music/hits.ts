// Hit sounds (v2 hit-sounds, Ryan: "each enemy have specific unique note or sound when hit",
// balanced, not every event sounds). Pure, no Web Audio.
//
// 'fx:hit' is damage that did not kill. Each source gets a short, quiet tick in its kill
// note's pitch family: the kill timbre, one octave up (folded back down above E7), much
// shorter than a kill note. A Bulwark shield block (blocked true) gets one metallic deflect
// ping instead. Hits are not on the sixteenth grid: they land a fixed lead after the tick so
// they stay tight to the impact, and every pitch is still in A minor pentatonic.
// The gate, in audio clock seconds:
//   - each source at most HIT_RATE_MAX ticks a second (at least HIT_GAP_SEC apart),
//   - deflects at most DEFLECT_RATE_MAX a second,
//   - one hit sound (tick or deflect) at a time on a mono lane, so their gain never stacks
//     and HIT_RESERVE in the layer budget covers them; a deflect is tried first,
//   - only with HIT_MIN_ROOM free accent voices (one more than a kill note needs), so hits
//     never force a steal and leave a voice for the next kill note.
// Hits that fail the gate are dropped; the visual flash still tells the player.
import { KILL_SPECS, killMidi, type KillSource } from './kills';
import { TIMBRES, type Timbre } from './layers';
import { DEFAULT_TUNE, type Tune } from './tunes';

/** Most hit ticks per source per second. */
export const HIT_RATE_MAX = 8;
export const HIT_GAP_SEC = 1 / HIT_RATE_MAX;
/** Most shield deflects per second. */
export const DEFLECT_RATE_MAX = 4;
export const DEFLECT_GAP_SEC = 1 / DEFLECT_RATE_MAX;
/** Hit tick length, seconds (a kill note is one or two sixteenths: 0.125 or 0.25 s). */
export const HIT_DUR_SEC = 0.05;
/** Deflect length, seconds. */
export const DEFLECT_DUR_SEC = 0.08;
/** A hit tick's gain is this share of its kill note's gain, at most HIT_GAIN_MAX. */
export const HIT_GAIN_SCALE = 0.4;
export const HIT_GAIN_MAX = 0.03;
export const DEFLECT_GAIN = 0.03;
/** Free accent voices a hit or deflect needs; with fewer it is skipped. */
export const HIT_MIN_ROOM = 2;
/** Above this MIDI note the octave up is folded back to the kill pitch (E7). */
export const HIT_MIDI_MAX = 100;
/** Hits waiting for the next tick; more are dropped. */
export const HIT_QUEUE_MAX = 16;
/** Semitones the deflect drops from, over the timbre's glide. */
export const DEFLECT_DROP = 5;

/** Pure: a kill timbre made into a short tick: instant attack, no glide, a release inside the tick. */
export function hitTimbre(t: Timbre): Timbre {
  return { ...t, attack: Math.min(t.attack, 0.002), release: HIT_DUR_SEC * 0.8, glideSec: 0 };
}

export const DEFLECT_TIMBRE: Timbre = TIMBRES.deflect;

const hitTimbres = new Map<KillSource, Timbre>();

/** The hit timbre of a source (cached; the same object every call). */
export function hitTimbreFor(source: KillSource): Timbre {
  let t = hitTimbres.get(source);
  if (t === undefined) {
    t = hitTimbre(KILL_SPECS[source].timbre);
    hitTimbres.set(source, t);
  }
  return t;
}

/** Pure: a hit tick's pitch at a bar: its kill pitch an octave up, folded down above E7. */
export function hitMidi(source: KillSource, bar: number, tune: Tune = DEFAULT_TUNE): number {
  const m = killMidi(KILL_SPECS[source], bar, tune) + 12;
  return m > HIT_MIDI_MAX ? m - 12 : m;
}

/** Pure: a hit tick's gain. */
export function hitGain(source: KillSource): number {
  return Math.min(HIT_GAIN_MAX, KILL_SPECS[source].gain * HIT_GAIN_SCALE);
}

/** Pure: the deflect pitch at a bar: the Bulwark kill pitch three octaves up, folded under E7. */
export function deflectMidi(bar: number, tune: Tune = DEFAULT_TUNE): number {
  let m = killMidi(KILL_SPECS.bulwark, bar, tune) + 36;
  while (m > HIT_MIDI_MAX) m -= 12;
  return m;
}

/** Gate state, audio clock seconds. */
export interface HitGate {
  /** Time of the last tick per source. */
  readonly last: Readonly<Partial<Record<KillSource, number>>>;
  /** End of the tick or deflect sounding on the hit lane. */
  readonly laneEnd: number;
  readonly lastDeflect: number;
}

export const HIT_GATE_INIT: HitGate = { last: {}, laneEnd: -1e9, lastDeflect: -1e9 };

export type HitResult =
  | { readonly ok: true; readonly gate: HitGate }
  | { readonly ok: false; readonly gate: HitGate; readonly why: 'rate' | 'lane' | 'voices' };

/**
 * Pure: decide one hit tick at time t. `room` is asked only when the rate and lane allow the
 * tick (the voice count is the costly part).
 */
export function gateHit(g: HitGate, source: KillSource, t: number, room: () => number): HitResult {
  const last = g.last[source];
  if (last !== undefined && t - last < HIT_GAP_SEC) return { ok: false, gate: g, why: 'rate' };
  if (t < g.laneEnd) return { ok: false, gate: g, why: 'lane' };
  if (room() < HIT_MIN_ROOM) return { ok: false, gate: g, why: 'voices' };
  return { ok: true, gate: { ...g, last: { ...g.last, [source]: t }, laneEnd: t + HIT_DUR_SEC } };
}

/** Pure: decide one shield deflect at time t. */
export function gateDeflect(g: HitGate, t: number, room: () => number): HitResult {
  if (t - g.lastDeflect < DEFLECT_GAP_SEC) return { ok: false, gate: g, why: 'rate' };
  if (t < g.laneEnd) return { ok: false, gate: g, why: 'lane' };
  if (room() < HIT_MIN_ROOM) return { ok: false, gate: g, why: 'voices' };
  return { ok: true, gate: { ...g, lastDeflect: t, laneEnd: t + DEFLECT_DUR_SEC } };
}

/** A hit waiting for the next tick. Deflects carry no source. */
export type QueuedHit = { readonly blocked: false; readonly source: KillSource } | { readonly blocked: true };

/** Pure: true when the queue already holds this hit (one per source and one deflect per tick). */
export function hasQueued(q: readonly QueuedHit[], h: QueuedHit): boolean {
  return q.some((x) => (x.blocked && h.blocked) || (!x.blocked && !h.blocked && x.source === h.source));
}

/**
 * Pure: the order hits are tried in one tick: a deflect first (the rarer, clearer cue), then sources
 * heard longest ago first, so the lane rotates between kinds rather than favouring whichever
 * the sim emitted first. Ties keep queue order.
 */
export function hitOrder(q: readonly QueuedHit[], g: HitGate): QueuedHit[] {
  const lastOf = (h: QueuedHit): number => (h.blocked ? -2e9 : (g.last[h.source] ?? -1e9));
  return q
    .map((h, i) => ({ h, i }))
    .sort((a, b) => lastOf(a.h) - lastOf(b.h) || a.i - b.i)
    .map((x) => x.h);
}
