import { describe, expect, it } from 'vitest';
import {
  ATLAS_CELLS,
  ATLAS_H,
  ATLAS_W,
  BULLET_FRAMES,
  bulletStyleVisual,
  crescentPoints,
  HOMING_TRAIL_LEN_U,
  SPREAD_TRAIL_LEN_U,
  SPREAD_TRAIL_THICK,
  styleCode,
  visualForCode,
  weaponTint,
} from '../../src/render/bulletStyles';
import { BASE_PALETTE } from '../../src/render/neon';

describe('bullet style to texture mapping', () => {
  it('maps each BulletPool.style to its own atlas frame and colour', () => {
    expect(bulletStyleVisual(0, false).frame).toBe('dot');
    expect(bulletStyleVisual(1, false).frame).toBe('rapid');
    expect(bulletStyleVisual(2, false).frame).toBe('pierce');
    expect(bulletStyleVisual(3, false).frame).toBe('orbit');
    expect(bulletStyleVisual(0, false).tint).toBe('yellow');
    expect(bulletStyleVisual(1, false).tint).toBe('rapid');
    expect(bulletStyleVisual(2, false).tint).toBe('pierce');
    expect(bulletStyleVisual(3, false).tint).toBe('orbit');
    const frames = new Set([0, 1, 2, 3].map((s) => bulletStyleVisual(s, false).frame));
    expect(frames.size).toBe(4);
  });

  it('spread is exactly the v1 bullet: dot at 0.75, 44 u trail, no particle trail', () => {
    const v = bulletStyleVisual(0, false);
    expect(v.scale).toBe(0.75);
    expect(v.anchorX).toBe(0.5);
    expect(v.trailLenU).toBe(SPREAD_TRAIL_LEN_U);
    expect(SPREAD_TRAIL_LEN_U).toBe(44);
    expect(v.trailThick).toBe(SPREAD_TRAIL_THICK);
    expect(v.emitsTrail).toBe(false);
  });

  it('rapid and pierce emit particle trails, spread and orbit do not', () => {
    expect([0, 1, 2, 3].map((s) => bulletStyleVisual(s, false).emitsTrail)).toEqual([false, true, true, false]);
  });

  it('pierce has the longest attached trail, orbit none, orbit turns radially', () => {
    const lens = [0, 1, 2, 3].map((s) => bulletStyleVisual(s, false).trailLenU);
    expect(lens[2]).toBeGreaterThan(lens[0] ?? 0);
    expect(lens[3]).toBe(0);
    expect(bulletStyleVisual(3, false).orient).toBe('radial');
    expect(bulletStyleVisual(1, false).orient).toBe('velocity');
  });

  it('homing keeps the frame, takes the homing colour and the long trail for the dot', () => {
    for (const s of [0, 1, 2, 3]) {
      const h = bulletStyleVisual(s, true);
      expect(h.frame).toBe(bulletStyleVisual(s, false).frame);
      expect(h.tint).toBe('homing');
    }
    expect(bulletStyleVisual(0, true).trailLenU).toBe(HOMING_TRAIL_LEN_U);
    expect(bulletStyleVisual(3, true).trailLenU).toBe(0);
  });

  it('unknown styles draw as spread and the same constant is returned (no allocation)', () => {
    expect(bulletStyleVisual(7, false)).toBe(bulletStyleVisual(0, false));
    expect(bulletStyleVisual(-1, false)).toBe(bulletStyleVisual(0, false));
    expect(bulletStyleVisual(1, false)).toBe(bulletStyleVisual(1, false));
  });

  it('style codes are unique per (style, homing) and decode back', () => {
    const codes = new Set<number>();
    for (const s of [0, 1, 2, 3]) {
      for (const h of [false, true]) {
        const c = styleCode(s, h);
        codes.add(c);
        expect(visualForCode(c)).toBe(bulletStyleVisual(s, h));
      }
    }
    expect(codes.size).toBe(8);
    expect(visualForCode(-1)).toBe(bulletStyleVisual(0, false));
  });

  it('pickup burst colour per weapon matches that weapon bullet colour', () => {
    expect(weaponTint('spread')).toBe(bulletStyleVisual(0, false).tint);
    expect(weaponTint('rapid')).toBe(bulletStyleVisual(1, false).tint);
    expect(weaponTint('pierce')).toBe(bulletStyleVisual(2, false).tint);
    expect(weaponTint('orbit')).toBe(bulletStyleVisual(3, false).tint);
  });

  it('every tint is a palette key', () => {
    for (const s of [0, 1, 2, 3]) {
      for (const h of [false, true]) expect(Object.keys(BASE_PALETTE)).toContain(bulletStyleVisual(s, h).tint);
    }
  });
});

describe('bullet atlas layout', () => {
  it('cells are inside the atlas and do not overlap, with a gutter', () => {
    const cells = BULLET_FRAMES.map((f) => ATLAS_CELLS[f]);
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(1);
      expect(c.y).toBeGreaterThanOrEqual(1);
      expect(c.x + c.w).toBeLessThanOrEqual(ATLAS_W - 1);
      expect(c.y + c.h).toBeLessThanOrEqual(ATLAS_H - 1);
    }
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i];
        const b = cells[j];
        if (!a || !b) continue;
        const apart = a.x + a.w + 1 <= b.x || b.x + b.w + 1 <= a.x || a.y + a.h + 1 <= b.y || b.y + b.h + 1 <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('the dot cell is the 16 px v1 dot', () => {
    expect(ATLAS_CELLS.dot.w).toBe(16);
    expect(ATLAS_CELLS.dot.h).toBe(16);
  });

  it('the pierce lance is the longest frame, the rapid streak the thinnest', () => {
    const widths = BULLET_FRAMES.map((f) => ATLAS_CELLS[f].w);
    expect(Math.max(...widths)).toBe(ATLAS_CELLS.pierce.w);
    const heights = BULLET_FRAMES.map((f) => ATLAS_CELLS[f].h);
    expect(Math.min(...heights)).toBe(ATLAS_CELLS.rapid.h);
  });
});

describe('crescent blade', () => {
  it('is a closed polygon that bulges toward +x and fits its atlas cell', () => {
    const pts = crescentPoints(9, 4, 14);
    expect(pts.length % 2).toBe(0);
    expect(pts.length).toBeGreaterThanOrEqual(12);
    let maxX = -Infinity;
    let minX = Infinity;
    let maxAbsY = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i] ?? 0;
      const y = pts[i + 1] ?? 0;
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      maxX = Math.max(maxX, x);
      minX = Math.min(minX, x);
      maxAbsY = Math.max(maxAbsY, Math.abs(y));
    }
    expect(maxX).toBeCloseTo(9, 5);
    expect(minX).toBeGreaterThanOrEqual(-2 - 1e-6);
    expect(maxAbsY).toBeLessThanOrEqual(9);
    // The cell holds the blade plus its 2 u rim on every side, centred with a 1 u shift.
    expect(2 * (maxAbsY + 2)).toBeLessThanOrEqual(ATLAS_CELLS.orbit.h);
    expect(maxX + 1 + 2).toBeLessThanOrEqual(ATLAS_CELLS.orbit.w / 2);
  });

  it('every inner arc point lies inside the outer circle (the blade has thickness)', () => {
    const pts = crescentPoints(9, 4, 14);
    for (let i = 0; i < pts.length; i += 2) {
      expect(Math.hypot(pts[i] ?? 0, pts[i + 1] ?? 0)).toBeLessThanOrEqual(9 + 1e-6);
    }
  });
});
