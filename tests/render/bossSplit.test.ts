// v31 Brood split: the Broodling part spec and slot (bossShapes.ts, shapeSpecs.ts) and the split
// burst helpers (bossSplit.ts). Checked against the sim constants so the two cannot drift.
import { describe, expect, it } from 'vitest';
import { BROODLING } from '../../src/game/bosses/table';
import { PartType } from '../../src/game/bosses/types';
import { BOSS_BROOD, BOSS_BURST_CAP, bossColourOf, bossDeathBurst, tierWeight } from '../../src/render/bossLook';
import { accentRgb, bossAccent, bossPartTint } from '../../src/render/bossIdentity';
import {
  BROODLING_R,
  bossBodyR,
  broodlingEdge,
  broodlingNose,
  broodlingSpec,
  buildPartSpec,
  isBroodlingPart,
  isTwinPart,
  PART_ANCHOR,
  PART_BROODLING,
  PART_POD,
  PART_SPEC_TYPES,
  PART_SPECS,
  PART_TURRET,
  PART_TYPES,
  partR,
  partSpecIndex,
  partType,
} from '../../src/render/bossShapes';
import { palette } from '../../src/render/neon';
import {
  SPLIT_HOT_SHARE,
  SPLIT_LIFE_MAX,
  SPLIT_LIFE_MIN,
  SPLIT_SHARDS,
  SPLIT_SPEED_MAX,
  SPLIT_SPEED_MIN,
  splitCoord,
  splitHotCount,
  splitKey,
  splitShardCount,
} from '../../src/render/bossSplit';
import {
  EXPOSED_SLOT_BASE,
  isFloorSlot,
  isPartSlot,
  PART_SLOT_BASE,
  partSlot,
  partVisualSlot,
  specForSlot,
  type ShapePrim,
} from '../../src/render/shapeSpecs';

function polyPts(p: ShapePrim | undefined): number[] {
  return p !== undefined && p.t === 'poly' ? [...p.pts] : [];
}

describe('Broodling part spec', () => {
  it('matches the sim: part type 4 at the sim radius, so the draw scale is exactly 1', () => {
    expect(PART_BROODLING).toBe(PartType.Broodling);
    expect(PART_BROODLING).toBe(4);
    expect(BROODLING_R).toBe(BROODLING.radius);
    expect(partR(PART_BROODLING)).toBe(BROODLING.radius);
    expect(BROODLING.radius / partR(PART_BROODLING)).toBe(1);
  });

  it('is its own part kind: not a white pod, not the twin, and the other part helpers are unchanged', () => {
    expect(isBroodlingPart(4)).toBe(true);
    for (const a of [PART_POD, PART_ANCHOR, PART_TURRET, 3, -1, 5]) expect(isBroodlingPart(a)).toBe(false);
    expect(isTwinPart(PART_BROODLING)).toBe(false);
    expect(partType(PART_BROODLING)).toBe(PART_POD);
    expect(partSpecIndex(PART_POD)).toBe(0);
    expect(partSpecIndex(PART_ANCHOR)).toBe(1);
    expect(partSpecIndex(PART_TURRET)).toBe(2);
    expect(partSpecIndex(PART_BROODLING)).toBe(3);
    expect(partSpecIndex(3)).toBe(0);
    expect(PART_SPEC_TYPES).toHaveLength(PART_TYPES);
  });

  it('bakes Brood two tone: green body and nose, yellow pod, view tint stays white', () => {
    for (let t = 1; t <= 4; t++) {
      const spec = buildPartSpec(PART_BROODLING, t);
      expect(spec).toEqual(broodlingSpec(t));
      expect(spec.tint).toBeNull();
      expect(spec.layers.map((l) => l.colour)).toEqual([bossColourOf(BOSS_BROOD), bossColourOf(BOSS_BROOD), 'yellow']);
      expect(spec.layers[0]?.width).toBeCloseTo(1.6 * tierWeight(t), 6);
      expect(spec.radius).toBeGreaterThan(BROODLING_R);
    }
  });

  it('the yellow is the Brood pods accent, unmixed, and the green is the boss colour', () => {
    const accent = bossAccent(BOSS_BROOD, 'pods');
    expect(accent).not.toBeNull();
    if (accent === null) return;
    expect(accent.key).toBe('yellow');
    expect(accent.white).toBe(0);
    expect(accent.black).toBe(0);
    expect(accentRgb(accent, palette)).toBe(palette.yellow);
    expect(bossPartTint(BOSS_BROOD, palette.bossGreen, palette)).toBe(palette.yellow);
    expect(bossColourOf(BOSS_BROOD)).toBe('bossGreen');
    expect(splitKey()).toBe('bossGreen');
  });

  it('the pod is solid yellow with no halo of its own, the body and nose carry the glow', () => {
    const [body, nose, pod] = broodlingSpec(1).layers;
    expect(body?.glow).toBe(true);
    expect(nose?.glow).toBe(true);
    expect(pod?.glow).toBe(false);
    expect(pod?.fill ?? 0).toBeGreaterThan(0.5);
    expect(pod?.prims[0]).toMatchObject({ t: 'circle' });
  });

  it('the nose points along +x (the heading): its tip is the furthest point on the axis, ahead of the body', () => {
    const pts = polyPts(broodlingNose(BROODLING_R));
    expect(pts).toHaveLength(6);
    const tipX = pts[0] ?? 0;
    expect(pts[1]).toBe(0);
    expect(tipX).toBeGreaterThan(broodlingEdge(0, BROODLING_R));
    for (let k = 2; k < pts.length; k += 2) expect(pts[k] ?? 0).toBeLessThan(tipX);
    // Symmetric about the heading axis.
    expect(pts[3]).toBe(-(pts[5] ?? 0));
  });

  it('stays honest to the hit circle: the body is inside it and the nose pokes out by under 15 percent', () => {
    for (let k = 0; k < 64; k++) expect(broodlingEdge((k / 64) * Math.PI * 2, BROODLING_R)).toBeLessThanOrEqual(BROODLING_R);
    expect(polyPts(broodlingNose(BROODLING_R))[0] ?? 0).toBeLessThan(BROODLING_R * 1.15);
    const body = broodlingSpec(1).layers[0]?.prims[0];
    const pts = polyPts(body);
    expect(pts.length).toBeGreaterThanOrEqual(48);
    for (let k = 0; k < pts.length; k += 2) expect(Math.hypot(pts[k] ?? 0, pts[k + 1] ?? 0)).toBeLessThanOrEqual(BROODLING_R);
  });

  it('is clearly smaller than the Brood body and larger than a pod', () => {
    expect(BROODLING_R).toBeGreaterThan(partR(PART_POD));
    expect(BROODLING_R).toBeLessThan(bossBodyR(BOSS_BROOD) / 2);
  });
});

describe('Broodling slot', () => {
  it('has its own slot per tier inside the part range, below the exposed slots', () => {
    for (let t = 1; t <= 4; t++) {
      const slot = partSlot(PART_BROODLING, t);
      expect(isPartSlot(slot)).toBe(true);
      expect(isFloorSlot(slot)).toBe(false);
      expect(slot).toBeGreaterThanOrEqual(PART_SLOT_BASE);
      expect(slot).toBeLessThan(EXPOSED_SLOT_BASE);
      expect(specForSlot(slot)).toBe(PART_SPECS[3 * 4 + t - 1]);
      expect(specForSlot(slot)).toEqual(broodlingSpec(t));
    }
  });

  it('never shares a slot with another part type, and the others keep their slots', () => {
    const seen = new Set<number>();
    for (const a of [PART_POD, PART_ANCHOR, PART_TURRET, PART_BROODLING]) {
      for (let t = 1; t <= 4; t++) seen.add(partSlot(a, t));
    }
    expect(seen.size).toBe(16);
    expect(partSlot(PART_POD, 1)).toBe(PART_SLOT_BASE);
    expect(partSlot(PART_TURRET, 1)).toBe(PART_SLOT_BASE + 8);
  });

  it('draws as itself whatever the boss openness or exposure (it is not a twin body)', () => {
    for (const tier of [1, 2, 3, 4]) {
      for (const step of [0, 2, 4]) {
        for (const coreless of [false, true]) {
          expect(partVisualSlot(PART_BROODLING, tier, step, coreless)).toBe(partSlot(PART_BROODLING, tier));
        }
      }
    }
  });
});

describe('split burst', () => {
  it('shard counts grow with the effects tier and stay small beside the boss death burst', () => {
    expect(SPLIT_SHARDS.low).toBeLessThan(SPLIT_SHARDS.standard);
    expect(SPLIT_SHARDS.standard).toBeLessThan(SPLIT_SHARDS.high);
    for (const t of ['low', 'standard', 'high'] as const) {
      expect(splitShardCount(t)).toBe(SPLIT_SHARDS[t]);
      expect(splitShardCount(t)).toBeLessThan(bossDeathBurst(t, 1) / 3);
      expect(splitShardCount(t)).toBeLessThan(BOSS_BURST_CAP[t]);
    }
    expect(splitShardCount('bogus')).toBe(SPLIT_SHARDS.standard);
  });

  it('splits the shards into hot and plain green with nothing lost or invented', () => {
    for (const n of [0, 1, 48, 110, 200]) {
      const hot = splitHotCount(n);
      expect(hot).toBeGreaterThanOrEqual(0);
      expect(hot).toBeLessThanOrEqual(n);
      expect(hot).toBe(Math.min(n, Math.round(n * SPLIT_HOT_SHARE)));
      expect(n - hot + hot).toBe(n);
    }
  });

  it('speeds and lives are positive ranges', () => {
    expect(SPLIT_SPEED_MIN).toBeGreaterThan(0);
    expect(SPLIT_SPEED_MAX).toBeGreaterThan(SPLIT_SPEED_MIN);
    expect(SPLIT_LIFE_MIN).toBeGreaterThan(0);
    expect(SPLIT_LIFE_MAX).toBeGreaterThan(SPLIT_LIFE_MIN);
  });

  it('the burst position falls back only when the drawn position is not finite', () => {
    expect(splitCoord(120, 0)).toBe(120);
    expect(splitCoord(-35.5, 9)).toBe(-35.5);
    expect(splitCoord(Number.NaN, 7)).toBe(7);
    expect(splitCoord(Number.POSITIVE_INFINITY, 0)).toBe(0);
  });
});
