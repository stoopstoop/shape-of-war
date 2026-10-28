// Pure lattice spring sim (v2 SPEC addendum 3.8, docs/10 wave D). No pixi.js import, no PRNG.
// Cosmetic only: the simulation never reads it. State is a displacement field (ux, uy) from the
// rest layout, so a lattice at rest stays exactly at rest. Each free node is joined to its four
// neighbours by springs (the linear membrane model, pinned wall ends hold zero) and to its rest
// spot by a weak anchor. Verlet at a fixed 60 Hz sub rate inside the render loop, at most three
// sub steps a frame, velocity damping and a displacement clamp, so energy stays bounded.
// Impulses, rings and forces all act by moving the previous position (a velocity change), so the
// integrator stays one loop. Every array is allocated in createLatticeSim; stepping allocates
// nothing.
import type { LatticeLayout } from './layout';

export const SUB_HZ = 60;
export const SUB_DT = 1 / SUB_HZ;
export const MAX_SUBSTEPS = 3;
/** Shock speed through the lattice, arena units per second (capped by stability per spacing). */
export const WAVE_SPEED = 600;
/** Spring term per sub step (k dt squared) is kept at or under this for stability. */
export const MAX_SPRING = 0.4;
/** Weak rest anchor, per second squared. */
export const ANCHOR = 25;
/** Velocity lost per sub step: a slow wobble that settles in about two seconds. */
export const DAMPING = 0.03;
/** Displacement clamp as a fraction of the spacing, bounded in arena units. */
export const MAX_DISP_FRAC = 0.8;
export const MAX_DISP_MIN = 12;
export const MAX_DISP_MAX = 30;
/** Below this displacement and step (arena units) with nothing pending the lattice sleeps. */
export const SLEEP_EPS = 0.02;
export const MAX_IMPULSES = 16;
export const MAX_RINGS = 4;
/** Wells (at most 3) plus the ship wake. */
export const MAX_FORCES = 4;
/** Frame dt is clamped here before it enters the accumulator. */
const MAX_FRAME_DT = 0.1;

export interface LatticeSim {
  readonly layout: LatticeLayout;
  /** Current displacement per free node. Swapped with px every sub step. */
  ux: Float32Array;
  uy: Float32Array;
  /** Previous sub step displacement per free node. */
  px: Float32Array;
  py: Float32Array;
  /** Spring and anchor terms per sub step (already times dt squared). */
  readonly k: number;
  readonly anchor: number;
  readonly maxDisp: number;
  /** Seconds not yet stepped. */
  acc: number;
  /** False while every node is exactly at rest and nothing is pending. */
  awake: boolean;
  /** True when positions changed since the last writePositions. */
  dirty: boolean;
  readonly impX: Float32Array;
  readonly impY: Float32Array;
  readonly impS: Float32Array;
  readonly impR: Float32Array;
  impN: number;
  readonly ringX: Float32Array;
  readonly ringY: Float32Array;
  readonly ringAge: Float32Array;
  readonly ringLife: Float32Array;
  readonly ringS: Float32Array;
  readonly ringSpeed: Float32Array;
  readonly ringW: Float32Array;
  readonly forceX: Float32Array;
  readonly forceY: Float32Array;
  readonly forceR: Float32Array;
  /** Peak acceleration, u/s^2. Positive pushes away from the centre, negative pulls in. */
  readonly forceS: Float32Array;
  forceN: number;
  /** Sub steps taken since creation (tests and stats). */
  steps: number;
}

/** Pure: the displacement clamp for a spacing. */
export function maxDispFor(spacing: number): number {
  return Math.min(MAX_DISP_MAX, Math.max(MAX_DISP_MIN, spacing * MAX_DISP_FRAC));
}

/** Pure: the per sub step spring term for a spacing, so shocks travel at about WAVE_SPEED. */
export function springFor(spacing: number): number {
  const c = (WAVE_SPEED * SUB_DT) / Math.max(1, spacing);
  return Math.min(MAX_SPRING, c * c);
}

export function createLatticeSim(layout: LatticeLayout): LatticeSim {
  const n = layout.free;
  return {
    layout,
    ux: new Float32Array(n),
    uy: new Float32Array(n),
    px: new Float32Array(n),
    py: new Float32Array(n),
    k: springFor(layout.spacing),
    anchor: ANCHOR * SUB_DT * SUB_DT,
    maxDisp: maxDispFor(layout.spacing),
    acc: 0,
    awake: false,
    dirty: true,
    impX: new Float32Array(MAX_IMPULSES),
    impY: new Float32Array(MAX_IMPULSES),
    impS: new Float32Array(MAX_IMPULSES),
    impR: new Float32Array(MAX_IMPULSES),
    impN: 0,
    ringX: new Float32Array(MAX_RINGS),
    ringY: new Float32Array(MAX_RINGS),
    ringAge: new Float32Array(MAX_RINGS).fill(1),
    ringLife: new Float32Array(MAX_RINGS),
    ringS: new Float32Array(MAX_RINGS),
    ringSpeed: new Float32Array(MAX_RINGS),
    ringW: new Float32Array(MAX_RINGS),
    forceX: new Float32Array(MAX_FORCES),
    forceY: new Float32Array(MAX_FORCES),
    forceR: new Float32Array(MAX_FORCES),
    forceS: new Float32Array(MAX_FORCES),
    forceN: 0,
    steps: 0,
  };
}

/** Return every node to rest and drop pending impulses, rings and forces. */
export function resetLattice(sim: LatticeSim): void {
  sim.ux.fill(0);
  sim.uy.fill(0);
  sim.px.fill(0);
  sim.py.fill(0);
  sim.impN = 0;
  sim.ringAge.fill(1);
  sim.ringLife.fill(0);
  sim.forceN = 0;
  sim.acc = 0;
  sim.awake = false;
  sim.dirty = true;
}

/**
 * Queue a radial velocity kick: `strength` u/s outward at the centre, falling to 0 at `radius`.
 * Applied on the next sub step. When the queue is full the weakest queued kick is replaced, or
 * the new one is dropped if it is the weakest.
 */
export function addImpulse(sim: LatticeSim, x: number, y: number, strength: number, radius: number): void {
  if (!(strength > 0) || !(radius > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return;
  let slot = sim.impN;
  if (slot >= MAX_IMPULSES) {
    slot = 0;
    for (let i = 1; i < MAX_IMPULSES; i++) if ((sim.impS[i] ?? 0) < (sim.impS[slot] ?? 0)) slot = i;
    if ((sim.impS[slot] ?? 0) >= strength) return;
  } else sim.impN++;
  sim.impX[slot] = x;
  sim.impY[slot] = y;
  sim.impS[slot] = strength;
  sim.impR[slot] = radius;
  sim.awake = true;
}

/**
 * Start an expanding ring: a front leaving (x, y) at `speed` u/s for `life` s, half band width
 * `width`. A node the front crosses gains about `strength` u/s outward in total, fading with age.
 * When every slot is busy the oldest ring is replaced.
 */
export function addRing(
  sim: LatticeSim,
  x: number,
  y: number,
  strength: number,
  speed: number,
  life: number,
  width: number,
): void {
  if (!(strength > 0) || !(speed > 0) || !(life > 0) || !(width > 0)) return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  let slot = -1;
  let oldest = 0;
  for (let i = 0; i < MAX_RINGS; i++) {
    const age = (sim.ringAge[i] ?? 0) / Math.max(1e-6, sim.ringLife[i] ?? 0);
    if (!((sim.ringAge[i] ?? 0) < (sim.ringLife[i] ?? 0))) {
      slot = i;
      break;
    }
    if (age > oldest) {
      oldest = age;
      slot = i;
    }
  }
  if (slot < 0) slot = 0;
  sim.ringX[slot] = x;
  sim.ringY[slot] = y;
  sim.ringAge[slot] = 0;
  sim.ringLife[slot] = life;
  sim.ringS[slot] = strength;
  sim.ringSpeed[slot] = speed;
  sim.ringW[slot] = width;
  sim.awake = true;
}

/** Drop every continuous force. Call once a frame before setting this frame's forces. */
export function clearForces(sim: LatticeSim): void {
  sim.forceN = 0;
}

/**
 * Add a continuous force for this frame: peak acceleration `accel` u/s^2 (negative pulls toward
 * the centre, a well; positive pushes away, the ship wake) inside `radius`. Extra forces past
 * MAX_FORCES are ignored.
 */
export function addForce(sim: LatticeSim, x: number, y: number, radius: number, accel: number): void {
  if (sim.forceN >= MAX_FORCES || !(radius > 0) || accel === 0 || !Number.isFinite(accel)) return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const i = sim.forceN++;
  sim.forceX[i] = x;
  sim.forceY[i] = y;
  sim.forceR[i] = radius;
  sim.forceS[i] = accel;
  sim.awake = true;
}

function ringsLive(sim: LatticeSim): boolean {
  for (let i = 0; i < MAX_RINGS; i++) if ((sim.ringAge[i] ?? 0) < (sim.ringLife[i] ?? 0)) return true;
  return false;
}

/** Pure: radial force profile, 0 at the centre and the rim, peak 1 at a third of the radius. */
export function forceProfile(q: number): number {
  if (!(q > 0) || !(q < 1)) return 0;
  const r = 1 - q;
  return 6.75 * q * r * r;
}

/**
 * Visit the free nodes whose rest spot lies within radius of (x, y), through the lattice cell
 * index (no search). fn gets the node, its offset from the centre and the distance.
 */
function forEachNear(
  sim: LatticeSim,
  x: number,
  y: number,
  radius: number,
  fn: (sim: LatticeSim, id: number, dx: number, dy: number, d: number, a: number, b: number) => void,
  a: number,
  b: number,
): void {
  const L = sim.layout;
  const s = L.spacing;
  const c0 = Math.max(0, Math.ceil((x - radius) / s) - L.iMin);
  const c1 = Math.min(L.cols - 1, Math.floor((x + radius) / s) - L.iMin);
  const r0 = Math.max(0, Math.ceil((y - radius) / s) - L.jMin);
  const r1 = Math.min(L.rows - 1, Math.floor((y + radius) / s) - L.jMin);
  const r2 = radius * radius;
  for (let row = r0; row <= r1; row++) {
    const base = row * L.cols;
    for (let col = c0; col <= c1; col++) {
      const id = L.cell[base + col] ?? -1;
      if (id < 0) continue;
      const dx = (L.restX[id] ?? 0) - x;
      const dy = (L.restY[id] ?? 0) - y;
      const dd = dx * dx + dy * dy;
      if (dd >= r2) continue;
      fn(sim, id, dx, dy, Math.sqrt(dd), a, b);
    }
  }
}

/** Velocity kick: moving the previous position back adds to the Verlet velocity. */
function kick(sim: LatticeSim, id: number, dx: number, dy: number, d: number, dv: number): void {
  if (d < 1e-3) return;
  const m = (dv * SUB_DT) / d;
  sim.px[id] = (sim.px[id] ?? 0) - dx * m;
  sim.py[id] = (sim.py[id] ?? 0) - dy * m;
}

function impulseVisit(sim: LatticeSim, id: number, dx: number, dy: number, d: number, strength: number, radius: number): void {
  const f = 1 - d / radius;
  kick(sim, id, dx, dy, d, strength * f * f);
}

/** Half band width of the ring being applied. Set by applyRing just before its visit. */
let bandW = 1;

/** Kick a node inside the ring band; perStep carries strength, fade and the band normalisation. */
function ringVisit(sim: LatticeSim, id: number, dx: number, dy: number, d: number, front: number, perStep: number): void {
  const off = d - front;
  if (off <= -bandW || off >= bandW) return;
  kick(sim, id, dx, dy, d, perStep * Math.cos((off * Math.PI) / (2 * bandW)));
}

function forceVisit(sim: LatticeSim, id: number, dx: number, dy: number, d: number, accel: number, radius: number): void {
  const a = accel * forceProfile(d / radius);
  if (a === 0 || d < 1e-3) return;
  const m = (a * SUB_DT * SUB_DT) / d;
  sim.px[id] = (sim.px[id] ?? 0) - dx * m;
  sim.py[id] = (sim.py[id] ?? 0) - dy * m;
}

/**
 * Apply one live ring for a sub step and age it. A node crossed by the front gains about the
 * ring strength in total: the cosine band integrates to 4w/pi in distance, so each sub step
 * gives strength * speed * dt * pi / (4w) at the band centre.
 */
function applyRing(sim: LatticeSim, r: number): void {
  const age = sim.ringAge[r] ?? 0;
  const life = sim.ringLife[r] ?? 0;
  if (!(age < life)) return;
  const speed = sim.ringSpeed[r] ?? 0;
  const w = sim.ringW[r] ?? 1;
  const front = age * speed;
  const fade = (1 - age / life) * (1 - age / life);
  const perStep = ((sim.ringS[r] ?? 0) * fade * speed * SUB_DT * Math.PI) / (4 * w);
  bandW = w;
  forEachNear(sim, sim.ringX[r] ?? 0, sim.ringY[r] ?? 0, front + w, ringVisit, front, perStep);
  sim.ringAge[r] = age + SUB_DT;
}

/** One 60 Hz sub step. Exported for tests; stepLattice is the frame entry point. */
export function subStep(sim: LatticeSim): void {
  for (let i = 0; i < sim.impN; i++) {
    forEachNear(sim, sim.impX[i] ?? 0, sim.impY[i] ?? 0, sim.impR[i] ?? 0, impulseVisit, sim.impS[i] ?? 0, sim.impR[i] ?? 0);
  }
  sim.impN = 0;
  for (let r = 0; r < MAX_RINGS; r++) applyRing(sim, r);
  for (let f = 0; f < sim.forceN; f++) {
    forEachNear(sim, sim.forceX[f] ?? 0, sim.forceY[f] ?? 0, sim.forceR[f] ?? 0, forceVisit, sim.forceS[f] ?? 0, sim.forceR[f] ?? 0);
  }
  integrate(sim);
  sim.steps++;
}

/** Verlet over the free nodes. New values go into the previous arrays, then the two swap. */
function integrate(sim: LatticeSim): void {
  const L = sim.layout;
  const n = L.free;
  const nbr = L.nbr;
  const ux = sim.ux;
  const uy = sim.uy;
  const px = sim.px;
  const py = sim.py;
  const k = sim.k;
  const a = sim.anchor;
  const keep = 1 - DAMPING;
  const maxD = sim.maxDisp;
  const maxD2 = maxD * maxD;
  const maxV = maxD * 0.5;
  const maxV2 = maxV * maxV;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const x = ux[i] ?? 0;
    const y = uy[i] ?? 0;
    let lx = 0;
    let ly = 0;
    const b = i * 4;
    for (let q = 0; q < 4; q++) {
      const j = nbr[b + q] ?? -1;
      if (j < 0) continue;
      // Pinned ends (j >= free) hold zero displacement.
      if (j < n) {
        lx += (ux[j] ?? 0) - x;
        ly += (uy[j] ?? 0) - y;
      } else {
        lx -= x;
        ly -= y;
      }
    }
    let vx = (x - (px[i] ?? 0)) * keep + k * lx - a * x;
    let vy = (y - (py[i] ?? 0)) * keep + k * ly - a * y;
    const v2 = vx * vx + vy * vy;
    if (v2 > maxV2) {
      const m = maxV / Math.sqrt(v2);
      vx *= m;
      vy *= m;
    }
    let nx = x + vx;
    let ny = y + vy;
    const d2 = nx * nx + ny * ny;
    if (d2 > maxD2) {
      const m = maxD / Math.sqrt(d2);
      nx *= m;
      ny *= m;
    }
    px[i] = nx;
    py[i] = ny;
    const m2 = nx * nx + ny * ny;
    if (m2 > peak) peak = m2;
    const s2 = vx * vx + vy * vy;
    if (s2 > peak) peak = s2;
  }
  sim.ux = px;
  sim.uy = py;
  sim.px = ux;
  sim.py = uy;
  sim.dirty = true;
  if (peak < SLEEP_EPS * SLEEP_EPS && sim.impN === 0 && sim.forceN === 0 && !ringsLive(sim)) {
    sim.ux.fill(0);
    sim.uy.fill(0);
    sim.px.fill(0);
    sim.py.fill(0);
    sim.awake = false;
  }
}

/**
 * Advance by one render frame of dt seconds: at most MAX_SUBSTEPS fixed sub steps; time beyond
 * that is dropped so a slow frame never spirals. Returns the sub steps taken. A sleeping lattice
 * with nothing pending costs nothing.
 */
export function stepLattice(sim: LatticeSim, dt: number): number {
  const d = Number.isFinite(dt) ? Math.min(MAX_FRAME_DT, Math.max(0, dt)) : 0;
  if (!sim.awake) {
    sim.acc = 0;
    return 0;
  }
  sim.acc += d;
  let n = Math.floor(sim.acc / SUB_DT + 1e-9);
  if (n > MAX_SUBSTEPS) {
    n = MAX_SUBSTEPS;
    sim.acc = 0;
  } else sim.acc = Math.max(0, sim.acc - n * SUB_DT);
  for (let i = 0; i < n && sim.awake; i++) subStep(sim);
  return n;
}

/** Pure: interpolation factor between the last two sub steps for drawing. */
export function latticeAlpha(sim: LatticeSim): number {
  const t = sim.acc / SUB_DT;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Write drawn node positions (x, y pairs, every node including pinned ends) into out, blending
 * the last two sub steps by alpha. Returns false and writes nothing when nothing moved since the
 * last write, so the caller can skip the GPU upload.
 */
export function writePositions(sim: LatticeSim, out: Float32Array, alpha: number): boolean {
  if (!sim.dirty && !sim.awake) return false;
  const L = sim.layout;
  const rx = L.restX;
  const ry = L.restY;
  const n = L.free;
  const ux = sim.ux;
  const uy = sim.uy;
  const px = sim.px;
  const py = sim.py;
  const t = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  for (let i = 0; i < n; i++) {
    const p = px[i] ?? 0;
    const q = py[i] ?? 0;
    out[2 * i] = (rx[i] ?? 0) + p + ((ux[i] ?? 0) - p) * t;
    out[2 * i + 1] = (ry[i] ?? 0) + q + ((uy[i] ?? 0) - q) * t;
  }
  for (let i = n; i < L.count; i++) {
    out[2 * i] = rx[i] ?? 0;
    out[2 * i + 1] = ry[i] ?? 0;
  }
  sim.dirty = false;
  return true;
}

/** Pure: largest displacement magnitude over the free nodes (tests and the dev panel). */
export function maxDisplacement(sim: LatticeSim): number {
  let m = 0;
  for (let i = 0; i < sim.layout.free; i++) {
    const x = sim.ux[i] ?? 0;
    const y = sim.uy[i] ?? 0;
    const d = x * x + y * y;
    if (d > m) m = d;
  }
  return Math.sqrt(m);
}
