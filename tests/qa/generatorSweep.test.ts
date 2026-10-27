// Cross module sweep: generateLevel x validateLevel over 5000 run seeds (docs/06 section 2.9).
// Foundry's own suite sweeps 1000 seeds at two indices; this one spreads 5000 seeds over eight
// level indices that sit on and beside the band edges (1 to 5, 6 to 15, 16 to 30, 31 and up), plus
// the two edge seeds over a run of 40 levels. No browser, no Math.random: every input is a pure
// function of the loop counter.
import { beforeAll, describe, expect, it } from 'vitest';
import { generateLevel, levelHash } from '../../src/levelgen/generator';
import { ENEMY_KINDS, MAX_RETRIES, bandOf } from '../../src/levelgen/leveldef';
import type { LevelDef } from '../../src/levelgen/leveldef';
import { validateLevel } from '../../src/levelgen/validate';

const SEED_COUNT = 5000;
/** Odd 32-bit multiplier (2^32 over the golden ratio): spreads consecutive counters over the whole uint32 range. */
const SPREAD = 2654435761;
/** Two indices per band, one on each edge. 5000 / 8 = 625 levels per index, 1250 per band. */
const LEVEL_CYCLE = [1, 5, 6, 15, 16, 30, 31, 60] as const;
/** More than 1 percent of first attempts failing validation would mean the generator is leaning on its retry path. */
const MAX_RETRY_FRACTION = 0.01;

const seedAt = (i: number): number => (1 + i * SPREAD) >>> 0;
const levelAt = (i: number): number => LEVEL_CYCLE[i % LEVEL_CYCLE.length] ?? 1;

interface Failure {
  runSeed: number;
  levelIndex: number;
  errors: string[];
}

interface Sweep {
  failures: Failure[];
  retried: number;
  maxRetries: number;
  shapes: Set<string>;
  objectives: Set<string>;
  drones: Set<string>;
  supers: Set<string>;
  rosterKinds: Set<string>;
  wellCounts: Set<number>;
  spawnerCounts: Set<number>;
  rosterSizes: Set<number>;
  perBand: Map<number, number>;
}

function runSweep(): Sweep {
  const s: Sweep = {
    failures: [],
    retried: 0,
    maxRetries: 0,
    shapes: new Set(),
    objectives: new Set(),
    drones: new Set(),
    supers: new Set(),
    rosterKinds: new Set(),
    wellCounts: new Set(),
    spawnerCounts: new Set(),
    rosterSizes: new Set(),
    perBand: new Map(),
  };
  const visit = (def: LevelDef): void => {
    const result = validateLevel(def);
    if (!result.ok || result.errors.length > 0) {
      s.failures.push({ runSeed: def.runSeed, levelIndex: def.levelIndex, errors: result.errors });
    }
    const retries = def.retries ?? 0;
    if (retries > 0) s.retried++;
    s.maxRetries = Math.max(s.maxRetries, retries);
    s.shapes.add(def.arena.shape);
    s.objectives.add(def.objective.kind);
    s.drones.add(def.drone);
    s.supers.add(def.superType);
    for (const r of def.roster) s.rosterKinds.add(r.kind);
    s.wellCounts.add(def.hazards.wells.length);
    s.spawnerCounts.add(def.hazards.spawners.length);
    s.rosterSizes.add(def.roster.length);
    s.perBand.set(def.band, (s.perBand.get(def.band) ?? 0) + 1);
  };
  for (let i = 0; i < SEED_COUNT; i++) visit(generateLevel(seedAt(i), levelAt(i)));
  for (const edge of [0, 0xffffffff]) for (let n = 1; n <= 40; n++) visit(generateLevel(edge, n));
  return s;
}

describe('generateLevel x validateLevel sweep', { timeout: 120_000 }, () => {
  // One sweep shared by every assertion below: it is the expensive part (about 6 s).
  let sweep: Sweep;
  beforeAll(() => {
    sweep = runSweep();
  }, 120_000);

  it('every one of 5000 seeds plus both edge seeds validates with no errors', () => {
    expect(sweep.failures.slice(0, 5)).toEqual([]);
    expect(sweep.failures).toHaveLength(0);
  });

  it('first attempts rarely need the re-derive path', () => {
    expect(sweep.maxRetries).toBeLessThanOrEqual(MAX_RETRIES);
    expect(sweep.retried / SEED_COUNT).toBeLessThanOrEqual(MAX_RETRY_FRACTION);
  });

  it('is not vacuous: the sweep reaches every band evenly', () => {
    expect(bandOf(1)).toBe(1);
    expect(bandOf(5)).toBe(1);
    expect(bandOf(6)).toBe(2);
    expect(bandOf(15)).toBe(2);
    expect(bandOf(16)).toBe(3);
    expect(bandOf(30)).toBe(3);
    expect(bandOf(31)).toBe(4);
    for (const band of [1, 2, 3, 4]) expect(sweep.perBand.get(band) ?? 0).toBeGreaterThanOrEqual(1250);
  });

  it('is not vacuous: it exercises every arena shape, objective, drone, super and enemy kind', () => {
    expect([...sweep.shapes].sort()).toEqual(['circle', 'hexagon', 'rect', 'rectObstacles', 'roundRect']);
    expect([...sweep.objectives].sort()).toEqual(['destroy', 'scoreInTime', 'survive']);
    expect([...sweep.drones].sort()).toEqual(['attack', 'collect', 'ram']);
    expect([...sweep.supers].sort()).toEqual(['detonate', 'homing', 'turbo']);
    expect([...sweep.rosterKinds].sort()).toEqual([...ENEMY_KINDS].sort());
  });

  it('is not vacuous: it hits 0 to 3 gravity wells, 0 to 2 spawners and rosters of 3 to 6', () => {
    expect([...sweep.wellCounts].sort()).toEqual([0, 1, 2, 3]);
    expect([...sweep.spawnerCounts].sort()).toEqual([0, 1, 2]);
    expect([...sweep.rosterSizes].sort()).toEqual([3, 4, 5, 6]);
  });

  it('regenerating every 50th level gives the same hash and a JSON round trip changes nothing', () => {
    for (let i = 0; i < SEED_COUNT; i += 50) {
      const first = generateLevel(seedAt(i), levelAt(i));
      const again = generateLevel(seedAt(i), levelAt(i));
      expect(levelHash(again), `seed ${seedAt(i)} level ${levelAt(i)}`).toBe(levelHash(first));
      expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    }
  });

  it('the seed spread really is spread: 5000 distinct run seeds', () => {
    const seen = new Set<number>();
    for (let i = 0; i < SEED_COUNT; i++) seen.add(seedAt(i));
    expect(seen.size).toBe(SEED_COUNT);
  });
});
