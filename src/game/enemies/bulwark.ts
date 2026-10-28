// Bulwark (docs/10 wave C): slow seeker that moves along its heading at 90 u/s and may turn only
// 70 deg/s toward the ship. A frontal shield arc of +-60 deg around the heading absorbs player
// bullets, drone shots and orbit blades (combat.ts asks shieldBlocks). Bombs and Detonate ignore
// the shield. Render contract: shield arc centred on w.rot, +-60 deg, radius SHIELD_RADIUS.
import { enemySpeedScale, turnScale } from '../state';
import { angleToShip, DEG, inFrontArc, moveHeading, turnToward } from '../steer';
import { Kind, type World } from '../world';
import type { EnemyDef } from './types';

export const def: EnemyDef = { kind: Kind.Bulwark, radius: 18, speed: 90, value: 150, colour: 'bulwark', hp: 3, geoms: 3 };

export const TURN_RATE = 70 * DEG;
export const SHIELD_HALF_ARC = 60 * DEG;
export const SHIELD_RADIUS = 26;

/** True when a hit arriving from (px, py) lands on the shield (the front arc). */
export function shieldBlocks(w: World, id: number, px: number, py: number): boolean {
  return inFrontArc(w.x[id] ?? 0, w.y[id] ?? 0, w.rot[id] ?? 0, px, py, SHIELD_HALF_ARC);
}

export function step(w: World, id: number, dt: number): void {
  const h = turnToward(w.rot[id] ?? 0, angleToShip(w, id), TURN_RATE * turnScale(w) * dt);
  w.rot[id] = h;
  moveHeading(w, id, h, def.speed * enemySpeedScale(w), dt);
}
