// Enemy bullet pool (docs/13 "Boss projectiles"): cap, charge, motion, ends, clear, per World
// pools, and the dodge arithmetic.
import { describe, expect, it } from 'vitest';
import { SPACE_TABLE } from '../../src/core/physics';
import {
  clearEnemyBullets,
  dodgeSeconds,
  ENEMY_BULLET_CAP,
  ENEMY_BULLET_LIFE,
  ENEMY_BULLET_MIN_RANGE,
  ENEMY_BULLET_RADIUS,
  ENEMY_BULLET_SPEED_MAX,
  enemyBulletsOf,
  spawnEnemyBullet,
  stepEnemyBullets,
} from '../../src/game/enemyBullets';
import { createWorld, inlineRectLevel, type World } from '../../src/game/world';
import type { LevelDef } from '../../src/levelgen/leveldef';

const DT = 1 / 120;

function world(patch: Partial<LevelDef> = {}): World {
  return createWorld({ ...inlineRectLevel(3), ...patch });
}

function steps(w: World, n: number): void {
  for (let i = 0; i < n; i++) stepEnemyBullets(w, DT);
}

describe('pool and cap', () => {
  it('holds 32, drops and counts the rest, never throws', () => {
    const w = world();
    for (let i = 0; i < ENEMY_BULLET_CAP; i++) {
      expect(spawnEnemyBullet(w, -400, 300, 0, 100, 6, 1, 1)).toBe(i);
    }
    const p = enemyBulletsOf(w);
    expect(ENEMY_BULLET_CAP).toBe(32);
    expect(p.cap).toBe(32);
    expect(p.liveCount).toBe(32);
    expect(p.dropped).toBe(0);
    for (let i = 0; i < 5; i++) {
      expect(() => spawnEnemyBullet(w, -400, 300, 0, 100, 6, 1, 1)).not.toThrow();
    }
    expect(spawnEnemyBullet(w, -400, 300, 0, 100, 6, 1, 1)).toBe(-1);
    expect(p.dropped).toBe(6);
    expect(p.liveCount).toBe(32);
  });

  it('reuses a freed slot', () => {
    const w = world();
    spawnEnemyBullet(w, -400, 300, 0, 100, 6, 1, 0);
    clearEnemyBullets(w);
    expect(spawnEnemyBullet(w, -400, 300, 0, 100, 6, 1, 0)).toBe(0);
  });
});

describe('charge and launch', () => {
  it('a charging bullet stays at the muzzle and does not collide', () => {
    const w = world();
    w.ship.invuln = 0;
    // Muzzle on top of the ship: still harmless while charging.
    const id = spawnEnemyBullet(w, 0, 0, Math.PI / 2, 200, 6, 1, 0.5);
    const p = enemyBulletsOf(w);
    steps(w, 59);
    expect(p.alive[id]).toBe(1);
    expect(p.x[id]).toBe(0);
    expect(p.y[id]).toBe(0);
    expect(p.arm[id]).toBeGreaterThan(0);
    expect(w.ship.active).toBe(true);
  });

  it('launches along its heading at the right speed', () => {
    const w = world();
    const heading = Math.PI / 4;
    const id = spawnEnemyBullet(w, -300, -200, heading, 180, 6, 2, 0.8);
    const p = enemyBulletsOf(w);
    expect(p.vx[id]).toBeCloseTo(Math.cos(heading) * 180, 3);
    expect(p.vy[id]).toBeCloseTo(Math.sin(heading) * 180, 3);
    steps(w, 96 + 60); // 0.8 s charge then 0.5 s of flight
    expect(p.arm[id]).toBe(0);
    expect(p.x[id]).toBeCloseTo(-300 + Math.cos(heading) * 90, 1);
    expect(p.y[id]).toBeCloseTo(-200 + Math.sin(heading) * 90, 1);
    expect(Math.hypot(p.vx[id] ?? 0, p.vy[id] ?? 0)).toBeCloseTo(180, 3);
    expect(p.tier[id]).toBe(2);
    expect(p.radius[id]).toBe(ENEMY_BULLET_RADIUS);
  });

  it('clamps the speed to 240 u/s', () => {
    const w = world();
    const a = spawnEnemyBullet(w, -300, 0, 0, 900, 6, 1, 0);
    const b = spawnEnemyBullet(w, -300, 100, 0, -50, 6, 1, 0);
    const p = enemyBulletsOf(w);
    expect(ENEMY_BULLET_SPEED_MAX).toBe(240);
    expect(Math.hypot(p.vx[a] ?? 0, p.vy[a] ?? 0)).toBeCloseTo(240, 3);
    expect(Math.hypot(p.vx[b] ?? 0, p.vy[b] ?? 0)).toBe(0);
  });

  it('keeps one velocity for its whole life and flies a straight line', () => {
    const w = world();
    const heading = 0.3;
    const id = spawnEnemyBullet(w, -500, -300, heading, 210, 6, 1, 0.6);
    const p = enemyBulletsOf(w);
    const vx = p.vx[id];
    const vy = p.vy[id];
    let n = 0;
    while (p.alive[id] === 1 && n < 2000) {
      stepEnemyBullets(w, DT);
      n++;
      if (p.alive[id] !== 1) break;
      expect(p.vx[id]).toBe(vx);
      expect(p.vy[id]).toBe(vy);
      // Perpendicular distance from the line through the muzzle along the heading.
      const off = -((p.x[id] ?? 0) + 500) * Math.sin(heading) + ((p.y[id] ?? 0) + 300) * Math.cos(heading);
      expect(Math.abs(off)).toBeLessThan(0.05);
    }
    expect(n).toBeGreaterThan(72);
  });
});

describe('ends', () => {
  it('ends at life 0, 8 s after launch', () => {
    const w = world();
    const id = spawnEnemyBullet(w, -300, 300, 0, 50, 6, 1, 0.5);
    const p = enemyBulletsOf(w);
    steps(w, 60 + 8 * 120 - 2);
    expect(p.alive[id]).toBe(1);
    steps(w, 4);
    expect(p.alive[id]).toBe(0);
    expect(p.liveCount).toBe(0);
    expect(ENEMY_BULLET_LIFE).toBe(8);
  });

  it('ends on the arena wall', () => {
    const w = world();
    const id = spawnEnemyBullet(w, 600, 0, 0, 240, 6, 1, 0);
    const p = enemyBulletsOf(w);
    // Half width 700, so the edge touches at x 694: 94 u at 240 u/s is about 0.39 s.
    steps(w, 44);
    expect(p.alive[id]).toBe(1);
    steps(w, 4);
    expect(p.alive[id]).toBe(0);
  });

  it('ends on an obstacle', () => {
    const base = inlineRectLevel(3);
    const w = world({
      arena: { ...base.arena, shape: 'rectObstacles', obstacles: [{ cx: 300, cy: 200, w: 40, h: 200 }] },
    });
    const id = spawnEnemyBullet(w, 100, 200, 0, 200, 6, 1, 0);
    const p = enemyBulletsOf(w);
    // Box face at x 280, so the edge touches at x 274: 174 u at 200 u/s is 0.87 s.
    steps(w, 102);
    expect(p.alive[id]).toBe(1);
    steps(w, 4);
    expect(p.alive[id]).toBe(0);
  });
});

describe('clear and per World pools', () => {
  it('clear empties the pool, charging or flying', () => {
    const w = world();
    spawnEnemyBullet(w, -300, 300, 0, 100, 6, 1, 0);
    spawnEnemyBullet(w, -300, 200, 0, 100, 6, 1, 1);
    steps(w, 10);
    clearEnemyBullets(w);
    const p = enemyBulletsOf(w);
    expect(p.liveCount).toBe(0);
    expect(p.freeTop).toBe(p.cap);
    for (let i = 0; i < p.cap; i++) expect(p.alive[i]).toBe(0);
  });

  it('a fresh World has an empty pool and two Worlds do not share one', () => {
    const a = world();
    const b = world();
    expect(enemyBulletsOf(a).cap).toBe(0);
    expect(enemyBulletsOf(a).liveCount).toBe(0);
    stepEnemyBullets(a, DT);
    clearEnemyBullets(a);
    expect(enemyBulletsOf(a).cap).toBe(0);
    spawnEnemyBullet(a, -300, 300, 0, 100, 6, 1, 0);
    expect(enemyBulletsOf(a).cap).toBe(ENEMY_BULLET_CAP);
    expect(enemyBulletsOf(a).liveCount).toBe(1);
    expect(enemyBulletsOf(b).cap).toBe(0);
    expect(enemyBulletsOf(b).liveCount).toBe(0);
    spawnEnemyBullet(b, -300, 300, 0, 100, 6, 1, 0);
    expect(enemyBulletsOf(b)).not.toBe(enemyBulletsOf(a));
    expect(enemyBulletsOf(a).liveCount).toBe(1);
  });
});

describe('dodge arithmetic', () => {
  it('clears 24 u from rest within 0.35 s at High, faster at Low and Medium', () => {
    const high = dodgeSeconds(SPACE_TABLE.high, 24);
    const medium = dodgeSeconds(SPACE_TABLE.medium, 24);
    const low = dodgeSeconds(SPACE_TABLE.low, 24);
    expect(high).toBeLessThanOrEqual(0.35);
    expect(high).toBeGreaterThan(0.25);
    expect(medium).toBeLessThan(high);
    expect(low).toBeLessThan(high);
  });

  it('solves the distance formula', () => {
    for (const row of [SPACE_TABLE.low, SPACE_TABLE.medium, SPACE_TABLE.high]) {
      const t = dodgeSeconds(row, 24);
      const u = t / row.tau;
      expect(row.aMin * row.tau * row.tau * (Math.exp(u) - 1 - u)).toBeCloseTo(24, 6);
      // The formula holds only while aMax is not reached.
      expect(row.aMin * Math.exp(u)).toBeLessThan(row.aMax);
    }
    expect(dodgeSeconds(SPACE_TABLE.high, 0)).toBe(0);
  });

  it('a bullet at the cap fired from the minimum range flies at least 1.25 s', () => {
    expect(ENEMY_BULLET_MIN_RANGE / ENEMY_BULLET_SPEED_MAX).toBeGreaterThanOrEqual(1.25);
  });
});
