// Pinwheel: slow drift on its spawn heading, reflects off walls, spins at 90 deg/s in a direction
// from hash01(id). Large hitbox, 2 HP, low value (docs/01 section 6.4).
import { hash01 } from '../../core/rng';
import { DEG } from '../steer';
import { driftEntity, Kind, type World } from '../world';
import type { EnemyDef } from './types';

export const def: EnemyDef = { kind: Kind.Pinwheel, radius: 20, speed: 60, value: 25, colour: 'magenta', hp: 2, geoms: 1 };

const SPIN = 90 * DEG;

export function init(w: World, id: number, headingDeg: number): void {
  const s = def.speed * w.level.speedScale;
  w.vx[id] = Math.cos(headingDeg * DEG) * s;
  w.vy[id] = Math.sin(headingDeg * DEG) * s;
}

export function spinSign(id: number): number {
  return hash01(id) < 0.5 ? -1 : 1;
}

export function step(w: World, id: number, dt: number): void {
  driftEntity(w, id, dt);
  w.rot[id] = (w.rot[id] ?? 0) + spinSign(id) * SPIN * dt;
  w.t[id] = (w.t[id] ?? 0) + dt;
}
