import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EFFECTS_KEY,
  EFFECTS_TIER_SETTINGS,
  GLOW_PATH_KEY,
  loadEffects,
  loadGlowPath,
  loadMusic,
  loadSettings,
  loadSpacePhysics,
  loadWeaponPickups,
  MUSIC_KEY,
  parseGlowPath,
  resetProgress,
  SPACE_LEVELS,
  SPACE_PHYSICS_KEY,
  WEAPON_PICKUPS_KEY,
  type EffectsTierSetting,
  type StorageLike,
} from '../../src/core/settings';
import { MIN_HIT_PX, UI_CSS } from '../../src/ui/dom';
import { initialFlow, reduceFlow, type FlowAction, type FlowState } from '../../src/ui/flow';
import { createMenuScreen } from '../../src/ui/menu';
import { createPauseScreen } from '../../src/ui/pause';
import {
  confirmTap,
  createSettingsModel,
  createSettingsScreen,
  EFFECTS_ROW_LABEL,
  effectsButtonStates,
  effectsLabel,
  fpsLabel,
  glowLabel,
  MUSIC_SLIDER_LABEL,
  registerTap,
  seedHashLine,
  SPACE_ROW_LABEL,
  spaceButtonStates,
  spaceLabel,
  STRESS_LABEL,
  WEAPON_ROW_LABEL,
  weaponButtonStates,
  weaponPickupsLabel,
  type SettingsActions,
  type SettingsEffects,
} from '../../src/ui/settings';
import { asParent, buttonsLabelled, groupButtons, installFakeDocument, sliderNamed } from './fakeDom';

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
    setSpacePhysics: (level) => calls.push(`space:${level}`),
    setWeaponPickups: (on) => calls.push(`pickups:${on}`),
    setEffectsTier: (tier) => calls.push(`effects:${tier}`),
    setMusicVolume: (v) => calls.push(`music:${v}`),
    requestFrame: (cb) => frames.push(cb),
  };
}

describe('settings screen model', () => {
  it('defaults to neon 70, volume 70, fps off, bloom, space physics off and weapon pickups on, and applies them at boot', () => {
    const fx = fakeFx();
    const m = createSettingsModel(fx, memory());
    expect(m.state).toEqual({ neon: 70, volume: 70, showFps: false, glowPath: 'bloom', spacePhysics: 'off', weaponPickups: true, effects: 'standard', music: 50 });
    m.applyBoot();
    expect(fx.neon).toEqual([70]);
    expect(fx.calls).toEqual(['vol:70', 'fps:false', 'glow:bloom', 'space:off', 'pickups:true', 'effects:standard', 'music:50']);
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
    expect(m.state).toEqual({ neon: 70, volume: 70, showFps: false, glowPath: 'bloom', spacePhysics: 'off', weaponPickups: true, effects: 'standard', music: 50 });
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

// Space physics row (v2 wave A). The screen tests run on the small fake DOM in ./fakeDom.

describe('space physics: model', () => {
  it('starts at off when nothing is stored, and the boot push carries it', () => {
    const fx = fakeFx();
    const m = createSettingsModel(fx, memory());
    expect(m.state.spacePhysics).toBe('off');
    m.applyBoot();
    expect(fx.calls.filter((c) => c.startsWith('space:'))).toEqual(['space:off']);
  });

  it('a stored level is shown and pushed through the port at boot', () => {
    const fx = fakeFx();
    const m = createSettingsModel(fx, memory({ [SPACE_PHYSICS_KEY]: 'medium' }));
    expect(m.state.spacePhysics).toBe('medium');
    m.applyBoot();
    expect(fx.calls.filter((c) => c.startsWith('space:'))).toEqual(['space:medium']);
  });

  it('a tap saves the level and calls the effect exactly once', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.setSpacePhysics('high');
    expect(fx.calls).toEqual(['space:high']);
    expect(store.data.get(SPACE_PHYSICS_KEY)).toBe('high');
    expect(m.state.spacePhysics).toBe('high');
    expect(createSettingsModel(fakeFx(), store).state.spacePhysics).toBe('high');
  });

  it('tapping the level already chosen saves again but does not call the effect again', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.setSpacePhysics('low');
    store.data.delete(SPACE_PHYSICS_KEY); // pretend the first write was lost
    m.setSpacePhysics('low');
    expect(fx.calls).toEqual(['space:low']);
    expect(store.data.get(SPACE_PHYSICS_KEY)).toBe('low');
  });

  it('a run of taps reaches the effect in order and the last one survives a restart', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    for (const level of ['low', 'medium', 'high', 'off', 'medium'] as const) m.setSpacePhysics(level);
    expect(fx.calls).toEqual(['space:low', 'space:medium', 'space:high', 'space:off', 'space:medium']);
    expect(loadSpacePhysics(store)).toBe('medium');
  });

  it('an invalid stored value falls back to off', () => {
    for (const bad of ['', 'Medium', 'HIGH', '2', 'true', 'low ']) {
      const m = createSettingsModel(fakeFx(), memory({ [SPACE_PHYSICS_KEY]: bad }));
      expect(m.state.spacePhysics, JSON.stringify(bad)).toBe('off');
    }
  });

  it('a storage that throws still changes the state and still calls the effect', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const fx = fakeFx();
    const m = createSettingsModel(fx, broken);
    expect(m.state.spacePhysics).toBe('off');
    expect(() => m.setSpacePhysics('high')).not.toThrow();
    expect(m.state.spacePhysics).toBe('high');
    expect(fx.calls).toEqual(['space:high']);
  });

  it('does not move or write any other setting', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.setSpacePhysics('medium');
    expect(m.state).toEqual({ neon: 70, volume: 70, showFps: false, glowPath: 'bloom', spacePhysics: 'medium', weaponPickups: true, effects: 'standard', music: 50 });
    expect([...store.data.keys()]).toEqual([SPACE_PHYSICS_KEY]);
    expect(fx.neon).toEqual([]);
  });

  it('reset progress does not reset it', () => {
    const store = memory();
    createSettingsModel(fakeFx(), store).setSpacePhysics('high');
    resetProgress(store);
    expect(createSettingsModel(fakeFx(), store).state.spacePhysics).toBe('high');
  });
});

describe('space physics: row helpers', () => {
  it('labels are Off, Low, Medium and High under the row title Space physics', () => {
    expect(SPACE_LEVELS.map(spaceLabel)).toEqual(['Off', 'Low', 'Medium', 'High']);
    expect(SPACE_ROW_LABEL).toBe('Space physics');
  });

  it('exactly one button is selected, the current level, in button order', () => {
    for (const current of SPACE_LEVELS) {
      const states = spaceButtonStates(current);
      expect(states.map((s) => s.level)).toEqual([...SPACE_LEVELS]);
      expect(states.filter((s) => s.selected).map((s) => s.level)).toEqual([current]);
      expect(states.map((s) => s.label)).toEqual(['Off', 'Low', 'Medium', 'High']);
    }
  });
});

describe('space physics: touch target size', () => {
  const rule = (selector: string): string => {
    const escaped = selector.replace(/[.\\[\]()*+?^$|]/g, '\\$&');
    return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(UI_CSS)?.[1] ?? '';
  };

  it('the shared minimum hit height is 44 CSS px or more', () => {
    expect(MIN_HIT_PX).toBeGreaterThanOrEqual(44);
  });

  it('the Space physics buttons and every panel button carry a 44px min-height', () => {
    expect(rule('.sow-choice .sow-btn')).toContain('min-height: 44px');
    expect(rule('.sow-panel .sow-btn')).toContain('min-height: 44px');
  });

  it('the selected button has its own style', () => {
    expect(rule('.sow-btn.sow-on')).not.toBe('');
  });
});

describe('space physics: settings screen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const actions = (): SettingsActions => ({
    back: () => undefined,
    playSeed: () => undefined,
    seedHash: () => null,
    resetProgress: () => undefined,
    stress: () => undefined,
    currentNeon: () => 70,
    buildId: 'test',
  });

  function open(store = memory()) {
    const root = installFakeDocument();
    const fx = fakeFx();
    const model = createSettingsModel(fx, store);
    const screen = createSettingsScreen(asParent(root), model, actions());
    screen.show();
    return { root, fx, model, store, buttons: groupButtons(root, SPACE_ROW_LABEL) };
  }

  const lit = (buttons: readonly { classList: { contains(c: string): boolean } }[]): boolean[] =>
    buttons.map((b) => b.classList.contains('sow-on'));

  it('shows Off, Low, Medium, High in that order with Off highlighted by default', () => {
    const { buttons } = open();
    expect(buttons.map((b) => b.textContent)).toEqual(['Off', 'Low', 'Medium', 'High']);
    expect(lit(buttons)).toEqual([true, false, false, false]);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
  });

  it('highlights the stored level the first time the screen opens', () => {
    const { buttons } = open(memory({ [SPACE_PHYSICS_KEY]: 'high' }));
    expect(lit(buttons)).toEqual([false, false, false, true]);
  });

  it('a tap on Medium saves it, calls the effect once and moves the highlight', () => {
    const { buttons, fx, store, model } = open();
    buttons[2]?.tap();
    expect(fx.calls).toEqual(['space:medium']);
    expect(store.data.get(SPACE_PHYSICS_KEY)).toBe('medium');
    expect(model.state.spacePhysics).toBe('medium');
    expect(lit(buttons)).toEqual([false, false, true, false]);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'false']);
  });

  it('tapping each button in turn calls the effect once per change, in order', () => {
    const { buttons, fx } = open();
    for (const i of [1, 2, 3, 0]) {
      buttons[i]?.tap();
      expect(lit(buttons)).toEqual(buttons.map((_, j) => j === i)); // the highlight follows every tap
    }
    expect(fx.calls).toEqual(['space:low', 'space:medium', 'space:high', 'space:off']);
  });

  it('a release with no press, or a release by a different finger, does nothing', () => {
    const { buttons, fx, store } = open();
    buttons[3]?.fire('pointerup', 1);
    buttons[3]?.fire('pointerdown', 1);
    buttons[3]?.fire('pointerup', 2);
    expect(fx.calls).toEqual([]);
    expect(store.data.has(SPACE_PHYSICS_KEY)).toBe(false);
    expect(lit(buttons)).toEqual([true, false, false, false]);
  });

  it('the row has no duplicate buttons: one of each label inside the row', () => {
    const { buttons } = open();
    for (const label of ['Off', 'Low', 'Medium', 'High']) expect(buttons.filter((b) => b.textContent === label)).toHaveLength(1);
  });

  it('Medium is unique on the whole screen; Low and High repeat only in the Effects row', () => {
    const { root } = open();
    expect(buttonsLabelled(root, 'Medium')).toHaveLength(1);
    expect(buttonsLabelled(root, 'Low')).toHaveLength(2);
    expect(buttonsLabelled(root, 'High')).toHaveLength(2);
  });
});

describe('space physics: reachable from the menu and the pause screen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const actions = (): SettingsActions => ({
    back: () => undefined,
    playSeed: () => undefined,
    seedHash: () => null,
    resetProgress: () => undefined,
    stress: () => undefined,
    currentNeon: () => 70,
    buildId: 'test',
  });

  it('menu path: the Settings button opens the row, a tap saves, closing returns to the menu', () => {
    const root = installFakeDocument();
    const store = memory();
    const fx = fakeFx();
    const model = createSettingsModel(fx, store);
    let flow: FlowState = initialFlow();
    const dispatch = (a: FlowAction): void => {
      flow = reduceFlow(flow, a);
    };
    createMenuScreen(asParent(root), {
      adventure: () => undefined,
      levels: () => undefined,
      endless: () => undefined,
      settings: () => dispatch({ type: 'openSettings' }),
    });
    const screen = createSettingsScreen(asParent(root), model, actions());
    buttonsLabelled(root, 'Settings')[0]?.tap();
    expect(flow.screen).toBe('settings');
    expect(flow.settingsFrom).toBe('menu');
    screen.show();
    groupButtons(root, SPACE_ROW_LABEL)[3]?.tap();
    expect(fx.calls).toEqual(['space:high']);
    dispatch({ type: 'closeSettings' });
    expect(flow.screen).toBe('menu');
    expect(loadSpacePhysics(store)).toBe('high');
  });

  it('pause path: the pause Settings button opens the row, a tap acts on the live world, closing returns to pause', () => {
    const root = installFakeDocument();
    const store = memory();
    const fx = fakeFx();
    const model = createSettingsModel(fx, store);
    let flow: FlowState = initialFlow(3);
    const dispatch = (a: FlowAction): void => {
      flow = reduceFlow(flow, a);
    };
    dispatch({ type: 'start', mode: 'adventure', levelIndex: 3 });
    const run = flow.run;
    createPauseScreen(asParent(root), {
      resume: () => dispatch({ type: 'resume' }),
      restart: () => dispatch({ type: 'restart' }),
      settings: () => dispatch({ type: 'openSettings' }),
      quit: () => dispatch({ type: 'quit' }),
    });
    const screen = createSettingsScreen(asParent(root), model, actions());
    dispatch({ type: 'pause' });
    expect(flow.screen).toBe('paused');

    buttonsLabelled(root, 'Settings')[0]?.tap();
    expect(flow.screen).toBe('settings');
    expect(flow.settingsFrom).toBe('paused');
    expect(flow.run).toBe(run); // no new world: the effect has to reach the running one

    screen.show();
    groupButtons(root, SPACE_ROW_LABEL)[1]?.tap();
    expect(fx.calls).toEqual(['space:low']);
    expect(store.data.get(SPACE_PHYSICS_KEY)).toBe('low');

    dispatch({ type: 'closeSettings' });
    expect(flow.screen).toBe('paused');
    expect(flow.run).toBe(run);
    expect(loadSpacePhysics(store)).toBe('low');
  });

  it('a screen built after the change, as on the next launch, shows it lit', () => {
    const store = memory();
    const first = installFakeDocument();
    const model = createSettingsModel(fakeFx(), store);
    createSettingsScreen(asParent(first), model, actions());
    groupButtons(first, SPACE_ROW_LABEL)[2]?.tap();

    const second = installFakeDocument();
    createSettingsScreen(asParent(second), createSettingsModel(fakeFx(), store), actions());
    const lit = groupButtons(second, SPACE_ROW_LABEL).map((b) => b.classList.contains('sow-on'));
    expect(lit).toEqual([false, false, true, false]);
  });
});

// Weapon pickups row (v2 wave B).

describe('weapon pickups: model', () => {
  it('starts on when nothing is stored, and the boot push carries it', () => {
    const fx = fakeFx();
    const m = createSettingsModel(fx, memory());
    expect(m.state.weaponPickups).toBe(true);
    m.applyBoot();
    expect(fx.calls.filter((c) => c.startsWith('pickups:'))).toEqual(['pickups:true']);
  });

  it('a stored 0 is shown and pushed through the port at boot', () => {
    const fx = fakeFx();
    const m = createSettingsModel(fx, memory({ [WEAPON_PICKUPS_KEY]: '0' }));
    expect(m.state.weaponPickups).toBe(false);
    m.applyBoot();
    expect(fx.calls.filter((c) => c.startsWith('pickups:'))).toEqual(['pickups:false']);
  });

  it('the boot push comes after the space physics push, then the effects and music pushes end it', () => {
    const fx = fakeFx();
    createSettingsModel(fx, memory()).applyBoot();
    expect(fx.calls.slice(-4)).toEqual(['space:off', 'pickups:true', 'effects:standard', 'music:50']);
  });

  it('a tap saves the value and calls the effect exactly once', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.setWeaponPickups(false);
    expect(fx.calls).toEqual(['pickups:false']);
    expect(store.data.get(WEAPON_PICKUPS_KEY)).toBe('0');
    expect(m.state.weaponPickups).toBe(false);
    expect(createSettingsModel(fakeFx(), store).state.weaponPickups).toBe(false);
    m.setWeaponPickups(true);
    expect(fx.calls).toEqual(['pickups:false', 'pickups:true']);
    expect(store.data.get(WEAPON_PICKUPS_KEY)).toBe('1');
    expect(loadWeaponPickups(store)).toBe(true);
  });

  it('tapping the value already chosen saves again but does not call the effect again', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.setWeaponPickups(false);
    store.data.delete(WEAPON_PICKUPS_KEY); // pretend the first write was lost
    m.setWeaponPickups(false);
    expect(fx.calls).toEqual(['pickups:false']);
    expect(store.data.get(WEAPON_PICKUPS_KEY)).toBe('0');
  });

  it('tapping On while already on writes 1 and makes no effect call', () => {
    const store = memory();
    const fx = fakeFx();
    createSettingsModel(fx, store).setWeaponPickups(true);
    expect(fx.calls).toEqual([]);
    expect(store.data.get(WEAPON_PICKUPS_KEY)).toBe('1');
  });

  it('an invalid stored value falls back to on', () => {
    for (const bad of ['', 'true', 'false', 'off', 'On', ' 1', '0 ', '01', '2', '-1']) {
      const m = createSettingsModel(fakeFx(), memory({ [WEAPON_PICKUPS_KEY]: bad }));
      expect(m.state.weaponPickups, JSON.stringify(bad)).toBe(true);
    }
  });

  it('a storage that throws still changes the state and still calls the effect', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const fx = fakeFx();
    const m = createSettingsModel(fx, broken);
    expect(m.state.weaponPickups).toBe(true);
    expect(() => m.setWeaponPickups(false)).not.toThrow();
    expect(m.state.weaponPickups).toBe(false);
    expect(fx.calls).toEqual(['pickups:false']);
  });

  it('does not move or write any other setting, and space physics does not touch it', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.setWeaponPickups(false);
    expect(m.state).toEqual({ neon: 70, volume: 70, showFps: false, glowPath: 'bloom', spacePhysics: 'off', weaponPickups: false, effects: 'standard', music: 50 });
    expect([...store.data.keys()]).toEqual([WEAPON_PICKUPS_KEY]);
    expect(fx.neon).toEqual([]);
    m.setSpacePhysics('high');
    expect(m.state.weaponPickups).toBe(false);
    expect(store.data.get(WEAPON_PICKUPS_KEY)).toBe('0');
  });

  it('reset progress does not reset it', () => {
    const store = memory();
    createSettingsModel(fakeFx(), store).setWeaponPickups(false);
    resetProgress(store);
    expect(createSettingsModel(fakeFx(), store).state.weaponPickups).toBe(false);
  });
});

describe('weapon pickups: row helpers', () => {
  it('labels are On and Off under the row title Weapon pickups', () => {
    expect([true, false].map(weaponPickupsLabel)).toEqual(['On', 'Off']);
    expect(WEAPON_ROW_LABEL).toBe('Weapon pickups');
  });

  it('exactly one of the two buttons is selected, the current value', () => {
    for (const current of [true, false]) {
      const states = weaponButtonStates(current);
      expect(states.map((s) => s.on)).toEqual([true, false]);
      expect(states.map((s) => s.label)).toEqual(['On', 'Off']);
      expect(states.filter((s) => s.selected).map((s) => s.on)).toEqual([current]);
    }
  });
});

describe('weapon pickups: settings screen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const actions = (): SettingsActions => ({
    back: () => undefined,
    playSeed: () => undefined,
    seedHash: () => null,
    resetProgress: () => undefined,
    stress: () => undefined,
    currentNeon: () => 70,
    buildId: 'test',
  });

  function open(store = memory()) {
    const root = installFakeDocument();
    const fx = fakeFx();
    const model = createSettingsModel(fx, store);
    const screen = createSettingsScreen(asParent(root), model, actions());
    screen.show();
    return { root, fx, model, store, buttons: groupButtons(root, WEAPON_ROW_LABEL) };
  }

  const lit = (buttons: readonly { classList: { contains(c: string): boolean } }[]): boolean[] =>
    buttons.map((b) => b.classList.contains('sow-on'));

  it('shows On then Off with On highlighted by default', () => {
    const { buttons } = open();
    expect(buttons.map((b) => b.textContent)).toEqual(['On', 'Off']);
    expect(lit(buttons)).toEqual([true, false]);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  });

  it('highlights Off the first time the screen opens when 0 is stored', () => {
    const { buttons } = open(memory({ [WEAPON_PICKUPS_KEY]: '0' }));
    expect(lit(buttons)).toEqual([false, true]);
  });

  it('a tap on Off persists it, calls the effect once and moves the highlight', () => {
    const { buttons, fx, store, model } = open();
    buttons[1]?.tap();
    expect(fx.calls).toEqual(['pickups:false']);
    expect(store.data.get(WEAPON_PICKUPS_KEY)).toBe('0');
    expect(model.state.weaponPickups).toBe(false);
    expect(lit(buttons)).toEqual([false, true]);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('Off then On again persists 1 and the highlight follows each tap', () => {
    const { buttons, fx, store } = open();
    buttons[1]?.tap();
    buttons[0]?.tap();
    expect(fx.calls).toEqual(['pickups:false', 'pickups:true']);
    expect(store.data.get(WEAPON_PICKUPS_KEY)).toBe('1');
    expect(lit(buttons)).toEqual([true, false]);
  });

  it('a screen built after the change, as on the next launch, shows it lit', () => {
    const store = memory();
    const first = installFakeDocument();
    createSettingsScreen(asParent(first), createSettingsModel(fakeFx(), store), actions());
    groupButtons(first, WEAPON_ROW_LABEL)[1]?.tap();

    const second = installFakeDocument();
    createSettingsScreen(asParent(second), createSettingsModel(fakeFx(), store), actions());
    expect(lit(groupButtons(second, WEAPON_ROW_LABEL))).toEqual([false, true]);
  });

  it('a release with no press, or by a different finger, does nothing', () => {
    const { buttons, fx, store } = open();
    buttons[1]?.fire('pointerup', 1);
    buttons[1]?.fire('pointerdown', 1);
    buttons[1]?.fire('pointerup', 2);
    expect(fx.calls).toEqual([]);
    expect(store.data.has(WEAPON_PICKUPS_KEY)).toBe(false);
    expect(lit(buttons)).toEqual([true, false]);
  });

  it('the row uses the choice style whose buttons carry the 44px minimum', () => {
    const { root } = open();
    const group = root.all().find((e) => e.getAttribute('aria-label') === WEAPON_ROW_LABEL);
    expect(group?.classList.contains('sow-choice')).toBe(true);
    expect(UI_CSS).toMatch(/\.sow-choice \.sow-btn \{[^}]*min-height: 44px/);
    expect(buttonsLabelled(root, 'On')).toHaveLength(1);
    // The Space physics row has an Off button too, so the screen holds two of that label.
    expect(buttonsLabelled(root, 'Off')).toHaveLength(2);
  });

  it('sits on the one settings screen the menu and the pause screen open, after the space row', () => {
    const { root } = open();
    const groups = root.all().filter((e) => e.getAttribute('role') === 'group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([SPACE_ROW_LABEL, WEAPON_ROW_LABEL, EFFECTS_ROW_LABEL]);
  });
});

// Effects row and Music slider (v2 wave D). The screen tests run on the small fake DOM in ./fakeDom.

const brokenStorage: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

const noActions = (): SettingsActions => ({
  back: () => undefined,
  playSeed: () => undefined,
  seedHash: () => null,
  resetProgress: () => undefined,
  stress: () => undefined,
  currentNeon: () => 70,
  buildId: 'test',
});

const litOf = (buttons: readonly { classList: { contains(c: string): boolean } }[]): boolean[] =>
  buttons.map((b) => b.classList.contains('sow-on'));

describe('effects tier: model', () => {
  it('starts on standard when nothing is stored, and the boot push carries it', () => {
    const fx = fakeFx();
    const m = createSettingsModel(fx, memory());
    expect(m.state.effects).toBe('standard');
    m.applyBoot();
    expect(fx.calls.filter((c) => c.startsWith('effects:'))).toEqual(['effects:standard']);
  });

  it('a stored tier is shown and pushed through the port at boot', () => {
    const fx = fakeFx();
    const m = createSettingsModel(fx, memory({ [EFFECTS_KEY]: 'low' }));
    expect(m.state.effects).toBe('low');
    m.applyBoot();
    expect(fx.calls.filter((c) => c.startsWith('effects:'))).toEqual(['effects:low']);
  });

  it('a tap saves the tier and calls the effect exactly once', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.setEffectsTier('high');
    expect(fx.calls).toEqual(['effects:high']);
    expect(store.data.get(EFFECTS_KEY)).toBe('high');
    expect(m.state.effects).toBe('high');
    expect(createSettingsModel(fakeFx(), store).state.effects).toBe('high');
    expect(loadEffects(store)).toBe('high');
  });

  it('tapping the tier already chosen saves again but does not call the effect again', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.setEffectsTier('standard');
    expect(fx.calls).toEqual([]);
    expect(store.data.get(EFFECTS_KEY)).toBe('standard');
    m.setEffectsTier('low');
    store.data.delete(EFFECTS_KEY); // pretend the write was lost
    m.setEffectsTier('low');
    expect(fx.calls).toEqual(['effects:low']);
    expect(store.data.get(EFFECTS_KEY)).toBe('low');
  });

  it('a run of taps reaches the effect in order, once per change, and the last one survives a restart', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    for (const tier of ['low', 'low', 'high', 'standard', 'standard', 'low'] as const) m.setEffectsTier(tier);
    expect(fx.calls).toEqual(['effects:low', 'effects:high', 'effects:standard', 'effects:low']);
    expect(loadEffects(store)).toBe('low');
  });

  it('an invalid stored value falls back to standard', () => {
    for (const bad of ['', 'Low', 'HIGH', 'Standard', 'medium', 'off', '1', 'standard ', ' high', 'low\n']) {
      const m = createSettingsModel(fakeFx(), memory({ [EFFECTS_KEY]: bad }));
      expect(m.state.effects, JSON.stringify(bad)).toBe('standard');
    }
  });

  it('a storage that throws still changes the state and still calls the effect', () => {
    const fx = fakeFx();
    const m = createSettingsModel(fx, brokenStorage);
    expect(m.state.effects).toBe('standard');
    expect(() => m.setEffectsTier('high')).not.toThrow();
    expect(m.state.effects).toBe('high');
    expect(fx.calls).toEqual(['effects:high']);
  });

  it('writes only its own key and moves no other setting', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.setEffectsTier('high');
    expect(m.state).toEqual({ neon: 70, volume: 70, showFps: false, glowPath: 'bloom', spacePhysics: 'off', weaponPickups: true, effects: 'high', music: 50 });
    expect([...store.data.keys()]).toEqual([EFFECTS_KEY]);
    expect(fx.neon).toEqual([]);
    m.setSpacePhysics('medium');
    m.setWeaponPickups(false);
    m.musicCommit(10);
    expect(m.state.effects).toBe('high');
    expect(store.data.get(EFFECTS_KEY)).toBe('high');
  });

  it('reset progress does not reset it', () => {
    const store = memory();
    createSettingsModel(fakeFx(), store).setEffectsTier('low');
    resetProgress(store);
    expect(createSettingsModel(fakeFx(), store).state.effects).toBe('low');
  });
});

describe('effects tier: row helpers', () => {
  it('labels are Low, Standard and High under the row title Effects', () => {
    expect(EFFECTS_TIER_SETTINGS.map(effectsLabel)).toEqual(['Low', 'Standard', 'High']);
    expect(EFFECTS_ROW_LABEL).toBe('Effects');
  });

  it('exactly one button is selected, the current tier, in button order', () => {
    for (const current of EFFECTS_TIER_SETTINGS) {
      const states = effectsButtonStates(current);
      expect(states.map((s) => s.tier)).toEqual(['low', 'standard', 'high']);
      expect(states.filter((s) => s.selected).map((s) => s.tier)).toEqual([current]);
    }
  });
});

describe('effects tier: settings screen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function open(store = memory()) {
    const root = installFakeDocument();
    const fx = fakeFx();
    const model = createSettingsModel(fx, store);
    const screen = createSettingsScreen(asParent(root), model, noActions());
    screen.show();
    return { root, fx, model, store, buttons: groupButtons(root, EFFECTS_ROW_LABEL) };
  }

  it('shows Low, Standard, High in that order with Standard highlighted by default', () => {
    const { buttons } = open();
    expect(buttons.map((b) => b.textContent)).toEqual(['Low', 'Standard', 'High']);
    expect(litOf(buttons)).toEqual([false, true, false]);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
  });

  it('highlights the stored tier the first time the screen opens', () => {
    const { buttons } = open(memory({ [EFFECTS_KEY]: 'high' }));
    expect(litOf(buttons)).toEqual([false, false, true]);
  });

  it('a tap on High saves it, calls the effect once and moves the highlight', () => {
    const { buttons, fx, store, model } = open();
    buttons[2]?.tap();
    expect(fx.calls).toEqual(['effects:high']);
    expect(store.data.get(EFFECTS_KEY)).toBe('high');
    expect(model.state.effects).toBe('high');
    expect(litOf(buttons)).toEqual([false, false, true]);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
  });

  it('each tap calls the effect once per change, in order, and the highlight follows', () => {
    const { buttons, fx } = open();
    const expected: string[] = [];
    let current: EffectsTierSetting = 'standard';
    for (const i of [0, 0, 2, 1, 1, 0]) {
      const tier = EFFECTS_TIER_SETTINGS[i];
      if (tier === undefined) throw new Error('bad index');
      if (tier !== current) expected.push(`effects:${tier}`);
      current = tier;
      buttons[i]?.tap();
      expect(litOf(buttons)).toEqual(buttons.map((_, j) => j === i));
    }
    expect(fx.calls).toEqual(expected);
    expect(expected).toEqual(['effects:low', 'effects:high', 'effects:standard', 'effects:low']);
  });

  it('tapping the lit tier writes it again and makes no effect call', () => {
    const { buttons, fx, store } = open();
    buttons[1]?.tap();
    expect(fx.calls).toEqual([]);
    expect(store.data.get(EFFECTS_KEY)).toBe('standard');
  });

  it('a release with no press, or by a different finger, does nothing', () => {
    const { buttons, fx, store } = open();
    buttons[0]?.fire('pointerup', 1);
    buttons[0]?.fire('pointerdown', 1);
    buttons[0]?.fire('pointerup', 2);
    expect(fx.calls).toEqual([]);
    expect(store.data.has(EFFECTS_KEY)).toBe(false);
    expect(litOf(buttons)).toEqual([false, true, false]);
  });

  it('a screen built after the change, as on the next launch, shows it lit', () => {
    const store = memory();
    const first = installFakeDocument();
    createSettingsScreen(asParent(first), createSettingsModel(fakeFx(), store), noActions());
    groupButtons(first, EFFECTS_ROW_LABEL)[0]?.tap();

    const second = installFakeDocument();
    createSettingsScreen(asParent(second), createSettingsModel(fakeFx(), store), noActions());
    expect(litOf(groupButtons(second, EFFECTS_ROW_LABEL))).toEqual([true, false, false]);
  });

  it('uses the choice row style, whose buttons carry the 44px minimum, and has one Standard button', () => {
    const { root } = open();
    const group = root.all().find((e) => e.getAttribute('aria-label') === EFFECTS_ROW_LABEL);
    expect(group?.classList.contains('sow-choice')).toBe(true);
    expect(UI_CSS).toMatch(/\.sow-choice \.sow-btn \{[^}]*min-height: 44px/);
    expect(buttonsLabelled(root, 'Standard')).toHaveLength(1);
  });
});

describe('music: model', () => {
  it('starts at 50 when nothing is stored, and the boot push carries it', () => {
    const fx = fakeFx();
    const m = createSettingsModel(fx, memory());
    expect(m.state.music).toBe(50);
    m.applyBoot();
    expect(fx.calls.filter((c) => c.startsWith('music:'))).toEqual(['music:50']);
  });

  it('a stored value is shown and pushed at boot, 0 included', () => {
    for (const [stored, want] of [['0', 0], ['80', 80], ['100', 100]] as const) {
      const fx = fakeFx();
      const m = createSettingsModel(fx, memory({ [MUSIC_KEY]: stored }));
      expect(m.state.music).toBe(want);
      m.applyBoot();
      expect(fx.calls.filter((c) => c.startsWith('music:'))).toEqual([`music:${want}`]);
    }
  });

  it('dragging calls the effect once per distinct value and saves nothing yet', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    for (const v of [10, 10, 20, 20, 20, 35]) m.musicInput(v);
    expect(fx.calls).toEqual(['music:10', 'music:20', 'music:35']);
    expect(m.state.music).toBe(35);
    expect(store.data.has(MUSIC_KEY)).toBe(false);
  });

  it('the first drag step back to the boot value still calls the effect, because the last value was different', () => {
    const fx = fakeFx();
    const m = createSettingsModel(fx, memory());
    m.applyBoot();
    m.musicInput(60);
    m.musicInput(50);
    expect(fx.calls.filter((c) => c.startsWith('music:'))).toEqual(['music:50', 'music:60', 'music:50']);
  });

  it('finger up persists the value and does not repeat the effect call', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.musicInput(30);
    m.musicCommit(30);
    expect(fx.calls).toEqual(['music:30']);
    expect(store.data.get(MUSIC_KEY)).toBe('30');
    expect(loadMusic(store)).toBe(30);
    expect(createSettingsModel(fakeFx(), store).state.music).toBe(30);
  });

  it('a commit with no drag before it applies the value once and saves it', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.musicCommit(70);
    expect(fx.calls).toEqual(['music:70']);
    expect(store.data.get(MUSIC_KEY)).toBe('70');
  });

  it('a commit of the unchanged value saves it and makes no effect call', () => {
    const store = memory();
    const fx = fakeFx();
    createSettingsModel(fx, store).musicCommit(50);
    expect(fx.calls).toEqual([]);
    expect(store.data.get(MUSIC_KEY)).toBe('50');
  });

  it('clamps to 0 to 100, rounds, and sends non numbers to the default 50', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.musicInput(150);
    expect(m.state.music).toBe(100);
    m.musicInput(-5);
    expect(m.state.music).toBe(0);
    m.musicInput(12.6);
    expect(m.state.music).toBe(13);
    m.musicInput(Number.NaN);
    expect(m.state.music).toBe(50);
    m.musicInput(Number.POSITIVE_INFINITY);
    expect(m.state.music).toBe(50);
    expect(fx.calls).toEqual(['music:100', 'music:0', 'music:13', 'music:50']);
    m.musicCommit(140);
    expect(store.data.get(MUSIC_KEY)).toBe('100');
    m.musicCommit(-1);
    expect(store.data.get(MUSIC_KEY)).toBe('0');
  });

  it('0 is off: it is applied, stored and loaded back as 0, not as the default', () => {
    const store = memory();
    const fx = fakeFx();
    createSettingsModel(fx, store).musicCommit(0);
    expect(fx.calls).toEqual(['music:0']);
    expect(store.data.get(MUSIC_KEY)).toBe('0');
    expect(createSettingsModel(fakeFx(), store).state.music).toBe(0);
  });

  it('an invalid stored value falls back to 50, and an out of range whole number is clamped', () => {
    for (const bad of ['', 'loud', '80%', '7.5', ' 80', '80 ', 'NaN', '1e2', '--1', '+5']) {
      expect(createSettingsModel(fakeFx(), memory({ [MUSIC_KEY]: bad })).state.music, JSON.stringify(bad)).toBe(50);
    }
    expect(createSettingsModel(fakeFx(), memory({ [MUSIC_KEY]: '250' })).state.music).toBe(100);
    expect(createSettingsModel(fakeFx(), memory({ [MUSIC_KEY]: '-20' })).state.music).toBe(0);
  });

  it('a storage that throws still changes the state and still calls the effect', () => {
    const fx = fakeFx();
    const m = createSettingsModel(fx, brokenStorage);
    expect(m.state.music).toBe(50);
    expect(() => m.musicInput(20)).not.toThrow();
    expect(() => m.musicCommit(20)).not.toThrow();
    expect(m.state.music).toBe(20);
    expect(fx.calls).toEqual(['music:20']);
  });

  it('writes only its own key, leaves the neon and volume apart, and reset progress keeps it', () => {
    const store = memory();
    const fx = fakeFx();
    const m = createSettingsModel(fx, store);
    m.musicCommit(25);
    expect([...store.data.keys()]).toEqual([MUSIC_KEY]);
    expect(m.state.volume).toBe(70);
    expect(fx.calls.some((c) => c.startsWith('vol:'))).toBe(false);
    expect(fx.neon).toEqual([]);
    m.volumeCommit(10);
    expect(m.state.music).toBe(25);
    resetProgress(store);
    expect(createSettingsModel(fakeFx(), store).state.music).toBe(25);
  });
});

describe('music: slider on the settings screen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function open(store = memory()) {
    const root = installFakeDocument();
    const fx = fakeFx();
    const model = createSettingsModel(fx, store);
    const screen = createSettingsScreen(asParent(root), model, noActions());
    screen.show();
    const slider = sliderNamed(root, MUSIC_SLIDER_LABEL);
    if (slider === undefined) throw new Error('no Music slider on the settings screen');
    return { root, fx, model, store, screen, slider };
  }

  it('sits after Neon and Volume, and starts at the stored value', () => {
    const { root, slider } = open(memory({ [MUSIC_KEY]: '80' }));
    const labels = root
      .all()
      .filter((e) => e.classList.contains('sow-slider'))
      .map((e) => e.children[0]?.textContent);
    expect(labels).toEqual(['Neon 70', 'Volume 70', 'Music 80']);
    expect(slider.label.textContent).toBe('Music 80');
  });

  it('a drag calls the effect once per new value and saves only when the finger lifts', () => {
    const { slider, fx, store } = open();
    slider.root.fire('pointerdown', 1, 40); // x 40 of 200 is 20
    expect(slider.label.textContent).toBe('Music 20');
    slider.root.fire('pointermove', 1, 40); // same value: nothing
    slider.root.fire('pointermove', 1, 41); // 20.5 rounds to 21
    slider.root.fire('pointermove', 1, 120); // 60
    expect(slider.label.textContent).toBe('Music 60');
    expect(fx.calls).toEqual(['music:20', 'music:21', 'music:60']);
    expect(store.data.has(MUSIC_KEY)).toBe(false);
    slider.root.fire('pointerup', 1, 120);
    expect(store.data.get(MUSIC_KEY)).toBe('60');
    expect(fx.calls).toEqual(['music:20', 'music:21', 'music:60']); // finger up repeats nothing
    expect(loadMusic(store)).toBe(60);
  });

  it('dragging to the left end gives 0 (off) and persists it, the right end gives 100', () => {
    const { slider, fx, store } = open();
    slider.root.fire('pointerdown', 1, 100);
    slider.root.fire('pointermove', 1, -30);
    slider.root.fire('pointerup', 1, -30);
    expect(slider.label.textContent).toBe('Music 0');
    expect(store.data.get(MUSIC_KEY)).toBe('0');
    slider.root.fire('pointerdown', 2, 150);
    slider.root.fire('pointermove', 2, 999);
    slider.root.fire('pointerup', 2, 999);
    expect(slider.label.textContent).toBe('Music 100');
    expect(store.data.get(MUSIC_KEY)).toBe('100');
    expect(fx.calls).toEqual(['music:0', 'music:75', 'music:100']);
  });

  it('a tap on the current value saves it and makes no effect call', () => {
    const { slider, fx, store } = open();
    slider.root.fire('pointerdown', 1, 100); // 50, the default
    slider.root.fire('pointerup', 1, 100);
    expect(fx.calls).toEqual([]);
    expect(store.data.get(MUSIC_KEY)).toBe('50');
  });

  it('moves by another finger are ignored, and the slider does not touch the other settings', () => {
    const { slider, fx, store } = open();
    slider.root.fire('pointerdown', 1, 40);
    slider.root.fire('pointermove', 2, 180);
    slider.root.fire('pointerup', 2, 180);
    expect(slider.label.textContent).toBe('Music 20');
    expect(store.data.has(MUSIC_KEY)).toBe(false);
    slider.root.fire('pointerup', 1, 40);
    expect(fx.calls).toEqual(['music:20']);
    expect([...store.data.keys()]).toEqual([MUSIC_KEY]);
    expect(fx.neon).toEqual([]);
  });

  it('opening the screen again shows the value held by the model', () => {
    const { slider, model, screen } = open();
    model.musicInput(33);
    screen.show();
    expect(slider.label.textContent).toBe('Music 33');
  });

  it('a screen built after the change, as on the next launch, shows it', () => {
    const store = memory();
    const first = open(store);
    first.slider.root.fire('pointerdown', 1, 30);
    first.slider.root.fire('pointerup', 1, 30);
    const second = open(store);
    expect(second.slider.label.textContent).toBe('Music 15');
  });

  it('the slider row is a 44px touch target', () => {
    const rule = /\.sow-slider \{([^}]*)\}/.exec(UI_CSS)?.[1] ?? '';
    expect(rule).toContain('min-height: 44px');
    expect(MIN_HIT_PX).toBeGreaterThanOrEqual(44);
  });
});
