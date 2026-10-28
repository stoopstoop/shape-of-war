import { ParticleContainer, Texture } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEffectsTier, setEffectsTier } from '../../src/render/effects';
import { DEFLECT_SPARK_MAX, DEFLECT_SPARK_MIN } from '../../src/render/hitFx';
import {
  burst,
  clearParticles,
  disposeParticles,
  emitDeflectSparks,
  initParticles,
  liveParticleCount,
} from '../../src/render/particles';
import { TRAIL_SHED_FRAC } from '../../src/render/particlePool';

// emitDeflectSparks against the real shared pool (the module state), one container for the file.
const container = new ParticleContainer({ texture: Texture.WHITE });

describe('emitDeflectSparks on the shared particle pool', () => {
  beforeEach(() => {
    setEffectsTier('standard');
    initParticles(container, Texture.WHITE);
    clearParticles();
  });

  afterEach(() => {
    clearParticles();
    setEffectsTier('standard');
    disposeParticles();
  });

  it('writes 3 to 5 live particles on standard, and across many calls every count appears', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) {
      clearParticles();
      const n = emitDeflectSparks(10, 20, 1, 0, 0x9999ff);
      expect(n).toBeGreaterThanOrEqual(DEFLECT_SPARK_MIN);
      expect(n).toBeLessThanOrEqual(DEFLECT_SPARK_MAX);
      expect(liveParticleCount()).toBe(n);
      seen.add(n);
    }
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });

  it('writes nothing on the low tier', () => {
    setEffectsTier('low');
    expect(emitDeflectSparks(0, 0, 1, 0, 0xffffff)).toBe(0);
    expect(liveParticleCount()).toBe(0);
  });

  it('writes nothing on a pool above 80 percent live: trail class, shed first, budget kept', () => {
    burst(0, 0, 0xffffff, 2000);
    expect(liveParticleCount()).toBeGreaterThan(2048 * TRAIL_SHED_FRAC);
    const before = liveParticleCount();
    expect(emitDeflectSparks(0, 0, 1, 0, 0xffffff)).toBe(0);
    expect(liveParticleCount()).toBe(before);
  });

  it('tier returns to standard after low and sparks come back', () => {
    setEffectsTier('low');
    expect(emitDeflectSparks(0, 0, 1, 0, 0xffffff)).toBe(0);
    setEffectsTier('standard');
    expect(getEffectsTier()).toBe('standard');
    expect(emitDeflectSparks(0, 0, 1, 0, 0xffffff)).toBeGreaterThanOrEqual(DEFLECT_SPARK_MIN);
  });
});