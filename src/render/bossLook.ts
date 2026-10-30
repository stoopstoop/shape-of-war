// Pure boss look (docs/12 wave V3-A "Render contract for Glow", docs/13 SPEC 3.8 item 1). No pixi.js
// import. Tier, colour key and line weight per boss id, and one pure helper per render contract
// state mapping (mode, modeT) to openness or alpha. The renderer reads the boss only through
// readBoss (src/game/bosses/view.ts); these helpers never touch the World.
// Line weight and the tier 3 halo widening are multipliers on the boss layer only. applyNeon stays
// the only writer of glow width: the halo width is still l.width x haloWidthMul (shapes.ts), the
// tier just scales l.width (and, for tier 3, the halo of the boss layer).
import { BOSS_IDS, type BossTier } from '../levelgen/leveldef';
import { clampNum, hash01 } from './color';
import type { PaletteKey } from './neon';

/** Number of boss ids (index in BOSS_IDS, the BossView.id field). */
export const BOSS_COUNT: number = BOSS_IDS.length;

/** Boss index of each wave A boss, as BossView.id reports it. */
export const BOSS_WARDEN = 0;
export const BOSS_BROOD = 1;
export const BOSS_SPINDLE = 2;
/** Boss index of each wave B (tier 2) boss. */
export const BOSS_EMBER = 3;
export const BOSS_MIRAGE = 4;
export const BOSS_GRAVITAS = 5;
/** Boss index of each wave C (tier 3) boss. */
export const BOSS_BASTION = 6;
export const BOSS_TEMPEST = 7;
export const BOSS_TWINS = 8;

/** Tier per boss index, docs/13 schedule: three tier 1, three tier 2, three tier 3, one tier 4. */
export const BOSS_TIER_BY_ID: readonly BossTier[] = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4];

/** Palette key per boss index (docs/12 schedule colours). */
export const BOSS_COLOUR_BY_ID: readonly PaletteKey[] = [
  'bossBlue',
  'bossGreen',
  'bossYellow',
  'bossOrange',
  'bossMagenta',
  'bossViolet',
  'bossRed',
  'bossRed',
  'bossRed',
  'bossPrism',
];

/** Boss layer line weight multiplier per tier (docs/13 tier table): x1.6, x2.0, x3.0, x2.4. */
export const TIER_LINE_WEIGHT: Readonly<Record<BossTier, number>> = { 1: 1.6, 2: 2.0, 3: 3.0, 4: 2.4 };

/** Extra outer halo width on the boss layer per tier: tier 3 gets the wider outer glow stroke. */
export const TIER_HALO_MUL: Readonly<Record<BossTier, number>> = { 1: 1, 2: 1, 3: 1.5, 4: 1 };

/**
 * Enemy bullet colour per tier: the shooter of each tier (Spindle yellow, Ember orange, Bastion
 * red), and the Prism key for tier 4 (no tier 4 shooter exists). No new palette key.
 */
export const TIER_BULLET_KEY: Readonly<Record<BossTier, PaletteKey>> = {
  1: 'bossYellow',
  2: 'bossOrange',
  3: 'bossRed',
  4: 'bossPrism',
};

/** Alpha of the second concentric rim every boss carries (docs/13 SPEC 3.8 item 1). */
export const BOSS_RIM_ALPHA = 0.6;

/** Pure: a valid boss index (0 to 9) for any number, or 0 (Warden) for anything else. */
export function bossIndex(id: number): number {
  return Number.isInteger(id) && id >= 0 && id < BOSS_COUNT ? id : 0;
}

/** Pure: the tier of a boss index. Unknown ids read as tier 1. */
export function bossTierOf(id: number): BossTier {
  return BOSS_TIER_BY_ID[bossIndex(id)] ?? 1;
}

/** Pure: the palette key of a boss index. */
export function bossColourOf(id: number): PaletteKey {
  return BOSS_COLOUR_BY_ID[bossIndex(id)] ?? 'bossBlue';
}

/** Pure: a valid tier for any number (1 for anything outside 1 to 4). */
export function tierOf(t: number): BossTier {
  return t === 2 || t === 3 || t === 4 ? t : 1;
}

/** Pure: boss layer line weight multiplier for a tier. */
export function tierWeight(t: number): number {
  return TIER_LINE_WEIGHT[tierOf(t)];
}

/** Pure: boss layer halo width multiplier for a tier. */
export function tierHaloMul(t: number): number {
  return TIER_HALO_MUL[tierOf(t)];
}

// Render contract modes (BossView.mode).
export const MODE_ENTERING = 0;
export const MODE_GUARDED = 1;
export const MODE_ATTACKING = 2;
export const MODE_VULNERABLE = 3;
export const MODE_STUNNED = 4;
export const MODE_PHASE = 5;
export const MODE_DYING = 6;

/** Entrance telegraph length in seconds (docs/13 boss rule 3). */
export const ENTRANCE_SEC = 2.0;
/** Seconds for a shell or core to open fully once the boss turns vulnerable. */
export const OPEN_SEC = 0.25;
/** Displayed openness eases toward the target at this many units per second (closing too). */
export const OPEN_RATE = 4;
/** Number of prebuilt openness steps per boss (0, 0.25, 0.5, 0.75, 1): one context each. */
export const BOSS_OPEN_STEPS = 5;
/** Seconds the dying body takes to fade out. */
export const DYING_SEC = 1.0;
/** Seconds of the phase change flash on the body. */
export const PHASE_FLASH_SEC = 0.45;

function finite(v: number, d: number): number {
  return Number.isFinite(v) ? v : d;
}

/** Ramp 0 to 1 over OPEN_SEC from modeT. */
function openRamp(modeT: number): number {
  return clampNum(finite(modeT, 0) / OPEN_SEC, 0, 1);
}

/**
 * Pure: Warden shell openness, 0 closed (plates shut, guarded) to 1 open (plates slid out, bright
 * core). The core opens only while vulnerable (2 s after each ring), stunned or dying. A phase
 * change rattles the plates a quarter open.
 */
export function wardenOpenness(mode: number, modeT: number): number {
  if (mode === MODE_VULNERABLE || mode === MODE_STUNNED) return openRamp(modeT);
  if (mode === MODE_DYING) return 1;
  if (mode === MODE_PHASE) return 0.25;
  return 0;
}

/**
 * Pure: Brood core openness. Immune (membrane shut, dim nucleus) until its pods die; then the core
 * is open for 5 s (vulnerable). The sim owns the timing; this reads only the mode.
 */
export function broodOpenness(mode: number, modeT: number): number {
  if (mode === MODE_VULNERABLE || mode === MODE_STUNNED) return openRamp(modeT);
  if (mode === MODE_DYING) return 1;
  return 0;
}

/**
 * Pure: Spindle core openness. Always hittable, so the core is always open, except while it
 * enters (the core lights up over the entrance).
 */
export function spindleOpenness(mode: number, modeT: number): number {
  if (mode === MODE_ENTERING) return clampNum(finite(modeT, 0) / ENTRANCE_SEC, 0, 1);
  return 1;
}

/** Pure: openness for any boss index. Bosses after wave A use the Warden rule (vulnerable opens). */
export function bossOpenness(id: number, mode: number, modeT: number): number {
  const b = bossIndex(id);
  if (b === BOSS_BROOD) return broodOpenness(mode, modeT);
  if (b === BOSS_SPINDLE) return spindleOpenness(mode, modeT);
  return wardenOpenness(mode, modeT);
}

/** Pure: move cur toward target by at most rate x dt. */
export function approach(cur: number, target: number, dt: number, rate: number): number {
  const c = finite(cur, target);
  const step = Math.max(0, finite(dt, 0)) * Math.max(0, rate);
  if (c < target) return Math.min(target, c + step);
  if (c > target) return Math.max(target, c - step);
  return c;
}

/** Pure: the prebuilt openness step (0 to BOSS_OPEN_STEPS - 1) nearest an openness. */
export function opennessStep(o: number): number {
  const n = BOSS_OPEN_STEPS - 1;
  return Math.round(clampNum(finite(o, 0), 0, 1) * n);
}

/**
 * Pure: body alpha. Entering fades in from 0.35 over the entrance (harmless, untargetable, so
 * the body reads as not yet solid). Dying flickers out over DYING_SEC. Otherwise solid.
 */
export function bossBodyAlpha(mode: number, modeT: number): number {
  const t = Math.max(0, finite(modeT, 0));
  if (mode === MODE_ENTERING) return 0.35 + 0.65 * clampNum(t / ENTRANCE_SEC, 0, 1);
  if (mode === MODE_DYING) {
    const fade = clampNum(1 - t / DYING_SEC, 0, 1);
    const flicker = 0.55 + 0.45 * hash01(Math.floor(t * 24));
    return fade * flicker;
  }
  return 1;
}

/** Pure: phase change flash strength on the body, 1 at the change, 0 after PHASE_FLASH_SEC. */
export function bossPhaseFlash(mode: number, modeT: number): number {
  if (mode !== MODE_PHASE) return 0;
  return clampNum(1 - Math.max(0, finite(modeT, 0)) / PHASE_FLASH_SEC, 0, 1);
}

/** Entrance ring at modeT: radius in arena units and alpha. */
export interface EntranceRing {
  r: number;
  alpha: number;
}

/** The ring starts this many body radii out and contracts onto the body rim. */
export const ENTRANCE_R0 = 2.6;
export const ENTRANCE_R1 = 1.2;
/** Entrance ring pulse rate in Hz (the telegraph is harmless, but it must read as a warning). */
export const ENTRANCE_PULSE_HZ = 4;

/**
 * Pure: the entrance telegraph ring for a body radius. Mode 0 only and only for ENTRANCE_SEC:
 * it contracts from 2.6 to 1.2 body radii and brightens, pulsing at 4 Hz. Alpha 0 otherwise.
 */
export function entranceRing(mode: number, modeT: number, radius: number, out: EntranceRing): EntranceRing {
  const t = finite(modeT, 0);
  const r = Math.max(1, finite(radius, 60));
  if (mode !== MODE_ENTERING || t < 0 || t >= ENTRANCE_SEC) {
    out.r = r * ENTRANCE_R1;
    out.alpha = 0;
    return out;
  }
  const u = t / ENTRANCE_SEC;
  out.r = r * (ENTRANCE_R0 + (ENTRANCE_R1 - ENTRANCE_R0) * u);
  out.alpha = (0.35 + 0.55 * u) * (0.8 + 0.2 * Math.cos(t * ENTRANCE_PULSE_HZ * Math.PI * 2));
  return out;
}

/** Pod pulse: scale amplitude and rate (Brood pods pulse while they shield the core). */
export const POD_PULSE_AMP = 0.1;
export const POD_PULSE_HZ = 1.6;

/** Pure: pod scale on the render clock, phase from a per entity seed in [0, 1). */
export function podPulse(timeSec: number, seed: number): number {
  return 1 + POD_PULSE_AMP * Math.sin((finite(timeSec, 0) * POD_PULSE_HZ + finite(seed, 0)) * Math.PI * 2);
}

// Boss hit flash (fx:hit with Kind.Boss), throttled per boss on the draw clock.

/** At most one boss hit flash per this many ms (about 11 per second under open fire). */
export const BOSS_HIT_MS = 90;
/** Seconds a boss hit flash takes to fade. */
export const BOSS_HIT_FLASH_SEC = 0.1;
/** Glow sprite boost at a fresh hit, phase flash or both (a multiplier, never a SPEC 4 write). */
export const BOSS_FLASH_GLOW = 0.9;

export interface BossHitThrottle {
  lastMs: number;
}

export function createBossHitThrottle(): BossHitThrottle {
  return { lastMs: Number.NEGATIVE_INFINITY };
}

/** Pure on the throttle: true (and records the time) when a flash may show at nowMs. */
export function bossHitAllow(t: BossHitThrottle, nowMs: number): boolean {
  if (!Number.isFinite(nowMs)) return false;
  if (nowMs >= t.lastMs && nowMs - t.lastMs < BOSS_HIT_MS) return false;
  t.lastMs = nowMs;
  return true;
}

/** Pure: glow sprite multiplier from the hit flash age and the phase flash strength. */
export function bossGlowMul(hitAge: number, phaseFlash: number): number {
  const hit = clampNum(1 - Math.max(0, finite(hitAge, BOSS_HIT_FLASH_SEC)) / BOSS_HIT_FLASH_SEC, 0, 1);
  return 1 + BOSS_FLASH_GLOW * Math.max(hit, clampNum(finite(phaseFlash, 0), 0, 1));
}

// Boss death (sim:bossDown): burst, shake and lattice shock.

/** Boss death shake: 14 CSS px for 0.6 s (docs/13 section 12 row), inside the 16 px hard cap. */
export const BOSS_DEATH_SHAKE_PX = 14;
export const BOSS_DEATH_SHAKE_SEC = 0.6;

/**
 * Death burst particles per effects tier before the boss tier scale, and the hard cap per effects
 * tier. Standard 2048 and High 4096 stay the pool caps; the burst never takes more than about 45
 * percent of the pool, so a stress scene keeps its sparks.
 */
export const BOSS_BURST_BASE: Readonly<Record<'low' | 'standard' | 'high', number>> = { low: 260, standard: 640, high: 1280 };
export const BOSS_BURST_CAP: Readonly<Record<'low' | 'standard' | 'high', number>> = { low: 400, standard: 900, high: 1800 };
/** Each boss tier above 1 adds this share to the burst (the top boss gets the largest). */
export const BOSS_BURST_TIER_STEP = 0.15;

/** Pure: boss death burst particle count for an effects tier and a boss tier, never above the cap. */
export function bossDeathBurst(effects: 'low' | 'standard' | 'high', tier: number): number {
  const base = BOSS_BURST_BASE[effects];
  const n = Math.round(base * (1 + BOSS_BURST_TIER_STEP * (tierOf(tier) - 1)));
  return Math.min(BOSS_BURST_CAP[effects], n);
}

/** Screen edge pulse in the boss colour on sim:bossEnter (docs/13 SPEC 3.8 item 3): length and rate. */
export const BOSS_EDGE_SEC = 1.6;
export const BOSS_EDGE_HZ = 2.5;
export const BOSS_EDGE_PEAK = 0.85;

/** Pure: edge pulse alpha at age seconds after the entrance, 0 after BOSS_EDGE_SEC. */
export function bossEdgePulse(age: number): number {
  if (!Number.isFinite(age) || age < 0 || age >= BOSS_EDGE_SEC) return 0;
  const fade = 1 - age / BOSS_EDGE_SEC;
  return BOSS_EDGE_PEAK * fade * (0.6 + 0.4 * Math.cos(age * BOSS_EDGE_HZ * Math.PI * 2));
}

/** Share of the death burst that is white (the hot core), the rest is the boss colour. */
export const BOSS_BURST_WHITE = 0.3;
/** Phase change burst: a short ring of sparks, not capped by more than the pool. */
export const BOSS_PHASE_BURST = 70;
