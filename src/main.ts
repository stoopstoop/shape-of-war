// Temporary W0 entry point (Shipwright). Forge rewrites this file in W1.
// Purpose: prove a PixiJS v8 canvas runs on the Fold and log the viewport on fold and unfold.
// The two debug labels are plain DOM so they still report if the renderer fails.
import { Application, Graphics } from 'pixi.js';

const DPR_CAP = 2;

interface Measure {
  readonly cssW: number;
  readonly cssH: number;
  /** Raw window.devicePixelRatio, the value G0 needs to learn. */
  readonly dpr: number;
  /** Capped value used for the render target. */
  readonly renderDpr: number;
}

interface Scene {
  readonly app: Application;
  readonly triangle: Graphics;
}

/** Pure: round to three decimals so 2.6250000001 prints as 2.625. */
function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** Pure: the line that is logged and drawn on screen for every resize. */
function viewportLine(m: Measure): string {
  return `[sow] viewport ${m.cssW}x${m.cssH} @ ${fmt(m.dpr)}`;
}

/** Pure: second line with the render dpr, physical screen size and orientation. */
function detailLine(m: Measure, screenW: number, screenH: number, orientation: string): string {
  return `render dpr ${fmt(m.renderDpr)} | screen ${screenW}x${screenH} | ${orientation}`;
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

/** Edge: re-read visualViewport (falls back to window size) and the device pixel ratio. */
function measure(): Measure {
  const vv = window.visualViewport;
  const cssW = Math.round(vv ? vv.width : window.innerWidth);
  const cssH = Math.round(vv ? vv.height : window.innerHeight);
  const dpr = window.devicePixelRatio || 1;
  return { cssW, cssH, dpr, renderDpr: Math.min(dpr, DPR_CAP) };
}

/** Edge: create the Pixi application and the one neon triangle. */
async function createScene(host: HTMLElement, m: Measure): Promise<Scene> {
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
  });
  host.appendChild(app.canvas);
  const pts = [0, -48, 42, 36, -42, 36];
  const triangle = new Graphics()
    .poly(pts)
    .stroke({ width: 14, color: 0x00e5ff, alpha: 0.28 }) // outer glow stroke
    .poly(pts)
    .stroke({ width: 4, color: 0x7dffff, alpha: 1 }); // core line
  app.stage.addChild(triangle);
  return { app, triangle };
}

/** Edge: fit the renderer and re-centre the triangle for a new viewport. */
function applyToScene(scene: Scene, m: Measure): void {
  scene.app.renderer.resize(m.cssW, m.cssH, m.renderDpr);
  scene.triangle.position.set(m.cssW / 2, m.cssH / 2);
}

async function boot(): Promise<void> {
  const buildLabel = byId('sow-build');
  const viewportLabel = byId('sow-viewport');
  const host = byId('game');
  buildLabel.textContent = `build ${__BUILD_ID__}`;

  let scene: Scene | null = null;
  let note = 'renderer: starting';
  let last: Measure = measure();

  const render = (): void => {
    const orientation = screen.orientation ? screen.orientation.type : 'n/a';
    viewportLabel.textContent = [
      viewportLine(last),
      detailLine(last, screen.width, screen.height, orientation),
      note,
    ].join('\n');
  };

  const onViewportChanged = (): void => {
    last = measure();
    if (scene !== null) applyToScene(scene, last);
    console.log(viewportLine(last));
    console.log(detailLine(last, screen.width, screen.height, screen.orientation ? screen.orientation.type : 'n/a'));
    render();
  };

  // Fold and unfold can fire several events in any order: wait two frames, then read once.
  let pending = 0;
  const scheduleResize = (): void => {
    if (pending !== 0) return;
    pending = requestAnimationFrame(() => {
      pending = requestAnimationFrame(() => {
        pending = 0;
        onViewportChanged();
      });
    });
  };
  window.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', scheduleResize);
  window.visualViewport?.addEventListener('resize', scheduleResize);

  // Surface script errors on the phone, where there is no console.
  window.addEventListener('error', (e) => {
    note = `error: ${e.message}`;
    render();
  });
  window.addEventListener('unhandledrejection', (e) => {
    note = `rejection: ${describeError(e.reason)}`;
    render();
  });

  // Fullscreen needs a user activation; pointerup is the reliable one in Chrome.
  const onFirstPointerUp = async (): Promise<void> => {
    window.removeEventListener('pointerup', onFirstPointerUp, true);
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      // Denied, unsupported, or already fullscreen via the manifest: ignore.
    }
  };
  window.addEventListener('pointerup', onFirstPointerUp, true);

  onViewportChanged(); // label works even if the renderer below fails

  try {
    scene = await createScene(host, last);
    note = `renderer: ${scene.app.renderer.name}`;
    onViewportChanged(); // apply the latest size to the new renderer and refresh the label
  } catch (err) {
    note = `renderer failed: ${describeError(err)}`;
    console.error('[sow] renderer failed', err);
    render();
  }
}

void boot();
