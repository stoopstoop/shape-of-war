// Pure layout helpers for the renderer: arena fit, filter area, interpolation, URL knobs.

export interface PlayRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Fit {
  scale: number;
  /** World container position in CSS px (arena centre on screen). */
  x: number;
  y: number;
}

/** Fraction of the play rect left empty around the arena so wall glow is not clipped. */
export const FIT_MARGIN = 0.02;

/** Pure: scale = min(safeW / arenaW, safeH / arenaH), arena centred (docs/01 section 2.3). */
export function fitArena(arenaW: number, arenaH: number, rect: PlayRect, margin: number = FIT_MARGIN): Fit {
  const w = Math.max(1, rect.w * (1 - 2 * margin));
  const h = Math.max(1, rect.h * (1 - 2 * margin));
  const scale = Math.min(w / Math.max(1, arenaW), h / Math.max(1, arenaH));
  return { scale, x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/**
 * Pure: the whole screen expressed in the local space of a container placed at fit.
 * Pixi applies filterArea through the container's world transform, so the screen rect
 * must be mapped into world local units.
 */
export function screenRectInWorld(cssW: number, cssH: number, fit: Fit): PlayRect {
  const s = fit.scale > 0 ? fit.scale : 1;
  return { x: -fit.x / s, y: -fit.y / s, w: cssW / s, h: cssH / s };
}

/** Pure: interpolate between previous and current position. */
export function interp(prev: number, cur: number, alpha: number): number {
  return prev + (cur - prev) * alpha;
}

/** Pure: render position of a bullet without prev arrays, extrapolated back from current. */
export function bulletRenderPos(cur: number, vel: number, alpha: number, simDt: number): number {
  return cur - vel * (1 - alpha) * simDt;
}

/** Pure: fallback glow sprite scale, so bloomScale still has a visible range (03 section 6). */
export function glowSpriteScale(bloomScale: number): number {
  return 1 + bloomScale * 0.25;
}

/** Pure: Grunt visual pulse 0.85 to 1.15 at 2 Hz with a per entity phase in [0, 1). */
export function gruntPulse(timeSec: number, phase: number): number {
  return 1 + 0.15 * Math.sin((timeSec * 2 + phase) * Math.PI * 2);
}

export interface BloomKnobs {
  resolution: number;
  quality: number;
  blur: number;
}

export const DEFAULT_BLOOM_KNOBS: BloomKnobs = { resolution: 0.5, quality: 4, blur: 6 };

function knob(params: URLSearchParams, key: string, lo: number, hi: number, def: number): number {
  const raw = params.get(key);
  if (raw === null) return def;
  const v = Number.parseFloat(raw);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
}

/** Pure: bloom perf knobs from the URL (?bloomRes=0.35&bloomQuality=3&bloomBlur=4) for G2. */
export function parseBloomKnobs(search: string): BloomKnobs {
  const p = new URLSearchParams(search);
  return {
    resolution: knob(p, 'bloomRes', 0.2, 1, DEFAULT_BLOOM_KNOBS.resolution),
    quality: Math.round(knob(p, 'bloomQuality', 1, 8, DEFAULT_BLOOM_KNOBS.quality)),
    blur: knob(p, 'bloomBlur', 1, 16, DEFAULT_BLOOM_KNOBS.blur),
  };
}
