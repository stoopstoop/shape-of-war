// Pure mapping from fx events and World readings to lattice impulses and forces. No pixi.js.
// Starting values for Fable to tune on device; every number is in arena units and seconds.
import type { FxType } from '../fx';
import { RIPPLE_KILL_BIG, RIPPLE_WELL } from '../fx';
import { HEAT_DEATH, HEAT_KILL, HEAT_KILL_BIG, HEAT_SUPER, type HeatPulse } from './heat';

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
export const KICK_KILL: PointKick = { t: 'point', strength: 440, radius: 100 };
/** Snake head and Spawner kills (the big kill ripple of fx.ts). */
export const KICK_KILL_BIG: PointKick = { t: 'point', strength: 520, radius: 140 };
/** A gravity well bursting. */
export const KICK_WELL: PointKick = { t: 'point', strength: 900, radius: 240 };
/** Large: the ship dies. */
export const KICK_DEATH: PointKick = { t: 'point', strength: 1100, radius: 260 };
/** Large and expanding: a bomb. */
export const KICK_BOMB: RingKick = { t: 'ring', strength: 420, speed: 1100, life: 1.1, width: 70 };
/** Boss death (sim:bossDown): the largest shock, a ring that crosses most of the arena. */
export const KICK_BOSS_DOWN: RingKick = { t: 'ring', strength: 720, speed: 950, life: 1.5, width: 95 };
/** Boss phase change (sim:bossPhase): a short ring from the boss. */
export const KICK_BOSS_PHASE: RingKick = { t: 'ring', strength: 300, speed: 800, life: 0.6, width: 60 };
/** A boss pull hazard dimples the lattice like a well, at half the well's pull. */
export const BOSS_PULL_ACCEL = -1000;
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

// Run 0180 map effects ------------------------------------------------------------------------

/**
 * Pure: the bomb ring for a w x h arena. Same strength, speed and band as KICK_BOMB, but it lives
 * until the front has crossed the whole arena from any point inside it, so every wall feels it.
 */
export function bombKickFor(w: number, h: number): RingKick {
  const reach = Math.hypot(Math.max(0, w), Math.max(0, h)) + KICK_BOMB.width;
  return { ...KICK_BOMB, life: Math.max(KICK_BOMB.life, reach / KICK_BOMB.speed) };
}

/** Sustained super distortion: radius of the throbbing field around the ship, u. */
export const SUPER_FORCE_RADIUS = 240;
/** Peak acceleration of the super field, u/s^2, and its throb rate in Hz. */
export const SUPER_FORCE_ACCEL = 2600;
export const SUPER_FORCE_HZ = 1.6;
/** Seconds between the expanding pulses a running super sends out. */
export const SUPER_PULSE_SEC = 0.45;
/** One super pulse: a small ring kick. */
export const KICK_SUPER_PULSE: RingKick = { t: 'ring', strength: 150, speed: 700, life: 0.4, width: 40 };

/**
 * Pure: super field acceleration at render time t (s). Alternates push and pull so the grid
 * around the ship breathes for as long as the super runs; magnitude never above the peak.
 */
export function superForceAccel(t: number): number {
  if (!Number.isFinite(t)) return 0;
  return SUPER_FORCE_ACCEL * Math.sin(t * SUPER_FORCE_HZ * Math.PI * 2);
}

/** Pure: true when a super pulse is due between render times prev and now (s). */
export function superPulseDue(prev: number, now: number): boolean {
  if (!Number.isFinite(prev) || !Number.isFinite(now) || !(now > prev)) return false;
  return Math.floor(now / SUPER_PULSE_SEC) !== Math.floor(prev / SUPER_PULSE_SEC);
}

/** Pure: the lattice colour pulse for an fx event and its v1 ripple strength, or null for none. */
export function heatPulseFor(type: FxType, ripple: number): HeatPulse | null {
  switch (type) {
    case 'death':
      return HEAT_DEATH;
    case 'super':
      return HEAT_SUPER;
    case 'geom':
    case 'bomb':
      // The bomb pulse is sized to the arena by the caller (heatBombFor).
      return null;
    case 'kill':
      if (ripple >= RIPPLE_KILL_BIG) return HEAT_KILL_BIG;
      return ripple > 0 ? HEAT_KILL : null;
  }
}
