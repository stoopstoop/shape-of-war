// Collisions through Forge's spatial grid (collide.ts) and the kill path (docs/03 section 4).
// Pairs: bullet vs enemy, ship vs enemy, ship vs geom. Wells use a direct loop in gravitywell.ts.
// Scored kills call the scoring port's awardKill and emit 'fx:kill'. Scratch buffers are module
// level, so nothing here allocates per step.
import { bus } from '../core/events';
import { BULLET_RADIUS, killBullet } from './bullets';
import { queryCircleInto } from './collide';
import { defOf } from './defs';
import { collectGeom, def as geomDef, PICKUP_RADIUS, spawnGeoms } from './geoms';
import { killShip } from './player';
import { removeEntity } from './remove';
import { gs, isHostile, SNAKE_SEGMENTS, SNAKE_SLOTS } from './state';
import { SHIP_RADIUS } from './ship';
import { moveTo } from './steer';
import { Kind, type World } from './world';

const hits = new Int32Array(64);

/** Kills that count for the destroy objective (segments and wells do not). */
export function countsForDestroy(k: number): boolean {
  return (k >= Kind.Grunt && k <= Kind.SnakeHead) || k === Kind.Spawner;
}

/**
 * Remove an enemy. Scored kills award points at the current multiplier, count for destroy,
 * drop geoms and emit 'fx:kill'. Unscored removal (bomb, death clear, well) does none of that.
 */
export function killEnemy(w: World, id: number, scored: boolean): void {
  if (id <= 0 || w.alive[id] !== 1) return;
  const k = w.kind[id] ?? 0;
  const d = defOf(k);
  if (!scored || d === null) {
    removeEntity(w, id);
    return;
  }
  const g = gs(w);
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  g.score += g.scoring.awardKill(w, k);
  if (countsForDestroy(k)) g.kills++;
  if (k === Kind.SnakeHead) segmentBurst(w, id);
  removeEntity(w, id);
  g.killFx.x = x;
  g.killFx.y = y;
  g.killFx.colour = d.colour;
  bus.emit('fx:kill', g.killFx);
  bus.emit('sfx', 'explode');
  spawnGeoms(w, x, y, d.geoms);
}

/** Snake death burst (docs/01 section 6.4): one 'fx:kill' per live segment, no score, no geoms. */
export function segmentBurst(w: World, head: number): number {
  const g = gs(w);
  const slot = w.a[head] ?? -1;
  if (slot < 0 || slot >= SNAKE_SLOTS || g.snakeHead[slot] !== head) return 0;
  let n = 0;
  for (let s = 0; s < SNAKE_SEGMENTS; s++) {
    const sid = g.snakeSegs[slot * SNAKE_SEGMENTS + s] ?? -1;
    if (sid <= 0 || w.alive[sid] !== 1 || w.kind[sid] !== Kind.SnakeBody || w.a[sid] !== head) continue;
    g.killFx.x = w.x[sid] ?? 0;
    g.killFx.y = w.y[sid] ?? 0;
    g.killFx.colour = 'cyan';
    bus.emit('fx:kill', g.killFx);
    n++;
  }
  return n;
}

/** Apply n damage. Returns true if the entity died. Snake segments are invulnerable. */
export function damage(w: World, id: number, n: number): boolean {
  if (w.alive[id] !== 1) return false;
  const k = w.kind[id] ?? 0;
  if (k === Kind.SnakeBody || !isHostile(k)) return false;
  const hp = (w.hp[id] ?? 0) - n;
  w.hp[id] = hp;
  if (hp <= 0) {
    killEnemy(w, id, true);
    return true;
  }
  return false;
}

/** A target that bullets and the ship can touch: hostile, not telegraphing. */
export function isTargetable(w: World, id: number): boolean {
  return w.alive[id] === 1 && isHostile(w.kind[id] ?? 0) && (gs(w).tele[id] ?? 0) <= 0;
}

/** Bullet vs enemy. No pierce: each bullet hits at most one entity. Wells are handled in gravitywell.ts. */
export function bulletHits(w: World): void {
  const p = w.bullets;
  for (let b = 0; b < p.cap; b++) {
    if (p.alive[b] !== 1) continue;
    const n = queryCircleInto(w.grid, w, p.x[b] ?? 0, p.y[b] ?? 0, BULLET_RADIUS, hits);
    for (let i = 0; i < n; i++) {
      const id = hits[i] ?? 0;
      if (id === 0 || !isTargetable(w, id)) continue;
      const k = w.kind[id] ?? 0;
      if (k === Kind.GravityWell) continue;
      killBullet(p, b);
      if (k !== Kind.SnakeBody) damage(w, id, 1);
      break;
    }
  }
}

/** Ship vs enemy contact (wells excluded, see gravitywell.ts). Returns true if the ship died. */
export function shipHits(w: World): boolean {
  if (!w.ship.active || w.ship.invuln > 0) return false;
  const n = queryCircleInto(w.grid, w, w.x[0] ?? 0, w.y[0] ?? 0, SHIP_RADIUS, hits);
  for (let i = 0; i < n; i++) {
    const id = hits[i] ?? 0;
    if (id === 0 || !isTargetable(w, id) || w.kind[id] === Kind.GravityWell) continue;
    killShip(w);
    return true;
  }
  return false;
}

/** Ship vs geom: collect every geom whose centre is within PICKUP_RADIUS of the ship centre. */
export function shipPickups(w: World): void {
  if (!w.ship.active) return;
  const n = queryCircleInto(w.grid, w, w.x[0] ?? 0, w.y[0] ?? 0, PICKUP_RADIUS - geomDef.radius, hits);
  for (let i = 0; i < n; i++) {
    const id = hits[i] ?? 0;
    if (w.alive[id] === 1 && w.kind[id] === Kind.Geom) collectGeom(w, id);
  }
}

export const SEPARATION_SPEED = 80;

/** Soft push between same kind enemies closer than the sum of their radii (docs/01 section 6.1). */
export function separate(w: World, dt: number): void {
  const g = gs(w);
  const push = SEPARATION_SPEED * dt;
  for (let id = 1; id < w.cap; id++) {
    if (w.alive[id] !== 1) continue;
    const k = w.kind[id] ?? 0;
    if (k < Kind.Grunt || k > Kind.Dart || (g.tele[id] ?? 0) > 0) continue;
    const x = w.x[id] ?? 0;
    const y = w.y[id] ?? 0;
    const r = w.radius[id] ?? 0;
    const n = queryCircleInto(w.grid, w, x, y, r, hits);
    let px = 0;
    let py = 0;
    for (let i = 0; i < n; i++) {
      const o = hits[i] ?? 0;
      if (o === id || w.kind[o] !== k) continue;
      let dx = x - (w.x[o] ?? 0);
      let dy = y - (w.y[o] ?? 0);
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1e-6) {
        // Exactly stacked: split by id order.
        dx = id < o ? 1 : -1;
        dy = 0;
        d = 1;
      }
      px += dx / d;
      py += dy / d;
    }
    const pl = Math.sqrt(px * px + py * py);
    if (pl > 1e-9) moveTo(w, id, x + (px / pl) * push, y + (py / pl) * push);
  }
}
