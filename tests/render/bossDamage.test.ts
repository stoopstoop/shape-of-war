// Look v32 boss battle damage: the pure crack layout (gaps and fracture polygon), the growth, the
// gap shoulder flicker, the stage 2 outline flicker, and a guard that the damage draw paints no black.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createCrackLayout,
  crackLayout,
  dimRgb,
  FLICKER_MAX,
  FRACTURE_EDGE_R,
  FRACTURE_GROW_SEC,
  FRACTURE_MAX_R,
  FRACTURE_ORIGIN_R,
  FRACTURE_PTS,
  fractureGrow,
  fractureIsSimple,
  fracturePointAt,
  GAP_HALF,
  GAP_SHOULDER_MAX,
  GAP_SHOULDER_MIN,
  GAPS_PER_STAGE,
  noiseAt,
  NOISE_SIZE,
  outlineFlicker,
  shoulderDim,
} from '../../src/render/bossDamage';
import { hueDistance, hueOfRgb } from '../../src/render/emberFlame';

const lay = (stage: number, seed: number, a: number) => crackLayout(stage, seed, a, createCrackLayout());

/** Fan points (the polygon minus its two outline points) as radii from the hit edge point. */
function fanDepths(frac: Float32Array, a: number): number[] {
  const ex = Math.cos(a) * FRACTURE_ORIGIN_R;
  const ey = Math.sin(a) * FRACTURE_ORIGIN_R;
  const out: number[] = [];
  for (let k = 2; k < FRACTURE_PTS; k++) out.push(Math.hypot((frac[k * 2] ?? 0) - ex, (frac[k * 2 + 1] ?? 0) - ey));
  return out;
}

describe('noise table', () => {
  it('stays in 0 to 1, wraps, and varies smoothly', () => {
    for (let x = -5; x < 70; x += 0.37) {
      const v = noiseAt(x);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(noiseAt(x + NOISE_SIZE)).toBeCloseTo(v, 5);
      expect(Math.abs(noiseAt(x + 0.01) - v)).toBeLessThan(0.05);
    }
  });
});

describe('crack layout', () => {
  it('is deterministic in stage, seed and angle, and the seed changes it', () => {
    expect(Array.from(lay(1, 3, 0.7).frac)).toEqual(Array.from(lay(1, 3, 0.7).frac));
    expect(Array.from(lay(1, 3, 0.7).gaps)).toEqual(Array.from(lay(1, 3, 0.7).gaps));
    expect(Array.from(lay(1, 4, 0.7).frac)).not.toEqual(Array.from(lay(1, 3, 0.7).frac));
  });

  it('lays GAPS_PER_STAGE gaps, the first on the hit angle, the rest near it, widths in range', () => {
    const l = lay(2, 9, 1.2);
    expect(l.gaps.length).toBe(GAPS_PER_STAGE * 2);
    expect(l.gaps[0]).toBeCloseTo(1.2);
    for (let k = 0; k < GAPS_PER_STAGE; k++) {
      expect(Math.abs((l.gaps[k * 2] ?? 0) - 1.2)).toBeLessThan(0.7);
      expect(l.gaps[k * 2 + 1] ?? 0).toBeGreaterThanOrEqual(GAP_HALF[0] - 1e-6);
      expect(l.gaps[k * 2 + 1] ?? 0).toBeLessThanOrEqual(GAP_HALF[1] + 1e-6);
    }
  });

  it('the fracture polygon starts on the outline either side of the hit and stays inside the body', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const stage of [1, 2]) {
        const a = seed * 0.83;
        const f = lay(stage, seed, a).frac;
        for (const p of [0, 1]) {
          expect(Math.hypot(f[p * 2] ?? 0, f[p * 2 + 1] ?? 0)).toBeCloseTo(FRACTURE_EDGE_R, 5);
          const pa = Math.atan2(f[p * 2 + 1] ?? 0, f[p * 2] ?? 0);
          expect(hueDistance((pa * 180) / Math.PI, (a * 180) / Math.PI)).toBeLessThan(30);
        }
        for (let k = 2; k < FRACTURE_PTS; k++) expect(Math.hypot(f[k * 2] ?? 0, f[k * 2 + 1] ?? 0)).toBeLessThanOrEqual(FRACTURE_MAX_R + 1e-6);
      }
    }
  });

  it('the polygon is simple (its edges never cross), so it fills cleanly', () => {
    for (let seed = 0; seed < 30; seed++) {
      expect(fractureIsSimple(lay(1, seed, seed * 1.1).frac, seed * 1.1), `stage 1 seed ${seed}`).toBe(true);
      expect(fractureIsSimple(lay(2, seed, seed * 0.7).frac, seed * 0.7), `stage 2 seed ${seed}`).toBe(true);
    }
    expect(fracturePointAt(0)).toBe(0);
    expect(fracturePointAt(1)).toBe(2);
    expect(fracturePointAt(FRACTURE_PTS - 1)).toBe(1);
  });

  it('the front is noisy and branching, not a straight line or a smooth arc', () => {
    for (let seed = 0; seed < 10; seed++) {
      const a = 0.4 + seed;
      const d = fanDepths(lay(1, seed, a).frac, a);
      // Many turns in depth along the fan: a wandering edge.
      let turns = 0;
      for (let k = 1; k + 1 < d.length; k++) {
        const s0 = Math.sign((d[k] ?? 0) - (d[k - 1] ?? 0));
        const s1 = Math.sign((d[k + 1] ?? 0) - (d[k] ?? 0));
        if (s0 !== 0 && s1 !== 0 && s0 !== s1) turns++;
      }
      expect(turns, `seed ${seed}`).toBeGreaterThanOrEqual(4);
      // Fingers: the deepest point reaches well past the median depth.
      const sorted = [...d].sort((x, y) => x - y);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      expect(Math.max(...d), `seed ${seed}`).toBeGreaterThan(median * 1.3);
    }
  });

  it('stage 2 reaches deeper than stage 1', () => {
    let deeper = 0;
    for (let seed = 0; seed < 20; seed++) {
      const m1 = Math.max(...fanDepths(lay(1, seed, 0).frac, 0));
      const m2 = Math.max(...fanDepths(lay(2, seed, 0).frac, 0));
      if (m2 > m1) deeper++;
    }
    expect(deeper).toBeGreaterThanOrEqual(16);
  });
});

describe('damage timing', () => {
  it('the fracture grows from 0 to 1 over the grow time', () => {
    expect(fractureGrow(0)).toBe(0);
    expect(fractureGrow(FRACTURE_GROW_SEC / 2)).toBeGreaterThan(0.5);
    expect(fractureGrow(FRACTURE_GROW_SEC)).toBe(1);
    expect(fractureGrow(9)).toBe(1);
  });

  it('gap shoulders dim on an uneven flicker, never fully out and never fully lit', () => {
    let lo = 1;
    let hi = 0;
    for (let t = 0; t < 4; t += 0.03) {
      const v = shoulderDim(t, 1);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
      expect(v).toBeGreaterThanOrEqual(GAP_SHOULDER_MIN - 1e-9);
      expect(v).toBeLessThanOrEqual(GAP_SHOULDER_MAX + 1e-9);
    }
    expect(hi - lo).toBeGreaterThan(0.2);
  });

  it('the whole outline flickers only after stage 2, unevenly, within its cap', () => {
    const beats: number[] = [];
    let on = 0;
    let prev = 0;
    for (let t = 0; t < 10; t += 1 / 60) {
      expect(outlineFlicker(1, t)).toBe(0);
      const f = outlineFlicker(2, t);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(FLICKER_MAX + 1e-9);
      if (f > 0 && prev === 0) beats.push(t);
      if (f > 0) on++;
      prev = f;
    }
    // Some dropouts, mostly lit, and the gaps between dropouts are not all the same.
    expect(beats.length).toBeGreaterThanOrEqual(5);
    expect(on / 600).toBeLessThan(0.6);
    const gaps = beats.slice(1).map((b, k) => b - (beats[k] ?? 0));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(0.1);
  });
});

describe('no black in the damage', () => {
  it('the fracture colour is the boss hue at 35 percent brightness', () => {
    const hue = 0x3a7bff;
    const d = dimRgb(hue, 0.35);
    expect(hueDistance(hueOfRgb(d), hueOfRgb(hue))).toBeLessThan(3);
    expect((d & 255) / (hue & 255)).toBeCloseTo(0.35, 1);
    expect(d).not.toBe(0);
  });

  it('the renderer damage pass paints nothing black or toward black', () => {
    const src = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
    const i = src.indexOf('function drawDamage(');
    expect(i).toBeGreaterThan(0);
    const body = src.slice(i, src.indexOf('\n  }\n', i));
    expect(body).not.toMatch(/0x000000/);
    expect(body).not.toMatch(/mixRgb\([^)]*0x0{6}/);
    // Every colour in the pass is the boss hue family (glow, ember) or white on the erase layer,
    // where the erase blend ignores the colour and uses only the alpha as the cut.
    const colours = [...body.matchAll(/color: ([\w.]+)/g)].map((m) => m[1]);
    expect(colours.length).toBeGreaterThan(4);
    for (const c of colours) expect(['glow', 'ember', '0xffffff']).toContain(c);
    // White is only ever drawn on the erase layer.
    for (const m of body.matchAll(/(\w+)\.stroke\(\{[^}]*0xffffff/g)) expect(m[1]).toBe('e');
  });
});
