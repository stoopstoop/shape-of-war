// Neon brightness mapping (SPEC 4, docs/03-architecture.md section 7).
// applyNeon(n) is the single entry point for bloom strength, threshold, saturation,
// glow alpha and grid alpha. Everything else reads `current` and `palette`, or listens.
import { clampNum, hslToRgbInt, lerpNum } from './color';

export interface NeonParams {
  bloomScale: number;
  threshold: number;
  saturation: number;
  glowAlpha: number;
  gridAlpha: number;
}

// HSL triples. Base S is 0.75 so the 1.3 saturation multiplier clips only slightly.
export const BASE_PALETTE = {
  blue: [215, 0.75, 0.55],
  purple: [275, 0.75, 0.6],
  green: [125, 0.75, 0.5],
  magenta: [310, 0.75, 0.6],
  orange: [28, 0.75, 0.55],
  cyan: [185, 0.75, 0.55],
  white: [0, 0, 0.95],
  red: [355, 0.75, 0.55],
  yellow: [55, 0.75, 0.55],
  ship: [0, 0, 1],
  geom: [95, 0.75, 0.6],
  grid: [230, 0.6, 0.45],
} as const satisfies Record<string, readonly [number, number, number]>;

export type PaletteKey = keyof typeof BASE_PALETTE;

export const PALETTE_KEYS: readonly PaletteKey[] = Object.keys(BASE_PALETTE) as PaletteKey[];

export const NEON_DEFAULT = 70;

/** Pure: the five outputs for a slider value. n is rounded and clamped to 0..100. */
export function neonParams(n: number): NeonParams {
  const safe = Number.isFinite(n) ? n : NEON_DEFAULT;
  const t = clampNum(Math.round(safe), 0, 100) / 100;
  return {
    bloomScale: lerpNum(0.0, 2.0, t),
    threshold: lerpNum(0.8, 0.2, t),
    saturation: lerpNum(0.4, 1.3, t),
    glowAlpha: lerpNum(0.0, 0.9, t),
    gridAlpha: lerpNum(0.1, 0.6, t),
  };
}

/** Pure: palette colour for one key at a saturation multiplier. */
export function paletteColour(key: PaletteKey, saturation: number): number {
  const [h, s, l] = BASE_PALETTE[key];
  return hslToRgbInt(h, clampNum(s * saturation, 0, 1), l);
}

/** Pure: the full palette at a saturation multiplier. */
export function computePalette(saturation: number): Record<PaletteKey, number> {
  const out = {} as Record<PaletteKey, number>;
  for (const k of PALETTE_KEYS) out[k] = paletteColour(k, saturation);
  return out;
}

/** Live palette, mutated in place by applyNeon so importers keep one reference. */
export const palette: Record<PaletteKey, number> = computePalette(neonParams(NEON_DEFAULT).saturation);

export let current: NeonParams = neonParams(NEON_DEFAULT);

/** Last applied slider value (rounded and clamped). */
export let currentNeon: number = NEON_DEFAULT;

type NeonListener = (p: NeonParams) => void;
const listeners = new Set<NeonListener>();

/**
 * Subscribe to 'neon:changed'. Returns an unsubscribe function.
 * Until Forge's bus merges this is the event channel; main.ts forwards it to the bus with
 * onNeonChanged((p) => bus.emit('neon:changed', p)).
 */
export function onNeonChanged(h: NeonListener): () => void {
  listeners.add(h);
  return () => {
    listeners.delete(h);
  };
}

export function applyNeon(n: number): void {
  const safe = Number.isFinite(n) ? n : NEON_DEFAULT;
  currentNeon = clampNum(Math.round(safe), 0, 100);
  const p = neonParams(currentNeon);
  current = p;
  for (const k of PALETTE_KEYS) palette[k] = paletteColour(k, p.saturation);
  for (const h of [...listeners]) h(p);
}
