// V2-C flat hook (docs/11 SPEC 3.4 item 4, Q15): with the v2 enemies on, every generated level is
// still 'flat', and the validator still rejects every other surface value. surface.test.ts holds
// the v1 checks and stays unmodified.
import { describe, expect, it } from 'vitest';
import { generateEndless, generateLevel } from '../../src/levelgen/generator';
import { DEFAULT_GEN_CONFIG, GENERATOR_VERSION_V2 } from '../../src/levelgen/leveldef';
import type { LevelDef } from '../../src/levelgen/leveldef';
import { validateEndless, validateLevel } from '../../src/levelgen/validate';

/** Every SurfaceKind docs/09 section 2.6 names, plus junk: none but 'flat' is valid. */
const NOT_FLAT: readonly unknown[] = ['cylinder', 'torus', 'sphere', 'capsule', 'twistedBand', 'Flat', '', null, 0, undefined];

describe('flat hook with the v2 enemies on', () => {
  it('every generated level is flat, in every band', () => {
    expect(DEFAULT_GEN_CONFIG.enableV2Enemies).toBe(true);
    for (let s = 0; s < 100; s++) {
      for (let n = 1; n <= 60; n += 3) {
        const d = generateLevel((1 + s * 2654435761) >>> 0, n);
        expect(d.surface, `seed ${d.runSeed} level ${n}`).toBe('flat');
      }
    }
    expect(generateEndless(5).surface).toBe('flat');
  }, 60000);

  it('any other surface value fails V1 on a version 2 level, and nothing else does', () => {
    const base = generateLevel(42, 20);
    expect(base.generatorVersion).toBe(GENERATOR_VERSION_V2);
    expect(validateLevel(base).errors).toEqual([]);
    for (const v of NOT_FLAT) {
      const bad: unknown = { ...structuredClone(base), surface: v };
      const errs = validateLevel(bad as LevelDef).errors;
      expect(errs.some((e) => e.startsWith('V1:')), `surface ${String(v)}`).toBe(true);
      // An explicit undefined member also trips the JSON checks J1 and J2; every real value trips only V1.
      if (v !== undefined) expect(errs.every((e) => e.startsWith('V1:')), `surface ${String(v)}: ${errs.join('; ')}`).toBe(true);
    }
  });

  it('any other surface value fails V1 on a flag on EndlessDef', () => {
    const base = generateEndless(5);
    for (const v of NOT_FLAT) {
      const bad: unknown = { ...structuredClone(base), surface: v };
      expect(validateEndless(bad as typeof base).errors.some((e) => e.startsWith('V1:')), `surface ${String(v)}`).toBe(true);
    }
  });
});
