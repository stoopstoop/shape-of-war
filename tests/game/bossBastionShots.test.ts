// Bastion's turret shots (docs/12 wave C item 5, BOSS_SHOTS.bastion): one turret turn every 1.5 s,
// each turret alternating a lane and a 200 u/s bullet on its own turns; a destroyed turret skips its
// turns (phase 2 half the bullets, phase 3 none); the core never fires; the 300 u wait and recheck;
// the heading fixed at the charge start; fx:bossShot once per volley; the dodge at High; cut 5.
import { afterEach, describe, expect, it } from 'vitest';
import { SPACE_TABLE } from '../../src/core/physics';
import { bus } from '../../src/core/events';
import { isShotTurn } from '../../src/game/bosses/bastion';
import { damageBossPart, livePart } from '../../src/game/bosses/core';
import { hazardTelegraph } from '../../src/game/bosses/kit';
import { BASTION, BOSS_SHOTS, SHOT_RECHECK_SEC, type ShotRow } from '../../src/game/bosses/table';
import { HazardType } from '../../src/game/bosses/types';
import { dodgeSeconds, ENEMY_BULLET_RADIUS, enemyBulletsOf } from '../../src/game/enemyBullets';
import { stepGame } from '../../src/game/game';
import { setShipSpace, SHIP_RADIUS } from '../../src/game/ship';
import { gs } from '../../src/game/state';
import { Kind, type World } from '../../src/game/world';
import type { BossId } from '../../src/levelgen/leveldef';
import { bs, bossGame, enter, park, run } from './bossHelpers';
import { DT, idle } from './helpers';

afterEach(() => bus.clear());

/** A far corner: beyond every lane's reach and over 300 u from every muzzle. */
const FAR_X = 670;
const FAR_Y = 425;

interface Turn {
  t: number;
  slot: number;
  shot: boolean;
}

function game(shield = true): World {
  const w = bossGame('bastion', { lives: 9 }, {}, shield);
  park(w, FAR_X, FAR_Y);
  enter(w);
  return w;
}

/** Slot of the live turret nearest (x, y). */
function slotNear(w: World, x: number, y: number): number {
  const s = bs(w);
  let best = -1;
  let bd = Infinity;
  for (let k = 0; k < 4; k++) {
    const p = livePart(w, s, k);
    if (p < 0) continue;
    const d = Math.hypot((w.x[p] ?? 0) - x, (w.y[p] ?? 0) - y);
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}

/** Step secs, logging every new lane and every new charging bullet as a turn. Adds are held off. */
function logTurns(w: World, secs: number, out: Turn[], t0 = 0): void {
  const s = bs(w);
  const tele = hazardTelegraph(3);
  for (let i = 0; i < Math.round(secs * 120); i++) {
    s.t1 = 0;
    park(w, FAR_X, FAR_Y);
    stepGame(w, DT, idle());
    const t = t0 + i * DT;
    for (let h = 1; h < w.cap; h++) {
      if (w.alive[h] !== 1 || w.kind[h] !== Kind.BossHazard || w.a[h] !== HazardType.Lane || s.hzMarker[h] === 1 || (w.t[h] ?? 0) > DT * 1.5) continue; // phase 3 charge markers are not turret turns
      out.push({ t, slot: slotNear(w, w.x[h] ?? 0, w.y[h] ?? 0), shot: false });
    }
    const p = enemyBulletsOf(w);
    for (let e = 0; e < p.cap; e++) {
      if (p.alive[e] !== 1 || (p.arm[e] ?? 0) < tele - DT * 1.5) continue;
      out.push({ t, slot: slotNear(w, p.x[e] ?? 0, p.y[e] ?? 0), shot: true });
    }
  }
}

function killSlot(w: World, k: number): void {
  const p = livePart(w, bs(w), k);
  damageBossPart(w, p, BASTION.turretHp, 0, 0);
}

describe('bastion turret shots', () => {
  it('the row: one 200 u/s bullet per shot turn, a turn every 1.5 s', () => {
    const row = BOSS_SHOTS.bastion;
    expect(row?.pattern).toBe('turret');
    expect(row?.speed).toBe(200);
    expect(row?.every).toBe(BASTION.turnEvery);
    expect(row?.count ?? 1).toBe(1);
    expect(isShotTurn(0b0100, 2, true)).toBe(true);
    expect(isShotTurn(0b0100, 1, true)).toBe(false);
    expect(isShotTurn(0b1111, 2, false)).toBe(false);
  });

  it('one turn every 1.5 s in turret order, each turret alternating a lane and a bullet', () => {
    const w = game();
    const turns: Turn[] = [];
    logTurns(w, 30, turns);
    expect(turns.length).toBeGreaterThanOrEqual(18);
    for (let k = 1; k < turns.length; k++) {
      const a = turns[k - 1] as Turn;
      const b = turns[k] as Turn;
      expect(b.t - a.t).toBeCloseTo(BASTION.turnEvery, 1);
      expect(b.slot).toBe((a.slot + 1) % 4);
    }
    for (let slot = 0; slot < 4; slot++) {
      const mine = turns.filter((x) => x.slot === slot);
      expect(mine.length).toBeGreaterThanOrEqual(4);
      mine.forEach((x, i) => expect(x.shot).toBe(i % 2 === 1));
    }
    const shots = turns.filter((x) => x.shot).length;
    expect(Math.abs(shots * 2 - turns.length)).toBeLessThanOrEqual(4); // each turret starts with a lane
  });

  it('a destroyed turret skips its turns; phase 2 fires half the bullets, phase 3 none', () => {
    const full: Turn[] = [];
    logTurns(game(), 24, full);
    const w = game();
    killSlot(w, 1);
    killSlot(w, 3);
    expect(bs(w).phase).toBe(2);
    run(w, 1.0); // the phase change pause
    const half: Turn[] = [];
    logTurns(w, 24, half);
    expect(half.some((x) => x.slot === 1 || x.slot === 3)).toBe(false);
    for (let k = 1; k < half.length; k++) expect((half[k]?.t ?? 0) - (half[k - 1]?.t ?? 0)).toBeCloseTo(2 * BASTION.turnEvery, 1);
    const fullShots = full.filter((x) => x.shot).length;
    const halfShots = half.filter((x) => x.shot).length;
    expect(Math.abs(halfShots * 2 - fullShots)).toBeLessThanOrEqual(2);
    killSlot(w, 0);
    killSlot(w, 2);
    expect(bs(w).phase).toBe(3);
    run(w, 1.0);
    const none: Turn[] = [];
    logTurns(w, 20, none);
    expect(none.length).toBe(0);
    expect(enemyBulletsOf(w).liveCount).toBe(0);
  });

  it('bullets fly at 200 u/s from the turret muzzle, never from the core, with fx:bossShot once per volley', () => {
    const w = game();
    let events = 0;
    bus.on('fx:bossShot', (e) => {
      events++;
      expect(e.id).toBe('bastion');
    });
    const s = bs(w);
    const boss = s.id;
    let launched = 0;
    const seen = new Set<number>();
    for (let i = 0; i < 120 * 20; i++) {
      s.t1 = 0;
      park(w, FAR_X, FAR_Y);
      stepGame(w, DT, idle());
      const p = enemyBulletsOf(w);
      for (let e = 0; e < p.cap; e++) {
        if (p.alive[e] !== 1) {
          seen.delete(e);
          continue;
        }
        if ((p.arm[e] ?? 0) > 0 || seen.has(e)) continue;
        seen.add(e);
        launched++;
        expect(Math.hypot(p.vx[e] ?? 0, p.vy[e] ?? 0)).toBeCloseTo(200, 3);
      }
      for (let e = 0; e < p.cap; e++) {
        if (p.alive[e] !== 1 || (p.arm[e] ?? 0) <= 0) continue;
        // Charging at a turret muzzle (the turret edge), outside the core body.
        expect(Math.hypot((p.x[e] ?? 0) - (w.x[boss] ?? 0), (p.y[e] ?? 0) - (w.y[boss] ?? 0))).toBeGreaterThan(BASTION.turretOffset - BASTION.turretRadius - 1);
      }
    }
    expect(launched).toBeGreaterThanOrEqual(5);
    expect(events).toBe(launched);
  });

  it('a due bullet waits while the ship is within 300 u of the muzzle, rechecks every 0.3 s, heading fixed at the charge start', () => {
    const w = game();
    const s = bs(w);
    run(w, 0.2);
    const k = s.n0;
    const p = livePart(w, s, k);
    s.n1 = 0b1111; // every turret's next turn is a bullet
    s.t0 = BASTION.turnEvery - DT / 2;
    const near = (): void => {
      const a = w.rot[p] ?? 0;
      park(w, (w.x[p] ?? 0) + Math.cos(a) * 200, (w.y[p] ?? 0) + Math.sin(a) * 200);
    };
    near();
    stepGame(w, DT, idle());
    expect(enemyBulletsOf(w).liveCount).toBe(0);
    expect(s.shotWait).toBeGreaterThan(0);
    expect(s.shotWait).toBeLessThanOrEqual(SHOT_RECHECK_SEC);
    for (let i = 0; i < 60; i++) {
      near();
      stepGame(w, DT, idle());
    }
    expect(enemyBulletsOf(w).liveCount).toBe(0);
    park(w, FAR_X, FAR_Y);
    let n = 0;
    for (; n < 120 && enemyBulletsOf(w).liveCount === 0; n++) stepGame(w, DT, idle());
    expect(n * DT).toBeLessThanOrEqual(SHOT_RECHECK_SEC + DT);
    const pool = enemyBulletsOf(w);
    let b = -1;
    for (let e = 0; e < pool.cap; e++) if (pool.alive[e] === 1) b = e;
    const aim = Math.atan2(FAR_Y - (pool.y[b] ?? 0), FAR_X - (pool.x[b] ?? 0));
    // The ship moves during the charge; the heading stays where it was at the charge start.
    for (let i = 0; i < 120 && (pool.arm[b] ?? 0) > 0; i++) {
      park(w, -FAR_X, FAR_Y);
      stepGame(w, DT, idle());
    }
    expect(Math.atan2(pool.vy[b] ?? 0, pool.vx[b] ?? 0)).toBeCloseTo(aim, 3);
  });

  it('dodge in play: at High, a ship that sidesteps only at launch survives a minute of turret shots', () => {
    const w = bossGame('bastion', { lives: 3 }, {}, false);
    setShipSpace(w, 'high');
    park(w, FAR_X, FAR_Y);
    w.ship.invuln = 0;
    enter(w);
    const s = bs(w);
    let dodging = 0;
    let dir = 1;
    let shots = 0;
    let dx = 0;
    let dy = 0;
    bus.on('fx:bossShot', () => {
      shots++;
      const pool = enemyBulletsOf(w);
      for (let i = 0; i < pool.cap; i++) {
        if (pool.alive[i] !== 1 || (pool.arm[i] ?? 0) > 0) continue;
        const a = Math.atan2(pool.vy[i] ?? 0, pool.vx[i] ?? 0);
        dx = Math.cos(a + (dir * Math.PI) / 2);
        dy = Math.sin(a + (dir * Math.PI) / 2);
      }
      dir = -dir;
      dodging = dodgeSeconds(SPACE_TABLE.high, SHIP_RADIUS + ENEMY_BULLET_RADIUS + 8) + 0.05;
    });
    for (let i = 0; i < 120 * 60; i++) {
      s.t1 = 0; // no Bulwarks: this test is about the shots
      const input = idle();
      if (dodging > 0) input.move = { active: true, x: dx, y: dy };
      dodging -= DT;
      stepGame(w, DT, input);
    }
    expect(shots).toBeGreaterThanOrEqual(10);
    expect(gs(w).lives).toBe(3);
    expect(w.ship.active).toBe(true);
  });

  it('cut 5: with no row every turn is a lane and nothing is fired', () => {
    const table = BOSS_SHOTS as Partial<Record<BossId, ShotRow>>;
    const saved = table.bastion;
    delete table.bastion;
    try {
      const w = game();
      const turns: Turn[] = [];
      logTurns(w, 15, turns);
      expect(turns.length).toBeGreaterThanOrEqual(8);
      expect(turns.every((x) => !x.shot)).toBe(true);
      expect(enemyBulletsOf(w).cap).toBe(0);
    } finally {
      if (saved !== undefined) table.bastion = saved;
    }
    expect(BOSS_SHOTS.bastion?.speed).toBe(200);
  });
});
