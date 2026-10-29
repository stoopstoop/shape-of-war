// Pure Turbo super look (G3A device feedback: "the Turbo super is not worth using and I often
// forget about it"). No pixi.js import. Swarm adds the speed and pierce boost; this makes it read:
// while Turbo runs the ship comet is wider, brighter and hot white yellow, the ship sheds more
// sparks and its glow flickers; in the last TURBO_FADE_SEC the boost fades with a blink, so the end
// is visible. Activation fires a short burst (sparks and a shock ring) at the ship.
// Every value here is a multiplier on an existing layer: applyNeon stays the only writer of bloom,
// threshold, saturation and glow width.
import { clampNum } from './color';

/** Seconds at the end of Turbo over which the boost fades (and blinks). */
export const TURBO_FADE_SEC = 0.9;
/** Blink rate during the fade. */
export const TURBO_FADE_BLINK_HZ = 6;
/** Comet multipliers at full intensity. */
export const TURBO_WIDTH_MUL = 1.8;
export const TURBO_ALPHA_MUL = 1.5;
/** Ribbon alpha floor at full intensity while the ship moves at all (above TURBO_MIN_SPEED u/s). */
export const TURBO_ALPHA_FLOOR = 0.6;
export const TURBO_MIN_SPEED = 15;
/** Ship spark rate multiplier at full intensity. */
export const TURBO_RATE_MUL = 2.5;
/** Ship glow boost at full intensity, and its flicker rate. */
export const TURBO_GLOW_MUL = 0.6;
export const TURBO_FLICKER_HZ = 9;
/** Share of white in the hot Turbo colour (mixed into the palette yellow). */
export const TURBO_WHITE = 0.45;
/** Activation burst: base spark count (scaled by the effects tier) and shock ring size. */
export const TURBO_BURST = 64;
export const TURBO_RING_R0 = 24;
export const TURBO_RING_R1 = 220;
export const TURBO_RING_LIFE = 0.4;

/** Pure: true on the frame Turbo starts (or restarts with a fresh timer). */
export function turboActivated(prevActive: string | null, prevTimer: number, curActive: string | null, curTimer: number): boolean {
  if (curActive !== 'turbo' || !(curTimer > 0)) return false;
  return prevActive !== 'turbo' || curTimer > prevTimer + 0.5;
}

/**
 * Pure: Turbo intensity 0 to 1 from the running super and its seconds left. 1 while Turbo runs,
 * then over the last TURBO_FADE_SEC a fade with a blink (between full and the fade level), 0 off.
 */
export function turboIntensity(active: string | null, timer: number, timeSec: number): number {
  if (active !== 'turbo' || !(timer > 0)) return 0;
  if (timer >= TURBO_FADE_SEC) return 1;
  const fade = clampNum(timer / TURBO_FADE_SEC, 0, 1);
  const blink = Math.sin((Number.isFinite(timeSec) ? timeSec : 0) * TURBO_FADE_BLINK_HZ * Math.PI * 2) > 0 ? 1 : 0.35;
  return fade * blink;
}

/** Pure: comet width multiplier at an intensity. */
export function turboWidth(k: number): number {
  return 1 + (TURBO_WIDTH_MUL - 1) * clampNum(k, 0, 1);
}

/** Pure: ship spark rate multiplier at an intensity. */
export function turboRate(k: number): number {
  return 1 + (TURBO_RATE_MUL - 1) * clampNum(k, 0, 1);
}

/**
 * Pure: comet alpha factor from the normal factor (cometAlpha of the speed), the speed and the
 * intensity. Never above 1; unchanged at intensity 0.
 */
export function turboCometAlpha(base: number, speed: number, k: number): number {
  const u = clampNum(k, 0, 1);
  const b = clampNum(Number.isFinite(base) ? base : 0, 0, 1);
  if (u <= 0) return b;
  const floor = speed > TURBO_MIN_SPEED ? TURBO_ALPHA_FLOOR * u : 0;
  return Math.min(1, Math.max(b, floor) * (1 + (TURBO_ALPHA_MUL - 1) * u));
}

/** Pure: ship glow sprite multiplier at an intensity, flickering on the render clock. */
export function turboGlow(k: number, timeSec: number): number {
  const u = clampNum(k, 0, 1);
  if (u <= 0) return 1;
  const f = 0.75 + 0.25 * Math.sin((Number.isFinite(timeSec) ? timeSec : 0) * TURBO_FLICKER_HZ * Math.PI * 2);
  return 1 + TURBO_GLOW_MUL * u * f;
}
