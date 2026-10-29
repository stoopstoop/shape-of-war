// Typed event bus (docs/03 section 9). UI and game never import each other; they share this.
import type { Kind } from '../game/world';
import type { Insets } from '../input/types';
import type { BossId, BossTier, EnemyKind } from '../levelgen/leveldef';
import type { NeonParams, PaletteKey } from '../render/neon';

export type SfxName = 'shot' | 'explode' | 'geom' | 'bomb' | 'death' | 'spawn';

/** V2 weapon styles (docs/10-v2-plan.md). Matches BulletPool.style: 0 spread, 1 rapid, 2 pierce, 3 orbit. */
export type BaseWeaponKind = 'spread' | 'rapid' | 'pierce' | 'orbit';

/** V3 combined weapons (docs/13), one per pair of base weapons, ingredients in the order spread, rapid, pierce, orbit. */
export type ComboKind = 'spread+rapid' | 'spread+pierce' | 'spread+orbit' | 'rapid+pierce' | 'rapid+orbit' | 'pierce+orbit';

/** Any weapon the ship can hold: a base weapon or a combined pair. */
export type WeaponKind = BaseWeaponKind | ComboKind;

/** V3 drone weapon modes (docs/13): what a drone pickup arms the drone with for 20 s. */
export type DroneMode = 'homing' | 'detach' | 'rapid' | 'double';

export const DRONE_MODES: readonly DroneMode[] = ['homing', 'detach', 'rapid', 'double'];

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
  /**
   * A scored kill, a Mine pop, a Snake segment in a head's death burst, or a Gravity well going
   * down (shot or exploding). kind and id name what died (a Mine pop is Kind.Mine, so it no longer
   * hides behind the Sower colour; a burst segment is Kind.SnakeBody). The payload object is
   * reused by the sim, so handlers copy the fields they need.
   */
  'fx:kill': { x: number; y: number; colour: PaletteKey; kind: Kind; id: number };
  /**
   * Damage that did not kill: a multi HP enemy (or Gravity well) took a hit, or a Bulwark shield
   * absorbed one (blocked true, no damage dealt). x, y is the impact point: the bullet or blade
   * position for shots, the target centre for a drone ram. Emitted per hit with no rate limit;
   * consumers throttle. The payload object is reused, so handlers copy the fields they need.
   */
  'fx:hit': { x: number; y: number; kind: Kind; id: number; blocked: boolean };
  'fx:death': { x: number; y: number };
  'fx:bomb': { x: number; y: number };
  'fx:geom': { x: number; y: number };
  // V2 contract stubs (docs/10-v2-plan.md Appendix B). Nothing emits these until waves B and C.
  /** Swarm (C) to Chorus: the telegraph ended and no other live entity of this kind existed. */
  'sim:enemyEnter': { kind: EnemyKind; live: number };
  /** Swarm (C) to Chorus: the last live entity of this kind was removed. */
  'sim:enemyExit': { kind: EnemyKind };
  /** Swarm (C) to Chorus and Glow: level in 0 to 1, at most every 100 ms. */
  'sim:threat': { level: number };
  /** Swarm (B) to Glow: a weapon pickup was collected at (x, y). */
  'fx:pickup': { x: number; y: number; weapon: WeaponKind };
  /** Swarm (B) to Ledger: at most every 100 ms and on change. */
  'hud:weapon': { kind: WeaponKind; remaining: number; total: number };
  // V3 contract stubs (docs/12-v3-plan.md Appendix B). Nothing emits these until waves A to D.
  // Payload objects are reused by the sim, so handlers copy what they need.
  /** Swarm (A) to Chorus, Glow and Ledger: a boss entered. */
  'sim:bossEnter': { id: BossId; tier: BossTier };
  /** Swarm (A) to Chorus and Glow: the boss changed phase (phase of phases). */
  'sim:bossPhase': { id: BossId; phase: number; phases: number };
  /** Swarm (A) to Chorus, Glow and Ledger: the boss died at (x, y). */
  'sim:bossDown': { id: BossId; x: number; y: number };
  /** Swarm (A) to Ledger: at most every 100 ms and on change. */
  'hud:boss': { id: BossId; hp: number; maxHp: number; phase: number; phases: number; mode: number };
  /** Swarm (B) to Chorus and Glow: once per volley at launch. */
  'fx:bossShot': { x: number; y: number; id: BossId };
  /** Swarm (D) to Glow and Chorus: base weapons a and b combined into kind. */
  'fx:weaponCombine': { x: number; y: number; kind: ComboKind; a: BaseWeaponKind; b: BaseWeaponKind };
  /** Swarm (D) to Chorus and Glow: the weapon of the ship expired (the ship only, not a drone). */
  'fx:weaponExpire': { kind: WeaponKind };
  /** Swarm (D) to Glow and Chorus: a drone pickup armed the drone, also on a replacement. */
  'fx:droneArm': { x: number; y: number; mode: DroneMode };
  /** Swarm (D) to Chorus and Glow: the 20 s ran out (not on death or replacement). */
  'fx:droneExpire': { x: number; y: number; mode: DroneMode };
  /** Swarm (D) to Ledger and Glow: at most every 100 ms and on change. */
  'hud:droneWeapon': { mode: DroneMode; remaining: number; total: number };
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
