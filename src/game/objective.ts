// Objective tracking (docs/01 section 8) and the single 'game:over' emit (docs/03 section 9).
// Timers read the wave clock, which pauses during the respawn delay.
import { bus } from '../core/events';
import type { ObjectiveDef } from '../levelgen/leveldef';
import { bossPending, bossSlain, setBossHold } from './bosses/core';
import { gs, type GameMode, type Outcome } from './state';
import type { World } from './world';

export interface ObjectiveInput {
  objective: ObjectiveDef;
  mode: GameMode;
  score: number;
  kills: number;
  lives: number;
  clock: number;
  /**
   * V3 boss rule 9: true while the level's boss is scheduled or alive. The boss is the objective
   * (DECISIONS, option 1): the level runs until the boss dies or the last life is lost, and the
   * regular objective counts for score only. A success meanwhile holds the level (waves stop, the
   * boss enrages). Absent or false with bossDown absent or false: the v2 rules, unchanged.
   */
  bossPending?: boolean;
  /** True once the level's boss died through the boss rules: an Adventure level is won at once. */
  bossDown?: boolean;
}

/** Pure: the objective's success test alone (no lives, no boss). Endless never succeeds. */
export function objectiveMet(s: ObjectiveInput): boolean {
  if (s.mode === 'endless') return false;
  const o = s.objective;
  switch (o.kind) {
    case 'scoreInTime':
      return s.clock >= o.timeLimitSec && s.score >= o.target;
    case 'survive':
      return s.clock >= o.durationSec;
    case 'destroy':
      return s.kills >= o.count;
  }
}

/** Pure: outcome for the given counters. */
export function evaluateObjective(s: ObjectiveInput): Outcome {
  if (s.mode === 'endless') return s.lives <= 0 ? 'lost' : 'running';
  // Boss levels (DECISIONS, option 1): the boss kill wins at once, like a destroy objective's last
  // kill it takes precedence over a death on the same step. Until then only losing every life ends
  // the level; the regular objective neither wins nor fails it.
  if (s.bossDown === true) return 'won';
  if (s.bossPending === true) return s.lives <= 0 ? 'lost' : 'running';
  const o = s.objective;
  switch (o.kind) {
    case 'scoreInTime':
      // Runs the full timer so the final score can climb past par and earn stars.
      // Reaching target early does not end the level; the verdict comes at the time limit.
      if (s.lives <= 0) return 'lost';
      if (s.clock < o.timeLimitSec) return 'running';
      return s.score < o.target ? 'lost' : 'won';
    case 'survive':
      if (s.lives <= 0) return 'lost';
      return s.clock < o.durationSec ? 'running' : 'won';
    case 'destroy':
      if (s.kills >= o.count) return 'won';
      return s.lives <= 0 ? 'lost' : 'running';
  }
}

/** Stars at par, 2 x par, 4 x par from LevelDef.stars. Local until Ledger's scoring.stars is wired. */
export function starsFor(score: number, thresholds: readonly [number, number, number]): 0 | 1 | 2 | 3 {
  if (score >= thresholds[2]) return 3;
  if (score >= thresholds[1]) return 2;
  if (score >= thresholds[0]) return 1;
  return 0;
}

const scratch: ObjectiveInput = {
  objective: { kind: 'survive', durationSec: 0 },
  mode: 'adventure',
  score: 0,
  kills: 0,
  lives: 0,
  clock: 0,
  bossPending: false,
  bossDown: false,
};

/** Update the outcome; emits 'game:over' exactly once when the level ends. Stars are 0 on failure and in Endless. */
export function stepObjective(w: World): Outcome {
  const g = gs(w);
  if (g.outcome === 'running') {
    scratch.objective = w.level.objective;
    scratch.mode = g.mode;
    scratch.score = g.score;
    scratch.kills = g.kills;
    scratch.lives = g.lives;
    scratch.clock = g.waveClock;
    scratch.bossPending = bossPending(w);
    scratch.bossDown = bossSlain(w);
    g.outcome = evaluateObjective(scratch);
    // Boss rule 9: a success while the boss is pending holds the level (waves stop, it enrages).
    if (scratch.bossPending && g.outcome === 'running' && objectiveMet(scratch)) setBossHold(w);
  }
  if (g.outcome !== 'running' && !g.overEmitted) {
    g.overEmitted = true;
    // Endless has no par, so no stars.
    const won = g.outcome === 'won' && g.mode !== 'endless';
    bus.emit('game:over', {
      score: g.score,
      stars: won ? starsFor(g.score, w.level.stars) : 0,
      levelIndex: w.level.levelIndex,
      mode: g.mode,
    });
  }
  return g.outcome;
}
