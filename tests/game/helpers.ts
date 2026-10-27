// Shared test helpers for Swarm gameplay tests.
import { rebuild } from '../../src/game/collide';
import { createGame, type GameOptions } from '../../src/game/game';
import type { EnemyDef } from '../../src/game/enemies/types';
import { spawnFromDef } from '../../src/game/state';
import { inlineRectLevel, type World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import type { LevelDef } from '../../src/levelgen/leveldef';

export const DT = 1 / 120;

export function idle(): InputState {
  return {
    move: { active: false, x: 0, y: 0 },
    aim: { active: false, x: 0, y: 0 },
    bomb: false,
    superPressed: false,
    pause: false,
  };
}

/** Inline rect level with no waves, optionally patched. */
export function quietLevel(patch: Partial<LevelDef> = {}): LevelDef {
  const base = inlineRectLevel(7);
  return { ...base, ...patch };
}

/** Game on a quiet level with a vulnerable ship and a vibrate spy. */
export function makeGame(patch: Partial<LevelDef> = {}, opts: GameOptions = {}): { w: World; vibes: number[] } {
  const vibes: number[] = [];
  const w = createGame(quietLevel(patch), { vibrate: (ms) => vibes.push(ms), ...opts });
  w.ship.invuln = 0;
  return { w, vibes };
}

/** Spawn without telegraph and refresh the grid. */
export function put(w: World, def: EnemyDef, x: number, y: number): number {
  const id = spawnFromDef(w, def, x, y, 0);
  rebuild(w.grid, w);
  return id;
}

export function dist(w: World, a: number, b: number): number {
  return Math.hypot((w.x[a] ?? 0) - (w.x[b] ?? 0), (w.y[a] ?? 0) - (w.y[b] ?? 0));
}
