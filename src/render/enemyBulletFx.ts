// Pure enemy bullet look (docs/13 "Boss projectiles" rule 11, docs/12 "Design: boss projectiles"
// render path). No pixi.js import. Reads the pool fields only (enemyBulletsOf(w) in
// src/game/enemyBullets.ts): for each live id x, y, vx, vy, radius, tier and arm. While arm is above
// 0 the bullet is charging at the muzzle and (vx, vy) is its heading. Look: a ring in the shooter's
// tier colour with a white core, drawn at radius 9 for a collision radius of 6, a 3 Hz pulse (off at
// Low), and while charging a thin dim aim line of 300 u with a growing core, then a launch flash.
// Player bullets are solid coloured dots and streaks and pickups are spinning pentagons, so a hollow
// ring with a white centre (and, while charging, its aim line) reads apart from both.
import type { EnemyBulletPool } from '../game/enemyBullets';
import { tierOf } from './bossLook';
import { clampNum } from './color';
import { flameAt } from './emberFlame';
import type { EffectsTier } from './effects';
import { hazardTelegraphSec } from './hazardFx';
import { F_BRING, F_DOT, F_GLOW, pushLine, pushSprite, type FxHalo, type SpriteBuf } from './fxSprites';

/** The pool fields the render path reads. */
export type EnemyBulletsLike = Pick<EnemyBulletPool, 'cap' | 'alive' | 'x' | 'y' | 'vx' | 'vy' | 'radius' | 'arm' | 'tier'>;

/** Drawn ring radius over collision radius: 9 for 6 (the hit is smaller than the shape). */
export const EB_DRAW_SCALE = 1.5;
/** Drawn ring radius for the contract collision radius of 6. */
export const EB_RENDER_R = 9;
/** White core radius when flying, and at the start of the charge. */
export const EB_CORE_R = 3.5;
export const EB_CORE_R0 = 1.2;
/** Aim line length and its alpha at the start and the end of the charge (thin and dim). */
export const EB_AIM_LEN = 300;
export const EB_AIM_A0 = 0.12;
export const EB_AIM_A1 = 0.42;
export const EB_AIM_THICK = 1.2;
/** Ring pulse: 3 Hz, plus and minus 12 percent of the radius. Off at Low. */
export const EB_PULSE_HZ = 3;
export const EB_PULSE_AMP = 0.12;
/** Launch flash life and radius. */
export const EB_FLASH_SEC = 0.16;
export const EB_FLASH_R = 22;
/** Halo glow diameter as a multiple of the ring diameter. */
export const EB_HALO_MUL = 2.2;
/** Instances per bullet at most (charging: aim halo, aim core, glow, ring, core). */
export const EB_INSTANCES = 5;

const SIM_DT = 1 / 120;

function fin(v: number, d: number): number {
  return Number.isFinite(v) ? v : d;
}

/** Pure: charge progress 0 (just born) to 1 (launch) from arm seconds left and the tier telegraph. */
export function chargeProgress(arm: number, teleSec: number): number {
  const a = fin(arm, 0);
  if (a <= 0) return 1;
  const t = fin(teleSec, 1) > 0 ? fin(teleSec, 1) : 1;
  return clampNum(1 - a / t, 0, 1);
}

/** Pure: aim line alpha. 0 once flying; while charging it rises from 0.12 to 0.42 (thin and dim). */
export function aimLineAlpha(arm: number, teleSec: number): number {
  if (!(fin(arm, 0) > 0)) return 0;
  return EB_AIM_A0 + (EB_AIM_A1 - EB_AIM_A0) * chargeProgress(arm, teleSec);
}

/** Pure: white core radius. Grows from 1.2 to 3.5 over the charge, 3.5 when flying. */
export function chargeRadius(arm: number, teleSec: number): number {
  return EB_CORE_R0 + (EB_CORE_R - EB_CORE_R0) * chargeProgress(arm, teleSec);
}

/** Pure: ring radius scale on the render clock. 3 Hz, phase from a per slot seed; exactly 1 at Low. */
export function bulletPulse(timeSec: number, seed: number, effects: EffectsTier): number {
  if (effects === 'low') return 1;
  return 1 + EB_PULSE_AMP * Math.sin((fin(timeSec, 0) * EB_PULSE_HZ + fin(seed, 0)) * Math.PI * 2);
}

/** Pure: launch flash alpha from seconds since launch (Infinity or negative: none). */
export function launchFlashAlpha(since: number): number {
  if (!Number.isFinite(since) || since < 0) return 0;
  return clampNum(1 - since / EB_FLASH_SEC, 0, 1);
}

/** Pure: drawn ring radius for a collision radius (9 for 6; 9 for a missing radius). */
export function bulletRenderRadius(radius: number): number {
  return radius > 0 && Number.isFinite(radius) ? radius * EB_DRAW_SCALE : EB_RENDER_R;
}

/** Per slot render memory: last arm seen and seconds since launch (for the launch flash). */
export interface EnemyBulletTrack {
  readonly prevArm: Float32Array;
  readonly sinceLaunch: Float32Array;
  readonly seen: Uint8Array;
}

export function createEnemyBulletTrack(cap: number): EnemyBulletTrack {
  const n = Math.max(0, Math.floor(cap));
  return { prevArm: new Float32Array(n), sinceLaunch: new Float32Array(n).fill(Number.POSITIVE_INFINITY), seen: new Uint8Array(n) };
}

/**
 * Advance the track one frame: a bullet seen charging and now flying launched this frame (flash
 * from 0); a slot that died forgets its bullet. A bullet first seen already flying gets no flash.
 */
export function trackEnemyBullets(track: EnemyBulletTrack, pool: EnemyBulletsLike, dt: number): void {
  const n = Math.min(track.seen.length, pool.cap);
  const step = Math.max(0, fin(dt, 0));
  for (let i = 0; i < n; i++) {
    if (pool.alive[i] !== 1) {
      track.seen[i] = 0;
      track.prevArm[i] = 0;
      track.sinceLaunch[i] = Number.POSITIVE_INFINITY;
      continue;
    }
    const arm = pool.arm[i] ?? 0;
    if (track.seen[i] === 1 && (track.prevArm[i] ?? 0) > 0 && !(arm > 0)) track.sinceLaunch[i] = 0;
    else track.sinceLaunch[i] = (track.sinceLaunch[i] ?? Number.POSITIVE_INFINITY) + step;
    track.seen[i] = 1;
    track.prevArm[i] = arm;
  }
}

/** Per frame inputs of the planner. tints is indexed by tier (1 to 4), filled from the palette. */
export interface EnemyBulletFrame {
  /** Interpolation fraction between sim steps (flying bullets extrapolate along their velocity). */
  alpha: number;
  timeSec: number;
  effects: EffectsTier;
  halo: Readonly<FxHalo>;
  tints: readonly number[];
  white: number;
  /**
   * Look v32: when set, tier 2 bullets (Ember's fan) take their colour from these flame stops, each
   * bullet at its own place on the flame, sliding with time, instead of the flat tier tint.
   */
  flame?: Uint32Array | null;
}

/** Pure: the flame tint of bullet seed (0 to 1) at timeSec: root to yellow, never the white tip. */
export function flameBulletTint(stops: Uint32Array, seed: number, timeSec: number): number {
  const p = seed + timeSec * 1.5;
  const u = p - Math.floor(p);
  // Ping pong so neighbouring bullets never jump straight from yellow back to deep red.
  return flameAt(stops, 0.1 + 0.65 * (u < 0.5 ? u * 2 : 2 - u * 2));
}

/**
 * Pure on the buffer: write every live bullet's instances. Charging: aim line (halo and core), glow,
 * a ring growing in from 60 percent, a growing white core. Flying: glow, the pulsing ring, the white
 * core, and the launch flash while it lasts. Returns the number of live bullets drawn.
 */
export function planEnemyBullets(pool: EnemyBulletsLike, track: EnemyBulletTrack | null, f: EnemyBulletFrame, out: SpriteBuf): number {
  let live = 0;
  for (let i = 0; i < pool.cap; i++) {
    if (pool.alive[i] !== 1) continue;
    live++;
    const tier = tierOf(pool.tier[i] ?? 1);
    const vx = pool.vx[i] ?? 0;
    const vy = pool.vy[i] ?? 0;
    const arm = pool.arm[i] ?? 0;
    const R = bulletRenderRadius(pool.radius[i] ?? 0);
    const seed = (i * 0.618034) % 1;
    const tint = tier === 2 && f.flame ? flameBulletTint(f.flame, seed, f.timeSec) : (f.tints[tier] ?? f.white);
    if (arm > 0) {
      const tele = hazardTelegraphSec(tier);
      const p = chargeProgress(arm, tele);
      const x = pool.x[i] ?? 0;
      const y = pool.y[i] ?? 0;
      const len = Math.sqrt(vx * vx + vy * vy);
      const dx = len > 1e-6 ? vx / len : 1;
      const dy = len > 1e-6 ? vy / len : 0;
      pushLine(out, x + dx * R, y + dy * R, x + dx * EB_AIM_LEN, y + dy * EB_AIM_LEN, EB_AIM_THICK, aimLineAlpha(arm, tele), tint, f.halo);
      const ringR = R * (0.6 + 0.4 * p);
      pushSprite(out, F_GLOW, x, y, 0, 2 * ringR * EB_HALO_MUL, 2 * ringR * EB_HALO_MUL, f.halo.alpha * (0.4 + 0.4 * p), tint);
      pushSprite(out, F_BRING, x, y, 0, 2 * ringR, 2 * ringR, 0.55 + 0.45 * p, tint);
      const cr = chargeRadius(arm, tele);
      pushSprite(out, F_DOT, x, y, 0, 2 * cr, 2 * cr, 1, f.white);
      continue;
    }
    const x = (pool.x[i] ?? 0) + vx * f.alpha * SIM_DT;
    const y = (pool.y[i] ?? 0) + vy * f.alpha * SIM_DT;
    const s = bulletPulse(f.timeSec, seed, f.effects);
    const d = 2 * R * s;
    pushSprite(out, F_GLOW, x, y, 0, d * EB_HALO_MUL, d * EB_HALO_MUL, f.halo.alpha * 0.8, tint);
    pushSprite(out, F_BRING, x, y, 0, d, d, 1, tint);
    pushSprite(out, F_DOT, x, y, 0, 2 * EB_CORE_R, 2 * EB_CORE_R, 1, f.white);
    const fl = track !== null && i < track.sinceLaunch.length ? launchFlashAlpha(track.sinceLaunch[i] ?? Number.POSITIVE_INFINITY) : 0;
    if (fl > 0) {
      const fr = EB_FLASH_R * (1.5 - 0.5 * fl);
      pushSprite(out, F_GLOW, x, y, 0, 2 * fr, 2 * fr, fl, f.white);
    }
  }
  return live;
}
