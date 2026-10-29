// Spawner audio emits (player guide audit): bus 'sfx' 'spawn' resolves to the telegraph cue and
// fires once per wave on its first telegraph, and once when a hazard spawner's telegraph starts.
// The emits are sim neutral. 'respawn' has no SfxName yet, so nothing emits it (see hand-off).
import { afterEach, describe, expect, it } from 'vitest';
import { CUES, cueForSfx, SFX_TO_CUE } from '../../src/audio/cues';
import { bus, type SfxName } from '../../src/core/events';
import { createGame, gameState, stepGame } from '../../src/game/game';
import { removeEntity } from '../../src/game/remove';
import { deactivateShip } from '../../src/game/ship';
import { stepSpawner } from '../../src/game/spawner';
import { isWaveEnemy } from '../../src/game/state';
import { Kind, type World } from '../../src/game/world';
import { FIXTURE_RECT_EASY } from '../../src/levelgen/fixtures';
import type { LevelDef, SpawnEntry, WaveDef } from '../../src/levelgen/leveldef';
import { DT, idle, makeGame, quietLevel } from './helpers';

afterEach(() => bus.clear());

function entry(patch: Partial<SpawnEntry>): SpawnEntry {
  return { kind: 'grunt', tOffsetSec: 0, mode: 'fixed', x: 400, y: 0, angleDeg: 0, radius: 0, headingDeg: 0, ...patch };
}

function listen(): SfxName[] {
  const out: SfxName[] = [];
  bus.on('sfx', (n) => out.push(n));
  return out;
}

function wavesLevel(waves: WaveDef[], patch: Partial<LevelDef['waves']> = {}): Partial<LevelDef> {
  const base = quietLevel();
  return { waves: { ...base.waves, waves, loopFromIndex: -1, loopPeriodSec: 0, ...patch } };
}

function liveWave(w: World): number {
  let n = 0;
  for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && isWaveEnemy(w.kind[i] ?? 0)) n++;
  return n;
}

function firstOf(w: World, kind: Kind): number {
  for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && w.kind[i] === kind) return i;
  return -1;
}

/** Step the spawner until pred holds (or the limit), returning the steps taken. */
function stepUntil(w: World, pred: () => boolean, limit = 20 * 120): number {
  let n = 0;
  while (!pred() && n < limit) {
    stepSpawner(w, DT);
    n++;
  }
  return n;
}

describe('spawn sfx from a wave', () => {
  it('plays once, on the step the first telegraph appears, not once per enemy', () => {
    const wave: WaveDef = {
      index: 0,
      atSec: 1,
      pattern: 'edges',
      entries: [entry({ x: 400, y: 0 }), entry({ tOffsetSec: 0.2, x: -400, y: 0 }), entry({ tOffsetSec: 0.4, x: 0, y: 300 })],
    };
    const { w } = makeGame(wavesLevel([wave]));
    const sfx = listen();
    stepUntil(w, () => liveWave(w) === 1);
    expect(liveWave(w)).toBe(1);
    expect(sfx).toEqual(['spawn']);
    stepUntil(w, () => liveWave(w) === 3);
    for (let i = 0; i < 240; i++) stepSpawner(w, DT);
    expect(liveWave(w)).toBe(3);
    expect(sfx).toEqual(['spawn']);
  });

  it('plays nothing before the first telegraph exists', () => {
    const wave: WaveDef = { index: 0, atSec: 1, pattern: 'edges', entries: [entry({})] };
    const { w } = makeGame(wavesLevel([wave]));
    const sfx = listen();
    for (let i = 0; i < 110; i++) stepSpawner(w, DT);
    expect(liveWave(w)).toBe(0);
    expect(sfx).toEqual([]);
  });

  it('plays once per wave for several waves', () => {
    const waves: WaveDef[] = [1, 2, 3].map((s, index) => ({
      index,
      atSec: s,
      pattern: 'edges',
      entries: [entry({ x: 300 + index * 40, y: 100 }), entry({ tOffsetSec: 0.1, x: -300 - index * 40, y: 100 })],
    }));
    const { w } = makeGame(wavesLevel(waves));
    const sfx = listen();
    for (let i = 0; i < 4 * 120; i++) stepSpawner(w, DT);
    expect(liveWave(w)).toBe(6);
    expect(sfx).toEqual(['spawn', 'spawn', 'spawn']);
  });

  it('plays once per loop pass of a looping wave', () => {
    const wave: WaveDef = { index: 0, atSec: 0.5, pattern: 'edges', entries: [entry({}), entry({ tOffsetSec: 0.1, x: -400 })] };
    const { w } = makeGame(wavesLevel([wave], { loopFromIndex: 0, loopPeriodSec: 2 }), { logSpawns: true });
    const sfx = listen();
    for (let i = 0; i < 7 * 120; i++) stepSpawner(w, DT);
    expect(sfx).toEqual(['spawn', 'spawn', 'spawn', 'spawn']);
    expect(gameState(w).spawnLog?.length).toBe(8);
  });

  it('a wave with no kind in the roster plays nothing', () => {
    const wave: WaveDef = { index: 0, atSec: 0.1, pattern: 'edges', entries: [entry({ kind: 'snake' }), entry({ kind: 'dart', x: -400 })] };
    const { w } = makeGame(wavesLevel([wave]));
    const sfx = listen();
    for (let i = 0; i < 120; i++) stepSpawner(w, DT);
    expect(liveWave(w)).toBe(0);
    expect(sfx).toEqual([]);
  });

  it('waits for the telegraph when maxLiveEnemies holds the wave back', () => {
    const waves: WaveDef[] = [
      { index: 0, atSec: 0.5, pattern: 'edges', entries: [entry({ x: 400, y: 100 })] },
      { index: 1, atSec: 1, pattern: 'edges', entries: [entry({ x: -400, y: 100 })] },
    ];
    const { w } = makeGame(wavesLevel(waves, { maxLiveEnemies: 1 }));
    const sfx = listen();
    for (let i = 0; i < 3 * 120; i++) stepSpawner(w, DT);
    expect(liveWave(w)).toBe(1);
    expect(gameState(w).queueLen).toBe(1);
    expect(sfx).toEqual(['spawn']); // wave 2 is due but nothing of it is on screen yet
    removeEntity(w, firstOf(w, Kind.Grunt));
    stepSpawner(w, DT);
    expect(liveWave(w)).toBe(1);
    expect(sfx).toEqual(['spawn', 'spawn']);
  });

  it('plays nothing while the ship is dead and the wave clock is paused', () => {
    const wave: WaveDef = { index: 0, atSec: 0.5, pattern: 'edges', entries: [entry({})] };
    const { w } = makeGame(wavesLevel([wave]));
    const sfx = listen();
    deactivateShip(w);
    for (let i = 0; i < 2 * 120; i++) stepSpawner(w, DT);
    expect(sfx).toEqual([]);
    expect(gameState(w).waveClock).toBe(0);
  });
});

describe('spawn sfx from a hazard spawner', () => {
  it('plays once when the hazard spawner telegraph starts, and not again', () => {
    const spawners = [{ x: 300, y: 200, spawnAtSec: 1, emitEverySec: 0, dartsPerEmit: 0 }];
    const { w } = makeGame({ hazards: { wells: [], spawners } });
    const sfx = listen();
    for (let i = 0; i < 110; i++) stepSpawner(w, DT);
    expect(sfx).toEqual([]);
    stepUntil(w, () => firstOf(w, Kind.Spawner) >= 0);
    expect(firstOf(w, Kind.Spawner)).toBeGreaterThan(0);
    expect(sfx).toEqual(['spawn']);
    for (let i = 0; i < 3 * 120; i++) stepSpawner(w, DT);
    expect(sfx).toEqual(['spawn']);
  });
});

describe('spawn sfx contract with the audio tables', () => {
  it('spawn resolves to the telegraph cue, which is defined', () => {
    expect(SFX_TO_CUE.spawn).toBe('telegraph');
    expect(cueForSfx('spawn', false)).toBe('telegraph');
    expect(CUES.telegraph.voices.length).toBeGreaterThan(0);
  });

  it('a full level only emits sfx names that resolve to a defined cue, with spawn once per wave', () => {
    const w = createGame(FIXTURE_RECT_EASY, { logSpawns: true, vibrate: () => undefined });
    const sfx = listen();
    const input = idle();
    for (let i = 0; i < 30 * 120; i++) stepGame(w, DT, input);
    const spawns = sfx.filter((n) => n === 'spawn').length;
    const entries = gameState(w).spawnLog?.length ?? 0;
    expect(spawns).toBeGreaterThan(2);
    expect(spawns).toBeLessThan(entries); // waves hold several entries each: not one cue per enemy
    expect(spawns).toBeLessThanOrEqual(gameState(w).waveSeq + FIXTURE_RECT_EASY.hazards.spawners.length);
    for (const name of new Set(sfx)) expect(CUES[cueForSfx(name, false)].voices.length).toBeGreaterThan(0);
  });
});

describe('spawn sfx is sim neutral', () => {
  interface RunResult {
    log: string;
    score: number;
    live: number;
    waveSeq: number;
  }

  function run(listening: boolean): RunResult {
    const w = createGame(FIXTURE_RECT_EASY, { logSpawns: true, vibrate: () => undefined });
    if (listening) listen();
    const input = idle();
    for (let i = 0; i < 40 * 120; i++) stepGame(w, DT, input);
    const g = gameState(w);
    return { log: JSON.stringify(g.spawnLog), score: g.score, live: w.liveCount, waveSeq: g.waveSeq };
  }

  it('the same level replays identically with and without a listener', () => {
    const a = run(false);
    bus.clear();
    const b = run(true);
    expect(a.log.length).toBeGreaterThan(100);
    expect(b).toEqual(a);
  });
});
