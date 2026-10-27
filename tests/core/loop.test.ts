import { describe, expect, it } from 'vitest';
import { createLoop, MAX_STEPS, type LoopClock } from '../../src/core/loop';

/** Manual clock: frame(ms) advances time and runs the pending callback. */
function fakeClock(): LoopClock & { frame(ms: number): void; pending: number } {
  let t = 1000;
  let cb: ((now: number) => void) | null = null;
  let id = 0;
  return {
    pending: 0,
    now: () => t,
    request(fn) {
      cb = fn;
      id++;
      this.pending = id;
      return id;
    },
    cancel() {
      cb = null;
    },
    frame(ms: number) {
      t += ms;
      const f = cb;
      cb = null;
      if (f) f(t);
    },
  };
}

function harness() {
  const clock = fakeClock();
  const alphas: number[] = [];
  let steps = 0;
  const loop = createLoop(
    {
      step: () => {
        steps++;
      },
      render: (a) => {
        alphas.push(a);
      },
    },
    clock,
  );
  return { clock, loop, alphas, steps: () => steps };
}

describe('loop', () => {
  it('1 s of 16.67 ms frames gives 120 steps', () => {
    const h = harness();
    h.loop.start();
    for (let i = 0; i < 60; i++) h.clock.frame(16.67);
    expect(h.steps()).toBe(120);
    expect(h.alphas.length).toBe(60);
  });

  it('a 500 ms frame is clamped to 6 steps', () => {
    const h = harness();
    h.loop.start();
    h.clock.frame(500);
    expect(MAX_STEPS).toBe(6);
    expect(h.steps()).toBe(6);
  });

  it('alpha always in [0, 1)', () => {
    const h = harness();
    h.loop.start();
    const pattern = [16.67, 8.33, 7, 13.1, 50, 500, 1, 0, 33.4, 9.99];
    for (let i = 0; i < 300; i++) h.clock.frame(pattern[i % pattern.length] ?? 16);
    expect(h.alphas.length).toBe(300);
    for (const a of h.alphas) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
  });

  it('setRenderDivisor(2) halves render calls, step count unchanged', () => {
    const a = harness();
    const b = harness();
    a.loop.start();
    b.loop.start();
    b.loop.setRenderDivisor(2);
    for (let i = 0; i < 120; i++) {
      a.clock.frame(8.333);
      b.clock.frame(8.333);
    }
    expect(b.steps()).toBe(a.steps());
    expect(b.alphas.length).toBe(a.alphas.length / 2);
  });

  it('stop halts stepping and start resets the clock without a lurch', () => {
    const h = harness();
    h.loop.start();
    h.clock.frame(16.67);
    h.loop.stop();
    expect(h.loop.running).toBe(false);
    const before = h.steps();
    h.clock.frame(16.67);
    expect(h.steps()).toBe(before);
    h.loop.start();
    h.clock.frame(8.34);
    expect(h.steps()).toBe(before + 1);
  });

  it('tracks frame interval stats', () => {
    const h = harness();
    h.loop.start();
    for (let i = 0; i < 10; i++) h.clock.frame(10);
    expect(h.loop.stats.avgFrameMs).toBeCloseTo(10);
    expect(h.loop.stats.samples).toBe(10);
  });
});
