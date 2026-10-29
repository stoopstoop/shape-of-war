// Pure on screen button layout and hit testing (docs/04 section 10). CSS px throughout.
import type { ButtonId, ButtonRects, Insets, Rect } from './types';

export const BOMB_VISUAL = 64;
export const BOMB_HIT = 88;
export const BOMB_BOTTOM_GAP = 16;
export const SUPER_VISUAL = 56;
export const SUPER_HIT = 76;
export const SUPER_GAP = 12;
export const PAUSE_VISUAL = 40;
export const PAUSE_HIT = 56;
export const PAUSE_INSET = 12;

export const ZERO_INSETS: Readonly<Insets> = { top: 0, right: 0, bottom: 0, left: 0 };

function centred(cx: number, cy: number, size: number): Rect {
  return { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
}

export function rectCentre(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Bomb and super stack centre, CSS px left of the right edge of the button area (v2.1 reach). */
export const STACK_RIGHT = 56;

/**
 * Pure: centre x of the bomb and super stack. The stack hugs the bottom right corner, STACK_RIGHT
 * in from the right edge of the button area, but never pokes out of the area on either side (a
 * narrow HUD column clamps it so both hit circles stay inside the column).
 */
export function stackCentreX(cssW: number, insets: Insets): number {
  const right = cssW - insets.right;
  const half = Math.max(BOMB_HIT, SUPER_HIT) / 2;
  const lo = insets.left + half;
  const hi = right - half;
  return Math.max(lo, Math.min(hi, right - STACK_RIGHT));
}

/**
 * Hit rects inside the button area (canvas minus `insets`): bomb in the bottom right corner, super
 * stacked above it, pause top right. The stack sits down and right of the aim rest zone (reach.ts)
 * so the right thumb reaches both with a short roll. Heights are unchanged from v2.0, so the HUD
 * band maths in src/ui/hudFrame.ts gives the same numbers.
 */
export function layoutButtons(cssW: number, cssH: number, insets: Insets): ButtonRects {
  const cx = stackCentreX(cssW, insets);
  const bombCy = cssH - insets.bottom - BOMB_BOTTOM_GAP - BOMB_VISUAL / 2;
  const superCy = bombCy - BOMB_VISUAL / 2 - SUPER_GAP - SUPER_VISUAL / 2;
  const pauseCx = cssW - insets.right - PAUSE_INSET - PAUSE_VISUAL / 2;
  const pauseCy = insets.top + PAUSE_INSET + PAUSE_VISUAL / 2;
  return {
    bomb: centred(cx, bombCy, BOMB_HIT),
    super: centred(cx, superCy, SUPER_HIT),
    pause: centred(pauseCx, pauseCy, PAUSE_HIT),
  };
}

/** Distance to the centre if inside the hit rect, else Infinity. */
function rectDist(r: Rect, x: number, y: number): number {
  if (!inRect(r, x, y)) return Infinity;
  const c = rectCentre(r);
  return Math.hypot(x - c.x, y - c.y);
}

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/**
 * Which button a point hits, or null. Any start inside a hit rect is that button, never a stick
 * (G2.1: the corners count too, so no stick can begin inside a button rect). The bomb and super
 * rects overlap a little, so the nearer centre wins there.
 */
export function hitButton(rects: ButtonRects, x: number, y: number): ButtonId | null {
  if (inRect(rects.pause, x, y)) return 'pause';
  const db = rectDist(rects.bomb, x, y);
  const ds = rectDist(rects.super, x, y);
  if (db === Infinity && ds === Infinity) return null;
  return db <= ds ? 'bomb' : 'super';
}

/** Edge trigger state per button: owning pointer and a press waiting to be taken. */
export interface ButtonLatch {
  id: number;
  pending: boolean;
}

export function createLatch(): ButtonLatch {
  return { id: -1, pending: false };
}

/** Press latches once. A second finger on an already held button is swallowed. */
export function pressLatch(l: ButtonLatch, id: number): void {
  if (l.id !== -1) return;
  l.id = id;
  l.pending = true;
}

/** Returns true if this pointer owned the button. */
export function releaseLatch(l: ButtonLatch, id: number): boolean {
  if (l.id !== id) return false;
  l.id = -1;
  return true;
}

/** True exactly once per press. */
export function takeLatch(l: ButtonLatch): boolean {
  const p = l.pending;
  l.pending = false;
  return p;
}
