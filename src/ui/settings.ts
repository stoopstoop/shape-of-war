// Settings screen (docs/01 section 10, docs/03 sections 7 and 8, SPEC 4). Neon slider 0 to 100
// over a live preview arena, Volume slider, Show FPS, Bloom / Fallback, Play seed, Reset progress,
// and a hidden debug menu behind five taps on the version label.
// The model is pure apart from injected effects, so tests drive it with fakes. applyNeon is
// throttled to one call per animation frame while dragging; the value is saved on finger up.
import {
  loadGlowPath,
  loadSettings,
  parseSeedInput,
  saveGlowPath,
  saveSetting,
  type GlowPathSetting,
  type StorageLike,
} from '../core/settings';
import { button, createScreen, el, type Screen } from './dom';
import { createFrameThrottle, createSlider } from './slider';

export interface SettingsEffects {
  /** Glow's setShowFps from src/render/devpanel.ts. */
  setShowFps(on: boolean): void;
  /** Glow's setGlowPath from src/render/devpanel.ts. */
  setGlowPath(p: GlowPathSetting): void;
  /** applyNeon from src/render/neon.ts, the only place the neon value takes effect. */
  applyNeon(n: number): void;
  /** Master volume 0 to 100 (Glow's synth when merged, else a no-op). */
  setVolume(v: number): void;
  /** requestAnimationFrame, injected for tests. */
  requestFrame(cb: () => void): void;
}

export interface SettingsView {
  neon: number;
  volume: number;
  showFps: boolean;
  glowPath: GlowPathSetting;
}

export interface SettingsModel {
  readonly state: Readonly<SettingsView>;
  /** Push the stored values into the renderer and synth. Call once at boot. */
  applyBoot(): void;
  /** Slider drag: state now, applyNeon on the next frame (latest value wins). */
  neonInput(n: number): void;
  /** Finger up: apply any queued value now and persist sow.settings.neon. */
  neonCommit(n: number): void;
  volumeInput(v: number): void;
  volumeCommit(v: number): void;
  setShowFps(on: boolean): void;
  setGlowPath(p: GlowPathSetting): void;
  toggleShowFps(): void;
  toggleGlowPath(): void;
  /** Record a glow change made elsewhere (the debug panel) without calling the renderer again. */
  syncGlowPath(p: GlowPathSetting): void;
  /** Record a Show FPS change made in the debug panel (which already persisted it). */
  syncShowFps(on: boolean): void;
  /** Record a neon value applied elsewhere (the debug panel), so the slider shows it. */
  syncNeon(n: number): void;
}

function clamp100(n: number): number {
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
}

/** `storage` defaults to localStorage with an in memory fallback (core/settings). */
export function createSettingsModel(fx: SettingsEffects, storage?: StorageLike | null): SettingsModel {
  const loaded = loadSettings(storage);
  const state: SettingsView = {
    neon: loaded.neon,
    volume: loaded.volume,
    showFps: loaded.showFps,
    glowPath: loadGlowPath(storage),
  };
  const neonThrottle = createFrameThrottle<number>((n) => fx.applyNeon(n), (cb) => fx.requestFrame(cb));
  const model: SettingsModel = {
    state,
    applyBoot() {
      fx.applyNeon(state.neon);
      fx.setVolume(state.volume);
      fx.setShowFps(state.showFps);
      fx.setGlowPath(state.glowPath);
    },
    neonInput(n) {
      state.neon = clamp100(n);
      neonThrottle.push(state.neon);
    },
    neonCommit(n) {
      state.neon = clamp100(n);
      neonThrottle.push(state.neon);
      neonThrottle.flush();
      saveSetting('neon', state.neon, storage);
    },
    volumeInput(v) {
      state.volume = clamp100(v);
      fx.setVolume(state.volume);
    },
    volumeCommit(v) {
      model.volumeInput(v);
      saveSetting('volume', state.volume, storage);
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
    syncShowFps(on) {
      state.showFps = on;
    },
    syncNeon(n) {
      state.neon = clamp100(n);
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

/**
 * Pure: count taps on the version label. Keeps taps inside the window; fires (and clears) when
 * `need` taps land within `windowMs`.
 */
export function registerTap(
  taps: readonly number[],
  now: number,
  need = 5,
  windowMs = 3000,
): { taps: number[]; fire: boolean } {
  const kept = taps.filter((t) => now - t < windowMs && t <= now);
  kept.push(now);
  return kept.length >= need ? { taps: [], fire: true } : { taps: kept, fire: false };
}

/** Pure: two tap confirm. A second tap within `windowMs` of the first fires. */
export function confirmTap(armedAt: number | null, now: number, windowMs = 3000): { armedAt: number | null; fire: boolean } {
  if (armedAt !== null && now - armedAt < windowMs && now >= armedAt) return { armedAt: null, fire: true };
  return { armedAt: now, fire: false };
}

/** Pure: the line under the seed field. */
export function seedHashLine(text: string, hashOf: (seed: number) => string | null): string {
  if (text.trim() === '') return 'Type a run seed (0 to 4294967295)';
  const seed = parseSeedInput(text);
  if (seed === null) return 'Not a valid seed';
  const h = hashOf(seed);
  return h === null ? `Seed ${seed}` : `Seed ${seed}  Level 1 #${h}`;
}

export const STRESS_LABEL = 'Stress: 400 entities, 2000 particles';

export interface SettingsActions {
  back(): void;
  /** Start Adventure level 1 with a typed run seed. */
  playSeed(seed: number): void;
  /** Level 1 hash for a seed, or null when no generator is present. */
  seedHash(seed: number): string | null;
  resetProgress(): void;
  /** window.sowDebug.stress(400, 2000). */
  stress(): void;
  /** Current neon value, read when the screen opens (the debug panel may have moved it). */
  currentNeon(): number;
  buildId: string;
}

export interface SettingsScreen extends Screen {
  refresh(): void;
}

/** DOM edge. The screen is see through: the panel sits left and the preview arena shows right. */
export function createSettingsScreen(parent: HTMLElement, model: SettingsModel, a: SettingsActions): SettingsScreen {
  const s = createScreen(parent);
  s.root.classList.add('sow-see');
  const panel = el('div', 'sow-panel');
  const title = el('div', 'sow-title', 'Settings');
  const neon = createSlider({
    label: 'Neon',
    min: 0,
    max: 100,
    value: model.state.neon,
    onInput: (v) => model.neonInput(v),
    onCommit: (v) => model.neonCommit(v),
  });
  const volume = createSlider({
    label: 'Volume',
    min: 0,
    max: 100,
    value: model.state.volume,
    onInput: (v) => model.volumeInput(v),
    onCommit: (v) => model.volumeCommit(v),
  });

  const fps = button('', () => {
    model.toggleShowFps();
    refresh();
  });
  const glow = button('', () => {
    model.toggleGlowPath();
    refresh();
  });
  const toggles = el('div', 'sow-row');
  toggles.append(fps, glow);

  const seedField = el('input', 'sow-input');
  seedField.type = 'text';
  seedField.inputMode = 'numeric';
  seedField.autocomplete = 'off';
  seedField.placeholder = 'Run seed';
  seedField.maxLength = 10;
  const seedLine = el('div', 'sow-small', '');
  const paintSeed = (): void => {
    seedLine.textContent = seedHashLine(seedField.value, a.seedHash);
  };
  seedField.addEventListener('input', paintSeed);
  const play = button('Play seed', () => {
    const seed = parseSeedInput(seedField.value);
    if (seed === null) {
      paintSeed();
      return;
    }
    seedField.blur();
    a.playSeed(seed);
  });
  const seedRow = el('div', 'sow-row');
  seedRow.append(seedField, play);

  let resetArmed: number | null = null;
  const reset = button('Reset progress', () => {
    const r = confirmTap(resetArmed, performance.now());
    resetArmed = r.armedAt;
    if (r.fire) {
      a.resetProgress();
      reset.textContent = 'Progress reset';
    } else {
      reset.textContent = 'Tap again to reset';
    }
  });
  const back = button('Back', () => {
    seedField.blur();
    a.back();
  });
  const bottom = el('div', 'sow-row');
  bottom.append(reset, back);

  const debugRow = el('div', 'sow-row');
  debugRow.append(button(STRESS_LABEL, a.stress));
  debugRow.style.display = 'none';
  const version = el('div', 'sow-small', `build ${a.buildId}`);
  version.style.alignSelf = 'flex-end';
  version.style.padding = '4px 0 0 12px';
  let taps: number[] = [];
  version.addEventListener('pointerup', () => {
    const r = registerTap(taps, performance.now());
    taps = r.taps;
    if (r.fire) debugRow.style.display = debugRow.style.display === 'none' ? '' : 'none';
  });

  panel.append(title, neon.root, volume.root, toggles, seedRow, seedLine, bottom, debugRow, version);
  s.root.append(panel);

  function refresh(): void {
    neon.set(model.state.neon);
    volume.set(model.state.volume);
    fps.textContent = fpsLabel(model.state.showFps);
    glow.textContent = glowLabel(model.state.glowPath);
  }
  refresh();
  paintSeed();
  return {
    ...s,
    show() {
      model.syncNeon(a.currentNeon());
      resetArmed = null;
      reset.textContent = 'Reset progress';
      refresh();
      paintSeed();
      s.show();
    },
    refresh,
  };
}
