// Pure boss look (src/render/bossLook.ts): tier table, line weights, colours, the (mode, modeT) to
// openness and alpha helpers of the render contract, the hit throttle and the death burst caps.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOSS_IDS } from '../../src/levelgen/leveldef';
import {
  approach,
  BOSS_BURST_CAP,
  BOSS_DEATH_SHAKE_PX,
  BOSS_DEATH_SHAKE_SEC,
  BOSS_EDGE_SEC,
  BOSS_HIT_FLASH_SEC,
  BOSS_HIT_MS,
  BOSS_OPEN_STEPS,
  bossBodyAlpha,
  bossColourOf,
  bossDeathBurst,
  bossEdgePulse,
  bossGlowMul,
  bossHitAllow,
  bossIndex,
  bossOpenness,
  bossPhaseFlash,
  bossTierOf,
  broodOpenness,
  createBossHitThrottle,
  DYING_SEC,
  ENTRANCE_R0,
  ENTRANCE_R1,
  ENTRANCE_SEC,
  entranceRing,
  MODE_ATTACKING,
  MODE_DYING,
  MODE_ENTERING,
  MODE_GUARDED,
  MODE_PHASE,
  MODE_STUNNED,
  MODE_VULNERABLE,
  OPEN_SEC,
  opennessStep,
  podPulse,
  spindleOpenness,
  TIER_BULLET_KEY,
  TIER_HALO_MUL,
  TIER_LINE_WEIGHT,
  tierHaloMul,
  tierOf,
  tierWeight,
  wardenOpenness,
} from '../../src/render/bossLook';
import { particleCapFor } from '../../src/render/effects';
import { planFx } from '../../src/render/fx';
import { SHAKE_CAP_PX } from '../../src/render/shake';

const ALL_MODES = [MODE_ENTERING, MODE_GUARDED, MODE_ATTACKING, MODE_VULNERABLE, MODE_STUNNED, MODE_PHASE, MODE_DYING];

describe('boss tiers and line weights', () => {
  it('tier weight table is x1.6, x2.0, x3.0, x2.4 (docs/13 tier table)', () => {
    expect(TIER_LINE_WEIGHT).toEqual({ 1: 1.6, 2: 2.0, 3: 3.0, 4: 2.4 });
    expect([1, 2, 3, 4].map(tierWeight)).toEqual([1.6, 2.0, 3.0, 2.4]);
  });

  it('only tier 3 widens the outer glow stroke', () => {
    expect(TIER_HALO_MUL[3]).toBeGreaterThan(1);
    for (const t of [1, 2, 4]) expect(tierHaloMul(t)).toBe(1);
  });

  it('unknown tiers read as tier 1', () => {
    for (const t of [0, 5, -1, Number.NaN, 2.5]) expect(tierOf(t)).toBe(1);
    expect(tierWeight(9)).toBe(1.6);
  });

  it('ten bosses in the docs/13 schedule tiers 1 1 1 2 2 2 3 3 3 4 and colours', () => {
    expect(BOSS_IDS.map((_, i) => bossTierOf(i))).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 4]);
    expect([0, 1, 2].map(bossColourOf)).toEqual(['bossBlue', 'bossGreen', 'bossYellow']);
    expect([3, 4, 5].map(bossColourOf)).toEqual(['bossOrange', 'bossMagenta', 'bossViolet']);
    expect([6, 7, 8].map(bossColourOf)).toEqual(['bossRed', 'bossRed', 'bossRed']);
    expect(bossColourOf(9)).toBe('bossPrism');
  });

  it('bad boss ids fall back to the Warden', () => {
    for (const id of [-1, 10, 1.5, Number.NaN]) expect(bossIndex(id)).toBe(0);
  });

  it('enemy bullets take the tier colour of their shooter, no new key', () => {
    expect(TIER_BULLET_KEY).toEqual({ 1: 'bossYellow', 2: 'bossOrange', 3: 'bossRed', 4: 'bossPrism' });
  });
});

describe('mode to openness, per boss', () => {
  it('Warden: shut when guarded, attacking or entering; opens over OPEN_SEC when vulnerable', () => {
    for (const m of [MODE_ENTERING, MODE_GUARDED, MODE_ATTACKING]) expect(wardenOpenness(m, 5)).toBe(0);
    expect(wardenOpenness(MODE_VULNERABLE, 0)).toBe(0);
    expect(wardenOpenness(MODE_VULNERABLE, OPEN_SEC / 2)).toBeCloseTo(0.5, 6);
    expect(wardenOpenness(MODE_VULNERABLE, OPEN_SEC)).toBe(1);
    expect(wardenOpenness(MODE_VULNERABLE, 1.9)).toBe(1);
    expect(wardenOpenness(MODE_DYING, 0)).toBe(1);
    expect(wardenOpenness(MODE_PHASE, 0.1)).toBeGreaterThan(0);
    expect(wardenOpenness(MODE_PHASE, 0.1)).toBeLessThan(0.5);
  });

  it('Brood: immune (shut) until vulnerable, open while vulnerable', () => {
    for (const m of [MODE_ENTERING, MODE_GUARDED, MODE_ATTACKING, MODE_PHASE]) expect(broodOpenness(m, 3)).toBe(0);
    expect(broodOpenness(MODE_VULNERABLE, 4.9)).toBe(1);
  });

  it('Spindle: always open, lighting up over the entrance', () => {
    for (const m of [MODE_GUARDED, MODE_ATTACKING, MODE_VULNERABLE, MODE_PHASE, MODE_DYING]) expect(spindleOpenness(m, 0)).toBe(1);
    expect(spindleOpenness(MODE_ENTERING, 0)).toBe(0);
    expect(spindleOpenness(MODE_ENTERING, ENTRANCE_SEC / 2)).toBeCloseTo(0.5, 6);
  });

  it('bossOpenness dispatches per id and stays in [0, 1] for every mode and time', () => {
    expect(bossOpenness(0, MODE_GUARDED, 1)).toBe(0);
    expect(bossOpenness(2, MODE_GUARDED, 1)).toBe(1);
    for (let id = 0; id < 10; id++) {
      for (const m of ALL_MODES) {
        for (const t of [-1, 0, 0.1, 1, 10, Number.NaN]) {
          const o = bossOpenness(id, m, t);
          expect(o).toBeGreaterThanOrEqual(0);
          expect(o).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('openness steps cover 0 to 1 in BOSS_OPEN_STEPS prebuilt contexts', () => {
    expect(opennessStep(0)).toBe(0);
    expect(opennessStep(1)).toBe(BOSS_OPEN_STEPS - 1);
    expect(opennessStep(0.5)).toBe(2);
    expect(opennessStep(-3)).toBe(0);
    expect(opennessStep(9)).toBe(BOSS_OPEN_STEPS - 1);
    expect(opennessStep(Number.NaN)).toBe(0);
  });

  it('approach eases toward the target without overshoot', () => {
    expect(approach(0, 1, 0.1, 4)).toBeCloseTo(0.4, 6);
    expect(approach(0.9, 1, 0.1, 4)).toBe(1);
    expect(approach(1, 0, 0.1, 4)).toBeCloseTo(0.6, 6);
    expect(approach(0.5, 0.5, 1, 4)).toBe(0.5);
    expect(approach(0.2, 1, -1, 4)).toBe(0.2);
  });
});

describe('mode to alpha', () => {
  it('body fades in over the entrance, solid in every live mode, fades out dying', () => {
    expect(bossBodyAlpha(MODE_ENTERING, 0)).toBeCloseTo(0.35, 6);
    expect(bossBodyAlpha(MODE_ENTERING, ENTRANCE_SEC)).toBe(1);
    for (const m of [MODE_GUARDED, MODE_ATTACKING, MODE_VULNERABLE, MODE_STUNNED, MODE_PHASE]) expect(bossBodyAlpha(m, 3)).toBe(1);
    expect(bossBodyAlpha(MODE_DYING, 0)).toBeGreaterThan(0.5);
    expect(bossBodyAlpha(MODE_DYING, DYING_SEC)).toBe(0);
    let prevMax = 1;
    for (let t = 0; t <= DYING_SEC; t += 0.1) {
      const a = bossBodyAlpha(MODE_DYING, t);
      expect(a).toBeLessThanOrEqual(prevMax + 1e-9);
      prevMax = 1 - t / DYING_SEC + 0.11;
    }
  });

  it('phase flash only in the phase mode, 1 at the change and gone after its time', () => {
    expect(bossPhaseFlash(MODE_PHASE, 0)).toBe(1);
    expect(bossPhaseFlash(MODE_PHASE, 10)).toBe(0);
    expect(bossPhaseFlash(MODE_GUARDED, 0)).toBe(0);
  });

  it('entrance ring contracts onto the body and shows only for the 2 s entrance', () => {
    const out = { r: 0, alpha: 0 };
    entranceRing(MODE_ENTERING, 0, 60, out);
    expect(out.r).toBeCloseTo(60 * ENTRANCE_R0, 6);
    expect(out.alpha).toBeGreaterThan(0);
    entranceRing(MODE_ENTERING, 1.99, 60, out);
    expect(out.r).toBeLessThan(60 * ENTRANCE_R0);
    expect(out.r).toBeGreaterThan(60 * ENTRANCE_R1 - 1);
    entranceRing(MODE_ENTERING, ENTRANCE_SEC, 60, out);
    expect(out.alpha).toBe(0);
    entranceRing(MODE_GUARDED, 0.5, 60, out);
    expect(out.alpha).toBe(0);
  });

  it('pods pulse around scale 1 by at most 10 percent', () => {
    for (let t = 0; t < 2; t += 0.05) {
      const s = podPulse(t, 0.3);
      expect(Math.abs(s - 1)).toBeLessThanOrEqual(0.1 + 1e-9);
    }
  });
});

describe('boss hit flash, phase flash and death', () => {
  it('hit throttle passes one flash per BOSS_HIT_MS', () => {
    const t = createBossHitThrottle();
    expect(bossHitAllow(t, 1000)).toBe(true);
    expect(bossHitAllow(t, 1000)).toBe(false);
    expect(bossHitAllow(t, 1000 + BOSS_HIT_MS - 1)).toBe(false);
    expect(bossHitAllow(t, 1000 + BOSS_HIT_MS)).toBe(true);
    expect(bossHitAllow(t, Number.NaN)).toBe(false);
    // A clock that went backwards (new level) never locks the flash out.
    expect(bossHitAllow(t, 10)).toBe(true);
  });

  it('glow multiplier peaks at a fresh hit or phase flash and returns to 1', () => {
    expect(bossGlowMul(0, 0)).toBeGreaterThan(1.5);
    expect(bossGlowMul(BOSS_HIT_FLASH_SEC, 0)).toBe(1);
    expect(bossGlowMul(Number.POSITIVE_INFINITY, 1)).toBeGreaterThan(1.5);
    expect(bossGlowMul(Number.POSITIVE_INFINITY, 0)).toBe(1);
  });

  it('death burst is capped per effects tier and stays inside the particle pool', () => {
    for (const fx of ['low', 'standard', 'high'] as const) {
      for (const tier of [1, 2, 3, 4]) {
        const n = bossDeathBurst(fx, tier);
        expect(n).toBeLessThanOrEqual(BOSS_BURST_CAP[fx]);
        expect(n).toBeLessThanOrEqual(particleCapFor(fx) / 2);
        // Larger than the largest ordinary burst (the gravity well and the ship death, 120).
        expect(n).toBeGreaterThan(planFx({ type: 'kill', colour: 'red' }).burst.count);
      }
      expect(bossDeathBurst(fx, 4)).toBeGreaterThanOrEqual(bossDeathBurst(fx, 1));
    }
    expect(bossDeathBurst('high', 1)).toBeGreaterThan(bossDeathBurst('standard', 1));
    expect(bossDeathBurst('standard', 1)).toBeGreaterThan(bossDeathBurst('low', 1));
  });

  it('death shake is 14 px for 0.6 s, inside the 16 px cap', () => {
    expect(BOSS_DEATH_SHAKE_PX).toBe(14);
    expect(BOSS_DEATH_SHAKE_SEC).toBe(0.6);
    expect(BOSS_DEATH_SHAKE_PX).toBeLessThanOrEqual(SHAKE_CAP_PX);
  });

  it('entrance edge pulse lasts BOSS_EDGE_SEC and never passes 1', () => {
    expect(bossEdgePulse(0)).toBeGreaterThan(0);
    expect(bossEdgePulse(BOSS_EDGE_SEC)).toBe(0);
    expect(bossEdgePulse(Number.POSITIVE_INFINITY)).toBe(0);
    for (let t = 0; t < BOSS_EDGE_SEC; t += 0.05) expect(bossEdgePulse(t)).toBeLessThanOrEqual(1);
  });
});

describe('applyNeon stays the only writer', () => {
  it('the V3 render files never write bloom, threshold, saturation, glow width or grid alpha', () => {
    const files = ['bossLook.ts', 'bossShapes.ts', 'hazardFx.ts', 'fxSprites.ts', 'fxSpriteLayer.ts', 'enemyBulletFx.ts', 'enemyBullets.ts'];
    const writes = /(bloomScale|threshold|saturat\w*|haloWidthMul|innerWidthMul|coreWidthMul|gridAlpha|glowAlpha)\s*=[^=]/;
    for (const f of files) {
      const src = readFileSync(new URL(`../../src/render/${f}`, import.meta.url), 'utf8');
      expect(writes.test(src), f).toBe(false);
    }
  });
});
