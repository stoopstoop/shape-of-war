// Objective evaluation for the HUD and the results screen (docs/01 section 8). Pure.
// Swarm owns objective tracking in the sim and emits game:over; main.ts uses objectiveStatus as
// a fallback end check and goalMet to decide success, since game:over carries no success flag.
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

export interface ObjectiveProgress {
  label: string;
  /** 0 to 1, bar fill. */
  fraction: number;
}

function frac(a: number, b: number): number {
  return b > 0 ? Math.max(0, Math.min(1, a / b)) : 1;
}

/** Pure: HUD label and bar fill. */
export function objectiveProgress(obj: ObjectiveDef, s: ObjectiveSnapshot): ObjectiveProgress {
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
