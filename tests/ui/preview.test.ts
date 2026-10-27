import { describe, expect, it } from 'vitest';
import { inlineRectLevel, liveEnemies } from '../../src/game/world';
import { createPreviewWorld, PREVIEW_KINDS, previewRect, previewSlot, stepPreview } from '../../src/ui/preview';

describe('settings preview arena', () => {
  it('spawns one of each preview kind, the same way every time', () => {
    const a = createPreviewWorld(inlineRectLevel(1));
    const b = createPreviewWorld(inlineRectLevel(1));
    expect(liveEnemies(a)).toBe(PREVIEW_KINDS.length);
    expect(Array.from(a.x)).toEqual(Array.from(b.x));
    expect(previewSlot(3, 1000, 800)).toEqual(previewSlot(3, 1000, 800));
  });

  it('drifts and stays inside the arena', () => {
    const level = inlineRectLevel(1);
    const w = createPreviewWorld(level);
    const x0 = Array.from(w.x);
    for (let i = 0; i < 600; i++) stepPreview(w, 1 / 60);
    expect(Array.from(w.x)).not.toEqual(x0);
    for (let id = 1; id < w.cap; id++) {
      if (w.alive[id] !== 1) continue;
      expect(Math.abs(w.x[id] ?? 0)).toBeLessThanOrEqual(level.arena.width / 2);
      expect(Math.abs(w.y[id] ?? 0)).toBeLessThanOrEqual(level.arena.height / 2);
    }
  });

  it('clamps a stalled frame', () => {
    const w = createPreviewWorld(inlineRectLevel(1));
    stepPreview(w, 5);
    expect(w.time).toBeCloseTo(0.05);
  });

  it('play rect sits right of the settings panel', () => {
    const z = { top: 0, right: 0, bottom: 0, left: 0 };
    const r = previewRect(1000, 400, z);
    expect(r.x).toBe(460);
    expect(r.w).toBe(540);
    expect(r.h).toBe(400);
    const narrow = previewRect(600, 600, { top: 10, right: 5, bottom: 10, left: 5 });
    expect(narrow.x).toBeCloseTo(5 + 288 + 20);
    expect(narrow.y).toBe(10);
    expect(narrow.h).toBe(580);
  });
});
