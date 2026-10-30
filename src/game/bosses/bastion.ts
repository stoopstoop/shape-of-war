// Bastion (tier 3, red, level 35; docs/12 roster row 7). Holds the arena centre and turns at
// 0.3 rad/s. Four corner turrets (Kind.BossPart, 8 HP each) sit on the diagonals of its facing and
// take one turn every 1.5 s in order (attack clock, so enrage shortens it); a destroyed turret skips
// its turns, so the total turn rate never changes. A turn fires a lane straight out from the turret.
// The core takes damage only once two turrets are down. Phases follow the turrets (phaseOf): four,
// two, none. Every 12 s a Bulwark joins on the side facing the target. The core never fires.
// Scratch: t0 turn clock, t1 add clock, n0 the turret whose turn is next, retry the lane recheck.
import * as bulwark from '../enemies/bulwark';
import { angleBetween, moveTo, targetOf } from '../steer';
import type { World } from '../world';
import { countParts, HAZARD_OVERLAP, livePart, spawnAdd, spawnLane, spawnPart } from './core';
import { wrapPi } from './kit';
import type { BossState } from './state';
import { BASTION, HAZARD_RECHECK_SEC } from './table';
import { BossMode, PartType, type BossDef } from './types';

const QUARTER = Math.PI / 2;

/** Pure: the phase for live turrets: 1 with three or four, 2 with one or two, 3 with none. */
export function phaseForTurrets(turrets: number): number {
  if (turrets > BASTION.openAtTurrets) return 1;
  return turrets > 0 ? 2 : 3;
}

/** Pure: the core takes damage once two turrets are down. */
export function isOpen(turrets: number): boolean {
  return turrets <= BASTION.openAtTurrets;
}

/** Pure: the outward angle of turret slot k for a core facing rot. */
export function turretAngle(rot: number, k: number): number {
  return wrapPi(rot + QUARTER / 2 + k * QUARTER);
}

function placeTurrets(w: World, id: number, bs: BossState, spawnNew: boolean): void {
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  const rot = w.rot[id] ?? 0;
  for (let k = 0; k < BASTION.turrets; k++) {
    const a = turretAngle(rot, k);
    const tx = x + Math.cos(a) * BASTION.turretOffset;
    const ty = y + Math.sin(a) * BASTION.turretOffset;
    let p = livePart(w, bs, k);
    if (p < 0 && spawnNew) p = spawnPart(w, bs, k, PartType.Turret, tx, ty, BASTION.turretHp, BASTION.turretRadius);
    if (p < 0) continue;
    moveTo(w, p, tx, ty);
    w.rot[p] = a;
  }
}

function setWindow(bs: BossState, turrets: number): void {
  bs.open = isOpen(turrets);
  bs.openLeft = -1;
  bs.mode = bs.open ? BossMode.Vulnerable : BossMode.Guarded;
}

/**
 * Turret p's action on its turn. True once done (or dropped at the hazard cap); false when it must
 * wait and recheck (the lane would cover the ship now).
 */
function fireTurret(w: World, bs: BossState, p: number): boolean {
  const a = w.rot[p] ?? 0;
  const x = (w.x[p] ?? 0) + Math.cos(a) * BASTION.turretRadius;
  const y = (w.y[p] ?? 0) + Math.sin(a) * BASTION.turretRadius;
  if (spawnLane(w, bs, x, y, a, BASTION.laneLength, BASTION.laneHalfWidth) === HAZARD_OVERLAP) {
    bs.retry = HAZARD_RECHECK_SEC;
    return false;
  }
  return true;
}

/** One turn every turnEvery seconds, the turrets in order; a destroyed turret's turn passes silently. */
function stepTurns(w: World, bs: BossState, dt: number, adt: number): void {
  if (bs.retry > 0) {
    bs.retry = bs.retry - dt > 0 ? bs.retry - dt : 0;
    if (bs.retry > 0) return;
  } else if (bs.shotWait > 0) {
    bs.shotWait = bs.shotWait - dt > 0 ? bs.shotWait - dt : 0;
    if (bs.shotWait > 0) return;
  } else {
    bs.t0 += adt;
    if (bs.t0 < BASTION.turnEvery) return;
  }
  const k = bs.n0;
  const p = livePart(w, bs, k);
  if (p > 0 && !fireTurret(w, bs, p)) return;
  bs.n0 = (k + 1) % BASTION.turrets;
  bs.t0 -= BASTION.turnEvery;
  if (bs.t0 < 0) bs.t0 = 0;
}

function summon(w: World, id: number, bs: BossState): void {
  const a = angleBetween(w, id, targetOf(w, id));
  const d = (w.radius[id] ?? 0) + BASTION.addPad + bulwark.def.radius;
  spawnAdd(w, bs, bulwark.def, (w.x[id] ?? 0) + Math.cos(a) * d, (w.y[id] ?? 0) + Math.sin(a) * d);
}

export function reset(w: World, id: number, bs: BossState, first: boolean): void {
  bs.t0 = BASTION.turnEvery - BASTION.firstTurn;
  bs.n0 = 0;
  bs.retry = 0;
  bs.shotT = 0;
  bs.shotWait = 0;
  if (first) {
    bs.t1 = 0;
    bs.n1 = 0;
    placeTurrets(w, id, bs, true);
  }
  setWindow(bs, countParts(w, bs));
}

export function step(w: World, id: number, bs: BossState, dt: number, adt: number): void {
  w.rot[id] = wrapPi((w.rot[id] ?? 0) + BASTION.turnRate * dt);
  placeTurrets(w, id, bs, false);
  const n = countParts(w, bs);
  setWindow(bs, n);
  if (n > 0) stepTurns(w, bs, dt, adt);
  bs.t1 += adt;
  if (bs.t1 >= BASTION.addEvery) {
    bs.t1 -= BASTION.addEvery;
    summon(w, id, bs);
  }
}

export function onPhase(w: World, id: number, bs: BossState, phase: number): void {
  // Phases read the turrets; the turn clock keeps running.
}

export function phaseOf(w: World, id: number, bs: BossState, hp: number): number {
  return phaseForTurrets(countParts(w, bs));
}

export function entryHome(d: number): number {
  return 0;
}

export const def: BossDef = { reset, step, onPhase, entryHome, phaseOf };
