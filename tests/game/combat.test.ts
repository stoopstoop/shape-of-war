import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { spawnBullet } from '../../src/game/bullets';
import { rebuild } from '../../src/game/collide';
import { bulletHits, shipHits, shipPickups } from '../../src/game/combat';
import * as grunt from '../../src/game/enemies/grunt';
import * as well from '../../src/game/enemies/gravitywell';
import * as pinwheel from '../../src/game/enemies/pinwheel';
import * as spawnerEnemy from '../../src/game/enemies/spawner';
import { gameState, stepGame } from '../../src/game/game';
import { spawnGeoms } from '../../src/game/geoms';
import { RESPAWN_DELAY, triggerBomb } from '../../src/game/player';
import { gs, spawnFromDef } from '../../src/game/state';
import { INVULN_SEC } from '../../src/game/ship';
import { Kind } from '../../src/game/world';
import { DT, idle, makeGame, put } from './helpers';

afterEach(() => bus.clear());

function count(w: ReturnType<typeof makeGame>['w'], k: Kind): number {
  let n = 0;
  for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && w.kind[i] === k) n++;
  return n;
}

describe('bullet vs enemy', () => {
  it('kills, scores base x multiplier, drops geoms and emits fx:kill', () => {
    const { w } = makeGame();
    const kills: string[] = [];
    bus.on('fx:kill', (p) => kills.push(p.colour));
    const id = put(w, grunt.def, 200, 0);
    const b = spawnBullet(w.bullets, 200, 0, 0, 0, 1);
    gs(w).multiplier = 3;
    bulletHits(w);
    expect(w.kind[id]).not.toBe(Kind.Grunt);
    expect(w.bullets.alive[b]).toBe(0);
    expect(gameState(w).score).toBe(150);
    expect(gameState(w).kills).toBe(1);
    expect(kills).toEqual(['blue']);
    expect(count(w, Kind.Geom)).toBe(1);
  });

  it('uses the injected scoring port', () => {
    const { w } = makeGame({}, {
      scoring: { awardKill: () => 7, collectGeom: () => undefined, resetMultiplier: () => undefined },
    });
    put(w, grunt.def, 200, 0);
    spawnBullet(w.bullets, 200, 0, 0, 0, 1);
    bulletHits(w);
    expect(gameState(w).score).toBe(7);
  });

  it('a 2 HP pinwheel takes two hits; each bullet hits once', () => {
    const { w } = makeGame();
    const id = put(w, pinwheel.def, 200, 0);
    spawnBullet(w.bullets, 200, 0, 0, 0, 1);
    bulletHits(w);
    expect(w.hp[id]).toBe(1);
    expect(w.bullets.liveCount).toBe(0);
  });

  it('telegraphing enemies are untargetable', () => {
    const { w } = makeGame();
    const id = spawnFromDef(w, grunt.def, 200, 0, 0.6);
    rebuild(w.grid, w);
    const b = spawnBullet(w.bullets, 200, 0, 0, 0, 1);
    bulletHits(w);
    expect(w.alive[id]).toBe(1);
    expect(w.bullets.alive[b]).toBe(1);
  });
});

describe('ship vs enemy', () => {
  it('contact kills the ship once: lives, multiplier, clear, fx:death, one vibrate', () => {
    const { w, vibes } = makeGame();
    let deaths = 0;
    bus.on('fx:death', () => deaths++);
    gs(w).multiplier = 9;
    put(w, grunt.def, 5, 0);
    put(w, grunt.def, 400, 300);
    const wl = put(w, well.def, -500, -300);
    gs(w).wellIds[gs(w).wellCount++] = wl;
    spawnGeoms(w, 300, 0, 3);
    rebuild(w.grid, w);
    expect(shipHits(w)).toBe(true);
    expect(shipHits(w)).toBe(false);
    const g = gameState(w);
    expect(g.lives).toBe(2);
    expect(g.multiplier).toBe(1);
    expect(g.score).toBe(0);
    expect(count(w, Kind.Grunt)).toBe(0);
    expect(count(w, Kind.Geom)).toBe(0);
    expect(count(w, Kind.GravityWell)).toBe(1);
    expect(deaths).toBe(1);
    expect(vibes).toEqual([60]);
    expect(w.ship.active).toBe(false);
  });

  it('invulnerable ship survives contact', () => {
    const { w } = makeGame();
    w.ship.invuln = 1;
    put(w, grunt.def, 5, 0);
    expect(shipHits(w)).toBe(false);
  });

  it('respawns at the centre after 1.5 s with 2 s invulnerability, wave clock paused', () => {
    const { w } = makeGame();
    put(w, grunt.def, 5, 0);
    shipHits(w);
    const clock = gs(w).waveClock;
    const steps = Math.ceil(RESPAWN_DELAY / DT) + 1;
    for (let i = 0; i < steps; i++) stepGame(w, DT, idle());
    expect(w.ship.active).toBe(true);
    expect(w.ship.invuln).toBeGreaterThan(INVULN_SEC - 0.05);
    expect(w.x[0]).toBe(0);
    expect(gs(w).waveClock - clock).toBeLessThan(0.05);
  });
});

describe('ship vs geom', () => {
  it('collects within 28 u: multiplier plus 1, super charge plus 1, fx:geom', () => {
    const { w } = makeGame();
    let fx = 0;
    bus.on('fx:geom', () => fx++);
    spawnGeoms(w, 20, 0, 1);
    spawnGeoms(w, 200, 0, 1);
    rebuild(w.grid, w);
    shipPickups(w);
    expect(gameState(w).multiplier).toBe(2);
    expect(gameState(w).superCharge).toBe(1);
    expect(count(w, Kind.Geom)).toBe(1);
    expect(fx).toBe(1);
  });

  it('geoms expire after 4 s', () => {
    const { w } = makeGame();
    spawnGeoms(w, 500, 300, 2);
    w.ship.invuln = 99;
    for (let i = 0; i < 4.1 * 120; i++) stepGame(w, DT, idle());
    expect(count(w, Kind.Geom)).toBe(0);
  });
});

describe('ship and bullets vs well', () => {
  it('bends a passing bullet toward the well', () => {
    const { w } = makeGame();
    const id = put(w, well.def, 300, 0);
    gs(w).wellIds[gs(w).wellCount++] = id;
    const b = spawnBullet(w.bullets, 100, 100, 1400, 0, 1);
    well.stepWells(w, DT);
    expect(w.bullets.vy[b]).toBeLessThan(0);
  });

  it('pulls the ship toward the well', () => {
    const { w } = makeGame();
    w.ship.invuln = 99;
    const id = put(w, well.def, 200, 0);
    gs(w).wellIds[gs(w).wellCount++] = id;
    for (let i = 0; i < 30; i++) well.stepWells(w, DT);
    expect(w.x[0]).toBeGreaterThan(0);
  });
});

describe('bomb', () => {
  it('clears enemies without score, resets wells, destroys spawners, emits fx:bomb', () => {
    const { w } = makeGame();
    let fx = 0;
    bus.on('fx:bomb', () => fx++);
    put(w, grunt.def, 300, 0);
    put(w, spawnerEnemy.def, -300, 0);
    const wl = put(w, well.def, 0, 300);
    gs(w).wellIds[gs(w).wellCount++] = wl;
    gs(w).aux[wl] = 5;
    w.radius[wl] = 34;
    spawnGeoms(w, 200, 200, 1);
    expect(triggerBomb(w)).toBe(true);
    expect(triggerBomb(w)).toBe(false); // 1 s cooldown
    const g = gameState(w);
    expect(g.bombs).toBe(2);
    expect(g.score).toBe(0);
    expect(count(w, Kind.Grunt)).toBe(0);
    expect(count(w, Kind.Spawner)).toBe(0);
    expect(count(w, Kind.GravityWell)).toBe(1);
    expect(well.massOf(w, wl)).toBe(0);
    expect(w.radius[wl]).toBe(24);
    expect(count(w, Kind.Geom)).toBe(1);
    expect(fx).toBe(1);
  });

  it('bomb button through stepGame, none left after 3', () => {
    const { w } = makeGame();
    w.ship.invuln = 99;
    const press = idle();
    press.bomb = true;
    for (let i = 0; i < 5; i++) {
      stepGame(w, DT, press);
      for (let k = 0; k < 125; k++) stepGame(w, DT, idle());
    }
    expect(gameState(w).bombs).toBe(0);
  });
});
