// Enemy layer lifecycle (docs/10 wave D design items 1 and 2). Pure, in steps (sixteenths):
//   enter: a stinger on the next sixteenth (the first step not yet scheduled), the motif from
//          the next bar line after it, fading in over one bar;
//   exit:  the motif leaves 2 bars after the exit, on a bar line, fading out over the last bar;
//          an exit before the motif joined drops the motif (the stinger still sounds);
//   enter again during the tail: the exit is cancelled and the motif ramps back to full from
//          wherever its fade had got to, by the next bar line, without restarting.
// Also the gain budget that keeps bed plus motifs plus a stinger plus a kill accent plus
// the hit sounds at or under 1.0.
import type { EnemyKind } from '../../levelgen/leveldef';
import type { LayerRegistry } from './layers';
import { STEPS_PER_BAR } from './track';

/** Bars a motif keeps playing after its kind's exit. */
export const TAIL_BARS = 2;
/** Bars a motif takes to fade in. */
export const FADE_IN_BARS = 1;
/** A stinger later than this many steps (pause, stall) is dropped, not played late. */
export const STINGER_STALE_STEPS = STEPS_PER_BAR;
/** Summed motif gain never exceeds this; more kinds share it. */
// v2.1 melody: the melodic layer is lifted against the bed (motifs x2 in layers.ts, kill notes
// x2 in kills.ts, the stinger and accent reserves below), and the bed takes the difference.
// melodyRatioDb measures it; tests/audio/music/lifecycle.test.ts pins the lift.
export const MOTIF_TOTAL_MAX = 0.36;
/** Gain of one entrance phrase note (one at a time per kind); reserved in the budget at all times. */
export const STINGER_GAIN = 0.12;
/** Kill accents (one note, one resolution or one chord at a time, kills.ts); reserved at all times. */
export const ACCENT_RESERVE = 0.16;
/** Hit ticks and shield deflects (one at a time on a mono lane, hits.ts); reserved at all times. */
export const HIT_RESERVE = 0.03;
/** Summed layer gain ceiling (SPEC 3.9 item 5). */
export const GAIN_CEILING = 1;

/** Linear gain ramp in steps: g0 at or before s0, g1 at or after s1. */
export interface Ramp {
  readonly s0: number;
  readonly g0: number;
  readonly s1: number;
  readonly g1: number;
}

export interface LayerState {
  readonly kind: EnemyKind;
  /** Step the stinger is due on, or null once played. */
  readonly stingerStep: number | null;
  /** First step the motif may sound. */
  readonly joinStep: number;
  readonly fadeIn: Ramp;
  /** Fade out after an exit; its s1 is the leave step. */
  readonly fadeOut: Ramp | null;
}

/** Layers in entry order. */
export type LayerSet = readonly LayerState[];

/** Pure: the first bar line at or after a step. */
export function barLineAtOrAfter(step: number): number {
  return Math.ceil(step / STEPS_PER_BAR) * STEPS_PER_BAR;
}

/** Pure: the first bar line strictly after a step. */
export function barLineAfter(step: number): number {
  return barLineAtOrAfter(step + 1);
}

export function rampAt(r: Ramp, step: number): number {
  if (step <= r.s0) return r.g0;
  if (step >= r.s1) return r.g1;
  return r.g0 + ((r.g1 - r.g0) * (step - r.s0)) / (r.s1 - r.s0);
}

/** Pure: motif envelope 0 to 1 at a step. */
export function envelopeAt(l: LayerState, step: number): number {
  if (step < l.joinStep) return 0;
  const a = rampAt(l.fadeIn, step);
  const b = l.fadeOut === null ? 1 : rampAt(l.fadeOut, step);
  return Math.max(0, Math.min(1, a, b));
}

/** Pure: the step the motif leaves on, or null while its kind is live. */
export function leaveStepOf(l: LayerState): number | null {
  return l.fadeOut === null ? null : l.fadeOut.s1;
}

function fresh(kind: EnemyKind, now: number): LayerState {
  const join = barLineAfter(now);
  return {
    kind,
    stingerStep: now,
    joinStep: join,
    fadeIn: { s0: join, g0: 0, s1: join + FADE_IN_BARS * STEPS_PER_BAR, g1: 1 },
    fadeOut: null,
  };
}

function replace(set: LayerSet, l: LayerState): LayerSet {
  return set.map((x) => (x.kind === l.kind ? l : x));
}

/** Pure: a kind entered. `now` is the first step not yet scheduled. */
export function enterLayer(set: LayerSet, kind: EnemyKind, now: number): LayerSet {
  const cur = set.find((l) => l.kind === kind);
  if (!cur) return [...set, fresh(kind, now)];
  if (cur.fadeOut === null) return set; // already live: a duplicate enter changes nothing
  const g = envelopeAt(cur, now);
  if (g <= 0) return replace(set, { ...fresh(kind, now), stingerStep: now });
  // Re-entry during the tail: no restart, ramp back to full by the next bar line.
  const back = barLineAfter(now);
  const joinStep = Math.min(cur.joinStep, now);
  return replace(set, { kind, stingerStep: now, joinStep, fadeIn: { s0: now, g0: g, s1: back, g1: 1 }, fadeOut: null });
}

/** Pure: the last entity of a kind left. `now` is the first step not yet scheduled. */
export function exitLayer(set: LayerSet, kind: EnemyKind, now: number): LayerSet {
  const cur = set.find((l) => l.kind === kind);
  if (!cur || cur.fadeOut !== null) return set;
  if (now < cur.joinStep) {
    // Gone before the motif joined: drop the motif now, keep the pending stinger.
    return replace(set, { ...cur, fadeOut: { s0: now, g0: 0, s1: now, g1: 0 } });
  }
  const leave = barLineAtOrAfter(now + TAIL_BARS * STEPS_PER_BAR);
  return replace(set, { ...cur, fadeOut: { s0: leave - STEPS_PER_BAR, g0: 1, s1: leave, g1: 0 } });
}

/** Pure: drop layers whose motif has left and whose stinger is done. */
export function pruneLayers(set: LayerSet, step: number): LayerSet {
  const keep = set.filter((l) => {
    const leave = leaveStepOf(l);
    return leave === null || step < leave || l.stingerStep !== null;
  });
  return keep.length === set.length ? set : keep;
}

export interface StingerTake {
  /** Kinds whose stinger plays on this step. */
  readonly due: readonly EnemyKind[];
  readonly set: LayerSet;
}

/** Pure: stingers due at a step (late ones within the stale window still play; older ones drop). */
export function takeStingers(set: LayerSet, step: number): StingerTake {
  const due: EnemyKind[] = [];
  let changed = false;
  const next = set.map((l) => {
    if (l.stingerStep === null || step < l.stingerStep) return l;
    if (step - l.stingerStep <= STINGER_STALE_STEPS) due.push(l.kind);
    changed = true;
    return { ...l, stingerStep: null };
  });
  return { due, set: changed ? next : set };
}

/** Pure: true while a layer can still sound a motif note (joined or pending, not yet left). */
export function motifActive(l: LayerState, step: number): boolean {
  const leave = leaveStepOf(l);
  return leave === null || step < leave;
}

export interface LayerMix {
  /** Multiplies every bed layer gain. */
  readonly bedScale: number;
  /** Multiplies every motif gain. */
  readonly motifScale: number;
  /** Summed motif gain after the scale. */
  readonly motifTotal: number;
}

/**
 * Pure: the budget. Every active motif counts at full gain (fades only lower it), motifs share
 * at most MOTIF_TOTAL_MAX, a stinger, a kill accent and the hit sounds are always reserved,
 * and the bed is scaled so the sum of bed, motifs, stinger, accent and hits is at most 1.0.
 */
export function layerMix(bedSum: number, set: LayerSet, registry: LayerRegistry, step: number): LayerMix {
  let raw = 0;
  for (const l of set) {
    const spec = registry[l.kind];
    if (spec.pattern.length > 0 && motifActive(l, step)) raw += spec.gain;
  }
  const motifScale = raw > MOTIF_TOTAL_MAX ? MOTIF_TOTAL_MAX / raw : 1;
  const motifTotal = raw * motifScale;
  const room = GAIN_CEILING - STINGER_GAIN - ACCENT_RESERVE - HIT_RESERVE - motifTotal;
  const bedScale = bedSum > room && bedSum > 0 ? room / bedSum : 1;
  return { bedScale, motifScale, motifTotal };
}

/** Pure: a melodic voice's level against the bed it sits on, dB (20 log10 of the gain ratio). */
export function melodyRatioDb(melodyGain: number, bedGain: number): number {
  if (!(melodyGain > 0)) return -Infinity;
  if (!(bedGain > 0)) return Infinity;
  return 20 * Math.log10(melodyGain / bedGain);
}
