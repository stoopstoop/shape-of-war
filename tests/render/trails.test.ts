import { describe, expect, it } from 'vitest';
import type { TrailSpec } from '../../src/render/particlePool';
import {
  bulletTrailParticle,
  bulletTrailRate,
  MAX_TRAIL_PER_FRAME,
  SHIP_TRAIL_GAIN,
  shipTrailParticle,
  shipTrailRate,
  stepEmitter,
  TRAIL_MIN_SPEED,
  type Emitter,
} from '../../src/render/trails';

function spec(): TrailSpec {
  return { x: 0, y: 0, vx: 0, vy: 0, life: 0, drag: 0, colour: 0 };
}

describe('ship trail rate', () => {
  it('is zero at rest and at or below 60 u/s', () => {
    expect(TRAIL_MIN_SPEED).toBe(60);
    for (const s of [0, 1, 30, 59.9, 60]) expect(shipTrailRate(s)).toBe(0);
    expect(shipTrailRate(-100)).toBe(0);
    expect(shipTrailRate(Number.NaN)).toBe(0);
  });

  it('is positive and strictly increasing above 60 u/s, proportional to the excess', () => {
    let prev = 0;
    for (let s = 61; s <= 1000; s += 7) {
      const r = shipTrailRate(s);
      expect(r).toBeGreaterThan(prev);
      prev = r;
    }
    expect(shipTrailRate(420)).toBeCloseTo((420 - 60) * SHIP_TRAIL_GAIN, 9);
    expect(shipTrailRate(260) - shipTrailRate(160)).toBeCloseTo(shipTrailRate(160) - shipTrailRate(60), 9);
  });

  it('every space physics top speed (420, 460, 520) gives a visible trail', () => {
    for (const v of [420, 460, 520]) expect(shipTrailRate(v)).toBeGreaterThan(60);
  });
});

describe('emitter', () => {
  it('emits rate times time on average and carries the fraction', () => {
    const e: Emitter = { acc: 0 };
    let total = 0;
    for (let i = 0; i < 120; i++) total += stepEmitter(e, 90, 1 / 60);
    expect(total).toBeGreaterThanOrEqual(179);
    expect(total).toBeLessThanOrEqual(180);
  });

  it('emits nothing below 60 u/s and resets the accumulator', () => {
    const e: Emitter = { acc: 0.9 };
    let total = 0;
    for (let i = 0; i < 600; i++) total += stepEmitter(e, shipTrailRate(55), 1 / 60);
    expect(total).toBe(0);
    expect(e.acc).toBe(0);
  });

  it('is capped per frame so a long frame never dumps a burst', () => {
    const e: Emitter = { acc: 0 };
    expect(stepEmitter(e, 10000, 0.05)).toBe(MAX_TRAIL_PER_FRAME);
    expect(stepEmitter(e, 90, 0)).toBe(0);
  });

  it('more speed never means fewer particles over the same frames', () => {
    let prevTotal = -1;
    for (let s = 0; s <= 600; s += 20) {
      const e: Emitter = { acc: 0 };
      let total = 0;
      for (let i = 0; i < 60; i++) total += stepEmitter(e, shipTrailRate(s), 1 / 60);
      expect(total).toBeGreaterThanOrEqual(prevTotal);
      prevTotal = total;
    }
  });
});

describe('trail particles', () => {
  it('ship trail starts behind the motion and is thrown backwards, deterministically', () => {
    const a = spec();
    const b = spec();
    shipTrailParticle(a, 100, 50, 400, 0, 1 / 60, 7, 0, 2, 0xabcdef);
    shipTrailParticle(b, 100, 50, 400, 0, 1 / 60, 7, 0, 2, 0xabcdef);
    expect(a).toEqual(b);
    expect(a.x).toBeLessThan(100);
    expect(a.vx).toBeLessThan(0);
    expect(Math.abs(a.y - 50)).toBeLessThan(4);
    expect(a.life).toBeGreaterThan(0);
    expect(a.colour).toBe(0xabcdef);
  });

  it('jitter varies with the sequence number', () => {
    const a = spec();
    const b = spec();
    shipTrailParticle(a, 0, 0, 0, 300, 1 / 60, 1, 0, 1, 0);
    shipTrailParticle(b, 0, 0, 0, 300, 1 / 60, 2, 0, 1, 0);
    expect(a.x).not.toBe(b.x);
  });

  it('bullet trails only for rapid and pierce', () => {
    expect(bulletTrailRate(0)).toBe(0);
    expect(bulletTrailRate(1)).toBeGreaterThan(0);
    expect(bulletTrailRate(2)).toBeGreaterThan(0);
    expect(bulletTrailRate(3)).toBe(0);
    expect(bulletTrailRate(9)).toBe(0);
  });

  it('bullet trail particle lags the bullet, short lived, along its velocity', () => {
    const t = spec();
    bulletTrailParticle(t, 10, 20, 1500, 0, 1, 3, 0x123456);
    expect(t.x).toBeLessThanOrEqual(10);
    expect(t.vx).toBeGreaterThan(0);
    expect(t.vx).toBeLessThan(1500);
    expect(t.life).toBeGreaterThan(0);
    expect(t.life).toBeLessThan(0.3);
    expect(t.colour).toBe(0x123456);
  });
});
