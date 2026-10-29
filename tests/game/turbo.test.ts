// Turbo, G3A ("not worth using and I often forget about it"): for its 5 s the ship fires twice as
// fast (unchanged), its speed cap is 25 percent higher, and each spread, rapid or drone bullet
// fired in the window passes through one enemy before it stops. 'fx:turbo' marks start and end.
import { afterEach, describe, expect, it } from 'vitest';
import { bus, type Events } from '../../src/core/events';
import { createBulletPool, passThrough, spawnBullet } from '../../src/game/bullets';
import { rebuild } from '../../src/game/collide';
import { bulletHits } from '../../src/game/combat';
import * as charger from '../../src/game/enemies/charger';
import * as grunt from '../../src/game/enemies/grunt';
import { stepGame } from '../../src/game/game';
import { SUPER_CHARGE_MAX } from '../../src/game/geoms';
import { SHIP_SPEED } from '../../src/game/ship';
import { gs } from '../../src/game/state';
import { stepSupers, SUPER_DURATION, triggerSuper, TURBO_PIERCE, TURBO_SPEED_SCALE } from '../../src/game/supers';
import { Kind, type World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import { DT, idle, makeGame, put } from './helpers';

afterEach(() => bus.clear());

function turboOn(w: World): void {
  gs(w).superCharge = SUPER_CHARGE_MAX;
  expect(triggerSuper(w)).toBe(true);
}

function moveRight(): InputState {
  const i = idle();
  i.move = { active: true, x: 1, y: 0 };
  return i;
}

describe('passThrough (pure on the pool)', () => {
  it('v1 bullets never pass; a bullet with one extra passes one enemy, not a second', () => {
    const p = createBulletPool(4);
    const a = spawnBullet(p, 0, 0, 1, 0, 1);
    expect(passThrough(p, a, 7)).toBe(false);
    p.spawnExtra = TURBO_PIERCE;
    const b = spawnBullet(p, 0, 0, 1, 0, 1);
    expect(p.extra[b]).toBe(1);
    expect(passThrough(p, b, 7)).toBe(true);
    expect(passThrough(p, b, 7)).toBe(true); // still inside the same enemy: no charge spent
    expect(passThrough(p, b, 8)).toBe(false);
  });
});

describe('turbo', () => {
  it('emits fx:turbo on and off at the ship and keeps 5 s', () => {
    const log: Events['fx:turbo'][] = [];
    bus.on('fx:turbo', (e) => log.push({ ...e }));
    const { w } = makeGame({ superType: 'turbo' });
    w.x[0] = 40;
    turboOn(w);
    expect(log).toEqual([{ active: true, x: 40, y: 0 }]);
    for (let i = 0; i < Math.round(SUPER_DURATION * 120) - 1; i++) stepSupers(w, DT);
    expect(log).toHaveLength(1);
    stepSupers(w, DT);
    stepSupers(w, DT);
    expect(log.map((e) => e.active)).toEqual([true, false]);
    expect(w.ship.speedScale).toBe(1);
    expect(w.bullets.spawnExtra).toBe(0);
  });

  it('raises the speed cap 25 percent (space physics off), and only while it runs', () => {
    const { w } = makeGame({ superType: 'turbo' });
    w.ship.invuln = 1e9;
    stepGame(w, DT, moveRight());
    expect(w.vx[0]).toBeCloseTo(SHIP_SPEED, 5);
    turboOn(w);
    stepGame(w, DT, moveRight());
    expect(w.vx[0]).toBeCloseTo(SHIP_SPEED * TURBO_SPEED_SCALE, 5);
    for (let i = 0; i < SUPER_DURATION * 120 + 2; i++) {
      stepGame(w, DT, moveRight());
      w.x[0] = 0; // stay off the wall
    }
    expect(w.vx[0]).toBeCloseTo(SHIP_SPEED, 5);
  });

  it('raises the speed cap 25 percent under space physics', () => {
    const top = (turbo: boolean): number => {
      const { w } = makeGame({ superType: 'turbo' });
      w.ship.invuln = 1e9;
      w.ship.space = 'medium';
      if (turbo) turboOn(w);
      let v = 0;
      for (let i = 0; i < 120 * 4; i++) {
        stepGame(w, DT, moveRight());
        v = Math.max(v, Math.hypot(w.vx[0] ?? 0, w.vy[0] ?? 0));
        w.x[0] = 0; // stay off the wall
      }
      return v;
    };
    expect(top(true) / top(false)).toBeCloseTo(TURBO_SPEED_SCALE, 2);
  });

  it('a Turbo bullet kills two lined up Grunts; a normal bullet kills one', () => {
    const shoot = (turbo: boolean): number => {
      const { w } = makeGame({ superType: 'turbo' });
      if (turbo) turboOn(w);
      const a = put(w, grunt.def, 300, 0);
      const b = put(w, grunt.def, 300, 0);
      spawnBullet(w.bullets, 300, 0, 0, 0, 1);
      rebuild(w.grid, w);
      bulletHits(w);
      return (w.kind[a] === Kind.Grunt && w.alive[a] === 1 ? 0 : 1) + (w.kind[b] === Kind.Grunt && w.alive[b] === 1 ? 0 : 1);
    };
    expect(shoot(false)).toBe(1);
    expect(shoot(true)).toBe(2);
  });

  it('passes through a two hit enemy once, damaging it once, then stops on the next', () => {
    const { w } = makeGame({ superType: 'turbo' });
    turboOn(w);
    const c = put(w, charger.def, 300, 0);
    const bullet = spawnBullet(w.bullets, 300, 0, 0, 0, 1);
    rebuild(w.grid, w);
    bulletHits(w);
    expect(w.alive[c]).toBe(1);
    expect(w.hp[c]).toBe(charger.def.hp - 1);
    expect(w.bullets.alive[bullet]).toBe(1);
    bulletHits(w); // still overlapping the same Charger: no second hit
    expect(w.hp[c]).toBe(charger.def.hp - 1);
    const g2 = put(w, grunt.def, 300, 0);
    rebuild(w.grid, w);
    bulletHits(w);
    expect(w.kind[g2]).not.toBe(Kind.Grunt);
    expect(w.bullets.alive[bullet]).toBe(0);
  });

  it('is deterministic: two identical Turbo runs give identical bullets and ship', () => {
    const runOnce = (): number[] => {
      const { w } = makeGame({ superType: 'turbo' });
      w.ship.invuln = 1e9;
      turboOn(w);
      const i = moveRight();
      i.aim = { active: true, x: 0, y: 1 };
      for (let k = 0; k < 600; k++) stepGame(w, DT, i);
      return [w.x[0] ?? 0, w.y[0] ?? 0, w.bullets.liveCount, gs(w).kills];
    };
    expect(runOnce()).toEqual(runOnce());
  });
});
