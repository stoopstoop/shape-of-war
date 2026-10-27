// v2 hook (docs/09-v2-roadmap.md sections 2.6 and 5). v1 ships the flat surface only and nothing in
// v1 consumes it beyond one unit test. v2 widens SurfaceKind and adds frame() and makeSurface().
// Pure: no PRNG, no DOM.

/** v1 has a single kind. v2 adds 'cylinder' | 'torus' | 'sphere' | 'capsule' | 'twistedBand'. */
export type SurfaceKind = 'flat';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Topology {
  wrapU: boolean;
  wrapV: boolean;
  /** twistedBand with odd halfTwists: crossing the u seam maps v to -v. Always false in v1. */
  flipVOnWrapU: boolean;
}

export interface Surface {
  readonly kind: SurfaceKind;
  readonly topology: Topology;
  /** u extent in arena units. */
  readonly width: number;
  /** v extent in arena units. */
  readonly height: number;
  /** Shortest b minus a in parameter space. Writes into out, returns out. */
  delta(ax: number, ay: number, bx: number, by: number, out: { x: number; y: number }): { x: number; y: number };
  /** Canonicalise a position. Returns true if a Mobius flip occurred (caller mirrors v velocity). */
  wrap(pos: { x: number; y: number }): boolean;
  /** Render and camera only. */
  toXYZ(u: number, v: number, out: Vec3): Vec3;
}

const FLAT_TOPOLOGY: Readonly<Topology> = Object.freeze({ wrapU: false, wrapV: false, flipVOnWrapU: false });

/** The v1 surface: plain Euclidean plane. delta is b minus a, wrap never moves anything, z is 0. */
export function flatSurface(width: number, height: number): Surface {
  return Object.freeze({
    kind: 'flat',
    topology: FLAT_TOPOLOGY,
    width,
    height,
    delta(ax: number, ay: number, bx: number, by: number, out: { x: number; y: number }): { x: number; y: number } {
      out.x = bx - ax;
      out.y = by - ay;
      return out;
    },
    wrap(): boolean {
      return false;
    },
    toXYZ(u: number, v: number, out: Vec3): Vec3 {
      out.x = u;
      out.y = v;
      out.z = 0;
      return out;
    },
  });
}
