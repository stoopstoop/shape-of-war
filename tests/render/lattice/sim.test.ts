import { describe, expect, it } from 'vitest';
import { hash01 } from '../../../src/render/color';
import { buildLattice, chooseSpacing, type LatticeLayout } from '../../../src/render/lattice/layout';
import {
  addForce,
  addImpulse,
  addRing,
  clearForces,
  createLatticeSim,
  forceProfile,
  latticeAlpha,
  MAX_IMPULSES,
  MAX_SPRING,
  MAX_SUBSTEPS,
  maxDispFor,
  maxDisplacement,
  resetLattice,
  springFor,
  stepLattice,
  SUB_DT,
  writePositions,
  type LatticeSim,
} from '../../../src/render/lattice/sim';
import { KICK_BOMB, KICK_DEATH, KICK_KILL, WELL_PULL_ACCEL, wellPullRadius } from '../../../src/render/lattice/kicks';
import { arena } from './fixtures';

const A = arena('rect', 1800, 1100);

function layout(spacing = 25): LatticeLayout {
  return buildLattice(A, spacing);
}

function run(sim: LatticeSim, seconds: number, dt = 1 / 60, each?: (frame: number) => void): void {
  const frames = Math.round(seconds / dt);
  for (let f = 0; f < frames; f++) {
    each?.(f);
    stepLattice(sim, dt);
  }
}

/** Node nearest a point (free nodes only). */
function nodeNear(L: LatticeLayout, x: number, y: number): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < L.free; i++) {
    const d = Math.hypot((L.restX[i] ?? 0) - x, (L.restY[i] ?? 0) - y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

describe('lattice sim', () => {
  it('rest state stays exactly at rest for 10 s', () => {
    const sim = createLatticeSim(layout());
    const out = new Float32Array(sim.layout.count * 2);
    run(sim, 10);
    expect(maxDisplacement(sim)).toBe(0);
    expect(sim.awake).toBe(false);
    expect(writePositions(sim, out, 0)).toBe(true); // the first write lays out the rest grid
    for (let i = 0; i < sim.layout.count; i++) {
      expect(out[2 * i]).toBe(sim.layout.restX[i]);
      expect(out[2 * i + 1]).toBe(sim.layout.restY[i]);
    }
    // Nothing moved since: no further write (and no GPU upload).
    run(sim, 1);
    expect(writePositions(sim, out, 0.5)).toBe(false);
  });

  it('rest state stays at rest at 120 Hz frames too', () => {
    const sim = createLatticeSim(layout(16));
    run(sim, 10, 1 / 120);
    expect(maxDisplacement(sim)).toBe(0);
    expect(sim.steps).toBe(0);
  });

  it('an impulse moves the lattice, then decays to rest and sleeps', () => {
    const sim = createLatticeSim(layout());
    addImpulse(sim, 0, 0, KICK_DEATH.strength, KICK_DEATH.radius);
    let peak = 0;
    run(sim, 0.5, 1 / 60, () => {
      peak = Math.max(peak, maxDisplacement(sim));
    });
    expect(peak).toBeGreaterThan(5);
    run(sim, 8);
    expect(maxDisplacement(sim)).toBeLessThan(0.05);
    expect(sim.awake).toBe(false);
    expect(maxDisplacement(sim)).toBe(0);
  });

  it('a small kill impulse is visible but smaller than a death', () => {
    const peakFor = (s: number, r: number): number => {
      const sim = createLatticeSim(layout());
      addImpulse(sim, 0, 0, s, r);
      let peak = 0;
      run(sim, 0.6, 1 / 60, () => {
        peak = Math.max(peak, maxDisplacement(sim));
      });
      return peak;
    };
    const kill = peakFor(KICK_KILL.strength, KICK_KILL.radius);
    const death = peakFor(KICK_DEATH.strength, KICK_DEATH.radius);
    expect(kill).toBeGreaterThan(1);
    expect(death).toBeGreaterThan(kill);
  });

  it('an impulse pushes nearby nodes outward', () => {
    const sim = createLatticeSim(layout());
    const L = sim.layout;
    const id = nodeNear(L, 50, 0);
    addImpulse(sim, 0, 0, 400, 120);
    run(sim, 3 * SUB_DT);
    expect(sim.ux[id] ?? 0).toBeGreaterThan(0);
  });

  it('a bomb ring expands: far nodes move later than near ones', () => {
    const sim = createLatticeSim(layout());
    const L = sim.layout;
    const near = nodeNear(L, 150, 0);
    const far = nodeNear(L, 700, 0);
    addRing(sim, 0, 0, KICK_BOMB.strength, KICK_BOMB.speed, KICK_BOMB.life, KICK_BOMB.width);
    run(sim, 0.2);
    const nearAt = Math.abs(sim.ux[near] ?? 0);
    const farAt = Math.abs(sim.ux[far] ?? 0);
    expect(nearAt).toBeGreaterThan(0.5);
    expect(nearAt).toBeGreaterThan(farAt);
    run(sim, 0.5);
    expect(Math.abs(sim.ux[far] ?? 0)).toBeGreaterThan(0.5);
    run(sim, 10);
    expect(sim.awake).toBe(false);
  });

  it('a well pulls a dimple toward its centre while present, then lets go', () => {
    const sim = createLatticeSim(layout());
    const L = sim.layout;
    const R = wellPullRadius(24);
    const id = nodeNear(L, 200 + R / 3, 100);
    run(sim, 2, 1 / 60, () => {
      clearForces(sim);
      addForce(sim, 200, 100, R, WELL_PULL_ACCEL);
    });
    expect(sim.ux[id] ?? 0).toBeLessThan(-1); // pulled back toward x = 200
    clearForces(sim); // the well is gone
    run(sim, 10);
    expect(sim.awake).toBe(false);
  });

  it('displacement stays bounded over 20 s of fuzzed impulses, rings and forces', () => {
    for (const spacing of [16, 25]) {
      const sim = createLatticeSim(layout(spacing));
      const bound = maxDispFor(spacing);
      let seq = 0;
      const h = (): number => hash01(++seq);
      let t = 0;
      while (t < 20) {
        const dt = 0.004 + h() * 0.05;
        t += dt;
        const n = Math.floor(h() * 4);
        for (let k = 0; k < n; k++) addImpulse(sim, (h() - 0.5) * 1800, (h() - 0.5) * 1100, 200 + h() * 3000, 40 + h() * 300);
        if (h() < 0.05) addRing(sim, (h() - 0.5) * 1800, (h() - 0.5) * 1100, 200 + h() * 2000, 600 + h() * 900, 0.4 + h(), 30 + h() * 80);
        clearForces(sim);
        for (let k = 0; k < 4; k++) addForce(sim, (h() - 0.5) * 1800, (h() - 0.5) * 1100, 100 + h() * 300, (h() - 0.5) * 6000);
        stepLattice(sim, dt);
        const m = maxDisplacement(sim);
        expect(Number.isFinite(m)).toBe(true);
        expect(m).toBeLessThanOrEqual(bound + 1e-3);
      }
    }
  });

  it('identical impulse logs give identical positions', () => {
    const play = (): Float32Array => {
      const sim = createLatticeSim(layout());
      const out = new Float32Array(sim.layout.count * 2);
      let seq = 1000;
      for (let f = 0; f < 600; f++) {
        const dt = 0.008 + hash01(++seq) * 0.03;
        if (hash01(++seq) < 0.2) addImpulse(sim, (hash01(++seq) - 0.5) * 1600, (hash01(++seq) - 0.5) * 900, 500, 120);
        if (f === 100) addRing(sim, 0, 0, KICK_BOMB.strength, KICK_BOMB.speed, KICK_BOMB.life, KICK_BOMB.width);
        clearForces(sim);
        addForce(sim, 300, -200, 200, WELL_PULL_ACCEL);
        stepLattice(sim, dt);
      }
      writePositions(sim, out, latticeAlpha(sim));
      return out;
    };
    const a = play();
    const b = play();
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(a.some((v, i) => i % 2 === 0 && Number.isFinite(v))).toBe(true);
  });

  it('takes at most three 60 Hz sub steps a frame and drops the rest', () => {
    const sim = createLatticeSim(layout());
    addImpulse(sim, 0, 0, 500, 100);
    expect(stepLattice(sim, 0.5)).toBe(MAX_SUBSTEPS);
    expect(sim.acc).toBe(0);
    expect(stepLattice(sim, 1 / 60)).toBe(1);
    expect(stepLattice(sim, 1 / 120)).toBe(0);
    expect(stepLattice(sim, 1 / 120)).toBe(1);
    expect(stepLattice(sim, Number.NaN)).toBe(0);
  });

  it('keeps the spring term inside the stability limit for every ladder spacing', () => {
    for (const s of [16, 20, 25, 33, 50, 100]) {
      const k = springFor(s);
      expect(k).toBeGreaterThan(0);
      expect(k).toBeLessThanOrEqual(MAX_SPRING);
      expect(8 * k).toBeLessThan(4);
    }
  });

  it('the impulse queue keeps the strongest kicks', () => {
    const sim = createLatticeSim(layout());
    for (let i = 0; i < MAX_IMPULSES; i++) addImpulse(sim, 0, 0, 100 + i, 50);
    addImpulse(sim, 0, 0, 50, 50); // weaker than all: dropped
    expect(sim.impN).toBe(MAX_IMPULSES);
    expect(Math.min(...Array.from(sim.impS))).toBe(100);
    addImpulse(sim, 0, 0, 5000, 50); // replaces the weakest
    expect(Math.min(...Array.from(sim.impS))).toBe(101);
    expect(Math.max(...Array.from(sim.impS))).toBe(5000);
  });

  it('ignores bad input', () => {
    const sim = createLatticeSim(layout());
    addImpulse(sim, Number.NaN, 0, 500, 100);
    addImpulse(sim, 0, 0, -1, 100);
    addRing(sim, 0, 0, 100, 0, 1, 10);
    addForce(sim, 0, 0, 0, 100);
    expect(sim.awake).toBe(false);
    run(sim, 1);
    expect(maxDisplacement(sim)).toBe(0);
  });

  it('reset returns to rest', () => {
    const sim = createLatticeSim(layout());
    addImpulse(sim, 0, 0, 900, 200);
    run(sim, 0.3);
    expect(maxDisplacement(sim)).toBeGreaterThan(0);
    resetLattice(sim);
    expect(maxDisplacement(sim)).toBe(0);
    expect(sim.awake).toBe(false);
  });

  it('force profile is zero at the centre and the rim and peaks at 1', () => {
    expect(forceProfile(0)).toBe(0);
    expect(forceProfile(1)).toBe(0);
    expect(forceProfile(1 / 3)).toBeCloseTo(1, 6);
    expect(forceProfile(Number.NaN)).toBe(0);
  });

  it('writes interpolated positions for every node, pinned ends at rest', () => {
    const sim = createLatticeSim(layout());
    const out = new Float32Array(sim.layout.count * 2);
    addImpulse(sim, 0, 0, 900, 200);
    run(sim, 0.1);
    expect(writePositions(sim, out, latticeAlpha(sim))).toBe(true);
    for (let i = sim.layout.free; i < sim.layout.count; i++) {
      expect(out[2 * i]).toBe(sim.layout.restX[i]);
      expect(out[2 * i + 1]).toBe(sim.layout.restY[i]);
    }
  });

  it('steps an 8192 node high tier lattice in well under a frame', () => {
    const a = arena('rect', 1800, 1100);
    const L = buildLattice(a, chooseSpacing(a, 16, 8192));
    const sim = createLatticeSim(L);
    const out = new Float32Array(L.count * 2);
    const t0 = performance.now();
    for (let f = 0; f < 120; f++) {
      if (f % 4 === 0) addImpulse(sim, (hash01(f) - 0.5) * 1600, 0, 900, 200);
      clearForces(sim);
      addForce(sim, 0, 0, 250, WELL_PULL_ACCEL);
      stepLattice(sim, 1 / 60);
      writePositions(sim, out, latticeAlpha(sim));
    }
    const perFrame = (performance.now() - t0) / 120;
    // Desktop node budget; the device is slower, this only guards against a quadratic slip.
    expect(perFrame).toBeLessThan(8);
  });
});
