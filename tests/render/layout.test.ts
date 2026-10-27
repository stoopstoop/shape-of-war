import { describe, expect, it } from 'vitest';
import {
  backingSize,
  BLOOM_FACTOR_DPR1,
  BLOOM_FACTOR_DPR2,
  bloomResolution,
  bloomResolutionFactor,
  bulletRenderPos,
  DEFAULT_BLOOM_KNOBS,
  DPR_CAP,
  fitArena,
  glowSpriteScale,
  gruntPulse,
  interp,
  parseBloomKnobs,
  renderResolution,
  screenRectInWorld,
  superFired,
  TELEGRAPH_ALPHA,
  TELEGRAPH_ALPHA_LOW,
  telegraphAlpha,
  type SuperWatch,
} from '../../src/render/layout';

// Render resolution chain (B4 pixelation fix).
describe('renderResolution', () => {
  it('returns min(dpr, 2)', () => {
    for (const dpr of [0.5, 1, 1.25, 1.5, 1.75, 2, 2.625, 3, 4]) {
      expect(renderResolution(dpr)).toBe(Math.min(dpr, 2));
    }
    expect(DPR_CAP).toBe(2);
  });

  it('reads missing or bad input as 1', () => {
    expect(renderResolution(0)).toBe(1);
    expect(renderResolution(-2)).toBe(1);
    expect(renderResolution(Number.NaN)).toBe(1);
    expect(renderResolution(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('bloom resolution policy', () => {
  it('factor is 1.0 at DPR 1 and 0.75 at DPR 2', () => {
    expect(BLOOM_FACTOR_DPR1).toBe(1);
    expect(BLOOM_FACTOR_DPR2).toBe(0.75);
    expect(bloomResolutionFactor(1)).toBe(1);
    expect(bloomResolutionFactor(2)).toBe(0.75);
    expect(bloomResolutionFactor(0.75)).toBe(1);
    expect(bloomResolutionFactor(2.625)).toBe(0.75); // Z Fold 7 class DPR, capped at 2
    expect(bloomResolutionFactor(1.5)).toBeCloseTo(0.875, 10);
  });

  it('absolute filter resolution is renderResolution x factor, never the old 0.5', () => {
    expect(bloomResolution(1)).toBe(1);
    expect(bloomResolution(2)).toBe(1.5);
    expect(bloomResolution(3)).toBe(1.5);
    for (let d = 0.5; d <= 4; d += 0.125) {
      expect(bloomResolution(d)).toBeCloseTo(renderResolution(d) * bloomResolutionFactor(d), 10);
      expect(bloomResolution(d)).toBeGreaterThanOrEqual(0.75 * renderResolution(d) - 1e-9);
      expect(bloomResolution(d)).toBeLessThanOrEqual(renderResolution(d));
    }
  });

  it('a ?bloomRes override replaces the factor, clamped to 0.2..1', () => {
    expect(bloomResolution(2, 0.5)).toBe(1);
    expect(bloomResolutionFactor(2, 5)).toBe(1);
    expect(bloomResolutionFactor(2, 0.01)).toBe(0.2);
    expect(bloomResolutionFactor(2, null)).toBe(0.75);
    expect(parseBloomKnobs('').resolution).toBeNull();
    expect(parseBloomKnobs('?bloomRes=0.6').resolution).toBe(0.6);
    expect(parseBloomKnobs('?bloomRes=abc').resolution).toBeNull();
  });

  it('backing store is CSS size x resolution', () => {
    expect(backingSize(904, 816, 2)).toEqual({ w: 1808, h: 1632 });
    expect(backingSize(412, 915, 1.75)).toEqual({ w: 721, h: 1601 });
  });
});

describe('telegraph flash', () => {
  it('live entities draw at full alpha', () => {
    expect(telegraphAlpha(0)).toBe(1);
    expect(telegraphAlpha(-1)).toBe(1);
    expect(telegraphAlpha(Number.NaN)).toBe(1);
  });

  it('telegraphing entities flash between 50 percent and the low phase', () => {
    const seen = new Set<number>();
    for (let t = 0.01; t < 1; t += 0.01) {
      const a = telegraphAlpha(t);
      expect([TELEGRAPH_ALPHA, TELEGRAPH_ALPHA_LOW]).toContain(a);
      seen.add(a);
    }
    expect(seen.size).toBe(2);
    expect(TELEGRAPH_ALPHA).toBe(0.5);
  });
});

describe('super activation edge', () => {
  const idle: SuperWatch = { active: null, timer: 0, droneAbsent: 0 };

  it('fires when a timed super starts or is re-armed', () => {
    expect(superFired(idle, { active: 'homing', timer: 5, droneAbsent: 0 })).toBe(true);
    expect(superFired({ active: 'homing', timer: 4.9, droneAbsent: 0 }, { active: 'homing', timer: 4.8, droneAbsent: 0 })).toBe(false);
    expect(superFired({ active: 'turbo', timer: 1, droneAbsent: 0 }, { active: 'turbo', timer: 5, droneAbsent: 0 })).toBe(true);
    expect(superFired({ active: 'turbo', timer: 0.01, droneAbsent: 0 }, idle)).toBe(false);
  });

  it('fires when Detonate starts the drone absence', () => {
    expect(superFired(idle, { active: null, timer: 0, droneAbsent: 3 })).toBe(true);
    expect(superFired({ active: null, timer: 0, droneAbsent: 3 }, { active: null, timer: 0, droneAbsent: 2.99 })).toBe(false);
  });
});

describe('layout', () => {
  it('fits the arena by the tighter axis and centres it', () => {
    const f = fitArena(1000, 500, { x: 0, y: 0, w: 2000, h: 2000 }, 0);
    expect(f.scale).toBe(2);
    expect(f.x).toBe(1000);
    expect(f.y).toBe(1000);
    const g = fitArena(1000, 1000, { x: 10, y: 52, w: 900, h: 400 }, 0);
    expect(g.scale).toBeCloseTo(0.4, 10);
    expect(g.x).toBe(460);
    expect(g.y).toBe(252);
  });

  it('maps the screen into world local space for filterArea', () => {
    const fit = { scale: 2, x: 400, y: 300 };
    expect(screenRectInWorld(800, 600, fit)).toEqual({ x: -200, y: -150, w: 400, h: 300 });
  });

  it('interpolates and extrapolates', () => {
    expect(interp(0, 10, 0.25)).toBe(2.5);
    expect(bulletRenderPos(100, 1200, 1, 1 / 120)).toBe(100);
    expect(bulletRenderPos(100, 1200, 0, 1 / 120)).toBeCloseTo(90, 10);
  });

  it('glow sprite scale and grunt pulse ranges', () => {
    expect(glowSpriteScale(0)).toBe(1);
    expect(glowSpriteScale(2)).toBe(1.5);
    for (let t = 0; t < 2; t += 0.01) {
      const s = gruntPulse(t, 0.3);
      expect(s).toBeGreaterThanOrEqual(0.85 - 1e-9);
      expect(s).toBeLessThanOrEqual(1.15 + 1e-9);
    }
  });

  it('parses bloom knobs with clamps and defaults', () => {
    expect(parseBloomKnobs('')).toEqual(DEFAULT_BLOOM_KNOBS);
    expect(parseBloomKnobs('?bloomRes=0.35&bloomQuality=3&bloomBlur=4')).toEqual({ resolution: 0.35, quality: 3, blur: 4 });
    expect(parseBloomKnobs('?bloomRes=9&bloomQuality=x')).toEqual({ resolution: 1, quality: 4, blur: 6 });
  });
});
