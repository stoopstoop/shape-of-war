// Characterisation of SPEC 3.2 ("level n seed is derived from the run seed plus n"), finding QA-001
// in docs/qa/bugs.md. Because the derivation depends only on runSeed + levelIndex, level n+1 of run
// s and level n of run s+1 share a level seed, so inside one difficulty band they are the same
// level. This matters for the typed seed screen (docs/06 D3 and D4: 1234 versus 1235 share 4 of 5
// early levels shifted by one). It is spec behaviour, not a crash: if the derivation is ever changed
// on purpose, update or delete this file in the same change.
import { describe, expect, it } from 'vitest';
import { deriveSeed } from '../../src/core/rng';
import { generateLevel } from '../../src/levelgen/generator';
import { V2_GEN_CONFIG, type LevelDef } from '../../src/levelgen/leveldef';

/** Everything the player experiences, without the identity fields that name the run and the index. */
function content(d: LevelDef): Omit<LevelDef, 'runSeed' | 'levelIndex'> {
  const { runSeed: _runSeed, levelIndex: _levelIndex, ...rest } = d;
  return rest;
}

describe('adjacent run seeds', () => {
  it('derive the same level seed one index apart', () => {
    for (const s of [0, 1, 42, 1234, 0xdeadbeef]) {
      for (const n of [1, 2, 5, 17]) expect(deriveSeed(s, n + 1)).toBe(deriveSeed(s + 1, n));
    }
  });

  it('typed seeds 1234 and 1235: level 2 of 1234 is level 1 of 1235 (same band, same content)', () => {
    const a = generateLevel(1234, 2);
    const b = generateLevel(1235, 1);
    expect(a.band).toBe(b.band);
    expect(a.runSeed).not.toBe(b.runSeed);
    expect(content(a)).toEqual(content(b));
  });

  it('holds for levels 1 to 4 of the same pair, so 4 of the first 5 levels repeat', () => {
    // V2_GEN_CONFIG: level 5 of seed 1234 is a boss level under v3 (docs/13), which breaks the shift.
    for (let n = 1; n <= 4; n++) expect(content(generateLevel(1234, n + 1, V2_GEN_CONFIG))).toEqual(content(generateLevel(1235, n, V2_GEN_CONFIG)));
  });

  it('runs d apart share max(0, 40 - d) of their first 40 level seeds (the cost of "plus n")', () => {
    const levels = (s: number): Set<number> => new Set(Array.from({ length: 40 }, (_, i) => deriveSeed(s, i + 1)));
    const base = levels(1234);
    for (const d of [1, 2, 10, 39, 40, 41, 100, 5000]) {
      let shared = 0;
      for (const v of levels(1234 + d)) if (base.has(v)) shared++;
      expect(shared, `runs ${d} apart`).toBe(Math.max(0, 40 - d));
    }
  });
});
