// Fury fixes (Ryan's device check on 4a5e3bc and his rulings, 2026-11-12): the gate aware fight bot
// and Mirage's wider, slower arc on 1150 hit points; Mirage's aimed lane; the Brood pincer telegraph
// fields and faster drive; Gravitas shelter pools (spawn, cap, shrink, clear, the slot reserve), the
// shelter (no pull or push) and the float (ShipState.float, the 'high' thrust for one step).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bus } from '../../src/core/events';
import { createThrustOut, stepThrust, stepThrustRow } from '../../src/core/physics';
import {
  bossOnBomb,
  bossOnShipDeath,
  countHazards,
  damageBoss,
  damageBossPart,
  hazardLethalAt,
  livePart,
  poolRadiusAt,
  shipSheltered,
  spawnLaneMarker,
  spawnRing,
} from '../../src/game/bosses/core';
import { Pincer } from '../../src/game/bosses/brood';
import { countPools, dropPool } from '../../src/game/bosses/gravitas';
import { BOSS_TABLE, BROOD_FRENZY, CRACK_AT, GRAVITAS, GRAVITAS_FURY, GRAVITAS_ORB, GRAVITAS_POOL, MAX_HAZARDS, MIRAGE } from '../../src/game/bosses/table';
import { HazardType } from '../../src/game/bosses/types';
import { createBossView, readBoss } from '../../src/game/bosses/view';
import { stepGame } from '../../src/game/game';
import { SHIP_SPEED } from '../../src/game/ship';
import { gs } from '../../src/game/state';
import { Kind, type World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import { BOSS_IDS } from '../../src/levelgen/leveldef';
import { CHASE_MAX, CHASE_MIN, CHASE_SPEED, chaseArc, fightSeconds } from './bossFightBot';
import { bs, bossGame, enter, park, run } from './bossHelpers';
import { DT, idle, makeGame } from './helpers';

afterEach(() => {
  bus.clear();
  vi.restoreAllMocks();
});

function placeBoss(w: World, x: number, y: number): void {
  const id = bs(w).id;
  w.x[id] = x;
  w.y[id] = y;
  w.prevX[id] = x;
  w.prevY[id] = y;
}

function pools(w: World): number[] {
  const out: number[] = [];
  for (let h = 1; h < w.cap; h++) if (w.alive[h] === 1 && w.kind[h] === Kind.BossHazard && w.a[h] === HazardType.Pool) out.push(h);
  return out;
}

function stick(x: number, y: number): InputState {
  const i = idle();
  i.move = { active: true, x, y };
  return i;
}

// ---------------------------------------------------------------------------------------------
// Fight bot and Mirage numbers

/** Bot steps to the kill on main before this wave (default level, Normal); every non gated guardian keeps them. */
const MAIN_BOT_STEPS: Readonly<Record<string, number>> = {
  warden: 8972,
  brood: 5325,
  spindle: 9539,
  ember: 10888,
  gravitas: 9387, // fury orbs: 1300 hit points (12079 on 1704)
  bastion: 13677,
  tempest: 14486,
  twins: 14999,
  prism: 18059,
};

describe('fury fixes: the gate aware fight bot and Mirage', () => {
  it('Mirage numbers: arc 180 deg at 0.8 rad/s, 650 hit points (fury tune; 1150 at fury fixes), lanes on the bearing', () => {
    expect(MIRAGE.arcDeg).toBe(180);
    expect(MIRAGE.arcRate).toBe(0.8);
    expect(BOSS_TABLE.mirage.hp).toBe(650);
    expect(MIRAGE.laneOffsetDeg).toBe(0);
    expect(CHASE_SPEED).toBe(SHIP_SPEED / 2);
    expect(CHASE_SPEED).toBe(210);
  });

  it('chaseArc circles toward the arc centre at CHASE_SPEED, holding 200 to 300 u', () => {
    const w = bossGame('mirage', { lives: 99 });
    park(w, 250, 0);
    const id = enter(w);
    placeBoss(w, 0, 0);
    w.rot[id] = Math.PI / 2;
    park(w, 250, 0);
    chaseArc(w, id, DT);
    expect(Math.hypot(w.x[0] ?? 0, w.y[0] ?? 0)).toBeCloseTo(250, 3);
    expect(Math.atan2(w.y[0] ?? 0, w.x[0] ?? 0)).toBeCloseTo((CHASE_SPEED * DT) / 250, 5); // toward pi/2
    // Too near: pushed out to CHASE_MIN; too far: pulled in to CHASE_MAX.
    park(w, 100, 0);
    chaseArc(w, id, DT);
    expect(Math.hypot(w.x[0] ?? 0, w.y[0] ?? 0)).toBeCloseTo(CHASE_MIN, 3);
    park(w, 0, -400);
    w.rot[id] = 0;
    chaseArc(w, id, DT);
    expect(Math.hypot(w.x[0] ?? 0, w.y[0] ?? 0)).toBeCloseTo(CHASE_MAX, 3);
    // Within a step of the arc centre it lands on it.
    park(w, 250 * Math.cos(0.001), 250 * Math.sin(0.001));
    chaseArc(w, id, DT);
    expect(Math.atan2(w.y[0] ?? 0, w.x[0] ?? 0)).toBeCloseTo(0, 5);
  });

  it('chaseArc stays put rather than leave the arena', () => {
    const w = bossGame('mirage', { lives: 99 });
    park(w, 0, 0);
    const id = enter(w);
    // The 1400 x 900 quiet arena: the body near the east wall, the ship north of it, the arc east.
    placeBoss(w, 695, 0);
    w.rot[id] = 0;
    park(w, 695, 250);
    chaseArc(w, id, DT);
    expect(w.x[0]).toBe(695);
    expect(w.y[0]).toBe(250);
  });

  it('only Mirage has a gate; Mirage on the gate aware bot reads 35 to 53 s at Normal (fury tune, 650 hit points), Easy shorter, Insane longer', () => {
    for (const id of BOSS_IDS) {
      const w = bossGame(id);
      expect(bs(w).def.gate !== undefined).toBe(id === 'mirage');
    }
    const normal = fightSeconds('mirage', { levelIndex: 25 });
    expect(normal).toBeGreaterThanOrEqual(35);
    expect(normal).toBeLessThanOrEqual(53);
    expect(fightSeconds('mirage', { levelIndex: 25, difficulty: 'easy' })).toBeLessThan(normal);
    expect(fightSeconds('mirage', { levelIndex: 25, difficulty: 'insane' })).toBeGreaterThan(normal);
  });

  it('the gate aware bot lands its hits through the arc: the ship side edge is inside the open half', () => {
    let samples = 0;
    let inside = 0;
    fightSeconds('mirage', {
      levelIndex: 25,
      onStep: (w) => {
        const s = bs(w);
        if (!s.exposed || s.id <= 0 || w.alive[s.id] !== 1 || s.fury === 1) return;
        const a = Math.atan2((w.y[0] ?? 0) - (w.y[s.id] ?? 0), (w.x[0] ?? 0) - (w.x[s.id] ?? 0));
        samples++;
        if (Math.cos(a - (w.rot[s.id] ?? 0)) >= -1e-9) inside++;
      },
    });
    expect(samples).toBeGreaterThan(1000);
    expect(inside / samples).toBeGreaterThan(0.6);
  });

  it('every other guardian keeps its bot seconds from main exactly', () => {
    for (const id of BOSS_IDS) {
      if (id === 'mirage') continue;
      expect(Math.round(fightSeconds(id) * 120)).toBe(MAIN_BOT_STEPS[id]);
    }
    // Runs the fight bot for every guardian: about 3.5 s locally, past the 5 s default on a slow CI runner.
  }, 60_000);
});

// ---------------------------------------------------------------------------------------------
// Brood pincer

function broodFrenzy(): { w: World; parts: number[] } {
  const w = bossGame('brood', { par: 1000 });
  park(w, 0, 0);
  const id = enter(w);
  w.hp[id] = 5;
  damageBoss(w, 10, w.x[id] ?? 0, w.y[id] ?? 0, true);
  expect(bs(w).split).toBe(true);
  const parts = [0, 1, 2].map((k) => livePart(w, bs(w), k));
  damageBossPart(w, parts[0] ?? -1, 99999, 0, 0);
  expect(bs(w).fury).toBe(2);
  return { w, parts };
}

describe('fury fixes: the Brood pincer', () => {
  it('numbers: aim 0.8 s, drive 320 u/s for 1.2 s; reach, everySec and speedMul unchanged', () => {
    expect(BROOD_FRENZY.aimSec).toBe(0.8);
    expect(BROOD_FRENZY.driveSpeed).toBe(320);
    expect(BROOD_FRENZY.driveSec).toBe(1.2);
    expect(BROOD_FRENZY.reach).toBe(140);
    expect(BROOD_FRENZY.everySec).toBe(4);
    expect(BROOD_FRENZY.speedMul).toBe(1.25);
  });

  it('readBoss reads no pincer before the frenzy and for other guardians', () => {
    const w = bossGame('brood');
    park(w, 0, 0);
    enter(w);
    const v = readBoss(w, createBossView());
    expect(v.pincerAim).toBe(-1);
    expect(v.pincerDrive).toBe(false);
    expect(v.pincerA).toBe(-1);
    expect(v.pincerB).toBe(-1);
    const m = bossGame('mirage');
    park(m, 600, 400);
    enter(m);
    expect(readBoss(m, createBossView()).pincerA).toBe(-1);
  });

  it('readBoss writes the aim countdown, the drive, both Broodlings and their drive points', () => {
    const { w, parts } = broodFrenzy();
    const s = bs(w);
    const v = createBossView();
    let guard = 0;
    while ((s.abl[1] ?? 0) !== Pincer.Aim && guard++ < 1200) {
      readBoss(w, v);
      expect(v.pincerAim).toBe(-1);
      expect(v.pincerA).toBe(-1);
      stepGame(w, DT, idle());
    }
    readBoss(w, v);
    expect(v.pincerAim).toBeGreaterThan(BROOD_FRENZY.aimSec - DT * 1.5);
    expect(v.pincerAim).toBeLessThanOrEqual(BROOD_FRENZY.aimSec);
    expect(v.pincerDrive).toBe(false);
    expect(v.pincerA).toBe(parts[1]);
    expect(v.pincerB).toBe(parts[2]);
    expect(v.pincerAx).toBe(s.abl[3 + 2]);
    expect(v.pincerAy).toBe(s.abl[3 + 3]);
    expect(v.pincerBx).toBe(s.abl[3 + 4]);
    expect(v.pincerBy).toBe(s.abl[3 + 5]);
    // The aim counts down for the full 0.8 s, then the drive.
    let aimSteps = 0;
    let last = v.pincerAim ?? 0;
    while ((s.abl[1] ?? 0) === Pincer.Aim && aimSteps < 400) {
      stepGame(w, DT, idle());
      readBoss(w, v);
      if ((s.abl[1] ?? 0) === Pincer.Aim) {
        expect(v.pincerAim).toBeLessThan(last);
        last = v.pincerAim ?? 0;
      }
      aimSteps++;
    }
    expect(aimSteps * DT).toBeGreaterThan(BROOD_FRENZY.aimSec - DT * 2);
    expect(v.pincerDrive).toBe(true);
    expect(v.pincerAim).toBe(-1);
    expect(v.pincerA).toBe(parts[1]);
    // The drive covers 320 u/s.
    const a = parts[1] ?? -1;
    const x0 = w.x[a] ?? 0;
    const y0 = w.y[a] ?? 0;
    stepGame(w, DT, idle());
    expect(Math.hypot((w.x[a] ?? 0) - x0, (w.y[a] ?? 0) - y0)).toBeCloseTo(BROOD_FRENZY.driveSpeed * DT, 2);
    run(w, BROOD_FRENZY.driveSec);
    readBoss(w, v);
    expect(v.pincerDrive).toBe(false);
    expect(v.pincerA).toBe(-1);
    expect(v.pincerB).toBe(-1);
  });

  it('a pincer Broodling that dies reads -1', () => {
    const { w, parts } = broodFrenzy();
    const s = bs(w);
    let guard = 0;
    while ((s.abl[1] ?? 0) !== Pincer.Aim && guard++ < 1200) stepGame(w, DT, idle());
    damageBossPart(w, parts[2] ?? -1, 99999, 0, 0);
    const v = readBoss(w, createBossView());
    expect(v.pincerB).toBe(-1);
    expect(v.pincerA).toBe(parts[1]);
  });
});

// ---------------------------------------------------------------------------------------------
// Gravitas shelter pools

function gravitas(): { w: World; id: number } {
  const w = bossGame('gravitas', { par: 1000, lives: 99 });
  park(w, 0, 0);
  const id = enter(w);
  bs(w).t0 = -1e9; // hold the rings
  return { w, id };
}

function enrage(w: World, furyT = 0): void {
  bs(w).fury = 2;
  bs(w).furyT = furyT;
}

describe('fury fixes: Gravitas shelter pools', () => {
  it('pure: the radius holds 80 u, then shrinks linearly to 0 over the last 2 s', () => {
    expect(GRAVITAS_POOL).toMatchObject({ everySec: 3, radius: 80, lifeSec: 8, fadeSec: 2, max: 4, reserve: 2 });
    expect(poolRadiusAt(0, 8)).toBe(80);
    expect(poolRadiusAt(6, 8)).toBe(80);
    expect(poolRadiusAt(7, 8)).toBeCloseTo(40, 9);
    expect(poolRadiusAt(7.5, 8)).toBeCloseTo(20, 9);
    expect(poolRadiusAt(8, 8)).toBe(0);
    expect(poolRadiusAt(9, 8)).toBe(0);
  });

  it('no pool before the fury', () => {
    const { w } = gravitas();
    run(w, 10);
    expect(countPools(w)).toBe(0);
  });

  it('a pool opens where an orb stops (fury orbs: no pool where Gravitas stands), never lethal, shrinking and gone at 8 s', () => {
    const { w, id } = gravitas();
    park(w, 500, 300);
    enrage(w);
    const s = bs(w);
    let t = 0;
    let bx = 0;
    let by = 0;
    while (countPools(w) === 0 && t < 6) {
      stepGame(w, DT, idle());
      bx = w.x[id] ?? 0;
      by = w.y[id] ?? 0;
      t += DT;
    }
    expect(t).toBeGreaterThan(GRAVITAS_ORB.everySec / 1.31 - DT);
    expect(t).toBeLessThanOrEqual(GRAVITAS_ORB.everySec + GRAVITAS_ORB.maxDist / GRAVITAS_ORB.speed + 2 * DT);
    const p = pools(w)[0] ?? -1;
    expect(w.kind[p]).toBe(Kind.BossHazard);
    expect(w.a[p]).toBe(HazardType.Pool);
    expect(Math.hypot((w.x[p] ?? 0) - bx, (w.y[p] ?? 0) - by)).toBeGreaterThan(GRAVITAS_ORB.minDist);
    expect(w.radius[p]).toBe(GRAVITAS_POOL.radius);
    expect(w.vx[p]).toBe(GRAVITAS_POOL.lifeSec);
    expect(hazardLethalAt(w, s, p, w.x[p] ?? 0, w.y[p] ?? 0)).toBe(false);
    run(w, 6.9);
    expect(w.alive[p]).toBe(1);
    expect(w.radius[p] ?? 0).toBeLessThan(GRAVITAS_POOL.radius);
    expect(w.radius[p] ?? 0).toBeGreaterThan(0);
    expect(w.radius[p] ?? 0).toBeCloseTo(poolRadiusAt(w.t[p] ?? 0, GRAVITAS_POOL.lifeSec), 3);
    expect(hazardLethalAt(w, s, p, w.x[p] ?? 0, w.y[p] ?? 0)).toBe(false);
    run(w, 1.2);
    expect(w.alive[p] === 1 && w.kind[p] === Kind.BossHazard && w.a[p] === HazardType.Pool && (w.t[p] ?? 0) > 7).toBe(false);
  });

  it('at most 4 live: the oldest goes first', () => {
    const { w, id } = gravitas();
    const s = bs(w);
    const made: number[] = [];
    for (let k = 0; k < 5; k++) {
      made.push(dropPool(w, s, w.x[id] ?? 0, w.y[id] ?? 0));
      run(w, 0.1);
    }
    expect(made.every((h) => h > 0)).toBe(true);
    expect(countPools(w)).toBe(GRAVITAS_POOL.max);
    const live = pools(w);
    expect(live).toContain(made[4]);
    expect(Math.max(...live.map((h) => w.t[h] ?? 0))).toBeLessThan(0.45); // the first one (0.5 s old) is gone
  });

  it('a pool never takes the slot a ring needs: skipped once the reserve would be touched', () => {
    const { w, id } = gravitas();
    const s = bs(w);
    while (countHazards(w) < MAX_HAZARDS - GRAVITAS_POOL.reserve - 1) spawnLaneMarker(w, s, 0, 0, 0, 100, 10);
    expect(dropPool(w, s, 0, 0)).toBeGreaterThan(0);
    expect(countHazards(w)).toBe(MAX_HAZARDS - GRAVITAS_POOL.reserve);
    expect(dropPool(w, s, 0, 0)).toBe(-1);
    expect(countHazards(w)).toBe(MAX_HAZARDS - GRAVITAS_POOL.reserve);
    // Both ring slots are still there.
    park(w, 0, 0);
    expect(spawnRing(w, s, w.x[id] ?? 0, w.y[id] ?? 0, GRAVITAS.ringStart, 0, Math.PI / 6, 1, -GRAVITAS.ringCollapse)).toBeGreaterThan(0);
    expect(spawnRing(w, s, w.x[id] ?? 0, w.y[id] ?? 0, GRAVITAS.ringStart, 0, Math.PI / 6, 1, -GRAVITAS.ringCollapse)).toBeGreaterThan(0);
    expect(countHazards(w)).toBe(MAX_HAZARDS);
  });

  it('cleared with the other boss hazards: bomb and ship death', () => {
    const { w, id } = gravitas();
    const s = bs(w);
    dropPool(w, s, w.x[id] ?? 0, w.y[id] ?? 0);
    expect(countPools(w)).toBe(1);
    bossOnBomb(w);
    expect(countPools(w)).toBe(0);
    dropPool(w, s, w.x[id] ?? 0, w.y[id] ?? 0);
    bossOnShipDeath(w);
    expect(countPools(w)).toBe(0);
  });

  it('after the stage 2 split the orbs fly from the pair centre and their pools open on the way to the ship', () => {
    const { w, id } = gravitas();
    park(w, 500, 300);
    enrage(w);
    w.hp[id] = Math.floor(bs(w).maxHp * CRACK_AT[1]) + 5;
    damageBoss(w, 10, w.x[id] ?? 0, w.y[id] ?? 0, true);
    const s = bs(w);
    expect(s.split).toBe(true);
    s.t0 = -1e9;
    let guard = 0;
    while (countPools(w) === 0 && guard++ < 1000) stepGame(w, DT, idle());
    const p = pools(w)[0] ?? -1;
    expect(p).toBeGreaterThan(0);
    const d = Math.hypot((w.x[p] ?? 0) - s.t1, (w.y[p] ?? 0) - s.t2);
    expect(d).toBeGreaterThan(GRAVITAS_ORB.minDist - 20);
    expect(d).toBeLessThan(GRAVITAS_ORB.maxDist + 20);
  });
});

// ---------------------------------------------------------------------------------------------
// Shelter and float

describe('fury fixes: shelter and float', () => {
  it('inside a pool the pull does not reach the ship; outside it does, exactly as before', () => {
    const pulled = gravitas();
    const sheltered = gravitas();
    for (const g of [pulled, sheltered]) {
      enrage(g.w, 0.5);
      placeBoss(g.w, 0, 0);
      park(g.w, 150, 0);
    }
    dropPool(sheltered.w, bs(sheltered.w), 150, 0);
    run(pulled.w, 0.5);
    run(sheltered.w, 0.5);
    expect(150 - (pulled.w.x[0] ?? 0)).toBeGreaterThan(5);
    expect(sheltered.w.x[0]).toBe(150);
    expect(gs(sheltered.w).shipPullX).toBe(0);
  });

  it('inside a pool the tide push does not reach the ship either', () => {
    const { w } = gravitas();
    enrage(w, GRAVITAS_FURY.flipSec + 0.5);
    placeBoss(w, 0, 0);
    park(w, 150, 0);
    dropPool(w, bs(w), 150, 0);
    run(w, 0.5);
    expect(w.x[0]).toBe(150);
  });

  it('a sheltered ship floats: the next step moves on the float row (fury tune); out of the pool it is the v1 path again', () => {
    const { w } = gravitas();
    enrage(w, 0.5);
    placeBoss(w, -500, 0);
    park(w, 300, 0);
    expect(w.ship.space).toBe('off');
    const p = dropPool(w, bs(w), 300, 0);
    stepGame(w, DT, idle());
    expect(shipSheltered(w)).toBe(true);
    expect(w.ship.float).toBe(true);
    const vx0 = w.vx[0] ?? 0;
    const vy0 = w.vy[0] ?? 0;
    const want = stepThrustRow(GRAVITAS_POOL.float, vx0, vy0, 0, 1, true, w.ship.holdT, DT, 1, createThrustOut());
    stepGame(w, DT, stick(0, 1));
    expect(w.vx[0]).toBeCloseTo(want.vx, 6);
    expect(w.vy[0]).toBeCloseTo(want.vy, 6);
    expect(w.vy[0] ?? 0).toBeLessThan(SHIP_SPEED / 4); // a float, not the instant v1 speed
    // Leave the pool: the float is gone the step after.
    w.alive[p] = 0;
    w.kind[p] = Kind.None;
    stepGame(w, DT, stick(0, 1));
    expect(w.ship.float).toBe(false);
    stepGame(w, DT, stick(0, 1));
    expect(w.vy[0]).toBe(SHIP_SPEED);
  });

  it('ship.ts hook: no float, every space level steps exactly as before; a float steps the float row on any level', () => {
    const levels = ['off', 'low', 'medium', 'high'] as const;
    for (const level of levels) {
      const { w } = makeGame();
      w.ship.space = level;
      const out = createThrustOut();
      for (let i = 0; i < 240; i++) {
        const k = Math.hypot(Math.cos(i * 0.05), Math.sin(i * 0.031));
        const mx = (Math.cos(i * 0.05) / k) * 0.9; // inside the unit stick, so the ship takes it as is
        const my = (Math.sin(i * 0.031) / k) * 0.9;
        const held = i % 50 < 40;
        const input = held ? stick(mx, my) : idle();
        const vx0 = w.vx[0] ?? 0;
        const vy0 = w.vy[0] ?? 0;
        const hold = w.ship.holdT;
        w.x[0] = 0; // keep clear of the walls (a wall slide would change the velocity)
        w.y[0] = 0;
        const x0 = w.x[0] ?? 0;
        stepGame(w, DT, input);
        expect(w.ship.float).toBe(false);
        if (level === 'off') {
          expect(w.vx[0]).toBe(held ? Math.fround(mx * SHIP_SPEED) : 0);
        } else {
          stepThrust(level, vx0, vy0, held ? mx : 0, held ? my : 0, held, hold, DT, 1, out);
          expect(w.vx[0]).toBeCloseTo(out.vx, 3);
          expect(w.vy[0]).toBeCloseTo(out.vy, 3);
        }
        expect(Number.isFinite(x0)).toBe(true);
      }
    }
    // Fury tune: a float steps GRAVITAS_POOL.float (not 'high') on every level, 'off' included.
    for (const level of levels) {
      const b = makeGame().w;
      b.ship.space = level;
      const out = createThrustOut();
      for (let i = 0; i < 120; i++) {
        b.ship.float = true;
        b.x[0] = 0;
        b.y[0] = 0;
        const held = i % 50 < 40;
        const k = Math.hypot(Math.cos(i * 0.1), Math.sin(i * 0.07));
        const mx = (Math.cos(i * 0.1) / k) * 0.9; // inside the unit stick
        const my = (Math.sin(i * 0.07) / k) * 0.9;
        const vx0 = b.vx[0] ?? 0;
        const vy0 = b.vy[0] ?? 0;
        stepThrustRow(GRAVITAS_POOL.float, vx0, vy0, held ? mx : 0, held ? my : 0, held, b.ship.holdT, DT, 1, out);
        stepGame(b, DT, held ? stick(mx, my) : idle());
        expect(b.vx[0]).toBeCloseTo(out.vx, 3);
        expect(b.vy[0]).toBeCloseTo(out.vy, 3);
      }
    }
  });

  it('the float is cleared every step, even while the ship is down', () => {
    const { w } = makeGame();
    w.ship.float = true;
    w.ship.active = false;
    stepGame(w, DT, idle());
    expect(w.ship.float).toBe(false);
  });
});
