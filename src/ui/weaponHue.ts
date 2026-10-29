// B14: the HUD weapon hue is Glow's single source in src/render/neon.ts (glue after both merged).
import type { WeaponKind } from '../core/events';
import { weaponHue as paletteHue } from '../render/neon';

export type WeaponHueFn = (kind: WeaponKind) => number;

/** Pure: HSL hue in degrees for a weapon, read from the render palette so HUD, pickups and bullets agree. */
export const weaponHue: WeaponHueFn = (kind) => paletteHue(kind);
