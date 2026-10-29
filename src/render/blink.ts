// Render side blinks driven by sim timers (player guide audit B10 and B11). Pure, no pixi.js.
// The renderer multiplies the entity alpha by these, and the glow sprite (bloom source on the
// bloom path, blurred sprite on the fallback path) takes the same alpha, so bloom follows.
import { GEOM_LIFE } from '../game/geoms';

/** Ship invulnerability blink, full on and off cycles per second (Fable brief v21: about 6 Hz). */
export const INVULN_BLINK_HZ = 6;
/** Alpha of the invulnerability off phase: dim, never invisible, so the thumb never loses the ship. */
export const INVULN_BLINK_LOW = 0.3;

/** Geom expiry blink, full cycles per second (docs/01 section 5: 8 Hz). */
export const GEOM_BLINK_HZ = 8;
/** Geoms blink while they have less than this many seconds of life left (docs/01 section 5). */
export const GEOM_BLINK_SEC = 1;
/** Alpha of the geom off phase. */
export const GEOM_BLINK_LOW = 0.2;

/**
 * Pure: square wave alpha from a countdown in seconds. Each cycle of 1 / hz seconds is half on
 * (alpha 1) and half off (alpha low). The half just before the countdown reaches 0 is on, so a
 * blink always ends on a solid frame and never pops.
 */
export function blinkPhaseAlpha(left: number, hz: number, low: number): number {
  if (!(left > 0) || !(hz > 0)) return 1;
  return Math.floor(left * hz * 2) % 2 === 0 ? 1 : low;
}

/** Pure: ship alpha for ship.invuln seconds left. Solid at 0 or below (and for NaN). */
export function invulnAlpha(invuln: number): number {
  return blinkPhaseAlpha(invuln, INVULN_BLINK_HZ, INVULN_BLINK_LOW);
}

/**
 * Pure: geom alpha from its age in seconds (w.t, counted up by src/game/geoms.ts until
 * GEOM_LIFE). Solid until the last GEOM_BLINK_SEC, then blinks at GEOM_BLINK_HZ.
 */
export function geomAlpha(age: number, life: number = GEOM_LIFE): number {
  if (!Number.isFinite(age)) return 1;
  const left = life - age;
  if (!(left < GEOM_BLINK_SEC)) return 1;
  if (left <= 0) return GEOM_BLINK_LOW;
  return blinkPhaseAlpha(left, GEOM_BLINK_HZ, GEOM_BLINK_LOW);
}
