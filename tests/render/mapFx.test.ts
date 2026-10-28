// Threat driven map effects (docs/10 wave C Glow item 4). Pure, no pixi.js.
import { describe, expect, it } from 'vitest';
import type { ArenaDef } from '../../src/levelgen/leveldef';
import {
  clampThreat,
  createWallHit,
  easeThreat,
  FLASH_HALF_LEN,
  FLASH_LIFE,
  FLASH_RANGE,
  flashFade,
  flashStrength,
  mapFxNeonGain,
  mixRgb,
  nearestWall,
  PULSE_AMP_MAX,
  PULSE_AMP_MIN,
  PULSE_HZ_MAX,
  PULSE_HZ_MIN,
  rayWallDistance,
  threatPulse,
  wallFeatures,
  wallPulseAlpha,
  type ThreatPulse,
} from '../../src/render/mapFx';

function arena(shape: ArenaDef['shape'], width: number, height: number, extra: Partial<ArenaDef> = {}): ArenaDef {
  return { shape, width, height, cornerRadius: 0, obstacles: [], spawnPoint: { x: 0, y: 0 }, ...extra };
}

describe('threat to pulse mapping', () => {
  it('amplitude and frequency are monotonic in the threat level and bounded', () => {
    const p: ThreatPulse = { amp: 0, hz: 0 };
    let prevAmp = -1;
    let prevHz = -1;
    for (let l = 0; l <= 1.0001; l += 0.01) {
      threatPulse(l, p);
      expect(p.amp).toBeGreaterThan(prevAmp);
      expect(p.hz).toBeGreaterThan(prevHz);
      expect(p.amp).toBeGreaterThanOrEqual(PULSE_AMP_MIN);
      expect(p.amp).toBeLessThanOrEqual(PULSE_AMP_MAX);
      expect(p.hz).toBeGreaterThanOrEqual(PULSE_HZ_MIN);
      expect(p.hz).toBeLessThanOrEqual(PULSE_HZ_MAX);
      prevAmp = p.amp;
      prevHz = p.hz;
    }
  });

  it('out of range, NaN and infinite levels clamp into the bounds', () => {
    const p: ThreatPulse = { amp: 0, hz: 0 };
    expect(threatPulse(-3, p).amp).toBe(PULSE_AMP_MIN);
    expect(threatPulse(7, p).amp).toBe(PULSE_AMP_MAX);
    expect(threatPulse(Number.NaN, p).amp).toBe(PULSE_AMP_MIN);
    expect(threatPulse(Number.POSITIVE_INFINITY, p).amp).toBe(PULSE_AMP_MIN);
    expect(clampThreat(2)).toBe(1);
    expect(clampThreat(-1)).toBe(0);
    expect(clampThreat(Number.NaN)).toBe(0);
  });

  it('pulse layer alpha stays in [0, max] and its peak over a cycle rises with the threat', () => {
    const p: ThreatPulse = { amp: 0, hz: 0 };
    let prevPeak = -1;
    for (let l = 0; l <= 1.0001; l += 0.05) {
      threatPulse(l, p);
      let peak = 0;
      for (let ph = 0; ph < 1; ph += 0.01) {
        const a = wallPulseAlpha(p.amp, ph);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(PULSE_AMP_MAX);
        peak = Math.max(peak, a);
      }
      expect(peak).toBeGreaterThan(prevPeak);
      prevPeak = peak;
    }
    expect(wallPulseAlpha(99, 0.5)).toBeCloseTo(PULSE_AMP_MAX, 9);
    expect(wallPulseAlpha(Number.NaN, 0.5)).toBe(0);
    expect(wallPulseAlpha(0.3, Number.NaN)).toBe(0);
  });

  it('eased threat moves toward the target without overshoot, frame rate independent', () => {
    let a = 0;
    for (let i = 0; i < 120; i++) {
      const next = easeThreat(a, 1, 1 / 120);
      expect(next).toBeGreaterThan(a);
      expect(next).toBeLessThanOrEqual(1);
      a = next;
    }
    let b = 0;
    for (let i = 0; i < 60; i++) b = easeThreat(b, 1, 1 / 60);
    expect(a).toBeCloseTo(b, 6);
    expect(easeThreat(0.5, 0.2, 0)).toBe(0.5);
    expect(easeThreat(0.5, 5, 10)).toBeCloseTo(1, 3);
  });

  it('neon gain is monotonic in the glow alpha and bounded to [0.3, 1]', () => {
    let prev = 0;
    for (let g = 0; g <= 0.9; g += 0.01) {
      const v = mapFxNeonGain(g);
      expect(v).toBeGreaterThan(prev);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
    expect(mapFxNeonGain(0)).toBeCloseTo(0.3, 9);
    expect(mapFxNeonGain(0.9)).toBeCloseTo(1, 9);
    expect(mapFxNeonGain(Number.NaN)).toBeCloseTo(0.3, 9);
  });

  it('mixRgb hits both ends and the midpoint', () => {
    expect(mixRgb(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mixRgb(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mixRgb(0x000000, 0xff8040, 0.5)).toBe(0x804020);
    expect(mixRgb(0x123456, 0xabcdef, 9)).toBe(0xabcdef);
  });
});

describe('wall flash', () => {
  it('strength is 1 at the wall, falls with distance and is 0 beyond 120 u', () => {
    expect(FLASH_RANGE).toBe(120);
    expect(flashStrength(0)).toBe(1);
    expect(flashStrength(121)).toBe(0);
    expect(flashStrength(Number.POSITIVE_INFINITY)).toBe(0);
    let prev = 2;
    for (let d = 0; d <= 120; d += 5) {
      const s = flashStrength(d);
      expect(s).toBeLessThan(prev);
      expect(s).toBeGreaterThan(0);
      prev = s;
    }
  });

  it('fades out over its life', () => {
    expect(flashFade(0)).toBe(1);
    expect(flashFade(FLASH_LIFE)).toBe(0);
    expect(flashFade(FLASH_LIFE / 2)).toBeCloseTo(0.5, 9);
    expect(flashFade(-1)).toBe(0);
  });

  it('rect: nearest wall, distance and a flash span of about 180 u along it', () => {
    const f = wallFeatures(arena('rect', 1000, 600));
    expect(f).toHaveLength(4);
    const hit = nearestWall(f, 450, 0, createWallHit());
    expect(hit.dist).toBeCloseTo(50, 6);
    expect(hit.x).toBeCloseTo(500, 6);
    expect(hit.y).toBeCloseTo(0, 6);
    const wall = f[hit.feature];
    expect(wall?.t).toBe('seg');
    if (wall?.t === 'seg') {
      const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      expect((hit.s1 - hit.s0) * len).toBeCloseTo(FLASH_HALF_LEN * 2, 3);
    }
    // A kill in the centre is far from every wall: no flash.
    expect(flashStrength(nearestWall(f, 0, 0, createWallHit()).dist)).toBe(0);
  });

  it('a flash near a corner is clipped to the segment', () => {
    const f = wallFeatures(arena('rect', 1000, 600));
    const hit = nearestWall(f, 490, -295, createWallHit());
    expect(hit.dist).toBeLessThan(10);
    expect(hit.s0).toBeGreaterThanOrEqual(0);
    expect(hit.s1).toBeLessThanOrEqual(1);
  });

  it('circle, hexagon, rounded rect and obstacles give the expected distances', () => {
    const c = wallFeatures(arena('circle', 800, 800));
    expect(nearestWall(c, 0, 350, createWallHit()).dist).toBeCloseTo(50, 6);
    const ch = nearestWall(c, -300, 0, createWallHit());
    expect(ch.x).toBeCloseTo(-400, 6);
    expect(ch.s1 - ch.s0).toBeCloseTo((FLASH_HALF_LEN * 2) / 400, 6);
    const h = wallFeatures(arena('hexagon', 1000, 800));
    expect(h).toHaveLength(6);
    expect(nearestWall(h, 0, 380, createWallHit()).dist).toBeCloseTo(20, 6);
    const rr = wallFeatures(arena('roundRect', 1000, 600, { cornerRadius: 100 }));
    expect(rr).toHaveLength(8);
    // Point on the corner's diagonal, 30 u inside the arc.
    const k = 400 + Math.SQRT1_2 * 70;
    expect(nearestWall(rr, k, -200 - Math.SQRT1_2 * 70, createWallHit()).dist).toBeCloseTo(30, 4);
    const ob = wallFeatures(arena('rectObstacles', 1000, 600, { obstacles: [{ cx: 0, cy: 0, w: 100, h: 100 }] }));
    expect(ob).toHaveLength(8);
    expect(nearestWall(ob, 0, 80, createWallHit()).dist).toBeCloseTo(30, 6);
  });
});

describe('charger lane clip', () => {
  it('stops at the first wall and never exceeds the lane length', () => {
    const f = wallFeatures(arena('rect', 1000, 600));
    expect(rayWallDistance(f, 0, 0, 1, 0, 600)).toBeCloseTo(500, 6);
    expect(rayWallDistance(f, 0, 0, 0, 1, 600)).toBeCloseTo(300, 6);
    expect(rayWallDistance(f, -400, 0, 1, 0, 600)).toBe(600);
    const c = wallFeatures(arena('circle', 800, 800));
    expect(rayWallDistance(c, 0, 0, 0, -1, 600)).toBeCloseTo(400, 6);
    expect(rayWallDistance(c, 300, 0, 1, 0, 600)).toBeCloseTo(100, 6);
    const ob = wallFeatures(arena('rectObstacles', 1000, 600, { obstacles: [{ cx: 200, cy: 0, w: 100, h: 100 }] }));
    expect(rayWallDistance(ob, 0, 0, 1, 0, 600)).toBeCloseTo(150, 6);
  });
});
