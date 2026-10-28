import { describe, expect, it } from 'vitest';
import {
  createMusicEngine,
  KICK_F0,
  KICK_F1,
  MUSIC_VOICE_CAP,
  voiceLength,
  voicePeak,
  VoicePool,
} from '../../../src/audio/music/engine';
import type { PlannedNote } from '../../../src/audio/music/scheduler';
import { FakeContext, FakeNode, FakeOsc } from './fakeAudio';

const arp = (time: number, midi = 69): PlannedNote => ({ layer: 'arp', midi, time, dur: 0.125, gain: 0.1 });

function setup(): { ctx: FakeContext; dest: FakeNode; engine: ReturnType<typeof createMusicEngine> } {
  const ctx = new FakeContext();
  const dest = new FakeNode();
  const engine = createMusicEngine(ctx, dest, 0.175);
  return { ctx, dest, engine };
}

describe('voice pool', () => {
  it('has room until the cap, then the 17th voice steals the oldest', () => {
    const pool = new VoicePool<number>(MUSIC_VOICE_CAP);
    expect(MUSIC_VOICE_CAP).toBe(16);
    // Added out of start order on purpose: oldest is id 3 at start 0.5.
    const starts = [1, 2, 3, 0.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    starts.forEach((s, i) => expect(pool.add(s, 100, i)).toBeNull());
    expect(pool.size).toBe(16);
    expect(pool.add(16, 100, 99)).toBe(3);
    expect(pool.size).toBe(16);
    expect(pool.add(17, 100, 100)).toBe(0);
  });

  it('prunes ended voices so they free slots', () => {
    const pool = new VoicePool<number>(2);
    pool.add(0, 1, 1);
    pool.add(0.5, 3, 2);
    pool.prune(1);
    expect(pool.size).toBe(1);
    expect(pool.add(2, 4, 3)).toBeNull();
  });
});

describe('music engine', () => {
  it('routes the music bus into the synth master at the given gain, capped at 0.35', () => {
    const { ctx, dest, engine } = setup();
    const out = ctx.gains[0];
    expect(out?.connected).toContain(dest);
    expect(out?.gain.value).toBeCloseTo(0.175, 9);
    engine.setMaster(5);
    expect(out?.gain.calls.at(-1)?.v).toBe(0.35);
    const capped = createMusicEngine(new FakeContext(), dest, 2);
    expect(capped.voiceCount).toBe(0);
  });

  it('the 17th voice steals the oldest', () => {
    const { ctx, engine } = setup();
    const before = ctx.oscs.length;
    for (let i = 0; i < 16; i++) engine.play(arp(0.01 * i));
    expect(engine.voiceCount).toBe(16);
    const first = ctx.oscs[before];
    expect(first?.stops).toHaveLength(1);
    engine.play(arp(0.2));
    expect(engine.voiceCount).toBe(16);
    // The oldest voice got a second, earlier stop and its output faded to 0.
    expect(first?.stops).toHaveLength(2);
    expect(first?.stops[1]).toBeLessThan(first?.stops[0] ?? 0);
    const second = ctx.oscs[before + 1];
    expect(second?.stops).toHaveLength(1);
  });

  it('never exceeds 16 voices however many notes are scheduled', () => {
    const { engine } = setup();
    for (let i = 0; i < 200; i++) {
      engine.play({ layer: 'pad', midi: 57, time: i * 0.01, dur: 2, gain: 0.2 });
      expect(engine.voiceCount).toBeLessThanOrEqual(MUSIC_VOICE_CAP);
    }
  });

  it('frees voices once their notes end', () => {
    const { ctx, engine } = setup();
    for (let i = 0; i < 10; i++) engine.play(arp(0.01 * i));
    ctx.currentTime = 5;
    engine.play(arp(5));
    expect(engine.voiceCount).toBe(1);
  });

  it('disconnects every node of a note when it ends', () => {
    const { ctx, engine } = setup();
    const gainsBefore = ctx.gains.length;
    engine.play(arp(0.1));
    const osc = ctx.oscs.at(-1);
    const noteGains = ctx.gains.slice(gainsBefore);
    expect(noteGains).toHaveLength(2);
    expect(osc?.disconnected).toBe(false);
    osc?.end();
    expect(osc?.disconnected).toBe(true);
    for (const g of noteGains) expect(g.disconnected).toBe(true);
  });

  it('builds each layer with its waveform', () => {
    const { ctx, engine } = setup();
    const lfo = ctx.oscs[0];
    expect(lfo?.type).toBe('sine');
    const start = ctx.oscs.length;
    engine.play({ layer: 'bass', midi: 45, time: 0.1, dur: 0.25, gain: 0.2 });
    engine.play({ layer: 'pad', midi: 57, time: 0.1, dur: 2, gain: 0.2 });
    engine.play({ layer: 'kick', midi: null, time: 0.1, dur: 0.125, gain: 0.2 });
    engine.play({ layer: 'arp', midi: 69, time: 0.1, dur: 0.125, gain: 0.1 });
    engine.play({ layer: 'hat', midi: null, time: 0.1, dur: 0.125, gain: 0.1 });
    const types = ctx.oscs.slice(start).map((o: FakeOsc) => o.type);
    expect(types).toEqual(['triangle', 'sawtooth', 'sawtooth', 'sine', 'square']);
    const kick = ctx.oscs[start + 3];
    expect(kick?.frequency.calls[0]?.v).toBe(KICK_F0);
    expect(kick?.frequency.calls.at(-1)?.v).toBe(KICK_F1);
    const [d1, d2] = [ctx.oscs[start + 1], ctx.oscs[start + 2]].map((o) => o?.detune.calls[0]?.v ?? 0);
    expect(d1).toBeLessThan(0);
    expect(d2).toBeGreaterThan(0);
    expect(ctx.bufferSources).toHaveLength(1);
    expect(ctx.bufferSources[0]?.loop).toBe(true);
    expect(engine.voiceCount).toBe(5);
  });

  it('never starts a note in the past', () => {
    const { ctx, engine } = setup();
    ctx.currentTime = 2;
    engine.play(arp(1.5));
    expect(ctx.oscs.at(-1)?.startAt).toBe(2);
  });

  it('silence drains every voice, dispose disconnects the graph', () => {
    const { ctx, engine } = setup();
    for (let i = 0; i < 5; i++) engine.play(arp(0.05 * i));
    engine.silence();
    expect(engine.voiceCount).toBe(0);
    engine.dispose();
    expect(ctx.gains[0]?.disconnected).toBe(true);
    expect(ctx.oscs[0]?.stops.length).toBeGreaterThan(0);
    const n = ctx.oscs.length;
    engine.play(arp(1));
    expect(ctx.oscs.length).toBe(n);
  });

  it('voice length and peak helpers', () => {
    expect(voiceLength('pad', 2)).toBeGreaterThan(2);
    expect(voiceLength('arp', 0.125)).toBeLessThanOrEqual(0.125);
    expect(voicePeak('pad', 0.3)).toBeCloseTo(0.1, 9);
    expect(voicePeak('kick', 0.3)).toBe(0.3);
  });
});
