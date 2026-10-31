// Pure Brood split burst (v31 sim:bossSplit). No pixi.js import. When Brood breaks into three
// Broodlings at its stage 2 crack the body is gone in the same step, so the renderer throws a burst
// of green shards from where the body last drew. The count follows the effects tier and stays small
// beside the boss death burst (bossLook.ts): the split is a beat, not the end of the fight.
import { BOSS_BROOD, bossColourOf } from './bossLook';
import type { PaletteKey } from './neon';

export type SplitEffects = 'low' | 'standard' | 'high';

/** Shards per effects tier. Well under the pool caps and under a fifth of the boss death burst. */
export const SPLIT_SHARDS: Readonly<Record<SplitEffects, number>> = { low: 48, standard: 110, high: 200 };
/** Shard speed range in arena units per second and life range in seconds. */
export const SPLIT_SPEED_MIN = 160;
export const SPLIT_SPEED_MAX = 520;
export const SPLIT_LIFE_MIN = 0.4;
export const SPLIT_LIFE_MAX = 0.9;
/** Share of the shards that burn toward white, so the burst has a hot centre (the rest are plain green). */
export const SPLIT_HOT_SHARE = 0.3;
/** How much of the way to white the hot shards go. */
export const SPLIT_HOT_MIX = 0.45;
/** The shock ring (map effects only) is this multiple of the phase change ring in reach and life. */
export const SPLIT_RING_MUL = 1.6;

/** Pure: shard count for an effects tier (the standard count for anything unknown). */
export function splitShardCount(effects: string): number {
  return effects === 'low' || effects === 'high' ? SPLIT_SHARDS[effects] : SPLIT_SHARDS.standard;
}

/** Pure: hot shards of a count (the rest are plain green). Never more than the count. */
export function splitHotCount(count: number): number {
  return Math.min(count, Math.round(count * SPLIT_HOT_SHARE));
}

/** Pure: the shard palette key, always Brood's own green (the bus id never picks another hue). */
export function splitKey(): PaletteKey {
  return bossColourOf(BOSS_BROOD);
}

/** Pure: a finite burst coordinate, or the fallback when the renderer has no drawn position yet. */
export function splitCoord(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}
