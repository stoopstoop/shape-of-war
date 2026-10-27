// Drones (docs/01 section 4.4). One per level from LevelDef.drone. Invulnerable, not pulled by
// wells, absent while the ship is dead. Attack orbits and fires; Collect trails and vacuums
// geoms; Ram orbits and charges.
import { BULLET_LIFE, BULLET_SPEED, spawnBullet } from './bullets';
import { damage, isTargetable } from './combat';
import type { EnemyDef } from './enemies/types';
import { collectNear, PICKUP_RADIUS } from './geoms';
import { removeEntity } from './remove';
import { gs, spawnFromDef } from './state';
import { Kind, type World } from './world';

export const def: EnemyDef = { kind: Kind.Drone, radius: 8, speed: 0, value: 0, colour: 'white', hp: 1, geoms: 0 };

export const ORBIT_RADIUS = 60;
export const ORBIT_REV_PER_SEC = 1.5;
export const ATTACK_RANGE = 450;
export const ATTACK_RATE = 4;
export const COLLECT_TRAIL = 50;
export const COLLECT_MAGNET = 260;
export const COLLECT_PULL = 900;
export const RAM_RANGE = 400;
export const RAM_CHARGE = 700;
export const RAM_RETURN = 900;
export const RAM_DAMAGE = 2;
export const RAM_COOLDOWN = 1.2;

/** Nearest targetable enemy to (x, y) within range, excluding snake segments and wells. -1 if none. */
export function nearestEnemy(w: World, x: number, y: number, range: number): number {
  let best = -1;
  let bestD = range * range;
  for (let id = 1; id < w.cap; id++) {
    if (!isTargetable(w, id)) continue;
    const k = w.kind[id] ?? 0;
    if (k === Kind.SnakeBody || k === Kind.GravityWell) continue;
    const dx = (w.x[id] ?? 0) - x;
    const dy = (w.y[id] ?? 0) - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD) {
      bestD = d2;
      best = id;
    }
  }
  return best;
}

function orbit(w: World, id: number, dt: number): void {
  const g = gs(w);
  g.droneAngle = (g.droneAngle + ORBIT_REV_PER_SEC * 2 * Math.PI * dt) % (2 * Math.PI);
  w.x[id] = (w.x[0] ?? 0) + Math.cos(g.droneAngle) * ORBIT_RADIUS;
  w.y[id] = (w.y[0] ?? 0) + Math.sin(g.droneAngle) * ORBIT_RADIUS;
  w.rot[id] = g.droneAngle;
}

function stepAttack(w: World, id: number, dt: number): void {
  const g = gs(w);
  orbit(w, id, dt);
  g.droneCooldown -= dt;
  if (g.droneCooldown > 0) return;
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  const target = nearestEnemy(w, x, y, ATTACK_RANGE);
  if (target < 0) {
    g.droneCooldown = 0;
    return;
  }
  const dx = (w.x[target] ?? 0) - x;
  const dy = (w.y[target] ?? 0) - y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1e-6) spawnBullet(w.bullets, x, y, (dx / d) * BULLET_SPEED, (dy / d) * BULLET_SPEED, BULLET_LIFE);
  g.droneCooldown += 1 / ATTACK_RATE;
  if (g.droneCooldown < 0) g.droneCooldown = 0;
}

function stepCollect(w: World, id: number): void {
  const r = w.rot[0] ?? 0;
  const x = (w.x[0] ?? 0) - Math.cos(r) * COLLECT_TRAIL;
  const y = (w.y[0] ?? 0) - Math.sin(r) * COLLECT_TRAIL;
  w.x[id] = x;
  w.y[id] = y;
  w.rot[id] = r;
  const m2 = COLLECT_MAGNET * COLLECT_MAGNET;
  for (let i = 1; i < w.cap; i++) {
    if (w.alive[i] !== 1 || w.kind[i] !== Kind.Geom) continue;
    const dx = x - (w.x[i] ?? 0);
    const dy = y - (w.y[i] ?? 0);
    const d2 = dx * dx + dy * dy;
    if (d2 > m2 || d2 < 1e-9) continue;
    const d = Math.sqrt(d2);
    w.vx[i] = (dx / d) * COLLECT_PULL;
    w.vy[i] = (dy / d) * COLLECT_PULL;
  }
  collectNear(w, x, y, PICKUP_RADIUS);
}

function moveToward(w: World, id: number, tx: number, ty: number, speed: number, dt: number): number {
  const dx = tx - (w.x[id] ?? 0);
  const dy = ty - (w.y[id] ?? 0);
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) return 0;
  const s = Math.min(d, speed * dt);
  w.x[id] = (w.x[id] ?? 0) + (dx / d) * s;
  w.y[id] = (w.y[id] ?? 0) + (dy / d) * s;
  w.rot[id] = Math.atan2(dy, dx);
  return d - s;
}

function stepRam(w: World, id: number, dt: number): void {
  const g = gs(w);
  if (g.droneCooldown > 0) g.droneCooldown -= dt;
  if (g.dronePhase === 1) {
    const t = g.droneTarget;
    if (t <= 0 || !isTargetable(w, t)) {
      g.dronePhase = 2;
    } else {
      const left = moveToward(w, id, w.x[t] ?? 0, w.y[t] ?? 0, RAM_CHARGE, dt);
      if (left <= def.radius + (w.radius[t] ?? 0)) {
        damage(w, t, RAM_DAMAGE);
        g.dronePhase = 2;
        g.droneCooldown = RAM_COOLDOWN;
      }
      return;
    }
  }
  if (g.dronePhase === 2) {
    g.droneAngle = (g.droneAngle + ORBIT_REV_PER_SEC * 2 * Math.PI * dt) % (2 * Math.PI);
    const ox = (w.x[0] ?? 0) + Math.cos(g.droneAngle) * ORBIT_RADIUS;
    const oy = (w.y[0] ?? 0) + Math.sin(g.droneAngle) * ORBIT_RADIUS;
    if (moveToward(w, id, ox, oy, RAM_RETURN, dt) < 4) g.dronePhase = 0;
    return;
  }
  orbit(w, id, dt);
  if (g.droneCooldown > 0) return;
  const t = nearestEnemy(w, w.x[id] ?? 0, w.y[id] ?? 0, RAM_RANGE);
  if (t > 0) {
    g.droneTarget = t;
    g.dronePhase = 1;
  }
}

/** Spawn or hide the drone with the ship, then run its behaviour. Call after stepWorld. */
export function stepDrone(w: World, dt: number): void {
  const g = gs(w);
  if (!w.ship.active || g.outcome !== 'running') {
    if (g.droneId > 0) removeEntity(w, g.droneId);
    return;
  }
  let id = g.droneId;
  if (id <= 0 || w.alive[id] !== 1 || w.kind[id] !== Kind.Drone) {
    id = spawnFromDef(w, def, (w.x[0] ?? 0) + ORBIT_RADIUS, w.y[0] ?? 0, 0);
    g.droneId = id;
    g.droneCooldown = 0;
    g.dronePhase = 0;
    g.droneTarget = -1;
    if (id < 0) return;
  }
  switch (w.level.drone) {
    case 'attack':
      stepAttack(w, id, dt);
      break;
    case 'collect':
      stepCollect(w, id);
      break;
    case 'ram':
      stepRam(w, id, dt);
      break;
  }
}
