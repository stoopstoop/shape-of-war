// Enemy bullet pool (docs/13 "Boss projectiles", docs/12 "Design: boss projectiles"). Slow
// telegraphed bullets from the three boss shooters (Spindle, Ember, Bastion) only. Not a Kind,
// outside ENTITY_CAP, the grid and every enemy rule. One pool per World in a WeakMap, created on
// the first spawn, so a world that never fires one has none and a run stays bit identical to
// v2.1 (the Off invariant). No PRNG here: ids come from the free stack, timing from the caller.
// stepEnemyBullets allocates nothing.
import type { ThrustRow } from '../core/physics';
import { confine, createConfineResult } from './arena';
import { killShip } from './player';
import { SHIP_RADIUS } from './ship';
import { gs } from './state';
import type { World } from './world';

/** Most live enemy bullets, charging or flying (about 9 are needed). */
export const ENEMY_BULLET_CAP = 32;
/** Speed ceiling in u/s (Dart is 260). Phase speed ups and enrage never pass it. */
export const ENEMY_BULLET_SPEED_MAX = 240;
/** A boss fires only while the ship is at least this far from the muzzle, in u. */
export const ENEMY_BULLET_MIN_RANGE = 300;
/** Collision radius in u (the render draws radius 9). */
export const ENEMY_BULLET_RADIUS = 6;
/** Seconds of flight after launch before a bullet ends. */
export const ENEMY_BULLET_LIFE = 8;

/** Structure of arrays, like BulletPool. A launched bullet is straight and never homing. */
export interface EnemyBulletPool {
  cap: number;
  alive: Uint8Array;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  /** Collision radius in u (6 for the render radius 9 contract). */
  radius: Float32Array;
  /** Seconds left before the bullet ends. */
  life: Float32Array;
  /** Charge seconds left. Above 0 the bullet is harmless and stays at the muzzle. */
  arm: Float32Array;
  /** Boss tier 1 to 4, which sets the colour. */
  tier: Uint8Array;
  /** Free slot stack. */
  free: Int32Array;
  freeTop: number;
  liveCount: number;
  /** Shots dropped because the pool was full (debug counter). */
  dropped: number;
}

/** The one shared pool of cap 0 that every boss free world reads. Never written. */
const EMPTY_POOL: EnemyBulletPool = createEnemyBulletPool(0);

const pools = new WeakMap<World, EnemyBulletPool>();

/** A fresh pool. Stack top is the lowest id, so ids fill from 0 upward. */
export function createEnemyBulletPool(cap: number = ENEMY_BULLET_CAP): EnemyBulletPool {
  const free = new Int32Array(cap);
  for (let i = 0; i < cap; i++) free[i] = cap - 1 - i;
  return {
    cap,
    alive: new Uint8Array(cap),
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    vx: new Float32Array(cap),
    vy: new Float32Array(cap),
    radius: new Float32Array(cap),
    life: new Float32Array(cap),
    arm: new Float32Array(cap),
    tier: new Uint8Array(cap),
    free,
    freeTop: cap,
    liveCount: 0,
    dropped: 0,
  };
}

/** The enemy bullet pool of a world, or the shared empty pool of cap 0 if it never fired. */
export function enemyBulletsOf(w: World): EnemyBulletPool {
  return pools.get(w) ?? EMPTY_POOL;
}

/** Clamp a requested speed into [0, ENEMY_BULLET_SPEED_MAX]. NaN becomes 0. */
export function clampEnemyBulletSpeed(speed: number): number {
  if (!(speed > 0)) return 0;
  return speed > ENEMY_BULLET_SPEED_MAX ? ENEMY_BULLET_SPEED_MAX : speed;
}

/**
 * Launch (after armSec of charge) a bullet at (x, y) along heading radians. The velocity is fixed
 * now, so the render can draw the aim line during the charge. Returns the slot, or -1 when the
 * pool is full (the shot is dropped and counted, never thrown).
 */
export function spawnEnemyBullet(
  w: World,
  x: number,
  y: number,
  heading: number,
  speed: number,
  radius: number,
  tier: number,
  armSec: number,
): number {
  let p = pools.get(w);
  if (p === undefined) {
    p = createEnemyBulletPool();
    pools.set(w, p);
  }
  if (p.freeTop === 0) {
    p.dropped++;
    return -1;
  }
  p.freeTop--;
  const id = p.free[p.freeTop] ?? 0;
  const s = clampEnemyBulletSpeed(speed);
  p.alive[id] = 1;
  p.x[id] = x;
  p.y[id] = y;
  p.vx[id] = Math.cos(heading) * s;
  p.vy[id] = Math.sin(heading) * s;
  p.radius[id] = radius > 0 ? radius : ENEMY_BULLET_RADIUS;
  p.life[id] = ENEMY_BULLET_LIFE;
  p.arm[id] = armSec > 0 ? armSec : 0;
  p.tier[id] = tier;
  p.liveCount++;
  return id;
}

function killEnemyBullet(p: EnemyBulletPool, id: number): void {
  if (p.alive[id] !== 1) return;
  p.alive[id] = 0;
  p.free[p.freeTop] = id;
  p.freeTop++;
  p.liveCount--;
}

const wallScratch = createConfineResult();

/**
 * Advance charge, motion and life, and test the ship. A charging bullet stays at the muzzle and
 * never collides; the step that ends its charge moves it by the leftover time. A launched bullet
 * ends at life 0, on the arena wall or an obstacle, or on the ship. It touches nothing else.
 */
export function stepEnemyBullets(w: World, dt: number): void {
  const p = pools.get(w);
  if (p === undefined || p.liveCount === 0) return;
  const arena = w.level.arena;
  for (let i = 0; i < p.cap; i++) {
    if (p.alive[i] !== 1) continue;
    let move = dt;
    const arm = p.arm[i] ?? 0;
    if (arm > 0) {
      const left = arm - dt;
      if (left > 0) {
        p.arm[i] = left;
        continue;
      }
      p.arm[i] = 0;
      move = -left;
    }
    const life = (p.life[i] ?? 0) - move;
    if (life <= 0) {
      killEnemyBullet(p, i);
      continue;
    }
    p.life[i] = life;
    const nx = (p.x[i] ?? 0) + (p.vx[i] ?? 0) * move;
    const ny = (p.y[i] ?? 0) + (p.vy[i] ?? 0) * move;
    p.x[i] = nx;
    p.y[i] = ny;
    const r = p.radius[i] ?? ENEMY_BULLET_RADIUS;
    if (confine(arena, nx, ny, r, wallScratch).hit) {
      killEnemyBullet(p, i);
      continue;
    }
    if (!w.ship.active) continue;
    const dx = nx - (w.x[0] ?? 0);
    const dy = ny - (w.y[0] ?? 0);
    const reach = r + SHIP_RADIUS;
    if (dx * dx + dy * dy >= reach * reach) continue;
    // Consumed either way, so none overlaps the ship when invulnerability ends.
    killEnemyBullet(p, i);
    if (w.ship.invuln > 0 || gs(w).invulnerable) continue;
    killShip(w);
  }
}

/** Remove every bullet, charging or flying (bomb, ship death, level end). Keeps the pool. */
export function clearEnemyBullets(w: World): void {
  const p = pools.get(w);
  if (p === undefined) return;
  for (let i = 0; i < p.cap; i++) killEnemyBullet(p, i);
}

/** Fixed bisection steps for dodgeSeconds: deterministic, error below 1e-9 of the bracket. */
const DODGE_ITERATIONS = 48;

/**
 * Seconds from rest for the ship to cover `clearance` u under a SPACE_TABLE row, with the stick
 * held from t = 0. Acceleration is aMin e^(t/tau), so the distance after t s is
 * aMin tau^2 (e^(t/tau) - 1 - t/tau). Assumes aMax is not reached (true for the short dodges this
 * is for: at High, aMax is reached only after about 1.28 s). Pure.
 */
export function dodgeSeconds(row: ThrustRow, clearance: number): number {
  if (!(clearance > 0)) return 0;
  const k = clearance / (row.aMin * row.tau * row.tau);
  // Solve e^u - 1 - u = k for u = t / tau. f is increasing on u > 0, and f(u) >= u^2 / 2, so
  // u <= sqrt(2k) brackets the root.
  let lo = 0;
  let hi = Math.sqrt(2 * k);
  for (let n = 0; n < DODGE_ITERATIONS; n++) {
    const mid = (lo + hi) / 2;
    if (Math.exp(mid) - 1 - mid < k) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * row.tau;
}
