// Warden phase 2 ring (src/render/hazardFx.ts): w.vy 2 draws a second gap centred on w.rot + pi,
// so the screen matches the sim. One gap rings are unchanged.
import { describe, expect, it } from 'vitest';
import { createSpriteBuf, F_BAR, type FxHalo } from '../../src/render/fxSprites';
import { HAZARD_MAX_INSTANCES, HAZARD_RING, planHazard, ringGapArc, ringGapArcs, ringGapCount, type GapArc, type HazardInput } from '../../src/render/hazardFx';

const NO_HALO: FxHalo = { alpha: 0, width: 0 };
const HALO: FxHalo = { alpha: 0.5, width: 2 };

function arcs(): GapArc[] {
  return [
    { a0: 0, span: 0, gap0: 0, gap1: 0 },
    { a0: 0, span: 0, gap0: 0, gap1: 0 },
  ];
}

function ring(extra: Partial<HazardInput> = {}): HazardInput {
  return { type: HAZARD_RING, x: 0, y: 0, rot: 0, radius: 300, vx: Math.PI / 5, vy: 1, age: 2, tier: 1, tint: 0x3366ff, timeSec: 0, ...extra };
}

/** Smallest angular distance between a and b. */
function angDist(a: number, b: number): number {
  const d = Math.abs((((a - b) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
  return d;
}

/** Arc segment angles (F_BAR instances on the ring radius and far from the notch ends). */
function segmentAngles(b: ReturnType<typeof createSpriteBuf>, r: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < b.count; i++) {
    if (b.frame[i] !== F_BAR) continue;
    const x = b.x[i] ?? 0;
    const y = b.y[i] ?? 0;
    // Arc chords lie along the tangent; notch ticks lie along the radius. Keep tangent ones only.
    const radial = Math.abs(Math.cos((b.rot[i] ?? 0) - Math.atan2(y, x)));
    if (Math.abs(Math.hypot(x, y) - r) > 6 || radial > 0.5) continue;
    out.push(Math.atan2(y, x));
  }
  return out;
}

describe('ring gap count', () => {
  it('reads w.vy: 2 or more is two gaps, anything else one', () => {
    expect(ringGapCount(2)).toBe(2);
    expect(ringGapCount(3)).toBe(2);
    expect(ringGapCount(1)).toBe(1);
    expect(ringGapCount(0)).toBe(1);
    expect(ringGapCount(Number.NaN)).toBe(1);
  });
});

describe('ringGapArcs', () => {
  it('one gap matches ringGapArc', () => {
    const out = arcs();
    const one: GapArc = { a0: 0, span: 0, gap0: 0, gap1: 0 };
    expect(ringGapArcs(0.7, 0.5, 1, out)).toBe(1);
    ringGapArc(0.7, 0.5, one);
    expect(out[0]).toEqual(one);
  });

  it('two gaps: two arcs of pi minus the gap, the second gap centred on rot + pi', () => {
    const out = arcs();
    const rot = 0.4;
    const g = 0.6;
    expect(ringGapArcs(rot, g, 2, out)).toBe(2);
    const [a, b] = out;
    expect(a?.span).toBeCloseTo(Math.PI - 2 * g, 9);
    expect(b?.span).toBeCloseTo(Math.PI - 2 * g, 9);
    expect(a?.a0).toBeCloseTo(rot + g, 9);
    expect(b?.a0).toBeCloseTo(rot + Math.PI + g, 9);
    // Gap edges: one gap either side of rot, the other either side of rot + pi.
    expect(((a?.gap0 ?? 0) + (a?.gap1 ?? 0)) / 2).toBeCloseTo(rot, 9);
    expect(((b?.gap0 ?? 0) + (b?.gap1 ?? 0)) / 2).toBeCloseTo(rot + Math.PI, 9);
  });

  it('two gaps that meet leave nothing to draw', () => {
    expect(ringGapArcs(0, Math.PI / 2, 2, arcs())).toBe(0);
    expect(ringGapArcs(0, 3, 2, arcs())).toBe(0);
  });
});

describe('planHazard ring with two gaps', () => {
  it('no arc segment sits in either gap, and both sides of the ring are drawn', () => {
    const half = Math.PI / 5;
    const rot = 0.3;
    const b = createSpriteBuf(1024);
    planHazard(ring({ vx: half, vy: 2, rot }), b, NO_HALO);
    const angs = segmentAngles(b, 300);
    expect(angs.length).toBeGreaterThan(10);
    for (const a of angs) {
      expect(angDist(a, rot), `segment at ${a}`).toBeGreaterThanOrEqual(half - 0.06);
      expect(angDist(a, rot + Math.PI), `segment at ${a}`).toBeGreaterThanOrEqual(half - 0.06);
    }
    // Segments on both half planes either side of the gap axis.
    const side = (a: number): number => Math.sign(Math.sin(a - rot));
    expect(angs.some((a) => side(a) > 0)).toBe(true);
    expect(angs.some((a) => side(a) < 0)).toBe(true);
  });

  it('draws four notch ticks (two per gap) where one gap draws two', () => {
    const count = (vy: number): number => {
      const b = createSpriteBuf(1024);
      planHazard(ring({ vy }), b, NO_HALO);
      let n = 0;
      for (let i = 0; i < b.count; i++) {
        if (b.frame[i] !== F_BAR) continue;
        const x = b.x[i] ?? 0;
        const y = b.y[i] ?? 0;
        if (Math.abs(Math.cos((b.rot[i] ?? 0) - Math.atan2(y, x))) > 0.9) n++;
      }
      return n;
    };
    expect(count(1)).toBe(2);
    expect(count(2)).toBe(4);
  });

  it('one gap ring segments still avoid the second gap position (unchanged look)', () => {
    const b = createSpriteBuf(1024);
    planHazard(ring({ vy: 1, rot: 0 }), b, NO_HALO);
    const angs = segmentAngles(b, 300);
    expect(angs.some((a) => angDist(a, Math.PI) < 0.2)).toBe(true);
  });

  it('a two gap ring stays within HAZARD_MAX_INSTANCES at any radius', () => {
    for (const radius of [40, 300, 1200, 4000]) {
      const b = createSpriteBuf(2048);
      const n = planHazard(ring({ radius, vy: 2, vx: 0.2 }), b, HALO);
      expect(n).toBeLessThanOrEqual(HAZARD_MAX_INSTANCES);
    }
  });
});
