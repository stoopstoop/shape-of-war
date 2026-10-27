import { describe, expect, it } from 'vitest';
import { angle, clamp, hslToRgbInt, len, lerp, wrapAngle } from '../../src/core/math';

describe('math', () => {
  it('clamp and lerp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  it('len and angle', () => {
    expect(len(3, 4)).toBe(5);
    expect(angle(0, 1)).toBeCloseTo(Math.PI / 2);
    expect(angle(-1, 0)).toBeCloseTo(Math.PI);
  });

  it('wrapAngle maps into (-PI, PI]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(0.5 + 4 * Math.PI)).toBeCloseTo(0.5);
    for (let a = -20; a < 20; a += 0.37) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThan(-Math.PI);
      expect(w).toBeLessThanOrEqual(Math.PI);
    }
  });

  it('hslToRgbInt known values', () => {
    expect(hslToRgbInt(0, 1, 0.5)).toBe(0xff0000);
    expect(hslToRgbInt(120, 1, 0.5)).toBe(0x00ff00);
    expect(hslToRgbInt(240, 1, 0.5)).toBe(0x0000ff);
    expect(hslToRgbInt(0, 0, 1)).toBe(0xffffff);
    expect(hslToRgbInt(0, 0, 0)).toBe(0x000000);
    expect(hslToRgbInt(360 + 60, 1, 0.5)).toBe(0xffff00);
  });
});
