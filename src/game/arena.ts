// Analytic arena confinement (docs/03 section 4). Keeps a circle of radius r inside the
// LevelDef arena and outside its obstacles. Writes into a reused result object: no allocation.
import type { ArenaDef, Obstacle } from '../levelgen/leveldef';

export interface ConfineResult {
  x: number;
  y: number;
  /** Unit push direction (points back into the playable area). Zero when hit is false. */
  nx: number;
  ny: number;
  hit: boolean;
}

export function createConfineResult(): ConfineResult {
  return { x: 0, y: 0, nx: 0, ny: 0, hit: false };
}

const shared = createConfineResult();

const COS30 = Math.cos(Math.PI / 6);
// Flat top hexagon: vertices at 0, 60, ... degrees.
const HEX_VX = [1, 0.5, -0.5, -1, -0.5, 0.5];
const HEX_VY = [0, COS30, COS30, 0, -COS30, -COS30];
// Edge normals at 30, 90, ... degrees.
const HEX_NX = [COS30, 0, -COS30, -COS30, 0, COS30];
const HEX_NY = [0.5, 1, 0.5, -0.5, -1, -0.5];

/**
 * Confine a circle at (x, y) with radius r. Returns `out` (a shared object by default; copy the
 * fields before the next call). Safe to call with any finite input.
 */
export function confine(
  arena: ArenaDef,
  x: number,
  y: number,
  r: number,
  out: ConfineResult = shared,
): ConfineResult {
  out.x = x;
  out.y = y;
  switch (arena.shape) {
    case 'rect':
      confineRect(arena.width / 2, arena.height / 2, r, out);
      break;
    case 'roundRect':
      confineRoundRect(arena.width / 2, arena.height / 2, arena.cornerRadius, r, out);
      break;
    case 'circle':
      confineCircle(arena.width / 2, r, out);
      break;
    case 'hexagon':
      confineHex(arena.width / 2, r, out);
      break;
    case 'rectObstacles':
      confineRect(arena.width / 2, arena.height / 2, r, out);
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < arena.obstacles.length; i++) {
          const o = arena.obstacles[i];
          if (o !== undefined) pushOutOfBox(o, r, out);
        }
        confineRect(arena.width / 2, arena.height / 2, r, out);
      }
      break;
  }
  finish(x, y, out);
  return out;
}

/** Sets hit and the push normal from the total displacement. */
function finish(x0: number, y0: number, out: ConfineResult): void {
  const dx = out.x - x0;
  const dy = out.y - y0;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1e-9) {
    out.hit = true;
    out.nx = dx / d;
    out.ny = dy / d;
  } else {
    out.hit = false;
    out.nx = 0;
    out.ny = 0;
  }
}

function confineRect(hx: number, hy: number, r: number, out: ConfineResult): void {
  const ix = Math.max(0, hx - r);
  const iy = Math.max(0, hy - r);
  if (out.x > ix) out.x = ix;
  else if (out.x < -ix) out.x = -ix;
  if (out.y > iy) out.y = iy;
  else if (out.y < -iy) out.y = -iy;
}

function confineRoundRect(hx: number, hy: number, cr: number, r: number, out: ConfineResult): void {
  confineRect(hx, hy, r, out);
  const c = Math.min(cr, hx, hy);
  const inner = c - r;
  if (inner <= 0) return; // corner tighter than the circle: shrunk shape is a plain rect
  const cx = hx - c;
  const cy = hy - c;
  const ax = Math.abs(out.x);
  const ay = Math.abs(out.y);
  if (ax <= cx || ay <= cy) return;
  const dx = ax - cx;
  const dy = ay - cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d <= inner) return;
  const k = inner / d;
  out.x = Math.sign(out.x) * (cx + dx * k);
  out.y = Math.sign(out.y) * (cy + dy * k);
}

function confineCircle(R: number, r: number, out: ConfineResult): void {
  const lim = Math.max(0, R - r);
  const d = Math.sqrt(out.x * out.x + out.y * out.y);
  if (d <= lim) return;
  if (d < 1e-9) return;
  const k = lim / d;
  out.x *= k;
  out.y *= k;
}

/** Closest point on the inset hexagon (apothem a - r) when the centre lies outside it. */
function confineHex(R: number, r: number, out: ConfineResult): void {
  const apo = Math.max(0, R * COS30 - r);
  let inside = true;
  for (let i = 0; i < 6; i++) {
    if (out.x * (HEX_NX[i] ?? 0) + out.y * (HEX_NY[i] ?? 0) > apo) {
      inside = false;
      break;
    }
  }
  if (inside) return;
  const vr = apo / COS30; // circumradius of the inset hexagon
  const px = out.x;
  const py = out.y;
  let bestD = Infinity;
  let bx = 0;
  let by = 0;
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    const ax = (HEX_VX[i] ?? 0) * vr;
    const ay = (HEX_VY[i] ?? 0) * vr;
    const ex = (HEX_VX[j] ?? 0) * vr - ax;
    const ey = (HEX_VY[j] ?? 0) * vr - ay;
    const ee = ex * ex + ey * ey;
    let t = ee > 0 ? ((px - ax) * ex + (py - ay) * ey) / ee : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const qx = ax + ex * t;
    const qy = ay + ey * t;
    const dd = (px - qx) * (px - qx) + (py - qy) * (py - qy);
    if (dd < bestD) {
      bestD = dd;
      bx = qx;
      by = qy;
    }
  }
  out.x = bx;
  out.y = by;
}

/** Push a circle out of an axis aligned box (centre and full size). */
function pushOutOfBox(o: Obstacle, r: number, out: ConfineResult): void {
  const hw = o.w / 2;
  const hh = o.h / 2;
  const lx = out.x - o.cx;
  const ly = out.y - o.cy;
  const qx = lx < -hw ? -hw : lx > hw ? hw : lx;
  const qy = ly < -hh ? -hh : ly > hh ? hh : ly;
  const dx = lx - qx;
  const dy = ly - qy;
  const dd = dx * dx + dy * dy;
  if (dd > 0) {
    if (dd >= r * r) return;
    const d = Math.sqrt(dd);
    const k = r / d;
    out.x = o.cx + qx + dx * k;
    out.y = o.cy + qy + dy * k;
    return;
  }
  // Centre inside the box: leave along the axis of least penetration.
  const penL = lx + hw;
  const penR = hw - lx;
  const penT = ly + hh;
  const penB = hh - ly;
  const m = Math.min(penL, penR, penT, penB);
  if (m === penL) out.x = o.cx - hw - r;
  else if (m === penR) out.x = o.cx + hw + r;
  else if (m === penT) out.y = o.cy - hh - r;
  else out.y = o.cy + hh + r;
}

/** True when the circle is fully inside the arena and clear of obstacles (tests, spawn checks). */
export function isInside(arena: ArenaDef, x: number, y: number, r: number): boolean {
  const res = confine(arena, x, y, r, scratch);
  return !res.hit;
}

const scratch = createConfineResult();
