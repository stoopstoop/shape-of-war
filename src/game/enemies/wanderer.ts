// Wanderer: constant speed on its spawn heading, reflects off walls and obstacles, ignores the
// ship, rotates visually at 180 deg/s (docs/01 section 6.4).
import { enemySpeedScale } from '../state';
import { DEG } from '../steer';
import { driftEntity, Kind, type World } from '../world';
import type { EnemyDef } from './types';

export const def: EnemyDef = { kind: Kind.Wanderer, radius: 13, speed: 110, value: 10, colour: 'purple', hp: 1, geoms: 1 };

const SPIN = 180 * DEG;

/** Set the travel velocity from the spawn record heading. */
export function init(w: World, id: number, headingDeg: number): void {
  const s = def.speed * enemySpeedScale(w);
  w.vx[id] = Math.cos(headingDeg * DEG) * s;
  w.vy[id] = Math.sin(headingDeg * DEG) * s;
}

export function step(w: World, id: number, dt: number): void {
  driftEntity(w, id, dt);
  w.rot[id] = (w.rot[id] ?? 0) + SPIN * dt;
  w.t[id] = (w.t[id] ?? 0) + dt;
}
