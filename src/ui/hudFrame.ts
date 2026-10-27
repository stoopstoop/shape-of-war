// Pure HUD frame (B6). Every HUD element sits outside the arena on both screens: the HUD owns
// fixed columns or bands at the screen edges (plus safe area insets), the arena play rect is
// what is left, and the arena is fitted inside that play rect exactly as the renderer does it.
// When a letterbox band is thinner than the HUD needs, the play rect shrinks instead.
// Cover (21:9): left column for score, multiplier, objective and par; right column for pause,
// lives, bombs, super ring with its label, and the bomb button.
// Main (10:9): top band for the text rows, then either a right column or a bottom band for the
// bomb and super buttons, whichever leaves the larger arena.
import { layoutButtons } from '../input/buttons';
import type { ButtonRects, Insets, Rect } from '../input/types';
import { fitArena, type Fit } from '../render/layout';

export type AspectClass = 'cover' | 'main';

/** Pure: cover when width / height is 1.8 or more (docs/01 section 9). */
export function aspectClass(cssW: number, cssH: number): AspectClass {
  return cssW / Math.max(1, cssH) >= 1.8 ? 'cover' : 'main';
}

export type Arrangement = 'sides' | 'topRight' | 'topBottom';

export type TextAlign = 'left' | 'center' | 'right';

/** A text or bar box in CSS px. The DOM clips to it, so the box is the element's footprint. */
export interface HudBox extends Rect {
  size: number;
  align: TextAlign;
  /** True when the text may wrap onto a second line inside the box. */
  wrap: boolean;
}

export type BoxId = 'score' | 'mult' | 'bar' | 'objLabel' | 'par' | 'lives' | 'bombs' | 'superLabel' | 'superHint';

export type HudBoxes = Record<BoxId, HudBox>;

export interface HudFrame {
  cls: AspectClass;
  arrangement: Arrangement;
  cssW: number;
  cssH: number;
  insets: Insets;
  /** Hand to renderer.setPlayRect. HUD columns and bands are outside it. */
  playRect: Rect;
  /** The renderer's fit for this play rect (same function, same margin). */
  fit: Fit;
  /** Arena bounding box on screen. */
  arena: Rect;
  /** Insets to hand to touch.reanchor so Thumbs lays the bomb and super buttons in the HUD area. */
  buttonInsets: Insets;
  /** Button hit rects that Thumbs computes from buttonInsets. */
  buttons: ButtonRects;
  /** Visual diameters of the bomb and super rings and the pause icon size. */
  bombD: number;
  superD: number;
  pauseIcon: number;
  boxes: HudBoxes;
  /** Where overlays (pause, results, intro card) may put content: clear of every HUD element. */
  content: Rect;
}

type Partial0 = Omit<HudFrame, 'fit' | 'arena' | 'content'>;

/** Cover column widths in CSS px. */
export const COVER_LEFT = 160;
export const COVER_RIGHT = 112;
/** Main top band height, and the button column width or button band height. */
export const MAIN_TOP = 76;
export const MAIN_RIGHT = 124;
export const MAIN_BOTTOM = 160;

function box(x: number, y: number, w: number, h: number, size: number, align: TextAlign = 'left', wrap = false): HudBox {
  return { x, y, w: Math.max(0, w), h, size, align, wrap };
}

function clampRect(r: Rect): Rect {
  return { x: r.x, y: r.y, w: Math.max(1, r.w), h: Math.max(1, r.h) };
}

/** Pure: on screen bounding box of an arena fitted with `fit`. */
export function arenaRect(fit: Fit, arenaW: number, arenaH: number): Rect {
  const w = arenaW * fit.scale;
  const h = arenaH * fit.scale;
  return { x: fit.x - w / 2, y: fit.y - h / 2, w, h };
}

/** Pure: true when two rects share interior area (touching edges is fine). */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

interface Base {
  W: number;
  H: number;
  ins: Insets;
}

/** Super label and hint stacked just above the super hit circle. */
function superBoxes(buttons: ButtonRects, x: number, w: number, labelSize: number, hintSize: number): Pick<HudBoxes, 'superLabel' | 'superHint'> {
  const hintH = hintSize + 4;
  const labelH = labelSize + 4;
  const hintY = buttons.super.y - 2 - hintH;
  return {
    superLabel: box(x, hintY - labelH, w, labelH, labelSize, 'center'),
    superHint: box(x, hintY, w, hintH, hintSize, 'center'),
  };
}

function sides(b: Base): Partial0 {
  const { W, H, ins } = b;
  const playRect = clampRect({
    x: ins.left + COVER_LEFT,
    y: ins.top,
    w: W - ins.left - ins.right - COVER_LEFT - COVER_RIGHT,
    h: H - ins.top - ins.bottom,
  });
  const buttonInsets: Insets = { ...ins, left: W - ins.right - COVER_RIGHT };
  const buttons = layoutButtons(W, H, buttonInsets);
  const lx = ins.left + 16;
  const lw = COVER_LEFT - 24;
  const rx = W - ins.right - COVER_RIGHT + 8;
  const rw = COVER_RIGHT - 20;
  const t = ins.top;
  const below = buttons.pause.y + buttons.pause.h;
  return {
    cls: 'cover',
    arrangement: 'sides',
    cssW: W,
    cssH: H,
    insets: ins,
    playRect,
    buttonInsets,
    buttons,
    bombD: 64,
    superD: 56,
    pauseIcon: 20,
    boxes: {
      score: box(lx, t + 8, lw, 24, 20),
      mult: box(lx, t + 32, lw, 18, 14),
      bar: box(lx, t + 58, lw, 12, 11),
      objLabel: box(lx, t + 72, lw, 30, 11, 'left', true),
      par: box(lx, t + 106, lw, 28, 11, 'left', true),
      lives: box(rx, below + 4, rw, 16, 12, 'right'),
      bombs: box(rx, below + 22, rw, 14, 10, 'right'),
      ...superBoxes(buttons, rx - 4, rw + 8, 11, 9),
    },
  };
}

/** Main screen top band rows (docs/01 table 9.2), shared by both main arrangements. */
function topRows(b: Base): Omit<HudBoxes, 'superLabel' | 'superHint'> {
  const { W, ins } = b;
  const t = ins.top;
  const innerW = W - ins.left - ins.right;
  const cx = ins.left + innerW / 2;
  const objW = Math.max(120, Math.min(320, innerW - 2 * 200));
  const sideW = Math.max(60, Math.min(200, (innerW - objW) / 2 - 32));
  const livesRight = W - ins.right - 80;
  return {
    score: box(ins.left + 24, t + 8, sideW, 34, 28),
    mult: box(ins.left + 24, t + 44, sideW, 24, 18),
    bar: box(cx - objW / 2, t + 12, objW, 20, 14),
    objLabel: box(cx - objW / 2, t + 12, objW, 20, 14, 'center'),
    par: box(cx - objW / 2, t + 38, objW, 20, 14, 'center'),
    lives: box(livesRight - sideW, t + 12, sideW, 20, 16, 'right'),
    bombs: box(livesRight - sideW, t + 36, sideW, 18, 14, 'right'),
  };
}

function mainBase(b: Base, arrangement: Arrangement, playRect: Rect, buttonInsets: Insets): Partial0 {
  return {
    cls: 'main',
    arrangement,
    cssW: b.W,
    cssH: b.H,
    insets: b.ins,
    playRect: clampRect(playRect),
    buttonInsets,
    buttons: layoutButtons(b.W, b.H, buttonInsets),
    bombD: 72,
    superD: 64,
    pauseIcon: 24,
    boxes: { ...topRows(b), superLabel: box(0, 0, 0, 0, 13), superHint: box(0, 0, 0, 0, 11) },
  };
}

function topRight(b: Base): Partial0 {
  const { W, H, ins } = b;
  const f = mainBase(
    b,
    'topRight',
    { x: ins.left, y: ins.top + MAIN_TOP, w: W - ins.left - ins.right - MAIN_RIGHT, h: H - ins.top - ins.bottom - MAIN_TOP },
    { ...ins, left: W - ins.right - MAIN_RIGHT },
  );
  const x = W - ins.right - MAIN_RIGHT + 4;
  return { ...f, boxes: { ...f.boxes, ...superBoxes(f.buttons, x, MAIN_RIGHT - 8, 13, 11) } };
}

function topBottom(b: Base): Partial0 {
  const { W, H, ins } = b;
  const f = mainBase(
    b,
    'topBottom',
    { x: ins.left, y: ins.top + MAIN_TOP, w: W - ins.left - ins.right, h: H - ins.top - ins.bottom - MAIN_TOP - MAIN_BOTTOM },
    ins,
  );
  // Label to the left of the super ring, right aligned, vertically centred on it.
  const s = f.buttons.super;
  const w = 180;
  const x = s.x - 8 - w;
  const cy = s.y + s.h / 2;
  return {
    ...f,
    boxes: { ...f.boxes, superLabel: box(x, cy - 17, w, 17, 13, 'right'), superHint: box(x, cy + 1, w, 15, 11, 'right') },
  };
}

function finish(f: Partial0, arenaW: number, arenaH: number): HudFrame {
  const fit = fitArena(arenaW, arenaH, f.playRect);
  return { ...f, fit, arena: arenaRect(fit, arenaW, arenaH), content: f.playRect };
}

/**
 * Pure: the HUD frame for a viewport, its safe area insets and the current arena size.
 * Cover always uses side columns. Main picks the arrangement with the larger arena scale; a tie
 * keeps the right column.
 */
export function hudFrame(cssW: number, cssH: number, insets: Insets, arenaW: number, arenaH: number): HudFrame {
  const b: Base = { W: Math.max(1, cssW), H: Math.max(1, cssH), ins: insets };
  if (aspectClass(cssW, cssH) === 'cover') return finish(sides(b), arenaW, arenaH);
  const a = finish(topRight(b), arenaW, arenaH);
  const c = finish(topBottom(b), arenaW, arenaH);
  return c.fit.scale > a.fit.scale + 1e-9 ? c : a;
}

/** Pure: every rect the HUD draws or listens on, for overlap checks. */
export function hudRects(f: HudFrame): Rect[] {
  return [...Object.values(f.boxes), f.buttons.bomb, f.buttons.super, f.buttons.pause];
}

/** Pure: CSS padding that keeps an overlay's content inside `f.content`. */
export function overlayPadding(f: HudFrame): Insets {
  const c = f.content;
  return {
    top: Math.max(0, c.y),
    left: Math.max(0, c.x),
    right: Math.max(0, f.cssW - c.x - c.w),
    bottom: Math.max(0, f.cssH - c.y - c.h),
  };
}
