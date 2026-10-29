// DOM edge: Pointer Events on the canvas feed the pure model in model.ts (docs/04 section 9).
// Touch only by design: Pointer Events, touch-action none, preventDefault. Nothing else.
import { ZERO_INSETS } from './buttons';
import {
  createMoveDebug,
  formatMoveDebug,
  noteMoveBegin,
  noteMoveSample,
  noteOffCanvasDown,
  PAINT_INTERVAL_MS,
  parseDebugFlag,
  targetLabel,
} from './debug';
import { makeTouchMoveGuard } from './gesture';
import { createInputState, createModel, pointerDown, pointerMove, pointerUp, pollModel, reanchorModel, syncSticks } from './model';
import type { TouchModel } from './model';
import { buttonVisuals, stickVisuals } from './visuals';
import type { ButtonRects, ButtonVisual, InputState, Insets, StickVisuals } from './types';

export interface TouchOptions {
  /** Safe area insets in CSS px, read on attach and on every reanchor. Default all zero. */
  insets?: () => Insets;
  /** Move stick readout (B9). Default: true when the page URL has ?debug=1. */
  debug?: boolean;
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

interface DebugView {
  begin(landX: number, landY: number): void;
  sample(dx: number, dy: number): void;
  paint(cssW: number, cssH: number): void;
  detach(): void;
}

/** DOM edge of the ?debug=1 readout. Observes only: no preventDefault, no routing change. */
function createDebugView(canvas: HTMLCanvasElement, state: InputState): DebugView {
  const doc = canvas.ownerDocument;
  const win = doc.defaultView;
  const d = createMoveDebug();
  const now = (): number => (win !== null ? win.performance.now() : 0);
  const box = doc.createElement('div');
  box.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:40;pointer-events:none;white-space:pre;' +
    'font:11px/1.3 monospace;color:#9ff;background:rgba(0,0,0,0.55);padding:3px 6px;border-radius:4px;';
  doc.body.appendChild(box);
  let lastPaint = Number.NEGATIVE_INFINITY;
  const offCanvas = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch' || e.target === canvas) return;
    const t = e.target;
    const label = t instanceof Element ? targetLabel(t.tagName, t.getAttribute('class') ?? '') : 'unknown';
    noteOffCanvasDown(d, label);
    lastPaint = Number.NEGATIVE_INFINITY;
  };
  // Capture phase on the document so a DOM layer that takes the touch is still counted.
  doc.addEventListener('pointerdown', offCanvas, { capture: true, passive: true });
  return {
    begin: (landX, landY) => noteMoveBegin(d, now(), landX, landY),
    sample: (dx, dy) => noteMoveSample(d, dx, dy, state.move.x, state.move.y, now()),
    paint(cssW, cssH): void {
      const t = now();
      if (t - lastPaint < PAINT_INTERVAL_MS) return;
      lastPaint = t;
      box.textContent = formatMoveDebug(d, win !== null ? win.devicePixelRatio : 1, cssW, cssH);
    },
    detach(): void {
      doc.removeEventListener('pointerdown', offCanvas, { capture: true });
      box.remove();
    },
  };
}

export function attachTouch(canvas: HTMLCanvasElement, opts: TouchOptions = {}): TouchHandle {
  const readInsets = opts.insets ?? ((): Insets => ZERO_INSETS);
  let frame = measure(canvas);
  const model: TouchModel = createModel(frame.w, frame.h, readInsets());
  const state = createInputState();
  const debugOn = opts.debug ?? parseDebugFlag(canvas.ownerDocument.defaultView?.location.search ?? '');
  const dbg: DebugView | null = debugOn ? createDebugView(canvas, state) : null;

  canvas.style.touchAction = 'none';
  canvas.style.userSelect = 'none';

  const down = (e: PointerEvent): void => {
    e.preventDefault();
    const r = pointerDown(model, e.pointerId, e.clientX - frame.left, e.clientY - frame.top);
    if (r !== 'ignored') capture(canvas, e.pointerId);
    syncSticks(model, state);
    if (dbg !== null && r === 'move') dbg.begin(model.move.lx, model.move.ly);
    dbg?.paint(frame.w, frame.h);
  };
  const move = (e: PointerEvent): void => {
    e.preventDefault();
    const x = e.clientX - frame.left;
    const y = e.clientY - frame.top;
    pointerMove(model, e.pointerId, x, y);
    syncSticks(model, state);
    if (dbg !== null && e.pointerId === model.move.id) {
      dbg.sample(x - model.move.ox, y - model.move.oy);
      dbg.paint(frame.w, frame.h);
    }
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
    poll(): InputState {
      dbg?.paint(frame.w, frame.h);
      return pollModel(model, state);
    },
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
      dbg?.detach();
    },
    stickVisuals: () => stickVisuals(model),
    buttonVisuals: () => buttonVisuals(model),
    buttonRects: () => model.buttons,
  };
}
