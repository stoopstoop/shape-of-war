// Swirl (docs/10 wave C): orbits the ship at 0.6 rad/s (direction from the entity hash) while
// closing 20 u/s from the 240 u orbit radius. Outside the orbit radius it spirals in at 144 u/s
// radial with 144 u/s tangential. At 90 u it commits to a straight dive at 300 u/s along the
// heading to the ship at that moment; a wall or DIVE_MAX_SEC ends the dive and it orbits again.
// State: w.t is seconds into the dive (0 while orbiting), w.rot the travel heading (locked
// during the dive). Render contract: position and rotation only.
import { enemySpeedScale } from '../state';
import { angleToShip, distToShip, entityHash, moveTo, moveToHit } from '../steer';
import { Kind, type World } from '../world';
import type { EnemyDef } from './types';

export const def: EnemyDef = { kind: Kind.Swirl, radius: 12, speed: 144, value: 80, colour: 'swirl', hp: 1, geoms: 1 };

export const ORBIT_RADIUS = 240;
export const ANGULAR_SPEED = 0.6;
export const CLOSE_SPEED = 20;
/** Radial speed while outside ORBIT_RADIUS. */
export const APPROACH_SPEED = 144;
export const DIVE_RADIUS = 90;
export const DIVE_SPEED = 300;
export const DIVE_MAX_SEC = 1.5;

/** +1 counter clockwise or -1 clockwise, fixed per entity. */
export function orbitDir(w: World, id: number): number {
  return entityHash(w, id, 0) < 0.5 ? 1 : -1;
}

/** Pure: angular speed (rad/s) at distance d: 0.6 inside the orbit radius, 144 u/s tangential outside. */
export function angularSpeed(d: number): number {
  if (d <= ORBIT_RADIUS) return ANGULAR_SPEED;
  return (ANGULAR_SPEED * ORBIT_RADIUS) / d;
}

/** True while diving. */
export function isDiving(w: World, id: number): boolean {
  return (w.t[id] ?? 0) > 0;
}

function dive(w: World, id: number, dt: number, scale: number): void {
  const h = w.rot[id] ?? 0;
  const s = DIVE_SPEED * scale * dt;
  const hit = moveToHit(w, id, (w.x[id] ?? 0) + Math.cos(h) * s, (w.y[id] ?? 0) + Math.sin(h) * s);
  const t = (w.t[id] ?? 0) + dt;
  w.t[id] = hit || t >= DIVE_MAX_SEC ? 0 : t;
}

export function step(w: World, id: number, dt: number): void {
  const scale = enemySpeedScale(w);
  if (isDiving(w, id)) {
    dive(w, id, dt, scale);
    return;
  }
  const d = distToShip(w, id);
  if (d <= DIVE_RADIUS) {
    w.rot[id] = angleToShip(w, id);
    w.t[id] = 1e-6;
    dive(w, id, dt, scale);
    return;
  }
  const x0 = w.x[id] ?? 0;
  const y0 = w.y[id] ?? 0;
  const theta = angleToShip(w, id) + Math.PI; // ship to swirl
  const radial = (d > ORBIT_RADIUS ? APPROACH_SPEED : CLOSE_SPEED) * scale * dt;
  // No clamp at DIVE_RADIUS: the next step sees d under it and commits.
  const nd = d - radial > 0 ? d - radial : 0;
  const nth = theta + orbitDir(w, id) * angularSpeed(d) * scale * dt;
  moveTo(w, id, (w.x[0] ?? 0) + Math.cos(nth) * nd, (w.y[0] ?? 0) + Math.sin(nth) * nd);
  const mx = (w.x[id] ?? 0) - x0;
  const my = (w.y[id] ?? 0) - y0;
  if (mx * mx + my * my > 1e-12) w.rot[id] = Math.atan2(my, mx);
}
