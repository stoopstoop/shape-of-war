// Scoring (SPEC 3.6, docs/01 sections 1 and 5, docs/03 section 1). The rules are a pure reducer
// over GameEvent on a plain ScoreState object. awardKill, collectGeom and shipDied are thin
// wrappers that keep one ScoreState per World until World carries the field itself.
import { Kind, type World } from './world';

export const MULTIPLIER_CAP = 999;

export interface ScoreState {
  score: number;
  /** 1 to MULTIPLIER_CAP. */
  multiplier: number;
  /** Kills that count toward a destroy objective (docs/01 section 8). */
  kills: number;
  /** Geoms collected this level. */
  geoms: number;
}

export type GameEvent =
  | { type: 'kill'; kind: Kind }
  | { type: 'geom'; count?: number }
  | { type: 'death' }
  | { type: 'reset' };

/**
 * Pure: base score per kind. SPEC 3.6 values, plus Gravity well 250 from docs/01 section 6.2
 * (shot down only). Snake body, ship, geoms and drones score nothing.
 */
export function baseValue(kind: Kind): number {
  switch (kind) {
    case Kind.Grunt:
      return 50;
    case Kind.Wanderer:
      return 10;
    case Kind.Weaver:
      return 100;
    case Kind.Pinwheel:
      return 25;
    case Kind.Dart:
      return 30;
    case Kind.SnakeHead:
      return 200;
    case Kind.Spawner:
      return 150;
    case Kind.GravityWell:
      return 250;
    default:
      return 0;
  }
}

/** Pure: true if the kill counts toward a destroy objective (wells and segments do not). */
export function countsAsKill(kind: Kind): boolean {
  return kind !== Kind.GravityWell && baseValue(kind) > 0;
}

export function createScore(): ScoreState {
  return { score: 0, multiplier: 1, kills: 0, geoms: 0 };
}

/** Pure: points a kill of `kind` is worth at the given multiplier. */
export function killPoints(kind: Kind, multiplier: number): number {
  return baseValue(kind) * multiplier;
}

/** Pure reducer. Returns a new state; the input is never mutated. */
export function reduceScore(s: Readonly<ScoreState>, e: GameEvent): ScoreState {
  switch (e.type) {
    case 'kill':
      return {
        ...s,
        score: s.score + killPoints(e.kind, s.multiplier),
        kills: s.kills + (countsAsKill(e.kind) ? 1 : 0),
      };
    case 'geom': {
      const n = Math.max(0, Math.floor(e.count ?? 1));
      return { ...s, geoms: s.geoms + n, multiplier: Math.min(MULTIPLIER_CAP, s.multiplier + n) };
    }
    case 'death':
      return { ...s, multiplier: 1 };
    case 'reset':
      return createScore();
  }
}

/** Pure: 0 below par, 1 at par, 2 at 2x par, 3 at 4x par. A non positive par gives 0. */
export function stars(score: number, par: number): 0 | 1 | 2 | 3 {
  if (!(par > 0) || !Number.isFinite(score)) return 0;
  if (score >= 4 * par) return 3;
  if (score >= 2 * par) return 2;
  if (score >= par) return 1;
  return 0;
}

// World adapters. One ScoreState per World, held outside the typed arrays so world.ts needs no
// change. Swarm calls these from collisions, geom pickup and ship death.

const scores = new WeakMap<World, ScoreState>();

/** The live ScoreState for a world, created on first use. */
export function scoreOf(w: World): ScoreState {
  let s = scores.get(w);
  if (s === undefined) {
    s = createScore();
    scores.set(w, s);
  }
  return s;
}

function apply(w: World, e: GameEvent): ScoreState {
  const next = reduceScore(scoreOf(w), e);
  scores.set(w, next);
  return next;
}

/** Score a kill at the current multiplier. Returns the points awarded. */
export function awardKill(w: World, kind: Kind): number {
  const before = scoreOf(w).score;
  return apply(w, { type: 'kill', kind }).score - before;
}

/** Geom pickup: multiplier +1 per geom, capped. Returns the new multiplier. */
export function collectGeom(w: World, count = 1): number {
  return apply(w, { type: 'geom', count }).multiplier;
}

/** Ship death: multiplier back to 1. */
export function shipDied(w: World): void {
  apply(w, { type: 'death' });
}

/** Fresh score for a world (level start or retry). */
export function resetScore(w: World): void {
  apply(w, { type: 'reset' });
}
