// Boot, resize, loop and screen flow wiring (docs/03 sections 1, 8, 9, docs/04 sections 2, 4, 5,
// 6, 13, docs/01 section 10).
// Boot order: load settings, create renderer, create world, attach input, build UI, start loop,
// register resize. The #sow-viewport and #sow-build labels are plain DOM so they still
// report if the renderer fails.
// Screen flow: menu, level, pause, results and settings run through the pure state machine in
// ui/flow.ts. UI and game talk through the bus: game:start, game:pause, game:resume, game:quit,
// game:over and hud:score.
import { getDebugInfo, runParticleStress, setDebugInfoSource, type DebugInfo } from './core/debug';
import { bus, type ViewportInfo } from './core/events';
import { createLoop, type Loop } from './core/loop';
import { initialDivisorState, nextDivisor, type DivisorState } from './core/perf';
import { freshSeed, hash01 } from './core/rng';
import {
  loadRunSeed,
  loadSettings,
  loadUnlocked,
  recordAdventureScore,
  saveSetting,
  unlockLevel,
} from './core/settings';
import { capDpr, fitArena, fmt3, readInsets, viewportLine } from './core/viewport';
import { resetScore, scoreOf, stars } from './game/scoring';
import { clearEntities, createWorld, Kind, liveEnemies, spawn, stepWorld, type World } from './game/world';
import { installHistoryGuard } from './input/history';
import type { InputState } from './input/types';
import { VALID_FIXTURES } from './levelgen/fixtures';
import type { LevelDef } from './levelgen/leveldef';
import { installDevPanel, setGlowPath, setShowFps } from './render/devpanel';
import { applyNeon } from './render/neon';
import { createRenderer, type GameRenderer, type StickCircleLike } from './render/renderer';
import { attachTouch, type TouchHandle } from './input/touch';
import { createUiRoot } from './ui/dom';
import { initialFlow, reduceFlow, simRunning, type FlowAction, type FlowState, type LevelResult } from './ui/flow';
import { aspectClass, createHud, due, playRect, type AspectClass } from './ui/hud';
import { pickLevel, parseLevelQuery, type GeneratorModule, type LevelPick } from './ui/levelSource';
import { createMenuScreen } from './ui/menu';
import { goalMet, objectiveProgress, objectiveStatus, type ObjectiveSnapshot } from './ui/objective';
import { createPauseScreen } from './ui/pause';
import { createResultsScreen } from './ui/results';
import { createSettingsModel, createSettingsScreen } from './ui/settings';

// Foundry's generator, if src/levelgen/generator.ts exists at build time. import.meta.glob
// resolves to an empty record when the file is absent, so this builds either way.
const generatorModules = import.meta.glob<GeneratorModule>('./levelgen/generator.ts', { eager: true });
const generator: GeneratorModule | null = Object.values(generatorModules)[0] ?? null;

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

function readQuery(): { stress: number; particles: number; sprite: boolean; debug: boolean } {
  const q = new URLSearchParams(window.location.search);
  const num = (k: string, def: number): number => {
    const v = Number.parseInt(q.get(k) ?? '', 10);
    return Number.isFinite(v) && v >= 0 ? v : def;
  };
  return {
    stress: num('stress', 0),
    particles: num('particles', 2000),
    sprite: q.get('glow') === 'sprite',
    debug: q.get('debug') === '1',
  };
}

/**
 * Structural read of a number the sim may expose (lives, bombs, superCharge) on World or on
 * World.ship. Swarm adds these in W2; until then the caller's default applies.
 */
function simNumber(w: World, key: string): number | null {
  for (const host of [w, w.ship]) {
    const v: unknown = Reflect.get(host, key);
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

function snapshotOf(w: World): ObjectiveSnapshot {
  const s = scoreOf(w);
  return { elapsedSec: w.time, score: s.score, kills: s.kills, lives: simNumber(w, 'lives') };
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
  buildLabel.style.zIndex = '25'; // above the UI layer (z 20) so menus never hide the build id

  let note = 'renderer: starting';
  let last: Measure = measure();

  const paintLabel = (): void => {
    viewportLabel.textContent = [
      viewportLine(last.cssW, last.cssH, last.dpr),
      detailLine(last, screen.width, screen.height, orientationType()),
      note,
    ].join('\n');
  };

  // Surface script errors on the phone, where there is no console. The viewport label shows
  // with ?debug=1 or after an error; otherwise it would sit under the HUD score.
  const query = readQuery();
  let failed = false;
  const showLabel = (): void => {
    viewportLabel.style.display = query.debug || failed ? '' : 'none';
  };
  window.addEventListener('error', (e) => {
    note = `error: ${e.message}`;
    failed = true;
    showLabel();
    paintLabel();
  });
  window.addEventListener('unhandledrejection', (e) => {
    note = `rejection: ${describeError(e.reason)}`;
    failed = true;
    showLabel();
    paintLabel();
  });
  paintLabel(); // label works even if everything below fails

  // 1. Settings and progress. ?seed overrides the stored run seed for this session only.
  const settings = loadSettings();
  const levelQuery = parseLevelQuery(window.location.search);
  const runSeed = levelQuery.seed ?? loadRunSeed(freshSeed);

  // 2. Renderer.
  let renderer: GameRenderer | null = null;
  try {
    renderer = await createRenderer(host);
    note = `renderer: ${renderer.app.renderer.name}`;
  } catch (err) {
    note = `renderer failed: ${describeError(err)}`;
    failed = true;
    console.error('[sow] renderer failed', err);
  }
  showLabel();
  try {
    applyNeon(settings.neon);
  } catch (err) {
    console.warn('[sow] applyNeon unavailable', describeError(err));
  }
  let bloomOn = renderer !== null && !query.sprite;
  if (renderer !== null && query.sprite) renderer.setBloomEnabled(false);

  // 3. World. Generator level when Foundry's generator.ts is present, else a fixture.
  const menuLevel = (): number => levelQuery.level ?? loadUnlocked();
  let pick: LevelPick = pickLevel(generator, runSeed, menuLevel(), VALID_FIXTURES);
  let level: LevelDef = pick.def;
  let world: World = createWorld(level);
  renderer?.setArena(level);

  // 4. Input. Thumbs reads the safe area insets on attach and on every reanchor.
  const touch: TouchHandle | null = renderer !== null ? attachTouch(renderer.app.canvas, { insets: readInsets }) : null;
  installHistoryGuard(bus); // first system back press pauses instead of leaving (docs/04 section 11)
  const idle: InputState = {
    move: { active: false, x: 0, y: 0 },
    aim: { active: false, x: 0, y: 0 },
    bomb: false,
    superPressed: false,
    pause: false,
  };

  // 5. UI layer, HUD and screens. Every screen talks to the game through the bus or the flow
  // reducer; none of them touches the world.
  const uiRoot = createUiRoot();
  const hud = createHud(uiRoot);
  hud.listen(bus);
  let flow: FlowState = initialFlow(menuLevel());
  let endCheck = true; // fallback objective check; the stress hook turns it off
  let lastHudMs = Number.NEGATIVE_INFINITY;

  const emitHud = (): void => {
    const s = scoreOf(world);
    bus.emit('hud:score', {
      score: s.score,
      multiplier: s.multiplier,
      lives: simNumber(world, 'lives') ?? level.lives,
      bombs: simNumber(world, 'bombs') ?? level.bombs,
      superCharge: simNumber(world, 'superCharge') ?? 0,
    });
    hud.setObjective(objectiveProgress(level.objective, snapshotOf(world)));
  };

  /** Build a fresh world for the flow's current level (start, Next, Retry, Restart). */
  const startLevel = (index: number): void => {
    pick = pickLevel(generator, runSeed, index, VALID_FIXTURES);
    level = pick.def;
    world = createWorld(level);
    resetScore(world);
    renderer?.setArena(level);
    hud.setLevel(index, level.par, pick.hash);
    lastHudMs = Number.NEGATIVE_INFINITY;
    emitHud();
    console.info(`[sow] level ${index} ${pick.source} seed ${runSeed} hash ${pick.hash}`);
  };

  const menu = createMenuScreen(uiRoot, {
    adventure: () => bus.emit('game:start', { mode: 'adventure', levelIndex: menuLevel() }),
    endless: () => undefined, // W3
    settings: () => dispatch({ type: 'openSettings' }),
  });
  const pauseScreen = createPauseScreen(uiRoot, {
    resume: () => bus.emit('game:resume'),
    restart: () => dispatch({ type: 'restart' }),
    settings: () => dispatch({ type: 'openSettings' }),
    quit: () => bus.emit('game:quit'),
  });
  const results = createResultsScreen(uiRoot, {
    next: () => dispatch({ type: 'next' }),
    retry: () => dispatch({ type: 'retry' }),
    menu: () => dispatch({ type: 'menu' }),
  });
  // Show FPS and glow path go through Glow's exported functions only.
  const settingsModel = createSettingsModel({ setShowFps, setGlowPath });
  const settingsScreen = createSettingsScreen(uiRoot, settingsModel, () => dispatch({ type: 'closeSettings' }));

  const paintScreens = (): void => {
    for (const s of [menu, pauseScreen, results, settingsScreen]) s.hide();
    hud.hide();
    switch (flow.screen) {
      case 'menu':
        menu.setInfo(`Level ${menuLevel()}  Seed ${runSeed}${generator === null ? '  (fixture levels)' : ''}`);
        menu.show();
        break;
      case 'playing':
        hud.show();
        break;
      case 'paused':
        hud.show();
        pauseScreen.show();
        break;
      case 'results':
        if (flow.result !== null) results.showResult(flow.result);
        break;
      case 'settings':
        settingsScreen.show();
        break;
    }
  };

  function dispatch(a: FlowAction): void {
    const prev = flow;
    const next = reduceFlow(prev, a);
    if (next === prev) return;
    flow = next;
    if (next.run !== prev.run) startLevel(next.levelIndex);
    if (!simRunning(next)) renderer?.setSticks([]);
    paintScreens();
  }

  /** game:over from the sim (Swarm) or the fallback check below. */
  const onGameOver = (p: { score: number; stars: 0 | 1 | 2 | 3; levelIndex: number; mode: 'adventure' | 'endless' }): void => {
    if (flow.screen !== 'playing' && flow.screen !== 'paused') return;
    emitHud();
    const success = p.mode === 'adventure' && goalMet(level.objective, snapshotOf(world));
    const index = flow.levelIndex;
    const rec = recordAdventureScore(index, p.score, p.stars);
    if (success) unlockLevel(index + 1);
    const result: LevelResult = {
      mode: p.mode,
      levelIndex: index,
      score: p.score,
      stars: p.stars,
      success,
      par: level.par,
      best: rec.best,
      newBest: rec.newBest,
      hash: pick.hash,
    };
    dispatch({ type: 'over', result });
  };

  bus.on('game:start', (p) => dispatch({ type: 'start', mode: p.mode, levelIndex: p.levelIndex }));
  bus.on('game:pause', () => dispatch({ type: 'pause' }));
  bus.on('game:resume', () => dispatch({ type: 'resume' }));
  bus.on('game:quit', () => dispatch({ type: 'quit' }));
  bus.on('game:over', onGameOver);

  // 6. Loop. The sim steps only while the flow says playing; render runs on every screen so
  // the arena stays visible behind menus.
  let divisorState: DivisorState = initialDivisorState();
  let aspect = last.cssW / Math.max(1, last.cssH);
  let frameCount = 0;
  const loop: Loop = createLoop({
    step(dt) {
      if (!simRunning(flow)) return;
      const input = touch !== null ? touch.poll() : idle;
      if (input.pause) {
        bus.emit('game:pause');
        return;
      }
      stepWorld(world, dt, input);
      if (endCheck && objectiveStatus(level.objective, snapshotOf(world)) !== 'running') {
        const score = scoreOf(world).score;
        bus.emit('game:over', { score, stars: stars(score, level.par), levelIndex: flow.levelIndex, mode: flow.mode });
      }
    },
    render(alpha) {
      if (simRunning(flow)) {
        const now = performance.now();
        if (due(lastHudMs, now)) {
          lastHudMs = now;
          emitHud();
        }
      }
      if (renderer === null) return;
      if (touch !== null && simRunning(flow)) renderer.setSticks(stickCircles(touch));
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
    // Glow's debug panel binds setShowFps and setGlowPath to a live controller. Changes made in
    // the panel are mirrored into the settings model so the glow path persists too.
    const panel = installDevPanel({
      renderer: r,
      settings,
      saveSetting,
      frameTimeMs: () => loop.stats.avgFrameMs,
      glowPath: settingsModel.state.glowPath,
    });
    panel.controller.subscribe((s) => {
      settingsModel.syncShowFps(s.showFps);
      if (!query.sprite) settingsModel.syncGlowPath(s.glowPath);
    });
  }
  settingsModel.applyBoot();
  if (query.sprite) setGlowPath('fallback'); // ?glow=sprite: session only, not persisted

  window.sowDebug = {
    stress(entities: number, particles = 0): string {
      // The stress scene needs a stepping sim: start a level from the menu, skip the end check.
      endCheck = false;
      if (flow.screen === 'menu') dispatch({ type: 'start', mode: 'adventure', levelIndex: menuLevel() });
      const n = stressEntities(world, Math.max(0, Math.floor(entities)));
      const p = particles > 0 && runParticleStress(Math.floor(particles));
      const msg = `[sow] stress ${n} entities, particles ${particles > 0 ? (p ? particles : 'no hook') : 0}`;
      console.info(msg);
      return msg;
    },
    info: () => getDebugInfo(),
  };
  if (query.stress > 0) window.sowDebug.stress(query.stress, query.particles);

  hud.setLevel(menuLevel(), level.par, pick.hash);
  paintScreens();
  if (renderer !== null) loop.start();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      dispatch({ type: 'hidden' }); // auto pause; the player resumes from the pause screen
      loop.stop();
    } else {
      if (renderer !== null) loop.start(); // start() resets the clock: no 50 ms lurch
      scheduleResize(); // the fold may have happened while hidden
    }
  });

  // 7. Resize (docs/04 section 4). Fold and unfold fire resize, orientationchange and
  // visualViewport resize in any order, more than once. Debounce to two animation frames, with
  // a timer fallback because rAF can stall while the display switches, then read once. A
  // settle check re-reads after 400 ms in case the first read caught an intermediate size.
  let applied: Measure | null = null;
  let appliedClass: AspectClass | null = null;
  const applyViewport = (): void => {
    last = measure();
    aspect = last.cssW / Math.max(1, last.cssH);
    const insets = readInsets();
    const fit = fitArena(last.cssW, last.cssH, insets, level.arena.width, level.arena.height);
    const cls = aspectClass(last.cssW, last.cssH);
    renderer?.resize(last.cssW, last.cssH, last.renderDpr);
    renderer?.setPlayRect(playRect(last.cssW, last.cssH, insets, cls));
    touch?.reanchor(insets);
    hud.layout(last.cssW, last.cssH, touch !== null ? touch.buttonRects() : null);
    // Auto pause on aspect class change, that is a fold or unfold (docs/01 section 10).
    if (appliedClass !== null && cls !== appliedClass) dispatch({ type: 'pause' });
    appliedClass = cls;
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
