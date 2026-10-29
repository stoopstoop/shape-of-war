// B12: the flow and sim cues that nothing played (docs/01 section 13). The synth plays any cue
// by name through play(cue) in src/audio/synth.ts; main.ts passes that in as the sink, so this
// module never imports Web Audio and runs in node. Pure decisions plus one small port:
// - levelComplete or levelFail when the flow enters the results screen,
// - respawn when the ship comes back after the respawn delay,
// - superReady when the super charge reaches full, superActivate when a full charge is spent,
// - uiTap from DOM buttons, at most one per MIN_TAP_GAP_MS.
// telegraph is already played by the synth from the bus 'sfx' event 'spawn'.
import type { CueName } from '../audio/cues';
import type { FlowState } from './flow';

export type FlowCue = Extract<CueName, 'levelComplete' | 'levelFail'>;
export type SimCue = Extract<CueName, 'respawn' | 'superReady' | 'superActivate'>;

/** Pure: the cue for a flow transition. Only entering results has one; a repeat over is a no op. */
export function flowCue(prev: FlowState, next: FlowState): FlowCue | null {
  if (prev.screen === 'results' || next.screen !== 'results' || next.result === null) return null;
  return next.result.success ? 'levelComplete' : 'levelFail';
}

/** What the sim cues read from the world after each step. */
export interface SimSnapshot {
  /** The ship is in play (false during the respawn delay and after the last life). */
  shipActive: boolean;
  /** Super charge as 0 to 1. */
  charge: number;
}

const NONE: readonly SimCue[] = [];

/** Pure: cues for one sim step from `prev` to `next`, in play order. Usually the shared empty list. */
export function simCues(prev: Readonly<SimSnapshot>, next: Readonly<SimSnapshot>): readonly SimCue[] {
  // Within a world the ship only becomes active again through respawnShip; a new world is armed.
  const respawn = !prev.shipActive && next.shipActive;
  // Only triggerSuper lowers the charge, and only from full.
  const activate = prev.charge >= 1 && next.charge < prev.charge;
  const ready = prev.charge < 1 && next.charge >= 1;
  if (!respawn && !activate && !ready) return NONE;
  const out: SimCue[] = [];
  if (respawn) out.push('respawn');
  if (activate) out.push('superActivate');
  if (ready) out.push('superReady');
  return out;
}

/** Shortest gap between two uiTap cues, ms. A tap is one pointerup, so this only stops a burst. */
export const MIN_TAP_GAP_MS = 80;

export interface TapGate {
  /** True if a tap sound at nowMs may play; records it when allowed. */
  allow(nowMs: number): boolean;
}

/** Pure: at most one tap sound per gapMs. */
export function createTapGate(gapMs: number = MIN_TAP_GAP_MS): TapGate {
  let last = Number.NEGATIVE_INFINITY;
  return {
    allow(nowMs) {
      if (nowMs - last < gapMs) return false;
      last = nowMs;
      return true;
    },
  };
}

export type CueSink = (cue: CueName) => void;

export interface CuePort {
  /** Call after every flow change with the states before and after. */
  flow(prev: FlowState, next: FlowState): void;
  /** A new world was built: take its state as the baseline without playing anything. */
  arm(s: Readonly<SimSnapshot>): void;
  /** Call after each sim step. */
  sim(s: Readonly<SimSnapshot>): void;
  /** A DOM button was tapped. */
  tap(nowMs: number): void;
}

/** The port main.ts drives. The sink is wrapped so a failing synth never breaks the flow. */
export function createCuePort(sink: CueSink, gapMs: number = MIN_TAP_GAP_MS): CuePort {
  const gate = createTapGate(gapMs);
  const prev: SimSnapshot = { shipActive: true, charge: 0 };
  const emit = (cue: CueName): void => {
    try {
      sink(cue);
    } catch {
      // audio is optional; the game runs silent
    }
  };
  const copy = (s: Readonly<SimSnapshot>): void => {
    prev.shipActive = s.shipActive;
    prev.charge = s.charge;
  };
  return {
    flow(p, n) {
      const cue = flowCue(p, n);
      if (cue !== null) emit(cue);
    },
    arm: copy,
    sim(s) {
      for (const cue of simCues(prev, s)) emit(cue);
      copy(s);
    },
    tap(nowMs) {
      if (gate.allow(nowMs)) emit('uiTap');
    },
  };
}
