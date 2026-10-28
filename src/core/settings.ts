// Settings, progress and score persistence (docs/03 section 8). Ledger owns from W2.
// One key per value so a corrupt value cannot poison the rest. Every storage access is wrapped
// in try/catch: private mode, quota or a missing localStorage fall back to an in memory copy,
// then to defaults.

export interface Settings {
  neon: number;
  volume: number;
  showFps: boolean;
}

/** The subset of the DOM Storage API used here, so tests can pass a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SETTINGS_PREFIX = 'sow.settings.';
export const DEFAULT_SETTINGS: Readonly<Settings> = { neon: 70, volume: 70, showFps: false };

/** In memory store used when localStorage is missing or throws, so values hold for the session. */
const memory = new Map<string, string>();

/** Wraps localStorage: each call falls back to the in memory map if the real store throws. */
const fallbackStorage: StorageLike = {
  getItem(key) {
    try {
      const s: StorageLike | undefined = globalThis.localStorage;
      if (s) return s.getItem(key) ?? memory.get(key) ?? null;
    } catch {
      // private mode or blocked storage: use memory
    }
    return memory.get(key) ?? null;
  },
  setItem(key, value) {
    memory.set(key, value);
    try {
      const s: StorageLike | undefined = globalThis.localStorage;
      if (s) s.setItem(key, value);
    } catch {
      // quota or private mode: the memory copy still holds for this session
    }
  },
};

function defaultStorage(): StorageLike | null {
  return fallbackStorage;
}

function readInt(store: StorageLike | null, key: string, def: number, lo: number, hi: number): number {
  if (store === null) return def;
  try {
    const v = store.getItem(key);
    if (v === null) return def;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
  } catch {
    return def;
  }
}

export function loadSettings(storage: StorageLike | null = defaultStorage()): Settings {
  const d = DEFAULT_SETTINGS;
  return {
    neon: readInt(storage, `${SETTINGS_PREFIX}neon`, d.neon, 0, 100),
    volume: readInt(storage, `${SETTINGS_PREFIX}volume`, d.volume, 0, 100),
    showFps: readInt(storage, `${SETTINGS_PREFIX}showFps`, d.showFps ? 1 : 0, 0, 1) === 1,
  };
}

/** Pure: the string stored for a value. Numbers are rounded and clamped to 0..100. */
export function encodeSetting<K extends keyof Settings>(_k: K, v: Settings[K]): string {
  if (typeof v === 'boolean') return v ? '1' : '0';
  return String(Math.min(100, Math.max(0, Math.round(v))));
}

export function saveSetting<K extends keyof Settings>(
  k: K,
  v: Settings[K],
  storage: StorageLike | null = defaultStorage(),
): void {
  if (storage === null) return;
  try {
    storage.setItem(`${SETTINGS_PREFIX}${k}`, encodeSetting(k, v));
  } catch {
    // quota or private mode: ignore, the game still runs
  }
}

function readRaw(store: StorageLike | null, key: string): string | null {
  if (store === null) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(store: StorageLike | null, key: string, value: string): void {
  if (store === null) return;
  try {
    store.setItem(key, value);
  } catch {
    // quota or private mode: ignore, the game still runs
  }
}

// Glow path (W2 brief): "bloom" or "fallback", default "bloom", applied at boot.

export type GlowPathSetting = 'bloom' | 'fallback';
export const GLOW_PATH_KEY = `${SETTINGS_PREFIX}glowPath`;
export const DEFAULT_GLOW_PATH: GlowPathSetting = 'bloom';

/** Pure: anything other than the two valid strings falls back to "bloom". */
export function parseGlowPath(raw: string | null): GlowPathSetting {
  return raw === 'fallback' ? 'fallback' : DEFAULT_GLOW_PATH;
}

export function loadGlowPath(storage: StorageLike | null = defaultStorage()): GlowPathSetting {
  return parseGlowPath(readRaw(storage, GLOW_PATH_KEY));
}

export function saveGlowPath(p: GlowPathSetting, storage: StorageLike | null = defaultStorage()): void {
  writeRaw(storage, GLOW_PATH_KEY, parseGlowPath(p));
}

// Space physics (v2 addendum, docs/10 wave A): "off", "low", "medium" or "high", default "off".
// SpaceLevelSetting is the same literal union as SpaceLevel in src/core/physics.ts (Forge). It is
// declared here on purpose so the two branches never import each other; Fable glue matches them.

export type SpaceLevelSetting = 'off' | 'low' | 'medium' | 'high';
/** Button order on the settings row. */
export const SPACE_LEVELS: readonly SpaceLevelSetting[] = ['off', 'low', 'medium', 'high'];
export const SPACE_PHYSICS_KEY = `${SETTINGS_PREFIX}spacePhysics`;
export const DEFAULT_SPACE_PHYSICS: SpaceLevelSetting = 'off';

/** Pure: anything other than the three non default strings (exact case) falls back to "off". */
export function parseSpacePhysics(raw: string | null): SpaceLevelSetting {
  return raw === 'low' || raw === 'medium' || raw === 'high' ? raw : DEFAULT_SPACE_PHYSICS;
}

export function loadSpacePhysics(storage: StorageLike | null = defaultStorage()): SpaceLevelSetting {
  return parseSpacePhysics(readRaw(storage, SPACE_PHYSICS_KEY));
}

export function saveSpacePhysics(level: SpaceLevelSetting, storage: StorageLike | null = defaultStorage()): void {
  writeRaw(storage, SPACE_PHYSICS_KEY, parseSpacePhysics(level));
}

// Weapon pickups (v2 addendum, docs/10 wave B): stored as '1' (on) or '0' (off), default on. Kept
// out of Settings and DEFAULT_SETTINGS on purpose, like glowPath and spacePhysics, so the v1
// settings shape and the storage key audit stay as they are.

export const WEAPON_PICKUPS_KEY = `${SETTINGS_PREFIX}weaponPickups`;
export const DEFAULT_WEAPON_PICKUPS = true;

/** Pure: only the exact strings '0' and '1' count. Anything else, and null, gives the default (on). */
export function parseWeaponPickups(raw: string | null): boolean {
  if (raw === '0') return false;
  if (raw === '1') return true;
  return DEFAULT_WEAPON_PICKUPS;
}

/** Pure: the string stored for a value. */
export function encodeWeaponPickups(on: boolean): string {
  return on ? '1' : '0';
}

export function loadWeaponPickups(storage: StorageLike | null = defaultStorage()): boolean {
  return parseWeaponPickups(readRaw(storage, WEAPON_PICKUPS_KEY));
}

export function saveWeaponPickups(on: boolean, storage: StorageLike | null = defaultStorage()): void {
  writeRaw(storage, WEAPON_PICKUPS_KEY, encodeWeaponPickups(on));
}

// Effects tier (v2 addendum 3.8, docs/10 wave D): "low", "standard" or "high", default "standard".
// EffectsTierSetting is the same literal union as EffectsTier in src/render/effects.ts (Glow). It is
// declared here on purpose so the two branches never import each other; Fable glue matches them.
// Kept out of Settings and DEFAULT_SETTINGS, like glowPath and spacePhysics.

export type EffectsTierSetting = 'low' | 'standard' | 'high';
/** Button order on the settings row. */
export const EFFECTS_TIER_SETTINGS: readonly EffectsTierSetting[] = ['low', 'standard', 'high'];
export const EFFECTS_KEY = `${SETTINGS_PREFIX}effects`;
export const DEFAULT_EFFECTS: EffectsTierSetting = 'standard';

/** Pure: anything other than the three exact lower case strings (and null) falls back to "standard". */
export function parseEffects(raw: string | null): EffectsTierSetting {
  return raw === 'low' || raw === 'standard' || raw === 'high' ? raw : DEFAULT_EFFECTS;
}

export function loadEffects(storage: StorageLike | null = defaultStorage()): EffectsTierSetting {
  return parseEffects(readRaw(storage, EFFECTS_KEY));
}

export function saveEffects(tier: EffectsTierSetting, storage: StorageLike | null = defaultStorage()): void {
  writeRaw(storage, EFFECTS_KEY, parseEffects(tier));
}

// Music volume (v2 addendum 3.9, docs/10 wave D): an integer 0 to 100, default 50, where 0 is off.
// Stored as plain decimal text. Kept out of Settings and DEFAULT_SETTINGS on purpose, like the
// other v2 keys, so the v1 settings shape and the storage key audit stay as they are.

export const MUSIC_KEY = `${SETTINGS_PREFIX}music`;
export const DEFAULT_MUSIC = 50;

/** Pure: round and clamp to 0..100. A value that is not a finite number gives the default. */
export function clampMusic(v: number): number {
  return Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : DEFAULT_MUSIC;
}

/**
 * Pure: a stored music volume. Only whole decimal text counts (an optional minus sign, then digits),
 * and a whole number outside 0..100 is clamped. Null, empty, decimals, units and any other text give 50.
 */
export function parseMusic(raw: string | null): number {
  if (raw === null || !/^-?\d{1,15}$/.test(raw)) return DEFAULT_MUSIC;
  return clampMusic(Number(raw));
}

/** Pure: the string stored for a value (rounded and clamped, so the stored text always parses back). */
export function encodeMusic(v: number): string {
  return String(clampMusic(v));
}

export function loadMusic(storage: StorageLike | null = defaultStorage()): number {
  return parseMusic(readRaw(storage, MUSIC_KEY));
}

export function saveMusic(v: number, storage: StorageLike | null = defaultStorage()): void {
  writeRaw(storage, MUSIC_KEY, encodeMusic(v));
}

// Progress and scores (docs/03 section 8). Level indices are 1 based.

export const RUN_SEED_KEY = 'sow.progress.runSeed';
export const UNLOCKED_KEY = 'sow.progress.unlocked';
export const ADVENTURE_SCORES_KEY = 'sow.scores.adventure';
export const FIRST_LEVEL = 1;

/** Pure: a stored uint32 decimal, or null if missing or corrupt. */
export function parseUint32(raw: string | null): number | null {
  if (raw === null || !/^\d{1,10}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= 0xffffffff ? n >>> 0 : null;
}

/** The persistent run seed. Created with `fresh` and stored on first launch. */
export function loadRunSeed(fresh: () => number, storage: StorageLike | null = defaultStorage()): number {
  const stored = parseUint32(readRaw(storage, RUN_SEED_KEY));
  if (stored !== null) return stored;
  const seed = fresh() >>> 0;
  writeRaw(storage, RUN_SEED_KEY, String(seed));
  return seed;
}

/** Highest unlocked level index, at least FIRST_LEVEL. */
export function loadUnlocked(storage: StorageLike | null = defaultStorage()): number {
  return readInt(storage, UNLOCKED_KEY, FIRST_LEVEL, FIRST_LEVEL, 1_000_000);
}

/** Raise the unlocked index to `index` if higher. Returns the stored value. */
export function unlockLevel(index: number, storage: StorageLike | null = defaultStorage()): number {
  const next = Math.max(loadUnlocked(storage), Math.floor(index));
  writeRaw(storage, UNLOCKED_KEY, String(next));
  return next;
}

export interface LevelBest {
  best: number;
  stars: 0 | 1 | 2 | 3;
}

export type AdventureScores = Record<string, LevelBest>;

function asStars(v: unknown): 0 | 1 | 2 | 3 {
  return v === 1 || v === 2 || v === 3 ? v : 0;
}

/** Pure: parse the stored map, dropping any entry that is not well formed. */
export function parseAdventureScores(raw: string | null): AdventureScores {
  if (raw === null) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
  const out: AdventureScores = {};
  for (const [k, v] of Object.entries(data)) {
    if (!/^\d+$/.test(k) || typeof v !== 'object' || v === null) continue;
    const best: unknown = 'best' in v ? v.best : undefined;
    const st: unknown = 'stars' in v ? v.stars : undefined;
    if (typeof best !== 'number' || !Number.isFinite(best) || best < 0) continue;
    out[k] = { best: Math.floor(best), stars: asStars(st) };
  }
  return out;
}

export function loadAdventureScores(storage: StorageLike | null = defaultStorage()): AdventureScores {
  return parseAdventureScores(readRaw(storage, ADVENTURE_SCORES_KEY));
}

/** Pure: merge one result into the map. Best score and best stars are kept independently. */
export function mergeAdventureScore(
  scores: Readonly<AdventureScores>,
  index: number,
  score: number,
  starCount: 0 | 1 | 2 | 3,
): { scores: AdventureScores; best: number; newBest: boolean } {
  const key = String(Math.floor(index));
  const prev = scores[key];
  const newBest = prev === undefined || score > prev.best;
  const entry: LevelBest = {
    best: newBest ? Math.floor(score) : (prev?.best ?? 0),
    stars: asStars(Math.max(prev?.stars ?? 0, starCount)),
  };
  return { scores: { ...scores, [key]: entry }, best: entry.best, newBest };
}

/** Record a finished attempt. Returns the best score for the level and the new best flag. */
export function recordAdventureScore(
  index: number,
  score: number,
  starCount: 0 | 1 | 2 | 3,
  storage: StorageLike | null = defaultStorage(),
): { best: number; newBest: boolean } {
  const merged = mergeAdventureScore(loadAdventureScores(storage), index, score, starCount);
  writeRaw(storage, ADVENTURE_SCORES_KEY, JSON.stringify(merged.scores));
  return { best: merged.best, newBest: merged.newBest };
}

// Endless high scores (docs/03 section 8): top 10, sorted by score descending.

export const ENDLESS_SCORES_KEY = 'sow.scores.endless';
export const ENDLESS_TOP = 10;

export interface EndlessEntry {
  score: number;
  /** Epoch ms when the game ended. */
  at: number;
}

/** Pure: highest score first; equal scores keep the earlier game first. Sorts in place. */
function sortEndless(rows: EndlessEntry[]): EndlessEntry[] {
  return rows.sort((a, b) => b.score - a.score || a.at - b.at);
}

/** Pure: parse the stored table, dropping malformed rows, then sort and cap. */
export function parseEndlessScores(raw: string | null): EndlessEntry[] {
  if (raw === null) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: EndlessEntry[] = [];
  for (const row of data) {
    if (typeof row !== 'object' || row === null) continue;
    const score: unknown = 'score' in row ? row.score : undefined;
    const at: unknown = 'at' in row ? row.at : undefined;
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) continue;
    out.push({ score: Math.floor(score), at: typeof at === 'number' && Number.isFinite(at) ? at : 0 });
  }
  return sortEndless(out).slice(0, ENDLESS_TOP);
}

/**
 * Pure: insert one result. Returns the new table and the 1 based rank of the new row, or 0 if it
 * did not make the top 10. A tie with an existing score ranks below it.
 */
export function insertEndlessScore(
  table: readonly EndlessEntry[],
  entry: EndlessEntry,
): { table: EndlessEntry[]; rank: number } {
  const row: EndlessEntry = { score: Math.max(0, Math.floor(entry.score)), at: entry.at };
  const sorted = sortEndless([...table]);
  let i = 0;
  while (i < sorted.length && (sorted[i]?.score ?? 0) >= row.score) i++;
  sorted.splice(i, 0, row);
  return { table: sorted.slice(0, ENDLESS_TOP), rank: i < ENDLESS_TOP ? i + 1 : 0 };
}

export function loadEndlessScores(storage: StorageLike | null = defaultStorage()): EndlessEntry[] {
  return parseEndlessScores(readRaw(storage, ENDLESS_SCORES_KEY));
}

/** Record a finished Endless game. Returns its rank (0 if outside the top 10) and the best score. */
export function recordEndlessScore(
  score: number,
  at: number,
  storage: StorageLike | null = defaultStorage(),
): { rank: number; best: number } {
  const r = insertEndlessScore(loadEndlessScores(storage), { score, at });
  writeRaw(storage, ENDLESS_SCORES_KEY, JSON.stringify(r.table));
  return { rank: r.rank, best: r.table[0]?.score ?? 0 };
}

// Schema version (docs/03 section 8).

export const SCHEMA_KEY = 'sow.schema';
export const SCHEMA_VERSION = 1;

/** Write sow.schema on first launch. Returns the stored version (1 today). */
export function ensureSchema(storage: StorageLike | null = defaultStorage()): number {
  const v = parseUint32(readRaw(storage, SCHEMA_KEY));
  if (v !== null) return v;
  writeRaw(storage, SCHEMA_KEY, String(SCHEMA_VERSION));
  return SCHEMA_VERSION;
}

/** Settings screen "Reset progress": unlocked back to 1 and the Adventure table cleared. */
export function resetProgress(storage: StorageLike | null = defaultStorage()): void {
  writeRaw(storage, UNLOCKED_KEY, String(FIRST_LEVEL));
  writeRaw(storage, ADVENTURE_SCORES_KEY, '{}');
}

/** Pure: a typed run seed, or null. Accepts 1 to 10 digits up to 4294967295. */
export function parseSeedInput(text: string): number | null {
  return parseUint32(text.trim());
}

// Adventure progression rules (docs/01 section 2.1).

/** Pure: unlocked index after finishing `index`. Success unlocks index + 1, regardless of stars. */
export function unlockAfter(unlocked: number, index: number, success: boolean): number {
  const base = Math.max(FIRST_LEVEL, Math.floor(unlocked));
  return success ? Math.max(base, Math.floor(index) + 1) : base;
}

/** Pure: true if level `index` can be started from level select. */
export function isUnlocked(unlocked: number, index: number): boolean {
  return Number.isInteger(index) && index >= FIRST_LEVEL && index <= Math.max(FIRST_LEVEL, unlocked);
}
