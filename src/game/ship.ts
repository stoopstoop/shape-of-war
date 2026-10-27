// Player ship (docs/01 section 4.1, SPEC 3.5). Always entity id 0. Death, lives and the
// respawn delay belong to Swarm (W2); this module moves, aims, fires and runs the
// invulnerability timer.
import type { InputState } from '../input/types';
import { bus } from '../core/events';
import { confine, createConfineResult } from './arena';
import { fireSpread } from './bullets';
import type { World } from './world';

export const SHIP_ID = 0;
export const SHIP_RADIUS = 10;
export const SHIP_SPEED = 420;
export const FIRE_RATE = 12; // volleys per second
export const INVULN_SEC = 2.0;

export interface ShipState {
  /** False while dead (respawn delay). stepShip does nothing then. */
  active: boolean;
  /** Seconds of invulnerability left. Render blinks at 10 Hz while above 0. */
  invuln: number;
  /** Seconds until the next volley may fire. */
  fireCooldown: number;
  /** 1 normally, 2 during Turbo (Swarm sets it). */
  fireRateScale: number;
  /** Last aim angle in radians. */
  aimAngle: number;
  /** True on steps where the aim stick is held past its dead zone. */
  firing: boolean;
}

export function createShipState(): ShipState {
  return { active: true, invuln: INVULN_SEC, fireCooldown: 0, fireRateScale: 1, aimAngle: -Math.PI / 2, firing: false };
}

/** Place the ship at the arena centre with fresh invulnerability (spawn and respawn). */
export function respawnShip(w: World): void {
  w.x[SHIP_ID] = 0;
  w.y[SHIP_ID] = 0;
  w.prevX[SHIP_ID] = 0;
  w.prevY[SHIP_ID] = 0;
  w.vx[SHIP_ID] = 0;
  w.vy[SHIP_ID] = 0;
  w.ship.active = true;
  w.ship.invuln = INVULN_SEC;
  w.ship.fireCooldown = 0;
  w.alive[SHIP_ID] = 1;
}

/** Remove the ship from play without freeing id 0 (Swarm calls this on death). */
export function deactivateShip(w: World): void {
  w.ship.active = false;
  w.ship.firing = false;
  w.vx[SHIP_ID] = 0;
  w.vy[SHIP_ID] = 0;
  w.alive[SHIP_ID] = 0;
}

const wall = createConfineResult();

export function stepShip(w: World, dt: number, input: InputState): void {
  const s = w.ship;
  if (!s.active) return;
  if (s.invuln > 0) s.invuln = Math.max(0, s.invuln - dt);

  // Velocity is set directly from the stick (instant acceleration). Stick magnitude capped at 1.
  let mx = input.move.active ? input.move.x : 0;
  let my = input.move.active ? input.move.y : 0;
  const m2 = mx * mx + my * my;
  if (m2 > 1) {
    const k = 1 / Math.sqrt(m2);
    mx *= k;
    my *= k;
  }
  let vx = mx * SHIP_SPEED;
  let vy = my * SHIP_SPEED;
  const res = confine(w.level.arena, (w.x[SHIP_ID] ?? 0) + vx * dt, (w.y[SHIP_ID] ?? 0) + vy * dt, SHIP_RADIUS, wall);
  if (res.hit) {
    // Slide: drop the velocity component pointing into the wall.
    const into = vx * res.nx + vy * res.ny;
    if (into < 0) {
      vx -= into * res.nx;
      vy -= into * res.ny;
    }
  }
  w.x[SHIP_ID] = res.x;
  w.y[SHIP_ID] = res.y;
  w.vx[SHIP_ID] = vx;
  w.vy[SHIP_ID] = vy;

  const aiming = input.aim.active && (input.aim.x !== 0 || input.aim.y !== 0);
  s.firing = aiming;
  if (aiming) {
    s.aimAngle = Math.atan2(input.aim.y, input.aim.x);
    w.rot[SHIP_ID] = s.aimAngle;
  } else if (mx !== 0 || my !== 0) {
    w.rot[SHIP_ID] = Math.atan2(my, mx);
  }

  const period = 1 / (FIRE_RATE * (s.fireRateScale > 0 ? s.fireRateScale : 1));
  if (aiming) {
    // Fire first, then age the cooldown, so a fresh press shoots on this step and the rate is exact.
    let volleys = 0;
    while (s.fireCooldown <= 1e-9 && volleys < 4) {
      fireSpread(w, res.x, res.y, s.aimAngle);
      s.fireCooldown += period;
      volleys++;
    }
    s.fireCooldown -= dt;
    if (volleys > 0) bus.emit('sfx', 'shot');
  } else if (s.fireCooldown > 0) {
    s.fireCooldown = Math.max(0, s.fireCooldown - dt);
  }
}
