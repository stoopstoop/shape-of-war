// G3C: a Gravity well erupts into a super nova after 5 to 7 s (hashed per well from the level seed
// and its index): pull radius x1.25, ship pull max x1.3, enemy and bullet pull x1.3, 'sim:wellNova'
// once, and it lasts until the well dies. The ship can still leave (0.55 x ship speed or better).
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import * as grunt from '../../src/game/enemies/grunt';
import * as well from '../../src/game/enemies/gravitywell';
import {
  NOVA_PULL_MULT,
  NOVA_RADIUS,
  NOVA_RADIUS_MULT,
  NOVA_SEC,
  PULL_BULLET,
  PULL_RADIUS,
  PULL_SHIP_MAX,
  novaSecFor,
  pullFalloff,
  settledShipPull,
  wellInNova,
} from '../../src/game/enemies/gravitywell';
import { spawnBullet } from '../../src/game/bullets';
import { setInvulnerable, stepGame } from '../../src/game/game';
import { gs } from '../../src/game/state';
import { SHIP_RADIUS, SHIP_SPEED } from '../../src/game/ship';
import type { World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import { DT, idle, makeGame, put, quietLevel } from './helpers';

afterEach(() => bus.clear());

const BIG = { shape: 'rect' as const, width: 2400, height: 1400, cornerRadius: 0, obstacles: [], spawnPoint: { x: 0, y: 0 } };

function stick(x: number, y: number): InputState {
  const i = idle();
  i.move = { active: true, x, y };
  return i;
}

function placeShip(w: World, x: number, y: number): void {
  w.x[0] = x;
  w.y[0] = y;
  w.prevX[0] = x;
  w.prevY[0] = y;
}

/** Big empty arena, one well at the origin (slot 0), invulnerable ship parked far away. */
function wellGame(): { w: World; id: number } {
  const { w } = makeGame({ arena: BIG });
  setInvulnerable(w, true);
  w.ship.invuln = 1e9;
  const id = put(w, well.def, 0, 0);
  gs(w).wellIds[gs(w).wellCount++] = id;
  placeShip(w, 1100, 0);
  return { w, id };
}

function shipPull(w: World): number {
  return Math.hypot(gs(w).shipPullX, gs(w).shipPullY);
}

function settledShip(d: number, nova: boolean): number {
  const { w } = wellGame();
  if (nova) gs(w).wellNova[0] = 1;
  for (let i = 0; i < 120; i++) {
    placeShip(w, d, 0);
    well.stepWells(w, DT);
  }
  return shipPull(w);
}

describe('nova numbers', () => {
  it('multipliers: radius x1.25, strength x1.3, about 6 s', () => {
    expect(NOVA_SEC).toBe(6);
    expect(NOVA_RADIUS_MULT).toBe(1.25);
    expect(NOVA_PULL_MULT).toBe(1.3);
    expect(NOVA_RADIUS).toBe(PULL_RADIUS * 1.25);
  });

  it('falloff reaches 400 u in nova and stays 320 u otherwise', () => {
    expect(pullFalloff(PULL_RADIUS, false)).toBe(0);
    expect(pullFalloff(PULL_RADIUS + 10, true)).toBeGreaterThan(0);
    expect(pullFalloff(NOVA_RADIUS, true)).toBe(0);
    expect(pullFalloff(0, true)).toBe(1);
    expect(pullFalloff(100)).toBe(pullFalloff(100, false));
  });

  it('settled ship pull peaks at 1.3 x the normal max', () => {
    expect(settledShipPull(0, false)).toBe(PULL_SHIP_MAX);
    expect(settledShipPull(0, true)).toBeCloseTo(PULL_SHIP_MAX * 1.3, 9);
    expect(settledShipPull(200, true)).toBeGreaterThan(settledShipPull(200, false));
  });

  it('a ship in the 320 to 400 u ring is pulled only in nova', () => {
    expect(settledShip(360, false)).toBe(0);
    expect(settledShip(360, true)).toBeCloseTo(settledShipPull(360, true), 3);
    expect(settledShip(360, true)).toBeGreaterThan(0);
  });

  it('settled ship pull in nova at 100 u is the 1.3 x strength on the wider falloff', () => {
    const a = settledShip(100, false);
    const b = settledShip(100, true);
    expect(a).toBeGreaterThan(0);
    expect(b / a).toBeCloseTo(NOVA_PULL_MULT * (pullFalloff(100, true) / pullFalloff(100, false)), 3);
  });

  it('enemy pull is x1.3 on the wider falloff in nova', () => {
    const pullOf = (nova: boolean): number => {
      const { w } = wellGame();
      if (nova) gs(w).wellNova[0] = 1;
      const e = put(w, grunt.def, 120, 0);
      well.stepWells(w, DT);
      return Math.abs(gs(w).pvx[e] ?? 0);
    };
    const base = pullOf(false);
    expect(base).toBeGreaterThan(0);
    expect(pullOf(true) / base).toBeCloseTo(NOVA_PULL_MULT * (pullFalloff(120, true) / pullFalloff(120, false)), 3);
  });

  it('bullet pull is x1.3 on the wider falloff in nova', () => {
    const pullOf = (nova: boolean): number => {
      const { w } = wellGame();
      if (nova) gs(w).wellNova[0] = 1;
      const b = spawnBullet(w.bullets, 150, 0, 0, 0, 5);
      well.stepWells(w, DT);
      return Math.abs(w.bullets.vx[b] ?? 0);
    };
    const base = pullOf(false);
    expect(base).toBeCloseTo(PULL_BULLET * pullFalloff(150) * DT, 6);
    expect(pullOf(true) / base).toBeCloseTo(NOVA_PULL_MULT * (pullFalloff(150, true) / pullFalloff(150, false)), 3);
  });
});

describe('nova timing', () => {
  it('novaSecFor lands in 5 to 7 s, is pure, and averages near 6 s', () => {
    let sum = 0;
    let n = 0;
    for (let seed = 0; seed < 400; seed++) {
      for (let i = 0; i < 3; i++) {
        const t = novaSecFor(seed * 7919 + 13, i);
        expect(t).toBeGreaterThanOrEqual(5);
        expect(t).toBeLessThan(7);
        expect(novaSecFor(seed * 7919 + 13, i)).toBe(t);
        sum += t;
        n++;
      }
    }
    expect(sum / n).toBeGreaterThan(5.9);
    expect(sum / n).toBeLessThan(6.1);
  });

  it('wells of one level do not all share a time', () => {
    const times = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) for (let i = 0; i < 3; i++) times.add(novaSecFor(seed, i));
    expect(times.size).toBeGreaterThan(40);
  });

  it('a well erupts at its hashed time, emits once, and stays in nova until it dies', () => {
    const { w, id } = wellGame();
    const seen: { id: number; x: number; y: number }[] = [];
    bus.on('sim:wellNova', (e) => seen.push({ id: e.id, x: e.x, y: e.y }));
    const t = novaSecFor(w.level.seed, 0);
    const before = Math.floor(t / DT) - 2;
    for (let i = 0; i < before; i++) well.stepWells(w, DT);
    expect(wellInNova(w, id)).toBe(false);
    expect(seen.length).toBe(0);
    for (let i = 0; i < 6; i++) well.stepWells(w, DT);
    expect(wellInNova(w, id)).toBe(true);
    expect(seen).toEqual([{ id, x: 0, y: 0 }]);
    for (let i = 0; i < 120 * 20; i++) well.stepWells(w, DT);
    expect(wellInNova(w, id)).toBe(true);
    expect(seen.length).toBe(1);
  });

  it('a bomb reset keeps the nova, and the explode behaviour is unchanged', () => {
    const { w, id } = wellGame();
    gs(w).wellNova[0] = 1;
    well.resetWell(w, id);
    expect(wellInNova(w, id)).toBe(true);
    const victim = put(w, grunt.def, 180, 0);
    for (let i = 0; i < 20; i++) well.feed(w, id, put(w, grunt.def, 500, 500 + i));
    expect(w.alive[id]).toBe(0); // exploded at MASS_LIMIT
    expect(w.alive[victim]).toBe(0); // inside EXPLODE_RADIUS 220
  });

  it('GameOptions.wellNova false keeps a well plain forever (the v1 golden switch)', () => {
    const { w, id } = wellGame();
    gs(w).wellNovaOn = false;
    const seen: number[] = [];
    bus.on('sim:wellNova', (e) => seen.push(e.id));
    for (let i = 0; i < 120 * 12; i++) well.stepWells(w, DT);
    expect(wellInNova(w, id)).toBe(false);
    expect(seen.length).toBe(0);
  });

  it('two wells keep their own clocks', () => {
    const base = quietLevel();
    const { w } = makeGame({
      arena: BIG,
      hazards: { ...base.hazards, wells: [{ x: -700, y: 300 }, { x: 700, y: -300 }] },
    });
    setInvulnerable(w, true);
    placeShip(w, 0, 600);
    const order: number[] = [];
    bus.on('sim:wellNova', (e) => order.push(e.id));
    const g = gs(w);
    expect(g.wellCount).toBe(2);
    const t0 = novaSecFor(w.level.seed, 0);
    const t1 = novaSecFor(w.level.seed, 1);
    const last = Math.ceil(Math.max(t0, t1) / DT) + 2;
    for (let i = 0; i < last; i++) well.stepWells(w, DT);
    expect(order.length).toBe(2);
    expect(order[0]).toBe(g.wellIds[t0 <= t1 ? 0 : 1]);
  });
});

describe('ship still escapes a nova', () => {
  it('net speed moving directly away from the core is at least 0.55 x SHIP_SPEED from contact range out', () => {
    for (const d0 of [SHIP_RADIUS + well.def.radius, 60, 120, 200, 300, 390]) {
      const { w } = wellGame();
      gs(w).wellNova[0] = 1;
      for (let i = 0; i < 120; i++) {
        placeShip(w, d0, 0);
        stepGame(w, DT, idle());
      }
      placeShip(w, d0, 0);
      const away = stick(1, 0);
      let minSpeed = Infinity;
      for (let i = 0; i < 60; i++) {
        const x0 = w.x[0] ?? 0;
        stepGame(w, DT, away);
        minSpeed = Math.min(minSpeed, ((w.x[0] ?? 0) - x0) / DT);
      }
      expect(minSpeed).toBeGreaterThanOrEqual(0.55 * SHIP_SPEED);
    }
  });
});

describe('nova determinism', () => {
  it('two identical runs agree on state and on when each well erupted', () => {
    const run = (): string => {
      const base = quietLevel();
      const { w } = makeGame({
        arena: BIG,
        hazards: { ...base.hazards, wells: [{ x: -500, y: 200 }, { x: 600, y: -250 }, { x: 0, y: 500 }] },
      });
      setInvulnerable(w, true);
      const log: string[] = [];
      let step = 0;
      bus.on('sim:wellNova', (e) => log.push(`${step}:${e.id}:${e.x}:${e.y}`));
      for (; step < 120 * 9; step++) stepGame(w, DT, stick(Math.sin(step / 40), Math.cos(step / 55)));
      bus.clear();
      const g = gs(w);
      return `${log.join(',')}|${w.x[0]},${w.y[0]},${g.shipPullX},${g.shipPullY}|${Array.from(g.wellNova).join('')}`;
    };
    const a = run();
    expect(a).toBe(run());
    expect(a.split('|')[0]?.split(',').length).toBe(3);
  });
});
