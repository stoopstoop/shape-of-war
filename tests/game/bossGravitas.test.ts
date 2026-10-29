// Gravitas (docs/12 roster row 6): three anchors (6 HP each) gate all damage to the core, a pull
// around it falls by a third per lost anchor, and a collapsing ring with a 60 deg gap facing the
// ship comes every 5, 4 then 3 s. It seeks the ship at 45 u/s.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { countParts, damageBoss, damageBossPart, livePart } from '../../src/game/bosses/core';
import { inRingGap, ringGapMin } from '../../src/game/bosses/kit';
import { isOpen, livePull, pullFor, ringEveryFor } from '../../src/game/bosses/gravitas';
import { GRAVITAS } from '../../src/game/bosses/table';
import { BossMode, HazardType, PartType } from '../../src/game/bosses/types';
import { stepGame } from '../../src/game/game';
import { gs } from '../../src/game/state';
import { angleBetween, distBetween } from '../../src/game/steer';
import { Kind, type World } from '../../src/game/world';
import { bs, bossGame, count, enter, park, run } from './bossHelpers';
import { DT, idle } from './helpers';

afterEach(() => bus.clear());

function breakAnchor(w: World, slot: number): void {
  const p = livePart(w, bs(w), slot);
  expect(p).toBeGreaterThan(0);
  damageBossPart(w, p, GRAVITAS.anchorHp, 0, 0);
}

/** Pull felt by a ship parked at distance d from the boss, from one step starting at rest. */
function pullAt(w: World, d: number): number {
  const id = bs(w).id;
  park(w, (w.x[id] ?? 0) + d, w.y[id] ?? 0);
  const g = gs(w);
  g.shipPullX = 0;
  g.shipPullY = 0;
  stepGame(w, DT, idle());
  return Math.hypot(g.shipPullX, g.shipPullY);
}

function rings(w: World): number[] {
  const out: number[] = [];
  for (let h = 1; h < w.cap; h++) if (w.alive[h] === 1 && w.kind[h] === Kind.BossHazard && w.a[h] === HazardType.Ring) out.push(h);
  return out;
}

describe('gravitas: pure helpers', () => {
  it('the pull falls by a third per lost anchor, to none', () => {
    expect(pullFor(3)).toBe(GRAVITAS.pullMax);
    expect(pullFor(2)).toBeCloseTo((GRAVITAS.pullMax * 2) / 3);
    expect(pullFor(1)).toBeCloseTo(GRAVITAS.pullMax / 3);
    expect(pullFor(0)).toBe(0);
  });

  it('opens only with no anchor left; rings every 5, 4, 3 s', () => {
    expect(isOpen(3)).toBe(false);
    expect(isOpen(1)).toBe(false);
    expect(isOpen(0)).toBe(true);
    expect(ringEveryFor(1)).toBe(5);
    expect(ringEveryFor(2)).toBe(4);
    expect(ringEveryFor(3)).toBe(3);
  });
});

describe('gravitas', () => {
  it('enters with three 6 HP anchors orbiting at 140 u', () => {
    const w = bossGame('gravitas');
    park(w, 500, 300);
    const id = enter(w);
    const s = bs(w);
    expect(countParts(w, s)).toBe(3);
    run(w, 1);
    for (let k = 0; k < 3; k++) {
      const p = livePart(w, s, k);
      expect(w.a[p]).toBe(PartType.Anchor);
      expect(w.hp[p]).toBe(60);
      expect(distBetween(w, id, p)).toBeCloseTo(GRAVITAS.anchorOrbit, 0);
    }
  });

  it('takes no damage while any anchor lives', () => {
    const w = bossGame('gravitas');
    park(w, 500, 300);
    const id = enter(w);
    const s = bs(w);
    const full = w.hp[id] ?? 0;
    for (let k = 0; k < 3; k++) {
      run(w, 0.2);
      expect(s.mode).toBe(BossMode.Guarded);
      damageBoss(w, 50, w.x[id] ?? 0, w.y[id] ?? 0);
      expect(w.hp[id]).toBe(full);
      breakAnchor(w, k);
    }
    run(w, 0.1);
    expect(countParts(w, s)).toBe(0);
    expect(s.mode).toBe(BossMode.Vulnerable);
    damageBoss(w, 50, w.x[id] ?? 0, w.y[id] ?? 0);
    expect(w.hp[id]).toBe(full - 50);
    // Anchors do not regrow.
    run(w, 15);
    expect(count(w, Kind.BossPart)).toBe(0);
  });

  it('its pull weakens with each lost anchor and ends with the last', () => {
    const w = bossGame('gravitas');
    park(w, 500, 300);
    enter(w);
    const s = bs(w);
    run(w, 0.1);
    const felt: number[] = [pullAt(w, 150)];
    const strength: number[] = [s.hzRate[livePull(w, s)] ?? 0];
    for (let k = 0; k < 3; k++) {
      breakAnchor(w, k);
      felt.push(pullAt(w, 150));
      const p = livePull(w, s);
      strength.push(p > 0 ? (s.hzRate[p] ?? 0) : 0);
    }
    expect(strength[0]).toBeCloseTo(100);
    expect(strength[1]).toBeCloseTo(200 / 3, 3);
    expect(strength[2]).toBeCloseTo(100 / 3, 3);
    expect(strength[3]).toBe(0);
    expect(livePull(w, s)).toBe(-1);
    expect(felt[0] ?? 0).toBeGreaterThan(0);
    expect((felt[1] ?? 0) / (felt[0] ?? 1)).toBeCloseTo(2 / 3, 2);
    expect((felt[2] ?? 0) / (felt[0] ?? 1)).toBeCloseTo(1 / 3, 2);
    expect(felt[3]).toBe(0);
  });

  it('fires a collapsing ring with a 60 deg gap facing the ship every 5 s', () => {
    const w = bossGame('gravitas');
    park(w, 500, 300);
    const id = enter(w);
    const s = bs(w);
    const born: number[] = [];
    for (let i = 0; i < 120 * 13; i++) {
      stepGame(w, DT, idle());
      for (const h of rings(w)) {
        if ((w.t[h] ?? 0) > DT * 1.5) continue;
        born.push(i);
        expect(w.vx[h] ?? 0).toBeGreaterThanOrEqual(ringGapMin(2) / 2 - 1e-6);
        expect((w.vx[h] ?? 0) * 2).toBeCloseTo(GRAVITAS.gapDeg * (Math.PI / 180), 5);
        expect(s.hzRate[h]).toBeLessThan(0);
        expect(w.radius[h]).toBe(GRAVITAS.ringStart);
        expect(inRingGap(angleBetween(w, h, 0), w.rot[h] ?? 0, w.vx[h] ?? 0, 1)).toBe(true);
        expect(distBetween(w, h, id)).toBeLessThan(1);
      }
    }
    expect(born.length).toBeGreaterThanOrEqual(2);
    expect(((born[1] ?? 0) - (born[0] ?? 0)) * DT).toBeCloseTo(5, 1);
  });

  it('seeks the ship at 45 u/s', () => {
    const w = bossGame('gravitas');
    park(w, 600, 0);
    const id = enter(w);
    const d0 = distBetween(w, id, 0);
    run(w, 1);
    expect(d0 - distBetween(w, id, 0)).toBeCloseTo(GRAVITAS.seekSpeed, -1);
  });

  it('anchors survive a ship death; the pull comes back with the respawn', () => {
    const w = bossGame('gravitas', { lives: 3 }, {}, false);
    park(w, 500, 300);
    enter(w);
    const s = bs(w);
    breakAnchor(w, 0);
    run(w, 0.1);
    w.ship.invuln = 0;
    park(w, w.x[s.id] ?? 0, w.y[s.id] ?? 0);
    stepGame(w, DT, idle());
    expect(w.ship.active).toBe(false);
    expect(countParts(w, s)).toBe(2);
    run(w, 2);
    expect(w.ship.active).toBe(true);
    const p = livePull(w, s);
    expect(p).toBeGreaterThan(0);
    expect(s.hzRate[p]).toBeCloseTo(200 / 3, 3);
  });
});
