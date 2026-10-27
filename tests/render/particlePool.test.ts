import { describe, expect, it } from 'vitest';
import {
  clearParticlePool,
  createParticlePool,
  emitBurst,
  PARTICLE_CAP,
  stepParticlePool,
  type Burst,
} from '../../src/render/particlePool';

function spec(count: number): Burst {
  return {
    count,
    speedMin: 100,
    speedMax: 200,
    lifeMin: 0.5,
    lifeMax: 1.0,
    drag: 2,
    colour: 0x00ff00,
    colour2: null,
    inwardRadius: 0,
  };
}

function liveSlots(life: Float32Array): number {
  let n = 0;
  for (const v of life) if (v > 0) n++;
  return n;
}

describe('particle pool', () => {
  it('has 2048 slots', () => {
    const p = createParticlePool();
    expect(PARTICLE_CAP).toBe(2048);
    expect(p.cap).toBe(2048);
    expect(p.life.length).toBe(2048);
  });

  it('never exceeds 2048 live particles however much is emitted', () => {
    const p = createParticlePool();
    for (let i = 0; i < 50; i++) emitBurst(p, 0, 0, spec(200));
    expect(p.live).toBe(PARTICLE_CAP);
    expect(liveSlots(p.life)).toBe(PARTICLE_CAP);
    expect(emitBurst(p, 0, 0, spec(5000))).toBe(PARTICLE_CAP);
    expect(p.live).toBeLessThanOrEqual(PARTICLE_CAP);
  });

  it('reuses slots: when full a new emit overwrites the oldest', () => {
    const p = createParticlePool(8);
    emitBurst(p, 0, 0, spec(8));
    expect(p.live).toBe(8);
    emitBurst(p, 50, 50, { ...spec(3), colour: 0xff0000 });
    expect(p.live).toBe(8);
    expect(p.colour[0]).toBe(0xff0000);
    expect(p.colour[2]).toBe(0xff0000);
    expect(p.colour[3]).toBe(0x00ff00);
    expect(p.x[0]).toBe(50);
  });

  it('reuses dead slots after they expire and keeps the live count exact', () => {
    const p = createParticlePool(16);
    emitBurst(p, 0, 0, spec(10));
    for (let i = 0; i < 40; i++) stepParticlePool(p, 0.05);
    expect(p.live).toBe(0);
    expect(liveSlots(p.life)).toBe(0);
    emitBurst(p, 0, 0, spec(10));
    expect(p.live).toBe(10);
    expect(liveSlots(p.life)).toBe(10);
  });

  it('moves particles outward and drag slows them', () => {
    const p = createParticlePool(4);
    emitBurst(p, 0, 0, spec(1));
    const v0 = Math.hypot(p.vx[0] ?? 0, p.vy[0] ?? 0);
    stepParticlePool(p, 0.02);
    expect(Math.hypot(p.x[0] ?? 0, p.y[0] ?? 0)).toBeGreaterThan(0);
    expect(Math.hypot(p.vx[0] ?? 0, p.vy[0] ?? 0)).toBeLessThan(v0);
  });

  it('alternates colour2 and is deterministic', () => {
    const a = createParticlePool(8);
    const b = createParticlePool(8);
    emitBurst(a, 1, 2, { ...spec(4), colour2: 0xffffff });
    emitBurst(b, 1, 2, { ...spec(4), colour2: 0xffffff });
    expect(a.colour[1]).toBe(0xffffff);
    expect(a.colour[0]).toBe(0x00ff00);
    expect(Array.from(a.vx)).toEqual(Array.from(b.vx));
  });

  it('clear kills everything', () => {
    const p = createParticlePool(8);
    emitBurst(p, 0, 0, spec(8));
    clearParticlePool(p);
    expect(p.live).toBe(0);
    expect(liveSlots(p.life)).toBe(0);
  });
});
