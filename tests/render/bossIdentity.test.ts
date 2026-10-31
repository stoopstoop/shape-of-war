// G3C boss identity (run 0288): window state machine, hit throttle, crack geometry, identity table.
import { describe, expect, it } from 'vitest';
import { BOSS_IDS } from '../../src/levelgen/leveldef';
import { BOSS_COUNT, bossColourOf } from '../../src/render/bossLook';
import {
  BOSS_FLASH_MIN_MS,
  BOSS_IDENTITY,
  BOSS_OUTLINES,
  bossAttackKey,
  bossFlashAllow,
  createBossCracks,
  createBossFlashThrottle,
  createBossWindow,
  crackEvent,
  FRACTURE_GROW_SEC,
  FRAG_PTS,
  fragmentPts,
  GAPS_PER_STAGE,
  hitFlashAlpha,
  hitSparkCount,
  outlineRadius,
  pieceAlpha,
  pieceDrift,
  pieceSpin,
  PIECE_DRIFT,
  PIECE_LIFE,
  resetBossCracks,
  stepBossCracks,
  stepBossWindow,
  tier3HaloAlpha,
  twinsFlare,
  windowEvent,
  windowFlash,
  windowRing,
  windowWhite,
  WINDOW_HOLD_FLASH,
} from '../../src/render/bossIdentity';

describe('window state machine', () => {
  it('stays dark until an event arrives', () => {
    const s = createBossWindow();
    stepBossWindow(s, 10);
    expect(windowWhite(s)).toBe(0);
    expect(windowFlash(s)).toBe(0);
  });

  it('runs to white over the last 0.5 s, contracting the ring from 2x', () => {
    const s = createBossWindow();
    windowEvent(s, false, 2);
    expect(windowWhite(s)).toBe(0);
    stepBossWindow(s, 1.6); // 0.4 left
    const w1 = windowWhite(s);
    const ring = windowRing(s, { r: 0, alpha: 0, width: 0 });
    expect(w1).toBeGreaterThan(0);
    expect(ring.r).toBeLessThan(2);
    expect(ring.r).toBeGreaterThan(1);
    stepBossWindow(s, 0.3);
    expect(windowWhite(s)).toBeGreaterThan(w1);
    expect(windowRing(s, ring).r).toBeLessThan(1.9);
  });

  it('opens with a burst, holds a sustained flash and a thin ring, then closes on its own', () => {
    const s = createBossWindow();
    windowEvent(s, true, 3);
    expect(windowWhite(s)).toBe(1);
    expect(windowFlash(s)).toBe(1);
    stepBossWindow(s, 1);
    expect(windowFlash(s)).toBe(WINDOW_HOLD_FLASH);
    const ring = windowRing(s, { r: 0, alpha: 0, width: 0 });
    expect(ring.alpha).toBeGreaterThan(0.5);
    expect(ring.width).toBeLessThan(1);
    stepBossWindow(s, 2.5);
    expect(s.open).toBe(false);
    expect(windowWhite(s)).toBe(0);
  });

  it('a close event ends the window at once', () => {
    const s = createBossWindow();
    windowEvent(s, true, 3);
    windowEvent(s, false, 8);
    expect(windowWhite(s)).toBe(0);
    expect(windowFlash(s)).toBe(0);
  });
});

describe('hit throttle', () => {
  it('allows at most 20 flashes per second per boss', () => {
    const t = createBossFlashThrottle();
    let n = 0;
    for (let ms = 0; ms < 1000; ms += 5) if (bossFlashAllow(t, 6, ms)) n++;
    expect(n).toBe(1000 / BOSS_FLASH_MIN_MS);
  });

  it('throttles each boss on its own', () => {
    const t = createBossFlashThrottle();
    expect(bossFlashAllow(t, 6, 0)).toBe(true);
    expect(bossFlashAllow(t, 7, 1)).toBe(true);
    expect(bossFlashAllow(t, 6, 10)).toBe(false);
  });

  it('flash lasts 60 ms and throws 2 or 3 sparks', () => {
    expect(hitFlashAlpha(0)).toBe(1);
    expect(hitFlashAlpha(0.03)).toBeCloseTo(0.5);
    expect(hitFlashAlpha(0.06)).toBe(0);
    expect([0, 1, 2, 3].map(hitSparkCount)).toEqual([2, 3, 2, 3]);
  });
});

describe('crack state maths (look v32 battle damage)', () => {
  it('stages only rise, lay gaps near the hit angle, grow on the clock, reset clears', () => {
    const c = createBossCracks();
    expect(crackEvent(c, 1, 0.5, 1)).toBe(true);
    expect(c.stage).toBe(1);
    expect(c.gaps[0]).toBeCloseTo(0.5);
    for (let k = 0; k < GAPS_PER_STAGE; k++) expect(Math.abs((c.gaps[k * 2] ?? 0) - 0.5)).toBeLessThan(0.7);
    const first = Array.from(c.frac1);
    stepBossCracks(c, 0.2);
    expect(c.age1).toBeCloseTo(0.2);
    expect(crackEvent(c, 1, 2, 1)).toBe(false);
    expect(crackEvent(c, 2, 2, 1)).toBe(true);
    expect(c.stage).toBe(2);
    expect(Array.from(c.frac1)).toEqual(first);
    expect(Array.from(c.frac2)).not.toEqual(first);
    expect(c.gaps[GAPS_PER_STAGE * 2]).toBeCloseTo(2);
    resetBossCracks(c);
    expect(c.stage).toBe(0);
  });

  it('a stage 2 first lays a grown stage 1 too', () => {
    const c = createBossCracks();
    crackEvent(c, 2, 1, 4);
    expect(c.stage).toBe(2);
    expect(c.age1).toBe(FRACTURE_GROW_SEC);
    expect(c.age2).toBe(0);
  });

  it('outline radius follows circles, hexagons and polygons', () => {
    expect(outlineRadius({ t: 'circle', r: 10 }, 1)).toBe(10);
    const hex = { t: 'regularPoly', r: 10, sides: 6, rot: 0 } as const;
    expect(outlineRadius(hex, -Math.PI / 2)).toBeCloseTo(10);
    expect(outlineRadius(hex, -Math.PI / 2 + Math.PI / 6)).toBeCloseTo(10 * Math.cos(Math.PI / 6));
    const sq = { t: 'poly', pts: [5, 5, -5, 5, -5, -5, 5, -5] } as const;
    expect(outlineRadius(sq, 0)).toBeCloseTo(5);
    expect(outlineRadius(sq, Math.PI / 4)).toBeCloseTo(5 * Math.SQRT2);
  });

  it('fragments are short outline arcs that drift 46 u, tumble and fade over 1.2 s', () => {
    const out = new Float32Array(FRAG_PTS * 2);
    const ctr = new Float32Array(2);
    fragmentPts({ t: 'circle', r: 50 }, 0, 0.1, out, ctr);
    expect(ctr[0] ?? 0).toBeGreaterThan(49);
    let sx = 0;
    for (let k = 0; k < FRAG_PTS; k++) sx += out[k * 2] ?? 0;
    expect(Math.abs(sx)).toBeLessThan(1e-4);
    expect(pieceDrift(0)).toBe(0);
    expect(pieceDrift(PIECE_LIFE)).toBeCloseTo(PIECE_DRIFT);
    expect(PIECE_LIFE).toBe(1.2);
    expect(pieceAlpha(0)).toBe(1);
    expect(pieceAlpha(PIECE_LIFE)).toBe(0);
    expect(pieceAlpha(0.6)).toBeLessThan(0.5);
    expect(pieceSpin(0, 1)).toBe(0);
    expect(pieceSpin(0.6, 1)).toBeGreaterThan(0);
    expect(pieceSpin(0.6, -1)).toBeCloseTo(-pieceSpin(0.6, 1));
  });
});

describe('identity table', () => {
  it('has one row per boss, in BOSS_IDS order, with distinct silhouettes', () => {
    expect(BOSS_IDENTITY.length).toBe(BOSS_COUNT);
    expect(BOSS_IDENTITY.map((r) => r.id)).toEqual([...BOSS_IDS]);
    expect(new Set(BOSS_IDENTITY.map((r) => r.silhouette)).size).toBe(BOSS_COUNT);
    expect(BOSS_OUTLINES.length).toBe(BOSS_COUNT);
  });

  it('attacks take the owner hue and the named colour families', () => {
    for (let i = 0; i < BOSS_COUNT; i++) {
      expect(bossAttackKey(i)).toBe(bossColourOf(i));
      expect(BOSS_IDENTITY[i]?.hue).toBe(bossColourOf(i));
    }
    expect(BOSS_IDENTITY.map((r) => r.hue)).toEqual([
      'bossBlue', 'bossGreen', 'bossYellow', 'bossRed', 'bossMagenta', 'bossViolet', 'bossRed', 'bossRed', 'bossRed', 'bossPrism',
    ]);
  });

  it('tier 3 gets the halo and only tier 3; the Twins flare starts at phase 2', () => {
    expect(tier3HaloAlpha(3, 0)).toBeGreaterThan(0);
    expect(tier3HaloAlpha(2, 0)).toBe(0);
    expect(twinsFlare(1, 0)).toBe(0);
    expect(twinsFlare(2, 0)).toBeGreaterThan(0);
  });
});
