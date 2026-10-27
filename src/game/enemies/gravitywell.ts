// Gravity well (docs/01 section 6.7): static hazard placed by the generator. Pulls the ship,
// player bullets and most enemies inside 320 u, kills the ship on contact, consumes enemies whose
// centre enters it (mass plus 1, radius plus 2), explodes at mass 20, can be shot down.
// Pair handling is a direct loop over all entities because the pull radius exceeds two grid cells
// and there are at most 3 wells. Mass lives in gs(w).aux.
import { bus } from '../../core/events';
import { BULLET_RADIUS, killBullet } from '../bullets';
import { killEnemy } from '../combat';
import { killShip } from '../player';
import { removeEntity } from '../remove';
import { gs, isHostile, MAX_WELLS, spawnFromDef } from '../state';
import { SHIP_RADIUS } from '../ship';
import { moveTo } from '../steer';
import { Kind, type World } from '../world';
import type { EnemyDef } from './types';

export const def: EnemyDef = { kind: Kind.GravityWell, radius: 24, speed: 0, value: 250, colour: 'red', hp: 40, geoms: 5 };

export const PULL_RADIUS = 320;
export const PULL_SHIP = 900;
export const PULL_BULLET = 1800;
export const PULL_ENEMY = 600;
export const MASS_LIMIT = 20;
export const EXPLODE_RADIUS = 220;
/** Damping of the integrated pull velocity, per second. Keeps the ship (420 u/s) able to escape. */
export const PULL_DAMP = 3;

export function step(w: World, id: number, dt: number): void {
  w.t[id] = (w.t[id] ?? 0) + dt; // pulse clock for render
}

export function massOf(w: World, id: number): number {
  return gs(w).aux[id] ?? 0;
}

/** Place the level's wells. Call once at game start. */
export function spawnWells(w: World): void {
  const g = gs(w);
  const list = w.level.hazards.wells;
  for (let i = 0; i < list.length && g.wellCount < MAX_WELLS; i++) {
    const p = list[i];
    if (p === undefined) continue;
    const id = spawnFromDef(w, def, p.x, p.y, 0);
    if (id < 0) continue;
    g.wellIds[g.wellCount++] = id;
  }
}

/** Bomb: mass back to 0, radius and HP to base. */
export function resetWell(w: World, id: number): void {
  gs(w).aux[id] = 0;
  w.radius[id] = def.radius;
  w.hp[id] = def.hp;
}

/** Consume one enemy: mass plus 1, radius plus 2, HP plus 2. Explodes at MASS_LIMIT. */
export function feed(w: World, well: number, victim: number): void {
  removeEntity(w, victim);
  const g = gs(w);
  const m = (g.aux[well] ?? 0) + 1;
  g.aux[well] = m;
  w.radius[well] = def.radius + 2 * m;
  w.hp[well] = (w.hp[well] ?? 0) + 2;
  if (m >= MASS_LIMIT) explode(w, well);
}

/** Kill every enemy within 220 u (no score) and the ship if not invulnerable, then remove the well. */
export function explode(w: World, well: number): void {
  const g = gs(w);
  const x = w.x[well] ?? 0;
  const y = w.y[well] ?? 0;
  removeEntity(w, well);
  const r2 = EXPLODE_RADIUS * EXPLODE_RADIUS;
  for (let id = 1; id < w.cap; id++) {
    if (w.alive[id] !== 1) continue;
    const k = w.kind[id] ?? 0;
    if (!isHostile(k) || k === Kind.GravityWell) continue;
    const dx = (w.x[id] ?? 0) - x;
    const dy = (w.y[id] ?? 0) - y;
    if (dx * dx + dy * dy <= r2) removeEntity(w, id);
  }
  if (w.ship.active && w.ship.invuln <= 0) {
    const dx = (w.x[0] ?? 0) - x;
    const dy = (w.y[0] ?? 0) - y;
    if (dx * dx + dy * dy <= r2) killShip(w);
  }
  g.killFx.x = x;
  g.killFx.y = y;
  g.killFx.colour = def.colour;
  bus.emit('fx:kill', g.killFx);
  bus.emit('sfx', 'explode');
}

function pulledByWell(k: number): boolean {
  return isHostile(k) && k !== Kind.GravityWell && k !== Kind.SnakeHead && k !== Kind.SnakeBody && k !== Kind.Spawner;
}

/** One well: ship contact and pull, bullet hits and pull, enemy feeding and pull. */
function stepOneWell(w: World, well: number, dt: number): void {
  const g = gs(w);
  const wx = w.x[well] ?? 0;
  const wy = w.y[well] ?? 0;
  const pr2 = PULL_RADIUS * PULL_RADIUS;

  if (w.ship.active) {
    const dx = wx - (w.x[0] ?? 0);
    const dy = wy - (w.y[0] ?? 0);
    const d = Math.sqrt(dx * dx + dy * dy);
    const touch = (w.radius[well] ?? 0) + SHIP_RADIUS;
    if (d < touch && w.ship.invuln <= 0) {
      killShip(w);
    } else if (d < PULL_RADIUS && d > 1e-6) {
      const a = (PULL_SHIP * (1 - d / PULL_RADIUS) * dt) / d;
      g.shipPullX += dx * a;
      g.shipPullY += dy * a;
    }
  }

  const p = w.bullets;
  for (let b = 0; b < p.cap; b++) {
    if (p.alive[b] !== 1) continue;
    const dx = wx - (p.x[b] ?? 0);
    const dy = wy - (p.y[b] ?? 0);
    const d2 = dx * dx + dy * dy;
    if (d2 >= pr2) continue;
    const d = Math.sqrt(d2);
    if (d < (w.radius[well] ?? 0) + BULLET_RADIUS) {
      killBullet(p, b);
      const hp = (w.hp[well] ?? 0) - 1;
      w.hp[well] = hp;
      if (hp <= 0) {
        killEnemy(w, well, true); // shot down: 250 x multiplier, 5 geoms
        return;
      }
      continue;
    }
    if (d < 1e-6) continue;
    const a = (PULL_BULLET * (1 - d / PULL_RADIUS) * dt) / d;
    p.vx[b] = (p.vx[b] ?? 0) + dx * a;
    p.vy[b] = (p.vy[b] ?? 0) + dy * a;
  }

  for (let id = 1; id < w.cap; id++) {
    if (w.alive[id] !== 1 || !pulledByWell(w.kind[id] ?? 0) || (g.tele[id] ?? 0) > 0) continue;
    const dx = wx - (w.x[id] ?? 0);
    const dy = wy - (w.y[id] ?? 0);
    const d2 = dx * dx + dy * dy;
    if (d2 >= pr2) continue;
    const d = Math.sqrt(d2);
    if (d < (w.radius[well] ?? 0)) {
      feed(w, well, id);
      if (w.alive[well] !== 1 || w.kind[well] !== Kind.GravityWell) return; // exploded
      continue;
    }
    if (d < 1e-6) continue;
    const a = (PULL_ENEMY * (1 - d / PULL_RADIUS) * dt) / d;
    g.pvx[id] = (g.pvx[id] ?? 0) + dx * a;
    g.pvy[id] = (g.pvy[id] ?? 0) + dy * a;
  }
}

/** All wells, then integrate the accumulated pull velocities for enemies and the ship. */
export function stepWells(w: World, dt: number): void {
  const g = gs(w);
  for (let i = g.wellCount - 1; i >= 0; i--) {
    const id = g.wellIds[i] ?? -1;
    if (id > 0 && w.alive[id] === 1 && w.kind[id] === Kind.GravityWell) stepOneWell(w, id, dt);
  }
  const k = Math.max(0, 1 - PULL_DAMP * dt);
  for (let id = 1; id < w.cap; id++) {
    const vx = g.pvx[id] ?? 0;
    const vy = g.pvy[id] ?? 0;
    if (vx === 0 && vy === 0) continue;
    if (w.alive[id] !== 1 || !pulledByWell(w.kind[id] ?? 0)) {
      g.pvx[id] = 0;
      g.pvy[id] = 0;
      continue;
    }
    moveTo(w, id, (w.x[id] ?? 0) + vx * dt, (w.y[id] ?? 0) + vy * dt);
    g.pvx[id] = Math.abs(vx * k) < 1e-3 ? 0 : vx * k;
    g.pvy[id] = Math.abs(vy * k) < 1e-3 ? 0 : vy * k;
  }
  if (w.ship.active && (g.shipPullX !== 0 || g.shipPullY !== 0)) {
    moveTo(w, 0, (w.x[0] ?? 0) + g.shipPullX * dt, (w.y[0] ?? 0) + g.shipPullY * dt);
    g.shipPullX *= k;
    g.shipPullY *= k;
  } else if (!w.ship.active) {
    g.shipPullX = 0;
    g.shipPullY = 0;
  }
}
