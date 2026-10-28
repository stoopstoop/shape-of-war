// Presence and threat events (docs/10 wave C, Appendix B). Once per step, after everything else
// in stepGame, count live entities per Kind (telegraphing ones excluded) and emit:
//   'sim:enemyEnter' { kind, live } when an enemy kind goes from 0 to at least 1 live,
//   'sim:enemyExit' { kind } when its last live entity is removed (kill, bomb, death clear),
//   'sim:threat' { level } at most every THREAT_INTERVAL: clamp(sum(weight x live) / 40, 0, 1).
// Only EnemyKind kinds emit enter and exit: Mines, Slime, wells and spawners never do. Bus only,
// the simulation never reads any of it. Payload objects are reused: handlers copy fields.
import { bus } from '../core/events';
import type { EnemyKind } from '../levelgen/leveldef';
import { gs } from './state';
import { Kind, type World } from './world';

export const THREAT_INTERVAL = 0.1;
export const THREAT_DIVISOR = 40;
const KIND_SLOTS = 32;

/** Pure: the EnemyKind name of a Kind, or null for hazards, segments and non enemies. */
export function enemyKindOf(k: Kind): EnemyKind | null {
  switch (k) {
    case Kind.Grunt:
      return 'grunt';
    case Kind.Wanderer:
      return 'wanderer';
    case Kind.Weaver:
      return 'weaver';
    case Kind.Pinwheel:
      return 'pinwheel';
    case Kind.Dart:
      return 'dart';
    case Kind.SnakeHead:
      return 'snake';
    case Kind.Charger:
      return 'charger';
    case Kind.Bulwark:
      return 'bulwark';
    case Kind.Blink:
      return 'blink';
    case Kind.Swirl:
      return 'swirl';
    case Kind.Sower:
      return 'sower';
    case Kind.Splime:
      return 'splime';
    default:
      return null;
  }
}

/** Pure: threat weight per live entity of a Kind (docs/10 wave C table). */
export function threatWeight(k: Kind): number {
  switch (k) {
    case Kind.Grunt:
      return 1;
    case Kind.Wanderer:
      return 0.5;
    case Kind.Weaver:
      return 1.5;
    case Kind.Pinwheel:
      return 0.8;
    case Kind.Dart:
      return 0.4;
    case Kind.SnakeHead:
      return 3;
    case Kind.Charger:
      return 2;
    case Kind.Bulwark:
      return 2.5;
    case Kind.Blink:
      return 2;
    case Kind.Swirl:
      return 1.5;
    case Kind.Sower:
      return 3;
    case Kind.Splime:
      return 2;
    case Kind.Mine:
      return 0.2;
    case Kind.GravityWell:
      return 0.5;
    case Kind.Spawner:
      return 1;
    default:
      return 0; // Slime, snake segments, geoms, drone, pickups, ship
  }
}

/** Pure: threat level from a weighted live sum. */
export function threatLevel(sum: number): number {
  const v = sum / THREAT_DIVISOR;
  if (!(v > 0)) return 0;
  return v > 1 ? 1 : v;
}

// Lookup tables built once at module load, indexed by Kind.
const NAMES: (EnemyKind | null)[] = [];
const WEIGHTS = new Float64Array(KIND_SLOTS);
for (let k = 0; k < KIND_SLOTS; k++) {
  NAMES.push(enemyKindOf(k as Kind));
  WEIGHTS[k] = threatWeight(k as Kind);
}

interface PresenceState {
  live: Int32Array;
  prev: Int32Array;
  threatTimer: number;
  enter: { kind: EnemyKind; live: number };
  exit: { kind: EnemyKind };
  threat: { level: number };
}

const states = new WeakMap<World, PresenceState>();

function presence(w: World): PresenceState {
  let s = states.get(w);
  if (s === undefined) {
    s = {
      live: new Int32Array(KIND_SLOTS),
      prev: new Int32Array(KIND_SLOTS),
      threatTimer: 0,
      enter: { kind: 'grunt', live: 0 },
      exit: { kind: 'grunt' },
      threat: { level: 0 },
    };
    states.set(w, s);
  }
  return s;
}

/** Live, non telegraphing count of kind k as of the last stepPresence (tests and debug). */
export function liveOfKind(w: World, k: Kind): number {
  return presence(w).live[k] ?? 0;
}

/** Count, diff against the previous step, emit enter and exit, and the rate limited threat. */
export function stepPresence(w: World, dt: number): void {
  const s = presence(w);
  const g = gs(w);
  const live = s.live;
  live.fill(0);
  let sum = 0;
  for (let id = 1; id < w.cap; id++) {
    if (w.alive[id] !== 1 || (g.tele[id] ?? 0) > 0) continue;
    const k = w.kind[id] ?? 0;
    if (k >= KIND_SLOTS) continue;
    live[k] = (live[k] ?? 0) + 1;
    sum += WEIGHTS[k] ?? 0;
  }
  const prev = s.prev;
  for (let k = 0; k < KIND_SLOTS; k++) {
    const name = NAMES[k] ?? null;
    if (name === null) continue;
    const before = prev[k] ?? 0;
    const now = live[k] ?? 0;
    if (before === 0 && now > 0) {
      s.enter.kind = name;
      s.enter.live = now;
      bus.emit('sim:enemyEnter', s.enter);
    } else if (before > 0 && now === 0) {
      s.exit.kind = name;
      bus.emit('sim:enemyExit', s.exit);
    }
  }
  prev.set(live);
  s.threatTimer -= dt;
  if (s.threatTimer > 1e-9) return;
  s.threatTimer += THREAT_INTERVAL;
  if (s.threatTimer < 0) s.threatTimer = 0;
  s.threat.level = threatLevel(sum);
  bus.emit('sim:threat', s.threat);
}
