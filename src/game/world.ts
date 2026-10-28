// Entity store (docs/03 section 3). Struct of arrays, fixed capacity, ship is id 0, free list
// stack. stepWorld allocates nothing.
import { mulberry32, type Rng } from '../core/rng';
import type { InputState } from '../input/types';
import type { LevelDef } from '../levelgen/leveldef';
import { confine, createConfineResult } from './arena';
import { createBulletPool, stepBullets, type BulletPool } from './bullets';
import { createGrid, rebuild, type Grid } from './collide';
import { createShipState, respawnShip, SHIP_RADIUS, stepShip, type ShipState } from './ship';

export const enum Kind {
  None = 0,
  Ship,
  Grunt,
  Wanderer,
  Weaver,
  Pinwheel,
  Dart,
  SnakeHead,
  SnakeBody,
  GravityWell,
  Spawner,
  Geom,
  Drone,
  // V2 contract stubs (docs/10-v2-plan.md). Appended so every value above keeps its number.
  WeaponPickup,
  Charger,
  Bulwark,
  Blink,
  Swirl,
  Sower,
  Mine,
}

export const ENTITY_CAP = 512;

export interface World {
  cap: number;
  alive: Uint8Array; // 0 or 1
  kind: Uint8Array; // Kind
  x: Float32Array;
  y: Float32Array;
  prevX: Float32Array;
  prevY: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  rot: Float32Array;
  radius: Float32Array;
  hp: Int16Array;
  t: Float32Array; // per entity timer, behaviour specific
  a: Int32Array; // behaviour scratch (snake parent id, spawner cooldown index)
  free: Int32Array;
  freeTop: number; // free list stack
  liveCount: number;
  level: LevelDef;
  simRng: Rng;
  // bullets live in their own pool, section 5
  // Additive fields (Forge W1).
  bullets: BulletPool;
  ship: ShipState;
  /** Spatial hash, rebuilt at the end of every stepWorld. */
  grid: Grid;
  /** Sim seconds since createWorld. */
  time: number;
  /** Sim steps since createWorld. */
  tick: number;
}

/** Per kind behaviour. Swarm registers one per enemy kind in W2. */
export type EntityStep = (w: World, id: number, dt: number) => void;

const behaviours: (EntityStep | null)[] = [];

/** Register (or clear with null) the step function for a kind. Kinds without one drift and bounce. */
export function registerBehaviour(kind: Kind, fn: EntityStep | null): void {
  behaviours[kind] = fn;
}

export function createWorld(level: LevelDef, capacity: number = ENTITY_CAP): World {
  const cap = Math.max(1, Math.floor(capacity));
  const free = new Int32Array(cap);
  // Id 0 is reserved for the ship. Stack top is the lowest free id.
  let top = 0;
  for (let id = cap - 1; id >= 1; id--) free[top++] = id;
  const w: World = {
    cap,
    alive: new Uint8Array(cap),
    kind: new Uint8Array(cap),
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    prevX: new Float32Array(cap),
    prevY: new Float32Array(cap),
    vx: new Float32Array(cap),
    vy: new Float32Array(cap),
    rot: new Float32Array(cap),
    radius: new Float32Array(cap),
    hp: new Int16Array(cap),
    t: new Float32Array(cap),
    a: new Int32Array(cap).fill(-1),
    free,
    freeTop: top,
    liveCount: 1,
    level,
    simRng: mulberry32(level.seed),
    bullets: createBulletPool(),
    ship: createShipState(),
    grid: createGrid(level.arena.width, level.arena.height, cap),
    time: 0,
    tick: 0,
  };
  w.kind[0] = Kind.Ship;
  w.radius[0] = SHIP_RADIUS;
  w.hp[0] = 1;
  respawnShip(w);
  rebuild(w.grid, w);
  return w;
}

/** Returns the new id, or -1 if the world is full. */
export function spawn(w: World, kind: Kind, x: number, y: number): number {
  if (w.freeTop === 0) return -1;
  w.freeTop--;
  const id = w.free[w.freeTop] ?? 0;
  w.alive[id] = 1;
  w.kind[id] = kind;
  w.x[id] = x;
  w.prevX[id] = x;
  w.y[id] = y;
  w.prevY[id] = y;
  w.vx[id] = 0;
  w.vy[id] = 0;
  w.rot[id] = 0;
  w.t[id] = 0;
  w.hp[id] = 1;
  w.radius[id] = 0;
  w.a[id] = -1;
  w.liveCount++;
  return id;
}

/** Free a slot. Id 0 (the ship) is never freed; use deactivateShip in ship.ts instead. */
export function kill(w: World, id: number): void {
  if (id <= 0 || id >= w.cap || w.alive[id] !== 1) return;
  w.alive[id] = 0;
  w.kind[id] = Kind.None;
  w.free[w.freeTop] = id;
  w.freeTop++;
  w.liveCount--;
}

const bounce = createConfineResult();

/** Default behaviour for kinds with no registered step: integrate velocity, reflect off walls. */
export function driftEntity(w: World, id: number, dt: number): void {
  let vx = w.vx[id] ?? 0;
  let vy = w.vy[id] ?? 0;
  const res = confine(w.level.arena, (w.x[id] ?? 0) + vx * dt, (w.y[id] ?? 0) + vy * dt, w.radius[id] ?? 0, bounce);
  if (res.hit) {
    const into = vx * res.nx + vy * res.ny;
    if (into < 0) {
      vx -= 2 * into * res.nx;
      vy -= 2 * into * res.ny;
    }
    w.vx[id] = vx;
    w.vy[id] = vy;
  }
  w.x[id] = res.x;
  w.y[id] = res.y;
}

export function stepWorld(w: World, dt: number, input: InputState): void {
  w.prevX.set(w.x);
  w.prevY.set(w.y);
  stepShip(w, dt, input);
  for (let id = 1; id < w.cap; id++) {
    if (w.alive[id] !== 1) continue;
    const fn = behaviours[w.kind[id] ?? 0];
    if (fn) fn(w, id, dt);
    else driftEntity(w, id, dt);
  }
  stepBullets(w, dt);
  rebuild(w.grid, w);
  w.time += dt;
  w.tick++;
}

/** Live count excluding the ship. */
export function liveEnemies(w: World): number {
  return w.liveCount - 1;
}

/** Kill every entity except the ship. */
export function clearEntities(w: World): void {
  for (let id = 1; id < w.cap; id++) if (w.alive[id] === 1) kill(w, id);
}

/**
 * Inline rect LevelDef used until Foundry's fixtures merge (docs/02 section 3 shape).
 * 1400 x 900 u, grunt only, no hazards.
 */
export function inlineRectLevel(seed = 1): LevelDef {
  return {
    version: 1,
    generatorVersion: 1,
    runSeed: 0,
    levelIndex: 1,
    seed: seed >>> 0,
    surface: 'flat',
    retries: 0,
    band: 1,
    arena: { shape: 'rect', width: 1400, height: 900, cornerRadius: 0, obstacles: [], spawnPoint: { x: 0, y: 0 } },
    roster: [{ kind: 'grunt', weight: 1 }],
    speedScale: 1,
    drone: 'attack',
    superType: 'turbo',
    lives: 3,
    bombs: 3,
    objective: { kind: 'survive', durationSec: 60 },
    waves: {
      maxLiveEnemies: 60,
      intervalStartSec: 4,
      intervalEndSec: 2,
      rampSec: 60,
      rampExponent: 1,
      budgetStart: 4,
      budgetEnd: 12,
      waves: [],
      loopFromIndex: 0,
      loopPeriodSec: 30,
    },
    hazards: { wells: [], spawners: [] },
    par: 1000,
    stars: [1000, 2000, 4000],
  };
}
