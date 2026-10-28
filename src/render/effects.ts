// Effects tier (v2 SPEC addendum 3.8, docs/10 "Performance budget"). Pure, no pixi.js import.
// The tier sets the particle cap and switches trails. Ledger persists sow.settings.effects and
// calls setEffectsTier in wave D; until then the default 'standard' applies. Low reproduces the
// v1 look: trails off, map effects off, 2048 particles, the v1 grid and ripple. Wave D adds the
// lattice columns: spacing and node cap per tier, dust, and denser bursts on high.

export type EffectsTier = 'low' | 'standard' | 'high';

export const EFFECTS_TIERS: readonly EffectsTier[] = ['low', 'standard', 'high'];

export const EFFECTS_DEFAULT: EffectsTier = 'standard';

/** Particle cap per tier. The pool and the Particle objects are sized for the largest at boot. */
const PARTICLE_CAPS: Readonly<Record<EffectsTier, number>> = {
  low: 2048,
  standard: 2048,
  high: 4096,
};

/** Largest cap over every tier: the boot size of the particle pool and its Particle objects. */
export const MAX_PARTICLE_CAP: number = Math.max(...EFFECTS_TIERS.map((t) => PARTICLE_CAPS[t]));

/** Pure: true for one of the three tier strings. */
export function isEffectsTier(v: unknown): v is EffectsTier {
  return v === 'low' || v === 'standard' || v === 'high';
}

/** Pure: live particle cap for a tier. */
export function particleCapFor(t: EffectsTier): number {
  return PARTICLE_CAPS[t];
}

/** Pure: ship and bullet trails are off on low, on otherwise. */
export function trailsOn(t: EffectsTier): boolean {
  return t !== 'low';
}

/** Pure: threat driven map effects (wall pulse and wall flash) are off on low, on otherwise. */
export function mapEffectsOn(t: EffectsTier): boolean {
  return t !== 'low';
}

/** Lattice spacing in arena units per tier, before the node cap and the governor. 0 is off. */
const LATTICE_SPACING: Readonly<Record<EffectsTier, number>> = {
  low: 0,
  standard: 25,
  high: 16,
};

/** Lattice node cap per tier (docs/10 "Performance budget"). */
const LATTICE_CAP: Readonly<Record<EffectsTier, number>> = {
  low: 0,
  standard: 4096,
  high: 8192,
};

/** Burst count multiplier per tier: high is denser, always limited by the particle cap. */
const BURST_MUL: Readonly<Record<EffectsTier, number>> = {
  low: 1,
  standard: 1,
  high: 1.5,
};

/** Pure: the deforming lattice replaces the v1 grid on standard and high. Low keeps the v1 grid. */
export function latticeOn(t: EffectsTier): boolean {
  return t !== 'low';
}

/** Pure: preferred lattice spacing for a tier in arena units, 0 on low. */
export function latticeSpacingFor(t: EffectsTier): number {
  return LATTICE_SPACING[t];
}

/** Pure: lattice node cap for a tier, 0 on low. */
export function latticeCapFor(t: EffectsTier): number {
  return LATTICE_CAP[t];
}

/** Pure: dim drifting dust behind the grid on standard and high. */
export function dustOn(t: EffectsTier): boolean {
  return t !== 'low';
}

/** Pure: burst count multiplier for a tier. */
export function burstMulFor(t: EffectsTier): number {
  return BURST_MUL[t];
}

/** Pure: a burst count on a tier, scaled and limited by the live cap. Never negative. */
export function tierBurstCount(count: number, t: EffectsTier, cap: number): number {
  const n = Math.round(Math.max(0, count) * BURST_MUL[t]);
  return Math.max(0, Math.min(Math.floor(cap), n));
}

/** What the v2 enemy fx draw on a tier (docs/10 wave C Glow item 5). */
export interface EnemyFxGates {
  /** Swirl trail and Charger dash streak (particles in the shared pool). */
  trails: boolean;
  /** Wall pulse and wall flash. */
  mapFx: boolean;
  /**
   * Charger lane line, Blink ghost and destination ring, Blink arrival flash, Slime splat.
   * These are gameplay tells, so they show on every tier, low included.
   */
  tells: boolean;
}

/** Pure: enemy fx gates for a tier. Low turns trails and map effects off, never the tells. */
export function enemyFxGates(t: EffectsTier): EnemyFxGates {
  return { trails: trailsOn(t), mapFx: mapEffectsOn(t), tells: true };
}

let tier: EffectsTier = EFFECTS_DEFAULT;

type TierListener = (t: EffectsTier) => void;
const listeners = new Set<TierListener>();

/** Current tier. */
export function getEffectsTier(): EffectsTier {
  return tier;
}

/**
 * Select a tier. A value that is not a tier string (an unchecked caller) falls back to the
 * default. Listeners run only when the tier changes.
 */
export function setEffectsTier(t: EffectsTier): void {
  const next = isEffectsTier(t) ? t : EFFECTS_DEFAULT;
  if (next === tier) return;
  tier = next;
  for (const h of [...listeners]) h(next);
}

/** Subscribe to tier changes. Returns the unsubscribe function. */
export function onEffectsTierChanged(h: TierListener): () => void {
  listeners.add(h);
  return () => {
    listeners.delete(h);
  };
}
