// Pure threat driven map effects (v2 SPEC addendum 3.8, docs/10 wave C Glow item 4).
// No pixi.js import. The wall pulse and wall flash are multipliers on their own layers: nothing
// here touches bloom strength, threshold, saturation, glow width or the grid base alpha, which
// applyNeon alone writes. Wall geometry is a list of segments and arcs per arena, built once.
import type { ArenaDef } from '../levelgen/leveldef';
import { clampNum } from './color';
import { hexagonPoints } from './gridGeom';

// Threat pulse ------------------------------------------------------------------------------

/** Pulse amplitude at threat 0 and 1. At 0 the walls still breathe faintly. */
export const PULSE_AMP_MIN = 0.06;
export const PULSE_AMP_MAX = 0.55;
/** Pulse frequency at threat 0 and 1 (Hz): slow breathing to an urgent throb. */
export const PULSE_HZ_MIN = 0.25;
export const PULSE_HZ_MAX = 1.1;
/** Seconds for the shown threat to close about 63 percent of the gap to the bus value. */
export const THREAT_EASE_SEC = 0.6;

export interface ThreatPulse {
  amp: number;
  hz: number;
}

/** Pure: clamp a bus threat level into [0, 1]; NaN and infinities read 0. */
export function clampThreat(level: number): number {
  return Number.isFinite(level) ? clampNum(level, 0, 1) : 0;
}

/** Pure: pulse amplitude and frequency for a threat level. Both rise with the level, bounded. */
export function threatPulse(level: number, out: ThreatPulse): ThreatPulse {
  const l = clampThreat(level);
  out.amp = PULSE_AMP_MIN + (PULSE_AMP_MAX - PULSE_AMP_MIN) * l;
  out.hz = PULSE_HZ_MIN + (PULSE_HZ_MAX - PULSE_HZ_MIN) * l;
  return out;
}

/**
 * Pure: wall pulse layer alpha multiplier at a phase in cycles (the renderer accumulates
 * phase += hz * dt, so a frequency change never jumps). Always in [0, PULSE_AMP_MAX].
 */
export function wallPulseAlpha(amp: number, phaseCycles: number): number {
  const a = clampNum(Number.isFinite(amp) ? amp : 0, 0, PULSE_AMP_MAX);
  const p = Number.isFinite(phaseCycles) ? phaseCycles : 0;
  return a * (0.5 - 0.5 * Math.cos(p * Math.PI * 2));
}

/** Pure: ease the shown threat toward the bus target with a frame rate independent step. */
export function easeThreat(cur: number, target: number, dt: number): number {
  const t = clampThreat(target);
  if (!(dt > 0)) return cur;
  const k = 1 - Math.exp(-dt / THREAT_EASE_SEC);
  return cur + (t - cur) * k;
}

/** Pure: mix two 0xRRGGBB colours, t in [0, 1]. */
export function mixRgb(a: number, b: number, t: number): number {
  const u = clampNum(t, 0, 1);
  let out = 0;
  for (let s = 16; s >= 0; s -= 8) {
    const x = (a >> s) & 0xff;
    const y = (b >> s) & 0xff;
    out |= (Math.round(x + (y - x) * u) & 0xff) << s;
  }
  return out;
}

/**
 * Pure: map effect brightness gain from the neon glow alpha (NeonParams.glowAlpha, 0 to 0.9).
 * Reads the slider value, never writes it: 0.3 at neon 0 rising to 1 at neon 100, so a dim
 * setting gives dim map effects on both glow paths.
 */
export function mapFxNeonGain(glowAlpha: number): number {
  const g = Number.isFinite(glowAlpha) ? clampNum(glowAlpha / 0.9, 0, 1) : 0;
  return 0.3 + 0.7 * g;
}

/** Share of the warm threat colour mixed into the pulse tint at threat 1. */
export const PULSE_WARM_MAX = 0.5;

// Wall flash -----------------------------------------------------------------------------------

/** Kills within this distance of a wall flash it (docs/10 wave C). */
export const FLASH_RANGE = 120;
/** Flash life in seconds and half length along the wall in arena units. */
export const FLASH_LIFE = 0.28;
export const FLASH_HALF_LEN = 90;
export const MAX_FLASHES = 6;

/** Pure: flash strength for a kill at distance d: 1 at the wall, 0.35 at 120 u, 0 beyond. */
export function flashStrength(d: number): number {
  if (!(d >= 0) || d > FLASH_RANGE) return 0;
  return 1 - 0.65 * (d / FLASH_RANGE);
}

/** Pure: flash alpha multiplier at an age, linear fade over FLASH_LIFE. */
export function flashFade(age: number): number {
  if (!(age >= 0) || age >= FLASH_LIFE) return 0;
  return 1 - age / FLASH_LIFE;
}

// Wall geometry --------------------------------------------------------------------------------

export interface WallSeg {
  readonly t: 'seg';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** Arc from a0 to a1 (radians, a1 > a0, +y down so angles turn clockwise on screen). */
export interface WallArc {
  readonly t: 'arc';
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly a0: number;
  readonly a1: number;
}

export type WallFeature = WallSeg | WallArc;

const TAU = Math.PI * 2;

function seg(x1: number, y1: number, x2: number, y2: number): WallSeg {
  return { t: 'seg', x1, y1, x2, y2 };
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number): WallArc {
  return { t: 'arc', cx, cy, r, a0, a1 };
}

function rectSegs(cx: number, cy: number, w: number, h: number, out: WallFeature[]): void {
  const l = cx - w / 2;
  const r = cx + w / 2;
  const t = cy - h / 2;
  const b = cy + h / 2;
  out.push(seg(l, t, r, t), seg(r, t, r, b), seg(r, b, l, b), seg(l, b, l, t));
}

/** Pure: arena outline and obstacle edges as segments and arcs. */
export function wallFeatures(a: ArenaDef): WallFeature[] {
  const out: WallFeature[] = [];
  const w = a.width;
  const h = a.height;
  switch (a.shape) {
    case 'rect':
    case 'rectObstacles':
      rectSegs(0, 0, w, h, out);
      break;
    case 'roundRect': {
      const r = Math.max(0, Math.min(a.cornerRadius, w / 2, h / 2));
      const l = -w / 2;
      const rt = w / 2;
      const t = -h / 2;
      const b = h / 2;
      out.push(seg(l + r, t, rt - r, t), seg(rt, t + r, rt, b - r), seg(rt - r, b, l + r, b), seg(l, b - r, l, t + r));
      if (r > 0) {
        const hp = Math.PI / 2;
        out.push(arc(rt - r, t + r, r, -hp, 0), arc(rt - r, b - r, r, 0, hp), arc(l + r, b - r, r, hp, Math.PI), arc(l + r, t + r, r, Math.PI, Math.PI + hp));
      }
      break;
    }
    case 'circle':
      out.push(arc(0, 0, w / 2, 0, TAU));
      break;
    case 'hexagon': {
      const p = hexagonPoints(w, h);
      const n = p.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        out.push(seg(p[i * 2] ?? 0, p[i * 2 + 1] ?? 0, p[j * 2] ?? 0, p[j * 2 + 1] ?? 0));
      }
      break;
    }
  }
  for (const o of a.obstacles) rectSegs(o.cx, o.cy, o.w, o.h, out);
  return out;
}

/** Normalise an angle into [a0, a0 + 2 pi). */
function angleFrom(a0: number, a: number): number {
  return a0 + ((((a - a0) % TAU) + TAU) % TAU);
}

function fullCircle(f: WallArc): boolean {
  return f.a1 - f.a0 >= TAU - 1e-9;
}

export interface WallHit {
  /** Distance from the query point to the wall, arena units. Infinity if there is no wall. */
  dist: number;
  /** Index into the feature list, -1 if none. */
  feature: number;
  /** Nearest point on the wall. */
  x: number;
  y: number;
  /** Flash span: parameters in [0, 1] along a segment, or angles on an arc. */
  s0: number;
  s1: number;
}

/** Pure: an empty WallHit, for preallocated scratch. */
export function createWallHit(): WallHit {
  return { dist: Number.POSITIVE_INFINITY, feature: -1, x: 0, y: 0, s0: 0, s1: 0 };
}

function hitSeg(f: WallSeg, i: number, x: number, y: number, out: WallHit): void {
  const dx = f.x2 - f.x1;
  const dy = f.y2 - f.y1;
  const len2 = dx * dx + dy * dy;
  const u = len2 > 0 ? clampNum(((x - f.x1) * dx + (y - f.y1) * dy) / len2, 0, 1) : 0;
  const px = f.x1 + dx * u;
  const py = f.y1 + dy * u;
  const d = Math.hypot(x - px, y - py);
  if (!(d < out.dist)) return;
  const half = len2 > 0 ? FLASH_HALF_LEN / Math.sqrt(len2) : 0;
  out.dist = d;
  out.feature = i;
  out.x = px;
  out.y = py;
  out.s0 = clampNum(u - half, 0, 1);
  out.s1 = clampNum(u + half, 0, 1);
}

function hitArc(f: WallArc, i: number, x: number, y: number, out: WallHit): void {
  let a = angleFrom(f.a0, Math.atan2(y - f.cy, x - f.cx));
  if (!fullCircle(f) && a > f.a1) {
    // Outside the arc: clamp to the nearer end.
    a = a - f.a1 < TAU - (a - f.a0) ? f.a1 : f.a0;
  }
  const px = f.cx + Math.cos(a) * f.r;
  const py = f.cy + Math.sin(a) * f.r;
  const d = Math.hypot(x - px, y - py);
  if (!(d < out.dist)) return;
  const half = f.r > 0 ? FLASH_HALF_LEN / f.r : 0;
  out.dist = d;
  out.feature = i;
  out.x = px;
  out.y = py;
  out.s0 = fullCircle(f) ? a - half : Math.max(f.a0, a - half);
  out.s1 = fullCircle(f) ? a + half : Math.min(f.a1, a + half);
}

/** Pure: the nearest wall to (x, y) and the flash span around it, written into out. */
export function nearestWall(features: readonly WallFeature[], x: number, y: number, out: WallHit): WallHit {
  out.dist = Number.POSITIVE_INFINITY;
  out.feature = -1;
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    if (!f) continue;
    if (f.t === 'seg') hitSeg(f, i, x, y, out);
    else hitArc(f, i, x, y, out);
  }
  return out;
}

function raySeg(f: WallSeg, x: number, y: number, dx: number, dy: number, best: number): number {
  const ex = f.x2 - f.x1;
  const ey = f.y2 - f.y1;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return best;
  const qx = f.x1 - x;
  const qy = f.y1 - y;
  const t = (qx * ey - qy * ex) / den;
  const u = (qx * dy - qy * dx) / den;
  return t > 1e-6 && u >= 0 && u <= 1 && t < best ? t : best;
}

function rayArcRoot(f: WallArc, ox: number, oy: number, dx: number, dy: number, t: number, best: number): number {
  if (!(t > 1e-6) || t >= best) return best;
  if (!fullCircle(f) && angleFrom(f.a0, Math.atan2(oy + dy * t, ox + dx * t)) > f.a1) return best;
  return t;
}

function rayArc(f: WallArc, x: number, y: number, dx: number, dy: number, best: number): number {
  const ox = x - f.cx;
  const oy = y - f.cy;
  const b = ox * dx + oy * dy;
  const disc = b * b - (ox * ox + oy * oy - f.r * f.r);
  if (disc < 0) return best;
  const sq = Math.sqrt(disc);
  const near = rayArcRoot(f, ox, oy, dx, dy, -b - sq, best);
  return rayArcRoot(f, ox, oy, dx, dy, -b + sq, near);
}

/**
 * Pure: distance along the unit ray (dx, dy) from (x, y) to the first wall, capped at maxLen.
 * Clips the Charger lane line at the arena edge, where its dash ends. Allocates nothing.
 */
export function rayWallDistance(
  features: readonly WallFeature[],
  x: number,
  y: number,
  dx: number,
  dy: number,
  maxLen: number,
): number {
  let best = maxLen;
  for (const f of features) best = f.t === 'seg' ? raySeg(f, x, y, dx, dy, best) : rayArc(f, x, y, dx, dy, best);
  return best;
}
