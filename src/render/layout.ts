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

/** Renderer backing store density cap (docs/04 section 2). */
export const DPR_CAP = 2;

/** Pure: renderer resolution, min(devicePixelRatio, 2). Bad or missing input reads as 1. */
export function renderResolution(dpr: number): number {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.min(d, DPR_CAP);
}

/** Bloom texture density relative to the renderer resolution, at DPR 1 and at DPR 2. */
export const BLOOM_FACTOR_DPR1 = 1.0;
export const BLOOM_FACTOR_DPR2 = 0.75;

/**
 * Pure: bloom resolution policy, relative to the renderer resolution. 1.0 at DPR 1 or below,
 * 0.75 at DPR 2, linear in between. An explicit override (the ?bloomRes knob) wins.
 */
export function bloomResolutionFactor(dpr: number, override: number | null = null): number {
  if (override !== null && Number.isFinite(override)) return Math.min(1, Math.max(0.2, override));
  const t = Math.min(1, Math.max(0, renderResolution(dpr) - 1));
  return BLOOM_FACTOR_DPR1 + (BLOOM_FACTOR_DPR2 - BLOOM_FACTOR_DPR1) * t;
}

/**
 * Pure: absolute value written to Filter.resolution. Pixi treats a filter resolution as an
 * absolute density (texture px per CSS px), not a fraction of the renderer, so the old 0.5 on a
 * DPR 2 canvas was a quarter of the backing store per axis. This is renderResolution x factor:
 * 1.0 at DPR 1, 1.5 at DPR 2.
 */
export function bloomResolution(dpr: number, override: number | null = null): number {
  return renderResolution(dpr) * bloomResolutionFactor(dpr, override);
}

/** Pure: backing store size in device px for a CSS size at a resolution (autoDensity). */
export function backingSize(cssW: number, cssH: number, resolution: number): { w: number; h: number } {
  return { w: Math.round(cssW * resolution), h: Math.round(cssH * resolution) };
}

/** Telegraph flash: on phase alpha (50 percent), off phase alpha, flash rate in Hz. */
export const TELEGRAPH_ALPHA = 0.5;
export const TELEGRAPH_ALPHA_LOW = 0.2;
export const TELEGRAPH_FLASH_HZ = 6;

/** Pure: entity alpha while telegraphing, from the seconds left. Live entities read 1. */
export function telegraphAlpha(left: number): number {
  if (!(left > 0)) return 1;
  const phase = Math.floor(left * TELEGRAPH_FLASH_HZ * 2) % 2;
  return phase === 0 ? TELEGRAPH_ALPHA : TELEGRAPH_ALPHA_LOW;
}

export interface SuperWatch {
  active: string | null;
  timer: number;
  droneAbsent: number;
}

/**
 * Pure: did a super fire between two samples of the game state. A timed super starts or is
 * re-armed (its timer jumps up), or Detonate starts the drone absence (absence jumps up).
 */
export function superFired(prev: Readonly<SuperWatch>, cur: Readonly<SuperWatch>): boolean {
  if (cur.active !== null && (prev.active !== cur.active || cur.timer > prev.timer + 0.5)) return true;
  return cur.droneAbsent > prev.droneAbsent + 0.5;
}

export interface BloomKnobs {
  /** Override of the relative bloom factor (0.2 to 1), null for the DPR policy. */
  resolution: number | null;
  quality: number;
  blur: number;
}

export const DEFAULT_BLOOM_KNOBS: BloomKnobs = { resolution: null, quality: 4, blur: 6 };

function knob(params: URLSearchParams, key: string, lo: number, hi: number, def: number): number {
  const raw = params.get(key);
  if (raw === null) return def;
  const v = Number.parseFloat(raw);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
}

/**
 * Pure: bloom perf knobs from the URL (?bloomRes=0.6&bloomQuality=3&bloomBlur=4). bloomRes is
 * relative to the renderer resolution and replaces the DPR policy factor.
 */
export function parseBloomKnobs(search: string): BloomKnobs {
  const p = new URLSearchParams(search);
  const hasRes = p.get('bloomRes') !== null && Number.isFinite(Number.parseFloat(p.get('bloomRes') ?? ''));
  return {
    resolution: hasRes ? knob(p, 'bloomRes', 0.2, 1, 1) : DEFAULT_BLOOM_KNOBS.resolution,
    quality: Math.round(knob(p, 'bloomQuality', 1, 8, DEFAULT_BLOOM_KNOBS.quality)),
    blur: knob(p, 'bloomBlur', 1, 16, DEFAULT_BLOOM_KNOBS.blur),
  };
}
