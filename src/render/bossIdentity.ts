// G3C boss identity (run 0288): the Prism window state machine driven by 'sim:bossWindow', the
// per boss hit flash throttle, crack and break off geometry for 'sim:bossCrack', the identity
// table (silhouette and colour family per boss), the tier 3 halo and the Twins enrage flare.
// Pure functions and small state records only; the renderer owns the Graphics.
import type { Bus, EventKey } from '../core/events';
import { BOSS_IDS } from '../levelgen/leveldef';
import { hash01 } from './color';
import { BOSS_COUNT, BOSS_WARDEN, bossColourOf, bossIndex } from './bossLook';
import { bossBodyR, buildBossSpec } from './bossShapes';
import type { PaletteKey } from './neon';
import type { ShapePrim } from './shapeSpecs';

function fin(v: number, d: number): number {
  return Number.isFinite(v) ? v : d;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(u: number): number {
  const t = clamp01(u);
  return t * t * (3 - 2 * t);
}

// Identity

export type Silhouette =
  | 'heavyHexagon'
  | 'podCluster'
  | 'thinSpindle'
  | 'flameDiamond'
  | 'splitRings'
  | 'denseRing'
  | 'fortressSquare'
  | 'kiteTrail'
  | 'twinCircles'
  | 'gem';

export interface BossIdentity {
  readonly id: (typeof BOSS_IDS)[number];
  readonly silhouette: Silhouette;
  /** Body colour family (the baked spec colour). */
  readonly hue: PaletteKey;
  /** Attack colour: bullets and hazards of this boss take it (the owner's hue). */
  readonly attack: PaletteKey;
}

const SILHOUETTES: readonly Silhouette[] = [
  'heavyHexagon',
  'podCluster',
  'thinSpindle',
  'flameDiamond',
  'splitRings',
  'denseRing',
  'fortressSquare',
  'kiteTrail',
  'twinCircles',
  'gem',
];

/** One row per boss index, in BOSS_IDS order. */
export const BOSS_IDENTITY: readonly BossIdentity[] = BOSS_IDS.map((id, i) => ({
  id,
  silhouette: SILHOUETTES[i] ?? 'gem',
  hue: bossColourOf(i),
  attack: bossColourOf(i),
}));

/** Pure: the attack colour key of a boss (its own hue). */
export function bossAttackKey(b: number): PaletteKey {
  return BOSS_IDENTITY[bossIndex(b)]?.attack ?? 'bossBlue';
}

/**
 * Pure: the outer outline of a boss body in arena units (unscaled), for the white hit flash and the
 * run to white. Warden's outline is plates, so it uses its heavy hexagon; the rest use the first
 * primitive of the body layer of their spec.
 */
export function bossOutline(b: number): ShapePrim {
  const i = bossIndex(b);
  const R = bossBodyR(i);
  if (i === BOSS_WARDEN) return { t: 'regularPoly', r: R, sides: 6, rot: 0 };
  const p = buildBossSpec(i, 0).layers[0]?.prims[0];
  return p !== undefined && p.t !== 'line' ? p : { t: 'circle', r: R };
}

/** Outlines of every boss, built once. */
export const BOSS_OUTLINES: readonly ShapePrim[] = Array.from({ length: BOSS_COUNT }, (_, i) => bossOutline(i));

// Prism window

/** Run up length: under this many seconds to the window the body runs to white. */
export const WINDOW_RUN_SEC = 0.5;
/** Contracting ring start radius, as a multiple of the body radius. */
export const WINDOW_RING_R0 = 2;
/** Thin hold ring radius while open. */
export const WINDOW_HOLD_R = 1.12;
/** Opening burst length and the sustained flash level after it. */
export const WINDOW_BURST_SEC = 0.18;
export const WINDOW_HOLD_FLASH = 0.6;

export interface BossWindow {
  /** True once a 'sim:bossWindow' event arrived for the live boss. */
  known: boolean;
  open: boolean;
  /** Seconds to the window (closed) or left in it (open), counted down on the draw clock. */
  left: number;
  /** Seconds since the window opened. */
  openAge: number;
}

export function createBossWindow(): BossWindow {
  return { known: false, open: false, left: Number.POSITIVE_INFINITY, openAge: 0 };
}

export function resetBossWindow(s: BossWindow): void {
  s.known = false;
  s.open = false;
  s.left = Number.POSITIVE_INFINITY;
  s.openAge = 0;
}

/** Apply one 'sim:bossWindow' payload. */
export function windowEvent(s: BossWindow, open: boolean, secondsLeft: number): void {
  const left = fin(secondsLeft, Number.POSITIVE_INFINITY);
  if (open && !s.open) s.openAge = 0;
  s.known = true;
  s.open = open;
  s.left = left < 0 ? 0 : left;
}

/** Advance on the draw clock. An open window that runs out closes on its own. */
export function stepBossWindow(s: BossWindow, dt: number): void {
  const d = fin(dt, 0);
  if (s.left > 0) s.left = Math.max(0, s.left - d);
  if (s.open) {
    s.openAge += d;
    if (s.left <= 0) {
      s.open = false;
      s.left = Number.POSITIVE_INFINITY;
    }
  }
}

/** Pure: whiteness 0 to 1 of the body: 1 while open, rising over the last WINDOW_RUN_SEC before it. */
export function windowWhite(s: BossWindow): number {
  if (!s.known) return 0;
  if (s.open) return 1;
  if (s.left >= WINDOW_RUN_SEC) return 0;
  return smooth(1 - s.left / WINDOW_RUN_SEC);
}

/** Pure: flash level while open: a short full burst, then a sustained hold. 0 while closed. */
export function windowFlash(s: BossWindow): number {
  if (!s.known || !s.open) return 0;
  const burst = 1 - s.openAge / WINDOW_BURST_SEC;
  return burst > WINDOW_HOLD_FLASH ? burst : WINDOW_HOLD_FLASH;
}

export interface WindowRing {
  /** Radius as a multiple of the body radius. */
  r: number;
  alpha: number;
  /** Line width multiplier (thin while open). */
  width: number;
}

/** Pure: contracting from 2x during the run up, a thin held ring while open, else hidden. */
export function windowRing(s: BossWindow, out: WindowRing): WindowRing {
  const wv = windowWhite(s);
  if (s.known && s.open) {
    out.r = WINDOW_HOLD_R;
    out.alpha = 0.9;
    out.width = 0.5;
  } else if (wv > 0) {
    out.r = WINDOW_RING_R0 + (1 - WINDOW_RING_R0) * wv;
    out.alpha = wv;
    out.width = 1;
  } else {
    out.r = 0;
    out.alpha = 0;
    out.width = 0;
  }
  return out;
}

// Hit flash

/** At most 20 flashes per second per boss. */
export const BOSS_FLASH_MIN_MS = 50;
/** Outline flash length. */
export const BOSS_FLASH_SEC = 0.06;

/** Last flash time per boss index (ms on the draw clock). */
export type BossFlashThrottle = Float64Array;

export function createBossFlashThrottle(): BossFlashThrottle {
  return new Float64Array(BOSS_COUNT).fill(Number.NEGATIVE_INFINITY);
}

/** True (and records it) if boss b may flash at nowMs. */
export function bossFlashAllow(t: BossFlashThrottle, b: number, nowMs: number): boolean {
  const i = bossIndex(b);
  const last = t[i] ?? Number.NEGATIVE_INFINITY;
  if (nowMs - last < BOSS_FLASH_MIN_MS) return false;
  t[i] = nowMs;
  return true;
}

/** Pure: outline flash alpha at age seconds (1 to 0 over 60 ms). */
export function hitFlashAlpha(ageSec: number): number {
  const a = fin(ageSec, Number.POSITIVE_INFINITY);
  return a < 0 ? 1 : a >= BOSS_FLASH_SEC ? 0 : 1 - a / BOSS_FLASH_SEC;
}

/** Pure: sparks per hit, 2 or 3 by sequence. */
export function hitSparkCount(seq: number): number {
  return 2 + ((seq | 0) & 1);
}

// Cracks

/** Points per crack polyline. */
export const CRACK_PTS = 7;
/** The crack keeps inside the body at CRACK_REACH body radii; jag is the zigzag offset. */
export const CRACK_REACH = 0.85;
export const CRACK_JAG = 0.14;
/** Half angle of the broken wedge per stage (radians) and its depth (body radii). */
export const PIECE_HALF: readonly [number, number] = [0.24, 0.4];
export const PIECE_DEPTH: readonly [number, number] = [0.32, 0.5];
/** Broken piece drift distance (arena units) and dissolve time. */
export const PIECE_DRIFT = 40;
export const PIECE_LIFE = 0.8;

export interface BossCracks {
  stage: number;
  /** Local break angles (radians, body frame) of stage 1 and 2. */
  angle1: number;
  angle2: number;
  /** Unit crack polylines (x, y pairs, body radii) of stage 1 and 2. */
  line1: Float32Array;
  line2: Float32Array;
}

export function createBossCracks(): BossCracks {
  return { stage: 0, angle1: 0, angle2: 0, line1: new Float32Array(CRACK_PTS * 2), line2: new Float32Array(CRACK_PTS * 2) };
}

export function resetBossCracks(c: BossCracks): void {
  c.stage = 0;
}

/**
 * Pure: a jagged crack from the edge at local angle a across the body toward the far side, written
 * into out (CRACK_PTS x, y pairs in body radii). Deterministic in (a, seed); no PRNG.
 */
export function buildCrack(a: number, seed: number, out: Float32Array): Float32Array {
  const ang = fin(a, 0);
  const end = ang + Math.PI + (hash01(seed * 31 + 7) - 0.5) * 1.2;
  const x0 = Math.cos(ang) * CRACK_REACH;
  const y0 = Math.sin(ang) * CRACK_REACH;
  const x1 = Math.cos(end) * CRACK_REACH * 0.7;
  const y1 = Math.sin(end) * CRACK_REACH * 0.7;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let k = 0; k < CRACK_PTS; k++) {
    const u = k / (CRACK_PTS - 1);
    const edge = k === 0 || k === CRACK_PTS - 1;
    const side = k % 2 === 0 ? 1 : -1;
    const j = edge ? 0 : side * CRACK_JAG * (0.5 + hash01(seed * 13 + k));
    out[k * 2] = x0 + dx * u + nx * j;
    out[k * 2 + 1] = y0 + dy * u + ny * j;
  }
  return out;
}

/**
 * Apply 'sim:bossCrack' (stage 1 or 2) at local angle a. Stages only rise; a repeat is ignored. A
 * stage 2 that arrives first also lays the stage 1 crack. Returns true when the stage advanced.
 */
export function crackEvent(c: BossCracks, stage: number, a: number, seed: number): boolean {
  const s = stage >= 2 ? 2 : 1;
  if (s <= c.stage) return false;
  if (c.stage < 1) {
    c.angle1 = s === 1 ? a : a + Math.PI * 0.8;
    buildCrack(c.angle1, seed, c.line1);
  }
  if (s === 2) {
    c.angle2 = a;
    buildCrack(a, seed + 101, c.line2);
  }
  c.stage = s;
  return true;
}

/** Pure: the broken wedge (triangle, 3 x, y pairs in body radii) at local angle a for a stage. */
export function pieceWedge(a: number, stage: number, out: Float32Array): Float32Array {
  const k = stage >= 2 ? 1 : 0;
  const h = PIECE_HALF[k];
  const d = 1 - PIECE_DEPTH[k];
  out[0] = Math.cos(a - h);
  out[1] = Math.sin(a - h);
  out[2] = Math.cos(a + h);
  out[3] = Math.sin(a + h);
  out[4] = Math.cos(a) * d;
  out[5] = Math.sin(a) * d;
  return out;
}

/** Pure: drift distance (ease out) of a broken piece at age seconds. */
export function pieceDrift(age: number): number {
  const u = clamp01(fin(age, PIECE_LIFE) / PIECE_LIFE);
  return PIECE_DRIFT * (1 - (1 - u) * (1 - u));
}

/** Pure: alpha of a broken piece at age seconds (dissolves over PIECE_LIFE). */
export function pieceAlpha(age: number): number {
  return 1 - clamp01(fin(age, PIECE_LIFE) / PIECE_LIFE);
}

// Tier 3 halo and Twins flare

/** Slow red pulse of tier 3 bodies. */
export const TIER3_PULSE_HZ = 0.5;
/** Halo width in body radii and its base alpha. */
export const TIER3_HALO_WIDTH = 0.5;
export const TIER3_HALO_ALPHA = 0.32;

/** Pure: tier 3 pulse level 0 to 1 at timeSec; 0 for other tiers. */
export function tier3Pulse(tier: number, timeSec: number): number {
  if (tier !== 3) return 0;
  return 0.5 + 0.5 * Math.sin(fin(timeSec, 0) * TIER3_PULSE_HZ * Math.PI * 2);
}

/** Pure: tier 3 halo alpha (with the pulse) or 0 for other tiers. */
export function tier3HaloAlpha(tier: number, timeSec: number): number {
  if (tier !== 3) return 0;
  return TIER3_HALO_ALPHA * (0.7 + 0.6 * tier3Pulse(tier, timeSec));
}

/** Twins enrage flare rate, faster than the tier 3 pulse. */
export const TWINS_FLARE_HZ = 3;

/** Pure: Twins survivor flare alpha (phase 2 on), 0 before. */
export function twinsFlare(phase: number, timeSec: number): number {
  if (!(fin(phase, 1) >= 2)) return 0;
  return 0.45 + 0.4 * Math.sin(fin(timeSec, 0) * TWINS_FLARE_HZ * Math.PI * 2);
}

// Bus (coded against the event names; before Swarm's change lands the keys are not in Events and
// nothing emits them, so the handlers never run)

export const BOSS_WINDOW_EVENT = 'sim:bossWindow';
export const BOSS_CRACK_EVENT = 'sim:bossCrack';
type WindowKey = Extract<EventKey, typeof BOSS_WINDOW_EVENT>;
type CrackKey = Extract<EventKey, typeof BOSS_CRACK_EVENT>;

function field(p: unknown, k: string): unknown {
  return typeof p === 'object' && p !== null ? (p as Record<string, unknown>)[k] : undefined;
}

function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

/** Pure: the id string of a payload, or the empty string. */
export function payloadId(p: unknown): string {
  const v = field(p, 'id');
  return typeof v === 'string' ? v : '';
}

export function onBossWindow(b: Bus, h: (id: string, open: boolean, secondsLeft: number) => void): () => void {
  return b.on<WindowKey>(BOSS_WINDOW_EVENT as WindowKey, (p: unknown) =>
    h(payloadId(p), field(p, 'open') === true, num(field(p, 'secondsLeft'), Number.POSITIVE_INFINITY)),
  );
}

export function onBossCrack(b: Bus, h: (id: string, stage: number, x: number, y: number) => void): () => void {
  return b.on<CrackKey>(BOSS_CRACK_EVENT as CrackKey, (p: unknown) =>
    h(payloadId(p), num(field(p, 'stage'), 1), num(field(p, 'x'), Number.NaN), num(field(p, 'y'), Number.NaN)),
  );
}
