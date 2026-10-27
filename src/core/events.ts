// Typed event bus (docs/03 section 9). UI and game never import each other; they share this.
import type { Insets } from '../input/types';
import type { NeonParams, PaletteKey } from '../render/neon';

export type SfxName = 'shot' | 'explode' | 'geom' | 'bomb' | 'death' | 'spawn';

/** Arena fit inside the safe play rect (docs/04 section 4). x, y is the arena centre in CSS px. */
export interface ArenaFit {
  scale: number;
  x: number;
  y: number;
}

export interface ViewportInfo {
  cssW: number;
  cssH: number;
  dpr: number; // render dpr, capped at 2
  /** Additive to 03 section 9: safe area insets and the computed arena fit. */
  insets: Insets;
  fit: ArenaFit;
}

export interface Events {
  'neon:changed': NeonParams;
  'game:start': { mode: 'adventure' | 'endless'; levelIndex: number };
  'game:pause': void;
  'game:resume': void;
  'game:quit': void;
  'game:over': { score: number; stars: 0 | 1 | 2 | 3; levelIndex: number; mode: 'adventure' | 'endless' };
  'hud:score': { score: number; multiplier: number; lives: number; bombs: number; superCharge: number };
  'viewport:changed': ViewportInfo;
  sfx: SfxName;
  // Sim to fx and audio (Glow, W3).
  'fx:kill': { x: number; y: number; colour: PaletteKey };
  'fx:death': { x: number; y: number };
  'fx:bomb': { x: number; y: number };
  'fx:geom': { x: number; y: number };
}

export type EventKey = keyof Events;
export type Handler<K extends EventKey> = (payload: Events[K]) => void;
type HandlerMap = { [K in EventKey]?: Set<Handler<K>> };
type EmitArgs<K extends EventKey> = Events[K] extends void ? [] : [payload: Events[K]];

export class Bus {
  private handlers: HandlerMap = {};

  /** Subscribe. Returns the unsubscribe function. */
  on<K extends EventKey>(k: K, h: Handler<K>): () => void {
    const set: Set<Handler<K>> = this.handlers[k] ?? new Set<Handler<K>>();
    this.handlers[k] = set as HandlerMap[K];
    set.add(h);
    return () => {
      set.delete(h);
    };
  }

  emit<K extends EventKey>(k: K, ...args: EmitArgs<K>): void {
    const set: Set<Handler<K>> | undefined = this.handlers[k];
    if (set === undefined || set.size === 0) return;
    const payload = args[0] as Events[K];
    for (const h of set) h(payload);
  }

  /** Remove every handler (tests and hot reload). */
  clear(): void {
    this.handlers = {};
  }
}

export const bus = new Bus();
