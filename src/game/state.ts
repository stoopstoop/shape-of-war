// Swarm's per world gameplay state. World (Forge) stays untouched: extra per entity arrays and
// session counters live here, keyed by the World object. Allocated once per world.
import type { PaletteKey } from '../render/neon';
import type { EndlessDef, EndlessSegmentDef, SpawnEntry, SuperKind } from '../levelgen/leveldef';
import type { EnemyDef } from './enemies/types';
import { baseValue } from './scoring';
import { arenaSpeedFactor } from './tuning';
import { Kind, spawn, type World } from './world';

export const SNAKE_SLOTS = 8;
export const SNAKE_SEGMENTS = 12;
/** Path history samples per snake (one per sim step). 256 steps at 120 Hz covers 216 u at any speed above 101 u/s. */
export const SNAKE_PATH = 256;
export const MAX_WELLS = 3;
export const QUEUE_CAP = 512;

export type Outcome = 'running' | 'won' | 'lost';
export type GameMode = 'adventure' | 'endless';

/** Scoring hooks. Ledger's scoring.ts plugs in here (see setScoring in game.ts). */
export interface ScoringPort {
  /** Points for a scored kill at the current multiplier. Swarm adds the result to state.score. */
  awardKill(w: World, kind: Kind): number;
  /** One geom collected. Default raises state.multiplier by 1, capped at 999. */
  collectGeom(w: World): void;
  /** Ship died. Default resets state.multiplier to 1. */
  resetMultiplier(w: World): void;
  /**
   * Optional: the port's current multiplier. When present it is the value hud:score carries and
   * the value mirrored into state.multiplier. When absent Swarm keeps state.multiplier itself
   * (+1 per geom capped at 999, 1 on death), so the HUD never shows a stale x1.
   */
  multiplier?(w: World): number;
}

export interface SpawnLogEntry {
  t: number;
  kind: Kind;
  x: number;
  y: number;
}

/** Reused event payloads: handlers must copy fields, not keep the object. */
export interface KillFx {
  x: number;
  y: number;
  colour: PaletteKey;
}

export interface PointFx {
  x: number;
  y: number;
}

/** Supplies Endless segment s. Injected at the edge (wiring passes generateEndlessSegment). */
export type SegmentSource = (segment: number) => EndlessSegmentDef;

/** Endless run state (docs/01 section 2.2, docs/02 section 10). */
export interface EndlessRun {
  def: EndlessDef;
  source: SegmentSource;
  /** Segment currently feeding the spawner, 0 based. */
  segment: number;
  /** Prefetched segment + 1, requested when the current segment starts. */
  next: EndlessSegmentDef | null;
  nextLifeAt: number;
  nextBombAt: number;
}

export interface GameState {
  // Per entity extras, length w.cap.
  /** Telegraph seconds left. Above 0 the entity is harmless and untargetable. */
  tele: Float32Array;
  /** Second scratch: snake segment index, well mass, dart owner spawner id. */
  aux: Int32Array;
  /** Gravity well pull velocity, integrated and damped. */
  pvx: Float32Array;
  pvy: Float32Array;

  // Session.
  mode: GameMode;
  score: number;
  multiplier: number;
  lives: number;
  bombs: number;
  kills: number;
  superCharge: number;
  bombCooldown: number;
  /** Seconds until respawn; 0 while the ship is in play. */
  deathTimer: number;
  /** Wave clock: paused during the respawn delay. Objective timers read it too. */
  waveClock: number;
  outcome: Outcome;
  overEmitted: boolean;
  shipPullX: number;
  shipPullY: number;
  /** Debug and stress scenes: the ship cannot die (contacts, wells). Never set in normal play. */
  invulnerable: boolean;

  // Wells.
  wellIds: Int32Array;
  wellCount: number;

  // Snakes.
  snakeHead: Int32Array; // head id per slot, -1 free
  snakeSegs: Int32Array; // SNAKE_SLOTS x SNAKE_SEGMENTS ids
  pathX: Float32Array; // SNAKE_SLOTS x SNAKE_PATH
  pathY: Float32Array;
  pathTop: Int32Array; // newest sample index per slot

  // Wave spawner.
  nextWave: number; // index into level.waves.waves
  loopK: number; // loop repeat count, 0 is the first pass
  queueEntry: (SpawnEntry | null)[];
  queueDue: Float64Array;
  queueHead: number;
  queueLen: number;
  spawnerStarted: Uint8Array; // per hazard spawner
  spawnLog: SpawnLogEntry[] | null;

  /** Spawn entries dropped (queue full, or a snake with no free slot). Debug counter. */
  dropped: number;
  /** Seconds added to every wave atSec (Endless: 30 x segment). */
  waveShift: number;
  endless: EndlessRun | null;

  // Speed. Enemies read enemySpeedScale and turnScale, never level.speedScale directly.
  /** LevelDef.speedScale, or the current Endless segment's. */
  speedScale: number;
  /** arenaSpeedFactor of the level arena (tuning.ts). */
  arenaFactor: number;

  // Supers.
  /** Timed super running (homing or turbo), null otherwise. */
  superActive: SuperKind | null;
  /** Seconds left on the timed super. */
  superTimer: number;
  /** Seconds until the drone returns after Detonate. */
  droneAbsent: number;
  /** Homing scratch: targetable enemy ids rebuilt each step. */
  targets: Int32Array;
  targetCount: number;

  // Drone.
  droneId: number;
  droneCooldown: number;
  droneAngle: number;
  /** Ram: target id while charging, -1 otherwise. */
  droneTarget: number;
  /** Ram: 0 orbit, 1 charge, 2 return. */
  dronePhase: number;

  // Edges.
  scoring: ScoringPort;
  vibrate: (ms: number) => void;
  killFx: KillFx;
  pointFx: PointFx;
  hudTimer: number;
  hud: HudPayload;
}

export interface HudPayload {
  score: number;
  multiplier: number;
  lives: number;
  bombs: number;
  superCharge: number;
}

export const MULTIPLIER_CAP = 999;

/** Base value per kind: the one table in scoring.ts (SPEC 3.6 plus the v2 addendum). */
export function scoreBase(kind: Kind): number {
  return baseValue(kind);
}

export const defaultScoring: ScoringPort = {
  awardKill(w, kind) {
    return scoreBase(kind) * gs(w).multiplier;
  },
  collectGeom(w) {
    const g = gs(w);
    if (g.multiplier < MULTIPLIER_CAP) g.multiplier++;
  },
  resetMultiplier(w) {
    gs(w).multiplier = 1;
  },
};

/** Geom pickup through the port. A foreign port without a getter gets Swarm's own mirror. */
export function portCollectGeom(w: World): void {
  const g = gs(w);
  g.scoring.collectGeom(w);
  if (g.scoring !== defaultScoring && g.multiplier < MULTIPLIER_CAP) g.multiplier++;
  syncMultiplier(w);
}

/** Ship death through the port. */
export function portResetMultiplier(w: World): void {
  const g = gs(w);
  g.scoring.resetMultiplier(w);
  if (g.scoring !== defaultScoring) g.multiplier = 1;
  syncMultiplier(w);
}

/** The multiplier the player sees: the port's getter when it has one, else state.multiplier. */
export function currentMultiplier(w: World): number {
  const g = gs(w);
  const port = g.scoring;
  if (port.multiplier === undefined) return g.multiplier;
  const m = port.multiplier(w);
  return Number.isFinite(m) ? m : g.multiplier;
}

/** Copy the port's multiplier into state.multiplier so gameState(w) agrees with the HUD. */
export function syncMultiplier(w: World): void {
  const g = gs(w);
  g.multiplier = currentMultiplier(w);
}

export function defaultVibrate(ms: number): void {
  const nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator;
  if (nav !== undefined && typeof nav.vibrate === 'function') nav.vibrate(ms);
}

const states = new WeakMap<World, GameState>();

function createState(w: World): GameState {
  const cap = w.cap;
  return {
    tele: new Float32Array(cap),
    aux: new Int32Array(cap),
    pvx: new Float32Array(cap),
    pvy: new Float32Array(cap),
    mode: 'adventure',
    score: 0,
    multiplier: 1,
    lives: w.level.lives,
    bombs: w.level.bombs,
    kills: 0,
    superCharge: 0,
    bombCooldown: 0,
    deathTimer: 0,
    waveClock: 0,
    outcome: 'running',
    overEmitted: false,
    shipPullX: 0,
    shipPullY: 0,
    invulnerable: false,
    wellIds: new Int32Array(MAX_WELLS).fill(-1),
    wellCount: 0,
    snakeHead: new Int32Array(SNAKE_SLOTS).fill(-1),
    snakeSegs: new Int32Array(SNAKE_SLOTS * SNAKE_SEGMENTS).fill(-1),
    pathX: new Float32Array(SNAKE_SLOTS * SNAKE_PATH),
    pathY: new Float32Array(SNAKE_SLOTS * SNAKE_PATH),
    pathTop: new Int32Array(SNAKE_SLOTS),
    nextWave: 0,
    loopK: 0,
    queueEntry: new Array<SpawnEntry | null>(QUEUE_CAP).fill(null),
    queueDue: new Float64Array(QUEUE_CAP),
    queueHead: 0,
    queueLen: 0,
    spawnerStarted: new Uint8Array(4),
    spawnLog: null,
    dropped: 0,
    waveShift: 0,
    endless: null,
    speedScale: w.level.speedScale,
    arenaFactor: arenaSpeedFactor(w.level.arena),
    superActive: null,
    superTimer: 0,
    droneAbsent: 0,
    targets: new Int32Array(cap),
    targetCount: 0,
    droneId: -1,
    droneCooldown: 0,
    droneAngle: 0,
    droneTarget: -1,
    dronePhase: 0,
    scoring: defaultScoring,
    vibrate: defaultVibrate,
    killFx: { x: 0, y: 0, colour: 'white' },
    pointFx: { x: 0, y: 0 },
    hudTimer: 0,
    hud: { score: 0, multiplier: 1, lives: 0, bombs: 0, superCharge: 0 },
  };
}

/** Gameplay state for a world, created on first use. */
export function gs(w: World): GameState {
  let s = states.get(w);
  if (s === undefined) {
    s = createState(w);
    states.set(w, s);
  }
  return s;
}

/**
 * Hostile kinds: everything that kills the ship on contact and that bullets can hit. The V2 range
 * Charger to Splime includes the Mine. Slime is a hazard but not hostile: nothing collides with it.
 */
export function isHostile(k: number): boolean {
  return (k >= Kind.Grunt && k <= Kind.Spawner) || (k >= Kind.Charger && k <= Kind.Splime);
}

/** The six V2 enemies (docs/11 SPEC 3.4), excluding the Mine and Slime hazards. */
export function isV2Enemy(k: number): boolean {
  return (k >= Kind.Charger && k <= Kind.Sower) || k === Kind.Splime;
}

/** Dropped hazards: never in a roster, no score, no geoms, not a kill. */
export function isDroppedHazard(k: number): boolean {
  return k === Kind.Mine || k === Kind.Slime;
}

/**
 * Spawn an entity from its def with a telegraph of tele seconds. Resets every Swarm extra.
 * Returns the id or -1 when the world is full.
 */
export function spawnFromDef(w: World, def: EnemyDef, x: number, y: number, tele: number): number {
  const id = spawn(w, def.kind, x, y);
  if (id < 0) return -1;
  const g = gs(w);
  w.radius[id] = def.radius;
  w.hp[id] = def.hp;
  g.tele[id] = tele;
  g.aux[id] = 0;
  g.pvx[id] = 0;
  g.pvy[id] = 0;
  return id;
}

/** Multiplier for enemy linear speeds: speedScale x arena factor. */
export function enemySpeedScale(w: World): number {
  const g = gs(w);
  return g.speedScale * g.arenaFactor;
}

/** Multiplier for enemy turn rates (Dart): speedScale only, per docs/01 section 6.6. */
export function turnScale(w: World): number {
  return gs(w).speedScale;
}

/** Kinds counted against maxLiveEnemies (wave enemies, telegraphs included). */
export function isWaveEnemy(k: number): boolean {
  return (k >= Kind.Grunt && k <= Kind.SnakeHead) || isV2Enemy(k);
}
