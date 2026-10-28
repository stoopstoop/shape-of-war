// Music voices on Web Audio (SPEC 3.9 item 5). Each note is an oscillator or noise source,
// an envelope gain and an output gain, disconnected when the note ends. At most 16 music
// voices; the 17th steals the oldest motif voice, or the oldest voice when no motif sounds.
// The graph is
//   bed voices -> layer buses (bass lowpass, pad lowpass with LFO, hat highpass) -> master
//   lowpass -> music gain (at most 0.35) -> synth master;
//   motif and stinger voices (own filter each) -> motif bus -> music gain.
// The context is a narrow structural type: a real AudioContext satisfies it and tests pass a fake.
import { hash01 } from '../../core/rng';
import { voiceToSteal } from '../cues';
import { MUSIC_MASTER_MAX } from './intensity';
import { midiToHz } from './scale';
import type { PlannedNote } from './scheduler';
import type { Timbre } from './layers';
import type { Layer } from './track';

export const MUSIC_VOICE_CAP = 16;
/** Most voices the composed bed holds at once (pad crossfade at a bar line), see layers tests. */
export const BED_VOICE_MAX = 10;
/** Motif voices that fit beside the bed: one per live kind, 6 kinds at most (roster limit). */
export const MOTIF_VOICE_MAX = MUSIC_VOICE_CAP - BED_VOICE_MAX;
const PRUNE_EPS = 1e-6;

export interface ParamLike {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  exponentialRampToValueAtTime(v: number, t: number): unknown;
  setTargetAtTime(v: number, t: number, timeConstant: number): unknown;
  cancelScheduledValues(t: number): unknown;
}

export interface NodeLike {
  connect(dest: NodeLike): unknown;
  connect(dest: ParamLike): unknown;
  disconnect(): void;
}

export interface GainLike extends NodeLike {
  readonly gain: ParamLike;
}

export interface FilterLike extends NodeLike {
  type: BiquadFilterType;
  readonly frequency: ParamLike;
  readonly Q: ParamLike;
}

export interface SourceLike extends NodeLike {
  start(t: number): void;
  stop(t: number): void;
  onended: ((ev: Event) => unknown) | null;
}

export interface OscLike extends SourceLike {
  type: OscillatorType;
  readonly frequency: ParamLike;
  readonly detune: ParamLike;
}

export interface BufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface BufferSourceLike extends SourceLike {
  buffer: BufferLike | null;
  loop: boolean;
}

export interface MusicContext {
  readonly currentTime: number;
  readonly sampleRate: number;
  createGain(): GainLike;
  createOscillator(): OscLike;
  createBiquadFilter(): FilterLike;
  createBufferSource(): BufferSourceLike;
  createBuffer(channels: number, length: number, sampleRate: number): BufferLike;
}

// ---------------------------------------------------------------------------------------
// Voice pool: pure bookkeeping, no Web Audio.

/** Pure: index of the oldest entry `prefer` accepts, or `fallback` when none does. */
export function oldestPreferred<T>(entries: readonly PoolEntry<T>[], prefer: (d: T) => boolean, fallback: number): number {
  let best = -1;
  let bestStart = Infinity;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e || !prefer(e.data) || e.start >= bestStart) continue;
    best = i;
    bestStart = e.start;
  }
  return best >= 0 ? best : fallback;
}

export interface PoolEntry<T> {
  readonly start: number;
  readonly end: number;
  readonly data: T;
}

export class VoicePool<T> {
  private entries: PoolEntry<T>[] = [];

  constructor(readonly cap: number = MUSIC_VOICE_CAP) {}

  /** Forget voices that have ended by `now` (with a microsecond of slack for float rounding). */
  prune(now: number): void {
    this.entries = this.entries.filter((e) => e.end > now + PRUNE_EPS);
  }

  /**
   * Add a voice. When the pool is full, the oldest by start time is removed and returned
   * so the caller can silence it.
   */
  add(start: number, end: number, data: T, prefer?: (d: T) => boolean): T | null {
    let stolen: T | null = null;
    let idx = voiceToSteal(
      this.entries.map((e) => e.start),
      this.cap,
    );
    if (idx >= 0 && prefer) idx = oldestPreferred(this.entries, prefer, idx);
    if (idx >= 0) {
      const old = this.entries[idx];
      if (old) stolen = old.data;
      this.entries.splice(idx, 1);
    }
    this.entries.push({ start, end, data });
    return stolen;
  }

  /** Remove every voice and return them. */
  drain(): T[] {
    const out = this.entries.map((e) => e.data);
    this.entries = [];
    return out;
  }

  get size(): number {
    return this.entries.length;
  }

  list(): readonly PoolEntry<T>[] {
    return this.entries;
  }
}

// ---------------------------------------------------------------------------------------
// Voice shapes per layer. Times in seconds. Pure data, read by the builders below.

const FLOOR = 0.0001;
const STEAL_TC = 0.008;
const STEAL_STOP = 0.05;

export const BASS_LP_HZ = 240;
export const PAD_LP_HZ = 900;
export const PAD_LFO_HZ = 0.125;
export const PAD_LFO_DEPTH_HZ = 450;
export const PAD_DETUNE_CENTS = 9;
export const HAT_HP_HZ = 7000;
export const KICK_F0 = 120;
export const KICK_F1 = 45;
export const KICK_SWEEP_SEC = 0.12;
export const KICK_DECAY_SEC = 0.32;
export const HAT_DECAY_SEC = 0.045;
export const ARP_DECAY_SEC = 0.11;
export const PAD_ATTACK_SEC = 0.25;
export const PAD_RELEASE_SEC = 0.4;
/** Notes per pad chord, so the pad layer gain is shared by its three notes. */
const PAD_NOTES = 3;
const NOISE_SEC = 1;

/** Pure: how long a voice of this layer lasts, seconds, from its start time. */
export function voiceLength(layer: Layer, dur: number): number {
  switch (layer) {
    case 'pad':
      return dur + PAD_RELEASE_SEC;
    case 'kick':
      return KICK_DECAY_SEC;
    case 'hat':
      return HAT_DECAY_SEC;
    case 'arp':
      return Math.min(dur, ARP_DECAY_SEC) + 0.01;
    case 'bass':
      return dur * 0.9;
  }
}

/** Pure: the envelope peak for one voice of a planned note. */
export function voicePeak(layer: Layer, gain: number): number {
  return layer === 'pad' ? gain / PAD_NOTES : gain;
}

// ---------------------------------------------------------------------------------------
// Engine.

export type VoiceClass = 'bed' | 'motif';

interface Voice {
  cls: VoiceClass;
  sources: SourceLike[];
  nodes: NodeLike[];
  out: GainLike;
}

/** A motif or stinger note for the engine: absolute audio time, seconds, gain already mixed. */
export interface VoiceNote {
  readonly time: number;
  /** Seconds; the voice is silent at time + dur. */
  readonly dur: number;
  readonly midi: number;
  /** Glide start pitch, or null. */
  readonly fromMidi: number | null;
  readonly gain: number;
  readonly timbre: Timbre;
}

export interface VoiceShape {
  readonly attack: number;
  readonly release: number;
  readonly glide: number;
  /** Envelope peak per oscillator. */
  readonly peak: number;
}

/** Pure: envelope and glide times for a motif voice, fitted inside its duration. */
export function voiceShape(n: VoiceNote): VoiceShape {
  const len = Math.max(0.01, n.dur);
  const attack = Math.min(n.timbre.attack, len * 0.3);
  const release = Math.max(0.004, Math.min(n.timbre.release, len - attack - 0.002));
  const glide = n.fromMidi === null ? 0 : Math.min(n.timbre.glideSec, len * 0.6);
  const peak = n.gain / (n.timbre.partner ? 2 : 1);
  return { attack, release, glide, peak };
}

const isMotif = (v: Voice): boolean => v.cls === 'motif';

export interface MusicEngine {
  /** Schedule one planned bed note on the audio clock. */
  play(n: PlannedNote): void;
  /** Schedule one motif or stinger note. When the pool is full the oldest motif voice is stolen first. */
  playVoice(n: VoiceNote): void;
  /** Music master gain, clamped to 0 to 0.35, ramped from the current time. */
  setMaster(gain: number): void;
  /** Master lowpass cutoff, Hz, ramped from the current time. */
  setCutoff(hz: number): void;
  /** Fade out and stop every voice, including notes scheduled ahead. */
  silence(): void;
  /** Silence and disconnect everything. The engine is unusable afterwards. */
  dispose(): void;
  readonly voiceCount: number;
  /** Voices in the pool that are motifs or stingers. */
  readonly motifVoiceCount: number;
  /** Voices stolen since creation, split by the class that lost the voice. */
  readonly steals: Readonly<Record<VoiceClass, number>>;
}

function safeStop(s: SourceLike, t: number): void {
  try {
    s.stop(t);
  } catch {
    // Already stopped.
  }
}

function disconnectAll(nodes: readonly NodeLike[]): void {
  for (const n of nodes) {
    try {
      n.disconnect();
    } catch {
      // Already disconnected.
    }
  }
}

function makeNoise(ctx: MusicContext): BufferLike {
  const len = Math.max(1, Math.floor(ctx.sampleRate * NOISE_SEC));
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = b.getChannelData(0);
  // Stateless hash, not a PRNG, salted apart from the sfx noise.
  for (let i = 0; i < len; i++) data[i] = hash01(i, 0x6d75) * 2 - 1;
  return b;
}

function filter(ctx: MusicContext, type: BiquadFilterType, hz: number, q = 0.707): FilterLike {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  return f;
}

export function createMusicEngine(ctx: MusicContext, destination: NodeLike, masterGain = 0): MusicEngine {
  const pool = new VoicePool<Voice>(MUSIC_VOICE_CAP);
  const out = ctx.createGain();
  out.gain.value = Math.min(MUSIC_MASTER_MAX, Math.max(0, masterGain));
  const master = filter(ctx, 'lowpass', 600);
  const bassBus = filter(ctx, 'lowpass', BASS_LP_HZ);
  const padBus = filter(ctx, 'lowpass', PAD_LP_HZ, 1.2);
  const hatBus = filter(ctx, 'highpass', HAT_HP_HZ);
  master.connect(out);
  out.connect(destination);
  bassBus.connect(master);
  padBus.connect(master);
  hatBus.connect(master);
  // Motifs and stingers carry their own filters and skip the threat lowpass, so a lone enemy's
  // motif is audible at low threat.
  const motifBus = ctx.createGain();
  motifBus.gain.value = 1;
  motifBus.connect(out);
  // One slow LFO shared by every pad note, so the filter sweep is continuous across chords.
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = PAD_LFO_HZ;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = PAD_LFO_DEPTH_HZ;
  lfo.connect(lfoDepth);
  lfoDepth.connect(padBus.frequency);
  lfo.start(ctx.currentTime);
  const graph: NodeLike[] = [lfo, lfoDepth, bassBus, padBus, hatBus, motifBus, master, out];
  let noise: BufferLike | null = null;
  let disposed = false;
  const stealCount: Record<VoiceClass, number> = { bed: 0, motif: 0 };

  const busFor = (layer: Layer): NodeLike => {
    if (layer === 'bass') return bassBus;
    if (layer === 'pad') return padBus;
    if (layer === 'hat') return hatBus;
    return master;
  };

  function osc(type: OscillatorType, hz: number, t: number): OscLike {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(hz, t);
    return o;
  }

  function envelope(peak: number, t: number, attack: number, hold: number, release: number): GainLike {
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(Math.max(FLOOR, peak), t + attack);
    if (hold > attack) g.gain.setValueAtTime(Math.max(FLOOR, peak), t + hold);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + Math.max(hold, attack) + release);
    return g;
  }

  function sourcesFor(n: PlannedNote, t: number): SourceLike[] {
    const hz = n.midi === null ? 0 : midiToHz(n.midi);
    switch (n.layer) {
      case 'bass':
        return [osc('triangle', hz, t)];
      case 'arp':
        return [osc('square', hz, t)];
      case 'pad': {
        const a = osc('sawtooth', hz, t);
        const b = osc('sawtooth', hz, t);
        a.detune.setValueAtTime(-PAD_DETUNE_CENTS, t);
        b.detune.setValueAtTime(PAD_DETUNE_CENTS, t);
        return [a, b];
      }
      case 'kick': {
        const k = osc('sine', KICK_F0, t);
        k.frequency.exponentialRampToValueAtTime(KICK_F1, t + KICK_SWEEP_SEC);
        return [k];
      }
      case 'hat': {
        const s = ctx.createBufferSource();
        noise = noise ?? makeNoise(ctx);
        s.buffer = noise;
        s.loop = true;
        return [s];
      }
    }
  }

  function envFor(n: PlannedNote, t: number, len: number): GainLike {
    const peak = voicePeak(n.layer, n.gain);
    switch (n.layer) {
      case 'pad':
        return envelope(peak / 2, t, PAD_ATTACK_SEC, n.dur, PAD_RELEASE_SEC);
      case 'bass':
        return envelope(peak, t, 0.006, len * 0.5, len * 0.5);
      default:
        return envelope(peak, t, 0.002, 0, len - 0.002);
    }
  }

  function steal(v: Voice, now: number): void {
    v.out.gain.cancelScheduledValues(now);
    v.out.gain.setTargetAtTime(0, now, STEAL_TC);
    for (const s of v.sources) safeStop(s, now + STEAL_STOP);
  }

  /**
   * Wire sources into env, env into a fresh output gain, the output into `bus`, add the voice
   * to the pool (counting from t to t + len, the audible span; notes arrive in time order so
   * the pool is pruned at t) and start it.
   */
  function launch(cls: VoiceClass, sources: SourceLike[], chain: NodeLike[], env: GainLike, bus: NodeLike, t: number, len: number): void {
    const now = ctx.currentTime;
    const vout = ctx.createGain();
    vout.gain.value = 1;
    env.connect(vout);
    vout.connect(bus);
    const nodes: NodeLike[] = [...sources, ...chain, env, vout];
    const voice: Voice = { cls, sources, nodes, out: vout };
    pool.prune(Math.max(now, t));
    const stolen = pool.add(t, t + len, voice, isMotif);
    if (stolen) {
      stealCount[stolen.cls] += 1;
      steal(stolen, now);
    }
    for (const s of sources) {
      s.start(t);
      s.stop(t + len + 0.02);
    }
    const last = sources[sources.length - 1];
    if (last) last.onended = (): void => disconnectAll(nodes);
  }

  return {
    play(n: PlannedNote): void {
      if (disposed || !(n.gain > 0)) return;
      const t = Math.max(ctx.currentTime, n.time);
      const len = voiceLength(n.layer, n.dur);
      const env = envFor(n, t, len);
      const sources = sourcesFor(n, t);
      for (const s of sources) s.connect(env);
      launch('bed', sources, [], env, busFor(n.layer), t, len);
    },
    playVoice(n: VoiceNote): void {
      if (disposed || !(n.gain > 0) || !(n.dur > 0)) return;
      const t = Math.max(ctx.currentTime, n.time);
      const sh = voiceShape(n);
      const len = Math.max(0.01, n.dur);
      const tb = n.timbre;
      const hz = midiToHz(n.midi);
      const f = filter(ctx, tb.filter, tb.filterHz, tb.q);
      const env = envelope(sh.peak, t, sh.attack, len - sh.release, sh.release);
      const mk = (wave: OscillatorType, detune: number): OscLike => {
        const o = ctx.createOscillator();
        o.type = wave;
        if (n.fromMidi !== null && sh.glide > 0) {
          o.frequency.setValueAtTime(midiToHz(n.fromMidi), t);
          o.frequency.exponentialRampToValueAtTime(hz, t + sh.glide);
        } else {
          o.frequency.setValueAtTime(hz, t);
        }
        if (detune !== 0) o.detune.setValueAtTime(detune, t);
        o.connect(f);
        return o;
      };
      const sources: SourceLike[] = [mk(tb.wave, 0)];
      if (tb.partner) sources.push(mk(tb.partner.wave, tb.partner.detune));
      f.connect(env);
      launch('motif', sources, [f], env, motifBus, t, len);
    },
    setMaster(gain: number): void {
      if (disposed) return;
      const g = Math.min(MUSIC_MASTER_MAX, Math.max(0, Number.isFinite(gain) ? gain : 0));
      out.gain.setTargetAtTime(g, ctx.currentTime, 0.02);
    },
    setCutoff(hz: number): void {
      if (disposed || !(hz > 0)) return;
      master.frequency.setTargetAtTime(hz, ctx.currentTime, 0.05);
    },
    silence(): void {
      const now = ctx.currentTime;
      for (const v of pool.drain()) steal(v, now);
    },
    dispose(): void {
      if (disposed) return;
      const now = ctx.currentTime;
      for (const v of pool.drain()) {
        for (const s of v.sources) safeStop(s, now);
        disconnectAll(v.nodes);
      }
      safeStop(lfo, now);
      disconnectAll(graph);
      disposed = true;
    },
    get voiceCount(): number {
      return pool.size;
    },
    get motifVoiceCount(): number {
      return pool.list().filter((e) => isMotif(e.data)).length;
    },
    get steals(): Readonly<Record<VoiceClass, number>> {
      return { ...stealCount };
    },
  };
}
