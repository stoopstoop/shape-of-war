// Collisions through Forge's spatial grid (collide.ts) and the kill path (docs/03 section 4).
// Pairs: bullet vs enemy, ship vs enemy, ship vs geom. Wells use a direct loop in gravitywell.ts.
// Scored kills call the scoring port's awardKill and emit 'fx:kill'. Scratch buffers are module
// level, so nothing here allocates per step.
import { bus } from '../core/events';
import { BULLET_RADIUS, hasHit, killBullet, recordHit, STYLE_ORBIT, STYLE_PIERCE, STYLE_SPREAD, styleRadius } from './bullets';
import { queryCircleInto } from './collide';
import { defOf } from './defs';
import { isWarping } from './enemies/blink';
import { shieldBlocks } from './enemies/bulwark';
import { isArmed } from './enemies/mine';
import { collectGeom, def as geomDef, PICKUP_RADIUS, spawnGeoms } from './geoms';
import { onScoringKill } from './pickup';
import { killShip } from './player';
import { removeEntity } from './remove';
import { gs, isDroppedHazard, isHostile, isV2Enemy, SNAKE_SEGMENTS, SNAKE_SLOTS } from './state';
import { SHIP_RADIUS } from './ship';
import { moveTo } from './steer';
import { BLADE_COOLDOWN, ORBIT_BLADES, WEAPONS, weaponState } from './weapons';
import { Kind, type World } from './world';

const hits = new Int32Array(64);

/** Kills that count for the destroy objective (segments, wells, Mines and Slime do not). */
export function countsForDestroy(k: number): boolean {
  return (k >= Kind.Grunt && k <= Kind.SnakeHead) || k === Kind.Spawner || isV2Enemy(k);
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
  if (isDroppedHazard(k)) {
    // A shot Mine pops: a kill flash, but no score, no geoms, no kill count, no pickup progress.
    removeEntity(w, id);
    g.killFx.x = x;
    g.killFx.y = y;
    g.killFx.colour = d.colour;
    bus.emit('fx:kill', g.killFx);
    bus.emit('sfx', 'explode');
    return;
  }
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
  onScoringKill(w, x, y);
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

/** A target that bullets and the ship can touch: hostile, not telegraphing, not a warping Blink. */
export function isTargetable(w: World, id: number): boolean {
  if (w.alive[id] !== 1) return false;
  const k = w.kind[id] ?? 0;
  if (!isHostile(k) || (gs(w).tele[id] ?? 0) > 0) return false;
  return k !== Kind.Blink || !isWarping(w, id);
}

/** Bulwark shield: true when a hit from (px, py) on id lands on a Bulwark's front arc. */
export function shielded(w: World, id: number, px: number, py: number): boolean {
  return w.kind[id] === Kind.Bulwark && shieldBlocks(w, id, px, py);
}

/**
 * Bullet vs enemy. Spread and rapid bullets hit one entity and stop. Pierce bullets hit up to 4
 * different enemies and are stopped by a snake segment. Orbit blades are handled in orbitHits.
 * Wells are handled in gravitywell.ts.
 */
export function bulletHits(w: World): void {
  const p = w.bullets;
  for (let b = 0; b < p.cap; b++) {
    if (p.alive[b] !== 1) continue;
    const style = p.style[b] ?? STYLE_SPREAD;
    if (style === STYLE_ORBIT) continue;
    const r = style === STYLE_SPREAD ? BULLET_RADIUS : styleRadius(style);
    const n = queryCircleInto(w.grid, w, p.x[b] ?? 0, p.y[b] ?? 0, r, hits);
    for (let i = 0; i < n; i++) {
      const id = hits[i] ?? 0;
      if (id === 0 || !isTargetable(w, id)) continue;
      const k = w.kind[id] ?? 0;
      if (k === Kind.GravityWell) continue;
      if (k === Kind.Bulwark) {
        // A pierce bullet already through this Bulwark ignores it; otherwise the front arc absorbs.
        if (style === STYLE_PIERCE && hasHit(p, b, id)) continue;
        if (shielded(w, id, p.x[b] ?? 0, p.y[b] ?? 0)) {
          killBullet(p, b);
          break;
        }
      }
      if (style === STYLE_PIERCE && k !== Kind.SnakeBody) {
        if (hasHit(p, b, id)) continue;
        const stopped = recordHit(p, b, id);
        damage(w, id, 1);
        if (stopped) break;
        continue;
      }
      killBullet(p, b);
      if (k !== Kind.SnakeBody) damage(w, id, 1);
      break;
    }
  }
}

/**
 * Orbit blades vs enemy. A blade damages the first targetable enemy it touches (wells included,
 * snake segments ignored) by 1, then rests BLADE_COOLDOWN seconds. Blades are never consumed.
 */
export function orbitHits(w: World, dt: number): void {
  const s = weaponState(w);
  if (s.kind !== 'orbit') return;
  const p = w.bullets;
  const r = WEAPONS.orbit.radius;
  for (let i = 0; i < ORBIT_BLADES; i++) {
    const cool = (s.bladeCool[i] ?? 0) - dt;
    s.bladeCool[i] = cool > 0 ? cool : 0;
    if (cool > 1e-9) continue;
    const b = s.blades[i] ?? -1;
    if (b < 0 || p.alive[b] !== 1 || p.style[b] !== STYLE_ORBIT) continue;
    const n = queryCircleInto(w.grid, w, p.x[b] ?? 0, p.y[b] ?? 0, r, hits);
    for (let j = 0; j < n; j++) {
      const id = hits[j] ?? 0;
      if (id === 0 || !isTargetable(w, id) || w.kind[id] === Kind.SnakeBody) continue;
      p.lastHit[b] = id;
      // A blade on a Bulwark's front arc is absorbed: it rests without dealing damage.
      if (!shielded(w, id, p.x[b] ?? 0, p.y[b] ?? 0)) damage(w, id, 1);
      s.bladeCool[i] = BLADE_COOLDOWN;
      break;
    }
  }
}

/** Ship vs enemy contact (wells excluded, see gravitywell.ts). Returns true if the ship died. */
export function shipHits(w: World): boolean {
  if (!w.ship.active || w.ship.invuln > 0 || gs(w).invulnerable) return false;
  const n = queryCircleInto(w.grid, w, w.x[0] ?? 0, w.y[0] ?? 0, SHIP_RADIUS, hits);
  for (let i = 0; i < n; i++) {
    const id = hits[i] ?? 0;
    if (id === 0 || !isTargetable(w, id) || w.kind[id] === Kind.GravityWell) continue;
    if (w.kind[id] === Kind.Mine && !isArmed(w, id)) continue; // arming delay: harmless
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
    if (!((k >= Kind.Grunt && k <= Kind.Dart) || isV2Enemy(k)) || (g.tele[id] ?? 0) > 0) continue;
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
