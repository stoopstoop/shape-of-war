// Weaver: seeks like a Grunt; when a player bullet within 140 u points at it (dot above 0.8) it
// sidesteps perpendicular to the bullet, away from the bullet's line, at 320 u/s for 0.25 s, then
// waits a 0.4 s cooldown (docs/01 section 6.4).
// w.t is one timer: above COOLDOWN means dodging, (0, COOLDOWN] means cooling down.
// w.vx, w.vy hold the dodge velocity.
import { enemySpeedScale } from '../state';
import { moveTo, seekShip } from '../steer';
import { Kind, type World } from '../world';
import type { EnemyDef } from './types';

export const def: EnemyDef = { kind: Kind.Weaver, radius: 14, speed: 190, value: 100, colour: 'green', hp: 1, geoms: 2 };

export const DODGE_SPEED = 320;
export const DODGE_SEC = 0.25;
export const COOLDOWN = 0.4;
export const SENSE_RADIUS = 140;
export const SENSE_DOT = 0.8;

/** Writes the unit dodge direction into w.vx, w.vy and returns true if a threatening bullet exists. */
export function findThreat(w: World, id: number): boolean {
  const p = w.bullets;
  const ex = w.x[id] ?? 0;
  const ey = w.y[id] ?? 0;
  const r2 = SENSE_RADIUS * SENSE_RADIUS;
  for (let i = 0; i < p.cap; i++) {
    if (p.alive[i] !== 1) continue;
    const bx = p.x[i] ?? 0;
    const by = p.y[i] ?? 0;
    const dx = ex - bx;
    const dy = ey - by;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2 || d2 < 1e-9) continue;
    const vx = p.vx[i] ?? 0;
    const vy = p.vy[i] ?? 0;
    const vl = Math.sqrt(vx * vx + vy * vy);
    if (vl < 1e-9) continue;
    const dot = (vx * dx + vy * dy) / (vl * Math.sqrt(d2));
    if (dot <= SENSE_DOT) continue;
    // Left perpendicular of v is (-vy, vx). Cross > 0 means the weaver sits on the left.
    const cross = vx * dy - vy * dx;
    const side = cross >= 0 ? 1 : -1;
    w.vx[id] = (-vy / vl) * side;
    w.vy[id] = (vx / vl) * side;
    return true;
  }
  return false;
}

export function step(w: World, id: number, dt: number): void {
  let t = w.t[id] ?? 0;
  if (t > COOLDOWN) {
    const s = DODGE_SPEED * enemySpeedScale(w) * dt;
    moveTo(w, id, (w.x[id] ?? 0) + (w.vx[id] ?? 0) * s, (w.y[id] ?? 0) + (w.vy[id] ?? 0) * s);
    w.t[id] = t - dt;
    return;
  }
  if (t > 0) {
    t -= dt;
    w.t[id] = t > 0 ? t : 0;
  } else if (findThreat(w, id)) {
    w.t[id] = DODGE_SEC + COOLDOWN;
    const s = DODGE_SPEED * enemySpeedScale(w) * dt;
    moveTo(w, id, (w.x[id] ?? 0) + (w.vx[id] ?? 0) * s, (w.y[id] ?? 0) + (w.vy[id] ?? 0) * s);
    return;
  }
  w.rot[id] = seekShip(w, id, def.speed * enemySpeedScale(w), dt);
}
