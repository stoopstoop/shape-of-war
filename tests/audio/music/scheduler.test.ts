import { describe, expect, it } from 'vitest';
import { mixFor } from '../../../src/audio/music/intensity';
import {
  createScheduler,
  LOOKAHEAD_SEC,
  nextBarLine,
  planStep,
  TICK_MS,
} from '../../../src/audio/music/scheduler';
import { buildBar, STEP_SEC, STEPS_PER_BAR } from '../../../src/audio/music/track';
import { FakeTimer } from './fakeAudio';

interface Rec {
  step: number;
  time: number;
  now: number;
}

function rig(): {
  clock: { t: number };
  timer: FakeTimer;
  recs: Rec[];
  sched: ReturnType<typeof createScheduler>;
  run: (sec: number, jitter?: boolean) => void;
} {
  const clock = { t: 10 };
  const timer = new FakeTimer();
  const recs: Rec[] = [];
  const sched = createScheduler({
    clock: { now: () => clock.t },
    timer,
    onStep: (step, time) => recs.push({ step, time, now: clock.t }),
  });
  let k = 0;
  const run = (sec: number, jitter = false): void => {
    const end = clock.t + sec;
    while (clock.t < end) {
      // Jitter models a busy main thread: ticks land 0 to 30 ms late.
      const late = jitter ? ((k * 7919) % 31) / 1000 : 0;
      k++;
      clock.t += TICK_MS / 1000 + late;
      timer.fire();
    }
  };
  return { clock, timer, recs, sched, run };
}

describe('lookahead scheduler', () => {
  it('ticks every 25 ms', () => {
    const r = rig();
    r.sched.start();
    expect(r.timer.intervals).toEqual([25]);
    expect(r.timer.live).toBe(1);
  });

  it('event times are strictly increasing and never more than 100 ms ahead', () => {
    const r = rig();
    r.sched.start();
    r.run(20, true);
    expect(r.recs.length).toBeGreaterThan(150);
    for (let i = 0; i < r.recs.length; i++) {
      const e = r.recs[i];
      if (!e) continue;
      expect(e.time - e.now).toBeLessThan(LOOKAHEAD_SEC);
      expect(e.time).toBeGreaterThanOrEqual(e.now);
      const prev = r.recs[i - 1];
      if (prev) {
        expect(e.time).toBeGreaterThan(prev.time);
        expect(e.step).toBeGreaterThan(prev.step);
      }
    }
  });

  it('keeps the step grid exact from the audio clock', () => {
    const r = rig();
    r.sched.start();
    r.run(5);
    const first = r.recs[0];
    expect(first?.step).toBe(0);
    for (const e of r.recs) expect(e.time - (first?.time ?? 0)).toBeCloseTo(e.step * STEP_SEC, 9);
  });

  it('skips steps that fell behind a stall instead of bursting them', () => {
    const r = rig();
    r.sched.start();
    r.run(1);
    const before = r.recs.length;
    r.clock.t += 1; // the main thread froze for a second
    r.timer.fire();
    const burst = r.recs.slice(before);
    expect(burst.length).toBeLessThanOrEqual(1);
    for (const e of burst) expect(e.time).toBeGreaterThanOrEqual(e.now);
  });

  it('no duplicate step after pause and resume, and resume lands on the next bar line', () => {
    const r = rig();
    r.sched.start();
    r.run(1.3);
    r.sched.pause();
    expect(r.timer.live).toBe(0);
    const pausedAt = r.recs.length;
    const lastStep = r.recs[pausedAt - 1]?.step ?? -1;
    r.run(4); // no steps while paused
    expect(r.recs.length).toBe(pausedAt);
    const resumeClock = r.clock.t;
    r.sched.resume();
    r.run(3, true);
    const after = r.recs.slice(pausedAt);
    expect(after[0]?.step).toBe(nextBarLine(lastStep + 1));
    expect((after[0]?.step ?? 1) % STEPS_PER_BAR).toBe(0);
    expect(after[0]?.time ?? 0).toBeGreaterThan(resumeClock);
    const steps = r.recs.map((e) => e.step);
    expect(new Set(steps).size).toBe(steps.length);
    for (let i = 1; i < r.recs.length; i++) {
      expect(r.recs[i]?.time ?? 0).toBeGreaterThan(r.recs[i - 1]?.time ?? 0);
      expect((r.recs[i]?.time ?? 0) - (r.recs[i]?.now ?? 0)).toBeLessThan(LOOKAHEAD_SEC);
    }
  });

  it('repeated pause and resume never repeats a step', () => {
    const r = rig();
    r.sched.start();
    for (let i = 0; i < 10; i++) {
      r.run(0.3 + i * 0.17);
      r.sched.pause();
      r.sched.pause();
      r.run(0.5);
      r.sched.resume();
      r.sched.resume();
    }
    const steps = r.recs.map((e) => e.step);
    expect(new Set(steps).size).toBe(steps.length);
    expect(r.timer.live).toBe(1);
  });

  it('stop clears the timer and start restarts from step 0', () => {
    const r = rig();
    r.sched.start();
    r.run(1);
    r.sched.stop();
    expect(r.timer.live).toBe(0);
    expect(r.sched.running).toBe(false);
    r.recs.length = 0;
    r.sched.start();
    r.run(0.2);
    expect(r.recs[0]?.step).toBe(0);
  });

  it('nextBarLine rounds up to a multiple of 16', () => {
    expect(nextBarLine(0)).toBe(0);
    expect(nextBarLine(1)).toBe(16);
    expect(nextBarLine(16)).toBe(16);
    expect(nextBarLine(17)).toBe(32);
  });
});

describe('planStep', () => {
  const bar = buildBar(5, 0);

  it('plays only the pad at threat 0', () => {
    const layers = new Set<string>();
    for (let s = 0; s < STEPS_PER_BAR; s++) for (const n of planStep(bar, s, mixFor(0), 1)) layers.add(n.layer);
    expect([...layers]).toEqual(['pad']);
  });

  it('adds hat sixteenths only from 0.7', () => {
    const at = (lvl: number): number => planStep(bar, 1, mixFor(lvl), 1).filter((n) => n.layer === 'hat').length;
    expect(at(0.69)).toBe(0);
    expect(at(0.7)).toBe(1);
    expect(planStep(bar, 2, mixFor(0.5), 1).some((n) => n.layer === 'hat')).toBe(true);
  });

  it('stamps time and duration in seconds', () => {
    const notes = planStep(bar, 0, mixFor(1), 3.5);
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.time).toBe(3.5);
      expect(n.gain).toBeGreaterThan(0);
    }
    expect(notes.find((n) => n.layer === 'pad')?.dur).toBe(2);
  });
});
