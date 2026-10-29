// Sprite instance buffer and atlas layout (src/render/fxSprites.ts).
import { describe, expect, it } from 'vitest';
import {
  ATLAS_CELLS,
  countFrame,
  createSpriteBuf,
  F_BAR,
  F_SOFT,
  FRAME_COUNT,
  FX_ATLAS_H,
  FX_ATLAS_W,
  fxHalo,
  pushArc,
  pushLine,
  pushSprite,
  resetSpriteBuf,
} from '../../src/render/fxSprites';
import { neonParams, neonRender } from '../../src/render/neon';

describe('sprite buffer', () => {
  it('appends up to its cap, then drops and counts', () => {
    const b = createSpriteBuf(2);
    expect(pushSprite(b, F_BAR, 0, 0, 0, 10, 2, 1, 0xff0000)).toBe(true);
    expect(pushSprite(b, F_BAR, 0, 0, 0, 10, 2, 1, 0xff0000)).toBe(true);
    expect(pushSprite(b, F_BAR, 0, 0, 0, 10, 2, 1, 0xff0000)).toBe(false);
    expect(b.count).toBe(2);
    expect(b.dropped).toBe(1);
    resetSpriteBuf(b);
    expect(b.count).toBe(0);
    expect(b.dropped).toBe(0);
  });

  it('skips invisible or empty instances, clamps alpha to 1', () => {
    const b = createSpriteBuf(4);
    expect(pushSprite(b, F_BAR, 0, 0, 0, 10, 2, 0, 0)).toBe(false);
    expect(pushSprite(b, F_BAR, 0, 0, 0, 0, 2, 1, 0)).toBe(false);
    expect(pushSprite(b, F_BAR, 0, 0, 0, 10, 2, Number.NaN, 0)).toBe(false);
    pushSprite(b, F_BAR, 0, 0, 0, 10, 2, 3, 0);
    expect(b.alpha[0]).toBe(1);
  });

  it('a line is a halo and a core along its length; no halo at alpha 0', () => {
    const b = createSpriteBuf(8);
    expect(pushLine(b, 0, 0, 100, 0, 2, 1, 0xffffff, { alpha: 0.5, width: 3 })).toBe(2);
    expect(countFrame(b, F_SOFT)).toBe(1);
    expect(b.w[1]).toBeCloseTo(100, 5);
    expect(b.x[1]).toBeCloseTo(50, 5);
    resetSpriteBuf(b);
    expect(pushLine(b, 0, 0, 100, 0, 2, 1, 0xffffff, { alpha: 0, width: 3 })).toBe(1);
    expect(pushLine(b, 5, 5, 5, 5, 2, 1, 0xffffff, { alpha: 0, width: 3 })).toBe(0);
  });

  it('an arc writes n segments whose midpoints sit near the radius', () => {
    const b = createSpriteBuf(64);
    expect(pushArc(b, 0, 0, 100, 0, Math.PI, 16, 2, 1, 0xffffff, { alpha: 0, width: 0 })).toBe(16);
    for (let i = 0; i < b.count; i++) expect(Math.hypot(b.x[i] ?? 0, b.y[i] ?? 0)).toBeGreaterThan(99);
  });
});

describe('atlas layout', () => {
  it('one cell per frame, inside the atlas, none overlapping', () => {
    expect(ATLAS_CELLS).toHaveLength(FRAME_COUNT);
    for (const c of ATLAS_CELLS) {
      expect(c.x + c.w).toBeLessThanOrEqual(FX_ATLAS_W);
      expect(c.y + c.h).toBeLessThanOrEqual(FX_ATLAS_H);
      expect(c.unitW).toBeGreaterThan(0);
      expect(c.unitH).toBeGreaterThan(0);
    }
    for (let i = 0; i < ATLAS_CELLS.length; i++) {
      for (let j = i + 1; j < ATLAS_CELLS.length; j++) {
        const a = ATLAS_CELLS[i];
        const b = ATLAS_CELLS[j];
        if (!a || !b) continue;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `cells ${i} and ${j}`).toBe(true);
      }
    }
  });
});

describe('halo follows applyNeon on both glow paths', () => {
  it('rises with the slider on the bloom and the fallback path', () => {
    const out = { alpha: 0, width: 0 };
    for (const bloomOn of [true, false]) {
      let prevA = -1;
      let prevW = -1;
      for (const n of [0, 25, 50, 70, 100]) {
        fxHalo(neonRender(neonParams(n)), bloomOn, out);
        expect(out.alpha).toBeGreaterThan(prevA);
        expect(out.width).toBeGreaterThanOrEqual(prevW);
        expect(out.alpha).toBeLessThanOrEqual(1);
        prevA = out.alpha;
        prevW = out.width;
      }
    }
  });
});
