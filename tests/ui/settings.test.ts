import { describe, expect, it } from 'vitest';
import { GLOW_PATH_KEY, loadGlowPath, loadSettings, parseGlowPath, type StorageLike } from '../../src/core/settings';
import { createSettingsModel, fpsLabel, glowLabel, type SettingsEffects } from '../../src/ui/settings';

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

function fakeFx(): SettingsEffects & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    setShowFps: (on) => calls.push(`fps:${on}`),
    setGlowPath: (p) => calls.push(`glow:${p}`),
  };
}

describe('settings screen model', () => {
  it('defaults to fps off and bloom, and applies them at boot', () => {
    const fx = fakeFx();
    const m = createSettingsModel(fx, memory());
    expect(m.state).toEqual({ showFps: false, glowPath: 'bloom' });
    m.applyBoot();
    expect(fx.calls).toEqual(['fps:false', 'glow:bloom']);
  });

  it('showFps round trips through sow.settings.showFps and calls setShowFps', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.toggleShowFps();
    expect(fx.calls).toEqual(['fps:true']);
    expect(store.data.get('sow.settings.showFps')).toBe('1');
    expect(loadSettings(store).showFps).toBe(true);
    const again = createSettingsModel(fakeFx(), store);
    expect(again.state.showFps).toBe(true);
    again.setShowFps(false);
    expect(createSettingsModel(fakeFx(), store).state.showFps).toBe(false);
  });

  it('glowPath round trips through sow.settings.glowPath and calls setGlowPath', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.toggleGlowPath();
    expect(fx.calls).toEqual(['glow:fallback']);
    expect(store.data.get(GLOW_PATH_KEY)).toBe('fallback');
    const reboot = fakeFx();
    const again = createSettingsModel(reboot, store);
    expect(again.state.glowPath).toBe('fallback');
    again.applyBoot();
    expect(reboot.calls).toContain('glow:fallback');
    again.toggleGlowPath();
    expect(loadGlowPath(store)).toBe('bloom');
  });

  it('invalid stored glowPath falls back to bloom', () => {
    for (const bad of ['', 'Bloom', 'sprite', '1', '{}']) {
      expect(createSettingsModel(fakeFx(), memory({ [GLOW_PATH_KEY]: bad })).state.glowPath).toBe('bloom');
    }
    expect(parseGlowPath(null)).toBe('bloom');
  });

  it('syncGlowPath persists a debug panel change without calling the renderer', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.syncGlowPath('fallback');
    expect(fx.calls).toEqual([]);
    expect(loadGlowPath(store)).toBe('fallback');
  });

  it('survives a storage that throws', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const m = createSettingsModel(fakeFx(), throwing);
    expect(m.state).toEqual({ showFps: false, glowPath: 'bloom' });
    expect(() => m.toggleGlowPath()).not.toThrow();
    expect(m.state.glowPath).toBe('fallback');
  });

  it('labels', () => {
    expect(fpsLabel(true)).toBe('Show FPS: On');
    expect(glowLabel('fallback')).toBe('Glow: Fallback');
  });
});
