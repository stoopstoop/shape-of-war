import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSetting, type StorageLike } from '../../src/core/settings';

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

describe('settings', () => {
  it('defaults when nothing is stored', () => {
    expect(loadSettings(memory())).toEqual({ neon: 70, volume: 70, showFps: false });
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('defaults in node where localStorage does not exist', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSetting('neon', 50)).not.toThrow();
  });

  it('clamps out of range and ignores garbage per key', () => {
    const s = memory({
      'sow.settings.neon': '250',
      'sow.settings.volume': 'loud',
      'sow.settings.showFps': '-3',
    });
    expect(loadSettings(s)).toEqual({ neon: 100, volume: 70, showFps: false });
    expect(loadSettings(memory({ 'sow.settings.neon': '-20' })).neon).toBe(0);
  });

  it('round trips every key', () => {
    const s = memory();
    saveSetting('neon', 33, s);
    saveSetting('volume', 0, s);
    saveSetting('showFps', true, s);
    expect(s.data.get('sow.settings.neon')).toBe('33');
    expect(s.data.get('sow.settings.showFps')).toBe('1');
    expect(loadSettings(s)).toEqual({ neon: 33, volume: 0, showFps: true });
  });

  it('clamps and rounds on save', () => {
    const s = memory();
    saveSetting('neon', 140.6, s);
    saveSetting('volume', 42.4, s);
    expect(loadSettings(s)).toEqual({ neon: 100, volume: 42, showFps: false });
  });

  it('survives a localStorage that throws', () => {
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSetting('neon', 10, throwing)).not.toThrow();
  });
});
