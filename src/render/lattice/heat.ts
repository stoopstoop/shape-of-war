// Lattice colour pulse (run 0180 map effects fix). Pure, no pixi.js import, no PRNG.
// A heat field over the lattice nodes, one value per colour channel in [0, 1]. A pulse is an
// expanding ring: as its front crosses a node the node's heat jumps to the pulse colour (max
// blend, so many kills never saturate to white and the result does not depend on the frame
// rate), then fades with HEAT_DECAY_SEC behind the front. The renderer draws the lattice lines a
// second time in the bloom layer with these colours as vertex colours, additive, so a kill sends
// a ring of its hue through the grid. The base lattice and its applyNeon gridAlpha are untouched:
// this is a multiplier on its own layer. Arrays are allocated once in createHeat.
import type { LatticeLayout } from './layout';

export const HEAT_MAX_PULSES = 12;
/** e-fold time of the glow left behind a front, seconds. */
export const HEAT_DECAY_SEC = 0.2;
/** Below this on every channel and with no pulse live, the field sleeps (no work, no upload). */
export const HEAT_EPS = 1 / 255;
/** White added to every channel at full heat (times heat squared): the front burns hot. */
export const HEAT_WHITE = 0.35;

export interface HeatPulse {
  /** Front speed, u/s. */
  readonly speed: number;
  /** Seconds the front lives; the reach is speed times life. */
  readonly life: number;
  /** Half band width of the front, u. */
  readonly width: number;
  /** Peak heat at the start, 0 to 1. The front fades linearly to HEAT_END_FRAC of it. */
  readonly strength: number;
}

/** Strength left at the end of a pulse's life, as a fraction of the start. */
export const HEAT_END_FRAC = 0.25;

/** An ordinary kill: a ring of the enemy hue to about 170 u. */
export const HEAT_KILL: HeatPulse = { speed: 480, life: 0.36, width: 22, strength: 0.95 };
/** Big kills (Snake head, Spawner) and a well bursting. */
export const HEAT_KILL_BIG: HeatPulse = { speed: 560, life: 0.5, width: 28, strength: 1 };
/** The ship dies. */
export const HEAT_DEATH: HeatPulse = { speed: 700, life: 0.8, width: 34, strength: 1 };
/** A super pulse, repeated while a timed super runs. */
/** Boss death colour pulse through the lattice: the widest and longest. */
export const HEAT_BOSS: HeatPulse = { speed: 820, life: 1.1, width: 42, strength: 1 };
export const HEAT_SUPER: HeatPulse ={ speed: 520, life: 0.5, width: 22, strength: 0.7 };
/** Bomb front speed; its life comes from the arena size (heatBombFor). */
export const HEAT_BOMB_SPEED = 1100;

export interface HeatField {
  /** Node count (every node, pinned ends included; pinned ends stay cold). */
  readonly n: number;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly speed: Float32Array;
  readonly width: Float32Array;
  readonly strength: Float32Array;
  /** Pulse colour channels in [0, 1]. */
  readonly cr: Float32Array;
  readonly cg: Float32Array;
  readonly cb: Float32Array;
  /** True while any node is warm or any pulse is live. */
  awake: boolean;
  /** True when colours changed since the last writeHeatColours. */
  dirty: boolean;
}

export function createHeat(n: number): HeatField {
  const c = Math.max(0, Math.floor(n));
  const P = HEAT_MAX_PULSES;
  return {
    n: c,
    r: new Float32Array(c),
    g: new Float32Array(c),
    b: new Float32Array(c),
    px: new Float32Array(P),
    py: new Float32Array(P),
    age: new Float32Array(P).fill(1),
    life: new Float32Array(P),
    speed: new Float32Array(P),
    width: new Float32Array(P),
    strength: new Float32Array(P),
    cr: new Float32Array(P),
    cg: new Float32Array(P),
    cb: new Float32Array(P),
    awake: false,
    dirty: true,
  };
}

/** Pure: is pulse slot i live. */
function live(h: HeatField, i: number): boolean {
  return (h.age[i] ?? 0) < (h.life[i] ?? 0);
}

/**
 * Start a pulse at (x, y) in colour (0xRRGGBB). When every slot is busy the oldest (by fraction
 * of its life) is replaced. Invalid input is ignored.
 */
export function addHeatPulse(h: HeatField, x: number, y: number, colour: number, p: HeatPulse): void {
  if (!(p.speed > 0) || !(p.life > 0) || !(p.width > 0) || !(p.strength > 0)) return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  let slot = -1;
  let oldest = -1;
  for (let i = 0; i < HEAT_MAX_PULSES; i++) {
    if (!live(h, i)) {
      slot = i;
      break;
    }
    const f = (h.age[i] ?? 0) / Math.max(1e-6, h.life[i] ?? 0);
    if (f > oldest) {
      oldest = f;
      slot = i;
    }
  }
  if (slot < 0) slot = 0;
  h.px[slot] = x;
  h.py[slot] = y;
  h.age[slot] = 0;
  h.life[slot] = p.life;
  h.speed[slot] = p.speed;
  h.width[slot] = p.width;
  h.strength[slot] = Math.min(1, p.strength);
  h.cr[slot] = ((colour >> 16) & 0xff) / 255;
  h.cg[slot] = ((colour >> 8) & 0xff) / 255;
  h.cb[slot] = (colour & 0xff) / 255;
  h.awake = true;
}

/** Pure: a bomb pulse that reaches every corner of a w x h arena from any point inside it. */
export function heatBombFor(w: number, h: number): HeatPulse {
  const reach = Math.hypot(Math.max(0, w), Math.max(0, h)) + 60;
  return { speed: HEAT_BOMB_SPEED, life: reach / HEAT_BOMB_SPEED, width: 60, strength: 1 };
}

/** Pure: band profile across a front, 1 on the front, 0 at plus or minus the half width. */
export function heatBand(off: number, width: number): number {
  if (!(width > 0)) return 0;
  const q = Math.abs(off) / width;
  if (q >= 1) return 0;
  return 1 - q * q;
}

/** Pure: pulse strength fraction at fraction u of its life, 1 falling linearly to HEAT_END_FRAC. */
export function heatFade(u: number): number {
  if (!(u > 0)) return 1;
  if (u >= 1) return HEAT_END_FRAC;
  return 1 - (1 - HEAT_END_FRAC) * u;
}

/** Raise node id to at least colour times k, channel by channel. */
function warm(h: HeatField, id: number, cr: number, cg: number, cb: number, k: number): void {
  const r = cr * k;
  const g = cg * k;
  const b = cb * k;
  if (r > (h.r[id] ?? 0)) h.r[id] = r;
  if (g > (h.g[id] ?? 0)) h.g[id] = g;
  if (b > (h.b[id] ?? 0)) h.b[id] = b;
}

/** Apply pulse i's front to the nodes in its band, through the layout cell index. */
function applyPulse(h: HeatField, L: LatticeLayout, i: number): void {
  const age = h.age[i] ?? 0;
  const life = h.life[i] ?? 0;
  const front = age * (h.speed[i] ?? 0);
  const w = h.width[i] ?? 1;
  const k0 = (h.strength[i] ?? 0) * heatFade(age / Math.max(1e-6, life));
  const cx = h.px[i] ?? 0;
  const cy = h.py[i] ?? 0;
  const cr = h.cr[i] ?? 0;
  const cg = h.cg[i] ?? 0;
  const cb = h.cb[i] ?? 0;
  const reach = front + w;
  const s = L.spacing;
  const c0 = Math.max(0, Math.ceil((cx - reach) / s) - L.iMin);
  const c1 = Math.min(L.cols - 1, Math.floor((cx + reach) / s) - L.iMin);
  const r0 = Math.max(0, Math.ceil((cy - reach) / s) - L.jMin);
  const r1 = Math.min(L.rows - 1, Math.floor((cy + reach) / s) - L.jMin);
  const inner = Math.max(0, front - w);
  const in2 = inner * inner;
  const out2 = reach * reach;
  for (let row = r0; row <= r1; row++) {
    const base = row * L.cols;
    const dy = (row + L.jMin) * s - cy;
    const dy2 = dy * dy;
    if (dy2 >= out2) continue;
    for (let col = c0; col <= c1; col++) {
      const id = L.cell[base + col] ?? -1;
      if (id < 0) continue;
      const dx = (L.restX[id] ?? 0) - cx;
      const ddy = (L.restY[id] ?? 0) - cy;
      const d2 = dx * dx + ddy * ddy;
      if (d2 >= out2 || d2 < in2) continue;
      const band = heatBand(Math.sqrt(d2) - front, w);
      if (band > 0) warm(h, id, cr, cg, cb, k0 * band);
    }
  }
}

/**
 * Advance the field by dt seconds: fade every warm node, then lay every live front onto the
 * nodes it now covers and age it. Sleeps (returns at once) when nothing is warm or pending.
 */
export function stepHeat(h: HeatField, L: LatticeLayout, dt: number): void {
  if (!h.awake) return;
  const d = Number.isFinite(dt) ? Math.min(0.1, Math.max(0, dt)) : 0;
  const keep = Math.exp(-d / HEAT_DECAY_SEC);
  let peak = 0;
  const n = Math.min(h.n, L.free);
  const r = h.r;
  const g = h.g;
  const b = h.b;
  for (let i = 0; i < n; i++) {
    const ri = (r[i] ?? 0) * keep;
    const gi = (g[i] ?? 0) * keep;
    const bi = (b[i] ?? 0) * keep;
    r[i] = ri;
    g[i] = gi;
    b[i] = bi;
    const m = ri > gi ? (ri > bi ? ri : bi) : gi > bi ? gi : bi;
    if (m > peak) peak = m;
  }
  let pending = false;
  for (let p = 0; p < HEAT_MAX_PULSES; p++) {
    if (!live(h, p)) continue;
    applyPulse(h, L, p);
    h.age[p] = (h.age[p] ?? 0) + d;
    pending = true;
    peak = Math.max(peak, HEAT_EPS * 2);
  }
  h.dirty = true;
  if (!pending && peak < HEAT_EPS) {
    r.fill(0);
    g.fill(0);
    b.fill(0);
    h.awake = false;
  }
}

/**
 * Write the field as RGBA bytes (4 per node) for an additive vertex colour buffer. Alpha is the
 * brightest channel. Returns false and writes nothing when nothing changed since the last write.
 */
export function writeHeatColours(h: HeatField, out: Uint8Array): boolean {
  if (!h.dirty) return false;
  const n = Math.min(h.n, Math.floor(out.length / 4));
  for (let i = 0; i < n; i++) {
    const hr = h.r[i] ?? 0;
    const hg = h.g[i] ?? 0;
    const hb = h.b[i] ?? 0;
    const m = hr > hg ? (hr > hb ? hr : hb) : hg > hb ? hg : hb;
    // A hot front burns toward white, so it carries enough light into the bloom.
    const w = HEAT_WHITE * m * m;
    const r = Math.min(255, Math.round((hr + w) * 255));
    const g = Math.min(255, Math.round((hg + w) * 255));
    const b = Math.min(255, Math.round((hb + w) * 255));
    const o = 4 * i;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = r > g ? (r > b ? r : b) : g > b ? g : b;
  }
  h.dirty = false;
  return true;
}

/** Drop every pulse and cool every node (level change). */
export function resetHeat(h: HeatField): void {
  h.r.fill(0);
  h.g.fill(0);
  h.b.fill(0);
  h.age.fill(1);
  h.life.fill(0);
  h.awake = false;
  h.dirty = true;
}
