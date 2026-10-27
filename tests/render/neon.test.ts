import { describe, expect, it } from 'vitest';
import { hslToRgbInt } from '../../src/render/color';
import {
  applyNeon,
  BASE_PALETTE,
  BLOOM_GAIN,
  computePalette,
  current,
  neonParams,
  neonRender,
  onNeonChanged,
  palette,
  paletteColour,
  PALETTE_KEYS,
  type NeonParams,
} from '../../src/render/neon';

const KEYS: (keyof NeonParams)[] = ['bloomScale', 'threshold', 'saturation', 'glowAlpha', 'gridAlpha'];

function expectParams(p: NeonParams, want: NeonParams): void {
  for (const k of KEYS) expect(p[k]).toBeCloseTo(want[k], 10);
}

describe('neonParams', () => {
  it('maps n = 0 to the SPEC 4 low ends', () => {
    expectParams(neonParams(0), { bloomScale: 0, threshold: 0.8, saturation: 0.4, glowAlpha: 0, gridAlpha: 0.1 });
  });

  it('maps n = 70 (default) linearly', () => {
    expectParams(neonParams(70), { bloomScale: 1.4, threshold: 0.38, saturation: 1.03, glowAlpha: 0.63, gridAlpha: 0.45 });
  });

  it('maps n = 100 to the SPEC 4 high ends', () => {
    expectParams(neonParams(100), { bloomScale: 2, threshold: 0.2, saturation: 1.3, glowAlpha: 0.9, gridAlpha: 0.6 });
  });

  it('clamps below 0 and above 100', () => {
    expectParams(neonParams(-25), neonParams(0));
    expectParams(neonParams(-0.4), neonParams(0));
    expectParams(neonParams(250), neonParams(100));
    expectParams(neonParams(Number.POSITIVE_INFINITY), neonParams(70));
    expectParams(neonParams(Number.NaN), neonParams(70));
  });

  it('is monotonic: threshold falls, everything else rises', () => {
    for (let n = 0; n < 100; n++) {
      const a = neonParams(n);
      const b = neonParams(n + 1);
      expect(b.bloomScale).toBeGreaterThan(a.bloomScale);
      expect(b.saturation).toBeGreaterThan(a.saturation);
      expect(b.glowAlpha).toBeGreaterThan(a.glowAlpha);
      expect(b.gridAlpha).toBeGreaterThan(a.gridAlpha);
      expect(b.threshold).toBeLessThan(a.threshold);
    }
  });
});

describe('palette', () => {
  it('a known HSL base gives a known hex at saturation 1.0', () => {
    // blue = hsl(215, 0.75, 0.55): r 54, g 126, b 226.
    expect(paletteColour('blue', 1.0)).toBe(0x367ee2);
    expect(paletteColour('white', 1.0)).toBe(0xf2f2f2);
    expect(paletteColour('ship', 1.0)).toBe(0xffffff);
    expect(hslToRgbInt(0, 1, 0.5)).toBe(0xff0000);
    expect(hslToRgbInt(120, 1, 0.5)).toBe(0x00ff00);
    expect(hslToRgbInt(240, 1, 0.5)).toBe(0x0000ff);
  });

  it('saturation 0 gives greys and saturation is clamped to 1', () => {
    const grey = paletteColour('blue', 0);
    expect(grey >> 16).toBe((grey >> 8) & 0xff);
    expect((grey >> 8) & 0xff).toBe(grey & 0xff);
    // 0.75 x 1.4 clips at 1.0, same as 0.75 x 1.3333.
    expect(paletteColour('blue', 1.4)).toBe(paletteColour('blue', 1 / 0.75));
  });

  it('computePalette covers every base key', () => {
    const p = computePalette(1);
    expect(Object.keys(p).sort()).toEqual(Object.keys(BASE_PALETTE).sort());
  });
});

describe('neonRender richer default look', () => {
  it('at neon 70: thick glow lines, strong bloom, visible trails, bright bloom sources', () => {
    const r = neonRender(neonParams(70));
    expect(r.bloomStrength).toBeCloseTo(1.4 * BLOOM_GAIN, 10);
    expect(BLOOM_GAIN).toBeGreaterThanOrEqual(1.8);
    expect(r.coreWidthMul).toBeGreaterThanOrEqual(1.6);
    expect(r.haloWidthMul).toBeGreaterThanOrEqual(5);
    expect(r.trailAlpha).toBeGreaterThanOrEqual(0.8);
    expect(r.bloomSourceAlpha).toBeGreaterThan(0.7);
    expect(r.wallWidthMul).toBeGreaterThan(1);
  });

  it('every derived setting stays monotonic in the slider', () => {
    for (let n = 0; n < 100; n++) {
      const a = neonRender(neonParams(n));
      const b = neonRender(neonParams(n + 1));
      expect(b.bloomStrength).toBeGreaterThan(a.bloomStrength);
      expect(b.coreWidthMul).toBeGreaterThan(a.coreWidthMul);
      expect(b.trailAlpha).toBeGreaterThan(a.trailAlpha);
      expect(b.wallWidthMul).toBeGreaterThan(a.wallWidthMul);
      expect(b.bloomSourceAlpha).toBeGreaterThanOrEqual(a.bloomSourceAlpha);
    }
  });

  it('homing bullets get their own colour, apart from the yellow shot', () => {
    expect(paletteColour('homing', 1)).not.toBe(paletteColour('yellow', 1));
  });
});

describe('applyNeon', () => {
  it('recomputes palette in place, sets current and emits neon:changed', () => {
    const seen: NeonParams[] = [];
    const off = onNeonChanged((p) => seen.push(p));
    const ref = palette;
    applyNeon(0);
    expect(seen).toHaveLength(1);
    expectParams(seen[0] ?? neonParams(70), neonParams(0));
    for (const k of PALETTE_KEYS) expect(palette[k]).toBe(paletteColour(k, 0.4));
    expect(palette).toBe(ref);
    applyNeon(100);
    expect(current.glowAlpha).toBeCloseTo(0.9, 10);
    off();
    applyNeon(70);
    expect(seen).toHaveLength(2);
  });
});
