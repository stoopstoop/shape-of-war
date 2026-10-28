// Pure HUD frame (B6). Every HUD element sits outside the arena on both screens: the HUD owns
// fixed columns or bands at the screen edges (plus safe area insets), the arena play rect is
// what is left, and the arena is fitted inside that play rect exactly as the renderer does it.
// When a letterbox band is thinner than the HUD needs, the play rect shrinks instead.
// Cover (21:9): left column for score, multiplier, the weapon indicator (V2-B, right of the
// multiplier), objective and par; right column for pause, lives, bombs, super ring with its label,
// and the bomb button.
// Main (10:9): top band for the text rows (the weapon indicator sits right of the multiplier in
// the same rows, so the band height is unchanged), then either a right column or a bottom band
// for the bomb and super buttons, whichever leaves the larger arena.
// B9: the main screen bands are measured from the real HUD elements (text row heights, and the
// button hit rects that Thumbs lays out) instead of fixed generous bands, so the main screen
// arena is as large as the HUD allows. The arena on main is usually width limited, so the right
// column costs arena scale directly while the top band is often free.
import { BOMB_HIT, layoutButtons, PAUSE_HIT, SUPER_HIT } from '../input/buttons';
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

export type BoxId =
  | 'score'
  | 'mult'
  | 'weapon'
  | 'weaponBar'
  | 'bar'
  | 'objLabel'
  | 'par'
  | 'lives'
  | 'bombs'
  | 'superLabel'
  | 'superHint';

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
/** Main top band text rows: score 28 px on a 32 px line at 6, multiplier 18 px on 22 at 38. */
export const MAIN_ROWS = 60;
/** Gap each side of the widest button hit rect in the main right column. */
export const MAIN_COLUMN_PAD = 2;
/** Main right column width: the widest button hit rect plus a small gap each side. */
export const MAIN_RIGHT = Math.max(BOMB_HIT, SUPER_HIT, PAUSE_HIT) + 2 * MAIN_COLUMN_PAD;
/**
 * Multiplier box widths. The multiplier tops out at 999 ("x999"), so the box is only as wide as
 * that text needs and the weapon indicator (V2-B) takes the row to its right.
 */
export const COVER_MULT_W = 52;
export const MAIN_MULT_W = 64;
/** Gap between the multiplier box and the weapon indicator box. */
export const WEAPON_GAP = 8;
/** Height of the weapon countdown bar, border included (the element is border-box). */
export const WEAPON_BAR_H = 5;

/** Pure: main top band height below the top inset: text rows or the pause hit rect, whichever is lower. */
export function mainTop(buttons: ButtonRects, ins: Insets): number {
  return Math.max(MAIN_ROWS, buttons.pause.y + buttons.pause.h - ins.top);
}

/** Pure: main bottom band height above the bottom inset: up to the top of the bomb and super hit rects. */
export function mainBottom(buttons: ButtonRects, H: number, ins: Insets): number {
  return Math.max(0, H - ins.bottom - Math.min(buttons.bomb.y, buttons.super.y));
}

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

/** Height of a text box with `lines` lines: one line uses size + 4, wrapped lines size + 3 each (hud.ts setBox). */
function textH(size: number, lines: number): number {
  return lines <= 1 ? size + 4 : lines * (size + 3) + 2;
}

/**
 * Super label and hint stacked just above the super hit circle. `lines` greater than 1 lets both
 * wrap (a narrow column: "SUPER:" over "DETONATE").
 */
function superBoxes(
  buttons: ButtonRects,
  x: number,
  w: number,
  labelSize: number,
  hintSize: number,
  lines = 1,
): Pick<HudBoxes, 'superLabel' | 'superHint'> {
  const wrap = lines > 1;
  const hintH = textH(hintSize, lines);
  const labelH = textH(labelSize, lines);
  const hintY = buttons.super.y - 2 - hintH;
  return {
    superLabel: box(x, hintY - labelH, w, labelH, labelSize, 'center', wrap),
    superHint: box(x, hintY, w, hintH, hintSize, 'center', wrap),
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
      mult: box(lx, t + 32, COVER_MULT_W, 18, 14),
      // Label on top, countdown bar under it, both between the multiplier and the column edge and
      // above the objective bar at t + 58.
      weapon: box(lx + COVER_MULT_W + WEAPON_GAP, t + 32, lw - COVER_MULT_W - WEAPON_GAP, 13, 10),
      weaponBar: box(lx + COVER_MULT_W + WEAPON_GAP, t + 47, lw - COVER_MULT_W - WEAPON_GAP, WEAPON_BAR_H, 0),
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
  // Rows measured to end at MAIN_ROWS: the score line is the tallest pair (32 + 22 from 6). The
  // weapon indicator sits right of the multiplier: label at t + 38, bar ending at t + 58.
  const mx = ins.left + 24;
  const multW = Math.min(sideW, MAIN_MULT_W);
  const wx = mx + multW + WEAPON_GAP;
  const ww = sideW - multW - WEAPON_GAP;
  return {
    score: box(mx, t + 6, sideW, 32, 28),
    mult: box(mx, t + 38, multW, MAIN_ROWS - 38, 18),
    weapon: box(wx, t + 38, ww, 14, 12),
    weaponBar: box(wx, t + 54, ww, WEAPON_BAR_H, 0),
    bar: box(cx - objW / 2, t + 8, objW, 20, 14),
    objLabel: box(cx - objW / 2, t + 8, objW, 20, 14, 'center'),
    par: box(cx - objW / 2, t + 32, objW, 20, 14, 'center'),
    lives: box(livesRight - sideW, t + 8, sideW, 20, 16, 'right'),
    bombs: box(livesRight - sideW, t + 32, sideW, 18, 14, 'right'),
  };
}

/** Main frame from the button insets: the play rect is whatever the measured bands leave. */
function mainBase(b: Base, arrangement: Arrangement, buttonInsets: Insets, playOf: (buttons: ButtonRects) => Rect): Partial0 {
  const buttons = layoutButtons(b.W, b.H, buttonInsets);
  return {
    cls: 'main',
    arrangement,
    cssW: b.W,
    cssH: b.H,
    insets: b.ins,
    playRect: clampRect(playOf(buttons)),
    buttonInsets,
    buttons,
    bombD: 72,
    superD: 64,
    pauseIcon: 24,
    boxes: { ...topRows(b), superLabel: box(0, 0, 0, 0, 13), superHint: box(0, 0, 0, 0, 11) },
  };
}

function topRight(b: Base): Partial0 {
  const { W, H, ins } = b;
  const f = mainBase(b, 'topRight', { ...ins, left: W - ins.right - MAIN_RIGHT }, (buttons) => {
    const top = mainTop(buttons, ins);
    return { x: ins.left, y: ins.top + top, w: W - ins.left - ins.right - MAIN_RIGHT, h: H - ins.top - ins.bottom - top };
  });
  // The column is only a little wider than the bomb, so the label and hint wrap onto two lines.
  const x = W - ins.right - MAIN_RIGHT + MAIN_COLUMN_PAD;
  return { ...f, boxes: { ...f.boxes, ...superBoxes(f.buttons, x, MAIN_RIGHT - 2 * MAIN_COLUMN_PAD, 12, 10, 2) } };
}

function topBottom(b: Base): Partial0 {
  const { W, H, ins } = b;
  const f = mainBase(b, 'topBottom', ins, (buttons) => {
    const top = mainTop(buttons, ins);
    const bottom = mainBottom(buttons, H, ins);
    return { x: ins.left, y: ins.top + top, w: W - ins.left - ins.right, h: H - ins.top - ins.bottom - top - bottom };
  });
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
