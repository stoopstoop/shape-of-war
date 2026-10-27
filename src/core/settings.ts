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
