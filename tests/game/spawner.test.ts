import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { createGame, gameState, isTelegraphing, stepGame } from '../../src/game/game';
import { resolvePosition, SAFE_RADIUS, stepSpawner } from '../../src/game/spawner';
import { isWaveEnemy } from '../../src/game/state';
import { Kind, type World } from '../../src/game/world';
import type { LevelDef, SpawnEntry, WaveDef } from '../../src/levelgen/leveldef';
import { FIXTURE_HEX_WELLS, FIXTURE_RECT_EASY, FIXTURE_RECT_WALLS } from '../../src/levelgen/fixtures';
import { DT, idle, makeGame, quietLevel } from './helpers';

afterEach(() => bus.clear());

function run(level: LevelDef, seconds: number): World {
  const w = createGame(level, { logSpawns: true, vibrate: () => undefined });
  const input = idle();
  for (let i = 0; i < seconds * 120; i++) stepGame(w, DT, input);
  return w;
}

function entry(patch: Partial<SpawnEntry>): SpawnEntry {
  return { kind: 'grunt', tOffsetSec: 0, mode: 'fixed', x: 400, y: 0, angleDeg: 0, radius: 0, headingDeg: 0, ...patch };
}

function liveWave(w: World): number {
  let n = 0;
  for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && isWaveEnemy(w.kind[i] ?? 0)) n++;
  return n;
}

describe('stepSpawner', () => {
  it('same LevelDef gives an identical spawn log over 60 s', () => {
    for (const level of [FIXTURE_RECT_EASY, FIXTURE_HEX_WELLS, FIXTURE_RECT_WALLS]) {
      const a = run(level, 60);
      const b = run(level, 60);
      const la = gameState(a).spawnLog ?? [];
      const lb = gameState(b).spawnLog ?? [];
      expect(la.length).toBeGreaterThan(10);
      expect(lb).toEqual(la);
      expect(gameState(b).score).toBe(gameState(a).score);
      expect(gameState(b).lives).toBe(gameState(a).lives);
    }
  });

  it('spawns waves at atSec + tOffsetSec with a 0.6 s telegraph', () => {
    const wave: WaveDef = {
      index: 0,
      atSec: 1,
      pattern: 'edges',
      entries: [entry({ x: 400, y: 0 }), entry({ tOffsetSec: 0.5, x: -400, y: 0 })],
    };
    const base = quietLevel();
    const { w } = makeGame({ waves: { ...base.waves, waves: [wave], loopFromIndex: -1, loopPeriodSec: 0 } }, { logSpawns: true });
    w.ship.invuln = 99;
    for (let i = 0; i < 119; i++) stepSpawner(w, DT);
    expect(liveWave(w)).toBe(0);
    stepSpawner(w, DT);
    stepSpawner(w, DT);
    expect(liveWave(w)).toBe(1);
    let id = -1;
    for (let i = 1; i < w.cap; i++) if (w.kind[i] === Kind.Grunt) id = i;
    expect(isTelegraphing(w, id)).toBe(true);
    for (let i = 0; i < 60; i++) stepSpawner(w, DT);
    expect(liveWave(w)).toBe(2);
    expect(gameState(w).spawnLog?.map((e) => e.x)).toEqual([400, -400]);
  });

  it('loops from loopFromIndex every loopPeriodSec', () => {
    const wave: WaveDef = { index: 0, atSec: 0.5, pattern: 'edges', entries: [entry({})] };
    const base = quietLevel();
    const { w } = makeGame({ waves: { ...base.waves, waves: [wave], loopFromIndex: 0, loopPeriodSec: 2 } }, { logSpawns: true });
    w.ship.invuln = 99;
    for (let i = 0; i < 7 * 120; i++) stepSpawner(w, DT);
    const ts = (gameState(w).spawnLog ?? []).map((e) => Math.round(e.t * 10) / 10);
    expect(ts).toEqual([0.5, 2.5, 4.5, 6.5]);
  });

  it('holds spawns in a FIFO queue at maxLiveEnemies', () => {
    const entries = Array.from({ length: 8 }, (_, k) => entry({ x: 300 + k * 30, y: 200 }));
    const base = quietLevel();
    const { w } = makeGame({
      waves: { ...base.waves, maxLiveEnemies: 5, waves: [{ index: 0, atSec: 0.1, pattern: 'edges', entries }], loopFromIndex: -1, loopPeriodSec: 0 },
    });
    for (let i = 0; i < 60; i++) stepSpawner(w, DT);
    expect(liveWave(w)).toBe(5);
    expect(gameState(w).queueLen).toBe(3);
  });

  it('skips kinds not in the roster', () => {
    const base = quietLevel();
    const { w } = makeGame({
      waves: { ...base.waves, waves: [{ index: 0, atSec: 0.1, pattern: 'edges', entries: [entry({ kind: 'snake' })] }], loopFromIndex: -1, loopPeriodSec: 0 },
    });
    for (let i = 0; i < 60; i++) stepSpawner(w, DT);
    expect(liveWave(w)).toBe(0);
  });

  it('mirrors a fixed point near the ship, delays when both are near', () => {
    const { w } = makeGame();
    const out = { x: 0, y: 0 };
    w.x[0] = 150;
    expect(resolvePosition(w, entry({ x: 200, y: 0 }), 14, out)).toBe(true);
    expect(out).toEqual({ x: -200, y: -0 });
    w.x[0] = 0;
    expect(resolvePosition(w, entry({ x: SAFE_RADIUS + 20, y: 0 }), 14, out)).toBe(true);
    expect(out.x).toBe(SAFE_RADIUS + 20);
    expect(resolvePosition(w, entry({ x: 50, y: 0 }), 14, out)).toBe(false);
  });

  it('pulls ring points outside the arena back toward the centre', () => {
    const { w } = makeGame();
    w.x[0] = 600;
    const out = { x: 0, y: 0 };
    resolvePosition(w, entry({ mode: 'ring', x: 0, y: 0, angleDeg: 0, radius: 300 }), 14, out);
    expect(out.x).toBeLessThanOrEqual(700 - 14);
    expect(out.x).toBeGreaterThan(0);
  });

  it('activates hazard spawners at spawnAtSec and places wells at start', () => {
    const w = createGame(FIXTURE_HEX_WELLS, { vibrate: () => undefined });
    let wells = 0;
    for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && w.kind[i] === Kind.GravityWell) wells++;
    expect(wells).toBe(FIXTURE_HEX_WELLS.hazards.wells.length);
    const sp = FIXTURE_HEX_WELLS.hazards.spawners[0];
    if (sp === undefined) return;
    w.ship.invuln = 1e9;
    for (let i = 0; i < (sp.spawnAtSec + 0.1) * 120; i++) stepSpawner(w, DT);
    let n = 0;
    for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && w.kind[i] === Kind.Spawner) n++;
    expect(n).toBe(1);
  });
});
