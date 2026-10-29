// Supers (docs/01 section 4.5, SPEC 3.5). One type per level from LevelDef.superType, charged by
// geoms (SUPER_CHARGE_MAX). Activation empties the charge; further geoms refill it, so a super
// may fire more than once per level. Charge is kept on death. Nothing here allocates per step.
//   Homing: for 5 s every player bullet homes on the nearest enemy within 300 u, turning at
//           most 540 deg/s. Bullets fired in the window keep homing until they expire.
//   Detonate: the drone explodes, killing every enemy within 260 u (scored, geoms dropped,
//           wells and snake segments excluded); the drone is absent for 3 s.
//   Turbo: fire rate doubled (24 volleys/s for spread; every weapon doubles) for 5 s.
import { bus } from '../core/events';
import type { SuperKind } from '../levelgen/leveldef';
import { STYLE_ORBIT } from './bullets';
import { bossDetonate, isBossTarget } from './bosses/core';
import { isTargetable, killEnemy } from './combat';
import { SUPER_CHARGE_MAX } from './geoms';
import { removeEntity } from './remove';
import { gs } from './state';
import { DEG } from './steer';
import { Kind, type World } from './world';

export const SUPER_DURATION = 5.0;
export const HOMING_RADIUS = 300;
export const HOMING_TURN = 540 * DEG;
export const DETONATE_RADIUS = 260;
export const DRONE_ABSENT_SEC = 3.0;
export const TURBO_SCALE = 2;

function droneReady(w: World): boolean {
  const id = gs(w).droneId;
  return id > 0 && w.alive[id] === 1 && w.kind[id] === Kind.Drone;
}

/** True when the super button would fire now. */
export function superReady(w: World): boolean {
  const g = gs(w);
  if (!w.ship.active || g.outcome !== 'running' || g.superCharge < SUPER_CHARGE_MAX) return false;
  if (w.level.superType === 'detonate') return droneReady(w);
  return true;
}

/** Activate the level's super if charged. Returns true if it fired (charge goes to 0). */
export function triggerSuper(w: World): boolean {
  if (!superReady(w)) return false;
  const g = gs(w);
  const kind: SuperKind = w.level.superType;
  g.superCharge = 0;
  switch (kind) {
    case 'homing':
      startTimed(w, 'homing');
      markHoming(w);
      break;
    case 'turbo':
      startTimed(w, 'turbo');
      w.ship.fireRateScale = TURBO_SCALE;
      break;
    case 'detonate':
      detonate(w);
      break;
  }
  return true;
}

function startTimed(w: World, kind: SuperKind): void {
  const g = gs(w);
  if (g.superActive === 'turbo' && kind !== 'turbo') w.ship.fireRateScale = 1;
  g.superActive = kind;
  g.superTimer = SUPER_DURATION;
}

function endTimed(w: World): void {
  const g = gs(w);
  if (g.superActive === 'turbo') w.ship.fireRateScale = 1;
  g.superActive = null;
  g.superTimer = 0;
}

/** Detonate: scored kills inside DETONATE_RADIUS of the drone, then remove it for 3 s. Returns kills. */
export function detonate(w: World): number {
  const g = gs(w);
  const drone = g.droneId;
  if (drone <= 0 || w.alive[drone] !== 1 || w.kind[drone] !== Kind.Drone) return 0;
  const x = w.x[drone] ?? 0;
  const y = w.y[drone] ?? 0;
  removeEntity(w, drone);
  g.droneAbsent = DRONE_ABSENT_SEC;
  g.dronePhase = 0;
  g.droneTarget = -1;
  const r2 = DETONATE_RADIUS * DETONATE_RADIUS;
  let n = 0;
  for (let id = 1; id < w.cap; id++) {
    if (!isTargetable(w, id)) continue;
    const k = w.kind[id] ?? 0;
    if (k === Kind.GravityWell || k === Kind.SnakeBody) continue;
    const dx = (w.x[id] ?? 0) - x;
    const dy = (w.y[id] ?? 0) - y;
    if (dx * dx + dy * dy > r2) continue;
    killEnemy(w, id, true);
    n++;
  }
  bossDetonate(w, x, y); // V3: 10 percent of the boss's maximum hit points within 260 u
  g.pointFx.x = x;
  g.pointFx.y = y;
  bus.emit('fx:bomb', g.pointFx);
  bus.emit('sfx', 'bomb');
  return n;
}

/** Flag every live player bullet as homing. Orbit blades follow the ship and never home. */
function markHoming(w: World): void {
  const p = w.bullets;
  for (let b = 0; b < p.cap; b++) if (p.alive[b] === 1 && p.style[b] !== STYLE_ORBIT) p.homing[b] = 1;
}

/** Collect ids bullets may home on: targetable, not a snake segment, not a well. */
export function collectTargets(w: World): number {
  const g = gs(w);
  let n = 0;
  for (let id = 1; id < w.cap; id++) {
    if (!isTargetable(w, id) && !isBossTarget(w, id)) continue;
    const k = w.kind[id] ?? 0;
    if (k === Kind.SnakeBody || k === Kind.GravityWell) continue;
    g.targets[n++] = id;
  }
  g.targetCount = n;
  return n;
}

/** Turn every homing bullet toward its nearest target within HOMING_RADIUS, keeping its speed. */
export function steerHoming(w: World, dt: number): void {
  const g = gs(w);
  const p = w.bullets;
  const r2 = HOMING_RADIUS * HOMING_RADIUS;
  const maxTurn = HOMING_TURN * dt;
  let built = false;
  for (let b = 0; b < p.cap; b++) {
    if (p.alive[b] !== 1 || p.homing[b] !== 1) continue;
    if (!built) {
      collectTargets(w);
      built = true;
    }
    if (g.targetCount === 0) return;
    const bx = p.x[b] ?? 0;
    const by = p.y[b] ?? 0;
    let best = -1;
    let bestD = r2;
    for (let i = 0; i < g.targetCount; i++) {
      const id = g.targets[i] ?? 0;
      const dx = (w.x[id] ?? 0) - bx;
      const dy = (w.y[id] ?? 0) - by;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD) {
        bestD = d2;
        best = id;
      }
    }
    if (best < 0) continue;
    const vx = p.vx[b] ?? 0;
    const vy = p.vy[b] ?? 0;
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed < 1e-6) continue;
    const cur = Math.atan2(vy, vx);
    let diff = Math.atan2((w.y[best] ?? 0) - by, (w.x[best] ?? 0) - bx) - cur;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    else if (diff < -Math.PI) diff += 2 * Math.PI;
    if (diff > maxTurn) diff = maxTurn;
    else if (diff < -maxTurn) diff = -maxTurn;
    const a = cur + diff;
    p.vx[b] = Math.cos(a) * speed;
    p.vy[b] = Math.sin(a) * speed;
  }
}

/** Super timers, homing marks and steering, and the Detonate drone absence. Call after stepWorld. */
export function stepSupers(w: World, dt: number): void {
  const g = gs(w);
  if (g.droneAbsent > 0) g.droneAbsent = Math.max(0, g.droneAbsent - dt);
  if (g.superActive !== null) {
    if (g.superActive === 'homing') markHoming(w);
    g.superTimer -= dt;
    if (g.superTimer <= 1e-9) endTimed(w);
  }
  steerHoming(w, dt);
}

/** Seconds left on a running Homing or Turbo super, 0 otherwise (HUD and render). */
export function superTimeLeft(w: World): number {
  const g = gs(w);
  return g.superActive === null ? 0 : g.superTimer;
}

/** Charge as a fraction 0 to 1 (HUD ring). */
export function superChargeFraction(w: World): number {
  return Math.min(1, gs(w).superCharge / SUPER_CHARGE_MAX);
}
