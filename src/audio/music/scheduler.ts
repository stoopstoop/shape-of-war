// Lookahead scheduler (SPEC 3.9 item 4). A timer every 25 ms schedules every step whose time
// falls inside the next 100 ms of AudioContext.currentTime. Note times always come from the
// audio clock, never from timer time. Clock and timer are injected so tests run in node.
import type { Mix } from './intensity';
import { STEP_SEC, STEPS_PER_BAR, type BarPattern, type Layer } from './track';

export const TICK_MS = 25;
export const LOOKAHEAD_SEC = 0.1;
/** Delay from start or resume to the first step, so it is never scheduled in the past. */
export const START_LEAD_SEC = 0.05;

export interface Clock {
  /** Seconds, AudioContext.currentTime in the browser. */
  now(): number;
}

export interface Timer {
  /** Call fn every ms milliseconds until the returned cancel function runs. */
  every(fn: () => void, ms: number): () => void;
}

/** The browser timer. Timer time only paces ticks; note times come from the audio clock. */
export const realTimer: Timer = {
  every(fn: () => void, ms: number): () => void {
    const h = setInterval(fn, ms);
    return () => clearInterval(h);
  },
};

export interface SchedulerOptions {
  clock: Clock;
  timer: Timer;
  /** Called once per step, in order, with the absolute step index and its audio time. */
  onStep: (step: number, time: number) => void;
  /** Called at the start of every tick with the audio time, before any onStep. */
  onTick?: (now: number) => void;
  stepSec?: number;
  lookaheadSec?: number;
  tickMs?: number;
}

export interface Scheduler {
  /** Start from step 0 a short lead after now. Restarts if already running. */
  start(): void;
  /** Stop and forget the position. */
  stop(): void;
  /** Stop the timer and keep the position. */
  pause(): void;
  /** Continue on the next bar line after the last scheduled step. */
  resume(): void;
  /** Run one tick now (the timer calls this). */
  tick(): void;
  readonly running: boolean;
  readonly paused: boolean;
  /** Absolute index of the next step to be scheduled. */
  readonly nextStep: number;
}

/** Pure: the first bar line at or after an absolute step. */
export function nextBarLine(step: number): number {
  return Math.ceil(step / STEPS_PER_BAR) * STEPS_PER_BAR;
}

export function createScheduler(o: SchedulerOptions): Scheduler {
  const stepSec = o.stepSec ?? STEP_SEC;
  const ahead = o.lookaheadSec ?? LOOKAHEAD_SEC;
  const tickMs = o.tickMs ?? TICK_MS;
  let cancel: (() => void) | null = null;
  let running = false;
  let paused = false;
  // Step `anchorStep` sounds at `anchorTime`; later steps are computed from it, not summed.
  let anchorStep = 0;
  let anchorTime = 0;
  let next = 0;

  const timeOf = (step: number): number => anchorTime + (step - anchorStep) * stepSec;

  const arm = (): void => {
    if (cancel === null) cancel = o.timer.every(tick, tickMs);
  };
  const disarm = (): void => {
    if (cancel !== null) cancel();
    cancel = null;
  };

  function tick(): void {
    if (!running || paused) return;
    const now = o.clock.now();
    o.onTick?.(now);
    // A stall (main thread hitch, fold) left steps in the past: skip them rather than burst.
    while (timeOf(next) < now) next++;
    while (timeOf(next) < now + ahead) {
      o.onStep(next, timeOf(next));
      next++;
    }
  }

  function anchorAt(step: number): void {
    anchorStep = step;
    anchorTime = o.clock.now() + START_LEAD_SEC;
    next = step;
  }

  return {
    start(): void {
      disarm();
      running = true;
      paused = false;
      anchorAt(0);
      arm();
      tick();
    },
    stop(): void {
      disarm();
      running = false;
      paused = false;
      next = 0;
    },
    pause(): void {
      if (!running || paused) return;
      paused = true;
      disarm();
    },
    resume(): void {
      if (!running || !paused) return;
      paused = false;
      anchorAt(nextBarLine(next));
      arm();
      tick();
    },
    tick,
    get running(): boolean {
      return running;
    },
    get paused(): boolean {
      return paused;
    },
    get nextStep(): number {
      return next;
    },
  };
}

/** A note ready for the engine: absolute audio time and seconds, gain already mixed. */
export interface PlannedNote {
  readonly layer: Layer;
  readonly midi: number | null;
  readonly time: number;
  readonly dur: number;
  readonly gain: number;
}

/**
 * Pure: the notes to play for one step of a bar under a mix. Layers at gain 0 and hat
 * sixteenths below the hat16 threshold are dropped.
 */
export function planStep(bar: BarPattern, stepInBar: number, mix: Mix, time: number, stepSec = STEP_SEC): PlannedNote[] {
  const out: PlannedNote[] = [];
  for (const n of bar.notes) {
    if (n.step !== stepInBar) continue;
    if (n.sub && !mix.hat16) continue;
    const g = mix.gains[n.layer] * n.vel;
    if (!(g > 0)) continue;
    out.push({ layer: n.layer, midi: n.midi, time, dur: n.durSteps * stepSec, gain: g });
  }
  return out;
}
