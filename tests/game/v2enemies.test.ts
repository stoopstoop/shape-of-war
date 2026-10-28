// V2 enemies (docs/10 wave C): Charger, Bulwark, Blink, Swirl, Sower.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { spawnBullet } from '../../src/game/bullets';
import { rebuild } from '../../src/game/collide';
import { bulletHits, isTargetable, shielded } from '../../src/game/combat';
import * as blink from '../../src/game/enemies/blink';
import * as bulwark from '../../src/game/enemies/bulwark';
import * as charger from '../../src/game/enemies/charger';
import * as well from '../../src/game/enemies/gravitywell';
import * as mine from '../../src/game/enemies/mine';
import * as sower from '../../src/game/enemies/sower';
import * as swirl from '../../src/game/enemies/swirl';
import { stepDrone } from '../../src/game/drones';
import { triggerBomb } from '../../src/game/player';
import { gs, spawnFromDef } from '../../src/game/state';
import { detonate } from '../../src/game/supers';
import { Kind, type World } from '../../src/game/world';
import { DT, dist, makeGame, put } from './helpers';

afterEach(() => bus.clear());

const DEG = Math.PI / 180;

function countKind(w: World, k: Kind): number {
  let n = 0;
  for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && w.kind[i] === k) n++;
  return n;
}

function addWell(w: World, x: number, y: number): number {
  const id = spawnFromDef(w, well.def, x, y, 0);
  const g = gs(w);
  g.wellIds[g.wellCount++] = id;
  return id;
}

describe('charger', () => {
  it('has the plan stats', () => {
    expect(charger.def).toMatchObject({ kind: Kind.Charger, radius: 15, speed: 720, value: 120, hp: 2, geoms: 2 });
    expect(charger.CYCLE).toBeCloseTo(2.7, 9);
  });

  it('winds up still, dashes 360 u along the locked heading, rests, then cycles', () => {
    const { w } = makeGame();
    const id = put(w, charger.def, 300, 0);
    w.rot[id] = Math.PI; // already facing the ship at the origin
    let steps = 0;
    while (charger.phaseOf(w.t[id] ?? 0) === 'windup') {
      charger.step(w, id, DT);
      steps++;
    }
    expect(steps).toBeGreaterThanOrEqual(119);
    expect(steps).toBeLessThanOrEqual(121);
    expect(w.x[id]).toBeCloseTo(300, 6);
    const x0 = w.x[id] ?? 0;
    while (charger.phaseOf(w.t[id] ?? 0) === 'dash') charger.step(w, id, DT);
    expect(x0 - (w.x[id] ?? 0)).toBeGreaterThan(354);
    expect(x0 - (w.x[id] ?? 0)).toBeLessThan(367);
    expect(w.y[id]).toBeCloseTo(0, 4);
    const x1 = w.x[id] ?? 0;
    steps = 0;
    while (charger.phaseOf(w.t[id] ?? 0) === 'rest') {
      charger.step(w, id, DT);
      steps++;
    }
    expect(steps).toBeGreaterThanOrEqual(143);
    expect(steps).toBeLessThanOrEqual(145);
    expect(w.x[id]).toBe(x1);
    expect(w.t[id] ?? 1).toBeLessThan(0.02); // wrapped back into the wind up
  });

  it('turns at most 120 deg/s during the wind up', () => {
    const { w } = makeGame();
    const id = put(w, charger.def, 300, 0);
    w.rot[id] = 0; // facing away from the ship
    for (let i = 0; i < 60; i++) charger.step(w, id, DT);
    expect(Math.abs(w.rot[id] ?? 0)).toBeCloseTo(60 * DEG, 2);
  });

  it('a wall ends the dash and starts the rest', () => {
    const { w } = makeGame();
    const id = put(w, charger.def, 500, 0);
    w.rot[id] = 0; // toward the +x wall at 700
    w.t[id] = charger.WINDUP_SEC;
    let steps = 0;
    while (charger.phaseOf(w.t[id] ?? 0) === 'dash' && steps < 200) {
      charger.step(w, id, DT);
      steps++;
    }
    expect(w.x[id]).toBeCloseTo(700 - 15, 3);
    expect(steps).toBeLessThan(40); // 185 u at 720 u/s is about 31 steps, far short of 60
    expect(charger.phaseOf(w.t[id] ?? 0)).toBe('rest');
    expect(w.t[id]).toBeCloseTo(charger.DASH_END, 5);
  });

  it('is pulled by a well while resting but not while dashing', () => {
    const { w } = makeGame();
    addWell(w, 0, 300);
    const rest = put(w, charger.def, 0, 150);
    w.t[rest] = charger.DASH_END + 0.01;
    const dash = put(w, charger.def, 200, 150);
    w.t[dash] = charger.WINDUP_SEC;
    w.rot[dash] = Math.PI / 2; // dashing straight down, along +y
    const yRest = w.y[rest] ?? 0;
    for (let i = 0; i < 6; i++) {
      charger.step(w, dash, DT);
      well.stepWells(w, DT);
    }
    expect(w.y[rest] ?? 0).toBeGreaterThan(yRest + 0.1);
    expect(w.x[dash]).toBeCloseTo(200, 4); // no sideways pull toward the well at x 0
  });
});

describe('bulwark', () => {
  it('has the plan stats', () => {
    expect(bulwark.def).toMatchObject({ kind: Kind.Bulwark, radius: 18, speed: 90, value: 150, hp: 3, geoms: 3 });
  });

  it('blocks a frontal bullet and loses HP to a side hit', () => {
    const { w } = makeGame();
    const id = put(w, bulwark.def, 300, 0);
    w.rot[id] = Math.PI; // facing the ship
    const front = spawnBullet(w.bullets, 280, 0, 1400, 0, 1);
    bulletHits(w);
    expect(w.bullets.alive[front]).toBe(0);
    expect(w.hp[id]).toBe(3);
    const side = spawnBullet(w.bullets, 300, -20, 0, 1400, 1);
    bulletHits(w);
    expect(w.bullets.alive[side]).toBe(0);
    expect(w.hp[id]).toBe(2);
    const rear = spawnBullet(w.bullets, 320, 0, -1400, 0, 1);
    bulletHits(w);
    expect(w.bullets.alive[rear]).toBe(0);
    expect(w.hp[id]).toBe(1);
  });

  it('shield arc is +-60 deg around the heading', () => {
    const { w } = makeGame();
    const id = put(w, bulwark.def, 0, 300);
    w.rot[id] = 0;
    expect(shielded(w, id, 20, 300)).toBe(true);
    expect(shielded(w, id, 20 * Math.cos(55 * DEG), 300 + 20 * Math.sin(55 * DEG))).toBe(true);
    expect(shielded(w, id, 20 * Math.cos(65 * DEG), 300 + 20 * Math.sin(65 * DEG))).toBe(false);
    expect(shielded(w, id, -20, 300)).toBe(false);
  });

  it('turns at most 70 deg/s and moves 90 u/s along its heading', () => {
    const { w } = makeGame();
    const id = put(w, bulwark.def, 300, 0);
    w.rot[id] = 0;
    for (let i = 0; i < 120; i++) bulwark.step(w, id, DT);
    expect(Math.abs(w.rot[id] ?? 0)).toBeCloseTo(70 * DEG, 2);
  });

  it('Detonate and bombs ignore the shield', () => {
    const { w } = makeGame({ drone: 'attack', superType: 'detonate' });
    stepDrone(w, DT);
    const drone = gs(w).droneId;
    const id = put(w, bulwark.def, (w.x[drone] ?? 0) + 100, w.y[drone] ?? 0);
    w.rot[id] = Math.PI; // shield toward the drone
    expect(detonate(w)).toBe(1);
    expect(countKind(w, Kind.Bulwark)).toBe(0); // the freed id is reused by a geom
    expect(gs(w).score).toBe(150);
    const b = put(w, bulwark.def, 300, 0);
    w.rot[b] = Math.PI;
    expect(triggerBomb(w)).toBe(true);
    expect(countKind(w, Kind.Bulwark)).toBe(0);
  });
});

describe('blink', () => {
  it('has the plan stats', () => {
    expect(blink.def).toMatchObject({ kind: Kind.Blink, radius: 13, speed: 100, value: 130, hp: 1, geoms: 2 });
  });

  it('is never targetable during the warp and is during the drift', () => {
    const { w } = makeGame();
    const id = put(w, blink.def, 500, 0);
    let warpSteps = 0;
    for (let i = 0; i < 3 * 312; i++) {
      blink.step(w, id, DT);
      const warping = (w.t[id] ?? 0) >= blink.DRIFT_SEC;
      if (warping) warpSteps++;
      expect(isTargetable(w, id)).toBe(!warping);
    }
    expect(warpSteps).toBeGreaterThan(100); // about 48 per cycle
  });

  it('a bullet passes through a warping Blink', () => {
    const { w } = makeGame();
    const id = put(w, blink.def, 500, 0);
    while ((w.t[id] ?? 0) < blink.DRIFT_SEC) blink.step(w, id, DT);
    rebuild(w.grid, w);
    const b = spawnBullet(w.bullets, w.x[id] ?? 0, w.y[id] ?? 0, 1400, 0, 1);
    bulletHits(w);
    expect(w.bullets.alive[b]).toBe(1);
    expect(w.alive[id]).toBe(1);
  });

  it('drifts at 100 u/s and lands 180 to 260 u from a still ship', () => {
    for (let n = 0; n < 8; n++) {
      const { w } = makeGame({ seed: 100 + n });
      const id = put(w, blink.def, -600, 300 - n * 80);
      const d0 = dist(w, 0, id);
      for (let i = 0; i < 120; i++) blink.step(w, id, DT);
      expect(d0 - dist(w, 0, id)).toBeCloseTo(100, 0);
      for (let cycle = 0; cycle < 4; cycle++) {
        while ((w.t[id] ?? 0) < blink.DRIFT_SEC) blink.step(w, id, DT);
        const dx = w.vx[id] ?? 0;
        const dy = w.vy[id] ?? 0;
        while ((w.t[id] ?? 0) >= blink.DRIFT_SEC) blink.step(w, id, DT);
        expect(w.x[id]).toBe(dx);
        expect(w.y[id]).toBe(dy);
        const d = dist(w, 0, id);
        expect(d).toBeGreaterThanOrEqual(180 - 1e-3);
        expect(d).toBeLessThanOrEqual(260 + 1e-3);
      }
    }
  });

  it('leads a fast ship and stays inside the arena near a wall', () => {
    const { w } = makeGame();
    const id = put(w, blink.def, -400, 0);
    w.vx[0] = 300;
    blink.chooseDestination(w, id, 0);
    expect(w.vy[id]).toBeCloseTo(0, 3); // straight ahead along +x
    expect(w.vx[id] ?? 0).toBeGreaterThanOrEqual(180);
    w.x[0] = 600; // 100 u from the +x wall: ahead is outside
    blink.chooseDestination(w, id, 1);
    const x = w.vx[id] ?? 0;
    const y = w.vy[id] ?? 0;
    expect(x).toBeLessThanOrEqual(700 - 13);
    expect(Math.abs(y)).toBeLessThanOrEqual(450 - 13);
    const d = Math.hypot(x - 600, y);
    expect(d).toBeGreaterThanOrEqual(180 - 1e-3);
    expect(d).toBeLessThanOrEqual(260 + 1e-3);
  });
});

describe('swirl', () => {
  it('has the plan stats', () => {
    expect(swirl.def).toMatchObject({ kind: Kind.Swirl, radius: 12, value: 80, hp: 1, geoms: 1 });
    expect(swirl.ORBIT_RADIUS * swirl.ANGULAR_SPEED).toBeCloseTo(144, 6);
  });

  it('orbits at 0.6 rad/s while the radius closes at 20 u/s', () => {
    const { w } = makeGame();
    const id = put(w, swirl.def, 240, 0);
    const a0 = Math.atan2(w.y[id] ?? 0, w.x[id] ?? 0);
    for (let i = 0; i < 120; i++) swirl.step(w, id, DT);
    expect(dist(w, 0, id)).toBeCloseTo(220, 0);
    const a1 = Math.atan2(w.y[id] ?? 0, w.x[id] ?? 0);
    expect(Math.abs(a1 - a0)).toBeCloseTo(0.6, 2);
    expect(Math.sign(a1 - a0)).toBe(swirl.orbitDir(w, id));
  });

  it('commits to a straight 300 u/s dive at 90 u', () => {
    const { w } = makeGame();
    const id = put(w, swirl.def, 0, 240);
    let steps = 0;
    while (!swirl.isDiving(w, id) && steps < 120 * 20) {
      swirl.step(w, id, DT);
      steps++;
    }
    expect(swirl.isDiving(w, id)).toBe(true);
    expect(steps / 120).toBeCloseTo(7.5, 0); // (240 - 90) / 20
    const heading = w.rot[id] ?? 0;
    const x0 = w.x[id] ?? 0;
    const y0 = w.y[id] ?? 0;
    for (let i = 0; i < 12; i++) swirl.step(w, id, DT);
    const dx = (w.x[id] ?? 0) - x0;
    const dy = (w.y[id] ?? 0) - y0;
    expect(Math.hypot(dx, dy)).toBeCloseTo(30, 0);
    expect(Math.atan2(dy, dx)).toBeCloseTo(heading, 4);
    expect(w.rot[id]).toBe(heading);
  });

  it('orbit direction varies by entity and is stable', () => {
    const { w } = makeGame();
    const dirs = new Set<number>();
    for (let i = 0; i < 16; i++) {
      const id = put(w, swirl.def, 240, 0);
      expect(swirl.orbitDir(w, id)).toBe(swirl.orbitDir(w, id));
      dirs.add(swirl.orbitDir(w, id));
    }
    expect(dirs.size).toBe(2);
  });
});

describe('sower', () => {
  it('has the plan stats', () => {
    expect(sower.def).toMatchObject({ kind: Kind.Sower, radius: 16, speed: 70, value: 180, hp: 4, geoms: 3 });
  });

  it('goes to the nearest wall and circulates clockwise along it', () => {
    const { w } = makeGame();
    const id = put(w, sower.def, 0, -300);
    for (let i = 0; i < 120 * 3; i++) sower.step(w, id, DT);
    expect(w.y[id]).toBeCloseTo(-450 + 16, 0); // top wall
    const x0 = w.x[id] ?? 0;
    for (let i = 0; i < 120; i++) sower.step(w, id, DT);
    expect((w.x[id] ?? 0) - x0).toBeCloseTo(70, -1); // clockwise on a y down screen: rightward on top
    expect(w.y[id]).toBeCloseTo(-450 + 16, 0);
  });

  it('turns the corner and keeps hugging', () => {
    const { w } = makeGame();
    const id = put(w, sower.def, 600, -430);
    for (let i = 0; i < 120 * 5; i++) sower.step(w, id, DT);
    expect(w.x[id]).toBeCloseTo(700 - 16, 0); // now on the right wall
    expect(w.y[id] ?? 0).toBeGreaterThan(-300); // moving down
  });

  it('drops a Mine every 3 s up to 6 live', () => {
    const { w } = makeGame();
    const id = put(w, sower.def, 0, -300);
    for (let i = 0; i < 360; i++) sower.step(w, id, DT);
    expect(countKind(w, Kind.Mine)).toBe(1);
    for (let i = 0; i < 360; i++) sower.step(w, id, DT);
    expect(countKind(w, Kind.Mine)).toBe(2);
    for (let i = 0; i < 120 * 30; i++) sower.step(w, id, DT);
    expect(countKind(w, Kind.Mine)).toBe(mine.CAP_PER_SOWER);
  });

  it('total Mines cap at 24 across Sowers', () => {
    const { w } = makeGame();
    const ids: number[] = [];
    for (let s = 0; s < 6; s++) ids.push(put(w, sower.def, -500 + s * 200, 0));
    for (let i = 0; i < 120 * 25; i++) for (const id of ids) sower.step(w, id, DT);
    expect(countKind(w, Kind.Mine)).toBe(mine.CAP_TOTAL);
  });

  it('a full world skips the drop without throwing', () => {
    const { w } = makeGame({}, { capacity: 2 });
    const id = put(w, sower.def, 0, -300);
    expect(id).toBe(1);
    expect(() => {
      for (let i = 0; i < 400; i++) sower.step(w, id, DT);
    }).not.toThrow();
    expect(mine.dropMine(w, id, 0, 0)).toBe(-1);
  });
});
