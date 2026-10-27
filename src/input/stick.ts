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
  /** Origin, canvas local CSS px. */
  ox: number;
  oy: number;
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
  return { id: NO_POINTER, active: false, x: 0, y: 0, ox: 0, oy: 0, px: 0, py: 0 };
}

export function beginTrack(t: Track, id: number, x: number, y: number): void {
  t.id = id;
  t.active = true;
  t.ox = t.px = x;
  t.oy = t.py = y;
  t.x = t.y = 0;
}

export function updateTrack(t: Track, x: number, y: number): void {
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
