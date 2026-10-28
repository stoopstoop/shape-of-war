// gen-perf (run 0191): the fast paths added to the generator and validator give the same answers
// as the code they replace. Output identity itself is pinned by the levelHash tables in
// tests/qa/levelSnapshots.test.ts, tests/qa/golden/v1-hashes.json and gcTriage.test.ts.
import { describe, expect, it } from 'vitest';
import { computePar, generateLevel } from '../../src/levelgen/generator';
import {
  DEFAULT_GEN_CONFIG,
  ENEMY_BASE,
  ENEMY_GEOMS,
  V1_GEN_CONFIG,
  deepFreeze,
  expandSpawns,
  forEachSpawn,
} from '../../src/levelgen/leveldef';
import type { ArenaDef, EnemyKind, LevelDef, ObjectiveDef, WaveSchedule } from '../../src/levelgen/leveldef';
import { KILL_RATE, MAX_EST_SEC, PAR_MIN, PAR_STEP, isArenaConnected, isPlainJson, jsonRoundTripDiff, nonJsonValues, validateLevel } from '../../src/levelgen/validate';
import { isV2Kind } from '../../src/levelgen/v2enemies';
import { spawnTotal, spawnsByKind } from '../qa/summary';

const sample = (): LevelDef[] => {
  const out: LevelDef[] = [];
  for (const cfg of [DEFAULT_GEN_CONFIG, V1_GEN_CONFIG]) for (let n = 1; n <= 60; n += 3) out.push(generateLevel(0x4e464f4c, n, cfg));
  return out;
};
const LEVELS = sample();

/** computePar as it was before gen-perf: one sorted expansion, slice or filter, then reduce. */
function referencePar(waves: WaveSchedule, objective: ObjectiveDef): { par: number; target: number } {
  const all = expandSpawns(waves, MAX_EST_SEC);
  let spawned: { t: number; kind: EnemyKind }[];
  if (objective.kind === 'destroy') spawned = all.slice(0, Math.min(Math.ceil(objective.count / KILL_RATE), all.length));
  else if (objective.kind === 'survive') spawned = all.filter((s) => s.t < objective.durationSec);
  else spawned = all.filter((s) => s.t < objective.timeLimitSec);
  let par = PAR_MIN;
  if (spawned.length > 0) {
    const baseTotal = spawned.reduce((a, s) => a + ENEMY_BASE[s.kind], 0);
    const gAvg = spawned.reduce((a, s) => a + ENEMY_GEOMS[s.kind], 0) / spawned.length;
    const K = objective.kind === 'destroy' ? objective.count : KILL_RATE * spawned.length;
    const baseSum = objective.kind === 'destroy' ? (baseTotal * objective.count) / spawned.length : KILL_RATE * baseTotal;
    par = Math.max(PAR_MIN, Math.round((baseSum * (1 + 0.1 * gAvg * K) * 0.5) / PAR_STEP) * PAR_STEP);
  }
  return { par, target: Math.min(par, Math.max(PAR_MIN, Math.round((0.8 * par) / PAR_STEP) * PAR_STEP)) };
}

describe('forEachSpawn', () => {
  it('visits exactly the spawns expandSpawns returns, for every horizon', () => {
    for (const d of LEVELS) {
      for (const tEnd of [5, 60, 200, MAX_EST_SEC]) {
        const seen: { t: number; kind: EnemyKind }[] = [];
        expect(forEachSpawn(d.waves, tEnd, (t, kind) => void seen.push({ t, kind }))).toBe(false);
        expect(seen.sort((a, b) => a.t - b.t)).toEqual(expandSpawns(d.waves, tEnd));
      }
    }
  });

  it('stops at the first visit that returns true', () => {
    const d = LEVELS[0];
    if (d === undefined) throw new Error('no level');
    let calls = 0;
    expect(forEachSpawn(d.waves, MAX_EST_SEC, () => ++calls === 3)).toBe(true);
    expect(calls).toBe(3);
  });
});

describe('computePar', () => {
  it('matches the sorted-expansion reference on generated levels and every objective kind', () => {
    const kinds = new Set<string>();
    for (const d of LEVELS) {
      const objectives: ObjectiveDef[] = [
        d.objective,
        { kind: 'destroy', count: 5 },
        { kind: 'destroy', count: 100_000 },
        { kind: 'survive', durationSec: 90 },
        { kind: 'scoreInTime', target: PAR_MIN, timeLimitSec: 120 },
      ];
      for (const o of objectives) {
        kinds.add(o.kind);
        expect(computePar(d.waves, o)).toEqual(referencePar(d.waves, o));
      }
    }
    expect(kinds.size).toBe(3);
  });
});

describe('isPlainJson fast path for J1 and J2', () => {
  it('accepts every generated level, so validateLevel skips the two exact walks', () => {
    for (const d of LEVELS) {
      expect(isPlainJson(d)).toBe(true);
      expect(jsonRoundTripDiff(d)).toBeNull();
      expect(nonJsonValues(d)).toEqual([]);
    }
  });

  it('rejects anything J1 or J2 would report', () => {
    const holey: unknown[] = [1];
    holey[2] = 3;
    const extra: unknown[] = [1, 2];
    Object.assign(extra, { note: undefined });
    class Box {
      x = 1;
    }
    const bad: unknown[] = [NaN, Infinity, -0, undefined, () => 1, Symbol('s'), 1n, holey, extra, new Box(), { toJSON: () => 1 }, { a: [{ b: NaN }] }];
    for (const v of bad) expect(isPlainJson(v)).toBe(false);
    for (const v of [0, 'a', true, null, [], {}, { a: [1, { b: 'c' }] }, Object.create(null) as unknown]) expect(isPlainJson(v)).toBe(true);
  });

  it('keeps J2 exact for an array with an extra key, which J1 alone misses', () => {
    const d = LEVELS[0];
    if (d === undefined) throw new Error('no level');
    const copy = structuredClone(d);
    Object.assign(copy.roster, { extra: undefined });
    const errors = validateLevel(copy).errors;
    expect(errors.some((e) => e.startsWith('J2:') && e.includes('$.roster.extra'))).toBe(true);
    expect(errors.some((e) => e.startsWith('J1:'))).toBe(false);
  });

  it('reports J1 and J2 as before on a NaN', () => {
    const d = LEVELS[0];
    if (d === undefined) throw new Error('no level');
    const copy = structuredClone(d);
    copy.par = NaN;
    const errors = validateLevel(copy).errors;
    expect(errors).toContain('J1: JSON round trip differs at $.par (serialisation)');
    expect(errors).toContain('J2: non JSON value at $.par = NaN (serialisation)');
  });
});

describe('isArenaConnected memo', () => {
  const open: ArenaDef = { shape: 'rect', width: 1200, height: 800, cornerRadius: 0, obstacles: [], spawnPoint: { x: 0, y: 0 } };
  // A full-height wall at x = 300 cuts off the right side of the arena.
  const wall = { cx: 300, cy: 0, w: 24, h: 800 };

  it('answers from the arena fields, not the object identity', () => {
    expect(isArenaConnected(open)).toBe(true);
    expect(isArenaConnected({ ...open, spawnPoint: { x: 0, y: 0 } })).toBe(true);
    const sealed: ArenaDef = { ...open, shape: 'rectObstacles', obstacles: [wall] };
    expect(isArenaConnected(sealed)).toBe(false);
    expect(isArenaConnected({ ...sealed, obstacles: [{ ...wall }] })).toBe(false);
    expect(isArenaConnected({ ...sealed, obstacles: [{ ...wall, h: 400, cy: 200 }] })).toBe(true);
  });

  it('sees a change to an arena that was already checked', () => {
    const a: ArenaDef = { ...open, shape: 'rectObstacles', obstacles: [{ ...wall, h: 400, cy: 200 }] };
    expect(isArenaConnected(a)).toBe(true);
    const o = a.obstacles[0];
    if (o === undefined) throw new Error('no obstacle');
    o.h = 800;
    o.cy = 0;
    expect(isArenaConnected(a)).toBe(false);
  });

  it('agrees with every generated arena (the generator placed them connected)', () => {
    for (const d of LEVELS) expect(isArenaConnected(d.arena)).toBe(true);
  });
});

describe('deepFreeze', () => {
  it('freezes every nested object and array of a level', () => {
    const walk = (v: unknown): void => {
      if (typeof v !== 'object' || v === null) return;
      expect(Object.isFrozen(v)).toBe(true);
      for (const x of Object.values(v)) walk(x);
    };
    for (const d of LEVELS) walk(d);
  });

  it('freezes own members only and leaves primitives alone', () => {
    const proto = { shared: { a: 1 } };
    const v = Object.assign(Object.create(proto) as { own?: { b: number[] } }, { own: { b: [1, 2] } });
    deepFreeze(v);
    expect(Object.isFrozen(v.own)).toBe(true);
    expect(Object.isFrozen(v.own?.b)).toBe(true);
    expect(Object.isFrozen(proto.shared)).toBe(false);
    expect(deepFreeze(5)).toBe(5);
  });
});

describe('qa summary spawnTotal', () => {
  it('counts v2 kinds, so it equals the number of stored entries', () => {
    let sawV2 = false;
    for (const d of LEVELS) {
      const entries = d.waves.waves.reduce((n, w) => n + w.entries.length, 0);
      const byKind = spawnsByKind(d);
      expect(spawnTotal(byKind)).toBe(entries);
      if (d.waves.waves.some((w) => w.entries.some((e) => isV2Kind(e.kind)))) sawV2 = true;
    }
    expect(sawV2).toBe(true);
  });
});
