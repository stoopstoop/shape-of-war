import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DEFAULT_WEAPON_PICKUPS,
  encodeWeaponPickups,
  loadSettings,
  loadWeaponPickups,
  parseWeaponPickups,
  resetProgress,
  saveSetting,
  saveWeaponPickups,
  WEAPON_PICKUPS_KEY,
  type StorageLike,
} from '../../src/core/settings';

function memory(init: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  saveWeaponPickups(true); // the in memory fallback is module state, leave it clean
});

describe('weapon pickups key and default', () => {
  it('uses the documented key and defaults to on', () => {
    expect(WEAPON_PICKUPS_KEY).toBe('sow.settings.weaponPickups');
    expect(DEFAULT_WEAPON_PICKUPS).toBe(true);
    expect(loadWeaponPickups(memory())).toBe(true);
    expect(loadWeaponPickups(null)).toBe(true);
  });

  it('defaults in node where localStorage does not exist', () => {
    expect(loadWeaponPickups()).toBe(true);
    expect(() => saveWeaponPickups(false)).not.toThrow();
  });
});

describe('parseWeaponPickups', () => {
  it('accepts exactly 0 and 1', () => {
    expect(parseWeaponPickups('1')).toBe(true);
    expect(parseWeaponPickups('0')).toBe(false);
  });

  it('null and anything else give the default, on', () => {
    expect(parseWeaponPickups(null)).toBe(true);
    const bad = ['', ' ', '2', '-1', '01', '00', '0 ', ' 1', '1\n', '0.0', 'true', 'false', 'on', 'off', 'yes', 'no', 'null', 'undefined'];
    for (const b of bad) expect(parseWeaponPickups(b), JSON.stringify(b)).toBe(true);
  });

  it('encodes true as 1 and false as 0', () => {
    expect(encodeWeaponPickups(true)).toBe('1');
    expect(encodeWeaponPickups(false)).toBe('0');
  });
});

describe('weapon pickups persistence', () => {
  it('round trips both values through the key', () => {
    for (const on of [true, false]) {
      const s = memory();
      saveWeaponPickups(on, s);
      expect(s.data.get('sow.settings.weaponPickups')).toBe(on ? '1' : '0');
      expect(loadWeaponPickups(s)).toBe(on);
    }
  });

  it('last write wins', () => {
    const s = memory();
    saveWeaponPickups(false, s);
    saveWeaponPickups(true, s);
    saveWeaponPickups(false, s);
    expect(loadWeaponPickups(s)).toBe(false);
  });

  it('an invalid stored value loads as on, and the next save repairs it', () => {
    for (const bad of ['', 'true', 'false', 'off', '2', 'null', '0,1', ' 0']) {
      expect(loadWeaponPickups(memory({ [WEAPON_PICKUPS_KEY]: bad })), JSON.stringify(bad)).toBe(true);
    }
    const s = memory({ [WEAPON_PICKUPS_KEY]: 'garbage' });
    saveWeaponPickups(false, s);
    expect(s.data.get(WEAPON_PICKUPS_KEY)).toBe('0');
    expect(loadWeaponPickups(s)).toBe(false);
  });

  it('does not touch the other settings keys, and they do not touch it', () => {
    const s = memory();
    saveWeaponPickups(false, s);
    saveSetting('neon', 33, s);
    saveSetting('showFps', true, s);
    expect(loadWeaponPickups(s)).toBe(false);
    expect(loadSettings(s)).toEqual({ neon: 33, volume: 70, showFps: true });
    expect(Object.keys(DEFAULT_SETTINGS)).not.toContain('weaponPickups');
  });

  it('reset progress leaves the setting alone', () => {
    const s = memory();
    saveWeaponPickups(false, s);
    resetProgress(s);
    expect(loadWeaponPickups(s)).toBe(false);
    expect(s.data.get(WEAPON_PICKUPS_KEY)).toBe('0');
  });
});

describe('weapon pickups with storage that throws', () => {
  it('load falls back to on and save does not throw', () => {
    expect(loadWeaponPickups(throwing)).toBe(true);
    expect(() => saveWeaponPickups(false, throwing)).not.toThrow();
  });

  it('only the read throwing, or only the write throwing, is survived', () => {
    const readBroken: StorageLike = { getItem: throwing.getItem, setItem: () => undefined };
    const writeBroken: StorageLike = { getItem: () => '0', setItem: throwing.setItem };
    expect(loadWeaponPickups(readBroken)).toBe(true);
    expect(() => saveWeaponPickups(false, readBroken)).not.toThrow();
    expect(loadWeaponPickups(writeBroken)).toBe(false);
    expect(() => saveWeaponPickups(true, writeBroken)).not.toThrow();
  });

  it('a localStorage global that throws falls back to the in memory copy for the session', () => {
    vi.stubGlobal('localStorage', throwing);
    expect(loadWeaponPickups()).toBe(true);
    saveWeaponPickups(false);
    expect(loadWeaponPickups()).toBe(false);
  });

  it('a working localStorage global is used by default', () => {
    const real = memory();
    vi.stubGlobal('localStorage', real);
    saveWeaponPickups(false);
    expect(real.data.get(WEAPON_PICKUPS_KEY)).toBe('0');
    expect(loadWeaponPickups()).toBe(false);
  });
});
