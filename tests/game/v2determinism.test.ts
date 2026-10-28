// V2 enemies in play: the spawner accepts the six new EnemyKind names from a LevelDef, the run is
// deterministic (same LevelDef and input log give the same spawn and event log over 60 s), and
// 400 live entities including every new kind hold without per step allocation.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { hash01 } from '../../src/core/rng';
import * as blink from '../../src/game/enemies/blink';
import * as bulwark from '../../src/game/enemies/bulwark';
import * as charger from '../../src/game/enemies/charger';
import * as grunt from '../../src/game/enemies/grunt';
import * as mine from '../../src/game/enemies/mine';
import * as slime from '../../src/game/enemies/slime';
import * as sower from '../../src/game/enemies/sower';
import * as splime from '../../src/game/enemies/splime';
import * as swirl from '../../src/game/enemies/swirl';
import type { EnemyDef } from '../../src/game/enemies/types';
import { killEnemy } from '../../src/game/combat';
import { defOf, kindOf } from '../../src/game/defs';
import { createGame, setInvulnerable, stepGame } from '../../src/game/game';
import { gs, isWaveEnemy, spawnFromDef } from '../../src/game/state';
import { Kind, liveEnemies } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import type { EnemyKind, LevelDef, SpawnEntry, WaveDef } from '../../src/levelgen/leveldef';
import { V2_ENEMY_KINDS } from '../../src/levelgen/leveldef';
import { DT, idle, makeGame, quietLevel } from './helpers';

afterEach(() => bus.clear());

const KINDS: EnemyKind[] = ['grunt', 'charger', 'bulwark', 'blink', 'swirl', 'sower', 'splime'];

function v2Level(seed: number): LevelDef {
  const waves: WaveDef[] = [];
  for (let i = 0; i < 12; i++) {
    const entries: SpawnEntry[] = [];
    for (let j = 0; j < 4; j++) {
      const kind = KINDS[(i + j) % KINDS.length] ?? 'grunt';
      const ring = j % 2 === 0;
      entries.push({
        kind,
        tOffsetSec: j * 0.25,
        mode: ring ? 'ring' : 'fixed',
        x: ring ? 0 : -500 + j * 300,
        y: ring ? 0 : (i % 2 === 0 ? -350 : 350),
        angleDeg: ring ? (i * 47 + j * 90) % 360 : 0,
        radius: ring ? 420 : 0,
        headingDeg: (i * 31) % 360,
      });
    }
    waves.push({ index: i, atSec: 1 + i * 4, pattern: 'ring', entries });
  }
  const base = quietLevel();
  return {
    ...base,
    seed,
    lives: 99,
    roster: KINDS.map((kind) => ({ kind, weight: 1 })),
    objective: { kind: 'survive', durationSec: 600 },
    waves: { ...base.waves, maxLiveEnemies: 40, waves, loopFromIndex: 0, loopPeriodSec: 48 },
  };
}

/** Deterministic input: circling move stick, sweeping aim, a bomb every 13 s. */
function inputAt(i: number, out: InputState): InputState {
  const t = i * DT;
  out.move.active = true;
  out.move.x = Math.cos(t * 0.7) * 0.9;
  out.move.y = Math.sin(t * 1.1) * 0.9;
  out.aim.active = true;
  out.aim.x = Math.cos(t * 2.3);
  out.aim.y = Math.sin(t * 2.3);
  out.bomb = i > 0 && i % (13 * 120) === 0;
  out.superPressed = i % (7 * 120) === 0;
  return out;
}

function run(level: LevelDef): { spawns: string[]; events: string[]; score: number } {
  const events: string[] = [];
  bus.on('sim:enemyEnter', (e) => events.push(`enter ${e.kind} ${e.live}`));
  bus.on('sim:enemyExit', (e) => events.push(`exit ${e.kind}`));
  bus.on('sim:threat', (e) => events.push(`threat ${e.level.toFixed(6)}`));
  bus.on('fx:kill', (e) => events.push(`kill ${e.x.toFixed(3)} ${e.y.toFixed(3)}`));
  bus.on('fx:death', () => events.push('death'));
  const w = createGame(level, { logSpawns: true, vibrate: () => undefined });
  const input = idle();
  for (let i = 0; i < 60 * 120; i++) stepGame(w, DT, inputAt(i, input));
  bus.clear();
  const spawns = (gs(w).spawnLog ?? []).map((s) => `${s.t.toFixed(4)} ${s.kind} ${s.x.toFixed(3)} ${s.y.toFixed(3)}`);
  return { spawns, events, score: gs(w).score };
}

describe('spawner and objective accept the new names', () => {
  it('kindOf and defOf cover every V2 EnemyKind, and each is a wave enemy', () => {
    for (const k of V2_ENEMY_KINDS) {
      const kind = kindOf(k);
      const d = defOf(kind);
      expect(d).not.toBeNull();
      expect(d?.kind).toBe(kind);
      expect(isWaveEnemy(kind)).toBe(true);
    }
    expect(isWaveEnemy(Kind.Mine)).toBe(false);
    expect(isWaveEnemy(Kind.Slime)).toBe(false);
  });

  it('a LevelDef naming every new kind spawns each of them', () => {
    const { spawns } = run(v2Level(42));
    const kinds = new Set(spawns.map((s) => Number(s.split(' ')[1])));
    for (const k of V2_ENEMY_KINDS) expect(kinds.has(kindOf(k))).toBe(true);
  });

  it('a destroy objective completes on new kind kills', () => {
    const { w } = makeGame({ objective: { kind: 'destroy', count: 3 } });
    const ids = [spawnFromDef(w, charger.def, 300, 0, 0), spawnFromDef(w, swirl.def, -300, 0, 0), spawnFromDef(w, mine.def, 0, -300, 0)];
    for (const id of ids) killEnemy(w, id, true);
    expect(gs(w).kills).toBe(2); // the Mine does not count
    stepGame(w, DT, idle());
    expect(gs(w).outcome).toBe('running');
    killEnemy(w, spawnFromDef(w, splime.def, 0, 300, 0), true);
    stepGame(w, DT, idle());
    expect(gs(w).outcome).toBe('won');
  });
});

describe('determinism', () => {
  it('same LevelDef and input log give an identical spawn and event log over 60 s', () => {
    const a = run(v2Level(42));
    const b = run(v2Level(42));
    expect(a.spawns.length).toBeGreaterThan(40);
    expect(a.events.length).toBeGreaterThan(600);
    expect(a.spawns).toEqual(b.spawns);
    expect(a.events).toEqual(b.events);
    expect(a.score).toBe(b.score);
    expect(a.events.some((e) => e.startsWith('enter blink'))).toBe(true);
  });

  it('a different seed changes the run', () => {
    const a = run(v2Level(42));
    const c = run(v2Level(43));
    expect(a.events).not.toEqual(c.events);
  });
});

describe('400 live entities with every new kind', () => {
  it('steps with bounded heap growth and stays fast', () => {
    const { w } = makeGame({ arena: { shape: 'rect', width: 1600, height: 1000, cornerRadius: 0, obstacles: [], spawnPoint: { x: 0, y: 0 } } });
    setInvulnerable(w, true);
    const defs: EnemyDef[] = [grunt.def, charger.def, bulwark.def, blink.def, swirl.def, sower.def, splime.def, mine.def, slime.def];
    for (let i = 0; i < 400; i++) {
      const d = defs[i % defs.length] ?? grunt.def;
      const id = spawnFromDef(w, d, (hash01(i, 1) - 0.5) * 1500, (hash01(i, 2) - 0.5) * 900, 0);
      w.rot[id] = hash01(i, 3) * 2 * Math.PI;
    }
    expect(liveEnemies(w)).toBe(400);
    const input = idle();
    for (let i = 0; i < 240; i++) stepGame(w, DT, input);
    const growth: number[] = [];
    const times: number[] = [];
    const steps = 1200;
    for (let r = 0; r < 3; r++) {
      const heap0 = process.memoryUsage().heapUsed;
      const t0 = performance.now();
      for (let i = 0; i < steps; i++) stepGame(w, DT, input);
      times.push((performance.now() - t0) / steps);
      growth.push(process.memoryUsage().heapUsed - heap0);
    }
    const grew = median(growth);
    const ms = median(times);
    console.log(`[stress v2] live ${liveEnemies(w)}, ${ms.toFixed(3)} ms/step median, heap +${(grew / 1024).toFixed(0)} KiB median`);
    expect(liveEnemies(w)).toBeGreaterThan(150); // Mines and Slime expire; drops refill some
    expect(grew).toBeLessThan(8 * 1024 * 1024);
    expect(ms).toBeLessThan(4);
  });

  it('a full world never throws and spawn returns -1', () => {
    const { w } = makeGame({}, { capacity: 64 });
    setInvulnerable(w, true);
    for (let i = 0; i < 80; i++) spawnFromDef(w, i % 2 === 0 ? sower.def : splime.def, (hash01(i, 5) - 0.5) * 1200, (hash01(i, 6) - 0.5) * 800, 0);
    expect(w.freeTop).toBe(0);
    expect(spawnFromDef(w, charger.def, 0, 0, 0)).toBe(-1);
    const input = idle();
    expect(() => {
      for (let i = 0; i < 120 * 10; i++) stepGame(w, DT, input);
    }).not.toThrow();
  });
});

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}
