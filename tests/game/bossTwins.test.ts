// Twins (docs/12 roster row 9): two 500 HP bodies sharing one phase counter, the tether only while
// both live, rings from each body offset by 3.5 s, the survivor's enrage, and one bonus for the pair.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { bossBonusAwarded } from '../../src/game/bosses';
import { damageBoss, damageBossPart } from '../../src/game/bosses/core';
import { liveTether, ringEveryFor, secondBody, separationAt } from '../../src/game/bosses/twins';
import { TWINS } from '../../src/game/bosses/table';
import { HazardType, PartType } from '../../src/game/bosses/types';
import { stepGame } from '../../src/game/game';
import { gs } from '../../src/game/state';
import { Kind, type World } from '../../src/game/world';
import { bs, bossGame, enter, park, run } from './bossHelpers';
import { DT, idle } from './helpers';

afterEach(() => bus.clear());

function game(): { w: World; boss: number } {
  const w = bossGame('twins', { lives: 9 });
  park(w, 640, 400);
  const boss = enter(w);
  return { w, boss };
}

describe('twins', () => {
  it('pure rules: 300 to 500 u apart, a ring every 3.5 s alternating, 4 s enraged', () => {
    for (let t = 0; t < 60; t += 0.37) {
      expect(separationAt(t)).toBeGreaterThanOrEqual(TWINS.sepMin - 1e-9);
      expect(separationAt(t)).toBeLessThanOrEqual(TWINS.sepMax + 1e-9);
    }
    expect(ringEveryFor(false)).toBe(3.5);
    expect(ringEveryFor(true)).toBe(4);
  });

  it('two 500 HP bodies on opposite sides of the centre, a tether while both live', () => {
    const { w, boss } = game();
    const s = bs(w);
    const b = secondBody(w, s);
    expect(b).toBeGreaterThan(0);
    expect(w.a[b]).toBe(PartType.Twin);
    expect(w.hp[b]).toBe(5000);
    expect(w.hp[boss]).toBe(10000);
    run(w, 3);
    const mx = ((w.x[boss] ?? 0) + (w.x[b] ?? 0)) / 2;
    const my = ((w.y[boss] ?? 0) + (w.y[b] ?? 0)) / 2;
    expect(Math.hypot(mx, my)).toBeLessThan(20);
    const sep = Math.hypot((w.x[boss] ?? 0) - (w.x[b] ?? 0), (w.y[boss] ?? 0) - (w.y[b] ?? 0));
    expect(sep).toBeGreaterThan(TWINS.sepMin - 20);
    expect(sep).toBeLessThan(TWINS.sepMax + 20);
    const t = liveTether(w, s);
    expect(t).toBeGreaterThan(0);
    expect(w.x[t]).toBeCloseTo(w.x[boss] ?? 0, 3);
    expect(w.vx[t]).toBeCloseTo(w.x[b] ?? 0, 3);
  });

  it('rings come from each body in turn, 3.5 s apart', () => {
    const { w, boss } = game();
    const s = bs(w);
    run(w, 1);
    const b = secondBody(w, s);
    const seen: { t: number; fromBoss: boolean }[] = [];
    for (let i = 0; i < 120 * 12; i++) {
      stepGame(w, DT, idle());
      for (let h = 1; h < w.cap; h++) {
        if (w.alive[h] !== 1 || w.kind[h] !== Kind.BossHazard || w.a[h] !== HazardType.Ring || (w.t[h] ?? 0) > DT * 1.5) continue;
        const dBoss = Math.hypot((w.x[h] ?? 0) - (w.x[boss] ?? 0), (w.y[h] ?? 0) - (w.y[boss] ?? 0));
        const dB = Math.hypot((w.x[h] ?? 0) - (w.x[b] ?? 0), (w.y[h] ?? 0) - (w.y[b] ?? 0));
        seen.push({ t: i * DT, fromBoss: dBoss < dB });
      }
    }
    expect(seen.length).toBeGreaterThanOrEqual(3);
    for (let k = 1; k < seen.length; k++) {
      expect(seen[k]?.fromBoss).not.toBe(seen[k - 1]?.fromBoss);
      expect((seen[k]?.t ?? 0) - (seen[k - 1]?.t ?? 0)).toBeGreaterThanOrEqual(3.5 - 0.05);
    }
  });

  it('a hit on the second body comes off the shared bar; the first fall breaks the tether and enrages the survivor', () => {
    const { w, boss } = game();
    const s = bs(w);
    run(w, 3);
    expect(liveTether(w, s)).toBeGreaterThan(0);
    const b = secondBody(w, s);
    damageBossPart(w, b, 1000, 0, 0);
    expect(w.hp[boss]).toBe(9000);
    expect(s.phase).toBe(1);
    damageBossPart(w, b, 9000, 0, 0); // overkill counts only what it had
    expect(w.hp[boss]).toBe(5000);
    expect(secondBody(w, s)).toBe(-1);
    expect(s.phase).toBe(2);
    expect(liveTether(w, s)).toBe(-1);
    run(w, 1.1); // the phase change pause
    const a0 = s.angle;
    run(w, 1);
    const d = s.angle - a0;
    expect(Math.atan2(Math.sin(d), Math.cos(d))).toBeCloseTo(TWINS.orbitRate * TWINS.enrageSpeed, 2);
    run(w, 10);
    let tethers = 0;
    for (let h = 1; h < w.cap; h++) if (w.alive[h] === 1 && w.kind[h] === Kind.BossHazard && w.a[h] === HazardType.Tether) tethers++;
    expect(tethers).toBe(0);
  });

  it('the front body falling first hands the fight to the second body', () => {
    const { w, boss } = game();
    const s = bs(w);
    run(w, 3);
    const b = secondBody(w, s);
    const bx = w.x[b] ?? 0;
    const by = w.y[b] ?? 0;
    damageBoss(w, 9999, 0, 0); // clamped to the front body's own 500 HP
    expect(w.hp[boss]).toBe(5000);
    expect(s.status).toBe('alive');
    expect(s.id).toBe(boss);
    expect(secondBody(w, s)).toBe(-1);
    expect(w.alive[b]).toBe(0);
    expect(w.x[boss]).toBeCloseTo(bx, 0);
    expect(w.y[boss]).toBeCloseTo(by, 0);
    expect(s.phase).toBe(2);
  });

  it('death of both ends the fight and awards the bonus once', () => {
    const { w, boss } = game();
    const s = bs(w);
    let downs = 0;
    bus.on('sim:bossDown', () => {
      downs++;
    });
    run(w, 3);
    const score0 = gs(w).score;
    damageBossPart(w, secondBody(w, s), 5000, 0, 0);
    expect(downs).toBe(0);
    expect(bossBonusAwarded(w)).toBe(0);
    run(w, 1.2);
    damageBoss(w, 5000, 0, 0);
    expect(s.status).toBe('defeated');
    expect(downs).toBe(1);
    const bonus = bossBonusAwarded(w);
    expect(bonus).toBeGreaterThan(0);
    expect(gs(w).score - score0).toBeGreaterThanOrEqual(bonus);
    expect(gs(w).score - score0).toBeLessThan(bonus * 2);
    damageBoss(w, 5000, 0, 0);
    run(w, 1);
    expect(downs).toBe(1);
    expect(bossBonusAwarded(w)).toBe(bonus);
    expect(s.id).toBe(-1);
    expect(w.kind[boss] === Kind.Boss && w.alive[boss] === 1).toBe(false);
  });
});
