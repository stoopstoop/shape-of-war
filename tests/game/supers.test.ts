import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { spawnBullet } from '../../src/game/bullets';
import { stepDrone } from '../../src/game/drones';
import * as grunt from '../../src/game/enemies/grunt';
import * as well from '../../src/game/enemies/gravitywell';
import { stepGame } from '../../src/game/game';
import { SUPER_CHARGE_MAX } from '../../src/game/geoms';
import { killShip } from '../../src/game/player';
import { gs } from '../../src/game/state';
import {
  DETONATE_RADIUS,
  DRONE_ABSENT_SEC,
  HOMING_TURN,
  stepSupers,
  SUPER_DURATION,
  superReady,
  superTimeLeft,
  triggerSuper,
} from '../../src/game/supers';
import { Kind, type World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import { DT, idle, makeGame, put } from './helpers';

afterEach(() => bus.clear());

function charge(w: World): void {
  gs(w).superCharge = SUPER_CHARGE_MAX;
}

function aimRight(): InputState {
  const i = idle();
  i.aim = { active: true, x: 1, y: 0 };
  return i;
}

function countBullets(w: World): number {
  return w.bullets.liveCount;
}

describe('super charge', () => {
  it('does nothing without a full charge and keeps the charge', () => {
    const { w } = makeGame({ superType: 'turbo' });
    gs(w).superCharge = SUPER_CHARGE_MAX - 1;
    expect(triggerSuper(w)).toBe(false);
    expect(gs(w).superCharge).toBe(SUPER_CHARGE_MAX - 1);
  });

  it('empties on activation, refills from geoms and fires again', () => {
    const { w } = makeGame({ superType: 'turbo' });
    charge(w);
    expect(triggerSuper(w)).toBe(true);
    expect(gs(w).superCharge).toBe(0);
    expect(triggerSuper(w)).toBe(false);
    charge(w);
    expect(triggerSuper(w)).toBe(true);
  });

  it('is kept on death and cannot fire while dead', () => {
    const { w } = makeGame({ superType: 'turbo' });
    charge(w);
    killShip(w);
    expect(gs(w).superCharge).toBe(SUPER_CHARGE_MAX);
    expect(superReady(w)).toBe(false);
    expect(triggerSuper(w)).toBe(false);
  });

  it('the super button in stepGame triggers it', () => {
    const { w } = makeGame({ superType: 'turbo' });
    charge(w);
    const input = idle();
    input.superPressed = true;
    stepGame(w, DT, input);
    expect(gs(w).superActive).toBe('turbo');
  });
});

describe('turbo', () => {
  it('doubles the volley rate for 5 s, then returns to 12 per second', () => {
    const { w } = makeGame({ superType: 'turbo' });
    w.ship.invuln = 1e9;
    const input = aimRight();
    charge(w);
    expect(triggerSuper(w)).toBe(true);
    expect(w.ship.fireRateScale).toBe(2);
    let volleyEvents = 0;
    bus.on('sfx', (s) => {
      if (s === 'shot') volleyEvents++;
    });
    for (let i = 0; i < 120; i++) stepGame(w, DT, input);
    // One 'shot' sfx per step with a volley; at 24/s and 120 Hz every volley is its own step.
    expect(volleyEvents).toBe(24);
    expect(countBullets(w)).toBeGreaterThan(0);
    expect(superTimeLeft(w)).toBeCloseTo(SUPER_DURATION - 1, 2);
    for (let i = 0; i < 4 * 120 + 2; i++) stepGame(w, DT, input);
    expect(gs(w).superActive).toBeNull();
    expect(w.ship.fireRateScale).toBe(1);
    expect(superTimeLeft(w)).toBe(0);
    volleyEvents = 0;
    for (let i = 0; i < 120; i++) stepGame(w, DT, input);
    expect(volleyEvents).toBe(12);
  });

  it('ends after exactly 5 s of sim time', () => {
    const { w } = makeGame({ superType: 'turbo' });
    charge(w);
    triggerSuper(w);
    for (let i = 0; i < 599; i++) stepSupers(w, DT);
    expect(w.ship.fireRateScale).toBe(2);
    stepSupers(w, DT);
    stepSupers(w, DT);
    expect(w.ship.fireRateScale).toBe(1);
  });
});

describe('homing', () => {
  it('turns bullets toward an enemy within 300 u at most 540 deg/s, keeping speed', () => {
    const { w } = makeGame({ superType: 'homing' });
    charge(w);
    expect(triggerSuper(w)).toBe(true);
    const target = put(w, grunt.def, 200, 200);
    const b = spawnBullet(w.bullets, 0, 0, 1400, 0, 1.2);
    stepSupers(w, DT);
    expect(w.bullets.homing[b]).toBe(1);
    const vx = w.bullets.vx[b] ?? 0;
    const vy = w.bullets.vy[b] ?? 0;
    expect(Math.hypot(vx, vy)).toBeCloseTo(1400, 1);
    expect(Math.atan2(vy, vx)).toBeCloseTo(HOMING_TURN * DT, 4);
    expect(target).toBeGreaterThan(0);
  });

  it('a homing volley kills an enemy that a straight shot would miss', () => {
    const { w } = makeGame({ superType: 'homing' });
    w.ship.invuln = 1e9;
    const id = put(w, grunt.def, 260, 140);
    gs(w).tele[id] = 0;
    charge(w);
    triggerSuper(w);
    const input = aimRight();
    let killed = false;
    for (let i = 0; i < 60 && !killed; i++) {
      stepGame(w, DT, input);
      killed = w.alive[id] !== 1 || w.kind[id] !== Kind.Grunt;
    }
    expect(killed).toBe(true);
  });

  it('ignores enemies beyond 300 u', () => {
    const { w } = makeGame({ superType: 'homing' });
    charge(w);
    triggerSuper(w);
    put(w, grunt.def, 0, 400);
    const b = spawnBullet(w.bullets, 0, 0, 1400, 0, 1.2);
    stepSupers(w, DT);
    expect(w.bullets.vy[b]).toBe(0);
  });

  it('lasts 5 s: bullets fired after it ends do not home', () => {
    const { w } = makeGame({ superType: 'homing' });
    charge(w);
    triggerSuper(w);
    for (let i = 0; i < 4.9 * 120; i++) stepSupers(w, DT);
    const late = spawnBullet(w.bullets, 0, 0, 1400, 0, 1.2);
    stepSupers(w, DT);
    expect(w.bullets.homing[late]).toBe(1);
    for (let i = 0; i < 0.2 * 120; i++) stepSupers(w, DT);
    expect(gs(w).superActive).toBeNull();
    const after = spawnBullet(w.bullets, 0, 0, 1400, 0, 1.2);
    stepSupers(w, DT);
    expect(w.bullets.homing[after]).toBe(0);
    expect(w.bullets.homing[late]).toBe(1);
  });
});

describe('detonate', () => {
  it('kills every enemy within 260 u of the drone with score and geoms, not wells', () => {
    const { w } = makeGame({ superType: 'detonate', drone: 'attack' });
    stepDrone(w, DT);
    const drone = gs(w).droneId;
    const dx = w.x[drone] ?? 0;
    const dy = w.y[drone] ?? 0;
    const near = put(w, grunt.def, dx + DETONATE_RADIUS - 10, dy);
    const far = put(w, grunt.def, dx - DETONATE_RADIUS - 20, dy);
    const wellId = put(w, well.def, dx, dy + 100);
    charge(w);
    expect(triggerSuper(w)).toBe(true);
    expect(w.alive[near] === 1 && w.kind[near] === Kind.Grunt).toBe(false);
    expect(w.kind[far]).toBe(Kind.Grunt);
    expect(w.kind[wellId]).toBe(Kind.GravityWell);
    expect(gs(w).score).toBe(50);
    let geoms = 0;
    for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && w.kind[i] === Kind.Geom) geoms++;
    expect(geoms).toBe(1);
  });

  it('removes the drone for 3 s, then it respawns at the ship', () => {
    const { w } = makeGame({ superType: 'detonate', drone: 'attack' });
    stepDrone(w, DT);
    charge(w);
    triggerSuper(w);
    expect(gs(w).droneId).toBe(-1);
    for (let i = 0; i < DRONE_ABSENT_SEC * 120 - 2; i++) {
      stepSupers(w, DT);
      stepDrone(w, DT);
    }
    expect(gs(w).droneId).toBe(-1);
    for (let i = 0; i < 4; i++) {
      stepSupers(w, DT);
      stepDrone(w, DT);
    }
    const id = gs(w).droneId;
    expect(w.kind[id]).toBe(Kind.Drone);
    expect(Math.hypot((w.x[id] ?? 0) - (w.x[0] ?? 0), (w.y[id] ?? 0) - (w.y[0] ?? 0))).toBeCloseTo(60, 0);
  });

  it('does not fire or spend charge while the drone is absent', () => {
    const { w } = makeGame({ superType: 'detonate', drone: 'attack' });
    charge(w);
    expect(triggerSuper(w)).toBe(false);
    expect(gs(w).superCharge).toBe(SUPER_CHARGE_MAX);
  });
});
