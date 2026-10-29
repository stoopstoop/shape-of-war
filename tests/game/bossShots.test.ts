// Boss shots (docs/13 "Boss projectiles", docs/12 wave V3-B item 5): the pool wiring in stepGame,
// killShip and triggerBomb; Spindle's pellet and Ember's fan; the 300 u wait and recheck; the
// heading fixed at the charge start; fx:bossShot once per volley at launch; the 240 u/s cap under
// enrage; the dodge budget at High; and cut 5 (empty rows) reverting the trades.
import { afterEach, describe, expect, it } from 'vitest';
import { SPACE_TABLE } from '../../src/core/physics';
import { bus } from '../../src/core/events';
import { damageBoss } from '../../src/game/bosses/core';
import { EmberMove, speedFor } from '../../src/game/bosses/ember';
import { hazardTelegraph } from '../../src/game/bosses/kit';
import { fanHeading, inShotRange, shotSpeed, volleyCount } from '../../src/game/bosses/shots';
import { armTelegraphNear, liveSweep, pelletEvery } from '../../src/game/bosses/spindle';
import {
  BOSS_SHOTS,
  BOSS_TABLE,
  EMBER,
  emberFanRest,
  SHOT_RECHECK_SEC,
  SHOT_SPREAD_MIN_DEG,
  SHOT_VOLLEY_MAX,
  spindleArmRate,
  SPINDLE,
  type ShotRow,
} from '../../src/game/bosses/table';
import {
  dodgeSeconds,
  ENEMY_BULLET_MIN_RANGE,
  ENEMY_BULLET_RADIUS,
  ENEMY_BULLET_SPEED_MAX,
  enemyBulletsOf,
  spawnEnemyBullet,
} from '../../src/game/enemyBullets';
import { stepGame } from '../../src/game/game';
import { killShip } from '../../src/game/player';
import { setShipSpace, SHIP_RADIUS } from '../../src/game/ship';
import { gs } from '../../src/game/state';
import type { World } from '../../src/game/world';
import type { BossId } from '../../src/levelgen/leveldef';
import { bs, bossGame, enter, park, run } from './bossHelpers';
import { DT, idle, makeGame } from './helpers';

afterEach(() => bus.clear());

const DEG = Math.PI / 180;

/** Live pool ids that are charging (arm above 0). */
function charging(w: World): number[] {
  const p = enemyBulletsOf(w);
  const out: number[] = [];
  for (let i = 0; i < p.cap; i++) if (p.alive[i] === 1 && (p.arm[i] ?? 0) > 0) out.push(i);
  return out;
}

function placeBoss(w: World, x: number, y: number): void {
  const id = bs(w).id;
  w.x[id] = x;
  w.y[id] = y;
  w.prevX[id] = x;
  w.prevY[id] = y;
}

/** Count fx:bossShot events into the returned array (step indices filled by the caller's clock). */
function shotLog(): { n: number } {
  const log = { n: 0 };
  bus.on('fx:bossShot', () => {
    log.n++;
  });
  return log;
}

/** Spindle with the ship parked in a far corner, out of the arms' reach and 300 u from any muzzle. */
function farSpindle(shield = true): World {
  const w = bossGame('spindle', { lives: 9 }, {}, shield);
  park(w, 650, 420);
  enter(w);
  return w;
}

/** Ember set up for an open floor dash that ends well over 300 u from the ship. */
function openFloorEmber(): World {
  const w = bossGame('ember');
  park(w, 450, 0);
  enter(w);
  placeBoss(w, -500, 0);
  return w;
}

function untilState(w: World, state: number, maxSec = 6): number {
  const s = bs(w);
  for (let i = 0; i < maxSec * 120; i++) {
    if (s.n0 === state) return i;
    stepGame(w, DT, idle());
  }
  throw new Error(`state ${state} never reached`);
}

describe('pool wiring', () => {
  it('a world without a boss has no pool, through bombs, deaths and a minute of play', () => {
    const { w } = makeGame({ lives: 5 });
    for (let i = 0; i < 120 * 60; i++) {
      const input = idle();
      input.bomb = i % 1200 === 600;
      stepGame(w, DT, input);
      if (i === 3000) killShip(w);
    }
    expect(enemyBulletsOf(w).cap).toBe(0);
    // A boss that does not shoot never makes one either.
    const v = bossGame('warden');
    park(v, 500, 300);
    enter(v);
    run(v, 30);
    expect(enemyBulletsOf(v).cap).toBe(0);
  });

  it('a bomb clears charging and flying bullets', () => {
    const w = farSpindle();
    spawnEnemyBullet(w, -600, -400, 0, 180, ENEMY_BULLET_RADIUS, 1, 1.0);
    spawnEnemyBullet(w, -600, -300, 0, 180, ENEMY_BULLET_RADIUS, 1, 0);
    stepGame(w, DT, idle());
    expect(enemyBulletsOf(w).liveCount).toBe(2);
    const input = idle();
    input.bomb = true;
    stepGame(w, DT, input);
    expect(enemyBulletsOf(w).liveCount).toBe(0);
  });

  it('a bomb during a pellet charge clears it and no fx:bossShot follows', () => {
    const w = farSpindle();
    const log = shotLog();
    for (let i = 0; i < 120 * 8 && charging(w).length === 0; i++) stepGame(w, DT, idle());
    expect(charging(w).length).toBe(1);
    const before = log.n;
    const input = idle();
    input.bomb = true;
    stepGame(w, DT, input);
    expect(enemyBulletsOf(w).liveCount).toBe(0);
    run(w, 1.2);
    expect(log.n).toBe(before);
  });

  it('a ship death clears every bullet', () => {
    const w = farSpindle(false);
    w.ship.invuln = 0;
    spawnEnemyBullet(w, -600, -400, 0, 180, ENEMY_BULLET_RADIUS, 1, 1.0);
    spawnEnemyBullet(w, -600, -300, 0, 180, ENEMY_BULLET_RADIUS, 1, 0);
    killShip(w);
    expect(enemyBulletsOf(w).liveCount).toBe(0);
  });

  it('a contact kills the ship in the same step', () => {
    const w = farSpindle(false);
    w.ship.invuln = 0;
    const lives = gs(w).lives;
    const sx = w.x[0] ?? 0;
    const sy = w.y[0] ?? 0;
    // Launched, just outside contact, flying at the ship: one step closes the gap.
    spawnEnemyBullet(w, sx - (SHIP_RADIUS + ENEMY_BULLET_RADIUS + 0.5), sy, 0, 180, ENEMY_BULLET_RADIUS, 1, 0);
    stepGame(w, DT, idle());
    expect(w.ship.active).toBe(false);
    expect(gs(w).lives).toBe(lives - 1);
    expect(enemyBulletsOf(w).liveCount).toBe(0);
  });

  it('level end clears the bullets', () => {
    const w = bossGame('spindle', { lives: 1 }, {}, false);
    park(w, 650, 420);
    enter(w);
    w.ship.invuln = 0;
    killShip(w);
    spawnEnemyBullet(w, -600, -400, 0, 180, ENEMY_BULLET_RADIUS, 1, 1.0);
    stepGame(w, DT, idle());
    expect(gs(w).outcome).toBe('lost');
    expect(enemyBulletsOf(w).liveCount).toBe(0);
  });
});

describe('spindle pellet', () => {
  it('the row: one 180 u/s bullet every 3.0 s, 3.6 s in phase 2, arms at 0.4 rad/s', () => {
    const row = BOSS_SHOTS.spindle;
    expect(row).toBeDefined();
    if (row === undefined) return;
    expect(row.pattern).toBe('pellet');
    expect(volleyCount(row)).toBe(1);
    expect(row.speed).toBe(180);
    expect(pelletEvery(row, 1)).toBe(3.0);
    expect(pelletEvery(row, 2)).toBe(3.6);
    expect(spindleArmRate()).toBe(0.4);
  });

  it('the arms turn at 0.4 rad/s in play', () => {
    const w = farSpindle();
    const s = bs(w);
    run(w, hazardTelegraph(1) + 0.1);
    const h = liveSweep(w, s);
    const r0 = w.rot[h] ?? 0;
    run(w, 1);
    expect(liveSweep(w, s)).toBe(h);
    expect((w.rot[h] ?? 0) - r0).toBeCloseTo(0.4, 2);
  });

  function launches(w: World, secs: number): number[] {
    const at: number[] = [];
    let step = 0;
    bus.on('fx:bossShot', () => at.push(step));
    for (; step < secs * 120; step++) stepGame(w, DT, idle());
    return at;
  }

  it('fires every 3.0 s at the soonest, and exactly 3.0 s when no arm telegraph is near', () => {
    const w = farSpindle();
    const at = launches(w, 40);
    expect(at.length).toBeGreaterThanOrEqual(8);
    const gaps = at.slice(1).map((v, i) => (v - (at[i] ?? 0)) * DT);
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(3.0 - DT * 1.5);
    expect(gaps.some((g) => Math.abs(g - 3.0) < DT * 1.5)).toBe(true);
  });

  it('fires every 3.6 s at the soonest in phase 2', () => {
    const w = farSpindle();
    const s = bs(w);
    damageBoss(w, s.maxHp / 2 + 10, 0, 0);
    expect(s.phase).toBe(2);
    run(w, 1.5);
    const at = launches(w, 40);
    expect(at.length).toBeGreaterThanOrEqual(6);
    const gaps = at.slice(1).map((v, i) => (v - (at[i] ?? 0)) * DT);
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(3.6 - DT * 1.5);
    expect(gaps.some((g) => Math.abs(g - 3.6) < DT * 1.5)).toBe(true);
  });

  it('is silent while an arm reversal telegraph shows: no charge starts and none launches', () => {
    const w = farSpindle();
    const s = bs(w);
    const p = () => enemyBulletsOf(w);
    let launchedNow = false;
    bus.on('fx:bossShot', () => {
      launchedNow = true;
    });
    let reversals = 0;
    let lastSweep = liveSweep(w, s);
    let shots = 0;
    for (let i = 0; i < 120 * 45; i++) {
      const before = p().liveCount;
      launchedNow = false;
      stepGame(w, DT, idle());
      const h = liveSweep(w, s);
      if (h !== lastSweep || (h > 0 && (w.t[h] ?? 0) <= DT * 1.5)) reversals++;
      lastSweep = h;
      const showing = h < 0 || (w.t[h] ?? 0) < (s.hzTele[h] ?? 0);
      const spawned = p().liveCount > before;
      if (spawned) shots++;
      if (showing) {
        expect(spawned).toBe(false);
        expect(launchedNow).toBe(false);
      }
    }
    expect(reversals).toBeGreaterThanOrEqual(8);
    expect(shots).toBeGreaterThanOrEqual(8);
  });

  it('armTelegraphNear blocks a charge that would still be charging when the next reversal starts', () => {
    const w = farSpindle();
    const s = bs(w);
    run(w, hazardTelegraph(1) + 0.2);
    const h = liveSweep(w, s);
    s.t0 = 2;
    expect(armTelegraphNear(w, s, h, DT, DT)).toBe(false);
    s.t0 = SPINDLE.reverseEvery - hazardTelegraph(1) + 0.01;
    expect(armTelegraphNear(w, s, h, DT, DT)).toBe(true);
    // Enraged, the reversal clock runs 1.3 times faster, so the block starts earlier.
    s.t0 = SPINDLE.reverseEvery - hazardTelegraph(1) - 0.1;
    expect(armTelegraphNear(w, s, h, DT, DT)).toBe(false);
    expect(armTelegraphNear(w, s, h, DT, DT * 1.3)).toBe(true);
  });

  it('the heading is fixed at the charge start, aimed at the ship with no lead', () => {
    const w = farSpindle();
    const s = bs(w);
    for (let i = 0; i < 120 * 8 && charging(w).length === 0; i++) stepGame(w, DT, idle());
    const ids = charging(w);
    expect(ids.length).toBe(1);
    const b = ids[0] ?? 0;
    const pool = enemyBulletsOf(w);
    const vx = pool.vx[b] ?? 0;
    const vy = pool.vy[b] ?? 0;
    expect(Math.hypot(vx, vy)).toBeCloseTo(180, 3);
    // Aimed from the muzzle at the ship where it stood at the charge start.
    const aim = Math.atan2(420 - (pool.y[b] ?? 0), 650 - (pool.x[b] ?? 0));
    expect(Math.atan2(vy, vx)).toBeCloseTo(aim, 2);
    // The ship moves during the charge; the heading does not follow.
    park(w, 650, -420);
    const x0 = pool.x[b] ?? 0;
    for (let i = 0; i < 120 * 2; i++) {
      stepGame(w, DT, idle());
      if (pool.alive[b] !== 1) break;
      expect(pool.vx[b]).toBe(vx);
      expect(pool.vy[b]).toBe(vy);
    }
    expect(pool.x[b]).not.toBe(x0);
    void s;
  });

  it('a due pellet waits while the ship is within 300 u of the muzzle and rechecks every 0.3 s', () => {
    const w = farSpindle();
    const s = bs(w);
    run(w, hazardTelegraph(1) + 0.3);
    s.t0 = 1.2;
    s.shotT = 3.0; // due now
    const boss = s.id;
    park(w, (w.x[boss] ?? 0) + 120, w.y[boss] ?? 0);
    stepGame(w, DT, idle());
    expect(enemyBulletsOf(w).cap === 0 || enemyBulletsOf(w).liveCount === 0).toBe(true);
    expect(s.shotWait).toBeGreaterThan(0);
    expect(s.shotWait).toBeLessThanOrEqual(SHOT_RECHECK_SEC);
    // Still near: still waiting after a recheck.
    for (let i = 0; i < 60; i++) {
      park(w, (w.x[boss] ?? 0) + 120, w.y[boss] ?? 0);
      stepGame(w, DT, idle());
    }
    expect(enemyBulletsOf(w).cap === 0 || enemyBulletsOf(w).liveCount === 0).toBe(true);
    // Away: it fires at the next recheck, within 0.3 s.
    park(w, 650, 420);
    let n = 0;
    for (; n < 120 && charging(w).length === 0; n++) stepGame(w, DT, idle());
    expect(charging(w).length).toBe(1);
    expect(n * DT).toBeLessThanOrEqual(SHOT_RECHECK_SEC + DT);
    expect(inShotRange(ENEMY_BULLET_MIN_RANGE)).toBe(true);
    expect(inShotRange(ENEMY_BULLET_MIN_RANGE - 1)).toBe(false);
  });

  it('fx:bossShot fires once per pellet, at launch, a telegraph after the charge starts', () => {
    const w = farSpindle();
    let launchStep = -1;
    let step = 0;
    let events = 0;
    bus.on('fx:bossShot', (e) => {
      events++;
      launchStep = step;
      expect(e.id).toBe('spindle');
    });
    let chargeStep = -1;
    for (; step < 120 * 8 && launchStep < 0; step++) {
      stepGame(w, DT, idle());
      if (chargeStep < 0 && charging(w).length > 0) chargeStep = step;
    }
    expect(events).toBe(1);
    expect((launchStep - chargeStep) * DT).toBeCloseTo(hazardTelegraph(1), 1);
    const pool = enemyBulletsOf(w);
    let flying = 0;
    for (let i = 0; i < pool.cap; i++) if (pool.alive[i] === 1 && (pool.arm[i] ?? 0) <= 0) flying++;
    expect(flying).toBe(1);
  });
});

describe('ember fan', () => {
  it('the row: three 210 u/s bullets 14 deg apart, the rest 1.8 s', () => {
    const row = BOSS_SHOTS.ember;
    expect(row).toBeDefined();
    if (row === undefined) return;
    expect(row.pattern).toBe('fan');
    expect(volleyCount(row)).toBe(3);
    expect(row.spreadDeg).toBe(14);
    expect(row.speed).toBe(210);
    expect(emberFanRest()).toBe(1.8);
    expect(EMBER.restSec).toBe(1.2);
  });

  it('after an open floor dash: rests 1.8 s, three bullets 14 deg apart charge at once and launch 0.8 s in', () => {
    const w = openFloorEmber();
    const s = bs(w);
    let events = 0;
    let launchAt = -1;
    let step = 0;
    bus.on('fx:bossShot', (e) => {
      events++;
      launchAt = step;
      expect(e.id).toBe('ember');
    });
    for (; step < 120 * 6 && s.n0 !== EmberMove.Rest; step++) stepGame(w, DT, idle());
    const restAt = step;
    const ids = charging(w);
    expect(ids.length).toBe(3);
    const pool = enemyBulletsOf(w);
    const heads = ids.map((i) => Math.atan2(pool.vy[i] ?? 0, pool.vx[i] ?? 0)).sort((a, b) => a - b);
    expect((heads[1] ?? 0) - (heads[0] ?? 0)).toBeCloseTo(14 * DEG, 4);
    expect((heads[2] ?? 0) - (heads[1] ?? 0)).toBeCloseTo(14 * DEG, 4);
    // The middle one at the ship (450, 0).
    const b = ids[0] ?? 0;
    expect(heads[1] ?? 0).toBeCloseTo(Math.atan2(0 - (pool.y[b] ?? 0), 450 - (pool.x[b] ?? 0)), 3);
    for (const i of ids) expect(Math.hypot(pool.vx[i] ?? 0, pool.vy[i] ?? 0)).toBeCloseTo(210, 3);
    let restSteps = 0;
    for (; step < restAt + 120 * 4 && s.n0 === EmberMove.Rest; step++) {
      stepGame(w, DT, idle());
      restSteps++;
    }
    expect(restSteps * DT).toBeCloseTo(1.8, 1);
    expect(events).toBe(1);
    expect((launchAt - restAt) * DT).toBeCloseTo(hazardTelegraph(2), 1);
  });

  it('no fan after a wall hit: the stun lasts 2 s and nothing is fired', () => {
    const w = bossGame('ember');
    park(w, 640, 0);
    enter(w);
    placeBoss(w, 300, 0);
    const log = shotLog();
    untilState(w, EmberMove.Stun);
    run(w, EMBER.stunSec);
    expect(log.n).toBe(0);
    expect(enemyBulletsOf(w).cap).toBe(0);
  });

  it('a fan waits while the ship is within 300 u, then fires if it can still launch inside the rest', () => {
    const w = bossGame('ember');
    park(w, 100, 0);
    enter(w);
    placeBoss(w, -300, 0);
    const s = bs(w);
    untilState(w, EmberMove.Rest);
    expect(charging(w).length).toBe(0);
    expect(s.shotWait).toBeGreaterThan(0);
    park(w, 600, 400);
    let n = 0;
    for (; n < 120 && charging(w).length === 0; n++) stepGame(w, DT, idle());
    expect(charging(w).length).toBe(3);
    expect(n * DT).toBeLessThanOrEqual(SHOT_RECHECK_SEC + DT);
    expect(s.n0).toBe(EmberMove.Rest);
  });

  it('a fan that could no longer launch inside the rest is skipped', () => {
    const w = bossGame('ember');
    park(w, 100, 0);
    enter(w);
    placeBoss(w, -300, 0);
    const s = bs(w);
    untilState(w, EmberMove.Rest);
    // Stay near for most of the rest, then step away with under 0.8 s left.
    for (let i = 0; i < 120 * 1.2; i++) stepGame(w, DT, idle());
    park(w, 600, 400);
    const log = shotLog();
    for (let i = 0; i < 120 * 2; i++) stepGame(w, DT, idle());
    expect(log.n).toBe(0);
    expect(s.t2).toBe(0);
  });

  it('bullet speed stays at most 240 u/s in phase 3 and enraged', () => {
    const w = openFloorEmber();
    const s = bs(w);
    s.phase = 3;
    s.hold = true; // enraged at once
    untilState(w, EmberMove.Rest);
    const ids = charging(w);
    expect(ids.length).toBe(3);
    const pool = enemyBulletsOf(w);
    for (const i of ids) {
      const v = Math.hypot(pool.vx[i] ?? 0, pool.vy[i] ?? 0);
      expect(v).toBeLessThanOrEqual(ENEMY_BULLET_SPEED_MAX + 1e-3);
      expect(v).toBeCloseTo(Math.min(210 * speedFor(3), 240), 3);
    }
    // And Spindle's pellet keeps 180 enraged.
    const v = farSpindle();
    bs(v).hold = true;
    for (let i = 0; i < 120 * 8 && charging(v).length === 0; i++) stepGame(v, DT, idle());
    const pv = enemyBulletsOf(v);
    const b = charging(v)[0] ?? 0;
    expect(Math.hypot(pv.vx[b] ?? 0, pv.vy[b] ?? 0)).toBeCloseTo(180, 3);
  });
});

describe('fairness of the shots', () => {
  const rows = Object.entries(BOSS_SHOTS) as [BossId, ShotRow][];

  it('every row: speed at most 240 at any phase, volleys at most 5, fan neighbours at least 12 deg apart', () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const [id, row] of rows) {
      for (const mul of [1, 1.15, 1.3225, 2]) expect(shotSpeed(row, mul)).toBeLessThanOrEqual(ENEMY_BULLET_SPEED_MAX);
      expect(volleyCount(row)).toBeLessThanOrEqual(SHOT_VOLLEY_MAX);
      if (volleyCount(row) > 1) expect(row.spreadDeg ?? 0).toBeGreaterThanOrEqual(SHOT_SPREAD_MIN_DEG);
      expect(['spindle', 'ember', 'bastion']).toContain(id);
    }
    expect(fanHeading(0, 0, 3, 14 * DEG)).toBeCloseTo(-14 * DEG);
    expect(fanHeading(0, 1, 3, 14 * DEG)).toBeCloseTo(0);
  });

  it('dodge: a ship at rest at High clears every pattern in the time the telegraph and flight allow', () => {
    // Clear the ship's radius and the bullet's with 8 u to spare.
    const clearance = SHIP_RADIUS + ENEMY_BULLET_RADIUS + 8;
    const dodge = dodgeSeconds(SPACE_TABLE.high, clearance);
    expect(dodge).toBeLessThanOrEqual(0.35);
    for (const [id, row] of rows) {
      const tier = BOSS_TABLE[id].tier;
      // Worst case: the fastest the bullet can fly (phase speed up and the cap) from the nearest muzzle.
      const flight = ENEMY_BULLET_MIN_RANGE / shotSpeed(row, 10);
      expect(flight).toBeGreaterThanOrEqual(1.25);
      // Even counting only the flight (the ship ignores the charge), the dodge fits with room to spare.
      expect(flight).toBeGreaterThan(dodge + 0.9);
      expect(hazardTelegraph(tier) + flight).toBeGreaterThan(dodge * 5);
      if (volleyCount(row) > 1) {
        // A fan leaves room between neighbours at the minimum range: the gap between bullet edges
        // is more than the ship's diameter, and a sidestep of the clearance lands inside it.
        const spread = (row.spreadDeg ?? 0) * DEG;
        const centres = 2 * ENEMY_BULLET_MIN_RANGE * Math.sin(spread / 2);
        const edgeGap = centres - 2 * ENEMY_BULLET_RADIUS;
        expect(edgeGap).toBeGreaterThan(2 * SHIP_RADIUS * 2);
        expect(clearance + SHIP_RADIUS + ENEMY_BULLET_RADIUS).toBeLessThanOrEqual(centres);
      }
    }
  });

  it('dodge in play: at High, a ship that starts its sidestep only at launch survives a minute of pellets', () => {
    const w = bossGame('spindle', { lives: 3 }, {}, false);
    setShipSpace(w, 'high');
    park(w, 650, 420);
    w.ship.invuln = 0;
    enter(w);
    let dodging = 0;
    let dir = 1;
    let shots = 0;
    let dx = 0;
    let dy = 0;
    bus.on('fx:bossShot', () => {
      shots++;
      // The flying pellet's heading, then a sidestep square to it, alternating sides.
      const pool = enemyBulletsOf(w); // read now: the pool is created by the first shot
      for (let i = 0; i < pool.cap; i++) {
        if (pool.alive[i] !== 1 || (pool.arm[i] ?? 0) > 0) continue;
        const a = Math.atan2(pool.vy[i] ?? 0, pool.vx[i] ?? 0);
        dx = Math.cos(a + (dir * Math.PI) / 2);
        dy = Math.sin(a + (dir * Math.PI) / 2);
      }
      dir = -dir;
      // Hold the stick for the dodge time with a little margin, then let go and coast.
      dodging = dodgeSeconds(SPACE_TABLE.high, SHIP_RADIUS + ENEMY_BULLET_RADIUS + 8) + 0.05;
    });
    for (let i = 0; i < 120 * 60; i++) {
      const input = idle();
      if (dodging > 0) input.move = { active: true, x: dx, y: dy };
      dodging -= DT;
      stepGame(w, DT, input);
    }
    expect(shots).toBeGreaterThanOrEqual(10);
    expect(gs(w).lives).toBe(3);
    expect(w.ship.active).toBe(true);
  });
});

describe('cut 5: empty shot rows revert the trades and fire nothing', () => {
  it('Spindle arms back to 0.5 rad/s and no pellet; Ember rests 1.2 s with no fan', () => {
    const table = BOSS_SHOTS as Partial<Record<BossId, ShotRow>>;
    const saved = { ...table };
    delete table.spindle;
    delete table.ember;
    try {
      expect(spindleArmRate()).toBe(SPINDLE.armRate);
      expect(emberFanRest()).toBe(EMBER.restSec);
      const v = farSpindle();
      run(v, 20);
      expect(enemyBulletsOf(v).cap).toBe(0);
      const w = openFloorEmber();
      const s = bs(w);
      untilState(w, EmberMove.Rest);
      let rest = 1;
      while (s.n0 === EmberMove.Rest && rest < 600) {
        stepGame(w, DT, idle());
        rest++;
      }
      expect(rest * DT).toBeCloseTo(EMBER.restSec, 1);
      expect(enemyBulletsOf(w).cap).toBe(0);
    } finally {
      Object.assign(table, saved);
    }
    expect(BOSS_SHOTS.spindle?.armRate).toBe(0.4);
  });
});
