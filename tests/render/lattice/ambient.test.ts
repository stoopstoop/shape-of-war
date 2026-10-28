import { describe, expect, it } from 'vitest';
import { AMBIENT_AMP, ambientOffset, createAmbient, stepAmbient } from '../../../src/render/lattice/ambient';
import { buildLattice } from '../../../src/render/lattice/layout';
import { createLatticeSim, writePositions, writePositionsAmbient } from '../../../src/render/lattice/sim';
import { arena } from './fixtures';

const A = arena('rect', 1800, 1100);

describe('ambient drift', () => {
  it('offset never exceeds the amplitude and is 0 at amplitude 0', () => {
    for (let k = 0; k < 80; k++) {
      for (let t = 0; t < 30; t += 0.7) {
        expect(Math.abs(ambientOffset(k, t, AMBIENT_AMP, 0))).toBeLessThanOrEqual(AMBIENT_AMP + 1e-9);
        expect(Math.abs(ambientOffset(k, t, AMBIENT_AMP, 1))).toBeLessThanOrEqual(AMBIENT_AMP + 1e-9);
        expect(Math.abs(ambientOffset(k, t, 0, 0))).toBe(0);
      }
    }
  });

  it('moves over time (never frozen) and is slow (under 2 u/s)', () => {
    const dt = 1 / 60;
    let moved = 0;
    for (let t = 0; t < 10; t += dt) {
      const d = Math.abs(ambientOffset(3, t + dt, AMBIENT_AMP, 0) - ambientOffset(3, t, AMBIENT_AMP, 0));
      expect(d / dt).toBeLessThan(2);
      moved += d;
    }
    expect(moved).toBeGreaterThan(1);
  });

  it('indexes every free node inside the grid', () => {
    const L = buildLattice(A, 25);
    const a = createAmbient(L);
    expect(a.colOf.length).toBe(L.free);
    for (let i = 0; i < L.free; i++) {
      expect(a.colOf[i] ?? -1).toBeGreaterThanOrEqual(0);
      expect(a.colOf[i] ?? L.cols).toBeLessThan(L.cols);
      expect(a.rowOf[i] ?? -1).toBeGreaterThanOrEqual(0);
      expect(a.rowOf[i] ?? L.rows).toBeLessThan(L.rows);
    }
  });

  it('amplitude 0 writes the plain positions; pinned ends never drift', () => {
    const L = buildLattice(A, 25);
    const sim = createLatticeSim(L);
    const a = createAmbient(L);
    const plain = new Float32Array(L.count * 2);
    const drift = new Float32Array(L.count * 2);
    writePositions(sim, plain, 1);
    stepAmbient(a, 12.3, 0);
    writePositionsAmbient(sim, drift, 1, a);
    expect(Array.from(drift)).toEqual(Array.from(plain));
    stepAmbient(a, 12.3, AMBIENT_AMP);
    writePositionsAmbient(sim, drift, 1, a);
    let maxFree = 0;
    for (let i = 0; i < 2 * L.free; i++) maxFree = Math.max(maxFree, Math.abs((drift[i] ?? 0) - (plain[i] ?? 0)));
    expect(maxFree).toBeGreaterThan(0);
    expect(maxFree).toBeLessThanOrEqual(AMBIENT_AMP + 1e-4);
    for (let i = 2 * L.free; i < 2 * L.count; i++) expect(drift[i]).toBe(plain[i]);
  });

  it('bad time and amplitude give a rest lattice', () => {
    const L = buildLattice(A, 25);
    const a = createAmbient(L);
    stepAmbient(a, Number.NaN, Number.NaN);
    expect(Array.from(a.dx).every((v) => v === 0)).toBe(true);
    expect(Array.from(a.dy).every((v) => v === 0)).toBe(true);
  });
});
