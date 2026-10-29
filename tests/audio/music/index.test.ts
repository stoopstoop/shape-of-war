import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getMusicVolume,
  initMusic,
  musicState,
  setMusicVolume,
  startMusic,
  stopMusic,
  type MusicGraph,
  type VisibilitySource,
} from '../../../src/audio/music/index';
import { TICK_MS } from '../../../src/audio/music/scheduler';
import { STEPS_PER_BAR } from '../../../src/audio/music/track';
import { Bus } from '../../../src/core/events';
import { FakeContext, FakeNode, FakeTimer } from './fakeAudio';

class FakeDoc implements VisibilitySource {
  hidden = false;
  private fns = new Set<() => void>();
  addEventListener(_t: 'visibilitychange', fn: () => void): void {
    this.fns.add(fn);
  }
  removeEventListener(_t: 'visibilitychange', fn: () => void): void {
    this.fns.delete(fn);
  }
  set(hidden: boolean): void {
    this.hidden = hidden;
    for (const fn of this.fns) fn();
  }
}

let ctx: FakeContext;
let timer: FakeTimer;
let bus: Bus;
let doc: FakeDoc;
let graph: MusicGraph | null;
let uninstall: () => void;

function advance(sec: number): void {
  const n = Math.round(sec / (TICK_MS / 1000));
  for (let i = 0; i < n; i++) {
    ctx.currentTime += TICK_MS / 1000;
    timer.fire();
  }
}

beforeEach(() => {
  ctx = new FakeContext();
  timer = new FakeTimer();
  bus = new Bus();
  doc = new FakeDoc();
  graph = { ctx, master: new FakeNode() };
  uninstall = initMusic({ tune: 'neon', bus, graph: () => graph, timer, visibility: doc, volume: 50 });
});

afterEach(() => {
  uninstall();
});

describe('music entry points', () => {
  it('stays silent before audio is unlocked', () => {
    graph = null;
    expect(startMusic(1)).toBe(false);
    expect(musicState().playing).toBe(false);
  });

  it('starts from bar 0, plays the pad at threat 0 and stops cleanly', () => {
    expect(startMusic(42)).toBe(true);
    advance(0.5);
    const st = musicState();
    expect(st.playing).toBe(true);
    expect(st.voices).toBeGreaterThan(0);
    expect(ctx.oscs.some((o) => o.type === 'sawtooth')).toBe(true);
    expect(ctx.oscs.some((o) => o.type === 'square')).toBe(false);
    stopMusic();
    expect(musicState().playing).toBe(false);
    expect(timer.live).toBe(0);
  });

  it('follows sim:threat with smoothing and adds layers', () => {
    startMusic(42);
    bus.emit('sim:threat', { level: 1 });
    advance(0.5);
    expect(musicState().level).toBeGreaterThan(0.9);
    advance(2);
    expect(ctx.oscs.some((o) => o.type === 'square')).toBe(true);
    expect(ctx.bufferSources.length).toBeGreaterThan(0);
    bus.emit('sim:threat', { level: 0 });
    advance(0.5);
    expect(musicState().level).toBeGreaterThan(0.5);
  });

  it('game:pause suspends, game:resume continues on the next bar line', () => {
    startMusic(7);
    advance(1.1);
    bus.emit('game:pause');
    expect(musicState().suspended).toBe(true);
    expect(musicState().voices).toBe(0);
    expect(timer.live).toBe(0);
    const n = ctx.oscs.length;
    advance(2);
    expect(ctx.oscs.length).toBe(n);
    bus.emit('game:resume');
    expect(musicState().suspended).toBe(false);
    advance(0.2);
    expect(musicState().nextStep).toBeGreaterThan(STEPS_PER_BAR);
    expect(ctx.oscs.length).toBeGreaterThan(n);
  });

  it('a hidden tab suspends; visible again resumes unless the game is paused', () => {
    startMusic(7);
    advance(0.5);
    doc.set(true);
    expect(musicState().suspended).toBe(true);
    bus.emit('game:pause');
    doc.set(false);
    expect(musicState().suspended).toBe(true);
    bus.emit('game:resume');
    expect(musicState().suspended).toBe(false);
  });

  it('game:over and game:quit stop the music', () => {
    startMusic(1);
    bus.emit('game:over', { score: 0, stars: 0, levelIndex: 1, mode: 'adventure' });
    expect(musicState().playing).toBe(false);
    startMusic(1);
    bus.emit('game:quit');
    expect(musicState().playing).toBe(false);
  });

  it('volume defaults to 50, clamps, and 0 schedules nothing', () => {
    expect(getMusicVolume()).toBe(50);
    expect(setMusicVolume(250)).toBe(100);
    expect(setMusicVolume(0)).toBe(0);
    startMusic(3);
    advance(1);
    expect(musicState().voices).toBe(0);
    setMusicVolume(50);
    advance(1);
    expect(musicState().voices).toBeGreaterThan(0);
  });

  it('restart is deterministic from bar 0', () => {
    const freqs = (): number[] => ctx.oscs.filter((o) => o.type === 'square').map((o) => o.frequency.calls[0]?.v ?? 0);
    startMusic(99);
    bus.emit('sim:threat', { level: 1 });
    advance(4);
    const a = freqs();
    stopMusic();
    ctx.oscs = [];
    startMusic(99);
    bus.emit('sim:threat', { level: 1 });
    advance(4);
    const b = freqs();
    expect(b.length).toBeGreaterThan(0);
    expect(b.slice(-8)).toEqual(a.slice(-8));
  });
});
