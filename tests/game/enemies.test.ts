import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { spawnBullet } from '../../src/game/bullets';
import { rebuild } from '../../src/game/collide';
import { bulletHits } from '../../src/game/combat';
import * as dart from '../../src/game/enemies/dart';
import * as grunt from '../../src/game/enemies/grunt';
import * as well from '../../src/game/enemies/gravitywell';
import * as pinwheel from '../../src/game/enemies/pinwheel';
import * as snake from '../../src/game/enemies/snake';
import * as spawnerEnemy from '../../src/game/enemies/spawner';
import * as wanderer from '../../src/game/enemies/wanderer';
import * as weaver from '../../src/game/enemies/weaver';
import { wrapAngle } from '../../src/core/math';
import { gameState } from '../../src/game/game';
import { gs, SNAKE_SEGMENTS } from '../../src/game/state';
import { Kind } from '../../src/game/world';
import { DT, dist, makeGame, put } from './helpers';

afterEach(() => bus.clear());

describe('grunt', () => {
  it('converges on the ship at 150 u/s', () => {
    const { w } = makeGame();
    const id = put(w, grunt.def, 300, 0);
    const d0 = dist(w, 0, id);
    for (let i = 0; i < 60; i++) grunt.step(w, id, DT);
    expect(d0 - dist(w, 0, id)).toBeCloseTo(75, 0);
    expect(w.y[id]).toBeCloseTo(0, 3);
  });
});

describe('wanderer', () => {
  it('bounces off a wall and ignores the ship', () => {
    const { w } = makeGame();
    const id = put(w, wanderer.def, 650, 100);
    wanderer.init(w, id, 0);
    expect(w.vx[id]).toBeCloseTo(110, 3);
    for (let i = 0; i < 120; i++) wanderer.step(w, id, DT);
    expect(w.vx[id]).toBeLessThan(0);
    expect(w.y[id]).toBeCloseTo(100, 3);
    expect(w.x[id]).toBeLessThanOrEqual(700 - 13 + 1e-3);
  });
});

describe('weaver', () => {
  it('dodges perpendicular to an incoming bullet, away from its line', () => {
    const { w } = makeGame();
    const id = put(w, weaver.def, 0, -300);
    spawnBullet(w.bullets, -100, -295, 1400, 0, 1);
    weaver.step(w, id, DT);
    expect(w.t[id]).toBeGreaterThan(weaver.COOLDOWN);
    const y0 = w.y[id] ?? 0;
    for (let i = 0; i < 10; i++) weaver.step(w, id, DT);
    expect(w.y[id] ?? 0).toBeLessThan(y0); // bullet line is below (y -295), so it moves up
    expect(w.x[id]).toBeCloseTo(0, 3); // perpendicular: no x motion
  });

  it('ignores bullets that are not heading at it', () => {
    const { w } = makeGame();
    const id = put(w, weaver.def, 0, -300);
    spawnBullet(w.bullets, -100, -300, -1400, 0, 1);
    weaver.step(w, id, DT);
    expect(w.t[id]).toBe(0);
  });
});

describe('pinwheel', () => {
  it('has 2 HP, drifts slowly and spins at 90 deg/s', () => {
    const { w } = makeGame();
    const id = put(w, pinwheel.def, 0, 200);
    pinwheel.init(w, id, 90);
    expect(w.hp[id]).toBe(2);
    for (let i = 0; i < 120; i++) pinwheel.step(w, id, DT);
    expect(Math.abs(w.rot[id] ?? 0)).toBeCloseTo(Math.PI / 2, 3);
    expect(w.y[id]).toBeCloseTo(260, 1);
  });
});

describe('dart', () => {
  it('starts facing the ship and caps its turn rate at 140 deg/s', () => {
    const { w } = makeGame();
    const id = put(w, dart.def, 200, 0);
    dart.step(w, id, DT);
    expect(Math.abs(w.rot[id] ?? 0)).toBeCloseTo(Math.PI, 3);
    // Ship now straight behind a dart heading +x.
    w.rot[id] = 0;
    w.x[id] = 200;
    w.y[id] = 0;
    const before = w.rot[id] ?? 0;
    dart.step(w, id, DT);
    const turned = Math.abs((w.rot[id] ?? 0) - before);
    expect(turned).toBeLessThanOrEqual(dart.TURN_RATE * w.level.speedScale * DT + 1e-6);
    expect(turned).toBeGreaterThan(0);
  });

  it('turn cap scales with speedScale', () => {
    const { w } = makeGame({ speedScale: 1.4 });
    const id = put(w, dart.def, -200, 0);
    w.t[id] = 1;
    w.rot[id] = Math.PI;
    dart.step(w, id, DT);
    expect(Math.abs(wrapAngle((w.rot[id] ?? 0) - Math.PI))).toBeCloseTo(dart.TURN_RATE * 1.4 * DT, 4);
  });
});

describe('snake', () => {
  it('spawns 12 segments that trail the head at about 18 u', () => {
    const { w } = makeGame();
    const head = snake.spawnSnake(w, 400, 300, 0);
    expect(head).toBeGreaterThan(0);
    for (let i = 0; i < 240; i++) snake.step(w, head, DT);
    const g = gs(w);
    const slot = w.a[head] ?? 0;
    const s0 = g.snakeSegs[slot * SNAKE_SEGMENTS] ?? 0;
    expect(w.kind[s0]).toBe(Kind.SnakeBody);
    expect(dist(w, head, s0)).toBeGreaterThan(14);
    expect(dist(w, head, s0)).toBeLessThan(19);
  });

  it('only the head is vulnerable; segments absorb bullets; head kill removes the body', () => {
    const { w } = makeGame();
    const head = snake.spawnSnake(w, 400, 300, 0);
    for (let i = 0; i < 240; i++) snake.step(w, head, DT);
    const slot = w.a[head] ?? 0;
    const seg = gs(w).snakeSegs[slot * SNAKE_SEGMENTS + 6] ?? 0;
    rebuild(w.grid, w);
    const b = spawnBullet(w.bullets, w.x[seg] ?? 0, w.y[seg] ?? 0, 0, 0, 1);
    bulletHits(w);
    expect(w.bullets.alive[b]).toBe(0);
    expect(w.alive[seg]).toBe(1);
    expect(w.hp[head]).toBe(6);

    spawnBullet(w.bullets, w.x[head] ?? 0, w.y[head] ?? 0, 0, 0, 1);
    bulletHits(w);
    expect(w.hp[head]).toBe(5);

    w.hp[head] = 1;
    spawnBullet(w.bullets, w.x[head] ?? 0, w.y[head] ?? 0, 0, 0, 1);
    bulletHits(w);
    expect(w.kind[head]).not.toBe(Kind.SnakeHead); // freed; the slot may now hold a geom
    let segs = 0;
    for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && w.kind[i] === Kind.SnakeBody) segs++;
    expect(segs).toBe(0);
    expect(gameState(w).score).toBe(200);
    expect(gs(w).snakeHead[slot]).toBe(-1);
  });
});

describe('gravity well', () => {
  it('kills the ship on contact', () => {
    const { w, vibes } = makeGame();
    const id = put(w, well.def, 30, 0);
    gs(w).wellIds[gs(w).wellCount++] = id;
    well.stepWells(w, DT);
    expect(w.ship.active).toBe(false);
    expect(gameState(w).lives).toBe(2);
    expect(vibes).toEqual([60]);
  });

  it('grows when fed an enemy (no score)', () => {
    const { w } = makeGame();
    const id = put(w, well.def, 300, 0);
    gs(w).wellIds[gs(w).wellCount++] = id;
    const g1 = put(w, grunt.def, 305, 0);
    well.stepWells(w, DT);
    expect(w.alive[g1]).toBe(0);
    expect(well.massOf(w, id)).toBe(1);
    expect(w.radius[id]).toBe(26);
    expect(w.hp[id]).toBe(42);
    expect(gameState(w).score).toBe(0);
  });

  it('pulls nearby enemies inward', () => {
    const { w } = makeGame();
    const id = put(w, well.def, 300, 0);
    gs(w).wellIds[gs(w).wellCount++] = id;
    const g1 = put(w, grunt.def, 300, 200);
    for (let i = 0; i < 30; i++) well.stepWells(w, DT);
    expect(w.y[g1]).toBeLessThan(200);
  });

  it('explodes at mass 20, clearing enemies and the ship within 220 u', () => {
    const { w } = makeGame();
    const id = put(w, well.def, 150, 0);
    gs(w).wellIds[gs(w).wellCount++] = id;
    gs(w).aux[id] = 19;
    w.x[0] = -400; // ship outside the blast
    w.y[0] = 300;
    const near = put(w, grunt.def, 150, 200);
    const far = put(w, grunt.def, -600, -400);
    const food = put(w, grunt.def, 152, 0);
    well.feed(w, id, food);
    expect(w.alive[id]).toBe(0);
    expect(w.alive[near]).toBe(0);
    expect(w.alive[far]).toBe(1);
    expect(w.ship.active).toBe(true);
    expect(gs(w).wellCount).toBe(0);
  });

  it('explosion kills a vulnerable ship within 220 u', () => {
    const { w } = makeGame();
    const id = put(w, well.def, 150, 0);
    gs(w).wellIds[gs(w).wellCount++] = id;
    well.explode(w, id);
    expect(w.ship.active).toBe(false);
  });

  it('can be shot down for 250 x multiplier and 5 geoms', () => {
    const { w } = makeGame();
    const id = put(w, well.def, 300, 0);
    gs(w).wellIds[gs(w).wellCount++] = id;
    w.hp[id] = 1;
    spawnBullet(w.bullets, 300, 20, 0, 0, 1);
    well.stepWells(w, DT);
    expect(w.kind[id]).not.toBe(Kind.GravityWell); // freed; the slot may now hold a geom
    expect(gameState(w).score).toBe(250);
    let geoms = 0;
    for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && w.kind[i] === Kind.Geom) geoms++;
    expect(geoms).toBe(5);
  });
});

describe('spawner enemy', () => {
  it('emits its first dart group 2 s after activation with a 0.4 s telegraph', () => {
    const { w } = makeGame({
      hazards: { wells: [], spawners: [{ x: 500, y: 300, spawnAtSec: 0, emitEverySec: 6, dartsPerEmit: 5 }] },
    });
    const id = put(w, spawnerEnemy.def, 500, 300);
    w.a[id] = 0;
    for (let i = 0; i < 230; i++) spawnerEnemy.step(w, id, DT);
    expect(spawnerEnemy.ownDarts(w, id)).toBe(0);
    for (let i = 0; i < 20; i++) spawnerEnemy.step(w, id, DT);
    expect(spawnerEnemy.ownDarts(w, id)).toBe(5);
    for (let i = 1; i < w.cap; i++) {
      if (w.alive[i] === 1 && w.kind[i] === Kind.Dart) expect(gs(w).tele[i]).toBeCloseTo(0.4, 5);
    }
  });
});
