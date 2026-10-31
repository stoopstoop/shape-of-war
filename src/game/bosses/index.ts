// Boss registry and wiring (docs/12 wave V3-A). bossDefOf is keyed by BossId; ids without a built
// behaviour return null and arm nothing, so such a level
// plays as before. The lookup is a switch, not a module level table, so the import cycle through
// endless.ts and spawner.ts never reads a def before its module has run.
import type { BossId, BossSpec } from '../../levelgen/leveldef';
import { Kind, registerBehaviour, type World } from '../world';
import * as bastion from './bastion';
import * as brood from './brood';
import * as ember from './ember';
import * as gravitas from './gravitas';
import * as mirage from './mirage';
import { armBoss, stepBossEntity, stepHazard, stepPart } from './core';
import * as spindle from './spindle';
import * as tempest from './tempest';
import * as prism from './prism';
import * as twins from './twins';
import { PartType, type BossDef } from './types';
import * as warden from './warden';

export {
  bossAlive,
  bossBonusAwarded,
  bossEnraged,
  bossHolding,
  bossPending,
} from './core';
export { createBossView, readBoss, type BossView } from './view';

/** The behaviour for a boss id, or null when it is not built yet. */
export function bossDefOf(id: BossId): BossDef | null {
  switch (id) {
    case 'warden':
      return warden.def;
    case 'brood':
      return brood.def;
    case 'spindle':
      return spindle.def;
    case 'ember':
      return ember.def;
    case 'mirage':
      return mirage.def;
    case 'gravitas':
      return gravitas.def;
    case 'bastion':
      return bastion.def;
    case 'tempest':
      return tempest.def;
    case 'twins':
      return twins.def;
    case 'prism':
      return prism.def;
    default:
      return null;
  }
}

/** Arm the boss of spec with its entrance at wave clock atSec. False for an id with no behaviour. */
export function armBossFromSpec(w: World, spec: BossSpec, atSec: number): boolean {
  const def = bossDefOf(spec.id);
  if (def === null) return false;
  armBoss(w, spec, def, atSec);
  return true;
}

/** Arm the level's boss, if it carries one (createGame). Endless arms per segment in endless.ts. */
export function initLevelBoss(w: World): void {
  const b = w.level.boss;
  if (b !== undefined) armBossFromSpec(w, b, b.atSec);
}

/** Kind.BossPart step: the pulse clock (and orphan removal), then a Broodling's own behaviour. */
function stepBossPart(w: World, id: number, dt: number): void {
  stepPart(w, id, dt);
  if (w.alive[id] === 1 && w.a[id] === PartType.Broodling) brood.stepBroodling(w, id, dt);
}

/** Register the boss, part and hazard steps with the world. Idempotent. */
export function registerBossBehaviours(): void {
  registerBehaviour(Kind.Boss, stepBossEntity);
  registerBehaviour(Kind.BossPart, stepBossPart);
  registerBehaviour(Kind.BossHazard, stepHazard);
}
