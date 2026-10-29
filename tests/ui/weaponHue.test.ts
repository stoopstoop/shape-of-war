// B14: the HUD weapon colour reads its hue from the weaponHue adapter, which Fable swaps for
// Glow's weaponHue export from src/render/neon after both branches merge.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { WeaponKind } from '../../src/core/events';
import { weaponColour } from '../../src/ui/hud';
import { weaponHue, type WeaponHueFn } from '../../src/ui/weaponHue';

const KINDS: readonly WeaponKind[] = ['spread', 'rapid', 'pierce', 'orbit'];

describe('weaponHue adapter', () => {
  it('keeps the current palette hues until the glue swap', () => {
    expect(KINDS.map(weaponHue)).toEqual([185, 165, 20, 295]);
  });

  it('has the type Glow exports', () => {
    const f: WeaponHueFn = weaponHue;
    expect(typeof f('rapid')).toBe('number');
  });

  it('weaponColour uses the adapter hue', () => {
    for (const k of KINDS) expect(weaponColour(k)).toBe(`hsl(${weaponHue(k)}, 95%, 68%)`);
  });

  it('hud.ts holds no hue constants of its own and the glue TODO is in place', () => {
    const hud = readFileSync(fileURLToPath(new URL('../../src/ui/hud.ts', import.meta.url)), 'utf8');
    expect(hud).not.toMatch(/WEAPON_HUES/);
    expect(hud).not.toMatch(/\b(165|295)\b/);
    const adapter = readFileSync(fileURLToPath(new URL('../../src/ui/weaponHue.ts', import.meta.url)), 'utf8');
    expect(adapter).toContain('TODO Fable glue: replace with weaponHue from src/render/neon');
  });
});
