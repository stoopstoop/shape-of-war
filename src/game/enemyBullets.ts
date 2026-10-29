// V3 contract stub (docs/12-v3-plan.md V3-W0, "Design: boss projectiles"). The enemy bullet pool:
// slow telegraphed bullets from the three boss shooters (Spindle, Ember, Bastion) only. Not a
// Kind, outside ENTITY_CAP, the grid and every enemy rule. Forge replaces the bodies in wave A,
// Swarm wires the calls in wave B, Glow imports the types from wave A on. Until then there is no
// pool for any world: enemyBulletsOf returns one shared empty pool and nothing spawns, so a run
// is bit identical to v2.1 (the Off invariant).
import type { World } from './world';

/** Most live enemy bullets, charging or flying (about 9 are needed). */
export const ENEMY_BULLET_CAP = 32;
/** Speed ceiling in u/s (Dart is 260). Phase speed ups and enrage never pass it. */
export const ENEMY_BULLET_SPEED_MAX = 240;
/** A boss fires only while the ship is at least this far from the muzzle, in u. */
export const ENEMY_BULLET_MIN_RANGE = 300;

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
const EMPTY_POOL: EnemyBulletPool = {
  cap: 0,
  alive: new Uint8Array(0),
  x: new Float32Array(0),
  y: new Float32Array(0),
  vx: new Float32Array(0),
  vy: new Float32Array(0),
  radius: new Float32Array(0),
  life: new Float32Array(0),
  arm: new Float32Array(0),
  tier: new Uint8Array(0),
  free: new Int32Array(0),
  freeTop: 0,
  liveCount: 0,
  dropped: 0,
};

/** The enemy bullet pool of a world. Stub: always the shared empty pool of cap 0. */
export function enemyBulletsOf(w: World): EnemyBulletPool {
  return EMPTY_POOL;
}

/**
 * Launch (after armSec of charge) a bullet at (x, y) along heading radians. Returns the slot, or
 * -1 when the pool is full. Stub: always -1.
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
  return -1;
}

/** Advance charge, motion and life, and test the ship. Stub: does nothing. */
export function stepEnemyBullets(w: World, dt: number): void {
  // Intentionally empty until the wave A body lands.
}

/** Remove every bullet, charging or flying (bomb, ship death, level end). Stub: does nothing. */
export function clearEnemyBullets(w: World): void {
  // Intentionally empty until the wave A body lands.
}
