// Ship and bullet trails (v2 SPEC addendum 3.8, docs/10 wave B Glow item 5). Pure, no pixi.js.
// Trails are render only: they read positions and velocities and write particle specs, never
// the sim. Jitter comes from hash01 of a render side sequence counter, never from a PRNG.
// particles.ts owns the emitters and pushes the specs into the pool with emitTrail, which
// refuses trails above 80 percent live so bursts always win.
import { hash01 } from './color';
import type { TrailSpec } from './particlePool';

/** Below this ship speed (u/s) no trail is emitted, so a ship at rest or creeping stays clean. */
export const TRAIL_MIN_SPEED = 60;
/** Ship trail particles per second per u/s above TRAIL_MIN_SPEED (420 u/s gives 90 per s). */
export const SHIP_TRAIL_GAIN = 0.25;
/** Hard ceiling per frame per emitter, so a long frame never dumps a burst of trail. */
export const MAX_TRAIL_PER_FRAME = 6;
/** Distance behind the ship centre, along the motion, where the trail starts (u). */
const SHIP_TAIL_U = 9;

/** Pure: ship trail emission rate in particles per second. 0 at or below 60 u/s, rising above. */
export function shipTrailRate(speed: number): number {
  if (!(speed > TRAIL_MIN_SPEED)) return 0;
  return (speed - TRAIL_MIN_SPEED) * SHIP_TRAIL_GAIN;
}

/** Per bullet style trail rates (particles per second per bullet): rapid and pierce only. */
const BULLET_TRAIL_RATE: readonly number[] = [0, 45, 60, 0];
const BULLET_TRAIL_LIFE: readonly number[] = [0, 0.1, 0.16, 0];

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
}
