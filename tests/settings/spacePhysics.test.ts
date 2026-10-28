import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DEFAULT_SPACE_PHYSICS,
  loadSettings,
  loadSpacePhysics,
  parseSpacePhysics,
  resetProgress,
  saveSetting,
  saveSpacePhysics,
  SPACE_LEVELS,
  SPACE_PHYSICS_KEY,
  type SpaceLevelSetting,
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
  saveSpacePhysics('off'); // the in memory fallback is module state, leave it clean
});

describe('space physics key and default', () => {
  it('uses the documented key and defaults to off', () => {
    expect(SPACE_PHYSICS_KEY).toBe('sow.settings.spacePhysics');
    expect(DEFAULT_SPACE_PHYSICS).toBe('off');
    expect(loadSpacePhysics(memory())).toBe('off');
    expect(loadSpacePhysics(null)).toBe('off');
  });

  it('lists the four levels in button order', () => {
    expect(SPACE_LEVELS).toEqual(['off', 'low', 'medium', 'high']);
  });

  it('defaults in node where localStorage does not exist', () => {
    expect(loadSpacePhysics()).toBe('off');
    expect(() => saveSpacePhysics('low')).not.toThrow();
  });
});

describe('parseSpacePhysics', () => {
  it('accepts exactly the four values', () => {
    for (const level of SPACE_LEVELS) expect(parseSpacePhysics(level)).toBe(level);
  });

  it('null and anything else give off', () => {
    expect(parseSpacePhysics(null)).toBe('off');
    const bad = ['', ' ', 'Low', 'MEDIUM', 'High ', ' low', 'medium\n', 'on', 'true', '1', '0', '2', 'none', 'undefined', 'null', '[]'];
    for (const b of bad) expect(parseSpacePhysics(b), JSON.stringify(b)).toBe('off');
  });
});

describe('space physics persistence', () => {
  it('round trips every level through the key', () => {
    for (const level of SPACE_LEVELS) {
      const s = memory();
      saveSpacePhysics(level, s);
      expect(s.data.get('sow.settings.spacePhysics')).toBe(level);
      expect(loadSpacePhysics(s)).toBe(level);
    }
  });

  it('last write wins', () => {
    const s = memory();
    saveSpacePhysics('high', s);
    saveSpacePhysics('low', s);
    expect(loadSpacePhysics(s)).toBe('low');
  });

  it('an invalid or null stored value loads as off', () => {
    for (const bad of ['', 'Low', 'fast', '3', 'null', 'high,low']) {
      expect(loadSpacePhysics(memory({ [SPACE_PHYSICS_KEY]: bad })), JSON.stringify(bad)).toBe('off');
    }
    expect(loadSpacePhysics(memory())).toBe('off');
  });

  it('save sanitises a bad value instead of storing it', () => {
    const s = memory();
    saveSpacePhysics('turbo' as SpaceLevelSetting, s);
    expect(s.data.get(SPACE_PHYSICS_KEY)).toBe('off');
  });

  it('does not touch the other settings keys, and they do not touch it', () => {
    const s = memory();
    saveSpacePhysics('medium', s);
    saveSetting('neon', 33, s);
    saveSetting('showFps', true, s);
    expect(loadSpacePhysics(s)).toBe('medium');
    expect(loadSettings(s)).toEqual({ neon: 33, volume: 70, showFps: true });
    expect(Object.keys(DEFAULT_SETTINGS)).not.toContain('spacePhysics');
  });

  it('reset progress leaves the setting alone', () => {
    const s = memory();
    saveSpacePhysics('high', s);
    resetProgress(s);
    expect(loadSpacePhysics(s)).toBe('high');
    expect(s.data.get(SPACE_PHYSICS_KEY)).toBe('high');
  });
});

describe('space physics with storage that throws', () => {
  it('load falls back to off and save does not throw', () => {
    expect(loadSpacePhysics(throwing)).toBe('off');
    expect(() => saveSpacePhysics('high', throwing)).not.toThrow();
  });

  it('only the read throwing, or only the write throwing, is survived', () => {
    const readBroken: StorageLike = { getItem: throwing.getItem, setItem: () => undefined };
    const writeBroken: StorageLike = { getItem: () => 'high', setItem: throwing.setItem };
    expect(loadSpacePhysics(readBroken)).toBe('off');
    expect(() => saveSpacePhysics('low', readBroken)).not.toThrow();
    expect(loadSpacePhysics(writeBroken)).toBe('high');
    expect(() => saveSpacePhysics('low', writeBroken)).not.toThrow();
  });

  it('a localStorage global that throws falls back to the in memory copy for the session', () => {
    vi.stubGlobal('localStorage', throwing);
    expect(loadSpacePhysics()).toBe('off');
    saveSpacePhysics('medium');
    expect(loadSpacePhysics()).toBe('medium');
  });

  it('a working localStorage global is used by default', () => {
    const real = memory();
    vi.stubGlobal('localStorage', real);
    saveSpacePhysics('low');
    expect(real.data.get(SPACE_PHYSICS_KEY)).toBe('low');
    expect(loadSpacePhysics()).toBe('low');
  });
});
