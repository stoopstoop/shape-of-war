// Render only particles (docs/03-architecture.md section 5). Never read by gameplay.
// 2048 Particle objects are created once inside one ParticleContainer and never removed;
// dead ones are parked offscreen with alpha 0 so the buffer length never changes. State lives
// in the pure pool (particlePool.ts); this file mirrors it onto the Particle objects.
// Particles draw as short streaks aligned to their velocity (docs/01 section 12).
import { Particle, type ParticleContainer, type Texture } from 'pixi.js';
import { hash01 } from './color';
import { planFx, type FxEvent } from './fx';
import { currentRender, palette } from './neon';
import {
  clearParticlePool,
  createParticlePool,
  emitBurst,
  PARTICLE_CAP,
  stepParticlePool,
  type Burst,
  type ParticlePool,
} from './particlePool';

export { PARTICLE_CAP } from './particlePool';

const PARK = -99999;
/** Streak texture is STREAK_TEX_LEN px long; scale so the core reads about 6 u. */
export const STREAK_TEX_LEN = 32;
const STREAK_LEN_U = 9;
const STREAK_THICK = 0.55;

interface Edge {
  items: Particle[];
  /** 1 while the Particle shows a live slot, so a dead slot is parked exactly once. */
  shown: Uint8Array;
}

const pool: ParticlePool = createParticlePool(PARTICLE_CAP);
let edge: Edge | null = null;
let stressTarget = 0;
let stressSeq = 0;
let boundsW = 800;
let boundsH = 600;

const scratch: Burst = {
  count: 0,
  speedMin: 120,
  speedMax: 500,
  lifeMin: 0.45,
  lifeMax: 1.05,
  drag: 2.5,
  colour: 0xffffff,
  colour2: null,
  inwardRadius: 0,
};

/** Create the Particle objects inside the given container. Called once by the renderer. */
export function initParticles(container: ParticleContainer, texture: Texture): void {
  const items: Particle[] = [];
  for (let i = 0; i < PARTICLE_CAP; i++) {
    const p = new Particle({ texture, x: PARK, y: PARK, alpha: 0, anchorX: 0.5, anchorY: 0.5 });
    items.push(p);
    container.addParticle(p);
  }
  edge = { items, shown: new Uint8Array(PARTICLE_CAP) };
}

/** Spray count particles from (x, y) in arena units with default speeds. */
export function burst(x: number, y: number, colour: number, count: number): void {
  scratch.count = count;
  scratch.speedMin = 120;
  scratch.speedMax = 500;
  scratch.lifeMin = 0.45;
  scratch.lifeMax = 1.05;
  scratch.drag = 2.5;
  scratch.colour = colour;
  scratch.colour2 = null;
  scratch.inwardRadius = 0;
  emitBurst(pool, x, y, scratch);
}

/** Emit the particle part of an fx event. Shake, ripple and ring are the renderer's job. */
export function burstFx(x: number, y: number, e: FxEvent): void {
  const b = planFx(e).burst;
  scratch.count = b.count;
  scratch.speedMin = b.speedMin;
  scratch.speedMax = b.speedMax;
  scratch.lifeMin = b.lifeMin;
  scratch.lifeMax = b.lifeMax;
  scratch.drag = b.drag;
  scratch.colour = palette[b.colour];
  scratch.colour2 = b.colour2 === null ? null : palette[b.colour2];
  scratch.inwardRadius = 0;
  emitBurst(pool, x, y, scratch);
}

/** Keep about n particles alive (debug stress, docs/04 section 14). 0 turns it off. */
export function setParticleStress(n: number): void {
  stressTarget = Math.max(0, Math.min(PARTICLE_CAP, Math.floor(n)));
}

/** Arena size used to place stress bursts. */
export function setParticleBounds(w: number, h: number): void {
  boundsW = w;
  boundsH = h;
}

export function liveParticleCount(): number {
  return pool.live;
}

const STRESS_KEYS = ['cyan', 'magenta', 'yellow', 'green', 'orange', 'purple'] as const;

function topUpStress(): void {
  let guard = 0;
  while (pool.live < stressTarget - 24 && guard++ < 96) {
    stressSeq = (stressSeq + 1) | 0;
    const bx = (hash01(stressSeq * 3 + 1) - 0.5) * boundsW * 0.9;
    const by = (hash01(stressSeq * 3 + 2) - 0.5) * boundsH * 0.9;
    burst(bx, by, palette[STRESS_KEYS[stressSeq % STRESS_KEYS.length] ?? 'white'], 24);
  }
}

/** Advance the pool and mirror it onto the Particle objects. dt in seconds, render clock. */
export function stepParticles(dt: number): void {
  if (stressTarget > 0) topUpStress();
  stepParticlePool(pool, dt);
  const E = edge;
  if (!E) return;
  const alphaMul = currentRender.particleAlpha;
  const baseScale = STREAK_LEN_U / STREAK_TEX_LEN;
  for (let i = 0; i < PARTICLE_CAP; i++) {
    const item = E.items[i];
    if (!item) continue;
    const life = pool.life[i] ?? 0;
    if (life <= 0) {
      if (E.shown[i] === 1) {
        E.shown[i] = 0;
        item.alpha = 0;
        item.x = PARK;
        item.y = PARK;
      }
      continue;
    }
    if (pool.fresh[i] === 1) {
      pool.fresh[i] = 0;
      item.tint = pool.colour[i] ?? 0xffffff;
    }
    E.shown[i] = 1;
    const vx = pool.vx[i] ?? 0;
    const vy = pool.vy[i] ?? 0;
    const f = life / (pool.maxLife[i] ?? 1);
    const speed = Math.sqrt(vx * vx + vy * vy);
    item.x = pool.x[i] ?? 0;
    item.y = pool.y[i] ?? 0;
    item.rotation = Math.atan2(vy, vx);
    // Fast particles stretch, slow ones shrink to dots as they fade.
    item.scaleX = baseScale * (0.5 + Math.min(speed, 900) / 450);
    item.scaleY = STREAK_THICK * (0.5 + 0.5 * f);
    item.alpha = f * alphaMul;
  }
}

/** Kill every particle (level change). */
export function clearParticles(): void {
  clearParticlePool(pool);
}
