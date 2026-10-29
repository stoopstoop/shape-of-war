// Spindle (docs/12 roster row 3): two sweep arms with 180 deg gaps, frozen through each reversal's
// 1.0 s telegraph, then turning at the pellet trade rate; they reverse every 5 s. Always hittable.
// Phase 2 has three arms. It circles the arena centre at radius 200.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { damageBoss } from '../../src/game/bosses/core';
import { hazardTelegraph, sweepGap } from '../../src/game/bosses/kit';
import { armsFor, liveSweep } from '../../src/game/bosses/spindle';
import { BOSS_SHOTS, SPINDLE, spindleArmRate } from '../../src/game/bosses/table';
import { stepGame } from '../../src/game/game';
import { bs, bossGame, enter, park, run } from './bossHelpers';
import { DT, idle } from './helpers';

afterEach(() => bus.clear());

describe('spindle', () => {
  it('turns its arms at the pellet trade rate (0.4 rad/s, 0.5 without the shot row)', () => {
    expect(BOSS_SHOTS.spindle?.armRate).toBe(0.4);
    expect(spindleArmRate()).toBe(0.4);
    expect(SPINDLE.armRate).toBe(0.5);
  });

  it('two arms leave 180 deg gaps; phase 2 has three', () => {
    expect(armsFor(1)).toBe(2);
    expect(armsFor(2)).toBe(3);
    expect(sweepGap(armsFor(1))).toBeCloseTo(Math.PI);
    const w = bossGame('spindle');
    park(w, 600, 400);
    enter(w);
    run(w, 0.05);
    const h = liveSweep(w, bs(w));
    expect(w.vy[h]).toBe(2);
    expect(sweepGap(w.vy[h] ?? 0)).toBeCloseTo(Math.PI);
    bs(w).open = true;
    damageBoss(w, 2001, 0, 0);
    run(w, 1.2); // phase change pause, then the rebuild
    const h2 = liveSweep(w, bs(w));
    expect(w.vy[h2]).toBe(3);
  });

  it('arms hold still through the telegraph, turn after it, and reverse every 5 s', () => {
    const w = bossGame('spindle');
    park(w, 600, 400);
    enter(w);
    const s = bs(w);
    const tele = hazardTelegraph(1);
    run(w, 0.05);
    const h = liveSweep(w, s);
    const r0 = w.rot[h] ?? 0;
    run(w, tele - 0.2);
    expect(w.rot[h]).toBe(r0);
    run(w, 1.0);
    const r1 = w.rot[h] ?? 0;
    const turned = r1 - r0;
    expect(turned).toBeGreaterThan(0);
    // About 0.85 s of turning at 0.4 rad/s.
    expect(turned).toBeCloseTo(0.4 * 0.85, 1);
    // Reversal at 5 s: a fresh sweep, its arms start where the old ones were, then turn the other way.
    for (let i = 0; i < 120 * 6 && liveSweep(w, s) === h; i++) stepGame(w, DT, idle());
    const h2 = liveSweep(w, s);
    expect(h2).toBeGreaterThan(0);
    expect(h2 === h ? w.t[h2] : 0).toBeLessThan(0.1);
    expect(w.t[h2]).toBeLessThan(0.1);
    expect(s.dir).toBe(-1);
    const q0 = w.rot[h2] ?? 0;
    run(w, tele + 0.5);
    const q1 = w.rot[h2] ?? 0;
    expect(q1 - q0).toBeLessThan(0);
    // And back again 5 s later.
    for (let i = 0; i < 120 * 6 && liveSweep(w, s) === h2; i++) stepGame(w, DT, idle());
    expect(s.dir).toBe(1);
  });

  it('is always hittable after its entrance', () => {
    const w = bossGame('spindle');
    park(w, 600, 400);
    const id = enter(w);
    for (let i = 0; i < 120 * 12; i++) {
      stepGame(w, DT, idle());
      if (i % 30 !== 0) continue;
      const hp = w.hp[id] ?? 0;
      damageBoss(w, 1, 0, 0);
      expect(w.hp[id]).toBe(hp - 1);
    }
  });

  it('circles the arena centre at radius 200', () => {
    const w = bossGame('spindle');
    park(w, 600, 400);
    const id = enter(w);
    run(w, 4);
    for (let i = 0; i < 6; i++) {
      run(w, 1);
      expect(Math.hypot(w.x[id] ?? 0, w.y[id] ?? 0)).toBeCloseTo(SPINDLE.orbitRadius, -1);
    }
  });
});
