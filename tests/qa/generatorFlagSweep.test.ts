// V2 harden: generator sweep over 5000 run seeds with GenConfig.enableV2Enemies false and true
// (docs/10 wave E, docs/11 SPEC 3.4 rule 3). The existing generatorSweep.test.ts sweeps the default
// config (flag on). This file adds the other half and the comparison between the two:
//   flag off: every level equals its v1.0.0 hash, byte for byte (the Off invariant, generator side);
//   flag on:  band 1 equals flag off, bands 2 and up differ, kinds appear only in their bands,
//             rosters keep their v1 shape, nothing outside roster, waves and par moves.
// The v1 hashes in tests/qa/golden/v1-hashes.json were produced by running the generator and core
// sources of git tag v1.0.0 unmodified over the same seed spread (see the file header fields).
// Same seed spread and level cycle as generatorSweep.test.ts. No browser, no Math.random.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { canonicalJson, generateEndless, generateEndlessSegment, generateLevel, levelHash } from '../../src/levelgen/generator';
import {
  BANDS,
  DEFAULT_GEN_CONFIG,
  ENEMY_KINDS,
  GENERATOR_VERSION,
  GENERATOR_VERSION_V2,
  MAX_RETRIES,
  V1_GEN_CONFIG,
  V2_ENEMY_KINDS,
  bandOf,
  effectiveIndexOf,
  fmix32,
} from '../../src/levelgen/leveldef';
import type { Band, EnemyKind, LevelDef } from '../../src/levelgen/leveldef';
import { validateLevel } from '../../src/levelgen/validate';

const SEED_COUNT = 5000;
/** Odd 32-bit multiplier (2^32 over the golden ratio), as in generatorSweep.test.ts. */
const SPREAD = 2654435761;
const LEVEL_CYCLE = [1, 5, 6, 15, 16, 30, 31, 60] as const;
const ENDLESS_SEGMENTS = [0, 14, 15, 40] as const;
const ENDLESS_STEP = 10;
/** Segments for the flag on Endless checks: both sides of every band edge (index 1 + 2s: 5, 7, 15, 17, 29, 31). */
const ENDLESS_BAND_SEGMENTS = [0, 2, 3, 7, 8, 14, 15, 40] as const;

const seedAt = (i: number): number => (1 + i * SPREAD) >>> 0;
const levelAt = (i: number): number => LEVEL_CYCLE[i % LEVEL_CYCLE.length] ?? 1;

const GOLDEN_PATH = fileURLToPath(new URL('./golden/v1-hashes.json', import.meta.url));

interface Golden {
  levels: string[];
  edge0: string[];
  edgeF: string[];
  endlessDef: string[];
  endlessSeg: string[];
}

function stringArray(rec: Record<string, unknown>, key: string): string[] {
  const v = rec[key];
  if (!Array.isArray(v) || !v.every((x): x is string => typeof x === 'string')) throw new Error(`golden field ${key} is not a string array`);
  return v;
}

function loadGolden(): Golden {
  const raw: unknown = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
  if (typeof raw !== 'object' || raw === null) throw new Error('golden file is not an object');
  const rec = raw as Record<string, unknown>;
  return {
    levels: stringArray(rec, 'levels'),
    edge0: stringArray(rec, 'edge0'),
    edgeF: stringArray(rec, 'edgeF'),
    endlessDef: stringArray(rec, 'endlessDef'),
    endlessSeg: stringArray(rec, 'endlessSeg'),
  };
}

/** Same hash as levelHash, for objects that are not a LevelDef (Endless segments). */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return fmix32(h);
}
const hashOf = (v: unknown): string => fnv1a(canonicalJson(v)).toString(16).toUpperCase().padStart(8, '0');

const isV2Kind = (k: string): boolean => (V2_ENEMY_KINDS as readonly string[]).includes(k);

/** The new kinds with a positive roster weight in a band (docs/11 6.3), from the tables the generator uses. */
function eligible(band: Band): EnemyKind[] {
  return V2_ENEMY_KINDS.filter((k) => BANDS[band].rosterWeights[k] > 0);
}

/** Fields the v2 stage must not move: it only swaps roster, waves and what par derives from them. */
const UNTOUCHED = ['version', 'runSeed', 'levelIndex', 'seed', 'band', 'arena', 'speedScale', 'drone', 'superType', 'lives', 'bombs', 'hazards', 'surface'] as const;

interface Problems {
  offGolden: string[];
  offInvalid: string[];
  onInvalid: string[];
  offHasV2: string[];
  versions: string[];
  band1Differs: string[];
  bandUpSame: string[];
  wrongBand: string[];
  rosterShape: string[];
  entryNotInRoster: string[];
  moved: string[];
  retried: number;
}

interface Sweep {
  problems: Problems;
  perBand: Map<number, number>;
  seenInBand: Map<number, Set<string>>;
  offMs: number;
  onMs: number;
}

const where = (def: LevelDef): string => `seed ${def.runSeed} level ${def.levelIndex}`;
const kindsOf = (def: LevelDef): string[] => def.roster.map((r) => r.kind);
const entryKinds = (def: LevelDef): Set<string> => new Set(def.waves.waves.flatMap((w) => w.entries.map((e) => e.kind)));

function checkPair(off: LevelDef, on: LevelDef, goldenHash: string | undefined, p: Problems, seen: Map<number, Set<string>>): void {
  const id = where(on);
  const hOff = levelHash(off);
  // Same generator, same key order: plain JSON.stringify says whether two defs are identical, at a fraction of the canonical hash cost.
  const same = JSON.stringify(on) === JSON.stringify(off);
  if (goldenHash !== undefined && hOff !== goldenHash) p.offGolden.push(`${id}: ${hOff} is not v1 ${goldenHash}`);
  if (!validateLevel(off).ok) p.offInvalid.push(id);
  // Flag on validity is swept over the same seeds by generatorSweep.test.ts; generateLevel also only returns a def that passed.
  if ((on.retries ?? 0) >= MAX_RETRIES) p.onInvalid.push(id);

  const offKinds = new Set([...kindsOf(off), ...entryKinds(off)]);
  if ([...offKinds].some(isV2Kind)) p.offHasV2.push(id);

  const band = on.band;
  if (off.generatorVersion !== GENERATOR_VERSION || on.generatorVersion !== (band >= 2 ? GENERATOR_VERSION_V2 : GENERATOR_VERSION)) {
    p.versions.push(`${id}: off ${off.generatorVersion}, on ${on.generatorVersion}, band ${band}`);
  }

  if (band === 1) {
    if (!same) p.band1Differs.push(id);
  } else if (same) {
    p.bandUpSame.push(id);
  }

  const names = kindsOf(on);
  const ok = eligible(band);
  const usedNew = [...new Set([...names, ...entryKinds(on)])].filter(isV2Kind);
  const bandSeen = seen.get(band) ?? new Set<string>();
  for (const k of usedNew) {
    bandSeen.add(k);
    if (!ok.includes(k as EnemyKind)) p.wrongBand.push(`${id}: ${k} in band ${band}`);
  }
  seen.set(band, bandSeen);

  const distinct = new Set(names);
  const weightsOk = on.roster.every((r) => r.weight === BANDS[band].rosterWeights[r.kind]);
  if (distinct.size !== names.length || !distinct.has('grunt') || names.length < 3 || names.length > 6 || !weightsOk) {
    p.rosterShape.push(`${id}: ${names.join(',')}`);
  }
  if (names.length !== off.roster.length) p.rosterShape.push(`${id}: roster size ${names.length} on, ${off.roster.length} off`);
  const roster = new Set(names);
  if ([...entryKinds(on)].some((k) => !roster.has(k))) p.entryNotInRoster.push(id);

  // Only comparable when neither attempt needed the re-derive path (it changes the arena).
  if ((off.retries ?? 0) === 0 && (on.retries ?? 0) === 0) {
    for (const f of UNTOUCHED) {
      // Both come from the same generator, so key order is stable and plain JSON.stringify compares them.
      if (JSON.stringify(off[f]) !== JSON.stringify(on[f])) p.moved.push(`${id}: ${f}`);
    }
  } else {
    p.retried++;
  }
}

function emptyProblems(): Problems {
  return {
    offGolden: [],
    offInvalid: [],
    onInvalid: [],
    offHasV2: [],
    versions: [],
    band1Differs: [],
    bandUpSame: [],
    wrongBand: [],
    rosterShape: [],
    entryNotInRoster: [],
    moved: [],
    retried: 0,
  };
}

function runSweep(golden: Golden): Sweep {
  const problems = emptyProblems();
  const perBand = new Map<number, number>();
  const seenInBand = new Map<number, Set<string>>();
  let offMs = 0;
  let onMs = 0;
  const visit = (runSeed: number, levelIndex: number, goldenHash: string | undefined): void => {
    const t0 = performance.now();
    const off = generateLevel(runSeed, levelIndex, V1_GEN_CONFIG);
    const t1 = performance.now();
    const on = generateLevel(runSeed, levelIndex, DEFAULT_GEN_CONFIG);
    const t2 = performance.now();
    offMs += t1 - t0;
    onMs += t2 - t1;
    perBand.set(on.band, (perBand.get(on.band) ?? 0) + 1);
    checkPair(off, on, goldenHash, problems, seenInBand);
  };
  for (let i = 0; i < SEED_COUNT; i++) visit(seedAt(i), levelAt(i), golden.levels[i]);
  for (let n = 1; n <= 40; n++) {
    visit(0, n, golden.edge0[n - 1]);
    visit(0xffffffff, n, golden.edgeF[n - 1]);
  }
  return { problems, perBand, seenInBand, offMs, onMs };
}

describe('generator sweep with enableV2Enemies false and true', { timeout: 300_000 }, () => {
  // One sweep shared by every assertion below: it is the expensive part.
  let golden: Golden;
  let sweep: Sweep;
  beforeAll(() => {
    golden = loadGolden();
    sweep = runSweep(golden);
  }, 300_000);

  it('the golden file covers every sweep point', () => {
    expect(golden.levels).toHaveLength(SEED_COUNT);
    expect(golden.edge0).toHaveLength(40);
    expect(golden.edgeF).toHaveLength(40);
    expect(golden.endlessDef).toHaveLength(SEED_COUNT / ENDLESS_STEP);
    expect(golden.endlessSeg).toHaveLength((SEED_COUNT / ENDLESS_STEP) * ENDLESS_SEGMENTS.length);
    expect(new Set(golden.levels).size).toBeGreaterThan(SEED_COUNT * 0.99);
  });

  it('flag off: every level equals its v1.0.0 hash (5000 seeds plus both edge seeds over 40 levels)', () => {
    expect(sweep.problems.offGolden.slice(0, 5)).toEqual([]);
    expect(sweep.problems.offGolden).toHaveLength(0);
  });

  it('flag off: every level validates and carries generator version 1 with no new kind anywhere', () => {
    expect(sweep.problems.offInvalid.slice(0, 5)).toEqual([]);
    expect(sweep.problems.offHasV2.slice(0, 5)).toEqual([]);
  });

  it('flag on: no level exhausted the re-derive path (validity itself is swept by generatorSweep.test.ts)', () => {
    expect(sweep.problems.onInvalid.slice(0, 5)).toEqual([]);
  });

  it('generator version is 1 for flag off and for band 1 flag on, 2 for flag on in bands 2 and up', () => {
    expect(sweep.problems.versions.slice(0, 5)).toEqual([]);
  });

  it('band 1 (levels 1 to 5) is byte identical with the flag on or off', () => {
    expect(sweep.problems.band1Differs.slice(0, 5)).toEqual([]);
  });

  it('bands 2 and up always change when the flag is on', () => {
    expect(sweep.problems.bandUpSame.slice(0, 5)).toEqual([]);
  });

  it('new kinds appear only in the bands whose table gives them a share', () => {
    expect(sweep.problems.wrongBand.slice(0, 5)).toEqual([]);
    expect(eligible(1)).toEqual([]);
    expect([...eligible(2)].sort()).toEqual(['charger', 'splime', 'swirl']);
    expect([...eligible(3)].sort()).toEqual(['blink', 'bulwark', 'charger', 'splime', 'swirl']);
    expect([...eligible(4)].sort()).toEqual([...V2_ENEMY_KINDS].sort());
  });

  it('rosters keep their v1 shape: grunt forced, 3 to 6 distinct kinds, same size as flag off, table weights', () => {
    expect(sweep.problems.rosterShape.slice(0, 5)).toEqual([]);
    expect(sweep.problems.entryNotInRoster.slice(0, 5)).toEqual([]);
  });

  it('the v2 stage moves only roster, waves and what par derives from them', () => {
    expect(sweep.problems.moved.slice(0, 5)).toEqual([]);
  });

  it('is not vacuous: every band is swept evenly and every new kind shows up in every band that allows it', () => {
    for (const band of [1, 2, 3, 4]) expect(sweep.perBand.get(band) ?? 0, `band ${band}`).toBeGreaterThanOrEqual(1250);
    expect(sweep.seenInBand.get(1)?.size ?? 0).toBe(0);
    for (const band of [2, 3, 4] as const) {
      const seen = sweep.seenInBand.get(band) ?? new Set<string>();
      for (const k of eligible(band)) expect(seen.has(k), `${k} in band ${band}`).toBe(true);
    }
  });

  it('the re-derive path stays rare with the flag on or off', () => {
    expect(sweep.problems.retried / SEED_COUNT).toBeLessThanOrEqual(0.01);
  });

  it('flag on costs less than 4 times the flag off generation time (measured about 1.1 times; the bound only catches a blow up)', () => {
    expect(sweep.offMs).toBeGreaterThan(0);
    expect(sweep.onMs / sweep.offMs).toBeLessThan(4);
  });
});

describe('Endless with the flag false and true', { timeout: 120_000 }, () => {
  const golden = loadGolden();

  it('flag off: Endless def and segments 0, 14, 15 and 40 equal their v1.0.0 hashes for 500 seeds', () => {
    const bad: string[] = [];
    let seg = 0;
    for (let k = 0; k < SEED_COUNT / ENDLESS_STEP; k++) {
      const seed = seedAt(k * ENDLESS_STEP);
      if (hashOf(generateEndless(seed, V1_GEN_CONFIG)) !== golden.endlessDef[k]) bad.push(`def ${seed}`);
      for (const s of ENDLESS_SEGMENTS) {
        if (hashOf(generateEndlessSegment(seed, s, V1_GEN_CONFIG)) !== golden.endlessSeg[seg]) bad.push(`seed ${seed} segment ${s}`);
        seg++;
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('flag on: Endless def carries version 2 and the band 4 catalogue, flag off version 1 and the v1 six', () => {
    const on = generateEndless(12345, DEFAULT_GEN_CONFIG);
    const off = generateEndless(12345, V1_GEN_CONFIG);
    expect(on.generatorVersion).toBe(GENERATOR_VERSION_V2);
    expect(off.generatorVersion).toBe(GENERATOR_VERSION);
    expect(off.roster.map((r) => r.kind).sort()).toEqual([...ENEMY_KINDS].sort());
    expect(on.roster.map((r) => r.kind).sort()).toEqual([...ENEMY_KINDS, ...eligible(4)].sort());
  });

  it('flag on: segments follow the band rules (no new kind in band 1, only eligible kinds above, version by band)', () => {
    const bad: string[] = [];
    for (let k = 0; k < 200; k++) {
      const seed = seedAt(k * 25);
      for (const s of ENDLESS_BAND_SEGMENTS) {
        const seg = generateEndlessSegment(seed, s, DEFAULT_GEN_CONFIG);
        const band = bandOf(effectiveIndexOf(s));
        const names = [...seg.roster.map((r) => r.kind), ...seg.waves.waves.flatMap((w) => w.entries.map((e) => e.kind))];
        const ok = eligible(band);
        if (seg.band !== band) bad.push(`${seed}/${s}: band ${seg.band}`);
        if (names.some((n) => isV2Kind(n) && !ok.includes(n))) bad.push(`${seed}/${s}: ineligible kind`);
        if (seg.generatorVersion !== (band >= 2 ? GENERATOR_VERSION_V2 : GENERATOR_VERSION)) bad.push(`${seed}/${s}: version ${seg.generatorVersion}`);
        const off = generateEndlessSegment(seed, s, V1_GEN_CONFIG);
        if (band === 1 && hashOf(off) !== hashOf(seg)) bad.push(`${seed}/${s}: band 1 differs`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});
