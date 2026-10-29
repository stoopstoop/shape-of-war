// Objective evaluation for the HUD and the results screen (docs/01 section 8). Pure.
// Swarm owns objective tracking in the sim and emits game:over; main.ts uses objectiveStatus as
// a fallback end check and goalMet to decide success, since game:over carries no success flag.
// V3-A: on a boss level the sim holds the level until the boss dies (docs/13 boss rule 9), so the
// fallback check skips success there (fallbackStatus), the sim's verdict decides the win
// (levelSuccess) and the label reads "Defeat the boss" while the hold lasts (objectiveProgress).
import type { ObjectiveDef } from '../levelgen/leveldef';
import { formatClock, formatInt } from './format';

export interface ObjectiveSnapshot {
  elapsedSec: number;
  score: number;
  kills: number;
  /** Lives left, or null if the sim does not expose lives yet. */
  lives: number | null;
}

export type ObjectiveStatus = 'running' | 'success' | 'failure';

/** Pure: the objective target is reached (ignores lives). */
export function goalMet(obj: ObjectiveDef, s: ObjectiveSnapshot): boolean {
  switch (obj.kind) {
    case 'scoreInTime':
      return s.score >= obj.target;
    case 'survive':
      return s.elapsedSec >= obj.durationSec;
    case 'destroy':
      return s.kills >= obj.count;
  }
}

/** Pure: level state for a snapshot. Success wins a tie with a timeout on the same step. */
export function objectiveStatus(obj: ObjectiveDef, s: ObjectiveSnapshot): ObjectiveStatus {
  const out = s.lives !== null && s.lives <= 0;
  if (obj.kind === 'survive') {
    if (out) return 'failure';
    return goalMet(obj, s) ? 'success' : 'running';
  }
  if (obj.kind === 'scoreInTime') {
    // Glue (docs/01 section 8): the level runs its full timer; target is the win line at the end.
    if (out) return 'failure';
    if (s.elapsedSec < obj.timeLimitSec) return 'running';
    return goalMet(obj, s) ? 'success' : 'failure';
  }
  if (goalMet(obj, s)) return 'success';
  if (out) return 'failure';
  return 'running';
}

/** What the objective label reads while the level holds for a living boss (docs/13 boss rule 9, section 8). */
export const HOLD_LABEL = 'Defeat the boss';

/**
 * Pure: the objective's success test passes while a boss lives, so the sim holds the level until
 * the boss dies (docs/13 boss rule 9). The test is objectiveStatus, so it carries the same lives
 * rule: no hold once the lives are gone, that is a loss.
 */
export function bossHolds(obj: ObjectiveDef, s: ObjectiveSnapshot, bossAlive: boolean): boolean {
  return bossAlive && objectiveStatus(obj, s) === 'success';
}

/**
 * Pure: the level state main.ts may act on as a fallback end check. On a boss level only the sim
 * says when the objective is won (it holds for the boss and completes on the boss's death), so a
 * success from the snapshot is read as still running there; a failure still ends the level.
 */
export function fallbackStatus(obj: ObjectiveDef, s: ObjectiveSnapshot, bossLevel: boolean): ObjectiveStatus {
  const status = objectiveStatus(obj, s);
  return bossLevel && status === 'success' ? 'running' : status;
}

/** The sim's verdict (GameState.outcome), copied here so this module stays free of src/game. */
export type SimOutcome = 'running' | 'won' | 'lost';

/**
 * Pure: did the player win, for the results screen. game:over carries no success flag. A normal
 * level infers it from the objective target (goalMet, unchanged since v1). On a boss level the
 * target can be met and the level then lost while holding for the boss, so the sim's own verdict
 * decides there.
 */
export function levelSuccess(obj: ObjectiveDef, s: ObjectiveSnapshot, outcome: SimOutcome, bossLevel: boolean): boolean {
  return bossLevel ? outcome === 'won' : goalMet(obj, s);
}

export interface ObjectiveProgress {
  label: string;
  /** 0 to 1, bar fill. */
  fraction: number;
}

function frac(a: number, b: number): number {
  return b > 0 ? Math.max(0, Math.min(1, a / b)) : 1;
}

/**
 * Pure: HUD label and bar fill. While the level holds for a living boss (`bossAlive` and the
 * success test passing) the label reads "Defeat the boss" and the bar is full.
 */
export function objectiveProgress(obj: ObjectiveDef, s: ObjectiveSnapshot, bossAlive = false): ObjectiveProgress {
  if (bossHolds(obj, s, bossAlive)) return { label: HOLD_LABEL, fraction: 1 };
  switch (obj.kind) {
    case 'scoreInTime':
      return {
        label: s.score >= obj.target
          ? `Target met  ${formatClock(obj.timeLimitSec - s.elapsedSec)}`
          : `${formatInt(s.score)} / ${formatInt(obj.target)}  ${formatClock(obj.timeLimitSec - s.elapsedSec)}`,
        fraction: s.score >= obj.target ? frac(s.elapsedSec, obj.timeLimitSec) : frac(s.score, obj.target),
      };
    case 'survive':
      return { label: `Survive ${formatClock(obj.durationSec - s.elapsedSec)}`, fraction: frac(s.elapsedSec, obj.durationSec) };
    case 'destroy':
      return { label: `Destroy ${Math.min(s.kills, obj.count)} / ${obj.count}`, fraction: frac(s.kills, obj.count) };
  }
}

/** Pure: one line description for menus and results. */
export function objectiveText(obj: ObjectiveDef): string {
  switch (obj.kind) {
    case 'scoreInTime':
      return `Score ${formatInt(obj.target)} in ${formatClock(obj.timeLimitSec)}`;
    case 'survive':
      return `Survive ${formatClock(obj.durationSec)}`;
    case 'destroy':
      return `Destroy ${obj.count} enemies`;
  }
}
