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

// Tier 2 (wave B): the same rule as tier 1 against docs/01 section 11, plus the enemies a fight can
// still show (waves run at 0.6 of their budget beside a boss) and the tier 1 keys.
const PAIRS2: readonly [PaletteKey, PaletteKey][] = [
  ['bossOrange', 'orange'],
  ['bossMagenta', 'magenta'],
  ['bossViolet', 'purple'],
];
const ENEMY_KEYS: readonly PaletteKey[] = ['blue', 'purple', 'green', 'magenta', 'orange', 'cyan', 'red', 'yellow', 'charger', 'bulwark', 'blink', 'swirl', 'sower', 'splime'];

describe('tier 2 boss palette', () => {
  it('reads as orange, magenta and violet: 8 to 15 degrees off the named family', () => {
    for (const [boss, family] of PAIRS2) {
      const d = hueDist(BASE_PALETTE[boss][0], BASE_PALETTE[family][0]);
      expect(d, boss).toBeGreaterThanOrEqual(8);
      expect(d, boss).toBeLessThanOrEqual(15);
    }
  });

  it('is more saturated and lighter than its enemy family, and a different colour', () => {
    for (const [boss, family] of PAIRS2) {
      const [, bs, bl] = BASE_PALETTE[boss];
      const [, fs, fl] = BASE_PALETTE[family];
      expect(bs).toBeGreaterThan(fs);
      expect(bl).toBeGreaterThanOrEqual(fl + 0.02);
      expect(paletteColour(boss, 1)).not.toBe(paletteColour(family, 1));
    }
  });

  it('keeps at least 8 degrees from every enemy hue, 25 from the well ring red', () => {
    for (const [boss] of PAIRS2) {
      for (const e of ENEMY_KEYS) expect(hueDist(BASE_PALETTE[boss][0], BASE_PALETTE[e][0]), `${boss} vs ${e}`).toBeGreaterThanOrEqual(8);
      expect(hueDist(BASE_PALETTE[boss][0], 355)).toBeGreaterThanOrEqual(25);
    }
  });

  it('stays darker than every weapon colour and 25 degrees from the nearest weapon hue', () => {
    const weaponKeys = new Set(Object.values(WEAPON_PALETTE).filter((k) => k !== 'yellow'));
    for (const [boss] of PAIRS2) {
      for (const w of weaponKeys) {
        expect(BASE_PALETTE[boss][2], `${boss} vs ${w}`).toBeLessThan(BASE_PALETTE[w][2] - 0.05);
        expect(hueDist(BASE_PALETTE[boss][0], BASE_PALETTE[w][0]), `${boss} vs ${w}`).toBeGreaterThanOrEqual(25);
      }
    }
  });

  it('the three tier 2 keys are at least 30 degrees apart and apart from the tier 1 keys', () => {
    const t2: PaletteKey[] = ['bossOrange', 'bossMagenta', 'bossViolet'];
    const t1: PaletteKey[] = ['bossBlue', 'bossGreen', 'bossYellow'];
    for (let i = 0; i < t2.length; i++) {
      const a = t2[i];
      if (!a) continue;
      for (let j = i + 1; j < t2.length; j++) {
        const b = t2[j];
        if (b) expect(hueDist(BASE_PALETTE[a][0], BASE_PALETTE[b][0])).toBeGreaterThanOrEqual(30);
      }
      for (const b of t1) expect(paletteColour(a, 1)).not.toBe(paletteColour(b, 1));
    }
  });

  it('keeps the slider range: saturation in (0, 1], lightness 0.5 to 0.66', () => {
    for (const [boss] of PAIRS2) {
      const [, s, l] = BASE_PALETTE[boss];
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(1);
      expect(l).toBeGreaterThanOrEqual(0.5);
      expect(l).toBeLessThanOrEqual(0.66);
    }
  });
});
