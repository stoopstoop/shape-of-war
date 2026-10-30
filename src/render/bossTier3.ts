// Pure tier 3 boss look (docs/12 wave V3-C Glow brief, roster rows 7 to 9). No pixi.js import.
// Bastion (fortress: corner turret alpha by state, a core that heats as turrets fall), Tempest
// (long kite: Slime drips on the lap, a hot afterimage along the dash) and Twins (a thick humming
// tether, an enraged survivor). Every helper maps render contract fields (mode, phase, a drawn
// speed, a part hit point count) and the render clock to an alpha, a rate or a multiplier. None
// reads the World and none is read by the simulation. Line weight is the tier 3 multiplier on the
// boss layer (bossLook.ts tierWeight 3.0) and the outer glow stroke is tierHaloMul 1.5 wider; the
// glow alpha and width are still applyNeon's, so nothing here writes a SPEC 4 value.
import { MODE_DYING, MODE_ENTERING, MODE_STUNNED, MODE_VULNERABLE, tierHaloMul, tierOf } from './bossLook';
import { clampNum } from './color';
import type { EffectsTier } from './effects';
import type { FxHalo } from './fxSprites';

export { BOSS_BASTION, BOSS_TEMPEST, BOSS_TWINS } from './bossLook';

function finite(v: number, d: number): number {
  return Number.isFinite(v) ? v : d;
}

/** The thick boss tier. */
export const TIER3 = 3;

/** Pure: true when a tier is the thick tier 3 boss layer. */
export function isTier3(tier: number): boolean {
  return tierOf(tier) === TIER3;
}

/**
 * Pure: the sprite halo of the boss layer for a tier. Width is the applyNeon halo width times the tier
 * halo multiplier (1.5 on tier 3, 1 otherwise); alpha is untouched, so the neon slider scales the
 * wider stroke only through the glow alpha, and at the slider's low end it is as dim as every halo.
 */
export function tierHalo(halo: Readonly<FxHalo>, tier: number, out: FxHalo): FxHalo {
  out.alpha = halo.alpha;
  out.width = halo.width * tierHaloMul(tier);
  return out;
}

// Bastion --------------------------------------------------------------------------------------

/** Corner turrets Bastion starts with (roster row 7). The core takes damage once two are down. */
export const BASTION_TURRETS = 4;
export const BASTION_CORE_OPEN_AT = 2;

/** Turret states, from the share of its peak hit points left. */
export const TURRET_READY = 0;
export const TURRET_WORN = 1;
export const TURRET_CRITICAL = 2;
export const TURRET_DOWN = 3;
/** Hit point share at or under which a turret reads as worn, and as critical. */
export const TURRET_WORN_AT = 0.6;
export const TURRET_CRITICAL_AT = 0.3;
/** Steady alpha per turret state, indexed by state. A critical turret flickers under its value. */
export const TURRET_ALPHA: readonly number[] = [1, 0.85, 0.72, 0];
export const TURRET_FLICKER_HZ = 7;
export const TURRET_FLICKER_DEPTH = 0.3;

/** Pure: hit point share in [0, 1] of hp against the peak seen (1 when the peak is unknown). */
export function turretShare(hp: number, peak: number): number {
  const h = finite(hp, 0);
  const p = finite(peak, 0);
  if (!(h > 0)) return 0;
  return p > h ? clampNum(h / p, 0, 1) : 1;
}

/** Pure: turret state from its hit points and the most it has had. */
export function turretState(hp: number, peak: number): number {
  if (!(finite(hp, 0) > 0)) return TURRET_DOWN;
  const s = turretShare(hp, peak);
  if (s <= TURRET_CRITICAL_AT) return TURRET_CRITICAL;
  if (s <= TURRET_WORN_AT) return TURRET_WORN;
  return TURRET_READY;
}

/**
 * Pure: turret alpha for a state on the render clock. Ready 1, worn 0.85, a critical turret flickers
 * (seeded phase per turret, 0.72 down to 0.5) and a downed one is 0. Low shows the steady value
 * (no flicker). Never above 1.
 */
export function turretAlpha(state: number, timeSec: number, seed: number, effects: EffectsTier): number {
  const base = TURRET_ALPHA[Math.round(finite(state, TURRET_READY))] ?? 1;
  if (state !== TURRET_CRITICAL || effects === 'low') return base;
  const s = 0.5 + 0.5 * Math.sin((finite(timeSec, 0) * TURRET_FLICKER_HZ + finite(seed, 0)) * Math.PI * 2);
  return base * (1 - TURRET_FLICKER_DEPTH * (1 - s));
}

/** Pure: turret alpha with the body fade (entering fades in, dying fades out) applied. */
export function turretShown(state: number, bodyAlpha: number, timeSec: number, seed: number, effects: EffectsTier): number {
  return turretAlpha(state, timeSec, seed, effects) * clampNum(finite(bodyAlpha, 1), 0, 1);
}

/** Pure: turrets down, from the most seen alive this fight and the live count now. */
export function turretsDown(seen: number, live: number): number {
  const s = clampNum(Math.floor(finite(seen, 0)), 0, BASTION_TURRETS);
  const l = clampNum(Math.floor(finite(live, 0)), 0, BASTION_TURRETS);
  return Math.max(0, s - l);
}

/**
 * Pure: how hot the Bastion keep burns, 0 to 1. Dim with every turret up, 0.1 per turret down, 0.5
 * once two are down (the core takes damage) rising to 1 with all four gone. While the sim reports
 * the core exposed it is 1. Nothing seen yet (the entrance) is 0.
 */
export function bastionCoreHeat(seen: number, live: number, exposed: boolean): number {
  if (exposed) return 1;
  if (!(finite(seen, 0) >= 1)) return 0;
  const down = turretsDown(seen, live);
  const base = down >= BASTION_CORE_OPEN_AT ? 0.5 + 0.25 * (down - BASTION_CORE_OPEN_AT) : 0.1 * down;
  return Math.min(1, base);
}

/** Glow sprite boost of the Bastion body at full heat (a multiplier, never a SPEC 4 write). */
export const BASTION_HEAT_GLOW = 0.7;

/** Pure: glow sprite multiplier for a core heat. */
export function bastionGlow(heat: number): number {
  return 1 + BASTION_HEAT_GLOW * clampNum(finite(heat, 0), 0, 1);
}

// Tempest --------------------------------------------------------------------------------------

/** Lap speed (roster row 8) and the drawn speed above which the body is dashing (far over the lap). */
export const TEMPEST_LAP_SPEED = 140;
export const TEMPEST_DASH_MIN_SPEED = 320;

/** Pure: true when a drawn speed in u/s is the lane dash. */
export function tempestDashing(speed: number): boolean {
  return finite(speed, 0) > TEMPEST_DASH_MIN_SPEED;
}

/** Slime drip particles per second: a steady lap, a slow ooze at rest. */
export const TEMPEST_DRIP_LAP = 16;
export const TEMPEST_DRIP_REST = 5;

/**
 * Pure: Slime drip rate off the tail. Steady on the lap (the Slime it drops), a slow ooze while it
 * rests (vulnerable or stunned), none while it dashes (the afterimage takes over), enters or dies.
 * Off on Low (trails).
 */
export function tempestDripRate(mode: number, dashing: boolean, effects: EffectsTier): number {
  if (effects === 'low' || dashing) return 0;
  if (mode === MODE_ENTERING || mode === MODE_DYING) return 0;
  return mode === MODE_VULNERABLE || mode === MODE_STUNNED ? TEMPEST_DRIP_REST : TEMPEST_DRIP_LAP;
}

/** Dash afterimage: ghosts in the pool, life, starting alpha, spacing along the dash and growth. */
export const DASH_GHOSTS = 4;
export const DASH_GHOST_SEC = 0.32;
export const DASH_GHOST_A0 = 0.5;
export const DASH_GHOST_GAP_U = 46;
export const DASH_GHOST_GROW = 0.12;
/** Share of white mixed into a fresh ghost (hot) and into an old one (cooled toward the boss colour). */
export const DASH_GHOST_HOT = 0.7;
export const DASH_GHOST_COOL = 0.2;

/** Ghosts the effects tier allows (a trail class effect: none on Low). */
export const DASH_GHOST_COUNT: Readonly<Record<EffectsTier, number>> = { low: 0, standard: 3, high: DASH_GHOSTS };

/** Pure: ghost count for an effects tier. */
export function dashGhostCount(effects: EffectsTier): number {
  return DASH_GHOST_COUNT[effects];
}

/** Pure: a quadratic ease out fade from a0 at age 0 to 0 at life; 0 for a bad or expired age. */
export function afterimageFade(age: number, life: number, a0: number): number {
  if (!Number.isFinite(age) || !(life > 0) || age < 0 || age >= life) return 0;
  const u = 1 - age / life;
  return a0 * u * u;
}

/** Pure: dash ghost alpha at an age; 0 on Low. Never above DASH_GHOST_A0. */
export function dashGhostAlpha(age: number, effects: EffectsTier): number {
  return effects === 'low' ? 0 : afterimageFade(age, DASH_GHOST_SEC, DASH_GHOST_A0);
}

/** Pure: ghost scale at an age (1 at the dash, 1 + DASH_GHOST_GROW when gone). */
export function dashGhostScale(age: number): number {
  return 1 + DASH_GHOST_GROW * clampNum(finite(age, 0) / DASH_GHOST_SEC, 0, 1);
}

/** Pure: white share of a ghost at an age: hot at birth, cooling toward the boss colour. */
export function dashGhostWhite(age: number): number {
  const u = clampNum(finite(age, 0) / DASH_GHOST_SEC, 0, 1);
  return DASH_GHOST_HOT + (DASH_GHOST_COOL - DASH_GHOST_HOT) * u;
}

/** Pure: true when the distance dashed since the last ghost calls for the next one. */
export function dashGhostDue(dist: number): boolean {
  return finite(dist, 0) >= DASH_GHOST_GAP_U;
}

// Twins ----------------------------------------------------------------------------------------

/** Tether hum on tier 3: rate, depth of the alpha dip and the share the width swells by. */
export const TETHER_PULSE_HZ = 3.5;
export const TETHER_PULSE_DEPTH = 0.3;
export const TETHER_SWELL = 0.15;

function pulseWave(timeSec: number): number {
  return 0.5 + 0.5 * Math.sin(finite(timeSec, 0) * TETHER_PULSE_HZ * Math.PI * 2);
}

/**
 * Pure: alpha multiplier of a lethal tier 3 tether on the render clock, 0.7 to 1. A slower, deeper
 * hum than the tier 1 and 2 tether, so the thick bar reads as live current.
 */
export function tetherPulse(timeSec: number): number {
  return 1 - TETHER_PULSE_DEPTH * (1 - pulseWave(timeSec));
}

/** Pure: width multiplier of a lethal tier 3 tether, 0.85 to 1.15, swelling with the hum. */
export function tetherThick(timeSec: number): number {
  return 1 - TETHER_SWELL + 2 * TETHER_SWELL * pulseWave(timeSec);
}

/** Pure: the survivor of the pair (phase 2, after the first body falls) is enraged (roster row 9). */
export function twinsEnraged(phase: number): boolean {
  return finite(phase, 1) >= 2;
}

/** Enraged glow: base boost and flutter depth of the surviving body, at this rate. */
export const TWINS_ENRAGE_GLOW = 0.3;
export const TWINS_ENRAGE_FLUTTER = 0.12;
export const TWINS_ENRAGE_HZ = 5;

/** Pure: glow sprite multiplier for the Twins body: 1 until the first falls, then hot and fluttering. */
export function twinsEnrageGlow(phase: number, timeSec: number, effects: EffectsTier): number {
  if (!twinsEnraged(phase)) return 1;
  const f = effects === 'low' ? 0 : TWINS_ENRAGE_FLUTTER * Math.sin(finite(timeSec, 0) * TWINS_ENRAGE_HZ * Math.PI * 2);
  return 1 + TWINS_ENRAGE_GLOW + f;
}
