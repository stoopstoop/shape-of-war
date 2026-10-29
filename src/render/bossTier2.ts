// Pure tier 2 boss look (docs/12 wave V3-B Glow brief, roster rows 4 to 6 and presentation). No
// pixi.js import. Ember (orange arrowhead: wind up lane glow, flame and spark trails, pulsing Mines),
// Mirage (magenta ring with a moving open arc, a ghost afterimage at the old spot, a landing flash)
// and Gravitas (violet core, three rings, anchor nodes joined by faint lines, a lattice pull).
// Every helper maps render contract fields (mode, modeT, a drawn speed, a part count) and the render
// clock to an alpha, a rate or a strength. None reads the World and none is read by the simulation.
// Line weight is the tier multiplier on the boss layer (bossLook.ts tierWeight 2.0); glow width is
// still applyNeon's, so nothing here writes a SPEC 4 value.
import { DYING_SEC, ENTRANCE_SEC, MODE_ATTACKING, MODE_DYING, MODE_ENTERING, MODE_GUARDED, MODE_PHASE, MODE_STUNNED } from './bossLook';
import { clampNum } from './color';
import type { EffectsTier } from './effects';
import { BOSS_PULL_ACCEL, WELL_PULL_ACCEL } from './lattice/kicks';

/** Boss index of each tier 2 boss, as BossView.id reports it (index in BOSS_IDS). */
export { BOSS_EMBER, BOSS_GRAVITAS, BOSS_MIRAGE } from './bossLook';

const DEG = Math.PI / 180;

function finite(v: number, d: number): number {
  return Number.isFinite(v) ? v : d;
}

// Ember ---------------------------------------------------------------------------------------

/** Ember wind up length (roster row 4), dash speed and time, so the lane is as long as one dash leg. */
export const EMBER_WINDUP_SEC = 0.9;
export const EMBER_DASH_SPEED = 760;
export const EMBER_DASH_SEC = 0.6;
export const EMBER_LANE_LEN = EMBER_DASH_SPEED * EMBER_DASH_SEC;
/** Lane half width: the body radius (44 u), the band the dash sweeps. */
export const EMBER_LANE_HALF = 44;
/** A drawn speed above this reads as the dash (the seek and slide moves are far slower). */
export const EMBER_DASH_MIN_SPEED = 400;
/** Lane alpha at the start and the end of the wind up, and the flicker in its last share. */
export const EMBER_LANE_A0 = 0.2;
export const EMBER_LANE_A1 = 0.75;
export const EMBER_LANE_FLICKER_SHARE = 0.25;
export const EMBER_LANE_FLICKER_HZ = 12;

/** Pure: true when a drawn speed in u/s is the dash. */
export function emberDashing(speed: number): boolean {
  return finite(speed, 0) > EMBER_DASH_MIN_SPEED;
}

/**
 * Pure: wind up lane alpha. The lane shows only while Ember winds up (guarded or attacking, not yet
 * dashing): it brightens from 0.2 to 0.75 over the wind up and flickers in its last quarter, so the
 * launch moment reads. 0 while dashing, resting, stunned, entering or dying.
 */
export function emberLaneAlpha(mode: number, modeT: number, speed: number): number {
  if (mode !== MODE_GUARDED && mode !== MODE_ATTACKING) return 0;
  if (emberDashing(speed)) return 0;
  const t = Math.max(0, finite(modeT, 0));
  const u = clampNum(t / EMBER_WINDUP_SEC, 0, 1);
  const base = EMBER_LANE_A0 + (EMBER_LANE_A1 - EMBER_LANE_A0) * u;
  if (u < 1 - EMBER_LANE_FLICKER_SHARE) return base;
  const f = 0.5 + 0.5 * Math.cos(t * EMBER_LANE_FLICKER_HZ * Math.PI * 2);
  return base * (0.7 + 0.3 * f);
}

/** Flame trail particles per second by state, and the dash spark trail rate. */
export const EMBER_FLAME_RATE = 28;
export const EMBER_FLAME_WINDUP_RATE = 55;
export const EMBER_FLAME_STUN_RATE = 10;
export const EMBER_SPARK_RATE = 110;

/**
 * Pure: flame trail rate. A steady flame at rest, a roar while winding up, a sputter while stunned.
 * During the dash the spark trail takes over. Trails are off on Low (docs/11), and nothing burns
 * while entering or dying.
 */
export function emberFlameRate(mode: number, dashing: boolean, effects: EffectsTier): number {
  if (effects === 'low' || dashing) return 0;
  if (mode === MODE_ENTERING || mode === MODE_DYING) return 0;
  if (mode === MODE_STUNNED) return EMBER_FLAME_STUN_RATE;
  if (mode === MODE_GUARDED || mode === MODE_ATTACKING) return EMBER_FLAME_WINDUP_RATE;
  return EMBER_FLAME_RATE;
}

/** Pure: dash spark trail rate: only while dashing, off on Low. */
export function emberSparkRate(dashing: boolean, effects: EffectsTier): number {
  return dashing && effects !== 'low' ? EMBER_SPARK_RATE : 0;
}

/** Mine pulse while Ember lives: scale amplitude, rate and the extra glow at the peak. */
export const MINE_PULSE_AMP = 0.14;
export const MINE_PULSE_HZ = 2.2;
export const MINE_PULSE_GLOW = 0.8;

/**
 * Pure: Mine scale on the render clock while Ember lives, phase from a per entity seed in [0, 1).
 * It swells above 1 and never shrinks the Mine below its hitbox look. Off (1) on Low, as the enemy
 * bullet pulse is.
 */
export function minePulse(timeSec: number, seed: number, effects: EffectsTier): number {
  if (effects === 'low') return 1;
  const s = Math.sin((finite(timeSec, 0) * MINE_PULSE_HZ + finite(seed, 0)) * Math.PI * 2);
  return 1 + MINE_PULSE_AMP * (s > 0 ? s : 0);
}

/** Pure: glow sprite multiplier for a Mine pulse scale (1 at rest, 1 + MINE_PULSE_GLOW at the peak). */
export function mineGlow(pulse: number): number {
  return 1 + MINE_PULSE_GLOW * clampNum((finite(pulse, 1) - 1) / MINE_PULSE_AMP, 0, 1);
}

// Mirage --------------------------------------------------------------------------------------

/** Half angle of Mirage's open arc at full openness (roster row 5: a 70 degree arc). */
export const MIRAGE_ARC_HALF = 35 * DEG;
/** Seconds the arc takes to open at the end of the entrance and after a phase change. */
export const MIRAGE_ARC_OPEN_SEC = 0.3;
/** Seconds the arc stays shut at a phase change before it reopens. */
export const MIRAGE_ARC_SHUT_SEC = 0.15;
/** The bright window across the open arc shimmers at this rate. */
export const MIRAGE_WINDOW_HZ = 3;

/**
 * Pure: arc openness, 0 shut to 1 fully open (70 degrees). It opens over the last MIRAGE_ARC_OPEN_SEC
 * of the entrance, snaps shut at a phase change and reopens. Every other mode is open, dying
 * included (the ring breaks with the body): the arc is the counter, shots count through it.
 */
export function mirageArcOpenness(mode: number, modeT: number): number {
  const t = Math.max(0, finite(modeT, 0));
  if (mode === MODE_ENTERING) return clampNum((t - (ENTRANCE_SEC - MIRAGE_ARC_OPEN_SEC)) / MIRAGE_ARC_OPEN_SEC, 0, 1);
  if (mode === MODE_PHASE) return clampNum((t - MIRAGE_ARC_SHUT_SEC) / MIRAGE_ARC_OPEN_SEC, 0, 1);
  return 1;
}

/** Pure: half angle of the open arc in radians for an openness. */
export function mirageArcHalf(open: number): number {
  return MIRAGE_ARC_HALF * clampNum(finite(open, 0), 0, 1);
}

/** Pure: brightness of the window across the open arc on the render clock (0.7 to 1). */
export function mirageWindowGlow(timeSec: number): number {
  return 0.85 + 0.15 * Math.sin(finite(timeSec, 0) * MIRAGE_WINDOW_HZ * Math.PI * 2);
}

/** A drawn jump longer than this in one frame is a warp (no boss walks this far in one frame). */
export const WARP_JUMP_U = 60;

/** Pure: true when a drawn move of (dx, dy) in one frame is a warp. */
export function warpJumped(dx: number, dy: number): boolean {
  const x = finite(dx, 0);
  const y = finite(dy, 0);
  return x * x + y * y > WARP_JUMP_U * WARP_JUMP_U;
}

/** Ghost afterimage at the old spot: life, starting alpha and how far it swells as it fades. */
export const AFTERIMAGE_SEC = 0.7;
export const AFTERIMAGE_A0 = 0.55;
export const AFTERIMAGE_GROW = 0.25;

/**
 * Pure: afterimage alpha at age seconds after a warp. Starts at 0.55 and eases out to 0 over
 * AFTERIMAGE_SEC. A trail class effect, so it is off on Low. Never above AFTERIMAGE_A0.
 */
export function afterimageAlpha(age: number, effects: EffectsTier): number {
  if (effects === 'low' || !Number.isFinite(age) || age < 0 || age >= AFTERIMAGE_SEC) return 0;
  const u = 1 - age / AFTERIMAGE_SEC;
  return AFTERIMAGE_A0 * u * u;
}

/** Pure: afterimage scale at an age (1 at the warp, 1 + AFTERIMAGE_GROW when gone). */
export function afterimageScale(age: number): number {
  return 1 + AFTERIMAGE_GROW * clampNum(finite(age, 0) / AFTERIMAGE_SEC, 0, 1);
}

/** Landing flash spark count per effects tier (the flash ring shows on every tier). */
export const LANDING_SPARKS: Readonly<Record<EffectsTier, number>> = { low: 0, standard: 18, high: 30 };

/** Pure: landing flash spark count for an effects tier. */
export function landingSparks(effects: EffectsTier): number {
  return LANDING_SPARKS[effects];
}

// Gravitas ------------------------------------------------------------------------------------

/** Anchors Gravitas starts with (roster row 6). */
export const GRAVITAS_ANCHORS = 3;
/** Tether between anchors: base alpha (faint), hum depth and rate. Spokes to the core are dimmer. */
export const ANCHOR_TETHER_A = 0.24;
export const ANCHOR_TETHER_HUM = 0.3;
export const ANCHOR_TETHER_HZ = 0.8;
export const ANCHOR_SPOKE_SHARE = 0.5;

function tetherHum(timeSec: number): number {
  const hum = 0.5 + 0.5 * Math.sin(finite(timeSec, 0) * ANCHOR_TETHER_HZ * Math.PI * 2);
  return 1 - ANCHOR_TETHER_HUM + ANCHOR_TETHER_HUM * hum;
}

/**
 * Pure: alpha of the faint line joining two anchors, on the render clock. Needs two anchors (with
 * one left there is nothing to join). A slow hum between 0.7 and 1 of ANCHOR_TETHER_A; never above.
 */
export function anchorTetherAlpha(anchors: number, timeSec: number): number {
  if (!(Math.floor(finite(anchors, 0)) >= 2)) return 0;
  return ANCHOR_TETHER_A * tetherHum(timeSec);
}

/** Pure: alpha of the spoke from an anchor to the core: half the tether, with one anchor or more. */
export function anchorSpokeAlpha(anchors: number, timeSec: number): number {
  if (!(Math.floor(finite(anchors, 0)) >= 1)) return 0;
  return ANCHOR_TETHER_A * ANCHOR_SPOKE_SHARE * tetherHum(timeSec);
}

/** Gravitas lattice pull: radius of influence (the pull radius, 300 u). */
export const GRAVITAS_LATTICE_R = 300;
/**
 * Share of the pull left with every anchor gone. The sim pull falls by a third per lost anchor; the
 * lattice dimple follows it down but keeps this floor, so the boss always reads as heavy.
 */
export const GRAVITAS_PULL_FLOOR = 0.35;

/** Pure: share of the full lattice pull for an anchor count (0 to 3), floor to 1. */
export function gravitasPullShare(anchors: number): number {
  const a = clampNum(Math.floor(finite(anchors, 0)), 0, GRAVITAS_ANCHORS);
  return GRAVITAS_PULL_FLOOR + (1 - GRAVITAS_PULL_FLOOR) * (a / GRAVITAS_ANCHORS);
}

/**
 * Pure: the inward lattice acceleration from the Gravitas position (negative pulls in), through the
 * channel wells use. Ramps in over the entrance, fades out while dying, scales with the anchors.
 * Bounded: never stronger than BOSS_PULL_ACCEL and so never stronger than a gravity well.
 */
export function gravitasLatticeAccel(anchors: number, mode: number, modeT: number): number {
  const t = Math.max(0, finite(modeT, 0));
  let ramp = 1;
  if (mode === MODE_ENTERING) ramp = clampNum(t / ENTRANCE_SEC, 0, 1);
  else if (mode === MODE_DYING) ramp = clampNum(1 - t / DYING_SEC, 0, 1);
  const cap = Math.min(Math.abs(BOSS_PULL_ACCEL), Math.abs(WELL_PULL_ACCEL));
  const a = clampNum(BOSS_PULL_ACCEL * gravitasPullShare(anchors) * ramp, -cap, 0);
  return a < 0 ? a : 0;
}
