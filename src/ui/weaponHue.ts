// B14: the HUD weapon hue comes from one function with the same name and type as Glow's
// weaponHue export in src/render/neon.ts, which lands in a parallel branch. Until both branches
// merge this adapter holds the current palette hues so this branch compiles alone.
import type { WeaponKind } from '../core/events';

export type WeaponHueFn = (kind: WeaponKind) => number;

// TODO Fable glue: replace with weaponHue from src/render/neon
const ADAPTER_HUES: Readonly<Record<WeaponKind, number>> = { spread: 185, rapid: 165, pierce: 20, orbit: 295 };

/** Pure: HSL hue in degrees for a weapon, the rapid, pierce and orbit palette entries in render/neon.ts. */
export const weaponHue: WeaponHueFn = (kind) => ADAPTER_HUES[kind];
