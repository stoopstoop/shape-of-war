// Tune selection (v2.1 tunes). Pure, built on the stateless hash01; no PRNG.
//
// Adventure: a level always has its tune, and consecutive levels never share one. The game
// derives a level seed as fmix32(runSeed + levelIndex) (leveldef.ts levelSeed), and the music is
// handed only that seed, so selection inverts the finaliser to recover k = runSeed + levelIndex
// and picks from k. No glue change is needed and nothing outside src/audio is imported.
//
// The pick (v2.1 tune wiring, B20) is a shuffle bag over blocks of N consecutive keys. The tunes
// split into two halves, A (the first floor(N / 2)) and B (the rest). In every block the first
// |A| keys play A and the last |B| keys play B, each half in an order shuffled by a hash of the
// block number (high bits of hash01, so no modulo bias). So inside a block every tune plays once,
// and across a block line the last keys (B) and the first keys (A) never share a tune. Any three
// consecutive levels therefore play three different tunes, consecutive levels always differ, and
// a run hears every tune once every N levels. The older rule, (k + 2 * b(k)) mod N, kept
// consecutive levels apart but often went back to the same tune two levels later (3, 2, 3).
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

/** Pure: a hashed integer in [0, n) from the high bits of hash01 (no modulo bias). */
function pickBelow(n: number, a: number, b: number): number {
  return Math.min(n - 1, Math.floor(hash01(a, b) * n));
}

/**
 * Pure: the entry at position `pos` of a Fisher and Yates shuffle of 0 to m - 1, driven by the
 * stateless hash of `block`. Same block, same order.
 */
export function shuffledAt(m: number, block: number, salt: number, pos: number): number {
  const order = Array.from({ length: m }, (_, i) => i);
  for (let i = m - 1; i > 0; i--) {
    const j = pickBelow(i + 1, block, salt + i);
    const t = order[i] ?? i;
    order[i] = order[j] ?? j;
    order[j] = t;
  }
  return order[pos] ?? 0;
}

/**
 * Pure: the tune index for a selection key (any integer, taken as unsigned 32 bit). With four or
 * more tunes, any three consecutive keys give three different tunes (the shuffle bag above);
 * fewer tunes fall back to k mod N, which still keeps consecutive keys apart for N of 2 or 3.
 */
export function tuneIndexForKey(key: number, count: number = TUNES.length): number {
  const k = key >>> 0;
  const n = Math.max(1, Math.trunc(count));
  if (n < 4) return k % n;
  const block = Math.floor(k / n);
  const pos = k - block * n;
  const half = Math.floor(n / 2);
  if (pos < half) return shuffledAt(half, block, SALT_PICK, pos);
  return half + shuffledAt(n - half, block, SALT_PICK + 0x100, pos - half);
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
