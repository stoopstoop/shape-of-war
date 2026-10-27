// Swarm's per world gameplay state. World (Forge) stays untouched: extra per entity arrays and
// session counters live here, keyed by the World object. Allocated once per world.
import type { PaletteKey } from '../render/neon';
import type { SpawnEntry } from '../levelgen/leveldef';
import type { EnemyDef } from './enemies/types';
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

export function scoreBase(kind: Kind): number {
  switch (kind) {
    case Kind.Grunt:
      return 50;
    case Kind.Wanderer:
      return 10;
    case Kind.Weaver:
      return 100;
    case Kind.Pinwheel:
      return 25;
    case Kind.Dart:
      return 30;
    case Kind.SnakeHead:
      return 200;
    case Kind.Spawner:
      return 150;
    case Kind.GravityWell:
      return 250;
    default:
      return 0;
  }
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

/** Hostile kinds: everything that kills the ship on contact. */
export function isHostile(k: number): boolean {
  return k >= Kind.Grunt && k <= Kind.Spawner;
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

/** Kinds counted against maxLiveEnemies (wave enemies, telegraphs included). */
export function isWaveEnemy(k: number): boolean {
  return k >= Kind.Grunt && k <= Kind.SnakeHead;
}
