import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SCORES_KEY,
  RUN_SEED_KEY,
  UNLOCKED_KEY,
  loadAdventureScores,
  loadRunSeed,
  loadUnlocked,
  mergeAdventureScore,
  parseAdventureScores,
  parseUint32,
  recordAdventureScore,
  unlockLevel,
  type StorageLike,
} from '../../src/core/settings';

function memory(init: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

describe('run seed', () => {
  it('is created once and then stable', () => {
    const store = memory();
    let calls = 0;
    const fresh = (): number => {
      calls++;
      return 123456789;
    };
    expect(loadRunSeed(fresh, store)).toBe(123456789);
    expect(store.data.get(RUN_SEED_KEY)).toBe('123456789');
    expect(loadRunSeed(() => 7, store)).toBe(123456789);
    expect(calls).toBe(1);
  });

  it('replaces a corrupt stored seed', () => {
    expect(loadRunSeed(() => 42, memory({ [RUN_SEED_KEY]: 'banana' }))).toBe(42);
    expect(parseUint32('4294967296')).toBeNull();
    expect(parseUint32('-1')).toBeNull();
    expect(parseUint32('4294967295')).toBe(4294967295);
  });
});

describe('unlocked level', () => {
  it('defaults to 1 and only rises', () => {
    const store = memory();
    expect(loadUnlocked(store)).toBe(1);
    expect(unlockLevel(4, store)).toBe(4);
    expect(unlockLevel(2, store)).toBe(4);
    expect(loadUnlocked(memory({ [UNLOCKED_KEY]: 'x' }))).toBe(1);
  });
});

describe('adventure scores', () => {
  it('records bests and the new best flag', () => {
    const store = memory();
    expect(recordAdventureScore(1, 1500, 1, store)).toEqual({ best: 1500, newBest: true });
    expect(recordAdventureScore(1, 900, 0, store)).toEqual({ best: 1500, newBest: false });
    expect(recordAdventureScore(1, 5000, 3, store)).toEqual({ best: 5000, newBest: true });
    expect(loadAdventureScores(store)).toEqual({ '1': { best: 5000, stars: 3 } });
  });

  it('keeps the best stars independently of the best score', () => {
    const a = mergeAdventureScore({ '2': { best: 100, stars: 2 } }, 2, 50, 0);
    expect(a.scores['2']).toEqual({ best: 100, stars: 2 });
  });

  it('tolerates corrupt JSON and bad entries', () => {
    expect(parseAdventureScores('{nope')).toEqual({});
    expect(parseAdventureScores('[1,2]')).toEqual({});
    expect(
      parseAdventureScores(JSON.stringify({ '1': { best: 10, stars: 9 }, x: { best: 1 }, '3': { best: 'a' }, '4': null })),
    ).toEqual({ '1': { best: 10, stars: 0 } });
    expect(loadAdventureScores(memory({ [ADVENTURE_SCORES_KEY]: 'null' }))).toEqual({});
  });
});
