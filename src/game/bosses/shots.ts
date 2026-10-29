// Boss shots (docs/13 "Boss projectiles", docs/12 "Design: boss projectiles"). The volley helper
// the three shooters share: Spindle's pellet and Ember's fan now, Bastion's turret shot in wave C.
// A volley fires only while the ship is at least ENEMY_BULLET_MIN_RANGE from the muzzle (the
// caller waits SHOT_RECHECK_SEC and rechecks otherwise). Its heading is fixed now, at the charge
// start, toward targetOf with no lead; every bullet charges for hazardTelegraph(tier) at the
// muzzle (the pool holds the charge), and fx:bossShot fires once per volley at launch. Speeds are
// clamped to ENEMY_BULLET_SPEED_MAX, so phase speed ups and enrage never pass it. No allocation,
// no PRNG.
import { bus } from '../../core/events';
import { isInside } from '../arena';
import {
  clampEnemyBulletSpeed,
  ENEMY_BULLET_MIN_RANGE,
  ENEMY_BULLET_RADIUS,
  enemyBulletsOf,
  spawnEnemyBullet,
} from '../enemyBullets';
import { angleBetween, targetOf } from '../steer';
import type { World } from '../world';
import { hazardTelegraph, pointDist } from './kit';
import type { BossState } from './state';
import { SHOT_VOLLEY_MAX, type ShotRow } from './table';

const DEG = Math.PI / 180;

/** Pure: bullets in a volley of a row, 1 to SHOT_VOLLEY_MAX. */
export function volleyCount(row: ShotRow): number {
  const n = Math.round(row.count ?? 1);
  if (!(n >= 1)) return 1;
  return n > SHOT_VOLLEY_MAX ? SHOT_VOLLEY_MAX : n;
}

/** Pure: heading of bullet k of n in a fan spread spreadRad apart, centred on heading. */
export function fanHeading(heading: number, k: number, n: number, spreadRad: number): number {
  return heading + (k - (n - 1) / 2) * spreadRad;
}

/** Pure: a row's bullet speed with a phase speed factor, never past the cap. */
export function shotSpeed(row: ShotRow, speedMul: number): number {
  return clampEnemyBulletSpeed(row.speed * (speedMul > 0 ? speedMul : 1));
}

/** Pure: true when the ship at distance d from the muzzle is far enough for a shot. */
export function inShotRange(d: number): boolean {
  return d >= ENEMY_BULLET_MIN_RANGE;
}

/**
 * Fire one volley of row from boss id: muzzle at the body edge toward the target (the centre if the
 * edge is outside the floor). Returns false, firing nothing, while the ship is within range of the
 * muzzle (the caller waits SHOT_RECHECK_SEC and rechecks). True once fired, even if a full pool
 * dropped every bullet (counted by the pool).
 */
export function fireVolley(w: World, id: number, bs: BossState, row: ShotRow, speedMul: number): boolean {
  const heading = angleBetween(w, id, targetOf(w, id)); // fixed at the charge start, no lead
  const r = w.radius[id] ?? 0;
  const bx = w.x[id] ?? 0;
  const by = w.y[id] ?? 0;
  let mx = bx + Math.cos(heading) * r;
  let my = by + Math.sin(heading) * r;
  if (!isInside(w.level.arena, mx, my, ENEMY_BULLET_RADIUS)) {
    mx = bx;
    my = by;
  }
  // The range test always uses the ship, even when the aim is the decoy.
  if (w.ship.active && !inShotRange(pointDist(mx, my, w.x[0] ?? 0, w.y[0] ?? 0))) return false;
  const tier = bs.row.tier;
  const tele = hazardTelegraph(tier);
  const speed = shotSpeed(row, speedMul);
  const n = volleyCount(row);
  const spread = (row.spreadDeg ?? 0) * DEG;
  let firstId = -1;
  for (let k = 0; k < n; k++) {
    const b = spawnEnemyBullet(w, mx, my, fanHeading(heading, k, n, spread), speed, ENEMY_BULLET_RADIUS, tier, tele);
    if (firstId < 0) firstId = b;
  }
  if (firstId >= 0) {
    bs.shotId = firstId;
    bs.shotEv.x = mx;
    bs.shotEv.y = my;
  }
  return true;
}

/**
 * fx:bossShot once per volley at launch. Call every step while the boss lives, after
 * stepEnemyBullets: the volley launched when its first bullet's charge ran out (or it ended on the
 * launch step). Bomb and ship death cancel the pending volley first (cancelVolley).
 */
export function stepVolleyLaunch(w: World, bs: BossState): void {
  const id = bs.shotId;
  if (id < 0) return;
  const p = enemyBulletsOf(w);
  if (p.alive[id] === 1 && (p.arm[id] ?? 0) > 0) return;
  bs.shotId = -1;
  bus.emit('fx:bossShot', bs.shotEv);
}

/** Forget the charging volley: its bullets were cleared (bomb, ship death), so it never launches. */
export function cancelVolley(bs: BossState): void {
  bs.shotId = -1;
  bs.shotWait = 0;
}
