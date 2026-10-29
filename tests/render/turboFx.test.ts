// Turbo super look (src/render/turboFx.ts and the comet width multiplier in src/render/comet.ts):
// activation edge, intensity with the end fade, and the comet, spark and glow multipliers.
import { describe, expect, it } from 'vitest';
import { COMET_HALF_W, COMET_VERTS, createComet, pushComet, writeCometStrip } from '../../src/render/comet';
import {
  TURBO_ALPHA_FLOOR,
  TURBO_FADE_SEC,
  TURBO_GLOW_MUL,
  TURBO_RATE_MUL,
  TURBO_WIDTH_MUL,
  turboActivated,
  turboCometAlpha,
  turboGlow,
  turboIntensity,
  turboRate,
  turboWidth,
} from '../../src/render/turboFx';

describe('turbo activation', () => {
  it('fires when Turbo starts or restarts with a fresh timer, not while it runs', () => {
    expect(turboActivated(null, 0, 'turbo', 5)).toBe(true);
    expect(turboActivated('homing', 2, 'turbo', 5)).toBe(true);
    expect(turboActivated('turbo', 1, 'turbo', 5)).toBe(true);
    expect(turboActivated('turbo', 4.98, 'turbo', 4.96)).toBe(false);
    expect(turboActivated(null, 0, 'homing', 5)).toBe(false);
    expect(turboActivated('turbo', 0.01, null, 0)).toBe(false);
    expect(turboActivated(null, 0, 'turbo', 0)).toBe(false);
  });
});

describe('turbo intensity', () => {
  it('1 while Turbo runs, 0 when off or another super runs', () => {
    expect(turboIntensity('turbo', 4, 0)).toBe(1);
    expect(turboIntensity('turbo', TURBO_FADE_SEC, 0)).toBe(1);
    expect(turboIntensity(null, 4, 0)).toBe(0);
    expect(turboIntensity('homing', 4, 0)).toBe(0);
    expect(turboIntensity('turbo', 0, 0)).toBe(0);
  });

  it('fades and blinks over the last TURBO_FADE_SEC', () => {
    const t = TURBO_FADE_SEC / 2;
    const levels = new Set<number>();
    for (let k = 0; k < 60; k++) levels.add(Math.round(turboIntensity('turbo', t, k / 60) * 1000));
    expect(levels.size).toBe(2);
    for (const l of levels) expect(l / 1000).toBeLessThanOrEqual(0.5 + 1e-9);
  });
});

describe('turbo multipliers', () => {
  it('width, rate and glow are 1 at intensity 0 and full at 1', () => {
    expect(turboWidth(0)).toBe(1);
    expect(turboWidth(1)).toBeCloseTo(TURBO_WIDTH_MUL, 9);
    expect(turboRate(0)).toBe(1);
    expect(turboRate(1)).toBeCloseTo(TURBO_RATE_MUL, 9);
    expect(turboGlow(0, 1)).toBe(1);
    const g = turboGlow(1, 0.3);
    expect(g).toBeGreaterThan(1);
    expect(g).toBeLessThanOrEqual(1 + TURBO_GLOW_MUL + 1e-9);
  });

  it('comet alpha: unchanged off, floored and boosted on, never above 1', () => {
    expect(turboCometAlpha(0.3, 200, 0)).toBe(0.3);
    expect(turboCometAlpha(0, 10, 1)).toBe(0);
    expect(turboCometAlpha(0, 30, 1)).toBeGreaterThanOrEqual(TURBO_ALPHA_FLOOR);
    expect(turboCometAlpha(0.5, 200, 1)).toBeGreaterThan(0.5);
    expect(turboCometAlpha(1, 400, 1)).toBe(1);
    expect(turboCometAlpha(Number.NaN, 400, 1)).toBeLessThanOrEqual(1);
  });
});

describe('comet width multiplier', () => {
  function headHalfWidth(mul: number | undefined): number {
    const c = createComet();
    for (let k = 0; k < 30; k++) pushComet(c, k * 10, 0, 1 / 60);
    const out = new Float32Array(COMET_VERTS * 2);
    if (mul === undefined) writeCometStrip(c, 300, 0, out);
    else writeCometStrip(c, 300, 0, out, mul);
    return Math.hypot((out[0] ?? 0) - (out[2] ?? 0), (out[1] ?? 0) - (out[3] ?? 0)) / 2;
  }

  it('defaults to the v1 half width and scales by the multiplier', () => {
    expect(headHalfWidth(undefined)).toBeCloseTo(COMET_HALF_W, 4);
    expect(headHalfWidth(TURBO_WIDTH_MUL)).toBeCloseTo(COMET_HALF_W * TURBO_WIDTH_MUL, 4);
    expect(headHalfWidth(Number.NaN)).toBeCloseTo(COMET_HALF_W, 4);
    expect(headHalfWidth(-2)).toBeCloseTo(COMET_HALF_W, 4);
  });
});
