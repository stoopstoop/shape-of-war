// Fairness rules 5 and 6 (docs/12 wave V3-A, docs/13 boss rule 5): no lethal hazard is created on
// the ship (it waits 0.3 s and rechecks), every hazard shows its telegraph and honours respawn
// invulnerability, the live caps hold, and a full world (ENTITY_CAP or maxLiveEnemies) skips a
// spawn instead of throwing.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import {
  bossAlive,
  countAdds,
  countHazards,
  HAZARD_OVERLAP,
  spawnAdd,
  spawnHazard,
  spawnLane,
  spawnPart,
  spawnPull,
  spawnRing,
  spawnSweep,
  spawnTether,
} from '../../src/game/bosses/core';
import { hazardHits, hazardTelegraph } from '../../src/game/bosses/kit';
import { liveSweep } from '../../src/game/bosses/spindle';
import { HAZARD_RECHECK_SEC, MAX_ADDS, MAX_HAZARDS, MAX_PARTS } from '../../src/game/bosses/table';
import { HazardType, PartType } from '../../src/game/bosses/types';
import * as grunt from '../../src/game/enemies/grunt';
import { createGame, stepGame } from '../../src/game/game';
import { SHIP_RADIUS } from '../../src/game/ship';
import { gs, spawnFromDef } from '../../src/game/state';
import { Kind, kill, type World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import type { BossId } from '../../src/levelgen/leveldef';
import { bossLevel, bs, bossGame, count, enter, park, run } from './bossHelpers';
import { DT, idle } from './helpers';

afterEach(() => bus.clear());

function circling(t: number): InputState {
  const i = idle();
  i.move = { active: true, x: Math.cos(t * 0.9), y: Math.sin(t * 1.3) };
  return i;
}

describe('no lethal hazard is created on the ship', () => {
  it('lane, ring, sweep and tether over the ship are refused; a pull is allowed', () => {
    const w = bossGame('warden');
    enter(w);
    const s = bs(w);
    park(w, 100, 0);
    expect(spawnLane(w, s, 0, 0, 0, 600, 22)).toBe(HAZARD_OVERLAP);
    expect(spawnRing(w, s, 0, 0, 100, Math.PI, 0.6, 1, 300)).toBe(HAZARD_OVERLAP);
    expect(spawnSweep(w, s, 0, 0, 0, 2, 380, 0.5, false)).toBe(HAZARD_OVERLAP);
    expect(spawnTether(w, s, -200, 0, 300, 0, 3)).toBe(HAZARD_OVERLAP);
    expect(countHazards(w)).toBe(0);
    expect(spawnPull(w, s, 0, 0, 300, 3, false)).toBeGreaterThan(0);
    // The same ring with its gap toward the ship is fine.
    expect(spawnRing(w, s, 0, 0, 100, 0, 0.6, 1, 300)).toBeGreaterThan(0);
  });

  it('Spindle waits 0.3 s and rechecks when its reversal sweep would cover the ship', () => {
    const w = bossGame('spindle');
    park(w, 600, 400);
    enter(w);
    const s = bs(w);
    for (let i = 0; i < 120 * 10 && s.t0 < 5 - 2 * DT; i++) stepGame(w, DT, idle());
    const old = liveSweep(w, s);
    expect(old).toBeGreaterThan(0);
    const boss = s.id;
    const a = w.rot[old] ?? 0;
    park(w, (w.x[boss] ?? 0) + Math.cos(a) * 150, (w.y[boss] ?? 0) + Math.sin(a) * 150);
    stepGame(w, DT, idle());
    stepGame(w, DT, idle());
    expect(s.retry).toBeGreaterThan(0);
    expect(s.retry).toBeLessThanOrEqual(HAZARD_RECHECK_SEC);
    expect(liveSweep(w, s)).toBe(old);
    park(w, 600, 400);
    run(w, HAZARD_RECHECK_SEC + 0.05);
    const fresh = liveSweep(w, s);
    expect(fresh).toBeGreaterThan(0);
    expect(w.t[fresh]).toBeLessThan(0.1);
  });

  for (const id of ['warden', 'brood', 'spindle'] as BossId[]) {
    it(`${id}: every hazard is born off the ship over 40 s of moving play`, () => {
      const w = bossGame(id, { lives: 99 });
      let born = 0;
      let t = 0;
      for (let i = 0; i < 120 * 40; i++) {
        stepGame(w, DT, circling(t));
        t += DT;
        for (let h = 1; h < w.cap; h++) {
          if (w.alive[h] !== 1 || w.kind[h] !== Kind.BossHazard || (w.t[h] ?? 0) > DT * 1.5) continue;
          born++;
          const hit = hazardHits(w.a[h] ?? -1, w.x[0] ?? 0, w.y[0] ?? 0, SHIP_RADIUS, w.x[h] ?? 0, w.y[h] ?? 0, w.rot[h] ?? 0, w.radius[h] ?? 0, w.vx[h] ?? 0, w.vy[h] ?? 0);
          expect(hit).toBe(false);
        }
        expect(countHazards(w)).toBeLessThanOrEqual(MAX_HAZARDS);
      }
      if (id !== 'brood') expect(born).toBeGreaterThan(0);
    });
  }
});

describe('telegraph and invulnerability', () => {
  function laneOnShipLater(w: World): number {
    const s = bs(w);
    park(w, 0, 300);
    const h = spawnLane(w, s, -300, 0, 0, 600, 22);
    expect(h).toBeGreaterThan(0);
    park(w, 0, 0);
    return h;
  }

  it('a hazard is harmless during its telegraph and lethal after it', () => {
    const w = bossGame('spindle', { lives: 3 }, {}, false);
    park(w, 600, 400);
    enter(w);
    // Remove the sweep so only the test lane can hit.
    for (let h = 1; h < w.cap; h++) if (w.kind[h] === Kind.BossHazard) kill(w, h);
    const tele = hazardTelegraph(1);
    laneOnShipLater(w);
    w.ship.invuln = 0;
    const steps = Math.floor(tele * 120) - 2;
    for (let i = 0; i < steps; i++) {
      park(w, 0, 0);
      stepGame(w, DT, idle());
    }
    expect(w.ship.active).toBe(true);
    for (let i = 0; i < 4; i++) {
      park(w, 0, 0);
      stepGame(w, DT, idle());
    }
    expect(w.ship.active).toBe(false);
  });

  it('respawn invulnerability is honoured by every lethal hazard', () => {
    const w = bossGame('spindle', { lives: 3 }, {}, false);
    park(w, 600, 400);
    enter(w);
    for (let h = 1; h < w.cap; h++) if (w.kind[h] === Kind.BossHazard) kill(w, h);
    laneOnShipLater(w);
    w.ship.invuln = 2;
    for (let i = 0; i < 150; i++) {
      park(w, 0, 0);
      stepGame(w, DT, idle());
    }
    expect(w.ship.active).toBe(true);
    expect(gs(w).lives).toBe(3);
  });
});

describe('caps', () => {
  it(`at most ${MAX_HAZARDS} live hazards`, () => {
    const w = bossGame('warden');
    enter(w);
    const s = bs(w);
    park(w, 600, 400);
    let made = 0;
    for (let i = 0; i < 12; i++) if (spawnLane(w, s, -600, -400 + i * 10, 0, 100, 22) > 0) made++;
    expect(made).toBeLessThanOrEqual(MAX_HAZARDS);
    expect(countHazards(w)).toBeLessThanOrEqual(MAX_HAZARDS);
    expect(spawnHazard(w, s, HazardType.Lane, -600, 300, 0, 22, 100, 0, 0, 1, false)).toBe(-1);
  });

  it(`at most ${MAX_PARTS} parts, one per slot`, () => {
    const w = bossGame('warden');
    enter(w);
    const s = bs(w);
    for (let k = 0; k < MAX_PARTS; k++) expect(spawnPart(w, s, k, PartType.Pod, -500 + k * 40, -300, 10, 12)).toBeGreaterThan(0);
    expect(spawnPart(w, s, 0, PartType.Pod, 0, 300, 10, 12)).toBe(-1);
    expect(spawnPart(w, s, MAX_PARTS, PartType.Pod, 0, 300, 10, 12)).toBe(-1);
    expect(count(w, Kind.BossPart)).toBe(MAX_PARTS);
  });

  it(`at most ${MAX_ADDS} live adds, and maxLiveEnemies is a hard cap`, () => {
    const w = bossGame('warden');
    enter(w);
    const s = bs(w);
    let made = 0;
    for (let i = 0; i < 12; i++) if (spawnAdd(w, s, grunt.def, -600 + i * 30, 300) > 0) made++;
    expect(made).toBe(MAX_ADDS);
    expect(countAdds(w, s)).toBe(MAX_ADDS);

    const v = bossGame('warden', { waves: { ...bossLevel('warden').waves, maxLiveEnemies: 2 } });
    enter(v);
    const sv = bs(v);
    let madeV = 0;
    for (let i = 0; i < 5; i++) if (spawnAdd(v, sv, grunt.def, -600 + i * 30, 300) > 0) madeV++;
    expect(madeV).toBe(2);
  });
});

describe('a full world (ENTITY_CAP) is skipped, never thrown', () => {
  function fill(w: World): number[] {
    const ids: number[] = [];
    for (;;) {
      const id = spawnFromDef(w, grunt.def, -650, -420, 0);
      if (id < 0) return ids;
      w.alive[id] = 1;
      ids.push(id);
    }
  }

  it('the boss waits while the world is full and enters once a slot frees', () => {
    const w = createGame(bossLevel('warden', { drone: 'collect' }, 0.1), { capacity: 16, vibrate: () => undefined });
    gs(w).invulnerable = true;
    const ids = fill(w);
    expect(ids.length).toBeGreaterThan(0);
    expect(() => run(w, 0.5)).not.toThrow();
    expect(bossAlive(w)).toBe(false);
    // Two slots: the drone (missing since the world filled) takes the first in stepDrone.
    kill(w, ids.at(-1) ?? -1);
    kill(w, ids.at(-2) ?? -1);
    stepGame(w, DT, idle());
    expect(bossAlive(w)).toBe(true);
  });

  it('hazards, parts and adds return -1 in a full world', () => {
    const w = createGame(bossLevel('warden', { drone: 'collect' }, 0.1), { capacity: 24, vibrate: () => undefined });
    gs(w).invulnerable = true;
    park(w, 600, 400);
    enter(w);
    fill(w);
    const s = bs(w);
    expect(spawnLane(w, s, -600, 0, 0, 100, 22)).toBe(-1);
    expect(spawnPart(w, s, 0, PartType.Pod, 0, 0, 10, 12)).toBe(-1);
    expect(spawnAdd(w, s, grunt.def, 0, 0)).toBe(-1);
    expect(() => run(w, 6)).not.toThrow();
  });
});
