// Hazard primitives (docs/13 "Hazard primitives", docs/12 "Design: hazard primitives"). Pure,
// analytic, O(1) per hazard, no allocation, no World access: callers pass plain numbers, so the
// same geometry serves the sim, the fairness checks and the tests. Every boss is a composition of
// these five. Field mapping on a Kind.BossHazard entity (render contract):
//   0 lane:   segment from (x, y) along rot, length vx, half width radius.
//   1 ring:   circle at (x, y), radius radius, gap half angle vx centred on rot, vy gaps (1 or 2,
//             evenly spaced; 0 reads as 1).
//   2 sweep:  vy arms (1 to 3) of length vx from (x, y), first arm at rot, half width radius.
//   3 tether: segment from (x, y) to (vx, vy), half width radius.
//   4 pull:   circle of radius radius around (x, y). Never lethal.
import { HAZARD } from './table';
import { HazardType } from './types';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** Seconds a lethal hazard (or a boss bullet) shows its thin dim form first: 1.0, 0.8, 0.6, 0.6. */
export function hazardTelegraph(tier: number): number {
  if (tier <= 1) return 1.0;
  if (tier === 2) return 0.8;
  return 0.6;
}

/** Smallest full ring gap angle for a tier, radians: 60 deg (tiers 1 and 2), 45 deg (3 and 4). */
export function ringGapMin(tier: number): number {
  return (tier <= 2 ? 60 : 45) * DEG;
}

/** A ring gap half angle raised to the tier minimum and kept under a half turn. */
export function clampRingGapHalf(tier: number, half: number): number {
  const min = ringGapMin(tier) / 2;
  const h = Number.isFinite(half) ? half : min;
  if (h < min) return min;
  return h > Math.PI * 0.49 ? Math.PI * 0.49 : h;
}

/** A lane half width capped so the lane is at most 60 u wide. */
export function clampLaneHalfWidth(half: number): number {
  if (!(half > 0)) return 0;
  return half > HAZARD.laneHalfWidthMax ? HAZARD.laneHalfWidthMax : half;
}

/** Sweep arm count clamped to 1 to 3, so the gaps between arms are at least 120 deg. */
export function clampSweepArms(n: number): number {
  const k = Math.round(n);
  if (!(k >= 1)) return 1;
  return k > HAZARD.sweepArmsMax ? HAZARD.sweepArmsMax : k;
}

/** Angle between neighbouring sweep arms, radians: the gap a sweep leaves. */
export function sweepGap(arms: number): number {
  return TAU / clampSweepArms(arms);
}

/** Wrap an angle into (-pi, pi]. */
export function wrapPi(a: number): number {
  let r = a % TAU;
  if (r > Math.PI) r -= TAU;
  else if (r <= -Math.PI) r += TAU;
  return r;
}

/** Squared distance from (px, py) to the segment (ax, ay) to (bx, by). */
export function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const ex = bx - ax;
  const ey = by - ay;
  const ee = ex * ex + ey * ey;
  let t = ee > 0 ? ((px - ax) * ex + (py - ay) * ey) / ee : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const qx = ax + ex * t - px;
  const qy = ay + ey * t - py;
  return qx * qx + qy * qy;
}

/** True when two circles overlap (touching counts). */
export function circlesOverlap(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const rr = ar + br;
  return dx * dx + dy * dy <= rr * rr;
}

/** Lane: the ship centre within half width plus ship radius of the segment. */
export function laneHits(
  px: number,
  py: number,
  shipR: number,
  x: number,
  y: number,
  rot: number,
  length: number,
  halfWidth: number,
): boolean {
  const r = halfWidth + shipR;
  return segDist2(px, py, x, y, x + Math.cos(rot) * length, y + Math.sin(rot) * length) <= r * r;
}

/** True when angle lies inside one of the ring's gaps (gaps of half angle gapHalf, evenly spaced from gapRot). */
export function inRingGap(angle: number, gapRot: number, gapHalf: number, gaps: number): boolean {
  const n = gaps >= 2 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    if (Math.abs(wrapPi(angle - gapRot - (k * TAU) / n)) <= gapHalf) return true;
  }
  return false;
}

/** Ring: the ship centre within half the band of the radius and outside every gap. */
export function ringHits(
  px: number,
  py: number,
  x: number,
  y: number,
  radius: number,
  gapHalf: number,
  gapRot: number,
  gaps: number,
): boolean {
  const dx = px - x;
  const dy = py - y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (Math.abs(d - radius) > HAZARD.ringBand / 2) return false;
  return !inRingGap(Math.atan2(dy, dx), gapRot, gapHalf, gaps);
}

/** Sweep: the ship centre within half width of any of the arms. */
export function sweepHits(
  px: number,
  py: number,
  x: number,
  y: number,
  rot: number,
  arms: number,
  length: number,
  halfWidth: number,
): boolean {
  const n = clampSweepArms(arms);
  const r2 = halfWidth * halfWidth;
  for (let k = 0; k < n; k++) {
    const a = rot + (k * TAU) / n;
    if (segDist2(px, py, x, y, x + Math.cos(a) * length, y + Math.sin(a) * length) <= r2) return true;
  }
  return false;
}

/** Tether: the ship centre within half width of the segment between the two bodies. */
export function tetherHits(px: number, py: number, x: number, y: number, x2: number, y2: number, halfWidth: number): boolean {
  return segDist2(px, py, x, y, x2, y2) <= halfWidth * halfWidth;
}

/** Pull speed toward the centre at distance d: 0 at and beyond the radius, max x (1 - d / radius)^2 inside. */
export function pullSpeed(d: number, radius: number, max: number): number {
  if (!(radius > 0) || d >= radius) return 0;
  const u = 1 - (d > 0 ? d : 0) / radius;
  return max * u * u;
}

/**
 * One hazard against the ship centre (px, py), with the hazard fields as the render contract
 * stores them. Pull and unknown types are never lethal. Ignores age: callers test the telegraph.
 */
export function hazardHits(
  type: number,
  px: number,
  py: number,
  shipR: number,
  x: number,
  y: number,
  rot: number,
  radius: number,
  vx: number,
  vy: number,
): boolean {
  switch (type) {
    case HazardType.Lane:
      return laneHits(px, py, shipR, x, y, rot, vx, radius);
    case HazardType.Ring:
      return ringHits(px, py, x, y, radius, vx, rot, vy);
    case HazardType.Sweep:
      return sweepHits(px, py, x, y, rot, vy, vx, radius);
    case HazardType.Tether:
      return tetherHits(px, py, x, y, vx, vy, radius);
    default:
      return false;
  }
}

/**
 * Heading after a bounce off a wall whose unit normal (nx, ny) points back into the floor. A
 * heading already leaving the wall (or a zero normal) is returned unchanged.
 */
export function reflectHeading(heading: number, nx: number, ny: number): number {
  const vx = Math.cos(heading);
  const vy = Math.sin(heading);
  const d = vx * nx + vy * ny;
  if (!(d < 0)) return heading;
  return Math.atan2(vy - 2 * d * ny, vx - 2 * d * nx);
}

/** Distance between two points (plain numbers; entity pairs go through steer.ts). */
export function pointDist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Pure: the speed factor of a boss that runs base^(phase - 1) faster each phase. */
export function phaseSpeedUp(base: number, phase: number): number {
  return phase > 1 ? Math.pow(base, phase - 1) : 1;
}

/** True once a hazard of age t is past its telegraph (and so lethal, pull aside). */
export function isLethalAge(t: number, telegraph: number): boolean {
  return t >= telegraph;
}
