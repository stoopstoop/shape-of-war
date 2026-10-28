# Shape of War: level generator technical design

Status: draft by Scribe-A for Fable review. Derived from SPEC.md section 3.3 and `docs/01-game-design.md`. SPEC.md wins on conflict. Owner at build time: Foundry (`src/levelgen/`, `tests/generator.test.ts`, `tests/validate.test.ts`). `src/core/rng.ts` is owned by Forge; its contents are specified here so both agents build against the same code.

## 0. Risks and unknowns first

- Risk: cross-engine float drift. mulberry32 is integer only and exact everywhere. `Math.sin` and `Math.cos` are not specified bit-exact by ECMAScript. Mitigation: the generator stores angles as integer degrees where possible, rounds every emitted coordinate to 0.1 u with `round1`, and only targets V8 (Chrome, Samsung Internet, Node 22 for tests), which uses one fdlibm port on every platform. Golden snapshot tests (section 12) catch drift.
- Risk: obstacle rejection loops. Every random placement has a fixed attempt cap and a deterministic fallback. The generator never loops unbounded.
- Risk: par scores are an estimate from the wave schedule, not from playtesting. The formula has one tuning constant (`PAR_SCALE`, section 8). Retune after G2 and log it in `docs/DECISIONS.md`.
- Unknown: exact golden LevelDef values for the worked example seeds. They depend on the implementation and are captured by Foundry as snapshots on first green run (section 13). This doc gives the seeds (computed and exact) and the expected shape and ranges.
- Known: changing any table in this doc changes the output for every seed. Bump `GENERATOR_VERSION` on every such change. Saved progress stores level indices, not LevelDefs, so a bump only changes future levels.

## 1. Contract

```ts
generateLevel(runSeed: number, levelIndex: number, cfg?: GenConfig): LevelDef
generateEndlessSegment(endlessSeed: number, segment: number, cfg?: GenConfig): EndlessSegmentDef
validateLevel(def: LevelDef): ValidationResult
```

- Pure functions. No globals, no `Date`, no `Math.random`, no DOM, no Pixi.
- Output is plain data: numbers, strings, booleans, arrays, plain objects. `JSON.parse(JSON.stringify(def))` deep equals `def`.
- Output is frozen with a recursive `Object.freeze` in dev builds.
- Simulation and render read the LevelDef and never call the PRNG. Runtime variation uses the stateless `hash01` (section 2).

## 2. Seeded PRNG

Choice: mulberry32. Why: 32-bit state fits the SPEC's 32-bit seed directly, about 10 lines, integer only so exact across engines, fast enough (generation draws under 10,000 numbers). Period 2^32 is far beyond need. xoshiro128 is rejected: 128-bit state needs a seeding step and adds code for no benefit at this scale.

`src/core/rng.ts`:

```ts
/** mulberry32: returns a function yielding floats in [0, 1). Exact across JS engines. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

/** Independent stream per generator stage, so one stage's draw count never shifts another's. */
export function streamSeed(seed: number, salt: number): number {
  return fmix32((seed ^ salt) >>> 0);
}

/** Stateless hash to [0, 1) for runtime cosmetic variation. Simulation and render use this, never a PRNG. */
export function hash01(a: number, b = 0): number {
  return fmix32(Math.imul(a >>> 0, 0x9e3779b1) ^ fmix32((b + 0x7f4a7c15) >>> 0)) / 4294967296;
}

/** The only entropy source in the codebase: new run seeds and Endless seeds. */
export function freshSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] >>> 0;
}

export class Rng {
  private readonly next: () => number;
  constructor(seed: number) { this.next = mulberry32(seed); }
  float(): number { return this.next(); }
  range(lo: number, hi: number): number { return lo + (hi - lo) * this.next(); }
  /** Inclusive integer range. */
  int(lo: number, hi: number): number { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  /** Inclusive integer range snapped to a step, e.g. intStep(45, 60, 5). */
  intStep(lo: number, hi: number, step: number): number { return lo + step * this.int(0, Math.floor((hi - lo) / step)); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(items: readonly T[]): T { return items[Math.floor(this.next() * items.length)]; }
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r < 0) return items[i]; }
    return items[items.length - 1];
  }
}

export const round1 = (v: number): number => Math.round(v * 10) / 10;
```

Known test vectors (computed under Node 22):

| Seed | First three outputs |
|---|---|
| 0x00000000 | 0.2664292087, 0.0003297457, 0.2232720274 |
| 0x00000001 | 0.6270739406, 0.0027357212, 0.5274470400 |
| 0xDEADBEEF | 0.9413696141, 0.2671957498, 0.7720333575 |

Stage salts (constants in `generator.ts`):

| Stage | Salt |
|---|---|
| arena | 0xA511E9B3 |
| roster | 0x63D83595 |
| loadout | 0x2545F491 |
| objective | 0x1B873593 |
| waves | 0xCC9E2D51 |
| hazards | 0x27D4EB2F |

Run seed: created once with `freshSeed()` on first launch, stored in `sow.progress.runSeed`, reset only by "Reset progress". Level indices start at 1.

## 3. LevelDef interface

`src/levelgen/leveldef.ts`. Types only plus pure helpers. No classes, no functions inside data.

```ts
export const LEVELDEF_VERSION = 1;
export const GENERATOR_VERSION = 1;

export type Band = 1 | 2 | 3 | 4;
export type ArenaShape = 'rect' | 'roundRect' | 'circle' | 'hexagon' | 'rectObstacles';
export type EnemyKind = 'grunt' | 'wanderer' | 'weaver' | 'pinwheel' | 'dart' | 'snake';
export type DroneKind = 'attack' | 'collect' | 'ram';
export type SuperKind = 'homing' | 'detonate' | 'turbo';
export type SpawnPattern = 'edges' | 'corners' | 'ring' | 'cluster';

export interface Vec2 { x: number; y: number; }

/** Axis-aligned wall. Centre and full size in arena units. */
export interface Obstacle { cx: number; cy: number; w: number; h: number; }

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

export interface RosterEntry { kind: EnemyKind; weight: number; }

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

export interface GravityWellDef { x: number; y: number; }

export interface SpawnerDef {
  x: number;
  y: number;
  spawnAtSec: number;
  emitEverySec: number;
  dartsPerEmit: number;
}

export interface HazardDef {
  wells: GravityWellDef[];     // 0 to 3
  spawners: SpawnerDef[];      // 0 to 2
}

export interface LevelDef {
  version: typeof LEVELDEF_VERSION;
  generatorVersion: number;
  runSeed: number;
  levelIndex: number;
  seed: number;
  band: Band;
  arena: ArenaDef;
  roster: RosterEntry[];       // 3 to 6, distinct kinds, always contains grunt
  speedScale: number;          // 1.00 to 1.40, 2 decimals
  drone: DroneKind;
  superType: SuperKind;
  lives: number;               // 3
  bombs: number;               // 3
  objective: ObjectiveDef;
  waves: WaveSchedule;
  hazards: HazardDef;
  par: number;                 // multiple of 500, at least 1000
  stars: [number, number, number]; // [par, 2 x par, 4 x par]
}

export interface EndlessSegmentDef {
  version: typeof LEVELDEF_VERSION;
  generatorVersion: number;
  endlessSeed: number;
  segment: number;             // 0-based
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

export interface ValidationResult { ok: boolean; errors: string[]; }

export const ENEMY_BASE: Record<EnemyKind, number> = {
  grunt: 50, wanderer: 10, weaver: 100, pinwheel: 25, dart: 30, snake: 200,
};
export const ENEMY_GEOMS: Record<EnemyKind, number> = {
  grunt: 1, wanderer: 1, weaver: 2, pinwheel: 1, dart: 1, snake: 4,
};

/** Shared by par calculation and sim loop handling. Expands loops up to tEnd. */
export function expandSpawns(w: WaveSchedule, tEndSec: number): { t: number; kind: EnemyKind }[] {
  const out: { t: number; kind: EnemyKind }[] = [];
  const push = (wave: WaveDef, shift: number): void => {
    for (const e of wave.entries) {
      const t = wave.atSec + shift + e.tOffsetSec;
      if (t < tEndSec) out.push({ t, kind: e.kind });
    }
  };
  for (const wave of w.waves) push(wave, 0);
  if (w.loopFromIndex >= 0 && w.loopPeriodSec > 0) {
    for (let k = 1; ; k++) {
      const shift = k * w.loopPeriodSec;
      if (w.waves[w.loopFromIndex].atSec + shift >= tEndSec) break;
      for (let i = w.loopFromIndex; i < w.waves.length; i++) push(w.waves[i], shift);
    }
  }
  return out.sort((a, b) => a.t - b.t);
}
```

Gravity wells and spawners are hazards, not roster entries. Their sim kinds live in `src/game/enemies/` and are not part of `EnemyKind`.

## 4. Band parameter tables

`bandOf(n)`: 1 for n 1 to 5, 2 for 6 to 15, 3 for 16 to 30, 4 for 31 and above.

### 4.1 Arena

| Parameter | Band 1 | Band 2 | Band 3 | Band 4 |
|---|---|---|---|---|
| Height H (u, step 20) | 700 to 760 | 760 to 880 | 860 to 1000 | 940 to 1100 |
| Aspect W/H (rect, roundRect, rectObstacles) | 1.30 to 1.50 | 1.30 to 1.60 | 1.35 to 1.70 | 1.40 to 1.80 |
| Weight rect | 40 | 25 | 15 | 10 |
| Weight roundRect | 30 | 25 | 15 | 10 |
| Weight circle | 15 | 15 | 15 | 15 |
| Weight hexagon | 15 | 15 | 20 | 20 |
| Weight rectObstacles | 0 | 20 | 35 | 45 |
| Obstacle count | n/a | 1 | 1 to 2 | 1 to 3 |
| Corner radius (roundRect) | 0.15 to 0.30 x H | same | same | same |

### 4.2 Roster, speed, loadout

| Parameter | Band 1 | Band 2 | Band 3 | Band 4 |
|---|---|---|---|---|
| Roster size | 3 | 3 to 4 | 4 to 5 | 5 to 6 |
| Weight grunt (forced) | 40 | 30 | 25 | 20 |
| Weight wanderer | 35 | 20 | 12 | 8 |
| Weight pinwheel | 25 | 15 | 10 | 8 |
| Weight weaver | 0 | 20 | 20 | 18 |
| Weight dart | 0 | 15 | 18 | 20 |
| Weight snake | 0 | 0 | 15 | 16 |
| speedScale | 1.00 | 1.05 | 1.10 | min(1.40, 1.20 + 0.005 x (n minus 31)) |
| Drone weights attack / collect / ram | 100 / 0 / 0 | 50 / 30 / 20 | 34 / 33 / 33 | 34 / 33 / 33 |
| Super weights homing / detonate / turbo | 34 / 0 / 66 | 34 / 33 / 33 | 34 / 33 / 33 | 34 / 33 / 33 |

Band 1 super has no Detonate weight because band 1 uses only the Attack drone and Detonate on day one teaches nothing. Band 1 roster is always the full eligible set: grunt, wanderer, pinwheel.

### 4.3 Objective

| Parameter | Band 1 | Band 2 | Band 3 | Band 4 |
|---|---|---|---|---|
| Weight scoreInTime / survive / destroy | 20 / 40 / 40 | 34 / 33 / 33 | 34 / 33 / 33 | 34 / 33 / 33 |
| survive durationSec (step 5) | 45 to 60 | 60 to 90 | 75 to 105 | 90 to 120 |
| destroy count (step 5) | 30 to 50 | 60 to 100 | 100 to 150 | 150 to 220 |
| scoreInTime timeLimitSec (step 15) | 60 | 75 to 90 | 90 to 105 | 105 to 120 |

### 4.4 Waves

| Parameter | Band 1 | Band 2 | Band 3 | Band 4 |
|---|---|---|---|---|
| First wave atSec | 2.5 | 2.5 | 2.5 | 2.5 |
| intervalStartSec | 6.0 | 5.0 | 4.5 | 4.0 |
| intervalEndSec | 4.0 | 3.0 | 2.5 | 2.0 |
| rampSec | 60 | 90 | 120 | 120 |
| rampExponent | 1.0 | 1.2 | 1.4 | 1.6 |
| budgetStart (spawn units) | 3 | 5 | 6 | 8 |
| budgetEnd | 8 | 12 | 16 | 20 |
| Groups per wave | 1 to 2 | 1 to 3 | 1 to 3 | 1 to 3 |
| maxLiveEnemies | 60 | 90 | 120 | 160 |
| Schedule length scheduleSec | 120 | 150 | 180 | 180 |
| Max live snakes | 0 | 0 | 2 | 3 |

Spawn unit cost: grunt 1, wanderer 1, pinwheel 1, weaver 2, dart group 4, snake 6.

### 4.5 Hazards

| Parameter | Band 1 | Band 2 | Band 3 | Band 4 |
|---|---|---|---|---|
| Gravity wells | 0 | 0 to 1 | 1 to 2 | 1 to 3 |
| Spawners | 0 | 0 | 0 to 1 | 1 to 2 |
| Spawner spawnAtSec (step 5) | n/a | n/a | 20 to 40 | 10 to 30 |
| Spawner emitEverySec | n/a | n/a | 6.0 | 5.0 |
| Spawner dartsPerEmit | n/a | n/a | 5 | 5 |

## 5. Generation algorithm

`generateLevel(runSeed, n, cfg)`:

1. `seed = levelSeed(runSeed, n)`, `band = bandOf(n)`. Create one `Rng` per stage: `new Rng(streamSeed(seed, SALT.stage))`.
2. Arena (stream `arena`): section 6.
3. Roster (stream `roster`): eligible kinds = kinds with band weight above 0, minus snake if `!cfg.enableSnake`. Start with `[grunt]`. Size = `int(band min, band max)`, clamped to the eligible count. Fill by weighted sampling without replacement. Sort roster by the fixed kind order grunt, wanderer, weaver, pinwheel, dart, snake. Each entry carries its band weight.
4. speedScale from table 4.2, rounded to 2 decimals.
5. Loadout (stream `loadout`): drone by weighted pick restricted to `cfg.drones` (weights of excluded drones set to 0; if all are 0, `attack`). Super likewise restricted to `cfg.supers`, fallback `turbo`.
6. Objective kind and parameters (stream `objective`) from table 4.3. `target` is filled in step 9.
7. Waves (stream `waves`): section 7. `scheduleSec = max(band scheduleSec, objective time + 10)` for timed objectives.
8. Hazards (stream `hazards`): section 9. Spawners skipped if `!cfg.enableSpawner`.
9. Par, stars and scoreInTime target: section 8.
10. Assemble the LevelDef with `lives: 3`, `bombs: 3`, version fields. Round every coordinate and radius with `round1`, every time with `round1`, every angle to an integer.
11. Run `validateLevel`. In dev and tests, throw on failure with the error list. In production, log the errors and still return the def (a slightly off level beats a crash).

Draw order inside each stage is fixed and documented in code comments. Never reorder draws without a `GENERATOR_VERSION` bump.

## 6. Arena shape generation

1. `shape = weighted(shapes, band weights)`.
2. `H = intStep(Hmin, Hmax, 20)`.
3. Width by shape:
   - rect, roundRect, rectObstacles: `aspect = range(lo, hi)`, `W = min(1800, round to 20 of H x aspect)`.
   - circle: `W = H`.
   - hexagon (flat top): `W = round1(H x 1.1547005)`, H unchanged. Constants are literals, no `Math.sqrt`. Why not round W to 20: re-deriving H from a rounded W pushes H outside 700 to 1100 at the band extremes.
4. roundRect: `cornerRadius = round1(range(0.15, 0.30) x H)`. Others: 0.
5. `spawnPoint = { x: 0, y: 0 }`.
6. rectObstacles only: place obstacles (below). If none could be placed, set `shape = 'rect'`, `obstacles = []`.

### 6.1 Inside test

`insideArena(p, margin)` returns true if `p` is inside the shape shrunk by `margin`:
- rect, rectObstacles: `|x| <= W/2 minus margin` and `|y| <= H/2 minus margin`.
- roundRect: rect test, plus in each corner region the distance to the corner circle centre is at most `cornerRadius minus margin`.
- circle: `x^2 + y^2 <= (W/2 minus margin)^2`.
- hexagon (flat top, circumradius R = W/2): `|y| <= 0.8660254 x R minus margin` and `0.8660254 x |x| + 0.5 x |y| <= 0.8660254 x R minus margin`.

### 6.2 Obstacle placement rules

Constants: `THICK = 24`, `LEN = 160 to 0.30 x W` (round to 10), `EDGE_GAP = 80` (from arena boundary to obstacle), `SPAWN_CLEAR = 200` (from spawn point to the nearest obstacle point), `PAIR_GAP = 80` (between obstacles), `ATTEMPTS = 40` per obstacle.

For each obstacle up to the band count:
1. Orientation: `chance(0.5)` horizontal (w = LEN, h = THICK) else vertical (w = THICK, h = LEN).
2. Centre: `cx = range(-W/2, W/2)`, `cy = range(-H/2, H/2)`, rounded to 10.
3. Reject if any of the four corners fails `insideArena(corner, EDGE_GAP)`.
4. Reject if `rectDistance(obstacle, spawnPoint) < SPAWN_CLEAR`.
5. Reject if `rectDistance(obstacle, other) < PAIR_GAP` for any placed obstacle (rect to rect gap).
6. Tentatively add and run the connectivity check (6.3). Reject and remove on failure.
7. After `ATTEMPTS` rejections, stop placing further obstacles (keep the ones placed).

### 6.3 Connectivity check

Guarantees every open part of the arena is reachable from the spawn point by the ship.

1. Rasterise the bounding box into 20 u cells (at most 90 x 55 cells).
2. A cell is walkable if its centre passes `insideArena(centre, 12)` and its distance to every obstacle is at least 12 u (ship radius 10 plus 2).
3. Flood fill (4-neighbour BFS, iterative queue) from the cell containing the spawn point.
4. Pass if: the spawn cell is walkable, reachable count equals walkable count, and walkable count is at least 85 percent of cells whose centre passes `insideArena(centre, 12)` with no obstacle test.

The same function is exported as `isArenaConnected(arena)` for the validator.

## 7. Wave schedule generation

1. `t = 2.5`, `i = 0`.
2. While `t < scheduleSec`:
   1. `u = min(1, t / rampSec) ^ rampExponent`.
   2. `budget = round(budgetStart + (budgetEnd minus budgetStart) x u)`.
   3. `groups = int(gmin, gmax)`, then reduce until `groups <= budget`.
   4. Split budget across groups: each group gets `floor(budget / groups)`, the first group gets the remainder.
   5. For each group: pick a kind by `weighted(roster kinds, roster weights)` among kinds whose unit cost fits the group budget (grunt always fits). If the kind is snake and live snake cap for scheduled snakes in the last 30 s is reached, use grunt. Count = `floor(groupBudget / cost)`; dart count is groups of `int(5, 8)` darts per 4 units.
   6. Pattern per kind: grunt `pick(edges, corners, ring)`, wanderer `pick(corners, edges)`, pinwheel `edges`, weaver `pick(ring, edges)`, dart `cluster`, snake `corners`. The wave's `pattern` field records the first group's pattern.
   7. Emit SpawnEntries (7.1). Within a group, `tOffsetSec = k x 0.15` for the k-th entry; group g starts at `g x 0.5`.
   8. `interval = intervalStartSec + (intervalEndSec minus intervalStartSec) x u`. `t = round1(t + interval)`, `i += 1`.
3. Loop: `loopFromIndex = index of the first wave with atSec >= 0.5 x scheduleSec`. `loopPeriodSec = round1(lastWave.atSec + intervalEndSec minus waves[loopFromIndex].atSec)`. Why: loops repeat the hard half of the schedule, so destroy objectives and long timers never run out of enemies.

### 7.1 Spawn points by pattern

All fixed points must pass `insideArena(p, 40)`, be at least 30 u from every obstacle, and be at least 180 u from the spawn point. A candidate that fails is redrawn up to 20 times; after that the entry becomes a ring spawn at radius 300.

| Pattern | Points |
|---|---|
| edges | Pick a side or, for circle and hexagon, an angle `int(0, 359)`; point on the boundary inset 60 u. Entries in one group spread along that edge 40 u apart. |
| corners | Bounding box corners inset 80 u, for circle and hexagon the points at 45, 135, 225, 315 degrees at 0.85 x R. Entries cycle through the four corners from a random start. |
| ring | `mode: 'ring'`, `radius = intStep(260, 340, 10)`, angles evenly spaced from a random integer start: `start + k x round(360 / count)`. |
| cluster | One anchor from the edges rule; each dart at anchor plus offset `(range(-40, 40), range(-40, 40))`, rounded. |

`headingDeg = int(0, 359)` for wanderer and pinwheel, 0 otherwise.

## 8. Objective target, par and stars

Constants: `KILL_RATE = 0.7` (fraction of spawned enemies the par player kills), `GEOM_RATE = 0.6`, `PAR_SCALE = 0.5`, `MAX_EST_SEC = 600`.

1. Estimate window T:
   - survive: `durationSec`.
   - scoreInTime: `timeLimitSec`.
   - destroy: the smallest t such that `expandSpawns(waves, t).length x KILL_RATE >= count`, capped at `MAX_EST_SEC`.
2. `spawned = expandSpawns(waves, T)`.
3. `K = KILL_RATE x spawned.length` (destroy: `K = count`).
4. `baseSum = KILL_RATE x sum of ENEMY_BASE[kind]` over spawned (destroy: scaled by `count / spawned.length`).
5. `gAvg = sum of ENEMY_GEOMS / spawned.length`.
6. Multiplier model: the par player dies twice, so three life segments of `K / 3` kills each; the multiplier ends each segment at `1 + GEOM_RATE x gAvg x K / 3` and averages `mAvg = 1 + 0.1 x gAvg x K`.
7. `raw = baseSum x mAvg x PAR_SCALE`.
8. `par = max(1000, round(raw / 500) x 500)`.
9. `stars = [par, 2 x par, 4 x par]` (SPEC 3.6).
10. scoreInTime: `target = max(1000, round(0.8 x par / 500) x 500)`. Why: success should be slightly easier than one star, so completing and starring stay distinct.

Hazard score (wells, spawners) is excluded from par. Why: it is optional skill score and would make par sensitive to hazard count.

## 9. Hazard placement rules

### 9.1 Gravity wells

Constants: `WELL_SPAWN_MIN = max(0.25 x W, 360)`, `WELL_EDGE = 120` (inside margin), `WELL_OBSTACLE = 100` (min distance to any obstacle), `WELL_PAIR = 400`, `ATTEMPTS = 60` per well.

1. Count `int(min, max)` from table 4.5. Feasibility pre-check: if the arena's inscribed radius minus `WELL_EDGE` is below `WELL_SPAWN_MIN`, the count is 0 and no draws are made. Known consequence: circle and hexagon arenas in band 2 (inscribed radius 380 to 440 u) and most in band 3 get no wells. This is accepted; the draw for count is still made first so stream order is stable.
2. For each well: `x = range(-W/2, W/2)`, `y = range(-H/2, H/2)`, rounded.
3. Reject if `hypot(x, y) < WELL_SPAWN_MIN`. SPEC floor is 25 percent of arena width; the 360 u floor keeps the spawn point outside the 320 u pull radius on small arenas.
4. Reject if `!insideArena(p, WELL_EDGE)`.
5. Reject if distance to any obstacle `< WELL_OBSTACLE` (max well radius at mass 20 is 64 u).
6. Reject if distance to any placed well `< WELL_PAIR`.
7. After `ATTEMPTS` rejections, drop that well and stop placing wells. The level ships with fewer wells; the validator accepts any count from 0 to 3.

### 9.2 Spawners

Constants: `SPAWNER_SPAWN_MIN = 0.35 x W`, `SPAWNER_EDGE = 80`, `SPAWNER_WELL = 200`, `ATTEMPTS = 40`.

Same procedure: inside margin 80, at least 0.35 x W from spawn, at least 200 u from any well, at least 60 u from any obstacle. `spawnAtSec = intStep(lo, hi, 5)`; for a survive objective shorter than `spawnAtSec + 10`, `spawnAtSec = max(5, durationSec minus 20)`. Dropped on attempt exhaustion.

## 10. Endless mode reuse

- Arena fixed: `{ shape: 'rect', width: 1600, height: 1000, cornerRadius: 0, obstacles: [], spawnPoint: { x: 0, y: 0 } }`. Not generated.
- `endlessSeed = freshSeed()` per Endless game, shown on results.
- Segment s (0-based) covers seconds `30 x s` to `30 x s + 30`.
- `segSeed = fmix32(((endlessSeed ^ 0x454E444C) + s) >>> 0)`. The constant is ASCII "ENDL".
- `effectiveIndex = 1 + 2 x s`, so band 2 at segment 3, band 3 at segment 8, band 4 at segment 15. speedScale follows table 4.2 with `n = effectiveIndex`.
- `generateEndlessSegment` runs steps 3 (roster, with stream seed from `segSeed`) and 7 (waves) only, with `t` starting at 0 for s > 0 (2.5 for s = 0), stopping at 30, using `u = 1` (end of ramp) for bands 3 and 4 and the normal ramp on `t + 30 x s` for bands 1 and 2. No loop: `loopFromIndex = -1`, `loopPeriodSec = 0`. No hazards, no objective, no par.
- Ledger's Endless controller requests segment s + 1 when segment s starts, so generation never blocks a frame (one segment generates in well under 1 ms).
- `validateSegment` checks the subset of invariants that apply (W1 to W10 in section 11 plus segment bounds).

## 11. Validator (`src/levelgen/validate.ts`)

`validateLevel(def): ValidationResult` collects every failure; it does not stop at the first. Error strings start with the invariant id, for example `"A3: obstacle 1 within 200 of spawn"`.

| Id | Invariant |
|---|---|
| J1 | `JSON.parse(JSON.stringify(def))` deep equals `def` |
| J2 | Every number is finite (no NaN, no Infinity) |
| J3 | `version === LEVELDEF_VERSION`, `generatorVersion` is `GENERATOR_VERSION` (1) or `GENERATOR_VERSION_V2` (2); J6 says which |
| J4 | `seed === levelSeed(runSeed, levelIndex)` and `band === bandOf(levelIndex)` |
| J6 | With `enableV2Enemies` off, and for band 1 with it on, generator output is byte identical to v1. `generatorVersion` is 2 only for bands 2 and up with the flag on |
| A1 | Arena height 700 to 1100, width up to 1800, width / height 1.0 to 1.8 (circle exactly 1.0, hexagon 1.1547 within 0.01) |
| A2 | `spawnPoint` is (0, 0) and passes `insideArena(spawnPoint, 100)` |
| A3 | Every obstacle is at least 200 u from the spawn point |
| A4 | Every obstacle is fully inside the arena with margin 80; obstacle count is 0 unless shape is rectObstacles, then 1 to 3 |
| A5 | Obstacles pairwise at least 80 u apart |
| A6 | `isArenaConnected(arena)` is true |
| A7 | `cornerRadius` is 0 unless roundRect, then 0.15 to 0.30 x height |
| R1 | Roster has 3 to 6 entries, kinds distinct, contains grunt, every kind has band weight above 0 |
| R2 | `speedScale` 1.00 to 1.40 and equals the table value for the level index |
| O1 | Objective fields are in the band range of table 4.3 |
| O2 | scoreInTime `target` is at least 1000, a multiple of 500, and at most `par` |
| P1 | `par >= 1000`, `par % 500 === 0`, `stars` equals `[par, 2 x par, 4 x par]` |
| W1 | At least 1 wave, first wave `atSec` is 2.5 (segments: 0 or 2.5) |
| W2 | Wave `atSec` strictly increasing; wave `index` equals array position |
| W3 | Every entry kind is in the roster |
| W4 | Every fixed entry passes `insideArena(p, 40)`, is at least 30 u from every obstacle and at least 180 u from spawn |
| W5 | Every ring entry has radius 260 to 340 and integer angle 0 to 359 |
| W6 | `tOffsetSec` is 0 to 5 |
| W7 | `maxLiveEnemies` equals the band value |
| W8 | `loopFromIndex` is a valid index and `loopPeriodSec > 0` (levels); segments have -1 and 0 |
| W9 | For destroy objectives, `expandSpawns(waves, 600).length >= count / 0.7` |
| W10 | For timed objectives, at least one wave starts within the first 5 s and spawns exist in the last 20 percent of the objective time |
| H1 | 0 to 3 wells; each at least `max(0.25 x width, 360)` from spawn, inside margin 120, at least 100 u from every obstacle |
| H2 | Wells pairwise at least 400 u apart |
| H3 | 0 to 2 spawners; each inside margin 80, at least 0.35 x width from spawn, at least 200 u from every well |
| H4 | Band 1 has no hazards; band 2 has no spawners |
| L1 | `lives === 3`, `bombs === 3`, drone and superType are valid kinds |

J6 notes (v2, `GenConfig.enableV2Enemies`, default on; docs/11 SPEC 3.4 rule 3):

- The validator checks the content side only (`checkV2Content` in `src/levelgen/validate.ts`): a def with `generatorVersion` 1 names no v2 kind, and a def with `generatorVersion` 2 is never in band 1.
- The byte identity side is pinned by tests, not by `validateLevel`: `tests/qa/generatorFlagSweep.test.ts` holds a golden taken from the tag v1.0.0 source, and `tests/levelgen/v2enemies.test.ts` pins the flag on cases. Levels 1 to 5 keep their v1 hashes in both modes.
- An `EndlessDef` spans every band, so J6 has no band to test for it. `generateEndless` with the flag on returns version 2. Each segment from `generateEndlessSegment` follows the per band rule: version 2 from band 2 up, version 1 in band 1.

## 12. Vitest test list

`tests/rng.test.ts`, `tests/generator.test.ts`, `tests/validate.test.ts`. Generator tests sweep `runSeed` in `[0, 1, 0xDEADBEEF, 0x4E464F4C]` and levels 1 to 60 unless stated.

| # | Test name | Asserts |
|---|---|---|
| 1 | `mulberry32 matches known vectors` | The three seeds in section 2 produce the listed outputs to 10 decimals |
| 2 | `mulberry32 output is in [0, 1)` | 100,000 draws from seed 1: min >= 0, max < 1 |
| 3 | `levelSeed is stable and distinct across levels` | `levelSeed(0x4E464F4C, 1) === 0x229578A8`; levels 1 to 10,000 produce no duplicate seeds |
| 4 | `same seed produces identical LevelDef` | Two calls deep equal and JSON strings equal |
| 5 | `different levels produce different LevelDefs` | Levels 1 to 60 for one run seed: all JSON strings distinct |
| 6 | `LevelDef survives JSON round trip` | J1 for every swept def |
| 7 | `every generated level passes validation` | `validateLevel(def).ok` for runSeeds x levels 1 to 200 (800 defs) |
| 8 | `band boundaries map correctly` | `bandOf` at 1, 5, 6, 15, 16, 30, 31, 1000 |
| 9 | `spawn point clear of obstacles` | For 2000 rectObstacles levels, every obstacle at least 200 u from (0, 0) |
| 10 | `arena is connected with obstacles` | `isArenaConnected` true for every swept def; a hand-built wall splitting the arena returns false |
| 11 | `gravity wells respect spawn distance` | Every well at least `max(0.25 x width, 360)` from spawn across 2000 levels in bands 2 to 4 |
| 12 | `roster size and composition per band` | Size within band range, contains grunt, no snake below band 3, no weaver or dart in band 1 |
| 13 | `objective ranges per band` | Each objective field within table 4.3 |
| 14 | `par and stars formula` | `par % 500 === 0`, `par >= 1000`, stars are 1x, 2x, 4x; scoreInTime target at most par |
| 15 | `arena fits fold aspect bounds` | A1 for every swept def |
| 16 | `wave schedule is monotonic and loops` | W2 and W8; `expandSpawns(waves, 600)` returns a sorted list with spawns beyond the last wave |
| 17 | `generator never touches Math.random` | `vi.spyOn(Math, 'random')` is not called during 100 generations |
| 18 | `stage streams are independent` | Changing the obstacle attempt result (stub arena stage) leaves roster, loadout and objective identical for the same seed |
| 19 | `GenConfig cuts are respected` | `enableSnake: false` yields no snake; `drones: ['attack']` yields attack only; `enableSpawner: false` yields no spawners |
| 20 | `endless segments are deterministic and escalate` | Same (endlessSeed, s) deep equal; band at s = 0, 3, 8, 15 is 1, 2, 3, 4; all segment atSec < 30 |
| 21 | `validator reports each broken invariant` | Mutating a valid def per invariant (A3, A6, H1, P1, W3, R1 at least) yields an error with that id |
| 22 | `golden snapshots for worked examples` | `toMatchSnapshot()` on the three section 13 defs |
| 23 | `generation is fast` | 200 levels generate in under 500 ms in Node |

## 13. Worked example seeds

Run seed for all three: `0x4E464F4C` (ASCII "NFOL"). Seeds and stream seeds below are computed exactly with the code in section 2. Field values are shown as the band ranges the output must fall in; exact values are captured by test 22 on Foundry's first green run and pasted into this section in the same PR.

### 13.1 Level 1 (band 1)

Seeds: level `0x229578A8`; arena `0x00C28B30`, roster `0xA2491E4D`, loadout `0xA3BA2737`, objective `0xBC50104C`, waves `0x37884992`, hazards `0xF63B3D5B`.

```ts
{
  version: 1, generatorVersion: 1,
  runSeed: 0x4E464F4C, levelIndex: 1, seed: 0x229578A8, band: 1,
  arena: { shape: 'rect' | 'roundRect' | 'circle' | 'hexagon', width: 700..1140, height: 700..760,
           cornerRadius: 0 | 105..228, obstacles: [], spawnPoint: { x: 0, y: 0 } },
  roster: [ { kind: 'grunt', weight: 40 }, { kind: 'wanderer', weight: 35 }, { kind: 'pinwheel', weight: 25 } ],
  speedScale: 1.00,
  drone: 'attack', superType: 'homing' | 'turbo',
  lives: 3, bombs: 3,
  objective: { kind: 'survive', durationSec: 45..60 } | { kind: 'destroy', count: 30..50 }
           | { kind: 'scoreInTime', target: number, timeLimitSec: 60 },
  waves: { maxLiveEnemies: 60, intervalStartSec: 6.0, intervalEndSec: 4.0, rampSec: 60, rampExponent: 1.0,
           budgetStart: 3, budgetEnd: 8, waves: WaveDef[] /* about 24 */, loopFromIndex: number, loopPeriodSec: number },
  hazards: { wells: [], spawners: [] },
  par: number, stars: [par, 2 * par, 4 * par]
}
```

### 13.2 Level 12 (band 2)

Seeds: level `0x41596AAE`; arena `0xD895F094`, roster `0x0821C13D`, loadout `0x101EC4F6`, objective `0xE5CEFAF7`, waves `0xD1214F08`, hazards `0x946554A9`.

```ts
{
  version: 1, generatorVersion: 1,
  runSeed: 0x4E464F4C, levelIndex: 12, seed: 0x41596AAE, band: 2,
  arena: { shape: ArenaShape, width: 760..1420, height: 760..880, cornerRadius: number,
           obstacles: [] | [Obstacle] /* exactly 1 if rectObstacles */, spawnPoint: { x: 0, y: 0 } },
  roster: RosterEntry[] /* 3 to 4, grunt first, from wanderer, weaver, pinwheel, dart */,
  speedScale: 1.05,
  drone: 'attack' | 'collect' | 'ram', superType: SuperKind,
  lives: 3, bombs: 3,
  objective: { kind: 'survive', durationSec: 60..90 } | { kind: 'destroy', count: 60..100 }
           | { kind: 'scoreInTime', target: number, timeLimitSec: 75 | 90 },
  waves: { maxLiveEnemies: 90, intervalStartSec: 5.0, intervalEndSec: 3.0, rampSec: 90, rampExponent: 1.2,
           budgetStart: 5, budgetEnd: 12, waves: WaveDef[] /* about 40 */, loopFromIndex: number, loopPeriodSec: number },
  hazards: { wells: [] | [GravityWellDef], spawners: [] },
  par: number, stars: [par, 2 * par, 4 * par]
}
```

### 13.3 Level 37 (band 4)

Seeds: level `0x417A29D8`; arena `0xC7E59465`, roster `0x3CC773D5`, loadout `0x7987A69C`, objective `0x8CD6A189`, waves `0x0B14B688`, hazards `0x44B57389`.

```ts
{
  version: 1, generatorVersion: 1,
  runSeed: 0x4E464F4C, levelIndex: 37, seed: 0x417A29D8, band: 4,
  arena: { shape: ArenaShape /* rectObstacles most likely at weight 45 */, width: 940..1800, height: 940..1100,
           cornerRadius: number, obstacles: Obstacle[] /* 1 to 3 if rectObstacles */, spawnPoint: { x: 0, y: 0 } },
  roster: RosterEntry[] /* 5 to 6 */,
  speedScale: 1.23,   // 1.20 + 0.005 x (37 minus 31) = 1.23
  drone: DroneKind, superType: SuperKind,
  lives: 3, bombs: 3,
  objective: { kind: 'survive', durationSec: 90..120 } | { kind: 'destroy', count: 150..220 }
           | { kind: 'scoreInTime', target: number, timeLimitSec: 105 | 120 },
  waves: { maxLiveEnemies: 160, intervalStartSec: 4.0, intervalEndSec: 2.0, rampSec: 120, rampExponent: 1.6,
           budgetStart: 8, budgetEnd: 20, waves: WaveDef[] /* about 65 */, loopFromIndex: number, loopPeriodSec: number },
  hazards: { wells: GravityWellDef[] /* 1 to 3 */, spawners: SpawnerDef[] /* 1 to 2 */ },
  par: number, stars: [par, 2 * par, 4 * par]
}
```

Endless reference for test 20: `endlessSeed = 0x4E464F4C` gives segment seeds `0x84A226D0` (s = 0), `0x9DBB7814` (s = 1), `0xBF9EA0EB` (s = 2).
