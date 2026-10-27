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

/** Hit rects: bomb bottom centre, super above bomb, pause top right, inside the safe area. */
export function layoutButtons(cssW: number, cssH: number, insets: Insets): ButtonRects {
  const cx = insets.left + (cssW - insets.left - insets.right) / 2;
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

/** Distance to the centre if inside the inscribed circle, else Infinity. */
function circleDist(r: Rect, x: number, y: number): number {
  const c = rectCentre(r);
  const d = Math.hypot(x - c.x, y - c.y);
  return d <= r.w / 2 ? d : Infinity;
}

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/**
 * Which button a point hits, or null. Bomb and super are circles; their hit
 * circles overlap a little, so the nearer centre wins. Pause is a square.
 */
export function hitButton(rects: ButtonRects, x: number, y: number): ButtonId | null {
  if (inRect(rects.pause, x, y)) return 'pause';
  const db = circleDist(rects.bomb, x, y);
  const ds = circleDist(rects.super, x, y);
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
