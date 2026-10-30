// Tempest (tier 3, red, level 40; docs/12 roster row 8). Laps the arena wall at 140 u/s with its
// centre 90 u from the wall, dropping a Slime every 1.0 s along its path (8 of its own live at most,
// inside the 12 total Slime cap). Every 6 s on the lap (5 s, 4 s in phases 2 and 3; attack clock)
// it stops, shows a lane marker toward its target for the tier telegraph, dashes along it to the far
// wall and rests there 1.5 s. Hittable on the lap and in the rest, closed in the wind up and dash.
// A bomb clears the Slime trail (player.ts removes every Slime). Scratch: n0 move state, t3 its
// timer, t0 dash clock, t1 Slime clock, angle lap angle, dir lap direction, t2 dash heading, n2
// the marker id.
import { isInside } from '../arena';
import * as slime from '../enemies/slime';
import { removeEntity } from '../remove';
import { spawnFromDef } from '../state';
import { angleBetween, moveToHit, stepToward, targetOf } from '../steer';
import { Kind, type World } from '../world';
import { spawnLaneMarker, wallDistance } from './core';
import { hazardTelegraph, wrapPi } from './kit';
import type { BossState } from './state';
import { BOSS_TABLE, TEMPEST } from './table';
import { BossMode, type BossDef } from './types';

export const enum TempestMove {
  Lap = 0,
  Windup = 1,
  Dash = 2,
  Rest = 3,
}

/** Pure: seconds of lap between dashes in a phase. */
export function dashEveryFor(phase: number): number {
  if (phase >= 3) return TEMPEST.dashEveryP3;
  if (phase === 2) return TEMPEST.dashEveryP2;
  return TEMPEST.dashEvery;
}

/** Distance from the centre of the lap point at angle a: the centre keeps wallGap from every wall. */
export function lapRadius(w: World, a: number): number {
  return wallDistance(w, a, TEMPEST.wallGap);
}

/** Distance from (x, y) along heading a to where a body of radius r meets the wall. */
export function rayToWall(w: World, x: number, y: number, a: number, r: number): number {
  const arena = w.level.arena;
  const c = Math.cos(a);
  const s = Math.sin(a);
  let lo = 0;
  let hi = Math.hypot(arena.width, arena.height);
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (isInside(arena, x + c * mid, y + s * mid, r)) lo = mid;
    else hi = mid;
  }
  return lo;
}

const counts = { total: 0, owned: 0 };

/** Drop a Slime owned by the boss at its position, inside its own cap and the total cap. */
export function dropTrail(w: World, id: number): number {
  slime.countSlime(w, id, counts);
  if (counts.total >= slime.CAP_TOTAL || counts.owned >= TEMPEST.slimeMax) return -1;
  const s = spawnFromDef(w, slime.def, w.x[id] ?? 0, w.y[id] ?? 0, 0);
  if (s < 0) return -1;
  w.a[s] = id;
  return s;
}

function dropMarker(w: World, bs: BossState): void {
  const m = bs.n2;
  if (m > 0 && w.alive[m] === 1 && w.kind[m] === Kind.BossHazard && bs.hzMarker[m] === 1) removeEntity(w, m);
  bs.n2 = -1;
}

function setMove(bs: BossState, state: TempestMove, t: number): void {
  bs.n0 = state;
  bs.t3 = t;
  const open = state === TempestMove.Lap || state === TempestMove.Rest;
  bs.open = open;
  bs.openLeft = state === TempestMove.Rest ? t : -1;
  bs.mode = state === TempestMove.Rest ? BossMode.Vulnerable : BossMode.Attacking;
}

function lap(w: World, id: number, bs: BossState, dt: number, adt: number): void {
  // Advance the lap angle so the lap point moves lapSpeed * dt along the path (one secant correction,
  // so the corners of a rect floor are not taken faster).
  const v = TEMPEST.lapSpeed * dt;
  const a0 = bs.angle;
  const r0 = lapRadius(w, a0);
  let da = (bs.dir * v) / (r0 > 60 ? r0 : 60);
  const r1 = lapRadius(w, a0 + da);
  const d = Math.hypot(Math.cos(a0 + da) * r1 - Math.cos(a0) * r0, Math.sin(a0 + da) * r1 - Math.sin(a0) * r0);
  if (d > 1e-6) da *= v / d;
  bs.angle = wrapPi(a0 + da);
  const rr = lapRadius(w, bs.angle);
  stepToward(w, id, Math.cos(bs.angle) * rr, Math.sin(bs.angle) * rr, TEMPEST.lapSpeed * TEMPEST.catchUp * dt);
  w.rot[id] = wrapPi(bs.angle + (bs.dir * Math.PI) / 2);
  bs.t0 += adt;
  if (bs.t0 < dashEveryFor(bs.phase)) return;
  bs.t0 = 0;
  const heading = angleBetween(w, id, targetOf(w, id)); // locked at the wind up start
  bs.t2 = heading;
  w.rot[id] = heading;
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  bs.n2 = spawnLaneMarker(w, bs, x, y, heading, rayToWall(w, x, y, heading, w.radius[id] ?? 0), TEMPEST.markerHalfWidth);
  setMove(bs, TempestMove.Windup, hazardTelegraph(bs.row.tier));
}

export function reset(w: World, id: number, bs: BossState, first: boolean): void {
  bs.angle = Math.atan2(w.y[id] ?? 0, w.x[id] ?? 0);
  if (first) bs.dir = 1;
  bs.t0 = TEMPEST.dashEvery - TEMPEST.firstDash;
  bs.t1 = 0;
  bs.t2 = 0;
  bs.n2 = -1; // the core clears hazards (the marker too) before a restart
  bs.retry = 0;
  setMove(bs, TempestMove.Lap, 0);
}

export function step(w: World, id: number, bs: BossState, dt: number, adt: number): void {
  const state = bs.n0 as TempestMove;
  if (state !== TempestMove.Rest && state !== TempestMove.Windup) {
    bs.t1 += adt;
    if (bs.t1 >= TEMPEST.slimeEvery) {
      bs.t1 -= TEMPEST.slimeEvery;
      dropTrail(w, id);
    }
  }
  if (state === TempestMove.Lap) {
    lap(w, id, bs, dt, adt);
    return;
  }
  bs.t3 -= dt; // sim time: enrage never shortens the telegraph or the rest
  if (state === TempestMove.Windup) {
    if (bs.t3 > 0) return;
    dropMarker(w, bs);
    setMove(bs, TempestMove.Dash, TEMPEST.dashSecMax);
    return;
  }
  if (state === TempestMove.Dash) {
    const v = TEMPEST.dashSpeed * dt;
    const hit = moveToHit(w, id, (w.x[id] ?? 0) + Math.cos(bs.t2) * v, (w.y[id] ?? 0) + Math.sin(bs.t2) * v);
    if (hit || bs.t3 <= 0) setMove(bs, TempestMove.Rest, TEMPEST.restSec);
    return;
  }
  // Rest at the far wall: the counter window. Then back to the lap from where it stands.
  bs.openLeft = bs.t3 > 0 ? bs.t3 : 0;
  if (bs.t3 > 0) return;
  bs.angle = Math.atan2(w.y[id] ?? 0, w.x[id] ?? 0);
  setMove(bs, TempestMove.Lap, 0);
}

export function onPhase(w: World, id: number, bs: BossState, phase: number): void {
  // The dash interval reads bs.phase; a wind up or dash under way finishes.
}

export function entryHome(d: number): number {
  const home = d - (TEMPEST.wallGap - BOSS_TABLE.tempest.radius);
  return home > 0 ? home : 0;
}

export const def: BossDef = { reset, step, onPhase, entryHome };
