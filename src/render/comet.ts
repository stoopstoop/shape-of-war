// Ship comet trail (v2 SPEC addendum 3.8, run 0180 trails fix). Pure, no pixi.js import.
// The ship's drawn position is sampled at a fixed COMET_HZ into a ring buffer, so the trail
// covers the same span of time at 60 and 120 fps. The renderer draws the newest samples as one
// tapered ribbon (a triangle strip of 2 vertices per sample in one small batched mesh): wide and
// hot at the ship, thin and faded at the tail. Under space physics drift the ship keeps moving
// with no input, so the ribbon keeps trailing its path like a comet. The UVs and indices never
// change; only the vertex positions are rewritten each frame. Nothing here allocates per frame.

/** History samples drawn behind the ship. COMET_SAMPLES / COMET_HZ is the tail length in s. */
export const COMET_SAMPLES = 26;
/** Fixed sampling rate of the ship position, Hz. */
export const COMET_HZ = 60;
/** Ribbon half width at the ship, arena units. */
export const COMET_HALF_W = 7;
/** Taper exponent: half width falls as (1 - u) ^ COMET_TAPER_POW from head (u 0) to tail (u 1). */
export const COMET_TAPER_POW = 1.25;
/** Below this ship speed the comet is invisible, at COMET_SPEED_FULL and above it is full. */
export const COMET_SPEED_MIN = 40;
export const COMET_SPEED_FULL = 220;
/** Points on the ribbon: the live head plus every sample. */
export const COMET_POINTS = COMET_SAMPLES + 1;
/** Vertices in the ribbon (two per point). */
export const COMET_VERTS = COMET_POINTS * 2;

export interface Comet {
  readonly x: Float32Array;
  readonly y: Float32Array;
  /** Index of the newest sample in the ring. */
  head: number;
  /** Seconds since the newest sample. */
  acc: number;
  /** False until the first push after a reset; the first push fills the ring with that point. */
  primed: boolean;
  /** Last good normal, used where the path has zero length (ship at rest). */
  nx: number;
  ny: number;
}

export function createComet(): Comet {
  return {
    x: new Float32Array(COMET_SAMPLES),
    y: new Float32Array(COMET_SAMPLES),
    head: 0,
    acc: 0,
    primed: false,
    nx: 0,
    ny: 1,
  };
}

/** Forget the history (ship died, level change). The next push starts a fresh, zero length tail. */
export function resetComet(c: Comet): void {
  c.primed = false;
  c.acc = 0;
}

/**
 * Advance the history by dt seconds with the ship drawn at (x, y). Samples due inside this frame
 * are spread on the straight line from the newest sample to (x, y), so a long frame never leaves
 * a kink. At most COMET_SAMPLES samples are written per call.
 */
export function pushComet(c: Comet, x: number, y: number, dt: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (!c.primed) {
    c.x.fill(x);
    c.y.fill(y);
    c.head = 0;
    c.acc = 0;
    c.primed = true;
    return;
  }
  const d = dt > 0 && Number.isFinite(dt) ? dt : 0;
  const step = 1 / COMET_HZ;
  c.acc += d;
  let due = Math.floor(c.acc / step + 1e-9);
  if (due <= 0) return;
  c.acc -= due * step;
  if (due > COMET_SAMPLES) due = COMET_SAMPLES;
  const x0 = c.x[c.head] ?? x;
  const y0 = c.y[c.head] ?? y;
  for (let k = 1; k <= due; k++) {
    const t = k / due;
    c.head = (c.head + 1) % COMET_SAMPLES;
    c.x[c.head] = x0 + (x - x0) * t;
    c.y[c.head] = y0 + (y - y0) * t;
  }
}

/** Pure: half width factor at u along the ribbon, 1 at the head (u 0), 0 at the tail (u 1). */
export function cometTaper(u: number): number {
  if (!(u > 0)) return 1;
  if (u >= 1) return 0;
  return Math.pow(1 - u, COMET_TAPER_POW);
}

/** Pure: ribbon alpha factor for a ship speed in u/s, smoothstep from 40 to 220 u/s. */
export function cometAlpha(speed: number): number {
  if (!(speed > COMET_SPEED_MIN)) return 0;
  if (speed >= COMET_SPEED_FULL) return 1;
  const t = (speed - COMET_SPEED_MIN) / (COMET_SPEED_FULL - COMET_SPEED_MIN);
  return t * t * (3 - 2 * t);
}

/** Point k on the ribbon: 0 is the live head (hx, hy), k >= 1 the samples newest first. */
function px(c: Comet, k: number, hx: number): number {
  if (k <= 0) return hx;
  return c.x[(c.head - (k - 1) + COMET_SAMPLES * 2) % COMET_SAMPLES] ?? hx;
}

function py(c: Comet, k: number, hy: number): number {
  if (k <= 0) return hy;
  return c.y[(c.head - (k - 1) + COMET_SAMPLES * 2) % COMET_SAMPLES] ?? hy;
}

/**
 * Write the ribbon vertices into out (COMET_VERTS x, y pairs) with the head at (hx, hy). Point k
 * gives vertex 2k on the left and 2k + 1 on the right of the path, half width COMET_HALF_W times
 * cometTaper(k / (COMET_POINTS - 1)) times widthMul (Turbo widens it). Returns the path length.
 */
export function writeCometStrip(c: Comet, hx: number, hy: number, out: Float32Array, widthMul = 1): number {
  const wm = Number.isFinite(widthMul) && widthMul > 0 ? widthMul : 1;
  const last = COMET_POINTS - 1;
  let length = 0;
  let nx = c.nx;
  let ny = c.ny;
  for (let k = 0; k <= last; k++) {
    const x = px(c, k, hx);
    const y = py(c, k, hy);
    // Central difference along the path (one sided at the ends).
    const ax = px(c, k > 0 ? k - 1 : 0, hx);
    const ay = py(c, k > 0 ? k - 1 : 0, hy);
    const bx = px(c, k < last ? k + 1 : last, hx);
    const by = py(c, k < last ? k + 1 : last, hy);
    const tx = ax - bx;
    const ty = ay - by;
    const tl = Math.sqrt(tx * tx + ty * ty);
    if (tl > 1e-3) {
      nx = -ty / tl;
      ny = tx / tl;
    }
    if (k === 0) {
      c.nx = nx;
      c.ny = ny;
    }
    if (k > 0) {
      const dx = x - px(c, k - 1, hx);
      const dy = y - py(c, k - 1, hy);
      length += Math.sqrt(dx * dx + dy * dy);
    }
    const w = COMET_HALF_W * wm * cometTaper(k / last);
    out[4 * k] = x + nx * w;
    out[4 * k + 1] = y + ny * w;
    out[4 * k + 2] = x - nx * w;
    out[4 * k + 3] = y - ny * w;
  }
  return length;
}

/** Pure: static UVs, u along the ribbon (0 head, 1 tail), v across it (0 left, 1 right). */
export function cometUvs(): Float32Array {
  const out = new Float32Array(COMET_VERTS * 2);
  const last = COMET_POINTS - 1;
  for (let k = 0; k <= last; k++) {
    const u = k / last;
    out[4 * k] = u;
    out[4 * k + 1] = 0;
    out[4 * k + 2] = u;
    out[4 * k + 3] = 1;
  }
  return out;
}

/** Pure: static triangle list indices, two triangles per ribbon segment. */
export function cometIndices(): Uint32Array {
  const out = new Uint32Array((COMET_POINTS - 1) * 6);
  for (let k = 0; k < COMET_POINTS - 1; k++) {
    const a = 2 * k;
    out.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], k * 6);
  }
  return out;
}
