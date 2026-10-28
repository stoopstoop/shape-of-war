// Render only particles (docs/03-architecture.md section 5). Never read by gameplay.
// MAX_PARTICLE_CAP (the largest effects tier) Particle objects are created once at boot. The
// ParticleContainer holds only the first `limit` of them (the tier cap), so the standard tier
// uploads 2048 particles per frame, not 4096; a tier change adds or removes the tail once.
// Dead ones are parked offscreen with alpha 0 so the buffer length only changes on a tier
// change. State lives in the pure pool (particlePool.ts); this file mirrors it onto the
// Particle objects. Particles draw as short streaks aligned to their velocity (docs/01 12).
// v2 trails (ship and bullet) go into the same pool through emitTrail, are refused above 80
// percent live and are shed first, and are off on the low tier.
import { Particle, type ParticleContainer, type Texture } from 'pixi.js';
import { hash01 } from './color';
import { getEffectsTier, MAX_PARTICLE_CAP, onEffectsTierChanged, particleCapFor, tierBurstCount, trailsOn, type EffectsTier } from './effects';
import { planFx, type FxEvent } from './fx';
import { currentRender, palette } from './neon';
import {
  clearParticlePool,
  createParticlePool,
  emitBurst,
  emitTrail,
  setPoolLimit,
  shedTrails,
  stepParticlePool,
  type Burst,
  type ParticlePool,
  type TrailSpec,
} from './particlePool';
import { bulletTrailParticle, enemyTrailParticle, shipTrailParticle, shipTrailRate, stepEmitter, type Emitter } from './trails';

export { PARTICLE_CAP } from './particlePool';

const PARK = -99999;
/** Streak texture is STREAK_TEX_LEN px long; scale so the core reads about 6 u. */
export const STREAK_TEX_LEN = 32;
const STREAK_LEN_U = 9;
const STREAK_THICK = 0.55;

interface Edge {
  container: ParticleContainer;
  items: Particle[];
  /** 1 while the Particle shows a live slot, so a dead slot is parked exactly once. */
  shown: Uint8Array;
  /** Number of items currently inside the container (the pool limit at the last sync). */
  attached: number;
}

const pool: ParticlePool = createParticlePool(MAX_PARTICLE_CAP, particleCapFor(getEffectsTier()));
let edge: Edge | null = null;
let trailsEnabled = trailsOn(getEffectsTier());
/** Tier used for burst density: high scales burst counts by 1.5, limited by the live cap. */
let burstTier: EffectsTier = getEffectsTier();
const trailScratch: TrailSpec = { x: 0, y: 0, vx: 0, vy: 0, life: 0, drag: 0, colour: 0 };
const shipEmitter: Emitter = { acc: 0 };
let trailSeq = 0;
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

/** Attach or detach the container tail so it holds exactly pool.limit Particles. */
function syncAttached(E: Edge): void {
  const want = pool.limit;
  if (want === E.attached) return;
  if (want > E.attached) {
    for (let i = E.attached; i < want; i++) {
      const p = E.items[i];
      if (p) E.container.addParticle(p);
    }
  } else {
    E.container.removeParticles(want, E.attached);
    for (let i = want; i < E.attached; i++) {
      const p = E.items[i];
      if (p) {
        p.alpha = 0;
        p.x = PARK;
        p.y = PARK;
      }
      E.shown[i] = 0;
    }
  }
  E.attached = want;
}

function applyTier(t: EffectsTier): void {
  setPoolLimit(pool, particleCapFor(t));
  trailsEnabled = trailsOn(t);
  burstTier = t;
  if (!trailsEnabled) shipEmitter.acc = 0;
  if (edge) syncAttached(edge);
}

let offTier: (() => void) | null = null;

/**
 * Create every Particle object (sized for the largest tier) and attach the current tier's
 * share to the container. Called once by the renderer.
 */
export function initParticles(container: ParticleContainer, texture: Texture): void {
  const items: Particle[] = [];
  for (let i = 0; i < MAX_PARTICLE_CAP; i++) {
    items.push(new Particle({ texture, x: PARK, y: PARK, alpha: 0, anchorX: 0.5, anchorY: 0.5 }));
  }
  edge = { container, items, shown: new Uint8Array(MAX_PARTICLE_CAP), attached: 0 };
  offTier?.();
  offTier = onEffectsTierChanged(applyTier);
  applyTier(getEffectsTier());
}

/** Stop following tier changes (renderer destroy). */
export function disposeParticles(): void {
  offTier?.();
  offTier = null;
  edge = null;
}

/** Whether trails are on for the current tier. */
export function trailsActive(): boolean {
  return trailsEnabled;
}

/**
 * Ship trail for one frame: (x, y) is the drawn ship position and (vx, vy) its velocity in u/s.
 * Emits at shipTrailRate(speed), so nothing below 60 u/s. Off on low; refused above 80 percent.
 */
export function emitShipTrail(x: number, y: number, vx: number, vy: number, dt: number): void {
  if (!trailsEnabled) return;
  const n = stepEmitter(shipEmitter, shipTrailRate(Math.sqrt(vx * vx + vy * vy)), dt);
  const colour = palette.ship;
  for (let k = 0; k < n; k++) {
    trailSeq = (trailSeq + 1) | 0;
    shipTrailParticle(trailScratch, x, y, vx, vy, dt, trailSeq, k, n, colour);
    if (!emitTrail(pool, trailScratch)) break;
  }
}

/** Reset the ship trail accumulator (ship dead or level change). */
export function resetShipTrail(): void {
  shipEmitter.acc = 0;
}

/**
 * Bullet trail for one bullet for one frame. e is the slot's emitter, rate from bulletTrailRate.
 * Off on low; refused above 80 percent.
 */
export function emitBulletTrail(
  e: Emitter,
  rate: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  style: number,
  colour: number,
  dt: number,
): void {
  if (!trailsEnabled) return;
  const n = stepEmitter(e, rate, dt);
  for (let k = 0; k < n; k++) {
    trailSeq = (trailSeq + 1) | 0;
    bulletTrailParticle(trailScratch, x, y, vx, vy, style, trailSeq, colour);
    if (!emitTrail(pool, trailScratch)) break;
  }
}

/**
 * Enemy trail for one entity for one frame (Swirl trail, Charger dash streak). e is the
 * entity's emitter, type ENEMY_TRAIL_SWIRL or ENEMY_TRAIL_CHARGER, (vx, vy) the drawn
 * velocity. Off on low; refused above 80 percent live and shed first, like every trail.
 */
export function emitEnemyTrail(
  e: Emitter,
  rate: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  type: number,
  colour: number,
  dt: number,
): void {
  if (!trailsEnabled) {
    e.acc = 0;
    return;
  }
  const n = stepEmitter(e, rate, dt);
  for (let k = 0; k < n; k++) {
    trailSeq = (trailSeq + 1) | 0;
    enemyTrailParticle(trailScratch, x, y, vx, vy, type, trailSeq, colour);
    if (!emitTrail(pool, trailScratch)) break;
  }
}

/** Small burst with explicit speeds and life (Blink arrival flash, Slime splat). */
export function burstSmall(
  x: number,
  y: number,
  colour: number,
  count: number,
  speedMin: number,
  speedMax: number,
  life: number,
): void {
  scratch.count = count;
  scratch.speedMin = speedMin;
  scratch.speedMax = speedMax;
  scratch.lifeMin = life * 0.7;
  scratch.lifeMax = life;
  scratch.drag = 4;
  scratch.colour = colour;
  scratch.colour2 = null;
  scratch.inwardRadius = 0;
  emitBurst(pool, x, y, scratch);
}

/** Spray count particles from (x, y) in arena units with default speeds. */
export function burst(x: number, y: number, colour: number, count: number): void {
  scratch.count = tierBurstCount(count, burstTier, pool.limit);
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
  scratch.count = tierBurstCount(b.count, burstTier, pool.limit);
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
  stressTarget = Math.max(0, Math.min(MAX_PARTICLE_CAP, Math.floor(n)));
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
  const target = Math.min(stressTarget, pool.limit);
  while (pool.live < target - 24 && guard++ < 96) {
    stressSeq = (stressSeq + 1) | 0;
    const bx = (hash01(stressSeq * 3 + 1) - 0.5) * boundsW * 0.9;
    const by = (hash01(stressSeq * 3 + 2) - 0.5) * boundsH * 0.9;
    burst(bx, by, palette[STRESS_KEYS[stressSeq % STRESS_KEYS.length] ?? 'white'], 24);
  }
}

/** Advance the pool and mirror it onto the Particle objects. dt in seconds, render clock. */
export function stepParticles(dt: number): void {
  if (stressTarget > 0) topUpStress();
  shedTrails(pool);
  stepParticlePool(pool, dt);
  const E = edge;
  if (!E) return;
  const alphaMul = currentRender.particleAlpha;
  const baseScale = STREAK_LEN_U / STREAK_TEX_LEN;
  const n = Math.min(E.attached, pool.limit);
  for (let i = 0; i < n; i++) {
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
  shipEmitter.acc = 0;
}
