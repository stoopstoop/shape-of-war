// Dart: homes on the ship with a capped turn rate of 140 deg/s times speedScale, starting heading
// toward the ship (docs/01 sections 6.4 and 6.6). w.t counts seconds alive; 0 means uninitialised.
import { enemySpeedScale, turnScale } from '../state';
import { angleToShip, DEG, moveHeading, turnToward } from '../steer';
import { Kind, type World } from '../world';
import type { EnemyDef } from './types';

export const def: EnemyDef = { kind: Kind.Dart, radius: 9, speed: 260, value: 30, colour: 'orange', hp: 1, geoms: 1 };

export const TURN_RATE = 140 * DEG;

export function step(w: World, id: number, dt: number): void {
  const target = angleToShip(w, id);
  let rot = w.rot[id] ?? 0;
  if ((w.t[id] ?? 0) === 0) rot = target;
  else rot = turnToward(rot, target, TURN_RATE * turnScale(w) * dt);
  w.rot[id] = rot;
  moveHeading(w, id, rot, def.speed * enemySpeedScale(w), dt);
  w.t[id] = (w.t[id] ?? 0) + Math.max(dt, 1e-6);
}
