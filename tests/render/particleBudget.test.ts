import { describe, expect, it } from 'vitest';
import { particleCapFor } from '../../src/render/effects';
import { CHARGER_DASH_TRAIL_RATE, SWIRL_TRAIL_RATE } from '../../src/render/enemyFx';
import {
  createParticlePool,
  EMBER_SIZE,
  emitBurst,
  emitTrail,
  isEmber,
  TRAIL_SHED_FRAC,
  type Burst,
  type TrailSpec,
} from '../../src/render/particlePool';
import { EMBER_SHARE, emberCount } from '../../src/render/particles';
import { steadyLive, trailLiveEstimate } from '../../src/render/trails';

function burst(extra: Partial<Burst> = {}): Burst {
  return {
    count: 12,
    speedMin: 100,
    speedMax: 200,
    lifeMin: 0.4,
    lifeMax: 0.6,
    drag: 2,
    colour: 0xff0000,
    colour2: 0x00ff00,
    inwardRadius: 0,
    ...extra,
  };
}

describe('embers', () => {
  it('isEmber follows bigEvery and is off when unset', () => {
    expect(isEmber(burst(), 0)).toBe(false);
    expect(isEmber(burst({ bigEvery: 3 }), 0)).toBe(true);
    expect(isEmber(burst({ bigEvery: 3 }), 1)).toBe(false);
    expect(isEmber(burst({ bigEvery: 3 }), 3)).toBe(true);
    expect(isEmber(burst({ bigEvery: 1 }), 7)).toBe(true);
  });

  it('embers are bigger, slower, longer lived and always in the first colour', () => {
    const p = createParticlePool(64);
    emitBurst(p, 0, 0, burst({ bigEvery: 2 }));
    for (let k = 0; k < 12; k++) {
      if (k % 2 === 0) {
        expect(p.size[k]).toBeCloseTo(EMBER_SIZE, 5);
        expect(p.colour[k]).toBe(0xff0000);
      } else {
        expect(p.size[k]).toBe(1);
      }
    }
  });

  it('ember count is a share of kill and death sparks, none on low or other events', () => {
    expect(emberCount('kill', 30, 'standard')).toBe(Math.round(30 * EMBER_SHARE));
    expect(emberCount('death', 30, 'high')).toBe(Math.round(30 * EMBER_SHARE));
    expect(emberCount('kill', 30, 'low')).toBe(0);
    expect(emberCount('bomb', 30, 'standard')).toBe(0);
    expect(emberCount('kill', -5, 'standard')).toBe(0);
  });
});

describe('particle budget (Standard, 2048)', () => {
  it('trail size multiplier defaults to 1', () => {
    const p = createParticlePool(8);
    const t: TrailSpec = { x: 0, y: 0, vx: 0, vy: 0, life: 1, drag: 0, colour: 0 };
    emitTrail(p, t);
    expect(p.size[0]).toBe(1);
    emitTrail(p, { ...t, size: 1.3 });
    expect(p.size[1]).toBeCloseTo(1.3, 5);
  });

  it('steadyLive is rate times life, 0 for bad input', () => {
    expect(steadyLive(40, 0.3)).toBeCloseTo(12, 9);
    expect(steadyLive(-1, 1)).toBe(0);
    expect(steadyLive(1, Number.NaN)).toBe(0);
  });

  it('a busy Standard frame of trails stays under the trail shed threshold', () => {
    const live = trailLiveEstimate(
      { shipSpeed: 520, rapidBullets: 40, pierceBullets: 10, darts: 12, swirls: 8, dashingChargers: 4, geoms: 60 },
      CHARGER_DASH_TRAIL_RATE,
      SWIRL_TRAIL_RATE,
    );
    expect(live).toBeGreaterThan(0);
    expect(live).toBeLessThan(particleCapFor('standard') * TRAIL_SHED_FRAC);
  });

  it('trails alone never push the pool past the shed threshold', () => {
    const cap = particleCapFor('standard');
    const p = createParticlePool(cap);
    const t: TrailSpec = { x: 0, y: 0, vx: 0, vy: 0, life: 10, drag: 0, colour: 0 };
    for (let i = 0; i < cap * 2; i++) emitTrail(p, t);
    expect(p.live).toBeLessThanOrEqual(cap * TRAIL_SHED_FRAC);
  });
});
