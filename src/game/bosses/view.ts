// V3 contract stub (docs/12-v3-plan.md V3-W0, docs/13 "Render contract for the boss"). The only
// way render and HUD code read a boss. Swarm fills readBoss in wave A, Glow imports the type from
// wave A on. The stub reports no boss, so nothing draws and nothing changes.
import type { World } from '../world';

/** One boss as render and HUD see it. No allocation: callers pass one reused object as out. */
export interface BossView {
  /** False when no boss is alive. Every other field is then meaningless. */
  active: boolean;
  /** Index in BOSS_IDS. */
  id: number;
  /** 0 entering, 1 guarded, 2 attacking, 3 vulnerable, 4 stunned, 5 phase change, 6 dying. */
  mode: number;
  phase: number;
  /** Current hit points. */
  hp: number;
  /** Maximum hit points. */
  maxHp: number;
  /** Seconds spent in the current mode. */
  modeT: number;
  x: number;
  y: number;
  /** Facing in radians. */
  rot: number;
  radius: number;
}

/** Fill out from the boss of the world and return it. Stub: returns out with active false. */
export function readBoss(w: World, out: BossView): BossView {
  out.active = false;
  return out;
}
