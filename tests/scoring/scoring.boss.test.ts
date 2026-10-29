// Boss scoring (docs/13 SPEC 3.6): a flat bonus of 25 percent of par rounded half up to the nearest
// 500, never multiplied; Endless pays 5000 x tier (Fable ruling 1). The boss counts one kill for a
// destroy objective; parts and hazards count 0 and score 0.
import { describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { bossBonusAwarded, damageBoss } from '../../src/game/bosses/core';
import { stepGame } from '../../src/game/game';
import {
  awardKill,
  baseValue,
  bonusPoints,
  bossBonus,
  collectGeom,
  countsAsKill,
  createScore,
  reduceScore,
  scoreOf,
  shipDied,
} from '../../src/game/scoring';
import { gs, type ScoringPort } from '../../src/game/state';
import { createWorld, Kind, type World } from '../../src/game/world';
import { bossGame, enter, park } from '../game/bossHelpers';
import { DT, idle, quietLevel } from '../game/helpers';

describe('boss bonus', () => {
  it('is 25 percent of par rounded half up to 500', () => {
    expect(bossBonus(10000, 'adventure', 1)).toBe(2500);
    expect(bossBonus(1000, 'adventure', 1)).toBe(500); // 250 is exactly half: rounds up
    expect(bossBonus(999, 'adventure', 1)).toBe(0); // 249.75 rounds down
    expect(bossBonus(9000, 'adventure', 2)).toBe(2500); // 2250 is half: up
    expect(bossBonus(8999, 'adventure', 2)).toBe(2000);
    expect(bossBonus(23456, 'adventure', 3)).toBe(6000); // 5864 rounds to 6000
    for (let par = 0; par <= 50000; par += 1234) expect(bossBonus(par, 'adventure', 1) % 500).toBe(0);
  });

  it('is 0 for a missing or bad par, and 5000 x tier in Endless', () => {
    expect(bossBonus(0, 'adventure', 1)).toBe(0);
    expect(bossBonus(-5, 'adventure', 1)).toBe(0);
    expect(bossBonus(Number.NaN, 'adventure', 1)).toBe(0);
    expect(bossBonus(0, 'endless', 1)).toBe(5000);
    expect(bossBonus(0, 'endless', 4)).toBe(20000);
  });

  it('does not depend on the multiplier: it is a flat value', () => {
    expect(bossBonus(10000, 'adventure', 1)).toBe(bossBonus(10000, 'adventure', 1));
    expect(baseValue(Kind.Boss)).toBe(0);
  });
});

describe('boss kills', () => {
  it('the boss counts 1 kill for destroy, parts and hazards 0', () => {
    expect(countsAsKill(Kind.Boss)).toBe(true);
    expect(countsAsKill(Kind.BossPart)).toBe(false);
    expect(countsAsKill(Kind.BossHazard)).toBe(false);
    expect(baseValue(Kind.BossPart)).toBe(0);
    expect(baseValue(Kind.BossHazard)).toBe(0);
  });

  it('the reducer adds one kill and no points for the boss at any multiplier', () => {
    const s = { ...createScore(), multiplier: 37, score: 100 };
    const n = reduceScore(s, { type: 'kill', kind: Kind.Boss });
    expect(n.kills).toBe(1);
    expect(n.score).toBe(100);
    const p = reduceScore(s, { type: 'kill', kind: Kind.BossPart });
    expect(p.kills).toBe(0);
    expect(p.score).toBe(100);
  });
});

describe('boss kill bonus through the port (run 0262)', () => {
  it('the reducer adds an unmultiplied bonus on top of the kill', () => {
    const s = { ...createScore(), multiplier: 37, score: 100 };
    const n = reduceScore(s, { type: 'kill', kind: Kind.Boss, bonus: 2500 });
    expect(n.kills).toBe(1);
    expect(n.score).toBe(2600);
    expect(n.multiplier).toBe(37);
    const g = reduceScore(s, { type: 'kill', kind: Kind.Grunt, bonus: 10 });
    expect(g.score).toBe(100 + 50 * 37 + 10);
  });

  it('bonusPoints clamps absent, negative and non finite bonuses to 0', () => {
    expect(bonusPoints(undefined)).toBe(0);
    expect(bonusPoints(-500)).toBe(0);
    expect(bonusPoints(Number.NaN)).toBe(0);
    expect(bonusPoints(Number.POSITIVE_INFINITY)).toBe(0);
    expect(bonusPoints(2500)).toBe(2500);
    expect(bonusPoints(2500.7)).toBe(2500);
  });

  it('awardKill records the bonus in Ledger but returns the kill points only', () => {
    const w = createWorld(quietLevel());
    collectGeom(w, 4); // multiplier 5
    expect(awardKill(w, Kind.Boss, 2500)).toBe(0);
    expect(scoreOf(w).score).toBe(2500);
    expect(scoreOf(w).kills).toBe(1);
    expect(awardKill(w, Kind.Grunt)).toBe(250);
    expect(scoreOf(w).score).toBe(2750);
    expect(scoreOf(w).kills).toBe(2);
  });
});

describe('the sim sends the boss kill and bonus to the port', () => {
  const ledger: ScoringPort = {
    awardKill,
    collectGeom: (w: World): void => {
      collectGeom(w);
    },
    resetMultiplier: shipDied,
    multiplier: (w: World): number => scoreOf(w).multiplier,
  };

  for (const port of ['ledger', 'default'] as const) {
    it(`${port} port: sim score, kills and Ledger agree after the kill, game:over once`, () => {
      const overs: number[] = [];
      bus.on('game:over', (p) => overs.push(p.score));
      const w = bossGame('spindle', { objective: { kind: 'survive', durationSec: 900 }, par: 10000 }, port === 'ledger' ? { scoring: ledger } : {});
      park(w, 600, 400);
      enter(w);
      const g = gs(w);
      const sim0 = g.score;
      const kills0 = g.kills;
      const l0 = scoreOf(w);
      expect(damageBoss(w, 99999, 0, 0)).toBe(true);
      expect(g.score - sim0).toBe(2500);
      expect(g.kills - kills0).toBe(1);
      expect(bossBonusAwarded(w)).toBe(2500);
      if (port === 'ledger') {
        expect(scoreOf(w).score - l0.score).toBe(2500);
        expect(scoreOf(w).kills - l0.kills).toBe(1);
        expect(scoreOf(w).score).toBe(g.score);
      }
      stepGame(w, DT, idle());
      expect(g.outcome).toBe('won');
      expect(overs).toEqual([g.score]);
      bus.clear();
    });
  }
});
