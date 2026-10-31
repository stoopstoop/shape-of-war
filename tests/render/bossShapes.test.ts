// Boss and part shape specs (src/render/bossShapes.ts) and their visual slots (shapeSpecs.ts).
import { describe, expect, it } from 'vitest';
import { Kind } from '../../src/game/world';
import { BOSS_OPEN_STEPS, BOSS_RIM_ALPHA, bossColourOf, tierWeight } from '../../src/render/bossLook';
import {
  BOSS_LINE,
  BOSS_SPECS,
  EXPOSED_BOSS_SPECS,
  bossBodyR,
  buildBossSpec,
  buildPartSpec,
  PART_ANCHOR,
  PART_BROODLING,
  PART_POD,
  PART_SPECS,
  PART_TURRET,
  partR,
  partType,
  stepOpenness,
  wardenPlateGeom,
} from '../../src/render/bossShapes';
import { BASE_PALETTE } from '../../src/render/neon';
import {
  ALL_KINDS,
  BOSS_SLOT_BASE,
  bossSlot,
  EXPOSED_SLOT_BASE,
  exposedBossSlot,
  isBossSlot,
  isExposedBossSlot,
  isFloorSlot,
  isPartSlot,
  MAX_SLOT,
  PART_SLOT_BASE,
  partSlot,
  SHAPE_SPECS,
  specFor,
  specForSlot,
  UNKNOWN_SPEC,
  type ShapeSpec,
} from '../../src/render/shapeSpecs';

const V3_KINDS = [Kind.Boss, Kind.BossPart, Kind.BossHazard, Kind.DronePickup, Kind.DroneTwin];

/** Largest radius of any non boss registry kind (enemies are at most 24 u). */
function largestEnemyRadius(): number {
  let r = 0;
  for (const k of ALL_KINDS) {
    // Slime is a floor puddle, not an enemy body; the boss kinds are what is being compared.
    if (k === Kind.Boss || k === Kind.BossPart || k === Kind.BossHazard || k === Kind.Slime) continue;
    r = Math.max(r, SHAPE_SPECS[k].radius);
  }
  return r;
}

function whiteCoreFill(spec: ShapeSpec): number {
  const core = spec.layers.find((l) => l.colour === 'white');
  return core?.fill ?? -1;
}

describe('V3 registry entries', () => {
  it('covers the five new Kinds with real entries, never the magenta glyph', () => {
    for (const k of V3_KINDS) {
      expect(ALL_KINDS).toContain(k);
      const s = specFor(k);
      expect(s).not.toBe(UNKNOWN_SPEC);
      expect(s.layers.length).toBeGreaterThan(0);
      for (const l of s.layers) if (l.colour !== null) expect(Object.keys(BASE_PALETTE)).toContain(l.colour);
    }
  });

  it('the boss entry is the Warden shut and bakes its colour (tint stays white)', () => {
    expect(SHAPE_SPECS[Kind.Boss]).toEqual(buildBossSpec(0, 0));
    expect(SHAPE_SPECS[Kind.Boss].tint).toBeNull();
  });
});

describe('boss slots', () => {
  it('one slot per boss index and openness step, then one per part type and tier', () => {
    expect(BOSS_SPECS).toHaveLength(10 * BOSS_OPEN_STEPS);
    expect(PART_SPECS).toHaveLength(16);
    expect(bossSlot(0, 0)).toBe(BOSS_SLOT_BASE);
    expect(bossSlot(9, BOSS_OPEN_STEPS - 1)).toBe(PART_SLOT_BASE - 1);
    expect(partSlot(PART_BROODLING, 4)).toBe(EXPOSED_SLOT_BASE - 1);
    expect(partSlot(PART_TURRET, 4)).toBe(EXPOSED_SLOT_BASE - 5);
    expect(exposedBossSlot(9, BOSS_OPEN_STEPS - 1)).toBe(MAX_SLOT);
    for (let id = 0; id < 10; id++) {
      for (let s = 0; s < BOSS_OPEN_STEPS; s++) {
        const slot = bossSlot(id, s);
        expect(isBossSlot(slot)).toBe(true);
        expect(isPartSlot(slot)).toBe(false);
        expect(isFloorSlot(slot)).toBe(false);
        expect(specForSlot(slot)).toBe(BOSS_SPECS[id * BOSS_OPEN_STEPS + s]);
      }
    }
    for (let a = 0; a < 3; a++) {
      for (let t = 1; t <= 4; t++) {
        const slot = partSlot(a, t);
        expect(isPartSlot(slot)).toBe(true);
        expect(isFloorSlot(slot)).toBe(false);
        expect(specForSlot(slot)).toBe(PART_SPECS[a * 4 + t - 1]);
      }
    }
  });

  it('out of range ids, steps and part types clamp to valid slots', () => {
    expect(bossSlot(-1, 0)).toBe(bossSlot(0, 0));
    expect(bossSlot(99, 0)).toBe(bossSlot(0, 0));
    expect(bossSlot(0, 99)).toBe(bossSlot(0, BOSS_OPEN_STEPS - 1));
    expect(bossSlot(0, Number.NaN)).toBe(bossSlot(0, 0));
    expect(partSlot(7, 9)).toBe(partSlot(PART_POD, 1));
    expect(partType(PART_ANCHOR)).toBe(PART_ANCHOR);
    expect(partType(-2)).toBe(PART_POD);
  });

  it('exposed slots (ED1): one per boss and step after the parts, coreless, white, same geometry', () => {
    expect(EXPOSED_BOSS_SPECS).toHaveLength(BOSS_SPECS.length);
    expect(EXPOSED_SLOT_BASE).toBe(PART_SLOT_BASE + 16);
    for (let id = 0; id < 10; id++) {
      for (let s = 0; s < BOSS_OPEN_STEPS; s++) {
        const slot = exposedBossSlot(id, s);
        expect(slot).toBe(EXPOSED_SLOT_BASE + id * BOSS_OPEN_STEPS + s);
        expect(isExposedBossSlot(slot)).toBe(true);
        expect(isBossSlot(slot)).toBe(false);
        expect(isPartSlot(slot)).toBe(false);
        expect(isFloorSlot(slot)).toBe(false);
        expect(isExposedBossSlot(bossSlot(id, s))).toBe(false);
        const base = BOSS_SPECS[id * BOSS_OPEN_STEPS + s];
        const exp = specForSlot(slot);
        expect(exp).toBe(EXPOSED_BOSS_SPECS[id * BOSS_OPEN_STEPS + s]);
        expect(exp.tint).toBeNull();
        expect(exp.radius).toBe(base?.radius);
        // The white core layer is gone (the cue draws it as fragments); every other layer is kept,
        // drawn white so the view tint carries the tier colour or the hot red flicker.
        const kept = (base?.layers ?? []).filter((l) => l.colour !== 'white');
        expect(kept.length).toBe((base?.layers.length ?? 0) - 1);
        expect(exp.layers).toHaveLength(kept.length);
        exp.layers.forEach((l, k) => {
          expect(l.colour).toBeNull();
          expect(l.prims).toBe(kept[k]?.prims);
          expect(l.width).toBe(kept[k]?.width);
          expect(l.alpha).toBe(kept[k]?.alpha);
          expect(l.fill).toBe(kept[k]?.fill);
        });
      }
    }
    expect(exposedBossSlot(99, 99)).toBe(exposedBossSlot(0, BOSS_OPEN_STEPS - 1));
  });
});

describe('boss silhouettes', () => {
  it('every boss state has a second concentric rim at 0.6 alpha in its colour', () => {
    for (let id = 0; id < 10; id++) {
      for (let s = 0; s < BOSS_OPEN_STEPS; s++) {
        const spec = buildBossSpec(id, s);
        expect(spec.tint).toBeNull();
        const rim = spec.layers.find((l) => l.alpha === BOSS_RIM_ALPHA);
        expect(rim, `boss ${id} step ${s}`).toBeDefined();
        expect(rim?.colour).toBe(bossColourOf(id));
        expect(rim?.prims[0]?.t).toBe('circle');
      }
    }
  });

  it('a boss is at least 44 u and well over the largest enemy, so it never reads as one', () => {
    const enemy = largestEnemyRadius();
    expect(enemy).toBeLessThanOrEqual(30);
    for (let id = 0; id < 10; id++) {
      expect(bossBodyR(id)).toBeGreaterThanOrEqual(44);
      expect(bossBodyR(id)).toBeLessThanOrEqual(90);
      // Drawn extent (rim included) against the largest drawn enemy (the Bulwark with its shield).
      expect(buildBossSpec(id, 0).radius).toBeGreaterThan(enemy * 1.8);
    }
  });

  it('line widths carry the tier weight, and tier 3 widens its outer glow', () => {
    for (let id = 0; id < 10; id++) {
      const spec = buildBossSpec(id, 0);
      const outline = spec.layers[0];
      const tier = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4][id] ?? 1;
      expect(outline?.width).toBeCloseTo(BOSS_LINE * tierWeight(tier), 6);
      expect(outline?.haloMul).toBe(tier === 3 ? 1.5 : 1);
    }
  });

  it('every boss has a white core that brightens as it opens', () => {
    for (let id = 0; id < 10; id++) {
      const shut = whiteCoreFill(buildBossSpec(id, 0));
      const open = whiteCoreFill(buildBossSpec(id, BOSS_OPEN_STEPS - 1));
      expect(shut).toBeGreaterThan(0);
      expect(open).toBe(1);
      expect(open).toBeGreaterThan(shut);
    }
  });

  it('Warden shell closed and open: six plates that slide out and narrow as it opens', () => {
    const shut = buildBossSpec(0, 0);
    const open = buildBossSpec(0, BOSS_OPEN_STEPS - 1);
    expect(shut.layers[0]?.prims).toHaveLength(6);
    expect(JSON.stringify(shut.layers[0])).not.toBe(JSON.stringify(open.layers[0]));
    const g0 = wardenPlateGeom(0, 56);
    const g1 = wardenPlateGeom(1, 56);
    expect(g1.rIn).toBeGreaterThan(g0.rIn);
    expect(g1.half).toBeLessThan(g0.half);
    // The open plates still sit inside the rim.
    expect(g1.rOut).toBeLessThan(56 * 1.18);
  });

  it('Brood membrane fades as the core opens; Spindle is a four point star', () => {
    const shut = buildBossSpec(1, 0);
    const open = buildBossSpec(1, BOSS_OPEN_STEPS - 1);
    expect(shut.layers[1]?.alpha).toBeGreaterThan(open.layers[1]?.alpha ?? 1);
    const star = buildBossSpec(2, 0).layers[0]?.prims[0];
    expect(star?.t).toBe('poly');
    if (star?.t === 'poly') expect(star.pts).toHaveLength(16);
  });

  it('step openness maps steps to 0, 0.25, 0.5, 0.75, 1', () => {
    expect([0, 1, 2, 3, 4].map(stepOpenness)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
});

describe('boss parts', () => {
  it('pods, anchors and turrets are drawn white (tinted with the boss colour per frame)', () => {
    for (const a of [PART_POD, PART_ANCHOR, PART_TURRET]) {
      for (let t = 1; t <= 4; t++) {
        const spec = buildPartSpec(a, t);
        expect(spec.tint).toBeNull();
        for (const l of spec.layers) expect(l.colour).toBeNull();
        expect(spec.layers[0]?.width).toBeCloseTo(1.6 * tierWeight(t), 6);
        expect(spec.radius).toBeGreaterThan(partR(a));
      }
    }
  });

  it('three distinct part silhouettes', () => {
    const shapes = [PART_POD, PART_ANCHOR, PART_TURRET].map((a) => JSON.stringify(buildPartSpec(a, 1).layers[0]?.prims));
    expect(new Set(shapes).size).toBe(3);
  });
});
