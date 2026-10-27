import { describe, expect, it } from 'vitest';
import {
  clearEntities,
  createWorld,
  ENTITY_CAP,
  inlineRectLevel,
  Kind,
  kill,
  registerBehaviour,
  spawn,
  stepWorld,
} from '../../src/game/world';
import type { InputState } from '../../src/input/types';

const idle: InputState = {
  move: { active: false, x: 0, y: 0 },
  aim: { active: false, x: 0, y: 0 },
  bomb: false,
  superPressed: false,
  pause: false,
};

describe('world store', () => {
  it('reserves id 0 for the ship', () => {
    const w = createWorld(inlineRectLevel());
    expect(w.cap).toBe(ENTITY_CAP);
    expect(w.kind[0]).toBe(Kind.Ship);
    expect(w.alive[0]).toBe(1);
    expect(w.liveCount).toBe(1);
    const id = spawn(w, Kind.Grunt, 10, 20);
    expect(id).toBe(1);
    expect(w.x[id]).toBe(10);
    expect(w.prevY[id]).toBe(20);
    expect(w.a[id]).toBe(-1);
  });

  it('spawn to cap returns -1', () => {
    const w = createWorld(inlineRectLevel(), 16);
    for (let i = 1; i < 16; i++) expect(spawn(w, Kind.Grunt, 0, 0)).toBe(i);
    expect(spawn(w, Kind.Grunt, 0, 0)).toBe(-1);
    expect(w.liveCount).toBe(16);
  });

  it('kill recycles the slot', () => {
    const w = createWorld(inlineRectLevel(), 4);
    const a = spawn(w, Kind.Grunt, 0, 0);
    spawn(w, Kind.Grunt, 0, 0);
    spawn(w, Kind.Grunt, 0, 0);
    expect(spawn(w, Kind.Grunt, 0, 0)).toBe(-1);
    kill(w, a);
    expect(w.alive[a]).toBe(0);
    expect(w.kind[a]).toBe(Kind.None);
    expect(spawn(w, Kind.Wanderer, 0, 0)).toBe(a);
    expect(w.kind[a]).toBe(Kind.Wanderer);
  });

  it('double kill and killing the ship are no-ops', () => {
    const w = createWorld(inlineRectLevel(), 8);
    const a = spawn(w, Kind.Grunt, 0, 0);
    kill(w, a);
    kill(w, a);
    kill(w, 0);
    expect(w.liveCount).toBe(1);
    expect(w.alive[0]).toBe(1);
    expect(w.freeTop).toBe(7);
  });

  it('seeds simRng from level.seed', () => {
    const a = createWorld(inlineRectLevel(77));
    const b = createWorld(inlineRectLevel(77));
    const c = createWorld(inlineRectLevel(78));
    const va = a.simRng();
    expect(b.simRng()).toBe(va);
    expect(c.simRng()).not.toBe(va);
  });

  it('stepWorld copies prev, drifts unregistered kinds and stays in the arena', () => {
    const w = createWorld(inlineRectLevel());
    const id = spawn(w, Kind.Pinwheel, 680, 0);
    w.radius[id] = 20;
    w.vx[id] = 600;
    for (let i = 0; i < 120; i++) stepWorld(w, 1 / 120, idle);
    expect(w.vx[id]).toBeLessThan(0); // bounced off the right wall
    expect(Math.abs(w.x[id] ?? 0)).toBeLessThanOrEqual(680 + 1e-3);
    expect(w.tick).toBe(120);
    expect(w.time).toBeCloseTo(1);
  });

  it('calls registered behaviours', () => {
    const w = createWorld(inlineRectLevel());
    const id = spawn(w, Kind.Weaver, 0, 0);
    let calls = 0;
    registerBehaviour(Kind.Weaver, () => {
      calls++;
    });
    stepWorld(w, 1 / 120, idle);
    registerBehaviour(Kind.Weaver, null);
    expect(calls).toBe(1);
    expect(w.alive[id]).toBe(1);
  });

  it('clearEntities keeps the ship', () => {
    const w = createWorld(inlineRectLevel(), 32);
    for (let i = 0; i < 10; i++) spawn(w, Kind.Grunt, i, i);
    clearEntities(w);
    expect(w.liveCount).toBe(1);
    expect(w.alive[0]).toBe(1);
  });

  it('inline level is JSON serialisable', () => {
    const lvl = inlineRectLevel(5);
    expect(JSON.parse(JSON.stringify(lvl))).toEqual(lvl);
  });
});
