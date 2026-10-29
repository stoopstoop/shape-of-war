// Boss HUD data and pure logic (docs/13 SPEC 3.4, 3.6 and docs/01 section 9). The boss bar is fed
// by 'hud:boss'. Names, tiers and colours live here so Ryan edits one const (BOSS_NAMES) and the
// bar, the intro card and the results line all read it. Hues come from the render palette, the
// single source Glow tunes (the weaponHue pattern), so no hue number is written in this file.
import type { Events } from '../core/events';
import { BOSS_IDS, type BossId, type BossTier } from '../levelgen/leveldef';
import { BASE_PALETTE, type PaletteKey } from '../render/neon';

export type HudBoss = Events['hud:boss'];

/**
 * Working names (docs/13 roster, default confirmed Q7). Placeholders: Ryan overwrites these. The
 * bar and the intro card line "Boss: <name>" read them and nothing else does.
 */
export const BOSS_NAMES: Readonly<Record<BossId, string>> = {
  warden: 'Warden',
  brood: 'Brood',
  spindle: 'Spindle',
  ember: 'Ember',
  mirage: 'Mirage',
  gravitas: 'Gravitas',
  bastion: 'Bastion',
  tempest: 'Tempest',
  twins: 'Twins',
  prism: 'Prism',
};

/** Tier of each boss (docs/13 schedule): 1 weakest, 4 the top boss. A boss keeps its tier in every Endless pass. */
export const BOSS_TIER: Readonly<Record<BossId, BossTier>> = {
  warden: 1,
  brood: 1,
  spindle: 1,
  ember: 2,
  mirage: 2,
  gravitas: 2,
  bastion: 3,
  tempest: 3,
  twins: 3,
  prism: 4,
};

/** Palette key of each boss (docs/13 section 11): blue, green, yellow, orange, magenta, violet, red x3, prism. */
export const BOSS_PALETTE_KEY: Readonly<Record<BossId, PaletteKey>> = {
  warden: 'bossBlue',
  brood: 'bossGreen',
  spindle: 'bossYellow',
  ember: 'bossOrange',
  mirage: 'bossMagenta',
  gravitas: 'bossViolet',
  bastion: 'bossRed',
  tempest: 'bossRed',
  twins: 'bossRed',
  prism: 'bossPrism',
};

/** Glow radius of the bar in CSS px by tier: the tier 3 reds get the thick glow (docs/13 tier table). */
export const BOSS_GLOW_PX: Readonly<Record<BossTier, number>> = { 1: 6, 2: 8, 3: 14, 4: 10 };

/** Pure: true when `id` is one of the ten boss ids. */
export function isBossId(id: string): id is BossId {
  return (BOSS_IDS as readonly string[]).includes(id);
}

/** Pure: display name, or '' for an unknown id. */
export function bossName(id: string): string {
  return isBossId(id) ? BOSS_NAMES[id] : '';
}

/** Pure: CSS colour of a boss from the render palette. An `alpha` below 1 gives hsla. */
export function bossColour(id: BossId, alpha = 1): string {
  const [h, s, l] = BASE_PALETTE[BOSS_PALETTE_KEY[id]];
  const sat = Math.round(s * 100);
  const lit = Math.round(l * 100);
  return alpha >= 1 ? `hsl(${h}, ${sat}%, ${lit}%)` : `hsla(${h}, ${sat}%, ${lit}%, ${alpha})`;
}

/** Seconds for one full hue cycle of the Prism bar: the same 3 s as the in world shimmer (docs/13 SPEC 3.8). */
export const PRISM_CYCLE_SEC = 3;

/** Pure: a left to right rainbow whose hue starts at `offsetDeg`, for the Prism bar. */
export function prismGradient(offsetDeg: number): string {
  const o = ((offsetDeg % 360) + 360) % 360;
  const stops: string[] = [];
  for (let i = 0; i <= 6; i++) stops.push(`hsl(${Math.round((o + i * 60) % 360)}, 90%, 62%)`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

export interface BossFill {
  /** CSS background of the bar fill. */
  background: string;
  /** CSS box-shadow of the bar fill. */
  glow: string;
}

/** Pure: bar fill style. Prism shimmers with `nowMs` (a full cycle in PRISM_CYCLE_SEC); the others are flat tier colours. */
export function bossFill(id: BossId, nowMs: number): BossFill {
  const px = BOSS_GLOW_PX[BOSS_TIER[id]];
  const glow = `0 0 ${px}px ${bossColour(id)}`;
  if (id !== 'prism') return { background: bossColour(id), glow };
  const t = Number.isFinite(nowMs) ? nowMs / 1000 : 0;
  return { background: prismGradient((t / PRISM_CYCLE_SEC) * 360), glow };
}

/** The most phase pips drawn. The roster has at most 4 phases (Prism). */
export const BOSS_MAX_PIPS = 6;

/** Phase numbers are 1 based: the first phase is 1 of `phases` (docs/13 "phase of phases"). */
export const FIRST_PHASE = 1;

export type PipState = 'done' | 'current' | 'next';

/**
 * Pure: one pip per phase. A phase before the current one is done, the current one is lit, the
 * rest are hollow. Fewer than two phases (or an unknown count) draws none, since a single pip says
 * nothing. A phase outside 1 to `phases` is clamped into it.
 */
export function pipStates(phase: number, phases: number): PipState[] {
  const n = Number.isFinite(phases) ? Math.min(BOSS_MAX_PIPS, Math.max(0, Math.floor(phases))) : 0;
  if (n < 2) return [];
  const cur = Math.min(n, Math.max(FIRST_PHASE, Number.isFinite(phase) ? Math.floor(phase) : FIRST_PHASE));
  const out: PipState[] = [];
  for (let i = FIRST_PHASE; i < FIRST_PHASE + n; i++) out.push(i < cur ? 'done' : i === cur ? 'current' : 'next');
  return out;
}

/** What the boss bar shows for one hud:boss payload. */
export interface BossBarView {
  /** False when the payload cannot be drawn (unknown id, no maximum). */
  visible: boolean;
  name: string;
  tier: BossTier;
  /** Hit points left as 0 to 1. 0 only at 0 hit points: a living boss keeps a 1 percent sliver. */
  fraction: number;
  pips: PipState[];
}

/** Smallest fill of a boss that still has hit points, so the last hit is still a visible bar. */
export const BOSS_MIN_FRACTION = 0.01;

/**
 * Pure: bar state for a hud:boss payload. Hit points are tenths of a hit (docs/13 rule 2), so only
 * the ratio of `hp` to `maxHp` matters. An unknown id, a non finite hp or maxHp, or a maximum of 0
 * or less hides the bar (there is nothing to draw), as the weapon indicator does.
 */
export function bossView(p: HudBoss): BossBarView {
  const known = isBossId(p.id);
  const drawable = known && Number.isFinite(p.hp) && Number.isFinite(p.maxHp) && p.maxHp > 0;
  const ratio = drawable ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : 0;
  return {
    visible: drawable,
    name: bossName(p.id),
    tier: known ? BOSS_TIER[p.id] : 1,
    fraction: ratio > 0 ? Math.max(BOSS_MIN_FRACTION, ratio) : 0,
    pips: drawable ? pipStates(p.phase, p.phases) : [],
  };
}

/** Throttle memory for hud:boss: when it last drew and what that draw showed. */
export interface BossGate {
  lastMs: number;
  /** '' before the first draw. */
  id: BossId | '';
  phase: number;
  phases: number;
  /** True when the last draw showed 0 hit points. */
  empty: boolean;
}

export const BOSS_GATE_START: Readonly<BossGate> = { lastMs: Number.NEGATIVE_INFINITY, id: '', phase: 0, phases: 0, empty: false };

/**
 * Pure: should this hud:boss payload be drawn now? At most every `intervalMs` (100, like hud:score
 * and hud:weapon), except that a change of boss, phase or phase count, and the move to 0 hit
 * points, always draw: a throttled phase change would leave a stale pip up. A skipped payload
 * leaves the gate as it was.
 */
export function bossGate(
  g: Readonly<BossGate>,
  p: HudBoss,
  nowMs: number,
  intervalMs = 100,
): { gate: BossGate; draw: boolean } {
  const empty = Number.isFinite(p.hp) && p.hp <= 0;
  const changed = p.id !== g.id || p.phase !== g.phase || p.phases !== g.phases || empty !== g.empty;
  const draw = changed || nowMs - g.lastMs >= intervalMs;
  const id: BossId | '' = isBossId(p.id) ? p.id : '';
  return { gate: draw ? { lastMs: nowMs, id, phase: p.phase, phases: p.phases, empty } : { ...g }, draw };
}

/** The payload the bar shows from the moment a boss enters until the first hud:boss: full bar, name, no pips. */
export function enterPayload(id: BossId): HudBoss {
  return { id, hp: 1, maxHp: 1, phase: FIRST_PHASE, phases: 0, mode: 0 };
}

/** Share of par paid as the boss kill bonus (docs/13 SPEC 3.6 rule 1). */
export const BOSS_BONUS_SHARE = 0.25;
/** The bonus is rounded half up to a multiple of this. */
export const BOSS_BONUS_STEP = 500;

/**
 * Pure: the flat boss kill bonus for a level of this par, 25 percent of par rounded half up to the
 * nearest 500, never multiplied (docs/13 SPEC 3.6). The sim awards the same number; the results
 * line only reports it. A par that is not a positive finite number gives 0.
 */
export function bossBonusFor(par: number): number {
  if (!Number.isFinite(par) || par <= 0) return 0;
  return Math.floor((par * BOSS_BONUS_SHARE + BOSS_BONUS_STEP / 2) / BOSS_BONUS_STEP) * BOSS_BONUS_STEP;
}
