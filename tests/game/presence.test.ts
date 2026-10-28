// Bus events for music and map effects (docs/10 wave C, Appendix B): sim:enemyEnter,
// sim:enemyExit, sim:threat.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import type { EnemyKind } from '../../src/levelgen/leveldef';
import { killEnemy } from '../../src/game/combat';
import * as charger from '../../src/game/enemies/charger';
import * as grunt from '../../src/game/enemies/grunt';
import * as mine from '../../src/game/enemies/mine';
import * as slime from '../../src/game/enemies/slime';
import * as splime from '../../src/game/enemies/splime';
import { killShip, triggerBomb } from '../../src/game/player';
import {
  enemyKindOf,
  stepPresence,
  THREAT_INTERVAL,
  threatLevel,
  threatWeight,
} from '../../src/game/presence';
import { stepGame } from '../../src/game/game';
import { spawnFromDef } from '../../src/game/state';
import { Kind } from '../../src/game/world';
import { DT, idle, makeGame, put } from './helpers';

afterEach(() => bus.clear());

interface Log {
  enter: { kind: EnemyKind; live: number }[];
  exit: EnemyKind[];
  threat: number[];
}

function listen(): Log {
  const log: Log = { enter: [], exit: [], threat: [] };
  bus.on('sim:enemyEnter', (e) => log.enter.push({ kind: e.kind, live: e.live }));
  bus.on('sim:enemyExit', (e) => log.exit.push(e.kind));
  bus.on('sim:threat', (e) => log.threat.push(e.level));
  return log;
}

describe('weights and names', () => {
  it('match the plan table', () => {
    const table: [Kind, number][] = [
      [Kind.Grunt, 1],
      [Kind.Wanderer, 0.5],
      [Kind.Weaver, 1.5],
      [Kind.Pinwheel, 0.8],
      [Kind.Dart, 0.4],
      [Kind.SnakeHead, 3],
      [Kind.Charger, 2],
      [Kind.Bulwark, 2.5],
      [Kind.Blink, 2],
      [Kind.Swirl, 1.5],
      [Kind.Sower, 3],
      [Kind.Splime, 2],
      [Kind.Mine, 0.2],
      [Kind.Slime, 0],
      [Kind.GravityWell, 0.5],
      [Kind.Spawner, 1],
      [Kind.SnakeBody, 0],
      [Kind.Geom, 0],
      [Kind.Drone, 0],
    ];
    for (const [k, v] of table) expect(threatWeight(k)).toBe(v);
  });

  it('hazards, wells, spawners and segments have no EnemyKind', () => {
    for (const k of [Kind.Mine, Kind.Slime, Kind.GravityWell, Kind.Spawner, Kind.SnakeBody, Kind.Geom, Kind.Drone]) {
      expect(enemyKindOf(k)).toBeNull();
    }
    expect(enemyKindOf(Kind.Splime)).toBe('splime');
    expect(enemyKindOf(Kind.SnakeHead)).toBe('snake');
  });

  it('threat level clamps to [0, 1]', () => {
    expect(threatLevel(0)).toBe(0);
    expect(threatLevel(20)).toBe(0.5);
    expect(threatLevel(40)).toBe(1);
    expect(threatLevel(400)).toBe(1);
    expect(threatLevel(-3)).toBe(0);
  });
});

describe('enter and exit', () => {
  it('enter on 0 to 1 with the live count, exit on the last removal only', () => {
    const { w } = makeGame();
    const log = listen();
    const a = put(w, charger.def, 300, 0);
    const b = put(w, charger.def, -300, 0);
    stepPresence(w, DT);
    expect(log.enter).toEqual([{ kind: 'charger', live: 2 }]);
    killEnemy(w, a, false);
    stepPresence(w, DT);
    expect(log.exit).toEqual([]);
    killEnemy(w, b, true);
    stepPresence(w, DT);
    expect(log.exit).toEqual(['charger']);
    put(w, charger.def, 0, 300);
    stepPresence(w, DT);
    expect(log.enter).toHaveLength(2);
  });

  it('a telegraphing entity does not enter until its telegraph ends in play', () => {
    const { w } = makeGame();
    const log = listen();
    spawnFromDef(w, splime.def, 400, 0, 0.6);
    const input = idle();
    for (let i = 0; i < 70; i++) stepGame(w, DT, input);
    expect(log.enter).toHaveLength(0);
    for (let i = 0; i < 6; i++) stepGame(w, DT, input);
    expect(log.enter).toEqual([{ kind: 'splime', live: 1 }]);
  });

  it('bomb and death clear emit one exit per kind', () => {
    const { w } = makeGame();
    const log = listen();
    put(w, grunt.def, 300, 0);
    put(w, grunt.def, 300, 100);
    put(w, splime.def, -300, 0);
    stepPresence(w, DT);
    expect(log.enter.map((e) => e.kind).sort()).toEqual(['grunt', 'splime']);
    triggerBomb(w);
    stepPresence(w, DT);
    expect(log.exit.sort()).toEqual(['grunt', 'splime']);
    put(w, charger.def, 300, 0);
    stepPresence(w, DT);
    killShip(w);
    stepPresence(w, DT);
    expect(log.exit).toContain('charger');
  });

  it('Mine and Slime never emit enter or exit', () => {
    const { w } = makeGame();
    const log = listen();
    const m = put(w, mine.def, 300, 0);
    const s = put(w, slime.def, -300, 0);
    stepPresence(w, DT);
    killEnemy(w, m, true);
    killEnemy(w, s, false);
    stepPresence(w, DT);
    expect(log.enter).toEqual([]);
    expect(log.exit).toEqual([]);
  });
});

describe('threat', () => {
  it('emits at most every 100 ms', () => {
    const { w } = makeGame();
    const log = listen();
    put(w, grunt.def, 300, 0);
    const at: number[] = [];
    for (let i = 0; i < 120; i++) {
      const n = log.threat.length;
      stepPresence(w, DT);
      if (log.threat.length > n) at.push(i);
    }
    expect(log.threat.length).toBe(10);
    for (let k = 1; k < at.length; k++) expect(((at[k] ?? 0) - (at[k - 1] ?? 0)) * DT).toBeGreaterThanOrEqual(THREAT_INTERVAL - 1e-9);
    expect(THREAT_INTERVAL).toBe(0.1);
    const b = makeGame().w;
    const before = log.threat.length;
    for (let i = 0; i < 60; i++) stepPresence(b, 1 / 60);
    expect(log.threat.length - before).toBe(10);
  });

  it('is the weighted live sum over 40, clamped, ignoring telegraphs and Slime', () => {
    const { w } = makeGame();
    const log = listen();
    put(w, grunt.def, 300, 0); // 1
    put(w, splime.def, -300, 0); // 2
    put(w, mine.def, 0, 300); // 0.2
    put(w, slime.def, 0, -300); // 0
    spawnFromDef(w, charger.def, 200, 200, 0.6); // telegraphing: 0
    stepPresence(w, DT);
    expect(log.threat[0]).toBeCloseTo(3.2 / 40, 9);
    for (let i = 0; i < 60; i++) put(w, charger.def, -600 + i * 20, 400);
    for (let i = 0; i < 12; i++) stepPresence(w, DT);
    expect(log.threat[log.threat.length - 1]).toBe(1);
  });
});
