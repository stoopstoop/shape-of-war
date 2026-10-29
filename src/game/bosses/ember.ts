// Ember (tier 2, orange, level 20; docs/12 roster row 4). The body is the weapon. Cycle: wind up
// 0.9 s turning toward its target, the heading locks when the lane marker shows (the last 0.8 s,
// the tier telegraph, never shortened), then a 0.6 s dash at 760 u/s that drops a Mine every 120 u
// (the Mine rules and caps: 6 per owner, 24 in total) and bounces off up to two walls. A dash that
// touched a wall ends in a 2 s stun (a third wall stuns at once); a dash that ends in open floor
// ends in a 1.2 s rest. It is hittable only stunned or resting. Each phase is 15 percent faster:
// dash speed times 1.15^(phase - 1), wind up, dash and rest times divided by it (the wind up never
// under the telegraph). Fan (BOSS_SHOTS.ember, docs/13 boss projectiles): after a dash that ends
// in open floor the rest grows to 1.8 s and three bullets 14 deg apart, the middle one at its
// target, charge from the rest start and launch 0.8 s in. The fan waits and rechecks every 0.3 s
// while the ship is within 300 u of the muzzle, and is skipped if it could no longer launch inside
// the rest. A wall hit stuns with no fan. Scratch: n0 move state, t3 state seconds left, dir dash
// heading, n1 bounces used, t1 1 when this dash touched a wall, t0 dash distance since the last
// Mine, n2 marker id, t2 1 while this rest still owes its fan, shotWait the fan recheck.
import { confine, createConfineResult } from '../arena';
import { dropMine } from '../enemies/mine';
import { removeEntity } from '../remove';
import { angleBetween, targetOf, turnToward } from '../steer';
import { Kind, type World } from '../world';
import { spawnLaneMarker } from './core';
import { hazardTelegraph, phaseSpeedUp, reflectHeading } from './kit';
import { fireVolley } from './shots';
import type { BossState } from './state';
import { BOSS_SHOTS, EMBER, emberFanRest, SHOT_RECHECK_SEC } from './table';
import { BossMode, type BossDef } from './types';

/** Move states (BossState.n0). */
export const enum EmberMove {
  Windup = 0,
  Dash = 1,
  Rest = 2,
  Stun = 3,
}

/** The marker ends just before its telegraph does; inside this tail its absence is expected. */
const MARKER_GRACE = 0.05;
const res = createConfineResult();

/** Pure: the phase speed factor (1, 1.15, 1.3225). */
export function speedFor(phase: number): number {
  return phaseSpeedUp(EMBER.speedUp, phase);
}

/** Pure: wind up seconds in a phase, never under the tier telegraph. */
export function windupFor(phase: number, tier: number): number {
  const t = EMBER.windupSec / speedFor(phase);
  const tele = hazardTelegraph(tier);
  return t > tele ? t : tele;
}

/** Pure: dash speed in a phase, u/s. */
export function dashSpeedFor(phase: number): number {
  return EMBER.dashSpeed * speedFor(phase);
}

/** Pure: dash seconds in a phase (the dash length stays 456 u). */
export function dashSecFor(phase: number): number {
  return EMBER.dashSec / speedFor(phase);
}

/** Pure: rest seconds in a phase, for a rest of base seconds. */
export function restFor(phase: number, base: number): number {
  return base / speedFor(phase);
}

/** Pure: the counter window, open only stunned or resting. */
export function isOpen(state: number): boolean {
  return state === EmberMove.Rest || state === EmberMove.Stun;
}

function markerLive(w: World, bs: BossState): boolean {
  const m = bs.n2;
  return m > 0 && w.alive[m] === 1 && w.kind[m] === Kind.BossHazard && bs.hzMarker[m] === 1;
}

function dropMarker(w: World, bs: BossState): void {
  if (markerLive(w, bs)) removeEntity(w, bs.n2);
  bs.n2 = -1;
}

function setMove(bs: BossState, state: EmberMove, t: number): void {
  bs.n0 = state;
  bs.t3 = t;
}

/** Lock the heading on the target and show the marker. False when no marker could be placed. */
function lockOn(w: World, id: number, bs: BossState): boolean {
  const heading = angleBetween(w, id, targetOf(w, id));
  const length = dashSpeedFor(bs.phase) * dashSecFor(bs.phase) + (w.radius[id] ?? 0);
  const m = spawnLaneMarker(w, bs, w.x[id] ?? 0, w.y[id] ?? 0, heading, length, EMBER.markerHalfWidth);
  if (m < 0) return false;
  bs.n2 = m;
  bs.dir = heading;
  w.rot[id] = heading;
  return true;
}

function startWindup(bs: BossState, extra: number): void {
  bs.n2 = -1;
  setMove(bs, EmberMove.Windup, extra + windupFor(bs.phase, bs.row.tier));
}

/** Called when a dash ends. wall: the dash touched a wall (stun, no fan); else rest, with the fan if its row exists. */
function endDash(w: World, id: number, bs: BossState, wall: boolean): void {
  bs.shotWait = 0;
  if (wall) {
    bs.t2 = 0;
    setMove(bs, EmberMove.Stun, EMBER.stunSec);
    return;
  }
  const fan = BOSS_SHOTS.ember !== undefined;
  bs.t2 = fan ? 1 : 0;
  setMove(bs, EmberMove.Rest, restFor(bs.phase, fan ? emberFanRest() : EMBER.restSec));
}

/** The fan owed by this rest: fire it once the ship is out of range, while it can still launch inside the rest. */
function stepFan(w: World, id: number, bs: BossState, dt: number, adt: number): void {
  if (bs.t2 !== 1) return;
  const row = BOSS_SHOTS.ember;
  if (row === undefined) {
    bs.t2 = 0;
    return;
  }
  if (bs.shotWait > 0) {
    bs.shotWait = bs.shotWait - dt > 0 ? bs.shotWait - dt : 0;
    if (bs.shotWait > 0) return;
  }
  const rate = dt > 0 ? adt / dt : 1;
  if (bs.t3 / rate < hazardTelegraph(bs.row.tier)) {
    bs.t2 = 0; // too late to launch inside the rest: no fan this time
    return;
  }
  if (!fireVolley(w, id, bs, row, speedFor(bs.phase))) {
    bs.shotWait = SHOT_RECHECK_SEC;
    return;
  }
  bs.t2 = 0;
}

function windup(w: World, id: number, bs: BossState, dt: number, adt: number): void {
  const tele = hazardTelegraph(bs.row.tier);
  if (bs.n2 < 0) {
    const rot = turnToward(w.rot[id] ?? 0, angleBetween(w, id, targetOf(w, id)), EMBER.turnRate * dt);
    w.rot[id] = rot;
    bs.t3 -= adt;
    if (bs.t3 > tele) return;
    bs.t3 = tele;
    if (!lockOn(w, id, bs)) return; // hazard cap: hold, the dash never starts without its telegraph
  } else if (bs.t3 > MARKER_GRACE && !markerLive(w, bs)) {
    // A bomb or a phase change pause outlasted the marker: lock again with a fresh one.
    bs.n2 = -1;
    bs.t3 = tele;
    if (!lockOn(w, id, bs)) return;
  }
  bs.t3 -= dt; // the telegraph is never shortened by enrage (fairness rule 5)
  if (bs.t3 > 0) return;
  dropMarker(w, bs);
  bs.n1 = 0;
  bs.t1 = 0;
  bs.t0 = 0;
  setMove(bs, EmberMove.Dash, dashSecFor(bs.phase));
}

function dash(w: World, id: number, bs: BossState, dt: number): void {
  const step = dashSpeedFor(bs.phase) * dt;
  const r = confine(w.level.arena, (w.x[id] ?? 0) + Math.cos(bs.dir) * step, (w.y[id] ?? 0) + Math.sin(bs.dir) * step, w.radius[id] ?? 0, res);
  w.x[id] = r.x;
  w.y[id] = r.y;
  w.rot[id] = bs.dir;
  bs.t0 += step;
  while (bs.t0 >= EMBER.mineEvery) {
    bs.t0 -= EMBER.mineEvery;
    dropMine(w, id, w.x[id] ?? 0, w.y[id] ?? 0); // -1 at a Mine cap: skipped
  }
  if (r.hit) {
    bs.t1 = 1;
    bs.n1++;
    if (bs.n1 > EMBER.bounces) {
      endDash(w, id, bs, true);
      return;
    }
    bs.dir = reflectHeading(bs.dir, r.nx, r.ny);
  }
  bs.t3 -= dt;
  if (bs.t3 <= 0) endDash(w, id, bs, bs.t1 === 1);
}

function setWindow(bs: BossState): void {
  bs.open = isOpen(bs.n0);
  bs.openLeft = bs.open ? (bs.t3 > 0 ? bs.t3 : 0) : -1;
  bs.mode = bs.n0 === EmberMove.Stun ? BossMode.Stunned : bs.n0 === EmberMove.Rest ? BossMode.Vulnerable : BossMode.Attacking;
}

export function reset(w: World, id: number, bs: BossState, first: boolean): void {
  bs.retry = 0;
  bs.n1 = 0;
  bs.t1 = 0;
  bs.t0 = 0;
  bs.t2 = 0;
  bs.shotWait = 0;
  bs.dir = w.rot[id] ?? 0;
  startWindup(bs, first ? EMBER.firstDash : 0);
  setWindow(bs);
}

export function step(w: World, id: number, bs: BossState, dt: number, adt: number): void {
  const prev = bs.n0;
  switch (bs.n0) {
    case EmberMove.Windup:
      windup(w, id, bs, dt, adt);
      break;
    case EmberMove.Dash:
      dash(w, id, bs, dt);
      break;
    case EmberMove.Stun:
      bs.t3 -= dt;
      if (bs.t3 <= 0) startWindup(bs, 0);
      break;
    default:
      stepFan(w, id, bs, dt, adt);
      bs.t3 -= adt;
      if (bs.t3 <= 0) startWindup(bs, 0);
  }
  // The fan charges from the start of the rest: the step the dash ends in open floor.
  if (prev === EmberMove.Dash && bs.n0 === EmberMove.Rest) stepFan(w, id, bs, dt, adt);
  setWindow(bs);
}

export function onPhase(w: World, id: number, bs: BossState, phase: number): void {
  // Speeds and timings read bs.phase from the next state on.
}

export function entryHome(d: number): number {
  return d * EMBER.entryHome;
}

export const def: BossDef = { reset, step, onPhase, entryHome };
