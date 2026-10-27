// Pure grid ripple: a radial wave front that pushes grid points outward as it passes.
// The renderer redraws the grid from rippledGridPaths only while a ripple is live, so the
// static grid costs nothing between explosions.
import type { ArenaDef } from '../levelgen/leveldef';
import { gridSegments } from './gridGeom';

export const RIPPLE_SPEED = 900; // arena units per second
export const RIPPLE_LIFE = 1.1; // seconds
export const RIPPLE_WIDTH = 140; // half width of the wave band, arena units
export const MAX_RIPPLES = 8;
/** Grid lines are split into pieces of this length so they can bend. */
export const RIPPLE_STEP = 25;

export interface Ripple {
  x: number;
  y: number;
  age: number;
  strength: number;
}

export interface Vec {
  x: number;
  y: number;
}

/** Pure: strength left in a ripple after fading, used to pick which one to evict. */
function remaining(r: Ripple): number {
  const f = 1 - r.age / RIPPLE_LIFE;
  return r.strength * f * f;
}

/**
 * Add a ripple. When the list is full the weakest remaining ripple goes, so a stream of small
 * kill ripples never cancels a bomb wave. A new ripple weaker than all of them is dropped.
 */
export function addRipple(list: Ripple[], x: number, y: number, strength: number): void {
  if (!(strength > 0)) return;
  if (list.length >= MAX_RIPPLES) {
    let weakest = 0;
    for (let i = 1; i < list.length; i++) {
      const a = list[i];
      const b = list[weakest];
      if (a && b && remaining(a) < remaining(b)) weakest = i;
    }
    const w = list[weakest];
    if (w && remaining(w) > strength) return;
    list.splice(weakest, 1);
  }
  list.push({ x, y, age: 0, strength });
}

/** Structural pen: pixi Graphics satisfies it. */
export interface Pen {
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
}

const penScratch: Vec = { x: 0, y: 0 };

/**
 * Trace the grid segments bent by the ripples straight into a pen, with no allocation. segs is
 * gridSegments output, cached by the caller per arena.
 */
export function traceRippledGrid(segs: readonly number[], list: readonly Ripple[], pen: Pen): void {
  const d = penScratch;
  for (let i = 0; i + 3 < segs.length; i += 4) {
    const x0 = segs[i] ?? 0;
    const y0 = segs[i + 1] ?? 0;
    const x1 = segs[i + 2] ?? 0;
    const y1 = segs[i + 3] ?? 0;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / RIPPLE_STEP));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      rippleDisplace(x, y, list, d);
      if (k === 0) pen.moveTo(x + d.x, y + d.y);
      else pen.lineTo(x + d.x, y + d.y);
    }
  }
}

/** Age ripples and drop finished ones, in place. */
export function stepRipples(list: Ripple[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i];
    if (!r) continue;
    r.age += Math.max(0, dt);
    if (r.age >= RIPPLE_LIFE) list.splice(i, 1);
  }
}

/** Pure: displacement of one point by every live ripple, written into out. */
export function rippleDisplace(px: number, py: number, list: readonly Ripple[], out: Vec): void {
  let dx = 0;
  let dy = 0;
  for (const r of list) {
    const ox = px - r.x;
    const oy = py - r.y;
    const d = Math.sqrt(ox * ox + oy * oy);
    if (d < 1e-3) continue;
    const delta = d - r.age * RIPPLE_SPEED;
    if (delta <= -RIPPLE_WIDTH || delta >= RIPPLE_WIDTH) continue;
    const fade = 1 - r.age / RIPPLE_LIFE;
    const band = Math.cos((delta / RIPPLE_WIDTH) * (Math.PI / 2));
    const m = (r.strength * fade * fade * band * Math.sin((delta / RIPPLE_WIDTH) * Math.PI)) / d;
    dx += ox * m;
    dy += oy * m;
  }
  out.x = dx;
  out.y = dy;
}

/**
 * Pure: grid polylines bent by the ripples. Returns flat [x0, y0, x1, y1, ...] arrays, one per
 * grid segment, each split into RIPPLE_STEP pieces.
 */
export function rippledGridPaths(arena: ArenaDef, list: readonly Ripple[]): number[][] {
  const segs = gridSegments(arena);
  const out: number[][] = [];
  const d: Vec = { x: 0, y: 0 };
  for (let i = 0; i + 3 < segs.length; i += 4) {
    const x0 = segs[i] ?? 0;
    const y0 = segs[i + 1] ?? 0;
    const x1 = segs[i + 2] ?? 0;
    const y1 = segs[i + 3] ?? 0;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(len / RIPPLE_STEP));
    const path: number[] = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      rippleDisplace(x, y, list, d);
      path.push(x + d.x, y + d.y);
    }
    out.push(path);
  }
  return out;
}
