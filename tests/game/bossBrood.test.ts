// Brood (docs/12 roster row 2, reworked at G3A): immune until its three pods die, then open for 5 s, then closed
// again until the pods regrow 10 s after the last one died. It prowls at the ship and charges along
// a telegraphed marker; its adds are Darts launched at the ship, at most 8 live. Pods score 0, drop
// nothing and count 0 kills.
import { afterEach, describe, expect, it } from 'vitest';
import { bus, type Events } from '../../src/core/events';
import { addEveryFor, addsPerWaveFor, BroodMove } from '../../src/game/bosses/brood';
import { countParts, damageBoss, damageBossPart, livePart } from '../../src/game/bosses/core';
import { hazardTelegraph } from '../../src/game/bosses/kit';
import { BROOD, MAX_ADDS } from '../../src/game/bosses/table';
import { BossMode, HazardType, PartType } from '../../src/game/bosses/types';
import { createBossView, readBoss } from '../../src/game/bosses/view';
import { spawnBullet } from '../../src/game/bullets';
import { rebuild } from '../../src/game/collide';
import { bulletHits } from '../../src/game/combat';
import { stepGame } from '../../src/game/game';
import { gs } from '../../src/game/state';
import { angleBetween, distBetween } from '../../src/game/steer';
import { Kind, kill, type World } from '../../src/game/world';
import { bs, bossGame, count, enter, first, park, run } from './bossHelpers';
import { DT, idle } from './helpers';

afterEach(() => bus.clear());

/** Remove every add, so only the body and the marker can touch the ship. */
function noAdds(w: World): void {
  for (let e = 1; e < w.cap; e++) if (w.alive[e] === 1 && (w.kind[e] === Kind.Dart || w.kind[e] === Kind.Grunt)) kill(w, e);
}

function killPods(w: World): void {
  const s = bs(w);
  for (let k = 0; k < BROOD.podCount; k++) {
    const p = livePart(w, s, k);
    if (p > 0) damageBossPart(w, p, BROOD.podHp, 0, 0);
  }
}

describe('brood', () => {
  it('enters with three pods orbiting at 90 u', () => {
    const w = bossGame('brood');
    park(w, 0, 0);
    const id = enter(w);
    expect(count(w, Kind.BossPart)).toBe(3);
    const s = bs(w);
    for (let k = 0; k < 3; k++) {
      const p = livePart(w, s, k);
      expect(w.a[p]).toBe(PartType.Pod);
      expect(w.hp[p]).toBe(BROOD.podHp);
    }
    run(w, 2);
    for (let k = 0; k < 3; k++) {
      const p = livePart(w, s, k);
      expect(distBetween(w, id, p)).toBeLessThanOrEqual(BROOD.podOrbit + 0.01);
    }
  });

  it('is immune until its pods die, open 5 s, then closes again until they regrow at 10 s', () => {
    const w = bossGame('brood');
    park(w, 0, 0);
    const id = enter(w);
    const hp0 = w.hp[id] ?? 0;
    damageBoss(w, 10, 0, 0);
    expect(w.hp[id]).toBe(hp0);
    // Two pods down: still immune.
    const s = bs(w);
    damageBossPart(w, livePart(w, s, 0), BROOD.podHp, 0, 0);
    damageBossPart(w, livePart(w, s, 1), BROOD.podHp, 0, 0);
    stepGame(w, DT, idle());
    damageBoss(w, 10, 0, 0);
    expect(w.hp[id]).toBe(hp0);
    killPods(w);
    stepGame(w, DT, idle());
    expect(s.open).toBe(true);
    damageBoss(w, 10, 0, 0);
    expect(w.hp[id]).toBe(hp0 - 10);
    run(w, BROOD.openSec - 0.1);
    expect(s.open).toBe(true);
    run(w, 0.2);
    expect(s.open).toBe(false);
    damageBoss(w, 10, 0, 0);
    expect(w.hp[id]).toBe(hp0 - 10);
    expect(countParts(w, s)).toBe(0);
    run(w, BROOD.regrowSec - BROOD.openSec - 0.3);
    expect(countParts(w, s)).toBe(0);
    run(w, 0.3);
    expect(countParts(w, s)).toBe(3);
    damageBoss(w, 10, 0, 0);
    expect(w.hp[id]).toBe(hp0 - 10);
  });

  it('a spread bullet breaks a pod: fx:kill with Kind.BossPart, no score, no geoms, no kill', () => {
    const kills: Events['fx:kill'][] = [];
    bus.on('fx:kill', (p) => kills.push({ ...p }));
    const w = bossGame('brood');
    park(w, 0, 0);
    enter(w);
    const s = bs(w);
    const g = gs(w);
    const p = livePart(w, s, 0);
    rebuild(w.grid, w);
    const score = g.score;
    const k0 = g.kills;
    spawnBullet(w.bullets, w.x[p] ?? 0, w.y[p] ?? 0, 0, 0, 1);
    bulletHits(w);
    expect(w.alive[p]).toBe(0);
    expect(kills.at(-1)).toMatchObject({ kind: Kind.BossPart, colour: 'bossGreen' });
    expect(g.score).toBe(score);
    expect(g.kills).toBe(k0);
    expect(count(w, Kind.Geom)).toBe(0);
  });

  it('launches three Darts 2 s after entering from the side facing the ship, and they close on it', () => {
    const w = bossGame('brood');
    park(w, 0, 0);
    const id = enter(w);
    run(w, BROOD.firstAdds - 0.1);
    expect(count(w, Kind.Dart)).toBe(0);
    run(w, 0.2);
    expect(count(w, Kind.Dart)).toBe(3);
    expect(count(w, Kind.Grunt)).toBe(0);
    const toShip = angleBetween(w, id, 0);
    const d0: number[] = [];
    const ids: number[] = [];
    for (let i = 1; i < w.cap; i++) {
      if (w.alive[i] !== 1 || w.kind[i] !== Kind.Dart) continue;
      ids.push(i);
      d0.push(distBetween(w, i, 0));
      // Front launch: every Dart sits within the fan around the heading to the ship.
      let off = angleBetween(w, id, i) - toShip;
      while (off > Math.PI) off -= 2 * Math.PI;
      while (off < -Math.PI) off += 2 * Math.PI;
      expect(Math.abs(off)).toBeLessThanOrEqual(((BROOD.addSpreadDeg + 1) * Math.PI) / 180);
    }
    run(w, 1.0);
    ids.forEach((d, k) => {
      expect(w.alive[d]).toBe(1);
      expect(distBetween(w, d, 0)).toBeLessThan((d0[k] ?? 0) - 60);
    });
  });

  it('never more than 8 live adds; phase 2 launches four Darts every 5 s', () => {
    const w = bossGame('brood');
    park(w, 0, 0);
    enter(w);
    let most = 0;
    for (let i = 0; i < 120 * 40; i++) {
      stepGame(w, DT, idle());
      most = Math.max(most, count(w, Kind.Grunt) + count(w, Kind.Dart));
    }
    expect(most).toBeLessThanOrEqual(MAX_ADDS);
    expect(most).toBeGreaterThanOrEqual(6);
    expect(addsPerWaveFor(1)).toBe(3);
    expect(addsPerWaveFor(2)).toBe(4);
    expect(addEveryFor(1)).toBe(6);
    expect(addEveryFor(2)).toBe(5);
    const v = bossGame('brood');
    park(v, 0, 0);
    enter(v);
    killPods(v);
    stepGame(v, DT, idle());
    damageBoss(v, 2001, 0, 0);
    expect(bs(v).phase).toBe(2);
    const jumps: number[] = [];
    const at: number[] = [];
    for (let i = 0; i < 120 * 16; i++) {
      noAdds(v);
      stepGame(v, DT, idle());
      const n = count(v, Kind.Dart);
      if (n > 0) {
        jumps.push(n);
        at.push(i / 120);
      }
    }
    expect(jumps.length).toBeGreaterThanOrEqual(3);
    for (const j of jumps) expect(j).toBe(4);
    for (let k = 1; k < at.length; k++) expect((at[k] ?? 0) - (at[k - 1] ?? 0)).toBeCloseTo(BROOD.addEveryP2, 1);
  });

  it('leaves the boundary and closes on the ship while it prowls', () => {
    const w = bossGame('brood');
    park(w, 0, 0);
    const id = enter(w);
    const d0 = distBetween(w, id, 0);
    run(w, BROOD.firstCharge - 0.1);
    expect(bs(w).n0).toBe(BroodMove.Prowl);
    expect(distBetween(w, id, 0)).toBeLessThan(d0 - BROOD.prowlSpeed * (BROOD.firstCharge - 0.1) * 0.8);
  });

  it('winds up for the tier telegraph with a never lethal marker on its locked heading, then charges at 320 u/s', () => {
    const w = bossGame('brood', {}, {}, false);
    park(w, 0, 0);
    const id = enter(w);
    w.ship.invuln = 0;
    const s = bs(w);
    for (let i = 0; i < 120 * 5 && s.n0 !== BroodMove.Windup; i++) {
      park(w, 0, 0);
      stepGame(w, DT, idle());
    }
    expect(s.n0).toBe(BroodMove.Windup);
    expect(readBoss(w, createBossView()).mode).toBe(BossMode.Attacking);
    const heading = s.dir;
    expect(heading).toBeCloseTo(angleBetween(w, id, 0), 1);
    const m = first(w, Kind.BossHazard);
    expect(m).toBeGreaterThan(0);
    expect(s.hzMarker[m]).toBe(1);
    expect(w.a[m]).toBe(HazardType.Lane);
    expect(w.rot[m]).toBeCloseTo(heading, 5);
    expect(s.hzLife[m] ?? 0).toBeLessThan(s.hzTele[m] ?? 0);
    // Step off the line: the marker crosses the old spot and must never kill.
    const ox = (w.x[id] ?? 0) + Math.cos(heading) * 200 + Math.cos(heading + Math.PI / 2) * 160;
    const oy = (w.y[id] ?? 0) + Math.sin(heading) * 200 + Math.sin(heading + Math.PI / 2) * 160;
    const x0 = w.x[id] ?? 0;
    const y0 = w.y[id] ?? 0;
    let windSteps = 0;
    while (s.n0 === BroodMove.Windup && windSteps < 400) {
      park(w, ox, oy);
      noAdds(w);
      stepGame(w, DT, idle());
      windSteps++;
    }
    expect(Math.abs(windSteps / 120 - hazardTelegraph(1))).toBeLessThanOrEqual(DT * 3);
    expect(w.x[id]).toBeCloseTo(x0, 3); // still during the wind up
    expect(w.y[id]).toBeCloseTo(y0, 3);
    expect(s.n0).toBe(BroodMove.Charge);
    expect(w.alive[m]).toBe(0);
    const cx = w.x[id] ?? 0;
    const cy = w.y[id] ?? 0;
    for (let i = 0; i < 12; i++) {
      park(w, ox, oy);
      noAdds(w);
      stepGame(w, DT, idle());
    }
    expect(Math.hypot((w.x[id] ?? 0) - cx, (w.y[id] ?? 0) - cy) / 0.1).toBeCloseTo(BROOD.chargeSpeed, -1);
    while (s.n0 === BroodMove.Charge) {
      park(w, ox, oy);
      noAdds(w);
      stepGame(w, DT, idle());
    }
    expect(w.ship.active).toBe(true);
    expect(gs(w).lives).toBe(3);
  });

  it('a ship left on the charge line is hit by the body', () => {
    const w = bossGame('brood', { lives: 3 }, {}, false);
    park(w, 0, 0);
    enter(w);
    w.ship.invuln = 0;
    const s = bs(w);
    for (let i = 0; i < 120 * 8 && w.ship.active; i++) {
      park(w, 0, 0);
      stepGame(w, DT, idle());
      if (s.n0 === BroodMove.Recover) break;
    }
    expect(w.ship.active).toBe(false);
  });

  it('never winds up while its core is open, and charges again once it closes', () => {
    const w = bossGame('brood');
    park(w, 0, 0);
    enter(w);
    const s = bs(w);
    killPods(w);
    stepGame(w, DT, idle());
    expect(s.open).toBe(true);
    for (let i = 0; i < 120 * (BROOD.openSec - 0.1); i++) {
      stepGame(w, DT, idle());
      if (s.open) expect(s.n0 === BroodMove.Windup || s.n0 === BroodMove.Charge).toBe(false);
    }
    let charged = false;
    for (let i = 0; i < 120 * 6; i++) {
      stepGame(w, DT, idle());
      if (s.n0 === BroodMove.Charge) charged = true;
    }
    expect(charged).toBe(true);
  });
});
