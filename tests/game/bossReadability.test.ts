// Boss readability (G3C): 'sim:bossWindow' (Prism's run to white and every window edge),
// 'sim:bossCrack' once per stage per body (Twins bodies apart), per hit 'fx:hit' on Bastion and
// Tempest, and Bastion's woken phase 3 that attacks the ship once its turrets are gone.
import { afterEach, describe, expect, it } from 'vitest';
import { bus, type Events } from '../../src/core/events';
import { chargeEveryFor, wakeHp } from '../../src/game/bosses/bastion';
import { bossBodyContact, crackStage, damageBoss, damageBossPart, hazardLethalAt, livePart } from '../../src/game/bosses/core';
import { leadAt } from '../../src/game/bosses/prism';
import { secondBody } from '../../src/game/bosses/twins';
import { BASTION, PRISM } from '../../src/game/bosses/table';
import { stepGame } from '../../src/game/game';
import { SHIP_RADIUS } from '../../src/game/ship';
import { Kind, type World } from '../../src/game/world';
import { bs, bossGame, enter, park, run } from './bossHelpers';
import { DT, idle } from './helpers';

afterEach(() => bus.clear());

type Win = Events['sim:bossWindow'] & { t: number };
type Crack = Events['sim:bossCrack'];

function listenWindow(clock: { t: number }): Win[] {
  const log: Win[] = [];
  bus.on('sim:bossWindow', (p) => log.push({ ...p, t: clock.t }));
  return log;
}

function listenCrack(): Crack[] {
  const log: Crack[] = [];
  bus.on('sim:bossCrack', (p) => log.push({ ...p }));
  return log;
}

function killTurrets(w: World): void {
  for (let k = 0; k < BASTION.turrets; k++) {
    const p = livePart(w, bs(w), k);
    if (p > 0) damageBossPart(w, p, BASTION.turretHp, w.x[p] ?? 0, w.y[p] ?? 0);
  }
}

describe('pure rules', () => {
  it('crack stages at 66 and 33 percent, Prism lead, Bastion wake hit points and charge interval', () => {
    expect([100, 67, 65, 34, 32, 0].map((hp) => crackStage(hp, 100))).toEqual([0, 0, 1, 1, 2, 2]);
    expect(leadAt(1)).toBe(-1);
    expect(leadAt(PRISM.colourSec + 0.1)).toBeCloseTo(PRISM.whiteSec - 0.1);
    expect(leadAt(PRISM.colourSec + PRISM.whiteSec + 0.1)).toBe(-1);
    expect(wakeHp(9000, 9000)).toBe(4500);
    expect(wakeHp(3000, 9000)).toBe(3000);
    expect(chargeEveryFor(1)).toBe(5);
    expect(chargeEveryFor(2)).toBe(3.5);
  });
});

describe('sim:bossWindow', () => {
  it('prism: a countdown every 100 ms through the 0.5 s run to white, then open for 1.2 s, then closed', () => {
    const clock = { t: 0 };
    const log = listenWindow(clock);
    const w = bossGame('prism');
    park(w, 600, 400);
    enter(w);
    clock.t = 0;
    for (let i = 0; i < 120 * 4.5; i++) {
      stepGame(w, DT, idle());
      clock.t += DT;
    }
    const openAt = log.findIndex((e) => e.open);
    expect(openAt).toBeGreaterThan(0);
    const lead = log.slice(0, openAt);
    expect(lead.length).toBeGreaterThanOrEqual(4);
    expect(lead.length).toBeLessThanOrEqual(6);
    for (const e of lead) {
      expect(e.open).toBe(false);
      expect(e.secondsLeft).toBeGreaterThan(0);
      expect(e.secondsLeft).toBeLessThanOrEqual(PRISM.whiteSec + 1e-6);
    }
    for (let i = 1; i < lead.length; i++) {
      expect(lead[i]!.secondsLeft).toBeLessThan(lead[i - 1]!.secondsLeft);
      expect(lead[i]!.t - lead[i - 1]!.t).toBeCloseTo(0.1, 1);
    }
    expect(lead[0]!.secondsLeft).toBeGreaterThan(PRISM.whiteSec - 2 * DT);
    const open = log[openAt]!;
    expect(open.secondsLeft).toBeCloseTo(PRISM.windowSec, 1);
    const close = log[openAt + 1]!;
    expect(close.open).toBe(false);
    expect(close.secondsLeft).toBe(0);
    expect(close.t - open.t).toBeCloseTo(PRISM.windowSec, 1);
  });

  it('warden: open true then false on the exposed edges, no countdown', () => {
    const clock = { t: 0 };
    const log = listenWindow(clock);
    const exposed: boolean[] = [];
    bus.on('sim:bossExposed', (p) => exposed.push(p.exposed));
    const w = bossGame('warden');
    park(w, 600, 400);
    enter(w);
    for (let i = 0; i < 120 * 10 && log.length < 2; i++) stepGame(w, DT, idle());
    expect(log.map((e) => e.open)).toEqual([true, false]);
    expect(exposed).toEqual([true, false]);
    expect(log[0]!.secondsLeft).not.toBe(0);
    expect(log[1]!.secondsLeft).toBe(0);
  });
});

describe('sim:bossCrack', () => {
  it('spindle: once per stage, and a single big hit passes both stages in order', () => {
    const log = listenCrack();
    const w = bossGame('spindle');
    park(w, 600, 400);
    const boss = enter(w);
    const max = bs(w).maxHp;
    damageBoss(w, Math.round(max * 0.4), 0, 0, true);
    damageBoss(w, 10, 0, 0, true);
    expect(log.map((e) => e.stage)).toEqual([1]);
    expect(log[0]).toMatchObject({ id: 'spindle', x: w.x[boss], y: w.y[boss] });
    damageBoss(w, Math.round(max * 0.3), 0, 0, true);
    damageBoss(w, 10, 0, 0, true);
    expect(log.map((e) => e.stage)).toEqual([1, 2]);

    bus.clear();
    const log2 = listenCrack();
    const w2 = bossGame('spindle');
    park(w2, 600, 400);
    enter(w2);
    damageBoss(w2, Math.round(bs(w2).maxHp * 0.8), 0, 0, true);
    expect(log2.map((e) => e.stage)).toEqual([1, 2]);
  });

  it('twins: each body cracks at its own 66 and 33 percent, once per stage', () => {
    const log = listenCrack();
    const w = bossGame('twins');
    park(w, 600, 400);
    const boss = enter(w);
    const s = bs(w);
    const half = Math.floor(s.maxHp / 2);
    const b = secondBody(w, s);
    expect(b).toBeGreaterThan(0);
    damageBossPart(w, b, Math.round(half * 0.4), 0, 0);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ id: 'twins', stage: 1, x: w.x[b], y: w.y[b] });
    damageBoss(w, Math.round((s.maxHp - half) * 0.4), 0, 0);
    expect(log).toHaveLength(2);
    expect(log[1]).toMatchObject({ stage: 1, x: w.x[boss], y: w.y[boss] });
    damageBossPart(w, b, Math.round(half * 0.3), 0, 0);
    damageBossPart(w, b, 10, 0, 0);
    expect(log.map((e) => e.stage)).toEqual([1, 1, 2]);
    // The second body falls; the front body survives at stage 1 and cracks again only below 33 percent.
    damageBossPart(w, b, half, 0, 0);
    expect(secondBody(w, s)).toBe(-1);
    expect(log).toHaveLength(3);
    damageBoss(w, Math.round((s.maxHp - half) * 0.3), 0, 0);
    damageBoss(w, 10, 0, 0);
    expect(log.map((e) => e.stage)).toEqual([1, 1, 2, 2]);
  });
});

describe('per hit feedback', () => {
  function hitLog(): Events['fx:hit'][] {
    const log: Events['fx:hit'][] = [];
    bus.on('fx:hit', (p) => log.push({ ...p }));
    return log;
  }

  it('bastion: an open core hit emits fx:hit blocked false on the boss', () => {
    const w = bossGame('bastion', { lives: 9 });
    park(w, 600, 380);
    const boss = enter(w);
    killTurrets(w);
    const log = hitLog();
    damageBoss(w, 10, 5, 6);
    expect(log).toEqual([{ x: 5, y: 6, kind: Kind.Boss, id: boss, blocked: false }]);
  });

  it('tempest: every damaging hit emits fx:hit blocked false', () => {
    const w = bossGame('tempest');
    park(w, 0, 0);
    const boss = enter(w);
    for (let i = 0; i < 120 * 10 && !bs(w).open; i++) stepGame(w, DT, idle());
    expect(bs(w).open).toBe(true);
    const log = hitLog();
    damageBoss(w, 10, 1, 2);
    damageBoss(w, 10, 1, 2);
    expect(log.map((e) => [e.kind, e.id, e.blocked])).toEqual([
      [Kind.Boss, boss, false],
      [Kind.Boss, boss, false],
    ]);
  });
});

describe('bastion phase 3', () => {
  it('the core wakes when the last turret dies: half hit points at most, a crack, and the ship attacked within 6 s', () => {
    const cracks = listenCrack();
    const w = bossGame('bastion', { lives: 9 });
    park(w, 600, 380);
    const boss = enter(w);
    killTurrets(w);
    const s = bs(w);
    expect(s.phase).toBe(3);
    expect(w.hp[boss]).toBeLessThanOrEqual(Math.round(s.maxHp * BASTION.wakeHpShare));
    expect(s.open).toBe(true);
    expect(cracks.map((e) => e.stage)).toEqual([1]);
    let attackedAt = -1;
    for (let i = 0; i < 120 * 6 && attackedAt < 0; i++) {
      park(w, 600, 380);
      stepGame(w, DT, idle());
      const sx = w.x[0] ?? 0;
      const sy = w.y[0] ?? 0;
      let hit = bossBodyContact(w, boss, sx, sy, SHIP_RADIUS);
      for (let h = 1; h < w.cap && !hit; h++) {
        if (w.alive[h] === 1 && w.kind[h] === Kind.BossHazard && hazardLethalAt(w, s, h, sx, sy)) hit = true;
      }
      if (hit) attackedAt = i * DT;
    }
    expect(attackedAt).toBeGreaterThanOrEqual(0);
    expect(attackedAt).toBeLessThan(6);
    expect(Math.hypot(w.x[boss] ?? 0, w.y[boss] ?? 0)).toBeGreaterThan(50);
    expect(s.open).toBe(true);
  });

  it('the stage 2 crack shortens the charge interval to 3.5 s', () => {
    const w = bossGame('bastion', { lives: 9 });
    park(w, 600, 380);
    enter(w);
    killTurrets(w);
    const s = bs(w);
    damageBoss(w, Math.round(s.maxHp * 0.2), 0, 0);
    expect(s.crack[0]).toBe(2);
    expect(chargeEveryFor(s.crack[0] ?? 0)).toBe(BASTION.chargeEveryCracked);
    run(w, 1);
  });
});
