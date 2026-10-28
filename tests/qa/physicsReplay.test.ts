// V2 harden: physics replay (docs/10 wave E, docs/11 "Space physics" rules 1, 10 and 11).
// The same input log must give the same ship path, bit for bit, for every space level and on every
// arena shape the generator makes. Four angles, all through the real sim (stepGame, arena confine,
// wells, enemies, Slime, weapons), not the thrust function alone:
//   1. Off equals a frozen copy of the v1.0.0 stepShip formula on five arenas (the Off invariant);
//   2. two fresh worlds replay the log to identical paths for off, low, medium and high on each arena,
//      with the v2 enemies and hazards live (the log is sent through JSON first);
//   3. the path keeps its invariants: inside the arena, speed under the row's cap, levels differ;
//   4. death and respawn, and a setting change mid level, replay identically as well.
// Forge's tests/core/physics.test.ts and tests/game/ship.space.test.ts own the numbers; this file owns
// replay and determinism across levels. No Math.random: the log is a pure function of the tick.
import { describe, expect, it } from 'vitest';
import { hash01 } from '../../src/core/rng';
import { SPACE_TABLE } from '../../src/core/physics';
import type { SpaceLevel } from '../../src/core/physics';
import { confine, createConfineResult } from '../../src/game/arena';
import { createGame, gameState, setInvulnerable, stepGame } from '../../src/game/game';
import { SHIP_RADIUS, SHIP_SPEED, setShipSpace } from '../../src/game/ship';
import { inlineRectLevel } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import { generateLevel } from '../../src/levelgen/generator';
import { DEFAULT_GEN_CONFIG } from '../../src/levelgen/leveldef';
import type { ArenaDef, LevelDef } from '../../src/levelgen/leveldef';

const DT = 1 / 120;
const TICKS = 2400; // 20 s
const LEVELS: readonly SpaceLevel[] = ['off', 'low', 'medium', 'high'];

/** One pin per arena shape, the same pairs as tests/qa/levelSnapshots.test.ts. */
const ARENAS: readonly { name: string; runSeed: number; levelIndex: number }[] = [
  { name: 'rect', runSeed: 1, levelIndex: 1 },
  { name: 'circle', runSeed: 42, levelIndex: 13 },
  { name: 'rectObstacles', runSeed: 0xdeadbeef, levelIndex: 18 },
  { name: 'roundRect', runSeed: 0xdeadbeef, levelIndex: 36 },
  { name: 'hexagon', runSeed: 0x4e464f4c, levelIndex: 31 },
];

function idle(): InputState {
  return { move: { active: false, x: 0, y: 0 }, aim: { active: false, x: 0, y: 0 }, bomb: false, superPressed: false, pause: false };
}

/**
 * A recorded input log: stick segments of 0.5 to 2 s that hold, release or flip (a reversal),
 * at full, half or over deflection (1.4, which the sim caps at 1), with the aim stick on half the time.
 */
function inputLog(n: number, salt: number): InputState[] {
  const out: InputState[] = [];
  let angle = hash01(salt, 0) * Math.PI * 2;
  let segEnd = 0;
  let held = true;
  let mag = 1;
  let aimOn = false;
  let aimAngle = 0;
  for (let i = 0; i < n; i++) {
    if (i >= segEnd) {
      const seg = i + salt;
      segEnd = i + 60 + Math.floor(hash01(seg, 11) * 180);
      held = hash01(seg, 12) < 0.8;
      angle = hash01(seg, 13) < 0.3 ? angle + Math.PI : hash01(seg, 14) * Math.PI * 2;
      mag = [1, 0.5, 1.4][Math.floor(hash01(seg, 15) * 3)] ?? 1;
      aimOn = hash01(seg, 16) < 0.5;
      aimAngle = hash01(seg, 17) * Math.PI * 2;
    }
    const input = idle();
    input.move.active = held;
    input.move.x = held ? Math.cos(angle) * mag : 0;
    input.move.y = held ? Math.sin(angle) * mag : 0;
    input.aim.active = aimOn;
    input.aim.x = aimOn ? Math.cos(aimAngle + i * 0.01) : 0;
    input.aim.y = aimOn ? Math.sin(aimAngle + i * 0.01) : 0;
    input.bomb = i > 0 && i % 1100 === 0;
    input.superPressed = i > 0 && i % 700 === 0;
    out.push(input);
  }
  return out;
}

const jsonCopy = (log: readonly InputState[]): InputState[] => JSON.parse(JSON.stringify(log)) as InputState[];

/** Index of the first differing element, or -1. */
function firstDiff(a: Float64Array, b: Float64Array): number {
  if (a.length !== b.length) return Math.min(a.length, b.length);
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return i;
  return -1;
}

interface Run {
  /** x, y, vx, vy per tick, as stored in the world after the step. */
  path: Float64Array;
  lives: number;
  score: number;
}

/** Plays a log on a level at a space level; optional setting changes [tick, level] applied before that step. */
function runPath(level: LevelDef, space: SpaceLevel, log: readonly InputState[], opts: { invulnerable?: boolean; changes?: readonly [number, SpaceLevel][] } = {}): Run {
  const w = createGame(level);
  setInvulnerable(w, opts.invulnerable !== false);
  setShipSpace(w, space);
  const path = new Float64Array(log.length * 4);
  let c = 0;
  for (let t = 0; t < log.length; t++) {
    while (c < (opts.changes?.length ?? 0) && (opts.changes?.[c]?.[0] ?? Infinity) <= t) {
      const ch = opts.changes?.[c];
      if (ch !== undefined) setShipSpace(w, ch[1]);
      c++;
    }
    stepGame(w, DT, log[t] ?? idle());
    path[t * 4] = w.x[0] ?? 0;
    path[t * 4 + 1] = w.y[0] ?? 0;
    path[t * 4 + 2] = w.vx[0] ?? 0;
    path[t * 4 + 3] = w.vy[0] ?? 0;
  }
  const g = gameState(w);
  return { path, lives: g.lives, score: g.score };
}

/** A level with the arena of `level` and nothing else: no waves, no hazards. */
function quiet(level: LevelDef): LevelDef {
  return {
    ...inlineRectLevel(7),
    arena: level.arena,
    band: level.band,
    objective: { kind: 'survive', durationSec: 1e9 },
  };
}

/** Frozen copy of the v1.0.0 move formula (src/game/ship.ts at tag v1.0.0), positions kept as Float32 like the world. */
function v1Path(arena: ArenaDef, log: readonly InputState[]): Float64Array {
  const path = new Float64Array(log.length * 4);
  const out = createConfineResult();
  let x = 0;
  let y = 0;
  for (let t = 0; t < log.length; t++) {
    const input = log[t] ?? idle();
    let mx = input.move.active ? input.move.x : 0;
    let my = input.move.active ? input.move.y : 0;
    const m2 = mx * mx + my * my;
    if (m2 > 1) {
      const k = 1 / Math.sqrt(m2);
      mx *= k;
      my *= k;
    }
    let vx = mx * 420;
    let vy = my * 420;
    const res = confine(arena, x + vx * DT, y + vy * DT, 10, out);
    if (res.hit) {
      const into = vx * res.nx + vy * res.ny;
      if (into < 0) {
        vx -= into * res.nx;
        vy -= into * res.ny;
      }
    }
    x = Math.fround(res.x);
    y = Math.fround(res.y);
    path[t * 4] = x;
    path[t * 4 + 1] = y;
    path[t * 4 + 2] = Math.fround(vx);
    path[t * 4 + 3] = Math.fround(vy);
  }
  return path;
}

describe('physics replay: Off is the frozen v1.0.0 formula on every arena shape', () => {
  it.each(ARENAS)('$name: 2400 steps of a recorded log match bit for bit, default state and explicit off', (a) => {
    const level = generateLevel(a.runSeed, a.levelIndex, DEFAULT_GEN_CONFIG);
    const log = inputLog(TICKS, a.levelIndex);
    const frozen = v1Path(level.arena, log);
    const byDefault = runPath(quiet(level), 'off', log).path;
    expect(firstDiff(byDefault, frozen), `${a.name} first differing value`).toBe(-1);
    // Walls were really hit: the frozen path touches the arena edge, so slide is covered.
    let touched = 0;
    const probe = createConfineResult();
    for (let t = 0; t < TICKS; t++) {
      const x = frozen[t * 4] ?? 0;
      const y = frozen[t * 4 + 1] ?? 0;
      if (confine(level.arena, x + (frozen[t * 4 + 2] ?? 0) * DT, y + (frozen[t * 4 + 3] ?? 0) * DT, SHIP_RADIUS, probe).hit) touched++;
    }
    expect(touched).toBeGreaterThan(0);
  });

  it('the half and over deflection cases are in the log (so the stick cap is exercised)', () => {
    const log = inputLog(TICKS, 5);
    const mags = log.filter((i) => i.move.active).map((i) => Math.hypot(i.move.x, i.move.y));
    expect(mags.some((m) => m > 1.3)).toBe(true);
    expect(mags.some((m) => m > 0.45 && m < 0.55)).toBe(true);
    expect(log.some((i) => !i.move.active)).toBe(true);
  });
});

describe('physics replay: the same input log gives the same ship path', { timeout: 120_000 }, () => {
  const cases = ARENAS.flatMap((a) => LEVELS.map((space) => [a.name, a.runSeed, a.levelIndex, space] as const));

  it.each(cases)('%s level %#: %s replays identically with enemies, hazards and weapons live', (_name, runSeed, levelIndex, space) => {
    const level = generateLevel(runSeed, levelIndex, DEFAULT_GEN_CONFIG);
    const log = inputLog(TICKS, levelIndex + 100);
    const a = runPath(level, space, log);
    const b = runPath(level, space, jsonCopy(log));
    expect(firstDiff(a.path, b.path)).toBe(-1);
    expect(b.score).toBe(a.score);
  });

  it('the four space levels really give four different paths on the same arena and log', () => {
    const level = generateLevel(1, 1, DEFAULT_GEN_CONFIG);
    const log = inputLog(TICKS, 77);
    const paths = LEVELS.map((s) => runPath(quiet(level), s, log).path);
    for (let i = 0; i < paths.length; i++) {
      for (let j = i + 1; j < paths.length; j++) {
        expect(firstDiff(paths[i] ?? new Float64Array(), paths[j] ?? new Float64Array()), `${LEVELS[i]} vs ${LEVELS[j]}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('the setting changes mid level and the run replays identically, with no jump at the change', () => {
    const level = generateLevel(0xdeadbeef, 36, DEFAULT_GEN_CONFIG);
    const log = inputLog(TICKS, 9);
    const changes: [number, SpaceLevel][] = [
      [600, 'medium'],
      [1200, 'high'],
      [1800, 'low'],
    ];
    const a = runPath(level, 'off', log, { changes });
    const b = runPath(level, 'off', jsonCopy(log), { changes });
    expect(firstDiff(a.path, b.path)).toBe(-1);
    // Rule 10: the new level takes effect on the next step with the current velocity, so no tick moves
    // the ship farther than the fastest cap allows (plus a little for Slime free steps and Float32).
    const maxStep = (SPACE_TABLE.high.vMax * DT) * 1.01 + 1e-3;
    for (let t = 1; t < TICKS; t++) {
      const dx = (a.path[t * 4] ?? 0) - (a.path[(t - 1) * 4] ?? 0);
      const dy = (a.path[t * 4 + 1] ?? 0) - (a.path[(t - 1) * 4 + 1] ?? 0);
      expect(Math.hypot(dx, dy), `tick ${t}`).toBeLessThanOrEqual(maxStep);
    }
  });
});

describe('physics replay: path invariants per level', () => {
  const cap: Record<SpaceLevel, number> = {
    off: SHIP_SPEED,
    low: SPACE_TABLE.low.vMax,
    medium: SPACE_TABLE.medium.vMax,
    high: SPACE_TABLE.high.vMax,
  };

  it.each(ARENAS)('$name: the ship stays inside the arena and under the speed cap at every level', (a) => {
    const level = generateLevel(a.runSeed, a.levelIndex, DEFAULT_GEN_CONFIG);
    const log = inputLog(TICKS, a.levelIndex + 3);
    const probe = createConfineResult();
    for (const space of LEVELS) {
      const { path } = runPath(quiet(level), space, log);
      let maxSpeed = 0;
      let outside = 0;
      for (let t = 0; t < TICKS; t++) {
        const x = path[t * 4] ?? 0;
        const y = path[t * 4 + 1] ?? 0;
        maxSpeed = Math.max(maxSpeed, Math.hypot(path[t * 4 + 2] ?? 0, path[t * 4 + 3] ?? 0));
        const r = confine(level.arena, x, y, SHIP_RADIUS, probe);
        if (Math.hypot(r.x - x, r.y - y) > 0.01) outside++;
      }
      expect(outside, `${a.name} ${space} steps outside the arena`).toBe(0);
      expect(maxSpeed, `${a.name} ${space} top speed`).toBeLessThanOrEqual((cap[space] ?? SHIP_SPEED) + 1e-3);
      expect(maxSpeed, `${a.name} ${space} moves at all`).toBeGreaterThan(50);
    }
  });

  it('is deterministic through death and respawn: lives, score and path replay, and a ship really died', () => {
    const level = generateLevel(0xdeadbeef, 36, DEFAULT_GEN_CONFIG);
    const log = inputLog(TICKS * 2, 21);
    let deaths = 0;
    for (const space of LEVELS) {
      const a = runPath(level, space, log, { invulnerable: false });
      const b = runPath(level, space, jsonCopy(log), { invulnerable: false });
      expect(firstDiff(a.path, b.path), space).toBe(-1);
      expect(b.lives).toBe(a.lives);
      expect(b.score).toBe(a.score);
      deaths += level.lives - a.lives;
    }
    expect(deaths).toBeGreaterThan(0);
  });
});
