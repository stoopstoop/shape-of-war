// Fairness for the tier 3 bosses (docs/13 boss rules 5 and 6): every lethal hazard shows the 0.6 s
// tier 3 telegraph, rings keep a gap of at least 45 deg, lanes are at most 60 u wide, no lethal
// hazard is born on the ship, the hazard, part and Slime caps hold, respawn invulnerability is
// honoured, and a ship death clears hazards, keeps the hit points and pauses the attacks.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { countHazards } from '../../src/game/bosses/core';
import { hazardHits, hazardTelegraph, ringGapMin } from '../../src/game/bosses/kit';
import { MAX_HAZARDS, MAX_PARTS } from '../../src/game/bosses/table';
import { HazardType } from '../../src/game/bosses/types';
import * as slime from '../../src/game/enemies/slime';
import { stepGame } from '../../src/game/game';
import { SHIP_RADIUS } from '../../src/game/ship';
import { gs } from '../../src/game/state';
import { Kind } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import type { BossId } from '../../src/levelgen/leveldef';
import { bs, bossGame, count, enter, park, run } from './bossHelpers';
import { DT, idle } from './helpers';

afterEach(() => bus.clear());

const TIER3: BossId[] = ['bastion', 'tempest', 'twins'];

function circling(t: number): InputState {
  const i = idle();
  i.move = { active: true, x: Math.cos(t * 0.9), y: Math.sin(t * 1.3) };
  return i;
}

describe('tier 3 fairness', () => {
  it('the tier 3 telegraph is 0.6 s and the ring gap minimum 45 deg', () => {
    expect(hazardTelegraph(3)).toBe(0.6);
    expect(ringGapMin(3)).toBeCloseTo(Math.PI / 4);
  });

  for (const id of TIER3) {
    it(id + ': every hazard is born off the ship with the 0.6 s telegraph over 40 s of moving play', () => {
      const w = bossGame(id, { lives: 99 });
      const s = bs(w);
      let born = 0;
      let t = 0;
      for (let i = 0; i < 120 * 40; i++) {
        stepGame(w, DT, circling(t));
        t += DT;
        expect(countHazards(w)).toBeLessThanOrEqual(MAX_HAZARDS);
        expect(count(w, Kind.BossPart)).toBeLessThanOrEqual(MAX_PARTS);
        expect(count(w, Kind.Slime)).toBeLessThanOrEqual(slime.CAP_TOTAL);
        for (let h = 1; h < w.cap; h++) {
          if (w.alive[h] !== 1 || w.kind[h] !== Kind.BossHazard || (w.t[h] ?? 0) > DT * 1.5) continue;
          const type = w.a[h] ?? -1;
          if (type === HazardType.Pull) continue;
          if (s.hzMarker[h] === 1) {
            expect(s.hzLife[h] ?? 0).toBeLessThan(s.hzTele[h] ?? 0);
            continue;
          }
          born++;
          expect(s.hzTele[h]).toBeCloseTo(0.6, 5);
          if (type === HazardType.Ring) expect((w.vx[h] ?? 0) * 2).toBeGreaterThanOrEqual(ringGapMin(3) - 1e-6);
          if (type === HazardType.Lane) expect((w.radius[h] ?? 0) * 2).toBeLessThanOrEqual(60);
          const hit = hazardHits(type, w.x[0] ?? 0, w.y[0] ?? 0, SHIP_RADIUS, w.x[h] ?? 0, w.y[h] ?? 0, w.rot[h] ?? 0, w.radius[h] ?? 0, w.vx[h] ?? 0, w.vy[h] ?? 0);
          expect(hit).toBe(false);
        }
      }
      if (id !== 'tempest') expect(born).toBeGreaterThan(0);
    });

    it(id + ': respawn invulnerability is honoured by the body and every hazard', () => {
      const w = bossGame(id, { lives: 3 }, {}, false);
      park(w, 400, 250);
      w.ship.invuln = 0;
      const boss = enter(w);
      w.ship.invuln = 3;
      for (let i = 0; i < 120 * 2.5; i++) {
        park(w, w.x[boss] ?? 0, w.y[boss] ?? 0);
        stepGame(w, DT, idle());
      }
      expect(w.ship.active).toBe(true);
      expect(gs(w).lives).toBe(3);
    });

    it(id + ': a ship death clears hazards, keeps hit points and pauses attacks for the respawn', () => {
      const w = bossGame(id, { lives: 3 }, {}, false);
      park(w, 400, 250);
      w.ship.invuln = 0;
      const boss = enter(w);
      run(w, 3);
      const hp = w.hp[boss] ?? 0;
      w.ship.invuln = 0;
      for (let i = 0; i < 120 * 3 && w.ship.active; i++) {
        park(w, w.x[boss] ?? 0, w.y[boss] ?? 0);
        stepGame(w, DT, idle());
      }
      expect(w.ship.active).toBe(false);
      expect(countHazards(w)).toBe(0);
      expect(w.hp[boss]).toBe(hp);
      const x = w.x[boss] ?? 0;
      const y = w.y[boss] ?? 0;
      for (let i = 0; i < 120 && !w.ship.active; i++) {
        stepGame(w, DT, idle());
        expect(countHazards(w)).toBe(0);
        expect(w.x[boss]).toBe(x);
        expect(w.y[boss]).toBe(y);
      }
    });
  }
});
