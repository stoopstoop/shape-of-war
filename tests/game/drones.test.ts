import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import * as drones from '../../src/game/drones';
import * as grunt from '../../src/game/enemies/grunt';
import { gameState } from '../../src/game/game';
import { spawnGeoms } from '../../src/game/geoms';
import { killShip } from '../../src/game/player';
import { gs } from '../../src/game/state';
import { triggerSuper } from '../../src/game/supers';
import { Kind } from '../../src/game/world';
import { DT, dist, makeGame, put } from './helpers';

afterEach(() => bus.clear());

describe('attack drone', () => {
  it('orbits the ship at 60 u', () => {
    const { w } = makeGame({ drone: 'attack' });
    drones.stepDrone(w, DT);
    const id = gs(w).droneId;
    expect(w.kind[id]).toBe(Kind.Drone);
    for (let i = 0; i < 30; i++) drones.stepDrone(w, DT);
    expect(dist(w, 0, id)).toBeCloseTo(60, 3);
  });

  it('fires 4 shots per second at an enemy in range, none when out of range', () => {
    const { w } = makeGame({ drone: 'attack' });
    for (let i = 0; i < 120; i++) drones.stepDrone(w, DT);
    expect(w.bullets.liveCount).toBe(0);
    put(w, grunt.def, 300, 0);
    for (let i = 0; i < 120; i++) drones.stepDrone(w, DT);
    expect(w.bullets.liveCount).toBe(4);
  });

  it('is absent while the ship is dead', () => {
    const { w } = makeGame({ drone: 'attack' });
    drones.stepDrone(w, DT);
    killShip(w);
    drones.stepDrone(w, DT);
    expect(gs(w).droneId).toBe(-1);
  });
});

describe('collect drone', () => {
  it('trails the ship and vacuums geoms within 260 u', () => {
    const { w } = makeGame({ drone: 'collect' });
    spawnGeoms(w, 200, 0, 1);
    for (let i = 0; i < 60; i++) {
      drones.stepDrone(w, DT);
      for (let id = 1; id < w.cap; id++) {
        if (w.alive[id] === 1 && w.kind[id] === Kind.Geom) {
          w.x[id] = (w.x[id] ?? 0) + (w.vx[id] ?? 0) * DT;
          w.y[id] = (w.y[id] ?? 0) + (w.vy[id] ?? 0) * DT;
        }
      }
    }
    expect(gameState(w).multiplier).toBe(2);
  });
});

describe('ram drone', () => {
  it('charges and kills a 1 HP enemy in range', () => {
    const { w } = makeGame({ drone: 'ram' });
    const id = put(w, grunt.def, 250, 0);
    for (let i = 0; i < 120; i++) drones.stepDrone(w, DT);
    expect(w.kind[id]).not.toBe(Kind.Grunt);
    expect(gameState(w).score).toBe(50);
  });
});

describe('supers', () => {
  it('triggerSuper does nothing without charge (full cases in supers.test.ts)', () => {
    const { w } = makeGame();
    expect(triggerSuper(w)).toBe(false);
  });
});
