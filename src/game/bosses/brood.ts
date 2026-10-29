// Brood (tier 1, green, level 10; docs/12 roster row 2). Hugs the arena boundary clockwise at
// 50 u/s. Three pods (Kind.BossPart, 1 HP each) orbit it at 90 u and shield it: it is immune while
// any pod lives. Kill all three and the core is open for 5 s, then closes; the pods regrow 10 s
// after the last one died. Every 6 s it summons three Grunts from its flanks (Darts in phase 2,
// below 50 percent), at most 8 live adds, through the normal spawn path.
// Scratch: t0 add clock, t1 open seconds left, t2 regrow countdown, n1 0 shielded or 1 broken,
// angle pod orbit angle.
import * as dart from '../enemies/dart';
import * as grunt from '../enemies/grunt';
import { moveTo } from '../steer';
import type { World } from '../world';
import { countParts, livePart, spawnAdd, spawnPart } from './core';
import { wrapPi } from './kit';
import type { BossState } from './state';
import { BROOD } from './table';
import { BossMode, PartType, type BossDef } from './types';

const TAU = Math.PI * 2;
/** Flank directions relative to the heading: left, right, behind. */
const FLANKS = [Math.PI / 2, -Math.PI / 2, Math.PI];

/** Pure: the core is open (the counter window). */
export function isOpen(broken: number, openLeft: number): boolean {
  return broken === 1 && openLeft > 0;
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

/** Clockwise along the boundary: tangent plus an equal outward push, slid along the wall by confine. */
function hug(w: World, id: number, dt: number): void {
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  const a = Math.atan2(y, x);
  const tx = -Math.sin(a);
  const ty = Math.cos(a);
  const s = BROOD.speed * dt;
  moveTo(w, id, x + (tx + Math.cos(a)) * s, y + (ty + Math.sin(a)) * s);
  w.rot[id] = Math.atan2(ty, tx);
}

function summon(w: World, id: number, bs: BossState): void {
  const def = bs.phase >= 2 ? dart.def : grunt.def;
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  const rot = w.rot[id] ?? 0;
  const d = (w.radius[id] ?? 0) + BROOD.addPad + def.radius;
  for (let k = 0; k < BROOD.addsPerWave; k++) {
    const a = rot + (FLANKS[k % FLANKS.length] ?? 0);
    spawnAdd(w, bs, def, x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
}

export function reset(w: World, id: number, bs: BossState, first: boolean): void {
  bs.t0 = BROOD.addEvery - BROOD.firstAdds;
  bs.retry = 0;
  if (first) {
    bs.angle = 0;
    bs.n1 = 0;
    bs.t1 = 0;
    bs.t2 = 0;
    spawnPods(w, id, bs);
  }
  bs.open = isOpen(bs.n1, bs.t1);
  bs.mode = bs.open ? BossMode.Vulnerable : BossMode.Guarded;
}

export function step(w: World, id: number, bs: BossState, dt: number, adt: number): void {
  hug(w, id, dt);
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
  if (bs.t0 >= BROOD.addEvery) {
    bs.t0 -= BROOD.addEvery;
    summon(w, id, bs);
  }
  bs.open = isOpen(bs.n1, bs.t1);
  bs.mode = bs.open ? BossMode.Vulnerable : BossMode.Guarded;
}

export function onPhase(w: World, id: number, bs: BossState, phase: number): void {
  // Phase 2 changes the add kind only; summon reads bs.phase.
}

export function entryHome(d: number): number {
  return d - BROOD.entrySlide;
}

export const def: BossDef = { reset, step, onPhase, entryHome };
