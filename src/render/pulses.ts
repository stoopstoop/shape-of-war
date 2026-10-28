// Sprite pulses (run 0180 map effects fix). Pure, no pixi.js import, no PRNG.
// Short lived additive sprites that cost one Particle each in one ParticleContainer (one draw
// call for all of them): the kill shockwave ring in the enemy hue, the wall glow where a bullet
// hits a wall, and the streak a Blink leaves when it jumps. Structure of arrays, fixed capacity,
// a ring cursor that overwrites the oldest when full. Nothing allocates after createPulsePool.

export const PULSE_RING = 0;
export const PULSE_BAR = 1;
export const PULSE_STREAK = 2;
/** Run 0198 hit feedback (hitFx.ts): the Bulwark deflect arc and the tiny multi HP hit flash. */
export const PULSE_ARC = 3;
export const PULSE_FLASH = 4;
export type PulseShape = typeof PULSE_RING | typeof PULSE_BAR | typeof PULSE_STREAK | typeof PULSE_ARC | typeof PULSE_FLASH;

/** Pool size: rings, wall glows and streaks share it. */
export const PULSE_CAP = 48;

/** Kill shockwave ring: start and end radius (u) and life (s). Big kills scale the end radius. */
export const SHOCK_R0 = 10;
export const SHOCK_R1 = 120;
export const SHOCK_LIFE = 0.38;
export const SHOCK_BIG_MUL = 1.6;
/** Bullet wall glow: length along the wall (u), life (s) and the hit distance that counts. */
export const WALL_GLOW_LEN = 90;
export const WALL_GLOW_THICK = 1.5;
export const WALL_GLOW_LIFE = 0.3;
export const WALL_HIT_RANGE = 30;
/** Blink jump streak life (s). */
export const STREAK_LIFE = 0.32;

export interface PulsePool {
  readonly cap: number;
  readonly shape: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly rot: Float32Array;
  /** Ring: start and end radius. Bar and streak: r0 is the length, r1 the thickness. */
  readonly r0: Float32Array;
  readonly r1: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly strength: Float32Array;
  readonly colour: Uint32Array;
  /** 1 when a slot was (re)filled since the edge last read it (frame and tint change). */
  readonly fresh: Uint8Array;
  cursor: number;
  live: number;
}

export function createPulsePool(cap: number = PULSE_CAP): PulsePool {
  const n = Math.max(1, Math.floor(cap));
  return {
    cap: n,
    shape: new Uint8Array(n),
    x: new Float32Array(n),
    y: new Float32Array(n),
    rot: new Float32Array(n),
    r0: new Float32Array(n),
    r1: new Float32Array(n),
    age: new Float32Array(n).fill(1),
    life: new Float32Array(n),
    strength: new Float32Array(n),
    colour: new Uint32Array(n),
    fresh: new Uint8Array(n),
    cursor: 0,
    live: 0,
  };
}

/** Pure: is slot i live. */
export function pulseLive(p: PulsePool, i: number): boolean {
  return (p.age[i] ?? 0) < (p.life[i] ?? 0);
}

/** Start a pulse. Returns the slot, or -1 for invalid input. */
export function addPulse(
  p: PulsePool,
  shape: PulseShape,
  x: number,
  y: number,
  rot: number,
  r0: number,
  r1: number,
  life: number,
  colour: number,
  strength: number,
): number {
  if (!(life > 0) || !(strength > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return -1;
  const id = p.cursor;
  p.cursor = (p.cursor + 1) % p.cap;
  if (!pulseLive(p, id)) p.live++;
  p.shape[id] = shape;
  p.x[id] = x;
  p.y[id] = y;
  p.rot[id] = Number.isFinite(rot) ? rot : 0;
  p.r0[id] = r0;
  p.r1[id] = r1;
  p.age[id] = 0;
  p.life[id] = life;
  p.strength[id] = Math.min(1, strength);
  p.colour[id] = colour >>> 0;
  p.fresh[id] = 1;
  return id;
}

/** Age every live pulse by dt seconds. Returns the live count. */
export function stepPulses(p: PulsePool, dt: number): number {
  const d = Number.isFinite(dt) ? Math.min(0.1, Math.max(0, dt)) : 0;
  let n = 0;
  for (let i = 0; i < p.cap; i++) {
    if (!pulseLive(p, i)) continue;
    const a = (p.age[i] ?? 0) + d;
    p.age[i] = a;
    if (a < (p.life[i] ?? 0)) n++;
  }
  p.live = n;
  return n;
}

/** Kill every pulse (level change). */
export function clearPulses(p: PulsePool): void {
  p.age.fill(1);
  p.life.fill(0);
  p.live = 0;
}

/** Pure: cubic ease out on [0, 1]. */
export function easeOut(u: number): number {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  const r = 1 - t;
  return 1 - r * r * r;
}

/** Pure: ring radius at life fraction u, from r0 racing out to r1. */
export function shockRadius(r0: number, r1: number, u: number): number {
  return r0 + (r1 - r0) * easeOut(u);
}

/** Pure: alpha of a pulse shape at life fraction u. 0 outside [0, 1). */
export function pulseAlpha(shape: number, u: number): number {
  if (!(u >= 0) || u >= 1) return 0;
  const r = 1 - u;
  if (shape === PULSE_RING) return Math.pow(r, 1.5);
  if (shape === PULSE_BAR) return Math.pow(r, 1.2);
  if (shape === PULSE_ARC) return Math.pow(r, 1.5);
  if (shape === PULSE_FLASH) return r * r;
  return r;
}
