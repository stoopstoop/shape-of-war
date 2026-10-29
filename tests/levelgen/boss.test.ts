// V3-A boss schedule and the enableBosses flag (docs/12 wave V3-A, docs/13 SPEC 3.3 and 3.4).
// Pure table lookups in boss.ts, the generator's boss post step and the validator's B1 to B4 and
// J7. The 1000 seed sweeps live in tests/qa/generatorBossFlagSweep.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BOSS_EVERY,
  BOSS_HP_PER_PASS,
  BOSS_LEVEL_AT_SEC,
  BOSS_LOOP_FROM,
  BOSS_MAX_WELLS,
  BOSS_SCHEDULE,
  BOSS_SEGMENT_AT_SEC,
  BOSS_SEGMENT_EVERY,
  bossForLevel,
  bossForSegment,
  bossHazards,
  bossOfNumber,
  bossTierOf,
  sameBoss,
} from '../../src/levelgen/boss';
import { generateEndless, generateEndlessSegment, generateLevel, levelHash, withLevelBoss } from '../../src/levelgen/generator';
import {
  BOSS_IDS,
  DEFAULT_GEN_CONFIG,
  GENERATOR_VERSION,
  GENERATOR_VERSION_V2,
  GENERATOR_VERSION_V3,
  V1_GEN_CONFIG,
  V2_GEN_CONFIG,
  bandOf,
} from '../../src/levelgen/leveldef';
import type { BossSpec, EndlessSegmentDef, GenConfig, HazardDef, LevelDef } from '../../src/levelgen/leveldef';
import { validateEndless, validateLevel, validateSegment } from '../../src/levelgen/validate';

const ON = DEFAULT_GEN_CONFIG;
const OFF = V2_GEN_CONFIG;
const ids = (errors: readonly string[]): string[] => [...new Set(errors.map((e) => e.split(':')[0] ?? ''))];
const SPREAD = 2654435761;
const seedAt = (i: number): number => (1 + i * SPREAD) >>> 0;

/** A mutable copy of a generated level, for the bad cases. */
const copy = (d: LevelDef): LevelDef => structuredClone(d);
const copySeg = (d: EndlessSegmentDef): EndlessSegmentDef => structuredClone(d);

/** First run seed whose flag off level n has at least the given spawners and wells. */
function seedWithHazards(levelIndex: number, spawners: number, wells: number): number {
  for (let s = 0; s < 2000; s++) {
    const h = generateLevel(seedAt(s), levelIndex, OFF).hazards;
    if (h.spawners.length >= spawners && h.wells.length >= wells) return seedAt(s);
  }
  throw new Error(`no seed under 2000 gives level ${levelIndex} ${spawners} spawners and ${wells} wells`);
}

describe('boss schedule table', () => {
  it('has ten levels, ten ids in BOSS_IDS order and tiers 1 1 1 2 2 2 3 3 3 4', () => {
    expect(BOSS_EVERY).toBe(5);
    expect(BOSS_SCHEDULE).toHaveLength(10);
    expect(BOSS_SCHEDULE.map((r) => r.levelIndex)).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
    expect(BOSS_SCHEDULE.map((r) => r.id)).toEqual([...BOSS_IDS]);
    expect(new Set(BOSS_SCHEDULE.map((r) => r.id)).size).toBe(10);
    expect(BOSS_SCHEDULE.map((r) => r.tier)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 4]);
  });

  it('matches the plan table row by row', () => {
    const plan: [number, string, number][] = [
      [5, 'warden', 1],
      [10, 'brood', 1],
      [15, 'spindle', 1],
      [20, 'ember', 2],
      [25, 'mirage', 2],
      [30, 'gravitas', 2],
      [35, 'bastion', 3],
      [40, 'tempest', 3],
      [45, 'twins', 3],
      [50, 'prism', 4],
    ];
    for (const [n, id, tier] of plan) expect(bossForLevel(n)).toEqual({ id, tier, atSec: 20, hpMul: 1 });
  });

  it('is frozen, so no caller can change the schedule at run time', () => {
    expect(Object.isFrozen(BOSS_SCHEDULE)).toBe(true);
    for (const r of BOSS_SCHEDULE) expect(Object.isFrozen(r)).toBe(true);
  });

  it('bossTierOf reads the table and returns null for an unknown id', () => {
    for (const r of BOSS_SCHEDULE) expect(bossTierOf(r.id)).toBe(r.tier);
    expect(bossTierOf('nemesis')).toBeNull();
    expect(bossTierOf('')).toBeNull();
  });
});

describe('bossForLevel', () => {
  it('returns null on every level that is not a positive multiple of 5', () => {
    for (let n = -20; n <= 300; n++) {
      if (n >= 5 && n % 5 === 0) expect(bossForLevel(n), `level ${n}`).not.toBeNull();
      else expect(bossForLevel(n), `level ${n}`).toBeNull();
    }
    for (const n of [2.5, 5.000001, Number.NaN, Number.POSITIVE_INFINITY, -5]) expect(bossForLevel(n)).toBeNull();
  });

  it('enters at 20 s on the wave clock', () => {
    expect(BOSS_LEVEL_AT_SEC).toBe(20);
    for (let n = 5; n <= 500; n += 5) expect(bossForLevel(n)?.atSec).toBe(20);
  });

  it('loops beyond 50 from ember in passes of seven, with 0.25 more hpMul per pass', () => {
    expect(BOSS_LOOP_FROM).toBe(3);
    expect(BOSS_HP_PER_PASS).toBe(0.25);
    expect(bossForLevel(55)).toEqual({ id: 'ember', tier: 2, atSec: 20, hpMul: 1.25 });
    expect(bossForLevel(60)).toEqual({ id: 'mirage', tier: 2, atSec: 20, hpMul: 1.25 });
    expect(bossForLevel(85)).toEqual({ id: 'prism', tier: 4, atSec: 20, hpMul: 1.25 });
    expect(bossForLevel(90)).toEqual({ id: 'ember', tier: 2, atSec: 20, hpMul: 1.5 });
    expect(bossForLevel(120)).toEqual({ id: 'prism', tier: 4, atSec: 20, hpMul: 1.5 });
    expect(bossForLevel(125)).toEqual({ id: 'ember', tier: 2, atSec: 20, hpMul: 1.75 });
    const loop = BOSS_IDS.slice(3);
    for (let n = 55; n <= 2000; n += 5) {
      const k = n / 5 - 11;
      const b = bossForLevel(n);
      expect(b?.id, `level ${n}`).toBe(loop[k % 7]);
      expect(b?.hpMul, `level ${n}`).toBe(1 + 0.25 * (1 + Math.floor(k / 7)));
      expect(b?.tier).toBe(bossTierOf(b?.id ?? ''));
    }
  });

  it('never repeats a tier 1 boss after level 50', () => {
    for (let n = 55; n <= 1000; n += 5) expect(['warden', 'brood', 'spindle']).not.toContain(bossForLevel(n)?.id);
  });

  it('pass 1 is levels 5 to 50 with hpMul 1, pass 2 levels 55 to 85 with 1.25', () => {
    for (let n = 5; n <= 50; n += 5) expect(bossForLevel(n)?.hpMul).toBe(1);
    for (let n = 55; n <= 85; n += 5) expect(bossForLevel(n)?.hpMul).toBe(1.25);
    expect(bossForLevel(90)?.hpMul).toBe(1.5);
  });

  it('bossOfNumber rejects 0, negatives and fractions', () => {
    for (const j of [0, -1, 1.5, Number.NaN]) expect(bossOfNumber(j, 20)).toBeNull();
  });
});

describe('bossForSegment', () => {
  it('returns a boss on positive multiples of 6 only', () => {
    expect(BOSS_SEGMENT_EVERY).toBe(6);
    for (let s = -12; s <= 400; s++) {
      if (s >= 6 && s % 6 === 0) expect(bossForSegment(s), `segment ${s}`).not.toBeNull();
      else expect(bossForSegment(s), `segment ${s}`).toBeNull();
    }
    expect(bossForSegment(0)).toBeNull();
    expect(bossForSegment(6.5)).toBeNull();
  });

  it('walks the same list with the same pass rule and enters 10 s into the segment', () => {
    expect(BOSS_SEGMENT_AT_SEC).toBe(10);
    expect(bossForSegment(6)).toEqual({ id: 'warden', tier: 1, atSec: 10, hpMul: 1 });
    expect(bossForSegment(12)?.id).toBe('brood');
    expect(bossForSegment(60)).toEqual({ id: 'prism', tier: 4, atSec: 10, hpMul: 1 });
    expect(bossForSegment(66)).toEqual({ id: 'ember', tier: 2, atSec: 10, hpMul: 1.25 });
    for (let j = 1; j <= 100; j++) {
      const lvl = bossForLevel(5 * j);
      expect(bossForSegment(6 * j)).toEqual(lvl === null ? null : { ...lvl, atSec: 10 });
    }
  });
});

describe('bossHazards (rule 12)', () => {
  const h: HazardDef = {
    wells: [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 5, y: 6 },
    ],
    spawners: [{ x: 7, y: 8, spawnAtSec: 10, emitEverySec: 5, dartsPerEmit: 5 }],
  };

  it('removes every spawner and every well beyond the first, in order, without touching the input', () => {
    const before = structuredClone(h);
    expect(BOSS_MAX_WELLS).toBe(1);
    expect(bossHazards(h)).toEqual({ wells: [{ x: 1, y: 2 }], spawners: [] });
    expect(h).toEqual(before);
    expect(bossHazards({ wells: [], spawners: [] })).toEqual({ wells: [], spawners: [] });
  });

  it('sameBoss compares all four fields', () => {
    const a: BossSpec = { id: 'warden', tier: 1, atSec: 20, hpMul: 1 };
    expect(sameBoss(a, { ...a })).toBe(true);
    expect(sameBoss(a, { ...a, id: 'brood' })).toBe(false);
    expect(sameBoss(a, { ...a, tier: 2 })).toBe(false);
    expect(sameBoss(a, { ...a, atSec: 10 })).toBe(false);
    expect(sameBoss(a, { ...a, hpMul: 1.25 })).toBe(false);
  });
});

describe('generator with enableBosses', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults on; V1 and V2 configs turn it off', () => {
    expect(DEFAULT_GEN_CONFIG.enableBosses).toBe(true);
    expect(V1_GEN_CONFIG.enableBosses).toBe(false);
    expect(V2_GEN_CONFIG.enableBosses).toBe(false);
    expect(V2_GEN_CONFIG.enableV2Enemies).toBe(true);
    expect(generateLevel(42, 5)).toEqual(generateLevel(42, 5, DEFAULT_GEN_CONFIG));
  });

  it('a boss level carries the boss last, version 3 and nothing else new; the field is frozen', () => {
    for (const n of [5, 10, 15, 20, 30, 35, 50, 55, 85]) {
      const on = generateLevel(42, n, ON);
      expect(on.boss, `level ${n}`).toEqual(bossForLevel(n));
      expect(on.generatorVersion).toBe(GENERATOR_VERSION_V3);
      expect(Object.keys(on).at(-1)).toBe('boss');
      expect(Object.isFrozen(on.boss)).toBe(true);
      const off = generateLevel(42, n, OFF);
      expect(off.boss).toBeUndefined();
      expect('boss' in off).toBe(false);
      const { boss: _b, generatorVersion: _gOn, hazards: hOn, ...restOn } = on;
      const { generatorVersion: _gOff, hazards: hOff, ...restOff } = off;
      expect(restOn).toEqual(restOff);
      expect(hOn).toEqual(bossHazards(hOff));
    }
  });

  it('a non boss level is identical with the flag on or off, and keeps its version', () => {
    for (const n of [1, 4, 6, 9, 11, 16, 31, 49, 51, 99]) {
      const on = generateLevel(42, n, ON);
      const off = generateLevel(42, n, OFF);
      expect(JSON.stringify(on), `level ${n}`).toBe(JSON.stringify(off));
      expect(levelHash(on)).toBe(levelHash(off));
      expect(on.generatorVersion).toBe(bandOf(n) >= 2 ? GENERATOR_VERSION_V2 : GENERATOR_VERSION);
    }
  });

  it('bosses with the v2 enemies off still mark the boss level version 3', () => {
    const cfg: GenConfig = { ...V1_GEN_CONFIG, enableBosses: true };
    const d = generateLevel(7, 20, cfg);
    expect(d.boss?.id).toBe('ember');
    expect(d.generatorVersion).toBe(GENERATOR_VERSION_V3);
    expect(validateLevel(d, cfg).errors).toEqual([]);
  });

  it('rule 12: a boss level that had spawners and several wells keeps no spawner and one well', () => {
    const seed = seedWithHazards(40, 1, 2);
    const off = generateLevel(seed, 40, OFF);
    const on = generateLevel(seed, 40, ON);
    expect(off.hazards.spawners.length).toBeGreaterThanOrEqual(1);
    expect(off.hazards.wells.length).toBeGreaterThanOrEqual(2);
    expect(on.hazards).toEqual({ wells: [off.hazards.wells[0]], spawners: [] });
    expect(validateLevel(on, ON).errors).toEqual([]);
  });

  it('withLevelBoss is a no op with the flag off and on a non boss level', () => {
    const d5 = generateLevel(42, 5, OFF);
    expect(withLevelBoss(d5, OFF)).toBe(d5);
    const d6 = generateLevel(42, 6, ON);
    expect(withLevelBoss(d6, ON)).toBe(d6);
  });

  it('a boss segment carries the boss and version 3, every other segment is unchanged', () => {
    for (let s = 0; s <= 72; s++) {
      const on = generateEndlessSegment(99, s, ON);
      const off = generateEndlessSegment(99, s, OFF);
      const want = bossForSegment(s);
      if (want === null) {
        expect(JSON.stringify(on), `segment ${s}`).toBe(JSON.stringify(off));
        continue;
      }
      expect(on.boss).toEqual(want);
      expect(on.generatorVersion).toBe(GENERATOR_VERSION_V3);
      const { boss: _b, generatorVersion: _g, ...rest } = on;
      const { generatorVersion: _g2, ...restOff } = off;
      expect(rest).toEqual(restOff);
      expect(validateSegment(on, ON).errors).toEqual([]);
    }
  });

  it('the Endless def is the same with the flag on or off', () => {
    expect(JSON.stringify(generateEndless(5, ON))).toBe(JSON.stringify(generateEndless(5, OFF)));
    expect(validateEndless(generateEndless(5, ON)).errors).toEqual([]);
  });

  it('boss levels and segments survive a JSON round trip and stay flat', () => {
    for (let n = 5; n <= 100; n += 5) {
      const d = generateLevel(1234, n, ON);
      expect(JSON.parse(JSON.stringify(d))).toEqual(d);
      expect(d.surface).toBe('flat');
    }
    const seg = generateEndlessSegment(1234, 12, ON);
    expect(JSON.parse(JSON.stringify(seg))).toEqual(seg);
  });

  it('stubbing Math.random to throw still generates boss levels and segments', () => {
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random called');
    });
    for (const n of [5, 10, 15, 50, 55]) expect(validateLevel(generateLevel(7, n, ON), ON).errors).toEqual([]);
    for (const s of [6, 12, 66]) expect(validateSegment(generateEndlessSegment(7, s, ON), ON).errors).toEqual([]);
    for (let j = 1; j <= 40; j++) {
      bossForLevel(5 * j);
      bossForSegment(6 * j);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('is deterministic: the same seed and index give a deep equal boss level', () => {
    expect(generateLevel(42, 50, ON)).toEqual(generateLevel(42, 50, ON));
    expect(levelHash(generateLevel(42, 10, ON))).toBe(levelHash(generateLevel(42, 10, ON)));
  });
});

describe('validator: B1 to B4 and J7', () => {
  const boss5 = (): LevelDef => copy(generateLevel(42, 5, ON));
  const plain5 = (): LevelDef => copy(generateLevel(42, 5, OFF));

  it('generated boss levels pass with and without the config; flag off levels pass with the off config', () => {
    expect(validateLevel(boss5(), ON).errors).toEqual([]);
    expect(validateLevel(boss5()).errors).toEqual([]);
    expect(validateLevel(plain5(), OFF).errors).toEqual([]);
    expect(validateLevel(plain5()).errors).toEqual([]);
  });

  it('B1: a boss on a level that is not a boss level fails', () => {
    const d = copy(generateLevel(42, 4, ON));
    d.boss = { id: 'warden', tier: 1, atSec: 20, hpMul: 1 };
    d.generatorVersion = GENERATOR_VERSION_V3;
    expect(ids(validateLevel(d).errors)).toEqual(['B1']);
  });

  it('B1: a boss that is not the scheduled one fails (id or hpMul)', () => {
    const d = boss5();
    d.boss = { id: 'brood', tier: 1, atSec: 20, hpMul: 1 };
    expect(ids(validateLevel(d).errors)).toEqual(['B1']);
    const e = boss5();
    e.boss = { id: 'warden', tier: 1, atSec: 20, hpMul: 1.25 };
    expect(ids(validateLevel(e).errors)).toEqual(['B1']);
  });

  it('B1: a boss level without its boss fails only when the config says the flag is on', () => {
    const d = plain5();
    expect(ids(validateLevel(d, ON).errors)).toEqual(['B1']);
    expect(validateLevel(d, OFF).errors).toEqual([]);
    expect(validateLevel(d).errors).toEqual([]);
  });

  it('B1: version 3 without a boss, and a boss without version 3, both fail', () => {
    const d = plain5();
    d.generatorVersion = GENERATOR_VERSION_V3;
    expect(ids(validateLevel(d).errors)).toEqual(['B1']);
    const e = boss5();
    e.generatorVersion = GENERATOR_VERSION;
    expect(ids(validateLevel(e).errors)).toEqual(['B1']);
  });

  it('B2: an unknown id or a tier that disagrees with the table fails', () => {
    const d = boss5();
    const bad: unknown = { ...d, boss: { id: 'nemesis', tier: 1, atSec: 20, hpMul: 1 } };
    expect(ids(validateLevel(bad as LevelDef).errors)).toEqual(expect.arrayContaining(['B2']));
    const e = boss5();
    e.boss = { id: 'warden', tier: 2, atSec: 20, hpMul: 1 };
    expect(ids(validateLevel(e).errors)).toEqual(expect.arrayContaining(['B2']));
    const f = boss5();
    f.boss = { id: 'warden', tier: 1, atSec: 20, hpMul: 0.5 };
    expect(ids(validateLevel(f).errors)).toEqual(expect.arrayContaining(['B2']));
  });

  it('B3: atSec other than 20 fails', () => {
    const d = boss5();
    d.boss = { id: 'warden', tier: 1, atSec: 15, hpMul: 1 };
    expect(ids(validateLevel(d).errors)).toEqual(expect.arrayContaining(['B3']));
  });

  it('B3: a timed level with under 20 s left after the entrance fails', () => {
    const d = boss5();
    expect(d.objective.kind).toBe('scoreInTime');
    d.objective = { kind: 'survive', durationSec: 35 };
    const errs = validateLevel(d).errors;
    expect(errs.some((e) => e.startsWith('B3:') && e.includes('only 15 s'))).toBe(true);
    const e = boss5();
    if (e.objective.kind === 'scoreInTime') e.objective = { ...e.objective, timeLimitSec: 39 };
    expect(ids(validateLevel(e).errors)).toContain('B3');
    // A destroy level has no clock, so B3 has nothing to measure there.
    const f = copy(generateLevel(42, 10, ON));
    expect(f.objective.kind).toBe('destroy');
    expect(validateLevel(f, ON).errors).toEqual([]);
  });

  it('B4: a boss level with a spawner or a second well fails', () => {
    const seed = seedWithHazards(40, 1, 2);
    const off = generateLevel(seed, 40, OFF);
    const d = copy(generateLevel(seed, 40, ON));
    d.hazards = structuredClone(off.hazards);
    expect(ids(validateLevel(d).errors)).toEqual(['B4']);
    const e = copy(generateLevel(seed, 40, ON));
    e.hazards.spawners = structuredClone(off.hazards.spawners);
    expect(validateLevel(e).errors.some((x) => x.startsWith('B4:') && x.includes('spawners'))).toBe(true);
  });

  it('J7: with the flag off a boss field or version 3 fails', () => {
    expect(ids(validateLevel(boss5(), OFF).errors)).toEqual(['J7']);
    const d = plain5();
    d.generatorVersion = GENERATOR_VERSION_V3;
    expect(ids(validateLevel(d, OFF).errors)).toEqual(expect.arrayContaining(['J7']));
    expect(validateLevel(boss5(), ON).errors).toEqual([]);
  });

  it('segments: B1, B3 and J7 apply against bossForSegment', () => {
    const good = generateEndlessSegment(3, 6, ON);
    expect(validateSegment(good, ON).errors).toEqual([]);
    const notBoss = copySeg(generateEndlessSegment(3, 5, ON));
    notBoss.boss = { id: 'warden', tier: 1, atSec: 10, hpMul: 1 };
    notBoss.generatorVersion = GENERATOR_VERSION_V3;
    expect(ids(validateSegment(notBoss).errors)).toEqual(['B1']);
    const late = copySeg(good);
    late.boss = { id: 'warden', tier: 1, atSec: 20, hpMul: 1 };
    expect(ids(validateSegment(late).errors)).toEqual(expect.arrayContaining(['B3']));
    const missing = copySeg(generateEndlessSegment(3, 6, OFF));
    expect(ids(validateSegment(missing, ON).errors)).toEqual(['B1']);
    expect(validateSegment(missing, OFF).errors).toEqual([]);
    expect(ids(validateSegment(copySeg(good), OFF).errors)).toEqual(['J7']);
  });

  it('J3 accepts version 3 and still rejects 4', () => {
    const d = boss5();
    expect(validateLevel(d).errors).toEqual([]);
    d.generatorVersion = 4;
    expect(ids(validateLevel(d).errors)).toContain('J3');
  });

  it('every generated level from 1 to 100 of three seeds validates strictly with the flag on and off', () => {
    for (const seed of [0, 42, 0xffffffff]) {
      for (let n = 1; n <= 100; n++) {
        expect(validateLevel(generateLevel(seed, n, ON), ON).errors, `seed ${seed} level ${n} on`).toEqual([]);
        expect(validateLevel(generateLevel(seed, n, OFF), OFF).errors, `seed ${seed} level ${n} off`).toEqual([]);
      }
    }
  });
});
