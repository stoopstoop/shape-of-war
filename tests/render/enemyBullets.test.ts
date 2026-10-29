// Enemy bullet render path (src/render/enemyBulletFx.ts and enemyBullets.ts). Nothing fires enemy
// bullets in wave A, so these tests fill a pool by hand, shaped exactly like EnemyBulletPool.
import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { ENEMY_BULLET_CAP, type EnemyBulletPool } from '../../src/game/enemyBullets';
import {
  aimLineAlpha,
  bulletPulse,
  bulletRenderRadius,
  chargeRadius,
  createEnemyBulletTrack,
  EB_AIM_A0,
  EB_AIM_A1,
  EB_AIM_LEN,
  EB_CORE_R,
  EB_CORE_R0,
  EB_FLASH_SEC,
  EB_INSTANCES,
  EB_PULSE_AMP,
  EB_RENDER_R,
  launchFlashAlpha,
  planEnemyBullets,
  trackEnemyBullets,
  type EnemyBulletFrame,
} from '../../src/render/enemyBulletFx';
import { createEnemyBulletLayer, ENEMY_BULLET_SPRITES } from '../../src/render/enemyBullets';
import { countFrame, createSpriteBuf, F_BAR, F_BRING, F_DOT, F_GLOW, F_SOFT, FRAME_COUNT, resetSpriteBuf } from '../../src/render/fxSprites';

function makePool(cap = ENEMY_BULLET_CAP): EnemyBulletPool {
  return {
    cap,
    alive: new Uint8Array(cap),
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    vx: new Float32Array(cap),
    vy: new Float32Array(cap),
    radius: new Float32Array(cap),
    life: new Float32Array(cap),
    arm: new Float32Array(cap),
    tier: new Uint8Array(cap),
    free: new Int32Array(cap),
    freeTop: 0,
    liveCount: 0,
    dropped: 0,
  };
}

/** One bullet at slot i: charging when arm > 0 (vx, vy is then the heading), else flying. */
function put(p: EnemyBulletPool, i: number, x: number, y: number, vx: number, vy: number, arm: number, tier = 1): void {
  p.alive[i] = 1;
  p.x[i] = x;
  p.y[i] = y;
  p.vx[i] = vx;
  p.vy[i] = vy;
  p.radius[i] = 6;
  p.life[i] = 8;
  p.arm[i] = arm;
  p.tier[i] = tier;
  p.liveCount++;
}

function frame(effects: EnemyBulletFrame['effects'] = 'standard'): EnemyBulletFrame {
  return { alpha: 0, timeSec: 0.1, effects, halo: { alpha: 0.4, width: 2 }, tints: [0, 0xffaa00, 0xff8800, 0xff0000, 0x88ffff], white: 0xffffff };
}

const TELE = 1.0;

describe('pure helpers', () => {
  it('aim line alpha is 0 when flying and rises thin and dim through the charge', () => {
    expect(aimLineAlpha(0, TELE)).toBe(0);
    expect(aimLineAlpha(-0.1, TELE)).toBe(0);
    expect(aimLineAlpha(TELE, TELE)).toBeCloseTo(EB_AIM_A0, 6);
    expect(aimLineAlpha(0.01, TELE)).toBeGreaterThan(aimLineAlpha(0.5, TELE));
    expect(aimLineAlpha(0.5, TELE)).toBeGreaterThan(aimLineAlpha(1, TELE));
    for (let a = 0.01; a <= TELE; a += 0.05) expect(aimLineAlpha(a, TELE)).toBeLessThanOrEqual(EB_AIM_A1);
  });

  it('charge radius grows from 1.2 to the flying core of 3.5', () => {
    expect(chargeRadius(TELE, TELE)).toBeCloseTo(EB_CORE_R0, 6);
    expect(chargeRadius(TELE / 2, TELE)).toBeCloseTo((EB_CORE_R0 + EB_CORE_R) / 2, 6);
    expect(chargeRadius(0, TELE)).toBe(EB_CORE_R);
    let prev = 0;
    for (let a = TELE; a > 0; a -= 0.1) {
      const r = chargeRadius(a, TELE);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it('pulse is exactly 1 at Low and a 3 Hz wobble of 12 percent otherwise', () => {
    for (let t = 0; t < 2; t += 0.013) expect(bulletPulse(t, 0.3, 'low')).toBe(1);
    const seen: number[] = [];
    for (let t = 0; t < 1; t += 0.01) {
      const s = bulletPulse(t, 0, 'standard');
      expect(Math.abs(s - 1)).toBeLessThanOrEqual(EB_PULSE_AMP + 1e-9);
      seen.push(s);
    }
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(EB_PULSE_AMP);
    expect(bulletPulse(0.1, 0, 'high')).toBeCloseTo(bulletPulse(0.1 + 1 / 3, 0, 'high'), 6);
  });

  it('drawn at radius 9 for a collision radius of 6', () => {
    expect(bulletRenderRadius(6)).toBe(EB_RENDER_R);
    expect(bulletRenderRadius(0)).toBe(EB_RENDER_R);
  });

  it('launch flash fades over its life and is absent before launch', () => {
    expect(launchFlashAlpha(0)).toBe(1);
    expect(launchFlashAlpha(EB_FLASH_SEC)).toBe(0);
    expect(launchFlashAlpha(Number.POSITIVE_INFINITY)).toBe(0);
    expect(launchFlashAlpha(-1)).toBe(0);
  });
});

describe('planner', () => {
  it('a charging bullet draws the aim line along its heading and a flying one does not', () => {
    const p = makePool();
    put(p, 0, 100, 50, 0, 1, 0.5); // charging, heading +y
    const b = createSpriteBuf(64);
    planEnemyBullets(p, null, frame(), b);
    expect(countFrame(b, F_BAR)).toBe(1);
    expect(countFrame(b, F_SOFT)).toBe(1);
    const i = Array.from(b.frame.subarray(0, b.count)).indexOf(F_BAR);
    // Runs from the ring edge to 300 u out along the heading, thin and dim.
    expect(b.x[i]).toBeCloseTo(100, 3);
    expect((b.y[i] ?? 0) + (b.w[i] ?? 0) / 2).toBeCloseTo(50 + EB_AIM_LEN, 3);
    expect(b.alpha[i]).toBeLessThanOrEqual(EB_AIM_A1);
    expect(b.h[i]).toBeLessThan(2);

    p.arm[0] = 0;
    p.vy[0] = 180;
    resetSpriteBuf(b);
    planEnemyBullets(p, null, frame(), b);
    expect(countFrame(b, F_BAR)).toBe(0);
    expect(countFrame(b, F_SOFT)).toBe(0);
  });

  it('flying: a tier coloured ring at radius 9 with a white core', () => {
    const p = makePool();
    put(p, 3, 0, 0, 200, 0, 0, 2);
    const b = createSpriteBuf(16);
    planEnemyBullets(p, null, frame('low'), b);
    const ring = Array.from(b.frame.subarray(0, b.count)).indexOf(F_BRING);
    const core = Array.from(b.frame.subarray(0, b.count)).indexOf(F_DOT);
    expect(b.w[ring]).toBeCloseTo(2 * EB_RENDER_R, 5);
    expect(b.tint[ring]).toBe(0xff8800);
    expect(b.tint[core]).toBe(0xffffff);
    expect(b.w[core]).toBeCloseTo(2 * EB_CORE_R, 5);
  });

  it('a launch seen by the track adds a flash; a bullet first seen flying does not', () => {
    const p = makePool();
    put(p, 0, 0, 0, 1, 0, 0.1);
    put(p, 1, 0, 0, 100, 0, 0);
    const track = createEnemyBulletTrack(ENEMY_BULLET_CAP);
    trackEnemyBullets(track, p, 0.016);
    p.arm[0] = 0;
    p.vx[0] = 200;
    trackEnemyBullets(track, p, 0.016);
    expect(track.sinceLaunch[0]).toBe(0);
    expect(track.sinceLaunch[1]).toBe(Number.POSITIVE_INFINITY);
    const b = createSpriteBuf(64);
    planEnemyBullets(p, track, frame(), b);
    // Bullet 0: glow, ring, core, flash. Bullet 1: glow, ring, core.
    expect(countFrame(b, F_GLOW)).toBe(3);
    p.alive[0] = 0;
    trackEnemyBullets(track, p, 0.016);
    expect(track.seen[0]).toBe(0);
  });

  it('never more than EB_INSTANCES per bullet', () => {
    const p = makePool();
    for (let i = 0; i < ENEMY_BULLET_CAP; i++) put(p, i, i * 20, 0, 0, 1, 0.4);
    const b = createSpriteBuf(ENEMY_BULLET_SPRITES);
    expect(planEnemyBullets(p, null, frame(), b)).toBe(ENEMY_BULLET_CAP);
    expect(b.count).toBeLessThanOrEqual(ENEMY_BULLET_CAP * EB_INSTANCES);
    expect(b.dropped).toBe(0);
  });
});

describe('layer: one pooled geometry, one draw call', () => {
  const frames = Array.from({ length: FRAME_COUNT }, () => Texture.WHITE);

  it('draw call count is 1 at a full pool of 32, every bullet drawn', () => {
    const layer = createEnemyBulletLayer(Texture.WHITE, frames);
    const p = makePool();
    // Half charging, half flying, mixed tiers: still one container and one texture source.
    for (let i = 0; i < ENEMY_BULLET_CAP; i++) put(p, i, (i % 8) * 120, Math.floor(i / 8) * 120, 0.6, 0.8, i % 2 === 0 ? 0.5 : 0, (i % 3) + 1);
    layer.draw(p, frame(), 0.016);
    expect(layer.live).toBe(ENEMY_BULLET_CAP);
    expect(layer.layer.drawCalls()).toBe(1);
    expect(layer.layer.sources()).toBe(1);
    expect(layer.layer.shown).toBeGreaterThanOrEqual(ENEMY_BULLET_CAP * 3);
    expect(layer.layer.shown).toBeLessThanOrEqual(layer.layer.cap);
    expect(layer.layer.container.particleChildren).toHaveLength(ENEMY_BULLET_SPRITES);
    layer.destroy();
  });

  it('no per frame allocation of Particles: the same objects every frame', () => {
    const layer = createEnemyBulletLayer(Texture.WHITE, frames);
    const p = makePool();
    for (let i = 0; i < ENEMY_BULLET_CAP; i++) put(p, i, i, 0, 1, 0, 0.3);
    const before = [...layer.layer.container.particleChildren];
    for (let k = 0; k < 10; k++) {
      for (let i = 0; i < ENEMY_BULLET_CAP; i++) p.arm[i] = Math.max(0, (p.arm[i] ?? 0) - 0.05);
      layer.draw(p, frame(), 0.05);
    }
    expect(layer.layer.container.particleChildren).toEqual(before);
    layer.destroy();
  });

  it('an empty pool (bosses off) draws nothing and costs no draw call', () => {
    const layer = createEnemyBulletLayer(Texture.WHITE, frames);
    layer.draw(makePool(0), frame(), 0.016);
    expect(layer.layer.drawCalls()).toBe(0);
    const p = makePool();
    put(p, 0, 0, 0, 1, 0, 0);
    layer.draw(p, frame(), 0.016);
    expect(layer.layer.drawCalls()).toBe(1);
    p.alive[0] = 0;
    layer.draw(p, frame(), 0.016);
    expect(layer.layer.drawCalls()).toBe(0);
    expect(layer.layer.container.visible).toBe(false);
    layer.destroy();
  });

  it('Low keeps size and the aim line, only the pulse goes', () => {
    const p = makePool();
    put(p, 0, 0, 0, 1, 0, 0.5);
    put(p, 1, 0, 0, 200, 0, 0);
    const low = createSpriteBuf(32);
    const std = createSpriteBuf(32);
    planEnemyBullets(p, null, { ...frame('low'), timeSec: 0.37 }, low);
    planEnemyBullets(p, null, { ...frame('standard'), timeSec: 0.37 }, std);
    expect(countFrame(low, F_BAR)).toBe(1);
    expect(low.count).toBe(std.count);
    const ringW = (b: typeof low): number => b.w[Array.from(b.frame.subarray(0, b.count)).lastIndexOf(F_BRING)] ?? 0;
    expect(ringW(low)).toBeCloseTo(2 * EB_RENDER_R, 5);
    expect(ringW(std)).not.toBeCloseTo(2 * EB_RENDER_R, 3);
  });
});
