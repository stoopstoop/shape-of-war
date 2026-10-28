// Weapon palette keys (docs/10 wave B Glow item 1): rapid, pierce and orbit must read apart
// from the player bullet, the homing shot and every enemy colour, at the base HSL values.
import { describe, expect, it } from 'vitest';
import { BASE_PALETTE, type PaletteKey } from '../../src/render/neon';

const WEAPONS: readonly PaletteKey[] = ['rapid', 'pierce', 'orbit'];
// Every enemy family of docs/01 section 11 plus the wave C stubs and the hazards.
const ENEMIES: readonly PaletteKey[] = [
  'blue',
  'purple',
  'green',
  'magenta',
  'orange',
  'cyan',
  'red',
  'yellow',
  'charger',
  'bulwark',
  'blink',
  'swirl',
  'sower',
  'splime',
  'slime',
  'geom',
];

function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

describe('weapon palette', () => {
  it('weapon hues sit far from the player bullet (85 degrees) and the homing shot (75 degrees)', () => {
    for (const w of WEAPONS) {
      expect(hueDist(BASE_PALETTE[w][0], BASE_PALETTE.yellow[0])).toBeGreaterThanOrEqual(85);
      // docs/01 section 11 player bullet hue is 45; the in game shot uses the yellow key (55).
      expect(hueDist(BASE_PALETTE[w][0], 45)).toBeGreaterThanOrEqual(85);
      expect(hueDist(BASE_PALETTE[w][0], BASE_PALETTE.homing[0])).toBeGreaterThanOrEqual(75);
    }
  });

  it('weapon hues sit in gaps between enemy hues and are lighter than every enemy', () => {
    for (const w of WEAPONS) {
      const [h, , l] = BASE_PALETTE[w];
      for (const e of ENEMIES) {
        const [eh, , el] = BASE_PALETTE[e];
        expect(hueDist(h, eh)).toBeGreaterThanOrEqual(15);
        expect(l - el).toBeGreaterThanOrEqual(0.1);
      }
    }
  });

  it('the three weapons read apart from each other', () => {
    for (let i = 0; i < WEAPONS.length; i++) {
      for (let j = i + 1; j < WEAPONS.length; j++) {
        const a = WEAPONS[i];
        const b = WEAPONS[j];
        if (!a || !b) continue;
        expect(hueDist(BASE_PALETTE[a][0], BASE_PALETTE[b][0])).toBeGreaterThanOrEqual(50);
      }
    }
  });

  it('weapon saturation leaves room for the slider (full at neon 100, clamped)', () => {
    for (const w of WEAPONS) {
      const [, s, l] = BASE_PALETTE[w];
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(1);
      expect(l).toBeLessThan(0.9);
    }
  });
});
