// Prism (tier 4, multicolour, level 50; roster row 10). Drifts between four points on the arena
// diagonals at 90 u/s and quotes the others by phase, with its own timings (PRISM in table.ts):
//   1 a ring with a gap facing the target every 3.5 s, and three orbiting pods (2 HP each),
//   2 two sweep arms riding the body, and a dash lane at the target every 2.5 s,
//   3 a pull riding the body, and a warp every 3.5 s: a ring marker on the next drift point, the
//     body lands there and four lanes burst from it, 45 deg off the target's bearing,
//   4 four turret nodes (6 HP) taking one lane turn each in order every 1.0 s, and a tether from
//     the body to the arena centre.
// Phases at 75, 50 and 25 percent hit points (phaseFor). Damage cycle on sim time, 4 s: 2.3 s colour
// (mode Guarded), 0.5 s run to white (mode Attacking, modeT is the run), 1.2 s window (mode
// Vulnerable, exposed, openLeft). Full damage in the window, 25 percent outside it (leak, with a
// carry so the average is exact). Prism never spawns adds or another boss, holds at most 6 hazards
// (PRISM.maxHazards) and at most 4 parts. No PRNG: every choice reads the target and the clock.
// Cut 7: with BOSS_TABLE.prism.phases set to 2, phase 2 plays the phase 4 kit (kitFor).
// Scratch: t0 attack clock, t1 cycle clock, t2 warp mark or turret turn clock, t3 leak carry,
// n0 persistent hazard id (sweep, pull or tether), n1 drift point index, dir next turret slot,
// angle pod orbit angle, retry the recheck, homeX and homeY the drift target.
import { removeEntity } from '../remove';
import { angleBetween, moveTo, targetOf } from '../steer';
import { Kind, type World } from '../world';
import {
  countHazards,
  HAZARD_OVERLAP,
  livePart,
  spawnLane,
  spawnPart,
  spawnPull,
  spawnRing,
  spawnRingMarker,
  spawnSweep,
  spawnTether,
  wallDistance,
} from './core';
import { circlesOverlap, wrapPi } from './kit';
import type { BossState } from './state';
import { HAZARD_RECHECK_SEC, MAX_PARTS, PRISM } from './table';
import { BossMode, HazardType, PartType, type BossDef } from './types';

const DEG = Math.PI / 180;
const QUARTER = Math.PI / 2;
const TAU = Math.PI * 2;
/** Damage cycle length, s. */
export const PRISM_CYCLE = PRISM.colourSec + PRISM.whiteSec + PRISM.windowSec;

/** Cycle stage: colour, run to white, window. */
export const enum PrismStage {
  Colour = 0,
  White = 1,
  Window = 2,
}

/** Pure: t wrapped into [0, PRISM_CYCLE). */
export function cycleT(t: number): number {
  const u = t % PRISM_CYCLE;
  return u < 0 ? u + PRISM_CYCLE : u;
}

/** Pure: the cycle stage at cycle clock t (seconds, any value; wraps every 4 s). */
export function stageAt(t: number): PrismStage {
  const u = cycleT(t);
  if (u < PRISM.colourSec) return PrismStage.Colour;
  if (u < PRISM.colourSec + PRISM.whiteSec) return PrismStage.White;
  return PrismStage.Window;
}

/** Pure: the damage multiplier at cycle clock t: 1 in the window, PRISM.leak outside it. */
export function damageMul(t: number): number {
  return stageAt(t) === PrismStage.Window ? 1 : PRISM.leak;
}

/** Pure: the time weighted mean damage multiplier over one cycle (0.475). */
export function averageMul(): number {
  return (PRISM.windowSec + PRISM.leak * (PRISM_CYCLE - PRISM.windowSec)) / PRISM_CYCLE;
}

/** Pure: seconds to deplete hp spread hits at hitsPerSec with every shot landing, at the mean multiplier. */
export function fightSeconds(hp: number, hitsPerSec: number): number {
  return hp / (hitsPerSec * averageMul());
}

/** Pure: the phase kit (1 to 4) for phase of phases. With two phases (cut 7) phase 2 is kit 4. */
export function kitFor(phase: number, phases: number): number {
  if (phases <= 2) return phase >= 2 ? 4 : 1;
  return phase < 1 ? 1 : phase > 4 ? 4 : phase;
}

/** Pure: the angle of drift point k (0 to 3), on the diagonals, clockwise from the top left. */
export function pointAngle(k: number): number {
  return -3 * (Math.PI / 4) + (((k % 4) + 4) % 4) * QUARTER;
}

function setPoint(w: World, bs: BossState, k: number): void {
  const a = pointAngle(k);
  const d = wallDistance(w, a, bs.row.radius) * PRISM.pointShare;
  bs.homeX = Math.cos(a) * d;
  bs.homeY = Math.sin(a) * d;
}

/** Set the window, mode and openLeft from the cycle clock. */
function applyCycle(bs: BossState): void {
  const st = stageAt(bs.t1);
  bs.open = st === PrismStage.Window;
  bs.openLeft = bs.open ? PRISM_CYCLE - cycleT(bs.t1) : -1;
  bs.mode = st === PrismStage.Window ? BossMode.Vulnerable : st === PrismStage.White ? BossMode.Attacking : BossMode.Guarded;
}

function drift(w: World, id: number, bs: BossState, dt: number): void {
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  const dx = bs.homeX - x;
  const dy = bs.homeY - y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const step = PRISM.driftSpeed * dt;
  if (d <= step || d <= PRISM.arriveDist) {
    moveTo(w, id, bs.homeX, bs.homeY);
    bs.n1 = (bs.n1 + 1) % 4;
    setPoint(w, bs, bs.n1);
    return;
  }
  moveTo(w, id, x + (dx / d) * step, y + (dy / d) * step);
}

function roomForHazard(w: World): boolean {
  return countHazards(w) < PRISM.maxHazards;
}

/** A spawn result: true when it went (or was dropped at a cap), false after an overlap (recheck). */
function landed(bs: BossState, r: number): boolean {
  if (r === HAZARD_OVERLAP) {
    bs.retry = HAZARD_RECHECK_SEC;
    return false;
  }
  return true;
}

function persistentAlive(w: World, bs: BossState, type: HazardType): boolean {
  const h = bs.n0;
  return h > 0 && w.alive[h] === 1 && w.kind[h] === Kind.BossHazard && w.a[h] === type;
}

/** Keep the phase's persistent hazard alive (it returns after a bomb), with the recheck. */
function ensurePersistent(w: World, id: number, bs: BossState, type: HazardType): void {
  if (persistentAlive(w, bs, type) || bs.retry > 0 || !roomForHazard(w)) return;
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  let r = -1;
  if (type === HazardType.Sweep) r = spawnSweep(w, bs, x, y, w.rot[id] ?? 0, PRISM.sweepArms, PRISM.sweepLength, PRISM.sweepRate, true);
  else if (type === HazardType.Pull) r = spawnPull(w, bs, x, y, PRISM.pullRadius, -1, true, PRISM.pullStrength);
  else if (type === HazardType.Tether) r = spawnTether(w, bs, x, y, 0, 0, -1);
  if (landed(bs, r) && r > 0) bs.n0 = r;
}

function clearParts(w: World, bs: BossState): void {
  for (let k = 0; k < MAX_PARTS; k++) {
    const p = livePart(w, bs, k);
    if (p > 0) removeEntity(w, p);
    bs.parts[k] = -1;
  }
}

/** Place pods (kit 1) or turrets (kit 4) around the body; spawnNew fills empty slots. */
function placeParts(w: World, id: number, bs: BossState, kit: number, spawnNew: boolean): void {
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  const pods = kit === 1;
  const n = pods ? PRISM.pods : PRISM.turrets;
  const off = pods ? PRISM.podOrbit : PRISM.turretOffset;
  for (let k = 0; k < n; k++) {
    const a = pods ? wrapPi(bs.angle + (k * TAU) / n) : wrapPi((w.rot[id] ?? 0) + QUARTER / 2 + k * QUARTER);
    const px = x + Math.cos(a) * off;
    const py = y + Math.sin(a) * off;
    let p = livePart(w, bs, k);
    if (p < 0 && spawnNew) {
      p = pods
        ? spawnPart(w, bs, k, PartType.Pod, px, py, PRISM.podHp, PRISM.podRadius)
        : spawnPart(w, bs, k, PartType.Turret, px, py, PRISM.turretHp, PRISM.turretRadius);
    }
    if (p < 0) continue;
    moveTo(w, p, px, py);
    w.rot[p] = a;
  }
}

function targetAngle(w: World, id: number): number {
  return angleBetween(w, id, targetOf(w, id));
}

/** Kit 1: a ring with its gap facing the target. */
function fireRing(w: World, id: number, bs: BossState): boolean {
  if (!roomForHazard(w)) return true;
  const r0 = (w.radius[id] ?? 0) + PRISM.ringStartPad;
  return landed(bs, spawnRing(w, bs, w.x[id] ?? 0, w.y[id] ?? 0, r0, targetAngle(w, id), (PRISM.gapDeg * DEG) / 2, 1, PRISM.ringGrowth));
}

/** Kit 2: a dash lane from the body edge at the target. */
function fireDashLane(w: World, id: number, bs: BossState): boolean {
  if (!roomForHazard(w)) return true;
  const a = targetAngle(w, id);
  const r = w.radius[id] ?? 0;
  return landed(bs, spawnLane(w, bs, (w.x[id] ?? 0) + Math.cos(a) * r, (w.y[id] ?? 0) + Math.sin(a) * r, a, PRISM.laneLength, PRISM.laneHalfWidth));
}

/** Kit 3: lanes radiate from the body, offset from the target's bearing. A lane on the ship is skipped. */
function burst(w: World, id: number, bs: BossState): void {
  const base = targetAngle(w, id) + PRISM.burstOffsetDeg * DEG;
  const r = w.radius[id] ?? 0;
  for (let k = 0; k < PRISM.burstLanes; k++) {
    if (!roomForHazard(w)) return;
    const a = wrapPi(base + (k * TAU) / PRISM.burstLanes);
    spawnLane(w, bs, (w.x[id] ?? 0) + Math.cos(a) * r, (w.y[id] ?? 0) + Math.sin(a) * r, a, PRISM.laneLength, PRISM.laneHalfWidth);
  }
}

/** Kit 3 warp: mark the next drift point, land there once the ship is clear of it, then burst. */
function stepWarp(w: World, id: number, bs: BossState, adt: number): void {
  if (bs.t2 > 0) {
    bs.t2 -= adt;
    if (bs.t2 > 0) return;
    const clear = (w.radius[id] ?? 0) + PRISM.landPad;
    if (w.ship.active && circlesOverlap(w.x[0] ?? 0, w.y[0] ?? 0, 0, bs.homeX, bs.homeY, clear)) {
      bs.t2 = HAZARD_RECHECK_SEC;
      return;
    }
    bs.t2 = 0;
    moveTo(w, id, bs.homeX, bs.homeY);
    bs.n1 = (bs.n1 + 1) % 4;
    setPoint(w, bs, bs.n1);
    burst(w, id, bs);
    return;
  }
  bs.t0 += adt;
  if (bs.t0 < PRISM.warpEvery || !roomForHazard(w)) return;
  bs.t0 = 0;
  spawnRingMarker(w, bs, bs.homeX, bs.homeY, w.radius[id] ?? 0, PRISM.markSec);
  bs.t2 = PRISM.markSec;
}

/** Kit 4: one turret turn every turnEvery; a broken turret's turn passes silently. */
function stepTurrets(w: World, bs: BossState, adt: number): void {
  if (bs.retry > 0) return;
  bs.t2 += adt;
  if (bs.t2 < PRISM.turnEvery) return;
  const k = bs.dir;
  const p = livePart(w, bs, k);
  if (p > 0 && roomForHazard(w)) {
    const a = w.rot[p] ?? 0;
    const x = (w.x[p] ?? 0) + Math.cos(a) * PRISM.turretRadius;
    const y = (w.y[p] ?? 0) + Math.sin(a) * PRISM.turretRadius;
    if (!landed(bs, spawnLane(w, bs, x, y, a, PRISM.laneLength, PRISM.laneHalfWidth))) return;
  }
  bs.dir = (k + 1) % PRISM.turrets;
  bs.t2 -= PRISM.turnEvery;
  if (bs.t2 < 0) bs.t2 = 0;
}

/** Kit 4: the tether runs from the body to the arena centre. */
function syncTether(w: World, id: number, bs: BossState): void {
  if (!persistentAlive(w, bs, HazardType.Tether)) return;
  const h = bs.n0;
  w.x[h] = w.x[id] ?? 0;
  w.y[h] = w.y[id] ?? 0;
  w.vx[h] = 0;
  w.vy[h] = 0;
}

type Fire = (w: World, id: number, bs: BossState) => boolean;

/** A periodic attack on the attack clock; a refused spawn waits for the recheck. */
function stepTimed(w: World, id: number, bs: BossState, adt: number, every: number, fire: Fire): void {
  if (bs.retry > 0) return;
  bs.t0 += adt;
  if (bs.t0 < every) return;
  if (fire(w, id, bs)) bs.t0 = 0;
}

/** Attack clock start for a kit, so the first attack comes PRISM.firstAttack in. */
function firstClock(kit: number): number {
  const every = kit === 2 ? PRISM.laneEvery : kit === 3 ? PRISM.warpEvery : PRISM.ringEvery;
  const v = every - PRISM.firstAttack;
  return v > 0 ? v : 0;
}

function enterKit(w: World, id: number, bs: BossState, kit: number): void {
  bs.t0 = firstClock(kit);
  bs.t2 = 0;
  bs.n0 = -1;
  bs.dir = 0;
  bs.retry = 0;
  if (kit === 1 || kit === 4) placeParts(w, id, bs, kit, true);
}

export function reset(w: World, id: number, bs: BossState, first: boolean): void {
  const kit = kitFor(bs.phase, bs.row.phases);
  bs.t1 = 0;
  if (first) {
    bs.t3 = 0;
    bs.angle = 0;
    bs.n1 = 0;
    setPoint(w, bs, 0);
    enterKit(w, id, bs, kit);
  } else {
    // Boss rule 6: the cycle restarts, the parts stay, a warp in flight is dropped.
    bs.t0 = firstClock(kit);
    bs.t2 = 0;
    bs.n0 = -1;
    bs.retry = 0;
  }
  applyCycle(bs);
}

export function step(w: World, id: number, bs: BossState, dt: number, adt: number): void {
  bs.t1 = cycleT(bs.t1 + dt);
  applyCycle(bs);
  if (bs.retry > 0) bs.retry = bs.retry - dt > 0 ? bs.retry - dt : 0;
  const kit = kitFor(bs.phase, bs.row.phases);
  w.rot[id] = wrapPi((w.rot[id] ?? 0) + PRISM.spin * dt);
  if (!(kit === 3 && bs.t2 > 0)) drift(w, id, bs, dt);
  if (kit === 1) {
    bs.angle = wrapPi(bs.angle + PRISM.podSpin * dt);
    placeParts(w, id, bs, 1, false);
    stepTimed(w, id, bs, adt, PRISM.ringEvery, fireRing);
  } else if (kit === 2) {
    ensurePersistent(w, id, bs, HazardType.Sweep);
    stepTimed(w, id, bs, adt, PRISM.laneEvery, fireDashLane);
  } else if (kit === 3) {
    ensurePersistent(w, id, bs, HazardType.Pull);
    stepWarp(w, id, bs, adt);
  } else {
    placeParts(w, id, bs, 4, false);
    ensurePersistent(w, id, bs, HazardType.Tether);
    syncTether(w, id, bs);
    stepTurrets(w, bs, adt);
  }
}

export function onPhase(w: World, id: number, bs: BossState, phase: number): void {
  // A new quote: the previous kit's hazards and parts go and the new kit starts fresh.
  for (let h = 1; h < w.cap; h++) if (w.alive[h] === 1 && w.kind[h] === Kind.BossHazard) removeEntity(w, h);
  clearParts(w, bs);
  enterKit(w, id, bs, kitFor(phase, bs.row.phases));
}

/** Shield leak: PRISM.leak of each hit outside the window, with a carry so the sum is exact. */
export function leak(w: World, id: number, bs: BossState, amount: number): number {
  const acc = bs.t3 + amount * PRISM.leak;
  const out = Math.floor(acc + 1e-9);
  bs.t3 = acc - out;
  return out;
}

export function entryHome(d: number): number {
  return d * PRISM.entryHome;
}

/** Pure: seconds to the window at cycle clock t while in the run to white, else -1. */
export function leadAt(t: number): number {
  return stageAt(t) === PrismStage.White ? PRISM.colourSec + PRISM.whiteSec - cycleT(t) : -1;
}

/** The run to white is the run up to the window ('sim:bossWindow' countdown). */
export function windowLead(bs: BossState): number {
  return leadAt(bs.t1);
}

export const def: BossDef = { reset, step, onPhase, entryHome, leak, windowLead };
