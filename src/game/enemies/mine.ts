// Mine (docs/10 wave C): a hazard dropped by a Sower, never in a roster. Static. Harmless for
// ARM_SEC after the drop (combat.ts shipHits skips it), then kills the ship on contact. 1 HP and
// shot-able at any age, removed after LIFE_SEC. No score, no geoms, not a kill, not pulled by wells.
// State: w.t seconds since the drop (render contract), w.a the owning Sower id (-1 once orphaned).
import { removeEntity } from '../remove';
import { spawnFromDef } from '../state';
import { Kind, type World } from '../world';
import type { EnemyDef } from './types';

export const def: EnemyDef = { kind: Kind.Mine, radius: 9, speed: 0, value: 0, colour: 'sower', hp: 1, geoms: 0 };

export const ARM_SEC = Math.fround(0.8);
export const LIFE_SEC = 12;
export const CAP_PER_SOWER = 6;
export const CAP_TOTAL = 24;

export function isArmed(w: World, id: number): boolean {
  return (w.t[id] ?? 0) >= ARM_SEC;
}

/** Live Mines in total and owned by `owner`, written into out. */
export function countMines(w: World, owner: number, out: { total: number; owned: number }): void {
  let total = 0;
  let owned = 0;
  for (let i = 1; i < w.cap; i++) {
    if (w.alive[i] !== 1 || w.kind[i] !== Kind.Mine) continue;
    total++;
    if (w.a[i] === owner) owned++;
  }
  out.total = total;
  out.owned = owned;
}

const counts = { total: 0, owned: 0 };

/** Drop a Mine for owner at (x, y). Returns the id, or -1 at a cap or when the world is full. */
export function dropMine(w: World, owner: number, x: number, y: number): number {
  countMines(w, owner, counts);
  if (counts.total >= CAP_TOTAL || counts.owned >= CAP_PER_SOWER) return -1;
  const id = spawnFromDef(w, def, x, y, 0);
  if (id < 0) return -1;
  w.a[id] = owner;
  return id;
}

export function step(w: World, id: number, dt: number): void {
  const t = (w.t[id] ?? 0) + dt;
  if (t >= LIFE_SEC) {
    removeEntity(w, id);
    return;
  }
  w.t[id] = t;
}
