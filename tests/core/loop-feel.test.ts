// B9 feel review: the real fixed timestep loop driving the real game step must deliver 420 u of
// ship travel per wall clock second at every display cadence the Fold produces (120, 90 and
// 60 Hz, jittered 60 Hz, render divisor 2, load dips to 30 and 20 fps).
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { createLoop, MAX_FRAME_DT, type LoopClock } from '../../src/core/loop';
import { createGame, stepGame } from '../../src/game/game';
import { SHIP_SPEED } from '../../src/game/ship';
import { inlineRectLevel } from '../../src/game/world';
import type { InputState } from '../../src/input/types';

afterEach(() => bus.clear());

/** Manual clock: frame(ms) advances time and runs the pending rAF callback. */
function fakeClock(): LoopClock & { frame(ms: number): void } {
  let t = 1000;
  let cb: ((now: number) => void) | null = null;
  return {
    now: () => t,
    request(fn) {
      cb = fn;
      return 1;
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

const RIGHT: InputState = {
  move: { active: true, x: 1, y: 0 },
  aim: { active: false, x: 0, y: 0 },
  bomb: false,
  superPressed: false,
  pause: false,
};

/** Ship x travel after running the loop over the given frame intervals (ms). */
function travel(frames: readonly number[], divisor: 1 | 2 = 1): number {
  const w = createGame(inlineRectLevel(3), { vibrate: () => undefined });
  w.x[0] = -600;
  w.prevX[0] = -600;
  const clock = fakeClock();
  const loop = createLoop({ step: (dt) => stepGame(w, dt, RIGHT), render: () => undefined }, clock);
  loop.setRenderDivisor(divisor);
  loop.start();
  for (const ms of frames) clock.frame(ms);
  loop.stop();
  return (w.x[0] ?? 0) + 600;
}

function repeat(ms: number, seconds: number): number[] {
  return new Array<number>(Math.round((seconds * 1000) / ms)).fill(ms);
}

function within1pc(actual: number, expected: number): void {
  expect(Math.abs(actual - expected) / expected).toBeLessThan(0.01);
}

describe('B9 loop to ship speed', () => {
  it('120 Hz display: 420 u in 1 s', () => within1pc(travel(repeat(1000 / 120, 1)), SHIP_SPEED));
  it('90 Hz display: 420 u in 1 s', () => within1pc(travel(repeat(1000 / 90, 1)), SHIP_SPEED));
  it('60 Hz display: 420 u in 1 s', () => within1pc(travel(repeat(1000 / 60, 1)), SHIP_SPEED));
  it('render divisor 2 does not slow the sim', () => within1pc(travel(repeat(1000 / 120, 1), 2), SHIP_SPEED));

  it('jittered 60 Hz (15 and 18.33 ms alternating): 420 u in 1 s', () => {
    const f: number[] = [];
    for (let i = 0; i < 30; i++) f.push(15, 1000 / 30 - 15);
    within1pc(travel(f), SHIP_SPEED);
  });

  it('Adaptive refresh switching 120 and 60 Hz mid second: 420 u in 1 s', () => {
    within1pc(travel([...repeat(1000 / 120, 0.5), ...repeat(1000 / 60, 0.5)]), SHIP_SPEED);
  });

  it('load dip to 30 fps: still 420 u in 1 s', () => within1pc(travel(repeat(1000 / 30, 1)), SHIP_SPEED));
  it('load dip to 20 fps (the 50 ms clamp): still 420 u in 1 s', () => within1pc(travel(repeat(50, 1)), SHIP_SPEED));

  it('below 20 fps the 50 ms clamp slows the sim by design (SPEC 5 spiral guard)', () => {
    // 15 fps: each 66.7 ms frame advances only 50 ms of sim, so 0.75 of real time.
    const d = travel(repeat(1000 / 15, 1));
    within1pc(d, SHIP_SPEED * (MAX_FRAME_DT / (1 / 15)));
  });
});
