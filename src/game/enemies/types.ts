// Shared enemy definition shape (docs/03 section 1, docs/01 section 6.2).
import type { PaletteKey } from '../../render/neon';
import type { Kind } from '../world';

export interface EnemyDef {
  kind: Kind;
  /** Hitbox radius in arena units. */
  radius: number;
  /** Base speed in u/s before LevelDef.speedScale. */
  speed: number;
  /** Base score before the multiplier. */
  value: number;
  colour: PaletteKey;
  /** Starting hit points. Snake segments use 0 and are invulnerable. */
  hp: number;
  /** Geoms dropped on a scored kill. */
  geoms: number;
}
