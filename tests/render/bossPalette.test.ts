// Tier 1 boss palette keys (docs/12 wave V3-A Glow item 1, docs/13 section 11): each reads as the
// colour Ryan named, yet is not the enemy of the same hue nor a weapon colour.
import { describe, expect, it } from 'vitest';
import { BASE_PALETTE, paletteColour, WEAPON_PALETTE, type PaletteKey } from '../../src/render/neon';

function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const PAIRS: readonly [PaletteKey, PaletteKey][] = [
  ['bossBlue', 'blue'],
  ['bossGreen', 'green'],
  ['bossYellow', 'yellow'],
];

describe('tier 1 boss palette', () => {
  it('reads as blue, green and yellow: within 20 degrees of the named family', () => {
    for (const [boss, family] of PAIRS) expect(hueDist(BASE_PALETTE[boss][0], BASE_PALETTE[family][0]), boss).toBeLessThanOrEqual(20);
  });

  it('is not the enemy of the same hue: at least 8 degrees off, more saturated and lighter', () => {
    for (const [boss, family] of PAIRS) {
      const [bh, bs, bl] = BASE_PALETTE[boss];
      const [fh, fs, fl] = BASE_PALETTE[family];
      expect(hueDist(bh, fh), boss).toBeGreaterThanOrEqual(8);
      expect(bs).toBeGreaterThan(fs);
      expect(bl).toBeGreaterThanOrEqual(fl + 0.04);
      expect(paletteColour(boss, 1)).not.toBe(paletteColour(family, 1));
    }
  });

  it('stays darker than every weapon colour (weapon shots read pale and hot)', () => {
    const weaponKeys = new Set(Object.values(WEAPON_PALETTE).filter((k) => k !== 'yellow'));
    for (const [boss] of PAIRS) {
      for (const w of weaponKeys) expect(BASE_PALETTE[boss][2], `${boss} vs ${w}`).toBeLessThan(BASE_PALETTE[w][2] - 0.05);
    }
  });

  it('keeps clear of the nearest weapon hues and the other tier 1 bosses', () => {
    expect(hueDist(BASE_PALETTE.bossBlue[0], BASE_PALETTE.rapid[0])).toBeGreaterThanOrEqual(20);
    expect(hueDist(BASE_PALETTE.bossGreen[0], BASE_PALETTE.orbit[0])).toBeGreaterThanOrEqual(20);
    // Spindle bullets are gold rings, the spread shot a yellow dot: 10 degrees apart as well as shape.
    expect(hueDist(BASE_PALETTE.bossYellow[0], BASE_PALETTE.yellow[0])).toBeGreaterThanOrEqual(8);
    const keys: PaletteKey[] = ['bossBlue', 'bossGreen', 'bossYellow'];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i];
        const b = keys[j];
        if (a && b) expect(hueDist(BASE_PALETTE[a][0], BASE_PALETTE[b][0])).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it('keeps the slider range: saturation in (0, 1], lightness 0.5 to 0.66', () => {
    for (const [boss] of PAIRS) {
      const [, s, l] = BASE_PALETTE[boss];
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(1);
      expect(l).toBeGreaterThanOrEqual(0.5);
      expect(l).toBeLessThanOrEqual(0.66);
    }
  });
});
