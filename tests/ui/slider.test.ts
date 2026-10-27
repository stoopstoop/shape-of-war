import { describe, expect, it } from 'vitest';
import { createFrameThrottle, sliderFraction, sliderValueAt } from '../../src/ui/slider';

describe('slider value', () => {
  it('maps pointer x to an integer on the range, clamped', () => {
    expect(sliderValueAt(100, 100, 200, 0, 100)).toBe(0);
    expect(sliderValueAt(200, 100, 200, 0, 100)).toBe(50);
    expect(sliderValueAt(300, 100, 200, 0, 100)).toBe(100);
    expect(sliderValueAt(-50, 100, 200, 0, 100)).toBe(0);
    expect(sliderValueAt(999, 100, 200, 0, 100)).toBe(100);
    expect(sliderValueAt(141, 100, 200, 0, 100)).toBe(21);
  });
  it('degenerate track gives min', () => {
    expect(sliderValueAt(10, 0, 0, 0, 100)).toBe(0);
    expect(sliderValueAt(Number.NaN, 0, 100, 5, 100)).toBe(5);
  });
  it('fraction', () => {
    expect(sliderFraction(70, 0, 100)).toBeCloseTo(0.7);
    expect(sliderFraction(-1, 0, 100)).toBe(0);
    expect(sliderFraction(5, 5, 5)).toBe(0);
  });
});

describe('frame throttle', () => {
  it('applies the latest value once per frame', () => {
    const applied: number[] = [];
    const frames: (() => void)[] = [];
    const t = createFrameThrottle<number>((v) => applied.push(v), (cb) => frames.push(cb));
    for (let v = 0; v < 120; v++) t.push(v); // a 120 Hz burst inside one frame
    expect(frames).toHaveLength(1);
    expect(t.pending).toBe(true);
    frames.shift()?.();
    expect(applied).toEqual([119]);
    expect(t.pending).toBe(false);
  });
  it('flush applies now and the frame then does nothing', () => {
    const applied: number[] = [];
    const frames: (() => void)[] = [];
    const t = createFrameThrottle<number>((v) => applied.push(v), (cb) => frames.push(cb));
    t.push(3);
    t.flush();
    expect(applied).toEqual([3]);
    frames.shift()?.();
    expect(applied).toEqual([3]);
    t.flush();
    expect(applied).toEqual([3]);
  });
});
