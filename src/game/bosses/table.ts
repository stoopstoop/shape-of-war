// Boss numbers (docs/12 wave V3-A, docs/13 SPEC 3.4). Every tunable lives here so a tuning pass is
// a one file edit (shared rule 5). Hit points are in spread hits; the sim stores tenths of a hit in
// w.hp (Int16Array), so 360 hits is 3600. Starting values, tuned at G3A (D5).
import type { BossId, BossTier } from '../../levelgen/leveldef';
import type { PaletteKey } from '../../render/neon';

const DEG = Math.PI / 180;

export interface BossRow {
  tier: BossTier;
  /** Hit points in spread hits (Ryan, Q4). */
  hp: number;
  phases: number;
  /** Body radius in u (44 to 90). */
  radius: number;
  /** Tier colour key (render and fx payloads). */
  colour: PaletteKey;
}

/** All ten rows of the docs/13 roster. Wave A builds the first three behaviours. */
export const BOSS_TABLE: Readonly<Record<BossId, BossRow>> = {
  warden: { tier: 1, hp: 360, phases: 2, radius: 56, colour: 'bossBlue' },
  brood: { tier: 1, hp: 400, phases: 2, radius: 52, colour: 'bossGreen' },
  spindle: { tier: 1, hp: 500, phases: 2, radius: 48, colour: 'bossYellow' },
  ember: { tier: 2, hp: 600, phases: 3, radius: 44, colour: 'bossOrange' },
  mirage: { tier: 2, hp: 640, phases: 3, radius: 50, colour: 'bossMagenta' },
  gravitas: { tier: 2, hp: 700, phases: 3, radius: 60, colour: 'bossViolet' },
  bastion: { tier: 3, hp: 900, phases: 3, radius: 70, colour: 'bossRed' },
  tempest: { tier: 3, hp: 900, phases: 3, radius: 46, colour: 'bossRed' },
  twins: { tier: 3, hp: 1000, phases: 2, radius: 44, colour: 'bossRed' },
  prism: { tier: 4, hp: 1000, phases: 4, radius: 90, colour: 'bossPrism' },
};

/** Damage per hit against a boss or a boss part, in tenths of a hit (boss rule 8). */
export const BOSS_DAMAGE = {
  spread: 10,
  rapid: 7,
  pierce: 40,
  orbit: 15,
  drone: 10,
  ram: 20,
} as const;

/** Orbit blade rest after hitting a boss body, s (0.12 s against everything else). */
export const ORBIT_BOSS_COOLDOWN = 0.25;
/** Detonate takes this fraction of the boss's maximum hit points (boss rule 7). */
export const DETONATE_BOSS_FRACTION = 0.1;
/** Detonate reaches the boss when its body edge is within this many u of the drone. */
export const DETONATE_BOSS_RADIUS = 260;
/** Reward geoms on a boss kill (boss rule 11). */
export const BOSS_REWARD_GEOMS = 20;
/** Stored hit points never exceed this (Int16Array, docs/13 boss rule 2). */
export const BOSS_HP_MAX = 32767;

/** Entrance telegraph ring, harmless and untargetable (boss rule 3). */
export const ENTRANCE_SEC = 2.0;
/** Bomb stagger: no attacks, open to damage (boss rule 7). */
export const STAGGER_SEC = 1.5;
/** Phase change pause: no attacks while the phase flash plays. */
export const PHASE_CHANGE_SEC = 1.0;
/** Enrage after this long alive (boss rule 10), or at once in the hold state. */
export const ENRAGE_AFTER_SEC = 90;
/** Attack clock multiplier while enraged: 30 percent faster. */
export const ENRAGE_RATE = 1.3;
/** Share of the wave schedule kept while an Adventure boss lives (boss rule 4). */
export const WAVE_BUDGET_WITH_BOSS = 0.6;
/** A lethal hazard that would overlap the ship waits this long and rechecks (fairness rule 5). */
export const HAZARD_RECHECK_SEC = 0.3;
/**
 * Live caps (fairness rule 5). Hazards: 8, Fable's ruling on draft flag 2 (docs/13 "Fable rulings",
 * "Live hazard cap is 8 (lane bursts)"), so Mirage's eight lane burst fits. Tier 1 holds at most 3.
 */
export const MAX_HAZARDS = 8;
export const MAX_ADDS = 8;
export const MAX_PARTS = 4;
/** hud:boss throttle, s. */
export const BOSS_HUD_INTERVAL = 0.1;

/** Hazard primitive starting numbers (docs/13 "Hazard primitives"). */
export const HAZARD = {
  laneLength: 600,
  laneHalfWidth: 22,
  /** A lane is at most 60 u wide (fairness rule 5). */
  laneHalfWidthMax: 30,
  laneLethalSec: 0.3,
  ringGrowth: 300,
  /** Lethal band width: the ship centre within half of it from the radius. */
  ringBand: 14,
  sweepHalfWidth: 12,
  sweepLength: 380,
  /** A sweep leaves gaps of at least 90 deg, so at most 4 arms. Bosses use 1 to 3. */
  sweepArmsMax: 3,
  tetherHalfWidth: 10,
  pullRadius: 300,
  pullMax: 100,
} as const;

/** Warden (tier 1, level 5). */
export const WARDEN = {
  seekSpeed: 55,
  turnRate: 60 * DEG,
  ringEvery: 4.5,
  ringEveryP2: 3.5,
  /** First ring this long after the entrance ends. */
  firstRing: 1.5,
  /** Full gap angle facing the ship. */
  gapDeg: 70,
  /** Gaps per ring in phase 2 (the second is opposite the first). Set 1 to keep one gap. */
  gapsP2: 2,
  /** Core open window after each ring launches. */
  openSec: 2.0,
  /** Ring starts this far outside the body. */
  ringStartPad: 10,
  /** Entrance slide ends at this share of the wall distance. */
  entryHome: 0.55,
} as const;

/**
 * Brood (tier 1, level 10). G3A rework (Ryan: "more like a level obstacle than a boss"): it hunts
 * the ship and charges across the arena instead of hugging the boundary, its adds are Darts
 * launched at the ship, and its open core is a flagged window (BossState.exposed).
 */
export const BROOD = {
  /** Prowl: seek the ship, turn limited. */
  prowlSpeed: 75,
  prowlSpeedP2: 90,
  turnRate: 90 * DEG,
  /** Prowl seconds before each charge wind up (attack clock, so enrage shortens it). */
  prowlSec: 3.0,
  prowlSecP2: 2.2,
  /** First wind up this long after the entrance ends. */
  firstCharge: 1.5,
  /**
   * Charge: heading locked toward the ship when the wind up starts. The wind up lasts the tier
   * telegraph (1.0 s at tier 1) and shows a lane marker along the path. The body then runs at
   * chargeSpeed for at most chargeSec or until a wall stops it.
   */
  chargeSpeed: 320,
  chargeSpeedP2: 360,
  chargeSec: 1.8,
  /** Pause after a charge before it prowls again. */
  recoverSec: 0.6,
  /** Marker half width (the lane cap, 30 u). The body is wider: the marker shows the line. */
  markerHalfWidth: 30,
  /**
   * While the core is open it never charges and flees from the ship at this speed (turn limited),
   * so the window is a chase, not a sitting target.
   */
  exposedSpeed: 80,
  addEvery: 6,
  addEveryP2: 5,
  /** First adds this long after the entrance ends. */
  firstAdds: 2,
  addsPerWave: 3,
  addsPerWaveP2: 4,
  /** Adds launch from the side facing the ship, this far apart. */
  addSpreadDeg: 30,
  /** Nearer than this, adds launch from the rear flanks instead (never point blank). */
  addFrontMinDist: 220,
  podCount: 3,
  podOrbit: 90,
  /** 1 HP in tenths of a hit. */
  podHp: 10,
  podRadius: 12,
  podSpin: 1.2,
  openSec: 5,
  /** Pods regrow this long after the last one died (10 at G3A; 9 keeps the fight in 35 to 50 s). */
  regrowSec: 9,
  /** Adds spawn this far outside the body. */
  addPad: 24,
  /** Entrance slide distance in from the wall, u. */
  entrySlide: 40,
} as const;

/** Spindle (tier 1, level 15). */
export const SPINDLE = {
  orbitRadius: 200,
  orbitRate: 0.4,
  /** Top speed while reaching its orbit point, u/s. */
  approachSpeed: 120,
  arms: 2,
  armsP2: 3,
  armLength: 380,
  /** Arm rate without the pellet trade. The shot row below overrides it. */
  armRate: 0.5,
  reverseEvery: 5,
} as const;

/**
 * Ember (tier 2, orange, level 20; roster row 4). Wind up with a lane marker, dash, bounce off up
 * to two walls, a Mine every 120 u along the dash. Hittable only stunned or resting. Each phase is
 * speedUp faster: speeds times speedUp^(phase - 1), timings divided by it, and the wind up never
 * shorter than the tier telegraph.
 */
export const EMBER = {
  windupSec: 0.9,
  dashSpeed: 760,
  dashSec: 0.6,
  /** Wall bounces per dash. A dash that touched a wall ends in a stun; a third wall stuns at once. */
  bounces: 2,
  stunSec: 2.0,
  restSec: 1.2,
  /** Turn rate while winding up, before the heading locks (when the marker shows). */
  turnRate: 240 * DEG,
  /** First wind up this long after the entrance ends. */
  firstDash: 1.0,
  /** A Mine every this many u of dash (the Mine rules: 6 per owner, 24 in total). */
  mineEvery: 120,
  speedUp: 1.15,
  /** Marker half width (lane cap 30 u); the body is wider, the marker shows the line. */
  markerHalfWidth: 30,
  entryHome: 0.5,
} as const;

/**
 * Mirage (tier 2, magenta, level 25; roster row 5). Warps to a point 200 to 300 u from its target,
 * a ring marks the spot markSec early, then eight lanes radiate from the landing point. Its shield
 * ring blocks every shot except through an open arc that turns at arcRate (w.rot of the boss is
 * the arc centre).
 */
export const MIRAGE = {
  warpEvery: 3.0,
  warpEveryP2: 2.5,
  warpEveryP3: 2.0,
  markSec: 0.5,
  warpMin: 200,
  warpMax: 300,
  /** Candidate landing points tried per warp (deterministic, from hash01). */
  warpTries: 8,
  /** A landing waits while the ship is within the body radius plus this pad of the spot. */
  landPad: 40,
  lanes: 8,
  /** Lanes sit this far off the ship's bearing, so the ship starts midway between two of them. */
  laneOffsetDeg: 22.5,
  laneLength: 600,
  laneHalfWidth: 22,
  arcDeg: 70,
  arcRate: 1.5,
  /** First warp marker this long after the entrance ends. */
  firstWarp: 1.5,
  entryHome: 0.5,
} as const;

/**
 * Gravitas (tier 2, violet, level 30; roster row 6). Seeks at 45 u/s with a pull around it. Three
 * anchors gate all damage; each lost anchor weakens the pull by a third. A collapsing ring with a
 * 60 deg gap facing the ship every 5, 4 then 3 s.
 */
export const GRAVITAS = {
  seekSpeed: 45,
  anchors: 3,
  /** 6 HP in tenths of a hit. */
  anchorHp: 60,
  anchorRadius: 14,
  anchorOrbit: 140,
  anchorSpin: 0.6,
  ringEvery: 5,
  ringEveryP2: 4,
  ringEveryP3: 3,
  /** First ring this long after the entrance ends. */
  firstRing: 2.5,
  gapDeg: 60,
  /** The ring starts this far out and collapses onto the body at ringCollapse u/s. */
  ringStart: 480,
  ringCollapse: 220,
  pullRadius: 300,
  pullMax: 100,
  entryHome: 0.45,
} as const;

/**
 * Bastion (tier 3, red, level 35; roster row 7). Holds the centre and turns at 0.3 rad/s. Four
 * corner turrets (8 HP) take one turn every 1.5 s in order; a destroyed turret skips its turns. The
 * core takes damage once two turrets are down. Phases follow the turrets: four, two, none.
 */
export const BASTION = {
  turnRate: 0.3,
  turrets: 4,
  /** 8 HP in tenths of a hit. */
  turretHp: 80,
  turretRadius: 16,
  /** Turret centres sit this far from the core centre, on the diagonals of its facing. */
  turretOffset: 100,
  turnEvery: 1.5,
  /** First turn this long after the entrance ends. */
  firstTurn: 1.0,
  /** The core opens with this many turrets or fewer left. */
  openAtTurrets: 2,
  /** Lanes run straight out from a turret along its diagonal. */
  laneLength: 600,
  laneHalfWidth: 22,
  addEvery: 12,
  /** Bulwarks join this far outside the body edge, on the side facing the target. */
  addPad: 40,
} as const;

/**
 * Tempest (tier 3, red, level 40; roster row 8). Laps the wall at 140 u/s, 90 u from it, dropping a
 * Slime every 1.0 s (8 of its own live at most, inside the 12 total Slime cap). Every 6 s (5, 4 in
 * later phases) it winds up for the tier telegraph with a lane marker, dashes across the arena at
 * its target and rests 1.5 s at the far wall. Hittable on the lap and in the rest.
 */
export const TEMPEST = {
  lapSpeed: 140,
  wallGap: 90,
  /** Catch up speed toward the lap point (after a dash), as a multiple of lapSpeed. */
  catchUp: 1.6,
  slimeEvery: 1.0,
  slimeMax: 8,
  dashEvery: 6,
  dashEveryP2: 5,
  dashEveryP3: 4,
  /** First dash this long after the entrance ends. */
  firstDash: 4,
  dashSpeed: 600,
  /** A dash ends at the far wall, or after this long at most. */
  dashSecMax: 3,
  restSec: 1.5,
  markerHalfWidth: 30,
} as const;

/**
 * Twins (tier 3, red, level 45; roster row 9). Two bodies of 500 HP each orbit the arena centre,
 * 300 to 500 u apart, at 0.6 rad/s, with a lethal tether between them. Each fires a ring every 7 s,
 * offset by 3.5 s. The first to fall breaks the tether and enrages the other (x1.4 speed, a ring
 * every 4 s).
 */
export const TWINS = {
  orbitRate: 0.6,
  sepMin: 300,
  sepMax: 500,
  /** The separation breathes between sepMin and sepMax at this rate, rad/s. */
  sepRate: 0.35,
  /** The second body slides out from the first at this speed after the entrance. */
  slideSpeed: 220,
  /** The tether forms once the bodies are this far apart. */
  tetherAt: 250,
  ringEvery: 7,
  ringEveryEnraged: 4,
  enrageSpeed: 1.4,
  /** First ring this long after the entrance ends. */
  firstRing: 1.5,
  gapDeg: 60,
  ringStartPad: 10,
  /** Entrance home distance from the centre, at most. */
  entryHome: 200,
} as const;

/**
 * Prism (tier 4, multicolour, level 50; roster row 10). Drifts between four points at 90 u/s and
 * quotes the others by phase: 1 ring and pods, 2 sweep arms and a dash lane, 3 a pull and warp lane
 * bursts, 4 turret nodes and a tether. A 4 s damage cycle: 2.3 s colour, 0.5 s run to white, 1.2 s
 * window. Full damage in the window, leak (25 percent) outside it. Its own hazard cap is 6.
 */
export const PRISM = {
  driftSpeed: 90,
  /** Drift points sit on the arena diagonals at this share of the wall distance. */
  pointShare: 0.55,
  /** Arrival distance at a drift point, u. */
  arriveDist: 2,
  /** Visual spin of the body, rad/s. */
  spin: 0.3,
  colourSec: 2.3,
  whiteSec: 0.5,
  windowSec: 1.2,
  /** Share of a hit that gets through outside the window. */
  leak: 0.25,
  maxHazards: 6,
  /** First attack this long after the entrance ends (and after each phase change). */
  firstAttack: 1.5,
  // Phase 1: ring and three pods.
  ringEvery: 3.5,
  gapDeg: 60,
  ringStartPad: 10,
  ringGrowth: 300,
  pods: 3,
  /** 2 HP in tenths of a hit. */
  podHp: 20,
  podRadius: 14,
  podOrbit: 140,
  podSpin: 1.0,
  // Phase 2: two sweep arms and a dash lane.
  sweepArms: 2,
  sweepLength: 380,
  sweepRate: 0.6,
  laneEvery: 2.5,
  laneLength: 600,
  laneHalfWidth: 22,
  // Phase 3: a pull and warp lane bursts.
  pullRadius: 300,
  pullStrength: 70,
  warpEvery: 3.5,
  /** The landing ring marker shows this long before the warp (at least the marker life, so it is gone). */
  markSec: 0.6,
  /** A landing waits while the ship is within the body radius plus this pad of the spot. */
  landPad: 40,
  burstLanes: 4,
  /** Burst lanes sit this far off the ship's bearing, so the ship starts midway between two. */
  burstOffsetDeg: 45,
  // Phase 4: four turret nodes and a tether.
  turrets: 4,
  /** 6 HP in tenths of a hit. */
  turretHp: 60,
  turretRadius: 16,
  turretOffset: 120,
  turnEvery: 1.0,
  entryHome: 0.5,
} as const;

export interface ShotRow {
  pattern: 'pellet' | 'fan' | 'turret';
  /** Bullet speed, u/s (clamped to ENEMY_BULLET_SPEED_MAX by the pool, phase speed ups included). */
  speed: number;
  /** Seconds between volleys (pellet, turret). 0 for a fan, which fires once per open floor dash. */
  every: number;
  everyP2: number;
  /** Bullets per volley (at most SHOT_VOLLEY_MAX). Optional so a row without it fires one. */
  count?: number;
  /** Angle between neighbours in a fan, degrees (at least 12). */
  spreadDeg?: number;
  /** Spindle's trade: arm rate with the pellet on. */
  armRate?: number;
  /** Ember's trade: rest after an open floor dash, s (the fan launches inside it). */
  restSec?: number;
}

/**
 * The three shooters (docs/13 "Boss projectiles"). Each row holds the shot and the trade it pays
 * (Spindle's slower arms, Ember's longer rest after an open floor dash). Cut 5 empties these rows,
 * which removes the shots and reverts the trades; every other attack stays. Bastion's row is its
 * trade too: with it each turret alternates a lane and a bullet on its own turns (same turn rate,
 * BASTION.turnEvery); without it every turn is a lane.
 */
export const BOSS_SHOTS: Readonly<Partial<Record<BossId, ShotRow>>> = {
  spindle: { pattern: 'pellet', speed: 180, every: 3.0, everyP2: 3.6, count: 1, armRate: 0.4 },
  ember: { pattern: 'fan', speed: 210, every: 0, everyP2: 0, count: 3, spreadDeg: 14, restSec: 1.8 },
  bastion: { pattern: 'turret', speed: 200, every: 1.5, everyP2: 1.5, count: 1 },
};

/** A volley is at most this many bullets (docs/13 boss projectiles rule 2). */
export const SHOT_VOLLEY_MAX = 5;
/** Neighbours in a fan are at least this far apart, degrees (rule 6). */
export const SHOT_SPREAD_MIN_DEG = 12;
/** A shot due with the ship nearer than ENEMY_BULLET_MIN_RANGE waits this long and rechecks (rule 6). */
export const SHOT_RECHECK_SEC = 0.3;

/** Ember's rest after an open floor dash: the fan row's trade when the row exists, else the base rest. */
export function emberFanRest(): number {
  return BOSS_SHOTS.ember?.restSec ?? EMBER.restSec;
}

/** Spindle's arm rate: the shot row's trade when the row exists, else the base rate. */
export function spindleArmRate(): number {
  return BOSS_SHOTS.spindle?.armRate ?? SPINDLE.armRate;
}

/** Pure: stored maximum hit points for a row and an hpMul, in tenths, clamped to the Int16 range. */
export function maxHpFor(row: BossRow, hpMul: number): number {
  const mul = Number.isFinite(hpMul) && hpMul > 0 ? hpMul : 1;
  const v = Math.round(row.hp * 10 * mul);
  return v > BOSS_HP_MAX ? BOSS_HP_MAX : v < 1 ? 1 : v;
}
