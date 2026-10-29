// Mirage (tier 2, magenta, level 25; docs/12 roster row 5). Every 3.0 s (2.5 s in phase 2, 2.0 s
// in phase 3) it warps to a point 200 to 300 u from its target. A ring marks the landing point
// 0.5 s early (a marker: telegraph only, never lethal). On landing eight lanes radiate from it,
// set 22.5 deg off the ship's bearing so the ship starts midway between two (0.8 s telegraph, then
// 0.3 s lethal). A landing waits 0.3 s and picks again while the ship is on the spot. Its shield
// ring blocks every shot except through a 70 deg open arc centred on w.rot, turning at 1.5 rad/s
// (the gate below). Scratch: t0 warp clock, t1 and t2 landing point, t3 marker countdown, n0
// marker id, n1 warp counter (hash index), n2 0 idle, 1 marked, 2 lanes waiting, angle arc centre,
// retry the lane recheck.
import { isInside } from '../arena';
import { removeEntity } from '../remove';
import { SHIP_RADIUS } from '../ship';
import { angleBetween, entityHash, inFrontArc, moveTo, targetOf } from '../steer';
import { Kind, type World } from '../world';
import { spawnLane, spawnRingMarker } from './core';
import { hazardHits, pointDist, wrapPi } from './kit';
import type { BossState } from './state';
import { HAZARD_RECHECK_SEC, MIRAGE } from './table';
import { BossMode, HazardType, type BossDef } from './types';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** Warp states (BossState.n2). */
export const enum MirageWarp {
  Idle = 0,
  Marked = 1,
  Lanes = 2,
}

/** Pure: seconds between warps in a phase. */
export function warpEveryFor(phase: number): number {
  if (phase >= 3) return MIRAGE.warpEveryP3;
  if (phase === 2) return MIRAGE.warpEveryP2;
  return MIRAGE.warpEvery;
}

/** Pure: half of the open arc, radians. */
export function arcHalf(): number {
  return (MIRAGE.arcDeg * DEG) / 2;
}

/** Pure: true when a hit at (hx, hy) on a body at (x, y) whose arc centre is rot gets through. */
export function throughArc(x: number, y: number, rot: number, hx: number, hy: number): boolean {
  return inFrontArc(x, y, rot, hx, hy, arcHalf());
}

/** Pure: the first lane's angle for a burst, given the bearing from the boss to the ship. */
export function laneStart(toShip: number): number {
  return wrapPi(toShip + MIRAGE.laneOffsetDeg * DEG);
}

/**
 * Pure: candidate landing point k of a warp around a target at (tx, ty), written into out.
 * h1 and h2 in [0, 1) choose the bearing and the distance (200 to 300 u).
 */
export function warpCandidate(tx: number, ty: number, h1: number, h2: number, k: number, out: { x: number; y: number }): void {
  const a = h1 * TAU + (k * TAU) / MIRAGE.warpTries;
  const d = MIRAGE.warpMin + (MIRAGE.warpMax - MIRAGE.warpMin) * h2;
  out.x = tx + Math.cos(a) * d;
  out.y = ty + Math.sin(a) * d;
}

const cand = { x: 0, y: 0 };
/** The marker ends with its countdown; inside this tail its absence is expected. */
const MARKER_GRACE = 0.05;

function markerLive(w: World, bs: BossState): boolean {
  const m = bs.n0;
  return m > 0 && w.alive[m] === 1 && w.kind[m] === Kind.BossHazard && bs.hzMarker[m] === 1;
}

function dropMarker(w: World, bs: BossState): void {
  if (markerLive(w, bs)) removeEntity(w, bs.n0);
  bs.n0 = -1;
}

/** Pick a landing point inside the arena and mark it. False when none fits (try again later). */
function mark(w: World, id: number, bs: BossState): boolean {
  const t = targetOf(w, id);
  const tx = w.x[t] ?? 0;
  const ty = w.y[t] ?? 0;
  const r = w.radius[id] ?? 0;
  const n = bs.n1;
  bs.n1 = n + 1;
  const h1 = entityHash(w, id, n * 2);
  const h2 = entityHash(w, id, n * 2 + 1);
  for (let k = 0; k < MIRAGE.warpTries; k++) {
    warpCandidate(tx, ty, h1, h2, k, cand);
    if (!isInside(w.level.arena, cand.x, cand.y, r)) continue;
    const m = spawnRingMarker(w, bs, cand.x, cand.y, r, MIRAGE.markSec);
    if (m < 0) return false; // hazard cap: never warp unmarked
    bs.t1 = cand.x;
    bs.t2 = cand.y;
    bs.n0 = m;
    bs.t3 = MIRAGE.markSec;
    bs.n2 = MirageWarp.Marked;
    return true;
  }
  return false;
}

/** True when the ship (never the decoy) is clear of the landing spot. */
function spotClear(w: World, bs: BossState, r: number): boolean {
  if (!w.ship.active) return true;
  return pointDist(w.x[0] ?? 0, w.y[0] ?? 0, bs.t1, bs.t2) > r + SHIP_RADIUS + MIRAGE.landPad;
}

/** Fire the eight lane burst, or wait 0.3 s when any lane would cover the ship now. */
function burst(w: World, id: number, bs: BossState): void {
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  const a0 = laneStart(angleBetween(w, id, 0)); // lanes are aimed by the ship, never the decoy
  const n = MIRAGE.lanes;
  if (w.ship.active) {
    for (let k = 0; k < n; k++) {
      const a = a0 + (k * TAU) / n;
      if (hazardHits(HazardType.Lane, w.x[0] ?? 0, w.y[0] ?? 0, SHIP_RADIUS, x, y, a, MIRAGE.laneHalfWidth, MIRAGE.laneLength, 0)) {
        bs.retry = HAZARD_RECHECK_SEC;
        bs.n2 = MirageWarp.Lanes;
        return;
      }
    }
  }
  for (let k = 0; k < n; k++) spawnLane(w, bs, x, y, wrapPi(a0 + (k * TAU) / n), MIRAGE.laneLength, MIRAGE.laneHalfWidth);
  bs.n2 = MirageWarp.Idle;
}

export function reset(w: World, id: number, bs: BossState, first: boolean): void {
  if (first) {
    bs.angle = w.rot[id] ?? 0;
    bs.n1 = 0;
  }
  bs.n0 = -1; // the core clears hazards (the marker too) before a restart
  bs.n2 = MirageWarp.Idle;
  bs.t0 = warpEveryFor(bs.phase) - MIRAGE.markSec - MIRAGE.firstWarp;
  bs.t3 = 0;
  bs.retry = 0;
  bs.open = true;
  bs.openLeft = -1;
  bs.mode = BossMode.Attacking;
}

export function step(w: World, id: number, bs: BossState, dt: number, adt: number): void {
  bs.angle = wrapPi(bs.angle + MIRAGE.arcRate * dt);
  w.rot[id] = bs.angle;
  bs.open = true;
  bs.openLeft = -1;
  bs.mode = BossMode.Attacking;
  const every = warpEveryFor(bs.phase);
  if (bs.n2 === MirageWarp.Lanes) {
    bs.retry = bs.retry - dt > 0 ? bs.retry - dt : 0;
    if (bs.retry <= 0) burst(w, id, bs);
    return;
  }
  if (bs.n2 === MirageWarp.Marked) {
    if (bs.t3 > MARKER_GRACE && !markerLive(w, bs)) {
      // A bomb or a phase change pause removed the marker: show it again for the full warning.
      const m = spawnRingMarker(w, bs, bs.t1, bs.t2, w.radius[id] ?? 0, MIRAGE.markSec);
      if (m < 0) return;
      bs.n0 = m;
      bs.t3 = MIRAGE.markSec;
    }
    bs.t3 -= dt; // the landing warning is never shortened by enrage
    if (bs.t3 > 0) return;
    dropMarker(w, bs);
    const r = w.radius[id] ?? 0;
    if (!spotClear(w, bs, r)) {
      // The ship is on the spot: wait 0.3 s, then pick and mark a fresh one.
      bs.n2 = MirageWarp.Idle;
      bs.t0 = every - MIRAGE.markSec - HAZARD_RECHECK_SEC;
      return;
    }
    moveTo(w, id, bs.t1, bs.t2);
    bs.t0 = 0;
    burst(w, id, bs);
    return;
  }
  bs.t0 += adt;
  if (bs.t0 < every - MIRAGE.markSec) return;
  if (!mark(w, id, bs)) bs.t0 = every - MIRAGE.markSec - HAZARD_RECHECK_SEC;
}

export function onPhase(w: World, id: number, bs: BossState, phase: number): void {
  // The warp interval reads bs.phase from the next warp on.
}

/** Shield arc: a hit counts only through the open arc. */
export function gate(w: World, id: number, bs: BossState, hx: number, hy: number): boolean {
  return throughArc(w.x[id] ?? 0, w.y[id] ?? 0, w.rot[id] ?? 0, hx, hy);
}

export function entryHome(d: number): number {
  return d * MIRAGE.entryHome;
}

export const def: BossDef = { reset, step, onPhase, entryHome, gate };
