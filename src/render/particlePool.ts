// Pure particle state (docs/03-architecture.md section 5, docs/01-game-design.md section 12).
// Structure of arrays, fixed capacity. Allocation is a ring cursor, so when every slot is in
// use a new emit overwrites the oldest particle. No pixi.js import: particles.ts mirrors this
// state onto pre-created Particle objects. Variation comes from a stateless hash of a
// sequence counter, never from a PRNG.
// v2: the arrays are sized once for the largest effects tier (cap) and the ring runs inside
// an active limit set by the tier, so a tier change never allocates. Trail particles carry a
// flag: they are refused and shed first while the pool is above TRAIL_SHED_FRAC of the limit.
import { hash01 } from './color';

/** Default cap, the low and standard tier cap (effects.ts holds the per tier table). */
export const PARTICLE_CAP = 2048;

/** Trails are refused and shed while live particles exceed this fraction of the limit. */
export const TRAIL_SHED_FRAC = 0.8;

export interface ParticlePool {
  readonly cap: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  readonly drag: Float32Array;
  readonly colour: Uint32Array;
  /** 1 when a slot was (re)filled since the edge last read it, so the edge sets the tint. */
  readonly fresh: Uint8Array;
  /** 1 for a trail particle (ship or bullet trail), 0 for a burst particle. */
  readonly trail: Uint8Array;
  /** Draw size multiplier (1 for an ordinary spark, larger for a burst's embers). */
  readonly size: Float32Array;
  /** Active cap, 1..cap. The ring cursor and every emit stay below it. */
  limit: number;
  cursor: number;
  live: number;
  seq: number;
}

/** One spray of particles. Speeds in arena units per second, lifetimes in seconds. */
export interface Burst {
  count: number;
  speedMin: number;
  speedMax: number;
  lifeMin: number;
  lifeMax: number;
  /** Exponential velocity decay per second. */
  drag: number;
  colour: number;
  /** Every other particle uses this colour when set (ship death, well explosion). */
  colour2: number | null;
  /** Particles start on a ring of this radius and fly inward (telegraph). 0 for outward. */
  inwardRadius: number;
  /**
   * Two sizes (run 0180): every bigEvery-th particle (k % bigEvery === 0) is an ember, drawn
   * bigSize times larger, flying at bigSpeedMul of the speed for bigLifeMul of the life, always in
   * colour (never colour2). 0 or unset: every particle is an ordinary spark.
   */
  bigEvery?: number;
  bigSize?: number;
  bigSpeedMul?: number;
  bigLifeMul?: number;
}

/** Ember defaults for a Burst that sets bigEvery but not the rest. */
export const EMBER_SIZE = 2.1;
export const EMBER_SPEED_MUL = 0.45;
export const EMBER_LIFE_MUL = 1.4;

/** Pure: is particle k of a burst an ember. */
export function isEmber(b: Burst, k: number): boolean {
  const e = b.bigEvery ?? 0;
  return e >= 1 && k % Math.floor(e) === 0;
}

export function createParticlePool(cap: number = PARTICLE_CAP, limit: number = cap): ParticlePool {
  return {
    cap,
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    vx: new Float32Array(cap),
    vy: new Float32Array(cap),
    life: new Float32Array(cap),
    maxLife: new Float32Array(cap),
    drag: new Float32Array(cap),
    colour: new Uint32Array(cap),
    fresh: new Uint8Array(cap),
    trail: new Uint8Array(cap),
    size: new Float32Array(cap).fill(1),
    limit: Math.max(1, Math.min(cap, Math.floor(limit))),
    cursor: 0,
    live: 0,
    seq: 0,
  };
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Emit one burst at (x, y). Returns the number of particles written (never above cap). */
export function emitBurst(p: ParticlePool, x: number, y: number, b: Burst): number {
  const n = Math.min(p.limit, Math.max(0, Math.floor(b.count)));
  for (let k = 0; k < n; k++) {
    const id = nextSlot(p);
    p.seq = (p.seq + 1) | 0;
    const s = p.seq * 4;
    // Even angular spread plus jitter keeps a burst round without a PRNG.
    const ang = (k / n + hash01(s + 1) * 0.15) * Math.PI * 2;
    const ember = isEmber(b, k);
    const speed = mix(b.speedMin, b.speedMax, hash01(s + 2)) * (ember ? (b.bigSpeedMul ?? EMBER_SPEED_MUL) : 1);
    const life = mix(b.lifeMin, b.lifeMax, hash01(s + 3)) * (ember ? (b.bigLifeMul ?? EMBER_LIFE_MUL) : 1);
    const cx = Math.cos(ang);
    const cy = Math.sin(ang);
    if ((p.life[id] ?? 0) <= 0) p.live++;
    if (b.inwardRadius > 0) {
      p.x[id] = x + cx * b.inwardRadius;
      p.y[id] = y + cy * b.inwardRadius;
      p.vx[id] = -cx * speed;
      p.vy[id] = -cy * speed;
    } else {
      p.x[id] = x;
      p.y[id] = y;
      p.vx[id] = cx * speed;
      p.vy[id] = cy * speed;
    }
    p.life[id] = life;
    p.maxLife[id] = life;
    p.drag[id] = b.drag;
    p.colour[id] = !ember && b.colour2 !== null && (k & 1) === 1 ? b.colour2 : b.colour;
    p.fresh[id] = 1;
    p.trail[id] = 0;
    p.size[id] = ember ? (b.bigSize ?? EMBER_SIZE) : 1;
  }
  return n;
}

/** Take the slot under the ring cursor and advance it inside the active limit. */
function nextSlot(p: ParticlePool): number {
  if (p.cursor >= p.limit) p.cursor = 0;
  const id = p.cursor;
  p.cursor = (p.cursor + 1) % p.limit;
  return id;
}

/** Pure: whether one more trail particle keeps live at or under the shed threshold. */
export function trailRoom(p: ParticlePool): boolean {
  return p.live + 1 <= p.limit * TRAIL_SHED_FRAC;
}

/** One trail particle. Position, velocity and colour are the caller's; jitter is its hash01. */
export interface TrailSpec {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  drag: number;
  colour: number;
  /** Draw size multiplier, 1 when unset. */
  size?: number;
}

/**
 * Emit one trail particle unless the pool is at or above the shed threshold. Returns true when
 * one was written. Trails alone never push the pool past TRAIL_SHED_FRAC of the limit.
 */
export function emitTrail(p: ParticlePool, t: TrailSpec): boolean {
  if (!trailRoom(p) || !(t.life > 0)) return false;
  const id = nextSlot(p);
  p.seq = (p.seq + 1) | 0;
  if ((p.life[id] ?? 0) <= 0) p.live++;
  p.x[id] = t.x;
  p.y[id] = t.y;
  p.vx[id] = t.vx;
  p.vy[id] = t.vy;
  p.life[id] = t.life;
  p.maxLife[id] = t.life;
  p.drag[id] = t.drag;
  p.colour[id] = t.colour;
  p.fresh[id] = 1;
  p.trail[id] = 1;
  p.size[id] = t.size !== undefined && t.size > 0 ? t.size : 1;
  return true;
}

/**
 * Kill live trail particles while the pool is above the shed threshold, so bursts keep their
 * slots. Returns the number shed. Burst particles are never touched.
 */
export function shedTrails(p: ParticlePool): number {
  const target = p.limit * TRAIL_SHED_FRAC;
  if (p.live <= target) return 0;
  let shed = 0;
  for (let i = 0; i < p.limit && p.live > target; i++) {
    if (p.trail[i] === 1 && (p.life[i] ?? 0) > 0) {
      p.life[i] = 0;
      p.live--;
      shed++;
    }
  }
  return shed;
}

/**
 * Set the active limit (effects tier change), clamped to 1..cap. Shrinking kills every particle
 * at or above the new limit, so live never exceeds the limit. Allocates nothing.
 */
export function setPoolLimit(p: ParticlePool, limit: number): void {
  const next = Math.max(1, Math.min(p.cap, Math.floor(limit)));
  for (let i = next; i < p.limit; i++) {
    if ((p.life[i] ?? 0) > 0) {
      p.life[i] = 0;
      p.live--;
    }
  }
  p.limit = next;
  if (p.cursor >= next) p.cursor = 0;
}

/** Advance every live particle by dt seconds. Dead particles keep life 0. */
export function stepParticlePool(p: ParticlePool, dt: number): void {
  const d = Math.min(Math.max(dt, 0), 0.05);
  if (d === 0) return;
  for (let i = 0; i < p.limit; i++) {
    const life = p.life[i] ?? 0;
    if (life <= 0) continue;
    const next = life - d;
    if (next <= 0) {
      p.life[i] = 0;
      p.live--;
      continue;
    }
    p.life[i] = next;
    const k = Math.exp(-(p.drag[i] ?? 0) * d);
    const vx = (p.vx[i] ?? 0) * k;
    const vy = (p.vy[i] ?? 0) * k;
    p.vx[i] = vx;
    p.vy[i] = vy;
    p.x[i] = (p.x[i] ?? 0) + vx * d;
    p.y[i] = (p.y[i] ?? 0) + vy * d;
  }
}

/** Kill every particle. */
export function clearParticlePool(p: ParticlePool): void {
  p.life.fill(0);
  p.trail.fill(0);
  p.live = 0;
}
