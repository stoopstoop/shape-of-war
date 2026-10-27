import { describe, expect, it } from 'vitest';
import {
  MULTIPLIER_CAP,
  awardKill,
  baseValue,
  collectGeom,
  createScore,
  reduceScore,
  resetScore,
  scoreOf,
  shipDied,
  stars,
  type ScoreState,
} from '../../src/game/scoring';
import { Kind, createWorld, inlineRectLevel } from '../../src/game/world';

describe('base values (SPEC 3.6)', () => {
  const table: [Kind, number][] = [
    [Kind.Grunt, 50],
    [Kind.Wanderer, 10],
    [Kind.Weaver, 100],
    [Kind.Pinwheel, 25],
    [Kind.Dart, 30],
    [Kind.SnakeHead, 200],
    [Kind.Spawner, 150],
    [Kind.GravityWell, 250],
  ];
  for (const [kind, value] of table) {
    it(`kind ${kind} is worth ${value}`, () => {
      expect(baseValue(kind)).toBe(value);
      expect(reduceScore(createScore(), { type: 'kill', kind }).score).toBe(value);
    });
  }

  it('snake body, ship, geom and drone score nothing', () => {
    for (const k of [Kind.SnakeBody, Kind.Ship, Kind.Geom, Kind.Drone, Kind.None]) expect(baseValue(k)).toBe(0);
  });
});

describe('multiplier', () => {
  it('starts at 1 and grows by 1 per geom', () => {
    let s: ScoreState = createScore();
    expect(s.multiplier).toBe(1);
    s = reduceScore(s, { type: 'geom' });
    s = reduceScore(s, { type: 'geom' });
    expect(s.multiplier).toBe(3);
    s = reduceScore(s, { type: 'geom', count: 4 });
    expect(s.multiplier).toBe(7);
    expect(s.geoms).toBe(6);
  });

  it('scales the kill value', () => {
    let s = reduceScore(createScore(), { type: 'geom', count: 4 });
    s = reduceScore(s, { type: 'kill', kind: Kind.Weaver });
    expect(s.score).toBe(500);
  });

  it('resets to 1 on death and keeps the score', () => {
    let s = reduceScore(createScore(), { type: 'geom', count: 9 });
    s = reduceScore(s, { type: 'kill', kind: Kind.Grunt });
    s = reduceScore(s, { type: 'death' });
    expect(s.multiplier).toBe(1);
    expect(s.score).toBe(500);
  });

  it('caps at 999', () => {
    const s = reduceScore(createScore(), { type: 'geom', count: 5000 });
    expect(s.multiplier).toBe(MULTIPLIER_CAP);
  });

  it('the reducer does not mutate its input', () => {
    const s = createScore();
    reduceScore(s, { type: 'kill', kind: Kind.Grunt });
    expect(s).toEqual(createScore());
  });

  it('kills count only kinds that count toward destroy objectives', () => {
    let s = createScore();
    for (const kind of [Kind.Grunt, Kind.Dart, Kind.SnakeHead, Kind.GravityWell, Kind.SnakeBody]) {
      s = reduceScore(s, { type: 'kill', kind });
    }
    expect(s.kills).toBe(3);
  });
});

describe('world adapters', () => {
  it('awardKill returns points at the current multiplier and resets cleanly', () => {
    const w = createWorld(inlineRectLevel());
    expect(awardKill(w, Kind.Grunt)).toBe(50);
    expect(collectGeom(w, 2)).toBe(3);
    expect(awardKill(w, Kind.Dart)).toBe(90);
    expect(scoreOf(w).score).toBe(140);
    shipDied(w);
    expect(scoreOf(w).multiplier).toBe(1);
    resetScore(w);
    expect(scoreOf(w)).toEqual(createScore());
  });

  it('keeps worlds separate', () => {
    const a = createWorld(inlineRectLevel());
    const b = createWorld(inlineRectLevel());
    awardKill(a, Kind.Weaver);
    expect(scoreOf(b).score).toBe(0);
  });
});

describe('stars', () => {
  const par = 1000;
  it('0 just below par, 1 at par', () => {
    expect(stars(999, par)).toBe(0);
    expect(stars(1000, par)).toBe(1);
  });
  it('1 just below 2x, 2 at 2x', () => {
    expect(stars(1999, par)).toBe(1);
    expect(stars(2000, par)).toBe(2);
  });
  it('2 just below 4x, 3 at 4x and above', () => {
    expect(stars(3999, par)).toBe(2);
    expect(stars(4000, par)).toBe(3);
    expect(stars(1e9, par)).toBe(3);
  });
  it('0 for zero, negative or invalid par and NaN score', () => {
    expect(stars(5000, 0)).toBe(0);
    expect(stars(5000, -10)).toBe(0);
    expect(stars(Number.NaN, par)).toBe(0);
  });
});
