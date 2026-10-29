// Tune selection (v2.1 tunes): a level always has its tune, consecutive levels differ, the level
// seed alone (what startMusic receives) gives the same answer as (run seed, level index), and
// Endless rotates every 3 segments with consecutive blocks differing.
import { describe, expect, it } from 'vitest';
import { levelSeed, segmentSeed } from '../../../src/levelgen/leveldef';
import { hash01 } from '../../../src/core/rng';
import {
  ENDLESS_ROTATE_SEC,
  ENDLESS_SEGMENT_SEC,
  endlessBlock,
  endlessTune,
  startTune,
  tuneIndexForEndless,
  tuneIndexForKey,
  tuneIndexForLevel,
  tuneIndexForLevelSeed,
  unfmix32,
} from '../../../src/audio/music/select';
import { TUNES } from '../../../src/audio/music/tunes';

const RUN_SEEDS = Array.from({ length: 40 }, (_, i) => Math.floor(hash01(i, 0x5e1) * 4294967296));

describe('level seed inversion', () => {
  it('unfmix32 recovers run seed plus level index from a level seed', () => {
    for (const r of RUN_SEEDS) {
      for (let i = 1; i <= 60; i++) expect(unfmix32(levelSeed(r, i))).toBe((r + i) >>> 0);
    }
    expect(unfmix32(levelSeed(0xffffffff, 1))).toBe(0);
  });

  it('the level seed gives the same tune as the run seed and level index', () => {
    for (const r of RUN_SEEDS) for (let i = 1; i <= 60; i++) expect(tuneIndexForLevelSeed(levelSeed(r, i))).toBe(tuneIndexForLevel(r, i));
  });
});

describe('Adventure selection', () => {
  it('is deterministic: a level always has its tune', () => {
    for (const r of RUN_SEEDS.slice(0, 10)) {
      for (let i = 1; i <= 50; i++) {
        const a = startTune(levelSeed(r, i), 'adventure');
        expect(startTune(levelSeed(r, i), 'adventure')).toBe(a);
        expect(TUNES).toContain(a);
      }
    }
  });

  it('consecutive levels never share a tune', () => {
    for (const r of [...RUN_SEEDS, 0, 1, 0x7fffffff, 0xfffffff0]) {
      for (let i = 0; i <= 200; i++) expect(tuneIndexForLevel(r, i + 1), `run ${r} level ${i}`).not.toBe(tuneIndexForLevel(r, i));
    }
  });

  it('every tune is used, and no tune takes more than 40 percent of levels', () => {
    const counts = new Array<number>(TUNES.length).fill(0);
    for (const r of RUN_SEEDS) for (let i = 1; i <= 50; i++) counts[tuneIndexForLevel(r, i)] = (counts[tuneIndexForLevel(r, i)] ?? 0) + 1;
    const total = RUN_SEEDS.length * 50;
    for (const c of counts) {
      expect(c).toBeGreaterThan(0);
      expect(c / total).toBeLessThan(0.4);
    }
  });

  it('different run seeds give different level orders', () => {
    const order = (r: number): string => Array.from({ length: 10 }, (_, i) => tuneIndexForLevel(r, i + 1)).join('');
    expect(new Set(RUN_SEEDS.map(order)).size).toBeGreaterThan(RUN_SEEDS.length / 2);
  });

  it('the pick rule never repeats for any key and any tune count of four or more', () => {
    for (const n of [4, 5, 6, 7]) {
      for (let k = 0; k < 2000; k++) expect(tuneIndexForKey(k + 1, n)).not.toBe(tuneIndexForKey(k, n));
      for (let k = 0; k < 2000; k++) {
        const v = tuneIndexForKey(k, n);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(n);
      }
    }
    // Wrapping at 2^32 still differs.
    expect(tuneIndexForKey(0)).not.toBe(tuneIndexForKey(0xffffffff));
  });
});

describe('Endless rotation', () => {
  it('rotates every 3 segments of 30 s', () => {
    expect(ENDLESS_SEGMENT_SEC).toBe(30);
    expect(ENDLESS_ROTATE_SEC).toBe(90);
    expect(endlessBlock(0)).toBe(0);
    expect(endlessBlock(89.99)).toBe(0);
    expect(endlessBlock(90)).toBe(1);
    expect(endlessBlock(270)).toBe(3);
    expect(endlessBlock(-5)).toBe(0);
    expect(endlessBlock(Number.NaN)).toBe(0);
  });

  it('consecutive blocks differ, and the start tune is block 0', () => {
    for (const r of RUN_SEEDS) {
      const seed = segmentSeed(r, 0);
      expect(startTune(seed, 'endless')).toBe(endlessTune(seed, 0));
      for (let b = 0; b < 30; b++) expect(tuneIndexForEndless(seed, b + 1)).not.toBe(tuneIndexForEndless(seed, b));
    }
  });
});
