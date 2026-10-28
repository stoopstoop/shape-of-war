// Effects tier (v2 SPEC addendum 3.8, docs/10 "Performance budget"). Pure, no pixi.js import.
// The tier sets the particle cap and switches trails. Ledger persists sow.settings.effects and
// calls setEffectsTier in wave D; until then the default 'standard' applies. Low reproduces the
// v1 look: trails off, map effects off, 2048 particles. The lattice grid columns of the table
// arrive in wave D.

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
