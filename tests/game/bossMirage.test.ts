// Mirage (docs/12 roster row 5): warps to a point 200 to 300 u from the ship, a ring marks the
// spot 0.5 s early, eight lanes radiate on landing with the ship midway between two of them, and
// its shield counts shots only through a 70 deg open arc turning at 1.5 rad/s. Three phases.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { damageBoss } from '../../src/game/bosses/core';
import { hazardHits, hazardTelegraph, wrapPi } from '../../src/game/bosses/kit';
import { arcHalf, laneStart, MirageWarp, throughArc, warpCandidate, warpEveryFor } from '../../src/game/bosses/mirage';
import { MIRAGE } from '../../src/game/bosses/table';
import { HazardType } from '../../src/game/bosses/types';
import { spawnBullet } from '../../src/game/bullets';
import { bulletHits } from '../../src/game/combat';
import { stepGame } from '../../src/game/game';
import { SHIP_RADIUS } from '../../src/game/ship';
import { type World, Kind } from '../../src/game/world';
import { bs, bossGame, enter, park, run } from './bossHelpers';
import { DT, idle } from './helpers';

afterEach(() => bus.clear());

const DEG = Math.PI / 180;

interface Landing {
  x: number;
  y: number;
  step: number;
}

/** Step until the boss jumps (a warp). Returns where and when it landed. */
function untilLanding(w: World, maxSec = 6, from = 0): Landing {
  const id = bs(w).id;
  for (let i = 0; i < maxSec * 120; i++) {
    const x0 = w.x[id] ?? 0;
    const y0 = w.y[id] ?? 0;
    stepGame(w, DT, idle());
    if (Math.hypot((w.x[id] ?? 0) - x0, (w.y[id] ?? 0) - y0) > 30) return { x: w.x[id] ?? 0, y: w.y[id] ?? 0, step: from + i };
  }
  throw new Error('no landing');
}

function lanes(w: World): number[] {
  const out: number[] = [];
  for (let h = 1; h < w.cap; h++) if (w.alive[h] === 1 && w.kind[h] === Kind.BossHazard && w.a[h] === HazardType.Lane) out.push(h);
  return out;
}

describe('mirage: pure helpers', () => {
  it('warp interval per phase: 3.0, 2.5, 2.0 s', () => {
    expect(warpEveryFor(1)).toBe(3.0);
    expect(warpEveryFor(2)).toBe(2.5);
    expect(warpEveryFor(3)).toBe(2.0);
  });

  it('the open arc is 70 deg wide', () => {
    expect(arcHalf() * 2).toBeCloseTo(70 * DEG);
    expect(throughArc(0, 0, 0, 50, 0)).toBe(true);
    expect(throughArc(0, 0, 0, 50 * Math.cos(34 * DEG), 50 * Math.sin(34 * DEG))).toBe(true);
    expect(throughArc(0, 0, 0, 50 * Math.cos(36 * DEG), 50 * Math.sin(36 * DEG))).toBe(false);
    expect(throughArc(0, 0, 0, -50, 0)).toBe(false);
  });

  it('every warp candidate is 200 to 300 u from the target', () => {
    const out = { x: 0, y: 0 };
    for (let i = 0; i < 50; i++) {
      warpCandidate(120, -80, (i * 0.137) % 1, (i * 0.291) % 1, i % 8, out);
      const d = Math.hypot(out.x - 120, out.y + 80);
      expect(d).toBeGreaterThanOrEqual(MIRAGE.warpMin - 1e-9);
      expect(d).toBeLessThanOrEqual(MIRAGE.warpMax + 1e-9);
    }
  });

  it('lanes start 22.5 deg off the bearing to the ship', () => {
    expect(laneStart(0)).toBeCloseTo(22.5 * DEG);
  });
});

describe('mirage', () => {
  it('damages only through the open arc', () => {
    const w = bossGame('mirage');
    park(w, 500, 300);
    const id = enter(w);
    const r = w.radius[id] ?? 0;
    let inHits = 0;
    let outHits = 0;
    for (let i = 0; i < 120 * 6; i++) {
      stepGame(w, DT, idle());
      if (i % 5 !== 0 || bs(w).phaseT > 0) continue;
      const rot = w.rot[id] ?? 0;
      const x = w.x[id] ?? 0;
      const y = w.y[id] ?? 0;
      // Inside the arc (10 deg off its centre) and outside it (60 and 180 deg off).
      const hp0 = w.hp[id] ?? 0;
      damageBoss(w, 1, x + Math.cos(rot + 10 * DEG) * r, y + Math.sin(rot + 10 * DEG) * r);
      expect(w.hp[id]).toBe(hp0 - 1);
      inHits++;
      damageBoss(w, 1, x + Math.cos(rot + 60 * DEG) * r, y + Math.sin(rot + 60 * DEG) * r);
      damageBoss(w, 1, x + Math.cos(rot + Math.PI) * r, y + Math.sin(rot + Math.PI) * r);
      expect(w.hp[id]).toBe(hp0 - 1);
      outHits += 2;
    }
    expect(inHits).toBeGreaterThan(50);
    expect(outHits).toBeGreaterThan(100);
  });

  it('player bullets count only while the arc faces them', () => {
    const w = bossGame('mirage');
    park(w, 500, 300);
    const id = enter(w);
    const r = w.radius[id] ?? 0;
    const s = bs(w);
    let landed = 0;
    let blocked = 0;
    for (let i = 0; i < 120 * 4; i++) {
      stepGame(w, DT, idle());
      if (i % 6 !== 0) continue;
      const x = w.x[id] ?? 0;
      const y = w.y[id] ?? 0;
      // A bullet touching the body from the east side.
      const hp0 = w.hp[id] ?? 0;
      spawnBullet(w.bullets, x + r + 2, y, -1, 0, 1);
      bulletHits(w);
      const took = (w.hp[id] ?? 0) < hp0;
      const facing = Math.abs(wrapPi((w.rot[id] ?? 0) - 0)) <= arcHalf() + 0.05;
      if (s.phaseT > 0) continue;
      if (took) landed++;
      else blocked++;
      if (took) expect(facing).toBe(true);
    }
    expect(landed).toBeGreaterThan(0);
    expect(blocked).toBeGreaterThan(0);
  });

  it('the shield arc turns at 1.5 rad/s', () => {
    const w = bossGame('mirage');
    park(w, 500, 300);
    const id = enter(w);
    stepGame(w, DT, idle());
    const r0 = w.rot[id] ?? 0;
    run(w, 1);
    expect(wrapPi((w.rot[id] ?? 0) - r0)).toBeCloseTo(MIRAGE.arcRate * 1, 1);
  });

  it('warps land 200 to 300 u from the ship, marked by a ring 0.5 s early', () => {
    const spots = [
      [0, 0],
      [500, 300],
      [-550, -350],
      [-200, 350],
    ];
    for (const [sx, sy] of spots) {
      const w = bossGame('mirage');
      park(w, sx ?? 0, sy ?? 0);
      enter(w);
      const s = bs(w);
      let markAt = -1;
      let mx = 0;
      let my = 0;
      for (let k = 0; k < 4; k++) {
        const id = s.id;
        let landing: Landing | null = null;
        for (let i = 0; i < 6 * 120 && landing === null; i++) {
          const x0 = w.x[id] ?? 0;
          const y0 = w.y[id] ?? 0;
          stepGame(w, DT, idle());
          if (s.n2 === MirageWarp.Marked && markAt < 0) {
            markAt = i;
            mx = s.t1;
            my = s.t2;
            // The marker is a ring at the landing point.
            expect(w.kind[s.n0]).toBe(Kind.BossHazard);
            expect(w.a[s.n0]).toBe(HazardType.Ring);
            expect(w.x[s.n0]).toBeCloseTo(mx);
            expect(s.hzMarker[s.n0]).toBe(1);
          }
          if (Math.hypot((w.x[id] ?? 0) - x0, (w.y[id] ?? 0) - y0) > 30) landing = { x: w.x[id] ?? 0, y: w.y[id] ?? 0, step: i };
        }
        expect(landing).not.toBeNull();
        if (landing === null) return;
        const d = Math.hypot(landing.x - (sx ?? 0), landing.y - (sy ?? 0));
        expect(d).toBeGreaterThanOrEqual(MIRAGE.warpMin - 0.5);
        expect(d).toBeLessThanOrEqual(MIRAGE.warpMax + 0.5);
        expect(landing.x).toBeCloseTo(mx);
        expect(landing.y).toBeCloseTo(my);
        expect((landing.step - markAt) * DT).toBeGreaterThanOrEqual(MIRAGE.markSec - DT * 1.5);
        markAt = -1;
      }
    }
  });

  it('the marker is never lethal (removed before its telegraph ends)', () => {
    const w = bossGame('mirage');
    park(w, 0, 0);
    enter(w);
    const s = bs(w);
    for (let i = 0; i < 120 * 3 && s.n2 !== MirageWarp.Marked; i++) stepGame(w, DT, idle());
    const m = s.n0;
    expect(s.hzLife[m] ?? 0).toBeLessThan(hazardTelegraph(2));
  });

  it('eight lanes radiate on landing, and none covers a ship that stays put', () => {
    const w = bossGame('mirage', { lives: 3 }, {}, false);
    park(w, 100, 50);
    w.ship.invuln = 0;
    enter(w);
    for (let k = 0; k < 3; k++) {
      untilLanding(w);
      const ls = lanes(w);
      expect(ls.length).toBe(MIRAGE.lanes);
      for (const h of ls) {
        expect(w.radius[h]).toBeLessThanOrEqual(30);
        expect(w.vx[h]).toBe(MIRAGE.laneLength);
        expect(hazardHits(HazardType.Lane, w.x[0] ?? 0, w.y[0] ?? 0, SHIP_RADIUS, w.x[h] ?? 0, w.y[h] ?? 0, w.rot[h] ?? 0, w.radius[h] ?? 0, w.vx[h] ?? 0, 0)).toBe(false);
      }
      // Neighbours are 45 deg apart.
      const rots = ls.map((h) => w.rot[h] ?? 0).sort((a, b) => a - b);
      for (let i = 1; i < rots.length; i++) expect((rots[i] ?? 0) - (rots[i - 1] ?? 0)).toBeCloseTo(Math.PI / 4, 3);
      park(w, 100, 50);
    }
    run(w, 2);
    expect(w.ship.active).toBe(true);
  });

  it('a landing waits while the ship stands on the marked spot', () => {
    const w = bossGame('mirage');
    park(w, 0, 0);
    const id = enter(w);
    const s = bs(w);
    for (let i = 0; i < 120 * 3 && s.n2 !== MirageWarp.Marked; i++) stepGame(w, DT, idle());
    const mx = s.t1;
    const my = s.t2;
    park(w, mx, my);
    const x0 = w.x[id] ?? 0;
    run(w, MIRAGE.markSec + 0.1);
    expect(Math.hypot((w.x[id] ?? 0) - mx, (w.y[id] ?? 0) - my)).toBeGreaterThan(30);
    expect(w.x[id]).toBeCloseTo(x0, 0);
    // Off the spot again, it marks a fresh one and lands there.
    park(w, 0, 0);
    const landing = untilLanding(w);
    expect(Math.hypot(landing.x, landing.y)).toBeGreaterThanOrEqual(MIRAGE.warpMin - 0.5);
  });

  it('phase 3 warps every 2.0 s', () => {
    const w = bossGame('mirage');
    park(w, 0, 0);
    enter(w);
    bs(w).phase = 3;
    const a = untilLanding(w);
    park(w, 0, 0);
    const b = untilLanding(w, 6, a.step + 1);
    expect((b.step - a.step) * DT).toBeCloseTo(2.0, 1);
  });
});
