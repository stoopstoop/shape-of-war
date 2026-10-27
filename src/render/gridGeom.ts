// Pure grid geometry: line segments clipped to the arena shape and its obstacles.
// Arena origin is the centre, +x right, +y down (docs/01-game-design.md section 2.3).
import type { ArenaDef } from '../levelgen/leveldef';

export const GRID_SPACING = 50;

export type Axis = 'v' | 'h';

/** Half length of the arena chord along a grid line, or -1 if the line misses the arena.
 *  axis 'v' is the line x = c (extent along y); 'h' is the line y = c (extent along x). */
export function halfExtent(a: ArenaDef, axis: Axis, c: number): number {
  const ac = Math.abs(c);
  const along = axis === 'v' ? a.width / 2 : a.height / 2; // half size across the lines
  const span = axis === 'v' ? a.height / 2 : a.width / 2; // half size along the line
  switch (a.shape) {
    case 'rect':
    case 'rectObstacles':
      return ac <= along ? span : -1;
    case 'roundRect': {
      if (ac > along) return -1;
      const r = Math.max(0, Math.min(a.cornerRadius, along, span));
      const ax = ac - (along - r);
      if (ax <= 0) return span;
      return span - r + Math.sqrt(Math.max(0, r * r - ax * ax));
    }
    case 'circle': {
      const r = a.width / 2;
      return ac <= r ? Math.sqrt(Math.max(0, r * r - ac * ac)) : -1;
    }
    case 'hexagon': {
      // Flat top: vertices at (+-R, 0) and (+-R/2, +-H).
      const r = a.width / 2;
      const h = a.height / 2;
      if (axis === 'v') {
        if (ac > r) return -1;
        return ac <= r / 2 ? h : (h * (r - ac)) / (r / 2);
      }
      if (ac > h) return -1;
      return r - (ac / h) * (r / 2);
    }
  }
}

/** Pure: subtract obstacle spans from [lo, hi] on one grid line. Returns flat [lo, hi, ...]. */
export function subtractObstacles(a: ArenaDef, axis: Axis, c: number, lo: number, hi: number): number[] {
  let parts: number[] = [lo, hi];
  for (const o of a.obstacles) {
    const across = axis === 'v' ? o.cx : o.cy;
    const halfAcross = (axis === 'v' ? o.w : o.h) / 2;
    if (Math.abs(c - across) >= halfAcross) continue;
    const centre = axis === 'v' ? o.cy : o.cx;
    const half = (axis === 'v' ? o.h : o.w) / 2;
    const cutLo = centre - half;
    const cutHi = centre + half;
    const next: number[] = [];
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const pLo = parts[i] ?? 0;
      const pHi = parts[i + 1] ?? 0;
      if (cutHi <= pLo || cutLo >= pHi) {
        next.push(pLo, pHi);
        continue;
      }
      if (cutLo > pLo) next.push(pLo, cutLo);
      if (cutHi < pHi) next.push(cutHi, pHi);
    }
    parts = next;
  }
  return parts;
}

/** Pure: grid line positions, multiples of spacing that lie strictly inside +-half. */
export function linePositions(half: number, spacing: number): number[] {
  const out: number[] = [];
  const n = Math.floor(half / spacing);
  for (let i = -n; i <= n; i++) {
    const c = i * spacing;
    if (Math.abs(c) < half) out.push(c);
  }
  return out;
}

/** Pure: all grid segments inside the arena, flat [x1, y1, x2, y2, ...]. */
export function gridSegments(a: ArenaDef, spacing: number = GRID_SPACING): number[] {
  const out: number[] = [];
  for (const axis of ['v', 'h'] as const) {
    const across = axis === 'v' ? a.width / 2 : a.height / 2;
    for (const c of linePositions(across, spacing)) {
      const half = halfExtent(a, axis, c);
      if (half <= 0) continue;
      const parts = subtractObstacles(a, axis, c, -half, half);
      for (let i = 0; i + 1 < parts.length; i += 2) {
        const lo = parts[i] ?? 0;
        const hi = parts[i + 1] ?? 0;
        if (hi - lo < 0.5) continue;
        if (axis === 'v') out.push(c, lo, c, hi);
        else out.push(lo, c, hi, c);
      }
    }
  }
  return out;
}

/** Pure: flat-top hexagon outline points for an arena bounding box. */
export function hexagonPoints(width: number, height: number): number[] {
  const r = width / 2;
  const h = height / 2;
  return [r, 0, r / 2, h, -r / 2, h, -r, 0, -r / 2, -h, r / 2, -h];
}
