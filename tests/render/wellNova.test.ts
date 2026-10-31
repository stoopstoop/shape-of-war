// v31 supernova well: spiral geometry, inward shimmer, slot matching and the stream budget.
import { describe, expect, it } from 'vitest';
import { PARTICLE_CAP, TRAIL_SHED_FRAC, createParticlePool, emitTrail, type TrailSpec } from '../../src/render/particlePool';
import { stepEmitter } from '../../src/render/trails';
import {
  createNovaState,
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
