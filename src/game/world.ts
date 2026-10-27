// Contract stub (docs/03-architecture.md sections 1 and 3). Forge replaces every body in W1.
import type { Rng } from '../core/rng';
import type { InputState } from '../input/types';
import type { LevelDef } from '../levelgen/leveldef';

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
}

export function createWorld(level: LevelDef, capacity?: number): World {
  throw new Error('stub');
}

/** Returns the new id, or -1 if the world is full. */
export function spawn(w: World, kind: Kind, x: number, y: number): number {
  throw new Error('stub');
}

export function kill(w: World, id: number): void {
  throw new Error('stub');
}

export function stepWorld(w: World, dt: number, input: InputState): void {
  throw new Error('stub');
}
