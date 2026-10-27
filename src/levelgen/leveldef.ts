// Contract stub (docs/05-build-plan.md "Contract stubs"). Types are copied exactly from
// docs/02-level-generator.md section 3. Foundry owns this file from W1 and may grow it additively.
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
}
