// Pure ring clearance (G2.1 ring overlap). CSS px throughout.
// A floating stick anchors where the thumb lands, and stick follow drags its centre further. On the
// device the thumb does not always land in the aim rest zone, so the ring at full deflection could
// sit over a button. The drawn ring (and the knob inside it) is therefore pushed clear of every
// button hit rect. Only the drawing moves: stick output is still measured from the logical centre
// in finger space, so the landing point gives zero output and dead zone and follow are unchanged.
import { distToRect } from './reach';
import { STICK_RADIUS } from './stick';
import type { ButtonRects, Rect } from './types';

/** Ring clearance radius: the ring at full deflection, CSS px. */
export const RING_CLEAR = STICK_RADIUS;
/** Extra push past the exact boundary so float rounding never leaves a hair of overlap, CSS px. */
export const PUSH_EPS = 0.01;
/** Directions tried when no single button push gives a clear spot (a corridor between buttons). */
export const RAY_COUNT = 64;
const BISECT_STEPS = 32;

export interface Point {
  x: number;
  y: number;
}

/** Pure: true when a ring of radius r at (x, y) covers no rect. */
export function ringClear(rects: readonly Rect[], x: number, y: number, r = RING_CLEAR): boolean {
  for (const q of rects) if (distToRect(q, x, y) < r) return false;
  return true;
}

/** Pure: the button hit rects in a fixed order. */
export function buttonList(b: ButtonRects): Rect[] {
  return [b.bomb, b.super, b.pause];
}

function inCanvas(x: number, y: number, w: number, h: number): boolean {
  return x >= 0 && x <= w && y >= 0 && y <= h;
}

/**
 * Pure: points that move (x, y) just clear of one rect: straight out along each axis, and for a
 * point outside the rect, radially away from its nearest point (the push by the overlap amount).
 */
export function pushesFrom(q: Rect, x: number, y: number, r = RING_CLEAR): Point[] {
  const d = r + PUSH_EPS;
  const out: Point[] = [
    { x: q.x - d, y },
    { x: q.x + q.w + d, y },
    { x, y: q.y - d },
    { x, y: q.y + q.h + d },
  ];
  const nx = Math.max(q.x, Math.min(x, q.x + q.w));
  const ny = Math.max(q.y, Math.min(y, q.y + q.h));
  const g = Math.hypot(x - nx, y - ny);
  if (g > 0) out.push({ x: nx + ((x - nx) / g) * d, y: ny + ((y - ny) / g) * d });
  return out;
}

/** First distance along the ray from (x, y) in direction (ux, uy) where the ring is clear. */
export function rayExit(rects: readonly Rect[], x: number, y: number, ux: number, uy: number, r = RING_CLEAR): number {
  let t = 0;
  for (let pass = 0; pass <= rects.length; pass++) {
    const px = x + ux * t;
    const py = y + uy * t;
    let hit: Rect | null = null;
    for (const q of rects) {
      if (distToRect(q, px, py) < r) {
        hit = q;
        break;
      }
    }
    if (hit === null) return t;
    // Distance to a rect is convex along a line, so the exit from this rect is a single root.
    const q = hit;
    let lo = t;
    let hi = t + Math.hypot(q.w + 2 * r, q.h + 2 * r) + 1;
    for (let i = 0; i < BISECT_STEPS; i++) {
      const mid = (lo + hi) / 2;
      if (distToRect(q, x + ux * mid, y + uy * mid) < r) lo = mid;
      else hi = mid;
    }
    t = hi + PUSH_EPS;
  }
  return t;
}

function nearest(cands: readonly Point[], x: number, y: number): Point | null {
  let best: Point | null = null;
  let bd = Number.POSITIVE_INFINITY;
  for (const c of cands) {
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/**
 * Pure: the nearest spot to (x, y) where a ring of radius r covers no rect, preferring spots on the
 * canvas (0 to w, 0 to h). A spot that is already clear is returned as is. Otherwise each rect that
 * the ring covers proposes its pushes; if none of those is clear of every rect (the ring sits in a
 * corridor between two buttons), RAY_COUNT rays from the spot find the first clear point on each.
 */
export function clearCentre(
  rects: readonly Rect[],
  x: number,
  y: number,
  w = Number.POSITIVE_INFINITY,
  h = Number.POSITIVE_INFINITY,
  r = RING_CLEAR,
): Point {
  if (ringClear(rects, x, y, r)) return { x, y };
  const valid: Point[] = [];
  for (const q of rects) {
    if (distToRect(q, x, y) >= r) continue;
    for (const c of pushesFrom(q, x, y, r)) if (ringClear(rects, c.x, c.y, r)) valid.push(c);
  }
  const onCanvas = valid.filter((c) => inCanvas(c.x, c.y, w, h));
  const quick = nearest(onCanvas, x, y);
  if (quick !== null) return quick;
  for (let i = 0; i < RAY_COUNT; i++) {
    const a = (i / RAY_COUNT) * Math.PI * 2;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const t = rayExit(rects, x, y, ux, uy, r);
    const c = { x: x + ux * t, y: y + uy * t };
    if (ringClear(rects, c.x, c.y, r)) valid.push(c);
  }
  const best = nearest(valid.filter((c) => inCanvas(c.x, c.y, w, h)), x, y) ?? nearest(valid, x, y);
  return best ?? { x, y };
}
