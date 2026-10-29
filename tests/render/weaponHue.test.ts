// B14: one weapon colour table in render/neon.ts feeds bullets, trails, pickups, the collect
// burst and the HUD hue helper.
import { describe, expect, it } from 'vitest';
import type { BaseWeaponKind } from '../../src/core/events';
import { bulletStyleVisual, weaponTint } from '../../src/render/bulletStyles';
import { BASE_PALETTE, WEAPON_PALETTE, weaponHue, weaponPaletteKey } from '../../src/render/neon';
import { PICKUP_SPECS } from '../../src/render/shapeSpecs';

// Base weapons only: the six V3 pairs borrow ingredient colours until Glow tunes them (wave D).
const KINDS: readonly BaseWeaponKind[] = ['spread', 'rapid', 'pierce', 'orbit'];
/** BulletPool.style and pickup w.a index per weapon (docs/10 wave B render contract). */
const STYLE: Readonly<Record<BaseWeaponKind, number>> = { spread: 0, rapid: 1, pierce: 2, orbit: 3 };

describe('weapon hue single source', () => {
  it('weaponHue reads the palette hue of the weapon palette key', () => {
    for (const k of KINDS) expect(weaponHue(k)).toBe(BASE_PALETTE[WEAPON_PALETTE[k]][0]);
  });

  it('pins the palette hues the HUD must show', () => {
    expect(weaponHue('rapid')).toBe(200);
    expect(weaponHue('pierce')).toBe(258);
    expect(weaponHue('orbit')).toBe(143);
    expect(weaponHue('spread')).toBe(BASE_PALETTE.yellow[0]);
  });

  it('bullets and their particle trails tint from the same key', () => {
    for (const k of KINDS) expect(bulletStyleVisual(STYLE[k], false).tint).toBe(weaponPaletteKey(k));
  });

  it('the collect burst tints from the same key', () => {
    for (const k of KINDS) expect(weaponTint(k)).toBe(weaponPaletteKey(k));
  });

  it('pickup glyphs tint from the same key', () => {
    for (const k of KINDS) {
      if (k === 'spread') continue;
      expect(PICKUP_SPECS[STYLE[k]]?.tint).toBe(weaponPaletteKey(k));
    }
  });

  it('every weapon has a distinct hue', () => {
    expect(new Set(KINDS.map(weaponHue)).size).toBe(KINDS.length);
  });
});
