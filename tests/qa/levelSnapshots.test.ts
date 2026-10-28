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
// flag on (the default), stored as new files. Band 1 needs no v2 pin: it is identical either way.
import { describe, expect, it } from 'vitest';
import { generateLevel, levelHash } from '../../src/levelgen/generator';
import { DEFAULT_GEN_CONFIG, GENERATOR_VERSION, GENERATOR_VERSION_V2, LEVELDEF_VERSION, V1_GEN_CONFIG } from '../../src/levelgen/leveldef';
import type { ArenaShape, Band, GenConfig, ObjectiveDef } from '../../src/levelgen/leveldef';
import { validateLevel } from '../../src/levelgen/validate';
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
const V2 = { cfg: DEFAULT_GEN_CONFIG, generatorVersion: GENERATOR_VERSION_V2 };

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
});
