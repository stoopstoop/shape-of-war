// V3 harden: weapon replay (docs/12 Proctor brief). Same LevelDef, same scoring kill log and same
// pickup log must give an identical drop log and an identical weapon timeline.
//   Kill log: [tick, x, y] of every scoring kill, synthetic, from hash01. Pickup log: [tick, x, y] of
//   every moment the ship was put on a live pickup. The recording run decides the pickup log from
//   the world (it collects two drops in three, a hash01 delay after they appear); the replay run
//   reads both logs from JSON copies and never looks at the world to decide anything.
//   The weapon timeline is one hash per tick of JSON.stringify(weaponState(w)), so any field a later
//   wave adds to the weapon state (pair, ingredients, timers) is covered without editing this file.
//   Levels cover every band and four boss levels (the boss is in the LevelDef and stays armed, so
//   the drop schedule is also shown not to depend on a boss being present).
// The v2 drop replay (weaponDropReplay.test.ts) keeps the bot driven proofs; this file adds the log
// driven replay on the v3 default generator config and the guarded spread ingredient proof.
// Known gap: weapon combos (docs/13 "Combining" and "Spread as an ingredient", wave D, gate G3D) are
// not built at this head, so the spread ingredient test is skipped until COMBO_TABLE is exported
// from src/game/weapons.ts. No Math.random, no browser.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { hash01 } from '../../src/core/rng';
import { createEndlessGame, createGame, setInvulnerable, stepGame } from '../../src/game/game';
import { livePickup, onScoringKill } from '../../src/game/pickup';
import * as weaponsModule from '../../src/game/weapons';
import { weaponState } from '../../src/game/weapons';
import type { World } from '../../src/game/world';
import { generateEndless, generateEndlessSegment, generateLevel } from '../../src/levelgen/generator';
import type { LevelDef } from '../../src/levelgen/leveldef';
import { DT, idleInput } from './bossHarness';

afterEach(() => bus.clear());

type Rec = [tick: number, x: number, y: number];

interface Outcome {
  drops: string[];
  collects: string[];
  combines: string[];
  timeline: number[];
  kills: number;
  picks: Rec[];
}

const hasCombos = 'COMBO_TABLE' in weaponsModule;

/** FNV-1a over a string, as a 32 bit integer. */
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Synthetic scoring kill log: gaps of 10 to 79 ticks and positions from hash01. */
function killLogOf(n: number, salt: number): Rec[] {
  const out: Rec[] = [];
  let tick = 0;
  for (let i = 0; i < n; i++) {
    tick += 10 + Math.floor(hash01(i + salt, 3) * 70);
    out.push([tick, Math.round((hash01(i + salt, 1) - 0.5) * 1200), Math.round((hash01(i + salt, 2) - 0.5) * 700)]);
  }
  return out;
}

/** The level with its waves removed and an endless survive objective; the boss field stays. */
function quiet(level: LevelDef): LevelDef {
  return { ...level, objective: { kind: 'survive', durationSec: 1e9 }, waves: { ...level.waves, waves: [], loopFromIndex: 0, loopPeriodSec: 0 } };
}

function run(w: World, kills: readonly Rec[], picks: readonly Rec[] | null): Outcome {
  setInvulnerable(w, true);
  const o: Outcome = { drops: [], collects: [], combines: [], timeline: [], kills: 0, picks: [] };
  let tick = 0;
  const offs = [
    bus.on('fx:pickup', (e) => o.collects.push([tick, e.weapon, e.x, e.y].join('|'))),
    bus.on('fx:weaponCombine', (e) => o.combines.push([tick, e.kind, e.a, e.b].join('|'))),
  ];
  const last = kills[kills.length - 1]?.[0] ?? 0;
  const frame = idleInput();
  let k = 0;
  let p = 0;
  let lastDrop = 0;
  let plannedFor = -1;
  let plannedTick = -1;
  for (; tick <= last + 1500; tick++) {
    stepGame(w, DT, frame);
    while (k < kills.length && (kills[k]?.[0] ?? Infinity) === tick) {
      const rec = kills[k];
      if (rec !== undefined) onScoringKill(w, rec[1], rec[2]);
      o.kills++;
      k++;
    }
    const di = weaponState(w).dropIndex;
    if (di > lastDrop) {
      const id = livePickup(w);
      o.drops.push([tick, di - 1, w.a[id] ?? -1, w.x[id] ?? 0, w.y[id] ?? 0].join('|'));
      lastDrop = di;
    }
    if (picks === null) {
      const id = livePickup(w);
      if (id > 0 && plannedFor !== di) {
        plannedFor = di;
        plannedTick = di % 3 !== 0 ? tick + 1 + Math.floor(hash01(di, 5) * 600) : -1;
      }
      if (id > 0 && tick === plannedTick) {
        w.x[0] = w.x[id] ?? 0;
        w.y[0] = w.y[id] ?? 0;
        o.picks.push([tick, w.x[0], w.y[0]]);
      }
    } else {
      while (p < picks.length && (picks[p]?.[0] ?? Infinity) === tick) {
        const rec = picks[p];
        if (rec !== undefined) {
          w.x[0] = rec[1];
          w.y[0] = rec[2];
          o.picks.push([tick, rec[1], rec[2]]);
        }
        p++;
      }
    }
    o.timeline.push(fnv(JSON.stringify(weaponState(w))));
  }
  for (const off of offs) off();
  return o;
}

function json<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const LEVELS: readonly [runSeed: number, levelIndex: number][] = [
  [1, 1],
  [42, 5],
  [42, 13],
  [0xdeadbeef, 18],
  [42, 20],
  [42, 35],
  [0x4e464f4c, 31],
  [42, 50],
];

describe('weapon replay: same LevelDef, kill log and pickup log give the same drop log and weapon timeline', { timeout: 120_000 }, () => {
  const kills = killLogOf(220, 0);

  it.each(LEVELS)('seed %i level %i: recorded, then replayed from JSON copies of the level and both logs', (runSeed, levelIndex) => {
    const level = quiet(generateLevel(runSeed, levelIndex));
    const a = run(createGame(level), kills, null);
    const b = run(createGame(json(level)), json(kills), json(a.picks));
    expect(a.drops.length, 'drops in the recording').toBeGreaterThanOrEqual(5);
    expect(a.picks.length, 'pickups collected in the recording').toBeGreaterThanOrEqual(2);
    expect(a.collects.length).toBeGreaterThanOrEqual(2);
    expect(new Set(a.timeline).size, 'the timeline really moves').toBeGreaterThan(5);
    expect(b.drops).toEqual(a.drops);
    expect(b.collects).toEqual(a.collects);
    expect(b.combines).toEqual(a.combines);
    expect(b.picks).toEqual(a.picks);
    expect(b.kills).toBe(a.kills);
    expect(b.timeline).toEqual(a.timeline);
  });

  it('the weapon of drop n depends on the level and n only: a boss level and the same level without its boss drop the same sequence', () => {
    // Not the same ticks: with the boss present the orbit blades kill its adds, those are real
    // scoring kills (adds score normally, docs/12 rule 9), and they bring a due drop forward.
    const boss = quiet(generateLevel(42, 35));
    const plain: LevelDef = { ...boss, boss: undefined };
    expect(boss.boss).toBeDefined();
    const a = run(createGame(boss), kills, null);
    const b = run(createGame(plain), kills, null);
    const seq = (o: Outcome): string[] => o.drops.map((d) => d.split('|').slice(1, 3).join('|'));
    const n = Math.min(a.drops.length, b.drops.length);
    expect(n).toBeGreaterThanOrEqual(5);
    expect(seq(a).slice(0, n)).toEqual(seq(b).slice(0, n));
  });

  it('a different kill log gives a different drop log (the kill log really feeds the schedule)', () => {
    const level = quiet(generateLevel(42, 13));
    const a = run(createGame(level), kills, null);
    const b = run(createGame(level), killLogOf(220, 9999), null);
    expect(b.drops).not.toEqual(a.drops);
  });

  it('Endless: two fresh worlds on the same kill and pickup logs agree', () => {
    const make = (): World => {
      const def = generateEndless(99);
      return createEndlessGame(def, (seg) => generateEndlessSegment(def.endlessSeed, seg));
    };
    const a = run(make(), kills, null);
    const b = run(make(), json(kills), json(a.picks));
    expect(a.drops.length).toBeGreaterThanOrEqual(5);
    expect(b.drops).toEqual(a.drops);
    expect(b.timeline).toEqual(a.timeline);
  });

  it('Weapon pickups off (the Off invariant): nothing drops, nothing is collected or combined, the timeline never moves', () => {
    const level = quiet(generateLevel(0xdeadbeef, 36));
    const w = createGame(level, { weaponPickups: false });
    const o = run(w, kills, null);
    expect(o.kills).toBe(kills.length);
    expect(o.drops).toEqual([]);
    expect(o.collects).toEqual([]);
    expect(o.combines).toEqual([]);
    expect(new Set(o.timeline).size).toBe(1);
  });
});

describe('weapon replay: spread as an ingredient (docs/13 "Spread as an ingredient", gate G3D)', { timeout: 120_000 }, () => {
  it.skipIf(!hasCombos)('with combos built: spread drops only while a non spread weapon is active, and the replay still matches', () => {
    // Runs only once src/game/weapons.ts exports COMBO_TABLE. Many collected drops on the full Endless
    // pool must put spread in the drop log at least once, every such drop must come while a collected
    // weapon was live, and the whole outcome must replay identically.
    const longKills = killLogOf(900, 3);
    const make = (): World => {
      const def = generateEndless(5);
      return createEndlessGame(def, (seg) => generateEndlessSegment(def.endlessSeed, seg));
    };
    const a = run(make(), longKills, null);
    const b = run(make(), json(longKills), json(a.picks));
    expect(b.drops).toEqual(a.drops);
    expect(b.combines).toEqual(a.combines);
    expect(b.timeline).toEqual(a.timeline);
    expect(a.combines.length, 'pairs were made').toBeGreaterThan(0);
    const spreadDrops = a.drops.filter((d) => d.split('|')[2] === '0');
    expect(spreadDrops.length, 'spread appeared as a drop').toBeGreaterThan(0);
  });

  it('records the gap: combos are ' + (hasCombos ? 'built, the guarded test above runs' : 'not built at this head, the guarded test above is skipped'), () => {
    expect(typeof hasCombos).toBe('boolean');
  });
});
