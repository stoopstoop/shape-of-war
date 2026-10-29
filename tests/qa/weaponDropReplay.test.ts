// V2 harden: weapon drop log replay (docs/10 wave E, docs/11 SPEC 3.5 rules 1 to 4).
// The drop schedule is a function of the LevelDef (band, seed) and the order of scoring kills, and
// nothing else: no PRNG, no LevelDef field. Two proofs, both cross module (generator, sim, combat,
// ship, pickups, weapons):
//   1. A bot plays real generated levels with the real combat. Its input log and its scoring kill
//      log (every call into the pickup hook, with the sim tick and position) are recorded. A fresh
//      world on the same level with the waves removed then replays the two logs and must produce
//      the same drops, collections, weapon changes and a per tick trace of the weapon state.
//   2. A synthetic recorded kill log with idle time between kills replays twice, through a JSON
//      round trip, on generated levels of every band with the generator flag on and off: same drop
//      log, and the weapon schedule does not depend on the flag.
// No Math.random: the bot, the synthetic log and the checks are pure functions of the tick.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { bus } from '../../src/core/events';
import { hash01 } from '../../src/core/rng';
import { createEndlessGame, createGame, gameState, setInvulnerable, stepGame } from '../../src/game/game';
import type { World } from '../../src/game/world';
import { Kind } from '../../src/game/world';
import { isHostile } from '../../src/game/state';
import { livePickup, onScoringKill } from '../../src/game/pickup';
import { setWeaponPickups, weaponState, WEAPON_KINDS } from '../../src/game/weapons';
import type { InputState } from '../../src/input/types';
import { generateEndless, generateEndlessSegment, generateLevel } from '../../src/levelgen/generator';
import { DEFAULT_GEN_CONFIG, V1_GEN_CONFIG, V2_GEN_CONFIG } from '../../src/levelgen/leveldef';
import type { LevelDef } from '../../src/levelgen/leveldef';

/** Hooks around the pickup module's scoring kill entry point, set only while a session records. */
const hooks = vi.hoisted(() => ({
  before: null as ((x: number, y: number) => void) | null,
  after: null as ((w: World) => void) | null,
}));

vi.mock('../../src/game/pickup', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/game/pickup')>();
  return {
    ...real,
    onScoringKill: (w: World, x: number, y: number): void => {
      if (hooks.before !== null) hooks.before(x, y);
      real.onScoringKill(w, x, y);
      if (hooks.after !== null) hooks.after(w);
    },
  };
});

afterEach(() => {
  hooks.before = null;
  hooks.after = null;
  bus.clear();
});

const DT = 1 / 120;
const SESSION_TICKS = 12_000; // 100 s of sim time

type KillRec = [tick: number, x: number, y: number];

interface DropRec {
  tick: number;
  index: number;
  /** Pickup w.a: 1 rapid, 2 pierce, 3 orbit. */
  weapon: number;
  x: number;
  y: number;
  /** Ordinal of the scoring kill that spawned it, 1 based. */
  killNo: number;
}

/** Everything a session leaves behind that the replay must reproduce. */
interface Outcome {
  drops: DropRec[];
  collects: string[];
  equips: string[];
  /** One integer per tick: kills, drop index, weapon, timer, live pickup and its life. */
  trace: number[];
  kills: number;
}

interface Session extends Outcome {
  level: LevelDef;
  ticks: number;
  ended: boolean;
  inputs: InputState[];
  killLog: KillRec[];
}

function idleInput(): InputState {
  return { move: { active: false, x: 0, y: 0 }, aim: { active: false, x: 0, y: 0 }, bomb: false, superPressed: false, pause: false };
}

/** A bot that aims at the nearest enemy, heads for a live pickup, flees close enemies, else circles. */
function botInput(w: World, tick: number): InputState {
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
  const input = idleInput();
  if (best >= 0 && bd > 0 && bd < 900) {
    input.aim.active = true;
    input.aim.x = ((w.x[best] ?? 0) - sx) / bd;
    input.aim.y = ((w.y[best] ?? 0) - sy) / bd;
  }
  const pk = livePickup(w);
  let mx = Math.cos(tick * DT * 0.9);
  let my = Math.sin(tick * DT * 0.9);
  if (pk > 0) {
    const dx = (w.x[pk] ?? 0) - sx;
    const dy = (w.y[pk] ?? 0) - sy;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      mx = dx / d;
      my = dy / d;
    }
  } else if (best >= 0 && bd > 0 && bd < 260) {
    mx = (sx - (w.x[best] ?? 0)) / bd;
    my = (sy - (w.y[best] ?? 0)) / bd;
  }
  input.move.active = true;
  input.move.x = mx;
  input.move.y = my;
  input.bomb = tick % 1500 === 1499;
  input.superPressed = tick % 900 === 899;
  return input;
}

/** Per tick state the replay must match, as plain integers. Rounded so Float32 timers compare exactly. */
function traceOf(w: World): number {
  const s = weaponState(w);
  const pk = livePickup(w);
  const life = pk > 0 ? Math.round((w.t[pk] ?? 0) * 1e4) : -1;
  const kindIx = WEAPON_KINDS.indexOf(s.kind);
  return (((s.kills * 31 + s.dropIndex) * 7 + kindIx) * 100003 + Math.round(Math.max(0, s.timer) * 1e4) * 3 + (pk > 0 ? 1 : 0) * 17 + life) | 0;
}

/** Watches one world and builds the Outcome as ticks go by. stop() must run before the next session starts. */
function observer(): { start: (w: World) => void; tick: (w: World, tick: number) => void; stop: () => void; out: Outcome } {
  const out: Outcome = { drops: [], collects: [], equips: [], trace: [], kills: 0 };
  let lastKind = 'spread';
  let off: (() => void) | null = null;
  let current = 0;
  return {
    out,
    start: (w) => {
      off = bus.on('fx:pickup', (e) => out.collects.push(`${current}|${e.weapon}|${e.x}|${e.y}`));
      hooks.after = (world) => {
        out.kills++;
        const s = weaponState(world);
        if (s.dropIndex > out.drops.length) {
          const id = livePickup(world);
          out.drops.push({ tick: current, index: s.dropIndex - 1, weapon: w.a[id] ?? -1, x: w.x[id] ?? 0, y: w.y[id] ?? 0, killNo: out.kills });
        }
      };
    },
    tick: (w, tick) => {
      current = tick;
      const s = weaponState(w);
      if (s.kind !== lastKind) {
        out.equips.push(`${tick}|${lastKind}>${s.kind}`);
        lastKind = s.kind;
      }
      out.trace.push(traceOf(w));
    },
    stop: () => {
      if (off !== null) off();
      off = null;
      hooks.before = null;
      hooks.after = null;
    },
  };
}

/** The bot plays the real level; logs inputs and scoring kills. The ship cannot die, so the path is input only. */
function playBot(level: LevelDef): Session {
  const w = createGame(level);
  setInvulnerable(w, true);
  const obs = observer();
  const inputs: InputState[] = [];
  const killLog: KillRec[] = [];
  let tick = 0;
  obs.start(w);
  hooks.before = (x, y) => killLog.push([tick, x, y]);
  let ended = false;
  for (; tick < SESSION_TICKS; tick++) {
    const input = botInput(w, tick);
    inputs.push(input);
    obs.tick(w, tick); // state before this step, labels events of the step with its tick
    stepGame(w, DT, input);
    if (gameState(w).outcome !== 'running') {
      ended = true;
      tick++;
      break;
    }
  }
  obs.tick(w, tick);
  obs.stop();
  return { ...obs.out, level, ticks: tick, ended, inputs, killLog };
}

/**
 * Same level with no waves, no spawners and an endless survive objective; replays the logs and
 * nothing else. Wells stay: they pull the ship, so they are part of the path both runs share.
 */
function replayLogs(level: LevelDef, inputs: readonly InputState[], killLog: readonly KillRec[], ticks: number): Outcome {
  const quiet: LevelDef = {
    ...level,
    objective: { kind: 'survive', durationSec: 1e9 },
    waves: { ...level.waves, waves: [], loopFromIndex: 0, loopPeriodSec: 0 },
    hazards: { ...level.hazards, spawners: [] },
  };
  const w = createGame(quiet);
  setInvulnerable(w, true);
  const obs = observer();
  obs.start(w);
  let k = 0;
  for (let tick = 0; tick < ticks; tick++) {
    obs.tick(w, tick);
    stepGame(w, DT, inputs[tick] ?? idleInput());
    // A scoring kill of this tick happened after the pickup step and before the end of the step.
    while (k < killLog.length && (killLog[k]?.[0] ?? Infinity) === tick) {
      const rec = killLog[k];
      if (rec !== undefined) onScoringKill(w, rec[1], rec[2]);
      k++;
    }
  }
  obs.tick(w, ticks);
  obs.stop();
  return obs.out;
}

const POOLS: Record<number, readonly number[]> = { 1: [1], 2: [1, 2], 3: [1, 2, 3], 4: [1, 2, 3] };

/** The SPEC 3.5 rule 3 formula written out again, on pickup indices. */
function specWeapon(seed: number, index: number, pool: readonly number[], previous: number): number {
  let i = Math.min(pool.length - 1, Math.floor(hash01(seed, index) * pool.length));
  if (pool.length > 1 && pool[i] === previous) i = (i + 1) % pool.length;
  return pool[i] ?? -1;
}

/**
 * First run seed whose level has no gravity wells. A well is fed by the enemies around it and grows
 * tougher; in the replay world no enemy feeds it, so bullets would kill it and the two paths would
 * part. Levels without wells keep the replay exact. Wells are covered by physicsReplay.test.ts.
 */
function noWellSeed(levelIndex: number): number {
  for (let seed = 1; seed < 500; seed++) if (generateLevel(seed, levelIndex, V1_GEN_CONFIG).hazards.wells.length === 0) return seed;
  throw new Error(`no run seed under 500 gives a well free level ${levelIndex}`);
}

const BOT_LEVELS: readonly { name: string; runSeed: number; levelIndex: number }[] = [
  { name: 'level 1 (band 1)', runSeed: 1, levelIndex: 1 },
  { name: 'level 13 (band 2)', runSeed: 42, levelIndex: 13 },
  { name: 'level 18 (band 3)', runSeed: noWellSeed(18), levelIndex: 18 },
  { name: 'level 36 (band 4)', runSeed: noWellSeed(36), levelIndex: 36 },
  { name: 'level 31 (band 4)', runSeed: noWellSeed(31), levelIndex: 31 },
];

describe('weapon drop log replay from a recorded session', { timeout: 120_000 }, () => {
  // The v1 generator config keeps Slime out of the level, so the ship path is the input log alone.
  let sessions: Session[] = [];
  beforeAll(() => {
    sessions = BOT_LEVELS.map((l) => playBot(generateLevel(l.runSeed, l.levelIndex, V1_GEN_CONFIG)));
  }, 120_000);

  it('the harness assumption holds: every bot level is well free, spans the four bands and at least one has spawners', () => {
    expect(sessions.map((x) => x.level.hazards.wells.length)).toEqual([0, 0, 0, 0, 0]);
    expect(new Set(sessions.map((x) => x.level.band))).toEqual(new Set([1, 2, 3, 4]));
    expect(sessions.some((x) => x.level.hazards.spawners.length > 0)).toBe(true);
  });

  it('is not vacuous: the bot scores kills, collects pickups and sees more than one weapon', () => {
    const drops = sessions.flatMap((s) => s.drops);
    expect(drops.length).toBeGreaterThanOrEqual(4);
    expect(sessions.flatMap((s) => s.collects).length).toBeGreaterThanOrEqual(3);
    expect(new Set(drops.map((d) => d.weapon)).size).toBeGreaterThanOrEqual(2);
    expect(sessions.some((s) => s.drops.length >= 2)).toBe(true);
    for (const s of sessions) expect(s.killLog.length, s.level.levelIndex.toString()).toBe(s.kills);
  });

  it.each(BOT_LEVELS.map((l, i) => [l.name, i] as const))('%s: the logs replay to an identical drop log', (_name, i) => {
    const s = sessions[i];
    if (s === undefined) throw new Error('missing session');
    // The logs are data only: send them through JSON before replaying.
    const inputs = JSON.parse(JSON.stringify(s.inputs)) as InputState[];
    const killLog = JSON.parse(JSON.stringify(s.killLog)) as KillRec[];
    const r = replayLogs(s.level, inputs, killLog, s.ticks);
    expect(r.drops).toEqual(s.drops);
    expect(r.collects).toEqual(s.collects);
    expect(r.equips).toEqual(s.equips);
    expect(r.kills).toBe(s.kills);
    // clearPickup runs at the end of a finished level in the recording only.
    const n = s.ended ? s.trace.length - 1 : s.trace.length;
    expect(r.trace.slice(0, n)).toEqual(s.trace.slice(0, n));
  });

  it('a second recording of the same level with the same bot is identical to the first', () => {
    const again = playBot(sessions[1]?.level ?? generateLevel(42, 13, V1_GEN_CONFIG));
    expect(again.drops).toEqual(sessions[1]?.drops);
    expect(again.killLog).toEqual(sessions[1]?.killLog);
    expect(again.trace).toEqual(sessions[1]?.trace);
  });

  it('a level with gravity wells and spawners also records identically twice (wells feed on enemies, so only the recording is compared)', () => {
    let seed = 1;
    while (generateLevel(seed, 31, V1_GEN_CONFIG).hazards.wells.length === 0 && seed < 500) seed++;
    const level = generateLevel(seed, 31, V1_GEN_CONFIG);
    expect(level.hazards.wells.length).toBeGreaterThan(0);
    const a = playBot(level);
    const b = playBot(level);
    expect(a.kills).toBeGreaterThan(15);
    expect(b.drops).toEqual(a.drops);
    expect(b.killLog).toEqual(a.killLog);
    expect(b.trace).toEqual(a.trace);
  });

  it('every drop follows SPEC 3.5: pool by band, hash01 choice, no immediate repeat, first at kill 15, later ones not before kill 40, 65, ...', () => {
    for (const s of sessions) {
      let previous = 0;
      s.drops.forEach((d, n) => {
        const pool = POOLS[s.level.band] ?? [];
        expect(d.index, 'dropIndex counts up from 0').toBe(n);
        expect(d.weapon, `level ${s.level.levelIndex} drop ${n}`).toBe(specWeapon(s.level.seed, n, pool, previous));
        expect(pool).toContain(d.weapon);
        if (pool.length > 1) expect(d.weapon).not.toBe(previous);
        expect(d.killNo).toBeGreaterThanOrEqual(15 + 25 * n);
        previous = d.weapon;
      });
      if (s.drops[0] !== undefined) expect(s.drops[0].killNo).toBe(15);
    }
  });

  it('at most one pickup is live at any time and a collected weapon lasts 20 s', () => {
    const s = sessions[2];
    if (s === undefined) throw new Error('missing session');
    const w = createGame(s.level);
    setInvulnerable(w, true);
    let maxLive = 0;
    let lastEquip = -1;
    const off = bus.on('fx:pickup', () => {
      lastEquip = w.time;
    });
    for (let t = 0; t < s.ticks; t++) {
      stepGame(w, DT, s.inputs[t] ?? idleInput());
      let live = 0;
      for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && w.kind[i] === Kind.WeaponPickup) live++;
      maxLive = Math.max(maxLive, live);
      const ws = weaponState(w);
      if (ws.kind !== 'spread') expect(ws.timer).toBeLessThanOrEqual(20 + 1e-6);
      if (lastEquip >= 0 && ws.kind !== 'spread') expect(w.time - lastEquip).toBeLessThanOrEqual(20 + 1e-3);
    }
    off();
    expect(maxLive).toBeLessThanOrEqual(1);
  });
});

/** Synthetic recorded kill log: tick gaps and positions from hash01, no PRNG. */
function syntheticLog(n: number): KillRec[] {
  const out: KillRec[] = [];
  let tick = 0;
  for (let i = 0; i < n; i++) {
    tick += 10 + Math.floor(hash01(i, 3) * 70);
    out.push([tick, Math.round((hash01(i, 1) - 0.5) * 1200), Math.round((hash01(i, 2) - 0.5) * 700)]);
  }
  return out;
}

/** Plays a log into a quiet world; the ship walks to every live pickup it can reach in time. */
function playSynthetic(level: LevelDef, log: readonly KillRec[], pickups = true): { drops: string[]; collects: string[]; kills: number; counter: number } {
  const quiet: LevelDef = { ...level, objective: { kind: 'survive', durationSec: 1e9 }, waves: { ...level.waves, waves: [], loopFromIndex: 0, loopPeriodSec: 0 } };
  const w = createGame(quiet, { weaponPickups: pickups });
  setInvulnerable(w, true);
  const drops: string[] = [];
  const collects: string[] = [];
  let tick = 0;
  const off = bus.on('fx:pickup', (e) => collects.push(`${tick}|${e.weapon}|${e.x}|${e.y}`));
  const last = log[log.length - 1]?.[0] ?? 0;
  let k = 0;
  let kills = 0;
  for (; tick <= last + 1200; tick++) {
    stepGame(w, DT, idleInput());
    while (k < log.length && (log[k]?.[0] ?? Infinity) === tick) {
      const rec = log[k];
      const before = weaponState(w).dropIndex;
      if (rec !== undefined) onScoringKill(w, rec[1], rec[2]);
      kills++;
      const id = livePickup(w);
      if (weaponState(w).dropIndex > before) drops.push(`${tick}|${weaponState(w).dropIndex - 1}|${w.a[id] ?? -1}|${w.x[id]}|${w.y[id]}`);
      // Every other pickup (the 1st, 3rd, 5th, ...) is collected the moment it appears, the others run out their 8 s.
      if (id > 0 && weaponState(w).dropIndex % 2 === 1) {
        w.x[0] = w.x[id] ?? 0;
        w.y[0] = w.y[id] ?? 0;
      }
      k++;
    }
  }
  off();
  return { drops, collects, kills, counter: weaponState(w).kills };
}

const LEVELS_ALL_BANDS: readonly [number, number][] = [
  [1, 1],
  [42, 13],
  [0xdeadbeef, 18],
  [0xdeadbeef, 36],
  [0x4e464f4c, 31],
  [7, 60],
];

describe('weapon drop log replay from a synthetic kill log', { timeout: 120_000 }, () => {
  const log = syntheticLog(220);

  it.each(LEVELS_ALL_BANDS)('seed %i level %i: two fresh worlds give the same drop log, also from a JSON copy of the kill log', (runSeed, levelIndex) => {
    const level = generateLevel(runSeed, levelIndex);
    const a = playSynthetic(level, log);
    const b = playSynthetic(level, JSON.parse(JSON.stringify(log)) as KillRec[]);
    expect(a.drops.length).toBeGreaterThanOrEqual(5);
    expect(a.collects.length).toBeGreaterThanOrEqual(2);
    expect(b).toEqual(a);
  });

  it('the weapon schedule does not depend on the generator flag (no LevelDef field carries it)', () => {
    for (const [runSeed, levelIndex] of LEVELS_ALL_BANDS) {
      const on = playSynthetic(generateLevel(runSeed, levelIndex, V2_GEN_CONFIG), log); // level 60 is a boss level under v3
      const off = playSynthetic(generateLevel(runSeed, levelIndex, V1_GEN_CONFIG), log);
      expect(on.drops, `seed ${runSeed} level ${levelIndex}`).toEqual(off.drops);
    }
  });

  it('different levels give different schedules (the seed really feeds it) and the band limits the pool', () => {
    const weapons = (runSeed: number, levelIndex: number): string[] =>
      playSynthetic(generateLevel(runSeed, levelIndex), log).drops.map((d) => d.split('|')[2] ?? '');
    const band1 = weapons(1, 1);
    expect(new Set(band1)).toEqual(new Set(['1']));
    const band2 = weapons(42, 13);
    expect([...new Set(band2)].every((x) => x === '1' || x === '2')).toBe(true);
    expect(new Set(band2).size).toBe(2);
    const band4a = weapons(0xdeadbeef, 36);
    const band4b = weapons(0x4e464f4c, 31);
    expect(new Set(band4a).size).toBe(3);
    expect(band4a).not.toEqual(band4b);
  });

  it('pickups off: no drops, no pickup entity and the kill counter does not run', () => {
    const r = playSynthetic(generateLevel(0xdeadbeef, 36), log, false);
    expect(r.drops).toEqual([]);
    expect(r.collects).toEqual([]);
    expect(r.counter).toBe(0);
    expect(r.kills).toBe(log.length);
  });

  it('Endless uses the full pool and the same schedule twice', () => {
    const run = (): string[] => {
      const def = generateEndless(99);
      const w = createEndlessGame(def, (seg) => generateEndlessSegment(def.endlessSeed, seg));
      setInvulnerable(w, true);
      setWeaponPickups(w, true);
      const out: string[] = [];
      for (let i = 0; i < 400; i++) {
        const before = weaponState(w).dropIndex;
        onScoringKill(w, i, -i);
        if (weaponState(w).dropIndex > before) {
          const id = livePickup(w);
          out.push(`${i + 1}|${w.a[id] ?? -1}`);
          w.t[id] = 0.001; // let it expire on the next step so the next due drop can spawn
          stepGame(w, DT, idleInput());
        }
      }
      return out;
    };
    const a = run();
    expect(a.length).toBeGreaterThanOrEqual(10);
    expect(new Set(a.map((x) => x.split('|')[1])).size).toBe(3);
    expect(run()).toEqual(a);
  });
});
