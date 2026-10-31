// Supernova well (v31). On 'sim:wellNova' a gravity well erupts: a swirling two arm spiral in white
// hot pink with shimmering points orbiting inward, a wider faint pull ring, and a slow stream of
// shimmering particles that drift outward and fade in 2 s (harmless, from the shared particle pool).
// Pure maths and small fixed state only; the renderer owns the Graphics and the pool.
import type { Bus, EventKey } from '../core/events';
import { hash01 } from './color';
import type { TrailSpec } from './particlePool';

function fin(v: number, d: number): number {
  return Number.isFinite(v) ? v : d;
}

/** Live novas at once (wells on screen are capped at 3; one spare). */
export const NOVA_SLOTS = 4;
/** Spiral arms, points per arm, the arm twist (radians from core to tip) and spin (rad/s). */
export const NOVA_ARMS = 2;
export const NOVA_ARM_PTS = 20;
export const NOVA_TWIST = 3.4;
export const NOVA_SPIN = 2.2;
/** Spiral reach as a multiple of the well's drawn radius. */
export const NOVA_REACH = 2.1;
/** Shimmer points orbiting inward per nova and the seconds one takes from rim to core. */
export const NOVA_ORBITERS = 12;
export const NOVA_INFALL_SEC = 1.6;
/** Outward drift stream: particles per second per nova, their life and speed range (u/s). */
export const NOVA_EMIT_RATE = 14;
export const NOVA_DRIFT_LIFE = 2;
export const NOVA_DRIFT_SPEED: readonly [number, number] = [16, 30];
/** Steady state stream particles per nova (rate x life) must stay at or under this. */
export const NOVA_PARTICLE_BUDGET = 32;
/** Eruption flare: the spiral grows in over this many seconds. */
export const NOVA_GROW_SEC = 0.35;

export interface NovaState {
  /** Seconds since the eruption, or Infinity for a free slot. */
  readonly age: Float64Array;
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Entity index of the well once matched, -1 before. */
  readonly idx: Int32Array;
  /** Numeric id from the payload, or -1 when the id was not a number. */
  readonly wantId: Int32Array;
  /** 1 when the slot's well was drawn this frame. */
  readonly seen: Uint8Array;
  /** Emitter accumulators for the outward stream. */
  readonly acc: Float64Array;
}

export function createNovaState(): NovaState {
  return {
    age: new Float64Array(NOVA_SLOTS).fill(Number.POSITIVE_INFINITY),
    x: new Float64Array(NOVA_SLOTS),
    y: new Float64Array(NOVA_SLOTS),
    idx: new Int32Array(NOVA_SLOTS).fill(-1),
    wantId: new Int32Array(NOVA_SLOTS).fill(-1),
    seen: new Uint8Array(NOVA_SLOTS),
    acc: new Float64Array(NOVA_SLOTS),
  };
}

export function resetNovaState(s: NovaState): void {
  s.age.fill(Number.POSITIVE_INFINITY);
  s.idx.fill(-1);
  s.wantId.fill(-1);
  s.seen.fill(0);
  s.acc.fill(0);
}

/** Record an eruption. Reuses the oldest slot when all are live. Returns the slot. */
export function novaEvent(s: NovaState, id: number, x: number, y: number): number {
  let k = 0;
  for (let j = 0; j < NOVA_SLOTS; j++) {
    if (!Number.isFinite(s.age[j] ?? 0)) {
      k = j;
      break;
    }
    if ((s.age[j] ?? 0) > (s.age[k] ?? 0)) k = j;
  }
  s.age[k] = 0;
  s.x[k] = fin(x, 0);
  s.y[k] = fin(y, 0);
  s.idx[k] = -1;
  s.wantId[k] = Number.isInteger(id) && id >= 0 ? id : -1;
  s.seen[k] = 0;
  s.acc[k] = 0;
  return k;
}

/**
 * The slot of well entity i at (x, y) with radius r this frame, or -1. Matches a pending slot by
 * numeric id, else by position (within the radius plus 12 u), then marks it seen.
 */
export function novaSlotFor(s: NovaState, i: number, x: number, y: number, r: number): number {
  for (let k = 0; k < NOVA_SLOTS; k++) {
    if (!Number.isFinite(s.age[k] ?? Infinity)) continue;
    if (s.idx[k] === i) {
      s.seen[k] = 1;
      s.x[k] = x;
      s.y[k] = y;
      return k;
    }
  }
  for (let k = 0; k < NOVA_SLOTS; k++) {
    if (!Number.isFinite(s.age[k] ?? Infinity) || (s.idx[k] ?? -1) >= 0) continue;
    const want = s.wantId[k] ?? -1;
    const dx = x - (s.x[k] ?? 0);
    const dy = y - (s.y[k] ?? 0);
    const near = dx * dx + dy * dy <= (r + 12) * (r + 12);
    if (want === i || near) {
      s.idx[k] = i;
      s.seen[k] = 1;
      s.x[k] = x;
      s.y[k] = y;
      return k;
    }
  }
  return -1;
}

/** End of frame: age live slots, free any matched slot whose well was not drawn (it popped). */
export function stepNovaState(s: NovaState, dt: number): void {
  const d = fin(dt, 0);
  for (let k = 0; k < NOVA_SLOTS; k++) {
    const a = s.age[k] ?? Infinity;
    if (!Number.isFinite(a)) continue;
    // A pending slot waits up to 1 s for its well to show; a matched one dies with its well.
    if (((s.idx[k] ?? -1) >= 0 && s.seen[k] === 0) || ((s.idx[k] ?? -1) < 0 && a > 1)) {
      s.age[k] = Number.POSITIVE_INFINITY;
      s.idx[k] = -1;
      continue;
    }
    s.age[k] = a + d;
    s.seen[k] = 0;
  }
}

/** Pure: true while any slot is live. */
export function novaAny(s: NovaState): boolean {
  for (let k = 0; k < NOVA_SLOTS; k++) if (Number.isFinite(s.age[k] ?? Infinity)) return true;
  return false;
}

/** Pure: eruption growth 0 to 1 at age seconds (overshoots a touch, then settles at 1). */
export function novaGrow(age: number): number {
  const u = Math.max(0, Math.min(1, fin(age, NOVA_GROW_SEC) / NOVA_GROW_SEC));
  return u * (1 + 0.25 * Math.sin(u * Math.PI));
}

/**
 * Pure: one spiral arm around the origin written into out (NOVA_ARM_PTS x, y pairs, arena units).
 * Radius grows from the core to reach along the arm; the angle winds by NOVA_TWIST and the whole
 * spiral turns at NOVA_SPIN. Arms are spaced evenly. Writes in place; allocates nothing.
 */
export function novaSpiral(timeSec: number, arm: number, reach: number, out: Float32Array): Float32Array {
  const spin = fin(timeSec, 0) * NOVA_SPIN + (arm * Math.PI * 2) / NOVA_ARMS;
  const R = Math.max(0, fin(reach, 0));
  for (let k = 0; k < NOVA_ARM_PTS; k++) {
    const u = k / (NOVA_ARM_PTS - 1);
    const r = R * (0.12 + 0.88 * u);
    const a = spin + u * NOVA_TWIST;
    out[k * 2] = Math.cos(a) * r;
    out[k * 2 + 1] = Math.sin(a) * r;
  }
  return out;
}

export interface Orbiter {
  x: number;
  y: number;
  /** Shimmer alpha 0.25 to 1. */
  a: number;
  /** Radius share 0 (core) to 1 (rim). */
  u: number;
}

/**
 * Pure: shimmer point k of NOVA_ORBITERS spiralling inward around the origin at timeSec, within
 * reach. Each point falls from the rim to the core over NOVA_INFALL_SEC, turning faster as it nears
 * the centre, and twinkles.
 */
export function novaOrbiter(timeSec: number, k: number, reach: number, out: Orbiter): Orbiter {
  const t = fin(timeSec, 0);
  const ph = t / NOVA_INFALL_SEC + k / NOVA_ORBITERS;
  const u = 1 - (ph - Math.floor(ph));
  const r = Math.max(0, fin(reach, 0)) * (0.1 + 0.9 * u);
  const a = k * 2.39996 + t * NOVA_SPIN + (1 - u) * NOVA_TWIST * 1.3;
  out.x = Math.cos(a) * r;
  out.y = Math.sin(a) * r;
  out.u = u;
  out.a = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 17 + k * 2.1));
  return out;
}

/** Pure: steady state live stream particles of one nova (rate x life). */
export function novaSteadyParticles(rate: number = NOVA_EMIT_RATE, life: number = NOVA_DRIFT_LIFE): number {
  return Math.ceil(Math.max(0, rate) * Math.max(0, life));
}

/**
 * Fill out with one outward drifting shimmer particle from a nova at (x, y) whose core radius is
 * r: it starts on the core edge, floats slowly outward with almost no drag and fades over 2 s.
 * Alternates hot pink and white by sequence. No damage: it is a render particle only.
 */
export function novaDriftParticle(out: TrailSpec, x: number, y: number, r: number, seq: number, pink: number, white: number): void {
  const a = hash01(seq * 5 + 1) * Math.PI * 2;
  const r0 = Math.max(0, r) * (0.4 + 0.5 * hash01(seq * 5 + 2));
  const sp = NOVA_DRIFT_SPEED[0] + (NOVA_DRIFT_SPEED[1] - NOVA_DRIFT_SPEED[0]) * hash01(seq * 5 + 3);
  // A slight swirl: the velocity leans off radial so the stream curls with the spiral.
  const va = a + 0.5;
  out.x = x + Math.cos(a) * r0;
  out.y = y + Math.sin(a) * r0;
  out.vx = Math.cos(va) * sp;
  out.vy = Math.sin(va) * sp;
  out.life = NOVA_DRIFT_LIFE * (0.85 + 0.15 * hash01(seq * 5 + 4));
  out.drag = 0.15;
  out.colour = (seq & 1) === 0 ? pink : white;
  out.size = 0.8;
}

// Bus (coded against the event name; until Swarm's change lands the key is not in Events and
// nothing emits it, so the handler never runs)

export const WELL_NOVA_EVENT = 'sim:wellNova';
type NovaKey = Extract<EventKey, typeof WELL_NOVA_EVENT>;

function field(p: unknown, k: string): unknown {
  return typeof p === 'object' && p !== null ? (p as Record<string, unknown>)[k] : undefined;
}

function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

export function onWellNova(b: Bus, h: (id: number, x: number, y: number) => void): () => void {
  return b.on<NovaKey>(WELL_NOVA_EVENT as NovaKey, (p: unknown) => h(num(field(p, 'id'), -1), num(field(p, 'x'), Number.NaN), num(field(p, 'y'), Number.NaN)));
}
