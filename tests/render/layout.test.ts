import { describe, expect, it } from 'vitest';
import {
  bulletRenderPos,
  DEFAULT_BLOOM_KNOBS,
  fitArena,
  glowSpriteScale,
  gruntPulse,
  interp,
  parseBloomKnobs,
  screenRectInWorld,
} from '../../src/render/layout';

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
