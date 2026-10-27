import { describe, expect, it } from 'vitest';
import { GLOW_PATH_KEY, loadGlowPath, loadSettings, parseGlowPath, type StorageLike } from '../../src/core/settings';
import {
  confirmTap,
  createSettingsModel,
  fpsLabel,
  glowLabel,
  registerTap,
  seedHashLine,
  STRESS_LABEL,
  type SettingsEffects,
} from '../../src/ui/settings';

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

function fakeFx(): SettingsEffects & { calls: string[]; neon: number[]; frames: (() => void)[]; tick(): void } {
  const calls: string[] = [];
  const neon: number[] = [];
  const frames: (() => void)[] = [];
  return {
    calls,
    neon,
    frames,
    tick() {
      const run = frames.splice(0);
      for (const f of run) f();
    },
    setShowFps: (on) => calls.push(`fps:${on}`),
    setGlowPath: (p) => calls.push(`glow:${p}`),
    applyNeon: (n) => neon.push(n),
    setVolume: (v) => calls.push(`vol:${v}`),
    requestFrame: (cb) => frames.push(cb),
  };
}

describe('settings screen model', () => {
  it('defaults to neon 70, volume 70, fps off and bloom, and applies them at boot', () => {
    const fx = fakeFx();
    const m = createSettingsModel(fx, memory());
    expect(m.state).toEqual({ neon: 70, volume: 70, showFps: false, glowPath: 'bloom' });
    m.applyBoot();
    expect(fx.neon).toEqual([70]);
    expect(fx.calls).toEqual(['vol:70', 'fps:false', 'glow:bloom']);
  });

  it('neon drag applies at most once per frame, latest value wins, nothing saved until commit', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.neonInput(10);
    m.neonInput(20);
    m.neonInput(35);
    expect(fx.neon).toEqual([]);
    expect(fx.frames.length).toBe(1);
    fx.tick();
    expect(fx.neon).toEqual([35]);
    expect(store.data.has('sow.settings.neon')).toBe(false);
    m.neonInput(50);
    m.neonInput(55);
    fx.tick();
    expect(fx.neon).toEqual([35, 55]);
    fx.tick();
    expect(fx.neon).toEqual([35, 55]);
  });

  it('neon commit applies immediately and round trips through sow.settings.neon', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.neonInput(12);
    m.neonCommit(5);
    expect(fx.neon).toEqual([5]);
    expect(store.data.get('sow.settings.neon')).toBe('5');
    fx.tick(); // the outstanding frame finds nothing queued
    expect(fx.neon).toEqual([5]);
    expect(loadSettings(store).neon).toBe(5);
    expect(createSettingsModel(fakeFx(), store).state.neon).toBe(5);
    m.neonCommit(140);
    expect(loadSettings(store).neon).toBe(100);
  });

  it('volume round trips through sow.settings.volume and calls setVolume while dragging', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.volumeInput(30);
    expect(fx.calls).toEqual(['vol:30']);
    expect(store.data.has('sow.settings.volume')).toBe(false);
    m.volumeCommit(25);
    expect(store.data.get('sow.settings.volume')).toBe('25');
    expect(createSettingsModel(fakeFx(), store).state.volume).toBe(25);
  });

  it('syncNeon records a value applied elsewhere without applying it', () => {
    const fx = fakeFx();
    const m = createSettingsModel(fx, memory());
    m.syncNeon(42);
    expect(m.state.neon).toBe(42);
    expect(fx.neon).toEqual([]);
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
    expect(m.state).toEqual({ neon: 70, volume: 70, showFps: false, glowPath: 'bloom' });
    expect(() => m.neonCommit(30)).not.toThrow();
    expect(() => m.toggleGlowPath()).not.toThrow();
    expect(m.state.glowPath).toBe('fallback');
  });

  it('labels', () => {
    expect(fpsLabel(true)).toBe('Show FPS: On');
    expect(glowLabel('fallback')).toBe('Glow: Fallback');
  });
});

describe('debug menu and confirm taps', () => {
  it('five taps inside 3 s fire, then the count restarts', () => {
    let taps: number[] = [];
    const fired: boolean[] = [];
    for (const t of [0, 300, 600, 900, 1200, 1500]) {
      const r = registerTap(taps, t);
      taps = r.taps;
      fired.push(r.fire);
    }
    expect(fired).toEqual([false, false, false, false, true, false]);
  });

  it('slow taps never fire', () => {
    let taps: number[] = [];
    let any = false;
    for (let i = 0; i < 10; i++) {
      const r = registerTap(taps, i * 1000);
      taps = r.taps;
      any = any || r.fire;
    }
    expect(any).toBe(false);
  });

  it('reset progress needs a second tap within the window', () => {
    const a = confirmTap(null, 1000);
    expect(a).toEqual({ armedAt: 1000, fire: false });
    expect(confirmTap(a.armedAt, 2000).fire).toBe(true);
    expect(confirmTap(a.armedAt, 5000)).toEqual({ armedAt: 5000, fire: false });
  });

  it('stress label matches the runbook', () => {
    expect(STRESS_LABEL).toBe('Stress: 400 entities, 2000 particles');
  });
});

describe('play seed line', () => {
  const hashOf = (s: number): string => `H${s}`;
  it('shows the level 1 hash for a valid seed', () => {
    expect(seedHashLine(' 42 ', hashOf)).toBe('Seed 42  Level 1 #H42');
    expect(seedHashLine('4294967295', hashOf)).toBe('Seed 4294967295  Level 1 #H4294967295');
  });
  it('rejects bad input and handles no generator', () => {
    expect(seedHashLine('4294967296', hashOf)).toBe('Not a valid seed');
    expect(seedHashLine('-1', hashOf)).toBe('Not a valid seed');
    expect(seedHashLine('abc', hashOf)).toBe('Not a valid seed');
    expect(seedHashLine('', hashOf)).toMatch(/^Type a run seed/);
    expect(seedHashLine('7', () => null)).toBe('Seed 7');
  });
});
