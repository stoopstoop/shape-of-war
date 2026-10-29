// Boss hazard look (src/render/hazardFx.ts): telegraph alpha from age, ring gap to arc, and the five
// primitives as sprite instances in one pooled buffer.
import { describe, expect, it } from 'vitest';
import { countFrame, createSpriteBuf, F_BAR, F_FILL, resetSpriteBuf, type FxHalo, type SpriteBuf } from '../../src/render/fxSprites';
import {
  HAZARD_LANE,
  HAZARD_MAX_INSTANCES,
  HAZARD_PULL,
  HAZARD_RING,
  HAZARD_SPRITE_CAP,
  HAZARD_SWEEP,
  HAZARD_TELEGRAPH_SEC,
  HAZARD_TETHER,
  hazardForm,
  hazardLethal,
  hazardTelegraphAlpha,
  hazardTelegraphSec,
  LETHAL_FLASH_SEC,
  planEntranceRing,
  planHazard,
  PULL_ALPHA,
  pullAlpha,
  pullRipple,
  RING_SEG_MAX,
  RING_SEG_MIN,
  ringGapArc,
  ringSegments,
  sweepArmAngle,
  sweepArms,
  TELE_A0,
  TELE_A1,
  TELE_THICK,
  type HazardInput,
} from '../../src/render/hazardFx';

const NO_HALO: FxHalo = { alpha: 0, width: 0 };
const HALO: FxHalo = { alpha: 0.5, width: 2 };

function hazard(type: number, age: number, extra: Partial<HazardInput> = {}): HazardInput {
  return { type, x: 0, y: 0, rot: 0, radius: 22, vx: 600, vy: 1, age, tier: 1, tint: 0x3366ff, timeSec: 0, ...extra };
}

function maxCoreThick(b: SpriteBuf): number {
  let m = 0;
  for (let i = 0; i < b.count; i++) if (b.frame[i] === F_BAR) m = Math.max(m, b.h[i] ?? 0);
  return m;
}

function maxAlpha(b: SpriteBuf, frame: number): number {
  let m = 0;
  for (let i = 0; i < b.count; i++) if (b.frame[i] === frame) m = Math.max(m, b.alpha[i] ?? 0);
  return m;
}

describe('hazard age to telegraph alpha', () => {
  it('telegraph seconds per tier mirror kit.ts: 1.0, 0.8, 0.6, 0.6', () => {
    expect(HAZARD_TELEGRAPH_SEC).toEqual({ 1: 1.0, 2: 0.8, 3: 0.6, 4: 0.6 });
    expect([1, 2, 3, 4].map(hazardTelegraphSec)).toEqual([1.0, 0.8, 0.6, 0.6]);
  });

  it('dim during the telegraph, rising, then 1 exactly at the tier telegraph', () => {
    for (const tier of [1, 2, 3, 4]) {
      const tele = hazardTelegraphSec(tier);
      expect(hazardTelegraphAlpha(0, tier)).toBeCloseTo(TELE_A0, 6);
      let prev = 0;
      for (let t = 0; t < tele; t += tele / 20) {
        const a = hazardTelegraphAlpha(t, tier);
        expect(a).toBeGreaterThanOrEqual(prev);
        expect(a).toBeLessThanOrEqual(TELE_A1);
        prev = a;
      }
      expect(hazardTelegraphAlpha(tele, tier)).toBe(1);
      expect(hazardTelegraphAlpha(tele + 5, tier)).toBe(1);
      expect(hazardLethal(tele - 1e-6, tier)).toBe(false);
      expect(hazardLethal(tele, tier)).toBe(true);
    }
    expect(hazardTelegraphAlpha(Number.NaN, 1)).toBeCloseTo(TELE_A0, 6);
    expect(hazardTelegraphAlpha(-1, 1)).toBeCloseTo(TELE_A0, 6);
  });

  it('thin form while telegraphing, full width and a short flash at lethal', () => {
    const f = { lethal: false, alpha: 0, thick: 0, flash: 0 };
    hazardForm(0.5, 1, f);
    expect(f.lethal).toBe(false);
    expect(f.thick).toBe(TELE_THICK);
    expect(f.flash).toBe(0);
    hazardForm(1.0, 1, f);
    expect(f.lethal).toBe(true);
    expect(f.thick).toBe(1);
    expect(f.flash).toBe(1);
    hazardForm(1.0 + LETHAL_FLASH_SEC, 1, f);
    expect(f.flash).toBe(0);
  });
});

describe('ring gap to arc', () => {
  it('draws everything but the gap, starting at the gap far edge', () => {
    const out = { a0: 0, span: 0, gap0: 0, gap1: 0 };
    const half = Math.PI / 6; // 60 degree gap, the tier 1 minimum
    ringGapArc(1, half, out);
    expect(out.a0).toBeCloseTo(1 + half, 9);
    expect(out.span).toBeCloseTo(Math.PI * 2 - 2 * half, 9);
    expect(out.gap0).toBeCloseTo(1 - half, 9);
    expect(out.gap1).toBeCloseTo(1 + half, 9);
    // The arc ends exactly at the gap near edge, one turn on.
    expect(out.a0 + out.span).toBeCloseTo(out.gap0 + Math.PI * 2, 9);
  });

  it('clamps: no gap draws the full circle, a gap of pi or more draws nothing', () => {
    const out = { a0: 0, span: 0, gap0: 0, gap1: 0 };
    expect(ringGapArc(0, 0, out).span).toBeCloseTo(Math.PI * 2, 9);
    expect(ringGapArc(0, -1, out).span).toBeCloseTo(Math.PI * 2, 9);
    expect(ringGapArc(0, 4, out).span).toBe(0);
    expect(ringGapArc(Number.NaN, Number.NaN, out).span).toBeCloseTo(Math.PI * 2, 9);
  });

  it('segment count grows with radius inside its bounds', () => {
    expect(ringSegments(10, Math.PI * 2)).toBe(RING_SEG_MIN);
    expect(ringSegments(2000, Math.PI * 2)).toBe(RING_SEG_MAX);
    expect(ringSegments(300, Math.PI * 2)).toBeGreaterThan(ringSegments(100, Math.PI * 2));
    expect(ringSegments(0, 1)).toBe(0);
  });

  it('no drawn ring segment crosses the gap', () => {
    const b = createSpriteBuf(512);
    const half = Math.PI / 4;
    planHazard(hazard(HAZARD_RING, 2, { radius: 300, vx: half, rot: 0 }), b, NO_HALO);
    for (let i = 0; i < b.count; i++) {
      if (b.frame[i] !== F_BAR) continue;
      const x = b.x[i] ?? 0;
      const y = b.y[i] ?? 0;
      const r = Math.hypot(x, y);
      if (r < 250) continue; // only the arc segments, not the notch ticks
      const a = Math.atan2(y, x);
      expect(Math.abs(a), `segment at ${a}`).toBeGreaterThanOrEqual(half - 0.06);
    }
  });
});

describe('the five primitives', () => {
  it('every type writes instances; an unknown type writes none', () => {
    const b = createSpriteBuf(HAZARD_SPRITE_CAP);
    for (const type of [HAZARD_LANE, HAZARD_RING, HAZARD_SWEEP, HAZARD_TETHER, HAZARD_PULL]) {
      resetSpriteBuf(b);
      const extra: Partial<HazardInput> = type === HAZARD_RING ? { radius: 200, vx: 0.6 } : type === HAZARD_PULL ? { radius: 300 } : type === HAZARD_TETHER ? { vx: 400, vy: 0 } : {};
      const n = planHazard(hazard(type, 2, extra), b, HALO);
      expect(n, `type ${type}`).toBeGreaterThan(0);
      expect(n).toBe(b.count);
      expect(n).toBeLessThanOrEqual(HAZARD_MAX_INSTANCES);
    }
    resetSpriteBuf(b);
    expect(planHazard(hazard(9, 2), b, HALO)).toBe(0);
  });

  it('lane telegraph is the thin dim form of the lethal lane', () => {
    const tele = createSpriteBuf(64);
    const lethal = createSpriteBuf(64);
    planHazard(hazard(HAZARD_LANE, 0.2), tele, NO_HALO);
    planHazard(hazard(HAZARD_LANE, 1.5), lethal, NO_HALO);
    expect(countFrame(tele, F_BAR)).toBe(countFrame(lethal, F_BAR));
    expect(maxCoreThick(tele)).toBeLessThan(maxCoreThick(lethal));
    expect(maxAlpha(tele, F_BAR)).toBeLessThan(maxAlpha(lethal, F_BAR));
    expect(maxAlpha(tele, F_FILL)).toBeLessThan(maxAlpha(lethal, F_FILL));
    // The kill zone fill is exactly the lane: length w.vx and width twice w.radius.
    for (let i = 0; i < lethal.count; i++) {
      if (lethal.frame[i] !== F_FILL) continue;
      expect(lethal.w[i]).toBeCloseTo(600, 3);
      expect(lethal.h[i]).toBeCloseTo(44, 3);
    }
  });

  it('sweep draws w.vy arms (1 to 3) evenly spaced from w.rot', () => {
    expect([0, 1, 2, 3, 7].map(sweepArms)).toEqual([1, 1, 2, 3, 3]);
    expect(sweepArmAngle(0.5, 0, 2)).toBe(0.5);
    expect(sweepArmAngle(0.5, 1, 2)).toBeCloseTo(0.5 + Math.PI, 9);
    for (const arms of [1, 2, 3]) {
      const b = createSpriteBuf(64);
      planHazard(hazard(HAZARD_SWEEP, 2, { vx: 380, vy: arms }), b, NO_HALO);
      expect(countFrame(b, F_FILL)).toBe(arms);
      expect(countFrame(b, F_BAR)).toBe(arms);
    }
  });

  it('tether runs from the entity to (w.vx, w.vy)', () => {
    const b = createSpriteBuf(16);
    planHazard(hazard(HAZARD_TETHER, 2, { x: 0, y: 0, vx: 400, vy: 0 }), b, NO_HALO);
    const i = Array.from(b.frame.subarray(0, b.count)).indexOf(F_BAR);
    expect(b.x[i]).toBeCloseTo(200, 3);
    expect(b.w[i]).toBeCloseTo(400, 3);
  });

  it('pull is never lethal: dim at every age, ripples move inward', () => {
    for (let t = 0; t < 20; t += 0.37) expect(pullAlpha(t)).toBeLessThanOrEqual(PULL_ALPHA);
    expect(pullAlpha(0)).toBe(0);
    expect(pullRipple(0, 0)).toBe(1);
    expect(pullRipple(0.3, 0)).toBeLessThan(1);
    const b = createSpriteBuf(1024);
    planHazard(hazard(HAZARD_PULL, 5, { radius: 300 }), b, HALO);
    expect(maxAlpha(b, F_BAR)).toBeLessThanOrEqual(PULL_ALPHA + 1e-6);
  });

  it('a full buffer drops instances and counts them, never throws', () => {
    const b = createSpriteBuf(10);
    planHazard(hazard(HAZARD_RING, 2, { radius: 400, vx: 0.6 }), b, HALO);
    expect(b.count).toBe(10);
    expect(b.dropped).toBeGreaterThan(0);
  });

  it('eight lethal rings with notches fit the layer capacity', () => {
    const b = createSpriteBuf(HAZARD_SPRITE_CAP);
    for (let k = 0; k < 8; k++) planHazard(hazard(HAZARD_RING, 2, { radius: 900, vx: 0.4 }), b, HALO);
    planEntranceRing(b, 0, 0, 150, 0.8, 0xffffff, 1, HALO);
    expect(b.dropped).toBe(0);
  });

  it('entrance ring draws only with alpha and a radius', () => {
    const b = createSpriteBuf(256);
    expect(planEntranceRing(b, 0, 0, 150, 0, 0xffffff, 1, HALO)).toBe(0);
    expect(planEntranceRing(b, 0, 0, 150, 0.5, 0xffffff, 1, HALO)).toBeGreaterThan(0);
  });
});
