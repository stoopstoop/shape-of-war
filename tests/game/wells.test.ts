// B9 v1.1: gravity wells are a readable hazard, not drag on the controls (docs/01 section 6.7).
// Settled pull is 0 at the rim, quadratic to at most 40 percent of ship speed at the core, the ship
// always out-runs it, and the pull is gone within 100 ms of leaving the radius.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import * as grunt from '../../src/game/enemies/grunt';
import * as well from '../../src/game/enemies/gravitywell';
import {
  PULL_BULLET,
  PULL_DAMP,
  PULL_ENEMY_MAX,
  PULL_RADIUS,
  PULL_SHIP,
  PULL_SHIP_MAX,
  pullFalloff,
  pullRetain,
  settledShipPull,
} from '../../src/game/enemies/gravitywell';
import { setInvulnerable, stepGame } from '../../src/game/game';
import { gs } from '../../src/game/state';
import { SHIP_RADIUS, SHIP_SPEED } from '../../src/game/ship';
import type { World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import { generateLevel } from '../../src/levelgen/generator';
import { DT, idle, makeGame, put } from './helpers';

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

/** Game on a big empty arena with one well at the origin and an invulnerable ship. */
function wellGame(): { w: World; id: number } {
  const { w } = makeGame({ arena: BIG });
  setInvulnerable(w, true);
  w.ship.invuln = 1e9; // spawn style invulnerability so pull still applies inside contact range
  const id = put(w, well.def, 0, 0);
  gs(w).wellIds[gs(w).wellCount++] = id;
  return { w, id };
}

function shipPull(w: World): number {
  return Math.hypot(gs(w).shipPullX, gs(w).shipPullY);
}

/** Hold the ship at distance d (no stick) until the pull channel settles; returns its magnitude. */
function settledAt(d: number): number {
  const { w } = wellGame();
  for (let i = 0; i < 120; i++) {
    placeShip(w, d, 0);
    well.stepWells(w, DT);
  }
  return shipPull(w);
}

describe('well pull curve', () => {
  it('falloff is 0 at and beyond the rim, 1 at the centre, and strictly rises inward', () => {
    expect(pullFalloff(PULL_RADIUS)).toBe(0);
    expect(pullFalloff(PULL_RADIUS + 50)).toBe(0);
    expect(pullFalloff(0)).toBe(1);
    let prev = 0;
    for (let d = PULL_RADIUS - 1; d >= 0; d -= 1) {
      const f = pullFalloff(d);
      expect(f).toBeGreaterThan(prev);
      prev = f;
    }
  });

  it('settled ship pull at the rim is 0', () => {
    expect(settledShipPull(PULL_RADIUS)).toBe(0);
    expect(settledAt(PULL_RADIUS)).toBe(0);
    expect(settledAt(PULL_RADIUS - 0.5)).toBeLessThan(0.01);
  });

  it('settled ship pull at the core is at most 0.4 x SHIP_SPEED', () => {
    expect(PULL_SHIP_MAX).toBeLessThanOrEqual(0.4 * SHIP_SPEED);
    expect(settledShipPull(0)).toBeLessThanOrEqual(0.4 * SHIP_SPEED);
    // Closest a live ship can sit is the contact radius; invulnerable it can go right in.
    for (const d of [1, SHIP_RADIUS + well.def.radius, 80, 160, 240]) {
      const s = settledAt(d);
      expect(s).toBeLessThanOrEqual(0.4 * SHIP_SPEED);
      expect(s).toBeCloseTo(settledShipPull(d), 3);
    }
  });

  it('continuous model agrees with the table: PULL_SHIP / PULL_DAMP = PULL_SHIP_MAX', () => {
    expect(PULL_SHIP / PULL_DAMP).toBeCloseTo(PULL_SHIP_MAX, 9);
  });

  it('bullet and enemy pull keep their v1.0 ratios to the ship pull', () => {
    // v1.0: ship settled peak 900 / 3 = 300 u/s, enemies 600 / 3 = 200 u/s, bullets 1800 u/s^2.
    expect(PULL_ENEMY_MAX / PULL_SHIP_MAX).toBeCloseTo(200 / 300, 9);
    expect(PULL_BULLET / PULL_SHIP_MAX).toBeCloseTo(1800 / 300, 9);
  });
});

describe('ship out-runs a well', () => {
  it('net speed moving directly away from the core is at least 0.6 x SHIP_SPEED from any start', () => {
    for (const d0 of [1, SHIP_RADIUS + well.def.radius, 60, 120, 200, 300]) {
      const { w } = wellGame();
      // Worst case: the channel already settled at the start point.
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
      expect(minSpeed).toBeGreaterThanOrEqual(0.6 * SHIP_SPEED);
      expect(Math.abs(w.y[0] ?? 0)).toBeLessThan(1e-9);
    }
  });

  it('moving tangentially at mid range the ship keeps full speed along its stick', () => {
    const { w } = wellGame();
    placeShip(w, 0, 160);
    const x0 = w.x[0] ?? 0;
    for (let i = 0; i < 12; i++) stepGame(w, DT, stick(1, 0)); // 0.1 s
    expect((w.x[0] ?? 0) - x0).toBeGreaterThan(0.9 * SHIP_SPEED * 0.1);
  });
});

describe('well pull decay', () => {
  it('channel decays at least 10x per second', () => {
    expect(pullRetain(1)).toBeLessThanOrEqual(0.1);
    let k = 1;
    for (let i = 0; i < 120; i++) k *= pullRetain(DT);
    expect(k).toBeLessThanOrEqual(0.1);
  });

  it('residual pull 100 ms after leaving the radius is under 5 percent of the peak', () => {
    const { w } = wellGame();
    // Settle near the core, then teleport just outside the rim and wait 100 ms.
    for (let i = 0; i < 120; i++) {
      placeShip(w, SHIP_RADIUS + well.def.radius, 0);
      well.stepWells(w, DT);
    }
    const peak = shipPull(w);
    expect(peak).toBeGreaterThan(0.5 * PULL_SHIP_MAX);
    placeShip(w, PULL_RADIUS + 1, 0);
    for (let i = 0; i < 12; i++) well.stepWells(w, DT);
    expect(shipPull(w)).toBeLessThan(0.05 * peak);
    expect(shipPull(w)).toBeLessThan(0.05 * PULL_SHIP_MAX);
  });

  it('pull channel returns to exactly 0 shortly after leaving', () => {
    const { w } = wellGame();
    for (let i = 0; i < 120; i++) {
      placeShip(w, 100, 0);
      well.stepWells(w, DT);
    }
    placeShip(w, PULL_RADIUS + 50, 0);
    for (let i = 0; i < 60; i++) well.stepWells(w, DT);
    expect(gs(w).shipPullX).toBe(0);
    expect(gs(w).shipPullY).toBe(0);
  });
});

describe('well hazard still works', () => {
  it('an idle ship inside the radius drifts into the core and dies', () => {
    const { w } = makeGame({ arena: BIG });
    const id = put(w, well.def, 0, 0);
    gs(w).wellIds[gs(w).wellCount++] = id;
    placeShip(w, 200, 0);
    let t = 0;
    while (w.ship.active && t < 30) {
      stepGame(w, DT, idle());
      t += DT;
    }
    expect(w.ship.active).toBe(false);
  });

  it('an enemy sitting inside the radius is pulled in and fed', () => {
    const { w } = makeGame({ arena: BIG });
    setInvulnerable(w, true);
    placeShip(w, -1000, 600);
    const id = put(w, well.def, 0, 0);
    gs(w).wellIds[gs(w).wellCount++] = id;
    const g1 = put(w, grunt.def, 150, 0);
    for (let i = 0; i < 1200 && w.alive[g1] === 1 && w.kind[g1] === grunt.def.kind; i++) well.stepWells(w, DT);
    expect(well.massOf(w, id)).toBe(1);
  });

  it('is deterministic: two identical runs end in identical state', () => {
    const run = (): string => {
      const def = generateLevel(0x5eed, 20);
      const { w } = makeGame({ ...def });
      setInvulnerable(w, true);
      for (let i = 0; i < 600; i++) stepGame(w, DT, stick(Math.sin(i / 40), Math.cos(i / 55)));
      return `${w.x[0]},${w.y[0]},${gs(w).shipPullX},${gs(w).shipPullY},${gs(w).score}`;
    };
    expect(run()).toBe(run());
  });
});
