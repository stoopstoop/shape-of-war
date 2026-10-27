// Uniform spatial hash grid (docs/03 section 4). Cell 64 arena units. Rebuilt every sim step
// with a counting sort into flat typed arrays: no Maps, no per step allocation.

/** Structural view of the entity store, so this module does not depend on world.ts. */
export interface GridEntities {
  cap: number;
  alive: Uint8Array;
  x: Float32Array;
  y: Float32Array;
  radius: Float32Array;
}

export const CELL = 64;

export interface Grid {
  cols: number;
  rows: number;
  originX: number;
  originY: number;
  cellStart: Int32Array; // length cols*rows + 1
  cellItems: Int32Array; // entity ids sorted by cell
  cellOf: Int32Array; // per entity cell index, -1 if dead
  fill: Int32Array; // scratch cursor per cell, reused by rebuild
}

export function createGrid(arenaW: number, arenaH: number, cap: number): Grid {
  const cols = Math.ceil(arenaW / CELL) + 1;
  const rows = Math.ceil(arenaH / CELL) + 1;
  return {
    cols,
    rows,
    originX: -arenaW / 2,
    originY: -arenaH / 2,
    cellStart: new Int32Array(cols * rows + 1),
    cellItems: new Int32Array(cap),
    cellOf: new Int32Array(cap).fill(-1),
    fill: new Int32Array(cols * rows),
  };
}

function cellX(g: Grid, x: number): number {
  const c = Math.floor((x - g.originX) / CELL);
  return c < 0 ? 0 : c >= g.cols ? g.cols - 1 : c;
}

function cellY(g: Grid, y: number): number {
  const c = Math.floor((y - g.originY) / CELL);
  return c < 0 ? 0 : c >= g.rows ? g.rows - 1 : c;
}

export function rebuild(g: Grid, w: GridEntities): void {
  const n = g.cols * g.rows;
  const start = g.cellStart;
  start.fill(0);
  const cap = Math.min(w.cap, g.cellOf.length);
  for (let i = 0; i < cap; i++) {
    if (w.alive[i] !== 1) {
      g.cellOf[i] = -1;
      continue;
    }
    const c = cellY(g, w.y[i] ?? 0) * g.cols + cellX(g, w.x[i] ?? 0);
    g.cellOf[i] = c;
    start[c + 1] = (start[c + 1] ?? 0) + 1;
  }
  for (let c = 0; c < n; c++) start[c + 1] = (start[c + 1] ?? 0) + (start[c] ?? 0); // prefix sum
  g.fill.set(start.subarray(0, n));
  for (let i = 0; i < cap; i++) {
    const c = g.cellOf[i] ?? -1;
    if (c < 0) continue;
    const k = g.fill[c] ?? 0;
    g.cellItems[k] = i;
    g.fill[c] = k + 1;
  }
}

/**
 * Calls fn(id) for every live entity whose circle overlaps the query circle. Entities killed
 * after the last rebuild are skipped. Any query radius works; the cell range is padded by
 * CELL / 2, so entities with radius above 32 u can be missed (gravity wells use a direct loop).
 */
export function queryCircle(
  g: Grid,
  w: GridEntities,
  x: number,
  y: number,
  r: number,
  fn: (id: number) => void,
): void {
  const x0 = cellX(g, x - r - CELL / 2);
  const x1 = cellX(g, x + r + CELL / 2);
  const y0 = cellY(g, y - r - CELL / 2);
  const y1 = cellY(g, y + r + CELL / 2);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const c = cy * g.cols + cx;
      const end = g.cellStart[c + 1] ?? 0;
      for (let k = g.cellStart[c] ?? 0; k < end; k++) {
        const id = g.cellItems[k] ?? 0;
        if (w.alive[id] !== 1) continue;
        const dx = (w.x[id] ?? 0) - x;
        const dy = (w.y[id] ?? 0) - y;
        const rr = r + (w.radius[id] ?? 0);
        if (dx * dx + dy * dy <= rr * rr) fn(id);
      }
    }
  }
}

/** Closure free variant for hot paths: writes ids into out, returns the count (capped at out.length). */
export function queryCircleInto(
  g: Grid,
  w: GridEntities,
  x: number,
  y: number,
  r: number,
  out: Int32Array,
): number {
  let n = 0;
  const x0 = cellX(g, x - r - CELL / 2);
  const x1 = cellX(g, x + r + CELL / 2);
  const y0 = cellY(g, y - r - CELL / 2);
  const y1 = cellY(g, y + r + CELL / 2);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const c = cy * g.cols + cx;
      const end = g.cellStart[c + 1] ?? 0;
      for (let k = g.cellStart[c] ?? 0; k < end; k++) {
        const id = g.cellItems[k] ?? 0;
        if (w.alive[id] !== 1) continue;
        const dx = (w.x[id] ?? 0) - x;
        const dy = (w.y[id] ?? 0) - y;
        const rr = r + (w.radius[id] ?? 0);
        if (dx * dx + dy * dy <= rr * rr) {
          if (n >= out.length) return n;
          out[n++] = id;
        }
      }
    }
  }
  return n;
}
