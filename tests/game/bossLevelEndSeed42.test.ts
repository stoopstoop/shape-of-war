// B16 retest on the real levels Ryan plays: seed 42 levels 5, 10 and 15 from the default generator
// (typed seed path ?seed=42&level=N). A scripted bot plays through the real input (aim and fire),
// dies twice on the way and kills the boss. The session runs with main.ts's scoring port (Ledger's
// scoring.ts), as on the device. DECISIONS option 1 (run 0262): the boss is the objective, so the
// level completes the moment the boss dies, whether or not the regular objective passed first (a
// met objective still holds the level for the boss). Every run asserts one 'game:over', outcome
// won, within 2 s of the boss death, and that Ledger (the port the HUD reads) counted the boss kill
// and its bonus.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { bossHittable, bossHolding, bossPending, countParts, damageBoss, damageBossPart, isBossTarget, livePart } from '../../src/game/bosses/core';
import { bossOf } from '../../src/game/bosses/state';
import { isTargetable } from '../../src/game/combat';
import { createGame, objectiveClock, stepGame } from '../../src/game/game';
import { objectiveMet } from '../../src/game/objective';
import { killShip } from '../../src/game/player';
import { awardKill, collectGeom, scoreOf, shipDied } from '../../src/game/scoring';
import { gs, type ScoringPort } from '../../src/game/state';
import { Kind, type World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import { generateLevel } from '../../src/levelgen/generator';
import { DT, idle } from './helpers';

afterEach(() => bus.clear());

/** The port main.ts passes to createGame. */
const PORT: ScoringPort = {
  awardKill,
  collectGeom: (w: World): void => {
    collectGeom(w);
  },
  resetMultiplier: shipDied,
  multiplier: (w: World): number => scoreOf(w).multiplier,
};

type Plan = 'objectiveFirst' | 'bossFirst' | 'deadAtKill';

/** Aim the real stick at the nearest target. The boss and its parts only when boss is true. */
function aim(w: World, input: InputState, boss: boolean): void {
  const sx = w.x[0] ?? 0;
  const sy = w.y[0] ?? 0;
  let best = -1;
  let bestD = Infinity;
  for (let i = 1; i < w.cap; i++) {
    if (w.alive[i] !== 1) continue;
    const k = w.kind[i] ?? 0;
    const isBoss = k === Kind.Boss || k === Kind.BossPart;
    if (isBoss ? !boss || !isBossTarget(w, i) : !isTargetable(w, i)) continue;
    // Boss targets first when allowed, then the nearest enemy.
    const d = Math.hypot((w.x[i] ?? 0) - sx, (w.y[i] ?? 0) - sy) - (isBoss ? 1e5 : 0);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  input.aim.active = best > 0;
  input.aim.x = best > 0 ? (w.x[best] ?? 0) - sx : 0;
  input.aim.y = best > 0 ? (w.y[best] ?? 0) - sy : 0;
}

/** The sim's own success test right now, the boss ignored. */
function metNow(w: World): boolean {
  const g = gs(w);
  return objectiveMet({ objective: w.level.objective, mode: g.mode, score: g.score, kills: g.kills, lives: g.lives, clock: objectiveClock(w) });
}

/** One forced death, through the real kill path, with the shield lifted for that call only. */
function die(w: World): void {
  const g = gs(w);
  g.invulnerable = false;
  w.ship.invuln = 0;
  killShip(w);
  g.invulnerable = true;
}

interface Run {
  overs: number;
  overAt: number;
  downAt: number;
  metAt: number;
  heldAt: number;
  deaths: number;
  deadAtDown: boolean;
  /** The boss kill step: sim and Ledger score and kill deltas, and the bonus paid. */
  simScore: number;
  ledgerScore: number;
  simKills: number;
  ledgerKills: number;
  bonus: number;
}

/** Play seed 42 level n with plan. The ship is shielded except for the two scripted deaths. */
function play(level: number, plan: Plan): { w: World; r: Run } {
  const w = createGame(generateLevel(42, level), { scoring: PORT });
  const g = gs(w);
  g.invulnerable = true;
  const r: Run = { overs: 0, overAt: -1, downAt: -1, metAt: -1, heldAt: -1, deaths: 0, deadAtDown: false, simScore: 0, ledgerScore: 0, simKills: 0, ledgerKills: 0, bonus: 0 };
  bus.on('game:over', () => {
    r.overs++;
    if (r.overAt < 0) r.overAt = w.time;
  });
  const input = idle();
  for (let i = 0; i < 120 * 400 && g.outcome === 'running'; i++) {
    // Two deaths on the way: one before the boss enters (20 s), one while it lives. deadAtKill
    // spends its second life at the killing blow instead (3 lives: a third death would lose).
    // bossFirst kills the boss soon after it enters, so its second death comes as the boss arrives.
    const second = plan !== 'deadAtKill' && r.deaths === 1 && (w.time >= 30 || (plan === 'bossFirst' && bossHittable(w) > 0));
    if (w.ship.active && ((r.deaths === 0 && w.time >= 12) || second)) {
      die(w);
      r.deaths++;
    }
    if (r.heldAt < 0 && bossHolding(w)) r.heldAt = w.time;
    const shootBoss = plan === 'bossFirst' || bossHolding(w);
    // Suspect 4: the killing blow and the ship's death land on the same step, so the ship is dead
    // (respawn delay) when the sim evaluates the objective. A death before the blow would close the
    // window (boss rule 6 resets the cycle), so the blow comes first.
    const id = bossHittable(w);
    const s = bossOf(w);
    const ledger0 = scoreOf(w);
    const sim0 = g.score;
    const simKills0 = g.kills;
    if (plan === 'deadAtKill' && bossHolding(w) && id > 0 && s !== null && s.open && w.ship.active && (w.hp[id] ?? 0) <= 40) {
      expect(damageBoss(w, 40, w.x[id] ?? 0, w.y[id] ?? 0)).toBe(true);
      die(w);
      r.deaths++;
      r.deadAtDown = !w.ship.active && !bossPending(w);
    }
    if (plan === 'deadAtKill' && bossHolding(w) && s !== null && s.split && countParts(w, s) === 1 && w.ship.active) {
      // A split Brood has no body: the killing blow is the last Broodling's.
      const last = [0, 1, 2, 3].map((k) => livePart(w, s, k)).find((p) => p > 0) ?? -1;
      if (last > 0 && (w.hp[last] ?? 0) <= 40) {
        expect(damageBossPart(w, last, 40, w.x[last] ?? 0, w.y[last] ?? 0)).toBe(true);
        die(w);
        r.deaths++;
        r.deadAtDown = !w.ship.active && !bossPending(w);
      }
    }
    aim(w, input, shootBoss);
    const o = w.level.objective;
    // scoreInTime, hold plans: this bot scores little while the boss lives (thinned waves) and its
    // attack drone kills the boss before the timer runs out, so the target is credited when the
    // boss enters and the bot waits for the timer away from the boss with its fire held.
    const b = s === null ? -1 : s.id;
    const wait = plan !== 'bossFirst' && !shootBoss && b > 0 && o.kind === 'scoreInTime';
    const credit = wait && g.score < o.target ? o.target - g.score : 0;
    g.score += credit;
    input.move.active = wait;
    input.move.x = wait ? (w.x[0] ?? 0) - (w.x[b] ?? 0) : 0;
    input.move.y = wait ? (w.y[0] ?? 0) - (w.y[b] ?? 0) : 0;
    if (wait) input.aim.active = false;
    stepGame(w, DT, input);
    if (r.downAt < 0 && !bossPending(w)) {
      r.downAt = w.time;
      const ledger1 = scoreOf(w);
      r.simScore = g.score - sim0 - credit;
      r.ledgerScore = ledger1.score - ledger0.score;
      r.simKills = g.kills - simKills0;
      r.ledgerKills = ledger1.kills - ledger0.kills;
      r.bonus = s === null ? 0 : s.bonus;
    }
    if (r.metAt < 0 && metNow(w)) r.metAt = w.time;
  }
  return { w, r };
}

describe('B16: seed 42 boss levels end after the boss dies (real levels, real port, deaths)', () => {
  for (const level of [5, 10, 15]) {
    const def = generateLevel(42, level);

    it(`level ${level} is a boss level with the expected objective`, () => {
      expect(def.boss).toBeDefined();
      expect(['scoreInTime', 'destroy', 'survive']).toContain(def.objective.kind);
    });

    for (const plan of ['objectiveFirst', 'bossFirst', 'deadAtKill'] as const) {
      it(`level ${level} (${def.objective.kind}, ${def.boss?.id ?? 'none'}), ${plan}: one game:over within 2 s`, () => {
        const { w, r } = play(level, plan);
        const g = gs(w);
        expect(r.deaths).toBeGreaterThanOrEqual(2);
        expect(r.downAt).toBeGreaterThanOrEqual(0);
        expect(r.overs).toBe(1);
        expect(g.outcome).toBe('won');
        expect(g.lives).toBeGreaterThan(0);
        if (plan !== 'bossFirst') {
          expect(r.heldAt).toBeGreaterThanOrEqual(0); // the objective passed first and the level held
          expect(r.metAt).toBeGreaterThanOrEqual(0);
          expect(r.metAt).toBeLessThanOrEqual(r.downAt);
        } else {
          // DECISIONS option 1: the boss died before the regular objective passed and still ended it.
          expect(r.metAt < 0 || r.metAt >= r.downAt).toBe(true);
        }
        if (plan === 'deadAtKill') expect(r.deadAtDown).toBe(true);
        expect(r.overAt).toBeGreaterThanOrEqual(r.downAt);
        expect(r.overAt - r.downAt).toBeLessThanOrEqual(2);
        // The boss kill and its bonus reached Ledger, the port the HUD reads: same deltas as the sim.
        expect(r.bonus).toBeGreaterThan(0);
        expect(r.simKills).toBeGreaterThanOrEqual(1);
        expect(r.ledgerKills).toBe(r.simKills);
        expect(r.simScore).toBeGreaterThanOrEqual(r.bonus);
        expect(r.ledgerScore).toBe(r.simScore);
      }, 60_000);
    }
  }
});
