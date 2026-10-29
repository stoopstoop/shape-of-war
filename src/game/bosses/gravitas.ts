// Gravitas (tier 2, violet, level 30; docs/12 roster row 6). Seeks its target at 45 u/s with a
// pull around it (radius 300 u, up to 100 u/s, through the well pull channel). Three anchors
// (Kind.BossPart, 6 HP each) orbit it at 140 u: it takes no damage until all three are gone, and
// each lost anchor weakens the pull by a third (none left, no pull). Every 5 s (4 s in phase 2,
// 3 s in phase 3) a ring collapses onto it from 480 u with a 60 deg gap facing the ship. Anchors
// do not regrow and survive a ship death. Scratch: t0 ring clock, angle anchor orbit, n0 pull id,
// retry the ring recheck.
import { angleBetween, distBetween, moveHeading, moveTo, targetOf } from '../steer';
import { Kind, type World } from '../world';
import { countParts, HAZARD_OVERLAP, livePart, setPullStrength, spawnPart, spawnPull, spawnRing } from './core';
import type { BossState } from './state';
import { GRAVITAS, HAZARD_RECHECK_SEC } from './table';
import { BossMode, HazardType, PartType, type BossDef } from './types';
import { removeEntity } from '../remove';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** Pure: seconds between collapsing rings in a phase. */
export function ringEveryFor(phase: number): number {
  if (phase >= 3) return GRAVITAS.ringEveryP3;
  if (phase === 2) return GRAVITAS.ringEveryP2;
  return GRAVITAS.ringEvery;
}

/** Pure: pull strength (u/s at the centre) with anchors left of the full set: a third less per lost one. */
export function pullFor(anchors: number): number {
  const n = anchors < 0 ? 0 : anchors > GRAVITAS.anchors ? GRAVITAS.anchors : anchors;
  return (GRAVITAS.pullMax * n) / GRAVITAS.anchors;
}

/** Pure: the core takes damage only once every anchor is gone. */
export function isOpen(anchors: number): boolean {
  return anchors <= 0;
}

/** The live pull id, or -1. */
export function livePull(w: World, bs: BossState): number {
  const id = bs.n0;
  return id > 0 && w.alive[id] === 1 && w.kind[id] === Kind.BossHazard && w.a[id] === HazardType.Pull ? id : -1;
}

function anchorAngle(bs: BossState, slot: number): number {
  return bs.angle + (slot * TAU) / GRAVITAS.anchors;
}

function spawnAnchors(w: World, id: number, bs: BossState): void {
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  for (let k = 0; k < GRAVITAS.anchors; k++) {
    const a = anchorAngle(bs, k);
    const p = spawnPart(w, bs, k, PartType.Anchor, x + Math.cos(a) * GRAVITAS.anchorOrbit, y + Math.sin(a) * GRAVITAS.anchorOrbit, GRAVITAS.anchorHp, GRAVITAS.anchorRadius);
    if (p > 0) w.rot[p] = a;
  }
}

function placeAnchors(w: World, id: number, bs: BossState): void {
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  for (let k = 0; k < GRAVITAS.anchors; k++) {
    const p = livePart(w, bs, k);
    if (p < 0) continue;
    const a = anchorAngle(bs, k);
    moveTo(w, p, x + Math.cos(a) * GRAVITAS.anchorOrbit, y + Math.sin(a) * GRAVITAS.anchorOrbit);
    w.rot[p] = a;
  }
}

/** Keep the pull matched to the anchors: weaker per lost anchor, removed with none left. */
function syncPull(w: World, id: number, bs: BossState, anchors: number): void {
  const p = livePull(w, bs);
  const s = pullFor(anchors);
  if (s <= 0) {
    if (p > 0) removeEntity(w, p);
    bs.n0 = -1;
    return;
  }
  if (p > 0) {
    setPullStrength(w, bs, p, s);
    return;
  }
  bs.n0 = spawnPull(w, bs, w.x[id] ?? 0, w.y[id] ?? 0, GRAVITAS.pullRadius, -1, true, s);
}

function fireRing(w: World, id: number, bs: BossState, every: number): void {
  // The gap faces the ship, never the decoy: a ring must always leave the ship a route.
  const h = spawnRing(w, bs, w.x[id] ?? 0, w.y[id] ?? 0, GRAVITAS.ringStart, angleBetween(w, id, 0), (GRAVITAS.gapDeg * DEG) / 2, 1, -GRAVITAS.ringCollapse);
  if (h === HAZARD_OVERLAP) {
    bs.retry = HAZARD_RECHECK_SEC;
    return;
  }
  bs.t0 -= every;
  if (bs.t0 < 0) bs.t0 = 0;
}

function setWindow(bs: BossState, anchors: number): void {
  bs.open = isOpen(anchors);
  bs.openLeft = -1;
  bs.mode = bs.open ? BossMode.Vulnerable : BossMode.Guarded;
}

export function reset(w: World, id: number, bs: BossState, first: boolean): void {
  bs.t0 = GRAVITAS.ringEvery - GRAVITAS.firstRing;
  bs.retry = 0;
  bs.n0 = -1; // the core clears hazards (the pull too) before a restart
  if (first) {
    bs.angle = 0;
    spawnAnchors(w, id, bs);
  }
  // The pull comes back on the first step, which runs only while the ship is active (boss rule 6).
  setWindow(bs, countParts(w, bs));
}

export function step(w: World, id: number, bs: BossState, dt: number, adt: number): void {
  const target = targetOf(w, id);
  const heading = angleBetween(w, id, target);
  w.rot[id] = heading;
  if (distBetween(w, id, target) > 1) moveHeading(w, id, heading, GRAVITAS.seekSpeed, dt);
  bs.angle = (bs.angle + GRAVITAS.anchorSpin * dt) % TAU;
  placeAnchors(w, id, bs);
  const n = countParts(w, bs);
  syncPull(w, id, bs, n);
  if (bs.retry > 0) {
    bs.retry = bs.retry - dt > 0 ? bs.retry - dt : 0;
  } else {
    bs.t0 += adt;
    const every = ringEveryFor(bs.phase);
    if (bs.t0 >= every) fireRing(w, id, bs, every);
  }
  setWindow(bs, n);
}

export function onPhase(w: World, id: number, bs: BossState, phase: number): void {
  // The ring interval reads bs.phase; keep the clock where it is.
}

export function entryHome(d: number): number {
  return d * GRAVITAS.entryHome;
}

export const def: BossDef = { reset, step, onPhase, entryHome };
