// Lives, death, respawn and bombs (docs/01 sections 4.1, 4.3, 7). Ship movement and firing stay
// in Forge's ship.ts; this module decides when the ship dies and comes back.
import { bus } from '../core/events';
import { bossOnBomb, bossOnShipDeath } from './bosses/core';
import { clearEnemyBullets } from './enemyBullets';
import { resetWell } from './enemies/gravitywell';
import { clearGeoms } from './geoms';
import { removeEntity } from './remove';
import { gs, isHostile, portResetMultiplier } from './state';
import { deactivateShip, respawnShip } from './ship';
import { resetWeapon } from './weapons';
import { Kind, type World } from './world';
import type { InputState } from '../input/types';

export const RESPAWN_DELAY = 1.5;
export const BOMB_COOLDOWN = 1.0;
export const DEATH_VIBRATE_MS = 60;

/**
 * Ship death: lives minus 1, multiplier reset, arena clear without score (wells, spawners and a
 * weapon pickup stay), geoms removed, weapon back to spread, drone hidden, 1.5 s respawn delay,
 * 'fx:death' and one vibrate.
 * No op while gs(w).invulnerable is set (stress scene), so every kill path is covered.
 */
export function killShip(w: World): void {
  const g = gs(w);
  if (!w.ship.active || g.invulnerable) return;
  g.lives = Math.max(0, g.lives - 1);
  portResetMultiplier(w);
  g.pointFx.x = w.x[0] ?? 0;
  g.pointFx.y = w.y[0] ?? 0;
  for (let id = 1; id < w.cap; id++) {
    if (w.alive[id] !== 1) continue;
    const k = w.kind[id] ?? 0;
    if (k === Kind.GravityWell || k === Kind.Spawner || k === Kind.Geom || k === Kind.WeaponPickup) continue;
    // V3 boss rule 6: the boss keeps its hit points and its parts; adds and hazards are cleared.
    if (k === Kind.Boss || k === Kind.BossPart) continue;
    removeEntity(w, id); // enemies, telegraphs, segments and the drone
  }
  bossOnShipDeath(w);
  clearEnemyBullets(w); // boss rule 6: every enemy bullet, charging or flying
  clearGeoms(w);
  resetWeapon(w); // docs/11 SPEC 3.5 rule 4: death returns to spread
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
    else if (isHostile(k) || k === Kind.Slime) removeEntity(w, id); // v2 kinds, Mines and every Slime too
  }
  bossOnBomb(w); // V3 boss rule 7: hazards cleared, the boss staggered, no damage
  clearEnemyBullets(w); // and every enemy bullet, charging or flying, with no score
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
