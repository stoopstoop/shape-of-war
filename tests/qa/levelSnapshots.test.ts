// LevelDef regression pins for five fixed (runSeed, levelIndex) pairs (docs/06 section 2.9, rule 4).
// Each pin has a hard coded levelHash of the whole def, so any accidental generator change fails
// loudly, plus a readable summary stored under tests/qa/__snapshots__/levels/ so the review diff
// shows what moved. After an intentional generator change (GENERATOR_VERSION bump), Foundry or
// Fable regenerates with `npx vitest run tests/qa/levelSnapshots.test.ts -u` and updates the hashes.
//
// The five pins cover every arena shape, every band, and every objective kind, with wells and
// spawners present in the harder bands.
//
// V2-C: the five original pins run with enableV2Enemies false (the v1 generator), so their hashes
// and snapshot files are unchanged. The '-v2' pins are the same four band 2 to 4 pairs with the
// flag on, stored as new files. Band 1 needs no v2 pin: it is identical either way.
//
// V3-A: the default config turns the bosses on. The four v2 pins now run with V2_GEN_CONFIG
// (bosses off), so their hashes and files are unchanged. The '-boss' pins are new files: run seed
// 42 at levels 5, 10 and 50 with the default config, and Endless segment 6 of seed 42.
import { describe, expect, it } from 'vitest';
import { canonicalJson, generateEndlessSegment, generateLevel, levelHash } from '../../src/levelgen/generator';
import {
  DEFAULT_GEN_CONFIG,
  GENERATOR_VERSION,
  GENERATOR_VERSION_V2,
  GENERATOR_VERSION_V3,
  LEVELDEF_VERSION,
  V1_GEN_CONFIG,
  V2_GEN_CONFIG,
  fmix32,
} from '../../src/levelgen/leveldef';
import type { ArenaShape, Band, BossId, BossSpec, EndlessSegmentDef, GenConfig, ObjectiveDef } from '../../src/levelgen/leveldef';
import { validateLevel, validateSegment } from '../../src/levelgen/validate';
import { snapshotText, summariseLevel } from './summary';

interface Pin {
  name: string;
  runSeed: number;
  levelIndex: number;
  hash: string;
  shape: ArenaShape;
  band: Band;
  objective: ObjectiveDef['kind'];
  cfg: Readonly<GenConfig>;
  generatorVersion: number;
}

const V1 = { cfg: V1_GEN_CONFIG, generatorVersion: GENERATOR_VERSION };
const V2 = { cfg: V2_GEN_CONFIG, generatorVersion: GENERATOR_VERSION_V2 };

const PINS: readonly Pin[] = [
  { name: 'seed1-level1', runSeed: 1, levelIndex: 1, hash: 'E0D43B03', shape: 'rect', band: 1, objective: 'scoreInTime', ...V1 },
  { name: 'seed42-level13', runSeed: 42, levelIndex: 13, hash: '16999441', shape: 'circle', band: 2, objective: 'destroy', ...V1 },
  { name: 'seed0xDEADBEEF-level18', runSeed: 0xdeadbeef, levelIndex: 18, hash: '158966A8', shape: 'rectObstacles', band: 3, objective: 'scoreInTime', ...V1 },
  { name: 'seed0xDEADBEEF-level36', runSeed: 0xdeadbeef, levelIndex: 36, hash: '09C8C862', shape: 'roundRect', band: 4, objective: 'destroy', ...V1 },
  { name: 'seed0x4E464F4C-level31', runSeed: 0x4e464f4c, levelIndex: 31, hash: '4C5F7555', shape: 'hexagon', band: 4, objective: 'survive', ...V1 },
];

const V2_PINS: readonly Pin[] = [
  { name: 'seed42-level13-v2', runSeed: 42, levelIndex: 13, hash: '18B193B3', shape: 'circle', band: 2, objective: 'destroy', ...V2 },
  { name: 'seed0xDEADBEEF-level18-v2', runSeed: 0xdeadbeef, levelIndex: 18, hash: '752D043E', shape: 'rectObstacles', band: 3, objective: 'scoreInTime', ...V2 },
  { name: 'seed0xDEADBEEF-level36-v2', runSeed: 0xdeadbeef, levelIndex: 36, hash: 'D5F84118', shape: 'roundRect', band: 4, objective: 'destroy', ...V2 },
  { name: 'seed0x4E464F4C-level31-v2', runSeed: 0x4e464f4c, levelIndex: 31, hash: 'EED91C70', shape: 'hexagon', band: 4, objective: 'survive', ...V2 },
];

const ALL_PINS: readonly Pin[] = [...PINS, ...V2_PINS];

describe('LevelDef pins', () => {
  describe.each(ALL_PINS)('$name', (pin) => {
    const def = generateLevel(pin.runSeed, pin.levelIndex, pin.cfg);

    it('has the hard coded levelHash', () => {
      expect(levelHash(def)).toBe(pin.hash);
    });

    it('keeps the arena shape, band and objective the pin was chosen for', () => {
      expect(def.arena.shape).toBe(pin.shape);
      expect(def.band).toBe(pin.band);
      expect(def.objective.kind).toBe(pin.objective);
    });

    it('was recorded at the current format versions (regenerate pins after a bump)', () => {
      expect(def.version).toBe(LEVELDEF_VERSION);
      expect(def.generatorVersion).toBe(pin.generatorVersion);
    });

    it('validates and needed no re-derive', () => {
      expect(validateLevel(def).errors).toEqual([]);
      expect(def.retries).toBe(0);
    });

    it('matches the stored summary', async () => {
      await expect(snapshotText(summariseLevel(def))).toMatchFileSnapshot(`./__snapshots__/levels/${pin.name}.json`);
    });
  });

  it('the pin set covers all 5 arena shapes, 4 bands and 3 objective kinds', () => {
    expect(new Set(PINS.map((p) => p.shape)).size).toBe(5);
    expect(new Set(PINS.map((p) => p.band))).toEqual(new Set([1, 2, 3, 4]));
    expect(new Set(PINS.map((p) => p.objective))).toEqual(new Set(['scoreInTime', 'survive', 'destroy']));
  });

  it('the pinned hashes are distinct', () => {
    expect(new Set(ALL_PINS.map((p) => p.hash)).size).toBe(ALL_PINS.length);
  });

  it('generation order does not matter (no hidden state between calls)', () => {
    const reversed = [...ALL_PINS].reverse().map((p) => levelHash(generateLevel(p.runSeed, p.levelIndex, p.cfg)));
    expect(reversed.reverse()).toEqual(ALL_PINS.map((p) => p.hash));
  });

  it('summaries are JSON round trip safe', () => {
    for (const p of ALL_PINS) {
      const s = summariseLevel(generateLevel(p.runSeed, p.levelIndex, p.cfg));
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    }
  });

  it('the v1 and v2 pins run with the bosses off and none of them is a boss level', () => {
    for (const p of ALL_PINS) {
      expect(p.cfg.enableBosses).toBe(false);
      expect(generateLevel(p.runSeed, p.levelIndex, p.cfg).boss).toBeUndefined();
    }
  });
});

// V3-A boss pins (flag on, the default config). New files; the pins above never move.

interface BossPin {
  name: string;
  runSeed: number;
  levelIndex: number;
  hash: string;
  boss: BossId;
  tier: BossSpec['tier'];
  objective: ObjectiveDef['kind'];
}

const BOSS_PINS: readonly BossPin[] = [
  { name: 'seed42-level5-boss', runSeed: 42, levelIndex: 5, hash: '43F4A6DA', boss: 'warden', tier: 1, objective: 'scoreInTime' },
  { name: 'seed42-level10-boss', runSeed: 42, levelIndex: 10, hash: '5909977A', boss: 'brood', tier: 1, objective: 'destroy' },
  { name: 'seed42-level50-boss', runSeed: 42, levelIndex: 50, hash: '152C1A9D', boss: 'prism', tier: 4, objective: 'survive' },
];

/** The level summary plus the boss field, which summary.ts predates. Same on disk format. */
const bossSnapshotText = (def: Parameters<typeof summariseLevel>[0]): string => `${JSON.stringify({ ...summariseLevel(def), boss: def.boss ?? null }, null, 2)}\n`;

/** levelHash's arithmetic for a def that is not a LevelDef (an Endless segment). */
function segmentHash(seg: EndlessSegmentDef): string {
  const s = canonicalJson(seg);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return fmix32(h).toString(16).toUpperCase().padStart(8, '0');
}

describe('LevelDef boss pins (bosses on)', () => {
  expect(DEFAULT_GEN_CONFIG.enableBosses).toBe(true);

  describe.each(BOSS_PINS)('$name', (pin) => {
    const def = generateLevel(pin.runSeed, pin.levelIndex, DEFAULT_GEN_CONFIG);

    it('has the hard coded levelHash', () => {
      expect(levelHash(def)).toBe(pin.hash);
    });

    it('carries the scheduled boss, generator version 3 and the rule 12 hazards', () => {
      expect(def.boss).toEqual({ id: pin.boss, tier: pin.tier, atSec: 20, hpMul: 1 });
      expect(def.generatorVersion).toBe(GENERATOR_VERSION_V3);
      expect(def.version).toBe(LEVELDEF_VERSION);
      expect(def.objective.kind).toBe(pin.objective);
      expect(def.hazards.spawners).toEqual([]);
      expect(def.hazards.wells.length).toBeLessThanOrEqual(1);
      expect(def.surface).toBe('flat');
    });

    it('validates with the flag on and needed no re-derive', () => {
      expect(validateLevel(def, DEFAULT_GEN_CONFIG).errors).toEqual([]);
      expect(def.retries).toBe(0);
    });

    it('matches the stored summary', async () => {
      await expect(bossSnapshotText(def)).toMatchFileSnapshot(`./__snapshots__/levels/${pin.name}.json`);
    });
  });

  it('Endless seed 42 segment 6 carries warden at 10 s and matches its pin', async () => {
    const seg = generateEndlessSegment(42, 6, DEFAULT_GEN_CONFIG);
    expect(seg.boss).toEqual({ id: 'warden', tier: 1, atSec: 10, hpMul: 1 });
    expect(seg.generatorVersion).toBe(GENERATOR_VERSION_V3);
    expect(validateSegment(seg, DEFAULT_GEN_CONFIG).errors).toEqual([]);
    expect(segmentHash(seg)).toBe('80B24CF3');
    const { waves, ...head } = seg;
    const summary = { hash: segmentHash(seg), ...head, waveCount: waves.waves.length, firstWave: waves.waves[0] ?? null, lastWave: waves.waves[waves.waves.length - 1] ?? null };
    await expect(`${JSON.stringify(summary, null, 2)}\n`).toMatchFileSnapshot('./__snapshots__/levels/endless-seed42-segment6-boss.json');
  });

  it('the boss pin hashes are distinct from each other and from every earlier pin', () => {
    const all = [...ALL_PINS.map((p) => p.hash), ...BOSS_PINS.map((p) => p.hash)];
    expect(new Set(all).size).toBe(all.length);
  });
});
