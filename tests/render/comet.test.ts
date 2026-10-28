import { describe, expect, it } from 'vitest';
import {
  COMET_HALF_W,
  COMET_POINTS,
  COMET_SAMPLES,
  COMET_VERTS,
  cometAlpha,
  cometIndices,
  cometTaper,
  cometUvs,
  createComet,
  pushComet,
  resetComet,
  writeCometStrip,
} from '../../src/render/comet';

describe('comet taper', () => {
  it('is 1 at the head, 0 at the tail and clamps outside', () => {
    expect(cometTaper(0)).toBe(1);
    expect(cometTaper(-1)).toBe(1);
    expect(cometTaper(1)).toBe(0);
    expect(cometTaper(2)).toBe(0);
    expect(cometTaper(Number.NaN)).toBe(1);
  });

  it('falls strictly from head to tail and stays in [0, 1]', () => {
    let prev = 1.0001;
    for (let k = 0; k <= 40; k++) {
      const v = cometTaper(k / 40);
      expect(v).toBeLessThan(prev);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
  });
});

describe('comet alpha', () => {
  it('is 0 at rest, 1 at full speed, monotone between', () => {
    expect(cometAlpha(0)).toBe(0);
    expect(cometAlpha(40)).toBe(0);
    expect(cometAlpha(220)).toBe(1);
    expect(cometAlpha(500)).toBe(1);
    expect(cometAlpha(Number.NaN)).toBe(0);
    let prev = 0;
    for (let s = 40; s <= 220; s += 10) {
      const a = cometAlpha(s);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });
});

describe('comet history and strip', () => {
  it('first push primes every sample at the ship', () => {
    const c = createComet();
    pushComet(c, 10, 20, 1 / 60);
    expect(Array.from(c.x).every((v) => v === 10)).toBe(true);
    expect(Array.from(c.y).every((v) => v === 20)).toBe(true);
  });

  it('a long frame writes at most COMET_SAMPLES samples on a straight line', () => {
    const c = createComet();
    pushComet(c, 0, 0, 0);
    pushComet(c, 100, 0, 10);
    for (let i = 0; i < COMET_SAMPLES; i++) {
      expect(c.y[i]).toBe(0);
      expect(c.x[i] ?? -1).toBeGreaterThan(0);
      expect(c.x[i] ?? 999).toBeLessThanOrEqual(100);
    }
  });

  it('ignores non finite positions', () => {
    const c = createComet();
    pushComet(c, Number.NaN, 0, 1 / 60);
    expect(c.primed).toBe(false);
  });

  it('a straight run gives a ribbon of the taper width, closing at the tail', () => {
    const c = createComet();
    pushComet(c, 0, 0, 0);
    for (let f = 1; f <= 60; f++) pushComet(c, f * 5, 0, 1 / 60);
    const out = new Float32Array(COMET_VERTS * 2);
    const len = writeCometStrip(c, 300, 0, out);
    expect(len).toBeGreaterThan(100);
    expect(Math.abs(out[1] ?? 0)).toBeCloseTo(COMET_HALF_W, 5);
    expect(Math.abs(out[3] ?? 0)).toBeCloseTo(COMET_HALF_W, 5);
    const t = 4 * (COMET_POINTS - 1);
    expect(out[t + 1] ?? 1).toBeCloseTo(out[t + 3] ?? 0, 5);
    expect(Array.from(out).every(Number.isFinite)).toBe(true);
  });

  it('at rest the strip is finite with zero length', () => {
    const c = createComet();
    pushComet(c, 5, 5, 0);
    for (let f = 0; f < 30; f++) pushComet(c, 5, 5, 1 / 60);
    const out = new Float32Array(COMET_VERTS * 2);
    expect(writeCometStrip(c, 5, 5, out)).toBe(0);
    expect(Array.from(out).every(Number.isFinite)).toBe(true);
  });

  it('reset unprimes the history', () => {
    const c = createComet();
    pushComet(c, 1, 1, 0);
    resetComet(c);
    expect(c.primed).toBe(false);
  });

  it('static uvs and indices cover the ribbon', () => {
    const uv = cometUvs();
    expect(uv.length).toBe(COMET_VERTS * 2);
    expect(uv[0]).toBe(0);
    expect(uv[uv.length - 2]).toBe(1);
    const idx = cometIndices();
    expect(idx.length).toBe((COMET_POINTS - 1) * 6);
    expect(Math.max(...Array.from(idx))).toBe(COMET_VERTS - 1);
  });
});
