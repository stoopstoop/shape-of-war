// Boss battle damage layout (look v32). A crack stage is drawn as gaps in the neon outline, a soft
// fracture glow in the boss hue spreading in from the hit side with a noisy branching edge, scorch
// (lower fill alpha) beside the gaps, and outline fragments falling away. Nothing is black.
// This module is the pure layout: the gap list and the fracture polygon for a stage, a seed and a
// hit angle. Variation comes from a fixed hashed noise table, never the PRNG.
import { hash01 } from './color';

function fin(v: number, d: number): number {
  return Number.isFinite(v) ? v : d;
}

/** Hashed noise table (values 0 to 1), sampled with linear interpolation and wrapped. */
export const NOISE_SIZE = 64;
export const DAMAGE_NOISE: Float32Array = (() => {
  const t = new Float32Array(NOISE_SIZE);
  for (let k = 0; k < NOISE_SIZE; k++) t[k] = hash01(k * 7 + 3);
  return t;
})();

/** Pure: smooth periodic noise 0 to 1 at x (one table cell per unit). */
export function noiseAt(x: number): number {
  const v = fin(x, 0);
  const f = Math.floor(v);
  const u = v - f;
  const i = ((f % NOISE_SIZE) + NOISE_SIZE) % NOISE_SIZE;
  const a = DAMAGE_NOISE[i] ?? 0;
  const b = DAMAGE_NOISE[(i + 1) % NOISE_SIZE] ?? 0;
  const s = u * u * (3 - 2 * u);
  return a + (b - a) * s;
}

/** Outline gaps per stage and their half width range (radians). */
export const GAPS_PER_STAGE = 3;
export const GAP_HALF: readonly [number, number] = [0.06, 0.1];
/** Points on the fracture polygon: two on the outline either side of the hit, the rest the fan. */
export const FRACTURE_PTS = 30;
/** How far the fracture reaches in (body radii) per stage, and the fan half spread (radians). */
export const FRACTURE_REACH: readonly [number, number] = [0.5, 0.78];
export const FRACTURE_SPREAD = 1.15;
/** Branch fingers per fracture: narrow bumps on the edge that read as cracks forking inward. */
export const FRACTURE_BRANCHES = 4;
/** The fracture's two outline points sit at this radius share; it never passes FRACTURE_MAX_R. */
export const FRACTURE_EDGE_R = 0.96;
export const FRACTURE_MAX_R = 0.94;
/** The fan spreads from this point on the hit angle (radius share), just inside the outline. */
export const FRACTURE_ORIGIN_R = 0.9;
/** Fracture glow: the boss primary hue at this brightness. */
export const FRACTURE_BRIGHTNESS = 0.35;

export interface CrackLayout {
  /** GAPS_PER_STAGE (angle, half width) pairs, local radians, the first on the hit angle. */
  readonly gaps: Float32Array;
  /**
   * FRACTURE_PTS (x, y) pairs in body radii. Points 0 and 1 sit on the outline either side of the
   * hit; the rest fan between them. Drawn in fracturePointAt order and closed through the origin
   * point (fractureOrigin), the polygon is star shaped about that origin, so it is always simple.
   */
  readonly frac: Float32Array;
}

export function createCrackLayout(): CrackLayout {
  return { gaps: new Float32Array(GAPS_PER_STAGE * 2), frac: new Float32Array(FRACTURE_PTS * 2) };
}

/**
 * Pure: the gaps and fracture polygon of crack stage (1 or 2) hit at local angle a with seed,
 * written into out. The polygon starts at two outline points either side of the hit, then fans
 * inward from the hit point; its radius wanders on the noise table and carries FRACTURE_BRANCHES
 * narrow fingers, so the edge reads as a branching crack front, not a straight line.
 */
export function crackLayout(stage: number, seed: number, a: number, out: CrackLayout): CrackLayout {
  const s = stage >= 2 ? 2 : 1;
  const ang = fin(a, 0);
  const sd = Math.floor(fin(seed, 0)) * 31 + s * 7;
  for (let k = 0; k < GAPS_PER_STAGE; k++) {
    const off = k === 0 ? 0 : (k % 2 === 0 ? 1 : -1) * (0.28 + hash01(sd * 23 + k) * 0.32);
    out.gaps[k * 2] = ang + off;
    out.gaps[k * 2 + 1] = GAP_HALF[0] + (GAP_HALF[1] - GAP_HALF[0]) * hash01(sd * 29 + k);
  }
  const reach = FRACTURE_REACH[s - 1] ?? 0.5;
  const ex = Math.cos(ang) * FRACTURE_ORIGIN_R;
  const ey = Math.sin(ang) * FRACTURE_ORIGIN_R;
  const side = 0.32 + 0.1 * hash01(sd * 3 + 1);
  out.frac[0] = Math.cos(ang - side) * FRACTURE_EDGE_R;
  out.frac[1] = Math.sin(ang - side) * FRACTURE_EDGE_R;
  const fan = FRACTURE_PTS - 2;
  const nOff = hash01(sd * 5 + 2) * NOISE_SIZE;
  for (let k = 0; k < fan; k++) {
    const u = k / (fan - 1);
    // From the side of point 0 (ang - side) round to the side of point 1, so the polygon is simple.
    const phi = ang + Math.PI + FRACTURE_SPREAD - u * 2 * FRACTURE_SPREAD;
    // Wandering front: two octaves of table noise, tapering to the outline at both ends.
    let r = 0.4 + 0.32 * noiseAt(nOff + u * 9) + 0.18 * noiseAt(nOff * 1.7 + u * 23) + 0.12 * noiseAt(nOff * 2.3 + u * 47);
    for (let b = 0; b < FRACTURE_BRANCHES; b++) {
      const c = 0.12 + 0.76 * hash01(sd * 11 + b);
      const w = 0.035 + 0.03 * hash01(sd * 13 + b);
      const d = (u - c) / w;
      r += (0.35 + 0.35 * hash01(sd * 17 + b)) * Math.exp(-d * d);
    }
    // Fine grain: a small hashed roughness per point, so the front is ragged like a real fracture.
    r *= 0.88 + 0.24 * hash01(sd * 37 + k);
    const taper = Math.sin(u * Math.PI);
    const dx = Math.cos(phi);
    const dy = Math.sin(phi);
    // Clip along the ray (not toward the centre) at FRACTURE_MAX_R, so the angle seen from the
    // origin is kept and the polygon stays star shaped.
    const len = Math.min(reach * r * (0.25 + 0.75 * taper), rayToCircle(ex, ey, dx, dy, FRACTURE_MAX_R));
    out.frac[(k + 2) * 2] = ex + dx * len;
    out.frac[(k + 2) * 2 + 1] = ey + dy * len;
  }
  // Point 1 closes the polygon on the far side of the hit, so the fan runs between the two.
  out.frac[2] = Math.cos(ang + side) * FRACTURE_EDGE_R;
  out.frac[3] = Math.sin(ang + side) * FRACTURE_EDGE_R;
  return out;
}

/** Pure: distance along the ray from (x, y) inside a circle of radius R to its edge. */
function rayToCircle(x: number, y: number, dx: number, dy: number, R: number): number {
  const b = x * dx + y * dy;
  const c = x * x + y * y - R * R;
  const d = b * b - c;
  return d <= 0 ? 0 : Math.max(0, -b + Math.sqrt(d));
}

/** Pure: the fan origin (body radii) of a layout hit at local angle a, written into out (x, y). */
export function fractureOrigin(a: number, out: Float32Array): Float32Array {
  out[0] = Math.cos(fin(a, 0)) * FRACTURE_ORIGIN_R;
  out[1] = Math.sin(fin(a, 0)) * FRACTURE_ORIGIN_R;
  return out;
}

/** Pure: the polygon point order for drawing (0, the fan, then 1), as a point index into frac. */
export function fracturePointAt(k: number): number {
  if (k <= 0) return 0;
  if (k >= FRACTURE_PTS - 1) return 1;
  return k + 1;
}

/**
 * Pure: whether the drawn polygon of a layout hit at angle a (fracturePointAt order, closed through
 * the origin) is simple: no two edges cross. Used by the tests.
 */
export function fractureIsSimple(frac: Float32Array, a: number): boolean {
  const n = FRACTURE_PTS + 1;
  const o = fractureOrigin(a, new Float32Array(2));
  const px = (k: number): number => (k % n === FRACTURE_PTS ? (o[0] ?? 0) : (frac[fracturePointAt(k % n) * 2] ?? 0));
  const py = (k: number): number => (k % n === FRACTURE_PTS ? (o[1] ?? 0) : (frac[fracturePointAt(k % n) * 2 + 1] ?? 0));
  const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const d1 = cross(px(i), py(i), px(i + 1), py(i + 1), px(j), py(j));
      const d2 = cross(px(i), py(i), px(i + 1), py(i + 1), px(j + 1), py(j + 1));
      const d3 = cross(px(j), py(j), px(j + 1), py(j + 1), px(i), py(i));
      const d4 = cross(px(j), py(j), px(j + 1), py(j + 1), px(i + 1), py(i + 1));
      if (d1 * d2 < 0 && d3 * d4 < 0) return false;
    }
  }
  return true;
}

/** The fracture grows in from the hit side over this many seconds. */
export const FRACTURE_GROW_SEC = 0.6;

/** Pure: fracture growth 0 to 1 at age seconds (eased out). */
export function fractureGrow(age: number): number {
  const u = Math.max(0, Math.min(1, fin(age, FRACTURE_GROW_SEC) / FRACTURE_GROW_SEC));
  return 1 - (1 - u) * (1 - u);
}

/** Erase depth (0 to 1) of the outline at a gap core, and of the dimmed shoulders either side. */
export const GAP_CUT = 1;
export const GAP_SHOULDER_MIN = 0.35;
export const GAP_SHOULDER_MAX = 0.75;
/** Scorch: the fill near a gap loses this share of its alpha (it goes see through, not black). */
export const SCORCH_CUT = 0.45;

/** Pure: how much the outline beside gap k is dimmed at timeSec (an uneven flicker, never 0 or 1). */
export function shoulderDim(timeSec: number, k: number): number {
  const t = fin(timeSec, 0);
  const w = 0.5 + 0.5 * (Math.sin(t * 13.7 + k * 2.3) * 0.6 + Math.sin(t * 5.1 + k * 0.9) * 0.4);
  return GAP_SHOULDER_MIN + (GAP_SHOULDER_MAX - GAP_SHOULDER_MIN) * w;
}

/** Most the whole outline dims in the stage 2 flicker. */
export const FLICKER_MAX = 0.6;

/**
 * Pure: stage 2 uneven flicker of the whole outline at timeSec, as an erase depth 0 to FLICKER_MAX
 * (0 before stage 2). Short dropouts on a noise driven clock, so no two beats match.
 */
export function outlineFlicker(stage: number, timeSec: number): number {
  if (stage < 2) return 0;
  const t = fin(timeSec, 0);
  const n = noiseAt(t * 6.3) * 0.65 + noiseAt(t * 17.1 + 11) * 0.35;
  const d = n < 0.55 ? 0 : (n - 0.55) / 0.45;
  return Math.min(FLICKER_MAX, FLICKER_MAX * d * 1.4);
}

/** Pure: an RGB colour scaled to brightness share k (0 to 1), keeping its hue. */
export function dimRgb(rgb: number, k: number): number {
  const s = Math.max(0, Math.min(1, fin(k, 1)));
  const r = Math.round(((rgb >> 16) & 255) * s);
  const g = Math.round(((rgb >> 8) & 255) * s);
  const b = Math.round((rgb & 255) * s);
  return (r << 16) | (g << 8) | b;
}
