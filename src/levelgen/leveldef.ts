// Contract stub (docs/05-build-plan.md "Contract stubs"). Types are copied exactly from
// docs/02-level-generator.md section 3. Foundry owns this file from W1 and may grow it additively.
import type { SurfaceKind } from '../core/surface';

export const LEVELDEF_VERSION = 1;
export const GENERATOR_VERSION = 1;

export type Band = 1 | 2 | 3 | 4;
export type ArenaShape = 'rect' | 'roundRect' | 'circle' | 'hexagon' | 'rectObstacles';
export type EnemyKind = 'grunt' | 'wanderer' | 'weaver' | 'pinwheel' | 'dart' | 'snake';
export type DroneKind = 'attack' | 'collect' | 'ram';
export type SuperKind = 'homing' | 'detonate' | 'turbo';
export type SpawnPattern = 'edges' | 'corners' | 'ring' | 'cluster';

export interface Vec2 {
  x: number;
  y: number;
}

/** Axis-aligned wall. Centre and full size in arena units. */
export interface Obstacle {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface ArenaDef {
  shape: ArenaShape;
  /** Bounding box, centred on (0, 0). Circle: width === height === diameter. Hexagon: flat top, width = 2 x circumradius. */
  width: number;
  height: number;
  /** roundRect only, else 0. */
  cornerRadius: number;
  /** rectObstacles only, else []. 1 to 3 entries. */
  obstacles: Obstacle[];
  /** Always { x: 0, y: 0 }. Stored so the validator and sim agree explicitly. */
  spawnPoint: Vec2;
}

export interface RosterEntry {
  kind: EnemyKind;
  weight: number;
}

export type ObjectiveDef =
  | { kind: 'scoreInTime'; target: number; timeLimitSec: number }
  | { kind: 'survive'; durationSec: number }
  | { kind: 'destroy'; count: number };

/** One enemy spawn. Either at a fixed arena point or on a ring around the ship's position at telegraph start. */
export interface SpawnEntry {
  kind: EnemyKind;
  /** Seconds after the wave's atSec. */
  tOffsetSec: number;
  mode: 'fixed' | 'ring';
  /** fixed: arena coordinates. ring: unused, 0. */
  x: number;
  y: number;
  /** ring: integer degrees and radius in u. fixed: 0. */
  angleDeg: number;
  radius: number;
  /** Integer degrees. Initial heading for wanderer and pinwheel; ignored by seekers. */
  headingDeg: number;
}

export interface WaveDef {
  index: number;
  atSec: number;
  pattern: SpawnPattern;
  entries: SpawnEntry[];
}

export interface WaveSchedule {
  maxLiveEnemies: number;
  /** Ramp metadata, informational for debugging and par. The sim reads only waves and loop fields. */
  intervalStartSec: number;
  intervalEndSec: number;
  rampSec: number;
  rampExponent: number;
  budgetStart: number;
  budgetEnd: number;
  waves: WaveDef[];
  /** After the last wave, repeat waves[loopFromIndex..] shifted by loopPeriodSec per repeat. */
  loopFromIndex: number;
  loopPeriodSec: number;
}

export interface GravityWellDef {
  x: number;
  y: number;
}

export interface SpawnerDef {
  x: number;
  y: number;
  spawnAtSec: number;
  emitEverySec: number;
  dartsPerEmit: number;
}

export interface HazardDef {
  wells: GravityWellDef[]; // 0 to 3
  spawners: SpawnerDef[]; // 0 to 2
}

export interface LevelDef {
  version: typeof LEVELDEF_VERSION;
  generatorVersion: number;
  runSeed: number;
  levelIndex: number;
  seed: number;
  band: Band;
  arena: ArenaDef;
  roster: RosterEntry[]; // 3 to 6, distinct kinds, always contains grunt
  speedScale: number; // 1.00 to 1.40, 2 decimals
  drone: DroneKind;
  superType: SuperKind;
  lives: number; // 3
  bombs: number; // 3
  objective: ObjectiveDef;
  waves: WaveSchedule;
  hazards: HazardDef;
  par: number; // multiple of 500, at least 1000
  stars: [number, number, number]; // [par, 2 x par, 4 x par]
  /**
   * W2, v2 hook (SPEC 3.3, docs/09 section 5). Reserved: only 'flat' is valid in v1 and nothing
   * reads it. Optional in the type only so hand built defs elsewhere still compile; generateLevel
   * always emits it and validateLevel (V1) rejects a missing or non flat value.
   */
  surface?: SurfaceKind;
  /**
   * W2: deterministic re-derive count (0 to MAX_RETRIES) the generator needed before the def
   * passed validateLevel. Optional in the type for the same reason as surface; checked by J5.
   */
  retries?: number;
}

/** W2: most deterministic re-derives generateLevel makes after the first attempt. */
export const MAX_RETRIES = 8;

// Additions by Foundry (W1). Everything below follows docs/02-level-generator.md sections 3, 4, 10.

export interface EndlessSegmentDef {
  version: typeof LEVELDEF_VERSION;
  generatorVersion: number;
  endlessSeed: number;
  segment: number; // 0-based
  seed: number;
  effectiveIndex: number;
  band: Band;
  roster: RosterEntry[];
  speedScale: number;
  /** Waves with atSec relative to segment start, all atSec < 30. loopFromIndex = -1, loopPeriodSec = 0. */
  waves: WaveSchedule;
}

export interface GenConfig {
  /** Scope cut switches (SPEC 8 cut order). Defaults: all true, all drones and supers. */
  enableSnake: boolean;
  enableSpawner: boolean;
  drones: DroneKind[];
  supers: SuperKind[];
}

export const DEFAULT_GEN_CONFIG: Readonly<GenConfig> = Object.freeze<GenConfig>({
  enableSnake: true,
  enableSpawner: true,
  drones: ['attack', 'collect', 'ram'],
  supers: ['homing', 'detonate', 'turbo'],
});

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export const ENEMY_KINDS: readonly EnemyKind[] = ['grunt', 'wanderer', 'weaver', 'pinwheel', 'dart', 'snake'];
export const ARENA_SHAPES: readonly ArenaShape[] = ['rect', 'roundRect', 'circle', 'hexagon', 'rectObstacles'];
export const DRONE_KINDS: readonly DroneKind[] = ['attack', 'collect', 'ram'];
export const SUPER_KINDS: readonly SuperKind[] = ['homing', 'detonate', 'turbo'];
export const SPAWN_PATTERNS: readonly SpawnPattern[] = ['edges', 'corners', 'ring', 'cluster'];

export const ENEMY_BASE: Record<EnemyKind, number> = {
  grunt: 50,
  wanderer: 10,
  weaver: 100,
  pinwheel: 25,
  dart: 30,
  snake: 200,
};

export const ENEMY_GEOMS: Record<EnemyKind, number> = {
  grunt: 1,
  wanderer: 1,
  weaver: 2,
  pinwheel: 1,
  dart: 1,
  snake: 4,
};

/** Shared by par calculation and sim loop handling. Expands loops up to tEnd. Sorted by t. */
export function expandSpawns(w: WaveSchedule, tEndSec: number): { t: number; kind: EnemyKind }[] {
  const out: { t: number; kind: EnemyKind }[] = [];
  const push = (wave: WaveDef, shift: number): void => {
    for (const e of wave.entries) {
      const t = wave.atSec + shift + e.tOffsetSec;
      if (t < tEndSec) out.push({ t, kind: e.kind });
    }
  };
  for (const wave of w.waves) push(wave, 0);
  const loopStart = w.waves[w.loopFromIndex];
  if (w.loopFromIndex >= 0 && w.loopPeriodSec > 0 && loopStart !== undefined) {
    for (let k = 1; ; k++) {
      const shift = k * w.loopPeriodSec;
      if (loopStart.atSec + shift >= tEndSec) break;
      for (let i = w.loopFromIndex; i < w.waves.length; i++) {
        const wave = w.waves[i];
        if (wave !== undefined) push(wave, shift);
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

// Seeds. Copies of the docs/02 section 2 integer mixers, so the validator can check J4 without
// depending on the PRNG module. Pure integer maths, no randomness.

/** murmur3 finaliser: avalanche a 32-bit integer. */
export function fmix32(h: number): number {
  h >>>= 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** SPEC 3.2: level n seed is derived from the run seed plus n. */
export function levelSeed(runSeed: number, levelIndex: number): number {
  return fmix32((runSeed + levelIndex) >>> 0);
}

/** docs/02 section 10: seed of Endless segment s. The constant is ASCII "ENDL". */
export function segmentSeed(endlessSeed: number, segment: number): number {
  return fmix32(((endlessSeed ^ 0x454e444c) + segment) >>> 0);
}

export const round1 = (v: number): number => Math.round(v * 10) / 10;
export const round2 = (v: number): number => Math.round(v * 100) / 100;

// Band tables, docs/02 section 4. Changing any value changes generator output: bump GENERATOR_VERSION.

/** 1 for n 1 to 5 (and anything below 1), 2 for 6 to 15, 3 for 16 to 30, 4 for 31 and above. */
export function bandOf(levelIndex: number): Band {
  if (levelIndex <= 5) return 1;
  if (levelIndex <= 15) return 2;
  if (levelIndex <= 30) return 3;
  return 4;
}

export interface IntRange {
  min: number;
  max: number;
}

export interface BandParams {
  arenaHeight: IntRange; // step 20
  aspect: IntRange;
  shapeWeights: Record<ArenaShape, number>;
  obstacleCount: IntRange;
  rosterSize: IntRange;
  rosterWeights: Record<EnemyKind, number>;
  droneWeights: Record<DroneKind, number>;
  superWeights: Record<SuperKind, number>;
  objectiveWeights: Record<ObjectiveDef['kind'], number>;
  surviveSec: IntRange; // step 5
  destroyCount: IntRange; // step 5
  scoreTimeSec: IntRange; // step 15
  intervalStartSec: number;
  intervalEndSec: number;
  rampSec: number;
  rampExponent: number;
  budgetStart: number;
  budgetEnd: number;
  groupsPerWave: IntRange;
  maxLiveEnemies: number;
  scheduleSec: number;
  maxLiveSnakes: number;
  wells: IntRange;
  spawners: IntRange;
  spawnerAtSec: IntRange; // step 5, 0 to 0 when the band has no spawners
  spawnerEmitEverySec: number;
  spawnerDartsPerEmit: number;
}

const NO_SPAWNERS = {
  spawners: { min: 0, max: 0 },
  spawnerAtSec: { min: 0, max: 0 },
  spawnerEmitEverySec: 0,
  spawnerDartsPerEmit: 0,
} as const;

export const BANDS: Readonly<Record<Band, BandParams>> = {
  1: {
    arenaHeight: { min: 700, max: 760 },
    aspect: { min: 1.3, max: 1.5 },
    shapeWeights: { rect: 40, roundRect: 30, circle: 15, hexagon: 15, rectObstacles: 0 },
    obstacleCount: { min: 0, max: 0 },
    rosterSize: { min: 3, max: 3 },
    rosterWeights: { grunt: 40, wanderer: 35, weaver: 0, pinwheel: 25, dart: 0, snake: 0 },
    droneWeights: { attack: 100, collect: 0, ram: 0 },
    superWeights: { homing: 34, detonate: 0, turbo: 66 },
    objectiveWeights: { scoreInTime: 20, survive: 40, destroy: 40 },
    surviveSec: { min: 45, max: 60 },
    destroyCount: { min: 30, max: 50 },
    scoreTimeSec: { min: 60, max: 60 },
    intervalStartSec: 6.0,
    intervalEndSec: 4.0,
    rampSec: 60,
    rampExponent: 1.0,
    budgetStart: 3,
    budgetEnd: 8,
    groupsPerWave: { min: 1, max: 2 },
    maxLiveEnemies: 60,
    scheduleSec: 120,
    maxLiveSnakes: 0,
    wells: { min: 0, max: 0 },
    ...NO_SPAWNERS,
  },
  2: {
    arenaHeight: { min: 760, max: 880 },
    aspect: { min: 1.3, max: 1.6 },
    shapeWeights: { rect: 25, roundRect: 25, circle: 15, hexagon: 15, rectObstacles: 20 },
    obstacleCount: { min: 1, max: 1 },
    rosterSize: { min: 3, max: 4 },
    rosterWeights: { grunt: 30, wanderer: 20, weaver: 20, pinwheel: 15, dart: 15, snake: 0 },
    droneWeights: { attack: 50, collect: 30, ram: 20 },
    superWeights: { homing: 34, detonate: 33, turbo: 33 },
    objectiveWeights: { scoreInTime: 34, survive: 33, destroy: 33 },
    surviveSec: { min: 60, max: 90 },
    destroyCount: { min: 60, max: 100 },
    scoreTimeSec: { min: 75, max: 90 },
    intervalStartSec: 5.0,
    intervalEndSec: 3.0,
    rampSec: 90,
    rampExponent: 1.2,
    budgetStart: 5,
    budgetEnd: 12,
    groupsPerWave: { min: 1, max: 3 },
    maxLiveEnemies: 90,
    scheduleSec: 150,
    maxLiveSnakes: 0,
    wells: { min: 0, max: 1 },
    ...NO_SPAWNERS,
  },
  3: {
    arenaHeight: { min: 860, max: 1000 },
    aspect: { min: 1.35, max: 1.7 },
    shapeWeights: { rect: 15, roundRect: 15, circle: 15, hexagon: 20, rectObstacles: 35 },
    obstacleCount: { min: 1, max: 2 },
    rosterSize: { min: 4, max: 5 },
    rosterWeights: { grunt: 25, wanderer: 12, weaver: 20, pinwheel: 10, dart: 18, snake: 15 },
    droneWeights: { attack: 34, collect: 33, ram: 33 },
    superWeights: { homing: 34, detonate: 33, turbo: 33 },
    objectiveWeights: { scoreInTime: 34, survive: 33, destroy: 33 },
    surviveSec: { min: 75, max: 105 },
    destroyCount: { min: 100, max: 150 },
    scoreTimeSec: { min: 90, max: 105 },
    intervalStartSec: 4.5,
    intervalEndSec: 2.5,
    rampSec: 120,
    rampExponent: 1.4,
    budgetStart: 6,
    budgetEnd: 16,
    groupsPerWave: { min: 1, max: 3 },
    maxLiveEnemies: 120,
    scheduleSec: 180,
    maxLiveSnakes: 2,
    wells: { min: 1, max: 2 },
    spawners: { min: 0, max: 1 },
    spawnerAtSec: { min: 20, max: 40 },
    spawnerEmitEverySec: 6.0,
    spawnerDartsPerEmit: 5,
  },
  4: {
    arenaHeight: { min: 940, max: 1100 },
    aspect: { min: 1.4, max: 1.8 },
    shapeWeights: { rect: 10, roundRect: 10, circle: 15, hexagon: 20, rectObstacles: 45 },
    obstacleCount: { min: 1, max: 3 },
    rosterSize: { min: 5, max: 6 },
    rosterWeights: { grunt: 20, wanderer: 8, weaver: 18, pinwheel: 8, dart: 20, snake: 16 },
    droneWeights: { attack: 34, collect: 33, ram: 33 },
    superWeights: { homing: 34, detonate: 33, turbo: 33 },
    objectiveWeights: { scoreInTime: 34, survive: 33, destroy: 33 },
    surviveSec: { min: 90, max: 120 },
    destroyCount: { min: 150, max: 220 },
    scoreTimeSec: { min: 105, max: 120 },
    intervalStartSec: 4.0,
    intervalEndSec: 2.0,
    rampSec: 120,
    rampExponent: 1.6,
    budgetStart: 8,
    budgetEnd: 20,
    groupsPerWave: { min: 1, max: 3 },
    maxLiveEnemies: 160,
    scheduleSec: 180,
    maxLiveSnakes: 3,
    wells: { min: 1, max: 3 },
    spawners: { min: 1, max: 2 },
    spawnerAtSec: { min: 10, max: 30 },
    spawnerEmitEverySec: 5.0,
    spawnerDartsPerEmit: 5,
  },
};

/** docs/02 table 4.2, rounded to 2 decimals. */
export function speedScaleFor(levelIndex: number): number {
  const band = bandOf(levelIndex);
  if (band === 1) return 1.0;
  if (band === 2) return 1.05;
  if (band === 3) return 1.1;
  return round2(Math.min(1.4, 1.2 + 0.005 * (levelIndex - 31)));
}

/** docs/02 section 10: Endless segment s plays as level 1 + 2s. */
export function effectiveIndexOf(segment: number): number {
  return 1 + 2 * segment;
}

export const ENDLESS_SEGMENT_SEC = 30;

/** docs/01 section 2.2: fixed Endless arena. Not generated. */
export const ENDLESS_ARENA: Readonly<ArenaDef> = Object.freeze({
  shape: 'rect',
  width: 1600,
  height: 1000,
  cornerRadius: 0,
  obstacles: [],
  spawnPoint: { x: 0, y: 0 },
});

// W2: Endless game definition (docs/01 section 2.2, docs/05 W2 task 2). Waves are not stored here
// because the ramp is unbounded: Ledger asks generateEndlessSegment(endlessSeed, s) for segment s.

/** Extra spawn units per segment once Endless reaches band 4 (segment 15 onward). No upper bound. */
export const ENDLESS_BUDGET_PER_SEGMENT = 1;
/** First segment whose effective index is in band 4: 1 + 2 x 15 = 31. */
export const ENDLESS_BAND4_SEGMENT = 15;

export interface EndlessDef {
  version: typeof LEVELDEF_VERSION;
  generatorVersion: number;
  mode: 'endless';
  endlessSeed: number;
  surface: SurfaceKind;
  /** Fixed 1600 x 1000 rect, ENDLESS_ARENA. */
  arena: ArenaDef;
  /** Full catalogue the segments ramp through, with band 4 weights (minus GenConfig cuts). */
  roster: RosterEntry[];
  drone: 'attack';
  superType: 'turbo';
  lives: number; // 3 at start
  bombs: number; // 3 at start
  extraLifeEvery: number; // 100000 points
  extraBombEvery: number; // 150000 points
  maxLives: number; // 9
  maxBombs: number; // 9
  objective: { kind: 'none' };
  hazards: HazardDef; // always empty in v1
  segmentSec: number; // ENDLESS_SEGMENT_SEC
  /** Spawn units added per segment from ENDLESS_BAND4_SEGMENT onward: the unbounded ramp. */
  budgetPerSegment: number;
  band4Segment: number;
}

/** Recursive Object.freeze. Returns its argument. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
