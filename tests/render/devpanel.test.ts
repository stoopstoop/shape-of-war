// Pure state functions behind the dev panel. No DOM: dependencies are mocks.
import { describe, expect, it, vi } from 'vitest';
import { bindDevController, getGlowPath, setGlowPath, setShowFps } from '../../src/render/devpanel';
import {
  cornerCount,
  createDevController,
  createFpsMeter,
  debugRequested,
  devPanelRows,
  fpsLabel,
  type DevPanelDeps,
  type DevState,
} from '../../src/render/devpanelState';

interface Mocks {
  deps: DevPanelDeps;
  saves: [string, number | boolean][];
  bloom: boolean[];
  neon: number[];
  frames: (() => void)[];
}

function mocks(): Mocks {
  const m: Mocks = {
    saves: [],
    bloom: [],
    neon: [],
    frames: [],
    deps: {
      saveSetting: (k, v) => {
        m.saves.push([k, v]);
      },
      setBloomEnabled: (on) => {
        m.bloom.push(on);
      },
      applyNeon: (n) => {
        m.neon.push(n);
      },
      requestFrame: (cb) => {
        m.frames.push(cb);
      },
    },
  };
  return m;
}

const START: DevState = { neon: 70, showFps: false, glowPath: 'bloom' };

describe('dev controller', () => {
  it('showFps toggle persists through saveSetting', () => {
    const m = mocks();
    const c = createDevController(m.deps, START);
    c.setShowFps(true);
    c.setShowFps(false);
    expect(m.saves).toEqual([
      ['showFps', true],
      ['showFps', false],
    ]);
    expect(c.state.showFps).toBe(false);
  });

  it('glow path toggle calls setBloomEnabled with the right value', () => {
    const m = mocks();
    const c = createDevController(m.deps, START);
    c.setGlowPath('fallback');
    expect(m.bloom).toEqual([false]);
    expect(c.getGlowPath()).toBe('fallback');
    c.setGlowPath('bloom');
    expect(m.bloom).toEqual([false, true]);
    expect(c.getGlowPath()).toBe('bloom');
    expect(m.saves).toEqual([]); // session only in W1
  });

  it('throttles slider input to one applyNeon per frame and saves only on change', () => {
    const m = mocks();
    const c = createDevController(m.deps, START);
    c.neonInput(10);
    c.neonInput(20);
    c.neonInput(30.4);
    expect(m.frames).toHaveLength(1);
    expect(m.neon).toEqual([]);
    m.frames.shift()?.();
    expect(m.neon).toEqual([30]);
    expect(m.saves).toEqual([]);
    c.neonCommit(42);
    expect(m.neon).toEqual([30, 42]);
    expect(m.saves).toEqual([['neon', 42]]);
    c.neonInput(150);
    expect(c.state.neon).toBe(100);
  });

  it('commit during a pending frame applies once, from the frame', () => {
    const m = mocks();
    const c = createDevController(m.deps, START);
    c.neonInput(5);
    c.neonCommit(6);
    expect(m.neon).toEqual([]);
    m.frames.shift()?.();
    expect(m.neon).toEqual([6]);
    expect(m.saves).toEqual([['neon', 6]]);
  });

  it('notifies subscribers', () => {
    const m = mocks();
    const c = createDevController(m.deps, START);
    const fn = vi.fn();
    const off = c.subscribe(fn);
    c.setShowFps(true);
    off();
    c.setShowFps(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('module exports for Ledger', () => {
  it('buffer before binding, then forward to the controller', () => {
    const m = mocks();
    setShowFps(true);
    setGlowPath('fallback');
    expect(getGlowPath()).toBe('fallback');
    const c = createDevController(m.deps, START);
    bindDevController(c);
    expect(m.saves).toEqual([['showFps', true]]);
    expect(m.bloom).toEqual([false]);
    setGlowPath('bloom');
    expect(m.bloom).toEqual([false, true]);
    expect(getGlowPath()).toBe('bloom');
    setShowFps(false);
    expect(m.saves).toEqual([
      ['showFps', true],
      ['showFps', false],
    ]);
    bindDevController(null);
  });

  it('accepts a core/settings style generic saveSetting with extra keys', () => {
    interface Settings {
      neon: number;
      volume: number;
      showFps: boolean;
    }
    const store: Partial<Settings> = {};
    function saveSetting<K extends keyof Settings>(k: K, v: Settings[K]): void {
      store[k] = v;
    }
    const m = mocks();
    const c = createDevController({ ...m.deps, saveSetting }, START);
    c.setShowFps(true);
    expect(store.showFps).toBe(true);
  });
});

describe('helpers', () => {
  it('fps meter averages frame times', () => {
    const f = createFpsMeter(4);
    expect(f.fps()).toBe(0);
    for (let i = 0; i < 8; i++) f.push(1000 / 120);
    expect(f.fps()).toBeCloseTo(120, 6);
    f.push(-1);
    f.push(5000);
    expect(f.fps()).toBeCloseTo(120, 6);
  });

  it('formats the label with fps, counts and glow path', () => {
    expect(fpsLabel(59.6, { entities: 400, bullets: 12, particles: 2000, glowPath: 'fallback' })).toBe(
      '60 fps | ent 400 | bul 12 | par 2000 | fallback',
    );
  });

  it('counts pointers in the top left corner', () => {
    const pts = [
      { x: 10, y: 10 },
      { x: 100, y: 50 },
      { x: 300, y: 10 },
    ];
    expect(cornerCount(pts, 110)).toBe(2);
    expect(cornerCount(pts, 50)).toBe(1);
  });

  it('panel rows: FPS, glow path and optional stress, never a neon row', () => {
    expect(devPanelRows(false)).toEqual(['fps', 'glow']);
    expect(devPanelRows(true)).toEqual(['fps', 'glow', 'stress']);
    expect(devPanelRows(true)).not.toContain('neon');
  });

  it('reads ?debug=1', () => {
    expect(debugRequested('?debug=1')).toBe(true);
    expect(debugRequested('?stress=400&debug=1')).toBe(true);
    expect(debugRequested('?debug=0')).toBe(false);
    expect(debugRequested('')).toBe(false);
  });
});
