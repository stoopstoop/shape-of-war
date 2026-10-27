// Pure neon controller: writes applyNeon's derived settings onto live render targets.
// No pixi.js import, so tests drive it with plain objects. The renderer passes the live
// AdvancedBloomFilter instance and the live grid Graphics, never copies, so a slider move
// changes what is on screen on the next frame.
import { currentRender, onNeonChanged, palette, type NeonRender, type PaletteKey } from './neon';

export interface BloomLike {
  bloomScale: number;
  threshold: number;
}

export interface AlphaLike {
  alpha: number;
}

export type PaletteView = Readonly<Record<PaletteKey, number>>;

export interface NeonTargets {
  /** The live bloom filter instance attached to the glow layer. */
  readonly bloom: BloomLike;
  /** The live grid display object. */
  readonly grid: AlphaLike;
  /** Rebuild shared shape contexts and reassign them on every live view. */
  shapes(r: Readonly<NeonRender>): void;
  /** Retint every live entity view, bullets and particles from the new palette. */
  tint(pal: PaletteView): void;
  /** Fallback path: glow sprite alpha, scale and textures. */
  sprites(r: Readonly<NeonRender>): void;
}

/** Write one set of render settings onto the targets. */
export function applyNeonToTargets(r: Readonly<NeonRender>, pal: PaletteView, t: NeonTargets): void {
  t.bloom.bloomScale = r.bloomStrength;
  t.bloom.threshold = r.bloomThreshold;
  t.grid.alpha = r.gridAlpha;
  t.shapes(r);
  t.tint(pal);
  t.sprites(r);
}

/** Apply the current settings now and on every applyNeon. Returns the unsubscribe function. */
export function bindNeon(t: NeonTargets): () => void {
  applyNeonToTargets(currentRender, palette, t);
  return onNeonChanged(() => applyNeonToTargets(currentRender, palette, t));
}
