import { describe, expect, it } from 'vitest';
import { addShake, createShake, currentAmplitude, SHAKE_CAP_PX, stepShake } from '../../src/render/shake';

describe('screen shake', () => {
  it('concurrent shakes take the max, not the sum', () => {
    const s = createShake();
    addShake(s, 10, 0.4);
    addShake(s, 4, 0.15);
    expect(currentAmplitude(s)).toBeCloseTo(10, 6);
  });

  it('caps at 16 px', () => {
    const s = createShake();
    addShake(s, 40, 1);
    expect(currentAmplitude(s)).toBe(SHAKE_CAP_PX);
  });

  it('decays quadratically and ends', () => {
    const s = createShake();
    const out = { x: 0, y: 0 };
    addShake(s, 14, 0.5);
    stepShake(s, 0.25, out);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(14 * 0.25, 4);
    stepShake(s, 0.3, out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(s.list).toHaveLength(0);
  });
});
