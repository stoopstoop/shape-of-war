import { describe, expect, it } from 'vitest';
import { mixFor } from '../../../src/audio/music/intensity';
import {
  ARP_LIFT_SEMITONES,
  ARP_LIFT_VEL,
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

  it('event times are strictly increasing and never more than the lookahead ahead', () => {
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
    expect(burst.length).toBeLessThanOrEqual(Math.ceil(LOOKAHEAD_SEC / STEP_SEC));
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

  it('a 250 ms lookahead rides out 200 ms stalls that made a 100 ms lookahead drop steps', () => {
    expect(LOOKAHEAD_SEC).toBe(0.25);
    const drive = (lookaheadSec: number): { skipped: number; steps: number[] } => {
      const clock = { t: 3 };
      const timer = new FakeTimer();
      const steps: number[] = [];
      const s = createScheduler({ clock: { now: () => clock.t }, timer, lookaheadSec, onStep: (st, time) => {
        expect(time).toBeGreaterThanOrEqual(clock.t);
        steps.push(st);
      } });
      s.start();
      for (let i = 0; i < 2000; i++) {
        // Every 37th tick is a 200 ms stall (a heavy frame), the rest land 0 to 30 ms late.
        clock.t += TICK_MS / 1000 + (i % 37 === 36 ? 0.2 : ((i * 7919) % 31) / 1000);
        timer.fire();
      }
      return { skipped: s.skipped, steps };
    };
    const old = drive(0.1);
    expect(old.skipped).toBeGreaterThan(0);
    const now = drive(LOOKAHEAD_SEC);
    expect(now.skipped).toBe(0);
    // Every step from 0 on, once, in order.
    expect(now.steps).toEqual(now.steps.map((_, i) => i));
  });

  it('timeOf and stepAtOrAfter follow the grid', () => {
    const r = rig();
    r.sched.start();
    const t0 = r.sched.timeOf(0);
    expect(r.sched.timeOf(8) - t0).toBeCloseTo(8 * STEP_SEC, 12);
    expect(r.sched.stepAtOrAfter(t0)).toBe(0);
    expect(r.sched.stepAtOrAfter(t0 + 8 * STEP_SEC)).toBe(8);
    expect(r.sched.stepAtOrAfter(t0 + 8 * STEP_SEC + 0.001)).toBe(9);
    expect(r.sched.stepAtOrAfter(t0 + 7.5 * STEP_SEC)).toBe(8);
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

  it('the lift plays the arp an octave up and softer, and lets the perc in', () => {
    const plain = planStep(bar, 0, mixFor(0.9, false), 1).find((n) => n.layer === 'arp');
    const lifted = planStep(bar, 0, mixFor(0.9, true), 1).find((n) => n.layer === 'arp');
    expect(lifted?.midi).toBe((plain?.midi ?? 0) + ARP_LIFT_SEMITONES);
    expect(lifted?.gain).toBeCloseTo((plain?.gain ?? 0) * ARP_LIFT_VEL, 12);
    expect(planStep(bar, 4, mixFor(0.9, false), 1).some((n) => n.layer === 'perc')).toBe(false);
    expect(planStep(bar, 4, mixFor(0.9, true), 1).some((n) => n.layer === 'perc')).toBe(true);
  });
});

describe('tempo change (v2.1 tunes, Endless rotation)', () => {
  const NEW = 60 / 104 / 4;

  it('keeps the old grid up to the change step and the new grid after it, with no gap or overlap', () => {
    const r = rig();
    r.sched.start();
    r.run(1);
    const t0 = r.recs[0]?.time ?? 0;
    const from = nextBarLine(r.sched.nextStep + 4);
    r.sched.setStepSec(NEW, from);
    expect(r.sched.timeOf(from) - t0).toBeCloseTo(from * STEP_SEC, 9);
    expect(r.sched.timeOf(from + 16) - r.sched.timeOf(from)).toBeCloseTo(16 * NEW, 9);
    expect(r.sched.stepSecAt(from - 1)).toBe(STEP_SEC);
    expect(r.sched.stepSecAt(from)).toBe(NEW);
    expect(r.sched.stepAtOrAfter(r.sched.timeOf(from + 5))).toBe(from + 5);
    expect(r.sched.stepAtOrAfter(r.sched.timeOf(from - 3))).toBe(from - 3);
    r.run(6, true);
    // Every step scheduled once, in order, never in the past; spacing switches at `from`.
    for (let i = 1; i < r.recs.length; i++) {
      const a = r.recs[i - 1];
      const b = r.recs[i];
      if (!a || !b) continue;
      expect(b.step).toBe(a.step + 1);
      expect(b.time - a.time).toBeCloseTo(a.step < from ? STEP_SEC : NEW, 9);
      expect(b.time).toBeGreaterThanOrEqual(b.now);
    }
    expect(r.sched.skipped).toBe(0);
    // After the grid passes the change, timeOf still agrees with what was scheduled from it on.
    for (const e of r.recs) if (e.step >= from) expect(r.sched.timeOf(e.step)).toBeCloseTo(e.time, 9);
  });

  it('a change booked in the past applies from the next step, and resume keeps the new tempo', () => {
    const r = rig();
    r.sched.start();
    r.run(0.5);
    const next = r.sched.nextStep;
    r.sched.setStepSec(NEW, 0);
    expect(r.sched.stepSecAt(next)).toBe(NEW);
    r.run(0.5);
    r.sched.pause();
    r.clock.t += 3;
    const before = r.recs.length;
    r.sched.resume();
    r.run(1);
    const after = r.recs.slice(before);
    for (let i = 1; i < after.length; i++) expect((after[i]?.time ?? 0) - (after[i - 1]?.time ?? 0)).toBeCloseTo(NEW, 9);
    expect((after[0]?.step ?? 1) % STEPS_PER_BAR).toBe(0);
  });

  it('a change booked past a pause applies on the resumed grid', () => {
    const r = rig();
    r.sched.start();
    r.run(0.5);
    const from = nextBarLine(r.sched.nextStep) + 32;
    r.sched.setStepSec(NEW, from);
    r.sched.pause();
    r.clock.t += 2;
    r.sched.resume();
    r.run(12);
    const at = r.recs.findIndex((e) => e.step === from);
    expect(at).toBeGreaterThan(0);
    const a = r.recs[at - 1];
    const b = r.recs[at];
    const c = r.recs[at + 1];
    expect((b?.time ?? 0) - (a?.time ?? 0)).toBeCloseTo(STEP_SEC, 9);
    expect((c?.time ?? 0) - (b?.time ?? 0)).toBeCloseTo(NEW, 9);
  });

  it('ignores a tempo that is not positive and finite', () => {
    const r = rig();
    r.sched.start();
    r.sched.setStepSec(0, 16);
    r.sched.setStepSec(Number.NaN, 16);
    expect(r.sched.stepSecAt(100)).toBe(STEP_SEC);
  });
});
