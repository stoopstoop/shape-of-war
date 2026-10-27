// Render only particles (docs/03-architecture.md section 5). Never read by gameplay.
// A fixed pool of Particle objects lives in one ParticleContainer; dead particles are
// parked offscreen with alpha 0 and never removed, so the buffer length never changes.
// Spray variation uses a stateless hash of a counter, not a PRNG.
import { Particle, type ParticleContainer, type Texture } from 'pixi.js';
import { hash01 } from './color';

export const PARTICLE_CAP = 2048;
const PARK = -99999;
const DRAG = 2.2; // per second, exponential velocity decay
const BASE_SCALE = 0.5;

interface Pool {
  container: ParticleContainer;
  items: Particle[];
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  free: Int32Array;
  freeTop: number;
  live: number;
}

let pool: Pool | null = null;
let counter = 0;
let stressTarget = 0;
let boundsW = 800;
let boundsH = 600;

/** Create the pool inside the given container. Called once by the renderer. */
export function initParticles(container: ParticleContainer, texture: Texture): void {
  const items: Particle[] = [];
  const free = new Int32Array(PARTICLE_CAP);
  for (let i = 0; i < PARTICLE_CAP; i++) {
    const p = new Particle({ texture, x: PARK, y: PARK, alpha: 0, anchorX: 0.5, anchorY: 0.5 });
    items.push(p);
    container.addParticle(p);
    free[i] = PARTICLE_CAP - 1 - i;
  }
  pool = {
    container,
    items,
    x: new Float32Array(PARTICLE_CAP),
    y: new Float32Array(PARTICLE_CAP),
    vx: new Float32Array(PARTICLE_CAP),
    vy: new Float32Array(PARTICLE_CAP),
    life: new Float32Array(PARTICLE_CAP),
    maxLife: new Float32Array(PARTICLE_CAP),
    free,
    freeTop: PARTICLE_CAP,
    live: 0,
  };
}

/** Spray count particles from (x, y) in arena units. Drops the rest when the pool is full. */
export function burst(x: number, y: number, colour: number, count: number): void {
  const P = pool;
  if (!P) return;
  const n = Math.max(0, Math.floor(count));
  for (let k = 0; k < n && P.freeTop > 0; k++) {
    const id = P.free[--P.freeTop] ?? 0;
    const item = P.items[id];
    if (!item) continue;
    counter = (counter + 1) | 0;
    const ang = (counter * 0.6180339887 + hash01(counter) * 0.25) * Math.PI * 2;
    const speed = 120 + 380 * hash01(counter + 7919);
    P.x[id] = x;
    P.y[id] = y;
    P.vx[id] = Math.cos(ang) * speed;
    P.vy[id] = Math.sin(ang) * speed;
    const life = 0.45 + 0.6 * hash01(counter + 104729);
    P.life[id] = life;
    P.maxLife[id] = life;
    item.tint = colour;
    item.alpha = 1;
    item.x = x;
    item.y = y;
    P.live++;
  }
}

/** Keep about n particles alive (debug stress, 04 section 14). 0 turns it off. */
export function setParticleStress(n: number): void {
  stressTarget = Math.max(0, Math.min(PARTICLE_CAP, Math.floor(n)));
}

/** Arena size used to place stress bursts. */
export function setParticleBounds(w: number, h: number): void {
  boundsW = w;
  boundsH = h;
}

export function liveParticleCount(): number {
  return pool ? pool.live : 0;
}

const STRESS_COLOURS = [0x33ccff, 0xff44cc, 0xffcc33, 0x66ff66];

/** Advance every live particle. dt in seconds, render clock. */
export function stepParticles(dt: number): void {
  const P = pool;
  if (!P) return;
  const d = Math.min(Math.max(dt, 0), 0.05);
  if (stressTarget > 0) {
    let guard = 0;
    while (P.live < stressTarget && guard++ < 64) {
      counter = (counter + 1) | 0;
      const bx = (hash01(counter + 31) - 0.5) * boundsW * 0.9;
      const by = (hash01(counter + 37) - 0.5) * boundsH * 0.9;
      burst(bx, by, STRESS_COLOURS[counter & 3] ?? 0xffffff, 24);
    }
  }
  const decay = Math.exp(-DRAG * d);
  for (let i = 0; i < PARTICLE_CAP; i++) {
    const life = P.life[i] ?? 0;
    if (life <= 0) continue;
    const item = P.items[i];
    if (!item) continue;
    const next = life - d;
    if (next <= 0) {
      P.life[i] = 0;
      item.alpha = 0;
      item.x = PARK;
      item.y = PARK;
      P.free[P.freeTop++] = i;
      P.live--;
      continue;
    }
    P.life[i] = next;
    const vx = (P.vx[i] ?? 0) * decay;
    const vy = (P.vy[i] ?? 0) * decay;
    P.vx[i] = vx;
    P.vy[i] = vy;
    const nx = (P.x[i] ?? 0) + vx * d;
    const ny = (P.y[i] ?? 0) + vy * d;
    P.x[i] = nx;
    P.y[i] = ny;
    const f = next / (P.maxLife[i] ?? 1);
    item.x = nx;
    item.y = ny;
    item.alpha = f;
    item.scaleX = item.scaleY = BASE_SCALE * (0.4 + 0.6 * f);
  }
}

/** Kill every particle (level change). */
export function clearParticles(): void {
  const P = pool;
  if (!P) return;
  P.freeTop = 0;
  for (let i = PARTICLE_CAP - 1; i >= 0; i--) {
    P.life[i] = 0;
    const item = P.items[i];
    if (item) {
      item.alpha = 0;
      item.x = PARK;
      item.y = PARK;
    }
    P.free[P.freeTop++] = i;
  }
  P.live = 0;
}
