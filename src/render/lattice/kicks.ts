// Pure mapping from fx events and World readings to lattice impulses and forces. No pixi.js.
// Starting values for Fable to tune on device; every number is in arena units and seconds.
import type { FxType } from '../fx';
import { RIPPLE_KILL_BIG, RIPPLE_WELL } from '../fx';

export interface PointKick {
  readonly t: 'point';
  /** Outward velocity at the centre, u/s. */
  readonly strength: number;
  readonly radius: number;
}

export interface RingKick {
  readonly t: 'ring';
  /** Total outward velocity a crossed node gains, u/s. */
  readonly strength: number;
  readonly speed: number;
  readonly life: number;
  /** Half band width. */
  readonly width: number;
}

export type LatticeKick = PointKick | RingKick;

/** Small: an ordinary kill. */
export const KICK_KILL: PointKick = { t: 'point', strength: 380, radius: 90 };
/** Snake head and Spawner kills (the big kill ripple of fx.ts). */
export const KICK_KILL_BIG: PointKick = { t: 'point', strength: 520, radius: 140 };
/** A gravity well bursting. */
export const KICK_WELL: PointKick = { t: 'point', strength: 900, radius: 240 };
/** Large: the ship dies. */
export const KICK_DEATH: PointKick = { t: 'point', strength: 1100, radius: 260 };
/** Large and expanding: a bomb. */
export const KICK_BOMB: RingKick = { t: 'ring', strength: 420, speed: 1100, life: 1.1, width: 70 };
/** A super activation. */
export const KICK_SUPER: RingKick = { t: 'ring', strength: 260, speed: 900, life: 0.6, width: 55 };

/** Pure: the lattice kick for an fx event and its v1 ripple strength, or null for none. */
export function latticeKickFor(type: FxType, ripple: number): LatticeKick | null {
  switch (type) {
    case 'bomb':
      return KICK_BOMB;
    case 'super':
      return KICK_SUPER;
    case 'death':
      return KICK_DEATH;
    case 'geom':
      return null;
    case 'kill':
      if (ripple >= RIPPLE_WELL) return KICK_WELL;
      if (ripple >= RIPPLE_KILL_BIG) return KICK_KILL_BIG;
      return ripple > 0 ? KICK_KILL : null;
  }
}

/** Wells read from the World each frame, at most this many. */
export const MAX_WELLS = 3;
/** Well pull: radius of influence is base plus a multiple of the well's hitbox radius. */
export const WELL_PULL_BASE = 150;
export const WELL_PULL_PER_R = 4;
/** Peak inward acceleration of a well, u/s^2 (negative pulls in). */
export const WELL_PULL_ACCEL = -2000;

/** Pure: radius of a well's pull on the lattice from its hitbox radius. */
export function wellPullRadius(r: number): number {
  return WELL_PULL_BASE + WELL_PULL_PER_R * Math.max(0, r);
}

/** Ship wake: nothing at or under this speed, u/s. */
export const WAKE_MIN_SPEED = 120;
/** Speed above the minimum at which the wake is full. */
export const WAKE_FULL_SPAN = 480;
export const WAKE_RADIUS = 70;
/** Peak outward acceleration of a full wake, u/s^2. */
export const WAKE_ACCEL = 2500;

/** Pure: wake acceleration for a ship speed: 0 at or under 120 u/s, rising to full. */
export function wakeAccel(speed: number): number {
  if (!(speed > WAKE_MIN_SPEED)) return 0;
  const t = Math.min(1, (speed - WAKE_MIN_SPEED) / WAKE_FULL_SPAN);
  return WAKE_ACCEL * t;
}
