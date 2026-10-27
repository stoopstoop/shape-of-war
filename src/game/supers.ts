// Supers (docs/01 section 4.5). W2 ships the signature only: charge is tracked in gs(w).superCharge
// by geom pickups; activation lands in W3.
import type { World } from './world';

/** Activate the level's super if charged. Returns true if it fired. No op this wave. */
export function triggerSuper(_w: World): boolean {
  return false;
}
