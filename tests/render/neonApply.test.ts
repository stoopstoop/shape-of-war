import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { applyNeon, getNeonState, neonParams, neonRender, type NeonParams, type NeonRender } from '../../src/render/neon';
import { bindNeon, type NeonTargets, type PaletteView } from '../../src/render/neonApply';

interface FakeView {
  tint: number;
  context: string;
}

/** Fake renderer: a live bloom object, a grid, and views that record their context and tint. */
function fakeTargets(): {
  targets: NeonTargets;
  bloom: { bloomScale: number; threshold: number };
  grid: { alpha: number };
  views: FakeView[];
  sprite: { alpha: number; scale: number };
} {
  const bloom = { bloomScale: -1, threshold: -1 };
  const grid = { alpha: -1 };
  const views: FakeView[] = [
    { tint: 0, context: 'none' },
    { tint: 0, context: 'none' },
  ];
  const sprite = { alpha: -1, scale: -1 };
  let gen = 0;
  const targets: NeonTargets = {
    bloom,
    grid,
    shapes(r: Readonly<NeonRender>): void {
      gen++;
      for (const v of views) v.context = `ctx${gen}:${r.haloAlpha.toFixed(3)}`;
    },
    tint(pal: PaletteView): void {
      for (const v of views) v.tint = pal.blue;
    },
    sprites(r: Readonly<NeonRender>): void {
      sprite.alpha = r.spriteAlpha;
      sprite.scale = r.spriteScale;
    },
  };
  return { targets, bloom, grid, views, sprite };
}

let off: (() => void) | null = null;
afterEach(() => {
  off?.();
  off = null;
  applyNeon(70);
});

describe('neon controller', () => {
  it('applyNeon(0) and applyNeon(100) produce different renderer settings', () => {
    const f = fakeTargets();
    off = bindNeon(f.targets);
    const bloomRef = f.targets.bloom;

    applyNeon(0);
    const low = { bloom: { ...f.bloom }, grid: f.grid.alpha, tint: f.views[0]?.tint, ctx: f.views[0]?.context, sprite: { ...f.sprite } };
    applyNeon(100);

    expect(f.targets.bloom).toBe(bloomRef); // the live instance is written, not a copy
    expect(low.bloom.bloomScale).toBe(0);
    expect(f.bloom.bloomScale).toBeGreaterThan(2);
    expect(low.bloom.threshold).toBeCloseTo(0.8, 10);
    expect(f.bloom.threshold).toBeCloseTo(0.2, 10);
    expect(low.grid).toBeCloseTo(0.1, 10);
    expect(f.grid.alpha).toBeCloseTo(0.6, 10);
    expect(f.views[0]?.tint).not.toBe(low.tint);
    expect(f.views[1]?.tint).toBe(f.views[0]?.tint);
    expect(f.views[0]?.context).not.toBe(low.ctx);
    expect(f.sprite.alpha).toBeGreaterThan(low.sprite.alpha);
    expect(f.sprite.scale).toBeGreaterThan(low.sprite.scale);
  });

  it('applies the current settings immediately on bind', () => {
    applyNeon(40);
    const f = fakeTargets();
    off = bindNeon(f.targets);
    expect(f.bloom.bloomScale).toBeCloseTo(neonRender(neonParams(40)).bloomStrength, 10);
    expect(f.grid.alpha).toBeCloseTo(neonParams(40).gridAlpha, 10);
  });

  it('getNeonState reports the live value and emits neon:changed on the bus', () => {
    const seen: NeonParams[] = [];
    const unsub = bus.on('neon:changed', (p) => seen.push(p));
    applyNeon(25);
    unsub();
    expect(getNeonState().neon).toBe(25);
    expect(getNeonState().params.gridAlpha).toBeCloseTo(neonParams(25).gridAlpha, 10);
    expect(seen).toHaveLength(1);
  });

  it('neon 0 removes the halo and neon 100 makes it wide and bright', () => {
    const lo = neonRender(neonParams(0));
    const hi = neonRender(neonParams(100));
    expect(lo.haloAlpha).toBe(0);
    expect(lo.innerAlpha).toBe(0);
    expect(hi.haloAlpha).toBeGreaterThan(0.2);
    expect(hi.haloWidthMul).toBeGreaterThan(lo.haloWidthMul);
    expect(hi.particleAlpha).toBeGreaterThan(lo.particleAlpha);
    expect(hi.trailAlpha).toBeGreaterThan(lo.trailAlpha);
  });
});
