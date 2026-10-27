# Shape of War: device and PWA engineering

Target: Samsung Galaxy Z Fold 7, Chrome for Android (default) or Samsung Internet. Derived from SPEC.md sections 1, 2 and 5. If this file conflicts with SPEC.md, SPEC.md wins.

## Bad news first

1. The Android system back gesture cannot be disabled by a web page, fullscreen or not. A swipe from the left or right screen edge will try to navigate back. Mitigation in section 11: a history guard turns the first back into "pause", not "exit". Floating sticks must also ignore touches that start within 24 CSS px of the left and right edges.
2. `orientation: landscape` in the manifest is a request, not a guarantee. On the near square main screen Chrome may letterbox or rotate unexpectedly when unfolding. The game must render correctly in any orientation; the lock only reduces rotation churn. Measured at G0.
3. `screen.orientation.lock()` only works while in fullscreen and throws otherwise. Always wrap it in try/catch.
4. Real CSS viewport sizes and DPR on the Fold 7 are unknown until G0. Do not hardcode them. The values in section 1 are physical pixels from SPEC; CSS sizes are measured on device.
5. Samsung adaptive refresh may cap Chrome at 60 Hz in some power modes (Power saving on, or Motion smoothness set to Standard). A 60 fps reading on the cover screen at G1 may be a device setting, not our bug. Check Settings, Display, Motion smoothness before blaming code.
6. The service worker only activates over HTTPS (or localhost). Testing over the Mac's LAN IP at `http://192.168.x.x:5173` will run the game but will not test install, offline, or fullscreen launch. Those are tested on the GitHub Pages URL only.

## Knowns and unknowns

| Item | Status |
|---|---|
| Cover screen 2520 x 1080 physical, 21:9 | Known (SPEC 1) |
| Main screen 2184 x 1968 physical, roughly 10:9 | Known (SPEC 1) |
| Cover and main DPR in Chrome | Unknown. SPEC estimates about 3 on main. Logged at G0 |
| CSS viewport sizes folded and unfolded | Unknown. Logged at G0 |
| Whether resize fires once or several times per fold | Unknown. Handled by debounce either way |
| Display cutout position in landscape | Unknown. Handled by `env(safe-area-inset-*)` |
| Pointer Events support | Known: Chrome and Samsung Internet support them fully |

## 1. Screens

| Screen | Physical px (landscape) | Aspect | Notes |
|---|---|---|---|
| Cover (folded) | 2520 x 1080 | 21:9 (2.33:1) | Very wide. Thumbs cover a large share of the arena. Target 120 fps |
| Main (unfolded) | 2184 x 1968 | roughly 10:9 (1.11:1) | Near square. Most pixels. Hold 60 fps minimum |

Render target pixel counts at DPR cap 2 depend on the measured CSS size. Example only: if the main screen reports DPR 2.75 and CSS 794 x 716, the capped render target is 1588 x 1432 (2.27 MP) instead of 2184 x 1968 (4.30 MP), roughly half the fill cost. Replace with measured numbers at G0.

## 2. DPR handling

```ts
export const DPR_CAP = 2;
export function renderDpr(): number {
  return Math.min(window.devicePixelRatio || 1, DPR_CAP);
}
```
Rules:
1. Canvas CSS size equals the visual viewport CSS size. Backing store equals CSS size x `renderDpr()`. Pixi does this with `autoDensity: true` and `resolution: renderDpr()`.
2. Input coordinates are in CSS px (`PointerEvent.clientX/Y`). Never multiply them by DPR.
3. Stick radius is defined in CSS px (120 at DPR 1, see section 9). CSS px are already DPR independent, so 120 CSS px is the same physical size on any DPR. The "at DPR 1" wording in SPEC means "in CSS px".
4. Re-read DPR on every resize. It can change when the display zoom changes or the app moves between screens.

## 3. Viewport meta and base CSS

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<meta name="theme-color" content="#000000" />
<meta name="mobile-web-app-capable" content="yes" />
<link rel="manifest" href="%BASE_URL%manifest.webmanifest" />
```

```css
html, body {
  margin: 0; padding: 0; height: 100%; width: 100%;
  background: #000; overflow: hidden;
  overscroll-behavior: none;
  touch-action: none;
  -webkit-user-select: none; user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
#game { position: fixed; inset: 0; }
#game canvas { display: block; touch-action: none; }
```
`viewport-fit=cover` is required for `env(safe-area-inset-*)` to return non-zero values.

## 4. Resize on fold and unfold

SPEC 5: re-measure `visualViewport`, re-fit the arena, re-anchor sticks, no reload. Fold and unfold can fire `resize`, `orientationchange` and `visualViewport` `resize` in any order and more than once. Debounce to the next two animation frames and read the final size once.

```ts
// src/main.ts (Forge glue)
import { bus } from './core/events';
import { renderDpr } from './core/viewport';

let pending = 0;
function measure(): { cssW: number; cssH: number; dpr: number } {
  const vv = window.visualViewport;
  const cssW = Math.round(vv ? vv.width : window.innerWidth);
  const cssH = Math.round(vv ? vv.height : window.innerHeight);
  return { cssW, cssH, dpr: renderDpr() };
}

function scheduleResize(): void {
  if (pending) return;
  pending = requestAnimationFrame(() => {
    pending = requestAnimationFrame(() => {   // second frame: layout has settled after fold
      pending = 0;
      const m = measure();
      console.info('[sow] viewport', m.cssW, 'x', m.cssH, 'dpr', window.devicePixelRatio, 'render dpr', m.dpr,
                   'screen', screen.width, 'x', screen.height, screen.orientation?.type);  // G0 requirement
      bus.emit('viewport:changed', m);
    });
  });
}

window.addEventListener('resize', scheduleResize);
window.addEventListener('orientationchange', scheduleResize);
window.visualViewport?.addEventListener('resize', scheduleResize);
scheduleResize();
```

Listeners of `viewport:changed`:
1. Renderer: `app.renderer.resize(cssW, cssH, dpr)`, update bloom `filterArea`, recompute world scale (below), redraw grid.
2. Touch: cancel any active sticks (`reanchor()`), recompute half split at `cssW / 2`, recompute button rects.
3. Game: if a level is running, auto pause. Why: a fold mid fight changes the ship's on screen size and the player needs a moment.

Arena fit (letterbox inside the safe play rect, SPEC 5):
```ts
export function fitArena(cssW: number, cssH: number, ins: Insets, arenaW: number, arenaH: number) {
  const hudTop = 40, hudBottom = 0;                   // CSS px reserved for HUD strip
  const rx = ins.left, ry = ins.top + hudTop;
  const rw = cssW - ins.left - ins.right, rh = cssH - ins.top - ins.bottom - hudTop - hudBottom;
  const scale = Math.min(rw / arenaW, rh / arenaH);
  return { scale, x: rx + rw / 2, y: ry + rh / 2 };   // world container position is the arena centre
}
```
For G0, an on screen debug line (DOM, top left) shows the same values as the console log, so Ryan can read them on the phone without a cable.

## 5. Safe area insets

Read CSS env values via a hidden probe element, since JS has no direct API.

```ts
// src/core/viewport.ts
export interface Insets { top: number; right: number; bottom: number; left: number; }
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;' +
  'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.appendChild(probe);
export function readInsets(): Insets {
  const cs = getComputedStyle(probe);
  return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0,
           bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
}
```
Call `readInsets()` inside the resize handler. HUD and buttons anchor to the inset rect; the arena fits inside it; the black background fills the cutout area.

## 6. Fullscreen on first gesture

Manifest `display: fullscreen` covers the installed launch. In a browser tab (dev, first visit) request fullscreen on the first `pointerup`. A `pointerup` (not `pointerdown`) is a reliable user activation in Chrome.

```ts
// src/input/gesture.ts (Thumbs)
let unlocked = false;
export function onFirstGesture(cb: () => void): void {
  const handler = async () => {
    if (unlocked) return;
    unlocked = true;
    window.removeEventListener('pointerup', handler, true);
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch { /* already fullscreen via manifest or denied: ignore */ }
    try { await (screen.orientation as ScreenOrientation & { lock(o: string): Promise<void> }).lock('landscape'); }
    catch { /* not fullscreen or not supported: ignore */ }
    cb();   // audio unlock, section 12
  };
  window.addEventListener('pointerup', handler, true);
}
```
verify against node_modules/pixi.js types at W0 (here: check whether `lib.dom.d.ts` in the installed TypeScript already types `ScreenOrientation.lock`; if yes, drop the cast).

If the user exits fullscreen (system swipe), show a small "tap to resume fullscreen" pill on the pause screen that calls `requestFullscreen` again from its click.

## 7. Manifest

File `public/manifest.webmanifest`. Paths are relative so they resolve under the Pages base `/shape-of-war/`.

```json
{
  "name": "Shape of War",
  "short_name": "Shape of War",
  "description": "Twin-stick neon arena shooter for foldables.",
  "id": "./",
  "start_url": "./",
  "scope": "./",
  "display": "fullscreen",
  "display_override": ["fullscreen", "standalone"],
  "orientation": "landscape",
  "background_color": "#000000",
  "theme_color": "#000000",
  "categories": ["games"],
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
Icons: original artwork only (SPEC 1.5). A neon cyan triangle on black. Maskable variants keep the triangle inside the central 80 percent safe zone. Shipwright generates them at W0 from an SVG with a script (no external image assets).

## 8. Service worker

Strategy: precache the app shell, no runtime caching. Why: the whole game is static JS, HTML, the manifest and four icons. There are no API calls, no images or audio fetched at runtime, so a runtime cache adds nothing.

1. Generated by vite-plugin-pwa (Workbox `generateSW`), configured in `vite.config.ts` (see `03-architecture.md` section 10).
2. `globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}']`, `navigateFallback: 'index.html'`, `runtimeCaching: []`.
3. `registerType: 'autoUpdate'` with `skipWaiting` and `clientsClaim`: a new deploy takes effect on the next launch after the SW has downloaded it. Practically, after a deploy Ryan opens the app once online, closes it, opens it again.
4. Offline test: airplane mode, launch from the home screen icon, the menu appears. Runbook section F.
5. Do not cache `localStorage`; it is already local.

## 9. Pointer Events virtual sticks

SPEC 5: Pointer Events only, floating origin, first touch in the left half is the move stick, first touch in the right half is the aim stick, 120 px max radius (CSS px), dead zone 10 percent.

```ts
// src/input/touch.ts (Thumbs)
export interface StickState { active: boolean; x: number; y: number; }      // after dead zone, in [-1, 1]
interface Stick extends StickState { id: number; ox: number; oy: number; px: number; py: number; }

const RADIUS = 120;          // CSS px
const DEAD = 0.10;           // fraction of RADIUS
const EDGE_GUARD = 24;       // CSS px, ignore starts near system back gesture edges

export function attachTouch(canvas: HTMLCanvasElement, hitButton: (x: number, y: number) => boolean) {
  const move: Stick = { id: -1, active: false, x: 0, y: 0, ox: 0, oy: 0, px: 0, py: 0 };
  const aim: Stick = { id: -1, active: false, x: 0, y: 0, ox: 0, oy: 0, px: 0, py: 0 };
  let halfX = canvas.clientWidth / 2;

  const update = (s: Stick, cx: number, cy: number) => {
    let dx = cx - s.ox, dy = cy - s.oy;
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; }       // clamp knob to ring
    s.px = s.ox + dx; s.py = s.oy + dy;
    const m = Math.min(d, RADIUS) / RADIUS;
    if (m < DEAD) { s.x = 0; s.y = 0; return; }
    const k = (m - DEAD) / (1 - DEAD) / (m || 1);                 // rescale so output starts at 0 outside the dead zone
    s.x = (dx / RADIUS) * k; s.y = (dy / RADIUS) * k;
  };

  const down = (e: PointerEvent) => {
    e.preventDefault();
    const x = e.clientX, y = e.clientY;
    if (hitButton(x, y)) return;                                  // buttons handle their own pointers
    if (x < EDGE_GUARD || x > canvas.clientWidth - EDGE_GUARD) return;
    const s = x < halfX ? move : aim;
    if (s.id !== -1) return;                                      // first touch in that half wins
    s.id = e.pointerId; s.active = true; s.ox = s.px = x; s.oy = s.py = y; s.x = s.y = 0;
    canvas.setPointerCapture(e.pointerId);
  };
  const moveH = (e: PointerEvent) => {
    e.preventDefault();
    if (e.pointerId === move.id) update(move, e.clientX, e.clientY);
    else if (e.pointerId === aim.id) update(aim, e.clientX, e.clientY);
  };
  const up = (e: PointerEvent) => {
    e.preventDefault();
    for (const s of [move, aim]) if (e.pointerId === s.id) { s.id = -1; s.active = false; s.x = s.y = 0; }
  };

  canvas.addEventListener('pointerdown', down, { passive: false });
  canvas.addEventListener('pointermove', moveH, { passive: false });
  canvas.addEventListener('pointerup', up, { passive: false });
  canvas.addEventListener('pointercancel', up, { passive: false });
  canvas.addEventListener('lostpointercapture', up);

  return {
    move, aim,
    reanchor() { halfX = canvas.clientWidth / 2; move.id = aim.id = -1; move.active = aim.active = false;
                 move.x = move.y = aim.x = aim.y = 0; },
    detach() { canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', moveH);
               canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
               canvas.removeEventListener('lostpointercapture', up); },
  };
}
```
Notes:
1. Aim fires while `aim.active` and the knob is outside the dead zone (SPEC 3.5 "auto-fires while held"). Decided here: firing starts only when outside the dead zone, so a resting thumb does not spray in a stale direction. Fable may overrule at G1.
2. The ship moves at `maxSpeed * |stick|` (analog). Direction from `atan2(y, x)`.
3. Use `getCoalescedEvents()` only if G1 shows jittery aim. Not needed by default.
4. Render the ring (radius 120) and knob at `ox, oy` and `px, py` in CSS px, in the `sticks` Graphics outside the bloom container, at low alpha so the arena stays readable.

## 10. On-screen buttons

SPEC 5: bomb bottom centre, super above bomb, pause top right.

| Button | Anchor | Visual size (CSS px) | Hit target (CSS px) |
|---|---|---|---|
| Bomb | bottom centre, 16 px above bottom inset | 64 circle | 88 circle |
| Super | centred above bomb, 12 px gap | 56 circle | 76 circle |
| Pause | top right, 12 px inside right and top insets | 40 square | 56 square |

Why 88: well above the 48 dp Android minimum, and bomb is a panic press. Hit tests run before stick assignment, so a thumb landing on bomb does not create a stick. Buttons trigger on `pointerdown` (not up). Why: latency matters for a bomb.

Each button tracks its own `pointerId` so a held stick and a bomb tap on another finger coexist.

## 11. Preventing browser gestures

| Gesture | Prevention |
|---|---|
| Pinch zoom, double tap zoom | `touch-action: none` on html, body, canvas; viewport `user-scalable=no` |
| Pull to refresh, overscroll glow | `overscroll-behavior: none` on html and body |
| Text selection, long press callout | `user-select: none`, `-webkit-touch-callout: none` |
| Context menu on long press | `window.addEventListener('contextmenu', e => e.preventDefault())` |
| Touch scroll fallback | `document.addEventListener('touchmove', e => e.preventDefault(), { passive: false })` |
| Tap highlight | `-webkit-tap-highlight-color: transparent` |
| System back gesture | Cannot be prevented. History guard below |

History guard (first back pauses instead of leaving):
```ts
history.pushState({ sow: 1 }, '');
window.addEventListener('popstate', () => {
  bus.emit('game:pause');
  history.pushState({ sow: 1 }, '');   // re-arm
});
```
Quit is only via the pause menu "Quit to menu". On Android a second rapid back may still close the PWA; that is acceptable for v1.

SPEC 5 asks for `preventDefault` on all touch events. `touch-action: none` plus the listeners above satisfies it. Do not attach a non passive `touchstart` listener to `window` as well as Pointer Events on the canvas; one non passive `touchmove` on document is enough.

## 12. Audio unlock

Chrome keeps an `AudioContext` suspended until a user gesture. Create it lazily and resume it inside the first gesture handler (section 6).

```ts
// src/audio/synth.ts
let ctx: AudioContext | null = null;
export async function unlockAudio(): Promise<void> {
  if (!ctx) ctx = new AudioContext({ latencyHint: 'interactive' });
  if (ctx.state !== 'running') { try { await ctx.resume(); } catch { /* ignore */ } }
  // play a 1 sample silent buffer to fully unlock on some Android builds
  const b = ctx.createBuffer(1, 1, 22050); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) void ctx?.suspend(); else void ctx?.resume(); });
```
Vibrate on death only: `navigator.vibrate?.(60)` (SPEC 5).

## 13. Battery and thermal

Frame budgets:
| Mode | Frame budget | Sim steps per frame |
|---|---|---|
| 120 fps render | 8.33 ms | 1 |
| 60 fps render | 16.67 ms | 2 |

Sim cost target: under 1.5 ms per step at 400 entities, so two steps fit in a 60 fps frame with room for render.

Drop to 60 fps render (sim stays 120 Hz via `loop.setRenderDivisor(2)`) when either:
1. Rolling average frame time over the last 120 frames exceeds 9.5 ms while in 120 Hz mode (we are missing 120 anyway), or
2. Screen is the main screen (aspect below 1.5) and bloom is on. Why: SPEC only requires 60 on the main screen, and halving render work there buys thermal headroom.

Return to 120 Hz render only on the cover screen, and only if the average drops below 6.5 ms for 5 seconds. Hysteresis prevents flapping. Decided here, not in SPEC. Fable may overrule.

Thermal: after 10 to 15 minutes of play Android may throttle the GPU. Signs: frame time creeps up slowly with a constant entity count. The next step after 60 fps render is lowering bloom resolution (03-architecture section 6), then the fallback path. Do not chase thermal issues before G4.

## 14. Performance test protocol (Chrome remote debugging over USB)

Prerequisites: Mac with Chrome, USB C cable, Fold 7.

1. On the Fold: Settings, About phone, Software information, tap "Build number" 7 times. Enter your PIN. Expected: toast "Developer mode has been turned on".
2. On the Fold: Settings, Developer options, turn on "USB debugging". Confirm the dialog.
3. Connect the Fold to the Mac by USB. On the Fold, a dialog "Allow USB debugging?" appears with the Mac's key fingerprint. Tick "Always allow from this computer", tap "Allow".
4. On the Fold, open Chrome and load the GitHub Pages URL (or launch the installed PWA; installed PWAs also appear in inspect).
5. On the Mac, open Chrome and go to `chrome://inspect/#devices`. Expected: "Samsung SM-F96..." (exact model string unknown) listed with the open tab under it. If not listed: check "Discover USB devices" is ticked, reconnect the cable, and re-accept the dialog on the phone.
6. Click "inspect" under the Shape of War tab. Expected: a DevTools window with a live mirror of the phone screen.
7. In DevTools, press Cmd Shift P, type "Show frame rendering stats", Enter. Expected: an FPS meter overlay on the phone.
8. Start a stress run: on the phone, open the debug menu (Settings screen, tap the version label 5 times, Proctor builds this) and select "Stress: 400 entities, 2000 particles". If the debug menu does not exist yet, run `window.sowDebug.stress(400, 2000)` in the DevTools Console.
9. In DevTools, Performance tab, click record, play on the phone for 10 seconds, stop. Expected: a flame chart. Read the frame timings track.
10. Record these numbers, folded and unfolded, bloom on and fallback:
    - FPS meter average and minimum over 10 seconds.
    - Longest frame in the Performance recording.
    - Share of frame time in scripting versus GPU.
    - Console line `[sow] viewport ...` for that screen.
11. Fold or unfold during the run and confirm the canvas re-fits without reload and the console logs a new viewport line.
12. Paste the numbers back using the gate template in `07-install-runbook.md` section G.

Pass criteria (SPEC 5): cover screen 120 fps target (accept a stable 60 if Motion smoothness is Standard, and record that setting), main screen 60 fps minimum, both with 400 live entities and 2000 particles.
