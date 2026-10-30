// Bastion (docs/12 roster row 7): four 8 HP turrets, the core gated on two turrets down, phases that
// follow the turret count (four, two, none), a Bulwark every 12 s, the centre held at 0.3 rad/s.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { isOpen, phaseForTurrets, turretAngle } from '../../src/game/bosses/bastion';
import { countParts, damageBoss, damageBossPart, livePart } from '../../src/game/bosses/core';
import { BASTION } from '../../src/game/bosses/table';
import { PartType } from '../../src/game/bosses/types';
import { Kind, type World } from '../../src/game/world';
import { bs, bossGame, count, enter, park, run } from './bossHelpers';

afterEach(() => bus.clear());

function game(): { w: World; boss: number } {
  const w = bossGame('bastion', { lives: 9 });
  park(w, 600, 380);
  const boss = enter(w);
  return { w, boss };
}

function killTurret(w: World, slot: number): void {
  const p = livePart(w, bs(w), slot);
  expect(p).toBeGreaterThan(0);
  damageBossPart(w, p, BASTION.turretHp, w.x[p] ?? 0, w.y[p] ?? 0);
}

describe('bastion', () => {
  it('pure rules: phase by turrets, core open at two down, turrets on the diagonals', () => {
    expect([4, 3, 2, 1, 0].map(phaseForTurrets)).toEqual([1, 1, 2, 2, 3]);
    expect(isOpen(3)).toBe(false);
    expect(isOpen(2)).toBe(true);
    expect(turretAngle(0, 0)).toBeCloseTo(Math.PI / 4);
    expect(turretAngle(0, 2)).toBeCloseTo((-3 * Math.PI) / 4);
  });

  it('holds the centre with four 8 HP turrets and turns at 0.3 rad/s', () => {
    const { w, boss } = game();
    expect(Math.hypot(w.x[boss] ?? 0, w.y[boss] ?? 0)).toBeLessThan(1);
    const s = bs(w);
    expect(countParts(w, s)).toBe(4);
    for (let k = 0; k < 4; k++) {
      const p = livePart(w, s, k);
      expect(w.a[p]).toBe(PartType.Turret);
      expect(w.hp[p]).toBe(80);
    }
    const r0 = w.rot[boss] ?? 0;
    run(w, 1);
    const d = (w.rot[boss] ?? 0) - r0;
    expect(Math.atan2(Math.sin(d), Math.cos(d))).toBeCloseTo(0.3, 1);
    expect(Math.hypot(w.x[boss] ?? 0, w.y[boss] ?? 0)).toBeLessThan(1);
  });

  it('the core takes no damage until two turrets fall, and the phases follow the turret count', () => {
    const { w, boss } = game();
    const s = bs(w);
    const hp0 = w.hp[boss] ?? 0;
    damageBoss(w, 400, 0, 0);
    expect(w.hp[boss]).toBe(hp0);
    killTurret(w, 0);
    run(w, 0.1);
    damageBoss(w, 400, 0, 0);
    expect(w.hp[boss]).toBe(hp0);
    expect(s.phase).toBe(1);
    killTurret(w, 1);
    expect(s.phase).toBe(2);
    run(w, 1.2); // the phase change pause, then the window opens
    expect(s.open).toBe(true);
    damageBoss(w, 400, 0, 0);
    expect(w.hp[boss]).toBe(hp0 - 400);
    killTurret(w, 2);
    expect(s.phase).toBe(2);
    killTurret(w, 3);
    expect(s.phase).toBe(3);
    expect(countParts(w, s)).toBe(0);
    run(w, 1.2);
    damageBoss(w, 400, 0, 0);
    // G3C phase 3: the woken core keeps at most BASTION.wakeHpShare of its hit points.
    expect(w.hp[boss]).toBe(Math.min(hp0 - 400, Math.round(s.maxHp * BASTION.wakeHpShare)) - 400);
  });

  it('a Bulwark joins every 12 s', () => {
    const { w } = game();
    run(w, 11.5);
    expect(count(w, Kind.Bulwark)).toBe(0);
    run(w, 1.5);
    expect(count(w, Kind.Bulwark)).toBe(1);
  });
});
