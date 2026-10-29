// Boss state per World, in a WeakMap keyed by the World as weapons.ts does. Created only when a
// level or an Endless segment carries a boss, so a boss free world never has one (the Off
// invariant). Arrays are allocated once per world; re-arming for a later Endless boss reuses them.
import type { BossId, BossSpec, BossTier } from '../../levelgen/leveldef';
import type { World } from '../world';
import { BOSS_TABLE, MAX_ADDS, MAX_PARTS, type BossRow } from './table';
import { BossMode, type BossDef, type BossStatus } from './types';

export interface BossState {
  spec: BossSpec;
  row: BossRow;
  def: BossDef;
  status: BossStatus;
  /** Wave clock second at which the entrance starts (Endless: absolute, segment start plus atSec). */
  atSec: number;
  /** Boss entity id while alive, -1 otherwise. */
  id: number;
  /** Maximum hit points in tenths of a hit. */
  maxHp: number;
  /** Mode the def reports (guarded, attacking or vulnerable). The core overrides it in view. */
  mode: BossMode;
  /** Last view mode and the seconds spent in it (BossView.mode, BossView.modeT). */
  viewMode: BossMode;
  modeT: number;
  /** 1 based phase. */
  phase: number;
  /** The def's counter window: true while the core takes damage. */
  open: boolean;
  /** Seconds since the entrance started (the slide runs for ENTRANCE_SEC). */
  enterT: number;
  /** Seconds since the entrance ended (enrage at 90). */
  age: number;
  /** Objective hold (boss rule 9): waves stop, the boss is enraged. */
  hold: boolean;
  /** Bomb stagger seconds left. */
  stagger: number;
  /** Phase change pause seconds left. */
  phaseT: number;
  /** Entrance slide endpoints. */
  entryX: number;
  entryY: number;
  homeX: number;
  homeY: number;

  // Behaviour scratch, owned by the def. reset() sets every field it reads.
  t0: number;
  t1: number;
  t2: number;
  t3: number;
  n0: number;
  n1: number;
  angle: number;
  dir: number;
  /** Fairness recheck countdown: a hazard that would overlap the ship waits 0.3 s. */
  retry: number;

  /** Part entity ids, -1 for an empty slot (validate against w.kind before use). */
  parts: Int32Array;
  /** Add entity ids and their kinds, -1 for an empty slot. */
  addIds: Int32Array;
  addKind: Uint8Array;

  // Per entity hazard extras, length w.cap, read only for Kind.BossHazard ids.
  /** Telegraph seconds of the hazard (its tier value). */
  hzTele: Float32Array;
  /** Ring growth (u/s, negative collapses) or sweep turn rate (rad/s). */
  hzRate: Float32Array;
  /** Seconds of life left, negative for no limit. */
  hzLife: Float32Array;
  /** 1 when the hazard origin follows the boss body. */
  hzFollow: Uint8Array;

  /** Wave thinning accumulator (boss rule 4). */
  budgetAcc: number;
  /** Bonus awarded on the kill, 0 before. */
  bonus: number;

  hudTimer: number;
  hudHp: number;
  hudPhase: number;
  hudMode: number;
  enterEv: { id: BossId; tier: BossTier };
  phaseEv: { id: BossId; phase: number; phases: number };
  downEv: { id: BossId; x: number; y: number };
  hudEv: { id: BossId; hp: number; maxHp: number; phase: number; phases: number; mode: number };
}

const states = new WeakMap<World, BossState>();

/** The boss state of a world, or null when no boss was ever armed (never creates one). */
export function bossOf(w: World): BossState | null {
  return states.get(w) ?? null;
}

function createState(w: World, spec: BossSpec, def: BossDef): BossState {
  const cap = w.cap;
  const row = BOSS_TABLE[spec.id];
  return {
    spec,
    row,
    def,
    status: 'waiting',
    atSec: 0,
    id: -1,
    maxHp: 1,
    mode: BossMode.Entering,
    viewMode: BossMode.Entering,
    modeT: 0,
    phase: 1,
    open: false,
    enterT: 0,
    age: 0,
    hold: false,
    stagger: 0,
    phaseT: 0,
    entryX: 0,
    entryY: 0,
    homeX: 0,
    homeY: 0,
    t0: 0,
    t1: 0,
    t2: 0,
    t3: 0,
    n0: -1,
    n1: 0,
    angle: 0,
    dir: 1,
    retry: 0,
    parts: new Int32Array(MAX_PARTS).fill(-1),
    addIds: new Int32Array(MAX_ADDS).fill(-1),
    addKind: new Uint8Array(MAX_ADDS),
    hzTele: new Float32Array(cap),
    hzRate: new Float32Array(cap),
    hzLife: new Float32Array(cap),
    hzFollow: new Uint8Array(cap),
    budgetAcc: 0,
    bonus: 0,
    hudTimer: 0,
    hudHp: -1,
    hudPhase: -1,
    hudMode: -1,
    enterEv: { id: spec.id, tier: row.tier },
    phaseEv: { id: spec.id, phase: 1, phases: row.phases },
    downEv: { id: spec.id, x: 0, y: 0 },
    hudEv: { id: spec.id, hp: 0, maxHp: 0, phase: 1, phases: row.phases, mode: 0 },
  };
}

/**
 * Arm the boss of this level or Endless segment: entrance at wave clock atSec. Creates the state on
 * first use and resets every field on a later arm (the next Endless boss).
 */
export function armState(w: World, spec: BossSpec, def: BossDef, atSec: number): BossState {
  let s = states.get(w);
  if (s === undefined) {
    s = createState(w, spec, def);
    states.set(w, s);
  }
  const row = BOSS_TABLE[spec.id];
  s.spec = spec;
  s.row = row;
  s.def = def;
  s.status = 'waiting';
  s.atSec = atSec;
  s.id = -1;
  s.maxHp = 1;
  s.mode = BossMode.Entering;
  s.viewMode = BossMode.Entering;
  s.modeT = 0;
  s.phase = 1;
  s.open = false;
  s.enterT = 0;
  s.age = 0;
  s.hold = false;
  s.stagger = 0;
  s.phaseT = 0;
  s.t0 = 0;
  s.t1 = 0;
  s.t2 = 0;
  s.t3 = 0;
  s.n0 = -1;
  s.n1 = 0;
  s.angle = 0;
  s.dir = 1;
  s.retry = 0;
  s.parts.fill(-1);
  s.addIds.fill(-1);
  s.addKind.fill(0);
  s.budgetAcc = 0;
  s.bonus = 0;
  s.hudTimer = 0;
  s.hudHp = -1;
  s.hudPhase = -1;
  s.hudMode = -1;
  s.enterEv.id = spec.id;
  s.enterEv.tier = row.tier;
  s.phaseEv.id = spec.id;
  s.phaseEv.phases = row.phases;
  s.downEv.id = spec.id;
  s.hudEv.id = spec.id;
  s.hudEv.phases = row.phases;
  return s;
}
