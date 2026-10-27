// Boot, resize and loop wiring (docs/03 section 1, docs/04 sections 2, 4, 5, 6, 13).
// Boot order: load settings, create renderer, create world, attach input, start loop,
// register resize. The #sow-viewport and #sow-build labels are plain DOM so they still
// report if the renderer fails.
import { Application, Container, Graphics } from 'pixi.js';
import { getDebugInfo, runParticleStress, setDebugInfoSource, type DebugInfo } from './core/debug';
import { bus, type ViewportInfo } from './core/events';
import { createLoop, type Loop } from './core/loop';
import { initialDivisorState, nextDivisor, type DivisorState } from './core/perf';
import { hash01 } from './core/rng';
import { loadSettings } from './core/settings';
import { capDpr, fitArena, fmt3, readInsets, viewportLine } from './core/viewport';
import { clearEntities, createWorld, inlineRectLevel, Kind, liveEnemies, spawn, stepWorld, type World } from './game/world';
import type { InputState } from './input/types';
import type { LevelDef } from './levelgen/leveldef';
import { applyNeon } from './render/neon';

// ---------------------------------------------------------------------------------------
// W1 placeholders behind the 03 section 1 signatures. Delete this block and import
// createRenderer from './render/renderer' and attachTouch from './input/touch' once Glow
// and Thumbs merge. Contract main.ts relies on:
//   renderer.draw(w, alpha) updates the scene but does not call app.render(); main.ts does.
//   The renderer positions its world container from bus 'viewport:changed' (payload.fit).
// ---------------------------------------------------------------------------------------

interface GameRenderer {
  readonly app: Application;
  resize(cssW: number, cssH: number, dpr: number): void;
  setArena(def: LevelDef): void;
  draw(w: World, alpha: number): void;
  setBloomEnabled(on: boolean): void;
}

interface TouchHandle {
  state: InputState;
  reanchor(): void;
  detach(): void;
}

/** Placeholder: outlines only, one Graphics redrawn per frame. Not the real renderer. */
async function createRenderer(host: HTMLElement): Promise<GameRenderer> {
  const m = measure();
  const app = new Application();
  await app.init({
    width: m.cssW,
    height: m.cssH,
    resolution: m.renderDpr,
    autoDensity: true,
    antialias: false,
    background: 0x000000,
    preference: 'webgl', // SPEC fixes WebGL; do not let v8 pick WebGPU on Android
    powerPreference: 'high-performance',
    autoStart: false, // our loop calls app.render()
  });
  host.appendChild(app.canvas);
  app.stage.eventMode = 'none';
  const worldLayer = new Container({ label: 'world' });
  worldLayer.interactiveChildren = false;
  const arenaG = new Graphics();
  const dyn = new Graphics();
  worldLayer.addChild(arenaG);
  worldLayer.addChild(dyn);
  app.stage.addChild(worldLayer);
  bus.on('viewport:changed', (v) => {
    worldLayer.position.set(v.fit.x, v.fit.y);
    worldLayer.scale.set(v.fit.scale);
  });
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  return {
    app,
    resize(cssW, cssH, dpr) {
      app.renderer.resize(cssW, cssH, dpr);
    },
    setArena(def) {
      arenaG.clear();
      drawArenaOutline(arenaG, def);
    },
    draw(w, alpha) {
      dyn.clear();
      for (let i = 1; i < w.cap; i++) {
        if (w.alive[i] !== 1) continue;
        const x = lerp(w.prevX[i] ?? 0, w.x[i] ?? 0, alpha);
        const y = lerp(w.prevY[i] ?? 0, w.y[i] ?? 0, alpha);
        dyn.rect(x - (w.radius[i] ?? 8), y - (w.radius[i] ?? 8), (w.radius[i] ?? 8) * 2, (w.radius[i] ?? 8) * 2);
      }
      dyn.stroke({ width: 2.5, color: 0x4d8cff });
      const b = w.bullets;
      for (let i = 0; i < b.cap; i++) {
        if (b.alive[i] !== 1) continue;
        dyn.circle(lerp(b.prevX[i] ?? 0, b.x[i] ?? 0, alpha), lerp(b.prevY[i] ?? 0, b.y[i] ?? 0, alpha), 4);
      }
      dyn.fill({ color: 0xffd966 });
      const blinkOff = w.ship.invuln > 0 && Math.floor(w.ship.invuln * 20) % 2 === 1; // 10 Hz blink
      if (w.ship.active && !blinkOff) {
        const sx = lerp(w.prevX[0] ?? 0, w.x[0] ?? 0, alpha);
        const sy = lerp(w.prevY[0] ?? 0, w.y[0] ?? 0, alpha);
        const r = w.rot[0] ?? 0;
        const c = Math.cos(r);
        const s = Math.sin(r);
        // Nose 18 u ahead, base 20 u wide (docs/01 section 4.1).
        dyn.poly([sx + c * 18, sy + s * 18, sx - c * 8 - s * 10, sy - s * 8 + c * 10, sx - c * 8 + s * 10, sy - s * 8 - c * 10]);
        dyn.stroke({ width: 2.5, color: 0xffffff });
      }
    },
    setBloomEnabled() {
      // Placeholder has no bloom.
    },
  };
}

function drawArenaOutline(g: Graphics, def: LevelDef): void {
  const a = def.arena;
  const hw = a.width / 2;
  const hh = a.height / 2;
  switch (a.shape) {
    case 'rect':
    case 'rectObstacles':
      g.rect(-hw, -hh, a.width, a.height);
      break;
    case 'roundRect':
      g.roundRect(-hw, -hh, a.width, a.height, a.cornerRadius);
      break;
    case 'circle':
      g.circle(0, 0, hw);
      break;
    case 'hexagon': {
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) pts.push(Math.cos((i * Math.PI) / 3) * hw, Math.sin((i * Math.PI) / 3) * hw);
      g.poly(pts);
      break;
    }
  }
  for (const o of a.obstacles) g.rect(o.cx - o.w / 2, o.cy - o.h / 2, o.w, o.h);
  g.stroke({ width: 3, color: 0x5a6cff, alpha: 0.8 });
}

/** Placeholder: sticks never active until Thumbs merges. */
function attachTouch(_canvas: HTMLCanvasElement): TouchHandle {
  const state: InputState = {
    move: { active: false, x: 0, y: 0 },
    aim: { active: false, x: 0, y: 0 },
    bomb: false,
    superPressed: false,
    pause: false,
  };
  return { state, reanchor() {}, detach() {} };
}

// ---------------------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------------------

interface Measure {
  readonly cssW: number;
  readonly cssH: number;
  /** Raw window.devicePixelRatio, the value G0 needs to learn. */
  readonly dpr: number;
  /** Capped value used for the render target. */
  readonly renderDpr: number;
}

/** Edge: re-read visualViewport (falls back to window size) and the device pixel ratio. */
function measure(): Measure {
  const vv = window.visualViewport;
  const cssW = Math.round(vv ? vv.width : window.innerWidth);
  const cssH = Math.round(vv ? vv.height : window.innerHeight);
  const dpr = window.devicePixelRatio || 1;
  return { cssW, cssH, dpr, renderDpr: capDpr(dpr) };
}

function sameMeasure(a: Measure, b: Measure): boolean {
  return a.cssW === b.cssW && a.cssH === b.cssH && a.dpr === b.dpr;
}

function orientationType(): string {
  return screen.orientation ? screen.orientation.type : 'n/a';
}

/** Pure: second label line with the render dpr, physical screen size and orientation. */
function detailLine(m: Measure, screenW: number, screenH: number, orientation: string): string {
  return `render dpr ${fmt3(m.renderDpr)} | screen ${screenW}x${screenH} | ${orientation}`;
}

/** Pure: readable message from anything that was thrown. */
function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`missing element #${id}`);
  return el;
}

function readQuery(): { stress: number; particles: number; sprite: boolean } {
  const q = new URLSearchParams(window.location.search);
  const num = (k: string, def: number): number => {
    const v = Number.parseInt(q.get(k) ?? '', 10);
    return Number.isFinite(v) && v >= 0 ? v : def;
  };
  return { stress: num('stress', 0), particles: num('particles', 2000), sprite: q.get('glow') === 'sprite' };
}

/**
 * Spawn drifting Grunt dummies across the arena. Positions and headings come from hash01, so
 * the scene is the same on every run and no PRNG is touched.
 */
function stressEntities(w: World, count: number): number {
  clearEntities(w);
  const a = w.level.arena;
  let n = 0;
  for (let i = 0; i < count; i++) {
    const x = (hash01(i, 1) - 0.5) * a.width * 0.9;
    const y = (hash01(i, 2) - 0.5) * a.height * 0.9;
    const id = spawn(w, Kind.Grunt, x, y);
    if (id < 0) break;
    const heading = hash01(i, 3) * Math.PI * 2;
    const speed = 60 + 90 * hash01(i, 4);
    w.radius[id] = 14;
    w.vx[id] = Math.cos(heading) * speed;
    w.vy[id] = Math.sin(heading) * speed;
    n++;
  }
  return n;
}

interface SowDebug {
  stress(entities: number, particles?: number): string;
  info(): DebugInfo | null;
}

declare global {
  interface Window {
    sowDebug?: SowDebug;
  }
}

// ---------------------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------------------

async function boot(): Promise<void> {
  const buildLabel = byId('sow-build');
  const viewportLabel = byId('sow-viewport');
  const host = byId('game');
  buildLabel.textContent = `build ${__BUILD_ID__}`;

  let note = 'renderer: starting';
  let last: Measure = measure();

  const paintLabel = (): void => {
    viewportLabel.textContent = [
      viewportLine(last.cssW, last.cssH, last.dpr),
      detailLine(last, screen.width, screen.height, orientationType()),
      note,
    ].join('\n');
  };

  // Surface script errors on the phone, where there is no console.
  window.addEventListener('error', (e) => {
    note = `error: ${e.message}`;
    paintLabel();
  });
  window.addEventListener('unhandledrejection', (e) => {
    note = `rejection: ${describeError(e.reason)}`;
    paintLabel();
  });
  paintLabel(); // label works even if everything below fails

  // 1. Settings.
  const settings = loadSettings();
  const query = readQuery();

  // 2. Renderer.
  let renderer: GameRenderer | null = null;
  try {
    renderer = await createRenderer(host);
    note = `renderer: ${renderer.app.renderer.name}`;
  } catch (err) {
    note = `renderer failed: ${describeError(err)}`;
    console.error('[sow] renderer failed', err);
  }
  try {
    applyNeon(settings.neon);
  } catch (err) {
    console.warn('[sow] applyNeon unavailable', describeError(err));
  }
  let bloomOn = renderer !== null && !query.sprite;
  if (renderer !== null && query.sprite) renderer.setBloomEnabled(false);

  // 3. World. Foundry fixtures are not on main yet, so use the inline rect level.
  const level: LevelDef = inlineRectLevel();
  const world = createWorld(level);
  renderer?.setArena(level);

  // 4. Input.
  const touch: TouchHandle | null = renderer !== null ? attachTouch(renderer.app.canvas) : null;
  const idle: InputState = {
    move: { active: false, x: 0, y: 0 },
    aim: { active: false, x: 0, y: 0 },
    bomb: false,
    superPressed: false,
    pause: false,
  };

  // 5. Loop.
  let divisorState: DivisorState = initialDivisorState();
  let aspect = last.cssW / Math.max(1, last.cssH);
  let frameCount = 0;
  const loop: Loop = createLoop({
    step(dt) {
      stepWorld(world, dt, touch !== null ? touch.state : idle);
    },
    render(alpha) {
      if (renderer === null) return;
      renderer.draw(world, alpha);
      renderer.app.render();
      // Divisor policy (docs/04 section 13), evaluated every 15 rendered frames.
      if (++frameCount % 15 === 0) {
        const s = loop.stats;
        const next = nextDivisor(divisorState, {
          avgWorkMs: s.avgWorkMs,
          avgFrameMs: s.avgFrameMs,
          samples: s.samples,
          aspect,
          bloomOn,
          nowSec: performance.now() / 1000,
        });
        if (next.divisor !== divisorState.divisor) loop.setRenderDivisor(next.divisor);
        divisorState = next;
      }
    },
  });

  const info: DebugInfo = { frame: loop.stats, liveEntities: 0, liveBullets: 0, divisor: 1, bloom: bloomOn };
  setDebugInfoSource(() => {
    info.liveEntities = liveEnemies(world);
    info.liveBullets = world.bullets.liveCount;
    info.divisor = loop.divisor;
    info.bloom = bloomOn;
    return info;
  });
  // The devpanel switches glow paths through renderer.setBloomEnabled; wrap it so the
  // divisor policy and debug info see the current path.
  if (renderer !== null) {
    const r = renderer;
    const original = r.setBloomEnabled.bind(r);
    r.setBloomEnabled = (on: boolean): void => {
      bloomOn = on;
      original(on);
    };
  }

  window.sowDebug = {
    stress(entities: number, particles = 0): string {
      const n = stressEntities(world, Math.max(0, Math.floor(entities)));
      const p = particles > 0 && runParticleStress(Math.floor(particles));
      const msg = `[sow] stress ${n} entities, particles ${particles > 0 ? (p ? particles : 'no hook') : 0}`;
      console.info(msg);
      return msg;
    },
    info: () => getDebugInfo(),
  };
  if (query.stress > 0) window.sowDebug.stress(query.stress, query.particles);

  if (renderer !== null) loop.start();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      loop.stop();
    } else {
      if (renderer !== null) loop.start(); // start() resets the clock: no 50 ms lurch
      scheduleResize(); // the fold may have happened while hidden
    }
  });

  // 6. Resize (docs/04 section 4). Fold and unfold fire resize, orientationchange and
  // visualViewport resize in any order, more than once. Debounce to two animation frames, with
  // a timer fallback because rAF can stall while the display switches, then read once. A
  // settle check re-reads after 400 ms in case the first read caught an intermediate size.
  let applied: Measure | null = null;
  const applyViewport = (): void => {
    last = measure();
    aspect = last.cssW / Math.max(1, last.cssH);
    const insets = readInsets();
    const fit = fitArena(last.cssW, last.cssH, insets, level.arena.width, level.arena.height);
    renderer?.resize(last.cssW, last.cssH, last.renderDpr);
    touch?.reanchor();
    const payload: ViewportInfo = { cssW: last.cssW, cssH: last.cssH, dpr: last.renderDpr, insets, fit };
    bus.emit('viewport:changed', payload);
    console.log(viewportLine(last.cssW, last.cssH, last.dpr));
    console.log(detailLine(last, screen.width, screen.height, orientationType()));
    paintLabel();
    applied = last;
    window.setTimeout(() => {
      if (applied !== null && !sameMeasure(applied, measure())) scheduleResize();
    }, 400);
  };

  let rafA = 0;
  let rafB = 0;
  let timer = 0;
  let pending = false;
  const flush = (): void => {
    if (!pending) return;
    pending = false;
    cancelAnimationFrame(rafA);
    cancelAnimationFrame(rafB);
    window.clearTimeout(timer);
    applyViewport();
  };
  function scheduleResize(): void {
    if (pending) return;
    pending = true;
    rafA = requestAnimationFrame(() => {
      rafB = requestAnimationFrame(flush); // second frame: layout has settled after fold
    });
    timer = window.setTimeout(flush, 250);
  }
  window.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', scheduleResize);
  window.visualViewport?.addEventListener('resize', scheduleResize);
  screen.orientation?.addEventListener('change', scheduleResize);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(scheduleResize).observe(document.documentElement);
  applyViewport(); // first fit now, synchronously, so the first frame is placed correctly

  // Fullscreen needs a user activation; pointerup is the reliable one in Chrome (docs/04 section 6).
  const onFirstPointerUp = async (): Promise<void> => {
    window.removeEventListener('pointerup', onFirstPointerUp, true);
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      // Denied, unsupported, or already fullscreen via the manifest: ignore.
    }
    try {
      await (screen.orientation as ScreenOrientation & { lock(o: string): Promise<void> }).lock('landscape');
    } catch {
      // Not fullscreen or not supported: ignore.
    }
    scheduleResize();
  };
  window.addEventListener('pointerup', onFirstPointerUp, true);
}

void boot();
