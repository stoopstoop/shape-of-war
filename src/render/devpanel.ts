// Debug settings panel (G1 to G3): neon slider, Show FPS toggle, bloom or fallback toggle.
// Opened by ?debug=1 or a two finger long press (1 s) in the top left corner.
// Pure state lives in devpanelState.ts; this file is the DOM edge plus the module level
// exports Ledger uses from the real settings screen in W2.
import type { GameRenderer } from './renderer';
import { applyNeon, currentNeon } from './neon';
import {
  cornerCount,
  createDevController,
  createFpsMeter,
  debugRequested,
  fpsLabel,
  type DevController,
  type DevPanelDeps,
  type DevSettings,
  type GlowPath,
} from './devpanelState';

export type { DevSettings, GlowPath } from './devpanelState';

const CORNER_PX = 110;
const LONG_PRESS_MS = 1000;
const LABEL_EVERY_MS = 250;

let controller: DevController | null = null;
let pendingShowFps: boolean | null = null;
let pendingGlowPath: GlowPath | null = null;

/** Bind the module level exports to a controller. installDevPanel calls this. */
export function bindDevController(c: DevController | null): void {
  controller = c;
  if (!c) return;
  if (pendingShowFps !== null) c.setShowFps(pendingShowFps);
  if (pendingGlowPath !== null) c.setGlowPath(pendingGlowPath);
  pendingShowFps = null;
  pendingGlowPath = null;
}

/** Show or hide the FPS and entity count label, persisted as sow.settings.showFps. */
export function setShowFps(on: boolean): void {
  if (controller) controller.setShowFps(on);
  else pendingShowFps = on;
}

export function getGlowPath(): GlowPath {
  return controller ? controller.getGlowPath() : (pendingGlowPath ?? 'bloom');
}

/** Switch glow path at runtime. Session only in W1; Ledger persists it in W2. */
export function setGlowPath(p: GlowPath): void {
  if (controller) controller.setGlowPath(p);
  else pendingGlowPath = p;
}

export interface DevPanelOptions {
  renderer: Pick<GameRenderer, 'setBloomEnabled' | 'stats'>;
  /** Values from loadSettings(). */
  settings: DevSettings;
  saveSetting: DevPanelDeps['saveSetting'];
  /** Optional measured frame time from the loop, in ms. Else the panel measures rAF. */
  frameTimeMs?: () => number;
  /** Initial glow path, default 'bloom'. */
  glowPath?: GlowPath;
}

export interface DevPanelHandle {
  readonly controller: DevController;
  open(): void;
  close(): void;
  toggle(): void;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

const PANEL_CSS = [
  'position:fixed',
  'top:calc(env(safe-area-inset-top, 0px) + 40px)',
  'left:calc(env(safe-area-inset-left, 0px) + 8px)',
  'z-index:30',
  'padding:10px 12px',
  'background:rgba(5,8,20,0.88)',
  'border:1px solid #19e6f0',
  'border-radius:8px',
  'color:#cfefff',
  'font:13px/1.4 ui-monospace,Menlo,Consolas,monospace',
  'display:none',
  'min-width:240px',
  'touch-action:none',
  'user-select:none',
].join(';');

const ROW_CSS = 'display:flex;align-items:center;gap:8px;margin:6px 0';
const BTN_CSS = 'font:inherit;color:#cfefff;background:#10203a;border:1px solid #3a6;border-radius:6px;padding:8px 10px;min-height:40px';

const FPS_CSS = [
  'position:fixed',
  'top:calc(env(safe-area-inset-top, 0px) + 4px)',
  'left:50%',
  'transform:translateX(-50%)',
  'z-index:25',
  'pointer-events:none',
  'white-space:pre',
  'font:12px/1.3 ui-monospace,Menlo,Consolas,monospace',
  'color:#9fff6a',
  'opacity:0.85',
  'display:none',
].join(';');

export function installDevPanel(opts: DevPanelOptions): DevPanelHandle {
  const initialGlow = opts.glowPath ?? (opts.renderer.stats.glowPath === 'fallback' ? 'fallback' : 'bloom');
  const c = createDevController(
    {
      saveSetting: opts.saveSetting,
      setBloomEnabled: (on) => opts.renderer.setBloomEnabled(on),
      applyNeon,
      requestFrame: (cb) => {
        window.requestAnimationFrame(() => cb());
      },
    },
    { neon: opts.settings.neon ?? currentNeon, showFps: opts.settings.showFps, glowPath: initialGlow },
  );

  if (initialGlow !== opts.renderer.stats.glowPath) c.setGlowPath(initialGlow);

  // Panel DOM.
  const panel = el('div', PANEL_CSS);
  panel.id = 'sow-devpanel';
  const title = el('div', 'font-weight:bold;margin-bottom:4px', 'Debug settings');

  const neonRow = el('div', ROW_CSS);
  const neonLabel = el('span', 'min-width:76px', '');
  const slider = el('input', 'flex:1;min-width:140px;height:32px');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';
  neonRow.append(neonLabel, slider);

  const fpsRow = el('div', ROW_CSS);
  const fpsBtn = el('button', BTN_CSS);
  fpsBtn.type = 'button';
  fpsRow.append(fpsBtn);

  const glowRow = el('div', ROW_CSS);
  const glowBtn = el('button', BTN_CSS);
  glowBtn.type = 'button';
  glowRow.append(glowBtn);

  const closeBtn = el('button', BTN_CSS, 'Close');
  closeBtn.type = 'button';

  panel.append(title, neonRow, fpsRow, glowRow, closeBtn);
  const fpsEl = el('div', FPS_CSS);
  fpsEl.id = 'sow-fps';
  document.body.append(panel, fpsEl);

  const refresh = (): void => {
    const s = c.state;
    neonLabel.textContent = `Neon ${s.neon}`;
    if (document.activeElement !== slider) slider.value = String(s.neon);
    fpsBtn.textContent = `Show FPS: ${s.showFps ? 'on' : 'off'}`;
    glowBtn.textContent = `Glow: ${s.glowPath === 'bloom' ? 'Bloom' : 'Fallback'} (tap to switch)`;
    fpsEl.style.display = s.showFps ? 'block' : 'none';
    syncFpsLoop();
  };

  slider.addEventListener('input', () => c.neonInput(Number(slider.value)));
  slider.addEventListener('change', () => c.neonCommit(Number(slider.value)));
  fpsBtn.addEventListener('click', () => c.setShowFps(!c.state.showFps));
  glowBtn.addEventListener('click', () => c.setGlowPath(c.state.glowPath === 'bloom' ? 'fallback' : 'bloom'));
  closeBtn.addEventListener('click', () => close());
  // Keep panel touches away from the game's pointer handlers.
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());

  // FPS label loop, only while shown.
  const meter = createFpsMeter(60);
  let fpsRaf = 0;
  let lastT = 0;
  let lastLabel = 0;
  const fpsTick = (t: number): void => {
    fpsRaf = window.requestAnimationFrame(fpsTick);
    const measured = opts.frameTimeMs ? opts.frameTimeMs() : lastT > 0 ? t - lastT : 0;
    lastT = t;
    meter.push(measured);
    if (t - lastLabel >= LABEL_EVERY_MS) {
      lastLabel = t;
      fpsEl.textContent = fpsLabel(meter.fps(), opts.renderer.stats);
    }
  };
  function syncFpsLoop(): void {
    if (c.state.showFps && fpsRaf === 0) {
      lastT = 0;
      fpsRaf = window.requestAnimationFrame(fpsTick);
    } else if (!c.state.showFps && fpsRaf !== 0) {
      window.cancelAnimationFrame(fpsRaf);
      fpsRaf = 0;
    }
  }

  function open(): void {
    panel.style.display = 'block';
    refresh();
  }
  function close(): void {
    panel.style.display = 'none';
  }
  function toggle(): void {
    if (panel.style.display === 'none') open();
    else close();
  }

  // Two finger long press in the top left corner.
  const pointers = new Map<number, { x: number; y: number }>();
  let pressTimer = 0;
  const evaluate = (): void => {
    const n = cornerCount(pointers.values(), CORNER_PX);
    if (n >= 2 && pressTimer === 0) {
      pressTimer = window.setTimeout(() => {
        pressTimer = 0;
        toggle();
      }, LONG_PRESS_MS);
    } else if (n < 2 && pressTimer !== 0) {
      window.clearTimeout(pressTimer);
      pressTimer = 0;
    }
  };
  const onDown = (e: PointerEvent): void => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    evaluate();
  };
  const onMove = (e: PointerEvent): void => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    evaluate();
  };
  const onUp = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    evaluate();
  };
  const listenOpts: AddEventListenerOptions = { capture: true, passive: true };
  window.addEventListener('pointerdown', onDown, listenOpts);
  window.addEventListener('pointermove', onMove, listenOpts);
  window.addEventListener('pointerup', onUp, listenOpts);
  window.addEventListener('pointercancel', onUp, listenOpts);

  const unsub = c.subscribe(refresh);
  bindDevController(c);
  refresh();
  if (debugRequested(window.location.search)) open();

  return {
    controller: c,
    open,
    close,
    toggle,
    destroy(): void {
      unsub();
      if (fpsRaf !== 0) window.cancelAnimationFrame(fpsRaf);
      if (pressTimer !== 0) window.clearTimeout(pressTimer);
      window.removeEventListener('pointerdown', onDown, listenOpts);
      window.removeEventListener('pointermove', onMove, listenOpts);
      window.removeEventListener('pointerup', onUp, listenOpts);
      window.removeEventListener('pointercancel', onUp, listenOpts);
      panel.remove();
      fpsEl.remove();
      if (controller === c) bindDevController(null);
    },
  };
}
