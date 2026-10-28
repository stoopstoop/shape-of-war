// Splime (docs/10 wave C, docs/11 SPEC 3.4 rule 7): walks straight at the ship at 0.35 x ship
// speed with no turn limit, and every 2 s drops one Slime at its position (skipped at 3 live
// per Splime or 12 in total). Contact kills the ship like any enemy.
// Render contract: w.t seconds since the last drop in [0, DROP_SEC), w.rot the heading.
import { SHIP_SPEED } from '../ship';
import { enemySpeedScale } from '../state';
import { seekShip } from '../steer';
import { Kind, type World } from '../world';
import { dropSlime } from './slime';
import type { EnemyDef } from './types';

export const SPEED_SHARE = 0.35;
export const def: EnemyDef = {
  kind: Kind.Splime,
  radius: 16,
  speed: SPEED_SHARE * SHIP_SPEED,
  value: 140,
  colour: 'splime',
  hp: 3,
  geoms: 2,
};

export const DROP_SEC = 2;

export function step(w: World, id: number, dt: number): void {
  w.rot[id] = seekShip(w, id, def.speed * enemySpeedScale(w), dt);
  let t = (w.t[id] ?? 0) + dt;
  if (t >= DROP_SEC) {
    t -= DROP_SEC;
    dropSlime(w, id, w.x[id] ?? 0, w.y[id] ?? 0);
  }
  w.t[id] = t;
}
