// Brood (tier 1, green, level 10; docs/12 roster row 2, reworked at G3A). It hunts: it prowls
// toward the ship at 75 u/s (turn limited), then winds up for the tier telegraph (1.0 s) with a
// lane marker along its locked heading, then charges across the arena at 320 u/s until a wall or
// 1.8 s stops it, rests 0.6 s and prowls again. Contact with the body kills. Three pods
// (Kind.BossPart, 1 HP each) orbit it at 90 u and shield it: it is immune while any pod lives.
// Kill all three and the core is open for openSec (5 s), flagged exposed for Glow and Chorus; while
// open it flees from the ship and never charges. The pods regrow 9 s after the last died. Every 6 s
// it launches three Darts from the side facing the ship (four every 5 s in phase 2, below 50
// percent), at most 8 live adds, through the normal spawn path.
// Scratch: t0 add clock, t1 open seconds left, t2 regrow countdown, n1 0 shielded or 1 broken,
// angle pod orbit angle, n0 move state, t3 move state clock, dir locked charge heading, n2 marker id.
import * as dart from '../enemies/dart';
import { angleBetween, distBetween, moveHeading, moveTo, moveToHit, targetOf, turnToward } from '../steer';
import { Kind, type World } from '../world';
import { countParts, livePart, spawnAdd, spawnLaneMarker, spawnPart } from './core';
import { hazardTelegraph, wrapPi } from './kit';
import type { BossState } from './state';
import { BROOD } from './table';
import { BossMode, PartType, type BossDef } from './types';
import { removeEntity } from '../remove';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
/** The marker ends just before the wind up does (markerLife); inside this tail its absence is expected. */
const MARKER_GRACE = 0.05;
/** Rear flank directions relative to the heading, used when the ship is too near for a front launch. */
const FLANKS = [Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI * 0.75];

/** Move states (BossState.n0). */
export const enum BroodMove {
  Prowl = 0,
  Windup = 1,
  Charge = 2,
  Recover = 3,
}

/** Pure: the core is open (the counter window). */
export function isOpen(broken: number, openLeft: number): boolean {
  return broken === 1 && openLeft > 0;
}

/** Pure: prowl seconds before a wind up in a phase. */
export function prowlSecFor(phase: number): number {
  return phase >= 2 ? BROOD.prowlSecP2 : BROOD.prowlSec;
}

/** Pure: charge speed in a phase, u/s. */
export function chargeSpeedFor(phase: number): number {
  return phase >= 2 ? BROOD.chargeSpeedP2 : BROOD.chargeSpeed;
}

/** Pure: seconds between add waves in a phase. */
export function addEveryFor(phase: number): number {
  return phase >= 2 ? BROOD.addEveryP2 : BROOD.addEvery;
}

/** Pure: adds per wave in a phase. */
export function addsPerWaveFor(phase: number): number {
  return phase >= 2 ? BROOD.addsPerWaveP2 : BROOD.addsPerWave;
}

/** Pure: launch angle of add k of n, fanned around the heading toward the ship. */
export function addAngle(toShip: number, k: number, n: number): number {
  return toShip + (k - (n - 1) / 2) * BROOD.addSpreadDeg * DEG;
}

function podAngle(bs: BossState, slot: number): number {
  return bs.angle + (slot * TAU) / BROOD.podCount;
}

function spawnPods(w: World, id: number, bs: BossState): number {
  let n = 0;
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  for (let k = 0; k < BROOD.podCount; k++) {
    const a = podAngle(bs, k);
    const p = spawnPart(w, bs, k, PartType.Pod, x + Math.cos(a) * BROOD.podOrbit, y + Math.sin(a) * BROOD.podOrbit, BROOD.podHp, BROOD.podRadius);
    if (p > 0) {
      w.rot[p] = a;
      n++;
    }
  }
  return n;
}

function placePods(w: World, id: number, bs: BossState): void {
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  for (let k = 0; k < BROOD.podCount; k++) {
    const p = livePart(w, bs, k);
    if (p < 0) continue;
    const a = podAngle(bs, k);
    moveTo(w, p, x + Math.cos(a) * BROOD.podOrbit, y + Math.sin(a) * BROOD.podOrbit);
    w.rot[p] = a;
  }
}

function summon(w: World, id: number, bs: BossState): void {
  const def = dart.def;
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  const n = addsPerWaveFor(bs.phase);
  const d = (w.radius[id] ?? 0) + BROOD.addPad + def.radius;
  const target = targetOf(w, id);
  const front = distBetween(w, id, target) >= BROOD.addFrontMinDist;
  const toShip = angleBetween(w, id, target);
  const rot = w.rot[id] ?? 0;
  for (let k = 0; k < n; k++) {
    const a = front ? addAngle(toShip, k, n) : rot + (FLANKS[k % FLANKS.length] ?? 0);
    spawnAdd(w, bs, def, x + Math.cos(a) * d, y + Math.sin(a) * d); // a Dart homes on the ship from its first step
  }
}

/** True while the charge marker of the current wind up lives. */
function markerLive(w: World, bs: BossState): boolean {
  const m = bs.n2;
  return m > 0 && w.alive[m] === 1 && w.kind[m] === Kind.BossHazard && bs.hzMarker[m] === 1;
}

/** Remove the charge marker if it still lives. */
function dropMarker(w: World, bs: BossState): void {
  if (markerLive(w, bs)) removeEntity(w, bs.n2);
  bs.n2 = -1;
}

function setMove(bs: BossState, state: BroodMove, t: number): void {
  bs.n0 = state;
  bs.t3 = t;
}

function startWindup(w: World, id: number, bs: BossState): void {
  const heading = angleBetween(w, id, targetOf(w, id));
  bs.dir = heading;
  w.rot[id] = heading;
  const length = chargeSpeedFor(bs.phase) * BROOD.chargeSec + (w.radius[id] ?? 0);
  dropMarker(w, bs);
  bs.n2 = spawnLaneMarker(w, bs, w.x[id] ?? 0, w.y[id] ?? 0, heading, length, BROOD.markerHalfWidth);
  setMove(bs, BroodMove.Windup, hazardTelegraph(bs.row.tier));
}

/** Seek the target (flee false) or run from it (flee true), turn limited. */
function prowl(w: World, id: number, speed: number, dt: number, flee: boolean): void {
  const target = targetOf(w, id);
  const toward = angleBetween(w, id, target);
  const rot = turnToward(w.rot[id] ?? 0, flee ? wrapPi(toward + Math.PI) : toward, BROOD.turnRate * dt);
  w.rot[id] = rot;
  if (flee || distBetween(w, id, target) > 1) moveHeading(w, id, rot, speed, dt);
}

/** Movement state machine for one step. open: the core is exposed (no new charges). */
function move(w: World, id: number, bs: BossState, dt: number, adt: number, open: boolean): void {
  const p2 = bs.phase >= 2;
  switch (bs.n0) {
    case BroodMove.Windup:
      if (open) {
        // The pods broke during the wind up: the window wins, the charge is called off.
        dropMarker(w, bs);
        setMove(bs, BroodMove.Prowl, prowlSecFor(bs.phase));
        return;
      }
      if (bs.t3 > MARKER_GRACE && !markerLive(w, bs)) {
        // A bomb or a phase change pause outlasted the marker: wind up again with a fresh one,
        // so a charge never starts without its full telegraph showing.
        startWindup(w, id, bs);
        return;
      }
      bs.t3 -= dt; // the telegraph is never shortened by enrage (fairness rule 5)
      if (bs.t3 <= 0) {
        dropMarker(w, bs);
        setMove(bs, BroodMove.Charge, BROOD.chargeSec);
      }
      return;
    case BroodMove.Charge: {
      const sp = chargeSpeedFor(bs.phase);
      const x = (w.x[id] ?? 0) + Math.cos(bs.dir) * sp * dt;
      const y = (w.y[id] ?? 0) + Math.sin(bs.dir) * sp * dt;
      const hit = moveToHit(w, id, x, y);
      w.rot[id] = bs.dir;
      bs.t3 -= dt;
      if (hit || bs.t3 <= 0) setMove(bs, BroodMove.Recover, BROOD.recoverSec);
      return;
    }
    case BroodMove.Recover:
      bs.t3 -= adt;
      if (bs.t3 <= 0) setMove(bs, BroodMove.Prowl, prowlSecFor(bs.phase));
      return;
    default:
      prowl(w, id, open ? BROOD.exposedSpeed : p2 ? BROOD.prowlSpeedP2 : BROOD.prowlSpeed, dt, open);
      if (open) return; // the prowl clock waits while the core is open
      bs.t3 -= adt;
      if (bs.t3 <= 0) startWindup(w, id, bs);
  }
}

export function reset(w: World, id: number, bs: BossState, first: boolean): void {
  bs.t0 = BROOD.addEvery - BROOD.firstAdds;
  bs.retry = 0;
  bs.n2 = -1; // hazards (the marker too) are cleared by the core before a restart
  w.rot[id] = angleBetween(w, id, targetOf(w, id));
  setMove(bs, BroodMove.Prowl, BROOD.firstCharge);
  if (first) {
    bs.angle = 0;
    bs.n1 = 0;
    bs.t1 = 0;
    bs.t2 = 0;
    spawnPods(w, id, bs);
  }
  setWindow(bs);
}

function setWindow(bs: BossState): void {
  bs.open = isOpen(bs.n1, bs.t1);
  bs.openLeft = bs.open ? bs.t1 : -1;
  if (bs.open) bs.mode = BossMode.Vulnerable;
  else if (bs.n0 === BroodMove.Windup || bs.n0 === BroodMove.Charge) bs.mode = BossMode.Attacking;
  else bs.mode = BossMode.Guarded;
}

export function step(w: World, id: number, bs: BossState, dt: number, adt: number): void {
  move(w, id, bs, dt, adt, isOpen(bs.n1, bs.t1));
  bs.angle = wrapPi(bs.angle + BROOD.podSpin * dt);
  placePods(w, id, bs);
  if (bs.n1 === 0 && countParts(w, bs) === 0) {
    bs.n1 = 1;
    bs.t1 = BROOD.openSec;
    bs.t2 = BROOD.regrowSec;
  }
  if (bs.n1 === 1) {
    if (bs.t1 > 0) bs.t1 = bs.t1 - dt > 0 ? bs.t1 - dt : 0;
    bs.t2 -= dt;
    if (bs.t2 <= 0) {
      bs.t2 = 0;
      if (spawnPods(w, id, bs) > 0) {
        bs.n1 = 0;
        bs.t1 = 0;
      }
    }
  }
  bs.t0 += adt;
  const every = addEveryFor(bs.phase);
  if (bs.t0 >= every) {
    bs.t0 -= every;
    summon(w, id, bs);
  }
  setWindow(bs);
}

export function onPhase(w: World, id: number, bs: BossState, phase: number): void {
  // Phase 2 reads bs.phase: faster prowl and charge, shorter prowl, four Darts every 5 s.
}

export function entryHome(d: number): number {
  return d - BROOD.entrySlide;
}

export const def: BossDef = { reset, step, onPhase, entryHome };
