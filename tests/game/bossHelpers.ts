// Shared helpers for the boss tests (docs/12 wave V3-A).
import { bossHittable } from '../../src/game/bosses/core';
import { bossOf, type BossState } from '../../src/game/bosses/state';
import { BOSS_TABLE } from '../../src/game/bosses/table';
import { stepGame, type GameOptions } from '../../src/game/game';
import { gs } from '../../src/game/state';
import { Kind, type World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import type { BossId, LevelDef } from '../../src/levelgen/leveldef';
import { DT, idle, makeGame, quietLevel } from './helpers';

/** A quiet rect level (1400 x 900, no waves) carrying boss id with its entrance at atSec. */
export function bossLevel(id: BossId, patch: Partial<LevelDef> = {}, atSec = 0.25): LevelDef {
  return quietLevel({
    boss: { id, tier: BOSS_TABLE[id].tier, atSec, hpMul: 1 },
    objective: { kind: 'survive', durationSec: 900 },
    ...patch,
  });
}

/**
 * Game on bossLevel. The ship is vulnerable unless shield is true (the stress scene flag). The drone
 * defaults to Collect so no drone shot changes the boss's hit points behind a test's back.
 */
export function bossGame(id: BossId, patch: Partial<LevelDef> = {}, opts: GameOptions = {}, shield = true, atSec = 0.25): World {
  const lvl = bossLevel(id, patch, atSec);
  const w = makeGame({ drone: 'collect', ...patch, boss: lvl.boss, objective: lvl.objective }, opts).w;
  gs(w).invulnerable = shield;
  return w;
}

/** The boss state, failing loudly when absent. */
export function bs(w: World): BossState {
  const s = bossOf(w);
  if (s === null) throw new Error('no boss state');
  return s;
}

/** Step until the boss is past its entrance (hittable). Returns its id. */
export function enter(w: World, input: InputState = idle()): number {
  for (let i = 0; i < 120 * 10; i++) {
    const id = bossHittable(w);
    if (id > 0) return id;
    stepGame(w, DT, input);
  }
  throw new Error('boss never entered');
}

/** Step n seconds with an input. */
export function run(w: World, secs: number, input: InputState = idle()): void {
  const n = Math.round(secs * 120);
  for (let i = 0; i < n; i++) stepGame(w, DT, input);
}

/** Live entities of a kind. */
export function count(w: World, k: Kind): number {
  let n = 0;
  for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && w.kind[i] === k) n++;
  return n;
}

/** First live entity of a kind, or -1. */
export function first(w: World, k: Kind): number {
  for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && w.kind[i] === k) return i;
  return -1;
}

/** Park the ship at (x, y), at rest. */
export function park(w: World, x: number, y: number): void {
  w.x[0] = x;
  w.y[0] = y;
  w.prevX[0] = x;
  w.prevY[0] = y;
  w.vx[0] = 0;
  w.vy[0] = 0;
}
