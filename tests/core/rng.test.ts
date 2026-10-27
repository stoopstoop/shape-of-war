import { describe, expect, it } from 'vitest';
import { deriveSeed, fmix32, hash01, mulberry32, rngInt, rngPick, streamSeed } from '../../src/core/rng';

describe('mulberry32', () => {
  it('same seed yields an identical 10k sequence', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 10_000; i++) expect(a()).toBe(b());
  });

  it('different seeds differ within the first 4 values', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    let differs = false;
    for (let i = 0; i < 4; i++) if (a() !== b()) differs = true;
    expect(differs).toBe(true);
  });

  it('stays in [0, 1) over 100k draws', () => {
    const r = mulberry32(1);
    let lo = 1;
    let hi = 0;
    for (let i = 0; i < 100_000; i++) {
      const v = r();
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThan(1);
  });

  it('golden sequence for seed 42', () => {
    const r = mulberry32(42);
    const got = [r(), r(), r(), r(), r()];
    const want = [0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693, 0.17481389874592423];
    for (let i = 0; i < 5; i++) expect(got[i]).toBeCloseTo(want[i] ?? -1, 12);
  });
});

describe('rngInt', () => {
  it('hits both inclusive bounds and nothing outside', () => {
    const r = mulberry32(7);
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      const v = rngInt(r, 3, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });
});

describe('rngPick', () => {
  it('respects weights [1, 3] within 2 points over 100k draws', () => {
    const r = mulberry32(99);
    let b = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) if (rngPick(r, ['a', 'b'] as const, [1, 3]) === 'b') b++;
    expect(Math.abs(b / n - 0.75)).toBeLessThan(0.02);
  });

  it('never picks a zero weight item', () => {
    const r = mulberry32(3);
    for (let i = 0; i < 5000; i++) expect(rngPick(r, [1, 2, 3], [1, 0, 1])).not.toBe(2);
  });

  it('is uniform without weights', () => {
    const r = mulberry32(5);
    const counts = [0, 0, 0, 0];
    const n = 40_000;
    for (let i = 0; i < n; i++) {
      const k = rngPick(r, [0, 1, 2, 3]);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    for (const c of counts) expect(Math.abs(c / n - 0.25)).toBeLessThan(0.02);
  });

  it('throws on an empty list', () => {
    expect(() => rngPick(mulberry32(1), [])).toThrow();
  });
});

describe('deriveSeed', () => {
  it('hard coded expected values, uint32', () => {
    expect(deriveSeed(1, 0)).toBe(1364076727);
    expect(deriveSeed(1, 7)).toBe(1228498187);
    expect(deriveSeed(0xdeadbeef, 42)).toBe(832885230);
    for (const v of [deriveSeed(1, 0), deriveSeed(0xffffffff, 1), deriveSeed(0xdeadbeef, 42)]) {
      expect(v >>> 0).toBe(v);
    }
  });

  it('matches levelSeed in docs/02 section 12 test 3', () => {
    expect(deriveSeed(0x4e464f4c, 1)).toBe(0x229578a8);
  });

  it('streamSeed and fmix32 are uint32', () => {
    expect(streamSeed(5, 0xabc) >>> 0).toBe(streamSeed(5, 0xabc));
    expect(fmix32(-1) >>> 0).toBe(fmix32(-1));
  });
});

describe('hash01', () => {
  it('is stateless, in [0, 1), and varies with both arguments', () => {
    expect(hash01(17)).toBe(hash01(17));
    expect(hash01(17, 3)).not.toBe(hash01(17, 4));
    expect(hash01(17)).not.toBe(hash01(18));
    for (let i = 0; i < 1000; i++) {
      const v = hash01(i, i * 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
