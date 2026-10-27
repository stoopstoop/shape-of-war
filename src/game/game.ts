// Swarm session entry points for wiring in main.ts: createGame replaces createWorld, stepGame
// replaces stepWorld in the loop's step hook. stepGame allocates nothing.
import { bus } from '../core/events';
import type { InputState } from '../input/types';
import type { EndlessDef, LevelDef } from '../levelgen/leveldef';
import { bulletHits, separate, shipHits, shipPickups } from './combat';
import { registerSwarmBehaviours } from './defs';
import { stepDrone } from './drones';
import { spawnWells, stepWells } from './enemies/gravitywell';
import { SUPER_CHARGE_MAX } from './geoms';
import { stepObjective } from './objective';
import { stepPlayer } from './player';
import { stepSpawner } from './spawner';
import { endlessLevel, startEndless, stepEndlessAwards } from './endless';
import { gs, type GameMode, type GameState, type ScoringPort, type SegmentSource } from './state';
import { stepSupers, triggerSuper } from './supers';
import { createWorld, stepWorld, type World } from './world';

export interface GameOptions {
  mode?: GameMode;
  /** Injected vibrate (tests pass a spy). Default navigator.vibrate when present. */
  vibrate?: (ms: number) => void;
  /** Ledger's scoring hooks. Default: base value x multiplier, kept in gs(w). */
  scoring?: ScoringPort;
  /** Record every wave spawn in gs(w).spawnLog (tests and debugging; allocates). */
  logSpawns?: boolean;
  capacity?: number;
}

export const HUD_INTERVAL = 0.1;

export function createGame(level: LevelDef, opts: GameOptions = {}): World {
  registerSwarmBehaviours();
  const w = createWorld(level, opts.capacity);
  const g = gs(w);
  if (opts.mode !== undefined) g.mode = opts.mode;
  if (opts.vibrate !== undefined) g.vibrate = opts.vibrate;
  if (opts.scoring !== undefined) g.scoring = opts.scoring;
  if (opts.logSpawns === true) g.spawnLog = [];
  spawnWells(w);
  return w;
}

/** Swap the scoring hooks at runtime (Ledger wiring). */
export function setScoring(w: World, port: ScoringPort): void {
  gs(w).scoring = port;
}

/** Read only view of the session counters for HUD and debug. */
export function gameState(w: World): Readonly<GameState> {
  return gs(w);
}

/**
 * Start an Endless run (docs/01 section 2.2). The source supplies segment s; wire it as
 * (s) => generateEndlessSegment(def.endlessSeed, s). Segment 0 is requested here, segment s + 1
 * when segment s starts. Lives and bombs follow the EndlessDef award rules.
 */
export function createEndlessGame(def: EndlessDef, source: SegmentSource, opts: Omit<GameOptions, 'mode'> = {}): World {
  const seg0 = source(0);
  const w = createGame(endlessLevel(def, seg0), { ...opts, mode: 'endless' });
  startEndless(w, def, source, seg0);
  return w;
}

/** True while the entity is telegraphing (render: draw at 50 percent alpha, flashing). */
export function isTelegraphing(w: World, id: number): boolean {
  return (gs(w).tele[id] ?? 0) > 0;
}

/** Telegraph seconds left for id, 0 when live (render: flash phase and fade in). */
export function telegraphLeft(w: World, id: number): number {
  return gs(w).tele[id] ?? 0;
}

function emitHud(w: World, dt: number): void {
  const g = gs(w);
  g.hudTimer -= dt;
  if (g.hudTimer > 0) return;
  g.hudTimer += HUD_INTERVAL;
  if (g.hudTimer < 0) g.hudTimer = 0;
  const h = g.hud;
  h.score = g.score;
  h.multiplier = g.multiplier;
  h.lives = g.lives;
  h.bombs = g.bombs;
  h.superCharge = g.superCharge / SUPER_CHARGE_MAX;
  bus.emit('hud:score', h);
}

export function stepGame(w: World, dt: number, input: InputState): void {
  const g = gs(w);
  if (g.outcome !== 'running') return;
  stepWorld(w, dt, input);
  stepWells(w, dt);
  separate(w, dt);
  bulletHits(w);
  shipHits(w);
  shipPickups(w);
  stepPlayer(w, dt, input);
  stepDrone(w, dt);
  if (input.superPressed) triggerSuper(w);
  stepSupers(w, dt);
  stepSpawner(w, dt);
  stepEndlessAwards(w);
  stepObjective(w);
  emitHud(w, dt);
}
