// B9 feel review: numeric checks that nothing after InputState slows or resists the ship.
// Full stick right must give 420 u/s in world units from the first step, under every Swarm state
// that is not a hazard pull, on every generated arena family.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import * as grunt from '../../src/game/enemies/grunt';
import { PULL_DAMP, PULL_SHIP } from '../../src/game/enemies/gravitywell';
import { createGame, setInvulnerable, stepGame } from '../../src/game/game';
import { SUPER_CHARGE_MAX } from '../../src/game/geoms';
import { killShip } from '../../src/game/player';
import { gs } from '../../src/game/state';
import { triggerSuper } from '../../src/game/supers';
import { respawnShip, SHIP_SPEED, stepShip } from '../../src/game/ship';
import { createWorld, inlineRectLevel, type World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import { generateLevel } from '../../src/levelgen/generator';
import type { DroneKind, LevelDef, SuperKind } from '../../src/levelgen/leveldef';
import { DT, idle, makeGame, put } from './helpers';

afterEach(() => bus.clear());

function stick(x: number, y: number): InputState {
  const i = idle();
  i.move = { active: true, x, y };
  return i;
}

const RIGHT = stick(1, 0);

/** Place the ship at (x, y) with no stale previous position. */
function placeShip(w: World, x: number, y: number): void {
  w.x[0] = x;
  w.y[0] = y;
  w.prevX[0] = x;
  w.prevY[0] = y;
}

/** Run n game steps of dt with full stick right; returns x displacement. */
function runRight(w: World, n: number, dt = DT): number {
  const x0 = w.x[0] ?? 0;
  for (let i = 0; i < n; i++) stepGame(w, dt, RIGHT);
  return (w.x[0] ?? 0) - x0;
}

// World positions are Float32Array, so closeness checks allow 0.005 u (far below 1 percent of 420).
describe('B9 ship speed in world units', () => {
  it('60 steps at dt 1/60 with full stick covers 420 u within 1 percent', () => {
    const w = createWorld(inlineRectLevel());
    placeShip(w, -600, 0);
    for (let i = 0; i < 60; i++) stepShip(w, 1 / 60, RIGHT);
    const d = (w.x[0] ?? 0) + 600;
    expect(Math.abs(d - SHIP_SPEED) / SHIP_SPEED).toBeLessThan(0.01);
    expect(d).toBeCloseTo(420, 2);
  });

  it('120 steps at dt 1/120 covers 420 u (the real loop step)', () => {
    const w = createWorld(inlineRectLevel());
    placeShip(w, -600, 0);
    for (let i = 0; i < 120; i++) stepShip(w, DT, RIGHT);
    expect((w.x[0] ?? 0) + 600).toBeCloseTo(420, 2);
  });

  it('reaches full speed on the first step and stops on the first idle step (no ramp, no drift)', () => {
    const w = createWorld(inlineRectLevel());
    stepShip(w, DT, RIGHT);
    expect(w.vx[0]).toBe(SHIP_SPEED);
    expect(w.x[0]).toBeCloseTo(SHIP_SPEED * DT, 9);
    const x1 = w.x[0] ?? 0;
    stepShip(w, DT, idle());
    expect(w.vx[0]).toBe(0);
    expect(w.x[0]).toBe(x1);
  });

  it('speed is linear in stick magnitude (no curve, no extra scale after input)', () => {
    for (const m of [0.25, 0.5, 0.75, 1]) {
      const w = createWorld(inlineRectLevel());
      for (let i = 0; i < 120; i++) stepShip(w, DT, stick(m, 0));
      expect(w.x[0]).toBeCloseTo(SHIP_SPEED * m, 2);
    }
  });

  it('full stick in any direction gives 420 u/s', () => {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const w = createWorld(inlineRectLevel());
      for (let i = 0; i < 60; i++) stepShip(w, DT, stick(Math.cos(a), Math.sin(a)));
      expect(Math.hypot(w.x[0] ?? 0, w.y[0] ?? 0)).toBeCloseTo(SHIP_SPEED * 0.5, 2);
    }
  });

  it('a wall only removes the into wall component: tangential speed is kept in full', () => {
    const w = createWorld(inlineRectLevel());
    placeShip(w, 0, -440); // touching the top wall (450 minus radius 10)
    const c = Math.SQRT1_2;
    for (let i = 0; i < 120; i++) stepShip(w, DT, stick(c, -c));
    expect(w.y[0]).toBeCloseTo(-440, 2);
    expect(w.x[0]).toBeCloseTo(SHIP_SPEED * c, 2);
  });

  it('no resistance approaching a wall: full speed until contact', () => {
    const w = createWorld(inlineRectLevel());
    placeShip(w, 585, 0); // 105 u (0.25 s) from the right wall contact at 690
    for (let i = 0; i < 29; i++) stepShip(w, DT, RIGHT);
    expect(w.x[0]).toBeCloseTo(585 + 29 * SHIP_SPEED * DT, 2);
  });
});

describe('B9 no Swarm state slows an unhit ship', () => {
  it('stepGame on a quiet level matches bare stepShip: 420 u in 1 s', () => {
    const { w } = makeGame();
    placeShip(w, -600, 0);
    expect(runRight(w, 120)).toBeCloseTo(420, 2);
  });

  it('stepGame at dt 1/60 also gives 420 u in 1 s', () => {
    const { w } = makeGame();
    placeShip(w, -600, 0);
    expect(runRight(w, 60, 1 / 60)).toBeCloseTo(420, 2);
  });

  const supers: SuperKind[] = ['homing', 'detonate', 'turbo'];
  const drones: DroneKind[] = ['attack', 'collect', 'ram'];
  for (const superType of supers) {
    for (const drone of drones) {
      it(`super ${superType} active with drone ${drone}, aiming and firing: 420 u in 1 s`, () => {
        const { w } = makeGame({ superType, drone });
        placeShip(w, -600, 0);
        stepGame(w, DT, idle()); // drone spawns
        gs(w).superCharge = SUPER_CHARGE_MAX;
        expect(triggerSuper(w)).toBe(true);
        const input = stick(1, 0);
        input.aim = { active: true, x: 0, y: -1 };
        const x0 = w.x[0] ?? 0;
        for (let i = 0; i < 120; i++) stepGame(w, DT, input);
        expect((w.x[0] ?? 0) - x0).toBeCloseTo(420, 2);
      });
    }
  }

  it('invulnerability (spawn and respawn) does not change speed', () => {
    const { w } = makeGame();
    w.ship.invuln = 2;
    placeShip(w, -600, 0);
    expect(runRight(w, 120)).toBeCloseTo(420, 2);
  });

  it('after a death and respawn the ship moves at full speed with no leftover pull or stun', () => {
    const { w } = makeGame();
    killShip(w);
    for (let i = 0; i < 200; i++) stepGame(w, DT, idle()); // past the 1.5 s respawn delay
    expect(w.ship.active).toBe(true);
    expect(gs(w).shipPullX).toBe(0);
    expect(gs(w).shipPullY).toBe(0);
    expect(runRight(w, 60)).toBeCloseTo(210, 2);
  });

  it('enemies nearby (not touching) and their separation do not push the ship', () => {
    const { w } = makeGame();
    setInvulnerable(w, true);
    placeShip(w, -600, 0);
    for (let i = 0; i < 6; i++) put(w, grunt.def, -600 + 60 * i, 120);
    for (let i = 0; i < 6; i++) put(w, grunt.def, -600 + 60 * i + 3, 123);
    const y0 = w.y[0] ?? 0;
    expect(runRight(w, 60)).toBeCloseTo(210, 2);
    expect(w.y[0]).toBe(y0);
  });

  it('endless mode: 420 u/s', () => {
    const { w } = makeGame({}, { mode: 'endless' });
    placeShip(w, -600, 0);
    expect(runRight(w, 120)).toBeCloseTo(420, 2);
  });

  it('level speedScale and the arena speed factor scale enemies only, never the ship', () => {
    for (const speedScale of [0.8, 1, 1.3]) {
      const arena = { shape: 'rect' as const, width: 1000, height: 700, cornerRadius: 0, obstacles: [], spawnPoint: { x: 0, y: 0 } };
      const { w } = makeGame({ speedScale, arena });
      placeShip(w, -400, 0);
      expect(runRight(w, 120)).toBeCloseTo(420, 2);
    }
  });

  it('generated levels of every band: 420 u/s with wells and obstacles removed and the spawner running', () => {
    for (let level = 1; level <= 40; level++) {
      const def: LevelDef = generateLevel(0x5eed, level);
      const flat: LevelDef = { ...def, arena: { ...def.arena, obstacles: [] }, hazards: { ...def.hazards, wells: [] } };
      const w = createGame(flat, { vibrate: () => undefined });
      setInvulnerable(w, true);
      respawnShip(w);
      // 0.5 s from the centre fits inside the smallest arena (700 u circle, radius 350).
      expect(runRight(w, 60)).toBeCloseTo(210, 2);
    }
  });
});

describe('B9 gravity well pull (designed hazard, docs/01 section 6.7)', () => {
  it('terminal pull speed is below ship speed so the ship can always escape', () => {
    // Pull velocity integrates PULL_SHIP x (1 - d / 320) per second and damps at PULL_DAMP per second.
    expect(PULL_SHIP / PULL_DAMP).toBeLessThan(SHIP_SPEED);
  });

  it('a level with no wells never accumulates ship pull', () => {
    const { w } = makeGame();
    runRight(w, 240);
    expect(gs(w).shipPullX).toBe(0);
    expect(gs(w).shipPullY).toBe(0);
  });
});
