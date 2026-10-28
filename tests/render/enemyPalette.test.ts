// v2 enemy palette keys (docs/10 wave C Glow item 1): each new hue sits in a gap of docs/01
// section 11 near the planned centre and reads apart from its neighbours; Slime is the Splime
// hue family, darker and less saturated, so the puddle reads as the Splime's floor hazard.
import { describe, expect, it } from 'vitest';
import { BASE_PALETTE, paletteColour, type PaletteKey } from '../../src/render/neon';

function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Every enemy family on the hue wheel (docs/01 section 11 plus the v2 kinds) and the geom pickup.
const FAMILIES: readonly PaletteKey[] = [
  'red',
  'charger',
  'orange',
  'yellow',
  'sower',
  'geom',
  'green',
  'swirl',
  'cyan',
  'blue',
  'bulwark',
  'purple',
  'splime',
  'magenta',
  'blink',
];

describe('v2 enemy palette', () => {
  it('the five planned hues sit within 5 degrees of 10, 240, 335, 160 and 75', () => {
    const planned: [PaletteKey, number][] = [
      ['charger', 10],
      ['bulwark', 240],
      ['blink', 335],
      ['swirl', 160],
      ['sower', 75],
    ];
    for (const [k, h] of planned) expect(hueDist(BASE_PALETTE[k][0], h)).toBeLessThanOrEqual(5);
  });

  it('every enemy family is at least 15 degrees from every other', () => {
    for (let i = 0; i < FAMILIES.length; i++) {
      for (let j = i + 1; j < FAMILIES.length; j++) {
        const a = FAMILIES[i];
        const b = FAMILIES[j];
        if (!a || !b) continue;
        expect(hueDist(BASE_PALETTE[a][0], BASE_PALETTE[b][0]), `${a} vs ${b}`).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it('each new hue sits between its two nearest neighbours on the wheel (a gap, not on top of one)', () => {
    const sorted = [...FAMILIES].sort((a, b) => BASE_PALETTE[a][0] - BASE_PALETTE[b][0]);
    for (const k of ['charger', 'bulwark', 'blink', 'swirl', 'sower', 'splime'] as const) {
      const i = sorted.indexOf(k);
      const prev = sorted[(i + sorted.length - 1) % sorted.length] ?? k;
      const next = sorted[(i + 1) % sorted.length] ?? k;
      const toPrev = hueDist(BASE_PALETTE[k][0], BASE_PALETTE[prev][0]);
      const toNext = hueDist(BASE_PALETTE[k][0], BASE_PALETTE[next][0]);
      // Roughly centred: neither side is under half the other.
      expect(Math.min(toPrev, toNext) / Math.max(toPrev, toNext)).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('slime shares the splime hue, darker and less saturated, and is a different colour', () => {
    const [sh, ss, sl] = BASE_PALETTE.splime;
    const [h, s, l] = BASE_PALETTE.slime;
    expect(h).toBe(sh);
    expect(s).toBeLessThan(ss);
    expect(l).toBeLessThan(sl);
    expect(paletteColour('slime', 1)).not.toBe(paletteColour('splime', 1));
  });

  it('new enemy colours keep the slider range: saturation in (0, 1], lightness 0.45 to 0.62', () => {
    for (const k of ['charger', 'bulwark', 'blink', 'swirl', 'sower', 'splime', 'slime'] as const) {
      const [, s, l] = BASE_PALETTE[k];
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(1);
      expect(l).toBeGreaterThanOrEqual(0.45);
      expect(l).toBeLessThanOrEqual(0.62);
    }
  });
});
