// Pure lattice layout (v2 SPEC addendum 3.8, docs/10 wave D). No pixi.js import.
// Nodes sit on a regular grid at `spacing` arena units, clipped to the arena shape and its
// obstacles with the same chord maths as the v1 grid (gridGeom.ts). Every grid line becomes one
// or more chains: a pinned node where the chord meets a wall or obstacle, the free lattice
// nodes strictly inside, and a pinned node at the other end. A lattice point shared by a
// vertical and a horizontal chain is one node, so free nodes have up to four neighbours.
// Built once per arena, tier or governor step; never per frame.
import type { ArenaDef } from '../../levelgen/leveldef';
import { halfExtent, subtractObstacles, type Axis } from '../gridGeom';

/** Spacing notches in arena units, finest first. The governor and the node cap step along it. */
export const SPACING_LADDER: readonly number[] = [16, 20, 25, 33, 40, 50, 64, 80, 100];

/** A lattice point closer than this fraction of the spacing to a chain end is left to the end. */
const END_MARGIN = 0.25;

export interface LatticeLayout {
  readonly spacing: number;
  /** Total nodes: free nodes first, then pinned chain ends. */
  readonly count: number;
  /** Nodes [0, free) move; nodes [free, count) are pinned to the walls. */
  readonly free: number;
  readonly restX: Float32Array;
  readonly restY: Float32Array;
  /** Four neighbour slots per free node, -1 when empty. May name pinned nodes. */
  readonly nbr: Int32Array;
  /** Segment index pairs on major lines (every second line, the centre lines included). */
  readonly major: Uint32Array;
  /** Segment index pairs on minor lines. */
  readonly minor: Uint32Array;
  /** Lattice index of column 0 and row 0 (negative, the arena centre is index 0). */
  readonly iMin: number;
  readonly jMin: number;
  readonly cols: number;
  readonly rows: number;
  /** Free node per lattice cell (col + row * cols), -1 when none. */
  readonly cell: Int32Array;
}

type ChainFn = (axis: Axis, line: number, lo: number, hi: number) => void;

/** Pure: half the number of lattice lines across an axis (lines at -n..n times spacing). */
function halfLines(halfSize: number, s: number): number {
  return Math.max(0, Math.floor(halfSize / s));
}

/** Visit every chord part of every grid line inside the arena, vertical lines first. */
function forEachChain(a: ArenaDef, s: number, fn: ChainFn): void {
  for (const axis of ['v', 'h'] as const) {
    const across = axis === 'v' ? a.width / 2 : a.height / 2;
    const n = halfLines(across, s);
    for (let i = -n; i <= n; i++) {
      const c = i * s;
      if (Math.abs(c) >= across) continue;
      const half = halfExtent(a, axis, c);
      if (half <= 0) continue;
      const parts = subtractObstacles(a, axis, c, -half, half);
      for (let p = 0; p + 1 < parts.length; p += 2) {
        const lo = parts[p] ?? 0;
        const hi = parts[p + 1] ?? 0;
        if (hi - lo >= 0.5) fn(axis, i, lo, hi);
      }
    }
  }
}

interface Range {
  k0: number;
  k1: number;
}

/** Pure: first and last lattice index strictly inside a chain, with the end margin. */
function chainRange(lo: number, hi: number, s: number): Range {
  const m = END_MARGIN * s;
  return { k0: Math.ceil((lo + m) / s), k1: Math.floor((hi - m) / s) };
}

interface Grid {
  iMin: number;
  jMin: number;
  cols: number;
  rows: number;
}

function gridFor(a: ArenaDef, s: number): Grid {
  const ni = halfLines(a.width / 2, s);
  const nj = halfLines(a.height / 2, s);
  return { iMin: -ni, jMin: -nj, cols: 2 * ni + 1, rows: 2 * nj + 1 };
}

/** Pure: lattice cell index for a point on a chain, or -1 if outside the grid. */
function cellOf(g: Grid, axis: Axis, line: number, k: number): number {
  const i = axis === 'v' ? line : k;
  const j = axis === 'v' ? k : line;
  const col = i - g.iMin;
  const row = j - g.jMin;
  if (col < 0 || col >= g.cols || row < 0 || row >= g.rows) return -1;
  return col + row * g.cols;
}

/** Pure: node count for an arena at a spacing (free plus pinned), without building the layout. */
export function countLatticeNodes(a: ArenaDef, spacing: number): number {
  const s = Math.max(1, spacing);
  const g = gridFor(a, s);
  const seen = new Uint8Array(g.cols * g.rows);
  let n = 0;
  forEachChain(a, s, (axis, line, lo, hi) => {
    n += 2;
    const r = chainRange(lo, hi, s);
    for (let k = r.k0; k <= r.k1; k++) {
      const c = cellOf(g, axis, line, k);
      if (c >= 0 && seen[c] === 0) {
        seen[c] = 1;
        n++;
      }
    }
  });
  return n;
}

/** Pure: ladder notch idx; past the end each step is 1.25 times the previous. */
export function ladderAt(idx: number): number {
  const last = SPACING_LADDER.length - 1;
  if (idx <= last) return SPACING_LADDER[Math.max(0, idx)] ?? 25;
  return Math.round((SPACING_LADDER[last] ?? 100) * 1.25 ** (idx - last));
}

/**
 * Pure: the spacing to build with. Starts at the first ladder notch at or above `preferred`,
 * moves `notch` steps coarser (the governor), then keeps stepping until the node count fits
 * `cap`. Past the ladder end it grows by a quarter per step.
 */
export function chooseSpacing(a: ArenaDef, preferred: number, cap: number, notch = 0): number {
  let idx = SPACING_LADDER.findIndex((v) => v >= preferred - 1e-6);
  if (idx < 0) idx = SPACING_LADDER.length - 1;
  idx += Math.max(0, Math.floor(notch));
  let s = ladderAt(idx);
  let guard = 0;
  while (countLatticeNodes(a, s) > cap && guard++ < 64) {
    idx++;
    s = ladderAt(idx);
  }
  return s;
}

/** Pure: build the lattice for an arena at a spacing. */
export function buildLattice(a: ArenaDef, spacing: number): LatticeLayout {
  const s = Math.max(1, spacing);
  const g = gridFor(a, s);
  const cell = new Int32Array(g.cols * g.rows).fill(-1);
  // Pass 1: number the free nodes in visiting order (deterministic).
  let free = 0;
  let chains = 0;
  forEachChain(a, s, (axis, line, lo, hi) => {
    chains++;
    const r = chainRange(lo, hi, s);
    for (let k = r.k0; k <= r.k1; k++) {
      const c = cellOf(g, axis, line, k);
      if (c >= 0 && cell[c] === -1) cell[c] = free++;
    }
  });
  const count = free + 2 * chains;
  const restX = new Float32Array(count);
  const restY = new Float32Array(count);
  const nbr = new Int32Array(free * 4).fill(-1);
  const major: number[] = [];
  const minor: number[] = [];
  for (let c = 0; c < cell.length; c++) {
    const id = cell[c] ?? -1;
    if (id < 0) continue;
    restX[id] = ((c % g.cols) + g.iMin) * s;
    restY[id] = (Math.floor(c / g.cols) + g.jMin) * s;
  }
  const link = (from: number, to: number): void => {
    if (from >= free) return;
    for (let q = 0; q < 4; q++) {
      const at = from * 4 + q;
      if (nbr[at] === -1) {
        nbr[at] = to;
        return;
      }
    }
  };
  // Pass 2: pinned ends, segments and neighbour links per chain.
  let pinned = free;
  forEachChain(a, s, (axis, line, lo, hi) => {
    const c = line * s;
    const pin = (t: number): number => {
      const id = pinned++;
      restX[id] = axis === 'v' ? c : t;
      restY[id] = axis === 'v' ? t : c;
      return id;
    };
    const out = line % 2 === 0 ? major : minor;
    let prev = pin(lo);
    const r = chainRange(lo, hi, s);
    for (let k = r.k0; k <= r.k1; k++) {
      const cc = cellOf(g, axis, line, k);
      const id = cc >= 0 ? (cell[cc] ?? -1) : -1;
      if (id < 0) continue;
      out.push(prev, id);
      link(prev, id);
      link(id, prev);
      prev = id;
    }
    const end = pin(hi);
    out.push(prev, end);
    link(prev, end);
  });
  return {
    spacing: s,
    count,
    free,
    restX,
    restY,
    nbr,
    major: Uint32Array.from(major),
    minor: Uint32Array.from(minor),
    iMin: g.iMin,
    jMin: g.jMin,
    cols: g.cols,
    rows: g.rows,
    cell,
  };
}
