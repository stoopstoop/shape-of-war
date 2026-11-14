import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { spawnBullet } from '../../src/game/bullets';
import { killEnemy } from '../../src/game/combat';
import * as grunt from '../../src/game/enemies/grunt';
import * as well from '../../src/game/enemies/gravitywell';
import { SUPER_CHARGE_MAX } from '../../src/game/geoms';
import { gs } from '../../src/game/state';
import {
  collectTargets,
  HOMING_RADIUS,
  HOMING_TURN,
  steerHoming,
  superChargeFraction,
} from '../../src/game/supers';
import { Kind, type World } from '../../src/game/world';
import { DT, makeGame, put } from './helpers';

afterEach(() => bus.clear());

const MAX = HOMING_TURN * DT;

function game(): World {
  return makeGame({ drone: 'collect' }).w;
}

function targets(w: World): number[] {
  const g = gs(w);
  return Array.from(g.targets.subarray(0, g.targetCount));
}

function homingBullet(w: World, vx: number, vy: number, x = 0, y = 0): number {
  const b = spawnBullet(w.bullets, x, y, vx, vy, 1.2);
  w.bullets.homing[b] = 1;
  return b;
}

function angle(w: World, b: number): number {
  return Math.atan2(w.bullets.vy[b] ?? 0, w.bullets.vx[b] ?? 0);
}

function speed(w: World, b: number): number {
  return Math.hypot(w.bullets.vx[b] ?? 0, w.bullets.vy[b] ?? 0);
}

describe('superChargeFraction', () => {
  it('reports charge up to one without changing the stored charge', () => {
    const w = game();
    expect(SUPER_CHARGE_MAX).toBe(60);
    expect(superChargeFraction(w)).toBe(0);

    gs(w).superCharge = 15;
    expect(superChargeFraction(w)).toBe(0.25);
    gs(w).superCharge = 30;
    expect(superChargeFraction(w)).toBe(0.5);
    gs(w).superCharge = 59;
    expect(superChargeFraction(w)).toBeCloseTo(59 / 60, 12);
    expect(superChargeFraction(w)).toBeLessThan(1);
    gs(w).superCharge = 60;
    expect(superChargeFraction(w)).toBe(1);
    gs(w).superCharge = 120;
    expect(superChargeFraction(w)).toBe(1);
    expect(gs(w).superCharge).toBe(120);
  });
});

describe('collectTargets', () => {
  it('clears a stale target count in a new game', () => {
    const w = game();
    gs(w).targetCount = 9;
    expect(collectTargets(w)).toBe(0);
    expect(gs(w).targetCount).toBe(0);
  });

  it('collects grunts in ascending id order', () => {
    const w = game();
    const a = put(w, grunt.def, 100, 0);
    const b = put(w, grunt.def, -200, 50);
    const c = put(w, grunt.def, 0, 300);
    expect(collectTargets(w)).toBe(3);
    expect(gs(w).targetCount).toBe(3);
    expect(targets(w)).toEqual([a, b, c].sort((left, right) => left - right));
  });

  it('excludes a telegraphing enemy until its telegraph ends', () => {
    const w = game();
    const a = put(w, grunt.def, 100, 0);
    const b = put(w, grunt.def, 200, 0);
    gs(w).tele[b] = 0.5;
    expect(collectTargets(w)).toBe(1);
    expect(targets(w)).toEqual([a]);

    gs(w).tele[b] = 0;
    expect(collectTargets(w)).toBe(2);
    expect(targets(w)).toContain(b);
  });

  it('excludes gravity wells and snake bodies', () => {
    const w = game();
    const a = put(w, grunt.def, 100, 0);
    const wellId = put(w, well.def, -200, 0);
    const body = put(w, grunt.def, 0, 200);
    w.kind[body] = Kind.SnakeBody;
    expect(w.kind[wellId]).toBe(Kind.GravityWell);
    expect(collectTargets(w)).toBe(1);
    expect(targets(w)).toEqual([a]);
  });

  it('excludes drones and snake bodies but includes snake heads', () => {
    const w = game();
    put(w, grunt.def, 100, 0);
    const b = put(w, grunt.def, 200, 0);
    w.kind[b] = Kind.Drone;
    expect(collectTargets(w)).toBe(1);
    w.kind[b] = Kind.SnakeBody;
    expect(collectTargets(w)).toBe(1);
    w.kind[b] = Kind.SnakeHead;
    expect(collectTargets(w)).toBe(2);
  });

  it('removes killed enemies from the target list', () => {
    const w = game();
    const a = put(w, grunt.def, 100, 0);
    const b = put(w, grunt.def, 200, 0);
    expect(collectTargets(w)).toBe(2);

    killEnemy(w, a, false);
    expect(collectTargets(w)).toBe(1);
    expect(targets(w)).toEqual([b]);
    killEnemy(w, b, false);
    expect(collectTargets(w)).toBe(0);
    expect(targets(w)).toEqual([]);
  });
});

describe('steerHoming', () => {
  it.each([
    { y: 200, turn: MAX },
    { y: -200, turn: -MAX },
  ])('caps the turn toward (200, $y) and preserves speed', ({ y, turn }) => {
    const w = game();
    put(w, grunt.def, 200, y);
    const b = homingBullet(w, 1400, 0);
    expect(HOMING_TURN).toBeCloseTo(3 * Math.PI, 12);
    expect(MAX).toBeCloseTo(Math.PI / 40, 12);

    steerHoming(w, DT);
    expect(angle(w, b)).toBeCloseTo(turn, 4);
    expect(speed(w, b)).toBeCloseTo(1400, 1);
  });

  it('lands on a bearing within the turn cap and stays there', () => {
    const w = game();
    put(w, grunt.def, 200, 10);
    const b = homingBullet(w, 1400, 0);
    steerHoming(w, DT);
    expect(angle(w, b)).toBeCloseTo(Math.atan2(10, 200), 4);
    expect(speed(w, b)).toBeCloseTo(1400, 1);

    steerHoming(w, DT);
    expect(angle(w, b)).toBeCloseTo(Math.atan2(10, 200), 4);
  });

  it('keeps a bullet already on the target bearing unchanged', () => {
    const w = game();
    put(w, grunt.def, 250, 0);
    const b = homingBullet(w, 1400, 0);
    steerHoming(w, DT);
    expect(w.bullets.vx[b] ?? 0).toBe(1400);
    expect(w.bullets.vy[b] ?? 0).toBe(0);
  });

  it('turns toward the only target', () => {
    const w = game();
    put(w, grunt.def, 100, 100);
    const b = homingBullet(w, 1400, 0);
    steerHoming(w, DT);
    expect(angle(w, b)).toBeCloseTo(MAX, 4);
  });

  it.each([false, true])('chooses the nearest target with nearFirst=%s', (nearFirst) => {
    const w = game();
    if (nearFirst) {
      put(w, grunt.def, 60, -30);
      put(w, grunt.def, 100, 100);
    } else {
      put(w, grunt.def, 100, 100);
      put(w, grunt.def, 60, -30);
    }
    const b = homingBullet(w, 1400, 0);
    steerHoming(w, DT);
    expect(angle(w, b)).toBeCloseTo(-MAX, 4);
  });

  it('ignores a target just beyond the 300 unit radius', () => {
    const w = game();
    expect(HOMING_RADIUS).toBe(300);
    put(w, grunt.def, 0, 301);
    const b = homingBullet(w, 1400, 0);
    steerHoming(w, DT);
    expect(w.bullets.vx[b] ?? 0).toBe(1400);
    expect(w.bullets.vy[b] ?? 0).toBe(0);
  });

  it('includes a target exactly on the radius', () => {
    const w = game();
    put(w, grunt.def, 0, 300);
    const b = homingBullet(w, 1400, 0);
    steerHoming(w, DT);
    expect(angle(w, b)).toBeCloseTo(MAX, 4);
  });

  it('measures target distance from each bullet', () => {
    const w = game();
    put(w, grunt.def, 500, 100);
    const far = homingBullet(w, 1400, 0, 0, 0);
    const near = homingBullet(w, 1400, 0, 400, 0);
    steerHoming(w, DT);
    expect(w.bullets.vy[far] ?? 0).toBe(0);
    expect(angle(w, near)).toBeCloseTo(MAX, 4);
  });

  it('leaves unmarked and stationary bullets alone', () => {
    const w = game();
    put(w, grunt.def, 200, 200);
    const plain = spawnBullet(w.bullets, 0, 0, 1400, 0, 1.2);
    const still = homingBullet(w, 0, 0);
    steerHoming(w, DT);
    expect(w.bullets.vx[plain] ?? 0).toBe(1400);
    expect(w.bullets.vy[plain] ?? 0).toBe(0);
    expect(w.bullets.homing[plain] ?? 0).toBe(0);
    expect(w.bullets.vx[still] ?? 0).toBe(0);
    expect(w.bullets.vy[still] ?? 0).toBe(0);
  });

  it('keeps velocity until an eligible target becomes available', () => {
    const w = game();
    const b = homingBullet(w, 1400, 0);
    steerHoming(w, DT);
    expect(w.bullets.vx[b] ?? 0).toBe(1400);
    expect(w.bullets.vy[b] ?? 0).toBe(0);

    const g = put(w, grunt.def, 200, 200);
    gs(w).tele[g] = 0.5;
    put(w, well.def, 200, -200);
    steerHoming(w, DT);
    expect(w.bullets.vx[b] ?? 0).toBe(1400);
    expect(w.bullets.vy[b] ?? 0).toBe(0);

    gs(w).tele[g] = 0;
    steerHoming(w, DT);
    expect(angle(w, b)).toBeCloseTo(MAX, 4);
  });

  it('takes the short turn across the half turn boundary', () => {
    const w = game();
    put(w, grunt.def, -200, -10);
    const b = homingBullet(w, -1400, 0);
    steerHoming(w, DT);
    expect(angle(w, b)).toBeCloseTo(Math.atan2(-10, -200), 4);
    expect(w.bullets.vx[b] ?? 0).toBeLessThan(0);
    expect(w.bullets.vy[b] ?? 0).toBeLessThan(0);
    expect(speed(w, b)).toBeCloseTo(1400, 1);
  });

  it('scales the turn with dt and stops at the target bearing', () => {
    const w = game();
    put(w, grunt.def, 0, 200);
    const b = homingBullet(w, 1400, 0);
    steerHoming(w, 0);
    expect(w.bullets.vx[b] ?? 0).toBe(1400);
    expect(w.bullets.vy[b] ?? 0).toBe(0);

    steerHoming(w, 2 * DT);
    expect(angle(w, b)).toBeCloseTo(HOMING_TURN * 2 * DT, 4);
    steerHoming(w, 1);
    expect(angle(w, b)).toBeCloseTo(Math.PI / 2, 4);
  });

  it('refreshes targets without moving the bullet', () => {
    const w = game();
    const a = put(w, grunt.def, 200, 200);
    const b = homingBullet(w, 1400, 0, 5, 6);
    steerHoming(w, DT);
    expect(w.bullets.x[b] ?? 0).toBe(5);
    expect(w.bullets.y[b] ?? 0).toBe(6);
    expect(targets(w)).toEqual([a]);
  });
});
