// Pure floating stick math (docs/04 section 9). All values in CSS px, so DPR never enters.

/** Max knob travel from the origin, CSS px (SPEC 5: 120 px at DPR 1). */
export const STICK_RADIUS = 120;
/** Dead zone as a fraction of STICK_RADIUS. */
export const DEAD_ZONE = 0.12;
/** Knob draw radius, CSS px. */
export const KNOB_RADIUS = 36;
/** Pointer id meaning "no pointer owns this". */
export const NO_POINTER = -1;

/** Live stick: StickState fields plus origin and clamped knob position. */
export interface Track {
  id: number;
  active: boolean;
  x: number;
  y: number;
  /** Stick centre, canvas local CSS px. Starts at the landing, then follows a finger past the ring. */
  ox: number;
  oy: number;
  /** Where the thumb first landed, canvas local CSS px (debug readout only). */
  lx: number;
  ly: number;
  /** Knob, clamped to the ring. */
  px: number;
  py: number;
}

export interface StickVector {
  /** Output in [-1, 1] after dead zone rescale. */
  x: number;
  y: number;
  /** Knob offset from origin, clamped to radius, CSS px. */
  kx: number;
  ky: number;
}

/**
 * Map a finger offset from the origin to stick output.
 * Inside the dead zone the output is 0; outside it rescales so magnitude runs 0 to 1.
 */
export function stickVector(dx: number, dy: number, radius = STICK_RADIUS, dead = DEAD_ZONE): StickVector {
  const d = Math.hypot(dx, dy);
  const s = d > radius ? radius / d : 1;
  const kx = dx * s;
  const ky = dy * s;
  const m = Math.min(d, radius) / radius;
  if (m < dead || m === 0) return { x: 0, y: 0, kx, ky };
  const k = (m - dead) / (1 - dead) / m;
  return { x: (kx / radius) * k, y: (ky / radius) * k, kx, ky };
}

export function createTrack(): Track {
  return { id: NO_POINTER, active: false, x: 0, y: 0, ox: 0, oy: 0, lx: 0, ly: 0, px: 0, py: 0 };
}

export function beginTrack(t: Track, id: number, x: number, y: number): void {
  t.id = id;
  t.active = true;
  t.ox = t.px = t.lx = x;
  t.oy = t.py = t.ly = y;
  t.x = t.y = 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export interface Centre {
  x: number;
  y: number;
}

/**
 * Pure stick follow. A finger within the ring leaves the centre where it is. A finger past the
 * ring drags the centre behind it so the finger sits on the ring edge: centre = touch minus
 * radius times the unit direction from centre to touch. The centre is then clamped to the
 * canvas (0 to w, 0 to h). Without follow the centre stays at the landing and a flip has to
 * travel back over the overshoot first, which is one sided near a screen edge.
 */
export function followCentre(
  cx: number,
  cy: number,
  x: number,
  y: number,
  w = Number.POSITIVE_INFINITY,
  h = Number.POSITIVE_INFINITY,
  radius = STICK_RADIUS,
): Centre {
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d <= radius) return { x: cx, y: cy };
  const nx = x - (radius * dx) / d;
  const ny = y - (radius * dy) / d;
  return { x: clamp(nx, 0, w), y: clamp(ny, 0, h) };
}

/** Finger moved to (x, y). Bounds w, h are the canvas size in CSS px; the centre stays inside. */
export function updateTrack(t: Track, x: number, y: number, w = Number.POSITIVE_INFINITY, h = Number.POSITIVE_INFINITY): void {
  const c = followCentre(t.ox, t.oy, x, y, w, h);
  t.ox = c.x;
  t.oy = c.y;
  const v = stickVector(x - t.ox, y - t.oy);
  t.px = t.ox + v.kx;
  t.py = t.oy + v.ky;
  t.x = v.x;
  t.y = v.y;
}

export function endTrack(t: Track): void {
  t.id = NO_POINTER;
  t.active = false;
  t.x = t.y = 0;
  t.px = t.ox;
  t.py = t.oy;
}
