// Ember flame body (look v32). Ember is a diamond core wrapped in flame tongues that lick upward
// (screen up, whatever the facing), each tongue shading from deep red at its root through orange and
// yellow to a white hot tip, with a slow shimmer that reshuffles the colour mix every 0.5 s. The dash
// and fan attacks take the same palette. Pure maths and colours; the renderer owns the Graphics.
// Motion comes from the hashed noise table in bossDamage.ts, never the PRNG.
import { hash01 } from './color';
import { noiseAt } from './bossDamage';
import { mixRgb } from './mapFx';
import type { PaletteKey } from './neon';

function fin(v: number, d: number): number {
  return Number.isFinite(v) ? v : d;
}

/** Flame tongues around the core, and colour bands along each tongue's height. */
export const EMBER_TONGUES = 6;
export const FLAME_BANDS = 4;
/** Floats per tongue: (FLAME_BANDS + 1) left edge points then as many right edge points. */
export const TONGUE_FLOATS = (FLAME_BANDS + 1) * 4;
/** Tongue roots sit on this radius share; heights and root half width in body radii. */
export const TONGUE_ROOT_R = 0.55;
export const TONGUE_HEIGHT: readonly [number, number] = [0.75, 1.15];
export const TONGUE_HALF_W = 0.3;
/** How far a tongue bends toward screen up (0 radial, 1 straight up). */
export const TONGUE_RISE = 0.7;
/** Shimmer: the colour mix reshuffles every this many seconds (crossfaded). */
export const SHIMMER_SEC = 0.5;

/**
 * Flame palette, root to tip: deep red, orange, amber, yellow and a white hot tip. Palette keys plus
 * a mix toward black or white, so the flame follows applyNeon like every other colour.
 */
export interface FlameStop {
  readonly key: PaletteKey;
  readonly white: number;
  readonly black: number;
}
export const FLAME_STOPS: readonly FlameStop[] = [
  { key: 'bossRed', white: 0, black: 0.25 },
  { key: 'orange', white: 0, black: 0 },
  { key: 'bossOrange', white: 0.05, black: 0 },
  { key: 'yellow', white: 0.1, black: 0 },
  { key: 'yellow', white: 0.78, black: 0 },
];
export const FLAME_STOP_COUNT = FLAME_STOPS.length;

/** Pure: the flame stop colours under a palette, written into out (FLAME_STOP_COUNT entries). */
export function flameStops(pal: Readonly<Record<PaletteKey, number>>, out: Uint32Array): Uint32Array {
  for (let k = 0; k < FLAME_STOP_COUNT; k++) {
    const s = FLAME_STOPS[k];
    if (s === undefined) continue;
    out[k] = mixRgb(mixRgb(pal[s.key], 0xffffff, s.white), 0x000000, s.black);
  }
  return out;
}

/** Pure: colour at position u (0 root, 1 tip) along the stops, blended between neighbours. */
export function flameAt(stops: Uint32Array, u: number): number {
  const n = stops.length;
  if (n === 0) return 0xffffff;
  const v = Math.max(0, Math.min(1, fin(u, 0))) * (n - 1);
  const i = Math.min(n - 2, Math.floor(v));
  if (i < 0) return stops[0] ?? 0xffffff;
  return mixRgb(stops[i] ?? 0, stops[i + 1] ?? 0, v - i);
}

/**
 * Pure: the shimmer offset of tongue k at timeSec, added to the height share before the colour
 * lookup. A new hashed target every SHIMMER_SEC, crossfaded, so the hue mix keeps shifting.
 */
export function flameShimmer(timeSec: number, k: number): number {
  const p = fin(timeSec, 0) / SHIMMER_SEC;
  const step = Math.floor(p);
  const f = p - step;
  const s = f * f * (3 - 2 * f);
  const a = hash01(step * 13 + k * 101 + 7);
  const b = hash01((step + 1) * 13 + k * 101 + 7);
  return (a + (b - a) * s - 0.5) * 0.36;
}

/** Pure: flame colour of tongue k at height share u and timeSec (shimmer applied). */
export function flameColour(stops: Uint32Array, u: number, timeSec: number, k: number): number {
  return flameAt(stops, fin(u, 0) + flameShimmer(timeSec, k));
}

/**
 * Pure: tongue k of EMBER_TONGUES around the origin at timeSec for body radius R (arena units,
 * screen frame, y down), written into out at k * TONGUE_FLOATS: FLAME_BANDS + 1 left edge points from
 * root to tip, then the right edge points in the same order. Roots are spread round the core and
 * turn with rot (the facing); each tongue rises toward screen up, its height breathes and its tip
 * sways on the noise table. Allocates nothing.
 */
export function flameTongue(k: number, timeSec: number, R: number, rot: number, out: Float32Array): Float32Array {
  const t = fin(timeSec, 0);
  const r = Math.max(0, fin(R, 0));
  const base = ((k % EMBER_TONGUES) + EMBER_TONGUES) % EMBER_TONGUES;
  const a = fin(rot, 0) + (base * Math.PI * 2) / EMBER_TONGUES + (hash01(base * 5 + 1) - 0.5) * 0.4;
  const rx = Math.cos(a);
  const ry = Math.sin(a);
  // Direction: radial bent toward screen up (0, -1).
  let dx = rx * (1 - TONGUE_RISE);
  let dy = ry * (1 - TONGUE_RISE) - TONGUE_RISE;
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl;
  dy /= dl;
  const nx = -dy;
  const ny = dx;
  const n0 = base * 9.7;
  const lick = noiseAt(n0 + t * 2.6);
  const h = r * (TONGUE_HEIGHT[0] + (TONGUE_HEIGHT[1] - TONGUE_HEIGHT[0]) * lick);
  const hw = r * TONGUE_HALF_W * (0.8 + 0.4 * noiseAt(n0 + 31 + t * 1.3));
  const bx = rx * r * TONGUE_ROOT_R;
  const by = ry * r * TONGUE_ROOT_R;
  const o = base * TONGUE_FLOATS;
  const right = o + (FLAME_BANDS + 1) * 2;
  for (let j = 0; j <= FLAME_BANDS; j++) {
    const u = j / FLAME_BANDS;
    // The tip sways sideways more than the root, and the flicker climbs the tongue.
    const sway = (noiseAt(n0 + 17 + t * 4.1 - u * 1.5) - 0.5) * r * 0.5 * u * u;
    const w = hw * Math.pow(1 - u, 0.75);
    const cx = bx + dx * h * u + nx * sway;
    const cy = by + dy * h * u + ny * sway;
    out[o + j * 2] = cx + nx * w;
    out[o + j * 2 + 1] = cy + ny * w;
    out[right + j * 2] = cx - nx * w;
    out[right + j * 2 + 1] = cy - ny * w;
  }
  return out;
}

/** Pure: the hue in degrees (0 to 360) of an RGB colour; grey reads as 0. */
export function hueOfRgb(rgb: number): number {
  const r = ((rgb >> 16) & 255) / 255;
  const g = ((rgb >> 8) & 255) / 255;
  const b = (rgb & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (d < 1e-6) return 0;
  let h: number;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  const deg = h * 60;
  return deg < 0 ? deg + 360 : deg;
}

/** Pure: saturation share (max minus min channel over max) of an RGB colour. */
export function chromaOfRgb(rgb: number): number {
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;
  const mx = Math.max(r, g, b);
  return mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx;
}

/** Pure: shortest distance between two hues in degrees. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(fin(a, 0) - fin(b, 0)) % 360;
  return d > 180 ? 360 - d : d;
}
