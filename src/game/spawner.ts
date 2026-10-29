// Wave spawner (docs/01 section 6.5, docs/02 section 3). Consumes level.waves and level.roster
// only. The wave clock pauses while the ship is dead. Due entries go through a FIFO queue that
// waits while maxLiveEnemies is reached. No randomness is used; any future need draws from
// w.simRng only.
// Audio: bus 'sfx' 'spawn' (SFX_TO_CUE maps it to the telegraph cue) is emitted once per wave, on
// the step its first telegraph appears, and once when a hazard spawner's telegraph appears. Never
// per enemy. The emits change no sim state.
import { bus } from '../core/events';
import type { EnemyKind, SpawnEntry } from '../levelgen/leveldef';
import { isInside } from './arena';
import { keepScheduledEntry, waveClockHeld } from './bosses/core';
import { advanceSegments } from './endless';
import { defOf, kindOf } from './defs';
import { init as initPinwheel } from './enemies/pinwheel';
import { spawnSnake } from './enemies/snake';
import { def as spawnerDef } from './enemies/spawner';
import { init as initWanderer } from './enemies/wanderer';
import { gs, isWaveEnemy, QUEUE_CAP, spawnFromDef } from './state';
import { DEG } from './steer';
import { Kind, type World } from './world';

export const TELEGRAPH_SEC = 0.6;
export const SAFE_RADIUS = 180;
export const RECHECK_SEC = 0.5;
const MAX_WAVES_PER_STEP = 64;

function inRoster(w: World, k: EnemyKind): boolean {
  const r = w.level.roster;
  for (let i = 0; i < r.length; i++) if (r[i]?.kind === k) return true;
  return false;
}

function hasSnakeSlot(w: World): boolean {
  const heads = gs(w).snakeHead;
  for (let s = 0; s < heads.length; s++) if (heads[s] === -1) return true;
  return false;
}

function pushEntry(w: World, e: SpawnEntry, due: number, seq: number): void {
  const g = gs(w);
  if (g.queueLen >= QUEUE_CAP) {
    // Only reached in Endless while the live cap holds spawns back for a long time.
    g.dropped++;
    return;
  }
  const i = (g.queueHead + g.queueLen) % QUEUE_CAP;
  g.queueEntry[i] = e;
  g.queueDue[i] = due;
  g.queueWave[i] = seq;
  g.queueLen++;
}

function popEntry(w: World): void {
  const g = gs(w);
  g.queueEntry[g.queueHead] = null;
  g.queueHead = (g.queueHead + 1) % QUEUE_CAP;
  g.queueLen--;
}

/** Queue every wave whose start time has come, following the loop rule after the last wave. */
export function enqueueDueWaves(w: World, clock: number): void {
  const g = gs(w);
  const s = w.level.waves;
  for (let guard = 0; guard < MAX_WAVES_PER_STEP; guard++) {
    const wave = s.waves[g.nextWave];
    if (wave === undefined) return;
    const shift = g.waveShift + g.loopK * s.loopPeriodSec;
    const at = wave.atSec + shift;
    if (clock < at) return;
    const seq = ++g.waveSeq;
    for (let i = 0; i < wave.entries.length; i++) {
      const e = wave.entries[i];
      // keepScheduledEntry thins the schedule to 0.6 while an Adventure boss lives (always true otherwise).
      if (e !== undefined && inRoster(w, e.kind) && keepScheduledEntry(w)) pushEntry(w, e, at + e.tOffsetSec, seq);
    }
    g.nextWave++;
    if (g.nextWave >= s.waves.length) {
      if (s.loopFromIndex >= 0 && s.loopFromIndex < s.waves.length && s.loopPeriodSec > 0) {
        g.nextWave = s.loopFromIndex;
        g.loopK++;
      }
    }
  }
}

/** Place hazard spawners at their spawnAtSec (wave clock). */
export function activateSpawners(w: World, clock: number): void {
  const g = gs(w);
  const list = w.level.hazards.spawners;
  for (let i = 0; i < list.length && i < g.spawnerStarted.length; i++) {
    const h = list[i];
    if (h === undefined || g.spawnerStarted[i] === 1 || clock < h.spawnAtSec) continue;
    g.spawnerStarted[i] = 1;
    const id = spawnFromDef(w, spawnerDef, h.x, h.y, TELEGRAPH_SEC);
    if (id < 0) continue;
    w.a[id] = i;
    bus.emit('sfx', 'spawn');
  }
}

/** Live wave enemies, telegraphs included (the maxLiveEnemies count). */
export function countWaveEnemies(w: World): number {
  let n = 0;
  for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && isWaveEnemy(w.kind[i] ?? 0)) n++;
  return n;
}

const pos = { x: 0, y: 0 };

/**
 * Resolve where an entry spawns. Returns false if a fixed point and its mirror are both within
 * SAFE_RADIUS of the ship (caller delays 0.5 s).
 */
export function resolvePosition(w: World, e: SpawnEntry, radius: number, out: { x: number; y: number }): boolean {
  const sx = w.x[0] ?? 0;
  const sy = w.y[0] ?? 0;
  const r2 = SAFE_RADIUS * SAFE_RADIUS;
  if (e.mode === 'fixed') {
    let x = e.x;
    let y = e.y;
    if ((x - sx) * (x - sx) + (y - sy) * (y - sy) < r2) {
      x = -x;
      y = -y;
      if ((x - sx) * (x - sx) + (y - sy) * (y - sy) < r2) return false;
    }
    out.x = x;
    out.y = y;
    return true;
  }
  let x = sx + Math.cos(e.angleDeg * DEG) * e.radius;
  let y = sy + Math.sin(e.angleDeg * DEG) * e.radius;
  // Pull toward the arena centre along the ray until valid.
  for (let i = 0; i < 32 && !isInside(w.level.arena, x, y, radius); i++) {
    x *= 0.88;
    y *= 0.88;
  }
  out.x = x;
  out.y = y;
  return true;
}

function spawnEntry(w: World, e: SpawnEntry, x: number, y: number): number {
  const k = kindOf(e.kind);
  if (k === Kind.SnakeHead) return spawnSnake(w, x, y, TELEGRAPH_SEC);
  const d = defOf(k);
  if (d === null) return -1;
  const id = spawnFromDef(w, d, x, y, TELEGRAPH_SEC);
  if (id < 0) return -1;
  if (k === Kind.Wanderer) initWanderer(w, id, e.headingDeg);
  else if (k === Kind.Pinwheel) initPinwheel(w, id, e.headingDeg);
  w.rot[id] = e.headingDeg * DEG;
  return id;
}

/** Spawn due queue entries in FIFO order while under maxLiveEnemies. */
export function releaseQueue(w: World, clock: number): void {
  const g = gs(w);
  let live = countWaveEnemies(w);
  const max = w.level.waves.maxLiveEnemies;
  while (g.queueLen > 0) {
    const e = g.queueEntry[g.queueHead];
    if (e === null || e === undefined) {
      popEntry(w);
      continue;
    }
    if ((g.queueDue[g.queueHead] ?? 0) > clock || live >= max) return;
    const k = kindOf(e.kind);
    const r = defOf(k)?.radius ?? 14;
    if (!resolvePosition(w, e, r, pos)) {
      g.queueDue[g.queueHead] = clock + RECHECK_SEC;
      return;
    }
    const id = spawnEntry(w, e, pos.x, pos.y);
    if (id < 0) {
      // No snake slot: drop the entry so it cannot jam the FIFO. World full: retry next step.
      if (k === Kind.SnakeHead && !hasSnakeSlot(w)) {
        popEntry(w);
        g.dropped++;
        continue;
      }
      return;
    }
    const seq = g.queueWave[g.queueHead] ?? 0;
    popEntry(w);
    live++;
    // The queue is FIFO and wave sequence numbers only grow, so the first entry of a wave to
    // spawn is the first with a number above sfxWave. One 'spawn' per wave, not per enemy.
    if (seq > g.sfxWave) {
      g.sfxWave = seq;
      bus.emit('sfx', 'spawn');
    }
    if (g.spawnLog !== null) g.spawnLog.push({ t: clock, kind: k, x: pos.x, y: pos.y });
  }
}

/** Advance the wave clock (paused while the ship is dead), queue and release spawns. */
export function stepSpawner(w: World, dt: number): void {
  const g = gs(w);
  if (!w.ship.active || g.outcome !== 'running') return;
  // V3: the objective hold and a live Endless boss stop the wave clock and every wave spawn.
  if (waveClockHeld(w)) return;
  g.waveClock += dt;
  if (g.endless !== null) advanceSegments(w, g.waveClock);
  enqueueDueWaves(w, g.waveClock);
  activateSpawners(w, g.waveClock);
  releaseQueue(w, g.waveClock);
}
