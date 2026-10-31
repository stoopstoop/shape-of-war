// Shared harness for the v3 QA boss tests (bossReplay, bossFairnessSweep). Not a test: vitest only
// collects *.test.ts. Everything here is a pure function of (LevelDef, step, seed, world state), so
// no Math.random and no wall clock. Boss levels come from the real generator (generateLevel with
// the default config), then get two patches that both ride along in the recorded LevelDef: lives 99
// (a fuzzed ship dies a lot and a lost level would end the session) and a boss entrance at 2 s
// instead of 20 s (so a 60 s session is mostly fight).
import { bus } from '../../src/core/events';
import { hash01 } from '../../src/core/rng';
import { bossOf } from '../../src/game/bosses/state';
import { enemyBulletsOf } from '../../src/game/enemyBullets';
import { createGame, stepGame } from '../../src/game/game';
import { gs, isHostile } from '../../src/game/state';
import { Kind } from '../../src/game/world';
import type { World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import { generateLevel } from '../../src/levelgen/generator';
import { BOSS_SCHEDULE } from '../../src/levelgen/boss';
import type { BossId, LevelDef } from '../../src/levelgen/leveldef';

export const DT = 1 / 120;
/** Scope trim agreed in the v3 harden brief: 60 s of sim time per boss, not 120 s. */
export const SESSION_SECONDS = 60;
export const SESSION_STEPS = SESSION_SECONDS * 120;
export const ENTRANCE_AT_SEC = 2;
export const BOSS_IDS: readonly BossId[] = BOSS_SCHEDULE.map((r) => r.id);

/** One input frame as plain numbers so a log survives a JSON round trip: move x, y, aim x, y, flags (1 bomb, 2 super). */
export type InputRec = [mx: number, my: number, ax: number, ay: number, flags: number];

/** The generated boss level of id for a run seed, patched as described above, copied through JSON. */
export function bossLevelFor(id: BossId, runSeed = 42): LevelDef {
  const row = BOSS_SCHEDULE.find((r) => r.id === id);
  if (row === undefined) throw new Error('no schedule row for ' + id);
  const gen = generateLevel(runSeed, row.levelIndex);
  if (gen.boss === undefined || gen.boss.id !== id) throw new Error('level ' + String(row.levelIndex) + ' has no ' + id + ' boss');
  const patched: LevelDef = { ...gen, lives: 99, boss: { ...gen.boss, atSec: ENTRANCE_AT_SEC } };
  return JSON.parse(JSON.stringify(patched)) as LevelDef;
}

export function idleInput(): InputState {
  return { move: { active: false, x: 0, y: 0 }, aim: { active: false, x: 0, y: 0 }, bomb: false, superPressed: false, pause: false };
}

export function recToInput(rec: InputRec, out: InputState): InputState {
  const [mx, my, ax, ay, flags] = rec;
  out.move.active = mx !== 0 || my !== 0;
  out.move.x = mx;
  out.move.y = my;
  out.aim.active = ax !== 0 || ay !== 0;
  out.aim.x = ax;
  out.aim.y = ay;
  out.bomb = (flags & 1) !== 0;
  out.superPressed = (flags & 2) !== 0;
  out.pause = false;
  return out;
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** The boss body while it is alive, else the nearest live hostile to the ship. -1 if there is none. */
function targetOf(w: World): number {
  const s = bossOf(w);
  if (s !== null && s.id > 0 && w.alive[s.id] === 1 && w.kind[s.id] === Kind.Boss) return s.id;
  const sx = w.x[0] ?? 0;
  const sy = w.y[0] ?? 0;
  let best = -1;
  let bd = Infinity;
  for (let i = 1; i < w.cap; i++) {
    if (w.alive[i] !== 1 || !isHostile(w.kind[i] ?? 0)) continue;
    const d = Math.hypot((w.x[i] ?? 0) - sx, (w.y[i] ?? 0) - sy);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/**
 * The player model of a session. mode 0 strafes the target at about 300 u and shoots it (the fight
 * the replay needs). mode 1 is a random walk with random aim (the fuzz). mode 2 chases the target and
 * bombs and supers on a timer (forces contact). mode 3 never moves and shoots (the ship a hazard
 * must not be born on). All draws are hash01 of (seed, step), never a PRNG.
 */
export function playerInput(w: World, step: number, seed: number, mode: number): InputRec {
  const sx = w.x[0] ?? 0;
  const sy = w.y[0] ?? 0;
  const tgt = targetOf(w);
  const tx = tgt > 0 ? (w.x[tgt] ?? 0) : 0;
  const ty = tgt > 0 ? (w.y[tgt] ?? 0) : 0;
  const d = Math.hypot(tx - sx, ty - sy);
  const ux = d > 1e-6 ? (tx - sx) / d : 0;
  const uy = d > 1e-6 ? (ty - sy) / d : 0;
  const slot = Math.floor(step / 36);
  let mx = 0;
  let my = 0;
  let ax = ux;
  let ay = uy;
  let flags = 0;
  if (mode === 0) {
    const side = hash01(seed, slot >> 3) < 0.5 ? 1 : -1;
    const toward = d > 420 ? 1 : d < 220 ? -1 : 0;
    mx = -uy * side + ux * toward;
    my = ux * side + uy * toward;
    flags = step % 3000 === 2999 ? 1 : 0;
  } else if (mode === 1) {
    const ang = hash01(seed, slot) * Math.PI * 2;
    const still = hash01(seed, slot + 100003) < 0.15;
    mx = still ? 0 : Math.cos(ang);
    my = still ? 0 : Math.sin(ang);
    const aim = hash01(seed, (slot >> 1) + 200003) * Math.PI * 2;
    const fire = hash01(seed, slot + 300007) < 0.85;
    ax = fire ? Math.cos(aim) : 0;
    ay = fire ? Math.sin(aim) : 0;
    flags = (hash01(seed, step + 400009) < 1 / 2400 ? 1 : 0) | (hash01(seed, step + 500009) < 1 / 3000 ? 2 : 0);
  } else if (mode === 2) {
    mx = ux;
    my = uy;
    flags = (step % 2400 === 2399 ? 1 : 0) | (step % 2000 === 1999 ? 2 : 0);
  }
  return [round3(mx), round3(my), round3(ax), round3(ay), flags];
}

/** Per tick numbers of the boss, its parts and hazards, the adds, the enemy bullets, score and lives. */
export function tickDigest(w: World): number[] {
  const s = bossOf(w);
  const b = s === null ? -1 : s.id;
  const out: number[] = [b > 0 ? (w.x[b] ?? 0) : 0, b > 0 ? (w.y[b] ?? 0) : 0, b > 0 ? (w.hp[b] ?? 0) : 0, s === null ? -1 : s.viewMode, s === null ? 0 : s.phase];
  let hazards = 0;
  let parts = 0;
  let hSum = 0;
  let pSum = 0;
  let adds = 0;
  for (let i = 1; i < w.cap; i++) {
    if (w.alive[i] !== 1) continue;
    const k = w.kind[i] ?? 0;
    const sig = i * 7 + (w.a[i] ?? 0) + (w.x[i] ?? 0) + (w.y[i] ?? 0) * 3 + (w.rot[i] ?? 0) * 11 + (w.radius[i] ?? 0) + (w.t[i] ?? 0) + (w.hp[i] ?? 0) * 13;
    if (k === Kind.BossHazard) {
      hazards++;
      hSum += sig;
    } else if (k === Kind.BossPart) {
      parts++;
      pSum += sig;
    } else if (isHostile(k)) adds++;
  }
  const pool = enemyBulletsOf(w);
  let bSum = 0;
  for (let i = 0; i < pool.cap; i++) if (pool.alive[i] === 1) bSum += i * 5 + (pool.x[i] ?? 0) + (pool.y[i] ?? 0) * 3 + (pool.vx[i] ?? 0) * 7;
  const g = gs(w);
  out.push(hazards, hSum, parts, pSum, adds, pool.liveCount, bSum, g.score, g.lives, w.x[0] ?? 0, w.y[0] ?? 0);
  return out;
}

/** Subscribe to every boss event and the ship death, writing one string per event. Returns the unsubscribe. */
export function recordEvents(log: string[], now: () => number): () => void {
  const offs = [
    bus.on('sim:bossEnter', (e) => log.push(String(now()) + '|enter|' + JSON.stringify(e))),
    bus.on('sim:bossPhase', (e) => log.push(String(now()) + '|phase|' + JSON.stringify(e))),
    bus.on('sim:bossDown', (e) => log.push(String(now()) + '|down|' + JSON.stringify(e))),
    bus.on('sim:bossExposed', (e) => log.push(String(now()) + '|exposed|' + JSON.stringify(e))),
    bus.on('sim:bossWindow', (e) => log.push(String(now()) + '|window|' + JSON.stringify(e))),
    bus.on('sim:bossCrack', (e) => log.push(String(now()) + '|crack|' + JSON.stringify(e))),
    bus.on('fx:bossShot', (e) => log.push(String(now()) + '|shot|' + JSON.stringify(e))),
    bus.on('fx:death', (e) => log.push(String(now()) + '|death|' + JSON.stringify(e))),
  ];
  return () => {
    for (const off of offs) off();
  };
}

export interface Session {
  inputs: InputRec[];
  digests: number[][];
  events: string[];
  steps: number;
}

/**
 * Play level for steps ticks. With a log, replay it blind (no world reads for input). Without, drive
 * the player model and record the log.
 */
export function play(level: LevelDef, steps: number, seed: number, mode: number, log: readonly InputRec[] | null): Session {
  const w = createGame(level, { vibrate: () => undefined });
  const events: string[] = [];
  let step = 0;
  const off = recordEvents(events, () => step);
  const inputs: InputRec[] = [];
  const digests: number[][] = [];
  const frame = idleInput();
  try {
    for (; step < steps; step++) {
      const rec = log === null ? playerInput(w, step, seed, mode) : (log[step] ?? [0, 0, 0, 0, 0]);
      if (log === null) inputs.push(rec);
      stepGame(w, DT, recToInput(rec, frame));
      digests.push(tickDigest(w));
    }
  } finally {
    off();
  }
  return { inputs: log === null ? inputs : [...log], digests, events, steps: step };
}

/** Index of the first tick whose digest differs, or -1. */
export function firstDiff(a: readonly number[][], b: readonly number[][]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined || x.length !== y.length) return i;
    for (let j = 0; j < x.length; j++) if (x[j] !== y[j]) return i;
  }
  return -1;
}
