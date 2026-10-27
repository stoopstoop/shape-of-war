// Grunt: seeks the ship in a straight line at constant speed (docs/01 section 6.4).
// The 2 Hz size pulse is visual only (render, phase hash01(id)); the hitbox does not pulse.
import { seekShip } from '../steer';
import { Kind, type World } from '../world';
import type { EnemyDef } from './types';

export const def: EnemyDef = { kind: Kind.Grunt, radius: 14, speed: 150, value: 50, colour: 'blue', hp: 1, geoms: 1 };

export function step(w: World, id: number, dt: number): void {
  w.rot[id] = seekShip(w, id, def.speed * w.level.speedScale, dt);
  w.t[id] = (w.t[id] ?? 0) + dt;
}
