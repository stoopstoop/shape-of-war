// Player bullet pool (docs/03 section 5, docs/01 section 4.2). Separate SoA pool. When full,
// the new shot is dropped (03 section 5; docs/01 says oldest removed, see hand-off).
import type { ArenaDef } from '../levelgen/leveldef';
import { confine, createConfineResult } from './arena';
import type { World } from './world';

export const BULLET_CAP = 512;
export const BULLET_SPEED = 1400;
export const BULLET_SPEED_MAX = 1600;
export const BULLET_RADIUS = 4;
export const BULLET_LIFE = 1.2;
export const SPREAD_RAD = (6 * Math.PI) / 180;
export const MUZZLE_OFFSET = 16;
/** Enemies one pierce bullet can hit: the first hit plus 3 more (docs/11 SPEC 3.5). */
export const PIERCE_HITS = 4;

export const STYLE_SPREAD = 0;
export const STYLE_RAPID = 1;
export const STYLE_PIERCE = 2;
export const STYLE_ORBIT = 3;

/** Collision radius per style, indexed by BulletPool.style. Style 0 is the v1 BULLET_RADIUS. */
const STYLE_RADIUS: readonly number[] = [BULLET_RADIUS, 3, 6, 7];

/** Collision radius for a bullet style. Unknown styles use the v1 radius. */
export function styleRadius(style: number): number {
  return STYLE_RADIUS[style] ?? BULLET_RADIUS;
}

export interface BulletPool {
  cap: number;
  alive: Uint8Array;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  life: Float32Array;
  homing: Uint8Array;
  /** Weapon style per bullet: 0 spread, 1 rapid, 2 pierce, 3 orbit blade (render contract, docs/10). */
  style: Uint8Array;
  /** Pierce: hits left before the bullet stops. 0 for every other style. */
  pierce: Uint8Array;
  /** Last enemy id this bullet hit, -1 for none. */
  lastHit: Int32Array;
  /**
   * Extra enemies a spread, rapid or drone bullet passes through before it stops (Turbo: 1).
   * 0 for the v1 rule. Pierce bullets use pierce instead.
   */
  extra: Uint8Array;
  /** extra given to every bullet spawned now (Turbo sets 1 while it runs, 0 otherwise). */
  spawnExtra: number;
  /** Every enemy id a pierce bullet has hit, PIERCE_HITS slots per bullet, -1 empty. */
  hitLog: Int32Array;
  /** Orbit blade angle in radians, written each step from the ship. */
  phase: Float32Array;
  free: Int32Array;
  freeTop: number;
  // Additive to 03 section 5.
  prevX: Float32Array;
  prevY: Float32Array;
  liveCount: number;
  /** Shots dropped because the pool was full (debug counter). */
  dropped: number;
}

export function createBulletPool(cap: number = BULLET_CAP): BulletPool {
  const free = new Int32Array(cap);
  // Stack top is the lowest id, so ids fill from 0 upward.
  for (let i = 0; i < cap; i++) free[i] = cap - 1 - i;
  return {
    cap,
    alive: new Uint8Array(cap),
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    vx: new Float32Array(cap),
    vy: new Float32Array(cap),
    life: new Float32Array(cap),
    homing: new Uint8Array(cap),
    style: new Uint8Array(cap),
    pierce: new Uint8Array(cap),
    lastHit: new Int32Array(cap).fill(-1),
    extra: new Uint8Array(cap),
    spawnExtra: 0,
    hitLog: new Int32Array(cap * PIERCE_HITS).fill(-1),
    phase: new Float32Array(cap),
    free,
    freeTop: cap,
    prevX: new Float32Array(cap),
    prevY: new Float32Array(cap),
    liveCount: 0,
    dropped: 0,
  };
}

/** Returns the bullet id, or -1 when the pool is full (shot dropped). */
export function spawnBullet(p: BulletPool, x: number, y: number, vx: number, vy: number, life: number): number {
  if (p.freeTop === 0) {
    p.dropped++;
    return -1;
  }
  p.freeTop--;
  const id = p.free[p.freeTop] ?? 0;
  p.alive[id] = 1;
  p.x[id] = x;
  p.y[id] = y;
  p.prevX[id] = x;
  p.prevY[id] = y;
  p.vx[id] = vx;
  p.vy[id] = vy;
  p.life[id] = life;
  p.homing[id] = 0;
  p.style[id] = STYLE_SPREAD;
  p.pierce[id] = 0;
  p.lastHit[id] = -1;
  p.extra[id] = p.spawnExtra;
  p.phase[id] = 0;
  p.liveCount++;
  return id;
}

export function killBullet(p: BulletPool, id: number): void {
  if (id < 0 || id >= p.cap || p.alive[id] !== 1) return;
  p.alive[id] = 0;
  p.free[p.freeTop] = id;
  p.freeTop++;
  p.liveCount--;
}

/** 3-way spread at minus 6, 0, plus 6 degrees. Speed adds the ship velocity along the aim. */
export function fireSpread(w: World, x: number, y: number, aimAngle: number): void {
  const ax = Math.cos(aimAngle);
  const ay = Math.sin(aimAngle);
  const along = (w.vx[0] ?? 0) * ax + (w.vy[0] ?? 0) * ay;
  let speed = BULLET_SPEED + along;
  if (speed > BULLET_SPEED_MAX) speed = BULLET_SPEED_MAX;
  if (speed < 0) speed = 0;
  const mx = x + ax * MUZZLE_OFFSET;
  const my = y + ay * MUZZLE_OFFSET;
  for (let k = -1; k <= 1; k++) {
    const a = aimAngle + k * SPREAD_RAD;
    spawnBullet(w.bullets, mx, my, Math.cos(a) * speed, Math.sin(a) * speed, BULLET_LIFE);
  }
}

const hitScratch = createConfineResult();

/** Pierce bullet: arm it with PIERCE_HITS hits and an empty hit log. */
export function armPierce(p: BulletPool, id: number): void {
  if (id < 0 || id >= p.cap) return;
  p.style[id] = STYLE_PIERCE;
  p.pierce[id] = PIERCE_HITS;
  const base = id * PIERCE_HITS;
  for (let k = 0; k < PIERCE_HITS; k++) p.hitLog[base + k] = -1;
}

/** True if bullet id already hit enemy e (lastHit, or for pierce the full hit log). */
export function hasHit(p: BulletPool, id: number, e: number): boolean {
  if (p.lastHit[id] === e) return true;
  if (p.style[id] !== STYLE_PIERCE) return false;
  const base = id * PIERCE_HITS;
  for (let k = 0; k < PIERCE_HITS; k++) if (p.hitLog[base + k] === e) return true;
  return false;
}

/**
 * A spread, rapid or drone bullet touching enemy e: true when it passes through (it has an extra
 * hit left and e is not the enemy it just passed), which spends the extra hit and remembers e.
 * False when it should stop as in v1. A bullet still overlapping the enemy it passed returns true
 * without spending anything. Pierce and orbit bullets never come here.
 */
export function passThrough(p: BulletPool, id: number, e: number): boolean {
  if (p.lastHit[id] === e) return true;
  const left = p.extra[id] ?? 0;
  if (left === 0) return false;
  p.extra[id] = left - 1;
  p.lastHit[id] = e;
  return true;
}

/**
 * Record a hit on enemy e. Non pierce bullets stop. A pierce bullet logs e, loses one hit and
 * stops at 0. Returns true if the bullet stopped.
 */
export function recordHit(p: BulletPool, id: number, e: number): boolean {
  p.lastHit[id] = e;
  if (p.style[id] !== STYLE_PIERCE) {
    killBullet(p, id);
    return true;
  }
  const left = p.pierce[id] ?? 0;
  const slot = PIERCE_HITS - left;
  if (slot >= 0 && slot < PIERCE_HITS) p.hitLog[id * PIERCE_HITS + slot] = e;
  const next = left > 0 ? left - 1 : 0;
  p.pierce[id] = next;
  if (next === 0) {
    killBullet(p, id);
    return true;
  }
  return false;
}

/**
 * Integrate, age and remove bullets that expire or touch a wall or obstacle. Style 0 is the v1
 * path. Orbit blades (style 3) are skipped: weapons.ts places them from the ship each step.
 */
export function stepBulletPool(p: BulletPool, arena: ArenaDef, dt: number): void {
  for (let i = 0; i < p.cap; i++) {
    if (p.alive[i] !== 1) continue;
    const style = p.style[i] ?? 0;
    if (style === STYLE_ORBIT) continue;
    const x = p.x[i] ?? 0;
    const y = p.y[i] ?? 0;
    p.prevX[i] = x;
    p.prevY[i] = y;
    const life = (p.life[i] ?? 0) - dt;
    if (life <= 0) {
      killBullet(p, i);
      continue;
    }
    p.life[i] = life;
    const nx = x + (p.vx[i] ?? 0) * dt;
    const ny = y + (p.vy[i] ?? 0) * dt;
    p.x[i] = nx;
    p.y[i] = ny;
    const r = style === STYLE_SPREAD ? BULLET_RADIUS : styleRadius(style);
    if (confine(arena, nx, ny, r, hitScratch).hit) killBullet(p, i);
  }
}

export function stepBullets(w: World, dt: number): void {
  stepBulletPool(w.bullets, w.level.arena, dt);
}
