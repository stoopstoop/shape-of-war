// Pure right thumb reach model (v2.1 button reach). CSS px throughout.
// Floating sticks anchor where the thumb lands, so there is no fixed stick position. The aim rest
// zone is the region where a right thumb typically lands for the aim stick: up and left of the
// bomb and super buttons, inside the right half of the arena. It is measured from the safe area
// right and bottom edges because a thumb rests a physical distance in from the edge the hand holds,
// not a fraction of the screen. On the Fold 7 (about 63 CSS px per cm on the cover, 55 on the main
// screen) the zone corner sits about 3.4 to 3.9 cm in from the right edge and 1.9 to 2.2 cm up.
import { STICK_RADIUS } from './stick';
import type { Insets, Rect } from './types';

/** Zone bottom right corner, CSS px left of the safe area right edge. */
export const REST_RIGHT = 216;
/** Zone bottom right corner, CSS px above the safe area bottom edge (level with the super centre). */
export const REST_BOTTOM = 120;
/** Zone size, extending up and left of its corner. */
export const REST_W = 160;
export const REST_H = 160;

/** Target thumb roll from the rest zone to the near edge of a button hit circle. */
export const REACH_MIN = 110;
export const REACH_MAX = 140;

/** Pure: the aim stick rest zone for a viewport and its safe area insets. */
export function aimRestZone(cssW: number, cssH: number, insets: Insets): Rect {
  const cx = cssW - insets.right - REST_RIGHT;
  const cy = cssH - insets.bottom - REST_BOTTOM;
  const top = Math.max(insets.top, cy - REST_H);
  return { x: cx - REST_W, y: top, w: REST_W, h: Math.max(0, cy - top) };
}

/** Pure: shortest distance from a point to a rect (0 inside). */
export function distToRect(r: Rect, x: number, y: number): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/**
 * Pure: thumb roll from the nearest point of the zone to the near edge of a circular hit area
 * (the inscribed circle of `hit`). Negative means the zone reaches into the button.
 */
export function reachGap(zone: Rect, hit: Rect): number {
  return distToRect(zone, hit.x + hit.w / 2, hit.y + hit.h / 2) - hit.w / 2;
}

/**
 * Pure: clearance between the aim ring at full deflection (STICK_RADIUS) from the worst anchor in
 * the zone and a circular hit area. Zero or more means no anchor in the zone puts the ring over it.
 */
export function ringClearance(zone: Rect, hit: Rect, radius = STICK_RADIUS): number {
  return reachGap(zone, hit) - radius;
}
