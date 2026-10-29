// Pure audio tables and helpers (docs/01-game-design.md section 13). No Web Audio here, so
// tests run in node. synth.ts turns a CueDef into oscillators, noise and gain envelopes.
import type { Events, SfxName } from '../core/events';

/** The fx:kill colour, taken from the bus type so audio never imports src/render. */
type PaletteKey = Events['fx:kill']['colour'];

export type CueName =
  | 'fire'
  | 'enemyKill'
  | 'bigKill'
  | 'geomPickup'
  | 'telegraph'
  | 'bomb'
  | 'shipDeath'
  | 'respawn'
  | 'superReady'
  | 'superActivate'
  | 'levelStart'
  | 'levelComplete'
  | 'levelFail'
  | 'uiTap'
  // v3 boss sound effects (docs/12 "Design: boss music" item 6, docs/13 section 13).
  | 'bossRumble'
  | 'bossHit'
  | 'bossDeath'
  | 'bossShot';

export type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';

export interface FilterDef {
  readonly type: 'lowpass' | 'bandpass';
  readonly f0: number;
  readonly f1: number;
}

export interface VoiceDef {
  readonly wave: Wave;
  /** Start and end frequency of an exponential sweep, Hz. Ignored for noise. */
  readonly f0: number;
  readonly f1: number;
  /** Arpeggio: frequencies stepped every stepSec instead of a sweep. */
  readonly steps?: readonly number[];
  readonly stepSec?: number;
  readonly filter?: FilterDef;
  readonly gain: number;
  readonly dur: number;
}

export interface CueDef {
  readonly voices: readonly VoiceDef[];
}

function v(wave: Wave, f0: number, f1: number, dur: number, gain: number, filter?: FilterDef): VoiceDef {
  return filter === undefined ? { wave, f0, f1, dur, gain } : { wave, f0, f1, dur, gain, filter };
}

function arp(wave: Wave, steps: readonly number[], stepSec: number, gain: number): VoiceDef {
  const f = steps[0] ?? 440;
  return { wave, f0: f, f1: f, steps, stepSec, dur: steps.length * stepSec, gain };
}

function lp(f0: number, f1: number): FilterDef {
  return { type: 'lowpass', f0, f1 };
}

export const CUES: Readonly<Record<CueName, CueDef>> = {
  fire: { voices: [v('square', 880, 660, 0.04, 0.04)] },
  enemyKill: {
    voices: [v('noise', 0, 0, 0.12, 0.12, { type: 'bandpass', f0: 1200, f1: 300 }), v('triangle', 440, 110, 0.12, 0.06)],
  },
  bigKill: { voices: [v('noise', 0, 0, 0.4, 0.18, lp(3000, 200)), v('sawtooth', 220, 55, 0.4, 0.18)] },
  geomPickup: { voices: [v('sine', 1200, 1800, 0.05, 0.05)] },
  telegraph: { voices: [v('sine', 300, 600, 0.06, 0.03)] },
  bomb: { voices: [v('noise', 0, 0, 0.9, 0.3, lp(2000, 80)), v('sawtooth', 110, 40, 0.9, 0.3)] },
  shipDeath: { voices: [v('sawtooth', 440, 55, 0.7, 0.3), v('noise', 0, 0, 0.7, 0.3, lp(4000, 100))] },
  respawn: { voices: [v('sine', 220, 880, 0.3, 0.1)] },
  superReady: { voices: [arp('triangle', [523, 659, 784], 0.08, 0.1)] },
  superActivate: { voices: [v('square', 330, 1320, 0.25, 0.12)] },
  levelStart: { voices: [v('triangle', 392, 784, 0.4, 0.1)] },
  levelComplete: { voices: [arp('triangle', [523, 659, 784, 1047], 0.12, 0.14)] },
  levelFail: { voices: [v('sawtooth', 330, 110, 0.8, 0.12)] },
  uiTap: { voices: [v('sine', 1000, 1000, 0.03, 0.05)] },
  // Boss entry: a low noise rumble closing down with a sub sweep under it, about a second.
  bossRumble: { voices: [v('noise', 0, 0, 1.2, 0.22, lp(420, 60)), v('triangle', 82, 41, 1.2, 0.2)] },
  // Boss hit: a low, longer thud with a short noise knock, heavier than the music's per kind
  // ticks (those are at most 0.03 gain and 0.05 s).
  bossHit: { voices: [v('triangle', 196, 98, 0.09, 0.08), v('noise', 0, 0, 0.05, 0.06, { type: 'bandpass', f0: 900, f1: 260 })] },
  // Boss death: bigKill grown up, a longer noise burst and saw fall plus a sub boom.
  bossDeath: {
    voices: [v('noise', 0, 0, 1.4, 0.22, lp(3600, 120)), v('sawtooth', 220, 41, 1.4, 0.18), v('sine', 73, 36, 1.4, 0.2)],
  },
  // Boss shot: a soft, low falling blip, so it reads apart from the player's square fire cue.
  bossShot: { voices: [v('sine', 640, 420, 0.07, 0.045)] },
};

/**
 * The sim's Kind.Boss value. Audio never imports src/game, so it is mirrored here;
 * tests/audio/cues.test.ts checks it against the real enum.
 */
export const BOSS_KIND = 22;

/** Pure: the cue for an fx:hit: the boss hit on a boss hit that did damage, otherwise none (the music plays hit ticks). */
export function cueForHit(kind: number, blocked: boolean): CueName | null {
  return kind === BOSS_KIND && !blocked ? 'bossHit' : null;
}

/** Bus 'sfx' names to cues. 'explode' is upgraded to bigKill by the preceding fx:kill colour. */
export const SFX_TO_CUE: Readonly<Record<SfxName, CueName>> = {
  shot: 'fire',
  explode: 'enemyKill',
  geom: 'geomPickup',
  bomb: 'bomb',
  death: 'shipDeath',
  spawn: 'telegraph',
};

/** Snake, Spawner and Gravity well kills use the big kill sound. */
export function isBigKillColour(c: PaletteKey): boolean {
  return c === 'cyan' || c === 'yellow' || c === 'red';
}

/** Pure: the cue for an sfx event, given whether the kill that caused it was big. */
export function cueForSfx(name: SfxName, bigKill: boolean): CueName {
  if (name === 'explode' && bigKill) return 'bigKill';
  return SFX_TO_CUE[name];
}

/** Max plays per second (docs/01 section 13). Cues not listed are not limited. */
export const RATE_LIMITS: Readonly<Partial<Record<CueName, number>>> = {
  fire: 12,
  geomPickup: 20,
  telegraph: 4,
  bossHit: 8,
};

/**
 * Strict caps: at most this many plays inside any one second window (no jitter tolerance).
 * The boss shot blip is capped at 6 per s (docs/12 item 6).
 */
export const WINDOW_LIMITS: Readonly<Partial<Record<CueName, number>>> = {
  bossShot: 6,
};

/** Pure: at most `max` plays inside any window of `windowSec` seconds. */
export function createWindowLimiter(max: number, windowSec = 1): RateLimiter {
  const times: number[] = [];
  return {
    allow(nowSec: number): boolean {
      while (times.length > 0 && nowSec - (times[0] ?? 0) >= windowSec) times.shift();
      if (times.length >= max) return false;
      times.push(nowSec);
      return true;
    },
  };
}

export interface RateLimiter {
  /** True if a play at nowSec is allowed; records it when allowed. */
  allow(nowSec: number): boolean;
}

/** Pure: at most perSec plays per second, enforced as a minimum interval. */
export function createRateLimiter(perSec: number): RateLimiter {
  const gap = perSec > 0 ? 1 / perSec : 0;
  let last = Number.NEGATIVE_INFINITY;
  return {
    allow(nowSec: number): boolean {
      // Small tolerance so a 12 Hz caller on a jittery clock is not dropped every other time.
      if (nowSec - last < gap * 0.95) return false;
      last = nowSec;
      return true;
    },
  };
}

export const VOLUME_DEFAULT = 70;
export const MAX_VOICES = 24;

/** Pure: volume clamped to an integer 0 to 100. Non finite gives the default. */
export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return VOLUME_DEFAULT;
  return Math.min(100, Math.max(0, Math.round(v)));
}

/** Pure: master gain = volume / 100 x 0.6. */
export function masterGain(volume: number): number {
  return (clampVolume(volume) / 100) * 0.6;
}

/** Pure: index of the voice to steal when at the cap (oldest start time), or -1 if room. */
export function voiceToSteal(startTimes: readonly number[], cap: number = MAX_VOICES): number {
  if (startTimes.length < cap) return -1;
  let oldest = 0;
  for (let i = 1; i < startTimes.length; i++) {
    if ((startTimes[i] ?? 0) < (startTimes[oldest] ?? 0)) oldest = i;
  }
  return oldest;
}
