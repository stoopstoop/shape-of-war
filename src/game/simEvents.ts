// Bus additions from Swarm's G3A fix run (boss-fixes). They extend the typed Events map of
// src/core/events.ts by declaration merging, so the bus stays the one contract and src/core is
// not edited from this branch. Fable may move both lines into events.ts verbatim (identical
// declarations merge cleanly). Payload objects are reused by the sim: handlers copy the fields.
import type { BossId } from '../levelgen/leveldef';

declare module '../core/events' {
  interface Events {
    /**
     * Swarm to Glow and Chorus: the boss core started (exposed true) or stopped (false) taking
     * damage. Emitted on change only, once per step at most. Glow changes colour and blinks while
     * exposed; Chorus plays the alert on true. BossView.exposed and exposedLeft hold the same state.
     */
    'sim:bossExposed': { id: BossId; exposed: boolean };
    /**
     * Swarm to Glow and Chorus: Turbo started (active true, at the ship) or ended (false). While
     * active the ship fires twice as fast, its speed cap is 25 percent higher and its bullets
     * pierce one enemy.
     */
    'fx:turbo': { active: boolean; x: number; y: number };
  }
}

export {};
