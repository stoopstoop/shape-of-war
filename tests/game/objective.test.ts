import { afterEach, describe, expect, it } from 'vitest';
import { bus, type Events } from '../../src/core/events';
import { gameState, stepGame } from '../../src/game/game';
import { evaluateObjective, starsFor, stepObjective, type ObjectiveInput } from '../../src/game/objective';
import { gs } from '../../src/game/state';
import type { ObjectiveDef } from '../../src/levelgen/leveldef';
import { DT, idle, makeGame } from './helpers';

afterEach(() => bus.clear());

function inp(objective: ObjectiveDef, patch: Partial<ObjectiveInput> = {}): ObjectiveInput {
  return { objective, mode: 'adventure', score: 0, kills: 0, lives: 3, clock: 0, ...patch };
}

describe('evaluateObjective', () => {
  const sit: ObjectiveDef = { kind: 'scoreInTime', target: 5000, timeLimitSec: 60 };
  const surv: ObjectiveDef = { kind: 'survive', durationSec: 45 };
  const dest: ObjectiveDef = { kind: 'destroy', count: 30 };

  it('scoreInTime completes on target, fails on time or lives', () => {
    expect(evaluateObjective(inp(sit, { score: 4999, clock: 59 }))).toBe('running');
    expect(evaluateObjective(inp(sit, { score: 5000, clock: 59 }))).toBe('won');
    expect(evaluateObjective(inp(sit, { score: 4999, clock: 60 }))).toBe('lost');
    expect(evaluateObjective(inp(sit, { lives: 0 }))).toBe('lost');
  });

  it('survive completes at duration, fails on lives', () => {
    expect(evaluateObjective(inp(surv, { clock: 44.9 }))).toBe('running');
    expect(evaluateObjective(inp(surv, { clock: 45 }))).toBe('won');
    expect(evaluateObjective(inp(surv, { clock: 10, lives: 0 }))).toBe('lost');
  });

  it('destroy completes at count, fails on lives', () => {
    expect(evaluateObjective(inp(dest, { kills: 29 }))).toBe('running');
    expect(evaluateObjective(inp(dest, { kills: 30 }))).toBe('won');
    expect(evaluateObjective(inp(dest, { kills: 3, lives: 0 }))).toBe('lost');
  });

  it('endless only ends on lives', () => {
    expect(evaluateObjective(inp(surv, { mode: 'endless', clock: 999 }))).toBe('running');
    expect(evaluateObjective(inp(surv, { mode: 'endless', lives: 0 }))).toBe('lost');
  });

  it('stars at par, 2x, 4x', () => {
    const t: [number, number, number] = [1000, 2000, 4000];
    expect([999, 1000, 2000, 3999, 4000].map((s) => starsFor(s, t))).toEqual([0, 1, 2, 2, 3]);
  });
});

describe('game:over', () => {
  it('survive level completes through stepGame and emits once', () => {
    const { w } = makeGame({ objective: { kind: 'survive', durationSec: 1 } });
    w.ship.invuln = 99;
    const overs: Events['game:over'][] = [];
    bus.on('game:over', (p) => overs.push({ ...p }));
    for (let i = 0; i < 200; i++) stepGame(w, DT, idle());
    expect(gameState(w).outcome).toBe('won');
    expect(overs).toHaveLength(1);
    expect(overs[0]).toEqual({ score: 0, stars: 0, levelIndex: 1, mode: 'adventure' });
  });

  it('destroy completes and reports stars from score', () => {
    const { w } = makeGame({ objective: { kind: 'destroy', count: 2 } });
    const overs: Events['game:over'][] = [];
    bus.on('game:over', (p) => overs.push({ ...p }));
    gs(w).kills = 2;
    gs(w).score = 2500;
    stepObjective(w);
    stepObjective(w);
    expect(overs).toEqual([{ score: 2500, stars: 2, levelIndex: 1, mode: 'adventure' }]);
  });

  it('scoreInTime fails when the clock runs out', () => {
    const { w } = makeGame({ objective: { kind: 'scoreInTime', target: 100, timeLimitSec: 0.5 } });
    w.ship.invuln = 99;
    for (let i = 0; i < 70; i++) stepGame(w, DT, idle());
    expect(gameState(w).outcome).toBe('lost');
  });

  it('losing the last life fails the level with 0 stars', () => {
    const { w } = makeGame({ objective: { kind: 'destroy', count: 50 } });
    const overs: Events['game:over'][] = [];
    bus.on('game:over', (p) => overs.push({ ...p }));
    gs(w).lives = 0;
    gs(w).score = 99999;
    stepObjective(w);
    expect(gameState(w).outcome).toBe('lost');
    expect(overs[0]?.stars).toBe(0);
  });
});
