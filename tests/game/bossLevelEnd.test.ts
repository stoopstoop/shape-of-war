// G3A task 1: "After the boss died the level did NOT end by itself". docs/13 boss rule 9: the
// objective holds at success while the boss lives and the level completes the moment it dies.
// These tests play generated boss levels (levels 5, 10, 15 on three seeds, every objective kind)
// to the hold, kill the boss through its real counter window, and assert the win inside 1 s.
// They also pin the clock mismatch found while tracing the report: the HUD's countdown reads
// w.time, the objective reads the wave clock, which pauses for each 1.5 s respawn delay. After
// deaths the HUD shows "Defeat the boss" (or 0:00) before the sim's test passes, so a boss killed
// in that gap leaves the level running with a timer at 0:00 (hand-off request: main.ts
// snapshotOf reads objectiveClock). DECISIONS option 1 (run 0262): the boss is the objective, so a
// boss killed before the success test now ends the level at once.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { bossHolding, bossPending, damageBoss, damageBossPart, livePart } from '../../src/game/bosses/core';
import { bossOf } from '../../src/game/bosses/state';
import { MAX_PARTS } from '../../src/game/bosses/table';
import { createGame, objectiveClock, stepGame } from '../../src/game/game';
import { killShip } from '../../src/game/player';
import { gs } from '../../src/game/state';
import type { World } from '../../src/game/world';
import { generateLevel } from '../../src/levelgen/generator';
import { DT, idle } from './helpers';

afterEach(() => bus.clear());

/** One step of a gunner who pops pods and lands 30 tenths a step on an exposed core. */
function fire(w: World): void {
  const s = bossOf(w);
  if (s === null || s.status !== 'alive') return;
  for (let k = 0; k < MAX_PARTS; k++) {
    const p = livePart(w, s, k);
    if (p > 0) damageBossPart(w, p, 9999, 0, 0);
  }
  if (s.exposed) damageBoss(w, 30, 0, 0);
}

/** Make the generated objective pass on its own clock: score and kill targets are met up front. */
function meetTargets(w: World): void {
  const g = gs(w);
  const o = w.level.objective;
  if (o.kind === 'scoreInTime') g.score = Math.max(g.score, o.target);
  if (o.kind === 'destroy') g.kills = Math.max(g.kills, o.count);
}

describe('a boss level completes when the boss dies at success', () => {
  for (const seed of [2, 3, 12345]) {
    for (const level of [5, 10, 15]) {
      it(`seed ${seed} level ${level}: hold, kill through the window, win within 1 s`, () => {
        const overs: number[] = [];
        bus.on('game:over', (p) => overs.push(p.score));
        const def = generateLevel(seed, level);
        expect(def.boss).toBeDefined();
        const w = createGame(def);
        const g = gs(w);
        g.invulnerable = true;
        meetTargets(w);
        let i = 0;
        for (; i < 120 * 200 && !bossHolding(w); i++) {
          stepGame(w, DT, idle());
          meetTargets(w);
        }
        expect(bossHolding(w)).toBe(true);
        expect(g.outcome).toBe('running');
        // The hold: let it sit enraged for 2 s, still running.
        for (let k = 0; k < 240; k++) stepGame(w, DT, idle());
        expect(g.outcome).toBe('running');
        expect(overs).toHaveLength(0);
        let downAt = -1;
        let t = 0;
        for (let k = 0; k < 120 * 300 && g.outcome === 'running'; k++) {
          fire(w);
          if (downAt < 0 && !bossPending(w)) downAt = t;
          stepGame(w, DT, idle());
          t += DT;
        }
        expect(downAt).toBeGreaterThanOrEqual(0);
        expect(g.outcome).toBe('won');
        expect(t - downAt).toBeLessThanOrEqual(1);
        expect(overs).toEqual([g.score]);
      });
    }
  }
});

describe('the objective clock', () => {
  it('pauses for each respawn delay while w.time runs on', () => {
    const def = generateLevel(2, 10); // survive 70 s, brood
    expect(def.objective.kind).toBe('survive');
    const w = createGame(def);
    for (let i = 0; i < 120 * 5; i++) stepGame(w, DT, idle());
    w.ship.invuln = 0;
    killShip(w);
    for (let i = 0; i < 120 * 3; i++) stepGame(w, DT, idle());
    expect(w.time - objectiveClock(w)).toBeGreaterThan(1.4);
    expect(objectiveClock(w)).toBe(gs(w).waveClock);
  });

  it('a boss killed before the objective clock reaches success: the level ends at the kill (DECISIONS option 1)', () => {
    const def = generateLevel(2, 10);
    const w = createGame(def);
    const g = gs(w);
    g.invulnerable = true;
    const dur = def.objective.kind === 'survive' ? def.objective.durationSec : 0;
    // Kill the boss as soon as it can be hit.
    for (let i = 0; i < 120 * 200 && bossPending(w); i++) {
      fire(w);
      stepGame(w, DT, idle());
    }
    expect(bossPending(w)).toBe(false);
    expect(objectiveClock(w)).toBeLessThan(dur);
    // The step that killed the boss already evaluated the objective: the level is won.
    expect(g.outcome).toBe('won');
  });
});
