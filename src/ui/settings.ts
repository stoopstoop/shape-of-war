// Settings screen, first version (W2 brief item 7): Show FPS and Bloom / Fallback.
// The model is pure apart from injected effects, so tests drive it with fakes. The neon slider
// moves here in W3; until then the value only flows through loadSettings and applyNeon at boot.
import {
  loadGlowPath,
  loadSettings,
  saveGlowPath,
  saveSetting,
  type GlowPathSetting,
  type StorageLike,
} from '../core/settings';
import { button, createScreen, el, type Screen } from './dom';

export interface SettingsEffects {
  /** Glow's setShowFps from src/render/devpanel.ts. */
  setShowFps(on: boolean): void;
  /** Glow's setGlowPath from src/render/devpanel.ts. */
  setGlowPath(p: GlowPathSetting): void;
}

export interface SettingsView {
  showFps: boolean;
  glowPath: GlowPathSetting;
}

export interface SettingsModel {
  readonly state: Readonly<SettingsView>;
  /** Push the stored values into the renderer. Call once at boot. */
  applyBoot(): void;
  setShowFps(on: boolean): void;
  setGlowPath(p: GlowPathSetting): void;
  toggleShowFps(): void;
  toggleGlowPath(): void;
  /** Record a glow change made elsewhere (the debug panel) without calling the renderer again. */
  syncGlowPath(p: GlowPathSetting): void;
}

/** `storage` defaults to localStorage with an in memory fallback (core/settings). */
export function createSettingsModel(fx: SettingsEffects, storage?: StorageLike | null): SettingsModel {
  const state: SettingsView = {
    showFps: loadSettings(storage).showFps,
    glowPath: loadGlowPath(storage),
  };
  const model: SettingsModel = {
    state,
    applyBoot() {
      fx.setShowFps(state.showFps);
      fx.setGlowPath(state.glowPath);
    },
    setShowFps(on) {
      state.showFps = on;
      saveSetting('showFps', on, storage);
      fx.setShowFps(on);
    },
    setGlowPath(p) {
      state.glowPath = p;
      saveGlowPath(p, storage);
      fx.setGlowPath(p);
    },
    toggleShowFps() {
      model.setShowFps(!state.showFps);
    },
    toggleGlowPath() {
      model.setGlowPath(state.glowPath === 'bloom' ? 'fallback' : 'bloom');
    },
    syncGlowPath(p) {
      if (p === state.glowPath) return;
      state.glowPath = p;
      saveGlowPath(p, storage);
    },
  };
  return model;
}

/** Pure: button labels. */
export function fpsLabel(on: boolean): string {
  return `Show FPS: ${on ? 'On' : 'Off'}`;
}

export function glowLabel(p: GlowPathSetting): string {
  return `Glow: ${p === 'bloom' ? 'Bloom' : 'Fallback'}`;
}

export interface SettingsScreen extends Screen {
  refresh(): void;
}

/** DOM edge. `onBack` returns to the menu or pause screen. */
export function createSettingsScreen(parent: HTMLElement, model: SettingsModel, onBack: () => void): SettingsScreen {
  const s = createScreen(parent);
  const title = el('div', 'sow-title', 'Settings');
  const fps = button('', () => {
    model.toggleShowFps();
    refresh();
  });
  const glow = button('', () => {
    model.toggleGlowPath();
    refresh();
  });
  const note = el('div', 'sow-sub', 'Fallback glow is cheaper if the main screen drops frames.');
  const back = button('Back', onBack);
  s.root.append(title, fps, glow, note, back);
  function refresh(): void {
    fps.textContent = fpsLabel(model.state.showFps);
    glow.textContent = glowLabel(model.state.glowPath);
  }
  refresh();
  return {
    ...s,
    show() {
      refresh();
      s.show();
    },
    refresh,
  };
}
