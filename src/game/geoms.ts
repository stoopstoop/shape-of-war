// Geoms (docs/01 section 5): dropped on scored kills, drift outward with drag, drawn to the ship
// inside 90 u, collected inside 28 u, expire after 4 s. Each pickup raises the multiplier through
// the scoring port and charges the super.
import { bus } from '../core/events';
import { hash01 } from '../core/rng';
import type { EnemyDef } from './enemies/types';
import { removeEntity } from './remove';
import { gs, spawnFromDef } from './state';
import { moveTo } from './steer';
import { Kind, type World } from './world';

export const def: EnemyDef = { kind: Kind.Geom, radius: 6, speed: 120, value: 0, colour: 'geom', hp: 1, geoms: 0 };

export const GEOM_LIFE = 4.0;
export const GEOM_DRAG = 2.5;
export const PICKUP_RADIUS = 28;
export const MAGNET_RADIUS = 90;
export const MAGNET_SPEED = 600;
export const SUPER_CHARGE_MAX = 60;
/**
 * docs/01 says 400, but geoms share the 512 slot entity store with enemies, so the cap is lower
 * to leave room for a full band 4 wave (see hand-off).
 */
export const GEOM_CAP = 280;

/** Drop n geoms at (x, y), evenly spaced outward at 120 u/s. Oldest geoms go first past GEOM_CAP. */
export function spawnGeoms(w: World, x: number, y: number, n: number): void {
  if (n <= 0) return;
  let live = 0;
  for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && w.kind[i] === Kind.Geom) live++;
  let excess = live + n - GEOM_CAP;
  while (excess > 0 && removeOldestGeom(w)) excess--;
  const phase = hash01(w.tick, Math.round(x * 7 + y * 13)) * 2 * Math.PI;
  for (let k = 0; k < n; k++) {
    const id = spawnFromDef(w, def, x, y, 0);
    if (id < 0) return;
    const a = phase + (k * 2 * Math.PI) / n;
    w.vx[id] = Math.cos(a) * def.speed;
    w.vy[id] = Math.sin(a) * def.speed;
  }
}

function removeOldestGeom(w: World): boolean {
  let best = -1;
  let bestT = -1;
  for (let i = 1; i < w.cap; i++) {
    if (w.alive[i] !== 1 || w.kind[i] !== Kind.Geom) continue;
    const t = w.t[i] ?? 0;
    if (t > bestT) {
      bestT = t;
      best = i;
    }
  }
  if (best < 0) return false;
  removeEntity(w, best);
  return true;
}

export function step(w: World, id: number, dt: number): void {
  const t = (w.t[id] ?? 0) + dt;
  if (t >= GEOM_LIFE) {
    removeEntity(w, id);
    return;
  }
  w.t[id] = t;
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  const dx = (w.x[0] ?? 0) - x;
  const dy = (w.y[0] ?? 0) - y;
  const d2 = dx * dx + dy * dy;
  if (w.ship.active && d2 < MAGNET_RADIUS * MAGNET_RADIUS && d2 > 1e-9) {
    const d = Math.sqrt(d2);
    w.vx[id] = (dx / d) * MAGNET_SPEED;
    w.vy[id] = (dy / d) * MAGNET_SPEED;
  } else {
    const k = Math.max(0, 1 - GEOM_DRAG * dt);
    w.vx[id] = (w.vx[id] ?? 0) * k;
    w.vy[id] = (w.vy[id] ?? 0) * k;
  }
  moveTo(w, id, x + (w.vx[id] ?? 0) * dt, y + (w.vy[id] ?? 0) * dt);
}

/** Collect geom id: multiplier, super charge, fx. */
export function collectGeom(w: World, id: number): void {
  const g = gs(w);
  g.pointFx.x = w.x[id] ?? 0;
  g.pointFx.y = w.y[id] ?? 0;
  removeEntity(w, id);
  g.scoring.collectGeom(w);
  if (g.superCharge < SUPER_CHARGE_MAX) g.superCharge++;
  bus.emit('fx:geom', g.pointFx);
  bus.emit('sfx', 'geom');
}

/** Collect every geom within radius of (x, y), measured centre to centre. Direct loop, no grid. */
export function collectNear(w: World, x: number, y: number, radius: number): number {
  let n = 0;
  const r2 = radius * radius;
  for (let i = 1; i < w.cap; i++) {
    if (w.alive[i] !== 1 || w.kind[i] !== Kind.Geom) continue;
    const dx = (w.x[i] ?? 0) - x;
    const dy = (w.y[i] ?? 0) - y;
    if (dx * dx + dy * dy <= r2) {
      collectGeom(w, i);
      n++;
    }
  }
  return n;
}

/** Remove every geom (ship death). */
export function clearGeoms(w: World): void {
  for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && w.kind[i] === Kind.Geom) removeEntity(w, i);
}
