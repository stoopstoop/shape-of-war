// Debug wiring shared by main.ts and Glow's devpanel, so neither imports the other.
// main.ts publishes the loop's frame stats here; Glow registers a particle stress hook here.
import type { FrameStats } from './loop';

export type ParticleStressHook = (count: number) => void;

export interface DebugInfo {
  frame: Readonly<FrameStats>;
  liveEntities: number;
  liveBullets: number;
  divisor: 1 | 2;
  bloom: boolean;
}

let statsSource: (() => DebugInfo) | null = null;
let particleHook: ParticleStressHook | null = null;

/** main.ts only. */
export function setDebugInfoSource(fn: (() => DebugInfo) | null): void {
  statsSource = fn;
}

/** Devpanel FPS label reads this once per frame. Null before the loop starts. */
export function getDebugInfo(): DebugInfo | null {
  return statsSource === null ? null : statsSource();
}

/** Glow registers this so sowDebug.stress(entities, particles) can fill the particle pool. */
export function registerParticleStress(fn: ParticleStressHook | null): void {
  particleHook = fn;
}

/** Returns false when no hook is registered yet. */
export function runParticleStress(count: number): boolean {
  if (particleHook === null) return false;
  particleHook(count);
  return true;
}
