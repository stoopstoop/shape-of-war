// Lives, death, respawn and bombs (docs/01 sections 4.1, 4.3, 7). Ship movement and firing stay
// in Forge's ship.ts; this module decides when the ship dies and comes back.
import { bus } from '../core/events';
import { resetWell } from './enemies/gravitywell';
import { clearGeoms } from './geoms';
import { removeEntity } from './remove';
import { gs } from './state';
import { deactivateShip, respawnShip } from './ship';
import { Kind, type World } from './world';
import type { InputState } from '../input/types';

export const RESPAWN_DELAY = 1.5;
export const BOMB_COOLDOWN = 1.0;
export const DEATH_VIBRATE_MS = 60;

/**
 * Ship death: lives minus 1, multiplier reset, arena clear without score (wells and spawners
 * stay), geoms removed, drone hidden, 1.5 s respawn delay, 'fx:death' and one vibrate.
 */
export function killShip(w: World): void {
  if (!w.ship.active) return;
  const g = gs(w);
  g.lives = Math.max(0, g.lives - 1);
  g.scoring.resetMultiplier(w);
  g.pointFx.x = w.x[0] ?? 0;
  g.pointFx.y = w.y[0] ?? 0;
  for (let id = 1; id < w.cap; id++) {
    if (w.alive[id] !== 1) continue;
    const k = w.kind[id] ?? 0;
    if (k === Kind.GravityWell || k === Kind.Spawner || k === Kind.Geom) continue;
    removeEntity(w, id); // enemies, telegraphs, segments and the drone
  }
  clearGeoms(w);
  deactivateShip(w);
  g.shipPullX = 0;
  g.shipPullY = 0;
  g.deathTimer = RESPAWN_DELAY;
  bus.emit('fx:death', g.pointFx);
  bus.emit('sfx', 'death');
  g.vibrate(DEATH_VIBRATE_MS);
}

/** Full arena clear, no score, no geoms; wells reset to base mass; spawners destroyed. */
export function triggerBomb(w: World): boolean {
  const g = gs(w);
  if (!w.ship.active || g.bombs <= 0 || g.bombCooldown > 0) return false;
  g.bombs--;
  g.bombCooldown = BOMB_COOLDOWN;
  for (let id = 1; id < w.cap; id++) {
    if (w.alive[id] !== 1) continue;
    const k = w.kind[id] ?? 0;
    if (k === Kind.GravityWell) resetWell(w, id);
    else if (k >= Kind.Grunt && k <= Kind.Spawner) removeEntity(w, id);
  }
  g.pointFx.x = w.x[0] ?? 0;
  g.pointFx.y = w.y[0] ?? 0;
  bus.emit('fx:bomb', g.pointFx);
  bus.emit('sfx', 'bomb');
  return true;
}

/** Bomb button, cooldowns and the respawn timer. */
export function stepPlayer(w: World, dt: number, input: InputState): void {
  const g = gs(w);
  if (g.bombCooldown > 0) g.bombCooldown = Math.max(0, g.bombCooldown - dt);
  if (input.bomb) triggerBomb(w);
  if (g.deathTimer > 0) {
    g.deathTimer -= dt;
    if (g.deathTimer <= 0) {
      g.deathTimer = 0;
      if (g.lives > 0 && g.outcome === 'running') respawnShip(w);
    }
  }
}
