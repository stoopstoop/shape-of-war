// V2 enemy stage (docs/10-v2-plan.md wave V2-C, docs/11 section 6.3). Runs after the complete v1
// draw sequence on its own salted stream, as docs/09 section 2.5 does for surface, so the v1 draws
// and every flag off LevelDef stay byte identical. Pure: the only randomness is the Rng passed in.
//
// Mechanism, per level in band 2 and up:
// 1. Roster. j = min(V2_ROSTER_SLOTS[band], non grunt slots) new kinds join the roster, chosen by
//    systematic sampling with inclusion probability j x share / total share, so each kind is in
//    the roster in proportion to its target share. They replace j non grunt v1 kinds picked
//    uniformly (so Snake keeps its odds; dropping the rarest kind would always remove it). Grunt
//    is always kept, so the roster size never changes.
// 2. Groups. A group of a dropped kind always becomes a new kind. Any other group (grunt
//    included) becomes one with probability c, chosen per level so the expected new share of the
//    level's groups is the band total. A new group picks its kind uniformly from the level's new
//    kinds. Uniform pick times share proportional inclusion gives each kind its table share.
// 3. A substituted group spends its whole spawn budget at 1 unit per enemy (docs/11 6.2).
import type { Rng } from '../core/rng';
import { rngInt, rngPick } from '../core/rng';
import { BANDS, ENEMY_KINDS, V2_ENEMY_KINDS } from './leveldef';
import type { Band, EnemyKind, RosterEntry } from './leveldef';

/** Stream salt for the v2 enemy stage. ASCII "V2EN". */
export const V2_ENEMY_SALT = 0x5632454e;

/** Spawn units per enemy for every new kind (docs/11 section 6.2). */
export const V2_SPAWN_UNIT = 1;

/** New kinds per roster, by band. Band 1 never gets one. */
export const V2_ROSTER_SLOTS: Readonly<Record<Band, number>> = { 1: 0, 2: 1, 3: 2, 4: 3 };

/** Every EnemyKind in output order: the v1 kinds, then the v2 kinds. */
export const ALL_ENEMY_KINDS: readonly EnemyKind[] = [...ENEMY_KINDS, ...V2_ENEMY_KINDS];

export const isV2Kind = (k: string): boolean => (V2_ENEMY_KINDS as readonly string[]).includes(k);

/** Target share of one new kind in a band, 0 to 1 (the band's roster weight over 100). */
export function v2Share(band: Band, kind: EnemyKind): number {
  return isV2Kind(kind) ? BANDS[band].rosterWeights[kind] / 100 : 0;
}

/** Total target share of all new kinds in a band: 0, 0.30, 0.60, 0.80. */
export function v2TotalShare(band: Band): number {
  return V2_ENEMY_KINDS.reduce((a, k) => a + v2Share(band, k), 0);
}

/** New kinds with a positive share in the band, in V2_ENEMY_KINDS order. */
export function v2Eligible(band: Band): EnemyKind[] {
  return V2_ENEMY_KINDS.filter((k) => v2Share(band, k) > 0);
}

/** Inclusion probability of each eligible kind when j kinds join: j x share / total. Each is at most 1 for the shipped tables. */
export function inclusionProbs(band: Band, j: number): number[] {
  const total = v2TotalShare(band);
  return v2Eligible(band).map((k) => (total > 0 ? Math.min(1, (j * v2Share(band, k)) / total) : 0));
}

/**
 * Systematic (Madow) sampling: lay the probabilities end to end and take the items under the
 * points u, u + 1, ..., u + j - 1. With probabilities summing to j, each at most 1, this returns
 * j distinct items and item i with probability probs[i]. One uniform u in [0, 1).
 */
export function systematicSample<T>(u: number, items: readonly T[], probs: readonly number[], j: number): T[] {
  const out: T[] = [];
  let lo = 0;
  let next = u;
  for (let i = 0; i < items.length && out.length < j; i++) {
    const hi = i === items.length - 1 ? Infinity : lo + (probs[i] ?? 0);
    const item = items[i];
    if (next >= lo && next < hi && item !== undefined) {
      out.push(item);
      next += 1;
    }
    lo = hi;
  }
  return out;
}

/** Minimal view of a v1 wave group the stage needs. */
export interface GroupKind {
  kind: EnemyKind;
}

export interface V2RosterPlan {
  roster: RosterEntry[];
  /** New kinds in the roster, in V2_ENEMY_KINDS order. Empty in band 1. */
  added: EnemyKind[];
  /** v1 kinds the new kinds replaced. */
  dropped: EnemyKind[];
  /** Per level chance that a kept group becomes a new kind. */
  keepSwap: number;
}

/**
 * Stage 1. Draws: one uniform for the new kinds, then one uniform pick per dropped v1 kind. No
 * draw when the band takes no new kind (band 1): the roster comes back as a copy.
 */
export function planV2Roster(r: Rng, band: Band, roster: readonly RosterEntry[], groups: readonly GroupKind[]): V2RosterPlan {
  const others = roster.filter((e) => e.kind !== 'grunt').map((e) => e.kind);
  const j = Math.min(V2_ROSTER_SLOTS[band], others.length, v2Eligible(band).length);
  if (j <= 0) return { roster: roster.map((e) => ({ ...e })), added: [], dropped: [], keepSwap: 0 };
  const added = systematicSample(r(), v2Eligible(band), inclusionProbs(band, j), j);
  const dropped: EnemyKind[] = [];
  let pool = others;
  while (dropped.length < added.length && pool.length > 0) {
    const k = rngPick(r, pool);
    dropped.push(k);
    pool = pool.filter((p) => p !== k);
  }
  const keep = new Set<EnemyKind>([...roster.map((e) => e.kind).filter((k) => !dropped.includes(k)), ...added]);
  const w = BANDS[band].rosterWeights;
  const out = ALL_ENEMY_KINDS.filter((k) => keep.has(k)).map((kind) => ({ kind, weight: w[kind] }));
  const n = groups.length;
  const d = n > 0 ? groups.filter((g) => dropped.includes(g.kind)).length / n : 0;
  const T = v2TotalShare(band);
  const keepSwap = d >= 1 ? 0 : Math.min(1, Math.max(0, (T - d) / (1 - d)));
  return { roster: out, added, dropped, keepSwap };
}

/**
 * Stage 2, one group. Draws one uniform, and one more index when the group is swapped. Returns
 * the new kind, or null to keep the v1 group as it is.
 */
export function swapGroupKind(r: Rng, plan: V2RosterPlan, kind: EnemyKind): EnemyKind | null {
  if (plan.added.length === 0) return null;
  const x = r();
  if (!plan.dropped.includes(kind) && x >= plan.keepSwap) return null;
  return plan.added[rngInt(r, 0, plan.added.length - 1)] ?? null;
}

/** Enemies a substituted group spawns: its whole budget at V2_SPAWN_UNIT each, at least 1. */
export function v2GroupCount(units: number): number {
  return Math.max(1, Math.floor(units / V2_SPAWN_UNIT));
}
