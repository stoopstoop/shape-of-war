// Pure state for the debug settings panel. No DOM, no pixi.js: every side effect goes
// through injected dependencies so tests run in node.

export type GlowPath = 'bloom' | 'fallback';

/** The settings this panel persists. A subset of core/settings Settings (03 section 8). */
export interface DevSettings {
  neon: number;
  showFps: boolean;
}

export interface DevPanelDeps {
  saveSetting<K extends keyof DevSettings>(k: K, v: DevSettings[K]): void;
  setBloomEnabled(on: boolean): void;
  applyNeon(n: number): void;
  /** Schedules cb on the next animation frame (requestAnimationFrame in the browser). */
  requestFrame(cb: () => void): void;
}

export interface DevState {
  neon: number;
  showFps: boolean;
  glowPath: GlowPath;
}

export interface DevController {
  readonly state: Readonly<DevState>;
  /** Slider input event: at most one applyNeon per animation frame. */
  neonInput(n: number): void;
  /** Slider change event (finger up): apply now and persist. */
  neonCommit(n: number): void;
  setShowFps(on: boolean): void;
  setGlowPath(p: GlowPath): void;
  getGlowPath(): GlowPath;
  /** Called after any state change; returns an unsubscribe function. */
  subscribe(fn: (s: Readonly<DevState>) => void): () => void;
}

function clampNeon(n: number): number {
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 70;
}

export function createDevController(deps: DevPanelDeps, initial: DevState): DevController {
  const state: DevState = { ...initial, neon: clampNeon(initial.neon) };
  const subs = new Set<(s: Readonly<DevState>) => void>();
  let pendingNeon = state.neon;
  let scheduled = false;

  const notify = (): void => {
    for (const fn of [...subs]) fn(state);
  };

  const flushNeon = (): void => {
    scheduled = false;
    deps.applyNeon(pendingNeon);
  };

  return {
    state,
    neonInput(n) {
      pendingNeon = clampNeon(n);
      state.neon = pendingNeon;
      if (!scheduled) {
        scheduled = true;
        deps.requestFrame(flushNeon);
      }
      notify();
    },
    neonCommit(n) {
      pendingNeon = clampNeon(n);
      state.neon = pendingNeon;
      if (!scheduled) deps.applyNeon(pendingNeon);
      deps.saveSetting('neon', pendingNeon);
      notify();
    },
    setShowFps(on) {
      state.showFps = on;
      deps.saveSetting('showFps', on);
      notify();
    },
    setGlowPath(p) {
      state.glowPath = p;
      deps.setBloomEnabled(p === 'bloom');
      notify();
    },
    getGlowPath() {
      return state.glowPath;
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}

/** Pure: rolling mean frame time over the last `size` samples. */
export interface FpsMeter {
  push(dtMs: number): void;
  fps(): number;
}

export function createFpsMeter(size = 60): FpsMeter {
  const buf = new Float64Array(size);
  let n = 0;
  let i = 0;
  let sum = 0;
  return {
    push(dtMs) {
      if (!(dtMs > 0) || dtMs > 1000) return;
      sum -= buf[i] ?? 0;
      buf[i] = dtMs;
      sum += dtMs;
      i = (i + 1) % size;
      if (n < size) n++;
    },
    fps() {
      return n === 0 || sum <= 0 ? 0 : (1000 * n) / sum;
    },
  };
}

export interface LabelStats {
  entities: number;
  bullets: number;
  particles: number;
  glowPath: GlowPath;
}

/** Pure: text of the FPS label. */
export function fpsLabel(fps: number, s: LabelStats): string {
  return `${Math.round(fps)} fps | ent ${s.entities} | bul ${s.bullets} | par ${s.particles} | ${s.glowPath}`;
}

/** Pure: is a CSS px point inside the top left corner hot zone. */
export function inCorner(x: number, y: number, size: number): boolean {
  return x >= 0 && y >= 0 && x <= size && y <= size;
}

/** Pure: number of tracked pointers inside the corner. */
export function cornerCount(points: Iterable<{ x: number; y: number }>, size: number): number {
  let c = 0;
  for (const p of points) if (inCorner(p.x, p.y, size)) c++;
  return c;
}

export type DevRow = 'fps' | 'glow' | 'stress';

/** Pure: the panel rows in order. No neon row: the Settings screen owns the slider. */
export function devPanelRows(hasStress: boolean): DevRow[] {
  return hasStress ? ['fps', 'glow', 'stress'] : ['fps', 'glow'];
}

/** Pure: ?debug=1 was requested. Kept for callers; the panel no longer opens on it. */
export function debugRequested(search: string): boolean {
  return new URLSearchParams(search).get('debug') === '1';
}
