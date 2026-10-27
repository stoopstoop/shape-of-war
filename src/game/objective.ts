// Objective tracking (docs/01 section 8) and the single 'game:over' emit (docs/03 section 9).
// Timers read the wave clock, which pauses during the respawn delay.
import { bus } from '../core/events';
import type { ObjectiveDef } from '../levelgen/leveldef';
import { gs, type GameMode, type Outcome } from './state';
import type { World } from './world';

export interface ObjectiveInput {
  objective: ObjectiveDef;
  mode: GameMode;
  score: number;
  kills: number;
  lives: number;
  clock: number;
}

/** Pure: outcome for the given counters. */
export function evaluateObjective(s: ObjectiveInput): Outcome {
  if (s.mode === 'endless') return s.lives <= 0 ? 'lost' : 'running';
  const o = s.objective;
  switch (o.kind) {
    case 'scoreInTime':
      if (s.score >= o.target) return 'won';
      if (s.lives <= 0 || s.clock >= o.timeLimitSec) return 'lost';
      return 'running';
    case 'survive':
      if (s.lives <= 0) return 'lost';
      return s.clock >= o.durationSec ? 'won' : 'running';
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

/** Update the outcome; emits 'game:over' exactly once when the level ends. Stars are 0 on failure. */
export function stepObjective(w: World): Outcome {
  const g = gs(w);
  if (g.outcome === 'running') {
    g.outcome = evaluateObjective({
      objective: w.level.objective,
      mode: g.mode,
      score: g.score,
      kills: g.kills,
      lives: g.lives,
      clock: g.waveClock,
    });
  }
  if (g.outcome !== 'running' && !g.overEmitted) {
    g.overEmitted = true;
    const won = g.outcome === 'won' || g.mode === 'endless';
    bus.emit('game:over', {
      score: g.score,
      stars: won ? starsFor(g.score, w.level.stars) : 0,
      levelIndex: w.level.levelIndex,
      mode: g.mode,
    });
  }
  return g.outcome;
}
