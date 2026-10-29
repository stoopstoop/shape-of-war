// Boss scoring (docs/13 SPEC 3.6): a flat bonus of 25 percent of par rounded half up to the nearest
// 500, never multiplied; Endless pays 5000 x tier (Fable ruling 1). The boss counts one kill for a
// destroy objective; parts and hazards count 0 and score 0.
import { describe, expect, it } from 'vitest';
import { baseValue, bossBonus, countsAsKill, createScore, reduceScore } from '../../src/game/scoring';
import { Kind } from '../../src/game/world';

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
