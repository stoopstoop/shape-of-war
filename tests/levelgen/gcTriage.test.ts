// Gate GC triage (run 0161). On device at 374a7b9 the tester reported, for run seed 42, that
// Swirl did not appear on level 7, Blink on 17 or Sower on 31. These tests are the evidence that
// generateLevel(42, n) does contain each kind early in the level, that the sim spawns it, and
// they pin the level hashes so the HUD hash on device can be compared against them.
import { describe, expect, it } from 'vitest';
import { createGame, gameState, setInvulnerable, stepGame } from '../../src/game/game';
import { Kind } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import { generateLevel, levelHash } from '../../src/levelgen/generator';
import type { EnemyKind, LevelDef } from '../../src/levelgen/leveldef';

const SEED = 42;
/** Share of a level's waves that counts as "early": waves with index below floor(0.6 x n). */
const EARLY_FRAC = 0.6;

/** The six first appearances claimed in run 0155 and the hashes they generate at 374a7b9. */
const CASES: readonly { level: number; kind: EnemyKind; hash: string }[] = [
  { level: 6, kind: 'charger', hash: '93A4C56E' },
  { level: 7, kind: 'swirl', hash: 'CC6859DC' },
  { level: 9, kind: 'splime', hash: '5BD14124' },
  { level: 16, kind: 'bulwark', hash: 'D736C51F' },
  { level: 17, kind: 'blink', hash: '43CADCE4' },
  { level: 31, kind: 'sower', hash: '66AF8BD7' },
];

interface EarlySpawn {
  /** Index of the first wave with an entry of the kind, or -1. */
  firstWave: number;
  /** Entries of the kind in that wave. */
  firstCount: number;
  /** Entries of the kind across the early waves. */
  earlyCount: number;
  /** Number of early waves looked at, and of all waves. */
  earlyWaves: number;
  waves: number;
}

/** Pure: where a kind first spawns in a level's wave list, limited to the early waves. */
function earlySpawn(def: Pick<LevelDef, 'waves'>, kind: EnemyKind, frac = EARLY_FRAC): EarlySpawn {
  const all = def.waves.waves;
  const earlyWaves = Math.floor(all.length * frac);
  const counts = all.slice(0, earlyWaves).map((w) => w.entries.filter((e) => e.kind === kind).length);
  const firstWave = counts.findIndex((c) => c > 0);
  return {
    firstWave,
    firstCount: firstWave < 0 ? 0 : (counts[firstWave] ?? 0),
    earlyCount: counts.reduce((a, c) => a + c, 0),
    earlyWaves,
    waves: all.length,
  };
}

/** Pure: lowest level in 1..maxLevel whose early waves spawn the kind, or -1. */
function lowestEarlyLevel(seed: number, kind: EnemyKind, maxLevel: number): number {
  for (let n = 1; n <= maxLevel; n++) if (earlySpawn(generateLevel(seed, n), kind).firstCount > 0) return n;
  return -1;
}

function idleInput(): InputState {
  return { move: { active: false, x: 0, y: 0 }, aim: { active: false, x: 0, y: 0 }, bomb: false, superPressed: false, pause: false };
}

const SIM_KIND: Readonly<Record<string, Kind>> = {
  charger: Kind.Charger,
  swirl: Kind.Swirl,
  splime: Kind.Splime,
  bulwark: Kind.Bulwark,
  blink: Kind.Blink,
  sower: Kind.Sower,
};

/** Seconds of sim time, invulnerable ship and idle sticks, until the first spawn of the kind, or -1. */
function firstSimSpawnSec(def: LevelDef, kind: Kind, maxSec: number): number {
  const w = createGame(def, { logSpawns: true, vibrate: () => undefined });
  setInvulnerable(w, true);
  const input = idleInput();
  const dt = 1 / 120;
  for (let i = 0; i < maxSec * 120; i++) {
    stepGame(w, dt, input);
    const hit = (gameState(w).spawnLog ?? []).find((e) => e.kind === kind);
    if (hit !== undefined) return hit.t;
  }
  return -1;
}

describe('gate GC triage, seed 42', () => {
  it('each named kind spawns with a count above zero in the first 60 percent of its level', () => {
    const rows = CASES.map(({ level, kind }) => ({ level, kind, ...earlySpawn(generateLevel(SEED, level), kind) }));
    const table = rows.map((r) => ({
      level: r.level,
      kind: r.kind,
      firstWave: r.firstWave,
      firstCount: r.firstCount,
      earlyCount: r.earlyCount,
      earlyWaves: r.earlyWaves + '/' + r.waves,
    }));
    console.table(table);
    for (const r of rows) {
      expect(r.firstWave, r.kind + ' on L' + r.level).toBeGreaterThanOrEqual(0);
      expect(r.firstCount, r.kind + ' on L' + r.level).toBeGreaterThan(0);
    }
  });

  it('pins the level hashes, so the HUD hash on device can be checked', () => {
    for (const c of CASES) expect(levelHash(generateLevel(SEED, c.level)), 'L' + c.level).toBe(c.hash);
  });

  it('the lowest early spawn level of each kind is its claimed first appearance', () => {
    const lowest = Object.fromEntries(CASES.map((c) => [c.kind, lowestEarlyLevel(SEED, c.kind, 40)]));
    console.log('lowest early spawn level, seed 42: ' + JSON.stringify(lowest));
    expect(lowest).toEqual(Object.fromEntries(CASES.map((c) => [c.kind, c.level])));
  });

  it('the sim spawns the kind from the LevelDef within its early window', () => {
    const rows: { level: number; kind: EnemyKind; firstSimSec: number }[] = [];
    for (const c of CASES) {
      const def = generateLevel(SEED, c.level);
      const sk = SIM_KIND[c.kind];
      if (sk === undefined) throw new Error('no sim kind for ' + c.kind);
      const t = firstSimSpawnSec(def, sk, 30);
      rows.push({ level: c.level, kind: c.kind, firstSimSec: Math.round(t * 10) / 10 });
      expect(t, c.kind + ' on L' + c.level).toBeGreaterThan(0);
    }
    console.table(rows);
  });
});
