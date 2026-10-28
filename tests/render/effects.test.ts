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
  enemyFxGates,
  mapEffectsOn,
  burstMulFor,
  dustOn,
  latticeCapFor,
  latticeOn,
  latticeSpacingFor,
  tierBurstCount,
} from '../../src/render/effects';
import { ENEMY_TRAIL_CHARGER, ENEMY_TRAIL_SWIRL, enemyTrailParticle } from '../../src/render/trails';
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

describe('v2 enemy fx tier gating', () => {
  it('low turns map effects and enemy trails off; standard and high turn them on', () => {
    expect(mapEffectsOn('low')).toBe(false);
    expect(mapEffectsOn('standard')).toBe(true);
    expect(mapEffectsOn('high')).toBe(true);
    const low = enemyFxGates('low');
    expect(low.trails).toBe(false);
    expect(low.mapFx).toBe(false);
    for (const t of ['standard', 'high'] as const) {
      const g = enemyFxGates(t);
      expect(g.trails).toBe(true);
      expect(g.mapFx).toBe(true);
    }
  });

  it('tells (lane, ghost, ring, arrival, splat) show on every tier, low included', () => {
    for (const t of EFFECTS_TIERS) expect(enemyFxGates(t).tells).toBe(true);
  });

  it('gates follow trailsOn for trails, so ship, bullet and enemy trails switch together', () => {
    for (const t of EFFECTS_TIERS) expect(enemyFxGates(t).trails).toBe(trailsOn(t));
  });
});

describe('enemy trails in the shared pool', () => {
  function enemyTrail(type: number, seq: number): TrailSpec {
    const out: TrailSpec = { x: 0, y: 0, vx: 0, vy: 0, life: 0, drag: 0, colour: 0 };
    enemyTrailParticle(out, 100, 50, 300, 0, type, seq, 0x00ff88);
    return out;
  }

  it('builds a short lived particle behind the mover with its colour', () => {
    for (const type of [ENEMY_TRAIL_SWIRL, ENEMY_TRAIL_CHARGER]) {
      for (let seq = 1; seq < 50; seq++) {
        const t = enemyTrail(type, seq);
        expect(t.x).toBeLessThan(100);
        expect(t.vx).toBeLessThan(0);
        expect(t.life).toBeGreaterThan(0);
        expect(t.life).toBeLessThan(0.5);
        expect(t.colour).toBe(0x00ff88);
      }
    }
  });

  it('is refused above 80 percent live and shed before bursts', () => {
    const p = createParticlePool(100, 100);
    emitBurst(p, 0, 0, burstSpec(70));
    let seq = 0;
    while (emitTrail(p, enemyTrail(ENEMY_TRAIL_SWIRL, ++seq))) {
      expect(seq).toBeLessThan(100);
    }
    expect(p.live).toBe(80);
    expect(emitTrail(p, enemyTrail(ENEMY_TRAIL_CHARGER, ++seq))).toBe(false);
    // 70 bursts and 10 enemy trails live. 15 more bursts push live to 95: every trail is shed
    // and every burst survives.
    emitBurst(p, 0, 0, burstSpec(15));
    expect(shedTrails(p)).toBe(10);
    let bursts = 0;
    let trailsLeft = 0;
    for (let i = 0; i < p.cap; i++) {
      if ((p.life[i] ?? 0) <= 0) continue;
      if (p.trail[i] === 1) trailsLeft++;
      else bursts++;
    }
    expect(trailsLeft).toBe(0);
    expect(bursts).toBe(85);
    expect(p.live).toBe(85);
  });
});

describe('effects tier: lattice, dust and burst density (wave D)', () => {
  it('low keeps the v1 grid; standard and high run the lattice and dust', () => {
    expect(latticeOn('low')).toBe(false);
    expect(latticeOn('standard')).toBe(true);
    expect(latticeOn('high')).toBe(true);
    expect(dustOn('low')).toBe(false);
    expect(dustOn('standard')).toBe(true);
    expect(dustOn('high')).toBe(true);
  });

  it('maps tier to lattice spacing and node cap from the plan', () => {
    expect(latticeSpacingFor('standard')).toBe(25);
    expect(latticeCapFor('standard')).toBe(4096);
    expect(latticeSpacingFor('high')).toBe(16);
    expect(latticeCapFor('high')).toBe(8192);
    expect(latticeCapFor('low')).toBe(0);
  });

  it('high raises burst counts by 1.5, limited by the cap', () => {
    expect(burstMulFor('low')).toBe(1);
    expect(burstMulFor('standard')).toBe(1);
    expect(burstMulFor('high')).toBe(1.5);
    expect(tierBurstCount(24, 'standard', 2048)).toBe(24);
    expect(tierBurstCount(24, 'high', 4096)).toBe(36);
    expect(tierBurstCount(200, 'high', 4096)).toBe(300);
    expect(tierBurstCount(4000, 'high', 4096)).toBe(4096);
    expect(tierBurstCount(-3, 'high', 4096)).toBe(0);
  });
});
