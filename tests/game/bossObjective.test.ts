// Objective hold on a boss level (docs/13 boss rule 9, docs/01 section 8 override): survive,
// scoreInTime and destroy each hold while the boss lives (waves stop, the boss enrages, the clock
// stops), then win the moment the boss dies with lives left, or lose on lives 0. The boss counts
// one kill for destroy.
import { afterEach, describe, expect, it } from 'vitest';
import { bus, type Events } from '../../src/core/events';
import { bossAlive, bossEnraged, bossHolding, bossPending, damageBoss } from '../../src/game/bosses/core';
import { stepGame } from '../../src/game/game';
import { evaluateObjective, objectiveMet, type ObjectiveInput } from '../../src/game/objective';
import { killShip } from '../../src/game/player';
import { gs } from '../../src/game/state';
import type { ObjectiveDef } from '../../src/levelgen/leveldef';
import { bossGame, enter, park, run } from './bossHelpers';
import { DT, idle } from './helpers';

afterEach(() => bus.clear());

function inp(objective: ObjectiveDef, patch: Partial<ObjectiveInput> = {}): ObjectiveInput {
  return { objective, mode: 'adventure', score: 0, kills: 0, lives: 3, clock: 0, ...patch };
}

const SURV: ObjectiveDef = { kind: 'survive', durationSec: 45 };
const SIT: ObjectiveDef = { kind: 'scoreInTime', target: 5000, timeLimitSec: 60 };
const DEST: ObjectiveDef = { kind: 'destroy', count: 30 };

describe('evaluateObjective with bossPending', () => {
  it('survive, scoreInTime and destroy each hold at success while the boss is pending', () => {
    expect(evaluateObjective(inp(SURV, { clock: 45, bossPending: true }))).toBe('running');
    expect(evaluateObjective(inp(SIT, { clock: 60, score: 5000, bossPending: true }))).toBe('running');
    expect(evaluateObjective(inp(DEST, { kills: 30, bossPending: true }))).toBe('running');
  });

  it('win once the boss is gone, exactly as v2', () => {
    expect(evaluateObjective(inp(SURV, { clock: 45, bossPending: false }))).toBe('won');
    expect(evaluateObjective(inp(SIT, { clock: 60, score: 5000, bossPending: false }))).toBe('won');
    expect(evaluateObjective(inp(DEST, { kills: 30, bossPending: false }))).toBe('won');
    expect(evaluateObjective(inp(DEST, { kills: 30 }))).toBe('won');
  });

  it('lives at 0 lose as usual, hold or not; a missed score target still loses', () => {
    for (const o of [SURV, SIT, DEST]) {
      expect(evaluateObjective(inp(o, { clock: 60, score: 9000, kills: 30, lives: 0, bossPending: true }))).toBe('lost');
    }
    expect(evaluateObjective(inp(SIT, { clock: 60, score: 4999, bossPending: true }))).toBe('lost');
  });

  it('objectiveMet is the success test alone', () => {
    expect(objectiveMet(inp(SURV, { clock: 44.9 }))).toBe(false);
    expect(objectiveMet(inp(SURV, { clock: 45 }))).toBe(true);
    expect(objectiveMet(inp(SIT, { clock: 60, score: 4999 }))).toBe(false);
    expect(objectiveMet(inp(SIT, { clock: 60, score: 5000 }))).toBe(true);
    expect(objectiveMet(inp(DEST, { kills: 30 }))).toBe(true);
    expect(objectiveMet(inp(SURV, { clock: 999, mode: 'endless' }))).toBe(false);
  });
});

describe('the hold in play', () => {
  const kinds: [string, ObjectiveDef][] = [
    ['survive', { kind: 'survive', durationSec: 3 }],
    ['scoreInTime', { kind: 'scoreInTime', target: 0, timeLimitSec: 3 }],
    ['destroy', { kind: 'destroy', count: 1 }],
  ];

  for (const [name, objective] of kinds) {
    it(`${name}: holds, enrages, stops the clock, then wins when the boss dies`, () => {
      const overs: Events['game:over'][] = [];
      bus.on('game:over', (p) => overs.push({ ...p }));
      const w = bossGame('warden', { objective, par: 4000 });
      park(w, 600, 400);
      const g = gs(w);
      enter(w);
      if (objective.kind === 'destroy') g.kills = 1;
      run(w, 3.2);
      expect(g.outcome).toBe('running');
      expect(bossHolding(w)).toBe(true);
      expect(bossEnraged(w)).toBe(true);
      const clock = g.waveClock;
      run(w, 2);
      expect(g.waveClock).toBe(clock);
      expect(overs).toHaveLength(0);
      damageBoss(w, 99999, 0, 0, true);
      stepGame(w, DT, idle());
      expect(g.outcome).toBe('won');
      expect(overs).toHaveLength(1);
      expect(overs[0]?.score).toBe(g.score);
      expect(g.score).toBeGreaterThanOrEqual(1000);
    });
  }

  it('loses on lives 0 during the hold', () => {
    const w = bossGame('warden', { objective: { kind: 'survive', durationSec: 2 }, lives: 2 }, {}, false);
    park(w, 600, 400);
    enter(w);
    run(w, 2);
    expect(bossHolding(w)).toBe(true);
    w.ship.invuln = 0;
    killShip(w);
    run(w, 1.6);
    w.ship.invuln = 0;
    killShip(w);
    stepGame(w, DT, idle());
    expect(gs(w).outcome).toBe('lost');
  });

  it('a boss killed before the success test lets the objective run as normal', () => {
    const w = bossGame('spindle', { objective: { kind: 'survive', durationSec: 6 } });
    park(w, 600, 400);
    enter(w);
    damageBoss(w, 99999, 0, 0);
    expect(bossPending(w)).toBe(false);
    stepGame(w, DT, idle());
    expect(gs(w).outcome).toBe('running');
    run(w, 4);
    expect(gs(w).outcome).toBe('won');
  });

  it('a success before the boss has entered brings it in at once', () => {
    const w = bossGame('warden', { objective: { kind: 'destroy', count: 1 } }, {}, true, 30);
    park(w, 600, 400);
    gs(w).kills = 1;
    run(w, 0.1);
    expect(bossHolding(w)).toBe(true);
    expect(bossAlive(w)).toBe(true);
    expect(gs(w).waveClock).toBeLessThan(1);
  });

  it('destroy counts the boss once', () => {
    const w = bossGame('spindle', { objective: { kind: 'destroy', count: 2 } });
    park(w, 600, 400);
    enter(w);
    const g = gs(w);
    g.kills = 1;
    damageBoss(w, 99999, 0, 0);
    expect(g.kills).toBe(2);
    damageBoss(w, 99999, 0, 0);
    expect(g.kills).toBe(2);
    stepGame(w, DT, idle());
    expect(g.outcome).toBe('won');
  });
});
