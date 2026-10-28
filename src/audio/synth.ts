// Synthesised audio (docs/04 section 12, docs/01 section 13). Oscillators and one shared
// white noise buffer only; no audio files. Subscribes to the core bus and never imports
// src/game or src/ui. The AudioContext is created lazily inside the first user gesture.
import { bus, type Bus } from '../core/events';
import { hash01 } from '../core/rng';
import {
  clampVolume,
  CUES,
  createRateLimiter,
  cueForSfx,
  isBigKillColour,
  masterGain,
  RATE_LIMITS,
  VOLUME_DEFAULT,
  voiceToSteal,
  type CueName,
  type RateLimiter,
  type VoiceDef,
} from './cues';

export type { CueName } from './cues';

const ATTACK = 0.005;
const FLOOR = 0.0001;
const NOISE_SEC = 1;

interface Voice {
  start: number;
  end: number;
  sources: AudioScheduledSourceNode[];
  out: GainNode;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let volume = VOLUME_DEFAULT;
let voices: Voice[] = [];
const limiters = new Map<CueName, RateLimiter>();

function limiterFor(cue: CueName): RateLimiter | null {
  const rate = RATE_LIMITS[cue];
  if (rate === undefined) return null;
  let l = limiters.get(cue);
  if (!l) {
    l = createRateLimiter(rate);
    limiters.set(cue, l);
  }
  return l;
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise;
  const len = Math.floor(c.sampleRate * NOISE_SEC);
  const b = c.createBuffer(1, len, c.sampleRate);
  const data = b.getChannelData(0);
  // Stateless hash, not a PRNG: white enough for explosions and identical every run.
  for (let i = 0; i < len; i++) data[i] = hash01(i, 0x5eed) * 2 - 1;
  noise = b;
  return b;
}

/** Create or resume the AudioContext. Call from a user gesture handler. */
export async function unlockAudio(): Promise<void> {
  if (typeof AudioContext === 'undefined') return;
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = masterGain(volume);
    master.connect(ctx.destination);
  }
  if (ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      // Ignore: the next gesture tries again.
    }
  }
  // A one sample silent buffer fully unlocks some Android builds.
  const b = ctx.createBuffer(1, 1, 22050);
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.connect(ctx.destination);
  s.start(0);
}

export interface AudioGraph {
  readonly ctx: AudioContext;
  readonly master: GainNode;
}

/**
 * The lazily created AudioContext and synth master gain, or null before unlockAudio().
 * Additive for the music engine (docs/10 wave A); cue behaviour is unchanged.
 */
export function getAudioGraph(): AudioGraph | null {
  return ctx && master ? { ctx, master } : null;
}

/** Set the volume 0 to 100 (clamped). Returns the applied value. */
export function setVolume(v: number): number {
  volume = clampVolume(v);
  if (ctx && master) master.gain.setTargetAtTime(masterGain(volume), ctx.currentTime, 0.01);
  return volume;
}

export function getVolume(): number {
  return volume;
}

function stopVoice(vc: Voice, at: number): void {
  for (const s of vc.sources) {
    try {
      s.stop(at);
    } catch {
      // Already stopped.
    }
  }
}

function buildVoice(c: AudioContext, out: AudioNode, d: VoiceDef, t: number): AudioScheduledSourceNode {
  const env = c.createGain();
  env.gain.setValueAtTime(FLOOR, t);
  env.gain.linearRampToValueAtTime(d.gain, t + ATTACK);
  env.gain.exponentialRampToValueAtTime(FLOOR, t + d.dur);
  env.connect(out);
  let src: AudioScheduledSourceNode;
  if (d.wave === 'noise') {
    const n = c.createBufferSource();
    n.buffer = noiseBuffer(c);
    n.loop = true;
    src = n;
  } else {
    const o = c.createOscillator();
    o.type = d.wave;
    o.frequency.setValueAtTime(d.f0, t);
    if (d.steps && d.stepSec) {
      d.steps.forEach((f, i) => o.frequency.setValueAtTime(f, t + i * (d.stepSec ?? 0)));
    } else if (d.f1 !== d.f0) {
      o.frequency.exponentialRampToValueAtTime(Math.max(1, d.f1), t + d.dur);
    }
    src = o;
  }
  if (d.filter) {
    const f = c.createBiquadFilter();
    f.type = d.filter.type;
    f.frequency.setValueAtTime(d.filter.f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(1, d.filter.f1), t + d.dur);
    src.connect(f);
    f.connect(env);
  } else {
    src.connect(env);
  }
  src.start(t);
  src.stop(t + d.dur + 0.02);
  return src;
}

/** Play a cue now. Silent until unlockAudio has run; rate limited cues may be dropped. */
export function play(cue: CueName): void {
  const c = ctx;
  const m = master;
  if (!c || !m || c.state !== 'running' || volume === 0) return;
  const now = c.currentTime;
  const lim = limiterFor(cue);
  if (lim && !lim.allow(now)) return;
  voices = voices.filter((vc) => vc.end > now);
  const steal = voiceToSteal(voices.map((vc) => vc.start));
  if (steal >= 0) {
    const old = voices[steal];
    if (old) stopVoice(old, now);
    voices.splice(steal, 1);
  }
  const def = CUES[cue];
  const out = c.createGain();
  out.connect(m);
  let end = now;
  const sources: AudioScheduledSourceNode[] = [];
  for (const d of def.voices) {
    sources.push(buildVoice(c, out, d, now));
    end = Math.max(end, now + d.dur + 0.02);
  }
  const vc: Voice = { start: now, end, sources, out };
  const last = sources[sources.length - 1];
  if (last) last.onended = (): void => out.disconnect();
  voices.push(vc);
}

export interface AudioOptions {
  volume: number;
  /** Bus to listen on; defaults to the core bus. */
  bus?: Bus;
}

/**
 * Wire audio: volume, first gesture unlock, visibility suspend, and bus subscriptions.
 * Returns an uninstall function.
 */
export function installAudio(opts: AudioOptions): () => void {
  const b = opts.bus ?? bus;
  setVolume(opts.volume);
  let bigKill = false;
  const offs = [
    // combat emits fx:kill then sfx explode, so the colour decides the explode sound.
    b.on('fx:kill', (p) => {
      bigKill = isBigKillColour(p.colour);
    }),
    b.on('sfx', (name) => {
      play(cueForSfx(name, bigKill));
      if (name === 'explode') bigKill = false;
    }),
    b.on('game:start', () => play('levelStart')),
  ];
  const onGesture = (): void => {
    if (ctx && ctx.state === 'running') return;
    void unlockAudio();
  };
  const gestureOpts: AddEventListenerOptions = { capture: true, passive: true };
  window.addEventListener('pointerdown', onGesture, gestureOpts);
  const onVisibility = (): void => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    for (const off of offs) off();
    window.removeEventListener('pointerdown', onGesture, gestureOpts);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
