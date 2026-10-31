// v31 two tone table: every boss but the Prism has an accent; the named accents per brief.
import { describe, expect, it } from 'vitest';
import { BOSS_IDS } from '../../src/levelgen/leveldef';
import { BOSS_COUNT, BOSS_PRISM, bossColourOf } from '../../src/render/bossLook';
import { accentRgb, bossAccent, bossAttackKey, bossPartTint, BOSS_TWO_TONE, type AccentPart } from '../../src/render/bossIdentity';
import { palette } from '../../src/render/neon';

const EXPECT: readonly (readonly AccentPart[])[] = [
  ['rim'],
  ['pods'],
  ['axis', 'tips'],
  ['core', 'sparks'],
  ['split'],
  ['centre', 'rim'],
  ['turrets'],
  ['tail'],
  ['coreA', 'coreB'],
  [],
];

function hueOf(c: number): number {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('two tone table', () => {
  it('has one row per boss, every boss but the Prism has an accent', () => {
    expect(BOSS_TWO_TONE.length).toBe(BOSS_COUNT);
    expect(BOSS_TWO_TONE.length).toBe(BOSS_IDS.length);
    BOSS_TWO_TONE.forEach((row, i) => {
      if (i === BOSS_PRISM) expect(row.length).toBe(0);
      else expect(row.length, String(BOSS_IDS[i])).toBeGreaterThan(0);
    });
  });

  it('carries the accent parts named in the brief for each boss, in BOSS_IDS order', () => {
    BOSS_TWO_TONE.forEach((row, i) => expect(row.map((e) => e.part)).toEqual(EXPECT[i]));
  });

  it('every accent differs from the primary body colour', () => {
    BOSS_TWO_TONE.forEach((row, i) => {
      for (const e of row) expect(accentRgb(e.tone, palette), String(i) + ':' + e.part).not.toBe(palette[bossColourOf(i)]);
    });
  });

  it('Ember and Spindle separate: deep red core against a cyan axis', () => {
    const ember = bossAccent(3, 'core');
    const spindle = bossAccent(2, 'axis');
    expect(ember).not.toBeNull();
    expect(spindle).not.toBeNull();
    if (ember === null || spindle === null) return;
    const d = Math.abs(hueOf(accentRgb(ember, palette)) - hueOf(accentRgb(spindle, palette)));
    expect(Math.min(d, 360 - d)).toBeGreaterThan(120);
  });

  it('pods and turrets take the accent; other parts and hazards keep the primary', () => {
    const p = 0x123456;
    expect(bossPartTint(1, p, palette)).not.toBe(p);
    expect(bossPartTint(6, p, palette)).not.toBe(p);
    expect(bossPartTint(5, p, palette)).toBe(p);
    for (let i = 0; i < BOSS_COUNT; i++) expect(bossAttackKey(i)).toBe(bossColourOf(i));
  });

  it('accents mix toward white or black within range', () => {
    for (const row of BOSS_TWO_TONE)
      for (const e of row) {
        expect(e.tone.white).toBeGreaterThanOrEqual(0);
        expect(e.tone.white).toBeLessThanOrEqual(1);
        expect(e.tone.black).toBeGreaterThanOrEqual(0);
        expect(e.tone.black).toBeLessThanOrEqual(1);
        expect(accentRgb(e.tone, palette)).toBeGreaterThanOrEqual(0);
        expect(accentRgb(e.tone, palette)).toBeLessThanOrEqual(0xffffff);
      }
  });
});
