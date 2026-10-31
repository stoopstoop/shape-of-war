// G3C boss identity (run 0288): the Prism window state machine driven by 'sim:bossWindow', the
// per boss hit flash throttle, crack and break off geometry for 'sim:bossCrack', the identity
// table (silhouette and colour family per boss), the tier 3 halo and the Twins enrage flare.
// Pure functions and small state records only; the renderer owns the Graphics.
import type { Bus, EventKey } from '../core/events';
import { BOSS_IDS } from '../levelgen/leveldef';
import { hash01 } from './color';
import { BOSS_BROOD, BOSS_COUNT, BOSS_WARDEN, bossColourOf, bossIndex } from './bossLook';
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

// Two tone (v31): every boss but the Prism carries an accent on parts, cores or arms. The body and
// attack hazards keep the primary. Accents are palette colours pushed toward white or black, so they
// follow applyNeon like everything else.

export type AccentPart =
  | 'core'
  | 'sparks'
  | 'axis'
  | 'tips'
  | 'rim'
  | 'pods'
  | 'split'
  | 'centre'
  | 'turrets'
  | 'tail'
  | 'coreA'
  | 'coreB';

export interface AccentTone {
  readonly key: PaletteKey;
  /** Share mixed toward white, then toward black (0 to 1). */
  readonly white: number;
  readonly black: number;
}

export interface AccentEntry {
  readonly part: AccentPart;
  readonly tone: AccentTone;
}

const tone = (key: PaletteKey, white = 0, black = 0): AccentTone => ({ key, white, black });
const DEEP_RED = tone('bossRed', 0, 0.42);
const SILVER = tone('bossBlue', 0.72);
const GREY = tone('white', 0, 0.42);
const GOLD = tone('bossYellow', 0.08);
const PALE = tone('white');
const VOID = tone('bossViolet', 0, 0.88);

/** Accent parts per boss index, in BOSS_IDS order. The Prism keeps its cycling gem (no accent). */
export const BOSS_TWO_TONE: readonly (readonly AccentEntry[])[] = [
  /* Warden */ [{ part: 'rim', tone: SILVER }],
  /* Brood */ [{ part: 'pods', tone: tone('yellow') }],
  /* Spindle */ [
    { part: 'axis', tone: tone('cyan') },
    { part: 'tips', tone: PALE },
  ],
  /* Ember */ [
    { part: 'core', tone: DEEP_RED },
    { part: 'sparks', tone: tone('bossYellow', 0.25) },
  ],
  /* Mirage */ [{ part: 'split', tone: PALE }],
  /* Gravitas */ [
    { part: 'centre', tone: VOID },
    { part: 'rim', tone: PALE },
  ],
  /* Bastion */ [{ part: 'turrets', tone: GREY }],
  /* Tempest */ [{ part: 'tail', tone: tone('cyan') }],
  /* Twins */ [
    { part: 'coreA', tone: GOLD },
    { part: 'coreB', tone: SILVER },
  ],
  /* Prism */ [],
];

/** Pure: the accent tone of a boss part, or null when that boss has none there. */
export function bossAccent(b: number, part: AccentPart): AccentTone | null {
  const row = BOSS_TWO_TONE[bossIndex(b)] ?? [];
  for (const e of row) if (e.part === part) return e.tone;
  return null;
}

function mixInt(a: number, b: number, t: number): number {
  const u = clamp01(t);
  const r = Math.round(((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * u));
  const g = Math.round(((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * u));
  const bl = Math.round((a & 255) + (((b & 255) - (a & 255)) * u));
  return (r << 16) | (g << 8) | bl;
}

/** Pure: the RGB of an accent tone under a palette (the live palette after applyNeon). */
export function accentRgb(t: AccentTone, pal: Readonly<Record<PaletteKey, number>>): number {
  return mixInt(mixInt(pal[t.key], 0xffffff, t.white), 0x000000, t.black);
}

/** Pure: tint of a boss part entity (pods, turrets): the accent where there is one, else primary. */
export function bossPartTint(b: number, primary: number, pal: Readonly<Record<PaletteKey, number>>): number {
  const i = bossIndex(b);
  const t = bossAccent(i, i === BOSS_BROOD ? 'pods' : 'turrets');
  return t === null ? primary : accentRgb(t, pal);
}

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

// Cracks (v31): battle damage in the boss's own palette. The outline loses short segments at the
// crack points (dark gaps whose edges flicker dimmer), a fracture network in the boss hue at 40
// percent brightness grows from the hit side, outline fragments tumble away, and after stage 2 the
// body pulses unevenly. Nothing here is white.

/** Segments per fracture network (one trunk plus branches) and floats per segment. */
export const FRACTURE_SEGS = 12;
export const SEG_FLOATS = 6;
/** Trunk segments and how far the trunk reaches in (body radii) per stage. */
export const TRUNK_SEGS = 5;
export const FRACTURE_REACH: readonly [number, number] = [0.55, 0.8];
/** The network grows over this many seconds from the hit side. */
export const FRACTURE_GROW_SEC = 0.6;
/** Fracture colour: the boss hue at this brightness. */
export const FRACTURE_DIM = 0.4;
/** Outline gaps per stage and their half width range (radians). */
export const GAPS_PER_STAGE = 3;
export const GAP_HALF: readonly [number, number] = [0.05, 0.09];
/** Flicker of the outline beside a gap: the edge dims down to this share. */
export const EDGE_FLICKER_MIN = 0.45;
/** Outline fragments per stage, points per fragment, drift (u), life (s) and spin (rad/s). */
export const FRAGS_PER_STAGE = 3;
export const FRAG_PTS = 4;
export const PIECE_DRIFT = 46;
export const PIECE_LIFE = 1.2;
export const PIECE_SPIN = 2.6;

export interface BossCracks {
  stage: number;
  /** Local break angles (radians, body frame) of stage 1 and 2. */
  angle1: number;
  angle2: number;
  /** Seconds since each stage landed (drives the growth). */
  age1: number;
  age2: number;
  /** Fracture networks: FRACTURE_SEGS x (x0, y0, x1, y1, o0, o1) in body radii; o is growth order. */
  frac1: Float32Array;
  frac2: Float32Array;
  /** Outline gaps: (angle, half width) pairs, GAPS_PER_STAGE per stage, stage 1 first. */
  gaps: Float32Array;
}

export function createBossCracks(): BossCracks {
  return {
    stage: 0,
    angle1: 0,
    angle2: 0,
    age1: 0,
    age2: 0,
    frac1: new Float32Array(FRACTURE_SEGS * SEG_FLOATS),
    frac2: new Float32Array(FRACTURE_SEGS * SEG_FLOATS),
    gaps: new Float32Array(GAPS_PER_STAGE * 2 * 2),
  };
}

export function resetBossCracks(c: BossCracks): void {
  c.stage = 0;
  c.age1 = 0;
  c.age2 = 0;
}

/** Pure: distance from the centre to the outline of p along local angle theta (arena units). */
export function outlineRadius(p: ShapePrim, theta: number): number {
  const th = fin(theta, 0);
  if (p.t === 'circle') return p.r;
  if (p.t === 'regularPoly') {
    const n = Math.max(3, p.sides);
    const seg = (Math.PI * 2) / n;
    // Vertices sit at rot - PI / 2 + k * seg (PixiJS regularPoly starts at the top).
    let d = (th - p.rot + Math.PI / 2) % seg;
    if (d < 0) d += seg;
    return (p.r * Math.cos(Math.PI / n)) / Math.cos(d - seg / 2);
  }
  if (p.t === 'rect') {
    const c = Math.abs(Math.cos(th));
    const s = Math.abs(Math.sin(th));
    const a = c > 1e-6 ? p.w / 2 / c : Number.POSITIVE_INFINITY;
    const b = s > 1e-6 ? p.h / 2 / s : Number.POSITIVE_INFINITY;
    return Math.min(a, b);
  }
  // Polygon or line: the farthest crossing of the ray with an edge.
  const pts = p.pts;
  const n = pts.length >> 1;
  const dx = Math.cos(th);
  const dy = Math.sin(th);
  let best = 0;
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    const ax = pts[k * 2] ?? 0;
    const ay = pts[k * 2 + 1] ?? 0;
    const ex = (pts[j * 2] ?? 0) - ax;
    const ey = (pts[j * 2 + 1] ?? 0) - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (ax * ey - ay * ex) / den;
    const u = (ax * dy - ay * dx) / den;
    if (t > best && u >= 0 && u <= 1) best = t;
  }
  return best;
}

function writeSeg(out: Float32Array, k: number, x0: number, y0: number, x1: number, y1: number, o0: number, o1: number): void {
  const b = k * SEG_FLOATS;
  out[b] = x0;
  out[b + 1] = y0;
  out[b + 2] = x1;
  out[b + 3] = y1;
  out[b + 4] = o0;
  out[b + 5] = o1;
}

/**
 * Pure: a fracture network from the edge at local angle a growing inward, written into out
 * (FRACTURE_SEGS segments, body radii). A gently wandering trunk of TRUNK_SEGS segments, then short
 * branches forking off its joints at shallow angles. Growth order runs 0 at the edge to 1 at the
 * farthest tip. Deterministic in (a, seed, stage); no PRNG.
 */
export function buildFracture(a: number, seed: number, stage: number, out: Float32Array): Float32Array {
  const ang = fin(a, 0);
  const reach = FRACTURE_REACH[stage >= 2 ? 1 : 0];
  const step = reach / TRUNK_SEGS;
  const tipO = 0.7;
  let x = Math.cos(ang) * 0.96;
  let y = Math.sin(ang) * 0.96;
  let dir = ang + Math.PI + (hash01(seed * 7 + 1) - 0.5) * 0.5;
  for (let k = 0; k < TRUNK_SEGS; k++) {
    dir += (hash01(seed * 11 + k) - 0.5) * 0.42;
    const nx = x + Math.cos(dir) * step;
    const ny = y + Math.sin(dir) * step;
    writeSeg(out, k, x, y, nx, ny, (k / TRUNK_SEGS) * tipO, ((k + 1) / TRUNK_SEGS) * tipO);
    x = nx;
    y = ny;
  }
  // Branches fork from trunk joints, alternating sides, shorter further in.
  for (let k = TRUNK_SEGS; k < FRACTURE_SEGS; k++) {
    const j = 1 + ((k - TRUNK_SEGS) % (TRUNK_SEGS - 1));
    const base = (j - 1) * SEG_FLOATS;
    const bx = out[base + 2] ?? 0;
    const by = out[base + 3] ?? 0;
    const tdx = bx - (out[base] ?? 0);
    const tdy = by - (out[base + 1] ?? 0);
    const side = (k & 1) === 0 ? 1 : -1;
    const d = Math.atan2(tdy, tdx) + side * (0.45 + hash01(seed * 17 + k) * 0.5);
    const len = step * (0.6 + hash01(seed * 19 + k) * 0.6) * (1 - j / (TRUNK_SEGS + 2));
    const o0 = (j / TRUNK_SEGS) * tipO;
    writeSeg(out, k, bx, by, bx + Math.cos(d) * len, by + Math.sin(d) * len, o0, Math.min(1, o0 + 0.3));
  }
  return out;
}

/** Pure: growth level 0 to 1 of a fracture network at age seconds (eased). */
export function fractureGrow(age: number): number {
  return smooth(fin(age, FRACTURE_GROW_SEC) / FRACTURE_GROW_SEC);
}

/** Pure: drawn share 0 to 1 of a segment with growth order o0..o1 at growth level g. */
export function segmentPortion(g: number, o0: number, o1: number): number {
  if (g <= o0) return 0;
  if (g >= o1 || o1 <= o0) return 1;
  return (g - o0) / (o1 - o0);
}

/** Pure: lay GAPS_PER_STAGE outline gaps around local angle a into out at the stage's slot. */
export function buildGaps(a: number, seed: number, stage: number, out: Float32Array): Float32Array {
  const base = (stage >= 2 ? 1 : 0) * GAPS_PER_STAGE * 2;
  for (let k = 0; k < GAPS_PER_STAGE; k++) {
    const off = k === 0 ? 0 : (k % 2 === 0 ? 1 : -1) * (0.25 + hash01(seed * 23 + k) * 0.35);
    out[base + k * 2] = fin(a, 0) + off;
    out[base + k * 2 + 1] = GAP_HALF[0] + (GAP_HALF[1] - GAP_HALF[0]) * hash01(seed * 29 + k);
  }
  return out;
}

/** Pure: brightness share of the outline beside gap k at timeSec (an uneven flicker, never 0). */
export function edgeFlicker(timeSec: number, k: number): number {
  const t = fin(timeSec, 0);
  const w = Math.sin(t * 13.7 + k * 2.3) * 0.6 + Math.sin(t * 5.1 + k * 0.9) * 0.4;
  return EDGE_FLICKER_MIN + (1 - EDGE_FLICKER_MIN) * (0.5 + 0.5 * w);
}

/**
 * Apply 'sim:bossCrack' (stage 1 or 2) at local angle a. Stages only rise; a repeat is ignored. A
 * stage 2 that arrives first also lays the stage 1 damage (already grown). Returns true when the
 * stage advanced.
 */
export function crackEvent(c: BossCracks, stage: number, a: number, seed: number): boolean {
  const s = stage >= 2 ? 2 : 1;
  if (s <= c.stage) return false;
  if (c.stage < 1) {
    c.angle1 = s === 1 ? a : a + Math.PI * 0.8;
    c.age1 = s === 1 ? 0 : FRACTURE_GROW_SEC;
    buildFracture(c.angle1, seed, 1, c.frac1);
    buildGaps(c.angle1, seed, 1, c.gaps);
  }
  if (s === 2) {
    c.angle2 = a;
    c.age2 = 0;
    buildFracture(a, seed + 101, 2, c.frac2);
    buildGaps(a, seed + 101, 2, c.gaps);
  }
  c.stage = s;
  return true;
}

/** Advance the growth clocks on the draw clock. */
export function stepBossCracks(c: BossCracks, dt: number): void {
  const d = fin(dt, 0);
  if (c.stage >= 1 && c.age1 < FRACTURE_GROW_SEC) c.age1 += d;
  if (c.stage >= 2 && c.age2 < FRACTURE_GROW_SEC) c.age2 += d;
}

/**
 * Pure: an outline fragment of p (arena units) centred on local angle theta with half span half,
 * written into out as FRAG_PTS (x, y) pairs relative to the fragment's own centre. The centre (body
 * frame, arena units) goes into centre.
 */
export function fragmentPts(p: ShapePrim, theta: number, half: number, out: Float32Array, centre: Float32Array): Float32Array {
  let cx = 0;
  let cy = 0;
  for (let k = 0; k < FRAG_PTS; k++) {
    const t = theta - half + (2 * half * k) / (FRAG_PTS - 1);
    const r = outlineRadius(p, t);
    const x = Math.cos(t) * r;
    const y = Math.sin(t) * r;
    out[k * 2] = x;
    out[k * 2 + 1] = y;
    cx += x;
    cy += y;
  }
  cx /= FRAG_PTS;
  cy /= FRAG_PTS;
  for (let k = 0; k < FRAG_PTS; k++) {
    out[k * 2] = (out[k * 2] ?? 0) - cx;
    out[k * 2 + 1] = (out[k * 2 + 1] ?? 0) - cy;
  }
  centre[0] = cx;
  centre[1] = cy;
  return out;
}

/** Pure: drift distance (ease out) of a fragment at age seconds. */
export function pieceDrift(age: number): number {
  const u = clamp01(fin(age, PIECE_LIFE) / PIECE_LIFE);
  return PIECE_DRIFT * (1 - (1 - u) * (1 - u));
}

/** Pure: alpha of a fragment at age seconds (fades out over PIECE_LIFE). */
export function pieceAlpha(age: number): number {
  const u = clamp01(fin(age, PIECE_LIFE) / PIECE_LIFE);
  return (1 - u) * Math.sqrt(1 - u);
}

/** Pure: tumble angle of a fragment at age seconds; dir is +1 or -1. It slows as it drifts. */
export function pieceSpin(age: number, dir: number): number {
  const a = clamp01(fin(age, PIECE_LIFE) / PIECE_LIFE) * PIECE_LIFE;
  return (dir < 0 ? -1 : 1) * PIECE_SPIN * (a - (a * a) / (PIECE_LIFE * 3));
}

/** Pure: uneven body pulse 0..1 after stage 2 (two beats out of step, sharpened); 0 before. */
export function unevenPulse(stage: number, timeSec: number): number {
  if (stage < 2) return 0;
  const t = fin(timeSec, 0);
  const a = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.3);
  const b = 0.6 + 0.4 * Math.sin(t * Math.PI * 2 * 0.37 + 1.1);
  const v = clamp01(a * b);
  return v * v;
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
