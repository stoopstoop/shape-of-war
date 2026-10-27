// Settings persistence (docs/03 section 8). Forge stub in W1, Ledger owns from W2.
// One key per value so a corrupt value cannot poison the rest. Every storage access is wrapped
// in try/catch: private mode, quota or a missing localStorage fall back to defaults.

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

function defaultStorage(): StorageLike | null {
  try {
    const s: StorageLike | undefined = globalThis.localStorage;
    return s ?? null;
  } catch {
    return null;
  }
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
