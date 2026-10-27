// Hand-built LevelDef fixtures for Forge, Swarm, Glow and Ledger to use before generator.ts exists.
// The three valid fixtures pass validateLevel; the three invalid ones each break a named invariant.
// Wave schedules are laid out by a fixed rule below (no PRNG), shaped like docs/02 section 7 output.
import { BANDS, GENERATOR_VERSION, LEVELDEF_VERSION, bandOf, deepFreeze, levelSeed, round1, speedScaleFor } from '../leveldef';
import type {
  ArenaDef,
  DroneKind,
  EnemyKind,
  HazardDef,
  LevelDef,
  ObjectiveDef,
  RosterEntry,
  SpawnEntry,
  SuperKind,
  Vec2,
  WaveDef,
  WaveSchedule,
} from '../leveldef';

/** Run seed shared by every fixture: ASCII "NFOL", as in docs/02 section 13. */
export const FIXTURE_RUN_SEED = 0x4e464f4c;

const RING_RADIUS = 300;
const MAX_ENTRIES_PER_WAVE = 8;
const ENTRY_STEP_SEC = 0.25;

/**
 * Deterministic wave schedule for a band. Even waves are rings around the ship, odd waves use the
 * given fixed points. Budget and interval follow the band ramp of docs/02 table 4.4.
 */
export function buildFixtureSchedule(levelIndex: number, kinds: readonly EnemyKind[], fixedPoints: readonly Vec2[]): WaveSchedule {
  const b = BANDS[bandOf(levelIndex)];
  const waves: WaveDef[] = [];
  let t = 2.5;
  for (let i = 0; t < b.scheduleSec; i++) {
    const u = Math.pow(Math.min(1, t / b.rampSec), b.rampExponent);
    const count = Math.min(MAX_ENTRIES_PER_WAVE, Math.round(b.budgetStart + (b.budgetEnd - b.budgetStart) * u));
    const ring = i % 2 === 0 || fixedPoints.length === 0;
    const start = (i * 37) % 360;
    const step = Math.round(360 / count);
    const entries: SpawnEntry[] = [];
    for (let k = 0; k < count; k++) {
      const kind = kinds[(i + k) % kinds.length] ?? 'grunt';
      const p = fixedPoints[(i + k) % Math.max(1, fixedPoints.length)] ?? { x: 0, y: 0 };
      entries.push({
        kind,
        tOffsetSec: k * ENTRY_STEP_SEC,
        mode: ring ? 'ring' : 'fixed',
        x: ring ? 0 : p.x,
        y: ring ? 0 : p.y,
        angleDeg: ring ? (start + k * step) % 360 : 0,
        radius: ring ? RING_RADIUS : 0,
        headingDeg: kind === 'wanderer' || kind === 'pinwheel' ? (i * 53 + k * 97) % 360 : 0,
      });
    }
    waves.push({ index: i, atSec: t, pattern: ring ? 'ring' : 'corners', entries });
    t = round1(t + b.intervalStartSec + (b.intervalEndSec - b.intervalStartSec) * u);
  }
  const loopFromIndex = Math.max(0, waves.findIndex((w) => w.atSec >= 0.5 * b.scheduleSec));
  const last = waves[waves.length - 1];
  const loopStart = waves[loopFromIndex];
  const loopPeriodSec = last && loopStart ? round1(last.atSec + b.intervalEndSec - loopStart.atSec) : 0;
  return {
    maxLiveEnemies: b.maxLiveEnemies,
    intervalStartSec: b.intervalStartSec,
    intervalEndSec: b.intervalEndSec,
    rampSec: b.rampSec,
    rampExponent: b.rampExponent,
    budgetStart: b.budgetStart,
    budgetEnd: b.budgetEnd,
    waves,
    loopFromIndex,
    loopPeriodSec,
  };
}

interface FixtureSpec {
  levelIndex: number;
  arena: ArenaDef;
  roster: RosterEntry[];
  drone: DroneKind;
  superType: SuperKind;
  objective: ObjectiveDef;
  hazards: HazardDef;
  par: number;
  fixedPoints: Vec2[];
}

function assemble(s: FixtureSpec): LevelDef {
  return {
    version: LEVELDEF_VERSION,
    generatorVersion: GENERATOR_VERSION,
    runSeed: FIXTURE_RUN_SEED,
    levelIndex: s.levelIndex,
    seed: levelSeed(FIXTURE_RUN_SEED, s.levelIndex),
    band: bandOf(s.levelIndex),
    arena: s.arena,
    roster: s.roster,
    speedScale: speedScaleFor(s.levelIndex),
    drone: s.drone,
    superType: s.superType,
    lives: 3,
    bombs: 3,
    objective: s.objective,
    waves: buildFixtureSchedule(
      s.levelIndex,
      s.roster.map((e) => e.kind),
      s.fixedPoints,
    ),
    hazards: s.hazards,
    par: s.par,
    stars: [s.par, 2 * s.par, 4 * s.par],
    surface: 'flat',
    retries: 0,
  };
}

/** Level 1, band 1: 1000 x 720 rect, grunt, wanderer, pinwheel, survive 45 s, no hazards. */
export function makeRectEasyLevel(): LevelDef {
  return assemble({
    levelIndex: 1,
    arena: { shape: 'rect', width: 1000, height: 720, cornerRadius: 0, obstacles: [], spawnPoint: { x: 0, y: 0 } },
    roster: [
      { kind: 'grunt', weight: 40 },
      { kind: 'wanderer', weight: 35 },
      { kind: 'pinwheel', weight: 25 },
    ],
    drone: 'attack',
    superType: 'turbo',
    objective: { kind: 'survive', durationSec: 45 },
    hazards: { wells: [], spawners: [] },
    par: 3000,
    fixedPoints: [
      { x: -420, y: -280 },
      { x: 420, y: -280 },
      { x: 420, y: 280 },
      { x: -420, y: 280 },
    ],
  });
}

/** Level 20, band 3: flat top hexagon (circumradius 554.25), two gravity wells, destroy 120. */
export function makeHexWellsLevel(): LevelDef {
  return assemble({
    levelIndex: 20,
    arena: { shape: 'hexagon', width: 1108.5, height: 960, cornerRadius: 0, obstacles: [], spawnPoint: { x: 0, y: 0 } },
    roster: [
      { kind: 'grunt', weight: 25 },
      { kind: 'weaver', weight: 20 },
      { kind: 'pinwheel', weight: 10 },
      { kind: 'snake', weight: 15 },
    ],
    drone: 'collect',
    superType: 'homing',
    objective: { kind: 'destroy', count: 120 },
    hazards: {
      wells: [
        { x: -400, y: 0 },
        { x: 400, y: 0 },
      ],
      spawners: [],
    },
    par: 12000,
    fixedPoints: [
      { x: 0, y: -380 },
      { x: 0, y: 380 },
    ],
  });
}

/** Level 37, band 4: 1600 x 1000 rect with 3 walls, one well, one spawner, score 4000 in 120 s. */
export function makeRectWallsLevel(): LevelDef {
  return assemble({
    levelIndex: 37,
    arena: {
      shape: 'rectObstacles',
      width: 1600,
      height: 1000,
      cornerRadius: 0,
      obstacles: [
        { cx: 0, cy: -300, w: 400, h: 24 },
        { cx: -550, cy: 100, w: 24, h: 300 },
        { cx: 550, cy: 150, w: 24, h: 400 },
      ],
      spawnPoint: { x: 0, y: 0 },
    },
    roster: [
      { kind: 'grunt', weight: 20 },
      { kind: 'wanderer', weight: 8 },
      { kind: 'weaver', weight: 18 },
      { kind: 'dart', weight: 20 },
      { kind: 'snake', weight: 16 },
    ],
    drone: 'ram',
    superType: 'detonate',
    objective: { kind: 'scoreInTime', target: 4000, timeLimitSec: 120 },
    hazards: {
      wells: [{ x: -450, y: -320 }],
      spawners: [{ x: 600, y: -380, spawnAtSec: 20, emitEverySec: 5, dartsPerEmit: 5 }],
    },
    par: 5000,
    fixedPoints: [
      { x: -720, y: -420 },
      { x: 720, y: -420 },
      { x: 720, y: 420 },
      { x: -720, y: 420 },
    ],
  });
}

export const FIXTURE_RECT_EASY: LevelDef = deepFreeze(makeRectEasyLevel());
export const FIXTURE_HEX_WELLS: LevelDef = deepFreeze(makeHexWellsLevel());
export const FIXTURE_RECT_WALLS: LevelDef = deepFreeze(makeRectWallsLevel());

export const VALID_FIXTURES: readonly LevelDef[] = [FIXTURE_RECT_EASY, FIXTURE_HEX_WELLS, FIXTURE_RECT_WALLS];

export interface InvalidFixture {
  name: string;
  def: LevelDef;
  /** Invariant ids validateLevel must report. Others may also fire. */
  expectErrors: readonly string[];
}

function rosterTooSmall(): LevelDef {
  const d = makeRectEasyLevel();
  d.roster = d.roster.filter((e) => e.kind !== 'pinwheel');
  d.waves = buildFixtureSchedule(1, ['grunt', 'wanderer'], [{ x: -420, y: -280 }]);
  return d;
}

function wellOnSpawn(): LevelDef {
  const d = makeHexWellsLevel();
  d.hazards.wells = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
  ];
  return d;
}

function sealedWalls(): LevelDef {
  const d = makeRectWallsLevel();
  // A full height wall at x = 600 cuts the right strip off from the spawn point.
  d.arena.obstacles = [{ cx: 600, cy: 0, w: 24, h: 1000 }];
  return d;
}

export const INVALID_FIXTURES: readonly InvalidFixture[] = deepFreeze([
  { name: 'roster of 2', def: rosterTooSmall(), expectErrors: ['R1'] },
  { name: 'gravity well on the ship spawn', def: wellOnSpawn(), expectErrors: ['H1'] },
  { name: 'wall seals the arena', def: sealedWalls(), expectErrors: ['A6'] },
]);
