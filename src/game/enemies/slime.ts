// Slime (docs/10 wave C, docs/11 SPEC 3.4 rule 7): a static puddle dropped by a Splime. A hazard,
// not an enemy: not hostile (state.ts isHostile), so player bullets, drone shots, orbit blades,
// drones, homing, Detonate and ship contact all skip it, and wells do not pull it. A bomb removes
// it (player.ts). No score, no geoms, never a kill. While the ship overlaps it, each step sets
// ship.slowUntil = w.time + SLOW_SEC and ship.slowFactor = SLOW_FACTOR: set, never multiplied, so
// overlapping puddles never stack. stepShip (Forge) reads the fields.
// State: w.t seconds since the drop in [0, LIFE_SEC) (render contract), w.radius RADIUS,
// w.a the owning Splime id (-1 once orphaned).
import { removeEntity } from '../remove';
import { SHIP_RADIUS } from '../ship';
import { spawnFromDef } from '../state';
import { Kind, type World } from '../world';
import type { EnemyDef } from './types';

export const def: EnemyDef = { kind: Kind.Slime, radius: 40, speed: 0, value: 0, colour: 'slime', hp: 0, geoms: 0 };

export const RADIUS = 40;
export const LIFE_SEC = 8;
export const SLOW_SEC = 2;
export const SLOW_FACTOR = 0.8;
export const CAP_PER_SPLIME = 3;
export const CAP_TOTAL = 12;

/** Live Slime in total and owned by `owner`, written into out. */
export function countSlime(w: World, owner: number, out: { total: number; owned: number }): void {
  let total = 0;
  let owned = 0;
  for (let i = 1; i < w.cap; i++) {
    if (w.alive[i] !== 1 || w.kind[i] !== Kind.Slime) continue;
    total++;
    if (w.a[i] === owner) owned++;
  }
  out.total = total;
  out.owned = owned;
}

const counts = { total: 0, owned: 0 };

/** Drop a Slime for owner at (x, y). Returns the id, or -1 at a cap or when the world is full. */
export function dropSlime(w: World, owner: number, x: number, y: number): number {
  countSlime(w, owner, counts);
  if (counts.total >= CAP_TOTAL || counts.owned >= CAP_PER_SPLIME) return -1;
  const id = spawnFromDef(w, def, x, y, 0);
  if (id < 0) return -1;
  w.a[id] = owner;
  return id;
}

/** True when the live ship overlaps the puddle at id. */
export function overlapsShip(w: World, id: number): boolean {
  if (!w.ship.active) return false;
  const dx = (w.x[0] ?? 0) - (w.x[id] ?? 0);
  const dy = (w.y[0] ?? 0) - (w.y[id] ?? 0);
  const rr = (w.radius[id] ?? RADIUS) + SHIP_RADIUS;
  return dx * dx + dy * dy < rr * rr;
}

/** Slow the ship: refresh the timer, set (never multiply) the factor. */
export function slowShip(w: World): void {
  w.ship.slowUntil = w.time + SLOW_SEC;
  w.ship.slowFactor = SLOW_FACTOR;
}

export function step(w: World, id: number, dt: number): void {
  const t = (w.t[id] ?? 0) + dt;
  if (t >= LIFE_SEC) {
    removeEntity(w, id);
    return;
  }
  w.t[id] = t;
  if (overlapsShip(w, id)) slowShip(w);
}
