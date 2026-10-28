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

export interface BulletPool {
  cap: number;
  alive: Uint8Array;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  life: Float32Array;
  homing: Uint8Array;
  /** V2 stub: weapon style per bullet. 0 spread, 1 rapid, 2 pierce, 3 orbit. Nothing writes it yet. */
  style: Uint8Array;
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

/** Integrate, age and remove bullets that expire or touch a wall or obstacle. */
export function stepBulletPool(p: BulletPool, arena: ArenaDef, dt: number): void {
  for (let i = 0; i < p.cap; i++) {
    if (p.alive[i] !== 1) continue;
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
    if (confine(arena, nx, ny, BULLET_RADIUS, hitScratch).hit) killBullet(p, i);
  }
}

export function stepBullets(w: World, dt: number): void {
  stepBulletPool(w.bullets, w.level.arena, dt);
}
