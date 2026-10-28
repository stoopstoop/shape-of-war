import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clampMusic,
  DEFAULT_EFFECTS,
  DEFAULT_MUSIC,
  DEFAULT_SETTINGS,
  EFFECTS_KEY,
  EFFECTS_TIER_SETTINGS,
  encodeMusic,
  loadEffects,
  loadMusic,
  loadSettings,
  MUSIC_KEY,
  parseEffects,
  parseMusic,
  resetProgress,
  saveEffects,
  saveMusic,
  saveSetting,
  type EffectsTierSetting,
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
  saveEffects('standard'); // the in memory fallback is module state, leave it clean
  saveMusic(DEFAULT_MUSIC);
});

describe('effects key and default', () => {
  it('uses the documented key and defaults to standard', () => {
    expect(EFFECTS_KEY).toBe('sow.settings.effects');
    expect(DEFAULT_EFFECTS).toBe('standard');
    expect(loadEffects(memory())).toBe('standard');
    expect(loadEffects(null)).toBe('standard');
  });

  it('lists the three tiers in button order', () => {
    expect(EFFECTS_TIER_SETTINGS).toEqual(['low', 'standard', 'high']);
  });

  it('defaults in node where localStorage does not exist', () => {
    expect(loadEffects()).toBe('standard');
    expect(() => saveEffects('high')).not.toThrow();
  });
});

describe('parseEffects', () => {
  it('accepts exactly the three values', () => {
    for (const tier of EFFECTS_TIER_SETTINGS) expect(parseEffects(tier)).toBe(tier);
  });

  it('null and anything else give standard', () => {
    expect(parseEffects(null)).toBe('standard');
    const bad = ['', ' ', 'Low', 'STANDARD', 'High ', ' low', 'high\n', 'medium', 'off', 'on', 'true', '0', '1', '2', 'null', 'undefined', '[]'];
    for (const b of bad) expect(parseEffects(b), JSON.stringify(b)).toBe('standard');
  });
});

describe('effects persistence', () => {
  it('round trips every tier through the key', () => {
    for (const tier of EFFECTS_TIER_SETTINGS) {
      const s = memory();
      saveEffects(tier, s);
      expect(s.data.get('sow.settings.effects')).toBe(tier);
      expect(loadEffects(s)).toBe(tier);
    }
  });

  it('last write wins', () => {
    const s = memory();
    saveEffects('low', s);
    saveEffects('high', s);
    saveEffects('standard', s);
    saveEffects('low', s);
    expect(loadEffects(s)).toBe('low');
  });

  it('an invalid stored value loads as standard, and the next save repairs it', () => {
    for (const bad of ['', 'Low', 'ultra', '2', 'null', 'low,high']) {
      expect(loadEffects(memory({ [EFFECTS_KEY]: bad })), JSON.stringify(bad)).toBe('standard');
    }
    const s = memory({ [EFFECTS_KEY]: 'garbage' });
    saveEffects('high', s);
    expect(s.data.get(EFFECTS_KEY)).toBe('high');
    expect(loadEffects(s)).toBe('high');
  });

  it('an invalid value passed to save is stored as standard, so the stored text always parses back', () => {
    const s = memory();
    const bogus: string = 'ultra'; // a wider type than the union, as a caller with unchecked data would hold
    saveEffects(bogus as EffectsTierSetting, s);
    expect(s.data.get(EFFECTS_KEY)).toBe('standard');
  });

  it('does not touch the other settings keys, and they do not touch it', () => {
    const s = memory();
    saveEffects('low', s);
    saveSetting('neon', 33, s);
    saveSetting('showFps', true, s);
    expect(loadEffects(s)).toBe('low');
    expect(loadSettings(s)).toEqual({ neon: 33, volume: 70, showFps: true });
    expect(Object.keys(DEFAULT_SETTINGS)).not.toContain('effects');
  });

  it('reset progress leaves the setting alone', () => {
    const s = memory();
    saveEffects('high', s);
    resetProgress(s);
    expect(loadEffects(s)).toBe('high');
    expect(s.data.get(EFFECTS_KEY)).toBe('high');
  });
});

describe('effects with storage that throws', () => {
  it('load falls back to standard and save does not throw', () => {
    expect(loadEffects(throwing)).toBe('standard');
    expect(() => saveEffects('high', throwing)).not.toThrow();
  });

  it('only the read throwing, or only the write throwing, is survived', () => {
    const readBroken: StorageLike = { getItem: throwing.getItem, setItem: () => undefined };
    const writeBroken: StorageLike = { getItem: () => 'low', setItem: throwing.setItem };
    expect(loadEffects(readBroken)).toBe('standard');
    expect(() => saveEffects('high', readBroken)).not.toThrow();
    expect(loadEffects(writeBroken)).toBe('low');
    expect(() => saveEffects('high', writeBroken)).not.toThrow();
  });

  it('a localStorage global that throws falls back to the in memory copy for the session', () => {
    vi.stubGlobal('localStorage', throwing);
    expect(loadEffects()).toBe('standard');
    saveEffects('high');
    expect(loadEffects()).toBe('high');
  });

  it('a working localStorage global is used by default', () => {
    const real = memory();
    vi.stubGlobal('localStorage', real);
    saveEffects('low');
    expect(real.data.get(EFFECTS_KEY)).toBe('low');
    expect(loadEffects()).toBe('low');
  });
});

describe('music key and default', () => {
  it('uses the documented key and defaults to 50', () => {
    expect(MUSIC_KEY).toBe('sow.settings.music');
    expect(DEFAULT_MUSIC).toBe(50);
    expect(loadMusic(memory())).toBe(50);
    expect(loadMusic(null)).toBe(50);
  });

  it('defaults in node where localStorage does not exist', () => {
    expect(loadMusic()).toBe(50);
    expect(() => saveMusic(10)).not.toThrow();
  });
});

describe('music clamps 0 to 100', () => {
  it('rounds to an integer and clamps both ends', () => {
    expect(clampMusic(0)).toBe(0);
    expect(clampMusic(100)).toBe(100);
    expect(clampMusic(-1)).toBe(0);
    expect(clampMusic(-1000)).toBe(0);
    expect(clampMusic(101)).toBe(100);
    expect(clampMusic(1e9)).toBe(100);
    expect(clampMusic(33.4)).toBe(33);
    expect(clampMusic(33.5)).toBe(34);
    expect(Object.is(clampMusic(-0), 0)).toBe(true);
  });

  it('a value that is not a finite number gives the default, never NaN', () => {
    expect(clampMusic(Number.NaN)).toBe(50);
    expect(clampMusic(Number.POSITIVE_INFINITY)).toBe(50);
    expect(clampMusic(Number.NEGATIVE_INFINITY)).toBe(50);
  });

  it('save writes the clamped integer text', () => {
    const cases: readonly [number, string][] = [
      [0, '0'],
      [100, '100'],
      [-5, '0'],
      [140, '100'],
      [49.6, '50'],
      [0.4, '0'],
      [Number.NaN, '50'],
    ];
    for (const [v, text] of cases) {
      const s = memory();
      saveMusic(v, s);
      expect(s.data.get(MUSIC_KEY), String(v)).toBe(text);
      expect(encodeMusic(v)).toBe(text);
    }
  });

  it('a stored whole number outside 0..100 loads clamped', () => {
    expect(loadMusic(memory({ [MUSIC_KEY]: '101' }))).toBe(100);
    expect(loadMusic(memory({ [MUSIC_KEY]: '99999999999' }))).toBe(100);
    expect(loadMusic(memory({ [MUSIC_KEY]: '-1' }))).toBe(0);
    expect(loadMusic(memory({ [MUSIC_KEY]: '-0' }))).toBe(0);
    expect(loadMusic(memory({ [MUSIC_KEY]: '007' }))).toBe(7);
  });
});

describe('parseMusic', () => {
  it('accepts whole decimal text, 0 and 100 included', () => {
    for (let v = 0; v <= 100; v++) expect(parseMusic(String(v))).toBe(v);
  });

  it('null and any text that is not a whole number give the default 50', () => {
    expect(parseMusic(null)).toBe(50);
    const bad = ['', ' ', 'loud', 'off', 'NaN', 'Infinity', '80%', '7.5', '7.0', ' 80', '80 ', '80\n', '1e2', '0x10', '--1', '+5', '5,5', '1_0', 'null', '[]'];
    for (const b of bad) expect(parseMusic(b), JSON.stringify(b)).toBe(50);
  });

  it('an absurdly long digit string is not trusted as a number', () => {
    expect(parseMusic('9'.repeat(40))).toBe(50);
  });
});

describe('music persistence', () => {
  it('round trips 0, a middle value and 100 through the key', () => {
    for (const v of [0, 1, 50, 73, 99, 100]) {
      const s = memory();
      saveMusic(v, s);
      expect(s.data.get('sow.settings.music')).toBe(String(v));
      expect(loadMusic(s)).toBe(v);
    }
  });

  it('0 loads back as 0 and not as the default', () => {
    const s = memory();
    saveMusic(0, s);
    expect(loadMusic(s)).toBe(0);
  });

  it('last write wins', () => {
    const s = memory();
    saveMusic(10, s);
    saveMusic(90, s);
    saveMusic(0, s);
    saveMusic(35, s);
    expect(loadMusic(s)).toBe(35);
  });

  it('an invalid stored value loads as 50, and the next save repairs it', () => {
    const s = memory({ [MUSIC_KEY]: 'garbage' });
    expect(loadMusic(s)).toBe(50);
    saveMusic(20, s);
    expect(s.data.get(MUSIC_KEY)).toBe('20');
    expect(loadMusic(s)).toBe(20);
  });

  it('does not touch the other settings keys, and they do not touch it', () => {
    const s = memory();
    saveMusic(12, s);
    saveSetting('volume', 40, s);
    saveSetting('neon', 90, s);
    expect(loadMusic(s)).toBe(12);
    expect(loadSettings(s)).toEqual({ neon: 90, volume: 40, showFps: false });
    expect(Object.keys(DEFAULT_SETTINGS)).not.toContain('music');
  });

  it('reset progress leaves the setting alone', () => {
    const s = memory();
    saveMusic(0, s);
    resetProgress(s);
    expect(loadMusic(s)).toBe(0);
    expect(s.data.get(MUSIC_KEY)).toBe('0');
  });
});

describe('music with storage that throws', () => {
  it('load falls back to 50 and save does not throw', () => {
    expect(loadMusic(throwing)).toBe(50);
    expect(() => saveMusic(10, throwing)).not.toThrow();
  });

  it('only the read throwing, or only the write throwing, is survived', () => {
    const readBroken: StorageLike = { getItem: throwing.getItem, setItem: () => undefined };
    const writeBroken: StorageLike = { getItem: () => '20', setItem: throwing.setItem };
    expect(loadMusic(readBroken)).toBe(50);
    expect(() => saveMusic(10, readBroken)).not.toThrow();
    expect(loadMusic(writeBroken)).toBe(20);
    expect(() => saveMusic(10, writeBroken)).not.toThrow();
  });

  it('a localStorage global that throws falls back to the in memory copy for the session', () => {
    vi.stubGlobal('localStorage', throwing);
    expect(loadMusic()).toBe(50);
    saveMusic(0);
    expect(loadMusic()).toBe(0);
  });

  it('a working localStorage global is used by default', () => {
    const real = memory();
    vi.stubGlobal('localStorage', real);
    saveMusic(64);
    expect(real.data.get(MUSIC_KEY)).toBe('64');
    expect(loadMusic()).toBe(64);
  });
});

describe('the two keys together', () => {
  it('are independent, both under the sow.settings. prefix, and distinct', () => {
    expect(EFFECTS_KEY.startsWith('sow.settings.')).toBe(true);
    expect(MUSIC_KEY.startsWith('sow.settings.')).toBe(true);
    expect(EFFECTS_KEY).not.toBe(MUSIC_KEY);
    const s = memory();
    saveEffects('high', s);
    saveMusic(5, s);
    s.data.set(EFFECTS_KEY, 'garbage');
    expect(loadEffects(s)).toBe('standard');
    expect(loadMusic(s)).toBe(5);
  });
});
