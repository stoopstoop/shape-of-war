// Hit feedback (run 0198, shield spark). Pure, no pixi.js import, no PRNG: jitter is hash01.
// 'fx:hit' arrives once per hit with no rate limit (core/events.ts), so this file holds the
// throttle and the lifetime maths and the renderer only mirrors the result. A hit that left a
// multi HP target alive draws one tiny additive flash (80 ms) so damage reads without a health
// bar. A hit a Bulwark shield absorbed draws a short bright arc on the shield plus 3 to 5 sparks
// from the shared particle pool. At most one flash per entity per HIT_THROTTLE_MS. Both are off
// on the low tier (effects.ts hitFxOn). Render only: the simulation never reads any of it.
import { clampNum, hash01 } from './color';
import type { TrailSpec } from './particlePool';
import { easeOut } from './pulses';
import type { PaletteKey } from './neon';
import { BULWARK_SHIELD_R, type ShapeSpec } from './shapeSpecs';

/** Per entity minimum gap between two flashes, milliseconds. */
export const HIT_THROTTLE_MS = 50;
/** Hit flash life in seconds (the brief: 80 ms). */
export const HIT_FLASH_LIFE = 0.08;
/** Deflect arc life in seconds: a short flash, a little longer than the hit flash. */
export const DEFLECT_ARC_LIFE = 0.14;
/** Slots in the hit pool. Separate from the shock ring pool so a flash never evicts a ring. */
export const HIT_FX_CAP = 24;
/** Throttle table size: one slot per entity id, matching ENTITY_CAP in game/world.ts. */
export const HIT_TABLE = 512;

// Throttle --------------------------------------------------------------------------------------

export interface HitThrottle {
  /** Last accepted flash time per entity slot, milliseconds, -Infinity until one was accepted. */
  readonly last: Float64Array;
}

export function createHitThrottle(size: number = HIT_TABLE): HitThrottle {
  return { last: new Float64Array(Math.max(1, Math.floor(size))).fill(Number.NEGATIVE_INFINITY) };
}

/** Forget every entity (level change), so the first hit on a reused id is never swallowed. */
export function resetHitThrottle(t: HitThrottle): void {
  t.last.fill(Number.NEGATIVE_INFINITY);
}

/**
 * Pure apart from the table write: whether entity id may flash at nowMs. True records nowMs and
 * counts; false leaves the table alone, so a steady stream of hits flashes every HIT_THROTTLE_MS
 * rather than starving. A clock that went backwards (nowMs below the stored time) is accepted.
 * A bad id or a NaN clock is refused. Ids beyond the table share slots (id modulo size).
 */
export function hitThrottleAllow(t: HitThrottle, id: number, nowMs: number): boolean {
  if (!Number.isFinite(nowMs) || !Number.isInteger(id) || id < 0) return false;
  const slot = id % t.last.length;
  const gap = nowMs - (t.last[slot] ?? Number.NEGATIVE_INFINITY);
  if (gap >= 0 && gap < HIT_THROTTLE_MS) return false;
  t.last[slot] = nowMs;
  return true;
}

// Hit flash -------------------------------------------------------------------------------------

/** Atlas dot: core radius in texture units (one unit is one arena unit), plus a soft halo. */
export const HIT_DOT_R = 14;
/** Atlas dot frame edge, texture units: the halo plus a clear margin. */
export const HIT_DOT_FRAME = 2 * (HIT_DOT_R + 6);
/** Flash radius in arena units at birth and at death: it pops up a little as it fades. */
export const HIT_FLASH_R0 = 6;
export const HIT_FLASH_R1 = 11;
/** Share of white mixed into the target's hue, so the flash reads as a hit not a recolour. */
export const HIT_FLASH_WHITE = 0.55;

/**
 * Pure: the palette key a hit flash takes from a shape spec. The view tint when the spec has one,
 * else the first baked layer colour that is not white (Bulwark indigo, Gravity well red), else
 * white. A plain loop, so a hit event allocates nothing.
 */
export function hitHueKey(spec: ShapeSpec): PaletteKey {
  if (spec.tint !== null) return spec.tint;
  for (let i = 0; i < spec.layers.length; i++) {
    const c = spec.layers[i]?.colour ?? null;
    if (c !== null && c !== 'white') return c;
  }
  return 'white';
}

/** Pure: hit flash radius (arena units) at life fraction u, easing out from R0 to R1. */
export function hitFlashRadius(u: number): number {
  return HIT_FLASH_R0 + (HIT_FLASH_R1 - HIT_FLASH_R0) * easeOut(u);
}

/** Pure: Particle scale for the atlas dot at life fraction u. */
export function hitFlashScale(u: number): number {
  return hitFlashRadius(u) / HIT_DOT_R;
}

// Deflect arc -----------------------------------------------------------------------------------

/** Arc half angle in radians: about 29 degrees each side, so 26 u of shield radius gives a 27 u arc. */
export const DEFLECT_ARC_HALF = 0.5;
/** Extra stroke room around the arc in the atlas, texture units (the widest glow stroke is 12). */
export const DEFLECT_ARC_PAD = 8;
/** The arc swells about its midpoint by this fraction over its life. */
export const DEFLECT_ARC_GROW = 0.3;
/** Share of white mixed into the Bulwark hue: the arc and sparks read bright in the same hue. */
export const DEFLECT_WHITE = 0.4;

/** Atlas frame for the arc, all in texture units. The anchor is the arc midpoint. */
export interface ArcFrame {
  w: number;
  h: number;
  /** Centre of the circle the arc is cut from, inside the frame. */
  cx: number;
  cy: number;
  /** Anchor (0 to 1) of the arc midpoint, which is where the sprite is placed and turned. */
  anchorX: number;
  anchorY: number;
}

/**
 * Pure: the smallest integer frame holding an arc of radius r over plus and minus half, padded.
 * The circle centre is cx, cy; the arc midpoint (r from the centre along +x) is the pivot, so
 * rotating the sprite by the outward angle keeps the arc concentric with the shield.
 */
export function arcFrame(r: number, half: number, pad: number): ArcFrame {
  const minX = r * Math.cos(half);
  const w = Math.ceil(r - minX + 2 * pad);
  const h = Math.ceil(2 * r * Math.sin(half) + 2 * pad);
  const cx = pad - minX;
  return { w, h, cx, cy: h / 2, anchorX: (cx + r) / w, anchorY: 0.5 };
}

/** Pure: arc sprite scale at life fraction u (1 at birth, 1 + GROW at death). */
export function deflectArcScale(u: number): number {
  return 1 + DEFLECT_ARC_GROW * easeOut(u);
}

/** Shield radius the arc is cut from, the exact Bulwark blocking arc radius. */
export const DEFLECT_ARC_R = BULWARK_SHIELD_R;

/** Unit direction scratch, so the renderer reuses one object. */
export interface Dir {
  x: number;
  y: number;
}

/**
 * Pure: unit vector from the shield owner (cx, cy) to the hit point (hx, hy), written into out.
 * A hit on top of the centre, or a centre that is not known (NaN), falls back to a hash01 angle
 * from seed so a spark never flies at a NaN. Returns out.
 */
export function deflectDir(hx: number, hy: number, cx: number, cy: number, seed: number, out: Dir): Dir {
  const dx = hx - cx;
  const dy = hy - cy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (Number.isFinite(len) && len > 1e-3) {
    out.x = dx / len;
    out.y = dy / len;
    return out;
  }
  const a = hash01(seed) * Math.PI * 2;
  out.x = Math.cos(a);
  out.y = Math.sin(a);
  return out;
}

// Sparks ----------------------------------------------------------------------------------------

export const DEFLECT_SPARK_MIN = 3;
export const DEFLECT_SPARK_MAX = 5;
/** Total fan angle of the sparks about the outward direction, radians (about 109 degrees). */
const SPARK_FAN = 1.9;
/** Random nudge on each spark's angle, radians, total width. */
const SPARK_NUDGE = 0.25;
const SPARK_SPEED_MIN = 170;
const SPARK_SPEED_MAX = 400;
const SPARK_LIFE_MIN = 0.16;
const SPARK_LIFE_MAX = 0.28;
const SPARK_DRAG = 5;

/** Pure: spark count for one deflect, DEFLECT_SPARK_MIN to DEFLECT_SPARK_MAX, from a sequence number. */
export function deflectSparkCount(seq: number): number {
  const span = DEFLECT_SPARK_MAX - DEFLECT_SPARK_MIN + 1;
  const k = Math.floor(clampNum(hash01(seq * 5 + 4), 0, 0.999999) * span);
  return DEFLECT_SPARK_MIN + clampNum(k, 0, span - 1);
}

/**
 * Fill out with spark k of n from (x, y), fanned about the outward direction (nx, ny) and thrown
 * away from the shield. Jitter is hash01(seq), never a PRNG. Writes every field, allocates nothing.
 */
export function deflectSparkParticle(
  out: TrailSpec,
  x: number,
  y: number,
  nx: number,
  ny: number,
  k: number,
  n: number,
  seq: number,
  colour: number,
): void {
  const f = n > 1 ? k / (n - 1) - 0.5 : 0;
  const ang = Math.atan2(ny, nx) + f * SPARK_FAN + (hash01(seq * 3 + 1) - 0.5) * SPARK_NUDGE;
  const speed = SPARK_SPEED_MIN + (SPARK_SPEED_MAX - SPARK_SPEED_MIN) * hash01(seq * 3 + 2);
  out.x = x;
  out.y = y;
  out.vx = Math.cos(ang) * speed;
  out.vy = Math.sin(ang) * speed;
  out.life = SPARK_LIFE_MIN + (SPARK_LIFE_MAX - SPARK_LIFE_MIN) * hash01(seq * 3 + 3);
  out.drag = SPARK_DRAG;
  out.colour = colour;
  out.size = 1;
}
