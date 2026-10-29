// Determinism (docs/13 "Engineering rules that stay" rule 4): the same LevelDef and input log give an
// identical boss and hazard log over 60 s, for each tier 1 boss, with Math.random stubbed to throw
// (boss code uses no PRNG). Ship deaths, the respawn pause, adds, pods and phases all ride along.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bus } from '../../src/core/events';
import { bossOf } from '../../src/game/bosses/state';
import { createGame, stepGame } from '../../src/game/game';
import { gs } from '../../src/game/state';
import { Kind, type World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import type { BossId } from '../../src/levelgen/leveldef';
import { bossLevel } from './bossHelpers';
import { DT, idle } from './helpers';

afterEach(() => {
  bus.clear();
  vi.restoreAllMocks();
});

/** A scripted input log: wander and fire at the arena centre, with a bomb at 20 s. */
function inputAt(step: number, out: InputState): InputState {
  const t = step * DT;
  out.move.active = true;
  out.move.x = Math.cos(t * 0.7) * 0.9;
  out.move.y = Math.sin(t * 1.1) * 0.9;
  out.aim.active = true;
  out.aim.x = Math.cos(t * 0.5);
  out.aim.y = Math.sin(t * 0.5);
  out.bomb = step === 120 * 20;
  out.superPressed = step % (120 * 15) === 0 && step > 0;
  return out;
}

function record(id: BossId): number[] {
  const w: World = createGame(bossLevel(id, { lives: 40, par: 6000 }, 2), { vibrate: () => undefined });
  const log: number[] = [];
  const input = idle();
  for (let i = 0; i < 120 * 60; i++) {
    stepGame(w, DT, inputAt(i, input));
    const s = bossOf(w);
    const b = s === null ? -1 : s.id;
    log.push(b > 0 ? (w.x[b] ?? 0) : 0, b > 0 ? (w.y[b] ?? 0) : 0, b > 0 ? (w.hp[b] ?? 0) : 0, s === null ? -1 : s.viewMode, s === null ? 0 : s.phase);
    let n = 0;
    let sum = 0;
    for (let h = 1; h < w.cap; h++) {
      if (w.alive[h] !== 1) continue;
      const k = w.kind[h] ?? 0;
      if (k !== Kind.BossHazard && k !== Kind.BossPart) continue;
      n++;
      sum += h * 7 + (w.a[h] ?? 0) + (w.x[h] ?? 0) + (w.y[h] ?? 0) * 3 + (w.rot[h] ?? 0) * 11 + (w.radius[h] ?? 0) + (w.t[h] ?? 0);
    }
    log.push(n, sum, gs(w).score, gs(w).lives);
  }
  return log;
}

describe('boss determinism', () => {
  for (const id of ['warden', 'brood', 'spindle'] as BossId[]) {
    it(`${id}: identical boss and hazard log over 60 s, no Math.random`, () => {
      vi.spyOn(Math, 'random').mockImplementation(() => {
        throw new Error('Math.random called');
      });
      const a = record(id);
      const b = record(id);
      expect(a.length).toBe(b.length);
      expect(a).toEqual(b);
      // The fight actually happened: the boss entered and took damage or died.
      const hp = a.filter((_, i) => i % 9 === 2);
      expect(Math.max(...hp)).toBeGreaterThan(0);
    });
  }
});
