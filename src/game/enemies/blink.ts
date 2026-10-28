// Blink (docs/10 wave C): drifts toward the ship at 100 u/s for 2.2 s, then a 0.4 s warp phase
// (harmless and untargetable, see combat.ts isTargetable), then jumps to a destination 180 to
// 260 u from the ship: ahead along the ship velocity when the ship moves faster than 40 u/s, else
// at an angle from the entity hash and the cycle count. The destination is pulled inside the arena
// (docs/01 section 6.5): first by rotating around the ship at the same distance, then by the
// spawn rule's pull toward the arena centre.
// Render contract: w.t is the phase in [0, CYCLE); during the warp (w.vx, w.vy) hold the
// destination. gs(w).aux counts completed jumps.
import { isInside } from '../arena';
import { enemySpeedScale, gs } from '../state';
import { DEG, entityHash, seekShip } from '../steer';
import { Kind, type World } from '../world';
import type { EnemyDef } from './types';

export const def: EnemyDef = { kind: Kind.Blink, radius: 13, speed: 100, value: 130, colour: 'blink', hp: 1, geoms: 2 };

// Phase bounds are float32 values: w.t is a Float32Array, and rounding is monotonic, so a stored
// phase compares against them exactly as the float64 value did.
export const DRIFT_SEC = Math.fround(2.2);
export const WARP_SEC = 0.4;
export const CYCLE = Math.fround(2.6);
export const JUMP_MIN = 180;
export const JUMP_MAX = 260;
/** Ship speed above which the destination leads along the ship velocity. */
export const LEAD_SPEED = 40;
const ROTATE_STEP = 30 * DEG;
const ROTATE_TRIES = 12;

/** True while the Blink is in its warp phase (harmless, untargetable). */
export function isWarping(w: World, id: number): boolean {
  return (w.t[id] ?? 0) >= DRIFT_SEC;
}

/** Choose the destination for jump number `cycle` and write it into w.vx, w.vy. */
export function chooseDestination(w: World, id: number, cycle: number): void {
  const sx = w.x[0] ?? 0;
  const sy = w.y[0] ?? 0;
  const svx = w.vx[0] ?? 0;
  const svy = w.vy[0] ?? 0;
  const dist = JUMP_MIN + (JUMP_MAX - JUMP_MIN) * entityHash(w, id, cycle * 2 + 1);
  const base =
    svx * svx + svy * svy > LEAD_SPEED * LEAD_SPEED ? Math.atan2(svy, svx) : entityHash(w, id, cycle * 2) * 2 * Math.PI;
  const arena = w.level.arena;
  const r = w.radius[id] ?? def.radius;
  for (let k = 0; k < ROTATE_TRIES; k++) {
    // Alternate either side of the base angle: 0, +30, -30, +60, ...
    const off = ((k + 1) >> 1) * ROTATE_STEP * (k % 2 === 1 ? 1 : -1);
    const x = sx + Math.cos(base + off) * dist;
    const y = sy + Math.sin(base + off) * dist;
    if (isInside(arena, x, y, r)) {
      w.vx[id] = x;
      w.vy[id] = y;
      return;
    }
  }
  let x = sx + Math.cos(base) * dist;
  let y = sy + Math.sin(base) * dist;
  for (let i = 0; i < 32 && !isInside(arena, x, y, r); i++) {
    x *= 0.88;
    y *= 0.88;
  }
  w.vx[id] = x;
  w.vy[id] = y;
}

export function step(w: World, id: number, dt: number): void {
  const t = w.t[id] ?? 0;
  if (t < DRIFT_SEC) {
    w.rot[id] = seekShip(w, id, def.speed * enemySpeedScale(w), dt);
    const nt = t + dt;
    if (nt >= DRIFT_SEC) chooseDestination(w, id, gs(w).aux[id] ?? 0);
    w.t[id] = nt;
    return;
  }
  const nt = t + dt;
  if (nt < CYCLE) {
    w.t[id] = nt;
    return;
  }
  const g = gs(w);
  w.x[id] = w.vx[id] ?? 0;
  w.y[id] = w.vy[id] ?? 0;
  w.prevX[id] = w.x[id] ?? 0;
  w.prevY[id] = w.y[id] ?? 0;
  w.vx[id] = 0;
  w.vy[id] = 0;
  g.aux[id] = (g.aux[id] ?? 0) + 1;
  w.t[id] = 0;
}
