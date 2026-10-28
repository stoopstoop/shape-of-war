import { afterEach, describe, expect, it } from 'vitest';
import {
  EFFECTS_DEFAULT,
  EFFECTS_TIERS,
  getEffectsTier,
  isEffectsTier,
  MAX_PARTICLE_CAP,
  onEffectsTierChanged,
  particleCapFor,
  setEffectsTier,
  trailsOn,
  type EffectsTier,
} from '../../src/render/effects';
import {
  createParticlePool,
  emitBurst,
  emitTrail,
  setPoolLimit,
  shedTrails,
  stepParticlePool,
  type Burst,
  type ParticlePool,
  type TrailSpec,
} from '../../src/render/particlePool';

function burstSpec(count: number): Burst {
  return { count, speedMin: 100, speedMax: 200, lifeMin: 0.5, lifeMax: 1, drag: 2, colour: 0xff0000, colour2: null, inwardRadius: 0 };
}

const TRAIL: TrailSpec = { x: 0, y: 0, vx: 10, vy: 0, life: 0.3, drag: 3, colour: 0xffffff };

function liveSlots(p: ParticlePool): number {
  let n = 0;
  for (let i = 0; i < p.cap; i++) if ((p.life[i] ?? 0) > 0) n++;
  return n;
}

afterEach(() => {
  setEffectsTier(EFFECTS_DEFAULT);
});

describe('effects tier', () => {
  it('defaults to standard', () => {
    expect(EFFECTS_DEFAULT).toBe('standard');
    expect(getEffectsTier()).toBe('standard');
  });

  it('maps tier to particle cap: 2048 low and standard, 4096 high', () => {
    expect(particleCapFor('low')).toBe(2048);
    expect(particleCapFor('standard')).toBe(2048);
    expect(particleCapFor('high')).toBe(4096);
    expect(MAX_PARTICLE_CAP).toBe(4096);
    for (const t of EFFECTS_TIERS) expect(particleCapFor(t)).toBeLessThanOrEqual(MAX_PARTICLE_CAP);
  });

  it('turns trails off on low only', () => {
    expect(trailsOn('low')).toBe(false);
    expect(trailsOn('standard')).toBe(true);
    expect(trailsOn('high')).toBe(true);
  });

  it('set and get round trip, listeners fire on change only', () => {
    const seen: EffectsTier[] = [];
    const off = onEffectsTierChanged((t) => seen.push(t));
    setEffectsTier('high');
    setEffectsTier('high');
    setEffectsTier('low');
    off();
    setEffectsTier('standard');
    expect(seen).toEqual(['high', 'low']);
    expect(getEffectsTier()).toBe('standard');
  });

  it('guards tier strings and falls back to the default for anything else', () => {
    expect(isEffectsTier('low')).toBe(true);
    expect(isEffectsTier('ultra')).toBe(false);
    expect(isEffectsTier(2)).toBe(false);
    setEffectsTier('high');
    setEffectsTier(JSON.parse('"ultra"') as EffectsTier);
    expect(getEffectsTier()).toBe('standard');
  });
});

describe('particle pool sized for the largest tier', () => {
  it('never exceeds its cap in either tier, bursts and trails together', () => {
    for (const t of EFFECTS_TIERS) {
      const cap = particleCapFor(t);
      const p = createParticlePool(MAX_PARTICLE_CAP, cap);
      expect(p.cap).toBe(MAX_PARTICLE_CAP);
      for (let i = 0; i < 40; i++) {
        emitBurst(p, 0, 0, burstSpec(300));
        for (let k = 0; k < 50; k++) emitTrail(p, TRAIL);
        expect(p.live).toBeLessThanOrEqual(cap);
        if (i % 5 === 0) stepParticlePool(p, 0.02);
      }
      expect(emitBurst(p, 0, 0, burstSpec(100000))).toBe(cap);
      expect(p.live).toBe(cap);
      expect(liveSlots(p)).toBe(cap);
      // Nothing is ever written at or above the active limit.
      for (let i = cap; i < p.cap; i++) expect(p.life[i]).toBe(0);
    }
  });

  it('shrinking from high to standard kills the tail and keeps live exact', () => {
    const p = createParticlePool(MAX_PARTICLE_CAP, particleCapFor('high'));
    emitBurst(p, 0, 0, burstSpec(4096));
    expect(p.live).toBe(4096);
    setPoolLimit(p, particleCapFor('standard'));
    expect(p.live).toBe(2048);
    expect(liveSlots(p)).toBe(2048);
    emitBurst(p, 0, 0, burstSpec(500));
    expect(p.live).toBe(2048);
    expect(p.cursor).toBeLessThan(2048);
  });

  it('growing back to high uses the boot sized arrays with no reallocation', () => {
    const p = createParticlePool(MAX_PARTICLE_CAP, 2048);
    const lifeArr = p.life;
    setPoolLimit(p, 4096);
    emitBurst(p, 0, 0, burstSpec(4096));
    expect(p.live).toBe(4096);
    expect(p.life).toBe(lifeArr);
  });
});

describe('trail shedding above 80 percent', () => {
  it('refuses new trails once the pool is at 80 percent live', () => {
    const p = createParticlePool(100);
    emitBurst(p, 0, 0, burstSpec(79));
    expect(emitTrail(p, TRAIL)).toBe(true);
    expect(p.live).toBe(80);
    expect(emitTrail(p, TRAIL)).toBe(false);
    expect(p.live).toBe(80);
  });

  it('trails alone never push the pool past 80 percent', () => {
    const p = createParticlePool(2048);
    for (let i = 0; i < 5000; i++) emitTrail(p, TRAIL);
    expect(p.live).toBeLessThanOrEqual(2048 * 0.8);
  });

  it('sheds trails first: bursts above the threshold kill trails, never bursts', () => {
    const p = createParticlePool(100);
    emitBurst(p, 0, 0, burstSpec(40));
    for (let i = 0; i < 40; i++) emitTrail(p, TRAIL);
    expect(p.live).toBe(80);
    emitBurst(p, 0, 0, burstSpec(15));
    expect(p.live).toBe(95);
    const shed = shedTrails(p);
    expect(shed).toBe(15);
    expect(p.live).toBe(80);
    let bursts = 0;
    let trails = 0;
    for (let i = 0; i < p.cap; i++) {
      if ((p.life[i] ?? 0) <= 0) continue;
      if (p.trail[i] === 1) trails++;
      else bursts++;
    }
    expect(bursts).toBe(55);
    expect(trails).toBe(25);
    expect(liveSlots(p)).toBe(80);
  });

  it('does nothing at or under the threshold and never kills burst particles', () => {
    const p = createParticlePool(100);
    emitBurst(p, 0, 0, burstSpec(100));
    expect(shedTrails(p)).toBe(0);
    expect(p.live).toBe(100);
    const q = createParticlePool(100);
    emitBurst(q, 0, 0, burstSpec(50));
    for (let i = 0; i < 10; i++) emitTrail(q, TRAIL);
    expect(shedTrails(q)).toBe(0);
    expect(q.live).toBe(60);
  });

  it('a burst slot reused after a trail is a burst again', () => {
    const p = createParticlePool(4);
    emitTrail(p, TRAIL);
    expect(p.trail[0]).toBe(1);
    emitBurst(p, 0, 0, burstSpec(4));
    expect(p.trail[0]).toBe(0);
  });
});
