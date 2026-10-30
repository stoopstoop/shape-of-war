// Boss types shared by the core, the kit and the boss files (docs/12 wave V3-A, docs/13 SPEC 3.4).
// Numbers are render contract values: BossView.mode, Kind.BossHazard w.a and Kind.BossPart w.a.
import type { World } from '../world';
import type { BossState } from './state';

/** BossView.mode (render contract). */
export const enum BossMode {
  Entering = 0,
  Guarded = 1,
  Attacking = 2,
  Vulnerable = 3,
  Stunned = 4,
  PhaseChange = 5,
  Dying = 6,
}

/** Kind.BossHazard w.a: the hazard primitive. */
export const enum HazardType {
  Lane = 0,
  Ring = 1,
  Sweep = 2,
  Tether = 3,
  Pull = 4,
}

/** Kind.BossPart w.a: the part type. */
export const enum PartType {
  Pod = 0,
  Anchor = 1,
  Turret = 2,
  /** Twins: the second body, a full size boss body of radius w.radius. */
  Twin = 3,
}

/** Where a boss is in its life on this level or Endless segment. */
export type BossStatus = 'waiting' | 'alive' | 'defeated';

/**
 * One boss behaviour. The core owns entrance, damage, phases, enrage, stagger, death and the
 * schedule. A def owns movement, attacks and the counter window (BossState.open).
 */
export interface BossDef {
  /**
   * Start the attack cycle at its first state. first is true when the entrance ends and false
   * when the ship respawns (boss rule 6: the cycle restarts, the boss keeps its hit points).
   */
  reset(w: World, id: number, bs: BossState, first: boolean): void;
  /**
   * Movement and attacks for one step. dt is sim time (movement, windows). adt is attack time,
   * dt times 1.3 while enraged (boss rule 10).
   */
  step(w: World, id: number, bs: BossState, dt: number, adt: number): void;
  /** The boss crossed into phase (2 based) of its phases. */
  onPhase(w: World, id: number, bs: BossState, phase: number): void;
  /** Distance from the arena centre where the entrance slide ends, given the wall distance d. */
  entryHome(d: number): number;
  /**
   * Optional: true when a hit landing at (hx, hy) gets through while the window is open (Mirage's
   * shield arc). Absent means every hit in the window counts. Detonate skips it.
   */
  gate?(w: World, id: number, bs: BossState, hx: number, hy: number): boolean;
  /**
   * Optional: the 1 based phase the boss belongs in now (Bastion: from its turrets, Twins: from its
   * bodies). Absent means from hit points (phaseFor). The core never lowers the phase.
   */
  phaseOf?(w: World, id: number, bs: BossState, hp: number): number;
  /** Optional: the part of a hit of amount tenths on the core body that lands (Twins: the front body's own hit points). */
  clampDamage?(w: World, id: number, bs: BossState, amount: number): number;
  /**
   * Optional: tenths of a hit of amount that get through a closed core (Prism's shield leak). Absent
   * means a closed core blocks every hit. Called only for a hit the window would block.
   */
  leak?(w: World, id: number, bs: BossState, amount: number): number;
  /** Optional: the core body took damage and lived (Twins: the front body falls). */
  afterDamage?(w: World, id: number, bs: BossState): void;
  /** Optional: part took applied tenths (at most its hit points); broke is true once it was removed. */
  onPartDamage?(w: World, bs: BossState, part: number, applied: number, broke: boolean): void;
}
