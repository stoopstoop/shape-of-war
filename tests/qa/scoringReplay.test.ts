// Scoring replay (docs/06 section 2.5, last row). A fixed log of 50 events (kills of every kind,
// geom pickups, deaths) is replayed through four paths and must land on the same hard coded numbers:
//   1. the pure reducer in src/game/scoring.ts,
//   2. Ledger's World adapters (awardKill, collectGeom, shipDied),
//   3. the real sim path (killEnemy, collectGeom, killShip) with Ledger's port wired in, as main.ts does,
//   4. the same sim path with Swarm's built in default port.
// The expected score and multiplier after every event were worked out by hand from SPEC 3.6
// (multiplier starts at 1, +1 per geom, reset to 1 on death, kill = base x multiplier). They were not
// produced by running the code under test.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { killEnemy, countsForDestroy } from '../../src/game/combat';
import { createGame, gameState, stepGame } from '../../src/game/game';
import { collectGeom as simCollectGeom } from '../../src/game/geoms';
import { killShip } from '../../src/game/player';
import { respawnShip } from '../../src/game/ship';
import {
  MULTIPLIER_CAP,
  awardKill,
  baseValue,
  collectGeom,
  countsAsKill,
  createScore,
  reduceScore,
  scoreOf,
  shipDied,
} from '../../src/game/scoring';
import type { GameEvent, ScoreState } from '../../src/game/scoring';
import { MULTIPLIER_CAP as SWARM_MULTIPLIER_CAP, defaultScoring, scoreBase } from '../../src/game/state';
import type { ScoringPort } from '../../src/game/state';
import { Kind, createWorld, inlineRectLevel, spawn } from '../../src/game/world';
import type { World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';

const K = (kind: Kind): GameEvent => ({ type: 'kill', kind });
const G = (count: number): GameEvent => ({ type: 'geom', count });
const DEATH: GameEvent = { type: 'death' };

/** [event, score after, multiplier after]. */
type Row = readonly [GameEvent, number, number];

const LOG: readonly Row[] = [
  [K(Kind.Grunt), 50, 1], // 1: 50 x 1
  [K(Kind.Wanderer), 60, 1], // 2: 10 x 1
  [G(1), 60, 2], // 3
  [K(Kind.Grunt), 160, 2], // 4: 50 x 2
  [G(1), 160, 3], // 5
  [G(1), 160, 4], // 6
  [K(Kind.Weaver), 560, 4], // 7: 100 x 4
  [K(Kind.Pinwheel), 660, 4], // 8: 25 x 4
  [G(2), 660, 6], // 9
  [K(Kind.Dart), 840, 6], // 10: 30 x 6
  [K(Kind.SnakeBody), 840, 6], // 11: segments score nothing
  [K(Kind.SnakeHead), 2040, 6], // 12: 200 x 6
  [G(1), 2040, 7], // 13
  [K(Kind.Spawner), 3090, 7], // 14: 150 x 7
  [K(Kind.GravityWell), 4840, 7], // 15: 250 x 7, not a destroy kill
  [DEATH, 4840, 1], // 16
  [K(Kind.Grunt), 4890, 1], // 17
  [G(3), 4890, 4], // 18
  [K(Kind.Grunt), 5090, 4], // 19: 50 x 4
  [K(Kind.Wanderer), 5130, 4], // 20: 10 x 4
  [G(1), 5130, 5], // 21
  [K(Kind.Weaver), 5630, 5], // 22: 100 x 5
  [K(Kind.Dart), 5780, 5], // 23: 30 x 5
  [K(Kind.Dart), 5930, 5], // 24
  [K(Kind.Dart), 6080, 5], // 25
  [G(1), 6080, 6], // 26
  [K(Kind.Pinwheel), 6230, 6], // 27: 25 x 6
  [K(Kind.SnakeHead), 7430, 6], // 28: 200 x 6
  [G(0), 7430, 6], // 29: an empty pickup changes nothing
  [K(Kind.Drone), 7430, 6], // 30: drones score nothing
  [G(1), 7430, 7], // 31
  [K(Kind.Grunt), 7780, 7], // 32: 50 x 7
  [K(Kind.Grunt), 8130, 7], // 33
  [K(Kind.Wanderer), 8200, 7], // 34: 10 x 7
  [DEATH, 8200, 1], // 35
  [DEATH, 8200, 1], // 36: a second death in a row is harmless
  [K(Kind.Grunt), 8250, 1], // 37
  [G(1), 8250, 2], // 38
  [K(Kind.Weaver), 8450, 2], // 39: 100 x 2
  [K(Kind.Pinwheel), 8500, 2], // 40: 25 x 2
  [G(4), 8500, 6], // 41
  [K(Kind.Spawner), 9400, 6], // 42: 150 x 6
  [K(Kind.SnakeHead), 10600, 6], // 43: 200 x 6
  [G(1), 10600, 7], // 44
  [K(Kind.Dart), 10810, 7], // 45: 30 x 7
  [K(Kind.Wanderer), 10880, 7], // 46: 10 x 7
  [K(Kind.Grunt), 11230, 7], // 47: 50 x 7
  [G(1), 11230, 8], // 48
  [K(Kind.Weaver), 12030, 8], // 49: 100 x 8
  [K(Kind.Grunt), 12430, 8], // 50: 50 x 8
];

const FINAL_SCORE = 12430;
const FINAL_MULTIPLIER = 8;
/** Kills with a base value above zero, wells excluded: counted by hand from LOG. */
const FINAL_KILLS = 30;
/** Sum of the geom counts in LOG (1+1+1+2+1+3+1+1+0+1+1+4+1+1). */
const FINAL_GEOMS = 19;

const ALL_KINDS: readonly Kind[] = [
  Kind.None,
  Kind.Ship,
  Kind.Grunt,
  Kind.Wanderer,
  Kind.Weaver,
  Kind.Pinwheel,
  Kind.Dart,
  Kind.SnakeHead,
  Kind.SnakeBody,
  Kind.GravityWell,
  Kind.Spawner,
  Kind.Geom,
  Kind.Drone,
];

/**
 * Mirror of the scoring port glue in src/main.ts line 34 (Ledger's scoring behind Swarm's
 * ScoringPort), including the `multiplier` getter added with 5bef4ae. The real constant is private to
 * the DOM boot module (QA-004), so this copy can drift: if main.ts changes the port, change it here.
 */
const LEDGER_PORT: ScoringPort = {
  awardKill,
  collectGeom: (w: World): void => {
    collectGeom(w);
  },
  resetMultiplier: shipDied,
  multiplier: (w: World): number => scoreOf(w).multiplier,
};

/** The port as it stood before the getter existed: Swarm must fall back to its own counter. */
const LEDGER_PORT_NO_GETTER: ScoringPort = {
  awardKill: LEDGER_PORT.awardKill,
  collectGeom: LEDGER_PORT.collectGeom,
  resetMultiplier: LEDGER_PORT.resetMultiplier,
};

function freshWorld(port?: ScoringPort): World {
  return createGame(inlineRectLevel(7), port === undefined ? { vibrate: () => undefined } : { scoring: port, vibrate: () => undefined });
}

/** Drive one event through the real sim entry points. */
function applyViaSim(w: World, e: GameEvent): void {
  switch (e.type) {
    case 'kill': {
      const id = spawn(w, e.kind, 100, 0);
      killEnemy(w, id, true);
      return;
    }
    case 'geom':
      for (let i = 0; i < (e.count ?? 1); i++) simCollectGeom(w, spawn(w, Kind.Geom, 0, 0));
      return;
    case 'death':
      respawnShip(w);
      killShip(w);
      return;
    case 'reset':
      return;
  }
}

describe('scoring replay: the log itself', () => {
  it('has 50 events and the hand worked cumulative numbers are internally consistent', () => {
    expect(LOG).toHaveLength(50);
    expect(LOG[LOG.length - 1]?.[1]).toBe(FINAL_SCORE);
    expect(LOG[LOG.length - 1]?.[2]).toBe(FINAL_MULTIPLIER);
    const geoms = LOG.reduce((n, [e]) => n + (e.type === 'geom' ? (e.count ?? 1) : 0), 0);
    expect(geoms).toBe(FINAL_GEOMS);
    // Scores never fall, and only a death lowers the multiplier.
    let prevScore = 0;
    let prevMult = 1;
    for (const [e, score, mult] of LOG) {
      expect(score).toBeGreaterThanOrEqual(prevScore);
      if (e.type !== 'death') expect(mult).toBeGreaterThanOrEqual(prevMult);
      prevScore = score;
      prevMult = mult;
    }
  });
});

describe('scoring replay: pure reducer', () => {
  it('matches the hand worked score and multiplier after every event', () => {
    let s = createScore();
    LOG.forEach(([event, score, mult], i) => {
      s = reduceScore(s, event);
      expect(s.score, `score after event ${i + 1}`).toBe(score);
      expect(s.multiplier, `multiplier after event ${i + 1}`).toBe(mult);
    });
    expect(s).toEqual({ score: FINAL_SCORE, multiplier: FINAL_MULTIPLIER, kills: FINAL_KILLS, geoms: FINAL_GEOMS });
  });

  it('never mutates the state it is given', () => {
    const start: ScoreState = Object.freeze({ score: 100, multiplier: 3, kills: 1, geoms: 2 });
    for (const [event] of LOG) expect(() => reduceScore(start, event)).not.toThrow();
    expect(start).toEqual({ score: 100, multiplier: 3, kills: 1, geoms: 2 });
  });

  it('replaying the same log twice gives the same result', () => {
    const run = (): ScoreState => LOG.reduce<ScoreState>((s, [e]) => reduceScore(s, e), createScore());
    expect(run()).toEqual(run());
  });
});

describe('scoring replay: Ledger world adapters', () => {
  it('awardKill, collectGeom and shipDied land on the same numbers', () => {
    const w = createWorld(inlineRectLevel(7));
    let total = 0;
    LOG.forEach(([e, score, mult], i) => {
      if (e.type === 'kill') total += awardKill(w, e.kind);
      else if (e.type === 'geom') collectGeom(w, e.count ?? 1);
      else if (e.type === 'death') shipDied(w);
      expect(scoreOf(w).score, `score after event ${i + 1}`).toBe(score);
      expect(scoreOf(w).multiplier, `multiplier after event ${i + 1}`).toBe(mult);
    });
    expect(total).toBe(FINAL_SCORE);
    expect(scoreOf(w)).toEqual({ score: FINAL_SCORE, multiplier: FINAL_MULTIPLIER, kills: FINAL_KILLS, geoms: FINAL_GEOMS });
  });
});

describe('scoring replay: real sim path with Ledger port (as wired in main.ts)', () => {
  it('Swarm and Ledger agree on score at every event, and on the final kills', () => {
    const w = freshWorld(LEDGER_PORT);
    LOG.forEach(([event, score, mult], i) => {
      applyViaSim(w, event);
      expect(gameState(w).score, `Swarm score after event ${i + 1}`).toBe(score);
      expect(scoreOf(w).score, `Ledger score after event ${i + 1}`).toBe(score);
      expect(scoreOf(w).multiplier, `Ledger multiplier after event ${i + 1}`).toBe(mult);
    });
    expect(gameState(w).kills).toBe(FINAL_KILLS);
    expect(scoreOf(w).kills).toBe(FINAL_KILLS);
    expect(scoreOf(w).geoms).toBe(FINAL_GEOMS);
  });
});

describe('scoring replay: real sim path with Swarm default port', () => {
  it('the built in rules land on the same numbers', () => {
    const w = freshWorld();
    LOG.forEach(([event, score, mult], i) => {
      applyViaSim(w, event);
      expect(gameState(w).score, `score after event ${i + 1}`).toBe(score);
      expect(gameState(w).multiplier, `multiplier after event ${i + 1}`).toBe(mult);
    });
    expect(gameState(w).kills).toBe(FINAL_KILLS);
  });
});

describe('scoring rules agree between Swarm (state.ts, combat.ts) and Ledger (scoring.ts)', () => {
  it('base value is the same for every kind', () => {
    for (const k of ALL_KINDS) expect(baseValue(k), `kind ${k}`).toBe(scoreBase(k));
  });

  it('the same kinds count toward a destroy objective', () => {
    for (const k of ALL_KINDS) expect(countsAsKill(k), `kind ${k}`).toBe(countsForDestroy(k));
  });

  it('both cap the multiplier at 999 after 1500 geoms', () => {
    expect(MULTIPLIER_CAP).toBe(999);
    expect(SWARM_MULTIPLIER_CAP).toBe(999);
    const ledger = freshWorld(LEDGER_PORT);
    const swarm = freshWorld();
    for (let i = 0; i < 1500; i++) {
      LEDGER_PORT.collectGeom(ledger);
      defaultScoring.collectGeom(swarm);
    }
    expect(scoreOf(ledger).multiplier).toBe(999);
    expect(gameState(swarm).multiplier).toBe(999);
    expect(LEDGER_PORT.awardKill(ledger, Kind.Grunt)).toBe(50 * 999);
    expect(defaultScoring.awardKill(swarm, Kind.Grunt)).toBe(50 * 999);
  });

  it('a bomb clear scores nothing on either port (unscored removal)', () => {
    for (const port of [LEDGER_PORT, undefined]) {
      const w = freshWorld(port);
      const id = spawn(w, Kind.Grunt, 100, 0);
      killEnemy(w, id, false);
      expect(gameState(w).score).toBe(0);
      expect(gameState(w).kills).toBe(0);
      expect(w.alive[id]).toBe(0);
    }
  });
});

const IDLE: InputState = {
  move: { active: false, x: 0, y: 0 },
  aim: { active: false, x: 0, y: 0 },
  bomb: false,
  superPressed: false,
  pause: false,
};

/** Multipliers carried by every hud:score the sim emits over 0.5 s of stepping, after 5 geoms were picked up. */
function hudMultipliersAfterFiveGeoms(port?: ScoringPort): { emitted: number[]; world: World } {
  const w = freshWorld(port);
  for (let i = 0; i < 5; i++) simCollectGeom(w, spawn(w, Kind.Geom, 0, 0));
  const emitted: number[] = [];
  bus.on('hud:score', (p) => emitted.push(p.multiplier));
  for (let i = 0; i < 60; i++) stepGame(w, 1 / 120, IDLE);
  return { emitted, world: w };
}

describe('hud:score emitted by the sim', () => {
  afterEach(() => bus.clear());

  it('with the default port, carries the true multiplier', () => {
    const { emitted } = hudMultipliersAfterFiveGeoms();
    expect(emitted.length).toBeGreaterThan(0);
    for (const m of emitted) expect(m).toBe(6);
  });

  // Finding QA-003 (docs/qa/bugs.md), fixed by be857ca and 5bef4ae: emitHud used to send Swarm's own
  // g.multiplier, which stayed 1 under Ledger's port, while main.ts sent Ledger's value on the same
  // 'hud:score' channel, so x1 could flash. Now emitHud asks the port (currentMultiplier) first.
  it('with Ledger port, carries the multiplier Ledger shows (QA-003 regression)', () => {
    const { emitted, world } = hudMultipliersAfterFiveGeoms(LEDGER_PORT);
    expect(scoreOf(world).multiplier).toBe(6);
    expect(emitted.length).toBeGreaterThan(0);
    for (const m of emitted) expect(m).toBe(6);
  });

  it('a port without the getter still never shows a stale x1 (Swarm keeps its own count)', () => {
    const { emitted } = hudMultipliersAfterFiveGeoms(LEDGER_PORT_NO_GETTER);
    expect(emitted.length).toBeGreaterThan(0);
    for (const m of emitted) expect(m).toBe(6);
  });

  it('when a port has a getter, the getter value is what hud:score carries', () => {
    const w = freshWorld({ ...LEDGER_PORT, multiplier: () => 42 });
    const emitted: number[] = [];
    bus.on('hud:score', (p) => emitted.push(p.multiplier));
    for (let i = 0; i < 60; i++) stepGame(w, 1 / 120, IDLE);
    expect(emitted.length).toBeGreaterThan(0);
    for (const m of emitted) expect(m).toBe(42);
  });
});
