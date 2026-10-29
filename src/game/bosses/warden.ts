// Warden (tier 1, blue, level 5; docs/12 roster row 1). Seeks its target at 55 u/s, turning at
// most 60 deg/s. Every 4.5 s it fires a ring with a 70 deg gap facing the ship. A shell blocks every
// shot except for 2 s after each ring launches (its telegraph ends), when the core opens. Phase 2
// (below 50 percent): a ring every 3.5 s with two gaps, the second opposite the first.
// Scratch: t0 ring clock, t1 seconds until the launched ring opens the core (-1 idle), t2 open
// seconds left, retry the fairness recheck.
import { angleBetween, distBetween, moveHeading, targetOf, turnToward } from '../steer';
import type { World } from '../world';
import { HAZARD_OVERLAP, spawnRing } from './core';
import { hazardTelegraph } from './kit';
import type { BossState } from './state';
import { HAZARD, HAZARD_RECHECK_SEC, WARDEN } from './table';
import { BossMode, type BossDef } from './types';

const DEG = Math.PI / 180;

/** Pure: seconds between rings in a phase. */
export function ringEvery(phase: number): number {
  return phase >= 2 ? WARDEN.ringEveryP2 : WARDEN.ringEvery;
}

/** Pure: gaps per ring in a phase. */
export function ringGaps(phase: number): number {
  return phase >= 2 ? WARDEN.gapsP2 : 1;
}

export function reset(w: World, id: number, bs: BossState, first: boolean): void {
  bs.t0 = WARDEN.ringEvery - WARDEN.firstRing;
  bs.t1 = -1;
  bs.t2 = 0;
  bs.retry = 0;
  bs.open = false;
  bs.openLeft = -1;
  bs.mode = BossMode.Guarded;
}

function fireRing(w: World, id: number, bs: BossState, every: number): void {
  // The gap faces the ship, never the decoy: a hazard must always leave the ship a route.
  const h = spawnRing(
    w,
    bs,
    w.x[id] ?? 0,
    w.y[id] ?? 0,
    (w.radius[id] ?? 0) + WARDEN.ringStartPad,
    angleBetween(w, id, 0),
    (WARDEN.gapDeg * DEG) / 2,
    ringGaps(bs.phase),
    HAZARD.ringGrowth,
  );
  if (h === HAZARD_OVERLAP) {
    bs.retry = HAZARD_RECHECK_SEC;
    return;
  }
  bs.t0 -= every;
  if (bs.t0 < 0) bs.t0 = 0;
  if (h > 0) bs.t1 = hazardTelegraph(bs.row.tier);
}

export function step(w: World, id: number, bs: BossState, dt: number, adt: number): void {
  const target = targetOf(w, id);
  const rot = turnToward(w.rot[id] ?? 0, angleBetween(w, id, target), WARDEN.turnRate * dt);
  w.rot[id] = rot;
  if (distBetween(w, id, target) > 1) moveHeading(w, id, rot, WARDEN.seekSpeed, dt);

  if (bs.t2 > 0) bs.t2 = bs.t2 - dt > 0 ? bs.t2 - dt : 0;
  if (bs.t1 >= 0) {
    bs.t1 -= adt;
    if (bs.t1 < 0) {
      bs.t1 = -1;
      bs.t2 = WARDEN.openSec;
    }
  }
  if (bs.retry > 0) {
    bs.retry = bs.retry - dt > 0 ? bs.retry - dt : 0;
  } else {
    bs.t0 += adt;
    const every = ringEvery(bs.phase);
    if (bs.t0 >= every) fireRing(w, id, bs, every);
  }
  bs.open = bs.t2 > 0;
  bs.openLeft = bs.open ? bs.t2 : -1;
  bs.mode = bs.open ? BossMode.Vulnerable : BossMode.Guarded;
}

export function onPhase(w: World, id: number, bs: BossState, phase: number): void {
  // The next ring uses the phase 2 interval and gaps; keep the clock where it is.
}

export function entryHome(d: number): number {
  return d * WARDEN.entryHome;
}

export const def: BossDef = { reset, step, onPhase, entryHome };
