// Pure fx event to effect plan mapping (docs/01-game-design.md section 12).
// The fx:kill payload carries the enemy colour, not its kind, so the colour picks the row:
// cyan is the Snake, yellow the Spawner, red the Gravity well, magenta the Pinwheel.
import type { PaletteKey } from './neon';

export type FxType = 'kill' | 'death' | 'bomb' | 'geom' | 'super';

export interface FxEvent {
  readonly type: FxType;
  /** Enemy colour for kills; ignored otherwise. */
  readonly colour?: PaletteKey;
}

export interface BurstPlan {
  count: number;
  speedMin: number;
  speedMax: number;
  lifeMin: number;
  lifeMax: number;
  drag: number;
  colour: PaletteKey;
  colour2: PaletteKey | null;
}

export interface ShakePlan {
  /** CSS px. */
  amp: number;
  /** Seconds. */
  dur: number;
}

export interface FxPlan {
  burst: BurstPlan;
  shake: ShakePlan | null;
  /** Grid ripple strength in arena units of displacement, 0 for none. */
  ripple: number;
  /** Expanding ring colour (bomb, super), null for none. */
  ring: PaletteKey | null;
}

/** Grid ripple strengths: every kill gives a small one, big kills more, bomb the largest. */
export const RIPPLE_KILL = 7;
export const RIPPLE_KILL_BIG = 14;
export const RIPPLE_WELL = 30;
export const RIPPLE_DEATH = 36;
export const RIPPLE_SUPER = 30;
export const RIPPLE_BOMB = 60;

function burst(
  count: number,
  speed: readonly [number, number],
  life: readonly [number, number],
  drag: number,
  colour: PaletteKey,
  colour2: PaletteKey | null,
): BurstPlan {
  return { count, speedMin: speed[0], speedMax: speed[1], lifeMin: life[0], lifeMax: life[1], drag, colour, colour2 };
}

function plan(b: BurstPlan, shake: ShakePlan | null, ripple: number, ring: PaletteKey | null): FxPlan {
  return { burst: b, shake, ripple, ring };
}

function killPlan(colour: PaletteKey): FxPlan {
  if (colour === 'magenta') return plan(burst(28, [150, 500], [0.5, 1.0], 3.0, colour, null), null, RIPPLE_KILL, null);
  if (colour === 'cyan') return plan(burst(48, [200, 700], [0.5, 1.1], 2.5, colour, null), { amp: 4, dur: 0.15 }, RIPPLE_KILL_BIG, null);
  if (colour === 'yellow') return plan(burst(40, [200, 650], [0.5, 1.0], 2.5, colour, null), { amp: 4, dur: 0.15 }, RIPPLE_KILL_BIG, null);
  if (colour === 'red') return plan(burst(120, [300, 900], [0.6, 1.2], 2.0, 'red', 'white'), { amp: 12, dur: 0.45 }, RIPPLE_WELL, null);
  return plan(burst(24, [200, 600], [0.4, 0.9], 3.0, colour, null), null, RIPPLE_KILL, null);
}

/** Pure: what one fx event spawns. */
export function planFx(e: FxEvent): FxPlan {
  switch (e.type) {
    case 'kill':
      return killPlan(e.colour ?? 'white');
    case 'death':
      return plan(burst(120, [250, 800], [0.6, 1.4], 2.0, 'ship', 'yellow'), { amp: 14, dur: 0.5 }, RIPPLE_DEATH, null);
    case 'bomb':
      return plan(burst(200, [400, 1200], [0.5, 1.0], 2.0, 'bomb', null), { amp: 10, dur: 0.4 }, RIPPLE_BOMB, 'bomb');
    case 'geom':
      return plan(burst(4, [80, 160], [0.2, 0.2], 4.0, 'geom', null), null, 0, null);
    case 'super':
      return plan(burst(60, [250, 700], [0.4, 0.8], 2.5, 'geom', 'ship'), { amp: 5, dur: 0.2 }, RIPPLE_SUPER, 'geom');
  }
}
