// Look v32 Ember flame body: palette hues, Ember against Spindle, tongue geometry and motion, the
// shimmer, and the flame tint of the fan bullets.
import { describe, expect, it } from 'vitest';
import { BOSS_EMBER, BOSS_SPINDLE, bossColourOf } from '../../src/render/bossLook';
import { flameBulletTint } from '../../src/render/enemyBulletFx';
import {
  chromaOfRgb,
  EMBER_TONGUES,
  FLAME_BANDS,
  FLAME_STOP_COUNT,
  flameAt,
  flameColour,
  flameShimmer,
  flameStops,
  flameTongue,
  hueDistance,
  hueOfRgb,
  SHIMMER_SEC,
  TONGUE_FLOATS,
} from '../../src/render/emberFlame';
import { computePalette, NEON_DEFAULT, neonParams, palette } from '../../src/render/neon';

const stops = (): Uint32Array => flameStops(palette, new Uint32Array(FLAME_STOP_COUNT));

/** Distinct hues among saturated colours: hues at least minGap degrees from every other kept hue. */
function distinctHues(cols: readonly number[], minGap: number): number {
  const kept: number[] = [];
  for (const c of cols) {
    if (chromaOfRgb(c) < 0.35) continue;
    const h = hueOfRgb(c);
    if (kept.every((k) => hueDistance(k, h) >= minGap)) kept.push(h);
  }
  return kept.length;
}

describe('Ember flame palette', () => {
  it('uses at least four distinct hues, from deep red at the root to a white hot tip', () => {
    const s = stops();
    expect(distinctHues(Array.from(s), 8)).toBeGreaterThanOrEqual(4);
    // Root is the reddest, the tip the palest.
    expect(hueOfRgb(s[0] ?? 0)).toBeLessThan(15);
    expect(chromaOfRgb(s[FLAME_STOP_COUNT - 1] ?? 0)).toBeLessThan(chromaOfRgb(s[0] ?? 0));
    const tip = s[FLAME_STOP_COUNT - 1] ?? 0;
    expect(Math.min((tip >> 16) & 255, (tip >> 8) & 255, tip & 255)).toBeGreaterThan(150);
  });

  it('keeps four distinct hues at the default and the top neon setting (it follows applyNeon)', () => {
    for (const n of [NEON_DEFAULT, 100]) {
      const pal = computePalette(neonParams(n).saturation);
      expect(distinctHues(Array.from(flameStops(pal, new Uint32Array(FLAME_STOP_COUNT))), 8), `neon ${n}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('Ember and Spindle primary hues differ by at least 30 degrees', () => {
    const ember = hueOfRgb(palette[bossColourOf(BOSS_EMBER)]);
    const spindle = hueOfRgb(palette[bossColourOf(BOSS_SPINDLE)]);
    expect(hueDistance(ember, spindle)).toBeGreaterThanOrEqual(30);
  });

  it('a tongue shades through the stops from root to tip', () => {
    const s = stops();
    expect(flameAt(s, 0)).toBe(s[0]);
    expect(flameAt(s, 1)).toBe(s[FLAME_STOP_COUNT - 1]);
    const band = Array.from({ length: FLAME_BANDS }, (_, j) => flameAt(s, (j + 0.5) / FLAME_BANDS));
    expect(new Set(band).size).toBe(FLAME_BANDS);
  });

  it('the shimmer reshuffles the colour mix every 0.5 s, crossfaded and bounded', () => {
    const s = stops();
    let changed = 0;
    for (let step = 0; step < 12; step++) {
      const a = flameColour(s, 0.5, step * SHIMMER_SEC, 2);
      const b = flameColour(s, 0.5, (step + 1) * SHIMMER_SEC, 2);
      if (a !== b) changed++;
      expect(Math.abs(flameShimmer(step * SHIMMER_SEC + 0.13, 2))).toBeLessThanOrEqual(0.18 + 1e-9);
    }
    expect(changed).toBeGreaterThanOrEqual(10);
    // Smooth within a step: a frame later the offset barely moves.
    expect(Math.abs(flameShimmer(1.2, 1) - flameShimmer(1.2 + 1 / 60, 1))).toBeLessThan(0.03);
  });
});

describe('Ember flame tongues', () => {
  const R = 44;

  it('5 to 7 tongues, each narrowing to a tip that rises toward screen up at any facing', () => {
    expect(EMBER_TONGUES).toBeGreaterThanOrEqual(5);
    expect(EMBER_TONGUES).toBeLessThanOrEqual(7);
    const out = new Float32Array(EMBER_TONGUES * TONGUE_FLOATS);
    for (const rot of [0, 1.3, Math.PI, -2]) {
      for (let k = 0; k < EMBER_TONGUES; k++) {
        flameTongue(k, 0.7, R, rot, out);
        const o = k * TONGUE_FLOATS;
        const rt = o + (FLAME_BANDS + 1) * 2;
        const rootY = ((out[o + 1] ?? 0) + (out[rt + 1] ?? 0)) / 2;
        const tipY = out[o + FLAME_BANDS * 2 + 1] ?? 0;
        expect(tipY, `rot ${rot} tongue ${k}`).toBeLessThan(rootY);
        const rootW = Math.hypot((out[o] ?? 0) - (out[rt] ?? 0), (out[o + 1] ?? 0) - (out[rt + 1] ?? 0));
        const tipW = Math.hypot((out[o + FLAME_BANDS * 2] ?? 0) - (out[rt + FLAME_BANDS * 2] ?? 0), tipY - (out[rt + FLAME_BANDS * 2 + 1] ?? 0));
        expect(tipW).toBeLessThan(rootW * 0.1);
        expect(Math.hypot(out[o + FLAME_BANDS * 2] ?? 0, tipY)).toBeLessThan(R * 2);
      }
    }
  });

  it('is deterministic in time and licks: heights and tips move between frames', () => {
    const a = flameTongue(3, 1.25, R, 0.4, new Float32Array(EMBER_TONGUES * TONGUE_FLOATS));
    const b = flameTongue(3, 1.25, R, 0.4, new Float32Array(EMBER_TONGUES * TONGUE_FLOATS));
    expect(Array.from(a)).toEqual(Array.from(b));
    const c = flameTongue(3, 1.55, R, 0.4, new Float32Array(EMBER_TONGUES * TONGUE_FLOATS));
    const o = 3 * TONGUE_FLOATS + FLAME_BANDS * 2;
    expect(Math.hypot((a[o] ?? 0) - (c[o] ?? 0), (a[o + 1] ?? 0) - (c[o + 1] ?? 0))).toBeGreaterThan(0.5);
  });
});

describe('Ember fan bullets', () => {
  it('take the flame palette, never the white tip, and differ bullet to bullet', () => {
    const s = stops();
    const tints = new Set<number>();
    for (let i = 0; i < 12; i++) {
      const t = flameBulletTint(s, (i * 0.618034) % 1, 0.4);
      tints.add(t);
      expect(chromaOfRgb(t)).toBeGreaterThan(0.4);
      const h = hueOfRgb(t);
      expect(h <= 60 || h >= 350).toBe(true);
    }
    expect(tints.size).toBeGreaterThanOrEqual(6);
  });
});
