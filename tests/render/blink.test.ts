// B10 and B11: ship invulnerability blink and geom expiry blink phase maths.
import { describe, expect, it } from 'vitest';
import { GEOM_LIFE } from '../../src/game/geoms';
import { INVULN_SEC } from '../../src/game/ship';
import {
  blinkPhaseAlpha,
  GEOM_BLINK_HZ,
  GEOM_BLINK_LOW,
  GEOM_BLINK_SEC,
  geomAlpha,
  INVULN_BLINK_HZ,
  INVULN_BLINK_LOW,
  invulnAlpha,
} from '../../src/render/blink';

const SIM_DT = 1 / 120;

/** Count alpha changes over [from, to) sampled at the sim step. */
function toggles(f: (t: number) => number, from: number, to: number): number {
  let n = 0;
  let prev = f(from);
  for (let t = from + SIM_DT; t < to; t += SIM_DT) {
    const a = f(t);
    if (a !== prev) n++;
    prev = a;
  }
  return n;
}

describe('blinkPhaseAlpha', () => {
  it('is solid for a countdown at or below 0, NaN, or a bad rate', () => {
    expect(blinkPhaseAlpha(0, 6, 0.3)).toBe(1);
    expect(blinkPhaseAlpha(-1, 6, 0.3)).toBe(1);
    expect(blinkPhaseAlpha(Number.NaN, 6, 0.3)).toBe(1);
    expect(blinkPhaseAlpha(1, 0, 0.3)).toBe(1);
  });

  it('is on for the half cycle before 0 and off for the half before that', () => {
    expect(blinkPhaseAlpha(0.01, 6, 0.3)).toBe(1);
    expect(blinkPhaseAlpha(1 / 12 + 0.01, 6, 0.3)).toBe(0.3);
    expect(blinkPhaseAlpha(2 / 12 + 0.01, 6, 0.3)).toBe(1);
  });
});

describe('invulnAlpha (B10)', () => {
  it('is solid when not invulnerable', () => {
    expect(invulnAlpha(0)).toBe(1);
    expect(invulnAlpha(-0.5)).toBe(1);
  });

  it('starts and ends solid over the respawn window', () => {
    expect(invulnAlpha(INVULN_SEC)).toBe(1);
    expect(invulnAlpha(SIM_DT)).toBe(1);
  });

  it('never goes fully invisible', () => {
    expect(INVULN_BLINK_LOW).toBeGreaterThan(0);
    for (let t = SIM_DT; t <= INVULN_SEC; t += SIM_DT) expect(invulnAlpha(t)).toBeGreaterThanOrEqual(INVULN_BLINK_LOW);
  });

  it('blinks at about 6 Hz: two alpha changes per cycle', () => {
    expect(INVULN_BLINK_HZ).toBe(6);
    const n = toggles(invulnAlpha, SIM_DT / 2, 1 + SIM_DT / 2);
    expect(n).toBeGreaterThanOrEqual(2 * INVULN_BLINK_HZ - 1);
    expect(n).toBeLessThanOrEqual(2 * INVULN_BLINK_HZ + 1);
  });
});

describe('geomAlpha (B11)', () => {
  it('is solid until the last second of a 4 s life', () => {
    expect(GEOM_LIFE).toBe(4);
    expect(GEOM_BLINK_SEC).toBe(1);
    for (let age = 0; age <= GEOM_LIFE - GEOM_BLINK_SEC; age += SIM_DT) expect(geomAlpha(age)).toBe(1);
  });

  it('blinks at 8 Hz in the last second', () => {
    const n = toggles(geomAlpha, GEOM_LIFE - GEOM_BLINK_SEC + SIM_DT / 2, GEOM_LIFE - SIM_DT / 2);
    expect(n).toBeGreaterThanOrEqual(2 * GEOM_BLINK_HZ - 2);
    expect(n).toBeLessThanOrEqual(2 * GEOM_BLINK_HZ);
  });

  it('only ever shows full or the low alpha, never 0', () => {
    for (let age = GEOM_LIFE - GEOM_BLINK_SEC; age < GEOM_LIFE + 0.1; age += SIM_DT) {
      const a = geomAlpha(age);
      expect(a === 1 || a === GEOM_BLINK_LOW).toBe(true);
      expect(a).toBeGreaterThan(0);
    }
  });

  it('honours a custom life and stays solid for a non finite age', () => {
    expect(geomAlpha(0.5, 1.2)).not.toBe(1);
    expect(geomAlpha(0.1, 1.2)).toBe(1);
    expect(geomAlpha(Number.NaN)).toBe(1);
  });
});
