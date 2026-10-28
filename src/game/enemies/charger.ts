// Charger (docs/10 wave C): a 2.7 s cycle. Wind up 1.0 s turning toward the ship at 120 deg/s
// (render draws a 600 u lane line along w.rot), dash 0.5 s straight along the locked heading at
// 720 u/s (a wall ends the dash early), then rest 1.2 s. Not pulled by wells while dashing.
// Render contract: w.t is the phase in seconds in [0, CYCLE), w.rot the heading.
import { enemySpeedScale, turnScale } from '../state';
import { angleToShip, DEG, moveToHit, turnToward, wrapPhase } from '../steer';
import { Kind, type World } from '../world';
import type { EnemyDef } from './types';

export const def: EnemyDef = { kind: Kind.Charger, radius: 15, speed: 720, value: 120, colour: 'charger', hp: 2, geoms: 2 };

export const WINDUP_SEC = 1.0;
export const DASH_SEC = 0.5;
export const REST_SEC = 1.2;
export const DASH_END = WINDUP_SEC + DASH_SEC;
export const CYCLE = WINDUP_SEC + DASH_SEC + REST_SEC;
export const TURN_RATE = 120 * DEG;
export const LANE_LENGTH = 600;

export type ChargerPhase = 'windup' | 'dash' | 'rest';

/** Pure: the phase at time t into the cycle. */
export function phaseOf(t: number): ChargerPhase {
  if (t < WINDUP_SEC) return 'windup';
  if (t < DASH_END) return 'dash';
  return 'rest';
}

/** True while the Charger is dashing (wells skip it). */
export function isDashing(w: World, id: number): boolean {
  const t = w.t[id] ?? 0;
  return t >= WINDUP_SEC && t < DASH_END;
}

export function step(w: World, id: number, dt: number): void {
  const t = w.t[id] ?? 0;
  if (t < WINDUP_SEC) {
    w.rot[id] = turnToward(w.rot[id] ?? 0, angleToShip(w, id), TURN_RATE * turnScale(w) * dt);
    w.t[id] = t + dt;
    return;
  }
  if (t < DASH_END) {
    const h = w.rot[id] ?? 0;
    const s = def.speed * enemySpeedScale(w) * dt;
    const hit = moveToHit(w, id, (w.x[id] ?? 0) + Math.cos(h) * s, (w.y[id] ?? 0) + Math.sin(h) * s);
    // A wall ends the dash: jump to the start of the rest phase.
    w.t[id] = hit ? DASH_END : t + dt;
    return;
  }
  w.t[id] = wrapPhase(t + dt, CYCLE);
}
