// V2 harden: the four v2 storage keys (docs/10 Appendix B, docs/11 "Settings keys and bus additions").
// storageKeys.test.ts audits the whole key set; this file pins the v2 part on its own terms:
//   exactly four keys were added since v1.0.0, with the exact spellings and the sow.settings. prefix;
//   none collides with a v1 key, with each other, or with a settings field name, ignoring case;
//   each save writes only its own key, and no load writes anything (a v1 profile opens untouched);
//   defaults and invalid values behave as the addendum says, with storage that throws;
//   Reset progress leaves them alone; no file other than core/settings.ts holds a key literal.
// No real localStorage, no browser.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SCORES_KEY,
  DEFAULT_EFFECTS,
  DEFAULT_MUSIC,
  DEFAULT_SETTINGS,
  DEFAULT_SPACE_PHYSICS,
  DEFAULT_WEAPON_PICKUPS,
  EFFECTS_KEY,
  ENDLESS_SCORES_KEY,
  GLOW_PATH_KEY,
  MUSIC_KEY,
  RUN_SEED_KEY,
  SCHEMA_KEY,
  SETTINGS_PREFIX,
  SPACE_PHYSICS_KEY,
  UNLOCKED_KEY,
  WEAPON_PICKUPS_KEY,
  ensureSchema,
  loadAdventureScores,
  loadEffects,
  loadEndlessScores,
  loadMusic,
  loadRunSeed,
  loadSettings,
  loadSpacePhysics,
  loadUnlocked,
  loadWeaponPickups,
  recordAdventureScore,
  recordEndlessScore,
  resetProgress,
  saveEffects,
  saveGlowPath,
  saveMusic,
  saveSetting,
  saveSpacePhysics,
  saveWeaponPickups,
  unlockLevel,
} from '../../src/core/settings';
import type { StorageLike } from '../../src/core/settings';
import { stripComments } from './summary';

/** The nine keys of tag v1.0.0 (src/core/settings.ts there), spelled out so a rename shows up here. */
const V1_KEYS: readonly string[] = [
  'sow.progress.runSeed',
  'sow.progress.unlocked',
  'sow.schema',
  'sow.scores.adventure',
  'sow.scores.endless',
  'sow.settings.glowPath',
  'sow.settings.neon',
  'sow.settings.showFps',
  'sow.settings.volume',
];

const V2_KEYS = ['sow.settings.spacePhysics', 'sow.settings.weaponPickups', 'sow.settings.effects', 'sow.settings.music'] as const;

const V1_CONSTANTS = [
  RUN_SEED_KEY,
  UNLOCKED_KEY,
  SCHEMA_KEY,
  ADVENTURE_SCORES_KEY,
  ENDLESS_SCORES_KEY,
  GLOW_PATH_KEY,
  ...Object.keys(DEFAULT_SETTINGS).map((k) => `${SETTINGS_PREFIX}${k}`),
];

const SRC_DIR = fileURLToPath(new URL('../../src', import.meta.url));
const SETTINGS_FILE = 'src/core/settings.ts';

interface Recording extends StorageLike {
  data: Map<string, string>;
  reads: string[];
  writes: string[];
}

function recording(seed: Record<string, string> = {}): Recording {
  const data = new Map<string, string>(Object.entries(seed));
  const reads: string[] = [];
  const writes: string[] = [];
  return {
    data,
    reads,
    writes,
    getItem: (k) => {
      reads.push(k);
      return data.get(k) ?? null;
    },
    setItem: (k, v) => {
      writes.push(k);
      data.set(k, v);
    },
  };
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error('storage disabled');
  },
  setItem: () => {
    throw new Error('quota');
  },
};

/** What a player on v1.0.0 has in storage after some play: every v1 key, no v2 key. */
const V1_PROFILE: Record<string, string> = {
  'sow.schema': '1',
  'sow.progress.runSeed': '123456',
  'sow.progress.unlocked': '7',
  'sow.scores.adventure': '{"1":{"best":2500,"stars":2},"2":{"best":900,"stars":1}}',
  'sow.scores.endless': '[{"score":4000,"at":77}]',
  'sow.settings.glowPath': 'fallback',
  'sow.settings.neon': '33',
  'sow.settings.volume': '40',
  'sow.settings.showFps': '1',
};

describe('the v2 key set', () => {
  const declared = [SPACE_PHYSICS_KEY, WEAPON_PICKUPS_KEY, EFFECTS_KEY, MUSIC_KEY];

  it('has the four exact spellings and keeps the sow.settings. prefix', () => {
    expect(declared).toEqual([...V2_KEYS]);
    for (const k of declared) {
      expect(k.startsWith('sow.'), k).toBe(true);
      expect(k.startsWith(SETTINGS_PREFIX), k).toBe(true);
      expect(/^sow\.settings\.[a-zA-Z][a-zA-Z0-9]*$/.test(k), k).toBe(true);
    }
  });

  it('is exactly the v1 constants plus four: nothing renamed, nothing else added', () => {
    expect([...V1_CONSTANTS].sort()).toEqual([...V1_KEYS].sort());
    expect(new Set([...V1_CONSTANTS, ...declared]).size).toBe(V1_KEYS.length + 4);
  });

  it('has no collisions with the v1 keys, with itself or with a settings field, also ignoring case', () => {
    const all = [...V1_KEYS, ...declared];
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all.map((k) => k.toLowerCase())).size).toBe(all.length);
    for (const field of Object.keys(DEFAULT_SETTINGS)) expect(declared).not.toContain(`${SETTINGS_PREFIX}${field}`);
  });

  it('has no key nested under another (a key that is a prefix of another invites a collision)', () => {
    const all = [...V1_KEYS, ...declared];
    for (const a of all) for (const b of all) if (a !== b) expect(b.startsWith(`${a}.`), `${b} under ${a}`).toBe(false);
  });
});

describe('what the v2 settings write', () => {
  it('each save writes only its own key, with the stored text the addendum describes', () => {
    const cases: readonly [string, (s: StorageLike) => void, string, string][] = [
      ['spacePhysics', (s) => saveSpacePhysics('medium', s), SPACE_PHYSICS_KEY, 'medium'],
      ['weaponPickups off', (s) => saveWeaponPickups(false, s), WEAPON_PICKUPS_KEY, '0'],
      ['weaponPickups on', (s) => saveWeaponPickups(true, s), WEAPON_PICKUPS_KEY, '1'],
      ['effects', (s) => saveEffects('high', s), EFFECTS_KEY, 'high'],
      ['music', (s) => saveMusic(80, s), MUSIC_KEY, '80'],
    ];
    for (const [name, save, key, text] of cases) {
      const store = recording();
      save(store);
      expect(store.writes, name).toEqual([key]);
      expect(store.data.get(key), name).toBe(text);
    }
  });

  it('a v1 profile loads with the v2 defaults and loading writes nothing', () => {
    const store = recording(V1_PROFILE);
    expect(loadSpacePhysics(store)).toBe('off');
    expect(loadWeaponPickups(store)).toBe(true);
    expect(loadEffects(store)).toBe('standard');
    expect(loadMusic(store)).toBe(50);
    expect([DEFAULT_SPACE_PHYSICS, DEFAULT_WEAPON_PICKUPS, DEFAULT_EFFECTS, DEFAULT_MUSIC]).toEqual(['off', true, 'standard', 50]);
    // The rest of a boot read, v1 and v2 together.
    loadSettings(store);
    loadUnlocked(store);
    loadAdventureScores(store);
    loadEndlessScores(store);
    expect(ensureSchema(store)).toBe(1);
    loadRunSeed(() => 999, store);
    expect(store.writes).toEqual([]);
    expect(Object.fromEntries(store.data)).toEqual(V1_PROFILE);
  });

  it('saving every v2 key leaves every v1 value exactly as it was', () => {
    const store = recording(V1_PROFILE);
    saveSpacePhysics('high', store);
    saveWeaponPickups(false, store);
    saveEffects('low', store);
    saveMusic(0, store);
    for (const [k, v] of Object.entries(V1_PROFILE)) expect(store.data.get(k), k).toBe(v);
    expect(store.data.size).toBe(Object.keys(V1_PROFILE).length + 4);
    expect(store.writes.sort()).toEqual([...V2_KEYS].sort());
  });

  it('v1 saves leave the v2 values alone, and a bad v2 value hurts nothing else', () => {
    const store = recording();
    saveSpacePhysics('low', store);
    saveWeaponPickups(false, store);
    saveEffects('high', store);
    saveMusic(20, store);
    saveSetting('neon', 10, store);
    saveSetting('volume', 90, store);
    saveGlowPath('fallback', store);
    unlockLevel(5, store);
    recordAdventureScore(3, 1200, 1, store);
    recordEndlessScore(5000, 9, store);
    expect([loadSpacePhysics(store), loadWeaponPickups(store), loadEffects(store), loadMusic(store)]).toEqual(['low', false, 'high', 20]);
    store.data.set(SPACE_PHYSICS_KEY, 'ludicrous');
    store.data.set(MUSIC_KEY, 'loud');
    expect([loadSpacePhysics(store), loadMusic(store)]).toEqual(['off', 50]);
    expect([loadWeaponPickups(store), loadEffects(store)]).toEqual([false, 'high']);
    expect(loadSettings(store).neon).toBe(10);
    expect(loadUnlocked(store)).toBe(5);
  });

  it('invalid, wrong case and null values fall back to the default of their own key', () => {
    const bad = ['', ' ', 'OFF', 'Medium', 'HIGH', 'true', '2', '1.5', '-1', 'null', '{}', 'undefined'];
    for (const raw of bad) {
      const store = recording({ [SPACE_PHYSICS_KEY]: raw, [WEAPON_PICKUPS_KEY]: raw, [EFFECTS_KEY]: raw, [MUSIC_KEY]: raw });
      expect(loadSpacePhysics(store), `space ${raw}`).toBe('off');
      expect(loadEffects(store), `effects ${raw}`).toBe('standard');
      // Weapon pickups accepts exactly '0' and '1' (neither is in the list above), so every one of these is the default, on.
      expect(loadWeaponPickups(store), `pickups ${raw}`).toBe(true);
    }
    expect(loadMusic(recording({ [MUSIC_KEY]: '-1' }))).toBe(0);
    expect(loadMusic(recording({ [MUSIC_KEY]: '250' }))).toBe(100);
    expect(loadMusic(recording({ [MUSIC_KEY]: '1.5' }))).toBe(50);
    expect(loadMusic(recording({ [MUSIC_KEY]: '' }))).toBe(50);
  });

  it('storage that throws, and no storage at all, give the defaults and never throw', () => {
    expect([loadSpacePhysics(throwing), loadWeaponPickups(throwing), loadEffects(throwing), loadMusic(throwing)]).toEqual(['off', true, 'standard', 50]);
    expect(() => {
      saveSpacePhysics('high', throwing);
      saveWeaponPickups(false, throwing);
      saveEffects('low', throwing);
      saveMusic(10, throwing);
    }).not.toThrow();
    expect([loadSpacePhysics(null), loadWeaponPickups(null), loadEffects(null), loadMusic(null)]).toEqual(['off', true, 'standard', 50]);
    expect(() => {
      saveSpacePhysics('high', null);
      saveWeaponPickups(false, null);
      saveEffects('low', null);
      saveMusic(10, null);
    }).not.toThrow();
  });

  it('Reset progress touches only the two progress keys and leaves every setting, v2 included', () => {
    const store = recording(V1_PROFILE);
    saveSpacePhysics('medium', store);
    saveWeaponPickups(false, store);
    saveEffects('high', store);
    saveMusic(35, store);
    store.writes.length = 0;
    resetProgress(store);
    expect([...store.writes].sort()).toEqual(['sow.progress.unlocked', 'sow.scores.adventure']);
    expect([loadSpacePhysics(store), loadWeaponPickups(store), loadEffects(store), loadMusic(store)]).toEqual(['medium', false, 'high', 35]);
    expect(store.data.get('sow.settings.neon')).toBe('33');
  });
});

describe('key literals in src/', () => {
  const files = readdirSync(SRC_DIR, { recursive: true, withFileTypes: false })
    .map((p) => String(p))
    .filter((p) => p.endsWith('.ts'))
    .map((p) => join(SRC_DIR, p));
  const repoPath = (abs: string): string => relative(join(SRC_DIR, '..'), abs).split('\\').join('/');

  it('no file but core/settings.ts spells a sow.settings, sow.progress, sow.scores or sow.schema key', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (repoPath(f) === SETTINGS_FILE) continue;
      const code = stripComments(readFileSync(f, 'utf8'));
      if (/(['"`])sow\.(settings|progress|scores|schema)/.test(code)) offenders.push(repoPath(f));
    }
    expect(offenders).toEqual([]);
  });

  it('core/settings.ts builds each v2 key from the exported prefix, once', () => {
    const code = stripComments(readFileSync(join(SRC_DIR, 'core/settings.ts'), 'utf8'));
    for (const name of ['spacePhysics', 'weaponPickups', 'effects', 'music']) {
      const hits = code.split(`\${SETTINGS_PREFIX}${name}\``).length - 1;
      expect(hits, name).toBe(1);
    }
  });

  it('every v2 key is read through its load function by main.ts or the settings screen, so the stored choice reaches the game at boot', () => {
    const main = stripComments(readFileSync(join(SRC_DIR, 'main.ts'), 'utf8'));
    for (const fn of ['loadSpacePhysics', 'loadWeaponPickups', 'loadEffects', 'loadMusic']) {
      expect(main.includes(fn) || readFileSync(join(SRC_DIR, 'ui/settings.ts'), 'utf8').includes(fn), fn).toBe(true);
    }
  });
});
