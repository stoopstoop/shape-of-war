// Tempest (docs/12 roster row 8): the wall lap at 140 u/s and 90 u from the wall, the Slime trail
// inside its cap of 8 and the 12 total, the lane dash with a marker, the hittable 1.5 s rest at the
// far wall, and the dash interval that shortens per phase.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { damageBoss } from '../../src/game/bosses/core';
import { hazardTelegraph } from '../../src/game/bosses/kit';
import { TEMPEST } from '../../src/game/bosses/table';
import { dashEveryFor, lapRadius, TempestMove } from '../../src/game/bosses/tempest';
import * as slime from '../../src/game/enemies/slime';
import { stepGame } from '../../src/game/game';
import { spawnFromDef } from '../../src/game/state';
import { Kind, type World } from '../../src/game/world';
import { bs, bossGame, count, enter, park, run } from './bossHelpers';
import { DT, idle } from './helpers';

afterEach(() => bus.clear());

function game(): { w: World; boss: number } {
  const w = bossGame('tempest', { lives: 9 });
  park(w, 0, 0);
  const boss = enter(w);
  return { w, boss };
}

function until(w: World, state: TempestMove, maxSec = 12): void {
  const s = bs(w);
  for (let i = 0; i < maxSec * 120; i++) {
    if (s.n0 === state) return;
    stepGame(w, DT, idle());
  }
  throw new Error('state never reached: ' + String(state));
}

describe('tempest', () => {
  it('dash every 6 s, 5 s, 4 s by phase', () => {
    expect([1, 2, 3].map(dashEveryFor)).toEqual([6, 5, 4]);
  });

  it('keeps its lap 90 u from the wall at 140 u/s', () => {
    const { w, boss } = game();
    run(w, 1.0);
    let px = w.x[boss] ?? 0;
    let py = w.y[boss] ?? 0;
    let travelled = 0;
    for (let i = 0; i < 240; i++) {
      stepGame(w, DT, idle());
      const x = w.x[boss] ?? 0;
      const y = w.y[boss] ?? 0;
      travelled += Math.hypot(x - px, y - py);
      px = x;
      py = y;
      expect(bs(w).n0).toBe(TempestMove.Lap);
      expect(Math.abs(Math.hypot(x, y) - lapRadius(w, Math.atan2(y, x)))).toBeLessThan(12);
      // The centre stays the wall gap (less a little) from every wall of the 1400 x 900 floor.
      expect(700 - Math.abs(x)).toBeGreaterThan(TEMPEST.wallGap - 4);
      expect(450 - Math.abs(y)).toBeGreaterThan(TEMPEST.wallGap - 4);
    }
    expect(travelled / 2).toBeGreaterThan(TEMPEST.lapSpeed * 0.9);
    expect(travelled / 2).toBeLessThan(TEMPEST.lapSpeed * 1.2);
  });

  it('drops Slime every 1.0 s, at most 8 of its own, inside the 12 total cap', () => {
    const { w } = game();
    let most = 0;
    for (let i = 0; i < 120 * 30; i++) {
      stepGame(w, DT, idle());
      const n = count(w, Kind.Slime);
      expect(n).toBeLessThanOrEqual(TEMPEST.slimeMax);
      if (n > most) most = n;
    }
    expect(most).toBeGreaterThanOrEqual(6);
    // Seven Slime from elsewhere: the total never passes 12.
    const w2 = game().w;
    for (let k = 0; k < 7; k++) {
      const id = spawnFromDef(w2, slime.def, -600 + k * 60, -400, 0);
      w2.a[id] = -1;
    }
    for (let i = 0; i < 120 * 6; i++) {
      stepGame(w2, DT, idle());
      expect(count(w2, Kind.Slime)).toBeLessThanOrEqual(slime.CAP_TOTAL);
    }
    expect(count(w2, Kind.Slime)).toBe(slime.CAP_TOTAL);
  });

  it('winds up for the tier telegraph with a lane marker, closed through the dash', () => {
    const { w, boss } = game();
    const s = bs(w);
    until(w, TempestMove.Windup);
    expect(count(w, Kind.BossHazard)).toBe(1);
    expect(s.open).toBe(false);
    const hp = w.hp[boss] ?? 0;
    damageBoss(w, 100, 0, 0);
    expect(w.hp[boss]).toBe(hp);
    let n = 0;
    while (s.n0 === TempestMove.Windup && n < 600) {
      stepGame(w, DT, idle());
      n++;
    }
    expect(n * DT).toBeCloseTo(hazardTelegraph(3), 1);
    expect(s.n0).toBe(TempestMove.Dash);
    expect(s.open).toBe(false);
  });

  it('rests 1.5 s at the far wall and the rest is hittable', () => {
    const { w, boss } = game();
    const s = bs(w);
    until(w, TempestMove.Rest);
    expect(s.open).toBe(true);
    const x = Math.abs(w.x[boss] ?? 0);
    const y = Math.abs(w.y[boss] ?? 0);
    expect(Math.min(700 - x, 450 - y)).toBeLessThan((w.radius[boss] ?? 0) + 2);
    const hp = w.hp[boss] ?? 0;
    damageBoss(w, 100, 0, 0);
    expect(w.hp[boss]).toBe(hp - 100);
    let n = 0;
    while (s.n0 === TempestMove.Rest && n < 600) {
      stepGame(w, DT, idle());
      n++;
    }
    expect(n * DT).toBeCloseTo(TEMPEST.restSec, 1);
    expect(s.n0).toBe(TempestMove.Lap);
  });
});
