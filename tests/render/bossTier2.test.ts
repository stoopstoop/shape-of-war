// Tier 2 boss visuals (docs/12 wave V3-B Glow brief): Ember, Mirage and Gravitas specs and slots,
// the tier 2 line weight, the pure helpers (arc openness, afterimage alpha, anchor tether alpha,
// Ember lane, trails and Mine pulse), the sprite planners and the bounded Gravitas lattice pull.
import { describe, expect, it } from 'vitest';
import { Kind } from '../../src/game/world';
import {
  BOSS_EMBER,
  BOSS_GRAVITAS,
  BOSS_MIRAGE,
  BOSS_OPEN_STEPS,
  BOSS_RIM_ALPHA,
  bossColourOf,
  bossTierOf,
  MODE_ATTACKING,
  MODE_DYING,
  MODE_ENTERING,
  MODE_GUARDED,
  MODE_PHASE,
  MODE_STUNNED,
  MODE_VULNERABLE,
  TIER_LINE_WEIGHT,
  tierWeight,
} from '../../src/render/bossLook';
import {
  BOSS_LINE,
  BOSS_SPECS,
  bossBodyR,
  buildBossSpec,
  buildPartSpec,
  emberArrow,
  EMBER_NOSE,
  EXPOSED_BOSS_SPECS,
  GRAVITAS_RINGS,
  mirageShield,
  PART_ANCHOR,
} from '../../src/render/bossShapes';
import {
  AFTERIMAGE_A0,
  AFTERIMAGE_SEC,
  afterimageAlpha,
  afterimageScale,
  ANCHOR_TETHER_A,
  anchorSpokeAlpha,
  anchorTetherAlpha,
  EMBER_LANE_A1,
  EMBER_LANE_LEN,
  EMBER_SPARK_RATE,
  emberDashing,
  emberFlameRate,
  emberLaneAlpha,
  emberSparkRate,
  GRAVITAS_LATTICE_R,
  GRAVITAS_PULL_FLOOR,
  gravitasLatticeAccel,
  gravitasPullShare,
  landingSparks,
  MINE_PULSE_AMP,
  MINE_PULSE_GLOW,
  mineGlow,
  minePulse,
  MIRAGE_ARC_HALF,
  mirageArcHalf,
  mirageArcOpenness,
  mirageWindowGlow,
  warpJumped,
  WARP_JUMP_U,
} from '../../src/render/bossTier2';
import { arcChords, planAnchorTethers, planEmberLane, planMirageArc, TETHER_ANCHORS_MAX } from '../../src/render/bossTier2Fx';
import type { EffectsTier } from '../../src/render/effects';
import { countFrame, createSpriteBuf, F_BAR, F_FILL, F_GLOW, F_SOFT, type FxHalo } from '../../src/render/fxSprites';
import { buildLattice } from '../../src/render/lattice/layout';
import { BOSS_PULL_ACCEL, WELL_PULL_ACCEL } from '../../src/render/lattice/kicks';
import { addForce, clearForces, createLatticeSim, maxDispFor, maxDisplacement, stepLattice } from '../../src/render/lattice/sim';
import { ALL_KINDS, bossSlot, exposedBossSlot, SHAPE_SPECS, specFor, specForSlot, UNKNOWN_SPEC } from '../../src/render/shapeSpecs';
import { arena } from './lattice/fixtures';

const TIER2 = [BOSS_EMBER, BOSS_MIRAGE, BOSS_GRAVITAS] as const;
const TIERS: readonly EffectsTier[] = ['low', 'standard', 'high'];
const NO_HALO: FxHalo = { alpha: 0, width: 0 };
const HALO: FxHalo = { alpha: 0.5, width: 1.2 };

describe('tier 2 registry coverage', () => {
  it('every Kind still has a registry entry, never the unknown glyph', () => {
    for (const k of ALL_KINDS) {
      expect(SHAPE_SPECS[k], `kind ${k}`).toBeDefined();
      expect(specFor(k)).not.toBe(UNKNOWN_SPEC);
    }
    expect(specFor(Kind.Boss)).not.toBe(UNKNOWN_SPEC);
  });

  it('Ember, Mirage and Gravitas have a slot and a spec per openness step, plus exposed variants', () => {
    for (const id of TIER2) {
      for (let s = 0; s < BOSS_OPEN_STEPS; s++) {
        const spec = specForSlot(bossSlot(id, s));
        expect(spec).not.toBe(UNKNOWN_SPEC);
        expect(spec).toBe(BOSS_SPECS[id * BOSS_OPEN_STEPS + s]);
        const ex = specForSlot(exposedBossSlot(id, s));
        expect(ex).toBe(EXPOSED_BOSS_SPECS[id * BOSS_OPEN_STEPS + s]);
        expect(ex.layers.some((l) => l.colour === 'white')).toBe(false);
      }
    }
  });

  it('they are their own shapes, not the generic placeholder polygon', () => {
    for (const id of TIER2) {
      const first = buildBossSpec(id, 0).layers[0]?.prims[0];
      expect(first?.t, `boss ${id}`).not.toBe('regularPoly');
    }
    // Ember: an arrowhead with its nose on +x past the rim.
    expect(buildBossSpec(BOSS_EMBER, 0).layers[0]?.prims[0]).toEqual(emberArrow(bossBodyR(BOSS_EMBER)));
    expect(buildBossSpec(BOSS_EMBER, 0).radius).toBeCloseTo(EMBER_NOSE * bossBodyR(BOSS_EMBER), 1);
    // Mirage: an open shield ring whose gap is centred on +x.
    expect(buildBossSpec(BOSS_MIRAGE, 0).layers[0]?.prims[0]).toEqual(mirageShield(bossBodyR(BOSS_MIRAGE)));
    // Gravitas: three concentric rings (outer, three arc middle, inner) around a filled core.
    const g = buildBossSpec(BOSS_GRAVITAS, 0).layers;
    expect(g[0]?.prims[0]).toEqual({ t: 'circle', r: Math.round(GRAVITAS_RINGS[0] * 60 * 100) / 100 });
    expect(g[1]?.prims).toHaveLength(3);
    expect(g[2]?.prims[0]?.t).toBe('circle');
    expect(g[3]?.fill).toBeGreaterThan(0.4);
  });

  it('body radii match the boss table (Ember 44, Mirage 50, Gravitas 60) and keep the rim', () => {
    expect(TIER2.map(bossBodyR)).toEqual([44, 50, 60]);
    for (const id of TIER2) {
      const rim = buildBossSpec(id, 2).layers.find((l) => l.alpha === BOSS_RIM_ALPHA);
      expect(rim?.colour).toBe(bossColourOf(id));
    }
  });

  it('the Mirage shield gap spans 70 degrees: the ring starts and ends at plus and minus 35', () => {
    const p = mirageShield(50);
    expect(p.t).toBe('line');
    if (p.t !== 'line') return;
    const a0 = Math.atan2(p.pts[1] ?? 0, p.pts[0] ?? 0);
    const n = p.pts.length;
    const a1 = Math.atan2(p.pts[n - 1] ?? 0, p.pts[n - 2] ?? 0);
    expect(a0).toBeCloseTo(MIRAGE_ARC_HALF, 2);
    expect(a1).toBeCloseTo(-MIRAGE_ARC_HALF, 2);
  });

  it('cores brighten as the boss opens', () => {
    for (const id of TIER2) {
      const shut = buildBossSpec(id, 0).layers.find((l) => l.colour === 'white')?.fill ?? 0;
      const open = buildBossSpec(id, BOSS_OPEN_STEPS - 1).layers.find((l) => l.colour === 'white')?.fill ?? 0;
      expect(open).toBe(1);
      expect(open).toBeGreaterThan(shut);
    }
  });
});

describe('tier 2 line weight', () => {
  it('tier 2 is x2.0 on the boss layer', () => {
    expect(TIER_LINE_WEIGHT[2]).toBe(2.0);
    for (const id of TIER2) {
      expect(bossTierOf(id)).toBe(2);
      for (let s = 0; s < BOSS_OPEN_STEPS; s++) expect(buildBossSpec(id, s).layers[0]?.width).toBeCloseTo(BOSS_LINE * 2.0, 6);
    }
  });

  it('tier 2 parts (the Gravitas anchors) carry the same weight, with no tier 3 halo', () => {
    const anchor = buildPartSpec(PART_ANCHOR, 2);
    expect(anchor.layers[0]?.width).toBeCloseTo(1.6 * tierWeight(2), 6);
    for (const id of TIER2) for (const l of buildBossSpec(id, 0).layers) expect(l.haloMul ?? 1).toBe(1);
  });
});

describe('Mirage arc openness', () => {
  it('opens over the end of the entrance, from shut to the full 70 degrees', () => {
    expect(mirageArcOpenness(MODE_ENTERING, 0)).toBe(0);
    expect(mirageArcOpenness(MODE_ENTERING, 1.5)).toBe(0);
    expect(mirageArcOpenness(MODE_ENTERING, 1.85)).toBeGreaterThan(0);
    expect(mirageArcOpenness(MODE_ENTERING, 1.85)).toBeLessThan(1);
    expect(mirageArcOpenness(MODE_ENTERING, 2)).toBe(1);
  });

  it('snaps shut at a phase change and reopens; open in every other mode', () => {
    expect(mirageArcOpenness(MODE_PHASE, 0)).toBe(0);
    expect(mirageArcOpenness(MODE_PHASE, 0.3)).toBeGreaterThan(0);
    expect(mirageArcOpenness(MODE_PHASE, 1)).toBe(1);
    for (const m of [MODE_GUARDED, MODE_ATTACKING, MODE_VULNERABLE, MODE_STUNNED, MODE_DYING]) expect(mirageArcOpenness(m, 0)).toBe(1);
  });

  it('half angle is openness times 35 degrees, clamped, NaN safe', () => {
    expect(mirageArcHalf(1)).toBeCloseTo((35 * Math.PI) / 180, 9);
    expect(mirageArcHalf(0.5)).toBeCloseTo(MIRAGE_ARC_HALF / 2, 9);
    expect(mirageArcHalf(2)).toBe(MIRAGE_ARC_HALF);
    expect(mirageArcHalf(-1)).toBe(0);
    expect(mirageArcHalf(Number.NaN)).toBe(0);
    expect(mirageArcOpenness(MODE_PHASE, Number.NaN)).toBe(0);
  });

  it('the window shimmer stays between 0.7 and 1', () => {
    for (let t = 0; t < 2; t += 0.01) {
      expect(mirageWindowGlow(t)).toBeGreaterThanOrEqual(0.7 - 1e-9);
      expect(mirageWindowGlow(t)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('Mirage afterimage and warp', () => {
  it('afterimage alpha starts at 0.55, falls monotonically and is gone at AFTERIMAGE_SEC', () => {
    expect(afterimageAlpha(0, 'standard')).toBeCloseTo(AFTERIMAGE_A0, 9);
    let prev = Number.POSITIVE_INFINITY;
    for (let t = 0; t < AFTERIMAGE_SEC; t += 0.02) {
      const a = afterimageAlpha(t, 'high');
      expect(a).toBeLessThanOrEqual(prev);
      expect(a).toBeLessThanOrEqual(AFTERIMAGE_A0);
      prev = a;
    }
    expect(afterimageAlpha(AFTERIMAGE_SEC, 'standard')).toBe(0);
    expect(afterimageAlpha(-0.1, 'standard')).toBe(0);
    expect(afterimageAlpha(Number.NaN, 'standard')).toBe(0);
    expect(afterimageAlpha(Number.POSITIVE_INFINITY, 'standard')).toBe(0);
  });

  it('afterimage is off on Low (a trail class effect)', () => {
    for (let t = 0; t < AFTERIMAGE_SEC; t += 0.05) expect(afterimageAlpha(t, 'low')).toBe(0);
  });

  it('afterimage swells as it fades, from 1 to 1.25', () => {
    expect(afterimageScale(0)).toBe(1);
    expect(afterimageScale(AFTERIMAGE_SEC)).toBeCloseTo(1.25, 9);
    expect(afterimageScale(99)).toBeCloseTo(1.25, 9);
  });

  it('a warp is a drawn jump longer than 60 u in one frame', () => {
    expect(warpJumped(WARP_JUMP_U, 0)).toBe(false);
    expect(warpJumped(WARP_JUMP_U + 1, 0)).toBe(true);
    expect(warpJumped(50, 50)).toBe(true);
    // Ember's dash at 760 u/s moves about 13 u in a 60 Hz frame: never a warp.
    expect(warpJumped(760 / 60, 0)).toBe(false);
    expect(warpJumped(Number.NaN, 0)).toBe(false);
  });

  it('landing sparks scale with the effects tier and are off on Low', () => {
    expect(landingSparks('low')).toBe(0);
    expect(landingSparks('standard')).toBeGreaterThan(0);
    expect(landingSparks('high')).toBeGreaterThan(landingSparks('standard'));
  });
});

describe('Gravitas anchor tethers', () => {
  it('tether alpha needs two anchors and stays faint (never above ANCHOR_TETHER_A)', () => {
    expect(anchorTetherAlpha(0, 0)).toBe(0);
    expect(anchorTetherAlpha(1, 0)).toBe(0);
    for (const n of [2, 3]) {
      for (let t = 0; t < 3; t += 0.05) {
        const a = anchorTetherAlpha(n, t);
        expect(a).toBeGreaterThan(0);
        expect(a).toBeLessThanOrEqual(ANCHOR_TETHER_A + 1e-9);
        expect(a).toBeGreaterThanOrEqual(ANCHOR_TETHER_A * 0.7 - 1e-9);
      }
    }
    expect(anchorTetherAlpha(Number.NaN, 0)).toBe(0);
  });

  it('spokes to the core show with one anchor or more, at half the tether', () => {
    expect(anchorSpokeAlpha(0, 0)).toBe(0);
    expect(anchorSpokeAlpha(1, 0.4)).toBeGreaterThan(0);
    expect(anchorSpokeAlpha(3, 0.4)).toBeCloseTo(anchorTetherAlpha(3, 0.4) / 2, 9);
  });

  it('planner: three anchors write three tethers and three spokes, fewer anchors fewer lines', () => {
    const b = createSpriteBuf(64);
    const ax = new Float32Array([100, -50, -50, 0]);
    const ay = new Float32Array([0, 86, -86, 0]);
    expect(planAnchorTethers(b, ax, ay, 3, 0, 0, 0.2, 0xffffff, NO_HALO)).toBe(6);
    b.count = 0;
    expect(planAnchorTethers(b, ax, ay, 2, 0, 0, 0.2, 0xffffff, NO_HALO)).toBe(3);
    b.count = 0;
    expect(planAnchorTethers(b, ax, ay, 1, 0, 0, 0.2, 0xffffff, NO_HALO)).toBe(1);
    b.count = 0;
    expect(planAnchorTethers(b, ax, ay, 0, 0, 0, 0.2, 0xffffff, NO_HALO)).toBe(0);
    // With a halo (neon above 0) every line gains its soft instance; the cap holds at 4 anchors.
    b.count = 0;
    expect(planAnchorTethers(b, ax, ay, 3, 0, 0, 0.2, 0xffffff, HALO)).toBe(12);
    b.count = 0;
    planAnchorTethers(b, ax, ay, 99, 0, 0, 0.2, 0xffffff, NO_HALO);
    expect(b.count).toBeLessThanOrEqual(TETHER_ANCHORS_MAX * (TETHER_ANCHORS_MAX + 1));
  });
});

describe('Gravitas lattice pull', () => {
  it('pulls inward and is bounded by the boss pull, itself no stronger than a gravity well', () => {
    expect(Math.abs(BOSS_PULL_ACCEL)).toBeLessThanOrEqual(Math.abs(WELL_PULL_ACCEL));
    for (const n of [0, 1, 2, 3, 4, -1, Number.NaN]) {
      for (const m of [MODE_ENTERING, MODE_GUARDED, MODE_ATTACKING, MODE_VULNERABLE, MODE_STUNNED, MODE_PHASE, MODE_DYING]) {
        for (const t of [0, 0.5, 1, 2, 10, Number.NaN]) {
          const a = gravitasLatticeAccel(n, m, t);
          expect(Number.isFinite(a)).toBe(true);
          expect(a).toBeLessThanOrEqual(0);
          expect(Math.abs(a)).toBeLessThanOrEqual(Math.abs(BOSS_PULL_ACCEL) + 1e-9);
        }
      }
    }
  });

  it('weakens with each lost anchor down to the floor, never to nothing while alive', () => {
    const shares = [3, 2, 1, 0].map(gravitasPullShare);
    expect(shares[0]).toBe(1);
    for (let k = 1; k < shares.length; k++) expect(shares[k] ?? 0).toBeLessThan(shares[k - 1] ?? 0);
    expect(shares[3]).toBeCloseTo(GRAVITAS_PULL_FLOOR, 9);
    expect(gravitasPullShare(9)).toBe(1);
    expect(gravitasLatticeAccel(0, MODE_GUARDED, 0)).toBeLessThan(0);
  });

  it('ramps in over the entrance and lets go while dying', () => {
    expect(gravitasLatticeAccel(3, MODE_ENTERING, 0)).toBe(0);
    expect(gravitasLatticeAccel(3, MODE_ENTERING, 1)).toBeCloseTo(BOSS_PULL_ACCEL / 2, 6);
    expect(gravitasLatticeAccel(3, MODE_GUARDED, 0)).toBeCloseTo(BOSS_PULL_ACCEL, 6);
    expect(gravitasLatticeAccel(3, MODE_DYING, 1)).toBe(0);
  });

  it('a lattice under the full pull for 20 s stays inside its displacement bound and settles after', () => {
    for (const spacing of [16, 25]) {
      const sim = createLatticeSim(buildLattice(arena('rect', 1800, 1100), spacing));
      const bound = maxDispFor(spacing);
      for (let f = 0; f < 20 * 60; f++) {
        clearForces(sim);
        // The boss walks at 45 u/s across the arena.
        addForce(sim, -400 + f * 0.75, 50, GRAVITAS_LATTICE_R, gravitasLatticeAccel(3, MODE_GUARDED, 5));
        stepLattice(sim, 1 / 60);
        const m = maxDisplacement(sim);
        expect(Number.isFinite(m)).toBe(true);
        expect(m).toBeLessThanOrEqual(bound + 1e-3);
      }
      expect(maxDisplacement(sim)).toBeGreaterThan(0.5); // it does dimple
      clearForces(sim);
      for (let f = 0; f < 15 * 60; f++) stepLattice(sim, 1 / 60);
      expect(sim.awake).toBe(false);
    }
  });
});

describe('Ember lane, trails and Mine pulse', () => {
  it('the lane shows only during the wind up, brightening toward the dash', () => {
    expect(emberLaneAlpha(MODE_GUARDED, 0, 0)).toBeGreaterThan(0);
    expect(emberLaneAlpha(MODE_GUARDED, 0.5, 0)).toBeGreaterThan(emberLaneAlpha(MODE_GUARDED, 0, 0));
    for (let t = 0; t < 2; t += 0.05) expect(emberLaneAlpha(MODE_ATTACKING, t, 0)).toBeLessThanOrEqual(EMBER_LANE_A1 + 1e-9);
    // Dashing, resting, stunned, entering and dying: no lane.
    expect(emberLaneAlpha(MODE_ATTACKING, 0.2, 760)).toBe(0);
    for (const m of [MODE_VULNERABLE, MODE_STUNNED, MODE_ENTERING, MODE_DYING, MODE_PHASE]) expect(emberLaneAlpha(m, 0.5, 0)).toBe(0);
    expect(EMBER_LANE_LEN).toBeCloseTo(760 * 0.6, 6);
  });

  it('dash detection: 760 u/s is a dash, the seek speeds are not', () => {
    expect(emberDashing(760)).toBe(true);
    expect(emberDashing(120)).toBe(false);
    expect(emberDashing(Number.NaN)).toBe(false);
  });

  it('flame and sparks: a flame at rest, sparks only while dashing, both off on Low', () => {
    expect(emberFlameRate(MODE_VULNERABLE, false, 'standard')).toBeGreaterThan(0);
    expect(emberFlameRate(MODE_GUARDED, false, 'standard')).toBeGreaterThan(emberFlameRate(MODE_VULNERABLE, false, 'standard'));
    expect(emberFlameRate(MODE_STUNNED, false, 'high')).toBeLessThan(emberFlameRate(MODE_VULNERABLE, false, 'high'));
    expect(emberFlameRate(MODE_ATTACKING, true, 'standard')).toBe(0);
    expect(emberFlameRate(MODE_ENTERING, false, 'standard')).toBe(0);
    expect(emberSparkRate(true, 'standard')).toBe(EMBER_SPARK_RATE);
    expect(emberSparkRate(false, 'high')).toBe(0);
    for (const m of [MODE_GUARDED, MODE_ATTACKING, MODE_VULNERABLE, MODE_STUNNED]) expect(emberFlameRate(m, false, 'low')).toBe(0);
    expect(emberSparkRate(true, 'low')).toBe(0);
  });

  it('Mines pulse between 1 and 1 + MINE_PULSE_AMP, glow follows, off on Low', () => {
    for (const fx of TIERS) {
      for (let t = 0; t < 2; t += 0.01) {
        const p = minePulse(t, 0.3, fx);
        expect(p).toBeGreaterThanOrEqual(1);
        expect(p).toBeLessThanOrEqual(1 + MINE_PULSE_AMP + 1e-9);
        if (fx === 'low') expect(p).toBe(1);
        expect(mineGlow(p)).toBeGreaterThanOrEqual(1);
        expect(mineGlow(p)).toBeLessThanOrEqual(1 + MINE_PULSE_GLOW + 1e-9);
      }
    }
    expect(mineGlow(1)).toBe(1);
    expect(mineGlow(1 + MINE_PULSE_AMP)).toBeCloseTo(1 + MINE_PULSE_GLOW, 9);
  });
});

describe('tier 2 sprite planners', () => {
  it('Ember lane: band, rails, centre line and end bar; nothing at alpha 0 or zero length', () => {
    const b = createSpriteBuf(64);
    expect(planEmberLane(b, 0, 0, 0, 300, 0.5, 0xffffff, NO_HALO)).toBe(5);
    expect(countFrame(b, F_FILL)).toBe(1);
    expect(countFrame(b, F_BAR)).toBe(4);
    b.count = 0;
    expect(planEmberLane(b, 0, 0, 0, 300, 0.5, 0xffffff, HALO)).toBe(9);
    expect(countFrame(b, F_SOFT)).toBe(4);
    b.count = 0;
    expect(planEmberLane(b, 0, 0, 0, 300, 0, 0xffffff, HALO)).toBe(0);
    expect(planEmberLane(b, 0, 0, 0, 0, 1, 0xffffff, HALO)).toBe(0);
  });

  it('Mirage arc: open draws the window and two lip glints; half open adds the closing arcs', () => {
    const b = createSpriteBuf(256);
    planMirageArc(b, 0, 0, 50, 1, 1, 1, 0xff00ff, 0xffffff, 1, 0, NO_HALO);
    const openBars = countFrame(b, F_BAR);
    expect(countFrame(b, F_GLOW)).toBe(2);
    expect(openBars).toBe(arcChords(50, 2 * MIRAGE_ARC_HALF));
    b.count = 0;
    planMirageArc(b, 0, 0, 50, 1, 0.5, 1, 0xff00ff, 0xffffff, 1, 0, NO_HALO);
    expect(countFrame(b, F_GLOW)).toBe(2);
    expect(countFrame(b, F_BAR)).toBeGreaterThan(arcChords(50, MIRAGE_ARC_HALF));
    b.count = 0;
    // Shut: only the closing arcs (the gap is filled), no window, no glints.
    planMirageArc(b, 0, 0, 50, 1, 0, 1, 0xff00ff, 0xffffff, 1, 0, NO_HALO);
    expect(countFrame(b, F_GLOW)).toBe(0);
    expect(countFrame(b, F_BAR)).toBe(2 * arcChords(50, MIRAGE_ARC_HALF));
    b.count = 0;
    expect(planMirageArc(b, 0, 0, 50, 1, 1, 1, 0xff00ff, 0xffffff, 0, 0, HALO)).toBe(0);
  });

  it('arc chords stay between 2 and 24', () => {
    expect(arcChords(0, 1)).toBe(0);
    expect(arcChords(50, 0.01)).toBe(2);
    expect(arcChords(5000, 6)).toBe(24);
  });
});
