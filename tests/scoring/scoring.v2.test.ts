// v2 addendum SPEC 3.6: base values for the six new enemies and the two hazards.
import { describe, expect, it } from 'vitest';
import { defOf } from '../../src/game/defs';
import { baseValue, countsAsKill, createScore, reduceScore } from '../../src/game/scoring';
import { scoreBase } from '../../src/game/state';
import { Kind } from '../../src/game/world';

const TABLE: [Kind, number, number][] = [
  // kind, base value, geoms
  [Kind.Charger, 120, 2],
  [Kind.Bulwark, 150, 3],
  [Kind.Blink, 130, 2],
  [Kind.Swirl, 80, 1],
  [Kind.Sower, 180, 3],
  [Kind.Splime, 140, 2],
  [Kind.Mine, 0, 0],
  [Kind.Slime, 0, 0],
];

describe('v2 base values', () => {
  for (const [kind, value, geoms] of TABLE) {
    it(`kind ${kind} is worth ${value} with ${geoms} geoms`, () => {
      expect(baseValue(kind)).toBe(value);
      expect(scoreBase(kind)).toBe(value);
      expect(defOf(kind)?.value).toBe(value);
      expect(defOf(kind)?.geoms).toBe(geoms);
      expect(reduceScore(createScore(), { type: 'kill', kind }).score).toBe(value);
    });
  }

  it('the six enemies count as kills, Mine and Slime do not', () => {
    for (const [kind, value] of TABLE) {
      expect(countsAsKill(kind)).toBe(value > 0);
      expect(reduceScore(createScore(), { type: 'kill', kind }).kills).toBe(value > 0 ? 1 : 0);
    }
  });

  it('the v1 table is unchanged through the shared lookup', () => {
    const v1: [Kind, number][] = [
      [Kind.Grunt, 50],
      [Kind.Wanderer, 10],
      [Kind.Weaver, 100],
      [Kind.Pinwheel, 25],
      [Kind.Dart, 30],
      [Kind.SnakeHead, 200],
      [Kind.Spawner, 150],
      [Kind.GravityWell, 250],
      [Kind.SnakeBody, 0],
      [Kind.Geom, 0],
      [Kind.WeaponPickup, 0],
    ];
    for (const [k, v] of v1) expect(scoreBase(k)).toBe(v);
  });

  it('multiplier scales v2 kills', () => {
    const s = reduceScore(reduceScore(createScore(), { type: 'geom', count: 4 }), { type: 'kill', kind: Kind.Sower });
    expect(s.score).toBe(900);
  });
});
