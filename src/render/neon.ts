// Neon brightness mapping (SPEC 4, docs/03-architecture.md section 7).
// applyNeon(n) is the single entry point for bloom strength, threshold, saturation,
// glow alpha and grid alpha. Everything else reads `current` and `palette`, or listens.
import { bus } from '../core/events';
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
  bomb: [200, 0.75, 0.8],
  /** Homing bullets (super). Hot pink, apart from the yellow standard shot. */
  homing: [335, 0.8, 0.65],
  // V2 contract stubs (docs/10-v2-plan.md). Placeholder HSL; Glow tunes them in waves B and C.
  charger: [10, 0.75, 0.55],
  bulwark: [240, 0.75, 0.6],
  blink: [335, 0.75, 0.6],
  swirl: [160, 0.75, 0.55],
  sower: [75, 0.75, 0.55],
  rapid: [165, 0.8, 0.65],
  pierce: [20, 0.8, 0.7],
  orbit: [295, 0.8, 0.7],
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

/**
 * Derived render settings. SPEC 4 fixes the five NeonParams; these turn them into the
 * numbers the renderer writes, so the slider has a strong visible range on both glow paths.
 * Computed here so applyNeon stays the only source of bloom strength, threshold and glow width.
 */
export interface NeonRender {
  /** Written to AdvancedBloomFilter.bloomScale. */
  bloomStrength: number;
  /** Written to AdvancedBloomFilter.threshold. */
  bloomThreshold: number;
  /** Outer halo stroke: width multiplier on the core width, and alpha. */
  haloWidthMul: number;
  haloAlpha: number;
  /** Inner halo stroke: width multiplier and alpha. */
  innerWidthMul: number;
  innerAlpha: number;
  /** Core line width multiplier (thicker lines on the glow layer). */
  coreWidthMul: number;
  /** Fallback path: glow sprite alpha and scale. */
  spriteAlpha: number;
  spriteScale: number;
  /** Grid Graphics alpha. */
  gridAlpha: number;
  /** Particle and bullet trail brightness multipliers. */
  particleAlpha: number;
  trailAlpha: number;
  /** Bloom path: alpha of the per entity bloom source sprite (the filter only sees sprites). */
  bloomSourceAlpha: number;
  /** Arena wall core width multiplier on WALL_LINE_PX. */
  wallWidthMul: number;
}

/** Bloom gain over the SPEC bloom strength: thin lines carry little energy into the blur. */
export const BLOOM_GAIN = 1.8;

/** Pure: render settings for a set of SPEC params. */
export function neonRender(p: NeonParams): NeonRender {
  const t = clampNum(p.glowAlpha / 0.9, 0, 1);
  return {
    bloomStrength: p.bloomScale * BLOOM_GAIN,
    bloomThreshold: p.threshold,
    haloWidthMul: lerpNum(3.5, 6.0, t),
    haloAlpha: p.glowAlpha * 0.3,
    innerWidthMul: 2.4,
    innerAlpha: p.glowAlpha * 0.7,
    coreWidthMul: lerpNum(1.4, 1.8, t),
    spriteAlpha: clampNum(0.15 + p.glowAlpha, 0, 1),
    spriteScale: 1 + p.bloomScale * 0.35,
    gridAlpha: p.gridAlpha,
    particleAlpha: lerpNum(0.6, 1, t),
    trailAlpha: lerpNum(0.5, 1, t),
    bloomSourceAlpha: clampNum(0.25 + p.glowAlpha * 0.9, 0, 1),
    wallWidthMul: lerpNum(1.0, 1.35, t),
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

/** Live derived render settings, replaced by applyNeon. */
export let currentRender: NeonRender = neonRender(current);

/** Last applied slider value (rounded and clamped). */
export let currentNeon: number = NEON_DEFAULT;

type NeonListener = (p: NeonParams) => void;
const listeners = new Set<NeonListener>();

/**
 * Subscribe to neon changes. Returns an unsubscribe function. applyNeon also emits
 * 'neon:changed' on the core bus after these listeners run.
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
  currentRender = neonRender(p);
  for (const k of PALETTE_KEYS) palette[k] = paletteColour(k, p.saturation);
  for (const h of [...listeners]) h(p);
  bus.emit('neon:changed', p);
}

export interface NeonState {
  /** Slider value, 0 to 100. */
  neon: number;
  params: Readonly<NeonParams>;
  render: Readonly<NeonRender>;
}

/** Live neon value and its derived settings, for the settings screen label. */
export function getNeonState(): NeonState {
  return { neon: currentNeon, params: current, render: currentRender };
}
