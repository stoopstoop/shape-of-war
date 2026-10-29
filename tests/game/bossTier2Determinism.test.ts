// Determinism for the tier 2 bosses (docs/13 "Engineering rules that stay" rule 4): the same
// LevelDef and input log give an identical boss, hazard, part, Mine and enemy bullet log over 60 s,
// with Math.random stubbed to throw. Ship deaths, the respawn pause, the bomb and phases ride along.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bus } from '../../src/core/events';
import { bossOf } from '../../src/game/bosses/state';
import { enemyBulletsOf } from '../../src/game/enemyBullets';
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

/** A scripted input log: wander and fire at the arena centre, a bomb at 20 s, a super every 15 s. */
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

function recordBoss(id: BossId, secs = 60): number[] {
  const w: World = createGame(bossLevel(id, { lives: 40, par: 6000 }, 2), { vibrate: () => undefined });
  const log: number[] = [];
  const input = idle();
  for (let i = 0; i < 120 * secs; i++) {
    stepGame(w, DT, inputAt(i, input));
    const s = bossOf(w);
    const b = s === null ? -1 : s.id;
    log.push(b > 0 ? (w.x[b] ?? 0) : 0, b > 0 ? (w.y[b] ?? 0) : 0, b > 0 ? (w.hp[b] ?? 0) : 0, s === null ? -1 : s.viewMode, s === null ? 0 : s.phase);
    let n = 0;
    let sum = 0;
    for (let h = 1; h < w.cap; h++) {
      if (w.alive[h] !== 1) continue;
      const k = w.kind[h] ?? 0;
      if (k !== Kind.BossHazard && k !== Kind.BossPart && k !== Kind.Mine) continue;
      n++;
      sum += h * 7 + k * 13 + (w.a[h] ?? 0) + (w.x[h] ?? 0) + (w.y[h] ?? 0) * 3 + (w.rot[h] ?? 0) * 11 + (w.radius[h] ?? 0) + (w.t[h] ?? 0);
    }
    const p = enemyBulletsOf(w);
    let bsum = 0;
    for (let e = 0; e < p.cap; e++) {
      if (p.alive[e] !== 1) continue;
      bsum += e * 5 + (p.x[e] ?? 0) + (p.y[e] ?? 0) * 3 + (p.vx[e] ?? 0) * 7 + (p.vy[e] ?? 0) * 11 + (p.arm[e] ?? 0) + (p.life[e] ?? 0);
    }
    log.push(n, sum, p.liveCount, bsum, gs(w).score, gs(w).lives);
  }
  return log;
}

describe('tier 2 boss determinism', () => {
  for (const id of ['ember', 'mirage', 'gravitas'] as BossId[]) {
    it(`${id}: identical boss, hazard and Mine log over 60 s, no Math.random`, () => {
      vi.spyOn(Math, 'random').mockImplementation(() => {
        throw new Error('Math.random called');
      });
      const a = recordBoss(id);
      const b = recordBoss(id);
      expect(a.length).toBe(b.length);
      expect(a).toEqual(b);
      // The fight happened: the boss entered with hit points.
      const hp = a.filter((_, i) => i % 11 === 2);
      expect(Math.max(...hp)).toBeGreaterThan(0);
    });
  }
});

describe('boss determinism with shots', () => {
  for (const id of ['spindle', 'ember'] as BossId[]) {
    it(`${id}: identical boss and enemy bullet pool log over 60 s, no Math.random`, () => {
      vi.spyOn(Math, 'random').mockImplementation(() => {
        throw new Error('Math.random called');
      });
      const a = recordBoss(id);
      const b = recordBoss(id);
      expect(a).toEqual(b);
      // Bullets were in the air at some point, so the pool is part of what matched.
      const live = a.filter((_, i) => i % 11 === 7);
      expect(Math.max(...live)).toBeGreaterThan(0);
    });
  }
});
