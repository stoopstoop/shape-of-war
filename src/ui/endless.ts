// Endless adapter (docs/01 section 2.2, docs/02 section 10). The sim runs a LevelDef with one
// wave schedule; Endless waves come per 30 s segment from generateEndlessSegment. This builds a
// LevelDef from generateEndless(seed) plus the first ENDLESS_SEGMENTS segments laid end to end,
// then loops the last ENDLESS_LOOP segments. Pure: the generator functions are passed in.
import type { EndlessDef, EndlessSegmentDef, LevelDef, WaveDef } from '../levelgen/leveldef';

/** 60 segments of 30 s: 30 minutes before the schedule starts looping. */
export const ENDLESS_SEGMENTS = 60;
/** Segments repeated after the last one (5 minutes of the hardest waves). */
export const ENDLESS_LOOP = 10;

/** Stars never awarded in Endless: thresholds no score reaches. */
const NO_STARS = Number.MAX_SAFE_INTEGER;

/** No objective in Endless; the sim ends the game on lives 0 in endless mode. */
const ENDLESS_DURATION = 1e9;

export interface EndlessGen {
  generateEndless(seed: number): EndlessDef;
  generateEndlessSegment(seed: number, segment: number): EndlessSegmentDef;
}

/** Pure: Endless as a LevelDef the sim can run with createGame(level, { mode: 'endless' }). */
export function endlessLevel(gen: EndlessGen, seed: number, segments = ENDLESS_SEGMENTS, loop = ENDLESS_LOOP): LevelDef {
  const def = gen.generateEndless(seed >>> 0);
  const n = Math.max(1, Math.floor(segments));
  const loopCount = Math.min(n, Math.max(1, Math.floor(loop)));
  const waves: WaveDef[] = [];
  let maxLive = 0;
  let loopFrom = 0;
  let first: EndlessSegmentDef | null = null;
  for (let s = 0; s < n; s++) {
    const seg = gen.generateEndlessSegment(def.endlessSeed, s);
    if (first === null) first = seg;
    if (s === n - loopCount) loopFrom = waves.length;
    maxLive = Math.max(maxLive, seg.waves.maxLiveEnemies);
    const offset = s * def.segmentSec;
    for (const w of seg.waves.waves) {
      waves.push({ ...w, index: waves.length, atSec: Math.round((w.atSec + offset) * 100) / 100 });
    }
  }
  if (first === null) throw new Error('no Endless segments');
  const fw = first.waves;
  return {
    version: def.version,
    generatorVersion: def.generatorVersion,
    runSeed: def.endlessSeed,
    levelIndex: 1,
    seed: def.endlessSeed,
    band: first.band,
    arena: def.arena,
    roster: def.roster,
    speedScale: first.speedScale,
    drone: def.drone,
    superType: def.superType,
    lives: def.lives,
    bombs: def.bombs,
    objective: { kind: 'survive', durationSec: ENDLESS_DURATION },
    waves: {
      maxLiveEnemies: maxLive,
      intervalStartSec: fw.intervalStartSec,
      intervalEndSec: fw.intervalEndSec,
      rampSec: fw.rampSec,
      rampExponent: fw.rampExponent,
      budgetStart: fw.budgetStart,
      budgetEnd: fw.budgetEnd,
      waves,
      loopFromIndex: loopFrom < waves.length ? loopFrom : -1,
      loopPeriodSec: loopCount * def.segmentSec,
    },
    hazards: def.hazards,
    par: 0,
    stars: [NO_STARS, NO_STARS, NO_STARS],
    surface: def.surface,
  };
}

/** The objective label slot in Endless (docs/01 section 9: "Endless" with an empty bar). */
export const ENDLESS_LABEL = 'Endless';
/** The same slot while an Endless boss lives (docs/13 section 9: the wave label reads "Boss"). */
export const ENDLESS_BOSS_LABEL = 'Boss';

/** Pure: the Endless label, "Boss" while a boss lives and "Endless" otherwise. */
export function endlessLabel(bossAlive: boolean): string {
  return bossAlive ? ENDLESS_BOSS_LABEL : ENDLESS_LABEL;
}

/** Pure: Endless HUD line, for example "Endless  Seed 42  4:30". */
export function endlessLine(seed: number, elapsedSec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(elapsedSec) ? elapsedSec : 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `Endless  Seed ${seed >>> 0}  ${m}:${r < 10 ? '0' : ''}${r}`;
}
