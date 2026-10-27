// hud:score multiplier under any scoring port (QA-003) and the stress invulnerability flag.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import * as grunt from '../../src/game/enemies/grunt';
import * as well from '../../src/game/enemies/gravitywell';
import { gameState, setInvulnerable, setScoring, stepGame } from '../../src/game/game';
import { collectGeom } from '../../src/game/geoms';
import { killShip } from '../../src/game/player';
import { currentMultiplier, gs, spawnFromDef, type ScoringPort } from '../../src/game/state';
import { Kind, liveEnemies, spawn, type World } from '../../src/game/world';
import { DT, idle, makeGame, put } from './helpers';

afterEach(() => bus.clear());

interface CounterPort extends ScoringPort {
  m: number;
}

/** A foreign port that keeps its own multiplier and exposes it through the getter. */
function counterPort(): CounterPort {
  const p: CounterPort = {
    m: 1,
    awardKill: () => 0,
    collectGeom: () => {
      p.m = Math.min(999, p.m + 1);
    },
    resetMultiplier: () => {
      p.m = 1;
    },
    multiplier: () => p.m,
  };
  return p;
}

/** A foreign port with no getter: Swarm must mirror the multiplier itself. */
const blindPort: ScoringPort = {
  awardKill: () => 0,
  collectGeom: () => undefined,
  resetMultiplier: () => undefined,
};

function geoms(w: World, n: number): void {
  for (let i = 0; i < n; i++) collectGeom(w, spawn(w, Kind.Geom, 0, 0));
}

function hudMultipliers(w: World, steps: number): number[] {
  const out: number[] = [];
  bus.on('hud:score', (p) => out.push(p.multiplier));
  for (let i = 0; i < steps; i++) stepGame(w, DT, idle());
  return out;
}

describe('hud:score multiplier', () => {
  it('comes from the port getter when the port has one', () => {
    const port = counterPort();
    const { w } = makeGame({}, { scoring: port });
    geoms(w, 4);
    port.m = 42; // the port is the authority, whatever Swarm counted
    const seen = hudMultipliers(w, 30);
    expect(seen.length).toBeGreaterThan(0);
    for (const m of seen) expect(m).toBe(42);
    expect(currentMultiplier(w)).toBe(42);
  });

  it('mirrors state.multiplier from the getter after each pickup and death', () => {
    const port = counterPort();
    const { w } = makeGame({}, { scoring: port });
    geoms(w, 7);
    expect(gameState(w).multiplier).toBe(8);
    killShip(w);
    expect(gameState(w).multiplier).toBe(1);
    expect(port.m).toBe(1);
  });

  it('falls back to Swarm own count for a port without a getter', () => {
    const { w } = makeGame({}, { scoring: blindPort });
    geoms(w, 5);
    expect(gameState(w).multiplier).toBe(6);
    const seen = hudMultipliers(w, 30);
    expect(seen.length).toBeGreaterThan(0);
    for (const m of seen) expect(m).toBe(6);
    killShip(w);
    expect(gameState(w).multiplier).toBe(1);
  });

  it('the getterless mirror caps at 999', () => {
    const { w } = makeGame({}, { scoring: blindPort });
    geoms(w, 1200);
    expect(gameState(w).multiplier).toBe(999);
  });

  it('the default port is not double counted', () => {
    const { w } = makeGame();
    geoms(w, 3);
    expect(gameState(w).multiplier).toBe(4);
    expect(hudMultipliers(w, 12).every((m) => m === 4)).toBe(true);
  });

  it('setScoring takes the new port multiplier at once', () => {
    const { w } = makeGame();
    geoms(w, 3);
    const port = counterPort();
    port.m = 17;
    setScoring(w, port);
    expect(gameState(w).multiplier).toBe(17);
  });

  it('a non finite getter value falls back to state.multiplier', () => {
    const port: ScoringPort = { ...blindPort, multiplier: () => Number.NaN };
    const { w } = makeGame({}, { scoring: port });
    expect(currentMultiplier(w)).toBe(1);
  });

  it('emits exactly one hud:score per 0.1 s', () => {
    const { w } = makeGame({}, { scoring: counterPort() });
    expect(hudMultipliers(w, 120)).toHaveLength(10);
  });
});

describe('setInvulnerable (stress hook)', () => {
  it('the ship survives enemy contact and keeps the arena populated', () => {
    const { w } = makeGame();
    setInvulnerable(w, true);
    for (let i = 0; i < 20; i++) put(w, grunt.def, (i % 5) * 4, Math.floor(i / 5) * 4);
    for (let i = 0; i < 120; i++) stepGame(w, DT, idle());
    expect(w.ship.active).toBe(true);
    expect(gs(w).lives).toBe(3);
    // A death would clear the arena to 0; the drone may still shoot a few.
    expect(liveEnemies(w)).toBeGreaterThan(10);
  });

  it('blocks well core deaths and direct killShip calls too', () => {
    const { w } = makeGame();
    setInvulnerable(w, true);
    const id = spawnFromDef(w, well.def, 0, 0, 0);
    gs(w).wellIds[gs(w).wellCount++] = id;
    for (let i = 0; i < 60; i++) stepGame(w, DT, idle());
    killShip(w);
    expect(w.ship.active).toBe(true);
    expect(gs(w).lives).toBe(3);
  });

  it('turning it off restores normal deaths', () => {
    const { w } = makeGame();
    setInvulnerable(w, true);
    put(w, grunt.def, 0, 0);
    stepGame(w, DT, idle());
    expect(w.ship.active).toBe(true);
    setInvulnerable(w, false);
    stepGame(w, DT, idle());
    expect(w.ship.active).toBe(false);
    expect(gs(w).lives).toBe(2);
  });

  it('is off by default', () => {
    const { w } = makeGame();
    expect(gameState(w).invulnerable).toBe(false);
  });
});
