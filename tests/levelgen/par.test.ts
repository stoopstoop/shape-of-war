// Par against a simulated competent run (fix(par), device finding G4). See parSim.ts for the model.
import { describe, expect, it } from 'vitest';
import { computePar, generateLevel } from '../../src/levelgen/generator';
import { bandOf } from '../../src/levelgen/leveldef';
import type { EnemyKind, ObjectiveDef, WaveSchedule } from '../../src/levelgen/leveldef';
import { simulateScore } from './parSim';

const RUN_SEEDS = [0, 1, 0xdeadbeef, 0x4e464f4c] as const;
const LEVELS = Array.from({ length: 40 }, (_, i) => i + 1);

function schedule(kinds: readonly EnemyKind[], stepSec = 0): WaveSchedule {
  return {
    maxLiveEnemies: 60,
    intervalStartSec: 6,
    intervalEndSec: 4,
    rampSec: 60,
    rampExponent: 1,
    budgetStart: 3,
    budgetEnd: 8,
    waves: [
      {
        index: 0,
        atSec: 0,
        pattern: 'edges',
        entries: kinds.map((kind, i) => ({ kind, tOffsetSec: i * stepSec, mode: 'fixed', x: 0, y: 0, angleDeg: 0, radius: 0, headingDeg: 0 })),
      },
    ],
    loopFromIndex: -1,
    loopPeriodSec: 0,
  };
}

const survive = (durationSec: number): ObjectiveDef => ({ kind: 'survive', durationSec });

describe('parSim', () => {
  it('kills 7 of 10 grunts and scores each at the multiplier before its own geoms', () => {
    const r = simulateScore({ objective: survive(60), waves: schedule(Array<EnemyKind>(10).fill('grunt')) });
    // Kills on spawns 2, 3, 5, 6, 8, 9, 10 at multipliers 1, 1, 2, 3, 3, 4, 5.
    expect(r).toEqual({ score: 50 * 19, kills: 7, geoms: 4, multiplier: 5, windowSec: 60 });
  });

  it('drops kills whose reaction time lands after the window', () => {
    const r = simulateScore({ objective: survive(5), waves: schedule(Array<EnemyKind>(10).fill('grunt'), 1) });
    // Spawns at 0..9 s, kills land 1.5 s later, so only spawns at 0, 1, 2 and 3 s count.
    expect(r.kills).toBe(2);
  });

  it('stops a destroy objective at the count', () => {
    const r = simulateScore({ objective: { kind: 'destroy', count: 3 }, waves: schedule(Array<EnemyKind>(20).fill('grunt')) });
    expect(r.kills).toBe(3);
  });

  it('is deterministic for generated levels', () => {
    for (const s of RUN_SEEDS) for (const n of [1, 14, 40]) expect(simulateScore(generateLevel(s, n))).toEqual(simulateScore(generateLevel(s, n)));
  });

  it('computePar matches the par the generator stores', () => {
    for (const s of RUN_SEEDS) {
      const d = generateLevel(s, 14);
      expect(computePar(d.waves, d.objective).par).toBe(d.par);
    }
  });
});

describe('par versus simulated competent score', () => {
  const rows = RUN_SEEDS.flatMap((s) =>
    LEVELS.map((n) => {
      const d = generateLevel(s, n);
      return { s, n, par: d.par, ratio: d.par / simulateScore(d).score };
    }),
  );

  // Guard against the G4 suspicion: par must not outgrow achievable score as the level index rises.
  it('par sits between 10 and 35 percent of the simulated score for levels 1 to 40 on 4 seeds', () => {
    for (const r of rows) {
      expect(r.ratio, `seed ${r.s} level ${r.n}`).toBeGreaterThanOrEqual(0.1);
      expect(r.ratio, `seed ${r.s} level ${r.n}`).toBeLessThanOrEqual(0.35);
    }
  });

  it('the mean ratio does not drift with band (band 4 within 1.5x of band 1)', () => {
    const mean = (band: number): number => {
      const rs = rows.filter((r) => bandOf(r.n) === band).map((r) => r.ratio);
      return rs.reduce((a, b) => a + b, 0) / rs.length;
    };
    const m1 = mean(1);
    for (const band of [2, 3, 4]) {
      expect(mean(band) / m1).toBeGreaterThan(1 / 1.5);
      expect(mean(band) / m1).toBeLessThan(1.5);
    }
  });

  // scoreInTime ends the level the moment score reaches target (docs/01 section 8), and target is
  // 0.8 x par (docs/02 section 8 step 10), so a winning run lands just above 0.8 x par: 0 stars.
  // Fixing it needs an objective rule or target rule change outside src/levelgen (see hand-off).
  it.todo('scoreInTime: a competent run that ends at target earns at least 1 star');
});
