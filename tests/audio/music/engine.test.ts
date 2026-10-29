import { describe, expect, it } from 'vitest';
import {
  accentRoomFor,
  createMusicEngine,
  peakIn,
  PERC_BP_HZ,
  STINGER_RESERVE,
  KICK_F0,
  KICK_F1,
  LIMITER,
  MUSIC_VOICE_CAP,
  oldestPreferred,
  voiceLength,
  voicePeak,
  VoicePool,
  voiceShape,
  type VoiceClass,
} from '../../../src/audio/music/engine';
import { LAYERS_FULL } from '../../../src/audio/music/layers';
import { midiToHz } from '../../../src/audio/music/scale';
import type { PlannedNote } from '../../../src/audio/music/scheduler';
import { FakeContext, FakeContextNoLimiter, FakeNode, FakeOsc } from './fakeAudio';

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
    // Overlapping notes: the pool counts voices sounding at the new note's start time.
    for (let i = 0; i < 16; i++) engine.play(arp(0.001 * i));
    expect(engine.voiceCount).toBe(16);
    const first = ctx.oscs[before];
    expect(first?.stops).toHaveLength(1);
    engine.play(arp(0.02));
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

  it('motif voices: timbre waveforms, glide, own filter, motif bus past the threat lowpass', () => {
    const { ctx, engine } = setup();
    const start = ctx.oscs.length;
    const filtersBefore = ctx.filters.length;
    const tb = LAYERS_FULL.splime.timbre; // sine plus detuned saw, glides
    engine.playVoice({ time: 0.1, dur: 1, midi: 52, fromMidi: 48, gain: 0.07, timbre: tb });
    const [a, b] = ctx.oscs.slice(start);
    expect(a?.type).toBe('sine');
    expect(b?.type).toBe('sawtooth');
    expect(b?.detune.calls[0]?.v).toBe(tb.partner?.detune);
    expect(a?.frequency.calls[0]?.v).toBeCloseTo(midiToHz(48), 6);
    expect(a?.frequency.calls.at(-1)?.fn).toBe('exp');
    expect(a?.frequency.calls.at(-1)?.v).toBeCloseTo(midiToHz(52), 6);
    const f = ctx.filters[filtersBefore];
    expect(f?.type).toBe(tb.filter);
    expect(engine.motifVoiceCount).toBe(1);
    // The output gain feeds the motif bus, which skips the threat lowpass and meets the bed in
    // the limiter before the music out gain.
    const out = ctx.gains[0];
    const motifBus = ctx.gains[1];
    const limiter = ctx.compressors[0];
    expect(motifBus?.connected).toContain(limiter);
    expect(limiter?.connected).toEqual([out]);
    expect(a?.startAt).toBe(0.1);
    expect(a?.stops[0]).toBeCloseTo(1.12, 9);
  });

  it('a limiter guards the summed music before the volume; it is optional and disposed', () => {
    const { ctx, dest, engine } = setup();
    expect(ctx.compressors).toHaveLength(1);
    const lim = ctx.compressors[0];
    expect(lim?.threshold.value).toBe(LIMITER.thresholdDb);
    expect(lim?.knee.value).toBe(LIMITER.kneeDb);
    expect(lim?.ratio.value).toBe(LIMITER.ratio);
    expect(lim?.attack.value).toBe(LIMITER.attackSec);
    expect(lim?.release.value).toBe(LIMITER.releaseSec);
    expect(LIMITER.thresholdDb).toBeLessThan(0);
    expect(LIMITER.ratio).toBeGreaterThanOrEqual(20);
    // Both the threat lowpass (bed) and the motif bus feed it; it feeds only the music gain.
    const master = ctx.filters[0];
    expect(master?.connected).toContain(lim);
    expect(ctx.gains[1]?.connected).toContain(lim);
    expect(lim?.connected).toEqual([ctx.gains[0]]);
    expect(ctx.gains[0]?.connected).toEqual([dest]);
    engine.dispose();
    expect(lim?.disconnected).toBe(true);
    // A context without a compressor wires the buses straight into the music gain and still plays.
    const bare = new FakeContextNoLimiter();
    const e2 = createMusicEngine(bare, dest, 0.2);
    e2.play(arp(0.1));
    expect(e2.voiceCount).toBe(1);
  });

  it('voiceShape fits attack, release and glide inside the note', () => {
    const tb = LAYERS_FULL.snake.timbre;
    const s = voiceShape({ time: 0, dur: 0.1, midi: 60, fromMidi: 57, gain: 0.1, timbre: tb });
    expect(s.attack + s.release).toBeLessThanOrEqual(0.1);
    expect(s.glide).toBeLessThanOrEqual(0.06 + 1e-12);
    expect(voiceShape({ time: 0, dur: 1, midi: 60, fromMidi: null, gain: 0.1, timbre: tb }).glide).toBe(0);
    expect(voiceShape({ time: 0, dur: 1, midi: 60, fromMidi: null, gain: 0.1, timbre: LAYERS_FULL.pinwheel.timbre }).peak).toBeCloseTo(0.05, 9);
  });

  it('when full, the oldest motif voice is stolen before any older bed voice', () => {
    const { ctx, engine } = setup();
    const tb = LAYERS_FULL.grunt.timbre;
    for (let i = 0; i < 10; i++) engine.play({ layer: 'pad', midi: 57, time: 0.001 * i, dur: 2, gain: 0.2 });
    const motifStart = ctx.oscs.length;
    for (let i = 0; i < 6; i++) engine.playVoice({ time: 0.02 + 0.001 * i, dur: 1, midi: 57, fromMidi: null, gain: 0.05, timbre: tb });
    expect(engine.voiceCount).toBe(16);
    const firstMotif = ctx.oscs[motifStart];
    engine.playVoice({ time: 0.05, dur: 0.3, midi: 60, fromMidi: null, gain: 0.07, timbre: tb });
    expect(engine.voiceCount).toBe(16);
    expect(firstMotif?.stops).toHaveLength(2);
    expect(engine.steals).toEqual({ bed: 0, motif: 1, accent: 0 });
    // A bed note arriving now also takes a motif slot first.
    engine.play({ layer: 'pad', midi: 60, time: 0.06, dur: 2, gain: 0.2 });
    expect(engine.steals).toEqual({ bed: 0, motif: 2, accent: 0 });
    expect(oldestPreferred([{ start: 1, end: 2, data: 'b' }, { start: 3, end: 4, data: 'm' }], (d) => d === 'm', 0)).toBe(1);
    expect(oldestPreferred([{ start: 1, end: 2, data: 'b' }], (d) => d === 'm', 0)).toBe(0);
  });

  it('voice length and peak helpers', () => {
    expect(voiceLength('pad', 2)).toBeGreaterThan(2);
    expect(voiceLength('arp', 0.125)).toBeLessThanOrEqual(0.125);
    expect(voicePeak('pad', 0.3)).toBeCloseTo(0.1, 9);
    expect(voicePeak('kick', 0.3)).toBe(0.3);
  });
});

describe('voice budget (v2 fixes)', () => {
  const e = (start: number, end: number): { start: number; end: number; data: null } => ({ start, end, data: null });

  it('peakIn finds the most voices sounding at once inside a span', () => {
    const list = [e(0, 1), e(0.5, 2), e(1.5, 3), e(2.5, 4)];
    expect(peakIn(list, 0, 4).count).toBe(2);
    expect(peakIn(list, 3.1, 4).count).toBe(1);
    expect(peakIn(list, 4, 5).count).toBe(0);
    // A voice ending exactly where another starts does not overlap it.
    expect(peakIn([e(0, 1), e(1, 2)], 0, 2).count).toBe(1);
  });

  it('counts voices added out of start order by the overlap, not the entry count', () => {
    const pool = new VoicePool<number>(2);
    pool.add(1, 1.1, 1);
    pool.add(2, 2.1, 2);
    pool.add(3, 3.1, 3);
    // Three entries, never two at once: the cap of 2 is not hit.
    expect(pool.size).toBe(3);
    expect(pool.peak(0, 10)).toBe(1);
    // A voice landing before the others, overlapping only the first, still fits.
    expect(pool.add(0.95, 1.05, 4)).toBeNull();
    // A third voice inside that overlap takes the oldest voice sounding there.
    expect(pool.add(1.0, 1.02, 5)).toBe(4);
  });

  it('accent room keeps a stinger voice free and counts notes not scheduled yet', () => {
    const scheduled = Array.from({ length: 10 }, () => e(0, 1));
    expect(accentRoomFor(scheduled, [], 0.5, 0.25)).toBe(16 - STINGER_RESERVE - 10);
    // Four upcoming notes inside the span take four more.
    const upcoming = Array.from({ length: 4 }, () => ({ start: 0.6, end: 0.9 }));
    expect(accentRoomFor(scheduled, upcoming, 0.5, 0.25)).toBe(1);
    // Upcoming notes after the span do not.
    expect(accentRoomFor(scheduled, [{ start: 0.8, end: 1 }], 0.5, 0.25)).toBe(5);
    expect(accentRoomFor(Array.from({ length: 16 }, () => e(0, 1)), [], 0.5, 0.1)).toBe(0);
  });

  it('when full, an accent is stolen before a motif voice', () => {
    const { ctx, engine } = setup();
    const tb = LAYERS_FULL.grunt.timbre;
    for (let i = 0; i < 10; i++) engine.play({ layer: 'pad', midi: 57, time: 0.001 * i, dur: 2, gain: 0.2 });
    for (let i = 0; i < 5; i++) engine.playVoice({ time: 0.02 + 0.001 * i, dur: 1, midi: 57, fromMidi: null, gain: 0.05, timbre: tb });
    const accentStart = ctx.oscs.length;
    engine.playVoice({ time: 0.03, dur: 0.25, midi: 69, fromMidi: null, gain: 0.05, timbre: tb }, 'accent');
    expect(engine.voiceCount).toBe(16);
    engine.playVoice({ time: 0.05, dur: 1, midi: 60, fromMidi: null, gain: 0.05, timbre: tb });
    expect(engine.steals).toEqual({ bed: 0, motif: 0, accent: 1 });
    expect(ctx.oscs[accentStart]?.stops).toHaveLength(2);
  });

  it('perc is noise through its own bandpass bus; the noise buffer is built once per context', () => {
    const ctx = new FakeContext();
    let buffers = 0;
    const make = ctx.createBuffer.bind(ctx);
    ctx.createBuffer = (c: number, l: number) => {
      buffers++;
      return make(c, l);
    };
    const engine = createMusicEngine(ctx, new FakeNode(), 0.2);
    expect(buffers).toBe(1);
    createMusicEngine(ctx, new FakeNode(), 0.2);
    expect(buffers).toBe(1);
    const perc = ctx.filters.find((f) => f.type === 'bandpass');
    expect(perc?.frequency.value).toBe(PERC_BP_HZ);
    const before = ctx.bufferSources.length;
    engine.play({ layer: 'perc', midi: null, time: 0.1, dur: 0.125, gain: 0.08 });
    expect(ctx.bufferSources.length).toBe(before + 1);
    expect(ctx.bufferSources[before]?.startAt).toBe(0.1);
  });

  it('reports voice spans and cuts to the trace hook', () => {
    const ctx = new FakeContext();
    const starts: { id: number; cls: VoiceClass; start: number; end: number; at: number }[] = [];
    const cuts: { id: number; at: number }[] = [];
    const engine = createMusicEngine(ctx, new FakeNode(), 0.2, {
      trace: { start: (id, cls, start, end, at) => starts.push({ id, cls, start, end, at }), cut: (id, at) => cuts.push({ id, at }) },
    });
    ctx.currentTime = 0.05;
    engine.play(arp(0.1));
    engine.playVoice({ time: 0.2, dur: 0.25, midi: 69, fromMidi: null, gain: 0.05, timbre: LAYERS_FULL.dart.timbre }, 'accent');
    expect(starts.map((s) => s.cls)).toEqual(['bed', 'accent']);
    expect(starts[0]?.start).toBe(0.1);
    expect(starts[0]?.at).toBe(0.05);
    engine.silence();
    expect(cuts.map((c) => c.id).sort()).toEqual(starts.map((s) => s.id).sort());
  });
});
