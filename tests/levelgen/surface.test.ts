// v2 hook (docs/09-v2-roadmap.md section 5): the one v1 test of src/core/surface.ts, plus the
// LevelDef surface field it reserves.
import { describe, expect, it } from 'vitest';
import { flatSurface } from '../../src/core/surface';
import { FIXTURE_RECT_EASY } from '../../src/levelgen/fixtures';
import { generateLevel } from '../../src/levelgen/generator';
import { validateLevel } from '../../src/levelgen/validate';

describe('flatSurface', () => {
  it('is a plain plane: delta is b minus a, wrap is a no op, toXYZ has z 0', () => {
    const s = flatSurface(1600, 1000);
    expect(s.kind).toBe('flat');
    expect(s.width).toBe(1600);
    expect(s.height).toBe(1000);
    expect(s.topology).toEqual({ wrapU: false, wrapV: false, flipVOnWrapU: false });
    const out = { x: 9, y: 9 };
    expect(s.delta(790, -490, -790, 490, out)).toBe(out);
    expect(out).toEqual({ x: -1580, y: 980 });
    const pos = { x: 5000, y: -5000 };
    expect(s.wrap(pos)).toBe(false);
    expect(pos).toEqual({ x: 5000, y: -5000 });
    const v = { x: 0, y: 0, z: 7 };
    expect(s.toXYZ(12, -34, v)).toBe(v);
    expect(v).toEqual({ x: 12, y: -34, z: 0 });
  });
});

describe('LevelDef surface field', () => {
  it('generator emits flat; validator accepts only flat (V1)', () => {
    const d = generateLevel(1, 1);
    expect(d.surface).toBe('flat');
    expect(validateLevel(d).ok).toBe(true);
    const bad: unknown = { ...structuredClone(FIXTURE_RECT_EASY), surface: 'torus' };
    const errs = validateLevel(bad as typeof FIXTURE_RECT_EASY).errors;
    expect(errs.some((e) => e.startsWith('V1:'))).toBe(true);
    const missing = structuredClone(FIXTURE_RECT_EASY);
    delete missing.surface;
    expect(validateLevel(missing).errors.some((e) => e.startsWith('V1:'))).toBe(true);
  });
});
