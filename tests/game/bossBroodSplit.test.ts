// G3C: Brood splits at its stage 2 crack (below 33 percent) into three Broodlings: slot 0 chases, slot
// 1 orbits the ship at 200 u and lays Slime every 2 s, slot 2 flees and launches Darts every 4 s. The
// body is gone, the boss bar is the sum of the three, the fight ends with the third and awards the
// bonus once.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { fleeHeading } from '../../src/game/bosses/brood';
import { bossBonusAwarded, bossOnBomb, bossSlain, damageBoss, damageBossPart, livePart } from '../../src/game/bosses/core';
import { BROODLING, CRACK_AT, STAGGER_SEC } from '../../src/game/bosses/table';
import { BossMode, PartType } from '../../src/game/bosses/types';
import { createBossView, readBoss } from '../../src/game/bosses/view';
import { stepGame } from '../../src/game/game';
import { gs } from '../../src/game/state';
import { Kind, type World } from '../../src/game/world';
import { bs, bossGame, count, enter, park, run } from './bossHelpers';
import { DT, idle } from './helpers';

afterEach(() => bus.clear());

/** Brood game with the ship parked, past its entrance. Returns the body id. */
function started(shield = true): { w: World; id: number } {
  const w = bossGame('brood', { par: 1000 }, {}, shield);
  park(w, 0, 0);
  return { w, id: enter(w) };
}

/** Push the body just under 33 percent with a Detonate style hit (ignores the closed core). */
function crack(w: World, id: number): void {
  w.hp[id] = Math.floor(bs(w).maxHp * CRACK_AT[1]) + 5;
  damageBoss(w, 10, w.x[id] ?? 0, w.y[id] ?? 0, true);
}

function broodlings(w: World): number[] {
  const s = bs(w);
  return [0, 1, 2].map((k) => livePart(w, s, k));
}

function dist(w: World, a: number, b: number): number {
  return Math.hypot((w.x[a] ?? 0) - (w.x[b] ?? 0), (w.y[a] ?? 0) - (w.y[b] ?? 0));
}

describe('brood split', () => {
  it('splits once, at the stage 2 crack, after the crack events', () => {
    const { w, id } = started();
    const log: string[] = [];
    bus.on('sim:bossCrack', (e) => log.push(`crack${e.stage}`));
    bus.on('sim:bossSplit', (e) => log.push(`split:${e.id}:${e.parts}`));
    w.hp[id] = bs(w).maxHp;
    damageBoss(w, 10, 0, 0, true); // 10 under full: above 66 percent, nothing happens
    expect(log).toEqual([]);
    expect(count(w, Kind.Boss)).toBe(1);
    expect(bs(w).split).toBe(false);
    crack(w, id); // 5 under the 33 percent line
    expect(log).toEqual(['crack1', 'crack2', 'split:brood:3']);
    expect(bs(w).split).toBe(true);
    run(w, 5);
    damageBoss(w, 10, 0, 0, true); // no body to hit any more
    expect(log.filter((e) => e.startsWith('split')).length).toBe(1);
  });

  it('the body and the pods are gone and three Broodlings (20 u, 60 hits) stand in', () => {
    const { w, id } = started();
    expect(count(w, Kind.BossPart)).toBe(3); // the pods
    crack(w, id);
    expect(count(w, Kind.Boss)).toBe(0);
    expect(bs(w).id).toBe(-1);
    expect(count(w, Kind.BossPart)).toBe(3);
    for (const p of broodlings(w)) {
      expect(p).toBeGreaterThan(0);
      expect(w.a[p]).toBe(PartType.Broodling);
      expect(w.hp[p]).toBe(BROODLING.hp);
      expect(w.radius[p]).toBe(BROODLING.radius);
    }
    expect(bs(w).status).toBe('alive');
    expect(readBoss(w, createBossView()).active).toBe(false); // no body to draw
  });

  it('slot 0 chases, slot 1 orbits at 200 u and lays Slime, slot 2 flees and spawns Darts', () => {
    const { w, id } = started();
    crack(w, id);
    const [chase, orbit, flee] = broodlings(w) as [number, number, number];
    const d0 = dist(w, chase, 0);
    const f0x = w.x[flee] ?? 0;
    const f0y = w.y[flee] ?? 0;
    const fd0 = dist(w, flee, 0);
    run(w, 1);
    expect(dist(w, chase, 0)).toBeLessThan(d0 - 80);
    expect(Math.hypot((w.x[flee] ?? 0) - f0x, (w.y[flee] ?? 0) - f0y)).toBeGreaterThan(60);
    expect(dist(w, flee, 0)).toBeGreaterThanOrEqual(fd0 - 5);
    run(w, 0.7); // 1.7 s: the first Dart wave left the fleer at 1.5 s
    const darts: number[] = [];
    for (let e = 1; e < w.cap; e++) if (w.alive[e] === 1 && w.kind[e] === Kind.Dart) darts.push(e);
    expect(darts.length).toBeGreaterThanOrEqual(1);
    for (const d of darts) expect(dist(w, d, flee)).toBeLessThan(90);
    run(w, 5);
    expect(Math.abs(dist(w, orbit, 0) - BROODLING.orbitRadius)).toBeLessThan(30);
    let owned = 0;
    for (let e = 1; e < w.cap; e++) if (w.alive[e] === 1 && w.kind[e] === Kind.Slime && w.a[e] === orbit) owned++;
    expect(owned).toBeGreaterThanOrEqual(2);
  });

  it('contact with a Broodling kills the ship; the fight survives the respawn', () => {
    const { w, id } = started(false);
    crack(w, id);
    const lives = gs(w).lives;
    const [chase] = broodlings(w) as [number, number, number];
    w.x[chase] = w.x[0] ?? 0;
    w.y[chase] = w.y[0] ?? 0;
    stepGame(w, DT, idle());
    expect(gs(w).lives).toBe(lives - 1);
    run(w, 3);
    expect(count(w, Kind.BossPart)).toBe(3);
    expect(bs(w).status).toBe('alive');
  });

  it('a bomb staggers the Broodlings for the usual 1.5 s', () => {
    const { w, id } = started();
    crack(w, id);
    run(w, 0.5);
    bossOnBomb(w);
    expect(bs(w).stagger).toBe(STAGGER_SEC);
    const [chase] = broodlings(w) as [number, number, number];
    const x = w.x[chase] ?? 0;
    const y = w.y[chase] ?? 0;
    run(w, 1);
    expect(w.x[chase]).toBe(x);
    expect(w.y[chase]).toBe(y);
    run(w, 1);
    expect(dist(w, chase, 0)).toBeLessThan(Math.hypot(x, y));
  });

  it('fleeHeading runs away in the open and bends along a wall', () => {
    expect(fleeHeading(1, 1 + Math.PI, 0)).toBeCloseTo(1, 9);
    expect(fleeHeading(1, 1 + 0.4, 100)).toBeCloseTo(1, 9);
    const wall = fleeHeading(0, Math.PI, 600);
    expect(Math.abs(Math.abs(wall) - Math.PI / 2)).toBeLessThan(1e-9);
    expect(fleeHeading(0, 0.5, 500)).toBeCloseTo(0.5, 9);
  });
});

describe('brood split fight', () => {
  it('the boss bar is the sum of the three Broodlings', () => {
    const { w, id } = started();
    let hp = -1;
    let maxHp = -1;
    bus.on('hud:boss', (e) => {
      hp = e.hp;
      maxHp = e.maxHp;
    });
    crack(w, id);
    run(w, 0.3);
    expect(hp).toBe(3 * BROODLING.hp);
    expect(maxHp).toBe(bs(w).maxHp);
    const [chase] = broodlings(w) as [number, number, number];
    damageBossPart(w, chase, 10, 0, 0);
    run(w, 0.3);
    expect(hp).toBe(3 * BROODLING.hp - 10);
  });

  it('the fight ends with the third Broodling and awards the bonus once', () => {
    const { w, id } = started();
    crack(w, id);
    const downs: { x: number; y: number }[] = [];
    let last = { hp: -1, mode: -1 };
    bus.on('sim:bossDown', (e) => downs.push({ x: e.x, y: e.y }));
    bus.on('hud:boss', (e) => {
      last = { hp: e.hp, mode: e.mode };
    });
    const score0 = gs(w).score;
    const kills0 = gs(w).kills;
    const [a, b, c] = broodlings(w) as [number, number, number];
    damageBossPart(w, a, BROODLING.hp, 0, 0);
    damageBossPart(w, b, BROODLING.hp, 0, 0);
    run(w, 0.3);
    expect(bs(w).status).toBe('alive');
    expect(bossSlain(w)).toBe(false);
    expect(downs.length).toBe(0);
    const cx = w.x[c] ?? 0;
    const cy = w.y[c] ?? 0;
    damageBossPart(w, c, BROODLING.hp, 0, 0);
    expect(bs(w).status).toBe('defeated');
    expect(bossSlain(w)).toBe(true);
    expect(downs).toEqual([{ x: cx, y: cy }]);
    expect(last).toEqual({ hp: 0, mode: BossMode.Dying });
    const bonus = bossBonusAwarded(w);
    expect(bonus).toBeGreaterThan(0);
    expect(gs(w).score - score0).toBe(bonus);
    expect(gs(w).kills - kills0).toBe(1);
    run(w, 3);
    expect(gs(w).score - score0).toBe(bonus);
    expect(gs(w).kills - kills0).toBe(1);
    expect(downs.length).toBe(1);
    expect(count(w, Kind.BossPart)).toBe(0);
  });
});

describe('brood split determinism', () => {
  it('two identical runs end in identical state and events', () => {
    const once = (): string => {
      const { w, id } = started();
      const log: string[] = [];
      bus.on('sim:bossSplit', (e) => log.push(`split${e.parts}`));
      bus.on('sim:bossDown', () => log.push('down'));
      crack(w, id);
      run(w, 9);
      const s = bs(w);
      const ps = broodlings(w).map((p) => `${w.x[p]},${w.y[p]},${w.hp[p]}`);
      return `${log.join(',')}|${ps.join(';')}|${count(w, Kind.Slime)}|${count(w, Kind.Dart)}|${w.x[0]},${w.y[0]}|${s.t0},${s.t1},${s.angle}`;
    };
    const a = once();
    expect(a).toBe(once());
    expect(a.startsWith('split3|')).toBe(true);
  });
});
