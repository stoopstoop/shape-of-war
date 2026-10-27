import { describe, expect, it } from 'vitest';
import { capDpr, fitArena, HUD_TOP, viewportLine } from '../../src/core/viewport';

const none = { top: 0, right: 0, bottom: 0, left: 0 };

describe('viewport helpers', () => {
  it('caps DPR at 2 and repairs bad input', () => {
    expect(capDpr(2.625)).toBe(2);
    expect(capDpr(1.5)).toBe(1.5);
    expect(capDpr(0)).toBe(1);
    expect(capDpr(Number.NaN)).toBe(1);
  });

  it('fits a 1400 x 900 arena on a 21:9 cover viewport, height bound', () => {
    const f = fitArena(960, 412, none, 1400, 900);
    expect(f.scale).toBeCloseTo((412 - HUD_TOP) / 900);
    expect(f.x).toBe(480);
    expect(f.y).toBeCloseTo(HUD_TOP + (412 - HUD_TOP) / 2);
  });

  it('fits on a near square main viewport, width bound, respecting insets', () => {
    const ins = { top: 10, right: 20, bottom: 0, left: 30 };
    const f = fitArena(800, 720, ins, 1400, 900);
    expect(f.scale).toBeCloseTo(750 / 1400);
    expect(f.x).toBeCloseTo(30 + 375);
    // Whole arena stays inside the safe rect.
    expect(f.y - (900 * f.scale) / 2).toBeGreaterThanOrEqual(10 + HUD_TOP - 1e-9);
    expect(f.x + (1400 * f.scale) / 2).toBeLessThanOrEqual(800 - 20 + 1e-9);
  });

  it('formats the G0 log line', () => {
    expect(viewportLine(960, 412, 2.6250000001)).toBe('[sow] viewport 960x412 @ 2.625');
  });
});
