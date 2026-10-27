// Fixed timestep loop (docs/03 section 2, SPEC 5). One owner controls timing: the Pixi ticker
// is not used. The clock is injectable so tests run without requestAnimationFrame.

export interface LoopHooks {
  step(dt: number): void; // fixed dt = 1/120, called 0..n times per frame
  render(alpha: number): void; // alpha in [0,1) for interpolation
}

/** Rolling frame measurements over the last FRAME_WINDOW animation frames. Milliseconds. */
export interface FrameStats {
  /** Interval between the last two animation frames. */
  lastFrameMs: number;
  /** Mean animation frame interval. */
  avgFrameMs: number;
  /** Mean time spent inside step and render, for frames that rendered. */
  avgWorkMs: number;
  /** Sim steps run in the last frame. */
  steps: number;
  /** Frames seen since start, capped at FRAME_WINDOW. */
  samples: number;
}

export interface Loop {
  start(): void;
  stop(): void;
  setRenderDivisor(d: 1 | 2): void;
  readonly running: boolean;
  readonly divisor: 1 | 2;
  readonly stats: Readonly<FrameStats>;
}

/** Time source and frame scheduler. Defaults to performance.now and requestAnimationFrame. */
export interface LoopClock {
  now(): number;
  request(cb: (now: number) => void): number;
  cancel(handle: number): void;
}

export const SIM_DT = 1 / 120;
export const MAX_FRAME_DT = 0.05;
export const MAX_STEPS = 6; // 50 ms / 8.33 ms
export const FRAME_WINDOW = 120;
// Float slack so 0.05 s yields exactly 6 steps instead of 5 after rounding.
const EPS = 1e-9;

function browserClock(): LoopClock {
  return {
    now: () => performance.now(),
    request: (cb) => requestAnimationFrame(cb),
    cancel: (h) => cancelAnimationFrame(h),
  };
}

export function createLoop(hooks: LoopHooks, clock: LoopClock = browserClock()): Loop {
  let last = 0;
  let acc = 0;
  let handle = 0;
  let running = false;
  let divisor: 1 | 2 = 1;
  let frame = 0;

  const intervals = new Float64Array(FRAME_WINDOW);
  const works = new Float64Array(FRAME_WINDOW);
  let iHead = 0;
  let iSum = 0;
  let iCount = 0;
  let wHead = 0;
  let wSum = 0;
  let wCount = 0;
  const stats: FrameStats = { lastFrameMs: 0, avgFrameMs: 0, avgWorkMs: 0, steps: 0, samples: 0 };

  const pushInterval = (ms: number): void => {
    iSum += ms - (intervals[iHead] ?? 0);
    intervals[iHead] = ms;
    iHead = (iHead + 1) % FRAME_WINDOW;
    if (iCount < FRAME_WINDOW) iCount++;
    stats.lastFrameMs = ms;
    stats.avgFrameMs = iSum / iCount;
    stats.samples = iCount;
  };

  const pushWork = (ms: number): void => {
    wSum += ms - (works[wHead] ?? 0);
    works[wHead] = ms;
    wHead = (wHead + 1) % FRAME_WINDOW;
    if (wCount < FRAME_WINDOW) wCount++;
    stats.avgWorkMs = wSum / wCount;
  };

  const tick = (now: number): void => {
    if (!running) return;
    handle = clock.request(tick);
    const t0 = clock.now();
    const rawMs = now - last;
    last = now;
    pushInterval(rawMs > 0 ? rawMs : 0);
    let dt = rawMs / 1000;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT; // spiral of death guard, tab switch guard
    if (dt < 0) dt = 0;
    acc += dt;
    let steps = 0;
    while (acc >= SIM_DT - EPS && steps < MAX_STEPS) {
      hooks.step(SIM_DT);
      acc -= SIM_DT;
      steps++;
    }
    if (steps === MAX_STEPS || acc < 0) acc = 0; // drop backlog rather than catch up
    stats.steps = steps;
    frame++;
    if (divisor === 2 && (frame & 1) === 1) return; // 60 fps render mode, sim unaffected
    const alpha = acc / SIM_DT;
    hooks.render(alpha < 1 ? alpha : 0.999999);
    pushWork(clock.now() - t0);
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      last = clock.now();
      acc = 0;
      handle = clock.request(tick);
    },
    stop(): void {
      if (!running) return;
      running = false;
      clock.cancel(handle);
    },
    setRenderDivisor(d: 1 | 2): void {
      divisor = d;
    },
    get running(): boolean {
      return running;
    },
    get divisor(): 1 | 2 {
      return divisor;
    },
    stats,
  };
}
