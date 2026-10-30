// Prism visuals (docs/12 wave V3-D Glow, roster row 10): the hue function, the damage cycle (white run
// up and window flash), the tier 4 weight table, saturation under applyNeon, the gem geometry and the
// cost ladder. All pure; the pixi layer (prismFx.ts) only reads these.
import { describe, expect, it } from 'vitest';
import { BOSS_PRISM, BOSS_TIER_BY_ID, MODE_ATTACKING, MODE_DYING, MODE_ENTERING, MODE_PHASE, TIER_LINE_WEIGHT, tierWeight } from '../../src/render/bossLook';
import {
  PRISM_BODY_R,
  PRISM_COLOUR_SEC,
  PRISM_CYCLE_SEC,
  PRISM_FLASH_HOLD,
  PRISM_FLASH_SEC,
  PRISM_GHOST_ALPHA,
  PRISM_HUE_SEC,
  PRISM_LODS,
  PRISM_PHASE_KEYS,
  PRISM_RUN_SEC,
  PRISM_SAT_MIN,
  PRISM_WINDOW_SEC,
  PRISM_WINDOW_START,
  buildPrismSegments,
  createPrismClock,
  isPrism,
  prismBodyColour,
  prismColour,
  prismCycle,
  prismFlash,
  prismGhostAlpha,
  prismGhostHue,
  prismGhostOffset,
  prismGlowMul,
  prismHue,
  prismLod,
  prismLodFor,
  prismLodLevel,
  prismOutline,
  prismPhaseKey,
  prismSaturation,
  prismSegmentCount,
  prismSegments,
  prismVerts,
  prismWhite,
  prismWidths,
  prismWindowOpen,
} from '../../src/render/bossPrism';
import { BOSS_LINE, BOSS_SPECS, EXPOSED_BOSS_SPECS, bossBodyR } from '../../src/render/bossShapes';
import { BOSS_OPEN_STEPS } from '../../src/render/bossLook';
import { BOSS_TABLE } from '../../src/game/bosses/table';
import { neonParams } from '../../src/render/neon';

function channels(c: number): [number, number, number] {
  return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
}

function chroma(c: number): number {
  const [r, g, b] = channels(c);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

describe('prismHue', () => {
  it('makes one full cycle in 3 s: the same hue at t and t + 3, every vertex', () => {
    expect(PRISM_HUE_SEC).toBe(3);
    for (let i = 0; i < 24; i++) {
      for (const t of [0, 0.7, 1.9, 12.25]) {
        expect(prismHue(i, 24, t + 3)).toBeCloseTo(prismHue(i, 24, t), 6);
      }
    }
  });

  it('has not cycled at 1.5 s: half a cycle is half the wheel', () => {
    const d = (prismHue(5, 24, 1.5) - prismHue(5, 24, 0) + 360) % 360;
    expect(d).toBeCloseTo(180, 6);
  });

  it('gives every vertex its own hue at one instant (offsets distinct)', () => {
    for (const n of [8, 16, 24]) {
      const hues = Array.from({ length: n }, (_, i) => prismHue(i, n, 0.4));
      expect(new Set(hues.map((h) => h.toFixed(4))).size).toBe(n);
      for (let i = 1; i < n; i++) expect(hues[i]).not.toBeCloseTo(hues[i - 1] ?? 0, 3);
    }
  });

  it('spreads the vertices evenly: the vertex offset is 360 / count degrees', () => {
    const step = (prismHue(1, 24, 0) - prismHue(0, 24, 0) + 360) % 360;
    expect(step).toBeCloseTo(15, 6);
  });

  it('stays in [0, 360) and survives non finite input', () => {
    for (const t of [-7.3, 0, 2.99, 1e6]) {
      const h = prismHue(3, 16, t);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
    expect(Number.isFinite(prismHue(Number.NaN, 0, Number.POSITIVE_INFINITY))).toBe(true);
  });

  it('the ghost sits a fixed turn from the outline hue and wraps', () => {
    expect(prismGhostHue(0)).toBe(150);
    expect(prismGhostHue(300)).toBe(90);
    expect(prismGhostHue(-30)).toBe(120);
  });

  it('the ghost offset is a few units, turning once per hue cycle', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 0, y: 0 };
    prismGhostOffset(0, 90, a);
    prismGhostOffset(PRISM_HUE_SEC, 90, b);
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(4.05, 6);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
    prismGhostOffset(PRISM_HUE_SEC / 2, 90, b);
    expect(b.x).toBeCloseTo(-a.x, 6);
  });
});

describe('prism damage cycle', () => {
  it('the cycle is 2.3 s colour, 0.5 s run to white, 1.2 s window: 4 s', () => {
    expect(PRISM_COLOUR_SEC + PRISM_RUN_SEC + PRISM_WINDOW_SEC).toBeCloseTo(PRISM_CYCLE_SEC, 9);
    expect(PRISM_WINDOW_START).toBeCloseTo(2.8, 9);
  });

  it('is colour for 2.3 s, runs to white over the next 0.5 s, then is white', () => {
    expect(prismWhite(0)).toBe(0);
    expect(prismWhite(2.29)).toBe(0);
    expect(prismWhite(2.3)).toBe(0);
    expect(prismWhite(2.55)).toBeCloseTo(0.5, 6);
    expect(prismWhite(2.799)).toBeGreaterThan(0.99);
    expect(prismWhite(2.8)).toBe(1);
    expect(prismWhite(3.5)).toBe(1);
    expect(prismWhite(3.99)).toBe(1);
  });

  it('the run up only ever rises', () => {
    let prev = -1;
    for (let t = 2.3; t < 2.8; t += 0.01) {
      const w = prismWhite(t);
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });

  it('the window is open exactly from 2.8 s to 4 s', () => {
    expect(prismWindowOpen(2.79)).toBe(false);
    expect(prismWindowOpen(2.8)).toBe(true);
    expect(prismWindowOpen(3.99)).toBe(true);
    expect(prismWindowOpen(4)).toBe(false);
    expect(prismWindowOpen(0)).toBe(false);
  });

  it('the flash is zero outside the window, full as it opens, fades in 0.3 s to a faint shimmer', () => {
    expect(prismFlash(0)).toBe(0);
    expect(prismFlash(2.5)).toBe(0);
    expect(prismFlash(2.79)).toBe(0);
    expect(prismFlash(2.8)).toBeCloseTo(1, 6);
    expect(prismFlash(2.8 + PRISM_FLASH_SEC / 2)).toBeCloseTo(0.5, 2);
    for (let t = 2.8 + PRISM_FLASH_SEC; t < 4; t += 0.013) {
      expect(prismFlash(t)).toBeLessThanOrEqual(PRISM_FLASH_HOLD + 1e-9);
      expect(prismFlash(t)).toBeGreaterThanOrEqual(0);
    }
    expect(prismFlash(4)).toBe(0);
  });

  it('glow boost: 1 at rest, more for white, most at the flash', () => {
    expect(prismGlowMul(0, 0)).toBe(1);
    expect(prismGlowMul(1, 0)).toBeGreaterThan(1);
    expect(prismGlowMul(1, 1)).toBeGreaterThan(prismGlowMul(1, 0));
    expect(prismGlowMul(9, 9)).toBe(prismGlowMul(1, 1));
  });

  it('the ghost fades out as the outline goes white', () => {
    expect(prismGhostAlpha(0)).toBe(PRISM_GHOST_ALPHA);
    expect(prismGhostAlpha(1)).toBe(0);
    expect(prismGhostAlpha(0.5)).toBeCloseTo(PRISM_GHOST_ALPHA / 2, 9);
  });

  it('the clock locks to the sim window and then free runs 4 s on', () => {
    const clock = createPrismClock();
    // Sim says the window opened 0.2 s ago at w.time 10.
    expect(prismCycle(clock, 10, MODE_ATTACKING, true, 0.2)).toBeCloseTo(3.0, 9);
    // Window over at 11.0; the next white run up begins 3.3 s after the window start at 9.8 + 4 - 0.5.
    const runStart = 10 - 0.2 + PRISM_CYCLE_SEC - PRISM_RUN_SEC;
    expect(prismWhite(prismCycle(clock, runStart - 0.01, MODE_ATTACKING, false, 0))).toBe(0);
    expect(prismWhite(prismCycle(clock, runStart + 0.25, MODE_ATTACKING, false, 0))).toBeCloseTo(0.5, 6);
    expect(prismWhite(prismCycle(clock, runStart + 0.49, MODE_ATTACKING, false, 0))).toBeGreaterThan(0.95);
  });

  it('never shows white run up or the window while the shield is up and the sim has not said so', () => {
    const clock = createPrismClock();
    for (let t = 0; t < 12; t += 0.05) {
      const c = prismCycle(clock, t, MODE_ATTACKING, false, 0);
      expect(prismWindowOpen(c)).toBe(false);
      expect(c).toBeLessThan(PRISM_WINDOW_START);
    }
    clock.offset = 2.5;
    for (const mode of [MODE_ENTERING, MODE_PHASE, MODE_DYING]) expect(prismCycle(clock, 0, mode, false, 0)).toBe(0);
  });

  it('exposed time beyond the window clamps inside it', () => {
    const clock = createPrismClock();
    const c = prismCycle(clock, 3, MODE_ATTACKING, true, 99);
    expect(c).toBeLessThan(PRISM_CYCLE_SEC);
    expect(prismWindowOpen(c)).toBe(true);
  });
});

describe('prism weight', () => {
  it('tier 4 is x2.4 in the tier weight table, between tier 1 to 3 as docs/13 lists them', () => {
    expect(TIER_LINE_WEIGHT).toEqual({ 1: 1.6, 2: 2.0, 3: 3.0, 4: 2.4 });
    expect(tierWeight(4)).toBe(2.4);
    expect(BOSS_TIER_BY_ID[BOSS_PRISM]).toBe(4);
  });

  it('the gem line widths are the base line times the tier weight', () => {
    const w = prismWidths(BOSS_LINE);
    expect(w.outline).toBeCloseTo(BOSS_LINE * 2.4, 9);
    expect(w.outline).toBeCloseTo(6, 9);
    expect(w.facet).toBeCloseTo(w.outline * 0.5, 9);
    expect(w.ghost).toBeCloseTo(w.outline * 0.7, 9);
    expect(w.facet).toBeLessThan(w.ghost);
    expect(w.ghost).toBeLessThan(w.outline);
    expect(prismWidths(BOSS_LINE, 3).outline).toBeCloseTo(BOSS_LINE * 3, 9);
    expect(prismWidths(Number.NaN).outline).toBe(0);
  });

  it('the static Prism spec carries the x2.4 weight on its outline layer', () => {
    const spec = BOSS_SPECS[BOSS_PRISM * BOSS_OPEN_STEPS];
    expect(spec?.layers[0]?.width).toBeCloseTo(BOSS_LINE * 2.4, 9);
  });
});

describe('prism colour under applyNeon', () => {
  it('saturation is muted at neon 0, never zero, and rises to full', () => {
    const lo = prismSaturation(neonParams(0).saturation);
    const mid = prismSaturation(neonParams(50).saturation);
    const hi = prismSaturation(neonParams(100).saturation);
    expect(lo).toBeGreaterThanOrEqual(PRISM_SAT_MIN);
    expect(lo).toBeGreaterThan(0);
    expect(lo).toBeLessThan(mid);
    expect(mid).toBeLessThanOrEqual(hi);
    expect(hi).toBeLessThanOrEqual(1);
    expect(prismSaturation(Number.NaN)).toBeGreaterThan(0);
  });

  it('a shimmer at neon 0 still has colour, less than at neon 100', () => {
    const lo = prismColour(0, prismSaturation(neonParams(0).saturation), 0xffffff, 0);
    const hi = prismColour(0, prismSaturation(neonParams(100).saturation), 0xffffff, 0);
    expect(chroma(lo)).toBeGreaterThan(0);
    expect(chroma(lo)).toBeLessThan(chroma(hi));
  });

  it('the borrowed phase colour leans the rainbow toward it', () => {
    const s = prismSaturation(1);
    const plain = channels(prismColour(120, s, 0xffffff, 0));
    const red = channels(prismColour(120, s, 0xff0000, 0));
    expect(red[0]).toBeGreaterThan(plain[0] - 1);
    expect(red[1]).toBeLessThan(plain[1]);
  });

  it('runs to pure white at whiteness 1, whatever the hue, tint or saturation', () => {
    for (const hue of [0, 90, 200, 330]) expect(prismColour(hue, 0.4, 0xff0000, 1)).toBe(0xffffff);
    expect(prismBodyColour(1.2, 0.9, 0x3366ff, 1)).toBe(0xffffff);
  });

  it('whiter means brighter in every channel as the run up goes', () => {
    const a = channels(prismColour(40, 0.9, 0x00ff00, 0.2));
    const b = channels(prismColour(40, 0.9, 0x00ff00, 0.8));
    for (let k = 0; k < 3; k++) expect(b[k]).toBeGreaterThanOrEqual(a[k] ?? 0);
  });

  it('each phase borrows the first boss named for it (blue, yellow, violet, red)', () => {
    expect(PRISM_PHASE_KEYS).toEqual(['bossBlue', 'bossYellow', 'bossViolet', 'bossRed']);
    expect([1, 2, 3, 4].map(prismPhaseKey)).toEqual([...PRISM_PHASE_KEYS]);
    expect(prismPhaseKey(0)).toBe('bossBlue');
    expect(prismPhaseKey(9)).toBe('bossRed');
    expect(prismPhaseKey(Number.NaN)).toBe('bossBlue');
  });

  it('only the Prism index is the Prism', () => {
    expect(isPrism(BOSS_PRISM)).toBe(true);
    expect(isPrism(8)).toBe(false);
  });
});

describe('prism geometry and cost ladder', () => {
  it('the vertex count snaps to 8, 16 or 24', () => {
    expect([0, 7, 8, 13, 16, 20, 24, 99, Number.NaN].map(prismVerts)).toEqual([8, 8, 8, 16, 16, 24, 24, 24, 24]);
  });

  it('the outline has that many vertices on the octagon radius, corners on the circle', () => {
    for (const n of [8, 16, 24]) {
      const o = prismOutline(n, 90);
      expect(o).toHaveLength(n * 2);
      const per = n / 8;
      for (let c = 0; c < 8; c++) expect(Math.hypot(o[c * per * 2] ?? 0, o[c * per * 2 + 1] ?? 0)).toBeCloseTo(90, 0);
    }
  });

  it('segments: outline v, plus 8 table edges and 16 spokes, all with a hue index in range', () => {
    for (const n of [8, 16, 24]) {
      const segs = buildPrismSegments(n, 90);
      expect(segs).toHaveLength(n + 24);
      expect(segs.filter((s) => !s.facet)).toHaveLength(n);
      for (const s of segs) {
        expect(s.at).toBeGreaterThanOrEqual(0);
        expect(s.at).toBeLessThanOrEqual(n);
        expect(Math.hypot(s.x1 - s.x0, s.y1 - s.y0)).toBeGreaterThan(1);
      }
    }
    expect(prismSegments(24)).toBe(prismSegments(24));
    expect(prismSegments(24)[0]).toEqual(buildPrismSegments(24, PRISM_BODY_R)[0]);
  });

  it('outline segments take consecutive vertex indices, so neighbours differ in hue', () => {
    const segs = prismSegments(24).filter((s) => !s.facet);
    expect(segs.map((s) => s.at)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it('the ladder cuts vertices first (24, 16, 8) and drops the ghost last', () => {
    expect(PRISM_LODS.map((l) => l.verts)).toEqual([24, 16, 8, 8]);
    expect(PRISM_LODS.map((l) => l.ghost)).toEqual([true, true, true, false]);
    const cost = PRISM_LODS.map((_, i) => prismSegmentCount(i) * (prismLod(i).ghost ? 2 : 1));
    for (let i = 1; i < cost.length; i++) expect(cost[i]).toBeLessThan(cost[i - 1] ?? 0);
  });

  it('effects tiers start at High full, Standard 16 vertices, Low no ghost; levels clamp', () => {
    expect(prismLodFor('high')).toBe(0);
    expect(prismLodFor('standard')).toBe(1);
    expect(prismLodFor('low')).toBe(3);
    expect([-4, 0, 2.4, 3, 99, Number.NaN].map(prismLodLevel)).toEqual([0, 0, 2, 3, 3, 0]);
    expect(prismLod(99).ghost).toBe(false);
  });
});

describe('prism boss body', () => {
  it('draws at the Prism table radius, with a faint gem base, a white core and a rim at every step', () => {
    expect(bossBodyR(BOSS_PRISM)).toBe(BOSS_TABLE.prism.radius);
    expect(bossBodyR(BOSS_PRISM)).toBe(PRISM_BODY_R);
    for (let s = 0; s < BOSS_OPEN_STEPS; s++) {
      const spec = BOSS_SPECS[BOSS_PRISM * BOSS_OPEN_STEPS + s];
      expect(spec?.layers).toHaveLength(3);
      expect(spec?.layers.some((l) => l.colour === 'white')).toBe(true);
      const exposed = EXPOSED_BOSS_SPECS[BOSS_PRISM * BOSS_OPEN_STEPS + s];
      expect(exposed?.layers.some((l) => l.colour === 'white')).toBe(false);
      expect(exposed?.radius).toBe(spec?.radius);
    }
  });
});
