// Tune selection (v2.1 tunes). Pure, built on the stateless hash01; no PRNG.
//
// Adventure: a level always has its tune, and consecutive levels never share one. The game
// derives a level seed as fmix32(runSeed + levelIndex) (leveldef.ts levelSeed), and the music is
// handed only that seed, so selection inverts the finaliser to recover k = runSeed + levelIndex
// and picks from k. No glue change is needed and nothing outside src/audio is imported.
//
// The pick is (k + 2 * b(k)) mod N, with b(k) a hashed bit of k. Two consecutive levels have k
// and k + 1, so their picks differ by 1 + 2 * (b(k + 1) - b(k)), which is -1, 1 or 3: never a
// multiple of N for N >= 4. Every tune is reachable and a run seed shifts the whole sequence.
//
// Endless: the tune rotates every ENDLESS_ROTATE_SEGMENTS segments of play, by the same rule
// with k = endless level seed + block, so consecutive blocks differ too.
import { hash01 } from '../../core/rng';
import { TUNES, type Tune } from './tunes';

const SALT_PICK = 0x70e5;

/** Endless segment length, seconds (leveldef.ts ENDLESS_SEGMENT_SEC, mirrored to keep audio standalone). */
export const ENDLESS_SEGMENT_SEC = 30;
/** Endless rotates its tune every this many segments. */
export const ENDLESS_ROTATE_SEGMENTS = 3;
/** Seconds of play per Endless tune. */
export const ENDLESS_ROTATE_SEC = ENDLESS_SEGMENT_SEC * ENDLESS_ROTATE_SEGMENTS;

/** Pure: the inverse of the murmur3 finaliser fmix32 used by leveldef.ts levelSeed. */
export function unfmix32(h: number): number {
  let x = h >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7ed1b41d) >>> 0;
  x ^= (x >>> 13) ^ (x >>> 26);
  x = Math.imul(x, 0xa5cb9243) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

/** Pure: the tune index for a selection key (any integer, taken as unsigned 32 bit). */
export function tuneIndexForKey(key: number, count: number = TUNES.length): number {
  const k = key >>> 0;
  const n = Math.max(1, Math.trunc(count));
  const b = hash01(k, SALT_PICK) < 0.5 ? 0 : 1;
  return (((k % n) + 2 * b) % n + n) % n;
}

/** Pure: the tune index of an Adventure level from its run seed and level index. */
export function tuneIndexForLevel(runSeed: number, levelIndex: number): number {
  return tuneIndexForKey((runSeed + levelIndex) >>> 0);
}

/** Pure: the tune index of an Adventure level from its level seed (as startMusic receives it). */
export function tuneIndexForLevelSeed(levelSeed: number): number {
  return tuneIndexForKey(unfmix32(levelSeed));
}

/** Pure: the Endless rotation block after `playSec` seconds of play. */
export function endlessBlock(playSec: number): number {
  return Number.isFinite(playSec) && playSec > 0 ? Math.floor(playSec / ENDLESS_ROTATE_SEC) : 0;
}

/** Pure: the tune index of an Endless run's rotation block. */
export function tuneIndexForEndless(seed: number, block: number): number {
  return tuneIndexForKey((seed + Math.max(0, Math.trunc(block))) >>> 0);
}

export type RunMode = 'adventure' | 'endless';

/** Pure: the tune a run starts with. */
export function startTune(seed: number, mode: RunMode): Tune {
  const i = mode === 'endless' ? tuneIndexForEndless(seed, 0) : tuneIndexForLevelSeed(seed);
  return TUNES[i] ?? TUNES[0] ?? fail();
}

/** Pure: the tune of an Endless block. */
export function endlessTune(seed: number, block: number): Tune {
  return TUNES[tuneIndexForEndless(seed, block)] ?? TUNES[0] ?? fail();
}

function fail(): never {
  throw new Error('no tunes');
}
