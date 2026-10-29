// Boss sound effects (v3 wave B, docs/12 "Design: boss music" item 6): the four new cues exist,
// the boss hit is heavier than the music's per kind hit ticks and throttled, the shot blip is held
// to 6 per second, the existing cues are unchanged, and through the real synth (a fake
// AudioContext) a storm of boss events never holds more than the 24 voice sfx cap.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  BOSS_KIND,
  CUES,
  createWindowLimiter,
  cueForHit,
  MAX_VOICES,
  RATE_LIMITS,
  WINDOW_LIMITS,
  type CueDef,
} from '../../src/audio/cues';
import { HIT_DUR_SEC, HIT_GAIN_MAX } from '../../src/audio/music/hits';
import { installAudio, sfxVoiceCount, unlockAudio } from '../../src/audio/synth';
import { Bus } from '../../src/core/events';
import { Kind } from '../../src/game/world';
import { FakeContext, FakeNode, type FakeOsc } from './music/fakeAudio';

const gainOf = (c: CueDef): number => c.voices.reduce((a, v) => a + v.gain, 0);
const durOf = (c: CueDef): number => Math.max(...c.voices.map((v) => v.dur));

describe('boss cue table', () => {
  it('has the four boss cues, each with voices', () => {
    for (const name of ['bossRumble', 'bossHit', 'bossDeath', 'bossShot'] as const) expect(CUES[name].voices.length).toBeGreaterThan(0);
  });

  it('the boss hit is heavier than the per kind hit ticks: louder, longer and lower', () => {
    const hit = CUES.bossHit;
    expect(gainOf(hit)).toBeGreaterThan(HIT_GAIN_MAX * 2);
    expect(durOf(hit)).toBeGreaterThan(HIT_DUR_SEC);
    const tone = hit.voices.find((v) => v.wave !== 'noise');
    expect(tone?.f0 ?? 1e9).toBeLessThan(220); // the lowest kill note tick sits above A3
    expect(RATE_LIMITS.bossHit).toBe(8);
  });

  it('the boss death is a bigKill variant: the same kinds of voices, longer and with a sub boom', () => {
    const big = CUES.bigKill;
    const death = CUES.bossDeath;
    expect(durOf(death)).toBeGreaterThan(durOf(big));
    for (const v of big.voices) expect(death.voices.some((d) => d.wave === v.wave)).toBe(true);
    expect(death.voices.some((d) => d.wave === 'sine' && d.f1 < 50)).toBe(true);
  });

  it('the shot blip is soft and apart from the player fire cue', () => {
    const shot = CUES.bossShot.voices[0];
    const fire = CUES.fire.voices[0];
    expect(shot?.wave).not.toBe(fire?.wave);
    expect(gainOf(CUES.bossShot)).toBeLessThanOrEqual(0.05);
    expect(WINDOW_LIMITS.bossShot).toBe(6);
  });

  it('existing cues are unchanged', () => {
    expect(CUES.fire).toEqual({ voices: [{ wave: 'square', f0: 880, f1: 660, dur: 0.04, gain: 0.04 }] });
    expect(CUES.bigKill.voices.map((v) => [v.wave, v.f0, v.f1, v.dur, v.gain])).toEqual([
      ['noise', 0, 0, 0.4, 0.18],
      ['sawtooth', 220, 55, 0.4, 0.18],
    ]);
    expect(CUES.bomb.voices.map((v) => v.gain)).toEqual([0.3, 0.3]);
    expect(RATE_LIMITS.fire).toBe(12);
    expect(RATE_LIMITS.geomPickup).toBe(20);
    expect(RATE_LIMITS.telegraph).toBe(4);
  });

  it('routes fx:hit: a damaging Kind.Boss hit to the boss hit, nothing else', () => {
    expect(BOSS_KIND).toBe(Kind.Boss);
    expect(cueForHit(Kind.Boss, false)).toBe('bossHit');
    expect(cueForHit(Kind.Boss, true)).toBeNull();
    expect(cueForHit(Kind.BossPart, false)).toBeNull();
    expect(cueForHit(Kind.Grunt, false)).toBeNull();
  });
});

describe('shot blip throttle', () => {
  it('a 120 Hz caller gets at most 6 blips in any one second window, and 6 in each second', () => {
    const lim = createWindowLimiter(6);
    const times: number[] = [];
    for (let i = 0; i < 360; i++) if (lim.allow(i / 120)) times.push(i / 120);
    expect(times).toHaveLength(18);
    for (const t of times) expect(times.filter((x) => x >= t && x < t + 1).length).toBeLessThanOrEqual(6);
  });

  it('a 4 Hz caller is never dropped', () => {
    const lim = createWindowLimiter(6);
    let n = 0;
    for (let i = 0; i < 40; i++) if (lim.allow(i / 4)) n++;
    expect(n).toBe(40);
  });
});

// ---------------------------------------------------------------------------------------
// Through the real synth with a fake AudioContext.

class SfxContext extends FakeContext {
  static last: SfxContext | null = null;
  readonly destination = new FakeNode();
  state: 'running' | 'suspended' = 'running';
  constructor() {
    super();
    SfxContext.last = this;
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    return Promise.resolve();
  }
}

const listeners = { addEventListener: (): void => undefined, removeEventListener: (): void => undefined };
let bus: Bus;
let uninstall: () => void;
let ctx: SfxContext;

/** Oscillators started with a first frequency of `hz` since `from`. */
function started(hz: number, from = 0): number {
  return ctx.oscs.slice(from).filter((o: FakeOsc) => o.frequency.calls[0]?.v === hz).length;
}

beforeAll(async () => {
  vi.stubGlobal('AudioContext', SfxContext);
  vi.stubGlobal('window', listeners);
  vi.stubGlobal('document', { ...listeners, hidden: false });
  await unlockAudio();
  const c = SfxContext.last;
  if (!c) throw new Error('no context');
  ctx = c;
  bus = new Bus();
  uninstall = installAudio({ volume: 70, bus });
});

afterAll(() => {
  uninstall();
  vi.unstubAllGlobals();
});

describe('boss cues through the synth', () => {
  it('the bus plays the rumble, the hit, the death and the shot', () => {
    const from = ctx.oscs.length;
    ctx.currentTime = 100;
    bus.emit('sim:bossEnter', { id: 'warden', tier: 1 });
    expect(started(82, from)).toBe(1);
    bus.emit('fx:hit', { x: 0, y: 0, kind: Kind.Boss, id: 3, blocked: false });
    expect(started(196, from)).toBe(1);
    bus.emit('fx:hit', { x: 0, y: 0, kind: Kind.Boss, id: 3, blocked: true });
    ctx.currentTime = 100.5;
    bus.emit('fx:hit', { x: 0, y: 0, kind: Kind.Boss, id: 3, blocked: true });
    expect(started(196, from)).toBe(1); // a blocked hit is the music's deflect, not this cue
    bus.emit('fx:bossShot', { x: 0, y: 0, id: 'spindle' });
    expect(started(640, from)).toBe(1);
    bus.emit('sim:bossDown', { id: 'warden', x: 0, y: 0 });
    bus.emit('sfx', 'explode');
    expect(started(220, from)).toBe(1); // the death saw
    expect(started(440, from)).toBe(0); // the small kill sound after it is swallowed
    // The next ordinary kill sounds again.
    bus.emit('fx:kill', { x: 0, y: 0, colour: 'blue', kind: Kind.Grunt, id: 9 });
    bus.emit('sfx', 'explode');
    expect(started(440, from)).toBe(1);
  });

  it('fx:bossShot at 60 Hz for 3 s plays at most 6 blips a second', () => {
    const from = ctx.oscs.length;
    const t0 = 200;
    for (let i = 0; i < 180; i++) {
      ctx.currentTime = t0 + i / 60;
      bus.emit('fx:bossShot', { x: 0, y: 0, id: 'ember' });
    }
    const n = started(640, from);
    expect(n).toBeLessThanOrEqual(18);
    expect(n).toBeGreaterThanOrEqual(17);
  });

  it('boss hits at 60 Hz are throttled to about 8 a second', () => {
    const from = ctx.oscs.length;
    for (let i = 0; i < 120; i++) {
      ctx.currentTime = 300 + i / 60;
      bus.emit('fx:hit', { x: 0, y: 0, kind: Kind.Boss, id: 1, blocked: false });
    }
    const n = started(196, from);
    expect(n).toBeLessThanOrEqual(17);
    expect(n).toBeGreaterThanOrEqual(14);
  });

  it('a storm of boss and combat events never holds more than 24 sfx voices', () => {
    expect(MAX_VOICES).toBe(24);
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      ctx.currentTime = 400 + i / 120;
      bus.emit('fx:hit', { x: 0, y: 0, kind: Kind.Boss, id: 1, blocked: false });
      bus.emit('fx:bossShot', { x: 0, y: 0, id: 'ember' });
      if (i % 10 === 0) bus.emit('sim:bossEnter', { id: 'ember', tier: 2 });
      if (i % 7 === 0) bus.emit('sim:bossDown', { id: 'ember', x: 0, y: 0 });
      bus.emit('sfx', 'shot');
      bus.emit('sfx', 'explode');
      if (i % 5 === 0) bus.emit('sfx', 'bomb');
      peak = Math.max(peak, sfxVoiceCount());
      expect(sfxVoiceCount()).toBeLessThanOrEqual(MAX_VOICES);
    }
    expect(peak).toBe(MAX_VOICES);
  });
});
