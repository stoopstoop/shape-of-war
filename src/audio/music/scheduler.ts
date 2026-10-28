// Lookahead scheduler (SPEC 3.9 item 4, v2 fixes). A timer every 25 ms schedules every step
// whose time falls inside the next 250 ms of AudioContext.currentTime. Note times always come
// from the audio clock, never from timer time. Clock and timer are injected so tests run in node.
//
// Why 250 ms and not 100 ms (v2 fixes, GD "some glitches"): with 100 ms of lookahead and a 25 ms
// timer, any main thread stall longer than 75 ms (a heavy frame at 400 entities, a GC pause, a
// bomb) left steps in the past, and the scheduler skipped them: an audible hole in the beat.
// 250 ms rides out stalls up to 225 ms. Threat follows a 0.5 s attack anyway, so the extra
// latency is not heard; kill accents are placed on the 16th grid independently (see index.ts).
import type { Mix } from './intensity';
import { STEP_SEC, STEPS_PER_BAR, type BarPattern, type Layer } from './track';

export const TICK_MS = 25;
export const LOOKAHEAD_SEC = 0.25;
/** Delay from start or resume to the first step, so it is never scheduled in the past. */
export const START_LEAD_SEC = 0.05;
const HORIZON_EPS = 1e-6;

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
  /** Steps skipped because a stall left them in the past (0 when the lookahead holds). */
  readonly skipped: number;
  /** Audio time of an absolute step on the current grid. */
  timeOf(step: number): number;
  /** Pure on the current grid: the first step whose time is at or after `time`. */
  stepAtOrAfter(time: number): number;
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
  let skipped = 0;

  const timeOf = (step: number): number => anchorTime + (step - anchorStep) * stepSec;
  const stepAtOrAfter = (time: number): number => {
    // Nanosecond slack so a time exactly on the grid maps to its own step despite float rounding.
    return anchorStep + Math.ceil((time - anchorTime) / stepSec - 1e-9);
  };

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
    while (timeOf(next) < now) {
      next++;
      skipped++;
    }
    // A step exactly on the horizon waits for the next tick; the epsilon keeps float rounding
    // of the clock from deciding it either way.
    while (timeOf(next) < now + ahead - HORIZON_EPS) {
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
    get skipped(): number {
      return skipped;
    },
    timeOf,
    stepAtOrAfter,
  };
}

/** Arp notes are lifted by this many semitones while the lift is on. */
export const ARP_LIFT_SEMITONES = 12;
/** The lifted arp is brighter, so it plays a little softer. */
export const ARP_LIFT_VEL = 0.85;

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
 * sixteenths below the hat16 threshold are dropped. While the lift is on the arp plays an
 * octave up, a little softer.
 */
export function planStep(bar: BarPattern, stepInBar: number, mix: Mix, time: number, stepSec = STEP_SEC): PlannedNote[] {
  const out: PlannedNote[] = [];
  for (const n of bar.notes) {
    if (n.step !== stepInBar) continue;
    if (n.sub && !mix.hat16) continue;
    const up = mix.lift && n.layer === 'arp';
    const g = mix.gains[n.layer] * n.vel * (up ? ARP_LIFT_VEL : 1);
    if (!(g > 0)) continue;
    const midi = up && n.midi !== null ? n.midi + ARP_LIFT_SEMITONES : n.midi;
    out.push({ layer: n.layer, midi, time, dur: n.durSteps * stepSec, gain: g });
  }
  return out;
}
