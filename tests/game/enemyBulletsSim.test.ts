// Enemy bullets in a game World (docs/13 "Boss projectiles" rules 7, 8 and 10): ship contact,
// invulnerability, isolation from every other entity, determinism, no PRNG.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bus } from '../../src/core/events';
import {
  clearEnemyBullets,
  dodgeSeconds,
  type EnemyBulletPool,
  enemyBulletsOf,
  spawnEnemyBullet,
  stepEnemyBullets,
} from '../../src/game/enemyBullets';
import { setInvulnerable } from '../../src/game/game';
import { gs } from '../../src/game/state';
import { Kind, spawn, type World } from '../../src/game/world';
import { SPACE_TABLE } from '../../src/core/physics';
import { DT, makeGame } from './helpers';

afterEach(() => {
  bus.clear();
  vi.restoreAllMocks();
});

/** Fire one bullet from (100, 0) straight at the ship at the origin, no charge. */
function fireAtShip(w: World): number {
  return spawnEnemyBullet(w, 100, 0, Math.PI, 200, 6, 1, 0);
}

function runUntilGone(w: World, id: number, maxSteps = 240): void {
  const p = enemyBulletsOf(w);
  for (let i = 0; i < maxSteps && p.alive[id] === 1; i++) stepEnemyBullets(w, DT);
}

describe('ship contact', () => {
  it('kills the ship on contact: lives minus 1, bullet consumed', () => {
    const { w } = makeGame();
    const lives = gs(w).lives;
    const id = fireAtShip(w);
    runUntilGone(w, id);
    expect(w.ship.active).toBe(false);
    expect(gs(w).lives).toBe(lives - 1);
    expect(enemyBulletsOf(w).alive[id]).toBe(0);
    expect(enemyBulletsOf(w).liveCount).toBe(0);
  });

  it('respawn invulnerability: not killed, bullet consumed', () => {
    const { w } = makeGame();
    w.ship.invuln = 2;
    const lives = gs(w).lives;
    const id = fireAtShip(w);
    runUntilGone(w, id, 60);
    expect(w.ship.active).toBe(true);
    expect(gs(w).lives).toBe(lives);
    // Consumed at the ship, not flown on to the wall: 100 u at 200 u/s is well under 60 steps.
    expect(enemyBulletsOf(w).alive[id]).toBe(0);
  });

  it('stress invulnerable flag: not killed, bullet consumed', () => {
    const { w } = makeGame();
    setInvulnerable(w, true);
    const lives = gs(w).lives;
    const id = fireAtShip(w);
    runUntilGone(w, id, 60);
    expect(w.ship.active).toBe(true);
    expect(gs(w).lives).toBe(lives);
    expect(enemyBulletsOf(w).alive[id]).toBe(0);
  });

  it('a charging bullet on the ship never collides', () => {
    const { w } = makeGame();
    const id = spawnEnemyBullet(w, 0, 0, 0, 200, 6, 3, 0.6);
    for (let i = 0; i < 70; i++) stepEnemyBullets(w, DT);
    expect(w.ship.active).toBe(true);
    expect(enemyBulletsOf(w).alive[id]).toBe(1);
  });
});

describe('isolation', () => {
  it('touches no enemy, part, hazard, drone, twin or geom on its path', () => {
    const { w } = makeGame();
    const kinds = [Kind.Grunt, Kind.Boss, Kind.BossPart, Kind.BossHazard, Kind.Drone, Kind.DroneTwin, Kind.Geom, Kind.Mine];
    const ids: number[] = [];
    for (let k = 0; k < kinds.length; k++) {
      const id = spawn(w, kinds[k] ?? Kind.Grunt, -300 + k * 80, 200);
      w.radius[id] = 14;
      w.hp[id] = 5;
      ids.push(id);
    }
    const before = {
      alive: Array.from(w.alive),
      kind: Array.from(w.kind),
      x: Array.from(w.x),
      y: Array.from(w.y),
      vx: Array.from(w.vx),
      vy: Array.from(w.vy),
      hp: Array.from(w.hp),
      t: Array.from(w.t),
      a: Array.from(w.a),
      liveCount: w.liveCount,
    };
    const lives = gs(w).lives;
    const score = gs(w).score;
    const b = spawnEnemyBullet(w, -500, 200, 0, 240, 6, 2, 0);
    const p = enemyBulletsOf(w);
    // 900 u to x 400 at 240 u/s is 3.75 s: still alive past every entity.
    for (let i = 0; i < 450; i++) stepEnemyBullets(w, DT);
    expect(p.alive[b]).toBe(1);
    expect(p.x[b]).toBeGreaterThan(350);
    expect({
      alive: Array.from(w.alive),
      kind: Array.from(w.kind),
      x: Array.from(w.x),
      y: Array.from(w.y),
      vx: Array.from(w.vx),
      vy: Array.from(w.vy),
      hp: Array.from(w.hp),
      t: Array.from(w.t),
      a: Array.from(w.a),
      liveCount: w.liveCount,
    }).toEqual(before);
    expect(gs(w).lives).toBe(lives);
    expect(gs(w).score).toBe(score);
    expect(ids.length).toBe(kinds.length);
  });
});

interface Snapshot {
  alive: number[];
  x: number[];
  y: number[];
  vx: number[];
  vy: number[];
  life: number[];
  arm: number[];
  tier: number[];
  free: number[];
  freeTop: number;
  liveCount: number;
  dropped: number;
  lives: number;
}

function snap(p: EnemyBulletPool, w: World): Snapshot {
  return {
    alive: Array.from(p.alive),
    x: Array.from(p.x),
    y: Array.from(p.y),
    vx: Array.from(p.vx),
    vy: Array.from(p.vy),
    life: Array.from(p.life),
    arm: Array.from(p.arm),
    tier: Array.from(p.tier),
    free: Array.from(p.free),
    freeTop: p.freeTop,
    liveCount: p.liveCount,
    dropped: p.dropped,
    lives: gs(w).lives,
  };
}

/**
 * A fixed spawn script over 20 s: every 0.25 s a muzzle on a circle of radius 380 fires at the
 * ship, which walks a fixed path. The ship is invulnerable so bullets are consumed on contact and
 * the run lasts. Returns a snapshot every second.
 */
function script(): Snapshot[] {
  const { w } = makeGame();
  setInvulnerable(w, true);
  const out: Snapshot[] = [];
  const total = 20 * 120;
  for (let s = 0; s < total; s++) {
    const t = s * DT;
    w.x[0] = Math.cos(t * 0.7) * 150;
    w.y[0] = Math.sin(t * 1.1) * 120;
    if (s % 30 === 0) {
      const n = s / 30;
      const mx = Math.cos(n * 0.9) * 380;
      const my = Math.sin(n * 0.9) * 380;
      const heading = Math.atan2((w.y[0] ?? 0) - my, (w.x[0] ?? 0) - mx);
      spawnEnemyBullet(w, mx, my, heading, 160 + (n % 5) * 30, 6, 1 + (n % 3), 0.6 + (n % 3) * 0.2);
    }
    stepEnemyBullets(w, DT);
    if (s % 120 === 119) out.push(snap(enemyBulletsOf(w), w));
  }
  return out;
}

describe('determinism', () => {
  it('the same spawn script gives identical pool arrays over 20 s', () => {
    const a = script();
    const b = script();
    expect(a.length).toBe(20);
    expect(a).toEqual(b);
    // The script really exercises the pool.
    expect(a.some((s) => s.liveCount > 3)).toBe(true);
  });

  it('runs with Math.random stubbed to throw', () => {
    const { w } = makeGame();
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random called');
    });
    expect(() => {
      for (let n = 0; n < 40; n++) spawnEnemyBullet(w, -300 + n * 10, 300, n * 0.4, 200, 6, 1, 0.6);
      for (let s = 0; s < 1200; s++) stepEnemyBullets(w, DT);
      fireAtShip(w);
      for (let s = 0; s < 120; s++) stepEnemyBullets(w, DT);
      clearEnemyBullets(w);
      dodgeSeconds(SPACE_TABLE.high, 24);
    }).not.toThrow();
    expect(enemyBulletsOf(w).dropped).toBe(8);
    expect(w.ship.active).toBe(false);
  });
});
