import { describe, expect, it } from 'vitest';
import {
  FIXTURE_HEX_WELLS,
  FIXTURE_RECT_EASY,
  FIXTURE_RECT_WALLS,
  INVALID_FIXTURES,
  VALID_FIXTURES,
  buildFixtureSchedule,
} from '../../src/levelgen/fixtures';
import { BANDS, bandOf, deepFreeze, expandSpawns, levelSeed, segmentSeed, speedScaleFor } from '../../src/levelgen/leveldef';
import type { ArenaDef, EndlessSegmentDef, LevelDef } from '../../src/levelgen/leveldef';
import { insideArena, isArenaConnected, validateLevel, validateSegment } from '../../src/levelgen/validate';

const clone = (d: LevelDef): LevelDef => structuredClone(d);

function errorsOf(base: LevelDef, mutate: (d: LevelDef) => void): string[] {
  const d = clone(base);
  mutate(d);
  return validateLevel(d).errors;
}

function idsOf(errors: readonly string[]): string[] {
  return errors.map((e) => e.split(':')[0] ?? '');
}

function firstFixedEntry(d: LevelDef): { wave: number; entry: number } {
  for (const [i, w] of d.waves.waves.entries()) {
    const k = w.entries.findIndex((e) => e.mode === 'fixed');
    if (k >= 0) return { wave: i, entry: k };
  }
  throw new Error('fixture has no fixed entry');
}

describe('fixtures', () => {
  it('all three valid fixtures pass with no errors', () => {
    for (const f of VALID_FIXTURES) expect(validateLevel(f)).toEqual({ ok: true, errors: [] });
  });

  it('cover rect, hexagon with wells, and rectObstacles', () => {
    expect(FIXTURE_RECT_EASY.arena.shape).toBe('rect');
    expect(FIXTURE_HEX_WELLS.arena.shape).toBe('hexagon');
    expect(FIXTURE_HEX_WELLS.hazards.wells.length).toBeGreaterThan(0);
    expect(FIXTURE_RECT_WALLS.arena.shape).toBe('rectObstacles');
    expect(FIXTURE_RECT_WALLS.arena.obstacles.length).toBe(3);
  });

  it('are deep frozen and survive a JSON round trip', () => {
    for (const f of VALID_FIXTURES) {
      expect(Object.isFrozen(f.arena.spawnPoint)).toBe(true);
      expect(Object.isFrozen(f.waves.waves[0]?.entries)).toBe(true);
      expect(JSON.parse(JSON.stringify(f))).toEqual(f);
    }
  });

  it('each invalid fixture reports its invariant', () => {
    expect(INVALID_FIXTURES).toHaveLength(3);
    for (const f of INVALID_FIXTURES) {
      const r = validateLevel(f.def);
      expect(r.ok, f.name).toBe(false);
      for (const id of f.expectErrors) expect(idsOf(r.errors), f.name).toContain(id);
    }
  });

  it('fixture schedules loop over the second half', () => {
    const w = FIXTURE_RECT_EASY.waves;
    const loop = w.waves[w.loopFromIndex];
    expect(loop?.atSec).toBeGreaterThanOrEqual(60);
    expect(w.loopPeriodSec).toBeGreaterThan(0);
    const last = w.waves[w.waves.length - 1];
    expect(expandSpawns(w, 600).some((s) => last !== undefined && s.t > last.atSec + 5)).toBe(true);
  });
});

interface Case {
  id: string;
  base: LevelDef;
  mutate: (d: LevelDef) => void;
}

const CASES: readonly Case[] = [
  { id: 'J1', base: FIXTURE_RECT_EASY, mutate: (d) => Object.assign(d, { extra: () => 1 }) },
  { id: 'J2', base: FIXTURE_RECT_EASY, mutate: (d) => (d.arena.width = Number.NaN) },
  { id: 'J3', base: FIXTURE_RECT_EASY, mutate: (d) => (d.generatorVersion = 99) },
  { id: 'J4', base: FIXTURE_RECT_EASY, mutate: (d) => (d.seed = (d.seed + 1) >>> 0) },
  { id: 'A1', base: FIXTURE_RECT_EASY, mutate: (d) => (d.arena.height = 1200) },
  {
    id: 'F1',
    base: FIXTURE_RECT_EASY,
    mutate: (d) => {
      d.arena.width = 2400;
      d.arena.height = 2400;
    },
  },
  { id: 'A2', base: FIXTURE_RECT_EASY, mutate: (d) => (d.arena.spawnPoint = { x: 5, y: 0 }) },
  { id: 'A3', base: FIXTURE_RECT_WALLS, mutate: (d) => (d.arena.obstacles[0] = { cx: 0, cy: -100, w: 400, h: 24 }) },
  { id: 'A4', base: FIXTURE_RECT_EASY, mutate: (d) => d.arena.obstacles.push({ cx: 300, cy: 200, w: 24, h: 100 }) },
  { id: 'A5', base: FIXTURE_RECT_WALLS, mutate: (d) => (d.arena.obstacles[1] = { cx: -240, cy: -100, w: 24, h: 300 }) },
  { id: 'A6', base: FIXTURE_RECT_WALLS, mutate: (d) => (d.arena.obstacles = [{ cx: 600, cy: 0, w: 24, h: 1000 }]) },
  { id: 'A7', base: FIXTURE_RECT_EASY, mutate: (d) => (d.arena.cornerRadius = 50) },
  { id: 'R1', base: FIXTURE_RECT_EASY, mutate: (d) => d.roster.push({ kind: 'snake', weight: 10 }) },
  { id: 'R2', base: FIXTURE_RECT_EASY, mutate: (d) => (d.speedScale = 1.3) },
  { id: 'O1', base: FIXTURE_RECT_EASY, mutate: (d) => (d.objective = { kind: 'survive', durationSec: 200 }) },
  {
    id: 'O2',
    base: FIXTURE_RECT_WALLS,
    mutate: (d) => (d.objective = { kind: 'scoreInTime', target: 1234, timeLimitSec: 120 }),
  },
  { id: 'P1', base: FIXTURE_RECT_EASY, mutate: (d) => (d.par = 1200) },
  {
    id: 'W1',
    base: FIXTURE_RECT_EASY,
    mutate: (d) => {
      const w = d.waves.waves[0];
      if (w) w.atSec = 3;
    },
  },
  {
    id: 'W2',
    base: FIXTURE_RECT_EASY,
    mutate: (d) => {
      const w = d.waves.waves[1];
      if (w) w.index = 7;
    },
  },
  {
    id: 'W3',
    base: FIXTURE_RECT_EASY,
    mutate: (d) => {
      const e = d.waves.waves[0]?.entries[0];
      if (e) e.kind = 'snake';
    },
  },
  {
    id: 'W4',
    base: FIXTURE_RECT_EASY,
    mutate: (d) => {
      const at = firstFixedEntry(d);
      const e = d.waves.waves[at.wave]?.entries[at.entry];
      if (e) {
        e.x = 0;
        e.y = 0;
      }
    },
  },
  {
    id: 'W5',
    base: FIXTURE_RECT_EASY,
    mutate: (d) => {
      const e = d.waves.waves[0]?.entries[0];
      if (e) e.radius = 100;
    },
  },
  {
    id: 'W6',
    base: FIXTURE_RECT_EASY,
    mutate: (d) => {
      const e = d.waves.waves[0]?.entries[0];
      if (e) e.tOffsetSec = 9;
    },
  },
  { id: 'W7', base: FIXTURE_RECT_EASY, mutate: (d) => (d.waves.maxLiveEnemies = 1) },
  { id: 'W8', base: FIXTURE_RECT_EASY, mutate: (d) => (d.waves.loopFromIndex = 999) },
  {
    id: 'W9',
    base: FIXTURE_HEX_WELLS,
    mutate: (d) => {
      d.objective = { kind: 'destroy', count: 150 };
      d.waves.waves = d.waves.waves.slice(0, 10);
      d.waves.loopFromIndex = 0;
      d.waves.loopPeriodSec = 10000;
    },
  },
  {
    id: 'W10',
    base: FIXTURE_RECT_EASY,
    mutate: (d) => {
      d.waves.waves = d.waves.waves.filter((w) => w.atSec < 20);
      d.waves.loopFromIndex = 0;
      d.waves.loopPeriodSec = 1000;
    },
  },
  { id: 'H1', base: FIXTURE_HEX_WELLS, mutate: (d) => (d.hazards.wells[0] = { x: 0, y: 0 }) },
  {
    id: 'H2',
    base: FIXTURE_HEX_WELLS,
    mutate: (d) =>
      (d.hazards.wells = [
        { x: 400, y: 0 },
        { x: 200, y: 330 },
      ]),
  },
  {
    id: 'H3',
    base: FIXTURE_RECT_WALLS,
    mutate: (d) => (d.hazards.spawners[0] = { x: 100, y: 100, spawnAtSec: 20, emitEverySec: 5, dartsPerEmit: 5 }),
  },
  { id: 'H4', base: FIXTURE_RECT_EASY, mutate: (d) => d.hazards.wells.push({ x: 370, y: 0 }) },
  { id: 'L1', base: FIXTURE_RECT_EASY, mutate: (d) => (d.lives = 5) },
];

describe('validateLevel: every invariant has a failing mutation', () => {
  it.each(CASES.map((c) => [c.id, c] as const))('%s', (id, c) => {
    const errors = errorsOf(c.base, c.mutate);
    expect(idsOf(errors)).toContain(id);
  });

  it('covers every invariant id in docs/02 section 11 plus F1', () => {
    const ids = new Set(CASES.map((c) => c.id));
    const want = 'J1 J2 J3 J4 A1 A2 A3 A4 A5 A6 A7 F1 R1 R2 O1 O2 P1 W1 W2 W3 W4 W5 W6 W7 W8 W9 W10 H1 H2 H3 H4 L1';
    for (const id of want.split(' ')) expect(ids.has(id), id).toBe(true);
  });

  it('mutations isolate their invariant where geometry allows', () => {
    const isolated = ['J3', 'J4', 'A7', 'R2', 'P1', 'W2', 'W3', 'W5', 'W6', 'W7', 'W9', 'W10', 'H2', 'H4', 'L1'];
    for (const c of CASES.filter((x) => isolated.includes(x.id))) {
      expect(new Set(idsOf(errorsOf(c.base, c.mutate))), c.id).toEqual(new Set([c.id]));
    }
  });
});

describe('validateLevel: named cases from docs/06 section 2.4', () => {
  const has = (errors: readonly string[], id: string, word: string): boolean =>
    errors.some((e) => e.startsWith(`${id}:`) && e.includes(word));

  it('roster of 2 and of 7 name roster size', () => {
    const two = errorsOf(FIXTURE_RECT_EASY, (d) => (d.roster = d.roster.slice(0, 2)));
    expect(has(two, 'R1', 'roster size')).toBe(true);
    const seven = errorsOf(FIXTURE_RECT_WALLS, (d) => {
      d.roster.push({ kind: 'pinwheel', weight: 8 }, { kind: 'grunt', weight: 20 });
    });
    expect(has(seven, 'R1', 'roster size 7')).toBe(true);
  });

  it('4 wells names hazards', () => {
    const e = errorsOf(FIXTURE_RECT_WALLS, (d) => {
      d.hazards.wells.push({ x: 450, y: 320 }, { x: -450, y: 320 }, { x: 0, y: 420 });
    });
    expect(has(e, 'H1', 'hazards')).toBe(true);
  });

  it('well on ship spawn names spawn clearance', () => {
    const e = errorsOf(FIXTURE_HEX_WELLS, (d) => (d.hazards.wells[0] = { x: 0, y: 0 }));
    expect(has(e, 'H1', 'spawn clearance')).toBe(true);
  });

  it('well outside arena names bounds', () => {
    const e = errorsOf(FIXTURE_HEX_WELLS, (d) => (d.hazards.wells[0] = { x: -700, y: 0 }));
    expect(has(e, 'H1', 'bounds')).toBe(true);
  });

  it('sealed walls fail connectivity', () => {
    const e = errorsOf(FIXTURE_RECT_WALLS, (d) => (d.arena.obstacles = [{ cx: 600, cy: 0, w: 24, h: 1000 }]));
    expect(has(e, 'A6', 'seal')).toBe(true);
  });

  it('arena too large for the fold safe rects names fit', () => {
    const e = errorsOf(FIXTURE_RECT_EASY, (d) => {
      d.arena.width = 2400;
      d.arena.height = 2400;
    });
    expect(has(e, 'F1', 'fit 21:9')).toBe(true);
    expect(has(e, 'A1', 'bounds')).toBe(true);
  });

  it('largest legal arena still fits both safe rects', () => {
    const e = errorsOf(FIXTURE_RECT_EASY, (d) => {
      d.arena.width = 1800;
      d.arena.height = 1100;
      d.par = 3000;
    });
    expect(idsOf(e)).not.toContain('F1');
  });

  it('unordered stars name stars', () => {
    const e = errorsOf(FIXTURE_RECT_EASY, (d) => (d.stars = [d.par, 4 * d.par, 2 * d.par]));
    expect(has(e, 'P1', 'stars')).toBe(true);
  });

  it('function and NaN values name serialisation', () => {
    const fn = errorsOf(FIXTURE_RECT_EASY, (d) => Object.assign(d.arena, { draw: () => 0 }));
    expect(has(fn, 'J1', 'serialisation')).toBe(true);
    expect(has(fn, 'J2', 'serialisation')).toBe(true);
    const nan = errorsOf(FIXTURE_RECT_EASY, (d) => (d.par = Number.NaN));
    expect(has(nan, 'J1', 'serialisation')).toBe(true);
    expect(has(nan, 'J2', 'serialisation')).toBe(true);
  });

  it('unknown drone and missing grunt are reported, and malformed input never throws', () => {
    const e = errorsOf(FIXTURE_RECT_EASY, (d) => {
      Object.assign(d, { drone: 'laser' });
      d.roster = d.roster.filter((r) => r.kind !== 'grunt');
    });
    expect(has(e, 'L1', 'drone')).toBe(true);
    expect(has(e, 'R1', 'grunt')).toBe(true);
    const broken = errorsOf(FIXTURE_RECT_EASY, (d) => Object.assign(d, { arena: null, waves: {} }));
    expect(broken.some((x) => x.includes('malformed'))).toBe(true);
  });

  it('collects every failure instead of stopping at the first', () => {
    const e = errorsOf(FIXTURE_RECT_EASY, (d) => {
      d.lives = 1;
      d.par = 7;
      d.arena.cornerRadius = 9;
    });
    expect(idsOf(e)).toEqual(expect.arrayContaining(['L1', 'P1', 'A7']));
  });
});

describe('arena geometry', () => {
  const rect: ArenaDef = { shape: 'rect', width: 1000, height: 800, cornerRadius: 0, obstacles: [], spawnPoint: { x: 0, y: 0 } };

  it('insideArena per shape', () => {
    expect(insideArena(rect, { x: 459, y: 0 }, 40)).toBe(true);
    expect(insideArena(rect, { x: 461, y: 0 }, 40)).toBe(false);
    const rr: ArenaDef = { ...rect, shape: 'roundRect', cornerRadius: 200 };
    expect(insideArena(rr, { x: 495, y: 395 }, 0)).toBe(false);
    expect(insideArena(rr, { x: 495, y: 0 }, 0)).toBe(true);
    const circle: ArenaDef = { ...rect, shape: 'circle', width: 800, height: 800 };
    expect(insideArena(circle, { x: 280, y: 280 }, 0)).toBe(true);
    expect(insideArena(circle, { x: 290, y: 290 }, 0)).toBe(false);
    const hex: ArenaDef = { ...rect, shape: 'hexagon', width: 1000, height: 866.0254 };
    expect(insideArena(hex, { x: 499, y: 0 }, 0)).toBe(true);
    expect(insideArena(hex, { x: 0, y: 434 }, 0)).toBe(false);
    expect(insideArena(hex, { x: 400, y: 300 }, 0)).toBe(false);
  });

  it('isArenaConnected: open, walled and split arenas', () => {
    expect(isArenaConnected(rect)).toBe(true);
    expect(isArenaConnected(FIXTURE_RECT_WALLS.arena)).toBe(true);
    const split: ArenaDef = { ...rect, shape: 'rectObstacles', obstacles: [{ cx: 300, cy: 0, w: 24, h: 800 }] };
    expect(isArenaConnected(split)).toBe(false);
    const onSpawn: ArenaDef = { ...rect, shape: 'rectObstacles', obstacles: [{ cx: 0, cy: 0, w: 100, h: 100 }] };
    expect(isArenaConnected(onSpawn)).toBe(false);
  });
});

describe('leveldef helpers', () => {
  it('levelSeed matches the docs/02 worked example', () => {
    expect(levelSeed(0x4e464f4c, 1)).toBe(0x229578a8);
    expect(levelSeed(0x4e464f4c, 12)).toBe(0x41596aae);
    expect(levelSeed(0x4e464f4c, 37)).toBe(0x417a29d8);
  });

  it('segmentSeed matches the docs/02 endless reference', () => {
    expect(segmentSeed(0x4e464f4c, 0)).toBe(0x84a226d0);
    expect(segmentSeed(0x4e464f4c, 1)).toBe(0x9dbb7814);
    expect(segmentSeed(0x4e464f4c, 2)).toBe(0xbf9ea0eb);
  });

  it('bandOf boundaries', () => {
    expect([1, 5, 6, 15, 16, 30, 31, 1000].map(bandOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('speedScaleFor follows table 4.2', () => {
    expect(speedScaleFor(1)).toBe(1);
    expect(speedScaleFor(12)).toBe(1.05);
    expect(speedScaleFor(20)).toBe(1.1);
    expect(speedScaleFor(37)).toBe(1.23);
    expect(speedScaleFor(500)).toBe(1.4);
  });

  it('band 1 roster weights only allow grunt, wanderer, pinwheel', () => {
    const w = BANDS[1].rosterWeights;
    expect(Object.entries(w).filter(([, v]) => v > 0).map(([k]) => k)).toEqual(['grunt', 'wanderer', 'pinwheel']);
  });

  it('expandSpawns is sorted, respects tEnd and repeats the loop', () => {
    const w = FIXTURE_RECT_EASY.waves;
    const out = expandSpawns(w, 600);
    for (let i = 1; i < out.length; i++) expect(out[i]?.t ?? 0).toBeGreaterThanOrEqual(out[i - 1]?.t ?? 0);
    expect(out.every((s) => s.t < 600)).toBe(true);
    expect(expandSpawns(w, 2.5)).toEqual([]);
    expect(expandSpawns({ ...w, loopFromIndex: -1, loopPeriodSec: 0 }, 600).length).toBeLessThan(out.length);
  });

  it('deepFreeze freezes nested arrays', () => {
    const v = deepFreeze({ a: [{ b: 1 }] });
    expect(Object.isFrozen(v.a[0])).toBe(true);
  });
});

describe('validateSegment', () => {
  function makeSegment(): EndlessSegmentDef {
    const waves = buildFixtureSchedule(1, ['grunt', 'wanderer', 'pinwheel'], [{ x: -420, y: -280 }]);
    waves.waves = waves.waves.filter((w) => w.atSec < 30);
    waves.loopFromIndex = -1;
    waves.loopPeriodSec = 0;
    return {
      version: 1,
      generatorVersion: 1,
      endlessSeed: 0x4e464f4c,
      segment: 0,
      seed: segmentSeed(0x4e464f4c, 0),
      effectiveIndex: 1,
      band: 1,
      roster: [
        { kind: 'grunt', weight: 40 },
        { kind: 'wanderer', weight: 35 },
        { kind: 'pinwheel', weight: 25 },
      ],
      speedScale: 1,
      waves,
    };
  }

  it('accepts a well formed segment', () => {
    expect(validateSegment(makeSegment())).toEqual({ ok: true, errors: [] });
  });

  it('rejects waves beyond 30 s, loops, and a wrong seed', () => {
    const s = makeSegment();
    const last = s.waves.waves[s.waves.waves.length - 1];
    if (last) last.atSec = 31;
    s.waves.loopFromIndex = 0;
    s.seed = 1;
    expect(idsOf(validateSegment(s).errors)).toEqual(expect.arrayContaining(['S1', 'W8', 'J4']));
  });
});
