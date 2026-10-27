// Endless mode (docs/01 section 2.2, docs/02 section 10). The run plays on a LevelDef built from
// the EndlessDef plus segment 0; every 30 s of wave clock the spawner switches to the next
// segment's waves, roster and speedScale. Segments come from an injected SegmentSource (wiring
// passes generateEndlessSegment), so the simulation never runs the generator or a PRNG itself.
// Segment s + 1 is requested when segment s starts. The ramp has no upper bound: the generator
// grows the per wave budget every segment from segment 15 on.
import type { EndlessDef, EndlessSegmentDef, LevelDef } from '../levelgen/leveldef';
import { gs, type SegmentSource } from './state';
import type { World } from './world';

/** Plain, mutable LevelDef for an Endless run. The spawner rewrites waves, roster and speedScale. */
export function endlessLevel(def: EndlessDef, seg0: EndlessSegmentDef): LevelDef {
  return {
    version: def.version,
    generatorVersion: def.generatorVersion,
    runSeed: def.endlessSeed,
    levelIndex: 0,
    seed: seg0.seed,
    band: seg0.band,
    surface: def.surface,
    retries: 0,
    arena: def.arena,
    roster: seg0.roster,
    speedScale: seg0.speedScale,
    drone: def.drone,
    superType: def.superType,
    lives: def.lives,
    bombs: def.bombs,
    // LevelDef has no 'none' objective; the sim ignores objectives in Endless mode.
    objective: { kind: 'survive', durationSec: 0 },
    waves: seg0.waves,
    hazards: def.hazards,
    par: 0,
    stars: [0, 0, 0],
  };
}

/** Attach the run to a fresh world created from endlessLevel(def, seg0). */
export function startEndless(w: World, def: EndlessDef, source: SegmentSource, seg0: EndlessSegmentDef): void {
  const g = gs(w);
  g.mode = 'endless';
  g.endless = {
    def,
    source,
    segment: seg0.segment,
    next: null,
    nextLifeAt: def.extraLifeEvery,
    nextBombAt: def.extraBombEvery,
  };
  loadSegment(w, seg0);
}

/** Point the spawner at seg and prefetch the one after it. */
export function loadSegment(w: World, seg: EndlessSegmentDef): void {
  const g = gs(w);
  const run = g.endless;
  if (run === null) return;
  run.segment = seg.segment;
  w.level.waves = seg.waves;
  w.level.roster = seg.roster;
  w.level.speedScale = seg.speedScale;
  w.level.band = seg.band;
  g.speedScale = seg.speedScale;
  g.nextWave = 0;
  g.loopK = 0;
  g.waveShift = seg.segment * run.def.segmentSec;
  run.next = run.source(seg.segment + 1);
}

/** Switch segments once the wave clock passes each 30 s boundary. Returns segments advanced. */
export function advanceSegments(w: World, clock: number): number {
  const run = gs(w).endless;
  if (run === null || !(run.def.segmentSec > 0)) return 0;
  let n = 0;
  // One switch per step in play; the guard only bounds a debug jump far ahead.
  while (clock >= (run.segment + 1) * run.def.segmentSec && n < 1024) {
    const want = run.segment + 1;
    const next = run.next !== null && run.next.segment === want ? run.next : run.source(want);
    loadSegment(w, next);
    n++;
  }
  return n;
}

export interface Awards {
  lives: number;
  bombs: number;
  nextLifeAt: number;
  nextBombAt: number;
}

/**
 * Pure: +1 life every extraLifeEvery points and +1 bomb every extraBombEvery points, capped at
 * maxLives and maxBombs. A threshold passed at the cap is still consumed.
 */
export function applyAwards(score: number, def: Pick<EndlessDef, 'extraLifeEvery' | 'extraBombEvery' | 'maxLives' | 'maxBombs'>, a: Awards): Awards {
  if (def.extraLifeEvery > 0) {
    while (score >= a.nextLifeAt) {
      if (a.lives < def.maxLives) a.lives++;
      a.nextLifeAt += def.extraLifeEvery;
    }
  }
  if (def.extraBombEvery > 0) {
    while (score >= a.nextBombAt) {
      if (a.bombs < def.maxBombs) a.bombs++;
      a.nextBombAt += def.extraBombEvery;
    }
  }
  return a;
}

const awards: Awards = { lives: 0, bombs: 0, nextLifeAt: 0, nextBombAt: 0 };

/** Endless extra lives and bombs from score. No op outside Endless or after the last life. */
export function stepEndlessAwards(w: World): void {
  const g = gs(w);
  const run = g.endless;
  if (run === null || g.outcome !== 'running' || g.lives <= 0) return;
  if (g.score < run.nextLifeAt && g.score < run.nextBombAt) return;
  awards.lives = g.lives;
  awards.bombs = g.bombs;
  awards.nextLifeAt = run.nextLifeAt;
  awards.nextBombAt = run.nextBombAt;
  applyAwards(g.score, run.def, awards);
  g.lives = awards.lives;
  g.bombs = awards.bombs;
  run.nextLifeAt = awards.nextLifeAt;
  run.nextBombAt = awards.nextBombAt;
}

/** Current Endless segment for the HUD "Wave N" line (segment + 1), or 0 outside Endless. */
export function endlessWave(w: World): number {
  const run = gs(w).endless;
  return run === null ? 0 : run.segment + 1;
}
