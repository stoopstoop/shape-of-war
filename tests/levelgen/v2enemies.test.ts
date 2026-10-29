// V2-C enemy stage (docs/10-v2-plan.md wave V2-C, docs/11 section 6.3). Flag off is the v1
// generator byte for byte; flag on adds the six new kinds in bands 2 and up at the target shares.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mulberry32, streamSeed } from '../../src/core/rng';
import * as gen from '../../src/levelgen/generator';
import {
  BANDS,
  DEFAULT_GEN_CONFIG,
  ENEMY_BASE,
  ENEMY_GEOMS,
  ENEMY_KINDS,
  GENERATOR_VERSION,
  GENERATOR_VERSION_V2,
  LEVELDEF_VERSION,
  MAX_RETRIES,
  V1_GEN_CONFIG,
  V2_ENEMY_KINDS,
  V2_GEN_CONFIG,
  fmix32,
  levelSeed,
} from '../../src/levelgen/leveldef';
import type { Band, EnemyKind, LevelDef, WaveSchedule } from '../../src/levelgen/leveldef';
import {
  ALL_ENEMY_KINDS,
  V2_ENEMY_SALT,
  V2_ROSTER_SLOTS,
  V2_SPAWN_UNIT,
  inclusionProbs,
  planV2Roster,
  swapGroupKind,
  systematicSample,
  v2Eligible,
  v2GroupCount,
  v2Share,
  v2TotalShare,
} from '../../src/levelgen/v2enemies';
import { validateEndless, validateLevel, validateSegment } from '../../src/levelgen/validate';

const SPREAD = 2654435761;
const seedAt = (i: number): number => (1 + i * SPREAD) >>> 0;
const BAND_LEVELS: Readonly<Record<Band, readonly [number, number]>> = { 1: [1, 5], 2: [6, 15], 3: [16, 30], 4: [31, 60] };
const BAND_LIST: readonly Band[] = [1, 2, 3, 4];
const SEEDS = 1000;
const HAZARD_NAMES = ['mine', 'slime'];
const isV2 = (k: string): boolean => (V2_ENEMY_KINDS as readonly string[]).includes(k);

/**
 * 1000 flag on levels of one band: seed i plays level lo + i mod (band width). V3: bosses off
 * (V2_GEN_CONFIG), so this file keeps pinning v2.1; the boss flag has its own tests.
 */
function bandSweep(band: Band): LevelDef[] {
  const [lo, hi] = BAND_LEVELS[band];
  return Array.from({ length: SEEDS }, (_, i) => gen.generateLevel(seedAt(i), lo + (i % (hi - lo + 1)), V2_GEN_CONFIG));
}

function namedKinds(roster: readonly { kind: string }[], ws: WaveSchedule): string[] {
  const out = roster.map((e) => e.kind);
  for (const w of ws.waves) for (const e of w.entries) out.push(e.kind);
  return out;
}

/** FNV-1a folded over strings, finished with fmix32: one number for a long list of hashes. */
function fold(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

describe('v2 enemy stage', { timeout: 60_000 }, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('flag off is v1', () => {
    // Digests captured by running the main 1612a53 generator (v1, before this wave) over the same
    // loops. Any drift in the flag off path changes them.
    it('1000 seeds x 7 levels across all bands hash exactly as the v1 generator did', () => {
      let h = 0x811c9dc5;
      for (let s = 0; s < SEEDS; s++) {
        for (const n of [1, 5, 7, 12, 20, 33, 47]) {
          const d = gen.generateLevel((s * SPREAD) >>> 0, n, V1_GEN_CONFIG);
          expect(d.generatorVersion).toBe(GENERATOR_VERSION);
          h = fold(h, gen.levelHash(d));
        }
      }
      expect(fmix32(h).toString(16)).toBe('172e788d');
    });

    it('Endless defs and segments 0 to 20 for 50 seeds match the v1 generator', () => {
      let e = 0x811c9dc5;
      for (let s = 0; s < 50; s++) {
        e = fold(e, gen.levelHash(gen.generateEndless(s, V1_GEN_CONFIG)));
        for (let k = 0; k <= 20; k++) e = fold(e, JSON.stringify(gen.generateEndlessSegment(s, k, V1_GEN_CONFIG)));
      }
      expect(fmix32(e).toString(16)).toBe('1512c4c4');
    });

    it('names no v2 kind anywhere', () => {
      for (let i = 0; i < 200; i++) {
        for (const n of [6, 16, 31, 99]) {
          const d = gen.generateLevel(seedAt(i), n, V1_GEN_CONFIG);
          expect(namedKinds(d.roster, d.waves).some(isV2)).toBe(false);
        }
      }
    });

    it('the default config turns the flag on', () => {
      expect(DEFAULT_GEN_CONFIG.enableV2Enemies).toBe(true);
      expect(V1_GEN_CONFIG.enableV2Enemies).toBe(false);
      expect(gen.generateLevel(42, 20)).toEqual(gen.generateLevel(42, 20, DEFAULT_GEN_CONFIG));
    });
  });

  describe('flag on', () => {
    const sweeps = new Map<Band, LevelDef[]>();
    beforeAll(() => {
      for (const b of BAND_LIST) sweeps.set(b, bandSweep(b));
    }, 60_000);
    const sweep = (b: Band): LevelDef[] => sweeps.get(b) ?? [];

    it('1000 seeds per band validate with no errors and no re-derive past MAX_RETRIES', () => {
      for (const b of BAND_LIST) {
        for (const d of sweep(b)) {
          expect(validateLevel(d).errors, `seed ${d.runSeed} level ${d.levelIndex}`).toEqual([]);
          expect(d.retries ?? -1).toBeGreaterThanOrEqual(0);
          expect(d.retries ?? 99).toBeLessThanOrEqual(MAX_RETRIES);
        }
      }
    });

    it('band 1 never contains a new kind and keeps its v1 hash and version', () => {
      for (const d of sweep(1)) {
        expect(namedKinds(d.roster, d.waves).some(isV2)).toBe(false);
        expect(d.generatorVersion).toBe(GENERATOR_VERSION);
        expect(gen.levelHash(d)).toBe(gen.levelHash(gen.generateLevel(d.runSeed, d.levelIndex, V1_GEN_CONFIG)));
      }
    });

    it('bands 2 and up carry generator version 2 and LevelDef version 1', () => {
      for (const b of [2, 3, 4] as const) {
        for (const d of sweep(b)) {
          expect(d.generatorVersion).toBe(GENERATOR_VERSION_V2);
          expect(d.version).toBe(LEVELDEF_VERSION);
        }
      }
      expect(LEVELDEF_VERSION).toBe(1);
      expect(GENERATOR_VERSION).toBe(1);
      expect(GENERATOR_VERSION_V2).toBe(2);
    });

    it('share of spawn entries per new kind is within 3 points of the table in every band', () => {
      for (const b of BAND_LIST) {
        const count = new Map<string, number>();
        let total = 0;
        for (const d of sweep(b)) {
          for (const w of d.waves.waves) {
            for (const e of w.entries) {
              count.set(e.kind, (count.get(e.kind) ?? 0) + 1);
              total++;
            }
          }
        }
        for (const k of V2_ENEMY_KINDS) {
          const got = (100 * (count.get(k) ?? 0)) / total;
          const want = 100 * v2Share(b, k);
          expect(Math.abs(got - want), `band ${b} ${k} share ${got.toFixed(1)} want ${want}`).toBeLessThanOrEqual(3);
          if (want === 0) expect(count.get(k) ?? 0, `band ${b} ${k}`).toBe(0);
        }
      }
    });

    it('rosters keep 3 to 6 distinct kinds with grunt, the v1 band size, and cover the waves', () => {
      for (const b of BAND_LIST) {
        const size = BANDS[b].rosterSize;
        for (const d of sweep(b)) {
          const kinds = d.roster.map((e) => e.kind);
          expect(kinds).toContain('grunt');
          expect(new Set(kinds).size).toBe(kinds.length);
          expect(kinds.length).toBeGreaterThanOrEqual(Math.max(3, size.min));
          expect(kinds.length).toBeLessThanOrEqual(Math.min(6, size.max));
          expect(kinds.filter(isV2).length).toBeLessThanOrEqual(V2_ROSTER_SLOTS[b]);
          for (const w of d.waves.waves) for (const e of w.entries) expect(kinds).toContain(e.kind);
        }
      }
    });

    it('no roster or wave ever names a hazard: every name is an EnemyKind, never mine or slime', () => {
      // One expect over the whole sweep: per entry expects took over 60 s on the CI runner.
      const names = new Set<string>();
      for (const b of BAND_LIST) for (const d of sweep(b)) for (const k of namedKinds(d.roster, d.waves)) names.add(k);
      const bad = [...names].filter((k) => !ALL_ENEMY_KINDS.includes(k as EnemyKind) || HAZARD_NAMES.includes(k));
      expect(bad).toEqual([]);
      expect(ALL_ENEMY_KINDS.filter((k) => HAZARD_NAMES.includes(k))).toEqual([]);
    }, 120000);

    it('every new kind appears in some roster in its bands', () => {
      for (const b of [2, 3, 4] as const) {
        const seen = new Set<EnemyKind>();
        for (const d of sweep(b)) for (const e of d.roster) seen.add(e.kind);
        expect([...seen].filter(isV2).sort()).toEqual([...v2Eligible(b)].sort());
      }
    });

    it('LevelDefs survive a JSON round trip', () => {
      for (const b of BAND_LIST) {
        for (const d of sweep(b).slice(0, 100)) expect(JSON.parse(JSON.stringify(d))).toEqual(d);
      }
    });

    it('is deterministic with no hidden state between calls', () => {
      const pairs: [number, number][] = [
        [42, 20],
        [7, 40],
        [1, 9],
      ];
      const first = pairs.map(([s, n]) => gen.levelHash(gen.generateLevel(s, n)));
      const reversed = [...pairs].reverse().map(([s, n]) => gen.levelHash(gen.generateLevel(s, n)));
      expect(reversed.reverse()).toEqual(first);
      expect(gen.generateLevel(42, 37)).toEqual(gen.generateLevel(42, 37));
    });

    it('stubbing Math.random to throw still generates levels, segments and Endless', () => {
      const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
        throw new Error('Math.random called');
      });
      for (const n of [1, 6, 16, 31, 99]) expect(validateLevel(gen.generateLevel(7, n)).errors).toEqual([]);
      for (const s of [3, 8, 20]) expect(validateSegment(gen.generateEndlessSegment(7, s)).errors).toEqual([]);
      expect(validateEndless(gen.generateEndless(7)).errors).toEqual([]);
      expect(spy).not.toHaveBeenCalled();
    });

    // Captured on the first green run of GENERATOR_VERSION_V2. A change here means flag on output
    // changed: regenerate on purpose or find the regression.
    it('hard coded levelHash goldens for seeds 1, 42, 0xDEADBEEF at levels 7 and 20', () => {
      const got: Record<string, string> = {};
      for (const s of [1, 42, 0xdeadbeef]) for (const n of [7, 20]) got[String(s) + ':' + String(n)] = gen.levelHash(gen.generateLevel(s, n, V2_GEN_CONFIG));
      expect(got).toEqual({
        '1:7': 'C27F8965',
        '1:20': '28D09272',
        '42:7': 'CC6859DC',
        '42:20': 'D25C4D7D',
        '3735928559:7': '7EA59153',
        '3735928559:20': 'DFAC92E8',
      });
    });
  });

  describe('spawn units', () => {
    it('a swapped group spawns one new enemy per unit of its v1 budget; kept groups are untouched', () => {
      for (const band of [2, 3, 4] as const) {
        for (let i = 0; i < 40; i++) {
          const seed = levelSeed(seedAt(i), BAND_LEVELS[band][0]);
          const b = BANDS[band];
          const arena = gen.generateArena(mulberry32(streamSeed(seed, gen.SALT.arena)), band);
          const roster = gen.generateRoster(mulberry32(streamSeed(seed, gen.SALT.roster)), band, DEFAULT_GEN_CONFIG);
          const run = { arena, roster, b, tStart: 2.5, tEnd: b.scheduleSec, rampOffsetSec: 0, fullRamp: false, budgetBonus: 0 };
          const list = gen.generateWaveGroups(mulberry32(streamSeed(seed, gen.SALT.waves)), run);
          expect(list.waves).toEqual(gen.generateWaveList(mulberry32(streamSeed(seed, gen.SALT.waves)), run));
          const out = gen.applyV2Enemies(mulberry32(streamSeed(seed, V2_ENEMY_SALT)), band, arena, roster, list);
          list.waves.forEach((src, wi) => {
            const entries = out.waves[wi]?.entries ?? [];
            const kept = new Set(entries);
            let swappedUnits = 0;
            for (const g of list.groups.filter((x) => x.wave === wi)) {
              const firstEntry = src.entries[g.first];
              if (firstEntry !== undefined && kept.has(firstEntry)) {
                for (const e of src.entries.slice(g.first, g.first + g.count)) expect(kept.has(e)).toBe(true);
              } else {
                swappedUnits += g.units;
              }
            }
            expect(entries.filter((e) => isV2(e.kind)).length).toBe(swappedUnits);
            expect(out.waves[wi]?.atSec).toBe(src.atSec);
          });
        }
      }
    });

    it('new kinds cost 1 unit', () => {
      expect(V2_SPAWN_UNIT).toBe(1);
      for (const u of [1, 2, 7, 20, 185]) expect(v2GroupCount(u)).toBe(u);
    });
  });

  describe('tables', () => {
    it('ENEMY_BASE and ENEMY_GEOMS carry the docs/11 6.2 values', () => {
      expect(V2_ENEMY_KINDS.map((k) => ENEMY_BASE[k])).toEqual([120, 150, 130, 80, 180, 140]);
      expect(V2_ENEMY_KINDS.map((k) => ENEMY_GEOMS[k])).toEqual([2, 3, 2, 1, 3, 2]);
      expect(ENEMY_KINDS.map((k) => ENEMY_BASE[k])).toEqual([50, 10, 100, 25, 30, 200]);
    });

    it('band weights are the docs/11 6.3 target shares, splime 0, 8, 10, 10', () => {
      const row = (k: EnemyKind): number[] => BAND_LIST.map((b) => BANDS[b].rosterWeights[k]);
      expect(row('charger')).toEqual([0, 12, 16, 18]);
      expect(row('swirl')).toEqual([0, 10, 12, 12]);
      expect(row('bulwark')).toEqual([0, 0, 12, 16]);
      expect(row('blink')).toEqual([0, 0, 10, 14]);
      expect(row('sower')).toEqual([0, 0, 0, 10]);
      expect(row('splime')).toEqual([0, 8, 10, 10]);
      expect(BAND_LIST.map((b) => Math.round(100 * v2TotalShare(b)))).toEqual([0, 30, 60, 80]);
    });

    it('par counts the new kinds: the same schedule scores higher with Bulwarks than Grunts', () => {
      const d = gen.generateLevel(42, 20, V1_GEN_CONFIG);
      const as = (kind: EnemyKind): WaveSchedule => ({
        ...d.waves,
        waves: d.waves.waves.map((w) => ({ ...w, entries: w.entries.map((e) => ({ ...e, kind })) })),
      });
      const o = { kind: 'survive' as const, durationSec: 90 };
      expect(gen.computePar(as('bulwark'), o).par).toBeGreaterThan(gen.computePar(as('grunt'), o).par);
      expect(gen.computePar(as('sower'), o).par).toBeGreaterThan(gen.computePar(as('swirl'), o).par);
    });

    it('stored par matches computePar on flag on levels', () => {
      for (const n of [7, 20, 37]) {
        const d = gen.generateLevel(42, n);
        expect(gen.computePar(d.waves, d.objective).par).toBe(d.par);
      }
    });
  });

  describe('pure helpers', () => {
    it('inclusion probabilities sum to j and never exceed 1', () => {
      for (const b of [2, 3, 4] as const) {
        for (let j = 1; j <= V2_ROSTER_SLOTS[b]; j++) {
          const p = inclusionProbs(b, j);
          expect(p.reduce((a, x) => a + x, 0)).toBeCloseTo(j, 9);
          for (const x of p) expect(x).toBeLessThanOrEqual(1);
        }
      }
    });

    it('systematic sampling returns j distinct items at the given probabilities', () => {
      const items = ['a', 'b', 'c', 'd'];
      const probs = [0.9, 0.5, 0.4, 0.2];
      const hits = new Map<string, number>();
      const N = 1000;
      for (let i = 0; i < N; i++) {
        const got = systematicSample((i + 0.5) / N, items, probs, 2);
        expect(got).toHaveLength(2);
        expect(new Set(got).size).toBe(2);
        for (const g of got) hits.set(g, (hits.get(g) ?? 0) + 1);
      }
      items.forEach((k, i) => expect((hits.get(k) ?? 0) / N).toBeCloseTo(probs[i] ?? 0, 2));
    });

    it('band 1 plans no new kind and draws nothing', () => {
      const r = (): number => {
        throw new Error('drew');
      };
      const roster = gen.generateLevel(1, 1).roster;
      const plan = planV2Roster(r, 1, roster, []);
      expect(plan.added).toEqual([]);
      expect(plan.roster).toEqual(roster);
      expect(swapGroupKind(r, plan, 'grunt')).toBeNull();
    });

    it('a dropped kind always swaps; grunt stays in the roster', () => {
      const roster = gen.generateLevel(5, 40, V1_GEN_CONFIG).roster;
      const groups = roster.map((e) => ({ kind: e.kind }));
      const plan = planV2Roster(mulberry32(9), 4, roster, groups);
      expect(plan.added.length).toBe(3);
      expect(plan.dropped.length).toBe(3);
      expect(plan.roster.map((e) => e.kind)).toContain('grunt');
      expect(plan.roster.length).toBe(roster.length);
      const r = mulberry32(3);
      for (const k of plan.dropped) for (let i = 0; i < 50; i++) expect(plan.added).toContain(swapGroupKind(r, plan, k));
    });
  });

  describe('Endless', () => {
    it('segments 0 to 2 (band 1) have no new kind; band 2 and up carry version 2 and validate', () => {
      for (let s = 0; s < 30; s++) {
        for (let k = 0; k <= 24; k++) {
          const seg = gen.generateEndlessSegment(seedAt(s), k, V2_GEN_CONFIG);
          expect(validateSegment(seg).errors).toEqual([]);
          if (seg.band === 1) {
            expect(namedKinds(seg.roster, seg.waves).some(isV2)).toBe(false);
            expect(seg.generatorVersion).toBe(GENERATOR_VERSION);
            expect(seg).toEqual(gen.generateEndlessSegment(seedAt(s), k, V1_GEN_CONFIG));
          } else {
            expect(seg.generatorVersion).toBe(GENERATOR_VERSION_V2);
          }
        }
      }
    });

    it('the band 4 ramp includes all six new kinds, and only with the flag on', () => {
      const on = new Set<string>();
      const off = new Set<string>();
      for (let s = 0; s < 40; s++) {
        for (const k of [15, 20, 40, 80]) {
          const seg = gen.generateEndlessSegment(seedAt(s), k);
          expect(seg.band).toBe(4);
          for (const n of namedKinds(seg.roster, seg.waves)) on.add(n);
          const v1 = gen.generateEndlessSegment(seedAt(s), k, V1_GEN_CONFIG);
          for (const n of namedKinds(v1.roster, v1.waves)) off.add(n);
        }
      }
      expect([...on].filter(isV2).sort()).toEqual([...V2_ENEMY_KINDS].sort());
      expect([...off].filter(isV2)).toEqual([]);
    });

    it('generateEndless lists the full catalogue with the flag on and validates', () => {
      const d = gen.generateEndless(11);
      expect(d.generatorVersion).toBe(GENERATOR_VERSION_V2);
      expect(d.roster.map((e) => e.kind)).toEqual([...ALL_ENEMY_KINDS]);
      expect(validateEndless(d).errors).toEqual([]);
      const cut = gen.generateEndless(11, { ...DEFAULT_GEN_CONFIG, enableSnake: false });
      expect(cut.roster.map((e) => e.kind)).not.toContain('snake');
      expect(validateEndless(cut).errors).toEqual([]);
      const v1 = gen.generateEndless(11, V1_GEN_CONFIG);
      expect(v1.generatorVersion).toBe(GENERATOR_VERSION);
      expect(validateEndless(v1).errors).toEqual([]);
    });
  });

  describe('validator', () => {
    const v2Level = (): LevelDef => structuredClone(gen.generateLevel(42, 20, V2_GEN_CONFIG));

    it('accepts the new kinds in a version 2 level', () => {
      const d = v2Level();
      expect(d.roster.some((e) => isV2(e.kind))).toBe(true);
      expect(validateLevel(d).errors).toEqual([]);
    });

    it('J6: a version 1 def naming a new kind fails, as does version 2 in band 1', () => {
      const d = v2Level();
      d.generatorVersion = GENERATOR_VERSION;
      expect(validateLevel(d).errors.some((e) => e.startsWith('J6:'))).toBe(true);
      const b1 = structuredClone(gen.generateLevel(42, 3));
      b1.generatorVersion = GENERATOR_VERSION_V2;
      expect(validateLevel(b1).errors.some((e) => e.startsWith('J6:'))).toBe(true);
      const e = structuredClone(gen.generateEndless(3));
      e.generatorVersion = GENERATOR_VERSION;
      const errs = validateEndless(e).errors;
      expect(errs.some((x) => x.startsWith('J6:'))).toBe(true);
      expect(errs.some((x) => x.startsWith('E2:'))).toBe(true);
    });

    it('J3: unknown generator versions fail', () => {
      const d = v2Level();
      // V3: 3 (GENERATOR_VERSION_V3) is now known, so 4 is the first unknown version.
      d.generatorVersion = 4;
      expect(validateLevel(d).errors.some((e) => e.startsWith('J3:'))).toBe(true);
    });

    it('rejects a hazard name in a roster or a wave', () => {
      const d = v2Level();
      const rosterHazard: unknown = { ...d, roster: [...d.roster, { kind: 'mine', weight: 5 }] };
      expect(validateLevel(rosterHazard as LevelDef).errors.some((e) => e.startsWith('R1:') && e.includes('mine'))).toBe(true);
      const w0 = d.waves.waves[0];
      const e0 = w0?.entries[0];
      if (w0 === undefined || e0 === undefined) throw new Error('level has no waves');
      const waveHazard: unknown = { ...d, waves: { ...d.waves, waves: [{ ...w0, entries: [{ ...e0, kind: 'slime' }] }, ...d.waves.waves.slice(1)] } };
      expect(validateLevel(waveHazard as LevelDef).errors.some((e) => e.startsWith('W3:') && e.includes('slime'))).toBe(true);
    });

    it('rejects a new kind outside its bands (R1 eligibility)', () => {
      const d = structuredClone(gen.generateLevel(42, 9));
      const i = d.roster.findIndex((e) => isV2(e.kind));
      expect(i).toBeGreaterThanOrEqual(0);
      d.roster[i] = { kind: 'sower', weight: 10 };
      expect(validateLevel(d).errors.some((e) => e.startsWith('R1:') && e.includes('sower'))).toBe(true);
    });
  });
});
