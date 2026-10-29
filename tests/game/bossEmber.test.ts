// Ember (docs/12 roster row 4): wind up with a lane marker, a dash that bounces off up to two
// walls and drops Mines every 120 u, a 2 s stun only after a wall hit, a rest after an open floor
// dash. Hittable only stunned or resting. Three phases, each 15 percent faster.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { isInside } from '../../src/game/arena';
import { damageBoss } from '../../src/game/bosses/core';
import { dashSecFor, dashSpeedFor, EmberMove, isOpen, restFor, speedFor, windupFor } from '../../src/game/bosses/ember';
import { hazardTelegraph, reflectHeading } from '../../src/game/bosses/kit';
import { EMBER } from '../../src/game/bosses/table';
import { BossMode } from '../../src/game/bosses/types';
import { CAP_PER_SOWER, CAP_TOTAL, def as mineDef } from '../../src/game/enemies/mine';
import { stepGame } from '../../src/game/game';
import { spawnFromDef } from '../../src/game/state';
import { Kind, type World } from '../../src/game/world';
import { bs, bossGame, count, enter, park } from './bossHelpers';
import { DT, idle } from './helpers';

afterEach(() => bus.clear());

interface DashEnd {
  next: number;
  touched: boolean;
}

/** Step until Ember leaves its current or next dash. Returns the state it entered and whether it touched a wall. */
function untilDashEnds(w: World, maxSec = 8): DashEnd {
  const s = bs(w);
  const id = s.id;
  const r = w.radius[id] ?? 0;
  let dashing = false;
  let touched = false;
  for (let i = 0; i < maxSec * 120; i++) {
    stepGame(w, DT, idle());
    if (s.n0 === EmberMove.Dash) {
      dashing = true;
      if (!isInside(w.level.arena, w.x[id] ?? 0, w.y[id] ?? 0, r + 0.5)) touched = true;
    } else if (dashing) {
      return { next: s.n0, touched };
    }
  }
  throw new Error('no dash ended');
}

function placeBoss(w: World, x: number, y: number): void {
  const id = bs(w).id;
  w.x[id] = x;
  w.y[id] = y;
  w.prevX[id] = x;
  w.prevY[id] = y;
}

describe('ember: pure numbers', () => {
  it('each phase is 15 percent faster and the wind up never drops under the 0.8 s telegraph', () => {
    expect(speedFor(1)).toBe(1);
    expect(speedFor(2)).toBeCloseTo(1.15);
    expect(speedFor(3)).toBeCloseTo(1.15 * 1.15);
    expect(dashSpeedFor(2)).toBeCloseTo(EMBER.dashSpeed * 1.15);
    expect(dashSpeedFor(1) * dashSecFor(1)).toBeCloseTo(dashSpeedFor(3) * dashSecFor(3));
    expect(restFor(2, EMBER.restSec)).toBeCloseTo(EMBER.restSec / 1.15);
    expect(windupFor(1, 2)).toBeCloseTo(0.9);
    for (const p of [1, 2, 3]) expect(windupFor(p, 2)).toBeGreaterThanOrEqual(hazardTelegraph(2));
  });

  it('reflectHeading bounces off a wall and leaves a leaving heading alone', () => {
    expect(Math.cos(reflectHeading(0, -1, 0))).toBeCloseTo(-1);
    const a = reflectHeading(Math.PI / 4, 0, -1);
    expect(Math.cos(a)).toBeCloseTo(Math.SQRT1_2);
    expect(Math.sin(a)).toBeCloseTo(-Math.SQRT1_2);
    expect(reflectHeading(Math.PI, -1, 0)).toBe(Math.PI);
  });

  it('is open only stunned or resting', () => {
    expect(isOpen(EmberMove.Windup)).toBe(false);
    expect(isOpen(EmberMove.Dash)).toBe(false);
    expect(isOpen(EmberMove.Rest)).toBe(true);
    expect(isOpen(EmberMove.Stun)).toBe(true);
  });
});

describe('ember', () => {
  it('a dash that ends in open floor rests; it never stuns', () => {
    const w = bossGame('ember');
    park(w, 100, 0);
    enter(w);
    placeBoss(w, -300, 0);
    const end = untilDashEnds(w);
    expect(end.touched).toBe(false);
    expect(end.next).toBe(EmberMove.Rest);
    expect(bs(w).mode).toBe(BossMode.Vulnerable);
  });

  it('a dash into a wall stuns it for 2 s', () => {
    const w = bossGame('ember');
    park(w, 620, 0);
    enter(w);
    placeBoss(w, 400, 0);
    const end = untilDashEnds(w);
    expect(end.touched).toBe(true);
    expect(end.next).toBe(EmberMove.Stun);
    const s = bs(w);
    expect(s.mode).toBe(BossMode.Stunned);
    let stunned = 1;
    while (s.n0 === EmberMove.Stun && stunned < 5 * 120) {
      stepGame(w, DT, idle());
      stunned++;
    }
    expect(stunned * DT).toBeCloseTo(EMBER.stunSec, 1);
  });

  it('over many dashes it stuns only after a wall hit and rests only after open floor', () => {
    const w = bossGame('ember');
    park(w, 0, 0);
    enter(w);
    let stuns = 0;
    let rests = 0;
    for (let k = 0; k < 16; k++) {
      // Four dashes with the ship against a wall (Ember closes in 456 u at a time), then four in
      // the middle, so both endings happen.
      const side = Math.floor(k / 4) % 2 === 0;
      park(w, side ? (k % 8 < 2 ? 640 : -640) : 0, side ? 0 : 100);
      const end = untilDashEnds(w);
      if (end.next === EmberMove.Stun) {
        stuns++;
        expect(end.touched).toBe(true);
      } else {
        rests++;
        expect(end.next).toBe(EmberMove.Rest);
        expect(end.touched).toBe(false);
      }
    }
    expect(stuns).toBeGreaterThan(0);
    expect(rests).toBeGreaterThan(0);
  });

  it('is hittable only stunned or resting', () => {
    const w = bossGame('ember');
    park(w, 500, 300);
    const id = enter(w);
    const s = bs(w);
    const seen = new Set<number>();
    for (let i = 0; i < 120 * 30; i++) {
      stepGame(w, DT, idle());
      if (i % 840 === 0) park(w, i % 1680 === 0 ? -550 : 550, 300);
      if (i % 7 !== 0 || s.phaseT > 0 || s.stagger > 0) continue;
      const hp = w.hp[id] ?? 0;
      damageBoss(w, 1, w.x[id] ?? 0, w.y[id] ?? 0);
      const took = (w.hp[id] ?? 0) < hp;
      seen.add(s.n0);
      expect(took).toBe(s.n0 === EmberMove.Rest || s.n0 === EmberMove.Stun);
    }
    expect(seen.has(EmberMove.Windup)).toBe(true);
    expect(seen.has(EmberMove.Dash)).toBe(true);
    expect(seen.has(EmberMove.Rest) || seen.has(EmberMove.Stun)).toBe(true);
  });

  it('never dashes before its marker has shown the full 0.8 s telegraph', () => {
    const w = bossGame('ember');
    park(w, 300, 200);
    enter(w);
    const s = bs(w);
    let markerAt = -1;
    let dashes = 0;
    let prev = s.n0;
    for (let i = 0; i < 120 * 25; i++) {
      stepGame(w, DT, idle());
      if (s.n0 === EmberMove.Windup && s.n2 > 0 && markerAt < 0) markerAt = i;
      if (s.n0 === EmberMove.Dash && prev === EmberMove.Windup) {
        dashes++;
        expect(markerAt).toBeGreaterThanOrEqual(0);
        expect((i - markerAt) * DT).toBeGreaterThanOrEqual(hazardTelegraph(2) - DT * 1.5);
        markerAt = -1;
      }
      if (i % 600 === 0) park(w, (i / 600) % 2 === 0 ? -400 : 400, 200);
      prev = s.n0;
    }
    expect(dashes).toBeGreaterThan(3);
  });

  it('drops Mines along the dash, about one per 120 u, owned by the boss', () => {
    const w = bossGame('ember');
    park(w, 100, 0);
    enter(w);
    placeBoss(w, -300, 0);
    expect(count(w, Kind.Mine)).toBe(0);
    untilDashEnds(w);
    const n = count(w, Kind.Mine);
    const expected = Math.floor((EMBER.dashSpeed * EMBER.dashSec) / EMBER.mineEvery);
    expect(n).toBeGreaterThanOrEqual(expected - 1);
    expect(n).toBeLessThanOrEqual(expected);
    for (let m = 1; m < w.cap; m++) if (w.alive[m] === 1 && w.kind[m] === Kind.Mine) expect(w.a[m]).toBe(bs(w).id);
  });

  it('respects the Mine caps: 6 per owner and 24 in total', () => {
    const w = bossGame('ember');
    park(w, 0, 0);
    const id = enter(w);
    let most = 0;
    for (let i = 0; i < 120 * 40; i++) {
      stepGame(w, DT, idle());
      if (i % 600 === 0) park(w, (i / 600) % 2 === 0 ? -500 : 500, (i / 600) % 3 === 0 ? -250 : 250);
      let owned = 0;
      for (let m = 1; m < w.cap; m++) if (w.alive[m] === 1 && w.kind[m] === Kind.Mine && w.a[m] === id) owned++;
      most = Math.max(most, owned);
      expect(owned).toBeLessThanOrEqual(CAP_PER_SOWER);
      expect(count(w, Kind.Mine)).toBeLessThanOrEqual(CAP_TOTAL);
    }
    expect(most).toBe(CAP_PER_SOWER);

    // A full total cap: Ember drops nothing and nothing throws.
    const v = bossGame('ember');
    park(v, 100, 0);
    enter(v);
    placeBoss(v, -300, 0);
    for (let k = 0; k < CAP_TOTAL; k++) {
      const m = spawnFromDef(v, mineDef, -600 + k * 40, 400, 0);
      v.a[m] = -1;
    }
    expect(() => untilDashEnds(v)).not.toThrow();
    expect(count(v, Kind.Mine)).toBe(CAP_TOTAL);
  });

  it('phase 3 dashes faster than phase 1', () => {
    const w = bossGame('ember');
    park(w, 100, 0);
    const id = enter(w);
    const s = bs(w);
    s.phase = 3;
    placeBoss(w, -300, 0);
    for (let i = 0; i < 120 * 4 && s.n0 !== EmberMove.Dash; i++) stepGame(w, DT, idle());
    const x0 = w.x[id] ?? 0;
    stepGame(w, DT, idle());
    expect(Math.abs((w.x[id] ?? 0) - x0)).toBeCloseTo(dashSpeedFor(3) * DT, 0);
  });
});
