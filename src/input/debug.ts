// B9 move stick readout behind ?debug=1. Pure accumulator and formatter; touch.ts owns the DOM.
// It answers three device questions: does the thumb reach full deflection (reach versus
// radius), how often pointermove arrives (Hz), and did a touch land on a DOM overlay instead
// of the canvas (off canvas downs).
import { STICK_RADIUS } from './stick';

/** Width of the rolling window for the pointermove rate, ms. */
export const RATE_WINDOW_MS = 500;
/** Minimum interval between DOM text updates, ms. */
export const PAINT_INTERVAL_MS = 100;

export interface MoveDebug {
  /** Finger distance from the move stick centre, CSS px. The centre follows, so this tops out at the radius. */
  reachPx: number;
  /** Largest reach since the move stick began, CSS px. */
  peakPx: number;
  /** Stick output magnitude, 0 to 1. */
  mag: number;
  /** Move stick pointermove rate over the last window, Hz. */
  hz: number;
  windowStartMs: number;
  windowCount: number;
  /** Pointer downs whose target was not the canvas (a DOM layer took them). */
  offCanvasDowns: number;
  /** Class or tag of the element that took the latest off canvas down. */
  lastOffCanvas: string;
  /** Where the move thumb landed, canvas local CSS px. */
  landX: number;
  landY: number;
  /** Anchor clamp offset of each stick (drawn ring centre minus logical centre), CSS px. */
  clampMoveX: number;
  clampMoveY: number;
  clampAimX: number;
  clampAimY: number;
}

export function createMoveDebug(): MoveDebug {
  return {
    reachPx: 0,
    peakPx: 0,
    mag: 0,
    hz: 0,
    windowStartMs: 0,
    windowCount: 0,
    offCanvasDowns: 0,
    lastOffCanvas: '',
    landX: 0,
    landY: 0,
    clampMoveX: 0,
    clampMoveY: 0,
    clampAimX: 0,
    clampAimY: 0,
  };
}

/** Latest anchor clamp offsets of both sticks (zero for a stick that is not held). */
export function noteClamp(d: MoveDebug, moveX: number, moveY: number, aimX: number, aimY: number): void {
  d.clampMoveX = moveX;
  d.clampMoveY = moveY;
  d.clampAimX = aimX;
  d.clampAimY = aimY;
}

/** Pure: true when the page query string carries debug=1. */
export function parseDebugFlag(search: string): boolean {
  return new URLSearchParams(search).get('debug') === '1';
}

/** A move stick began at (landX, landY): reset reach and peak, keep the landing. */
export function noteMoveBegin(d: MoveDebug, nowMs: number, landX = 0, landY = 0): void {
  d.landX = landX;
  d.landY = landY;
  d.reachPx = 0;
  d.peakPx = 0;
  d.mag = 0;
  d.windowStartMs = nowMs;
  d.windowCount = 0;
}

/** One move stick pointermove: finger offset from origin in CSS px and the stick output. */
export function noteMoveSample(d: MoveDebug, dx: number, dy: number, outX: number, outY: number, nowMs: number): void {
  d.reachPx = Math.hypot(dx, dy);
  if (d.reachPx > d.peakPx) d.peakPx = d.reachPx;
  d.mag = Math.hypot(outX, outY);
  d.windowCount++;
  const span = nowMs - d.windowStartMs;
  if (span >= RATE_WINDOW_MS) {
    d.hz = (d.windowCount * 1000) / span;
    d.windowStartMs = nowMs;
    d.windowCount = 0;
  }
}

/** A pointer down landed on some element other than the canvas. */
export function noteOffCanvasDown(d: MoveDebug, label: string): void {
  d.offCanvasDowns++;
  d.lastOffCanvas = label;
}

function f(n: number, digits: number): string {
  return n.toFixed(digits);
}

/** Rounded to whole px, with -0 shown as 0. */
function whole(n: number): string {
  return String(Math.round(n) + 0);
}

/** Pure: the readout text, four lines (move thumb landing third, anchor clamp offsets last). */
export function formatMoveDebug(d: Readonly<MoveDebug>, dpr: number, cssW: number, cssH: number, radius = STICK_RADIUS): string {
  const pct = Math.round((Math.min(d.peakPx, radius) / radius) * 100);
  const line1 = `move ${f(d.mag, 2)}  reach ${f(d.reachPx, 0)}/${radius}px  peak ${pct}%  ${f(d.hz, 0)}Hz`;
  const off = d.offCanvasDowns > 0 ? `  offcanvas ${d.offCanvasDowns} (${d.lastOffCanvas})` : '';
  const line2 = `dpr ${f(dpr, 3)}  css ${f(cssW, 0)}x${f(cssH, 0)}  radius ${f(radius * dpr, 0)} device px${off}`;
  const line3 = `land ${f(d.landX, 0)},${f(d.landY, 0)}`;
  const line4 = `clamp move ${whole(d.clampMoveX)},${whole(d.clampMoveY)}  aim ${whole(d.clampAimX)},${whole(d.clampAimY)}`;
  return `${line1}\n${line2}\n${line3}\n${line4}`;
}

/** Pure: a short label for an event target, for the off canvas line. */
export function targetLabel(tag: string, className: string): string {
  const cls = className.trim().split(/\s+/)[0] ?? '';
  return cls !== '' ? `${tag.toLowerCase()}.${cls}` : tag.toLowerCase();
}
