// Seeded level generator, docs/02-level-generator.md sections 5 to 10. Pure and deterministic:
// no Date, no Math.random, no DOM. Every random draw comes from a mulberry32 stream seeded from
// deriveSeed(runSeed, levelIndex) through one salt per stage, so one stage's draw count never
// shifts another's. Draw order inside each stage is fixed: never reorder draws without a
// GENERATOR_VERSION bump.
import { deriveSeed, fmix32, mulberry32, rngInt, rngPick, streamSeed } from '../core/rng';
import type { Rng } from '../core/rng';
import {
  ARENA_SHAPES,
  BANDS,
  DEFAULT_GEN_CONFIG,
  DRONE_KINDS,
  ENDLESS_ARENA,
  ENDLESS_BAND4_SEGMENT,
  ENDLESS_BUDGET_PER_SEGMENT,
  ENDLESS_SEGMENT_SEC,
  ENEMY_BASE,
  ENEMY_GEOMS,
  ENEMY_KINDS,
  GENERATOR_VERSION,
  LEVELDEF_VERSION,
  MAX_RETRIES,
  SUPER_KINDS,
  bandOf,
  deepFreeze,
  effectiveIndexOf,
  expandSpawns,
  round1,
  round2,
  segmentSeed,
  speedScaleFor,
} from './leveldef';
import type {
  ArenaDef,
  Band,
  BandParams,
  EndlessDef,
  EndlessSegmentDef,
  EnemyKind,
  GenConfig,
  GravityWellDef,
  HazardDef,
  LevelDef,
  ObjectiveDef,
  Obstacle,
  RosterEntry,
  SpawnEntry,
  SpawnPattern,
  SpawnerDef,
  Vec2,
  WaveDef,
  WaveSchedule,
} from './leveldef';
import {
  ARENA_MAX_ASPECT,
  ARENA_MAX_WIDTH,
  BOMBS,
  ENTRY_EDGE_MARGIN,
  ENTRY_OBSTACLE_CLEAR,
  ENTRY_SPAWN_CLEAR,
  FIRST_WAVE_SEC,
  HEX_ASPECT,
  HEX_COS30,
  KILL_RATE,
  LIVES,
  MAX_EST_SEC,
  OBSTACLE_EDGE_GAP,
  OBSTACLE_PAIR_GAP,
  OBSTACLE_SPAWN_CLEAR,
  PAR_MIN,
  PAR_STEP,
  SPAWNER_EDGE,
  SPAWNER_OBSTACLE,
  SPAWNER_SPAWN_WIDTH_FRACTION,
  SPAWNER_WELL,
  WELL_EDGE,
  WELL_OBSTACLE,
  WELL_PAIR,
  WELL_SPAWN_FLOOR,
  WELL_SPAWN_WIDTH_FRACTION,
  inscribedRadius,
  insideArena,
  isArenaConnected,
  obstacleCorners,
  obstacleGap,
  obstaclePointDistance,
  validateLevel,
} from './validate';

/** Stage salts, docs/02 section 2. */
export const SALT = {
  arena: 0xa511e9b3,
  roster: 0x63d83595,
  loadout: 0x2545f491,
  objective: 0x1b873593,
  waves: 0xcc9e2d51,
  hazards: 0x27d4eb2f,
} as const;

/** Mixed into the level seed for re-derive k >= 1. ASCII "RTRY". */
export const RETRY_SALT = 0x52545259;

// Tuning constants, docs/02 sections 6 to 9.
const OBSTACLE_THICK = 24;
const OBSTACLE_MIN_LEN = 160;
const OBSTACLE_MAX_LEN_FRACTION = 0.3;
const OBSTACLE_ATTEMPTS = 40;
const SPAWN_COST: Record<EnemyKind, number> = {
  grunt: 1,
  wanderer: 1,
  pinwheel: 1,
  weaver: 2,
  dart: 4,
  snake: 6,
  // V2 stubs: infinite cost means never affordable. Unreachable today (weight 0 in every band);
  // Foundry sets real costs in wave C.
  charger: Infinity,
  bulwark: Infinity,
  blink: Infinity,
  swirl: Infinity,
  sower: Infinity,
};
const SNAKE_WINDOW_SEC = 30;
const GROUP_START_STEP_SEC = 0.5;
const ENTRY_STEP_SEC = 0.15;
/** Largest in-group spread: with group start at most 1.0 s, offsets stay under W6's 5 s. */
const MAX_GROUP_SPREAD_SEC = 3.5;
const EDGE_INSET = 60;
const EDGE_SPREAD = 40;
const CORNER_INSET = 80;
const ROUND_CORNER_DIAG = 0.7071068;
const POLAR_CORNER_FRACTION = 0.85;
const CLUSTER_JITTER = 40;
/** Cluster anchors sit further in so jittered darts keep W4's 40 u edge margin. */
const CLUSTER_INSET = EDGE_INSET + CLUSTER_JITTER;
const POINT_REDRAWS = 20;
const FALLBACK_RING_RADIUS = 300;
const RING_RADIUS_MIN = 260;
const RING_RADIUS_MAX = 340;
const WELL_ATTEMPTS = 60;
const SPAWNER_ATTEMPTS = 40;
const GEOM_RATE_PER_KILL = 0.1; // docs/02 section 8 step 6: mAvg = 1 + 0.1 x gAvg x K
const PAR_SCALE = 0.5;
const TARGET_FRACTION = 0.8;
const ENDLESS_EXTRA_LIFE_EVERY = 100_000;
const ENDLESS_EXTRA_BOMB_EVERY = 150_000;
const ENDLESS_MAX_LIVES = 9;
const ENDLESS_MAX_BOMBS = 9;

const OBJECTIVE_KINDS = ['scoreInTime', 'survive', 'destroy'] as const;
const SPAWN_ORIGIN: Readonly<Vec2> = Object.freeze({ x: 0, y: 0 });

// Draw helpers over a core Rng.

const range = (r: Rng, lo: number, hi: number): number => lo + (hi - lo) * r();
const intStep = (r: Rng, lo: number, hi: number, step: number): number => lo + step * rngInt(r, 0, Math.floor((hi - lo) / step));
const chance = (r: Rng, p: number): boolean => r() < p;
// "+ 0" turns -0 into 0: JSON drops the sign and J1 compares with Object.is.
const roundTo = (v: number, step: number): number => Math.round(v / step) * step + 0;
const r1 = (v: number): number => round1(v) + 0;
const stream = (seed: number, salt: number): Rng => mulberry32(streamSeed(seed, salt));

function weightedKey<K extends string>(r: Rng, keys: readonly K[], weights: Readonly<Record<K, number>>): K {
  return rngPick(r, keys, keys.map((k) => weights[k]));
}

/** Weighted pick restricted to allowed keys. No draw when nothing allowed has weight. */
function pickAllowed<K extends string>(r: Rng, keys: readonly K[], weights: Readonly<Record<K, number>>, allowed: readonly K[], fallback: K): K {
  const ws = keys.map((k) => (allowed.includes(k) ? weights[k] : 0));
  if (ws.reduce((a, b) => a + b, 0) <= 0) return allowed[0] ?? fallback;
  return rngPick(r, keys, ws);
}

// Arena, docs/02 section 6.

/** Draws: shape, height, aspect (rect family) or none, corner radius (roundRect), then obstacles. */
export function generateArena(r: Rng, band: Band): ArenaDef {
  const b = BANDS[band];
  const shape = weightedKey(r, ARENA_SHAPES, b.shapeWeights);
  const height = intStep(r, b.arenaHeight.min, b.arenaHeight.max, 20);
  let width: number;
  if (shape === 'circle') {
    width = height;
  } else if (shape === 'hexagon') {
    width = round1(height * HEX_ASPECT);
  } else {
    width = Math.min(ARENA_MAX_WIDTH, roundTo(height * range(r, b.aspect.min, b.aspect.max), 20));
    // Rounding up to 20 can overshoot A1's 1.8 aspect at the top of band 4.
    while (width / height > ARENA_MAX_ASPECT) width -= 20;
  }
  const cornerRadius = shape === 'roundRect' ? round1(range(r, 0.15, 0.3) * height) : 0;
  const base: ArenaDef = { shape, width, height, cornerRadius, obstacles: [], spawnPoint: { x: 0, y: 0 } };
  if (shape !== 'rectObstacles') return base;
  const obstacles = placeObstacles(r, base, rngInt(r, b.obstacleCount.min, b.obstacleCount.max));
  return obstacles.length === 0 ? { ...base, shape: 'rect' } : { ...base, obstacles };
}

/** docs/02 section 6.2. Per attempt draws: orientation, length, cx, cy. Stops at the first exhausted obstacle. */
function placeObstacles(r: Rng, arena: ArenaDef, count: number): Obstacle[] {
  const placed: Obstacle[] = [];
  const hw = arena.width / 2;
  const hh = arena.height / 2;
  for (let i = 0; i < count; i++) {
    let done = false;
    for (let a = 0; a < OBSTACLE_ATTEMPTS && !done; a++) {
      const horizontal = chance(r, 0.5);
      const len = roundTo(range(r, OBSTACLE_MIN_LEN, OBSTACLE_MAX_LEN_FRACTION * arena.width), 10);
      const o: Obstacle = {
        cx: roundTo(range(r, -hw, hw), 10),
        cy: roundTo(range(r, -hh, hh), 10),
        w: horizontal ? len : OBSTACLE_THICK,
        h: horizontal ? OBSTACLE_THICK : len,
      };
      if (!obstacleCorners(o).every((p) => insideArena(arena, p, OBSTACLE_EDGE_GAP))) continue;
      if (obstaclePointDistance(o, arena.spawnPoint) < OBSTACLE_SPAWN_CLEAR) continue;
      if (placed.some((p) => obstacleGap(o, p) < OBSTACLE_PAIR_GAP)) continue;
      if (!isArenaConnected({ ...arena, obstacles: [...placed, o] })) continue;
      placed.push(o);
      done = true;
    }
    if (!done) break;
  }
  return placed;
}

// Roster and loadout, docs/02 section 5 steps 3 to 5.

/** Draws: size, then one weighted pick per non grunt slot. Sorted by ENEMY_KINDS order. */
export function generateRoster(r: Rng, band: Band, cfg: GenConfig): RosterEntry[] {
  const w = BANDS[band].rosterWeights;
  const size = BANDS[band].rosterSize;
  const eligible = ENEMY_KINDS.filter((k) => w[k] > 0 && (k !== 'snake' || cfg.enableSnake));
  const want = Math.min(rngInt(r, size.min, size.max), eligible.length);
  const chosen = new Set<EnemyKind>(['grunt']);
  let pool = eligible.filter((k) => k !== 'grunt');
  while (chosen.size < want && pool.length > 0) {
    const k = rngPick(r, pool, pool.map((p) => w[p]));
    chosen.add(k);
    pool = pool.filter((p) => p !== k);
  }
  return ENEMY_KINDS.filter((k) => chosen.has(k)).map((kind) => ({ kind, weight: w[kind] }));
}

// Objective, docs/02 table 4.3. scoreInTime target is filled after par.

/** Draws: kind, then its one parameter. */
export function generateObjective(r: Rng, b: BandParams): ObjectiveDef {
  const kind = weightedKey(r, OBJECTIVE_KINDS, b.objectiveWeights);
  switch (kind) {
    case 'survive':
      return { kind, durationSec: intStep(r, b.surviveSec.min, b.surviveSec.max, 5) };
    case 'destroy':
      return { kind, count: intStep(r, b.destroyCount.min, b.destroyCount.max, 5) };
    case 'scoreInTime':
      return { kind, target: PAR_MIN, timeLimitSec: intStep(r, b.scoreTimeSec.min, b.scoreTimeSec.max, 15) };
  }
}

const objectiveTimeSec = (o: ObjectiveDef): number | null =>
  o.kind === 'survive' ? o.durationSec : o.kind === 'scoreInTime' ? o.timeLimitSec : null;

// Spawn points, docs/02 section 7.1.

function spawnPointOk(arena: ArenaDef, p: Vec2): boolean {
  if (!insideArena(arena, p, ENTRY_EDGE_MARGIN)) return false;
  if (Math.hypot(p.x - arena.spawnPoint.x, p.y - arena.spawnPoint.y) < ENTRY_SPAWN_CLEAR) return false;
  return arena.obstacles.every((o) => obstaclePointDistance(o, p) >= ENTRY_OBSTACLE_CLEAR);
}

const isPolar = (arena: ArenaDef): boolean => arena.shape === 'circle' || arena.shape === 'hexagon';

interface EdgeAnchor {
  p: Vec2;
  /** Unit tangent along the edge. */
  tx: number;
  ty: number;
}

/** Draws: side and position (rect family) or one integer angle (circle, hexagon). */
function edgeAnchor(r: Rng, arena: ArenaDef, inset: number): EdgeAnchor {
  if (isPolar(arena)) {
    const deg = rngInt(r, 0, 359);
    const rad = (deg * Math.PI) / 180;
    const d = inscribedRadius(arena) - inset;
    return { p: { x: d * Math.cos(rad), y: d * Math.sin(rad) }, tx: -Math.sin(rad), ty: Math.cos(rad) };
  }
  const side = rngInt(r, 0, 3);
  const along = range(r, -1, 1);
  const hw = arena.width / 2 - inset;
  const hh = arena.height / 2 - inset;
  if (side < 2) return { p: { x: along * hw, y: side === 0 ? -hh : hh }, tx: 1, ty: 0 };
  return { p: { x: side === 2 ? -hw : hw, y: along * hh }, tx: 0, ty: 1 };
}

/** Four corner spawn points, order (-,-), (+,-), (+,+), (-,+). */
function cornerPoints(arena: ArenaDef): Vec2[] {
  const sx = [-1, 1, 1, -1];
  const sy = [-1, -1, 1, 1];
  let ox: number;
  let oy: number;
  if (isPolar(arena)) {
    // 0.85 of the inscribed radius at 45 degrees: 0.85 x circumradius would leave a hexagon.
    ox = oy = POLAR_CORNER_FRACTION * inscribedRadius(arena) * ROUND_CORNER_DIAG;
  } else if (arena.shape === 'roundRect') {
    // On the corner circle's diagonal, CORNER_INSET in from the rounded wall.
    const rc = arena.cornerRadius;
    ox = arena.width / 2 - rc + (rc - CORNER_INSET) * ROUND_CORNER_DIAG;
    oy = arena.height / 2 - rc + (rc - CORNER_INSET) * ROUND_CORNER_DIAG;
  } else {
    ox = arena.width / 2 - CORNER_INSET;
    oy = arena.height / 2 - CORNER_INSET;
  }
  return sx.map((s, i) => ({ x: r1(s * ox), y: r1((sy[i] ?? 1) * oy) }));
}

const roundPoint = (p: Vec2): Vec2 => ({ x: r1(p.x), y: r1(p.y) });

/** One fresh candidate for a redraw. Draws as edgeAnchor, or one corner index. */
function redrawPoint(r: Rng, arena: ArenaDef, pattern: SpawnPattern): Vec2 {
  if (pattern === 'corners') return cornerPoints(arena)[rngInt(r, 0, 3)] ?? SPAWN_ORIGIN;
  return roundPoint(edgeAnchor(r, arena, pattern === 'cluster' ? CLUSTER_INSET : EDGE_INSET).p);
}

type Placement = { mode: 'fixed'; p: Vec2 } | { mode: 'ring'; angleDeg: number; radius: number };

/** Valid candidate as is; else up to POINT_REDRAWS redraws; else a ring spawn at 300 u. */
function settle(r: Rng, arena: ArenaDef, pattern: SpawnPattern, candidate: Vec2): Placement {
  if (spawnPointOk(arena, candidate)) return { mode: 'fixed', p: candidate };
  for (let i = 0; i < POINT_REDRAWS; i++) {
    const p = redrawPoint(r, arena, pattern);
    if (spawnPointOk(arena, p)) return { mode: 'fixed', p };
  }
  return { mode: 'ring', angleDeg: rngInt(r, 0, 359), radius: FALLBACK_RING_RADIUS };
}

/** Per group draws: pattern geometry first, then per entry any redraws and the heading. */
function emitGroup(r: Rng, arena: ArenaDef, kind: EnemyKind, count: number, pattern: SpawnPattern, startSec: number): SpawnEntry[] {
  const step = count > 1 ? Math.min(ENTRY_STEP_SEC, MAX_GROUP_SPREAD_SEC / (count - 1)) : 0;
  const placements: Placement[] = [];
  if (pattern === 'ring') {
    const radius = intStep(r, RING_RADIUS_MIN, RING_RADIUS_MAX, 10);
    const start = rngInt(r, 0, 359);
    const stepDeg = Math.round(360 / count);
    for (let k = 0; k < count; k++) placements.push({ mode: 'ring', angleDeg: (start + k * stepDeg) % 360, radius });
  } else if (pattern === 'corners') {
    const corners = cornerPoints(arena);
    const start = rngInt(r, 0, 3);
    for (let k = 0; k < count; k++) placements.push(settle(r, arena, pattern, corners[(start + k) % 4] ?? SPAWN_ORIGIN));
  } else if (pattern === 'edges') {
    const a = edgeAnchor(r, arena, EDGE_INSET);
    for (let k = 0; k < count; k++) {
      const off = (k - (count - 1) / 2) * EDGE_SPREAD;
      placements.push(settle(r, arena, pattern, roundPoint({ x: a.p.x + a.tx * off, y: a.p.y + a.ty * off })));
    }
  } else {
    const a = edgeAnchor(r, arena, CLUSTER_INSET);
    for (let k = 0; k < count; k++) {
      const jx = range(r, -CLUSTER_JITTER, CLUSTER_JITTER);
      const jy = range(r, -CLUSTER_JITTER, CLUSTER_JITTER);
      placements.push(settle(r, arena, pattern, roundPoint({ x: a.p.x + jx, y: a.p.y + jy })));
    }
  }
  return placements.map((pl, k) => ({
    kind,
    tOffsetSec: round2(startSec + k * step),
    mode: pl.mode,
    x: pl.mode === 'fixed' ? pl.p.x : 0,
    y: pl.mode === 'fixed' ? pl.p.y : 0,
    angleDeg: pl.mode === 'ring' ? pl.angleDeg : 0,
    radius: pl.mode === 'ring' ? pl.radius : 0,
    headingDeg: kind === 'wanderer' || kind === 'pinwheel' ? rngInt(r, 0, 359) : 0,
  }));
}

/** docs/02 section 7 step 6. Draws one pick for kinds with a choice. */
function patternFor(r: Rng, kind: EnemyKind): SpawnPattern {
  switch (kind) {
    case 'grunt':
      return rngPick(r, ['edges', 'corners', 'ring'] as const);
    case 'wanderer':
      return rngPick(r, ['corners', 'edges'] as const);
    case 'weaver':
      return rngPick(r, ['ring', 'edges'] as const);
    case 'pinwheel':
      return 'edges';
    case 'dart':
      return 'cluster';
    case 'snake':
      return 'corners';
    // V2 stubs: no PRNG draw and unreachable today (weight 0). Foundry picks real patterns in wave C.
    case 'charger':
    case 'bulwark':
    case 'blink':
    case 'swirl':
    case 'sower':
      return 'edges';
  }
}

// Waves, docs/02 section 7.

interface WaveRun {
  arena: ArenaDef;
  roster: readonly RosterEntry[];
  b: BandParams;
  tStart: number;
  /** Waves start while t < tEnd. */
  tEnd: number;
  /** Added to t before the ramp lookup (Endless segments). */
  rampOffsetSec: number;
  /** Bands 3 and 4 in Endless play at the end of the ramp. */
  fullRamp: boolean;
  /** Extra spawn units per wave (Endless band 4 escalation). */
  budgetBonus: number;
}

function rampU(run: WaveRun, t: number): number {
  if (run.fullRamp) return 1;
  return Math.pow(Math.min(1, (t + run.rampOffsetSec) / run.b.rampSec), run.b.rampExponent);
}

/** Per wave draws: group count, then per group kind, count draws (snake none, dart 5 to 8 per pack), pattern, emitGroup. */
export function generateWaveList(r: Rng, run: WaveRun): WaveDef[] {
  const { b, roster } = run;
  const waves: WaveDef[] = [];
  const snakeTimes: number[] = [];
  for (let t = run.tStart, i = 0; t < run.tEnd; i++) {
    const u = rampU(run, t);
    const budget = Math.round(b.budgetStart + (b.budgetEnd - b.budgetStart) * u) + run.budgetBonus;
    let groups = rngInt(r, b.groupsPerWave.min, b.groupsPerWave.max);
    while (groups > budget) groups--;
    const share = Math.floor(budget / groups);
    const entries: SpawnEntry[] = [];
    let first: SpawnPattern | null = null;
    for (let g = 0; g < groups; g++) {
      const gb = share + (g === 0 ? budget - share * groups : 0);
      const fits = roster.filter((e) => SPAWN_COST[e.kind] <= gb);
      let kind = rngPick(
        r,
        fits.map((e) => e.kind),
        fits.map((e) => e.weight),
      );
      let count = 0;
      if (kind === 'snake') {
        const room = b.maxLiveSnakes - snakeTimes.filter((s) => s > t - SNAKE_WINDOW_SEC).length;
        if (room <= 0) kind = 'grunt';
        else {
          count = Math.min(Math.floor(gb / SPAWN_COST.snake), room);
          for (let k = 0; k < count; k++) snakeTimes.push(t);
        }
      }
      if (kind === 'dart') {
        for (let p = 0; p < Math.floor(gb / SPAWN_COST.dart); p++) count += rngInt(r, 5, 8);
      } else if (kind !== 'snake') {
        count = Math.floor(gb / SPAWN_COST[kind]);
      }
      const pattern = patternFor(r, kind);
      first ??= pattern;
      entries.push(...emitGroup(r, run.arena, kind, count, pattern, g * GROUP_START_STEP_SEC));
    }
    waves.push({ index: i, atSec: t, pattern: first ?? 'edges', entries });
    t = round1(t + b.intervalStartSec + (b.intervalEndSec - b.intervalStartSec) * u);
  }
  return waves;
}

function scheduleOf(b: BandParams, waves: WaveDef[], loopFromIndex: number, loopPeriodSec: number, budgetBonus = 0): WaveSchedule {
  return {
    maxLiveEnemies: b.maxLiveEnemies,
    intervalStartSec: b.intervalStartSec,
    intervalEndSec: b.intervalEndSec,
    rampSec: b.rampSec,
    rampExponent: b.rampExponent,
    budgetStart: b.budgetStart,
    budgetEnd: b.budgetEnd + budgetBonus,
    waves,
    loopFromIndex,
    loopPeriodSec,
  };
}

/** docs/02 section 7 step 3: loop the hard second half of the schedule. */
function loopFields(waves: readonly WaveDef[], scheduleSec: number, intervalEndSec: number): { from: number; period: number } {
  const found = waves.findIndex((w) => w.atSec >= 0.5 * scheduleSec);
  const from = found >= 0 ? found : waves.length - 1;
  const last = waves[waves.length - 1];
  const start = waves[from];
  const period = last !== undefined && start !== undefined ? round1(last.atSec + intervalEndSec - start.atSec) : intervalEndSec;
  return { from, period: Math.max(period, intervalEndSec) };
}

// Hazards, docs/02 section 9.

/** Farthest distance from the centre a point can be while inside the arena with margin. */
function farthestInside(arena: ArenaDef, margin: number): number {
  const hw = arena.width / 2 - margin;
  const hh = arena.height / 2 - margin;
  switch (arena.shape) {
    case 'circle':
      return arena.width / 2 - margin;
    case 'hexagon':
      return (HEX_COS30 * (arena.width / 2) - margin) / HEX_COS30;
    case 'roundRect': {
      const rc = arena.cornerRadius;
      if (rc <= margin) return Math.hypot(hw, hh);
      return Math.hypot(arena.width / 2 - rc, arena.height / 2 - rc) + rc - margin;
    }
    default:
      return Math.hypot(hw, hh);
  }
}

function randomPoint(r: Rng, arena: ArenaDef): Vec2 {
  return { x: r1(range(r, -arena.width / 2, arena.width / 2)), y: r1(range(r, -arena.height / 2, arena.height / 2)) };
}

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Draws: well count (always), well positions, then if enabled spawner count, positions, and one
 * spawnAtSec per placed spawner. Feasibility pre-check uses the farthest inside point rather
 * than the inscribed radius, so rect arenas can reach their corners (circle and hexagon in band 2
 * still get none, as docs/02 section 9.1 expects).
 */
export function generateHazards(r: Rng, arena: ArenaDef, b: BandParams, cfg: GenConfig, objective: ObjectiveDef): HazardDef {
  const wells: GravityWellDef[] = [];
  const nWells = rngInt(r, b.wells.min, b.wells.max);
  const wellMin = Math.max(WELL_SPAWN_WIDTH_FRACTION * arena.width, WELL_SPAWN_FLOOR);
  if (farthestInside(arena, WELL_EDGE) >= wellMin) {
    for (let i = 0; i < nWells; i++) {
      let placed = false;
      for (let a = 0; a < WELL_ATTEMPTS && !placed; a++) {
        const p = randomPoint(r, arena);
        if (dist(p, arena.spawnPoint) < wellMin) continue;
        if (!insideArena(arena, p, WELL_EDGE)) continue;
        if (arena.obstacles.some((o) => obstaclePointDistance(o, p) < WELL_OBSTACLE)) continue;
        if (wells.some((w) => dist(w, p) < WELL_PAIR)) continue;
        wells.push(p);
        placed = true;
      }
      if (!placed) break;
    }
  }
  const spawners: SpawnerDef[] = [];
  if (cfg.enableSpawner) {
    const n = rngInt(r, b.spawners.min, b.spawners.max);
    const spawnerMin = SPAWNER_SPAWN_WIDTH_FRACTION * arena.width;
    for (let i = 0; i < n; i++) {
      let p: Vec2 | null = null;
      for (let a = 0; a < SPAWNER_ATTEMPTS && p === null; a++) {
        const c = randomPoint(r, arena);
        if (!insideArena(arena, c, SPAWNER_EDGE)) continue;
        if (dist(c, arena.spawnPoint) < spawnerMin) continue;
        if (wells.some((w) => dist(w, c) < SPAWNER_WELL)) continue;
        if (arena.obstacles.some((o) => obstaclePointDistance(o, c) < SPAWNER_OBSTACLE)) continue;
        if (spawners.some((s) => dist(s, c) < SPAWNER_WELL)) continue;
        p = c;
      }
      if (p === null) break;
      let spawnAtSec = intStep(r, b.spawnerAtSec.min, b.spawnerAtSec.max, 5);
      if (objective.kind === 'survive' && objective.durationSec < spawnAtSec + 10) spawnAtSec = Math.max(5, objective.durationSec - 20);
      spawners.push({ x: p.x, y: p.y, spawnAtSec, emitEverySec: b.spawnerEmitEverySec, dartsPerEmit: b.spawnerDartsPerEmit });
    }
  }
  return { wells, spawners };
}

// Par, docs/02 section 8.

/** Returns par and, for scoreInTime, the target. Pure arithmetic on the expanded schedule. */
export function computePar(waves: WaveSchedule, objective: ObjectiveDef): { par: number; target: number } {
  const all = expandSpawns(waves, MAX_EST_SEC);
  let spawned: { t: number; kind: EnemyKind }[];
  if (objective.kind === 'destroy') {
    const need = Math.ceil(objective.count / KILL_RATE);
    spawned = all.slice(0, Math.min(need, all.length));
  } else {
    const T = objective.kind === 'survive' ? objective.durationSec : objective.timeLimitSec;
    spawned = all.filter((s) => s.t < T);
  }
  let par = PAR_MIN;
  if (spawned.length > 0) {
    const baseTotal = spawned.reduce((a, s) => a + ENEMY_BASE[s.kind], 0);
    const gAvg = spawned.reduce((a, s) => a + ENEMY_GEOMS[s.kind], 0) / spawned.length;
    const K = objective.kind === 'destroy' ? objective.count : KILL_RATE * spawned.length;
    const baseSum = objective.kind === 'destroy' ? (baseTotal * objective.count) / spawned.length : KILL_RATE * baseTotal;
    const mAvg = 1 + GEOM_RATE_PER_KILL * gAvg * K;
    par = Math.max(PAR_MIN, Math.round((baseSum * mAvg * PAR_SCALE) / PAR_STEP) * PAR_STEP);
  }
  const target = Math.min(par, Math.max(PAR_MIN, Math.round((TARGET_FRACTION * par) / PAR_STEP) * PAR_STEP));
  return { par, target };
}

// Assembly.

/** Seed every stage stream derives from on attempt k. Attempt 0 is the level seed itself. */
export function attemptSeed(seed: number, attempt: number): number {
  return attempt === 0 ? seed >>> 0 : fmix32((seed ^ Math.imul(RETRY_SALT, attempt)) >>> 0);
}

function buildLevel(runSeed: number, levelIndex: number, seed: number, attempt: number, cfg: GenConfig): LevelDef {
  const s = attemptSeed(seed, attempt);
  const band = bandOf(levelIndex);
  const b = BANDS[band];
  const arena = generateArena(stream(s, SALT.arena), band);
  const roster = generateRoster(stream(s, SALT.roster), band, cfg);
  const loadout = stream(s, SALT.loadout);
  const drone = pickAllowed(loadout, DRONE_KINDS, b.droneWeights, cfg.drones, 'attack');
  const superType = pickAllowed(loadout, SUPER_KINDS, b.superWeights, cfg.supers, 'turbo');
  let objective = generateObjective(stream(s, SALT.objective), b);
  const timed = objectiveTimeSec(objective);
  const scheduleSec = timed === null ? b.scheduleSec : Math.max(b.scheduleSec, timed + 10);
  const list = generateWaveList(stream(s, SALT.waves), {
    arena,
    roster,
    b,
    tStart: FIRST_WAVE_SEC,
    tEnd: scheduleSec,
    rampOffsetSec: 0,
    fullRamp: false,
    budgetBonus: 0,
  });
  const loop = loopFields(list, scheduleSec, b.intervalEndSec);
  const waves = scheduleOf(b, list, loop.from, loop.period);
  const hazards = generateHazards(stream(s, SALT.hazards), arena, b, cfg, objective);
  const { par, target } = computePar(waves, objective);
  if (objective.kind === 'scoreInTime') objective = { ...objective, target };
  return {
    version: LEVELDEF_VERSION,
    generatorVersion: GENERATOR_VERSION,
    runSeed,
    levelIndex,
    seed,
    band,
    arena,
    roster,
    speedScale: speedScaleFor(levelIndex),
    drone,
    superType,
    lives: LIVES,
    bombs: BOMBS,
    objective,
    waves,
    hazards,
    par,
    stars: [par, 2 * par, 4 * par],
    surface: 'flat',
    retries: attempt,
  };
}

/**
 * Level n of a run. Seed is deriveSeed(runSeed, levelIndex) (=== levelSeed). If an attempt fails
 * validateLevel, re-derive with attemptSeed(seed, k) for k = 1 to MAX_RETRIES and record k in
 * retries. If every attempt fails, the last one is returned (a slightly off level beats a crash).
 */
export function generateLevel(runSeed: number, levelIndex: number, cfg: GenConfig = DEFAULT_GEN_CONFIG): LevelDef {
  return generateLevelChecked(runSeed, levelIndex, cfg, (d) => validateLevel(d).ok);
}

/** generateLevel with the acceptance test injected, so tests can drive the retry path. */
export function generateLevelChecked(runSeed: number, levelIndex: number, cfg: GenConfig, accept: (def: LevelDef) => boolean): LevelDef {
  const rs = runSeed >>> 0;
  const seed = deriveSeed(rs, levelIndex);
  let def = buildLevel(rs, levelIndex, seed, 0, cfg);
  for (let k = 1; k <= MAX_RETRIES && !accept(def); k++) def = buildLevel(rs, levelIndex, seed, k, cfg);
  return deepFreeze(def);
}

// Endless, docs/02 section 10 and docs/01 section 2.2.

/** Extra spawn units per wave in segment s: 0 before band 4, then +1 per segment without bound. */
export function endlessBudgetBonus(segment: number): number {
  return Math.max(0, segment - ENDLESS_BAND4_SEGMENT) * ENDLESS_BUDGET_PER_SEGMENT;
}

/** Endless segment s: roster and waves only, atSec relative to segment start, all below 30 s. */
export function generateEndlessSegment(endlessSeed: number, segment: number, cfg: GenConfig = DEFAULT_GEN_CONFIG): EndlessSegmentDef {
  const es = endlessSeed >>> 0;
  const seed = segmentSeed(es, segment);
  const effectiveIndex = effectiveIndexOf(segment);
  const band = bandOf(effectiveIndex);
  const b = BANDS[band];
  const roster = generateRoster(stream(seed, SALT.roster), band, cfg);
  const bonus = endlessBudgetBonus(segment);
  const list = generateWaveList(stream(seed, SALT.waves), {
    arena: ENDLESS_ARENA,
    roster,
    b,
    tStart: segment === 0 ? FIRST_WAVE_SEC : 0,
    tEnd: ENDLESS_SEGMENT_SEC,
    rampOffsetSec: ENDLESS_SEGMENT_SEC * segment,
    fullRamp: band >= 3,
    budgetBonus: bonus,
  });
  return deepFreeze({
    version: LEVELDEF_VERSION,
    generatorVersion: GENERATOR_VERSION,
    endlessSeed: es,
    segment,
    seed,
    effectiveIndex,
    band,
    roster,
    speedScale: speedScaleFor(effectiveIndex),
    waves: scheduleOf(b, list, -1, 0, bonus),
  });
}

/**
 * Endless game definition: fixed 1600 x 1000 arena, objective none, Attack drone, Turbo super,
 * the full catalogue roster. Waves come per 30 s segment from generateEndlessSegment, whose
 * budget keeps growing after segment 15 (the unbounded ramp). No PRNG draws here.
 */
export function generateEndless(endlessSeed: number, cfg: GenConfig = DEFAULT_GEN_CONFIG): EndlessDef {
  const w = BANDS[4].rosterWeights;
  return deepFreeze({
    version: LEVELDEF_VERSION,
    generatorVersion: GENERATOR_VERSION,
    mode: 'endless',
    endlessSeed: endlessSeed >>> 0,
    surface: 'flat',
    arena: structuredCloneArena(ENDLESS_ARENA),
    roster: ENEMY_KINDS.filter((k) => k !== 'snake' || cfg.enableSnake).map((kind) => ({ kind, weight: w[kind] })),
    drone: 'attack',
    superType: 'turbo',
    lives: LIVES,
    bombs: BOMBS,
    extraLifeEvery: ENDLESS_EXTRA_LIFE_EVERY,
    extraBombEvery: ENDLESS_EXTRA_BOMB_EVERY,
    maxLives: ENDLESS_MAX_LIVES,
    maxBombs: ENDLESS_MAX_BOMBS,
    objective: { kind: 'none' },
    hazards: { wells: [], spawners: [] },
    segmentSec: ENDLESS_SEGMENT_SEC,
    budgetPerSegment: ENDLESS_BUDGET_PER_SEGMENT,
    band4Segment: ENDLESS_BAND4_SEGMENT,
  });
}

function structuredCloneArena(a: Readonly<ArenaDef>): ArenaDef {
  return {
    shape: a.shape,
    width: a.width,
    height: a.height,
    cornerRadius: a.cornerRadius,
    obstacles: a.obstacles.map((o) => ({ ...o })),
    spawnPoint: { ...a.spawnPoint },
  };
}

// Hash, for on screen comparison of two devices' levels.

/** JSON with object keys sorted at every depth; undefined members dropped as JSON.stringify does. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonicalJson(x))).join(',')}]`;
  if (typeof v === 'object' && v !== null) {
    const rec = v as Record<string, unknown>;
    const keys = Object.keys(rec)
      .filter((k) => rec[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(rec[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** FNV-1a over UTF-16 code units, avalanched with fmix32. Returns a uint32. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return fmix32(h);
}

/** Short stable hash of the canonical JSON: 8 upper case hex digits. */
export function levelHash(def: LevelDef | EndlessDef): string {
  return fnv1a(canonicalJson(def)).toString(16).toUpperCase().padStart(8, '0');
}
