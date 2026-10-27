// Contract stub (docs/03-architecture.md sections 1 and 7). Glow replaces every body in W1.
// BASE_PALETTE is data, kept here only so PaletteKey is exact. Glow adds palette and current.
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

export function neonParams(n: number): NeonParams {
  throw new Error('stub');
}

export function applyNeon(n: number): void {
  throw new Error('stub');
}
