// Render contract for the boss (docs/12-v3-plan.md V3-W0, docs/13 "Render contract for the boss").
// The only way render and HUD code read a boss. With no boss alive it reports active false, so
// nothing draws. Reads only: never changes the simulation.
import { BOSS_IDS } from '../../levelgen/leveldef';
import { Kind, type World } from '../world';
import { bossOf } from './state';

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
  /**
   * G3A addition: true while the core takes damage (the counter window, never a bomb stagger).
   * Optional so existing literals compile; readBoss always writes it. Glow: colour change and
   * blink; Chorus: the alert on 'sim:bossExposed'.
   */
  exposed?: boolean;
  /** Seconds left in a timed exposed window, -1 for an open ended one (Spindle) or while closed. */
  exposedLeft?: number;
  /** Seconds spent in the current exposed state (blink phase). */
  exposedT?: number;
}

/** Fill out from the boss of the world and return it. No allocation: out is the caller's object. */
export function readBoss(w: World, out: BossView): BossView {
  const bs = bossOf(w);
  const id = bs === null ? -1 : bs.id;
  if (bs === null || bs.status !== 'alive' || id <= 0 || w.alive[id] !== 1 || w.kind[id] !== Kind.Boss) {
    out.active = false;
    return out;
  }
  out.active = true;
  out.id = BOSS_IDS.indexOf(bs.spec.id);
  out.mode = bs.viewMode;
  out.phase = bs.phase;
  out.hp = w.hp[id] ?? 0;
  out.maxHp = bs.maxHp;
  out.modeT = bs.modeT;
  out.x = w.x[id] ?? 0;
  out.y = w.y[id] ?? 0;
  out.rot = w.rot[id] ?? 0;
  out.radius = w.radius[id] ?? 0;
  out.exposed = bs.exposed;
  out.exposedLeft = bs.exposed ? bs.openLeft : -1;
  out.exposedT = bs.exposedT;
  return out;
}

/** A fresh BossView for a caller to keep and reuse (allocates once; call at setup, not per frame). */
export function createBossView(): BossView {
  return { active: false, id: 0, mode: 0, phase: 1, hp: 0, maxHp: 0, modeT: 0, x: 0, y: 0, rot: 0, radius: 0, exposed: false, exposedLeft: -1, exposedT: 0 };
}
