// Pure particle state (docs/03-architecture.md section 5, docs/01-game-design.md section 12).
// Structure of arrays, fixed capacity. Allocation is a ring cursor, so when every slot is in
// use a new emit overwrites the oldest particle. No pixi.js import: particles.ts mirrors this
// state onto pre-created Particle objects. Variation comes from a stateless hash of a
// sequence counter, never from a PRNG.
import { hash01 } from './color';

export const PARTICLE_CAP = 2048;

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
}

export function createParticlePool(cap: number = PARTICLE_CAP): ParticlePool {
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
  const n = Math.min(p.cap, Math.max(0, Math.floor(b.count)));
  for (let k = 0; k < n; k++) {
    const id = p.cursor;
    p.cursor = (p.cursor + 1) % p.cap;
    p.seq = (p.seq + 1) | 0;
    const s = p.seq * 4;
    // Even angular spread plus jitter keeps a burst round without a PRNG.
    const ang = (k / n + hash01(s + 1) * 0.15) * Math.PI * 2;
    const speed = mix(b.speedMin, b.speedMax, hash01(s + 2));
    const life = mix(b.lifeMin, b.lifeMax, hash01(s + 3));
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
    p.colour[id] = b.colour2 !== null && (k & 1) === 1 ? b.colour2 : b.colour;
    p.fresh[id] = 1;
  }
  return n;
}

/** Advance every live particle by dt seconds. Dead particles keep life 0. */
export function stepParticlePool(p: ParticlePool, dt: number): void {
  const d = Math.min(Math.max(dt, 0), 0.05);
  if (d === 0) return;
  for (let i = 0; i < p.cap; i++) {
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
  p.live = 0;
}
