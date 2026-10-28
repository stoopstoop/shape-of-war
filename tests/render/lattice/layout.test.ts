import { describe, expect, it } from 'vitest';
import { EFFECTS_TIERS, latticeCapFor, latticeOn, latticeSpacingFor } from '../../../src/render/effects';
import { insideArena } from '../../../src/render/lattice/dust';
import { buildLattice, chooseSpacing, countLatticeNodes, ladderAt, SPACING_LADDER } from '../../../src/render/lattice/layout';
import type { ArenaDef } from '../../../src/levelgen/leveldef';
import { arena, sweepArenas } from './fixtures';

/** Distance from a point to the arena shape (0 inside), bounded check by shape. */
function outsideBy(a: ArenaDef, x: number, y: number): number {
  switch (a.shape) {
    case 'circle':
      return Math.max(0, Math.hypot(x, y) - a.width / 2);
    default:
      return Math.max(0, Math.abs(x) - a.width / 2, Math.abs(y) - a.height / 2);
  }
}

describe('lattice node counts per tier', () => {
  for (const { name, a } of sweepArenas()) {
    it(`respects the caps on ${name}`, () => {
      for (const t of EFFECTS_TIERS) {
        if (!latticeOn(t)) continue;
        const s = chooseSpacing(a, latticeSpacingFor(t), latticeCapFor(t));
        const L = buildLattice(a, s);
        expect(L.count).toBeLessThanOrEqual(latticeCapFor(t));
        expect(L.count).toBe(countLatticeNodes(a, s));
        expect(s).toBeGreaterThanOrEqual(latticeSpacingFor(t));
      }
    });
  }

  it('keeps the tier spacing when the arena fits: 25 u standard on 1800 x 1100', () => {
    const a = arena('rect', 1800, 1100);
    expect(chooseSpacing(a, latticeSpacingFor('standard'), latticeCapFor('standard'))).toBe(25);
    expect(countLatticeNodes(a, 25)).toBeGreaterThan(3000);
  });

  it('coarsens a 2400 x 2400 arena to fit the 4096 node standard cap', () => {
    const a = arena('rect', 2400, 2400);
    expect(countLatticeNodes(a, 25)).toBeGreaterThan(4096);
    const s = chooseSpacing(a, 25, 4096);
    expect(s).toBeGreaterThan(25);
    expect(countLatticeNodes(a, s)).toBeLessThanOrEqual(4096);
  });

  it('high is at least as dense as standard on the same arena', () => {
    for (const { a } of sweepArenas()) {
      const hi = chooseSpacing(a, latticeSpacingFor('high'), latticeCapFor('high'));
      const st = chooseSpacing(a, latticeSpacingFor('standard'), latticeCapFor('standard'));
      expect(hi).toBeLessThanOrEqual(st);
    }
  });

  it('a governor notch moves one ladder step coarser', () => {
    const a = arena('rect', 1800, 1100);
    expect(chooseSpacing(a, 25, 4096, 1)).toBe(33);
    expect(chooseSpacing(a, 16, 8192, 1)).toBeGreaterThan(chooseSpacing(a, 16, 8192, 0));
  });

  it('the ladder grows past its end', () => {
    const last = SPACING_LADDER.length - 1;
    expect(ladderAt(last + 1)).toBeGreaterThan(ladderAt(last));
    expect(ladderAt(0)).toBe(16);
  });
});

describe('lattice layout geometry', () => {
  for (const { name, a } of sweepArenas()) {
    it(`no node outside the arena shape plus one spacing on ${name}`, () => {
      const s = chooseSpacing(a, 25, 4096);
      const L = buildLattice(a, s);
      for (let i = 0; i < L.count; i++) {
        const x = L.restX[i] ?? 0;
        const y = L.restY[i] ?? 0;
        expect(outsideBy(a, x, y)).toBeLessThanOrEqual(s);
        // Free nodes are strictly inside the shape and outside every obstacle.
        if (i < L.free) expect(insideArena(a, x, y)).toBe(true);
      }
    });
  }

  it('free nodes have at most four neighbours and free links are symmetric', () => {
    for (const { a } of sweepArenas()) {
      const L = buildLattice(a, 40);
      for (let i = 0; i < L.free; i++) {
        let n = 0;
        for (let q = 0; q < 4; q++) {
          const j = L.nbr[i * 4 + q] ?? -1;
          if (j < 0) continue;
          n++;
          expect(j).not.toBe(i);
          if (j < L.free) {
            const back = Array.from(L.nbr.subarray(j * 4, j * 4 + 4));
            expect(back).toContain(i);
          }
        }
        expect(n).toBeGreaterThan(0);
      }
    }
  });

  it('interior nodes have four neighbours one spacing away', () => {
    const L = buildLattice(arena('rect', 1000, 800), 25);
    const centre = L.cell[-L.iMin + -L.jMin * L.cols] ?? -1;
    expect(centre).toBeGreaterThanOrEqual(0);
    for (let q = 0; q < 4; q++) {
      const j = L.nbr[centre * 4 + q] ?? -1;
      expect(j).toBeGreaterThanOrEqual(0);
      const d = Math.hypot((L.restX[j] ?? 0) - (L.restX[centre] ?? 0), (L.restY[j] ?? 0) - (L.restY[centre] ?? 0));
      expect(d).toBeCloseTo(25, 5);
    }
  });

  it('major lines are every second line, the centre lines included', () => {
    const L = buildLattice(arena('rect', 1000, 800), 25);
    const s = L.spacing;
    const lineIndex = (a: number, b: number): number => {
      const ax = L.restX[a] ?? 0;
      const bx = L.restX[b] ?? 0;
      return ax === bx ? Math.round(ax / s) : Math.round((L.restY[a] ?? 0) / s);
    };
    for (let k = 0; k < L.major.length; k += 2) expect(Math.abs(lineIndex(L.major[k] ?? 0, L.major[k + 1] ?? 0)) % 2).toBe(0);
    for (let k = 0; k < L.minor.length; k += 2) expect(Math.abs(lineIndex(L.minor[k] ?? 0, L.minor[k + 1] ?? 0)) % 2).toBe(1);
    expect(L.major.length).toBeGreaterThan(0);
    expect(L.minor.length).toBeGreaterThan(0);
  });

  it('every segment index is a valid node and segments are short', () => {
    for (const { a } of sweepArenas()) {
      const L = buildLattice(a, 33);
      for (const idx of [L.major, L.minor]) {
        for (let k = 0; k < idx.length; k += 2) {
          const p = idx[k] ?? 0;
          const q = idx[k + 1] ?? 0;
          expect(p).toBeLessThan(L.count);
          expect(q).toBeLessThan(L.count);
          const d = Math.hypot((L.restX[p] ?? 0) - (L.restX[q] ?? 0), (L.restY[p] ?? 0) - (L.restY[q] ?? 0));
          // One spacing plus the end margin, unless a chain has no free node at all.
          expect(d).toBeLessThanOrEqual(1.25 * 33 + 1e-3);
        }
      }
    }
  });

  it('builds identically twice', () => {
    const a = sweepArenas()[4]?.a ?? arena('rect', 1800, 1100);
    const x = buildLattice(a, 25);
    const y = buildLattice(a, 25);
    expect(Array.from(x.restX)).toEqual(Array.from(y.restX));
    expect(Array.from(x.major)).toEqual(Array.from(y.major));
    expect(Array.from(x.nbr)).toEqual(Array.from(y.nbr));
  });
});
