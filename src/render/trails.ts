// Ship and bullet trails (v2 SPEC addendum 3.8, docs/10 wave B Glow item 5). Pure, no pixi.js.
// Trails are render only: they read positions and velocities and write particle specs, never
// the sim. Jitter comes from hash01 of a render side sequence counter, never from a PRNG.
// particles.ts owns the emitters and pushes the specs into the pool with emitTrail, which
// refuses trails above 80 percent live so bursts always win.
// Run 0180: the ship's trail body is now the comet ribbon (comet.ts), one small mesh; the ship
// particles below are only the sparks that fly off it, so their rate dropped from 0.25 to 0.1
// per u/s. Rapid bullets carry an attached tapered sprite instead of most of their particles
// (attachedTrailFor), which pays for the Dart trail, the Blink streak and the geom sparkle.
import type { BulletStyleVisual } from './bulletStyles';
import { hash01 } from './color';
import type { EffectsTier } from './effects';
import type { TrailSpec } from './particlePool';

/** Below this ship speed (u/s) no trail is emitted, so a ship at rest or creeping stays clean. */
export const TRAIL_MIN_SPEED = 60;
/** Ship spark particles per second per u/s above TRAIL_MIN_SPEED (420 u/s gives 36 per s). */
export const SHIP_TRAIL_GAIN = 0.1;
/** Hard ceiling per frame per emitter, so a long frame never dumps a burst of trail. */
export const MAX_TRAIL_PER_FRAME = 6;
/** Distance behind the ship centre, along the motion, where the trail starts (u). */
const SHIP_TAIL_U = 9;

/** Pure: ship trail emission rate in particles per second. 0 at or below 60 u/s, rising above. */
export function shipTrailRate(speed: number): number {
  if (!(speed > TRAIL_MIN_SPEED)) return 0;
  return (speed - TRAIL_MIN_SPEED) * SHIP_TRAIL_GAIN;
}

/**
 * Per bullet style trail rates (particles per second per bullet): rapid and pierce only. Rapid
 * was 45 and pierce 60 before run 0180; their attached tapered trails now carry the streak and
 * the particles are a sparse, longer lived sparkle.
 */
const BULLET_TRAIL_RATE: readonly number[] = [0, 12, 30, 0];
const BULLET_TRAIL_LIFE: readonly number[] = [0, 0.2, 0.24, 0];

// Attached bullet trails -------------------------------------------------------------------

/** Width of the tapered trail frame in the trail atlas, texture units (head at the right). */
export const TAPER_TEX_LEN = 64;
/** Height of the tapered trail frame, texture units. */
export const TAPER_TEX_H = 12;
/** Width of the v1 trail frame (low tier, unchanged look). */
export const V1_TRAIL_TEX_LEN = 32;

/** Attached trail lengths on standard and high, arena units, by frame (homing separate). */
const TAPER_LEN = { dot: 84, rapid: 56, pierce: 120, orbit: 0, homing: 150 } as const;
/** Attached trail thickness (scale on TAPER_TEX_H) by frame. */
const TAPER_THICK = { dot: 0.85, rapid: 0.55, pierce: 0.8, orbit: 0, homing: 0.95 } as const;
/** High spends more: longer trails. */
const HIGH_LEN_MUL = 1.15;

export interface AttachedTrail {
  /** Length in arena units, 0 for none. */
  len: number;
  /** Thickness scale on the frame height. */
  thick: number;
  /** True for the tapered frame, false for the v1 frame. */
  taper: boolean;
}

/**
 * Pure: the attached sprite trail for a bullet look on a tier, written into out. Low keeps the
 * wave B look exactly (v1 frame, the style's own length and thickness). Standard and high use
 * the tapered frame, longer, and give rapid bullets an attached trail too. Orbit has none.
 */
export function attachedTrailFor(v: BulletStyleVisual, tier: EffectsTier, out: AttachedTrail): AttachedTrail {
  if (tier === 'low') {
    out.len = v.trailLenU;
    out.thick = v.trailThick;
    out.taper = false;
    return out;
  }
  const key = v.tint === 'homing' && v.trailLenU > 0 ? 'homing' : v.frame;
  const mul = tier === 'high' ? HIGH_LEN_MUL : 1;
  out.len = TAPER_LEN[key] * mul;
  out.thick = TAPER_THICK[key];
  out.taper = out.len > 0;
  return out;
}

/**
 * Pure: tapered trail frame profile at x in [0, 1] (0 tail, 1 head): half height as a fraction of
 * the frame half height and alpha, for the soft halo and the hot core. The renderer bakes this
 * into the trail atlas once.
 */
export function taperProfile(x: number, out: { haloH: number; haloA: number; coreH: number; coreA: number }): void {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  out.haloH = Math.pow(t, 0.7);
  out.haloA = 0.34 * t;
  out.coreH = 0.12 + 0.2 * Math.pow(t, 0.5);
  out.coreA = Math.pow(t, 1.4);
}

/** Pure: bullet trail rate for a BulletPool.style value. Spread and orbit emit none. */
export function bulletTrailRate(style: number): number {
  return BULLET_TRAIL_RATE[style] ?? 0;
}

/** Fractional emission accumulator. One for the ship, one per bullet slot. */
export interface Emitter {
  acc: number;
}

/**
 * How many particles to emit this frame at rate (per s) over dt (s), carrying the fraction in
 * the accumulator. A zero rate resets it so a trail restarts cleanly. Allocates nothing.
 */
export function stepEmitter(e: Emitter, rate: number, dt: number): number {
  if (!(rate > 0) || !(dt > 0)) {
    e.acc = 0;
    return 0;
  }
  const total = e.acc + rate * dt;
  const n = Math.floor(total);
  if (n > MAX_TRAIL_PER_FRAME) {
    e.acc = 0;
    return MAX_TRAIL_PER_FRAME;
  }
  e.acc = total - n;
  return n;
}

/**
 * Fill out with one ship trail particle. (x, y) is the ship centre, (vx, vy) its velocity,
 * seq a render sequence number for hash01 jitter, k the index within this frame's emits and
 * n their count, so the emits of one frame spread along the distance travelled since the last.
 */
export function shipTrailParticle(
  out: TrailSpec,
  x: number,
  y: number,
  vx: number,
  vy: number,
  dt: number,
  seq: number,
  k: number,
  n: number,
  colour: number,
): void {
  const speed = Math.sqrt(vx * vx + vy * vy);
  const inv = speed > 0 ? 1 / speed : 0;
  const dx = vx * inv;
  const dy = vy * inv;
  const back = n > 0 ? (k / n) * dt : 0;
  const side = (hash01(seq * 3 + 1) - 0.5) * 7;
  const kick = (hash01(seq * 3 + 2) - 0.5) * 50;
  out.x = x - dx * SHIP_TAIL_U - vx * back - dy * side;
  out.y = y - dy * SHIP_TAIL_U - vy * back + dx * side;
  // Thrown backwards at a fraction of the ship speed: the streak points along the motion.
  out.vx = -dx * speed * 0.18 - dy * kick;
  out.vy = -dy * speed * 0.18 + dx * kick;
  out.life = 0.28 + hash01(seq * 3 + 3) * 0.17;
  out.drag = 3;
  out.colour = colour;
  out.size = 1;
}

/** Fill out with one bullet trail particle: a short streak that lags the bullet and fades. */
export function bulletTrailParticle(
  out: TrailSpec,
  x: number,
  y: number,
  vx: number,
  vy: number,
  style: number,
  seq: number,
  colour: number,
): void {
  const j = hash01(seq * 2 + 1);
  out.x = x - vx * 0.004 * j;
  out.y = y - vy * 0.004 * j;
  out.vx = vx * 0.07;
  out.vy = vy * 0.07;
  out.life = (BULLET_TRAIL_LIFE[style] ?? 0.1) * (0.8 + 0.4 * hash01(seq * 2 + 2));
  out.drag = 6;
  out.colour = colour;
  out.size = 1;
}

/** Enemy trail types: Swirl trail, Charger dash streak and (run 0180) the Dart trail. */
export const ENEMY_TRAIL_SWIRL = 0;
export const ENEMY_TRAIL_CHARGER = 1;
export const ENEMY_TRAIL_DART = 2;
/** Enemy trail particle life (s), sideways jitter (u) and size by trail type. */
const ENEMY_TRAIL_LIFE: readonly number[] = [0.35, 0.32, 0.3];
const ENEMY_TRAIL_SIDE: readonly number[] = [4, 9, 3];
const ENEMY_TRAIL_SIZE: readonly number[] = [1, 1.3, 0.9];

/** Dart trail: particles per second while a Dart moves faster than DART_TRAIL_MIN_SPEED. */
export const DART_TRAIL_RATE = 40;
export const DART_TRAIL_MIN_SPEED = 150;

/** Pure: Dart trail rate for a drawn speed in u/s. */
export function dartTrailRate(speed: number): number {
  return speed > DART_TRAIL_MIN_SPEED ? DART_TRAIL_RATE : 0;
}

/**
 * Fill out with one enemy trail particle. (x, y) is the drawn position and (vx, vy) the drawn
 * velocity in u/s. The particle starts just behind the body and drifts back slowly, so a fast
 * mover leaves a line and a circling Swirl leaves an arc.
 */
export function enemyTrailParticle(
  out: TrailSpec,
  x: number,
  y: number,
  vx: number,
  vy: number,
  type: number,
  seq: number,
  colour: number,
): void {
  const speed = Math.sqrt(vx * vx + vy * vy);
  const inv = speed > 0 ? 1 / speed : 0;
  const dx = vx * inv;
  const dy = vy * inv;
  const side = (hash01(seq * 3 + 1) - 0.5) * (ENEMY_TRAIL_SIDE[type] ?? 4);
  const back = 6 + hash01(seq * 3 + 2) * 6;
  out.x = x - dx * back - dy * side;
  out.y = y - dy * back + dx * side;
  out.vx = -vx * 0.08;
  out.vy = -vy * 0.08;
  out.life = (ENEMY_TRAIL_LIFE[type] ?? 0.3) * (0.8 + 0.4 * hash01(seq * 3 + 3));
  out.drag = 4;
  out.colour = colour;
  out.size = ENEMY_TRAIL_SIZE[type] ?? 1;
}

// Blink jump streak ------------------------------------------------------------------------

/** Sparks laid along a Blink jump, from the old spot to the new one. */
export const BLINK_STREAK_SPARKS = 10;

/**
 * Fill out with spark k of n along a Blink jump from (x0, y0) to (x1, y1): spaced evenly with a
 * hash01 nudge, drifting slowly sideways, longer lived toward the landing spot.
 */
export function blinkStreakParticle(
  out: TrailSpec,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  k: number,
  n: number,
  seq: number,
  colour: number,
): void {
  const f = n > 0 ? (k + 0.5 + (hash01(seq * 3 + 1) - 0.5) * 0.6) / n : 0.5;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  const inv = len > 0 ? 1 / len : 0;
  const side = (hash01(seq * 3 + 2) - 0.5) * 60;
  out.x = x0 + dx * f;
  out.y = y0 + dy * f;
  out.vx = dx * inv * 30 - dy * inv * side;
  out.vy = dy * inv * 30 + dx * inv * side;
  out.life = 0.18 + 0.22 * f * (0.8 + 0.4 * hash01(seq * 3 + 3));
  out.drag = 3;
  out.colour = colour;
  out.size = 1;
}

// Geom sparkle -----------------------------------------------------------------------------

/** Sparkle particles per second per live geom (shed first with every trail). */
export const GEOM_SPARKLE_RATE = 1.6;

/** Fill out with one geom sparkle: a tiny nearly still glint near the geom, short lived. */
export function geomSparkleParticle(out: TrailSpec, x: number, y: number, seq: number, colour: number): void {
  const a = hash01(seq * 3 + 1) * Math.PI * 2;
  const r = 3 + hash01(seq * 3 + 2) * 7;
  out.x = x + Math.cos(a) * r;
  out.y = y + Math.sin(a) * r;
  out.vx = Math.cos(a) * 14;
  out.vy = Math.sin(a) * 14;
  out.life = 0.22 + hash01(seq * 3 + 3) * 0.16;
  out.drag = 2;
  out.colour = colour;
  out.size = 0.7;
}

/** Twinkle range of a geom's glow: alpha multiplier between these. */
export const GEOM_TWINKLE_MIN = 0.55;
export const GEOM_TWINKLE_MAX = 1.25;

/**
 * Pure: geom glow twinkle at render time t (s) for a geom with phase h in [0, 1): a quick bright
 * glint once a cycle over a gentle shimmer, so a field of geoms sparkles out of step.
 */
export function geomTwinkle(t: number, h: number): number {
  const time = Number.isFinite(t) ? t : 0;
  const hz = 0.7 + 0.6 * h;
  const p = (time * hz + h) % 1;
  const shimmer = 0.5 + 0.5 * Math.sin((time * 3.1 + h * 7) * Math.PI);
  const glint = p < 0.12 ? Math.sin((p / 0.12) * Math.PI) : 0;
  const v = GEOM_TWINKLE_MIN + (GEOM_TWINKLE_MAX - GEOM_TWINKLE_MIN) * (0.3 * shimmer + 0.7 * glint);
  return v < GEOM_TWINKLE_MIN ? GEOM_TWINKLE_MIN : v > GEOM_TWINKLE_MAX ? GEOM_TWINKLE_MAX : v;
}

// Budget accounting ------------------------------------------------------------------------

/** Pure: steady state live particles of an emitter at rate (per s) with mean life (s). */
export function steadyLive(rate: number, meanLife: number): number {
  if (!(rate > 0) || !(meanLife > 0)) return 0;
  return rate * meanLife;
}

/** A busy Standard frame used to check the trail budget (see tests/render/trails.test.ts). */
export interface TrailLoad {
  shipSpeed: number;
  rapidBullets: number;
  pierceBullets: number;
  darts: number;
  swirls: number;
  dashingChargers: number;
  geoms: number;
}

/** Mean particle life of each trail kind, s (the midpoints of the jitter ranges above). */
export const MEAN_LIFE = {
  ship: 0.365,
  rapid: 0.2,
  pierce: 0.24,
  swirl: 0.35,
  charger: 0.32,
  dart: 0.3,
  geom: 0.3,
} as const;

/** Pure: steady state live trail particles for a load. Ignores shedding (the worst case). */
export function trailLiveEstimate(l: TrailLoad, chargerRate: number, swirlRate: number): number {
  return (
    steadyLive(shipTrailRate(l.shipSpeed), MEAN_LIFE.ship) +
    l.rapidBullets * steadyLive(bulletTrailRate(1), MEAN_LIFE.rapid) +
    l.pierceBullets * steadyLive(bulletTrailRate(2), MEAN_LIFE.pierce) +
    l.darts * steadyLive(DART_TRAIL_RATE, MEAN_LIFE.dart) +
    l.swirls * steadyLive(swirlRate, MEAN_LIFE.swirl) +
    l.dashingChargers * steadyLive(chargerRate, MEAN_LIFE.charger) +
    l.geoms * steadyLive(GEOM_SPARKLE_RATE, MEAN_LIFE.geom)
  );
}
