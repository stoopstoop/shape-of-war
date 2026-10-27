// TODO(W2, Foundry generator brief): generator.ts does not exist yet. Replace the dynamic loader
// below with a static import from '../../src/levelgen/generator' and change describe.skip to
// describe. Function names follow docs/02 section 1 (generateEndlessSegment supersedes the
// generateEndless(seed) of docs/05). Capture the levelHash golden values on the first green run.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BANDS, bandOf, levelSeed } from '../../src/levelgen/leveldef';
import type { EndlessSegmentDef, GenConfig, LevelDef } from '../../src/levelgen/leveldef';
import { validateLevel, validateSegment } from '../../src/levelgen/validate';

interface GeneratorModule {
  generateLevel(runSeed: number, levelIndex: number, cfg?: GenConfig): LevelDef;
  generateEndlessSegment(endlessSeed: number, segment: number, cfg?: GenConfig): EndlessSegmentDef;
  levelHash(def: LevelDef): string;
}

function isGeneratorModule(m: unknown): m is GeneratorModule {
  if (typeof m !== 'object' || m === null) return false;
  const r = m as Record<string, unknown>;
  return typeof r['generateLevel'] === 'function' && typeof r['generateEndlessSegment'] === 'function' && typeof r['levelHash'] === 'function';
}

// A non literal specifier keeps tsc and Vite from resolving a module that does not exist yet.
const GENERATOR_PATH = ['..', '..', 'src', 'levelgen', 'generator'].join('/');

let gen: GeneratorModule;

const RUN_SEEDS = [0, 1, 0xdeadbeef, 0x4e464f4c] as const;
const EDGE_SEEDS = [0, 0xffffffff] as const;
const BAND_SAMPLE_LEVELS = [1, 5, 6, 12, 15, 16, 20, 30, 31, 37, 60, 200] as const;
const MAX_ARENA = 2400;

const seeds = (n: number, from = 1): number[] => Array.from({ length: n }, (_, i) => (from + i * 2654435761) >>> 0);

function expectValid(def: LevelDef): void {
  const r = validateLevel(def);
  expect(r.errors, `runSeed ${def.runSeed} level ${def.levelIndex}`).toEqual([]);
}

describe.skip('generator (TODO W2: enable when generator.ts lands)', () => {
  beforeAll(async () => {
    const mod: unknown = await import(/* @vite-ignore */ GENERATOR_PATH);
    if (!isGeneratorModule(mod)) throw new Error('generator.ts does not export the docs/02 contract');
    gen = mod;
  });

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
      const cfg: GenConfig = { enableSnake: false, enableSpawner: false, drones: ['attack'], supers: ['turbo'] };
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

    // W2: paste the values printed on the first green run for seeds 1, 42, 0xDEADBEEF at levels 1 and 8
    // (docs/06 says index 0 and 7; level indices start at 1 per docs/02, so both shift by one).
    it.todo('hard coded hashes for seeds 1, 42, 0xDEADBEEF at levels 1 and 8');
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
  });
});
