import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SCORES_KEY,
  ENDLESS_SCORES_KEY,
  ENDLESS_TOP,
  SCHEMA_KEY,
  UNLOCKED_KEY,
  ensureSchema,
  insertEndlessScore,
  isUnlocked,
  loadAdventureScores,
  loadEndlessScores,
  loadSettings,
  loadUnlocked,
  parseEndlessScores,
  parseSeedInput,
  recordEndlessScore,
  resetProgress,
  saveSetting,
  unlockAfter,
  unlockLevel,
  type EndlessEntry,
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

const throwing: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('Endless high scores', () => {
  it('inserts in score order and reports the rank', () => {
    let table: EndlessEntry[] = [];
    const ranks: number[] = [];
    for (const [score, at] of [
      [500, 1],
      [900, 2],
      [100, 3],
      [700, 4],
    ] as const) {
      const r = insertEndlessScore(table, { score, at });
      table = r.table;
      ranks.push(r.rank);
    }
    expect(table.map((e) => e.score)).toEqual([900, 700, 500, 100]);
    expect(ranks).toEqual([1, 1, 3, 2]);
  });

  it('caps the table at 10 and gives rank 0 to a score that misses it', () => {
    let table: EndlessEntry[] = [];
    for (let i = 1; i <= 12; i++) table = insertEndlessScore(table, { score: i * 100, at: i }).table;
    expect(ENDLESS_TOP).toBe(10);
    expect(table).toHaveLength(10);
    expect(table[0]?.score).toBe(1200);
    expect(table[9]?.score).toBe(300);
    const miss = insertEndlessScore(table, { score: 50, at: 99 });
    expect(miss.rank).toBe(0);
    expect(miss.table).toHaveLength(10);
    const tie = insertEndlessScore(table, { score: 300, at: 99 });
    expect(tie.rank).toBe(0); // a tie ranks below the existing row
  });

  it('records through sow.scores.endless and survives a reload', () => {
    const store = memory();
    expect(recordEndlessScore(1000, 10, store)).toEqual({ rank: 1, best: 1000 });
    expect(recordEndlessScore(400, 20, store)).toEqual({ rank: 2, best: 1000 });
    expect(recordEndlessScore(2500, 30, store)).toEqual({ rank: 1, best: 2500 });
    expect(loadEndlessScores(store).map((e) => e.score)).toEqual([2500, 1000, 400]);
    expect(JSON.parse(store.data.get(ENDLESS_SCORES_KEY) ?? '[]')).toEqual([
      { score: 2500, at: 30 },
      { score: 1000, at: 10 },
      { score: 400, at: 20 },
    ]);
  });

  it('parses, sorts and caps an unsorted stored table', () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({ score: i, at: i }));
    const t = parseEndlessScores(JSON.stringify(rows));
    expect(t).toHaveLength(10);
    expect(t[0]?.score).toBe(13);
  });
});

describe('corrupt JSON in sow.scores.* is ignored', () => {
  const bad = ['{', 'null', '42', '"x"', 'true', '{"a":1}', '[1,2]', '[{"score":"9"}]', '[{"score":-5}]', '[{"score":null}]'];

  it('endless falls back to an empty table, keeping good rows', () => {
    for (const raw of bad) expect(parseEndlessScores(raw)).toEqual([]);
    expect(parseEndlessScores('[{"score":5,"at":1},{"score":"x"},7,{"score":9}]')).toEqual([
      { score: 9, at: 0 },
      { score: 5, at: 1 },
    ]);
    const store = memory({ [ENDLESS_SCORES_KEY]: '{oops' });
    expect(loadEndlessScores(store)).toEqual([]);
    expect(recordEndlessScore(10, 1, store).rank).toBe(1);
    expect(loadEndlessScores(store)).toEqual([{ score: 10, at: 1 }]);
  });

  it('adventure falls back to an empty map', () => {
    for (const raw of ['{', '[]', 'null', '7', '{"1":5}', '{"x":{"best":1}}']) {
      expect(loadAdventureScores(memory({ [ADVENTURE_SCORES_KEY]: raw }))).toEqual({});
    }
  });

  it('a throwing storage gives defaults and never throws', () => {
    expect(loadEndlessScores(throwing)).toEqual([]);
    expect(() => recordEndlessScore(5, 1, throwing)).not.toThrow();
    expect(loadAdventureScores(throwing)).toEqual({});
    expect(ensureSchema(throwing)).toBe(1);
  });
});

describe('unlock rules', () => {
  it('success unlocks the next level regardless of stars, failure does not', () => {
    expect(unlockAfter(1, 1, true)).toBe(2);
    expect(unlockAfter(1, 1, false)).toBe(1);
    expect(unlockAfter(5, 2, true)).toBe(5); // replaying an old level never lowers progress
    expect(unlockAfter(3, 3, true)).toBe(4);
    expect(unlockAfter(0, 1, false)).toBe(1);
  });

  it('only levels 1..unlocked can be selected', () => {
    expect(isUnlocked(3, 1)).toBe(true);
    expect(isUnlocked(3, 3)).toBe(true);
    expect(isUnlocked(3, 4)).toBe(false);
    expect(isUnlocked(3, 0)).toBe(false);
    expect(isUnlocked(3, 1.5)).toBe(false);
    expect(isUnlocked(0, 1)).toBe(true);
  });

  it('stored unlock only grows and reset brings it back to 1', () => {
    const store = memory();
    expect(loadUnlocked(store)).toBe(1);
    unlockLevel(unlockAfter(loadUnlocked(store), 1, true), store);
    expect(loadUnlocked(store)).toBe(2);
    unlockLevel(1, store);
    expect(loadUnlocked(store)).toBe(2);
    store.data.set(ADVENTURE_SCORES_KEY, '{"1":{"best":10,"stars":1}}');
    resetProgress(store);
    expect(loadUnlocked(store)).toBe(1);
    expect(store.data.get(UNLOCKED_KEY)).toBe('1');
    expect(loadAdventureScores(store)).toEqual({});
  });
});

describe('schema and settings round trip', () => {
  it('writes sow.schema = 1 on first launch only', () => {
    const store = memory();
    expect(ensureSchema(store)).toBe(1);
    expect(store.data.get(SCHEMA_KEY)).toBe('1');
    store.data.set(SCHEMA_KEY, '2');
    expect(ensureSchema(store)).toBe(2);
    expect(store.data.get(SCHEMA_KEY)).toBe('2');
  });

  it('neon, volume and showFps round trip', () => {
    const store = memory();
    saveSetting('neon', 33, store);
    saveSetting('volume', 0, store);
    saveSetting('showFps', true, store);
    expect(loadSettings(store)).toEqual({ neon: 33, volume: 0, showFps: true });
    expect(store.data.get('sow.settings.neon')).toBe('33');
  });

  it('parses typed seeds', () => {
    expect(parseSeedInput(' 123 ')).toBe(123);
    expect(parseSeedInput('0')).toBe(0);
    expect(parseSeedInput('4294967295')).toBe(4294967295);
    expect(parseSeedInput('4294967296')).toBeNull();
    expect(parseSeedInput('1e3')).toBeNull();
    expect(parseSeedInput('')).toBeNull();
  });
});
