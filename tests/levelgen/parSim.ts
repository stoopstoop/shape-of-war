// Test only helper: a deterministic score simulator for a competent player (fix(par), G4).
// Walks expandSpawns over the objective window. The player kills KILL_RATE of the spawns (an
// accumulator, so no PRNG), each kill landing REACTION_SEC after its spawn and only inside the
// window. Each kill scores base x multiplier at the moment of the kill (docs/01 section 5), then
// SIM_COLLECT_RATE of its ENEMY_GEOMS are collected (accumulated, whole geoms only), multiplier +1
// per geom, capped at 999. The player never dies. Hazard score is excluded, as in par.
import { ENEMY_BASE, ENEMY_GEOMS, expandSpawns } from '../../src/levelgen/leveldef';
import type { LevelDef } from '../../src/levelgen/leveldef';
import { KILL_RATE, MAX_EST_SEC } from '../../src/levelgen/validate';

export const SIM_COLLECT_RATE = 0.7;
export const REACTION_SEC = 1.5;
export const SIM_MULTIPLIER_CAP = 999;

export interface SimResult {
  score: number;
  kills: number;
  geoms: number;
  multiplier: number;
  /** Seconds of play the window covered. */
  windowSec: number;
}

/** Objective window in seconds; destroy runs until the count is met or MAX_EST_SEC. */
export function simWindowSec(def: Pick<LevelDef, 'objective'>): number {
  const o = def.objective;
  if (o.kind === 'survive') return o.durationSec;
  if (o.kind === 'scoreInTime') return o.timeLimitSec;
  return MAX_EST_SEC;
}

/**
 * Simulated competent score. `stopAtTarget` ends a scoreInTime level when the target is reached,
 * as the game does (docs/01 section 8); default false, so the score is the uncapped potential.
 */
export function simulateScore(def: Pick<LevelDef, 'objective' | 'waves'>, stopAtTarget = false): SimResult {
  const T = simWindowSec(def);
  const o = def.objective;
  const killTimes = expandSpawns(def.waves, T)
    .map((s) => ({ t: s.t + REACTION_SEC, kind: s.kind }))
    .filter((k) => k.t < T)
    .sort((a, b) => a.t - b.t);
  let score = 0;
  let kills = 0;
  let geoms = 0;
  let multiplier = 1;
  let killAcc = 0;
  let geomAcc = 0;
  let lastT = 0;
  for (const k of killTimes) {
    killAcc += KILL_RATE;
    if (killAcc < 1 - 1e-9) continue;
    killAcc -= 1;
    score += ENEMY_BASE[k.kind] * multiplier;
    kills++;
    lastT = k.t;
    geomAcc += SIM_COLLECT_RATE * ENEMY_GEOMS[k.kind];
    const got = Math.floor(geomAcc + 1e-9);
    geomAcc -= got;
    geoms += got;
    multiplier = Math.min(SIM_MULTIPLIER_CAP, multiplier + got);
    if (o.kind === 'destroy' && kills >= o.count) break;
    if (stopAtTarget && o.kind === 'scoreInTime' && score >= o.target) break;
  }
  return { score, kills, geoms, multiplier, windowSec: o.kind === 'destroy' ? lastT : T };
}
