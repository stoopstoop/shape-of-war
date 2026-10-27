// Spawner (docs/01 section 6.4): slow mover toward the ship that emits Dart groups. First emit
// 2.0 s after activation, then every emitEverySec; skips an emit while 16 or more of its Darts
// live. Emitted Darts telegraph for 0.4 s.
// w.a = index into level.hazards.spawners, w.t = seconds active, aux = emits so far.
// A Dart's aux holds the id of the spawner that emitted it.
import { gs, isWaveEnemy, spawnFromDef } from '../state';
import { seekShip } from '../steer';
import { Kind, type World } from '../world';
import { def as dartDef } from './dart';
import type { EnemyDef } from './types';

export const def: EnemyDef = { kind: Kind.Spawner, radius: 24, speed: 50, value: 150, colour: 'yellow', hp: 12, geoms: 3 };

export const FIRST_EMIT_SEC = 2.0;
export const MAX_OWN_DARTS = 16;
export const DART_TELEGRAPH = 0.4;
export const EMIT_RING = 34;

export function ownDarts(w: World, id: number): number {
  const g = gs(w);
  let n = 0;
  for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && w.kind[i] === Kind.Dart && g.aux[i] === id) n++;
  return n;
}

function liveWaveEnemies(w: World): number {
  let n = 0;
  for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && isWaveEnemy(w.kind[i] ?? 0)) n++;
  return n;
}

/** Emit a group of darts on a small ring around the spawner, respecting the live enemy cap. */
export function emitDarts(w: World, id: number, count: number): number {
  const g = gs(w);
  const room = w.level.waves.maxLiveEnemies - liveWaveEnemies(w);
  const n = Math.min(count, room);
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  let made = 0;
  for (let k = 0; k < n; k++) {
    const a = (k * 2 * Math.PI) / Math.max(1, n);
    const did = spawnFromDef(w, dartDef, x + Math.cos(a) * EMIT_RING, y + Math.sin(a) * EMIT_RING, DART_TELEGRAPH);
    if (did < 0) break;
    g.aux[did] = id;
    made++;
  }
  return made;
}

export function step(w: World, id: number, dt: number): void {
  const g = gs(w);
  w.rot[id] = seekShip(w, id, def.speed * w.level.speedScale, dt);
  const t = (w.t[id] ?? 0) + dt;
  w.t[id] = t;
  const hz = w.level.hazards.spawners[w.a[id] ?? -1];
  if (hz === undefined || hz.emitEverySec <= 0) return;
  const emits = g.aux[id] ?? 0;
  if (t < FIRST_EMIT_SEC + emits * hz.emitEverySec) return;
  g.aux[id] = emits + 1;
  if (ownDarts(w, id) < MAX_OWN_DARTS) emitDarts(w, id, hz.dartsPerEmit);
}
