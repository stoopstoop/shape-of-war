// Twins (tier 3, red, level 45; docs/12 roster row 9). Two bodies orbit the arena centre on
// opposite sides, 300 to 500 u apart, at 0.6 rad/s, with a lethal tether between them that sweeps
// like a bar. Each body fires a ring every 7 s, offset by 3.5 s (one ring every 3.5 s, alternating),
// its gap facing the ship. When the first body falls the tether breaks and the survivor enrages:
// x1.4 speed and a ring every 4 s. Phase 2 starts then (phaseOf). Both bodies always take damage.
//
// The front body is the Kind.Boss entity and the second is a Kind.BossPart (PartType.Twin, slot 0)
// with its own hit points. The boss entity's w.hp holds both bodies' hit points (the HUD bar and the
// shared phase counter), so the front body's own hit points are w.hp minus the second's. A hit on
// the second body comes off both (onPartDamage); a hit on the front body never takes more than its
// own (clampDamage). If the front body falls first the boss entity moves to the second body's place
// and the part goes, so the survivor is always the boss entity and its death alone ends the fight
// through defeatBoss: one sim:bossDown, one bonus.
// Scratch: angle orbit angle, t0 ring clock, t1 separation clock, t2 1 once a body fell, t3 the
// tether recheck, n0 tether id, n2 the second body's id, dir the body whose ring is next (0 front), 2 once the front body fell first.
import { killShip } from '../player';
import { removeEntity } from '../remove';
import { SHIP_RADIUS } from '../ship';
import { gs } from '../state';
import { angleBetween, distBetween, moveTo, stepToward } from '../steer';
import { Kind, type World } from '../world';
import { bossBurst, crackBody, HAZARD_OVERLAP, livePart, spawnPart, spawnRing, spawnTether } from './core';
import { circlesOverlap, hazardTelegraph, wrapPi } from './kit';
import type { BossState } from './state';
import { HAZARD, HAZARD_RECHECK_SEC, TWINS } from './table';
import { BossMode, HazardType, PartType, type BossDef } from './types';

const DEG = Math.PI / 180;

/** Pure: the distance between the bodies after t seconds, breathing between sepMin and sepMax. */
export function separationAt(t: number): number {
  const mid = (TWINS.sepMin + TWINS.sepMax) / 2;
  const amp = (TWINS.sepMax - TWINS.sepMin) / 2;
  return mid + amp * Math.sin(t * TWINS.sepRate);
}

/** Pure: seconds between rings: one every 3.5 s while both live (each body every 7 s), 4 s enraged. */
export function ringEveryFor(fallen: boolean): number {
  return fallen ? TWINS.ringEveryEnraged : TWINS.ringEvery / 2;
}

/** The second body's id, or -1 once it fell. */
export function secondBody(w: World, bs: BossState): number {
  const b = livePart(w, bs, 0);
  return b > 0 && b === bs.n2 ? b : -1;
}

/** The live tether id, or -1. */
export function liveTether(w: World, bs: BossState): number {
  const id = bs.n0;
  return id > 0 && w.alive[id] === 1 && w.kind[id] === Kind.BossHazard && w.a[id] === HazardType.Tether ? id : -1;
}

function dropTether(w: World, bs: BossState): void {
  const t = liveTether(w, bs);
  if (t > 0) removeEntity(w, t);
  bs.n0 = -1;
}

function syncTether(w: World, id: number, bs: BossState, b: number, dt: number): void {
  if (b < 0 || bs.t2 === 1) {
    dropTether(w, bs);
    return;
  }
  const t = liveTether(w, bs);
  if (t > 0) {
    w.x[t] = w.x[id] ?? 0;
    w.y[t] = w.y[id] ?? 0;
    w.vx[t] = w.x[b] ?? 0;
    w.vy[t] = w.y[b] ?? 0;
    return;
  }
  bs.n0 = -1;
  if (bs.t3 > 0) {
    bs.t3 = bs.t3 - dt > 0 ? bs.t3 - dt : 0;
    return;
  }
  if (distBetween(w, id, b) < TWINS.tetherAt) return;
  const h = spawnTether(w, bs, w.x[id] ?? 0, w.y[id] ?? 0, w.x[b] ?? 0, w.y[b] ?? 0, -1);
  if (h === HAZARD_OVERLAP) bs.t3 = HAZARD_RECHECK_SEC;
  else if (h > 0) bs.n0 = h;
}

function stepRings(w: World, id: number, bs: BossState, b: number, dt: number, adt: number): void {
  if (bs.retry > 0) {
    bs.retry = bs.retry - dt > 0 ? bs.retry - dt : 0;
    return;
  }
  bs.t0 += adt;
  const fallen = bs.t2 === 1;
  const every = ringEveryFor(fallen);
  if (bs.t0 < every) return;
  const src = !fallen && bs.dir === 1 && b > 0 ? b : id;
  const r0 = (w.radius[src] ?? 0) + TWINS.ringStartPad;
  // The gap faces the ship, never the decoy: a ring must always leave the ship a route.
  const h = spawnRing(w, bs, w.x[src] ?? 0, w.y[src] ?? 0, r0, angleBetween(w, src, 0), (TWINS.gapDeg * DEG) / 2, 1, HAZARD.ringGrowth);
  if (h === HAZARD_OVERLAP) {
    bs.retry = HAZARD_RECHECK_SEC;
    return;
  }
  bs.t0 -= every;
  if (bs.t0 < 0) bs.t0 = 0;
  if (!fallen) bs.dir = bs.dir === 0 ? 1 : 0;
}

/** The second body kills the ship on contact once its telegraph has shown (it slides out of the first). */
function secondContact(w: World, bs: BossState, b: number): boolean {
  if (!w.ship.active || w.ship.invuln > 0 || gs(w).invulnerable) return false;
  if ((w.t[b] ?? 0) < hazardTelegraph(bs.row.tier)) return false;
  return circlesOverlap(w.x[0] ?? 0, w.y[0] ?? 0, SHIP_RADIUS, w.x[b] ?? 0, w.y[b] ?? 0, w.radius[b] ?? 0);
}

export function reset(w: World, id: number, bs: BossState, first: boolean): void {
  bs.t0 = ringEveryFor(bs.t2 === 1) - TWINS.firstRing;
  bs.t3 = 0;
  bs.n0 = -1; // the core clears hazards (the tether too) before a restart
  bs.retry = 0;
  if (first) {
    bs.angle = Math.atan2(w.y[id] ?? 0, w.x[id] ?? 0);
    bs.t1 = 0;
    bs.t2 = 0;
    bs.dir = 0;
    const half = Math.floor(bs.maxHp / 2);
    const b = spawnPart(w, bs, 0, PartType.Twin, w.x[id] ?? 0, w.y[id] ?? 0, half, w.radius[id] ?? 0);
    bs.n2 = b;
    if (b > 0) w.rot[b] = wrapPi(bs.angle + Math.PI);
  }
  bs.open = true;
  bs.openLeft = -1;
  bs.mode = BossMode.Attacking;
}

export function step(w: World, id: number, bs: BossState, dt: number, adt: number): void {
  const fallen = bs.t2 === 1;
  const mul = fallen ? TWINS.enrageSpeed : 1;
  bs.angle = wrapPi(bs.angle + TWINS.orbitRate * mul * dt);
  bs.t1 += dt;
  const half = separationAt(bs.t1) / 2;
  const c = Math.cos(bs.angle) * half;
  const s = Math.sin(bs.angle) * half;
  const v = TWINS.slideSpeed * mul * dt;
  stepToward(w, id, c, s, v);
  w.rot[id] = bs.angle;
  const b = secondBody(w, bs);
  if (b > 0) {
    stepToward(w, b, -c, -s, v);
    w.rot[b] = wrapPi(bs.angle + Math.PI);
    if (secondContact(w, bs, b)) {
      killShip(w);
      return;
    }
  }
  syncTether(w, id, bs, b, dt);
  stepRings(w, id, bs, b, dt, adt);
  bs.open = true;
  bs.openLeft = -1;
  bs.mode = BossMode.Attacking;
}

export function onPhase(w: World, id: number, bs: BossState, phase: number): void {
  dropTether(w, bs);
  const every = ringEveryFor(true);
  if (bs.t0 > every) bs.t0 = every;
}

export function phaseOf(w: World, id: number, bs: BossState, hp: number): number {
  return bs.t2 === 1 ? 2 : 1;
}

/** A hit on the front body never takes more than its own hit points while the second lives. */
export function clampDamage(w: World, id: number, bs: BossState, amount: number): number {
  const b = secondBody(w, bs);
  if (b < 0) return amount;
  const own = (w.hp[id] ?? 0) - (w.hp[b] ?? 0);
  return amount < own ? amount : own > 0 ? own : 0;
}

/** The front body fell first: the boss entity takes the second body's place and the part goes. */
export function afterDamage(w: World, id: number, bs: BossState): void {
  const b = secondBody(w, bs);
  if (b < 0 || (w.hp[id] ?? 0) - (w.hp[b] ?? 0) > 0) return;
  bossBurst(w, bs, w.x[id] ?? 0, w.y[id] ?? 0, id);
  const bx = w.x[b] ?? 0;
  const by = w.y[b] ?? 0;
  removeEntity(w, b);
  bs.parts[0] = -1;
  bs.n2 = -1;
  bs.t2 = 1;
  bs.dir = 2; // the boss entity is now the second body (cracks read its slot)
  moveTo(w, id, bx, by);
  w.prevX[id] = w.x[id] ?? bx;
  w.prevY[id] = w.y[id] ?? by;
}

/** A hit on the second body comes off the shared pool too; its death is the first fall. */
export function onPartDamage(w: World, bs: BossState, part: number, applied: number, broke: boolean): void {
  if (part !== bs.n2) return;
  const boss = bs.id;
  if (boss > 0 && applied > 0) {
    const left = (w.hp[boss] ?? 0) - applied;
    w.hp[boss] = left > 1 ? left : 1;
  }
  if (broke) {
    bs.n2 = -1;
    bs.t2 = 1;
  }
}

export function entryHome(d: number): number {
  return d < TWINS.entryHome ? d : TWINS.entryHome;
}

/**
 * Cracks per body: crack slot 0 is the front body (its own hit points of maxHp less half), slot 1
 * the second body (half). After a fall the survivor is the boss entity: slot 1 when dir is 2.
 */
export function cracks(w: World, id: number, bs: BossState): void {
  const half = Math.floor(bs.maxHp / 2);
  const b = secondBody(w, bs);
  const hp = w.hp[id] ?? 0;
  if (b > 0) {
    const hb = w.hp[b] ?? 0;
    crackBody(bs, 0, hp - hb, bs.maxHp - half, w.x[id] ?? 0, w.y[id] ?? 0);
    crackBody(bs, 1, hb, half, w.x[b] ?? 0, w.y[b] ?? 0);
    return;
  }
  if (bs.t2 !== 1) return;
  const slot = bs.dir === 2 ? 1 : 0;
  crackBody(bs, slot, hp, slot === 1 ? half : bs.maxHp - half, w.x[id] ?? 0, w.y[id] ?? 0);
}

export const def: BossDef = { reset, step, onPhase, entryHome, phaseOf, clampDamage, afterDamage, onPartDamage, cracks };
