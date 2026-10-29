// Pure sprite instance buffer for the boss hazard and enemy bullet layers (docs/12 wave V3-A Glow
// items 3 and 6). No pixi.js import. A planner writes instances (frame, centre, rotation, world
// size, alpha, tint) into a fixed capacity structure of arrays; fxSpriteLayer.ts mirrors it onto
// pooled Particles in one ParticleContainer, so a layer is one geometry and one draw call, with no
// allocation and no Graphics.clear per frame. Frames are white cells of one generated atlas,
// tinted per instance.
import { clampNum } from './color';
import type { NeonRender } from './neon';

/** Frame ids. Each is one cell of the boss fx atlas. */
export const F_BAR = 0; // straight line: hot core band with a thin soft fringe, square ends
export const F_SOFT = 1; // wide soft line halo, square ends (segments join without seams)
export const F_FILL = 2; // solid cell for translucent bands (lane, sweep and tether kill zones)
export const F_DOT = 3; // small hard disc (white bullet core)
export const F_GLOW = 4; // soft round glow (bullet halo, launch flash)
export const F_BRING = 5; // small ring (enemy bullet body)
export const FRAME_COUNT = 6;

export interface AtlasCell {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** World size that maps to scale 1 across x and y (the core band, the disc or ring diameter). */
  readonly unitW: number;
  readonly unitH: number;
}

/** Ring radius and stroke of the F_BRING cell, texture units. Drawn at 2x the bullet's 9 u. */
export const BRING_R = 18;
export const BRING_STROKE = 3.5;

/** Atlas cells, logical texture units (generated at resolution 2), in a row with 2 unit gaps. */
export const ATLAS_CELLS: readonly AtlasCell[] = [
  { x: 0, y: 0, w: 64, h: 8, unitW: 64, unitH: 4 },
  { x: 66, y: 0, w: 64, h: 24, unitW: 64, unitH: 24 },
  { x: 132, y: 0, w: 16, h: 16, unitW: 16, unitH: 16 },
  { x: 150, y: 0, w: 24, h: 24, unitW: 16, unitH: 16 },
  { x: 176, y: 0, w: 48, h: 48, unitW: 48, unitH: 48 },
  { x: 226, y: 0, w: 48, h: 48, unitW: 2 * BRING_R, unitH: 2 * BRING_R },
];

export const FX_ATLAS_W = 274;
export const FX_ATLAS_H = 48;

export interface SpriteBuf {
  readonly cap: number;
  count: number;
  /** Instances refused because the buffer was full (debug counter, reset with the buffer). */
  dropped: number;
  readonly frame: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly rot: Float32Array;
  /** World size along the frame's x and y, arena units. */
  readonly w: Float32Array;
  readonly h: Float32Array;
  readonly alpha: Float32Array;
  readonly tint: Uint32Array;
}

export function createSpriteBuf(cap: number): SpriteBuf {
  const n = Math.max(0, Math.floor(cap));
  return {
    cap: n,
    count: 0,
    dropped: 0,
    frame: new Uint8Array(n),
    x: new Float32Array(n),
    y: new Float32Array(n),
    rot: new Float32Array(n),
    w: new Float32Array(n),
    h: new Float32Array(n),
    alpha: new Float32Array(n),
    tint: new Uint32Array(n),
  };
}

/** Empty the buffer for a new frame. No allocation. */
export function resetSpriteBuf(b: SpriteBuf): void {
  b.count = 0;
  b.dropped = 0;
}

/** Append one instance. Returns false (and counts it) when full or invisible instances are skipped. */
export function pushSprite(
  b: SpriteBuf,
  frame: number,
  x: number,
  y: number,
  rot: number,
  w: number,
  h: number,
  alpha: number,
  tint: number,
): boolean {
  if (!(alpha > 0.002) || !(w > 0) || !(h > 0)) return false;
  if (b.count >= b.cap) {
    b.dropped++;
    return false;
  }
  const i = b.count++;
  b.frame[i] = frame;
  b.x[i] = x;
  b.y[i] = y;
  b.rot[i] = rot;
  b.w[i] = w;
  b.h[i] = h;
  b.alpha[i] = alpha > 1 ? 1 : alpha;
  b.tint[i] = tint >>> 0;
  return true;
}

/** Pure: how many instances of a frame the buffer holds (tests and the debug panel). */
export function countFrame(b: SpriteBuf, frame: number): number {
  let n = 0;
  for (let i = 0; i < b.count; i++) if (b.frame[i] === frame) n++;
  return n;
}

/** Halo strength and width for the sprite layers, from applyNeon's derived settings. */
export interface FxHalo {
  /** Alpha multiplier of the soft halo instance. 0 draws no halo. */
  alpha: number;
  /** Halo width as a multiple of the core thickness. */
  width: number;
}

/**
 * Pure: halo for a glow path. Read from NeonRender only, never written: on the bloom path it
 * follows the bloom source alpha (the per entity sprites the filter sees), on the fallback path the
 * glow sprite alpha and scale. The width follows the halo width applyNeon computes. Neon 0 leaves a
 * faint halo on both paths, as the entity sprites do.
 */
export function fxHalo(r: Readonly<NeonRender>, bloomOn: boolean, out: FxHalo): FxHalo {
  out.alpha = clampNum(bloomOn ? r.bloomSourceAlpha * 0.6 : r.spriteAlpha * 0.75, 0, 1);
  out.width = (bloomOn ? 0.55 : 0.55 * r.spriteScale) * r.haloWidthMul;
  return out;
}

/**
 * Line from (x0, y0) to (x1, y1): a soft halo (when halo.alpha > 0) then the hot core. thick is the
 * core thickness in arena units. Returns the number of instances written.
 */
export function pushLine(
  b: SpriteBuf,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thick: number,
  alpha: number,
  tint: number,
  halo: Readonly<FxHalo>,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!(len > 0.01)) return 0;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rot = Math.atan2(dy, dx);
  let n = 0;
  if (halo.alpha > 0 && pushSprite(b, F_SOFT, cx, cy, rot, len, thick * halo.width * 2, alpha * halo.alpha, tint)) n++;
  if (pushSprite(b, F_BAR, cx, cy, rot, len, thick, alpha, tint)) n++;
  return n;
}

/** Translucent band from (x0, y0) to (x1, y1), width across in arena units (a kill zone fill). */
export function pushBand(b: SpriteBuf, x0: number, y0: number, x1: number, y1: number, width: number, alpha: number, tint: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!(len > 0.01)) return 0;
  return pushSprite(b, F_FILL, (x0 + x1) / 2, (y0 + y1) / 2, Math.atan2(dy, dx), len, width, alpha, tint) ? 1 : 0;
}

/**
 * Arc of radius r around (cx, cy) from angle a0 over span radians, as n straight segments (each a
 * halo and a core instance). Returns the number of instances written.
 */
export function pushArc(
  b: SpriteBuf,
  cx: number,
  cy: number,
  r: number,
  a0: number,
  span: number,
  n: number,
  thick: number,
  alpha: number,
  tint: number,
  halo: Readonly<FxHalo>,
): number {
  if (!(r > 0) || !(span > 0) || n < 1) return 0;
  let written = 0;
  let px = cx + Math.cos(a0) * r;
  let py = cy + Math.sin(a0) * r;
  // Square ended chords leave a wedge on the outside of each joint: stretch every chord by the
  // wedge half width at each end (inner ends overlap slightly instead, which reads as solid).
  const step = span / n;
  const ext = thick * 0.5 * Math.tan(step / 2) + 0.2;
  for (let k = 1; k <= n; k++) {
    const a = a0 + step * k;
    const qx = cx + Math.cos(a) * r;
    const qy = cy + Math.sin(a) * r;
    const dx = qx - px;
    const dy = qy - py;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = len > 1e-6 ? (dx / len) * ext : 0;
    const uy = len > 1e-6 ? (dy / len) * ext : 0;
    written += pushLine(b, px - ux, py - uy, qx + ux, qy + uy, thick, alpha, tint, halo);
    px = qx;
    py = qy;
  }
  return written;
}
