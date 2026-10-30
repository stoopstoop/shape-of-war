// Tier 3 boss visuals (docs/12 wave V3-C Glow): bossRed, the Bastion, Tempest and Twins specs, the
// x3.0 line weight table with the wider outer glow, and the pure helpers for turret alpha, the dash
// afterimage fade and the tether pulse. The neon tests assert the slider endpoints.
import { describe, expect, it } from 'vitest';
import {
  BOSS_BASTION,
  BOSS_COLOUR_BY_ID,
  BOSS_COUNT,
  BOSS_OPEN_STEPS,
  BOSS_RIM_ALPHA,
  BOSS_TEMPEST,
  BOSS_TIER_BY_ID,
  BOSS_TWINS,
  MODE_ATTACKING,
  MODE_DYING,
  MODE_ENTERING,
  MODE_GUARDED,
  MODE_STUNNED,
  MODE_VULNERABLE,
  TIER_HALO_MUL,
  TIER_LINE_WEIGHT,
  tierHaloMul,
  tierWeight,
} from '../../src/render/bossLook';
import { BOSS_LINE, BOSS_SPECS, EXPOSED_BOSS_SPECS, bastionStruts, bossBodyR, buildBossSpec, ringPoly, tempestKite } from '../../src/render/bossShapes';
import {
  afterimageFade,
  BASTION_TURRETS,
  bastionCoreHeat,
  bastionGlow,
  DASH_GHOST_A0,
  DASH_GHOST_COOL,
  DASH_GHOST_GAP_U,
  DASH_GHOST_HOT,
  DASH_GHOST_SEC,
  DASH_GHOSTS,
  dashGhostAlpha,
  dashGhostCount,
  dashGhostDue,
  dashGhostScale,
  dashGhostWhite,
  isTier3,
  TEMPEST_DASH_MIN_SPEED,
  TEMPEST_DRIP_LAP,
  TEMPEST_DRIP_REST,
  TEMPEST_LAP_SPEED,
  tempestDashing,
  tempestDripRate,
  tetherPulse,
  tetherThick,
  tierHalo,
  TURRET_CRITICAL,
  TURRET_DOWN,
  TURRET_READY,
  TURRET_WORN,
  turretAlpha,
  turretShare,
  turretShown,
  turretsDown,
  turretState,
  twinsEnrageGlow,
  twinsEnraged,
} from '../../src/render/bossTier3';
import { createSpriteBuf, F_BAR } from '../../src/render/fxSprites';
import { HAZARD_TETHER, planHazard, type HazardInput } from '../../src/render/hazardFx';
import { BASE_PALETTE, neonParams, neonRender, paletteColour } from '../../src/render/neon';
import { bossSlot, exposedBossSlot, specForSlot } from '../../src/render/shapeSpecs';
import type { EffectsTier } from '../../src/render/effects';

const TIERS: readonly EffectsTier[] = ['low', 'standard', 'high'];
const TIER3_IDS = [BOSS_BASTION, BOSS_TEMPEST, BOSS_TWINS];

function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

describe('bossRed against the gravity well ring', () => {
  const [bh, bs, bl] = BASE_PALETTE.bossRed;
  const [wh, ws, wl] = BASE_PALETTE.red;

  it('stays red: within 15 degrees of the well ring hue', () => {
    expect(hueDist(bh, wh)).toBeLessThanOrEqual(15);
  });

  it('is brighter and more saturated than the well, and the colour differs after the slider', () => {
    expect(bs).toBeGreaterThan(ws);
    expect(bl).toBeGreaterThan(wl);
    for (const n of [0, 70, 100]) {
      const sat = neonParams(n).saturation;
      expect(paletteColour('bossRed', sat)).not.toBe(paletteColour('red', sat));
    }
  });

  it('keeps at least 8 degrees from the well ring and from every neighbouring enemy hue', () => {
    expect(hueDist(bh, wh)).toBeGreaterThanOrEqual(8);
    expect(hueDist(bh, BASE_PALETTE.charger[0])).toBeGreaterThanOrEqual(8);
    expect(hueDist(bh, BASE_PALETTE.blink[0])).toBeGreaterThanOrEqual(8);
    expect(bl).toBeLessThanOrEqual(0.66);
    expect(bl).toBeGreaterThanOrEqual(0.5);
  });

  it('is darker than every weapon colour', () => {
    for (const k of ['rapid', 'pierce', 'orbit'] as const) expect(bl).toBeLessThan(BASE_PALETTE[k][2] - 0.05);
  });

  it('size, a white core and a second rim keep each boss apart from a well', () => {
    const WELL_R = 24; // the Kind.GravityWell spec radius (shapeSpecs.ts)
    for (const id of TIER3_IDS) {
      expect(bossBodyR(id)).toBeGreaterThanOrEqual(44);
      expect(bossBodyR(id) / WELL_R).toBeGreaterThanOrEqual(1.8);
      const spec = buildBossSpec(id, 0);
      expect(spec.layers.some((l) => l.colour === 'white')).toBe(true);
      expect(spec.layers.some((l) => l.alpha === BOSS_RIM_ALPHA && l.colour === 'bossRed')).toBe(true);
    }
  });
});

describe('tier 3 registry coverage', () => {
  it('ids 6 to 8 are tier 3, bossRed, and draw their own specs at every openness step', () => {
    expect(BOSS_COUNT).toBe(10);
    for (const id of TIER3_IDS) {
      expect(BOSS_TIER_BY_ID[id]).toBe(3);
      expect(BOSS_COLOUR_BY_ID[id]).toBe('bossRed');
      for (let s = 0; s < BOSS_OPEN_STEPS; s++) {
        const spec = BOSS_SPECS[id * BOSS_OPEN_STEPS + s];
        expect(spec).toBeDefined();
        expect(specForSlot(bossSlot(id, s))).toBe(spec);
        expect(specForSlot(exposedBossSlot(id, s))).toBe(EXPOSED_BOSS_SPECS[id * BOSS_OPEN_STEPS + s]);
        expect(JSON.parse(JSON.stringify(spec))).toEqual(spec);
      }
    }
  });

  it('the three silhouettes differ from each other and from the placeholder (Prism)', () => {
    const key = (id: number): string => JSON.stringify(buildBossSpec(id, 0).layers.map((l) => l.prims));
    const keys = new Set([...TIER3_IDS, 9].map(key));
    expect(keys.size).toBe(4);
  });

  it('Bastion is a square keep with four corner struts; the kite is long; Twins carry two linked rings', () => {
    const bastion = buildBossSpec(BOSS_BASTION, 0);
    expect(bastion.layers[0]?.prims[0]).toMatchObject({ t: 'regularPoly', sides: 4 });
    expect(bastionStruts(70)).toHaveLength(4);
    const R = bossBodyR(BOSS_TEMPEST);
    const kite = tempestKite(R, 1);
    expect(kite.t).toBe('poly');
    if (kite.t === 'poly') {
      const xs = kite.pts.filter((_, i) => i % 2 === 0);
      const ys = kite.pts.filter((_, i) => i % 2 === 1);
      expect((Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys))).toBeGreaterThan(1.5);
    }
    const twins = buildBossSpec(BOSS_TWINS, 0);
    const rings = twins.layers[2]?.prims ?? [];
    expect(rings).toHaveLength(2);
    expect(ringPoly(10, 5, 8)).toMatchObject({ t: 'poly' });
  });

  it('Tempest carries a Slime sac, and every tier 3 boss has a drawn extent past its rim', () => {
    expect(buildBossSpec(BOSS_TEMPEST, 0).layers.some((l) => l.colour === 'slime')).toBe(true);
    for (const id of TIER3_IDS) expect(buildBossSpec(id, 0).radius).toBeGreaterThanOrEqual(bossBodyR(id) * 1.18 - 0.01);
  });

  it('the Bastion core burns hotter and the keep fills as it opens', () => {
    const shut = buildBossSpec(BOSS_BASTION, 0);
    const open = buildBossSpec(BOSS_BASTION, BOSS_OPEN_STEPS - 1);
    const hot = (s: typeof shut): { fill: number; glow: boolean } => {
      const l = s.layers.find((x) => x.width === 0 && x.colour === 'bossRed');
      return { fill: l?.fill ?? -1, glow: l?.glow ?? false };
    };
    expect(hot(shut).fill).toBe(0);
    expect(hot(open).fill).toBeGreaterThan(0.8);
    expect(hot(open).glow).toBe(true);
    expect(hot(shut).glow).toBe(false);
    const white = (s: typeof shut): number => s.layers.find((l) => l.colour === 'white')?.fill ?? -1;
    expect(white(shut)).toBeCloseTo(0.2, 9);
    expect(white(open)).toBe(1);
  });
});

describe('line weight table', () => {
  it('is x1.6, x2.0, x3.0 and x2.4 by tier, and only tier 3 widens the outer glow', () => {
    expect(TIER_LINE_WEIGHT).toEqual({ 1: 1.6, 2: 2.0, 3: 3.0, 4: 2.4 });
    expect(TIER_HALO_MUL).toEqual({ 1: 1, 2: 1, 3: 1.5, 4: 1 });
    expect(tierWeight(3)).toBe(3);
    expect(tierHaloMul(3)).toBe(1.5);
    expect(isTier3(3)).toBe(true);
    for (const t of [0, 1, 2, 4, Number.NaN]) expect(isTier3(t)).toBe(false);
  });

  it('every tier 3 stroke is a share of BOSS_LINE x 3.0 and every glowing layer carries the x1.5 halo', () => {
    for (const id of TIER3_IDS) {
      for (let s = 0; s < BOSS_OPEN_STEPS; s++) {
        const spec = buildBossSpec(id, s);
        expect(spec.layers[0]?.width).toBeCloseTo(BOSS_LINE * 3, 6);
        for (const l of spec.layers) {
          expect(l.width).toBeLessThanOrEqual(BOSS_LINE * 3 + 1e-9);
          if (l.glow && l.width > 0 && l.colour !== 'white' && l.colour !== 'slime') expect(l.haloMul, `${id}:${s}`).toBe(1.5);
        }
      }
    }
  });

  it('tier 3 specs are the thickest of any tier on the same layer', () => {
    const w = (id: number): number => buildBossSpec(id, 0).layers[0]?.width ?? 0;
    for (const id of TIER3_IDS) {
      expect(w(id)).toBeGreaterThan(w(3));
      expect(w(id)).toBeGreaterThan(w(0));
      expect(w(id)).toBeGreaterThan(w(9));
    }
  });
});

describe('neon endpoints on the tier 3 glow', () => {
  it('the outer stroke is the applyNeon halo width x 1.5 at both slider ends, alpha from the same table', () => {
    const lo = neonRender(neonParams(0));
    const hi = neonRender(neonParams(100));
    expect(neonParams(0).glowAlpha).toBe(0);
    expect(neonParams(100).glowAlpha).toBeCloseTo(0.9, 9);
    expect(lo.haloAlpha).toBe(0);
    expect(hi.haloAlpha).toBeCloseTo(0.27, 9);
    expect(lo.haloWidthMul).toBeCloseTo(3.5, 9);
    expect(hi.haloWidthMul).toBeCloseTo(6.0, 9);
    const line = BOSS_LINE * 3;
    expect(line * lo.haloWidthMul * tierHaloMul(3)).toBeCloseTo(line * 3.5 * 1.5, 9);
    expect(line * hi.haloWidthMul * tierHaloMul(3)).toBeCloseTo(line * 6 * 1.5, 9);
    // The width multiple never leaves applyNeon's table: tier 3 is a plain 1.5 over it.
    expect((line * hi.haloWidthMul * tierHaloMul(3)) / (line * hi.haloWidthMul)).toBeCloseTo(1.5, 9);
  });

  it('the sprite halo widens by the tier only and keeps alpha, so the slider acts through the glow alpha', () => {
    const out = { alpha: -1, width: -1 };
    for (const base of [{ alpha: 0.1, width: 1.9 }, { alpha: 0.6, width: 3.3 }, { alpha: 0, width: 1 }]) {
      tierHalo(base, 3, out);
      expect(out.alpha).toBe(base.alpha);
      expect(out.width).toBeCloseTo(base.width * 1.5, 9);
      tierHalo(base, 2, out);
      expect(out.width).toBe(base.width);
      tierHalo(base, 4, out);
      expect(out.width).toBe(base.width);
    }
  });

  it('the Twins tether stays thick at both ends of the slider: the planner reads only the halo it is given', () => {
    const mk = (): HazardInput => ({
      type: HAZARD_TETHER,
      x: 0,
      y: 0,
      rot: 0,
      radius: 0,
      vx: 300,
      vy: 0,
      age: 5,
      tier: 3,
      tint: 0xff3030,
      timeSec: 1,
    });
    const a = createSpriteBuf(32);
    const b = createSpriteBuf(32);
    planHazard(mk(), a, { alpha: 0, width: 0 });
    planHazard(mk(), b, { alpha: 0.5, width: 3.3 });
    expect(a.count).toBeGreaterThan(0);
    expect(b.count).toBeGreaterThan(a.count);
  });
});

describe('Bastion turrets', () => {
  it('turret share is hit points over the peak, 1 when the peak is unknown, 0 when dead', () => {
    expect(turretShare(8, 8)).toBe(1);
    expect(turretShare(4, 8)).toBe(0.5);
    expect(turretShare(4, 0)).toBe(1);
    expect(turretShare(0, 8)).toBe(0);
    expect(turretShare(Number.NaN, 8)).toBe(0);
  });

  it('maps hit points to ready, worn, critical and down', () => {
    expect(turretState(8, 8)).toBe(TURRET_READY);
    expect(turretState(5, 8)).toBe(TURRET_READY);
    expect(turretState(4, 8)).toBe(TURRET_WORN);
    expect(turretState(4.8, 8)).toBe(TURRET_WORN);
    expect(turretState(2, 8)).toBe(TURRET_CRITICAL);
    expect(turretState(0, 8)).toBe(TURRET_DOWN);
    expect(turretState(-3, 8)).toBe(TURRET_DOWN);
  });

  it('alpha falls with the state and is 0 once down', () => {
    for (const e of TIERS) {
      const a = [TURRET_READY, TURRET_WORN, TURRET_CRITICAL, TURRET_DOWN].map((s) => turretAlpha(s, 0.37, 0.2, e));
      expect(a[0]).toBe(1);
      expect(a[1]).toBeCloseTo(0.85, 9);
      expect(a[3]).toBe(0);
      expect(a[0]).toBeGreaterThan(a[1] ?? 0);
      expect(a[1]).toBeGreaterThan(a[2] ?? 1);
    }
  });

  it('a critical turret flickers between 0.5 and 0.72, steady on Low', () => {
    let lo = 1;
    let hi = 0;
    for (let t = 0; t < 2; t += 0.01) {
      const a = turretAlpha(TURRET_CRITICAL, t, 0.3, 'standard');
      lo = Math.min(lo, a);
      hi = Math.max(hi, a);
    }
    expect(lo).toBeGreaterThanOrEqual(0.72 * 0.7 - 1e-9);
    expect(hi).toBeLessThanOrEqual(0.72 + 1e-9);
    expect(hi - lo).toBeGreaterThan(0.1);
    for (let t = 0; t < 1; t += 0.13) expect(turretAlpha(TURRET_CRITICAL, t, 0.3, 'low')).toBe(0.72);
  });

  it('follows the body fade and tolerates bad input', () => {
    expect(turretShown(TURRET_READY, 0.35, 0, 0, 'standard')).toBeCloseTo(0.35, 9);
    expect(turretShown(TURRET_READY, 0, 0, 0, 'standard')).toBe(0);
    expect(turretShown(TURRET_READY, 5, 0, 0, 'standard')).toBe(1);
    expect(turretShown(TURRET_READY, Number.NaN, 0, 0, 'standard')).toBe(1);
    expect(Number.isFinite(turretAlpha(Number.NaN, Number.NaN, Number.NaN, 'high'))).toBe(true);
  });

  it('counts turrets down from the most seen, and the keep heats as they fall', () => {
    expect(turretsDown(4, 4)).toBe(0);
    expect(turretsDown(4, 1)).toBe(3);
    expect(turretsDown(0, 3)).toBe(0);
    expect(turretsDown(9, 0)).toBe(BASTION_TURRETS);
    expect(bastionCoreHeat(0, 0, false)).toBe(0);
    expect(bastionCoreHeat(4, 4, false)).toBe(0);
    expect(bastionCoreHeat(4, 3, false)).toBeCloseTo(0.1, 9);
    expect(bastionCoreHeat(4, 2, false)).toBe(0.5);
    expect(bastionCoreHeat(4, 1, false)).toBe(0.75);
    expect(bastionCoreHeat(4, 0, false)).toBe(1);
    expect(bastionCoreHeat(4, 4, true)).toBe(1);
    expect(bastionCoreHeat(0, 0, true)).toBe(1);
  });

  it('the glow boost is 1 cold and 1.7 hot, never outside', () => {
    expect(bastionGlow(0)).toBe(1);
    expect(bastionGlow(1)).toBeCloseTo(1.7, 9);
    expect(bastionGlow(9)).toBeCloseTo(1.7, 9);
    expect(bastionGlow(-2)).toBe(1);
    expect(bastionGlow(Number.NaN)).toBe(1);
  });
});

describe('Tempest drips and the hot dash afterimage', () => {
  it('a dash is far over the 140 u/s lap', () => {
    expect(TEMPEST_DASH_MIN_SPEED).toBeGreaterThan(TEMPEST_LAP_SPEED * 2);
    expect(tempestDashing(TEMPEST_LAP_SPEED)).toBe(false);
    expect(tempestDashing(700)).toBe(true);
    expect(tempestDashing(Number.NaN)).toBe(false);
  });

  it('drips steadily on the lap, slowly at rest, never dashing, entering or dying, never on Low', () => {
    expect(tempestDripRate(MODE_ATTACKING, false, 'standard')).toBe(TEMPEST_DRIP_LAP);
    expect(tempestDripRate(MODE_GUARDED, false, 'high')).toBe(TEMPEST_DRIP_LAP);
    expect(tempestDripRate(MODE_VULNERABLE, false, 'standard')).toBe(TEMPEST_DRIP_REST);
    expect(tempestDripRate(MODE_STUNNED, false, 'standard')).toBe(TEMPEST_DRIP_REST);
    expect(tempestDripRate(MODE_ATTACKING, true, 'standard')).toBe(0);
    expect(tempestDripRate(MODE_ENTERING, false, 'standard')).toBe(0);
    expect(tempestDripRate(MODE_DYING, false, 'standard')).toBe(0);
    expect(tempestDripRate(MODE_ATTACKING, false, 'low')).toBe(0);
  });

  it('the afterimage fades from DASH_GHOST_A0 to 0 over DASH_GHOST_SEC and never rises', () => {
    expect(dashGhostAlpha(0, 'standard')).toBeCloseTo(DASH_GHOST_A0, 9);
    expect(dashGhostAlpha(DASH_GHOST_SEC, 'standard')).toBe(0);
    expect(dashGhostAlpha(DASH_GHOST_SEC * 2, 'high')).toBe(0);
    expect(dashGhostAlpha(-0.1, 'standard')).toBe(0);
    expect(dashGhostAlpha(Number.NaN, 'standard')).toBe(0);
    let prev = Number.POSITIVE_INFINITY;
    for (let t = 0; t < DASH_GHOST_SEC; t += 0.01) {
      const a = dashGhostAlpha(t, 'high');
      expect(a).toBeLessThanOrEqual(prev + 1e-12);
      expect(a).toBeLessThanOrEqual(DASH_GHOST_A0);
      prev = a;
    }
  });

  it('is off on Low, three ghosts on Standard and the whole pool on High', () => {
    expect(dashGhostAlpha(0, 'low')).toBe(0);
    expect(dashGhostCount('low')).toBe(0);
    expect(dashGhostCount('standard')).toBe(3);
    expect(dashGhostCount('high')).toBe(DASH_GHOSTS);
    for (const e of TIERS) expect(dashGhostCount(e)).toBeLessThanOrEqual(DASH_GHOSTS);
  });

  it('the generic fade is a quadratic ease out with guarded input', () => {
    expect(afterimageFade(0, 1, 0.8)).toBeCloseTo(0.8, 9);
    expect(afterimageFade(0.5, 1, 0.8)).toBeCloseTo(0.2, 9);
    expect(afterimageFade(1, 1, 0.8)).toBe(0);
    expect(afterimageFade(0.2, 0, 0.8)).toBe(0);
    expect(afterimageFade(Number.POSITIVE_INFINITY, 1, 0.8)).toBe(0);
  });

  it('a ghost swells a little, cools from hot white toward the boss colour, and spawns every 46 u', () => {
    expect(dashGhostScale(0)).toBe(1);
    expect(dashGhostScale(DASH_GHOST_SEC)).toBeCloseTo(1.12, 9);
    expect(dashGhostScale(9)).toBeCloseTo(1.12, 9);
    expect(dashGhostWhite(0)).toBeCloseTo(DASH_GHOST_HOT, 9);
    expect(dashGhostWhite(DASH_GHOST_SEC)).toBeCloseTo(DASH_GHOST_COOL, 9);
    expect(dashGhostWhite(0.1)).toBeLessThan(dashGhostWhite(0.05));
    expect(dashGhostDue(DASH_GHOST_GAP_U - 0.1)).toBe(false);
    expect(dashGhostDue(DASH_GHOST_GAP_U)).toBe(true);
    expect(dashGhostDue(Number.NaN)).toBe(false);
  });
});

describe('Twins tether pulse and enrage', () => {
  it('the pulse hums between 0.7 and 1 and the width swells between 0.85 and 1.15', () => {
    let aLo = 2;
    let aHi = -1;
    let wLo = 2;
    let wHi = -1;
    for (let t = 0; t < 4; t += 0.005) {
      const a = tetherPulse(t);
      const w = tetherThick(t);
      aLo = Math.min(aLo, a);
      aHi = Math.max(aHi, a);
      wLo = Math.min(wLo, w);
      wHi = Math.max(wHi, w);
    }
    expect(aLo).toBeGreaterThanOrEqual(0.7 - 1e-9);
    expect(aLo).toBeLessThan(0.71);
    expect(aHi).toBeLessThanOrEqual(1);
    expect(aHi).toBeGreaterThan(0.99);
    expect(wLo).toBeGreaterThanOrEqual(0.85 - 1e-9);
    expect(wHi).toBeLessThanOrEqual(1.15 + 1e-9);
    expect(wHi - wLo).toBeGreaterThan(0.29);
    expect(tetherPulse(Number.NaN)).toBeGreaterThanOrEqual(0.7);
  });

  it('repeats at 3.5 Hz', () => {
    expect(tetherPulse(0.2)).toBeCloseTo(tetherPulse(0.2 + 1 / 3.5), 9);
    expect(tetherThick(0.1)).toBeCloseTo(tetherThick(0.1 + 2 / 3.5), 9);
  });

  it('a lethal tier 3 tether is thicker than tier 2, and hums on the new pulse', () => {
    const mk = (tier: number, timeSec: number): HazardInput => ({
      type: HAZARD_TETHER,
      x: 0,
      y: 0,
      rot: 0,
      radius: 0,
      vx: 300,
      vy: 0,
      age: 5,
      tier,
      tint: 0xff3030,
      timeSec,
    });
    const thick = (tier: number, t: number): number => {
      const b = createSpriteBuf(32);
      planHazard(mk(tier, t), b, { alpha: 0, width: 0 });
      const i = Array.from(b.frame.subarray(0, b.count)).indexOf(F_BAR);
      return b.h[i] ?? 0;
    };
    expect(thick(3, 0)).toBeGreaterThan(thick(2, 0) * 1.3);
    const ws = [0, 0.05, 0.1, 0.15, 0.2, 0.25].map((t) => thick(3, t));
    expect(Math.max(...ws)).toBeGreaterThan(Math.min(...ws));
  });

  it('the survivor enrages in phase 2: hot glow with a flutter, steady on Low', () => {
    expect(twinsEnraged(1)).toBe(false);
    expect(twinsEnraged(2)).toBe(true);
    expect(twinsEnraged(Number.NaN)).toBe(false);
    expect(twinsEnrageGlow(1, 0.3, 'high')).toBe(1);
    expect(twinsEnrageGlow(2, 0, 'low')).toBeCloseTo(1.3, 9);
    expect(twinsEnrageGlow(2, 0.123, 'low')).toBeCloseTo(1.3, 9);
    let lo = 9;
    let hi = 0;
    for (let t = 0; t < 1; t += 0.01) {
      const g = twinsEnrageGlow(2, t, 'standard');
      lo = Math.min(lo, g);
      hi = Math.max(hi, g);
    }
    expect(hi).toBeGreaterThan(1.3);
    expect(lo).toBeLessThan(1.3);
    expect(lo).toBeGreaterThan(1.1);
  });
});
