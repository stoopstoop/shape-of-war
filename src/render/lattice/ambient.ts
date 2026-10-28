// Idle ambient drift of the lattice (run 0180 map effects fix). Pure, no pixi.js, no PRNG.
// Two slow travelling waves: every row of nodes slides along x by a sum of two sines of the
// row index and the render clock, and every column slides along y the same way. The offsets are
// computed once per row and once per column per frame (a few hundred sines), then added to each
// free node as it is written, so the field never looks frozen even while the spring sim sleeps.
// Pinned wall ends never move. The drift is cosmetic and never enters the spring sim.
import type { LatticeLayout } from './layout';

/** Peak drift in arena units. A third of a line width at the default fit: felt, not seen. */
export const AMBIENT_AMP = 1.8;
/** Angular rates (rad/s) and wave numbers (rad per lattice line) of the two waves. */
const W1 = 0.55;
const W2 = 0.37;
const K1 = 0.42;
const K2 = 0.23;
/** Share of the amplitude carried by the first wave; the second carries the rest. */
const MIX = 0.6;

export interface Ambient {
  /** Lattice column and row of each free node. */
  readonly colOf: Int32Array;
  readonly rowOf: Int32Array;
  /** x offset per row and y offset per column for the current frame. */
  readonly dx: Float32Array;
  readonly dy: Float32Array;
}

/** Index every free node by its column and row. Allocates; call on lattice build only. */
export function createAmbient(L: LatticeLayout): Ambient {
  const colOf = new Int32Array(L.free);
  const rowOf = new Int32Array(L.free);
  for (let i = 0; i < L.free; i++) {
    const c = Math.round((L.restX[i] ?? 0) / L.spacing) - L.iMin;
    const r = Math.round((L.restY[i] ?? 0) / L.spacing) - L.jMin;
    colOf[i] = c < 0 ? 0 : c >= L.cols ? L.cols - 1 : c;
    rowOf[i] = r < 0 ? 0 : r >= L.rows ? L.rows - 1 : r;
  }
  return { colOf, rowOf, dx: new Float32Array(Math.max(1, L.rows)), dy: new Float32Array(Math.max(1, L.cols)) };
}

/** Pure: drift of one line at index k (rows give x, columns give y) at time t and amplitude amp. */
export function ambientOffset(k: number, t: number, amp: number, axis: 0 | 1): number {
  const ph = axis === 0 ? 0 : 1.7;
  return amp * (MIX * Math.sin(t * W1 + k * K1 + ph) + (1 - MIX) * Math.sin(t * W2 - k * K2 + 2 * ph));
}

/** Compute this frame's row and column offsets. amp 0 gives an exact rest lattice. */
export function stepAmbient(a: Ambient, t: number, amp: number): void {
  const time = Number.isFinite(t) ? t : 0;
  const m = Number.isFinite(amp) ? Math.max(0, amp) : 0;
  for (let r = 0; r < a.dx.length; r++) a.dx[r] = m > 0 ? ambientOffset(r, time, m, 0) : 0;
  for (let c = 0; c < a.dy.length; c++) a.dy[c] = m > 0 ? ambientOffset(c, time, m, 1) : 0;
}
