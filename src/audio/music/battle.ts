// Boss battle music (G3C retest): which battle track a fight plays, the cross fade from the level
// tune into it, and the fit of boss motif notes onto its chords. Pure, no Web Audio, no PRNG
// state: the pick is the stateless hash01 of (level seed, boss id), and the level seed is the run
// seed and level index mixed (select.ts tuneIndexForLevelSeed), so the same boss can get another
// track on another run or level. The only memory is the previous fight's track, passed in.
import { hash01 } from '../../core/rng';
import type { BossId, BossTier } from '../../levelgen/leveldef';
import { inTierScale, SNAP_STEPS, type BossMotifNote } from './boss';
import { inChord, inScale, snapToChord, snapToScale, STEPS_PER_BAR, type Harmony, type Key } from './harmony';
import { BATTLE_TUNES, type BattleId, type Tune } from './tunes';

/** Salt of the reroll when the first pick repeats the previous fight's track. */
const SALT_REROLL = 0x5bd1e995;

/** Pure: a 32 bit FNV-1a hash of a string (boss ids into the hash). */
export function idHash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}

/**
 * Pure: the battle track index for a fight: a hash of the level seed and the boss id, never
 * `prev` (the previous fight's index in this run, or null for the first fight).
 */
export function battleIndexFor(levelSeed: number, bossId: BossId, prev: number | null, count: number = BATTLE_TUNES.length): number {
  const n = Math.max(1, Math.trunc(count));
  const h = idHash(bossId);
  const first = Math.min(n - 1, Math.floor(hash01(levelSeed >>> 0, h) * n));
  if (prev === null || n < 2 || first !== prev) return first;
  // Pick one of the other n - 1 tracks.
  const skip = Math.min(n - 2, Math.floor(hash01((levelSeed ^ SALT_REROLL) >>> 0, h) * (n - 1)));
  return (prev + 1 + skip) % n;
}

/** Pure: the battle track a fight plays. */
export function battleTuneFor(levelSeed: number, bossId: BossId, prev: number | null): Tune {
  const t = BATTLE_TUNES[battleIndexFor(levelSeed, bossId, prev)] ?? BATTLE_TUNES[0];
  if (t === undefined) throw new Error('no battle tracks');
  return t;
}

/** Pure: the index of a battle track id. */
export function battleIndexOf(id: BattleId): number {
  return BATTLE_TUNES.findIndex((t) => t.id === id);
}

// ---------------------------------------------------------------------------------------
// Cross fade. The battle track starts on the boss join bar (the bar line after sim:bossEnter).
// The level tune's bed dips from full to XFADE_DIP over the steps before the join (at most
// XFADE_STEPS - XFADE_IN_STEPS of them), then the battle bed rises back to full over
// XFADE_IN_STEPS, so the whole cross fade fits inside one bar. The entry stinger is untouched.

export const XFADE_STEPS = STEPS_PER_BAR;
export const XFADE_IN_STEPS = 4;
export const XFADE_DIP = 0.3;

export interface Xfade {
  /** First step of the fade out. */
  readonly from: number;
  /** The join step (the battle track's first step). */
  readonly join: number;
}

/** Pure: the cross fade for a boss that entered at `entry` and joins at `join`. */
export function xfadeFor(entry: number, join: number): Xfade {
  const out = XFADE_STEPS - XFADE_IN_STEPS;
  return { from: Math.min(join, Math.max(Math.trunc(entry), join - out)), join };
}

/** Pure: the bed gain factor (XFADE_DIP to 1) at a step; 1 outside the fade or with none. */
export function xfadeGain(x: Xfade | null, step: number): number {
  if (x === null || step < x.from || step >= x.join + XFADE_IN_STEPS) return 1;
  if (step < x.join) {
    const len = x.join - x.from;
    return 1 - (1 - XFADE_DIP) * ((step - x.from + 1) / len);
  }
  return XFADE_DIP + (1 - XFADE_DIP) * ((step - x.join) / XFADE_IN_STEPS);
}

// ---------------------------------------------------------------------------------------
// Motif fit. A boss motif is composed against its tier key (BOSS_KEYS); over a battle track each
// note moves to the track's chords. On a snap step (downbeat, half bar) or a long note: the
// nearest chord tone that is also in the tier scale, else the nearest chord tone. Elsewhere: the
// note stays if the track's scale has it, else the nearest pitch in both scales, else the
// nearest scale tone. The search is by pitch class, so an octave doubling stays an octave.

/** Notes this long or longer are held over the chord, so they fit like a snap step. */
export const FIT_LONG_STEPS = 4;

function nearestBoth(midi: number, a: (m: number) => boolean, b: (m: number) => boolean, fallback: (m: number) => number): number {
  const m = Math.round(midi);
  for (let d = 0; d <= 6; d++) {
    if (a(m - d) && b(m - d)) return m - d;
    if (a(m + d) && b(m + d)) return m + d;
  }
  return fallback(m);
}

/** Pure: one pitch fitted to a battle track's chord and scale. */
export function fitBattlePitch(midi: number, strong: boolean, h: Harmony, key: Key, tier: BossTier): number {
  const tierOk = (m: number): boolean => inTierScale(m, tier);
  if (strong) return nearestBoth(midi, (m) => inChord(m, h), tierOk, (m) => snapToChord(m, h));
  if (inScale(midi, key)) return midi;
  return nearestBoth(midi, (m) => inScale(m, key), tierOk, (m) => snapToScale(m, key));
}

/** Pure: a boss motif note fitted to a battle track's chord `h` and key. */
export function fitBattleNote(n: BossMotifNote, h: Harmony, key: Key, tier: BossTier): BossMotifNote {
  const strong = SNAP_STEPS.includes(n.step) || n.durSteps >= FIT_LONG_STEPS;
  const midi = fitBattlePitch(n.midi, strong, h, key, tier);
  const from = n.fromMidi === null ? null : fitBattlePitch(n.fromMidi, false, h, key, tier);
  if (midi === n.midi && from === n.fromMidi) return n;
  return { ...n, midi, fromMidi: from === midi ? null : from };
}
