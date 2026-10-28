// Pure dust motes (v2 SPEC addendum 3.8): about 200 dim specks drifting slowly behind the grid on
// the standard and high tiers. Render only, no pixi.js import, no PRNG: every mote's start,
// drift and twinkle come from hash01 of its index. Arrays are allocated once in createDust;
// seeding and stepping allocate nothing.
import type { ArenaDef } from '../../levelgen/leveldef';
import { hash01 } from '../color';
import { halfExtent } from '../gridGeom';

export const DUST_COUNT = 200;
export const DUST_SPEED_MIN = 4;
export const DUST_SPEED_MAX = 14;
/** Mote size range in arena units. */
export const DUST_SIZE_MIN = 1.6;
export const DUST_SIZE_MAX = 3.4;
/** Peak alpha of a mote before the grid alpha (applyNeon) scales the whole layer. */
export const DUST_ALPHA = 0.5;
const TWINKLE_HZ_MIN = 0.08;
const TWINKLE_HZ_MAX = 0.3;
const TAU = Math.PI * 2;

export interface Dust {
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly size: Float32Array;
  readonly phase: Float32Array;
  readonly hz: Float32Array;
  halfW: number;
  halfH: number;
}

export function createDust(count: number = DUST_COUNT): Dust {
  const n = Math.max(0, Math.floor(count));
  return {
    count: n,
    x: new Float32Array(n),
    y: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    size: new Float32Array(n),
    phase: new Float32Array(n),
    hz: new Float32Array(n),
    halfW: 1,
    halfH: 1,
  };
}

/** Place every mote for an arena of this size. Same size, same layout. */
export function seedDust(d: Dust, width: number, height: number): void {
  d.halfW = Math.max(1, width / 2);
  d.halfH = Math.max(1, height / 2);
  for (let i = 0; i < d.count; i++) {
    const b = i * 7;
    d.x[i] = (hash01(b + 1) * 2 - 1) * d.halfW;
    d.y[i] = (hash01(b + 2) * 2 - 1) * d.halfH;
    const a = hash01(b + 3) * TAU;
    const sp = DUST_SPEED_MIN + (DUST_SPEED_MAX - DUST_SPEED_MIN) * hash01(b + 4);
    d.vx[i] = Math.cos(a) * sp;
    d.vy[i] = Math.sin(a) * sp;
    d.size[i] = DUST_SIZE_MIN + (DUST_SIZE_MAX - DUST_SIZE_MIN) * hash01(b + 5);
    d.phase[i] = hash01(b + 6);
    d.hz[i] = TWINKLE_HZ_MIN + (TWINKLE_HZ_MAX - TWINKLE_HZ_MIN) * hash01(b + 7);
  }
}

/** Pure: wrap v into [-h, h). */
export function wrap(v: number, h: number): number {
  const span = 2 * h;
  let r = (v + h) % span;
  if (r < 0) r += span;
  return r - h;
}

/** Drift every mote by dt seconds, wrapping at the arena box. */
export function stepDust(d: Dust, dt: number): void {
  const t = Number.isFinite(dt) ? Math.min(0.1, Math.max(0, dt)) : 0;
  if (t === 0) return;
  for (let i = 0; i < d.count; i++) {
    d.x[i] = wrap((d.x[i] ?? 0) + (d.vx[i] ?? 0) * t, d.halfW);
    d.y[i] = wrap((d.y[i] ?? 0) + (d.vy[i] ?? 0) * t, d.halfH);
  }
}

/** Pure: whether a point is inside the arena shape and outside every obstacle. */
export function insideArena(a: ArenaDef, x: number, y: number): boolean {
  const half = halfExtent(a, 'v', x);
  if (half <= 0 || Math.abs(y) > half) return false;
  for (const o of a.obstacles) {
    if (Math.abs(x - o.cx) < o.w / 2 && Math.abs(y - o.cy) < o.h / 2) return false;
  }
  return true;
}

/** Pure: a mote's alpha at time t seconds, a slow twinkle between 0.25 and 1 of DUST_ALPHA. */
export function dustAlpha(d: Dust, i: number, t: number): number {
  const s = Math.sin(((d.phase[i] ?? 0) + t * (d.hz[i] ?? 0)) * TAU);
  return DUST_ALPHA * (0.625 + 0.375 * s);
}
