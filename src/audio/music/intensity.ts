// Threat to mix (SPEC 3.9, docs/10 wave A). Pure. Threat 0 to 1 from 'sim:threat' is smoothed
// with a one pole follower (attack 0.5 s, release 3 s to 95 percent), then mapped to layer
// gains and a master lowpass cutoff. Also the music volume to music master gain mapping.
import type { Layer } from './track';

/** Seconds to cover 95 percent of a rise. */
export const ATTACK_SEC = 0.5;
/** Seconds to cover 95 percent of a fall. */
export const RELEASE_SEC = 3;
/** ln(20): a one pole reaches 95 percent after 3 time constants (exactly ln 20). */
const LN20 = Math.log(20);

export const CUTOFF_MIN_HZ = 600;
export const CUTOFF_MAX_HZ = 6000;
/** Threat at or above which the hat plays in between sixteenths. */
export const HAT16_FROM = 0.7;

export interface LayerRamp {
  /** Threat at which the layer starts to sound. */
  readonly from: number;
  /** Threat span over which it fades from floor to full. */
  readonly span: number;
  /** Gain at `from` (pad only is above 0 at threat 0). */
  readonly floor: number;
  /** Full gain. The sum of every layer's full gain is at most 1.0. */
  readonly max: number;
}

export const LAYER_RAMPS: Readonly<Record<Layer, LayerRamp>> = {
  pad: { from: 0, span: 1, floor: 0.16, max: 0.22 },
  bass: { from: 0.05, span: 0.15, floor: 0, max: 0.26 },
  kick: { from: 0.15, span: 0.15, floor: 0, max: 0.24 },
  hat: { from: 0.3, span: 0.15, floor: 0, max: 0.1 },
  arp: { from: 0.45, span: 0.15, floor: 0, max: 0.14 },
};

export type LayerGains = Readonly<Record<Layer, number>>;

export interface Mix {
  readonly gains: LayerGains;
  readonly hat16: boolean;
  readonly cutoffHz: number;
}

export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/**
 * One step of the smoother, exact for any dt (seconds). Rises use the attack constant,
 * falls the release constant.
 */
export function smoothThreat(current: number, target: number, dt: number): number {
  const c = clamp01(current);
  const t = clamp01(target);
  if (!(dt > 0)) return c;
  const span = t > c ? ATTACK_SEC : RELEASE_SEC;
  const k = 1 - Math.exp((-dt * LN20) / span);
  return c + (t - c) * k;
}

export function layerGain(layer: Layer, level: number): number {
  const r = LAYER_RAMPS[layer];
  const l = clamp01(level);
  if (l < r.from) return 0;
  const p = r.span > 0 ? clamp01((l - r.from) / r.span) : 1;
  return r.floor + (r.max - r.floor) * p;
}

export function layerGains(level: number): LayerGains {
  return {
    bass: layerGain('bass', level),
    pad: layerGain('pad', level),
    kick: layerGain('kick', level),
    hat: layerGain('hat', level),
    arp: layerGain('arp', level),
  };
}

export function sumGains(g: LayerGains): number {
  return g.bass + g.pad + g.kick + g.hat + g.arp;
}

/** Master lowpass, exponential from 600 Hz at threat 0 to 6 kHz at threat 1. */
export function masterCutoff(level: number): number {
  return CUTOFF_MIN_HZ * Math.pow(CUTOFF_MAX_HZ / CUTOFF_MIN_HZ, clamp01(level));
}

export function mixFor(level: number): Mix {
  const l = clamp01(level);
  return { gains: layerGains(l), hat16: l >= HAT16_FROM, cutoffHz: masterCutoff(l) };
}

export const MUSIC_VOLUME_DEFAULT = 50;
/** Music master never exceeds this share of the synth master (SPEC 3.9 item 5). */
export const MUSIC_MASTER_MAX = 0.35;

/** Music volume clamped to an integer 0 to 100. Non finite gives the default. */
export function clampMusicVolume(v: number): number {
  if (!Number.isFinite(v)) return MUSIC_VOLUME_DEFAULT;
  return Math.min(100, Math.max(0, Math.round(v)));
}

/** Gain of the music bus feeding the synth master: volume / 100 x 0.35. */
export function musicMasterGain(volume: number): number {
  return (clampMusicVolume(volume) / 100) * MUSIC_MASTER_MAX;
}
