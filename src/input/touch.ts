// DOM edge: Pointer Events on the canvas feed the pure model in model.ts (docs/04 section 9).
// Touch only by design: Pointer Events, touch-action none, preventDefault. Nothing else.
import { ZERO_INSETS } from './buttons';
import { makeTouchMoveGuard } from './gesture';
import { createInputState, createModel, pointerDown, pointerMove, pointerUp, pollModel, reanchorModel, syncSticks } from './model';
import type { TouchModel } from './model';
import { buttonVisuals, stickVisuals } from './visuals';
import type { ButtonRects, ButtonVisual, InputState, Insets, StickVisuals } from './types';

export interface TouchOptions {
  /** Safe area insets in CSS px, read on attach and on every reanchor. Default all zero. */
  insets?: () => Insets;
}

export interface TouchHandle {
  /** Sticks are live. Button flags hold the result of the latest poll(). */
  state: InputState;
  /** Call once per sim step. Updates and returns state; each button press is true on one poll only. */
  poll(): InputState;
  /** Call on resize or fold. Re-measures, re-lays buttons, cancels sticks whose origin left the canvas. */
  reanchor(insets?: Insets): void;
  detach(): void;
  /** Pure draw data for Glow, canvas local CSS px. */
  stickVisuals(): StickVisuals;
  buttonVisuals(): ButtonVisual[];
  /** Current button hit rects, canvas local CSS px. */
  buttonRects(): ButtonRects;
}

interface Frame {
  left: number;
  top: number;
  w: number;
  h: number;
}

function measure(canvas: HTMLCanvasElement): Frame {
  const r = canvas.getBoundingClientRect();
  return {
    left: r.left,
    top: r.top,
    w: r.width || canvas.clientWidth,
    h: r.height || canvas.clientHeight,
  };
}

function capture(canvas: HTMLCanvasElement, id: number): void {
  try {
    canvas.setPointerCapture(id);
  } catch {
    // Pointer already gone; the up or cancel event will clean up.
  }
}

function release(canvas: HTMLCanvasElement, id: number): void {
  try {
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  } catch {
    // Nothing to release.
  }
}

export function attachTouch(canvas: HTMLCanvasElement, opts: TouchOptions = {}): TouchHandle {
  const readInsets = opts.insets ?? ((): Insets => ZERO_INSETS);
  let frame = measure(canvas);
  const model: TouchModel = createModel(frame.w, frame.h, readInsets());
  const state = createInputState();

  canvas.style.touchAction = 'none';
  canvas.style.userSelect = 'none';

  const down = (e: PointerEvent): void => {
    e.preventDefault();
    const r = pointerDown(model, e.pointerId, e.clientX - frame.left, e.clientY - frame.top);
    if (r !== 'ignored') capture(canvas, e.pointerId);
    syncSticks(model, state);
  };
  const move = (e: PointerEvent): void => {
    e.preventDefault();
    pointerMove(model, e.pointerId, e.clientX - frame.left, e.clientY - frame.top);
    syncSticks(model, state);
  };
  const up = (e: PointerEvent): void => {
    e.preventDefault();
    pointerUp(model, e.pointerId);
    syncSticks(model, state);
  };
  const lost = (e: PointerEvent): void => {
    pointerUp(model, e.pointerId);
    syncSticks(model, state);
  };
  // Only touches that began on the canvas are blocked; UI overlay touches stay native.
  const touchBlock: (e: TouchEvent) => void = makeTouchMoveGuard(canvas);

  const active = { passive: false } as const;
  canvas.addEventListener('pointerdown', down, active);
  canvas.addEventListener('pointermove', move, active);
  canvas.addEventListener('pointerup', up, active);
  canvas.addEventListener('pointercancel', up, active);
  canvas.addEventListener('lostpointercapture', lost);
  // One non passive touchmove on the document (docs/04 section 11), scoped to canvas touches.
  const doc = canvas.ownerDocument;
  doc.addEventListener('touchmove', touchBlock, active);

  return {
    state,
    poll: () => pollModel(model, state),
    reanchor(insets?: Insets): void {
      frame = measure(canvas);
      const cancelled = reanchorModel(model, frame.w, frame.h, insets ?? readInsets());
      for (const id of cancelled) release(canvas, id);
      syncSticks(model, state);
    },
    detach(): void {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('lostpointercapture', lost);
      doc.removeEventListener('touchmove', touchBlock);
    },
    stickVisuals: () => stickVisuals(model),
    buttonVisuals: () => buttonVisuals(model),
    buttonRects: () => model.buttons,
  };
}
