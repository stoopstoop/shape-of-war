// Boss music lifecycle (v3 wave B, docs/12 "Design: boss music" items 1 to 4, docs/13 SPEC 3.9).
// Pure, in steps (sixteenths). `now` is always the first step not yet scheduled.
//   enter: the entry stinger (a chord hit on the current chord) on the next sixteenth, lasting
//          at most to the next bar line; the boss motif joins on that bar line and fades in over
//          one bar; the enemy motifs duck to 40 percent over the same bar (kill notes stay); the
//          intensity floor is 0.8 while the boss lives.
//   phase: a phase sting on the next sixteenth (one per bar at most, ending on the bar line) and
//          the phase's voice from the next bar line.
//   down:  the defeat stinger (A, C sharp, E rising) on the next sixteenth, once the phase voices
//          are quiet; the phase voices stop at once, the main line at the next bar line; the
//          floor goes and the duck returns to full over the normal release (3 s).
// A boss entering while another boss's state is still releasing starts from wherever the duck
// had got to. A level restart starts a new session, so it starts with no boss at all.
import type { BossId, BossTier, EnemyKind } from '../../levelgen/leveldef';
import { ENEMY_MOTIF_SLOTS_WITH_BOSS, MOTIF_VOICE_MAX } from './engine';
import { RELEASE_SEC } from './intensity';
import { barLineAfter, BOSS_MOTIF_TOTAL_MAX, motifActive, rampAt, STINGER_STALE_STEPS, type LayerSet, type Ramp } from './lifecycle';
import { STEPS_PER_BAR } from './track';

/** Enemy motifs play at this share while a boss lives. */
export const BOSS_DUCK = 0.4;
/** Smoothed threat never falls under this while a boss lives. */
export const BOSS_FLOOR = 0.8;
/** Seconds the duck and the floor take to come back after the boss dies (the threat release). */
export const BOSS_RELEASE_SEC = RELEASE_SEC;
/** Bars the boss motif takes to fade in. */
export const BOSS_FADE_BARS = 1;
/** Longest entry stinger, steps (it also ends on the join bar line). */
export const ENTRY_STING_STEPS = 6;
/** Phase sting: two notes of this many steps each, ending by the bar line. */
export const PHASE_STING_STEPS = 2;
/** Defeat stinger: A, C sharp, E rising, the E held. Offsets and lengths in steps. */
export const DEFEAT_STING: readonly { readonly at: number; readonly semis: number; readonly dur: number }[] = [
  { at: 0, semis: 0, dur: 2 },
  { at: 2, semis: 4, dur: 2 },
  { at: 4, semis: 7, dur: 8 },
];
/** Steps the defeat stinger lasts. */
export const DEFEAT_STING_STEPS = 12;

export interface PhaseMark {
  /** First step the phase plays (a bar line). */
  readonly from: number;
  readonly phase: number;
}

export interface BossLife {
  readonly id: BossId;
  readonly tier: BossTier;
  /** Step the entry stinger is due on, or null once played. */
  readonly entryStep: number | null;
  /** Bar line the motif joins on. */
  readonly joinStep: number;
  readonly fadeIn: Ramp;
  /** Phase changes in order; phase 1 before the first. */
  readonly phases: readonly PhaseMark[];
  /** Step a phase sting is due on, or null. */
  readonly phaseStingStep: number | null;
  /** Bar of the last phase sting, so one bar holds at most one. */
  readonly phaseStingBar: number;
  /** Step of the down (the first unscheduled step then), or null while the boss lives. */
  readonly downStep: number | null;
  /** Bar line the main line stops on, or null while the boss lives. */
  readonly stopStep: number | null;
  /** Step the defeat stinger is due on, or null. */
  readonly defeatStep: number | null;
  /** Enemy motif gain factor over time. */
  readonly duck: Ramp;
}

/** Pure: the duck at a step (1 with no boss). */
export function duckAt(b: BossLife | null, step: number): number {
  if (b === null) return 1;
  return Math.max(0, Math.min(1, rampAt(b.duck, step)));
}

/** Pure: a boss entered. A duplicate enter of a live boss changes nothing. */
export function bossEnter(prev: BossLife | null, id: BossId, tier: BossTier, now: number): BossLife {
  if (prev !== null && prev.id === id && prev.downStep === null) return prev;
  const from = duckAt(prev, now);
  const join = barLineAfter(now);
  const end = join + BOSS_FADE_BARS * STEPS_PER_BAR;
  // The ramp starts one step before the join, so the downbeat already sounds (at 1/16) and the
  // last step of the first bar is at full.
  return {
    id,
    tier,
    entryStep: now,
    joinStep: join,
    fadeIn: { s0: join - 1, g0: 0, s1: end - 1, g1: 1 },
    phases: [],
    phaseStingStep: null,
    phaseStingBar: -1,
    downStep: null,
    stopStep: null,
    defeatStep: null,
    duck: { s0: join, g0: from, s1: end, g1: BOSS_DUCK },
  };
}

/** Pure: the highest phase booked so far (1 before any change). */
export function bookedPhase(b: BossLife): number {
  return b.phases.length === 0 ? 1 : (b.phases[b.phases.length - 1]?.phase ?? 1);
}

/** Pure: the phase the motif plays at a step. */
export function phaseAt(b: BossLife, step: number): number {
  let p = 1;
  for (const m of b.phases) if (m.from <= step) p = m.phase;
  return p;
}

/** Pure: the boss changed phase. Ignored after the down, for another boss, or for a phase not above the booked one. */
export function bossPhase(b: BossLife, id: BossId, phase: number, now: number): BossLife {
  const ph = Math.trunc(phase);
  if (b.downStep !== null || b.id !== id || !(ph > bookedPhase(b))) return b;
  const from = barLineAfter(now);
  const bar = Math.floor(now / STEPS_PER_BAR);
  // No sting before the motif joins: the entry chord still holds the boss voices then.
  const sting = now >= b.joinStep && b.phaseStingStep === null && b.phaseStingBar !== bar;
  return {
    ...b,
    phases: [...b.phases, { from, phase: ph }],
    phaseStingStep: sting ? now : b.phaseStingStep,
    phaseStingBar: sting ? bar : b.phaseStingBar,
  };
}

/** Pure: the release in steps at a tempo. */
export function releaseSteps(stepSec: number): number {
  return stepSec > 0 ? Math.max(1, Math.round(BOSS_RELEASE_SEC / stepSec)) : STEPS_PER_BAR;
}

/** Pure: the boss died. `release` is releaseSteps at the current tempo. */
export function bossDown(b: BossLife, id: BossId, now: number, release: number): BossLife {
  if (b.downStep !== null || b.id !== id) return b;
  return {
    ...b,
    entryStep: null,
    phaseStingStep: null,
    downStep: now,
    stopStep: barLineAfter(now),
    defeatStep: now,
    duck: { s0: now, g0: duckAt(b, now), s1: now + Math.max(1, release), g1: 1 },
  };
}

/** Pure: true while the intensity floor holds (the boss lives). */
export function floorOn(b: BossLife | null): boolean {
  return b !== null && b.downStep === null;
}

/** Pure: the motif envelope 0 to 1 at a step: 0 before the join and from the stop bar line on. */
export function bossEnvAt(b: BossLife, step: number): number {
  if (step < b.joinStep) return 0;
  if (b.stopStep !== null && step >= b.stopStep) return 0;
  return Math.max(0, Math.min(1, rampAt(b.fadeIn, step)));
}

/** Pure: true when a note of this voice may start at a step (phase voices stop at the down). */
export function voiceMayStart(b: BossLife, voice: number, step: number): boolean {
  if (bossEnvAt(b, step) <= 0) return false;
  return voice === 0 || b.downStep === null || step < b.downStep;
}

/** Pure: a note's length in steps, cut at the stop bar line. */
export function clipToStop(b: BossLife, step: number, durSteps: number): number {
  if (b.stopStep === null) return durSteps;
  return Math.max(0, Math.min(durSteps, b.stopStep - step));
}

/** Pure: the entry stinger's length from a step: to the join bar line, at most ENTRY_STING_STEPS. */
export function entryStingSteps(b: BossLife, step: number): number {
  return Math.max(1, Math.min(ENTRY_STING_STEPS, b.joinStep - step));
}

export interface BossStingTake {
  readonly entry: boolean;
  readonly phase: boolean;
  readonly defeat: boolean;
  readonly life: BossLife;
}

/**
 * Pure: stingers due at a step. Late ones within the stale window still play, older ones drop.
 * `defeatReady` is false while a phase voice note already scheduled still sounds; the defeat
 * stinger waits for it, so the boss never holds more than BOSS_VOICE_MAX voices.
 */
export function takeBossStings(b: BossLife, step: number, defeatReady = true): BossStingTake {
  const due = (s: number | null): boolean => s !== null && step >= s;
  const fresh = (s: number | null): boolean => s !== null && step - s <= STINGER_STALE_STEPS;
  const entry = due(b.entryStep);
  const phase = due(b.phaseStingStep);
  const defeat = due(b.defeatStep) && defeatReady;
  if (!entry && !phase && !defeat) return { entry: false, phase: false, defeat: false, life: b };
  return {
    entry: entry && fresh(b.entryStep),
    phase: phase && fresh(b.phaseStingStep),
    defeat: defeat && fresh(b.defeatStep),
    life: {
      ...b,
      entryStep: entry ? null : b.entryStep,
      phaseStingStep: phase ? null : b.phaseStingStep,
      defeatStep: defeat ? null : b.defeatStep,
    },
  };
}

/** Pure: the factor on every boss voice so the voices of a phase sum to at most BOSS_MOTIF_TOTAL_MAX. */
export function bossMotifScale(gain: number, voices: number): number {
  const raw = gain * Math.max(0, voices);
  return raw > BOSS_MOTIF_TOTAL_MAX ? BOSS_MOTIF_TOTAL_MAX / raw : 1;
}

/** Pure: enemy motif voices allowed: all of them with no boss, ENEMY_MOTIF_SLOTS_WITH_BOSS beside one. */
export function enemyMotifSlots(b: BossLife | null): number {
  return b === null ? MOTIF_VOICE_MAX : ENEMY_MOTIF_SLOTS_WITH_BOSS;
}

/**
 * Pure: the enemy kinds whose motif may sound at a step: the newest `slots` layers whose motif is
 * still active. Older ones give their voice up first, as a steal would take the oldest.
 */
export function allowedEnemyKinds(set: LayerSet, step: number, slots: number): ReadonlySet<EnemyKind> {
  const active = set.filter((l) => motifActive(l, step));
  const keep = active.slice(Math.max(0, active.length - Math.max(0, slots)));
  return new Set(keep.map((l) => l.kind));
}

/** Pure: true once a downed boss has nothing left to play or release. */
export function bossDone(b: BossLife, step: number): boolean {
  if (b.downStep === null || b.stopStep === null) return false;
  if (b.defeatStep !== null && step - b.defeatStep <= STINGER_STALE_STEPS) return false;
  return step >= b.stopStep && step >= b.duck.s1;
}
