// V2 hazards and the Splime (docs/10 wave C, docs/11 SPEC 3.4 rule 7): Mine, Splime, Slime, plus
// the Bulwark shield against orbit blades.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { spawnBullet } from '../../src/game/bullets';
import { rebuild } from '../../src/game/collide';
import { bulletHits, countsForDestroy, isTargetable, killEnemy, orbitHits, shipHits } from '../../src/game/combat';
import { stepDrone } from '../../src/game/drones';
import * as bulwark from '../../src/game/enemies/bulwark';
import * as well from '../../src/game/enemies/gravitywell';
import * as mine from '../../src/game/enemies/mine';
import * as slime from '../../src/game/enemies/slime';
import * as splime from '../../src/game/enemies/splime';
import { stepGame } from '../../src/game/game';
import { triggerBomb } from '../../src/game/player';
import { baseValue, countsAsKill } from '../../src/game/scoring';
import { SHIP_SPEED } from '../../src/game/ship';
import { gs, spawnFromDef } from '../../src/game/state';
import { detonate } from '../../src/game/supers';
import { equipWeapon } from '../../src/game/weapons';
import { Kind, type World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import { DT, dist, idle, makeGame, put } from './helpers';

afterEach(() => bus.clear());

function countKind(w: World, k: Kind): number {
  let n = 0;
  for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && w.kind[i] === k) n++;
  return n;
}

function addWell(w: World, x: number, y: number): number {
  const id = spawnFromDef(w, well.def, x, y, 0);
  const g = gs(w);
  g.wellIds[g.wellCount++] = id;
  return id;
}

describe('mine', () => {
  it('has the plan stats', () => {
    expect(mine.def).toMatchObject({ kind: Kind.Mine, radius: 9, speed: 0, value: 0, hp: 1, geoms: 0 });
  });

  it('arms after 0.8 s: harmless before, kills the ship after', () => {
    const { w } = makeGame();
    const id = put(w, mine.def, 12, 0);
    for (let i = 0; i < 95; i++) {
      mine.step(w, id, DT);
      expect(shipHits(w)).toBe(false);
    }
    expect(w.ship.active).toBe(true);
    for (let i = 0; i < 2; i++) mine.step(w, id, DT);
    expect(mine.isArmed(w, id)).toBe(true);
    expect(shipHits(w)).toBe(true);
    expect(w.ship.active).toBe(false);
  });

  it('expires at 12 s', () => {
    const { w } = makeGame();
    const id = put(w, mine.def, 300, 0);
    let steps = 0;
    while (w.alive[id] === 1 && w.kind[id] === Kind.Mine && steps < 2000) {
      mine.step(w, id, DT);
      steps++;
    }
    expect(steps * DT).toBeCloseTo(12, 1);
  });

  it('is shot-able at any age and scores nothing, drops no geoms, counts no kill', () => {
    const { w } = makeGame({ objective: { kind: 'destroy', count: 1 } });
    const id = put(w, mine.def, 300, 0);
    let fx = 0;
    bus.on('fx:kill', () => fx++);
    const b = spawnBullet(w.bullets, 290, 0, 1400, 0, 1);
    bulletHits(w);
    expect(w.bullets.alive[b]).toBe(0);
    expect(countKind(w, Kind.Mine)).toBe(0);
    expect(countKind(w, Kind.Geom)).toBe(0);
    expect(gs(w).score).toBe(0);
    expect(gs(w).kills).toBe(0);
    expect(fx).toBe(1);
  });

  it('is not pulled by a well', () => {
    const { w } = makeGame();
    addWell(w, 0, 300);
    const id = put(w, mine.def, 0, 150);
    for (let i = 0; i < 60; i++) well.stepWells(w, DT);
    expect(w.x[id]).toBe(0);
    expect(w.y[id]).toBe(150);
  });
});

describe('splime', () => {
  it('has the plan stats', () => {
    expect(splime.def).toMatchObject({ kind: Kind.Splime, radius: 16, value: 140, hp: 3, geoms: 2 });
    expect(splime.def.speed).toBeCloseTo(147, 6);
  });

  it('closes on the ship at 0.35 x ship speed (within 5 percent)', () => {
    const { w } = makeGame();
    const id = put(w, splime.def, 500, 200);
    const d0 = dist(w, 0, id);
    for (let i = 0; i < 120; i++) splime.step(w, id, DT);
    const closed = d0 - dist(w, 0, id);
    const want = 0.35 * SHIP_SPEED;
    expect(Math.abs(closed - want) / want).toBeLessThan(0.05);
  });

  it('drops a Slime every 3.5 s, up to 3 live', () => {
    const { w } = makeGame();
    const id = put(w, splime.def, 500, 200);
    const steps = (sec: number): void => {
      for (let i = 0; i < Math.round(sec * 120); i++) splime.step(w, id, DT);
    };
    steps(3.45);
    expect(countKind(w, Kind.Slime)).toBe(0);
    steps(0.1);
    expect(countKind(w, Kind.Slime)).toBe(1);
    steps(3.5);
    expect(countKind(w, Kind.Slime)).toBe(2);
    steps(20);
    expect(countKind(w, Kind.Slime)).toBe(slime.CAP_PER_SPLIME);
  });

  it('total Slime caps at 12 across Splimes', () => {
    const { w } = makeGame();
    const ids: number[] = [];
    for (let s = 0; s < 6; s++) ids.push(put(w, splime.def, -500 + s * 200, 300));
    for (let i = 0; i < 120 * 20; i++) for (const id of ids) splime.step(w, id, DT);
    expect(countKind(w, Kind.Slime)).toBe(slime.CAP_TOTAL);
  });

  it('kills the ship on contact like any enemy', () => {
    const { w } = makeGame();
    put(w, splime.def, 20, 0);
    expect(shipHits(w)).toBe(true);
  });
});

describe('slime', () => {
  it('has the plan stats', () => {
    expect(slime.def).toMatchObject({ kind: Kind.Slime, radius: 40, value: 0, geoms: 0 });
  });

  it('expires at 8 s', () => {
    const { w } = makeGame();
    const id = put(w, slime.def, 300, 0);
    let steps = 0;
    while (w.alive[id] === 1 && w.kind[id] === Kind.Slime && steps < 2000) {
      slime.step(w, id, DT);
      steps++;
    }
    expect(steps * DT).toBeCloseTo(8, 1);
  });

  it('a ship overlap sets slowUntil to now plus 2 and slowFactor to 0.8; a second refreshes, never stacks', () => {
    const { w } = makeGame();
    const a = put(w, slime.def, 30, 0);
    const b = put(w, slime.def, -30, 0);
    w.time = 5;
    slime.step(w, a, DT);
    expect(w.ship.slowUntil).toBe(7);
    expect(w.ship.slowFactor).toBe(0.8);
    slime.step(w, b, DT); // a second puddle, same step
    expect(w.ship.slowFactor).toBe(0.8);
    w.time = 6.5;
    slime.step(w, a, DT);
    expect(w.ship.slowUntil).toBe(8.5);
    expect(w.ship.slowFactor).toBe(0.8); // not 0.64
  });

  it('no overlap leaves the ship fields alone', () => {
    const { w } = makeGame();
    const id = put(w, slime.def, 200, 0);
    slime.step(w, id, DT);
    expect(w.ship.slowUntil).toBe(0);
    expect(w.ship.slowFactor).toBe(1);
  });

  it('slows the ship to 0.8 x speed in play, and is not deadly', () => {
    const { w } = makeGame();
    put(w, slime.def, 0, 0);
    const input: InputState = idle();
    input.move = { active: true, x: 1, y: 0 };
    stepGame(w, DT, input); // the overlap sets the slow at the end of this step's world update
    const x0 = w.x[0] ?? 0;
    stepGame(w, DT, input);
    expect(((w.x[0] ?? 0) - x0) / DT).toBeCloseTo(0.8 * SHIP_SPEED, 1);
    expect(w.ship.active).toBe(true);
  });

  it('a bullet passes through it and both survive', () => {
    const { w } = makeGame();
    const id = put(w, slime.def, 300, 0);
    const b = spawnBullet(w.bullets, 300, 0, 1400, 0, 1);
    bulletHits(w);
    expect(w.bullets.alive[b]).toBe(1);
    expect(w.alive[id]).toBe(1);
    expect(isTargetable(w, id)).toBe(false);
  });

  it('orbit blades pass through it', () => {
    const { w } = makeGame();
    equipWeapon(w, 'orbit'); // blade 0 at (80, 0)
    const id = put(w, slime.def, 80, 0);
    for (let i = 0; i < 30; i++) orbitHits(w, DT);
    expect(w.alive[id]).toBe(1);
    expect(w.kind[id]).toBe(Kind.Slime);
  });

  it('an attack drone ignores it', () => {
    const { w } = makeGame({ drone: 'attack' });
    put(w, slime.def, 200, 0);
    for (let i = 0; i < 120; i++) stepDrone(w, DT);
    expect(w.bullets.liveCount).toBe(0);
  });

  it('Detonate leaves it alone', () => {
    const { w } = makeGame({ drone: 'attack', superType: 'detonate' });
    stepDrone(w, DT);
    const id = put(w, slime.def, 60, 0);
    expect(detonate(w)).toBe(0);
    expect(w.kind[id]).toBe(Kind.Slime);
  });

  it('a bomb clears every live Slime with no score and no geoms', () => {
    const { w } = makeGame();
    for (let i = 0; i < 5; i++) put(w, slime.def, -400 + i * 150, 200);
    put(w, mine.def, 0, -200);
    expect(triggerBomb(w)).toBe(true);
    expect(countKind(w, Kind.Slime)).toBe(0);
    expect(countKind(w, Kind.Mine)).toBe(0);
    expect(countKind(w, Kind.Geom)).toBe(0);
    expect(gs(w).score).toBe(0);
  });

  it('wells do not pull it', () => {
    const { w } = makeGame();
    addWell(w, 0, 300);
    const id = put(w, slime.def, 0, 150);
    for (let i = 0; i < 60; i++) well.stepWells(w, DT);
    expect(w.y[id]).toBe(150);
    expect(w.kind[id]).toBe(Kind.Slime);
  });

  it('scores 0 and never counts toward a destroy objective', () => {
    expect(baseValue(Kind.Slime)).toBe(0);
    expect(countsAsKill(Kind.Slime)).toBe(false);
    expect(countsForDestroy(Kind.Slime)).toBe(false);
    expect(countsForDestroy(Kind.Mine)).toBe(false);
    const { w } = makeGame({ objective: { kind: 'destroy', count: 1 } });
    const id = put(w, slime.def, 300, 0);
    killEnemy(w, id, true);
    expect(gs(w).kills).toBe(0);
    expect(gs(w).score).toBe(0);
    expect(countKind(w, Kind.Geom)).toBe(0);
  });

  it('a Splime kill counts toward destroy and pays 140', () => {
    const { w } = makeGame({ objective: { kind: 'destroy', count: 1 } });
    const id = put(w, splime.def, 300, 0);
    killEnemy(w, id, true);
    expect(gs(w).kills).toBe(1);
    expect(gs(w).score).toBe(140);
    expect(countKind(w, Kind.Geom)).toBe(2);
  });

  it('drops outlive a dead Splime and no longer count against its id', () => {
    const { w } = makeGame();
    const id = put(w, splime.def, 300, 0);
    for (let i = 0; i < 3; i++) slime.dropSlime(w, id, 300, 0);
    killEnemy(w, id, false);
    expect(countKind(w, Kind.Slime)).toBe(3);
    const next = put(w, splime.def, -300, 0);
    expect(slime.dropSlime(w, next, -300, 0)).toBeGreaterThan(0);
  });
});

describe('bulwark vs orbit blades', () => {
  it('a blade on the front arc is absorbed, a blade on the rear hurts', () => {
    const { w } = makeGame();
    equipWeapon(w, 'orbit'); // blade 0 at (80, 0)
    const id = put(w, bulwark.def, 100, 0);
    w.rot[id] = Math.PI; // facing the blade
    orbitHits(w, DT);
    expect(w.hp[id]).toBe(3);
    w.rot[id] = 0; // rear to the blade
    for (let i = 0; i < 30; i++) orbitHits(w, DT);
    expect(w.hp[id] ?? 3).toBeLessThan(3);
  });
});

describe('a full world', () => {
  it('drops return -1 and never throw', () => {
    const { w } = makeGame({}, { capacity: 2 });
    const id = put(w, splime.def, 300, 0);
    expect(slime.dropSlime(w, id, 0, 0)).toBe(-1);
    expect(() => {
      for (let i = 0; i < 600; i++) splime.step(w, id, DT);
    }).not.toThrow();
    rebuild(w.grid, w);
  });
});
