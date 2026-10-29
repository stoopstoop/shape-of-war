// Collisions through Forge's spatial grid (collide.ts) and the kill path (docs/03 section 4).
// Pairs: bullet vs enemy, ship vs enemy, ship vs geom. Wells use a direct loop in gravitywell.ts.
// Scored kills call the scoring port's awardKill and emit 'fx:kill'. Scratch buffers are module
// level, so nothing here allocates per step.
import { bus } from '../core/events';
import { bossBodyContact, bossDamageForStyle, bossHittable, damageBoss, damageBossPart } from './bosses/core';
import { BOSS_DAMAGE, ORBIT_BOSS_COOLDOWN } from './bosses/table';
import { BULLET_RADIUS, hasHit, killBullet, passThrough, recordHit, STYLE_ORBIT, STYLE_PIERCE, STYLE_SPREAD, styleRadius } from './bullets';
import { queryCircleInto } from './collide';
import { defOf } from './defs';
import { isWarping } from './enemies/blink';
import { shieldBlocks } from './enemies/bulwark';
import { isArmed } from './enemies/mine';
import { collectGeom, def as geomDef, PICKUP_RADIUS, spawnGeoms } from './geoms';
import { onScoringKill } from './pickup';
import { killShip } from './player';
import { removeEntity } from './remove';
import { gs, isDroppedHazard, isHostile, isV2Enemy, SNAKE_SEGMENTS, SNAKE_SLOTS, type GameState, type KillFx } from './state';
import { SHIP_RADIUS } from './ship';
import { moveTo } from './steer';
import { BLADE_COOLDOWN, ORBIT_BLADES, WEAPONS, weaponState } from './weapons';
import { Kind, type World } from './world';

const hits = new Int32Array(64);

/** Fill the reused kill payload and emit 'fx:kill'. kind and id name the entity that died. */
export function emitKill(g: GameState, x: number, y: number, colour: KillFx['colour'], kind: Kind, id: number): void {
  const f = g.killFx;
  f.x = x;
  f.y = y;
  f.colour = colour;
  f.kind = kind;
  f.id = id;
  bus.emit('fx:kill', f);
}

/** Fill the reused hit payload and emit 'fx:hit' (damage that did not kill, or a shield block). */
export function emitHit(g: GameState, x: number, y: number, kind: Kind, id: number, blocked: boolean): void {
  const f = g.hitFx;
  f.x = x;
  f.y = y;
  f.kind = kind;
  f.id = id;
  f.blocked = blocked;
  bus.emit('fx:hit', f);
}

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
    emitKill(g, x, y, d.colour, k, id);
    bus.emit('sfx', 'explode');
    return;
  }
  g.score += g.scoring.awardKill(w, k);
  if (countsForDestroy(k)) g.kills++;
  if (k === Kind.SnakeHead) segmentBurst(w, id);
  removeEntity(w, id);
  emitKill(g, x, y, d.colour, k, id);
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
    emitKill(g, w.x[sid] ?? 0, w.y[sid] ?? 0, 'cyan', Kind.SnakeBody, sid);
    n++;
  }
  return n;
}

/**
 * Apply n damage. Returns true if the entity died. Snake segments are invulnerable. A hit that
 * leaves the entity alive emits 'fx:hit' at the target centre (blocked false).
 */
export function damage(w: World, id: number, n: number): boolean {
  return hurt(w, id, n, w.x[id] ?? 0, w.y[id] ?? 0);
}

/** damage() with an explicit impact point for the 'fx:hit' payload (the bullet or blade position). */
function hurt(w: World, id: number, n: number, hx: number, hy: number): boolean {
  if (w.alive[id] !== 1) return false;
  const k = w.kind[id] ?? 0;
  if (k === Kind.SnakeBody || !isHostile(k)) return false;
  const hp = (w.hp[id] ?? 0) - n;
  w.hp[id] = hp;
  if (hp <= 0) {
    killEnemy(w, id, true);
    return true;
  }
  emitHit(gs(w), hx, hy, k, id, false);
  return false;
}

/**
 * Drone shot or Ram damage on any target: a boss or a boss part takes bossAmount tenths of a hit
 * (BOSS_DAMAGE), anything else n hits. (hx, hy) is where the hit lands on a boss (Mirage's shield
 * arc reads it); it defaults to the target centre. Returns true if the target died.
 */
export function damageAny(w: World, id: number, n: number, bossAmount: number, hx: number = w.x[id] ?? 0, hy: number = w.y[id] ?? 0): boolean {
  const k = w.kind[id] ?? 0;
  if (k === Kind.Boss) return damageBoss(w, bossAmount, hx, hy);
  if (k === Kind.BossPart) return damageBossPart(w, id, bossAmount, w.x[id] ?? 0, w.y[id] ?? 0);
  return damage(w, id, n);
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
 * Bullet vs enemy. Spread and rapid bullets hit one entity and stop (during Turbo they pass through
 * one enemy first, BulletPool.extra). Pierce bullets hit up to 4
 * different enemies and are stopped by a snake segment. Orbit blades are handled in orbitHits.
 * Wells are handled in gravitywell.ts.
 */
export function bulletHits(w: World): void {
  const p = w.bullets;
  // V3 bosses: the body is too large for the grid query, so it gets a direct circle test. Any
  // bullet that touches it stops there, pierce included. -1 in every boss free world.
  const boss = bossHittable(w);
  for (let b = 0; b < p.cap; b++) {
    if (p.alive[b] !== 1) continue;
    const style = p.style[b] ?? STYLE_SPREAD;
    if (style === STYLE_ORBIT) continue;
    const r = style === STYLE_SPREAD ? BULLET_RADIUS : styleRadius(style);
    const bx = p.x[b] ?? 0;
    const by = p.y[b] ?? 0;
    if (boss > 0 && bossBodyContact(w, boss, bx, by, r)) {
      killBullet(p, b);
      damageBoss(w, bossDamageForStyle(style), bx, by);
      continue;
    }
    const n = queryCircleInto(w.grid, w, bx, by, r, hits);
    for (let i = 0; i < n; i++) {
      const id = hits[i] ?? 0;
      if (id === 0) continue;
      if (w.kind[id] === Kind.BossPart) {
        // Pods, anchors and turrets: hit like an enemy (a pierce bullet passes on), BOSS_DAMAGE.
        if (style === STYLE_PIERCE) {
          if (hasHit(p, b, id)) continue;
          const stopped = recordHit(p, b, id);
          damageBossPart(w, id, bossDamageForStyle(style), bx, by);
          if (stopped) break;
          continue;
        }
        if (p.lastHit[b] === id) continue; // passed through it already (Turbo)
        const through = passThrough(p, b, id);
        if (!through) killBullet(p, b);
        damageBossPart(w, id, bossDamageForStyle(style), bx, by);
        if (through) continue;
        break;
      }
      if (!isTargetable(w, id)) continue;
      const k = w.kind[id] ?? 0;
      if (k === Kind.GravityWell) continue;
      if (k === Kind.Bulwark) {
        // A pierce bullet already through this Bulwark ignores it; otherwise the front arc absorbs.
        if (style === STYLE_PIERCE && hasHit(p, b, id)) continue;
        if (shielded(w, id, bx, by)) {
          emitHit(gs(w), bx, by, Kind.Bulwark, id, true);
          killBullet(p, b);
          break;
        }
      }
      if (style === STYLE_PIERCE && k !== Kind.SnakeBody) {
        if (hasHit(p, b, id)) continue;
        const stopped = recordHit(p, b, id);
        hurt(w, id, 1, bx, by);
        if (stopped) break;
        continue;
      }
      if (k !== Kind.SnakeBody) {
        // Turbo: a spread, rapid or drone bullet with an extra hit passes through one enemy.
        if (p.lastHit[b] === id) continue;
        if (passThrough(p, b, id)) {
          hurt(w, id, 1, bx, by);
          continue;
        }
      }
      killBullet(p, b);
      if (k !== Kind.SnakeBody) hurt(w, id, 1, bx, by);
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
  const boss = bossHittable(w);
  for (let i = 0; i < ORBIT_BLADES; i++) {
    const cool = (s.bladeCool[i] ?? 0) - dt;
    s.bladeCool[i] = cool > 0 ? cool : 0;
    if (cool > 1e-9) continue;
    const b = s.blades[i] ?? -1;
    if (b < 0 || p.alive[b] !== 1 || p.style[b] !== STYLE_ORBIT) continue;
    const bx = p.x[b] ?? 0;
    const by = p.y[b] ?? 0;
    if (boss > 0 && bossBodyContact(w, boss, bx, by, r)) {
      // Against a boss body a blade rests 0.25 s (boss rule 8), 0.12 s against everything else.
      damageBoss(w, BOSS_DAMAGE.orbit, bx, by);
      s.bladeCool[i] = ORBIT_BOSS_COOLDOWN;
      continue;
    }
    const n = queryCircleInto(w.grid, w, bx, by, r, hits);
    for (let j = 0; j < n; j++) {
      const id = hits[j] ?? 0;
      if (id === 0) continue;
      if (w.kind[id] === Kind.BossPart) {
        p.lastHit[b] = id;
        damageBossPart(w, id, BOSS_DAMAGE.orbit, bx, by);
        s.bladeCool[i] = BLADE_COOLDOWN;
        break;
      }
      if (!isTargetable(w, id) || w.kind[id] === Kind.SnakeBody) continue;
      p.lastHit[b] = id;
      // A blade on a Bulwark's front arc is absorbed: it rests without dealing damage.
      if (shielded(w, id, bx, by)) emitHit(gs(w), bx, by, Kind.Bulwark, id, true);
      else hurt(w, id, 1, bx, by);
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
