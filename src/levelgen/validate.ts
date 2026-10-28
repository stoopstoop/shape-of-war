// Level validator, docs/02-level-generator.md section 11. Pure: no Date, no PRNG, no DOM.
// validateLevel collects every failure and never stops at the first. Every error string starts
// with the invariant id, for example "A3: obstacle 1 spawn clearance 120.0 < 200".
import {
  ARENA_SHAPES,
  BANDS,
  DRONE_KINDS,
  ENDLESS_ARENA,
  ENDLESS_SEGMENT_SEC,
  ENEMY_KINDS,
  GENERATOR_VERSION,
  GENERATOR_VERSION_V2,
  LEVELDEF_VERSION,
  MAX_RETRIES,
  SPAWN_PATTERNS,
  SUPER_KINDS,
  bandOf,
  effectiveIndexOf,
  forEachSpawn,
  levelSeed,
  segmentSeed,
  speedScaleFor,
} from './leveldef';
import type {
  ArenaDef,
  Band,
  EndlessDef,
  EndlessSegmentDef,
  EnemyKind,
  LevelDef,
  Obstacle,
  RosterEntry,
  ValidationResult,
  Vec2,
  WaveSchedule,
} from './leveldef';
import { ALL_ENEMY_KINDS, isV2Kind } from './v2enemies';

// Constants shared with the W2 generator. docs/02 sections 6, 7, 8, 9, 11.
export const ARENA_MIN_HEIGHT = 700;
export const ARENA_MAX_HEIGHT = 1100;
export const ARENA_MAX_WIDTH = 1800;
export const ARENA_MIN_ASPECT = 1.0;
export const ARENA_MAX_ASPECT = 1.8;
export const HEX_ASPECT = 1.1547005;
export const HEX_COS30 = 0.8660254;
export const SPAWN_INSIDE_MARGIN = 100;
export const OBSTACLE_SPAWN_CLEAR = 200;
export const OBSTACLE_EDGE_GAP = 80;
export const OBSTACLE_PAIR_GAP = 80;
export const MAX_OBSTACLES = 3;
export const CONNECT_CELL = 20;
export const CONNECT_CLEARANCE = 12; // ship radius 10 plus 2
export const CONNECT_MIN_FRACTION = 0.85;
export const ENTRY_EDGE_MARGIN = 40;
export const ENTRY_OBSTACLE_CLEAR = 30;
export const ENTRY_SPAWN_CLEAR = 180;
export const RING_MIN_RADIUS = 260;
export const RING_MAX_RADIUS = 340;
export const MAX_T_OFFSET_SEC = 5;
export const FIRST_WAVE_SEC = 2.5;
export const KILL_RATE = 0.7;
export const MAX_EST_SEC = 600;
export const MAX_WELLS = 3;
export const WELL_SPAWN_FLOOR = 360;
export const WELL_SPAWN_WIDTH_FRACTION = 0.25;
export const WELL_EDGE = 120;
export const WELL_OBSTACLE = 100;
export const WELL_PAIR = 400;
export const MAX_SPAWNERS = 2;
export const SPAWNER_EDGE = 80;
export const SPAWNER_SPAWN_WIDTH_FRACTION = 0.35;
export const SPAWNER_WELL = 200;
export const SPAWNER_OBSTACLE = 60;
export const PAR_MIN = 1000;
export const PAR_STEP = 500;
export const LIVES = 3;
export const BOMBS = 3;

// Fold fit (invariant F1). The whole arena is always visible (docs/01 section 2.3), so any arena
// "fits" by scaling down; what can fail is the ship becoming too small to read. Safe rects are in
// physical pixels: full screen minus the 40 CSS px HUD band at an assumed DPR of 3 (120 px).
// Cutout insets are unknown until G1 and taken as 0 here.
export const SHIP_RADIUS = 10;
export const MIN_SHIP_PX = 16;

export interface SafeRect {
  name: string;
  width: number;
  height: number;
}

export const FOLD_SAFE_RECTS: readonly SafeRect[] = [
  { name: '21:9 cover', width: 2520, height: 1080 - 120 },
  { name: '10:9 main', width: 2184, height: 1968 - 120 },
];

/** Same rule as fitArena in docs/04: scale = min(safeW / arenaW, safeH / arenaH). */
export function fitScale(arenaW: number, arenaH: number, rect: SafeRect): number {
  return Math.min(rect.width / arenaW, rect.height / arenaH);
}

// Geometry helpers.

const EPS = 1e-6;

/** True if p is inside the arena shape shrunk by margin. docs/02 section 6.1. */
export function insideArena(arena: ArenaDef, p: Vec2, margin: number): boolean {
  const hw = arena.width / 2;
  const hh = arena.height / 2;
  const ax = Math.abs(p.x);
  const ay = Math.abs(p.y);
  switch (arena.shape) {
    case 'rect':
    case 'rectObstacles':
      return ax <= hw - margin + EPS && ay <= hh - margin + EPS;
    case 'roundRect': {
      if (ax > hw - margin + EPS || ay > hh - margin + EPS) return false;
      const r = arena.cornerRadius;
      const cx = hw - r;
      const cy = hh - r;
      if (ax <= cx || ay <= cy) return true;
      return Math.hypot(ax - cx, ay - cy) <= r - margin + EPS;
    }
    case 'circle': {
      const lim = hw - margin;
      return lim >= 0 && p.x * p.x + p.y * p.y <= lim * lim + EPS;
    }
    case 'hexagon': {
      const apo = HEX_COS30 * hw - margin;
      return ay <= apo + EPS && HEX_COS30 * ax + 0.5 * ay <= apo + EPS;
    }
  }
}

/** Distance from a point to an axis-aligned obstacle; 0 if inside. */
export function obstaclePointDistance(o: Obstacle, p: Vec2): number {
  const dx = Math.max(Math.abs(p.x - o.cx) - o.w / 2, 0);
  const dy = Math.max(Math.abs(p.y - o.cy) - o.h / 2, 0);
  return Math.hypot(dx, dy);
}

/** Gap between two axis-aligned obstacles; 0 if they touch or overlap. */
export function obstacleGap(a: Obstacle, b: Obstacle): number {
  const dx = Math.max(Math.abs(a.cx - b.cx) - (a.w + b.w) / 2, 0);
  const dy = Math.max(Math.abs(a.cy - b.cy) - (a.h + b.h) / 2, 0);
  return Math.hypot(dx, dy);
}

export function obstacleCorners(o: Obstacle): Vec2[] {
  const hw = o.w / 2;
  const hh = o.h / 2;
  return [
    { x: o.cx - hw, y: o.cy - hh },
    { x: o.cx + hw, y: o.cy - hh },
    { x: o.cx - hw, y: o.cy + hh },
    { x: o.cx + hw, y: o.cy + hh },
  ];
}

/** Inscribed radius of the arena around the origin: distance from centre to the nearest wall. */
export function inscribedRadius(arena: ArenaDef): number {
  if (arena.shape === 'hexagon') return HEX_COS30 * (arena.width / 2);
  return Math.min(arena.width, arena.height) / 2;
}

/**
 * Grid flood fill, docs/02 section 6.3. True if every walkable cell is reachable from the spawn
 * cell and walls remove at most 15 percent of the open floor.
 */
export function isArenaConnected(arena: ArenaDef): boolean {
  const key = connectKey(arena);
  const hit = connectCache.get(key);
  if (hit !== undefined) return hit;
  const ok = floodConnected(arena);
  if (connectCache.size >= CONNECT_CACHE_MAX) connectCache.clear();
  connectCache.set(key, ok);
  return ok;
}

/**
 * Memo for isArenaConnected. The answer depends only on the fields in connectKey, and Number to
 * string is exact, so a hit returns what the flood fill would. It pays off because the validator
 * re-checks the arena the generator just placed, and walled-free arenas repeat across levels.
 */
const connectCache = new Map<string, boolean>();
const CONNECT_CACHE_MAX = 4096;

function connectKey(arena: ArenaDef): string {
  let k = `${arena.shape}|${arena.width}|${arena.height}|${arena.cornerRadius}|${arena.spawnPoint.x}|${arena.spawnPoint.y}`;
  for (const o of arena.obstacles) k += `|${o.cx},${o.cy},${o.w},${o.h}`;
  return k;
}

/**
 * obstaclePointDistance(o, p) >= clearance without the Math.hypot call when one axis already
 * clears: hypot(dx, dy) is never below max(dx, dy), so the answer is the same.
 */
function clearOfObstacle(o: Obstacle, x: number, y: number, clearance: number): boolean {
  const dx = Math.max(Math.abs(x - o.cx) - o.w / 2, 0);
  const dy = Math.max(Math.abs(y - o.cy) - o.h / 2, 0);
  if (dx >= clearance || dy >= clearance) return true;
  return Math.hypot(dx, dy) >= clearance;
}

function floodConnected(arena: ArenaDef): boolean {
  const nx = Math.ceil(arena.width / CONNECT_CELL);
  const ny = Math.ceil(arena.height / CONNECT_CELL);
  if (!(nx > 0 && ny > 0) || nx * ny > 1_000_000) return false;
  const x0 = -arena.width / 2;
  const y0 = -arena.height / 2;
  const walk = new Uint8Array(nx * ny);
  let inside = 0;
  let walkable = 0;
  const obstacles = arena.obstacles;
  const c = { x: 0, y: 0 };
  for (let j = 0; j < ny; j++) {
    c.y = y0 + (j + 0.5) * CONNECT_CELL;
    for (let i = 0; i < nx; i++) {
      c.x = x0 + (i + 0.5) * CONNECT_CELL;
      if (!insideArena(arena, c, CONNECT_CLEARANCE)) continue;
      inside++;
      let clear = true;
      for (let n = 0; n < obstacles.length && clear; n++) {
        const o = obstacles[n];
        if (o !== undefined) clear = clearOfObstacle(o, c.x, c.y, CONNECT_CLEARANCE);
      }
      if (clear) {
        walk[j * nx + i] = 1;
        walkable++;
      }
    }
  }
  const si = Math.min(nx - 1, Math.max(0, Math.floor((arena.spawnPoint.x - x0) / CONNECT_CELL)));
  const sj = Math.min(ny - 1, Math.max(0, Math.floor((arena.spawnPoint.y - y0) / CONNECT_CELL)));
  const start = sj * nx + si;
  if (walk[start] !== 1) return false;
  const queue = new Int32Array(walkable);
  const seen = new Uint8Array(nx * ny);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  seen[start] = 1;
  const visit = (n: number): void => {
    if (seen[n] === 1 || walk[n] !== 1) return;
    seen[n] = 1;
    queue[tail++] = n;
  };
  while (head < tail) {
    const k = queue[head++] ?? 0;
    const i = k % nx;
    const j = (k - i) / nx;
    if (i > 0) visit(k - 1);
    if (i < nx - 1) visit(k + 1);
    if (j > 0) visit(k - nx);
    if (j < ny - 1) visit(k + nx);
  }
  return tail === walkable && walkable >= CONNECT_MIN_FRACTION * inside;
}

// JSON checks.

/** Path of the first difference between a and its JSON round trip, or null if deep equal. */
export function jsonDiff(a: unknown, b: unknown, path = '$'): string | null {
  if (Object.is(a, b)) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return path;
  if (Array.isArray(a) !== Array.isArray(b)) return path;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return path;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(rb, k)) return `${path}.${k}`;
    const d = jsonDiff(ra[k], rb[k], `${path}.${k}`);
    if (d !== null) return d;
  }
  return null;
}

/**
 * Path suffix (".a.0.b") of the first value a JSON.stringify then JSON.parse round trip would not
 * give back deep equal, "" for the root, or null if it round trips. Walks the value without
 * serialising (J1 on a band 4 level was most of the generator's time). Fails on: non finite
 * numbers and -0, undefined, functions, symbols, bigints, array holes, toJSON, non plain objects.
 */
export function jsonRoundTripDiff(v: unknown): string | null {
  switch (typeof v) {
    case 'string':
    case 'boolean':
      return null;
    case 'number':
      return Number.isFinite(v) && !Object.is(v, -0) ? null : '';
    case 'object': {
      if (v === null) return null;
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
          if (!(i in v)) return `.${i}`;
          const d = jsonRoundTripDiff(v[i]);
          if (d !== null) return `.${i}${d}`;
        }
        return null;
      }
      const proto: unknown = Object.getPrototypeOf(v);
      if ((proto !== Object.prototype && proto !== null) || 'toJSON' in v) return '';
      const rec = v as Record<string, unknown>;
      for (const k of Object.keys(rec)) {
        const d = jsonRoundTripDiff(rec[k]);
        if (d !== null) return `.${k}${d}`;
      }
      return null;
    }
    default:
      return '';
  }
}

/** Paths of values JSON cannot carry exactly: non finite numbers, functions, undefined, symbols, bigints. */
export function nonJsonValues(v: unknown, path = '$', out: string[] = []): string[] {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(`${path} = ${String(v)}`);
  } else if (typeof v === 'function' || typeof v === 'undefined' || typeof v === 'symbol' || typeof v === 'bigint') {
    out.push(`${path} is ${typeof v}`);
  } else if (typeof v === 'object' && v !== null) {
    for (const [k, child] of Object.entries(v)) nonJsonValues(child, `${path}.${k}`, out);
  }
  return out;
}

// Check runner.

type Report = (msg: string) => void;

class Collector {
  readonly errors: string[] = [];

  check(id: string, fn: (report: Report) => void): void {
    const report: Report = (msg) => this.errors.push(`${id}: ${msg}`);
    try {
      fn(report);
    } catch (e) {
      report(`check threw on malformed def (${e instanceof Error ? e.message : String(e)})`);
    }
  }

  result(): ValidationResult {
    return { ok: this.errors.length === 0, errors: this.errors };
  }
}

const f1 = (v: number): string => v.toFixed(1);
const isInt = (v: number): boolean => Number.isInteger(v);
/** Any EnemyKind, v1 or v2. Mine and Slime are hazards with no EnemyKind, so they fail here. */
const isKind = (k: string): k is EnemyKind => (ALL_ENEMY_KINDS as readonly string[]).includes(k);
const inRange = (v: number, lo: number, hi: number): boolean => v >= lo - EPS && v <= hi + EPS;
const onStep = (v: number, lo: number, step: number): boolean => Math.abs((v - lo) / step - Math.round((v - lo) / step)) < EPS;

/**
 * One walk that is true only when J1 and J2 both have nothing to report: every reachable value is
 * a string, boolean, null or finite non -0 number, every array is dense with no extra keys, and
 * every object is plain with no toJSON. On such a value jsonRoundTripDiff returns null and
 * nonJsonValues (which walks the same keys) finds nothing, so checkJson can skip both walks.
 * Anything else returns false and the exact checks run. Primitives are tested inline so the
 * common leaf costs no call.
 */
export function isPlainJson(v: unknown): boolean {
  if (typeof v !== 'object') return isPlainJsonLeaf(v);
  if (v === null) return true;
  if (Array.isArray(v)) {
    const arr: readonly unknown[] = v;
    for (let i = 0; i < arr.length; i++) {
      if (!(i in arr)) return false;
      const x = arr[i];
      if (typeof x === 'object' ? !isPlainJson(x) : !isPlainJsonLeaf(x)) return false;
    }
    return Object.keys(arr).length === arr.length;
  }
  const proto: unknown = Object.getPrototypeOf(v);
  if ((proto !== Object.prototype && proto !== null) || 'toJSON' in v) return false;
  const rec = v as Record<string, unknown>;
  const keys = Object.keys(rec);
  for (let i = 0; i < keys.length; i++) {
    const x = rec[keys[i] ?? ''];
    if (typeof x === 'object' ? !isPlainJson(x) : !isPlainJsonLeaf(x)) return false;
  }
  return true;
}

function isPlainJsonLeaf(v: unknown): boolean {
  switch (typeof v) {
    case 'string':
    case 'boolean':
      return true;
    case 'number':
      return Number.isFinite(v) && !Object.is(v, -0);
    default:
      return false;
  }
}

function checkJson(c: Collector, def: unknown): void {
  // Fast path: a clean def gets the same (empty) result from J1 and J2 in one walk.
  // A throwing getter falls through to the exact checks, which report it.
  let clean = false;
  try {
    clean = isPlainJson(def);
  } catch {
    clean = false;
  }
  if (clean) return;
  c.check('J1', (report) => {
    const d = jsonRoundTripDiff(def);
    if (d !== null) report(`JSON round trip differs at $${d} (serialisation)`);
  });
  c.check('J2', (report) => {
    for (const p of nonJsonValues(def)) report(`non JSON value at ${p} (serialisation)`);
  });
}

function checkVersions(c: Collector, version: number, generatorVersion: number): void {
  c.check('J3', (report) => {
    if (version !== LEVELDEF_VERSION) report(`version ${version} !== ${LEVELDEF_VERSION}`);
    if (generatorVersion !== GENERATOR_VERSION && generatorVersion !== GENERATOR_VERSION_V2) {
      report(`generatorVersion ${generatorVersion} not ${GENERATOR_VERSION} or ${GENERATOR_VERSION_V2}`);
    }
  });
}

/**
 * J6: the generator version matches the content. Version 1 (the v1 algorithm alone) never names a
 * v2 kind; version 2 (the v2 enemy stage ran) never applies to band 1. band is null for an
 * EndlessDef, which spans every band.
 */
function checkV2Content(c: Collector, generatorVersion: number, band: Band | null, kinds: () => readonly string[]): void {
  c.check('J6', (report) => {
    if (generatorVersion === GENERATOR_VERSION) {
      const v2 = [...new Set(kinds().filter(isV2Kind))];
      if (v2.length > 0) report(`generatorVersion ${GENERATOR_VERSION} names v2 kinds ${v2.join(', ')}`);
    }
    if (generatorVersion === GENERATOR_VERSION_V2 && band === 1) report(`generatorVersion ${GENERATOR_VERSION_V2} in band 1`);
  });
}

/** Every kind a schedule and roster name, for J6. */
function namedKinds(roster: readonly RosterEntry[], ws: WaveSchedule): string[] {
  const out: string[] = roster.map((e) => e.kind);
  for (const w of ws.waves) for (const e of w.entries) out.push(e.kind);
  return out;
}

function checkRoster(c: Collector, roster: readonly RosterEntry[], band: Band): void {
  c.check('R1', (report) => {
    if (roster.length < 3 || roster.length > 6) report(`roster size ${roster.length} outside 3 to 6`);
    const seen = new Set<string>();
    for (const e of roster) {
      if (!isKind(e.kind)) {
        report(`unknown enemy kind ${String(e.kind)}`);
        continue;
      }
      if (seen.has(e.kind)) report(`duplicate roster kind ${e.kind}`);
      seen.add(e.kind);
      if (BANDS[band].rosterWeights[e.kind] <= 0) report(`${e.kind} not eligible in band ${band}`);
      if (!(e.weight > 0)) report(`${e.kind} weight ${e.weight} not positive`);
    }
    if (!seen.has('grunt')) report('roster lacks grunt');
  });
}

function checkSpeed(c: Collector, speedScale: number, index: number): void {
  c.check('R2', (report) => {
    if (!inRange(speedScale, 1, 1.4)) report(`speedScale ${speedScale} outside 1.00 to 1.40`);
    const want = speedScaleFor(index);
    if (Math.abs(speedScale - want) > EPS) report(`speedScale ${speedScale} !== table value ${want}`);
  });
}

interface WaveRules {
  firstAtSec: number;
  maxLive: number;
  /** null: levels (loop required). Otherwise segment bound on atSec. */
  segmentSec: number | null;
}

function checkWaves(c: Collector, ws: WaveSchedule, arena: ArenaDef, roster: readonly RosterEntry[], rules: WaveRules): void {
  c.check('W1', (report) => {
    const first = ws.waves[0];
    if (first === undefined) report('no waves');
    else if (Math.abs(first.atSec - rules.firstAtSec) > EPS) report(`first wave atSec ${first.atSec} !== ${rules.firstAtSec}`);
  });
  c.check('W2', (report) => {
    ws.waves.forEach((w, i) => {
      if (w.index !== i) report(`wave ${i} has index ${w.index}`);
      if (!SPAWN_PATTERNS.includes(w.pattern)) report(`wave ${i} unknown pattern ${String(w.pattern)}`);
      const prev = ws.waves[i - 1];
      if (prev !== undefined && !(w.atSec > prev.atSec)) report(`wave ${i} atSec ${w.atSec} not after ${prev.atSec}`);
    });
  });
  c.check('W3', (report) => {
    const kinds = new Set<string>(roster.map((e) => e.kind));
    ws.waves.forEach((w, i) => {
      w.entries.forEach((e, k) => {
        if (!kinds.has(e.kind)) report(`wave ${i} entry ${k} kind ${e.kind} not in roster`);
      });
    });
  });
  c.check('W4', (report) => {
    ws.waves.forEach((w, i) => {
      w.entries.forEach((e, k) => {
        if (e.mode !== 'fixed') return;
        const p = { x: e.x, y: e.y };
        const at = (): string => `wave ${i} entry ${k} (${f1(e.x)}, ${f1(e.y)})`;
        if (!insideArena(arena, p, ENTRY_EDGE_MARGIN)) report(`${at()} outside arena bounds margin ${ENTRY_EDGE_MARGIN}`);
        const ds = Math.hypot(e.x - arena.spawnPoint.x, e.y - arena.spawnPoint.y);
        if (ds < ENTRY_SPAWN_CLEAR) report(`${at()} spawn clearance ${f1(ds)} < ${ENTRY_SPAWN_CLEAR}`);
        arena.obstacles.forEach((o, j) => {
          const d = obstaclePointDistance(o, p);
          if (d < ENTRY_OBSTACLE_CLEAR) report(`${at()} within ${f1(d)} of obstacle ${j}`);
        });
      });
    });
  });
  c.check('W5', (report) => {
    ws.waves.forEach((w, i) => {
      w.entries.forEach((e, k) => {
        const at = (): string => `wave ${i} entry ${k}`;
        if (e.mode !== 'fixed' && e.mode !== 'ring') report(`${at()} unknown mode ${String(e.mode)}`);
        if (!isInt(e.headingDeg) || !inRange(e.headingDeg, 0, 359)) report(`${at()} headingDeg ${e.headingDeg} not an integer 0 to 359`);
        if (e.mode !== 'ring') return;
        if (!inRange(e.radius, RING_MIN_RADIUS, RING_MAX_RADIUS)) report(`${at()} ring radius ${e.radius} outside ${RING_MIN_RADIUS} to ${RING_MAX_RADIUS}`);
        if (!isInt(e.angleDeg) || !inRange(e.angleDeg, 0, 359)) report(`${at()} angleDeg ${e.angleDeg} not an integer 0 to 359`);
      });
    });
  });
  c.check('W6', (report) => {
    ws.waves.forEach((w, i) => {
      w.entries.forEach((e, k) => {
        if (!inRange(e.tOffsetSec, 0, MAX_T_OFFSET_SEC)) report(`wave ${i} entry ${k} tOffsetSec ${e.tOffsetSec} outside 0 to ${MAX_T_OFFSET_SEC}`);
      });
    });
  });
  c.check('W7', (report) => {
    if (ws.maxLiveEnemies !== rules.maxLive) report(`maxLiveEnemies ${ws.maxLiveEnemies} !== band value ${rules.maxLive}`);
  });
  c.check('W8', (report) => {
    if (rules.segmentSec === null) {
      if (!isInt(ws.loopFromIndex) || ws.waves[ws.loopFromIndex] === undefined) report(`loopFromIndex ${ws.loopFromIndex} is not a wave index`);
      if (!(ws.loopPeriodSec > 0)) report(`loopPeriodSec ${ws.loopPeriodSec} not positive`);
    } else {
      if (ws.loopFromIndex !== -1 || ws.loopPeriodSec !== 0) report(`segment loop fields ${ws.loopFromIndex}, ${ws.loopPeriodSec} must be -1, 0`);
    }
  });
}

function checkArena(c: Collector, arena: ArenaDef): void {
  c.check('A1', (report) => {
    const { shape, width: w, height: h } = arena;
    if (!ARENA_SHAPES.includes(shape)) report(`unknown arena shape ${String(shape)}`);
    if (!inRange(h, ARENA_MIN_HEIGHT, ARENA_MAX_HEIGHT)) report(`arena height ${h} outside bounds ${ARENA_MIN_HEIGHT} to ${ARENA_MAX_HEIGHT}`);
    if (!(w > 0) || w > ARENA_MAX_WIDTH + EPS) report(`arena width ${w} outside bounds 0 to ${ARENA_MAX_WIDTH}`);
    const aspect = w / h;
    if (shape === 'circle') {
      if (w !== h) report(`circle width ${w} !== height ${h}`);
    } else if (shape === 'hexagon') {
      if (Math.abs(aspect - HEX_ASPECT) > 0.01) report(`hexagon aspect ${aspect.toFixed(4)} !== ${HEX_ASPECT}`);
    } else if (!inRange(aspect, ARENA_MIN_ASPECT, ARENA_MAX_ASPECT)) {
      report(`arena aspect ${aspect.toFixed(3)} outside bounds ${ARENA_MIN_ASPECT} to ${ARENA_MAX_ASPECT}`);
    }
  });
  c.check('F1', (report) => {
    for (const rect of FOLD_SAFE_RECTS) {
      const px = 2 * SHIP_RADIUS * fitScale(arena.width, arena.height, rect);
      if (!(px >= MIN_SHIP_PX - EPS)) report(`arena does not fit ${rect.name} safe rect: ship ${f1(px)} px < ${MIN_SHIP_PX} px`);
    }
  });
  c.check('A2', (report) => {
    const s = arena.spawnPoint;
    if (s.x !== 0 || s.y !== 0) report(`spawnPoint (${s.x}, ${s.y}) is not (0, 0)`);
    if (!insideArena(arena, s, SPAWN_INSIDE_MARGIN)) report(`spawnPoint not inside arena with margin ${SPAWN_INSIDE_MARGIN}`);
  });
  c.check('A3', (report) => {
    arena.obstacles.forEach((o, i) => {
      const d = obstaclePointDistance(o, arena.spawnPoint);
      if (d < OBSTACLE_SPAWN_CLEAR) report(`obstacle ${i} spawn clearance ${f1(d)} < ${OBSTACLE_SPAWN_CLEAR}`);
    });
  });
  c.check('A4', (report) => {
    const n = arena.obstacles.length;
    if (arena.shape === 'rectObstacles') {
      if (n < 1 || n > MAX_OBSTACLES) report(`rectObstacles has ${n} obstacles, want 1 to ${MAX_OBSTACLES}`);
    } else if (n !== 0) {
      report(`${arena.shape} has ${n} obstacles, want 0`);
    }
    arena.obstacles.forEach((o, i) => {
      if (!(o.w > 0 && o.h > 0)) report(`obstacle ${i} size ${o.w} x ${o.h} not positive`);
      if (!obstacleCorners(o).every((p) => insideArena(arena, p, OBSTACLE_EDGE_GAP))) {
        report(`obstacle ${i} outside arena bounds margin ${OBSTACLE_EDGE_GAP}`);
      }
    });
  });
  c.check('A5', (report) => {
    arena.obstacles.forEach((a, i) => {
      arena.obstacles.slice(i + 1).forEach((b, k) => {
        const g = obstacleGap(a, b);
        if (g < OBSTACLE_PAIR_GAP) report(`obstacles ${i} and ${i + k + 1} gap ${f1(g)} < ${OBSTACLE_PAIR_GAP}`);
      });
    });
  });
  c.check('A6', (report) => {
    if (!isArenaConnected(arena)) report('walls seal part of the arena (not connected from spawn)');
  });
  c.check('A7', (report) => {
    const r = arena.cornerRadius;
    if (arena.shape === 'roundRect') {
      if (!inRange(r, 0.15 * arena.height - 0.05, 0.3 * arena.height + 0.05)) report(`cornerRadius ${r} outside 0.15 to 0.30 x height`);
    } else if (r !== 0) {
      report(`cornerRadius ${r} must be 0 for ${arena.shape}`);
    }
  });
}

function checkObjective(c: Collector, def: LevelDef, band: Band): void {
  const b = BANDS[band];
  const o = def.objective;
  c.check('O1', (report) => {
    switch (o.kind) {
      case 'survive':
        if (!inRange(o.durationSec, b.surviveSec.min, b.surviveSec.max) || !onStep(o.durationSec, b.surviveSec.min, 5)) {
          report(`survive durationSec ${o.durationSec} outside band ${band} range ${b.surviveSec.min} to ${b.surviveSec.max} step 5`);
        }
        break;
      case 'destroy':
        if (!inRange(o.count, b.destroyCount.min, b.destroyCount.max) || !onStep(o.count, b.destroyCount.min, 5)) {
          report(`destroy count ${o.count} outside band ${band} range ${b.destroyCount.min} to ${b.destroyCount.max} step 5`);
        }
        break;
      case 'scoreInTime':
        if (!inRange(o.timeLimitSec, b.scoreTimeSec.min, b.scoreTimeSec.max) || !onStep(o.timeLimitSec, b.scoreTimeSec.min, 15)) {
          report(`scoreInTime timeLimitSec ${o.timeLimitSec} outside band ${band} range ${b.scoreTimeSec.min} to ${b.scoreTimeSec.max} step 15`);
        }
        break;
      default:
        report(`unknown objective kind ${String((o as { kind: unknown }).kind)}`);
    }
  });
  c.check('O2', (report) => {
    if (o.kind !== 'scoreInTime') return;
    if (!(o.target >= PAR_MIN) || o.target % PAR_STEP !== 0) report(`target ${o.target} not a multiple of ${PAR_STEP} at least ${PAR_MIN}`);
    if (o.target > def.par) report(`target ${o.target} above par ${def.par}`);
  });
  c.check('P1', (report) => {
    const p = def.par;
    if (!(p >= PAR_MIN) || p % PAR_STEP !== 0) report(`par ${p} not a multiple of ${PAR_STEP} at least ${PAR_MIN}`);
    const s = def.stars;
    if (s.length !== 3 || s[0] !== p || s[1] !== 2 * p || s[2] !== 4 * p) report(`stars [${s.join(', ')}] !== [par, 2 x par, 4 x par] for par ${p}`);
  });
  c.check('W9', (report) => {
    if (o.kind !== 'destroy') return;
    let n = 0;
    forEachSpawn(def.waves, MAX_EST_SEC, () => {
      n++;
    });
    if (n < o.count / KILL_RATE) report(`only ${n} spawns in ${MAX_EST_SEC} s for destroy ${o.count} (need ${Math.ceil(o.count / KILL_RATE)})`);
  });
  c.check('W10', (report) => {
    if (o.kind === 'destroy') return;
    const T = o.kind === 'survive' ? o.durationSec : o.timeLimitSec;
    if (!def.waves.waves.some((w) => w.atSec <= 5)) report('no wave starts within the first 5 s');
    const late = forEachSpawn(def.waves, T, (t) => t >= 0.8 * T);
    if (!late) report(`no spawns in the last 20 percent of ${T} s`);
  });
}

function checkHazards(c: Collector, def: LevelDef, band: Band): void {
  const { arena, hazards } = def;
  // Lazy so a malformed arena is reported by the check wrapper instead of throwing here.
  const wellClear = (): number => Math.max(WELL_SPAWN_WIDTH_FRACTION * arena.width, WELL_SPAWN_FLOOR);
  const spawnerClear = (): number => SPAWNER_SPAWN_WIDTH_FRACTION * arena.width;
  const fromSpawn = (p: Vec2): number => Math.hypot(p.x - arena.spawnPoint.x, p.y - arena.spawnPoint.y);
  c.check('H1', (report) => {
    const n = hazards.wells.length;
    if (n > MAX_WELLS) report(`hazards: ${n} gravity wells, want 0 to ${MAX_WELLS}`);
    hazards.wells.forEach((w, i) => {
      const d = fromSpawn(w);
      if (d < wellClear()) report(`well ${i} spawn clearance ${f1(d)} < ${f1(wellClear())}`);
      if (!insideArena(arena, w, WELL_EDGE)) report(`well ${i} outside arena bounds margin ${WELL_EDGE}`);
      arena.obstacles.forEach((o, j) => {
        const g = obstaclePointDistance(o, w);
        if (g < WELL_OBSTACLE) report(`well ${i} within ${f1(g)} of obstacle ${j}`);
      });
    });
  });
  c.check('H2', (report) => {
    hazards.wells.forEach((a, i) => {
      hazards.wells.slice(i + 1).forEach((b, k) => {
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < WELL_PAIR) report(`wells ${i} and ${i + k + 1} distance ${f1(d)} < ${WELL_PAIR}`);
      });
    });
  });
  c.check('H3', (report) => {
    const n = hazards.spawners.length;
    if (n > MAX_SPAWNERS) report(`hazards: ${n} spawners, want 0 to ${MAX_SPAWNERS}`);
    hazards.spawners.forEach((s, i) => {
      const d = fromSpawn(s);
      if (d < spawnerClear()) report(`spawner ${i} spawn clearance ${f1(d)} < ${f1(spawnerClear())}`);
      if (!insideArena(arena, s, SPAWNER_EDGE)) report(`spawner ${i} outside arena bounds margin ${SPAWNER_EDGE}`);
      hazards.wells.forEach((w, j) => {
        const dw = Math.hypot(s.x - w.x, s.y - w.y);
        if (dw < SPAWNER_WELL) report(`spawner ${i} within ${f1(dw)} of well ${j}`);
      });
      arena.obstacles.forEach((o, j) => {
        const g = obstaclePointDistance(o, s);
        if (g < SPAWNER_OBSTACLE) report(`spawner ${i} within ${f1(g)} of obstacle ${j}`);
      });
      if (!(s.spawnAtSec >= 0) || !(s.emitEverySec > 0) || !(s.dartsPerEmit >= 1) || !isInt(s.dartsPerEmit)) {
        report(`spawner ${i} timing ${s.spawnAtSec}, ${s.emitEverySec}, ${s.dartsPerEmit} invalid`);
      }
    });
  });
  c.check('H4', (report) => {
    if (band === 1 && (hazards.wells.length > 0 || hazards.spawners.length > 0)) report('band 1 must have no hazards');
    if (band === 2 && hazards.spawners.length > 0) report('band 2 must have no spawners');
  });
}

function checkLoadout(c: Collector, def: LevelDef): void {
  c.check('L1', (report) => {
    if (def.lives !== LIVES) report(`lives ${def.lives} !== ${LIVES}`);
    if (def.bombs !== BOMBS) report(`bombs ${def.bombs} !== ${BOMBS}`);
    if (!DRONE_KINDS.includes(def.drone)) report(`unknown drone ${String(def.drone)}`);
    if (!SUPER_KINDS.includes(def.superType)) report(`unknown superType ${String(def.superType)}`);
  });
}

/** Validates a LevelDef against every docs/02 section 11 invariant plus F1 (fold fit). */
export function validateLevel(def: LevelDef): ValidationResult {
  const c = new Collector();
  checkJson(c, def);
  checkVersions(c, def.version, def.generatorVersion);
  const band = bandOf(def.levelIndex);
  c.check('J4', (report) => {
    if (!isInt(def.runSeed) || def.runSeed < 0 || def.runSeed > 0xffffffff) report(`runSeed ${def.runSeed} not a uint32`);
    if (!isInt(def.levelIndex) || def.levelIndex < 1) report(`levelIndex ${def.levelIndex} not an integer from 1`);
    const want = levelSeed(def.runSeed, def.levelIndex);
    if (def.seed !== want) report(`seed ${def.seed} !== levelSeed(runSeed, levelIndex) ${want}`);
    if (def.band !== band) report(`band ${def.band} !== bandOf(${def.levelIndex}) ${band}`);
  });
  checkArena(c, def.arena);
  checkRoster(c, def.roster, band);
  checkSpeed(c, def.speedScale, def.levelIndex);
  checkObjective(c, def, band);
  checkWaves(c, def.waves, def.arena, def.roster, {
    firstAtSec: FIRST_WAVE_SEC,
    maxLive: BANDS[band].maxLiveEnemies,
    segmentSec: null,
  });
  checkHazards(c, def, band);
  checkLoadout(c, def);
  checkSurface(c, def.surface);
  checkV2Content(c, def.generatorVersion, band, () => namedKinds(def.roster, def.waves));
  c.check('J5', (report) => {
    const r = def.retries;
    if (r === undefined || !isInt(r) || r < 0 || r > MAX_RETRIES) report(`retries ${String(r)} not an integer 0 to ${MAX_RETRIES}`);
  });
  return c.result();
}

/** V1: v2 hook. Only 'flat' is valid in v1; a missing field is an error too. */
function checkSurface(c: Collector, surface: unknown): void {
  c.check('V1', (report) => {
    if (surface !== 'flat') report(`surface ${String(surface)} !== 'flat' (only flat is valid in v1)`);
  });
}

/** Validates an EndlessDef: J1 to J3, V1, the fixed arena, full catalogue roster, fixed kit (docs/01 section 2.2). */
export function validateEndless(def: EndlessDef): ValidationResult {
  const c = new Collector();
  checkJson(c, def);
  checkVersions(c, def.version, def.generatorVersion);
  checkSurface(c, def.surface);
  c.check('E1', (report) => {
    if (def.mode !== 'endless') report(`mode ${String(def.mode)} !== 'endless'`);
    if (def.objective.kind !== 'none') report(`objective ${String(def.objective.kind)} !== 'none'`);
    if (!isInt(def.endlessSeed) || def.endlessSeed < 0 || def.endlessSeed > 0xffffffff) report(`endlessSeed ${def.endlessSeed} not a uint32`);
    const a = def.arena;
    const e = ENDLESS_ARENA;
    if (a.shape !== e.shape || a.width !== e.width || a.height !== e.height || a.obstacles.length !== 0) report('arena is not the fixed Endless arena');
    if (def.hazards.wells.length !== 0 || def.hazards.spawners.length !== 0) report('Endless v1 has no hazards');
    if (def.drone !== 'attack' || def.superType !== 'turbo') report(`kit ${String(def.drone)}, ${String(def.superType)} !== attack, turbo`);
    if (def.lives !== LIVES || def.bombs !== BOMBS) report(`start lives ${def.lives}, bombs ${def.bombs} !== ${LIVES}, ${BOMBS}`);
    if (def.segmentSec !== ENDLESS_SEGMENT_SEC) report(`segmentSec ${def.segmentSec} !== ${ENDLESS_SEGMENT_SEC}`);
    if (!(def.budgetPerSegment > 0)) report(`budgetPerSegment ${def.budgetPerSegment} not positive: ramp must be unbounded`);
  });
  c.check('E2', (report) => {
    const seen = new Set<string>();
    for (const e of def.roster) {
      if (!isKind(e.kind) || seen.has(e.kind) || !(e.weight > 0)) report(`bad roster entry ${String(e.kind)} weight ${e.weight}`);
      seen.add(e.kind);
    }
    if (!seen.has('grunt')) report('roster lacks grunt');
    // The catalogue: the v1 six, plus the six v2 kinds when the v2 enemy stage is on.
    const max = def.generatorVersion === GENERATOR_VERSION_V2 ? ALL_ENEMY_KINDS.length : ENEMY_KINDS.length;
    if (def.roster.length < 3 || def.roster.length > max) report(`roster size ${def.roster.length} outside 3 to ${max}`);
  });
  checkV2Content(c, def.generatorVersion, null, () => def.roster.map((e) => e.kind));
  return c.result();
}

/** Validates an Endless segment: J1 to J3, seeds, R1, R2, W1 to W8 on the fixed Endless arena, and S1. */
export function validateSegment(seg: EndlessSegmentDef): ValidationResult {
  const c = new Collector();
  checkJson(c, seg);
  checkVersions(c, seg.version, seg.generatorVersion);
  const effective = effectiveIndexOf(seg.segment);
  const band = bandOf(effective);
  c.check('J4', (report) => {
    if (!isInt(seg.segment) || seg.segment < 0) report(`segment ${seg.segment} not an integer from 0`);
    const want = segmentSeed(seg.endlessSeed, seg.segment);
    if (seg.seed !== want) report(`seed ${seg.seed} !== segmentSeed(endlessSeed, segment) ${want}`);
    if (seg.effectiveIndex !== effective) report(`effectiveIndex ${seg.effectiveIndex} !== ${effective}`);
    if (seg.band !== band) report(`band ${seg.band} !== bandOf(${effective}) ${band}`);
  });
  checkRoster(c, seg.roster, band);
  checkSpeed(c, seg.speedScale, effective);
  checkWaves(c, seg.waves, ENDLESS_ARENA, seg.roster, {
    firstAtSec: seg.segment === 0 ? FIRST_WAVE_SEC : 0,
    maxLive: BANDS[band].maxLiveEnemies,
    segmentSec: ENDLESS_SEGMENT_SEC,
  });
  c.check('S1', (report) => {
    seg.waves.waves.forEach((w, i) => {
      if (!(w.atSec >= 0 && w.atSec < ENDLESS_SEGMENT_SEC)) report(`wave ${i} atSec ${w.atSec} outside 0 to ${ENDLESS_SEGMENT_SEC}`);
    });
  });
  checkV2Content(c, seg.generatorVersion, band, () => namedKinds(seg.roster, seg.waves));
  return c.result();
}
