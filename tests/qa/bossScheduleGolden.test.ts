// V3 harden: the boss schedule golden (docs/13 SPEC 3.3 and 3.4, docs/12 "Design: the boss schedule").
// The tables below are typed out from the docs, not computed from the code, so a change to
// BOSS_SCHEDULE, the loop rule or the hit point step shows up as a diff here:
//   Adventure: a boss every 5th level, levels 5 to 50 (warden to prism), then the list loops from
//   ember in passes of seven with 25 percent more hit points per pass (levels 55 to 85 at 1.25, 90
//   to 120 at 1.5, 125 at 1.75), entrance at 20 s on the wave clock.
//   Endless: a boss every 6th segment, segments 6 to 60 (the same ten), then the same loop (66 to
//   102 at 1.25, 108 to 120 at 1.5), entrance 10 s into the segment.
// Then the real generator is held to the table: every boss level carries exactly that boss and
// generator version 3, every other level and segment carries none, rule 12 holds, all of it
// validates and survives a JSON round trip.
import { describe, expect, it } from 'vitest';
import { BOSS_SCHEDULE, bossForLevel, bossForSegment, bossOfNumber } from '../../src/levelgen/boss';
import { generateEndlessSegment, generateLevel } from '../../src/levelgen/generator';
import { DEFAULT_GEN_CONFIG, GENERATOR_VERSION_V3 } from '../../src/levelgen/leveldef';
import type { BossId, BossTier } from '../../src/levelgen/leveldef';
import { validateLevel, validateSegment } from '../../src/levelgen/validate';

type Row = readonly [index: number, id: BossId, tier: BossTier, hpMul: number];

/** Adventure golden: level index, boss, tier, hit point multiplier. Levels 5 to 125. */
const LEVEL_GOLDEN: readonly Row[] = [
  [5, 'warden', 1, 1],
  [10, 'brood', 1, 1],
  [15, 'spindle', 1, 1],
  [20, 'ember', 2, 1],
  [25, 'mirage', 2, 1],
  [30, 'gravitas', 2, 1],
  [35, 'bastion', 3, 1],
  [40, 'tempest', 3, 1],
  [45, 'twins', 3, 1],
  [50, 'prism', 4, 1],
  [55, 'ember', 2, 1.25],
  [60, 'mirage', 2, 1.25],
  [65, 'gravitas', 2, 1.25],
  [70, 'bastion', 3, 1.25],
  [75, 'tempest', 3, 1.25],
  [80, 'twins', 3, 1.25],
  [85, 'prism', 4, 1.25],
  [90, 'ember', 2, 1.5],
  [95, 'mirage', 2, 1.5],
  [100, 'gravitas', 2, 1.5],
  [105, 'bastion', 3, 1.5],
  [110, 'tempest', 3, 1.5],
  [115, 'twins', 3, 1.5],
  [120, 'prism', 4, 1.5],
  [125, 'ember', 2, 1.75],
];

/** Endless golden: segment index (0 based), boss, tier, hit point multiplier. Segments 6 to 120. */
const SEGMENT_GOLDEN: readonly Row[] = [
  [6, 'warden', 1, 1],
  [12, 'brood', 1, 1],
  [18, 'spindle', 1, 1],
  [24, 'ember', 2, 1],
  [30, 'mirage', 2, 1],
  [36, 'gravitas', 2, 1],
  [42, 'bastion', 3, 1],
  [48, 'tempest', 3, 1],
  [54, 'twins', 3, 1],
  [60, 'prism', 4, 1],
  [66, 'ember', 2, 1.25],
  [72, 'mirage', 2, 1.25],
  [78, 'gravitas', 2, 1.25],
  [84, 'bastion', 3, 1.25],
  [90, 'tempest', 3, 1.25],
  [96, 'twins', 3, 1.25],
  [102, 'prism', 4, 1.25],
  [108, 'ember', 2, 1.5],
  [114, 'mirage', 2, 1.5],
  [120, 'gravitas', 2, 1.5],
];

const LEVEL_AT_SEC = 20;
const SEGMENT_AT_SEC = 10;
const MAX_LEVEL = 125;
const MAX_SEGMENT = 120;
const GOLDEN_AT = (rows: readonly Row[], n: number): Row | undefined => rows.find((r) => r[0] === n);

describe('boss schedule golden: the pure lookups', () => {
  it('Adventure levels 5 to 125: every golden row, every other level none', () => {
    for (let n = 0; n <= MAX_LEVEL + 4; n++) {
      const row = GOLDEN_AT(LEVEL_GOLDEN, n);
      const got = bossForLevel(n);
      if (row === undefined) {
        expect(got, 'level ' + String(n)).toBeNull();
        continue;
      }
      expect(got, 'level ' + String(n)).toEqual({ id: row[1], tier: row[2], atSec: LEVEL_AT_SEC, hpMul: row[3] });
    }
  });

  it('Endless segments 6 to 120: every golden row, every other segment none', () => {
    for (let k = 0; k <= MAX_SEGMENT; k++) {
      const row = GOLDEN_AT(SEGMENT_GOLDEN, k);
      const got = bossForSegment(k);
      if (row === undefined) {
        expect(got, 'segment ' + String(k)).toBeNull();
        continue;
      }
      expect(got, 'segment ' + String(k)).toEqual({ id: row[1], tier: row[2], atSec: SEGMENT_AT_SEC, hpMul: row[3] });
    }
  });

  it('the schedule table is the ten pass one rows in the docs order', () => {
    expect(BOSS_SCHEDULE.map((r) => [r.levelIndex, r.id, r.tier])).toEqual(LEVEL_GOLDEN.slice(0, 10).map((r) => [r[0], r[1], r[2]]));
  });

  it('boss numbers 1 to 10 are pass one, 11 to 17 pass two at 1.25, 18 to 24 pass three at 1.5', () => {
    expect(bossOfNumber(1, 20)?.id).toBe('warden');
    expect(bossOfNumber(10, 20)?.id).toBe('prism');
    expect(bossOfNumber(11, 20)).toEqual({ id: 'ember', tier: 2, atSec: 20, hpMul: 1.25 });
    expect(bossOfNumber(17, 20)).toEqual({ id: 'prism', tier: 4, atSec: 20, hpMul: 1.25 });
    expect(bossOfNumber(18, 20)).toEqual({ id: 'ember', tier: 2, atSec: 20, hpMul: 1.5 });
    expect(bossOfNumber(24, 20)?.hpMul).toBe(1.5);
    expect(bossOfNumber(25, 20)?.hpMul).toBe(1.75);
  });

  it('the first three bosses never come back after pass one (the loop starts at ember)', () => {
    for (let j = 11; j <= 80; j++) expect(['warden', 'brood', 'spindle']).not.toContain(bossOfNumber(j, 20)?.id);
  });

  it('non integers, zero and negatives are not boss levels or segments', () => {
    for (const n of [0, -5, -10, 2.5, 5.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(bossForLevel(n), String(n)).toBeNull();
      expect(bossForSegment(n), String(n)).toBeNull();
    }
    expect(bossOfNumber(0, 20)).toBeNull();
    expect(bossOfNumber(1.5, 20)).toBeNull();
  });
});

describe('boss schedule golden: the real generator follows the table', { timeout: 120_000 }, () => {
  const SEEDS = [1, 42, 0xdeadbeef, 0x4e464f4c, 2654435761];

  it('Adventure levels 1 to 125 on five run seeds: the table boss on boss levels only, version 3 only there, valid, JSON safe', () => {
    const bad: string[] = [];
    let bosses = 0;
    for (const seed of SEEDS) {
      for (let n = 1; n <= MAX_LEVEL; n++) {
        const id = 'seed ' + String(seed) + ' level ' + String(n);
        const def = generateLevel(seed, n);
        const row = GOLDEN_AT(LEVEL_GOLDEN, n);
        if (!validateLevel(def, DEFAULT_GEN_CONFIG).ok) bad.push(id + ': invalid');
        if (JSON.stringify(JSON.parse(JSON.stringify(def))) !== JSON.stringify(def)) bad.push(id + ': not JSON stable');
        if (row === undefined) {
          if (def.boss !== undefined) bad.push(id + ': unexpected boss');
          if (def.generatorVersion === GENERATOR_VERSION_V3) bad.push(id + ': non boss level at version 3');
          continue;
        }
        bosses++;
        const want = { id: row[1], tier: row[2], atSec: LEVEL_AT_SEC, hpMul: row[3] };
        if (JSON.stringify(def.boss) !== JSON.stringify(want)) bad.push(id + ': boss ' + JSON.stringify(def.boss));
        if (def.generatorVersion !== GENERATOR_VERSION_V3) bad.push(id + ': version ' + String(def.generatorVersion));
        if (def.hazards.spawners.length > 0 || def.hazards.wells.length > 1) bad.push(id + ': rule 12 broken');
      }
    }
    expect(bad.slice(0, 8)).toEqual([]);
    expect(bosses).toBe(SEEDS.length * LEVEL_GOLDEN.length);
  });

  it('Endless segments 0 to 120 on three seeds: the table boss on boss segments only, version 3 only there, valid', () => {
    const bad: string[] = [];
    let bosses = 0;
    for (const seed of [99, 7, 0xdeadbeef]) {
      for (let k = 0; k <= MAX_SEGMENT; k++) {
        const id = 'endless seed ' + String(seed) + ' segment ' + String(k);
        const seg = generateEndlessSegment(seed, k);
        const row = GOLDEN_AT(SEGMENT_GOLDEN, k);
        if (!validateSegment(seg, DEFAULT_GEN_CONFIG).ok) bad.push(id + ': invalid');
        if (row === undefined) {
          if (seg.boss !== undefined) bad.push(id + ': unexpected boss');
          if (seg.generatorVersion === GENERATOR_VERSION_V3) bad.push(id + ': non boss segment at version 3');
          continue;
        }
        bosses++;
        const want = { id: row[1], tier: row[2], atSec: SEGMENT_AT_SEC, hpMul: row[3] };
        if (JSON.stringify(seg.boss) !== JSON.stringify(want)) bad.push(id + ': boss ' + JSON.stringify(seg.boss));
        if (seg.generatorVersion !== GENERATOR_VERSION_V3) bad.push(id + ': version ' + String(seg.generatorVersion));
      }
    }
    expect(bad.slice(0, 8)).toEqual([]);
    expect(bosses).toBe(3 * SEGMENT_GOLDEN.length);
  });

  it('the same seed and level give the same boss level twice (the schedule draws nothing from the PRNG)', () => {
    for (const [seed, n] of [[42, 20], [42, 50], [7, 85], [0xdeadbeef, 125]] as const) {
      expect(JSON.stringify(generateLevel(seed, n))).toBe(JSON.stringify(generateLevel(seed, n)));
    }
  });
});
