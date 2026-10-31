// v31 supernova well: spiral geometry, inward shimmer, slot matching and the stream budget.
import { describe, expect, it } from 'vitest';
import { PARTICLE_CAP, TRAIL_SHED_FRAC, createParticlePool, emitTrail, type TrailSpec } from '../../src/render/particlePool';
import { stepEmitter } from '../../src/render/trails';
import { chromaOfRgb, hueDistance, hueOfRgb } from '../../src/render/emberFlame';
import { computePalette, NEON_DEFAULT, neonParams } from '../../src/render/neon';
import {
  createNovaState,
  NOVA_ADDED_PARTICLES_MAX,
  NOVA_CYCLE_SEC,
  NOVA_DRAWS_PER_WELL,
  NOVA_HUES,
  NOVA_SHIFT_SEC,
  novaAddedParticles,
  novaColour,
  novaCycleColour,
  novaCycleStops,
  novaHaloR,
  novaPulse,
  novaShift,
  novaStreamColour,
  NOVA_ARM_PTS,
  NOVA_ARMS,
  NOVA_DRIFT_LIFE,
  NOVA_EMIT_RATE,
  NOVA_ORBITERS,
  NOVA_PARTICLE_BUDGET,
  NOVA_SLOTS,
  novaAny,
  novaDriftParticle,
  novaEvent,
  novaGrow,
  novaOrbiter,
  novaSlotFor,
  novaSpiral,
  novaSteadyParticles,
  stepNovaState,
  type Orbiter,
} from '../../src/render/wellNova';

describe('nova spiral', () => {
  it('each arm winds outward from near the core to the reach, in place', () => {
    const out = new Float32Array(NOVA_ARM_PTS * 2);
    expect(novaSpiral(1.3, 0, 50, out)).toBe(out);
    let prev = -1;
    for (let k = 0; k < NOVA_ARM_PTS; k++) {
      const r = Math.hypot(out[k * 2] ?? 0, out[k * 2 + 1] ?? 0);
      expect(r).toBeGreaterThan(prev);
      prev = r;
    }
    expect(prev).toBeCloseTo(50);
    expect(Math.hypot(out[0] ?? 0, out[1] ?? 0)).toBeLessThan(10);
  });

  it('arms are evenly spaced and the spiral turns with time', () => {
    const a = novaSpiral(0, 0, 40, new Float32Array(NOVA_ARM_PTS * 2));
    const b = novaSpiral(0, 1, 40, new Float32Array(NOVA_ARM_PTS * 2));
    expect(NOVA_ARMS).toBe(2);
    expect(b[0] ?? 0).toBeCloseTo(-(a[0] ?? 0));
    expect(b[1] ?? 0).toBeCloseTo(-(a[1] ?? 0));
    const later = novaSpiral(0.5, 0, 40, new Float32Array(NOVA_ARM_PTS * 2));
    expect(Math.abs((later[0] ?? 0) - (a[0] ?? 0))).toBeGreaterThan(0.1);
  });

  it('shimmer points fall inward over time and twinkle within range', () => {
    const o: Orbiter = { x: 0, y: 0, a: 0, u: 0 };
    for (let k = 0; k < NOVA_ORBITERS; k++) {
      novaOrbiter(0.2, k, 60, o);
      const u0 = o.u;
      novaOrbiter(0.25, k, 60, o);
      if (u0 > 0.1) expect(o.u).toBeLessThan(u0);
      expect(o.a).toBeGreaterThanOrEqual(0.25);
      expect(o.a).toBeLessThanOrEqual(1);
      expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(60 + 1e-6);
    }
  });

  it('grows in and settles at full size', () => {
    expect(novaGrow(0)).toBe(0);
    expect(novaGrow(10)).toBeCloseTo(1);
  });
});

describe('nova slots', () => {
  it('matches a well by position, follows it, frees it when the well is gone', () => {
    const s = createNovaState();
    expect(novaAny(s)).toBe(false);
    novaEvent(s, -1, 100, 50);
    expect(novaAny(s)).toBe(true);
    expect(novaSlotFor(s, 7, 300, 300, 24)).toBe(-1);
    const k = novaSlotFor(s, 7, 104, 50, 24);
    expect(k).toBeGreaterThanOrEqual(0);
    stepNovaState(s, 0.016);
    expect(novaSlotFor(s, 7, 140, 50, 24)).toBe(k);
    stepNovaState(s, 0.016);
    stepNovaState(s, 0.016);
    expect(novaAny(s)).toBe(false);
  });

  it('matches by numeric id and never holds more than NOVA_SLOTS', () => {
    const s = createNovaState();
    novaEvent(s, 3, 0, 0);
    expect(novaSlotFor(s, 3, 900, 900, 24)).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < NOVA_SLOTS + 3; i++) novaEvent(s, i, i * 100, 0);
    expect(s.age.length).toBe(NOVA_SLOTS);
  });
});

describe('nova emitter budget', () => {
  it('a nova keeps its steady stream under the per nova budget, 3 wells under 10 percent of the cap', () => {
    expect(novaSteadyParticles()).toBeLessThanOrEqual(NOVA_PARTICLE_BUDGET);
    expect(novaSteadyParticles(NOVA_EMIT_RATE, NOVA_DRIFT_LIFE) * 3).toBeLessThan(PARTICLE_CAP * 0.1);
  });

  it('drift particles start near the core, float outward slowly, live about 2 s, alternate colours', () => {
    const t: TrailSpec = { x: 0, y: 0, vx: 0, vy: 0, life: 0, drag: 0, colour: 0 };
    for (let seq = 1; seq < 40; seq++) {
      novaDriftParticle(t, 10, 20, 24, seq, 0xff00aa, 0xffffff);
      expect(Math.hypot(t.x - 10, t.y - 20)).toBeLessThanOrEqual(24);
      expect(Math.hypot(t.vx, t.vy)).toBeLessThanOrEqual(30 + 1e-6);
      expect((t.x - 10) * t.vx + (t.y - 20) * t.vy).toBeGreaterThan(0);
      expect(t.life).toBeLessThanOrEqual(NOVA_DRIFT_LIFE);
      expect(t.life).toBeGreaterThan(1.6);
      expect(t.colour).toBe((seq & 1) === 0 ? 0xff00aa : 0xffffff);
    }
  });

  it('the stream never pushes a tier capped pool past the trail shed threshold', () => {
    const pool = createParticlePool(PARTICLE_CAP, 300);
    const em = { acc: 0 };
    const t: TrailSpec = { x: 0, y: 0, vx: 0, vy: 0, life: 0, drag: 0, colour: 0 };
    let seq = 0;
    for (let f = 0; f < 600; f++) {
      const n = stepEmitter(em, NOVA_EMIT_RATE * 40, 1 / 60);
      for (let k = 0; k < n; k++) {
        novaDriftParticle(t, 0, 0, 24, ++seq, 1, 2);
        if (!emitTrail(pool, t)) break;
      }
    }
    expect(pool.live).toBeLessThanOrEqual(Math.floor(300 * TRAIL_SHED_FRAC));
  });
});

// Look v32: the multicolour supernova (hue cycle, the 1 s shift from red, halo breathing, budget).
describe('nova colour cycle (look v32)', () => {
  const pal = computePalette(neonParams(NEON_DEFAULT).saturation);
  const stops = novaCycleStops(pal, new Uint32Array(NOVA_HUES));

  it('an arm cycles through at least six distinct hues along its length', () => {
    const kept: number[] = [];
    for (let k = 0; k < NOVA_ARM_PTS; k++) {
      const c = novaCycleColour(stops, k / (NOVA_ARM_PTS - 1), 0.37);
      const h = hueOfRgb(c);
      if (chromaOfRgb(c) > 0.3 && kept.every((x) => hueDistance(x, h) >= 25)) kept.push(h);
    }
    expect(kept.length).toBeGreaterThanOrEqual(6);
  });

  it('slides one full cycle per 2 s', () => {
    expect(NOVA_CYCLE_SEC).toBe(2);
    for (const u of [0, 0.3, 0.71]) {
      expect(novaCycleColour(stops, u, 0.4)).toBe(novaCycleColour(stops, u, 0.4 + NOVA_CYCLE_SEC));
      expect(novaCycleColour(stops, u, 0.4)).not.toBe(novaCycleColour(stops, u, 0.4 + NOVA_CYCLE_SEC / 2));
    }
  });

  it('turns from the well red into the cycle over 1 s', () => {
    expect(novaShift(0)).toBe(0);
    expect(novaShift(NOVA_SHIFT_SEC / 2)).toBeCloseTo(0.5);
    expect(novaShift(NOVA_SHIFT_SEC)).toBe(1);
    expect(novaColour(stops, pal.red, 0.6, 0.2, 0)).toBe(pal.red);
    expect(novaColour(stops, pal.red, 0.6, 0.2, 1)).toBe(novaCycleColour(stops, 0.6, 0.2));
  });

  it('the halo breathes between 1.0x and 1.15x of the pull radius', () => {
    let lo = Infinity;
    let hi = 0;
    for (let t = 0; t < 3; t += 0.01) {
      const r = novaHaloR(t, 100);
      lo = Math.min(lo, r);
      hi = Math.max(hi, r);
    }
    expect(lo).toBeGreaterThanOrEqual(100 - 1e-6);
    expect(hi).toBeLessThanOrEqual(115 + 1e-6);
    expect(lo).toBeLessThan(101);
    expect(hi).toBeGreaterThan(114);
  });

  it('swirl points pulse in brightness; stream particles take their own place on the cycle', () => {
    for (let k = 0; k < NOVA_ORBITERS; k++) {
      const vals = [0, 0.2, 0.4, 0.6, 0.8].map((t) => novaPulse(t, k));
      expect(Math.min(...vals)).toBeGreaterThanOrEqual(0.35 - 1e-9);
      expect(Math.max(...vals)).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0.1);
    }
    const cols = new Set<number>();
    for (let seq = 1; seq <= 24; seq++) cols.add(novaStreamColour(stops, pal.red, seq, 0.5, 1));
    expect(cols.size).toBeGreaterThanOrEqual(12);
    expect(novaStreamColour(stops, pal.red, 5, 0.5, 0)).toBe(pal.red);
  });

  it('budget: a nova adds at most 96 particles and one extra draw per well', () => {
    expect(novaAddedParticles()).toBe(NOVA_ORBITERS + novaSteadyParticles());
    expect(novaAddedParticles()).toBeLessThanOrEqual(NOVA_ADDED_PARTICLES_MAX);
    expect(NOVA_ADDED_PARTICLES_MAX).toBe(96);
    expect(NOVA_DRAWS_PER_WELL).toBe(1);
  });
});
