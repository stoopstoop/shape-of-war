// Speed tuning (W3). Enemy linear speeds scale down on small arenas so reaction distance stays
// fair when the arena is height bound and drawn small on the 21:9 cover screen. Pure, reads the
// LevelDef arena only, so a level plays the same on both screens and every device.
import type { ArenaDef } from '../levelgen/leveldef';

/** Shorter arena span (u) at and above which enemies move at full catalogue speed. */
export const ARENA_REF_SPAN = 900;
/** Slowest factor, reached at the smallest generated arenas (700 u high). */
export const ARENA_MIN_FACTOR = 0.88;

/**
 * Enemy speed factor for an arena: sqrt(shorter span / 900), clamped to [0.88, 1]. The square
 * root keeps the change gentle: a 700 u arena gives 0.88, 800 u gives 0.94, 900 u and up 1.
 */
export function arenaSpeedFactor(arena: Pick<ArenaDef, 'width' | 'height'>): number {
  const span = Math.min(arena.width, arena.height);
  if (!(span > 0)) return 1;
  const f = Math.sqrt(span / ARENA_REF_SPAN);
  if (f >= 1) return 1;
  return f < ARENA_MIN_FACTOR ? ARENA_MIN_FACTOR : f;
}
