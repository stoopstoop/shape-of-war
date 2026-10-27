import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { advanceSegments, applyAwards, endlessLevel, endlessWave, stepEndlessAwards } from '../../src/game/endless';
import { killEnemy } from '../../src/game/combat';
import { createEndlessGame, createGame, stepGame } from '../../src/game/game';
import { collectGeom as simCollectGeom } from '../../src/game/geoms';
import { awardKill, collectGeom, scoreOf, shipDied } from '../../src/game/scoring';
import { killShip } from '../../src/game/player';
import { removeEntity } from '../../src/game/remove';
import { gs, type ScoringPort } from '../../src/game/state';
import { ENTITY_CAP, inlineRectLevel, Kind, spawn, type World } from '../../src/game/world';
import { generateEndless, generateEndlessSegment } from '../../src/levelgen/generator';
import type { EndlessSegmentDef } from '../../src/levelgen/leveldef';
import { DT, idle } from './helpers';

afterEach(() => bus.clear());

const SEEDS = [1, 2, 3, 0xdeadbeef];

function endless(seed: number, capacity?: number, requested: number[] = []): World {
  const def = generateEndless(seed);
  const source = (s: number): EndlessSegmentDef => {
    requested.push(s);
    return generateEndlessSegment(seed, s);
  };
  const w = createEndlessGame(def, source, { logSpawns: true, vibrate: () => undefined, capacity });
  w.ship.invuln = 1e9;
  return w;
}

/** Stand in for a player: remove every non ship entity (no score) every 0.1 s. */
function sweep(w: World): void {
  for (let id = 1; id < w.cap; id++) if (w.alive[id] === 1) removeEntity(w, id);
}

/** Spawns per 30 s window of wave clock over secs seconds, with the arena swept clear. */
function spawnBins(seed: number, secs: number): number[] {
  const w = endless(seed);
  const input = idle();
  for (let i = 0; i < secs * 120; i++) {
    stepGame(w, DT, input);
    if (i % 12 === 0) sweep(w);
  }
  const bins = new Array<number>(Math.ceil(secs / 30)).fill(0);
  for (const e of gs(w).spawnLog ?? []) {
    const b = Math.floor(e.t / 30);
    if (b < bins.length) bins[b] = (bins[b] ?? 0) + 1;
  }
  expect(gs(w).dropped).toBe(0);
  return bins;
}

describe('endless level', () => {
  it('plays on the fixed 1600 x 1000 arena with Attack, Turbo, 3 lives, 3 bombs and no hazards', () => {
    const def = generateEndless(9);
    const lvl = endlessLevel(def, generateEndlessSegment(9, 0));
    expect(lvl.arena.width).toBe(1600);
    expect(lvl.arena.height).toBe(1000);
    expect(lvl.drone).toBe('attack');
    expect(lvl.superType).toBe('turbo');
    expect([lvl.lives, lvl.bombs]).toEqual([3, 3]);
    expect(lvl.hazards.wells.length + lvl.hazards.spawners.length).toBe(0);
    expect(JSON.parse(JSON.stringify(lvl))).toEqual(lvl);
  });

  it('switches segment every 30 s of wave clock and prefetches the next one', () => {
    const requested: number[] = [];
    const w = endless(5, undefined, requested);
    expect(requested).toEqual([0, 1]);
    expect(endlessWave(w)).toBe(1);
    const input = idle();
    for (let i = 0; i < 30 * 120 + 2; i++) stepGame(w, DT, input);
    expect(endlessWave(w)).toBe(2);
    expect(requested).toEqual([0, 1, 2]);
    expect(gs(w).waveShift).toBe(30);
    expect(w.level.waves).toEqual(generateEndlessSegment(5, 1).waves);
    expect(w.level.roster).toEqual(generateEndlessSegment(5, 1).roster);
  });

  it('takes speedScale from each segment', () => {
    const w = endless(5);
    advanceSegments(w, 15 * 30 + 0.1);
    expect(endlessWave(w)).toBe(16);
    expect(gs(w).speedScale).toBe(generateEndlessSegment(5, 15).speedScale);
    expect(gs(w).speedScale).toBeGreaterThan(1);
    expect(gs(w).arenaFactor).toBe(1);
  });

  it('only ends when lives reach 0, with 0 stars and mode endless', () => {
    const w = endless(5);
    w.ship.invuln = 0;
    const overs: { stars: number; mode: string }[] = [];
    bus.on('game:over', (p) => overs.push({ stars: p.stars, mode: p.mode }));
    const input = idle();
    for (let life = 0; life < 3; life++) {
      killShip(w);
      for (let i = 0; i < 2 * 120; i++) stepGame(w, DT, input);
      w.ship.invuln = 0;
    }
    expect(gs(w).outcome).toBe('lost');
    expect(overs).toEqual([{ stars: 0, mode: 'endless' }]);
  });
});

describe('endless lives and bombs', () => {
  const def = { extraLifeEvery: 100_000, extraBombEvery: 150_000, maxLives: 9, maxBombs: 9 };

  it('adds a life every 100,000 and a bomb every 150,000 points', () => {
    const a = applyAwards(310_000, def, { lives: 3, bombs: 3, nextLifeAt: 100_000, nextBombAt: 150_000 });
    expect(a).toEqual({ lives: 6, bombs: 5, nextLifeAt: 400_000, nextBombAt: 450_000 });
  });

  it('caps at 9 and still consumes thresholds', () => {
    const a = applyAwards(1_000_000, def, { lives: 8, bombs: 9, nextLifeAt: 100_000, nextBombAt: 150_000 });
    expect(a.lives).toBe(9);
    expect(a.bombs).toBe(9);
    expect(a.nextLifeAt).toBe(1_100_000);
    expect(a.nextBombAt).toBe(1_050_000);
  });

  it('applies in the running game', () => {
    const w = endless(5);
    gs(w).score = 100_000;
    stepEndlessAwards(w);
    expect(gs(w).lives).toBe(4);
    expect(gs(w).bombs).toBe(3);
    stepEndlessAwards(w);
    expect(gs(w).lives).toBe(4);
    gs(w).score = 150_000;
    stepEndlessAwards(w);
    expect(gs(w).bombs).toBe(4);
  });
});

describe('endless escalation', () => {
  it('mean spawn rate is non decreasing over 300 s', () => {
    for (const seed of SEEDS) {
      const bins = spawnBins(seed, 300);
      let total = 0;
      let prevMean = 0;
      for (let k = 0; k < bins.length; k++) {
        total += bins[k] ?? 0;
        const mean = total / (k + 1);
        expect(mean, `seed ${seed} window ${k}`).toBeGreaterThanOrEqual(prevMean);
        prevMean = mean;
      }
      // And the late game is much busier than the opening.
      const first = (bins[0] ?? 0) + (bins[1] ?? 0);
      const last = (bins[8] ?? 0) + (bins[9] ?? 0);
      expect(last).toBeGreaterThan(2 * first);
    }
  });

  it('keeps escalating past band 4 with no upper bound on the schedule', () => {
    const bins = spawnBins(1, 600);
    const mid = bins.slice(8, 12).reduce((a, b) => a + b, 0);
    const late = bins.slice(16, 20).reduce((a, b) => a + b, 0);
    expect(late).toBeGreaterThan(mid);
    expect(generateEndlessSegment(1, 19).waves.budgetEnd).toBeGreaterThan(generateEndlessSegment(1, 15).waves.budgetEnd);
  });
});

describe('entity cap under Endless', () => {
  it('spawn returns -1 when the store is full, never throws', () => {
    const w = endless(5, 8);
    const ids: number[] = [];
    for (let i = 0; i < 10; i++) ids.push(spawn(w, Kind.Grunt, 0, 0));
    expect(ids.slice(-3)).toEqual([-1, -1, -1]);
    expect(w.liveCount).toBe(w.cap);
  });

  for (const capacity of [ENTITY_CAP, 160]) {
    it(`holds at most ${capacity} entities for 600 s with nothing killed`, () => {
      const w = endless(0xdeadbeef, capacity);
      const input = idle();
      let maxLive = 0;
      let fullSteps = 0;
      expect(() => {
        for (let i = 0; i < 600 * 120; i++) {
          stepGame(w, DT, input);
          if (w.liveCount > maxLive) maxLive = w.liveCount;
          if (w.freeTop === 0) fullSteps++;
        }
      }).not.toThrow();
      expect(maxLive).toBeLessThanOrEqual(capacity);
      expect(w.freeTop).toBeGreaterThanOrEqual(0);
      let alive = 0;
      for (let id = 0; id < w.cap; id++) alive += w.alive[id] ?? 0;
      expect(alive).toBe(w.liveCount);
      expect(gs(w).outcome).toBe('running');
      expect(endlessWave(w)).toBe(20); // segment 19 covers 570 to 600 s
      if (capacity < ENTITY_CAP) expect(fullSteps).toBeGreaterThan(0);
    }, 60000);
  }
});

describe('endless bonuses through the real sim with Ledger scoring wired', () => {
  const ledgerPort: ScoringPort = {
    awardKill,
    collectGeom: (w: World): void => {
      collectGeom(w);
    },
    resetMultiplier: shipDied,
    multiplier: (w: World): number => scoreOf(w).multiplier,
  };

  function ledgerEndless(seed: number): World {
    const def = generateEndless(seed);
    const w = createEndlessGame(def, (s) => generateEndlessSegment(seed, s), { scoring: ledgerPort, vibrate: () => undefined });
    w.ship.invuln = 1e9;
    return w;
  }

  /** Real scored kill of a Grunt through combat.killEnemy. */
  function killGrunt(w: World): void {
    killEnemy(w, spawn(w, Kind.Grunt, 300, 0), true);
  }

  it('the def carries the docs/01 numbers', () => {
    const def = generateEndless(5);
    expect(def.extraLifeEvery).toBe(100_000);
    expect(def.extraBombEvery).toBe(150_000);
    expect(def.maxLives).toBe(9);
    expect(def.maxBombs).toBe(9);
  });

  it('+1 life at 100,000, +1 bomb at 150,000, both reported on hud:score', () => {
    const w = ledgerEndless(5);
    const huds: { lives: number; bombs: number; multiplier: number }[] = [];
    bus.on('hud:score', (p) => huds.push({ lives: p.lives, bombs: p.bombs, multiplier: p.multiplier }));
    for (let i = 0; i < 998; i++) simCollectGeom(w, spawn(w, Kind.Geom, 0, 0));
    expect(scoreOf(w).multiplier).toBe(999);
    expect(gs(w).multiplier).toBe(999);
    killGrunt(w); // 49,950
    killGrunt(w); // 99,900
    stepGame(w, DT, idle());
    expect(gs(w).lives).toBe(3);
    killGrunt(w); // 149,850: past the first life threshold
    stepGame(w, DT, idle());
    expect(gs(w).score).toBe(149_850);
    expect(scoreOf(w).score).toBe(149_850);
    expect(gs(w).lives).toBe(4);
    expect(gs(w).bombs).toBe(3);
    killGrunt(w); // 199,800: past the first bomb threshold, short of the second life
    for (let i = 0; i < 12; i++) stepGame(w, DT, idle());
    expect(gs(w).lives).toBe(4);
    expect(gs(w).bombs).toBe(4);
    const last = huds[huds.length - 1];
    expect(last).toEqual({ lives: 4, bombs: 4, multiplier: 999 });
  });

  it('caps lives and bombs at 9 however far the score runs', () => {
    const w = ledgerEndless(5);
    for (let i = 0; i < 998; i++) simCollectGeom(w, spawn(w, Kind.Geom, 0, 0));
    for (let i = 0; i < 60; i++) {
      killGrunt(w); // 60 x 49,950 = 2,997,000
      stepGame(w, DT, idle());
    }
    expect(gs(w).score).toBe(2_997_000);
    expect(gs(w).lives).toBe(9);
    expect(gs(w).bombs).toBe(9);
    // Thresholds passed at the cap are consumed, so a lost life is not refunded at once.
    const run = gs(w).endless;
    expect(run?.nextLifeAt).toBe(3_000_000);
    expect(run?.nextBombAt).toBe(3_000_000);
  });

  it('awards nothing in Adventure mode', () => {
    const w = createGame(inlineRectLevel(3), { scoring: ledgerPort, vibrate: () => undefined });
    w.ship.invuln = 1e9;
    for (let i = 0; i < 998; i++) simCollectGeom(w, spawn(w, Kind.Geom, 0, 0));
    for (let i = 0; i < 5; i++) killGrunt(w);
    stepGame(w, DT, idle());
    expect(gs(w).lives).toBe(3);
    expect(gs(w).bombs).toBe(3);
  });
});
