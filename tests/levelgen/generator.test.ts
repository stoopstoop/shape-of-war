// Generator suite, docs/02 section 12 and docs/06 section 2.3. Function names follow docs/02
// section 1; generateEndless(seed) of docs/05 is the additive Endless game definition.
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as gen from '../../src/levelgen/generator';
import { BANDS, DEFAULT_GEN_CONFIG, ENDLESS_ARENA, MAX_RETRIES, V1_GEN_CONFIG, bandOf, levelSeed } from '../../src/levelgen/leveldef';
import type { GenConfig, LevelDef } from '../../src/levelgen/leveldef';
import {
  FOLD_SAFE_RECTS,
  MIN_SHIP_PX,
  SHIP_RADIUS,
  fitScale,
  validateEndless,
  validateLevel,
  validateSegment,
} from '../../src/levelgen/validate';

const RUN_SEEDS = [0, 1, 0xdeadbeef, 0x4e464f4c] as const;
const EDGE_SEEDS = [0, 0xffffffff] as const;
const BAND_SAMPLE_LEVELS = [1, 5, 6, 12, 15, 16, 20, 30, 31, 37, 60, 200] as const;
const MAX_ARENA = 2400;

const seeds = (n: number, from = 1): number[] => Array.from({ length: n }, (_, i) => (from + i * 2654435761) >>> 0);

function expectValid(def: LevelDef): void {
  const r = validateLevel(def);
  expect(r.errors, `runSeed ${def.runSeed} level ${def.levelIndex}`).toEqual([]);
}

// Sweeps generate thousands of levels; allow headroom on slower runners.
describe('generator', { timeout: 30_000 }, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('determinism', () => {
    it('same (runSeed, levelIndex) gives a deep equal LevelDef for 100 pairs', () => {
      for (const s of seeds(25)) {
        for (const n of [1, 7, 20, 37]) {
          const a = gen.generateLevel(s, n);
          const b = gen.generateLevel(s, n);
          expect(b).toEqual(a);
          expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        }
      }
    });

    it('different levels of one run give different LevelDefs', () => {
      const json = new Set<string>();
      for (let n = 1; n <= 60; n++) json.add(JSON.stringify(gen.generateLevel(0x4e464f4c, n)));
      expect(json.size).toBe(60);
    });

    it('seed field is levelSeed(runSeed, levelIndex)', () => {
      const d = gen.generateLevel(0x4e464f4c, 1);
      expect(d.seed).toBe(levelSeed(0x4e464f4c, 1));
      expect(d.seed).toBe(0x229578a8);
    });

    it('is pure: Math.random and Date.now are never called', () => {
      vi.spyOn(Math, 'random').mockImplementation(() => {
        throw new Error('Math.random called');
      });
      vi.spyOn(Date, 'now').mockImplementation(() => {
        throw new Error('Date.now called');
      });
      for (let n = 1; n <= 100; n++) expect(() => gen.generateLevel(42, n)).not.toThrow();
      expect(() => gen.generateEndlessSegment(42, 3)).not.toThrow();
    });

    it('stubbing only Math.random to throw still generates levels, segments and Endless', () => {
      const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
        throw new Error('Math.random called');
      });
      for (const n of [1, 6, 16, 31, 99]) expect(validateLevel(gen.generateLevel(7, n)).ok).toBe(true);
      expect(validateSegment(gen.generateEndlessSegment(7, 20)).ok).toBe(true);
      expect(validateEndless(gen.generateEndless(7)).ok).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    });

    it('output is frozen', () => {
      const d = gen.generateLevel(1, 1);
      expect(Object.isFrozen(d)).toBe(true);
      expect(Object.isFrozen(d.arena)).toBe(true);
    });
  });

  describe('validity', () => {
    it('1000 consecutive seeds validate at level 1 and level 20', () => {
      for (let s = 0; s < 1000; s++) {
        expectValid(gen.generateLevel(s, 1));
        expectValid(gen.generateLevel(s, 20));
      }
    });

    it('run seeds x levels 1 to 200 validate', () => {
      for (const s of RUN_SEEDS) for (let n = 1; n <= 200; n++) expectValid(gen.generateLevel(s, n));
    });

    it('edge seeds 0 and 0xFFFFFFFF generate valid levels in every band', () => {
      for (const s of EDGE_SEEDS) {
        for (const n of [1, 6, 16, 31, 1000, 100000]) {
          const d = gen.generateLevel(s, n);
          expect(d.runSeed).toBe(s);
          expectValid(d);
        }
      }
    });

    it('LevelDef survives a JSON round trip', () => {
      for (const s of RUN_SEEDS) {
        for (const n of BAND_SAMPLE_LEVELS) {
          const d = gen.generateLevel(s, n);
          expect(JSON.parse(JSON.stringify(d))).toEqual(d);
        }
      }
    });
  });

  describe('scaling with level index', () => {
    const area = (d: LevelDef): number => d.arena.width * d.arena.height;

    it('mean arena area at level 20 is above level 1, never above 2400 x 2400', () => {
      let a1 = 0;
      let a20 = 0;
      for (const s of seeds(500)) {
        const d1 = gen.generateLevel(s, 1);
        const d20 = gen.generateLevel(s, 20);
        for (const d of [d1, d20]) {
          expect(d.arena.width).toBeLessThanOrEqual(MAX_ARENA);
          expect(d.arena.height).toBeLessThanOrEqual(MAX_ARENA);
        }
        a1 += area(d1);
        a20 += area(d20);
      }
      expect(a20).toBeGreaterThan(a1);
    });

    it('arena height stays within the band range', () => {
      for (const s of seeds(200)) {
        for (const n of BAND_SAMPLE_LEVELS) {
          const d = gen.generateLevel(s, n);
          const h = BANDS[bandOf(n)].arenaHeight;
          expect(d.arena.height).toBeGreaterThanOrEqual(h.min);
          expect(d.arena.height).toBeLessThanOrEqual(h.max);
        }
      }
    });

    it('roster weighting: snake and spawners appear more often at higher levels', () => {
      let snakes1 = 0;
      let snakes20 = 0;
      let spawners1 = 0;
      let spawners37 = 0;
      for (const s of seeds(500)) {
        const d1 = gen.generateLevel(s, 1);
        const d20 = gen.generateLevel(s, 20);
        const d37 = gen.generateLevel(s, 37);
        if (d1.roster.some((e) => e.kind === 'snake')) snakes1++;
        if (d20.roster.some((e) => e.kind === 'snake')) snakes20++;
        spawners1 += d1.hazards.spawners.length;
        spawners37 += d37.hazards.spawners.length;
      }
      expect(snakes1).toBe(0);
      expect(snakes20).toBeGreaterThan(snakes1);
      expect(spawners1).toBe(0);
      expect(spawners37).toBeGreaterThan(spawners1);
    });

    it('roster size and composition per band', () => {
      for (const s of seeds(200)) {
        for (const n of BAND_SAMPLE_LEVELS) {
          const d = gen.generateLevel(s, n);
          const size = BANDS[bandOf(n)].rosterSize;
          expect(d.roster.length).toBeGreaterThanOrEqual(Math.max(3, size.min));
          expect(d.roster.length).toBeLessThanOrEqual(Math.min(6, size.max));
          expect(d.roster.map((e) => e.kind)).toContain('grunt');
          if (bandOf(n) === 1) expect(d.roster.map((e) => e.kind).sort()).toEqual(['grunt', 'pinwheel', 'wanderer']);
        }
      }
    });
  });

  describe('level content', () => {
    it('hazards: 0 to 3 wells, 0 to 2 spawners', () => {
      for (const s of seeds(300)) {
        for (const n of BAND_SAMPLE_LEVELS) {
          const d = gen.generateLevel(s, n);
          expect(d.hazards.wells.length).toBeLessThanOrEqual(3);
          expect(d.hazards.spawners.length).toBeLessThanOrEqual(2);
        }
      }
    });

    it('objective is scoreInTime, survive or destroy', () => {
      const kinds = new Set<string>();
      for (const s of seeds(300)) kinds.add(gen.generateLevel(s, 10).objective.kind);
      expect([...kinds].sort()).toEqual(['destroy', 'scoreInTime', 'survive']);
    });

    it('par and stars: multiple of 500, at least 1000, stars 1x 2x 4x, target at most par', () => {
      for (const s of seeds(200)) {
        for (const n of BAND_SAMPLE_LEVELS) {
          const d = gen.generateLevel(s, n);
          expect(d.par % 500).toBe(0);
          expect(d.par).toBeGreaterThanOrEqual(1000);
          expect(d.stars).toEqual([d.par, 2 * d.par, 4 * d.par]);
          if (d.objective.kind === 'scoreInTime') expect(d.objective.target).toBeLessThanOrEqual(d.par);
        }
      }
    });

    it('GenConfig cuts are respected', () => {
      const cfg: GenConfig = { enableSnake: false, enableSpawner: false, drones: ['attack'], supers: ['turbo'], enableV2Enemies: true };
      for (const s of seeds(200)) {
        const d = gen.generateLevel(s, 40, cfg);
        expect(d.roster.map((e) => e.kind)).not.toContain('snake');
        expect(d.hazards.spawners).toEqual([]);
        expect(d.drone).toBe('attack');
        expect(d.superType).toBe('turbo');
        expectValid(d);
      }
    });

    it('generation is fast: 200 levels under 500 ms', () => {
      const t0 = performance.now();
      for (let n = 1; n <= 200; n++) gen.generateLevel(0x4e464f4c, n);
      expect(performance.now() - t0).toBeLessThan(500);
    });
  });

  describe('levelHash', () => {
    it('is stable, short, and differs between levels', () => {
      const a = gen.levelHash(gen.generateLevel(1, 1));
      expect(gen.levelHash(gen.generateLevel(1, 1))).toBe(a);
      expect(a.length).toBeLessThanOrEqual(12);
      expect(gen.levelHash(gen.generateLevel(1, 8))).not.toBe(a);
    });

    // docs/06 says index 0 and 7. Level indices start at 1 (docs/02 section 2, validator J4), so
    // the first and eighth levels are levelIndex 1 and 8. Captured on the first green run of
    // GENERATOR_VERSION 1: a change here means generator output changed and needs a version bump.
    // V2-C: pinned to enableV2Enemies false, the v1 generator. The flag on goldens are in
    // v2enemies.test.ts; level 1 (band 1) is the same either way.
    it('hard coded hashes for seeds 1, 42, 0xDEADBEEF at levels 1 and 8', () => {
      const got: Record<string, string> = {};
      for (const s of [1, 42, 0xdeadbeef]) for (const n of [1, 8]) got[`${s}:${n}`] = gen.levelHash(gen.generateLevel(s, n, V1_GEN_CONFIG));
      for (const s of [1, 42, 0xdeadbeef]) expect(gen.levelHash(gen.generateLevel(s, 1))).toBe(got[`${s}:1`]);
      expect(got).toEqual({
        '1:1': 'E0D43B03',
        '1:8': '71455C7D',
        '42:1': 'CD2B515B',
        '42:8': '60ED65A7',
        '3735928559:1': 'EE4217C3',
        '3735928559:8': 'F0A97336',
      });
    });

    it('hashes canonical JSON: key order does not matter, any value change does', () => {
      const d = gen.generateLevel(42, 8);
      const reordered = JSON.parse(JSON.stringify(d, Object.keys(d).reverse())) as LevelDef;
      expect(gen.canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
      expect(gen.levelHash({ ...d })).toBe(gen.levelHash(d));
      expect(gen.levelHash({ ...d, par: d.par + 500 })).not.toBe(gen.levelHash(d));
      expect(gen.levelHash(gen.generateLevel(42, 8))).toMatch(/^[0-9A-F]{8}$/);
      expect(Object.keys(reordered)).not.toEqual(Object.keys(d));
    });
  });

  describe('endless segments', () => {
    it('are deterministic and validate', () => {
      for (const s of seeds(50)) {
        for (const seg of [0, 1, 3, 8, 15, 40]) {
          const a = gen.generateEndlessSegment(s, seg);
          expect(gen.generateEndlessSegment(s, seg)).toEqual(a);
          expect(validateSegment(a).errors).toEqual([]);
        }
      }
    });

    it('escalate: band 1, 2, 3, 4 at segments 0, 3, 8, 15', () => {
      expect([0, 3, 8, 15].map((seg) => gen.generateEndlessSegment(0x4e464f4c, seg).band)).toEqual([1, 2, 3, 4]);
    });

    it('match the docs/02 segment seeds and keep every wave inside 30 s', () => {
      expect([0, 1, 2].map((seg) => gen.generateEndlessSegment(0x4e464f4c, seg).seed)).toEqual([0x84a226d0, 0x9dbb7814, 0xbf9ea0eb]);
      for (let seg = 0; seg < 20; seg++) {
        const d = gen.generateEndlessSegment(0x4e464f4c, seg);
        expect(d.waves.waves.every((w) => w.atSec < 30)).toBe(true);
        expect(d.waves.loopFromIndex).toBe(-1);
      }
    });

    it('edge seeds 0 and 0xFFFFFFFF generate valid segments', () => {
      for (const s of EDGE_SEEDS) expect(validateSegment(gen.generateEndlessSegment(s, 0)).ok).toBe(true);
    });

    it('ramp is unbounded past band 4: budget keeps growing per segment and spawns grow with it', () => {
      expect(gen.endlessBudgetBonus(14)).toBe(0);
      expect(gen.endlessBudgetBonus(15)).toBe(0);
      expect(gen.endlessBudgetBonus(115)).toBe(100);
      const spawns = (seg: number): number => gen.generateEndlessSegment(9, seg).waves.waves.reduce((a, w) => a + w.entries.length, 0);
      const s20 = gen.generateEndlessSegment(9, 20);
      const s60 = gen.generateEndlessSegment(9, 60);
      expect(s60.waves.budgetEnd).toBeGreaterThan(s20.waves.budgetEnd);
      expect(spawns(60)).toBeGreaterThan(spawns(20));
      expect(spawns(200)).toBeGreaterThan(spawns(60));
      for (const seg of [60, 200]) expect(validateSegment(gen.generateEndlessSegment(9, seg)).errors).toEqual([]);
    });
  });

  describe('generateEndless', () => {
    it('has mode endless, objective none, the fixed arena and kit, and validates', () => {
      for (const s of [0, 1, 0xffffffff]) {
        const d = gen.generateEndless(s);
        expect(d.mode).toBe('endless');
        expect(d.objective).toEqual({ kind: 'none' });
        expect(d.endlessSeed).toBe(s);
        expect(d.arena).toEqual(ENDLESS_ARENA);
        expect(d.drone).toBe('attack');
        expect(d.superType).toBe('turbo');
        expect(d.surface).toBe('flat');
        expect(d.hazards).toEqual({ wells: [], spawners: [] });
        expect(d.budgetPerSegment).toBeGreaterThan(0);
        expect(d.roster.map((e) => e.kind)).toEqual([
          ...['grunt', 'wanderer', 'weaver', 'pinwheel', 'dart', 'snake'],
          ...['charger', 'bulwark', 'blink', 'swirl', 'sower', 'splime'],
        ]);
        expect(gen.generateEndless(s, V1_GEN_CONFIG).roster.map((e) => e.kind)).toEqual(['grunt', 'wanderer', 'weaver', 'pinwheel', 'dart', 'snake']);
        expect(Object.isFrozen(d.arena)).toBe(true);
        expect(JSON.parse(JSON.stringify(d))).toEqual(d);
        expect(validateEndless(d).errors).toEqual([]);
        expect(gen.generateEndless(s)).toEqual(d);
      }
    });

    it('respects the snake cut and reports a broken def', () => {
      const cut = gen.generateEndless(5, { enableSnake: false, enableSpawner: false, drones: ['attack'], supers: ['turbo'], enableV2Enemies: true });
      expect(cut.roster.map((e) => e.kind)).not.toContain('snake');
      const bad = { ...structuredClone(gen.generateEndless(5)), objective: { kind: 'none' as const }, budgetPerSegment: 0 };
      expect(validateEndless(bad).errors.some((e) => e.startsWith('E1:'))).toBe(true);
    });
  });

  describe('retries', () => {
    it('first attempts need no retry and record retries 0 within 0 to MAX_RETRIES', () => {
      let total = 0;
      for (let s = 0; s < 200; s++) {
        const r = gen.generateLevel(s, 25).retries ?? -1;
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(MAX_RETRIES);
        total += r;
      }
      expect(total).toBe(0);
    });

    it('a rejected attempt re-derives deterministically and records the count', () => {
      let calls = 0;
      const rejectTwo = (): boolean => ++calls > 2;
      const a = gen.generateLevelChecked(42, 12, DEFAULT_GEN_CONFIG, rejectTwo);
      expect(a.retries).toBe(2);
      calls = 0;
      expect(gen.generateLevelChecked(42, 12, DEFAULT_GEN_CONFIG, rejectTwo)).toEqual(a);
      const first = gen.generateLevel(42, 12);
      expect(a.seed).toBe(first.seed);
      expect(a.arena).not.toEqual(first.arena);
      expect(validateLevel(a).errors).toEqual([]);
      expect(gen.attemptSeed(first.seed, 0)).toBe(first.seed);
      expect(gen.attemptSeed(first.seed, 1)).not.toBe(gen.attemptSeed(first.seed, 2));
    });

    it('gives up after MAX_RETRIES and still returns a frozen def', () => {
      let calls = 0;
      const d = gen.generateLevelChecked(1, 3, DEFAULT_GEN_CONFIG, () => {
        calls++;
        return false;
      });
      expect(d.retries).toBe(MAX_RETRIES);
      expect(calls).toBe(MAX_RETRIES);
      expect(Object.isFrozen(d)).toBe(true);
    });
  });

  describe('fold fit', () => {
    it('every swept arena keeps the ship at least 16 px on both fold safe rects', () => {
      for (const s of RUN_SEEDS) {
        for (const n of BAND_SAMPLE_LEVELS) {
          const a = gen.generateLevel(s, n).arena;
          for (const rect of FOLD_SAFE_RECTS) expect(2 * SHIP_RADIUS * fitScale(a.width, a.height, rect)).toBeGreaterThanOrEqual(MIN_SHIP_PX);
        }
      }
    });
  });
});
