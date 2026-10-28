// Threat to mix (SPEC 3.9, docs/10 wave A, v2 fixes). Pure. Threat 0 to 1 from 'sim:threat' is
// smoothed with a one pole follower (attack 0.5 s, release 3 s to 95 percent), then mapped to
// layer gains, a lift flag and a master lowpass cutoff. Also the music volume to music master
// gain mapping.
//
// Dynamic range (v2 fixes): an empty arena is the bed only (pad, then the sub bass). Kick, hat
// and arp enter one by one as threat rises. At high threat the lift turns on (with hysteresis so
// it never flickers): the hat goes to sixteenths, the perc layer (backbeat clap) comes in, the
// arp moves up an octave and the lowpass opens a further step.
import type { Layer } from './track';

/** Seconds to cover 95 percent of a rise. */
export const ATTACK_SEC = 0.5;
/** Seconds to cover 95 percent of a fall. */
export const RELEASE_SEC = 3;
/** ln(20): a one pole reaches 95 percent after 3 time constants (exactly ln 20). */
const LN20 = Math.log(20);

export const CUTOFF_MIN_HZ = 450;
/** Cutoff at threat 1 without the lift. */
export const CUTOFF_MAX_HZ = 5500;
/** The lift opens the lowpass by this factor on top of the threat curve. */
export const LIFT_CUTOFF_MUL = 1.6;
/** Curve exponent: the low end stays dark longer, so the top end reads as an opening. */
const CUTOFF_CURVE = 1.3;
/** The lift turns on at or above this smoothed threat ... */
export const LIFT_ON = 0.7;
/** ... and off again only below this one. */
export const LIFT_OFF = 0.6;
/** Kept for wave A callers: the hat sixteenths follow the lift. */
export const HAT16_FROM = LIFT_ON;

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
  pad: { from: 0, span: 1, floor: 0.13, max: 0.18 },
  bass: { from: 0.06, span: 0.14, floor: 0, max: 0.22 },
  kick: { from: 0.15, span: 0.15, floor: 0, max: 0.21 },
  hat: { from: 0.28, span: 0.14, floor: 0, max: 0.08 },
  arp: { from: 0.42, span: 0.14, floor: 0, max: 0.11 },
  perc: { from: LIFT_ON, span: 0.12, floor: 0, max: 0.08 },
};

export type LayerGains = Readonly<Record<Layer, number>>;

export interface Mix {
  readonly gains: LayerGains;
  readonly hat16: boolean;
  /** High threat lift: arp an octave up, perc layer allowed, lowpass opened further. */
  readonly lift: boolean;
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
    perc: layerGain('perc', level),
  };
}

export function sumGains(g: LayerGains): number {
  return g.bass + g.pad + g.kick + g.hat + g.arp + g.perc;
}

/**
 * Master lowpass: 450 Hz at threat 0 rising on a curve to 5.5 kHz at threat 1, times 1.6 while
 * the lift is on (about 8.8 kHz at the top).
 */
export function masterCutoff(level: number, lift = false): number {
  const base = CUTOFF_MIN_HZ * Math.pow(CUTOFF_MAX_HZ / CUTOFF_MIN_HZ, Math.pow(clamp01(level), CUTOFF_CURVE));
  return lift ? base * LIFT_CUTOFF_MUL : base;
}

/** Pure: the lift flag after one update, with hysteresis between LIFT_OFF and LIFT_ON. */
export function nextLift(prev: boolean, level: number): boolean {
  const l = clamp01(level);
  return prev ? l >= LIFT_OFF : l >= LIFT_ON;
}

/** Relative change below which a new cutoff is not sent (keeps the automation list short). */
export const CUTOFF_EPS = 0.02;

/** Pure: true when a new cutoff differs enough from the last one sent to be worth sending. */
export function cutoffChanged(last: number | null, next: number): boolean {
  if (last === null || !(last > 0)) return true;
  return Math.abs(next - last) / last >= CUTOFF_EPS;
}

/**
 * Pure: the mix at a smoothed threat. `lift` defaults to the plain threshold; the session passes
 * its hysteresis state. Without the lift the perc layer is silent whatever its ramp says.
 */
export function mixFor(level: number, lift: boolean = clamp01(level) >= LIFT_ON): Mix {
  const l = clamp01(level);
  const g = layerGains(l);
  const gains = lift ? g : { ...g, perc: 0 };
  return { gains, hat16: lift, lift, cutoffHz: masterCutoff(l, lift) };
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
