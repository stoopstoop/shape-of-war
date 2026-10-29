// Spindle (tier 1, yellow, level 15; docs/12 roster row 3). Circles the arena centre at radius
// 200 u, 0.4 rad/s. Two sweep arms of 380 u turn at the shot row's rate (0.4 rad/s, the pellet
// trade; 0.5 without it), reversing every 5 s. Each reversal is a fresh sweep, so its 1.0 s
// telegraph (arms frozen, thin and dim) shows the change before the arms move again. Always
// hittable; the arms leave 180 deg gaps. Phase 2 (below 50 percent): three arms (120 deg gaps).
// The pellet is wave B. Scratch: angle orbit phase, t0 reversal clock, t1 arm angle, dir arm
// direction (+1 or -1), n0 live sweep id, n1 rebuild flag, retry the fairness recheck.
import { angleBetween, stepToward } from '../steer';
import { Kind, type World } from '../world';
import { HAZARD_OVERLAP, spawnSweep } from './core';
import { wrapPi } from './kit';
import type { BossState } from './state';
import { HAZARD_RECHECK_SEC, SPINDLE, spindleArmRate } from './table';
import { BossMode, HazardType, type BossDef } from './types';
import { removeEntity } from '../remove';

/** Pure: arm count in a phase. */
export function armsFor(phase: number): number {
  return phase >= 2 ? SPINDLE.armsP2 : SPINDLE.arms;
}

/** The live sweep id, or -1. */
export function liveSweep(w: World, bs: BossState): number {
  const id = bs.n0;
  return id > 0 && w.alive[id] === 1 && w.kind[id] === Kind.BossHazard && w.a[id] === HazardType.Sweep ? id : -1;
}

export function reset(w: World, id: number, bs: BossState, first: boolean): void {
  bs.angle = Math.atan2(w.y[id] ?? 0, w.x[id] ?? 0);
  if (first) {
    bs.dir = 1;
    // Start the arms square to the ship so the first sweep is never created on it.
    bs.t1 = wrapPi(angleBetween(w, id, 0) + Math.PI / 2);
  }
  bs.n0 = -1;
  bs.n1 = 0;
  bs.t0 = 0;
  bs.retry = 0;
  bs.open = true;
  bs.mode = BossMode.Attacking;
}

export function step(w: World, id: number, bs: BossState, dt: number, adt: number): void {
  bs.angle = wrapPi(bs.angle + SPINDLE.orbitRate * dt);
  stepToward(w, id, Math.cos(bs.angle) * SPINDLE.orbitRadius, Math.sin(bs.angle) * SPINDLE.orbitRadius, SPINDLE.approachSpeed * dt);
  w.rot[id] = wrapPi(bs.angle + Math.PI / 2);
  bs.open = true;
  bs.mode = BossMode.Attacking;

  const old = liveSweep(w, bs);
  if (old > 0) bs.t1 = w.rot[old] ?? bs.t1;
  if (bs.retry > 0) {
    bs.retry = bs.retry - dt > 0 ? bs.retry - dt : 0;
    return;
  }
  bs.t0 += adt;
  const reverse = bs.t0 >= SPINDLE.reverseEvery;
  if (old > 0 && !reverse && bs.n1 === 0) return;
  const dir = reverse && old > 0 ? -bs.dir : bs.dir;
  const enrage = dt > 0 ? adt / dt : 1;
  const h = spawnSweep(w, bs, w.x[id] ?? 0, w.y[id] ?? 0, bs.t1, armsFor(bs.phase), SPINDLE.armLength, dir * spindleArmRate() * enrage, true);
  if (h === HAZARD_OVERLAP) {
    bs.retry = HAZARD_RECHECK_SEC;
    return;
  }
  if (reverse) bs.t0 -= SPINDLE.reverseEvery;
  if (h < 0) return; // hazard cap or a full world: keep the old arms, try at the next reversal
  if (old > 0) removeEntity(w, old);
  bs.n0 = h;
  bs.dir = dir;
  bs.n1 = 0;
}

export function onPhase(w: World, id: number, bs: BossState, phase: number): void {
  bs.n1 = 1; // rebuild the sweep with the phase 2 arm count, same direction
}

export function entryHome(d: number): number {
  return Math.min(d, SPINDLE.orbitRadius);
}

export const def: BossDef = { reset, step, onPhase, entryHome };
