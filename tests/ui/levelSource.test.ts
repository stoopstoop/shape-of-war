import { describe, expect, it } from 'vitest';
import { inlineRectLevel } from '../../src/game/world';
import { VALID_FIXTURES } from '../../src/levelgen/fixtures';
import type { LevelDef } from '../../src/levelgen/leveldef';
import { canonicalJson, fallbackHash, parseLevelQuery, pickLevel } from '../../src/ui/levelSource';

describe('level source', () => {
  it('falls back to fixtures when there is no generator', () => {
    const a = pickLevel(null, 42, 1, VALID_FIXTURES);
    expect(a.source).toBe('fixture');
    expect(a.def).toBe(VALID_FIXTURES[0]);
    expect(pickLevel(null, 42, 2, VALID_FIXTURES).def).toBe(VALID_FIXTURES[1]);
    expect(pickLevel(null, 42, 4, VALID_FIXTURES).def).toBe(VALID_FIXTURES[0]);
  });

  it('prefers the generator and passes run seed and index', () => {
    const seen: [number, number][] = [];
    const mod = {
      generateLevel: (s: number, i: number): LevelDef => {
        seen.push([s, i]);
        return { ...inlineRectLevel(s), levelIndex: i };
      },
      levelHash: (): string => 'feedf00d',
    };
    const p = pickLevel(mod, 1234, 3, VALID_FIXTURES);
    expect(p.source).toBe('generator');
    expect(p.hash).toBe('feedf00d');
    expect(seen).toEqual([[1234, 3]]);
  });

  it('falls back when the generator throws or returns junk', () => {
    const throwing = {
      generateLevel: (): never => {
        throw new Error('boom');
      },
    };
    const warn = console.warn;
    console.warn = (): void => undefined;
    try {
      expect(pickLevel(throwing, 1, 1, VALID_FIXTURES).source).toBe('fixture');
    } finally {
      console.warn = warn;
    }
    expect(pickLevel({ generateLevel: () => ({ nope: 1 }) }, 1, 1, VALID_FIXTURES).source).toBe('fixture');
  });

  it('hash is stable, key order independent and differs between levels', () => {
    const a = inlineRectLevel(1);
    const reordered = Object.fromEntries(Object.entries(a).reverse()) as unknown as LevelDef;
    expect(fallbackHash(a)).toMatch(/^[0-9a-f]{8}$/);
    expect(fallbackHash(a)).toBe(fallbackHash(reordered));
    expect(fallbackHash(a)).not.toBe(fallbackHash(inlineRectLevel(2)));
    expect(canonicalJson({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe('{"a":[1,{"c":3,"d":2}],"b":1}');
  });

  it('parses ?seed and ?level', () => {
    expect(parseLevelQuery('?seed=42&level=3')).toEqual({ seed: 42, level: 3 });
    expect(parseLevelQuery('?seed=abc&level=-2')).toEqual({ seed: null, level: null });
    expect(parseLevelQuery('?level=0')).toEqual({ seed: null, level: 1 });
    expect(parseLevelQuery('')).toEqual({ seed: null, level: null });
  });
});
