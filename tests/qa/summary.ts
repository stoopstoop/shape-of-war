// Pure helpers for the QA suite. Not a test file (vitest only collects *.test.ts).
import { levelHash } from '../../src/levelgen/generator';
import { ENEMY_KINDS } from '../../src/levelgen/leveldef';
import type {
  ArenaDef,
  Band,
  DroneKind,
  EnemyKind,
  HazardDef,
  LevelDef,
  ObjectiveDef,
  RosterEntry,
  SuperKind,
  WaveDef,
} from '../../src/levelgen/leveldef';

export interface LevelSummary {
  hash: string;
  identity: {
    version: number;
    generatorVersion: number;
    runSeed: number;
    levelIndex: number;
    seed: number;
    band: Band;
    retries: number;
    surface: string;
  };
  arena: ArenaDef;
  roster: RosterEntry[];
  speedScale: number;
  drone: DroneKind;
  superType: SuperKind;
  lives: number;
  bombs: number;
  objective: ObjectiveDef;
  hazards: HazardDef;
  par: number;
  stars: [number, number, number];
  schedule: {
    maxLiveEnemies: number;
    intervalStartSec: number;
    intervalEndSec: number;
    rampSec: number;
    rampExponent: number;
    budgetStart: number;
    budgetEnd: number;
    waveCount: number;
    loopFromIndex: number;
    loopPeriodSec: number;
    spawnTotal: number;
    spawnsByKind: Record<EnemyKind, number>;
    firstWave: WaveDef | null;
    lastWave: WaveDef | null;
  };
}

/** Pure: spawn entries per enemy kind over the stored waves (loop repeats not expanded). */
export function spawnsByKind(def: Readonly<LevelDef>): Record<EnemyKind, number> {
  const out: Record<EnemyKind, number> = { grunt: 0, wanderer: 0, weaver: 0, pinwheel: 0, dart: 0, snake: 0 };
  for (const wave of def.waves.waves) for (const e of wave.entries) out[e.kind] += 1;
  return out;
}

/**
 * Pure: a small, reviewable description of a LevelDef. Everything except the wave list is copied
 * whole; the wave list is reduced to counts plus the first and last wave. The hash covers every byte
 * of the full def, so a change anywhere shows up even if this summary does not move.
 */
export function summariseLevel(def: Readonly<LevelDef>): LevelSummary {
  const byKind = spawnsByKind(def);
  const waves = def.waves;
  const first = waves.waves[0];
  const last = waves.waves[waves.waves.length - 1];
  return {
    hash: levelHash(def),
    identity: {
      version: def.version,
      generatorVersion: def.generatorVersion,
      runSeed: def.runSeed,
      levelIndex: def.levelIndex,
      seed: def.seed,
      band: def.band,
      retries: def.retries ?? 0,
      surface: def.surface ?? 'missing',
    },
    arena: def.arena,
    roster: def.roster,
    speedScale: def.speedScale,
    drone: def.drone,
    superType: def.superType,
    lives: def.lives,
    bombs: def.bombs,
    objective: def.objective,
    hazards: def.hazards,
    par: def.par,
    stars: def.stars,
    schedule: {
      maxLiveEnemies: waves.maxLiveEnemies,
      intervalStartSec: waves.intervalStartSec,
      intervalEndSec: waves.intervalEndSec,
      rampSec: waves.rampSec,
      rampExponent: waves.rampExponent,
      budgetStart: waves.budgetStart,
      budgetEnd: waves.budgetEnd,
      waveCount: waves.waves.length,
      loopFromIndex: waves.loopFromIndex,
      loopPeriodSec: waves.loopPeriodSec,
      spawnTotal: ENEMY_KINDS.reduce((n, k) => n + byKind[k], 0),
      spawnsByKind: byKind,
      firstWave: first ?? null,
      lastWave: last ?? null,
    },
  };
}

/** Pure: stable pretty JSON with a trailing newline, the on disk snapshot format. */
export function snapshotText(summary: LevelSummary): string {
  return `${JSON.stringify(summary, null, 2)}\n`;
}

/**
 * Pure: drop // and block comments from TypeScript source, leaving string and template literals
 * untouched. Good enough for scanning for identifiers and string literals; it does not parse
 * nested template expressions.
 */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src.charAt(i);
    const n = src.charAt(i + 1);
    if (quote !== null) {
      out += c;
      if (c === '\\') {
        out += n;
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
    } else if (c === '/' && n === '/') {
      while (i < src.length && src.charAt(i) !== '\n') i += 1;
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src.charAt(i) === '*' && src.charAt(i + 1) === '/')) {
        if (src.charAt(i) === '\n') out += '\n';
        i += 1;
      }
      i += 2;
    } else {
      if (c === "'" || c === '"' || c === '`') quote = c;
      out += c;
      i += 1;
    }
  }
  return out;
}
