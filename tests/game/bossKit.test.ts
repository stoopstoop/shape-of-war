// Hazard primitive geometry (docs/13 "Hazard primitives"): inside, outside, edge and gap for each
// of the five, the tier telegraph minimums and the fairness clamps.
import { describe, expect, it } from 'vitest';
import {
  circlesOverlap,
  clampLaneHalfWidth,
  clampRingGapHalf,
  clampSweepArms,
  hazardHits,
  hazardTelegraph,
  inRingGap,
  isLethalAge,
  laneHits,
  pullSpeed,
  ringGapMin,
  ringHits,
  segDist2,
  sweepGap,
  sweepHits,
  tetherHits,
  wrapPi,
} from '../../src/game/bosses/kit';
import { HAZARD } from '../../src/game/bosses/table';
import { HazardType } from '../../src/game/bosses/types';

const DEG = Math.PI / 180;
const SHIP_R = 10;

describe('telegraph per tier', () => {
  it('is 1.0 s, 0.8 s, 0.6 s and 0.6 s, never below the tier minimum', () => {
    expect([1, 2, 3, 4].map(hazardTelegraph)).toEqual([1.0, 0.8, 0.6, 0.6]);
    for (const t of [1, 2, 3, 4]) expect(hazardTelegraph(t)).toBeGreaterThanOrEqual(0.6);
  });

  it('a hazard is lethal only once its age reaches the telegraph', () => {
    expect(isLethalAge(0.99, 1)).toBe(false);
    expect(isLethalAge(1, 1)).toBe(true);
  });

  it('ring gap minimum is 60 deg in tiers 1 and 2 and 45 deg in tiers 3 and 4', () => {
    expect(ringGapMin(1) / DEG).toBeCloseTo(60);
    expect(ringGapMin(2) / DEG).toBeCloseTo(60);
    expect(ringGapMin(3) / DEG).toBeCloseTo(45);
    expect(ringGapMin(4) / DEG).toBeCloseTo(45);
    expect(clampRingGapHalf(1, 5 * DEG) * 2).toBeCloseTo(60 * DEG);
    expect(clampRingGapHalf(3, 5 * DEG) * 2).toBeCloseTo(45 * DEG);
    expect(clampRingGapHalf(1, 35 * DEG)).toBeCloseTo(35 * DEG);
  });

  it('a lane is at most 60 u wide and a sweep keeps gaps of at least 90 deg', () => {
    expect(clampLaneHalfWidth(80) * 2).toBe(60);
    expect(clampLaneHalfWidth(22)).toBe(22);
    expect(clampLaneHalfWidth(-3)).toBe(0);
    for (const n of [0, 1, 2, 3, 4, 9]) expect(sweepGap(n)).toBeGreaterThanOrEqual(90 * DEG);
    expect(clampSweepArms(9)).toBe(3);
    expect(clampSweepArms(0)).toBe(1);
  });
});

describe('helpers', () => {
  it('segDist2 measures to the nearest point of the segment, ends included', () => {
    expect(segDist2(5, 3, 0, 0, 10, 0)).toBeCloseTo(9);
    expect(segDist2(-4, 0, 0, 0, 10, 0)).toBeCloseTo(16);
    expect(segDist2(13, 4, 0, 0, 10, 0)).toBeCloseTo(25);
    expect(segDist2(1, 1, 0, 0, 0, 0)).toBeCloseTo(2);
  });

  it('wrapPi keeps angles in (-pi, pi]', () => {
    expect(wrapPi(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapPi(-3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapPi(0.5)).toBeCloseTo(0.5);
  });

  it('circlesOverlap counts touching', () => {
    expect(circlesOverlap(0, 0, 5, 10, 0, 5)).toBe(true);
    expect(circlesOverlap(0, 0, 5, 10.01, 0, 5)).toBe(false);
  });
});

describe('lane', () => {
  // From (0, 0) along +x, 600 long, half width 22: lethal within 22 + 10 of the segment.
  const hit = (px: number, py: number): boolean => laneHits(px, py, SHIP_R, 0, 0, 0, HAZARD.laneLength, HAZARD.laneHalfWidth);
  it('inside', () => expect(hit(300, 0)).toBe(true));
  it('outside', () => {
    expect(hit(300, 40)).toBe(false);
    expect(hit(-50, 0)).toBe(false);
    expect(hit(700, 0)).toBe(false);
  });
  it('edge: half width plus ship radius is lethal, a hair beyond is not', () => {
    expect(hit(300, 32)).toBe(true);
    expect(hit(300, 32.01)).toBe(false);
  });
  it('follows its rotation', () => {
    expect(laneHits(0, 300, SHIP_R, 0, 0, Math.PI / 2, 600, 22)).toBe(true);
    expect(laneHits(300, 0, SHIP_R, 0, 0, Math.PI / 2, 600, 22)).toBe(false);
  });
});

describe('ring', () => {
  // Radius 200, gap of half angle 35 deg centred on +x.
  const hit = (px: number, py: number, gaps = 1): boolean => ringHits(px, py, 0, 0, 200, 35 * DEG, 0, gaps);
  it('inside the band', () => {
    expect(hit(0, 200)).toBe(true);
    expect(hit(-203, 0)).toBe(true);
  });
  it('outside the band', () => {
    expect(hit(0, 100)).toBe(false);
    expect(hit(0, 260)).toBe(false);
  });
  it('edge: 7 u from the radius is lethal, beyond is not', () => {
    expect(hit(0, 207)).toBe(true);
    expect(hit(0, 207.01)).toBe(false);
    expect(hit(0, 193)).toBe(true);
    expect(hit(0, 192.99)).toBe(false);
  });
  it('gap: safe inside the gap, lethal just past its edge', () => {
    expect(hit(200, 0)).toBe(false);
    const inA = 34 * DEG;
    const outA = 36 * DEG;
    expect(hit(Math.cos(inA) * 200, Math.sin(inA) * 200)).toBe(false);
    expect(hit(Math.cos(outA) * 200, Math.sin(outA) * 200)).toBe(true);
  });
  it('two gaps: the second sits opposite the first', () => {
    expect(hit(-200, 0, 2)).toBe(false);
    expect(hit(-200, 0, 1)).toBe(true);
    expect(inRingGap(Math.PI, 0, 35 * DEG, 2)).toBe(true);
    expect(inRingGap(Math.PI / 2, 0, 35 * DEG, 2)).toBe(false);
  });
});

describe('sweep', () => {
  // Two arms of 380 from (0, 0), first along +x, half width 12.
  const hit = (px: number, py: number, arms = 2): boolean => sweepHits(px, py, 0, 0, 0, arms, HAZARD.sweepLength, HAZARD.sweepHalfWidth);
  it('inside an arm, either arm', () => {
    expect(hit(200, 0)).toBe(true);
    expect(hit(-200, 0)).toBe(true);
  });
  it('outside: the 180 deg gaps between two arms are safe, and past the tip', () => {
    expect(hit(0, 200)).toBe(false);
    expect(hit(0, -200)).toBe(false);
    expect(hit(400, 0)).toBe(false);
  });
  it('edge: half width from the arm', () => {
    expect(hit(200, 12)).toBe(true);
    expect(hit(200, 12.01)).toBe(false);
  });
  it('three arms sit 120 deg apart', () => {
    const a = 120 * DEG;
    expect(hit(Math.cos(a) * 200, Math.sin(a) * 200, 3)).toBe(true);
    expect(hit(-200, 0, 3)).toBe(false);
  });
});

describe('tether', () => {
  const hit = (px: number, py: number): boolean => tetherHits(px, py, -300, 0, 300, 0, HAZARD.tetherHalfWidth);
  it('inside', () => expect(hit(0, 0)).toBe(true));
  it('outside', () => {
    expect(hit(0, 30)).toBe(false);
    expect(hit(320, 0)).toBe(false);
  });
  it('edge', () => {
    expect(hit(100, 10)).toBe(true);
    expect(hit(100, 10.01)).toBe(false);
  });
});

describe('pull', () => {
  it('is strongest at the centre, at most 100 u/s, and 0 at and beyond the radius', () => {
    expect(pullSpeed(0, HAZARD.pullRadius, HAZARD.pullMax)).toBe(100);
    expect(pullSpeed(150, 300, 100)).toBeCloseTo(25);
    expect(pullSpeed(300, 300, 100)).toBe(0);
    expect(pullSpeed(500, 300, 100)).toBe(0);
    for (let d = 0; d < 300; d += 7) expect(pullSpeed(d, 300, 100)).toBeLessThanOrEqual(100);
  });
  it('is never lethal', () => {
    expect(hazardHits(HazardType.Pull, 0, 0, SHIP_R, 0, 0, 0, 300, 0, 0)).toBe(false);
  });
});

describe('hazardHits dispatch reads the render contract fields', () => {
  it('lane: rot, vx length, radius half width', () => {
    expect(hazardHits(HazardType.Lane, 300, 0, SHIP_R, 0, 0, 0, 22, 600, 0)).toBe(true);
    expect(hazardHits(HazardType.Lane, 300, 50, SHIP_R, 0, 0, 0, 22, 600, 0)).toBe(false);
  });
  it('ring: radius, vx gap half angle, rot gap centre, vy gaps', () => {
    expect(hazardHits(HazardType.Ring, 0, 200, SHIP_R, 0, 0, 0, 200, 35 * DEG, 1)).toBe(true);
    expect(hazardHits(HazardType.Ring, 200, 0, SHIP_R, 0, 0, 0, 200, 35 * DEG, 1)).toBe(false);
  });
  it('sweep: rot first arm, vx length, vy arms, radius half width', () => {
    expect(hazardHits(HazardType.Sweep, 0, 200, SHIP_R, 0, 0, Math.PI / 2, 12, 380, 2)).toBe(true);
    expect(hazardHits(HazardType.Sweep, 200, 0, SHIP_R, 0, 0, Math.PI / 2, 12, 380, 2)).toBe(false);
  });
  it('tether: (vx, vy) second body, radius half width', () => {
    expect(hazardHits(HazardType.Tether, 50, 50, SHIP_R, 0, 0, 0, 10, 100, 100)).toBe(true);
    expect(hazardHits(HazardType.Tether, 50, 0, SHIP_R, 0, 0, 0, 10, 100, 100)).toBe(false);
  });
});
