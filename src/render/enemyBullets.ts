// Enemy bullet render path (docs/13 "Boss projectiles" rule 11, docs/12 wave V3-A Glow item 6). Reads
// enemyBulletsOf(w) and nothing else, through the renderer. One pooled geometry on its own layer and
// one draw call: a single ParticleContainer of ENEMY_BULLET_CAP x EB_INSTANCES Particles, all frames
// of the boss fx atlas. No allocation and no Graphics.clear per frame. Colours and the halo are read
// from the palette and applyNeon's derived settings each frame, so neon:changed reaches both glow
// paths on the next frame; the effects tier only switches the pulse (Low keeps size and aim line).
import type { Texture } from 'pixi.js';
import { ENEMY_BULLET_CAP } from '../game/enemyBullets';
import {
  createEnemyBulletTrack,
  EB_INSTANCES,
  planEnemyBullets,
  trackEnemyBullets,
  type EnemyBulletFrame,
  type EnemyBulletsLike,
  type EnemyBulletTrack,
} from './enemyBulletFx';
import { createSpriteBuf, resetSpriteBuf, type SpriteBuf } from './fxSprites';
import { createFxSpriteLayer, type FxSpriteLayer } from './fxSpriteLayer';

/** Particles in the layer: every live bullet's instances at the pool cap. */
export const ENEMY_BULLET_SPRITES = ENEMY_BULLET_CAP * EB_INSTANCES;

export interface EnemyBulletLayer {
  readonly layer: FxSpriteLayer;
  readonly buf: SpriteBuf;
  /** Live bullets drawn by the last draw. */
  readonly live: number;
  /** Draw one frame of the pool. dt is the render step in seconds (launch flash clock). */
  draw(pool: EnemyBulletsLike, frame: EnemyBulletFrame, dt: number): void;
  clear(): void;
  destroy(): void;
}

export function createEnemyBulletLayer(atlas: Texture, frames: readonly Texture[]): EnemyBulletLayer {
  const layer = createFxSpriteLayer('enemyBullets', atlas, frames, ENEMY_BULLET_SPRITES);
  const buf = createSpriteBuf(ENEMY_BULLET_SPRITES);
  let track: EnemyBulletTrack = createEnemyBulletTrack(ENEMY_BULLET_CAP);
  let live = 0;

  function draw(pool: EnemyBulletsLike, frame: EnemyBulletFrame, dt: number): void {
    resetSpriteBuf(buf);
    // An empty or cap 0 pool (bosses off, the stub) costs one early out and nothing else.
    if (pool.cap === 0 && layer.shown === 0) {
      live = 0;
      return;
    }
    if (track.seen.length < pool.cap) track = createEnemyBulletTrack(pool.cap); // only if a pool grows past 32
    trackEnemyBullets(track, pool, dt);
    live = planEnemyBullets(pool, track, frame, buf);
    layer.sync(buf);
  }

  function clear(): void {
    resetSpriteBuf(buf);
    track.seen.fill(0);
    track.prevArm.fill(0);
    track.sinceLaunch.fill(Number.POSITIVE_INFINITY);
    live = 0;
    layer.clear();
  }

  return {
    layer,
    buf,
    get live(): number {
      return live;
    },
    draw,
    clear,
    destroy(): void {
      layer.destroy();
    },
  };
}
