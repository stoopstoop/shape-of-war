import { describe, expect, it } from 'vitest';
import { BULLET_CAP, BULLET_LIFE, createBulletPool, fireSpread, spawnBullet, stepBulletPool } from '../../src/game/bullets';
import { deactivateShip, INVULN_SEC, respawnShip, SHIP_SPEED, stepShip } from '../../src/game/ship';
import { createWorld, inlineRectLevel, stepWorld } from '../../src/game/world';
import type { InputState } from '../../src/input/types';

function input(mx: number, my: number, aimActive: boolean, ax = 1, ay = 0): InputState {
  return {
    move: { active: mx !== 0 || my !== 0, x: mx, y: my },
    aim: { active: aimActive, x: ax, y: ay },
    bomb: false,
    superPressed: false,
    pause: false,
  };
}

const DT = 1 / 120;

describe('ship', () => {
  it('moves at 420 u/s from the move stick', () => {
    const w = createWorld(inlineRectLevel());
    for (let i = 0; i < 60; i++) stepShip(w, DT, input(1, 0, false));
    expect(w.x[0]).toBeCloseTo(SHIP_SPEED * 0.5, 2);
    expect(w.vx[0]).toBeCloseTo(SHIP_SPEED);
  });

  it('caps diagonal stick magnitude at 1', () => {
    const w = createWorld(inlineRectLevel());
    stepShip(w, DT, input(1, 1, false));
    expect(Math.hypot(w.vx[0] ?? 0, w.vy[0] ?? 0)).toBeCloseTo(SHIP_SPEED);
  });

  it('slides along the wall', () => {
    const w = createWorld(inlineRectLevel());
    for (let i = 0; i < 600; i++) stepShip(w, DT, input(0.7071, -0.7071, false));
    expect(w.y[0]).toBeCloseTo(-(450 - 10), 2);
    expect(w.vy[0]).toBeCloseTo(0);
    expect(w.vx[0]).toBeGreaterThan(0);
  });

  it('fires 12 volleys of 3 per second while aiming', () => {
    const w = createWorld(inlineRectLevel());
    for (let i = 0; i < 120; i++) stepShip(w, DT, input(0, 0, true));
    // First volley fires on the first step, then every 1/12 s: 12 volleys within 1 s.
    expect(w.bullets.liveCount).toBe(36);
    expect(w.ship.firing).toBe(true);
  });

  it('does not fire without aim and counts invulnerability down', () => {
    const w = createWorld(inlineRectLevel());
    expect(w.ship.invuln).toBe(INVULN_SEC);
    for (let i = 0; i < 120; i++) stepShip(w, DT, input(0, 0, false));
    expect(w.bullets.liveCount).toBe(0);
    expect(w.ship.invuln).toBeCloseTo(1, 5);
  });

  it('respawn resets position and invulnerability; inactive ship does nothing', () => {
    const w = createWorld(inlineRectLevel());
    for (let i = 0; i < 300; i++) stepShip(w, DT, input(1, 0, false));
    deactivateShip(w);
    stepShip(w, DT, input(0, 0, true));
    expect(w.bullets.liveCount).toBe(0);
    respawnShip(w);
    expect(w.x[0]).toBe(0);
    expect(w.ship.invuln).toBe(INVULN_SEC);
    expect(w.alive[0]).toBe(1);
  });
});

describe('bullets', () => {
  it('3-way spread at minus 6, 0, plus 6 degrees, 16 u ahead', () => {
    const w = createWorld(inlineRectLevel());
    fireSpread(w, 0, 0, 0);
    const p = w.bullets;
    expect(p.liveCount).toBe(3);
    const angles: number[] = [];
    for (let i = 0; i < 3; i++) {
      angles.push((Math.atan2(p.vy[i] ?? 0, p.vx[i] ?? 0) * 180) / Math.PI);
      expect(p.x[i]).toBeCloseTo(16);
      expect(Math.hypot(p.vx[i] ?? 0, p.vy[i] ?? 0)).toBeCloseTo(1400, 1);
    }
    angles.sort((a, b) => a - b);
    expect(angles[0]).toBeCloseTo(-6, 3);
    expect(angles[1]).toBeCloseTo(0, 3);
    expect(angles[2]).toBeCloseTo(6, 3);
  });

  it('adds ship velocity along aim, clamped to 1600', () => {
    const w = createWorld(inlineRectLevel());
    w.vx[0] = 420;
    fireSpread(w, 0, 0, 0);
    expect(Math.hypot(w.bullets.vx[1] ?? 0, w.bullets.vy[1] ?? 0)).toBeCloseTo(1600, 1);
  });

  it('drops the shot when the pool is full', () => {
    const p = createBulletPool(4);
    for (let i = 0; i < 4; i++) expect(spawnBullet(p, 0, 0, 0, 0, 1)).toBe(i);
    expect(spawnBullet(p, 0, 0, 0, 0, 1)).toBe(-1);
    expect(p.dropped).toBe(1);
    expect(BULLET_CAP).toBe(512);
  });

  it('expire after their lifetime and die on walls', () => {
    const lvl = inlineRectLevel();
    const p = createBulletPool(8);
    spawnBullet(p, 0, 0, 0, 0, BULLET_LIFE);
    spawnBullet(p, 600, 0, 1400, 0, BULLET_LIFE);
    for (let i = 0; i < 12; i++) stepBulletPool(p, lvl.arena, DT);
    expect(p.alive[1]).toBe(0); // hit the right wall at 700
    expect(p.alive[0]).toBe(1);
    for (let i = 0; i < 140; i++) stepBulletPool(p, lvl.arena, DT);
    expect(p.alive[0]).toBe(0);
    expect(p.liveCount).toBe(0);
  });

  it('stepWorld runs ship and bullets together', () => {
    const w = createWorld(inlineRectLevel());
    stepWorld(w, DT, input(0, 0, true, 0, -1));
    expect(w.bullets.liveCount).toBe(3);
    expect((w.bullets.y[1] ?? 0) < 0).toBe(true);
  });
});
