import { describe, expect, it } from 'vitest';
import { CELL, createGrid, queryCircle, queryCircleInto, rebuild, type GridEntities } from '../../src/game/collide';

function ents(cap: number): GridEntities {
  return {
    cap,
    alive: new Uint8Array(cap),
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    radius: new Float32Array(cap),
  };
}

function put(e: GridEntities, id: number, x: number, y: number, r: number): void {
  e.alive[id] = 1;
  e.x[id] = x;
  e.y[id] = y;
  e.radius[id] = r;
}

function hits(g: ReturnType<typeof createGrid>, e: GridEntities, x: number, y: number, r: number): number[] {
  const out: number[] = [];
  queryCircle(g, e, x, y, r, (id) => out.push(id));
  return out.sort((a, b) => a - b);
}

describe('spatial hash', () => {
  it('finds an overlapping entity', () => {
    const e = ents(8);
    put(e, 1, 100, 100, 14);
    const g = createGrid(1400, 900, 8);
    rebuild(g, e);
    expect(hits(g, e, 110, 105, 4)).toEqual([1]);
  });

  it('does not report a distant entity', () => {
    const e = ents(8);
    put(e, 1, 100, 100, 14);
    put(e, 2, -500, -300, 14);
    const g = createGrid(1400, 900, 8);
    rebuild(g, e);
    expect(hits(g, e, 110, 105, 4)).toEqual([1]);
    expect(hits(g, e, 0, 0, 20)).toEqual([]);
  });

  it('finds overlaps across a cell edge', () => {
    const e = ents(8);
    const g = createGrid(1400, 900, 8);
    // Cell boundary at originX + CELL * k. Put the entity just right of it, query just left.
    const edge = g.originX + CELL * 5;
    put(e, 3, edge + 2, 0, 14);
    rebuild(g, e);
    expect(hits(g, e, edge - 8, 0, 4)).toEqual([3]);
    // Same on the y axis.
    const edgeY = g.originY + CELL * 3;
    put(e, 4, 300, edgeY - 1, 10);
    rebuild(g, e);
    expect(hits(g, e, 300, edgeY + 6, 4)).toEqual([4]);
  });

  it('skips dead ids, both before and after rebuild', () => {
    const e = ents(8);
    put(e, 1, 0, 0, 10);
    put(e, 2, 5, 5, 10);
    e.alive[2] = 0;
    const g = createGrid(1400, 900, 8);
    rebuild(g, e);
    expect(hits(g, e, 0, 0, 5)).toEqual([1]);
    e.alive[1] = 0; // killed after rebuild
    expect(hits(g, e, 0, 0, 5)).toEqual([]);
  });

  it('handles many entities in one cell and the closure free query', () => {
    const e = ents(64);
    for (let i = 0; i < 64; i++) put(e, i, (i % 8) * 2, Math.floor(i / 8) * 2, 3);
    const g = createGrid(1400, 900, 64);
    rebuild(g, e);
    const out = new Int32Array(64);
    expect(queryCircleInto(g, e, 7, 7, 30, out)).toBe(64);
    const small = new Int32Array(10);
    expect(queryCircleInto(g, e, 7, 7, 30, small)).toBe(10);
  });

  it('clamps positions outside the arena into edge cells', () => {
    const e = ents(4);
    put(e, 1, 5000, -5000, 10);
    const g = createGrid(1400, 900, 4);
    rebuild(g, e);
    expect(hits(g, e, 5000, -5000, 1)).toEqual([1]);
  });
});
