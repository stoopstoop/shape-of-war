// Pure touch model: pointer down, move, up in canvas local CSS px. No DOM, runs in node.
// The DOM layer (touch.ts) translates PointerEvents into these calls.
import { createLatch, hitButton, layoutButtons, pressLatch, releaseLatch, takeLatch, ZERO_INSETS } from './buttons';
import type { ButtonLatch } from './buttons';
import { beginTrack, createTrack, endTrack, NO_POINTER, updateTrack } from './stick';
import type { Track } from './stick';
import type { ButtonId, ButtonRects, InputState, Insets } from './types';

/** Starts within this many CSS px of the left or right edge are ignored (system back gesture). */
export const EDGE_GUARD = 24;

export interface TouchModel {
  cssW: number;
  cssH: number;
  insets: Insets;
  buttons: ButtonRects;
  move: Track;
  aim: Track;
  latch: Record<ButtonId, ButtonLatch>;
}

/** What a pointer down turned into. */
export type DownResult = 'move' | 'aim' | ButtonId | 'ignored';

export function createModel(cssW: number, cssH: number, insets: Insets = ZERO_INSETS): TouchModel {
  return {
    cssW,
    cssH,
    insets: { ...insets },
    buttons: layoutButtons(cssW, cssH, insets),
    move: createTrack(),
    aim: createTrack(),
    latch: { bomb: createLatch(), super: createLatch(), pause: createLatch() },
  };
}

/** Pure: which half of the canvas a start point belongs to. */
export function halfFor(cssW: number, x: number): 'move' | 'aim' {
  return x < cssW / 2 ? 'move' : 'aim';
}

/** Pure: true if a start point lies in the left or right back gesture strip. */
export function inEdgeGuard(cssW: number, x: number): boolean {
  return x < EDGE_GUARD || x > cssW - EDGE_GUARD;
}

/**
 * Buttons are hit tested first, so a thumb on bomb never makes a stick. Otherwise the
 * first pointer in each half owns that half's stick; later pointers there are ignored.
 */
export function pointerDown(m: TouchModel, id: number, x: number, y: number): DownResult {
  const b = hitButton(m.buttons, x, y);
  if (b !== null) {
    pressLatch(m.latch[b], id);
    return b;
  }
  if (inEdgeGuard(m.cssW, x)) return 'ignored';
  const half = halfFor(m.cssW, x);
  const t = m[half];
  if (t.id !== NO_POINTER) return 'ignored';
  beginTrack(t, id, x, y);
  return half;
}

export function pointerMove(m: TouchModel, id: number, x: number, y: number): void {
  if (id === m.move.id) updateTrack(m.move, x, y, m.cssW, m.cssH);
  else if (id === m.aim.id) updateTrack(m.aim, x, y, m.cssW, m.cssH);
}

/** Frees only whatever this pointer owned. Safe to call twice (up then lostpointercapture). */
export function pointerUp(m: TouchModel, id: number): void {
  if (id === m.move.id) endTrack(m.move);
  if (id === m.aim.id) endTrack(m.aim);
  releaseLatch(m.latch.bomb, id);
  releaseLatch(m.latch.super, id);
  releaseLatch(m.latch.pause, id);
}

function originInside(t: Track, cssW: number, cssH: number): boolean {
  return t.ox >= 0 && t.ox <= cssW && t.oy >= 0 && t.oy <= cssH;
}

/**
 * Fold or unfold: new size and insets, fresh button rects, and any stick whose origin
 * now lies outside the canvas is cancelled. Returns the pointer ids that were cancelled.
 */
export function reanchorModel(m: TouchModel, cssW: number, cssH: number, insets: Insets = m.insets): number[] {
  m.cssW = cssW;
  m.cssH = cssH;
  m.insets = { ...insets };
  m.buttons = layoutButtons(cssW, cssH, insets);
  const cancelled: number[] = [];
  for (const t of [m.move, m.aim]) {
    if (t.id !== NO_POINTER && !originInside(t, cssW, cssH)) {
      cancelled.push(t.id);
      endTrack(t);
    }
  }
  return cancelled;
}

export function createInputState(): InputState {
  return {
    move: { active: false, x: 0, y: 0 },
    aim: { active: false, x: 0, y: 0 },
    bomb: false,
    superPressed: false,
    pause: false,
  };
}

/** Copy live stick values into out (no allocation). */
export function syncSticks(m: TouchModel, out: InputState): InputState {
  out.move.active = m.move.active;
  out.move.x = m.move.x;
  out.move.y = m.move.y;
  out.aim.active = m.aim.active;
  out.aim.x = m.aim.x;
  out.aim.y = m.aim.y;
  return out;
}

/**
 * One sim step's input: live sticks plus edge triggered buttons. Each button press
 * reads true on exactly one poll, then false until the finger lifts and presses again.
 */
export function pollModel(m: TouchModel, out: InputState): InputState {
  syncSticks(m, out);
  out.bomb = takeLatch(m.latch.bomb);
  out.superPressed = takeLatch(m.latch.super);
  out.pause = takeLatch(m.latch.pause);
  return out;
}
