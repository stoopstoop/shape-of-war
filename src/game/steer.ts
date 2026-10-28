// Small steering helpers shared by enemy step functions. No allocation.
import { wrapAngle } from '../core/math';
import { hash01 } from '../core/rng';
import { confine, createConfineResult } from './arena';
import type { World } from './world';

const res = createConfineResult();

/** Move id to (nx, ny), confined to the arena and obstacles (slides along walls). */
export function moveTo(w: World, id: number, nx: number, ny: number): void {
  const r = confine(w.level.arena, nx, ny, w.radius[id] ?? 0, res);
  w.x[id] = r.x;
  w.y[id] = r.y;
}

/** Move in a straight line toward the ship at speed (u/s). Returns the heading used. */
export function seekShip(w: World, id: number, speed: number, dt: number): number {
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  const dx = (w.x[0] ?? 0) - x;
  const dy = (w.y[0] ?? 0) - y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) return w.rot[id] ?? 0;
  const step = Math.min(d, speed * dt);
  moveTo(w, id, x + (dx / d) * step, y + (dy / d) * step);
  return Math.atan2(dy, dx);
}

/** Turn angle cur toward target by at most maxDelta radians. */
export function turnToward(cur: number, target: number, maxDelta: number): number {
  const diff = wrapAngle(target - cur);
  if (diff > maxDelta) return wrapAngle(cur + maxDelta);
  if (diff < -maxDelta) return wrapAngle(cur - maxDelta);
  return wrapAngle(target);
}

/** Angle from id to the ship. */
export function angleToShip(w: World, id: number): number {
  return Math.atan2((w.y[0] ?? 0) - (w.y[id] ?? 0), (w.x[0] ?? 0) - (w.x[id] ?? 0));
}

/** Move along heading at speed, confined to the arena. */
export function moveHeading(w: World, id: number, heading: number, speed: number, dt: number): void {
  moveTo(w, id, (w.x[id] ?? 0) + Math.cos(heading) * speed * dt, (w.y[id] ?? 0) + Math.sin(heading) * speed * dt);
}

export const DEG = Math.PI / 180;

/** Like moveTo, but returns true when the arena or an obstacle stopped the move (a wall hit). */
export function moveToHit(w: World, id: number, nx: number, ny: number): boolean {
  const r = confine(w.level.arena, nx, ny, w.radius[id] ?? 0, res);
  w.x[id] = r.x;
  w.y[id] = r.y;
  return r.hit;
}

/** Distance from id to the ship. */
export function distToShip(w: World, id: number): number {
  const dx = (w.x[0] ?? 0) - (w.x[id] ?? 0);
  const dy = (w.y[0] ?? 0) - (w.y[id] ?? 0);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Wrap a phase timer t into [0, period). */
export function wrapPhase(t: number, period: number): number {
  if (t < period) return t;
  const r = t % period;
  return r < 0 ? r + period : r;
}

/**
 * Stable per entity variation in [0, 1) from the level seed, the entity id and a counter.
 * Stateless (hash01), so it never advances a PRNG.
 */
export function entityHash(w: World, id: number, n: number): number {
  return hash01((w.level.seed ^ Math.imul(id + 1, 0x85ebca6b)) >>> 0, n);
}

/** True when a point at (px, py) lies inside the arc of +-halfArc radians around heading, seen from (x, y). */
export function inFrontArc(x: number, y: number, heading: number, px: number, py: number, halfArc: number): boolean {
  const dx = px - x;
  const dy = py - y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-9) return true;
  return (Math.cos(heading) * dx + Math.sin(heading) * dy) / d >= Math.cos(halfArc);
}
