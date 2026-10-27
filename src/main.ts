// Boot, resize and loop wiring (docs/03 section 1, docs/04 sections 2, 4, 5, 6, 13).
// Boot order: load settings, create renderer, create world, attach input, start loop,
// register resize. The #sow-viewport and #sow-build labels are plain DOM so they still
// report if the renderer fails.
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
import { createRenderer, type GameRenderer, type StickCircleLike } from './render/renderer';
import { attachTouch, type TouchHandle } from './input/touch';

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
      stepWorld(world, dt, touch !== null ? touch.poll() : idle);
    },
    render(alpha) {
      if (renderer === null) return;
      if (touch !== null) renderer.setSticks(stickCircles(touch));
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

/** Glue: Thumbs stick visuals to Glow stick circles. Rings 0.25, knobs 0.6 filled (docs/01 section 3). */
function stickCircles(t: TouchHandle): StickCircleLike[] {
  const out: StickCircleLike[] = [];
  const v = t.stickVisuals();
  for (const sv of [v.move, v.aim]) {
    if (sv === null) continue;
    out.push({ x: sv.ring.x, y: sv.ring.y, r: sv.ring.r, alpha: 0.25 });
    out.push({ x: sv.knob.x, y: sv.knob.y, r: sv.knob.r, alpha: 0.6, filled: true });
  }
  return out;
}
