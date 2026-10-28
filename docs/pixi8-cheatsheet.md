# PixiJS v8 cheatsheet for Shape of War

Written by Shipwright in W0 from the installed type definitions in `node_modules/pixi.js/lib` and `node_modules/pixi-filters/lib`, not from memory. Where this file and `docs/03-architecture.md` section 12 differ, this file wins. Every code block below is type checked against the installed packages by `node scripts/check-cheatsheet.ts`:

- a `ts` block must compile with no errors (v8 form);
- a `ts-v7` block must fail to compile (v7 form that no longer exists in the types).

Some v7 forms still compile in 8.22.0 as deprecated shims (Graphics `beginFill` and friends, `app.view`, `container.name`, the `Text(text, style)` overload). Those are shown in plain `js` blocks, are not type checked, and are caught by the grep in "Toolchain notes" item 6.

Checked against: **pixi.js 8.22.0**, **pixi-filters 6.1.5**, **typescript 5.9.3**, node `v22.22.0` (`node -v` inside the W0 run; the Mac shell has v24, both satisfy SPEC and every engines range below).

## Compatibility check

`npm ls pixi.js pixi-filters vite vite-plugin-pwa vitest typescript workbox-build workbox-window @types/node` exits 0 with no `invalid` and no `UNMET PEER`. Peer ranges below were read from each package's `package.json` in `node_modules`, not from the registry.

| Package | Installed | Peer range or engines (from node_modules) | Compatible |
|---|---|---|---|
| pixi.js | 8.22.0 | no peers | yes |
| pixi-filters | 6.1.5 | peer `pixi.js >=8.0.0-0`; 8.22.0 satisfies it | yes |
| vite | 8.3.5 | engines `node ^20.19.0 or >=22.12.0`; v22.22.0 satisfies it | yes |
| vite-plugin-pwa | 2.0.0 | peer `vite ^3.1.0 \|\| ... \|\| ^7.0.0 \|\| ^8.0.0`; 8.3.5 satisfies it. Required peers `workbox-build ^7.4.1` and `workbox-window ^7.4.1` (both 7.4.1, auto-installed by npm) | yes |
| vitest | 5.0.5 | peer `vite ^6.4.0 \|\| ^7.0.0 \|\| ^8.0.0`; 8.3.5 satisfies it. Engines `node ^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0`; v22.22.0 satisfies it | yes |
| typescript | 5.9.3 | no peers | yes |

Vite major: Vite 8 is accepted by both vite-plugin-pwa (up to ^8) and vitest (up to ^8), so Vite 8 is pinned, per the SPEC 2 rule "newest major both accept". SPEC section 2's table row says "Vite 6"; the version-pin paragraph below it overrides that. TypeScript: npm `latest` is 7.0.2; SPEC pins `^5`, so the newest 5.x (5.9.3) is installed. No `--legacy-peer-deps` and no `--force` were used.

## Toolchain notes for builders

1. `tsconfig.json` loads `@types/node` (vite.config.ts and the tests need it). Consequence: `setTimeout` returns `NodeJS.Timeout` in the type checker. Write `window.setTimeout(...)` or `ReturnType<typeof setTimeout>` in game code.
2. `lib.dom.d.ts` in TypeScript 5.9.3 has no `ScreenOrientation.lock`. Keep the cast shown in `docs/04-device-and-pwa.md` section 6.
3. `__BUILD_ID__` is declared as a global string in `env.d.ts` and injected by `vite.config.ts` through `define`. Keep that declaration when rewriting `src/main.ts`.
4. Vite 8 replaces `%BASE_URL%` in `index.html` (checked in `dist/index.html`: it becomes `/shape-of-war/manifest.webmanifest`).
5. Import local TypeScript files from `vite.config.ts` with an explicit `.ts` extension (Vite 8 warns about the native config loader otherwise). `allowImportingTsExtensions` is on in `tsconfig.json`.
6. `tsc` does not catch deprecated v7 shims, because pixi.js 8.22.0 still ships them with `@deprecated` tags (sections 1, 2, 4, 8). Run this before every hand-off; it must print nothing:

```text
grep -rnE "beginFill|endFill|lineStyle|drawRect|drawCircle|drawEllipse|drawPolygon|drawRoundedRect|drawStar|app\.view|cacheAsBitmap|getChildByName|\.interactive\b|\.name\s*=|BLEND_MODES|PIXI\." src/ tests/
```

## 1. Application init is async

Checked against pixi.js 8.22.0 (`app/Application.d.ts`, `rendering/renderers/shared/view/ViewSystem.d.ts`).

```ts
import { Application } from 'pixi.js';

const app = new Application();
await app.init({
  width: 800, // CSS px, because autoDensity is on
  height: 600,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
  antialias: false,
  background: 0x000000,
  preference: 'webgl', // SPEC fixes WebGL; do not let v8 pick WebGPU on Android
  powerPreference: 'high-performance',
  autoStart: true,
});
document.body.appendChild(app.canvas);
```

v7 form to avoid. `new Application({...})` with options and `app.view` still compile in 8.22.0 but are marked `@deprecated since 8.0.0`; do not use them. Touch `app.renderer` and `app.stage` only after `init()` resolves.

```js
const app = new Application({ width: 800, height: 600 });
document.body.appendChild(app.view);
```

## 2. Graphics: shape first, then fill and stroke

Checked against pixi.js 8.22.0 (`scene/graphics/shared/Graphics.d.ts`, `GraphicsContext.d.ts`). `poly(points, close?)` closes the path by default.

```ts
import { Graphics } from 'pixi.js';

const g = new Graphics();
g.rect(0, 0, 10, 10).fill(0xff0000).stroke({ width: 2, color: 0xffffff });
g.circle(0, 0, 8).stroke({ width: 2, color: 0x00ffff, alpha: 0.9 });
g.poly([0, -12, 10, 10, -10, 10]).stroke({ width: 2.5, color: 0xffffff }); // ship triangle
g.regularPoly(0, 0, 20, 6).stroke({ width: 2, color: 0xffffff }); // hexagon
g.roundRect(-50, -30, 100, 60, 12).stroke({ width: 2, color: 0xffffff });
g.moveTo(0, 0).lineTo(100, 0).stroke({ width: 1, color: 0x3344aa });
g.rect(0, 0, 4, 4).fill({ color: 0xffffff, alpha: 0.5 });
g.tint = 0xff00ff; // tint multiplies; draw in white and tint per entity
g.clear(); // only for rarely redrawn things such as the grid, never per entity per frame
```

v7 forms to avoid. Correction to 03 section 12.2: these methods DO still exist in the 8.22.0 types, as compatibility shims marked `@deprecated since 8.0.0` (`Graphics.d.ts` lines 1632 to 1672). `tsc` therefore does NOT reject them, so the type checker cannot enforce the "v8 only" rule here. They log deprecation warnings at runtime and are slower. Use the grep in "Toolchain notes" item 6 to catch them.

```js
g.beginFill(0xff0000);
g.lineStyle(2, 0xffffff);
g.drawRect(0, 0, 10, 10);
g.drawCircle(0, 0, 8);
g.endFill();
```

The full deprecated Graphics list in 8.22.0: `lineStyle`, `beginFill`, `endFill`, `drawCircle`, `drawEllipse`, `drawPolygon`, `drawRect`, `drawRoundedRect`, `drawStar`, and the two argument overload `fill(color, alpha)`. Write `fill({ color, alpha })` instead. The single argument form `fill(0xff0000)` is fine.

## 3. GraphicsContext: shared geometry and live swap

Checked against pixi.js 8.22.0. `Graphics` has `set context(c: GraphicsContext)`.

```ts
import { Graphics, GraphicsContext } from 'pixi.js';

function buildGrunt(glowAlpha: number): GraphicsContext {
  return new GraphicsContext()
    .rect(-14, -14, 28, 28)
    .stroke({ width: 8, color: 0xffffff, alpha: glowAlpha * 0.35 }) // outer glow stroke
    .rect(-14, -14, 28, 28)
    .stroke({ width: 2.5, color: 0xffffff, alpha: 1 }); // core line
}

const before = buildGrunt(0.4);
const view = new Graphics(before); // many views share one context
view.tint = 0x3366ff;

// neon changed: build a new context, assign it to every live view, then free the old one
const after = buildGrunt(0.9);
view.context = after;
before.destroy();

view.destroy(); // does NOT destroy a shared context unless you pass { context: true }
```

Runtime behaviour of swapping `context` on a live Graphics (resolves the verify line in 03 section 6). Read from `scene/graphics/shared/Graphics.mjs`, not run in a browser (no GPU in the W0 run): the setter returns early if the context is unchanged, unsubscribes the view from the old context's `update` and `unload` events, subscribes to the new one, then calls `onViewUpdate()`, so the view re-batches on the next render. The setter never destroys the old context, so the caller must call `oldContext.destroy()` once no view uses it. Glow should confirm on device that a neon slider drag shows no flicker.

## 4. Container, children and labels

Checked against pixi.js 8.22.0 (`scene/container/Container.d.ts` and `container-mixins/*.d.ts`).

```ts
import { Container, Graphics } from 'pixi.js';

const world = new Container({ label: 'world' });
const entities = new Container({ label: 'entities' });
world.addChild(entities);
const g = entities.addChild(new Graphics()); // addChild returns its argument
entities.removeChild(g);
const found = world.getChildByLabel('entities'); // Container | null
world.position.set(100, 50);
world.scale.set(2);
world.alpha = 1;
world.visible = true;
entities.cacheAsTexture(true); // a method in v8, not a boolean property
entities.updateCacheTexture();
entities.cacheAsTexture(false);
world.destroy({ children: true });
console.log(found?.label);
```

Rules:

1. Only `Container` should have children. `Sprite`, `Graphics`, `Text` and `Mesh` are leaf views; group them under a `Container`.
2. `DisplayObject` does not exist in v8. The base type is `Container`.
3. These v7 names still compile in 8.22.0 but are `@deprecated since 8.0.0`: `container.name` (use `label`), `getChildByName` (use `getChildByLabel`), `cacheAsBitmap` (use `cacheAsTexture()`), `interactive` (use `eventMode`).

```ts-v7
import { DisplayObject } from 'pixi.js';

export function reparent(child: DisplayObject): void {
  child.parent?.removeChild(child);
}
```

## 5. Sprite

Checked against pixi.js 8.22.0 (`scene/sprite/Sprite.d.ts`). The constructor takes a `Texture` or a `SpriteOptions` object.

```ts
import { Sprite, Texture } from 'pixi.js';

const a = new Sprite(Texture.WHITE);
const b = new Sprite({ texture: Texture.WHITE, anchor: 0.5 });
b.anchor.set(0.5);
b.tint = 0x00ffff;
b.alpha = 0.6;
b.blendMode = 'add';
b.scale.set(1.5);
a.texture = b.texture;
```

## 6. generateTexture

Checked against pixi.js 8.22.0. `renderer.generateTexture(options: GenerateTextureOptions | Container): Texture`. Options: `target` (required), `frame`, `resolution`, `clearColor`, `antialias`, `defaultAnchor`. Used for the fallback glow sprites (03 section 6): draw a shape with a wide low alpha stroke, blur it once, capture it.

```ts
import { BlurFilter, Graphics, Rectangle, Sprite, type Renderer } from 'pixi.js';

declare const renderer: Renderer;

const shape = new Graphics().rect(-14, -14, 28, 28).stroke({ width: 10, color: 0xffffff, alpha: 0.4 });
shape.filters = [new BlurFilter({ strength: 6, quality: 2 })]; // one-off blur before capture
const texture = renderer.generateTexture({
  target: shape,
  frame: new Rectangle(-32, -32, 64, 64), // padded so the blur is not clipped
  resolution: 1,
  antialias: true,
});
const glow = new Sprite({ texture, anchor: 0.5, blendMode: 'add' });
glow.tint = 0x00ffff;
glow.alpha = 0.8;
```

## 7. ParticleContainer and Particle

Checked against pixi.js 8.22.0 (`scene/particle-container/shared/*.d.ts`). Particles are `Particle` objects added with `addParticle`, not Sprites added with `addChild`. `ParticleOptions` accepts `x`, `y`, `scaleX`, `scaleY`, `anchorX`, `anchorY`, `rotation`, `tint`, `alpha` and `texture`.

```ts
import { Particle, ParticleContainer, Texture } from 'pixi.js';

const bullets = new ParticleContainer({
  texture: Texture.WHITE,
  dynamicProperties: { position: true, color: true }, // uploaded every frame
});
const p = new Particle({ texture: Texture.WHITE, x: 10, y: 20, scaleX: 0.5, scaleY: 0.5, anchorX: 0.5, anchorY: 0.5 });
bullets.addParticle(p);
p.x += 1;
p.alpha = 0.5;
p.tint = 0xff00ff;
bullets.removeParticle(p);
bullets.update(); // flags static properties for re-upload after you change them
```

v7 forms to avoid:

```ts-v7
import { ParticleContainer, Sprite } from 'pixi.js';

const bullets = new ParticleContainer(1500, { vertices: false, position: true });
bullets.addChild(new Sprite());
```

Resolves the verify line in 03 section 5 (does `color: true` make per frame `alpha` and `tint` changes upload). Read from `particleData.mjs`, `ParticleBuffer.mjs`, `ParticleContainer.mjs` and `ParticleContainerPipe.mjs`:

1. Defaults: `position` is dynamic; `vertex`, `rotation`, `uvs` and `color` are static.
2. Dynamic properties are rewritten into the GPU buffer on every render. Static properties are rewritten only when `_childrenDirty` is true, which `addParticle`, `removeParticle` and `update()` set.
3. `Particle.alpha` and `Particle.tint` setters recompute `particle.color` immediately.
4. Therefore with `dynamicProperties: { color: true }` per frame `alpha` and `tint` changes reach the screen with no extra call. With the default (`color: false`) they appear only after `bullets.update()` or an add or remove. Do the same for `rotation: true` if bullets or particles spin.
5. Cost: each dynamic property is re-uploaded for every particle every frame. Enable `color` only where fade or tint changes per frame (particles), not for bullets that keep one colour.

## 8. Text, TextStyle and BitmapText

Checked against pixi.js 8.22.0 (`scene/text/Text.d.ts`, `TextStyle.d.ts`, `scene/text-bitmap/BitmapText.d.ts`). The `Text(text, style)` overload still compiles in 8.22.0 as a deprecated form; do not use it.

```ts
import { BitmapText, Text } from 'pixi.js';

const label = new Text({ text: 'Score', style: { fontFamily: 'monospace', fontSize: 24, fill: 0xffffff } });
label.text = 'Score 100'; // re-rasterises a canvas texture: avoid per frame

const score = new BitmapText({ text: '0', style: { fontFamily: 'monospace', fontSize: 24, fill: 0xffffff } });
score.text = '50';
```

v7 form to avoid:

```js
new Text('Score', { fontFamily: 'monospace', fill: 0xffffff });
```

HUD text that changes every frame belongs in a DOM element (SPEC 6, 03 section 6), outside the bloom container.

## 9. Filters and import paths

Checked against pixi.js 8.22.0 and pixi-filters 6.1.5 (`pixi-filters/lib/advanced-bloom/AdvancedBloomFilter.d.ts`). `AdvancedBloomFilterOptions`: `threshold`, `bloomScale`, `brightness`, `blur`, `kernels`, `quality`, `pixelSize`. `Filter.resolution` is `number | 'inherit'`. `filterArea` is a `Rectangle` on the container (`effectsMixin.d.ts`).

```ts
import { BlurFilter, ColorMatrixFilter, Container, Rectangle } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';

declare const glowLayer: Container;
declare const renderer: { width: number; height: number; resolution: number };

const bloom = new AdvancedBloomFilter({ threshold: 0.5, bloomScale: 1.4, brightness: 1, blur: 6, quality: 4 });
bloom.resolution = 0.5; // half resolution blur, the main performance knob
bloom.threshold = 0.4; // live setters, used by applyNeon
bloom.bloomScale = 1.0;
glowLayer.filters = [bloom];
// Skip the per frame bounds calculation. Update this in resize().
glowLayer.filterArea = new Rectangle(0, 0, renderer.width / renderer.resolution, renderer.height / renderer.resolution);

const blur = new BlurFilter({ strength: 8, quality: 2 });
const colour = new ColorMatrixFilter();
colour.saturate(1.2, false);
glowLayer.filters = [blur, colour]; // assign a new array; the array on the container is read only
glowLayer.filters = []; // fallback glow path: no post pass
```

v7 forms to avoid. The scoped `@pixi/*` packages are v7; do not install them. `pixi-filters` v6 has peer `pixi.js >=8.0.0-0`.

```ts-v7
import { AdvancedBloomFilter } from '@pixi/filter-advanced-bloom';

export const bloom = new AdvancedBloomFilter();
```

Per filter subpath imports (`pixi-filters/advanced-bloom`) exist in the 6.1.5 exports map. The project imports from the root `pixi-filters`.

## 10. Blend modes are strings

Checked against pixi.js 8.22.0 (`rendering/renderers/shared/state/const.d.ts`: `BLEND_MODES` is a string union type, with `'add'`, `'normal'`, `'screen'`, `'multiply'` and others).

```ts
import { Sprite, Texture } from 'pixi.js';

const s = new Sprite(Texture.WHITE);
s.blendMode = 'add';
```

```ts-v7
import { BLEND_MODES, Sprite, Texture } from 'pixi.js';

const s = new Sprite(Texture.WHITE);
s.blendMode = BLEND_MODES.ADD;
```

## 11. Ticker callback receives the Ticker

Checked against pixi.js 8.22.0 (`ticker/Ticker.d.ts`: `TickerCallback<T> = (this: T, ticker: Ticker) => any`). Members used: `deltaMS`, `deltaTime`, `elapsedMS`, `minFPS`, `maxFPS`, `speed`, `autoStart`. Shape of War does not drive the simulation from the ticker (03 section 2).

```ts
import { Application } from 'pixi.js';

declare const app: Application;
app.ticker.add((ticker) => {
  const dtMs = ticker.deltaMS;
  console.log(dtMs);
});
```

```ts-v7
import { Application, Sprite } from 'pixi.js';

declare const app: Application;
declare const sprite: Sprite;
app.ticker.add((delta) => {
  sprite.x += delta; // in v8 the argument is the Ticker, not a number
});
```

## 12. Renderer resize and resolution

Checked against pixi.js 8.22.0 (`AbstractRenderer.d.ts`: `resize(desiredScreenWidth, desiredScreenHeight, resolution?)`). The third argument is the resolution. With `autoDensity: true` the canvas CSS size follows.

```ts
import { Application } from 'pixi.js';

declare const app: Application;
declare const cssW: number;
declare const cssH: number;
app.renderer.resize(cssW, cssH, Math.min(window.devicePixelRatio || 1, 2));
```

## 13. Events

Checked against pixi.js 8.22.0 (`events/FederatedEventTarget.d.ts`: `EventMode = 'none' | 'passive' | 'auto' | 'static' | 'dynamic'`). Input uses raw Pointer Events on the canvas (SPEC 5). Do not give game objects `eventMode = 'static'`.

```ts
import { Application, Container } from 'pixi.js';

declare const app: Application;
declare const world: Container;
app.stage.eventMode = 'none';
world.interactiveChildren = false; // skip hit testing 400 entities
```

## 14. Assets instead of Loader

Checked against pixi.js 8.22.0 (`assets/Assets.d.ts`: `load<T>(urls: string): Promise<T>`). Shape of War loads no image assets at runtime; reach for `generateTexture` instead.

```ts
import { Assets, type Texture } from 'pixi.js';

const tex = await Assets.load<Texture>('icons/icon-192.png');
console.log(tex.width);
```

```ts-v7
import { Loader } from 'pixi.js';

Loader.shared.add('x', 'x.png').load(() => {});
```

## 15. Mesh with line-list topology and a per frame position update (Glow, wave V2-D)

Verdict: works in 8.22.0. Source read (`scene/mesh/shared/Mesh.mjs`, `MeshGeometry.mjs`, `MeshPipe.mjs`, `scene/mesh/gl/GlMeshAdaptor.mjs`, `rendering/renderers/gl/geometry/GlGeometrySystem.mjs`, `rendering/renderers/gl/buffer/GlBufferSystem.mjs`), type checked below, not run on a GPU in the build run. Desktop Chrome confirmation is in the Glow lattice hand-off.

1. `Topology` is `'point-list' | 'line-list' | 'line-strip' | 'triangle-list' | 'triangle-strip'`. `GlGeometrySystem.draw` maps `'line-list'` to `gl.LINES` and draws `indexCount || indexBuffer.data.length` indices.
2. Batching ignores topology. `Mesh.batched` is true for a `MeshGeometry` with `batchMode: 'auto'` and 100 vertices or fewer, and the batcher draws triangles. Use a plain `Geometry` (never batched) or set `batchMode = 'no-batch'`.
3. Per frame update: write into the same `Float32Array` the `Buffer` was built with and call `buffer.update()`. That bumps `_updateID`; on the next bind `GlBufferSystem.updateBuffer` uploads with `bufferSubData` (no reallocation while the size is unchanged). No `Graphics.clear`, no new arrays.
4. One `Buffer` may feed several `Geometry` objects (one upload, one VAO each). The lattice uses one position buffer and two index buffers (major and minor lines).
5. WebGL line width is fixed at one device pixel; pixi exposes no `lineWidth`. Thicker lines: draw the same geometry again offset by one device pixel, or build quads.
6. The default mesh shader samples `aUV` from the texture and multiplies by the mesh tint and alpha. With all UVs 0 and `Texture.WHITE`, `tint` is the line colour and `alpha` its brightness.
7. `Mesh.destroy()` does not destroy its geometry or buffers. Destroy them yourself. Never pass `true`: that also destroys the shared `Texture.WHITE`.
8. Set `boundsArea` on a large dynamic mesh so pixi never measures the bounds from every vertex.

```ts
import { Buffer, BufferUsage, Geometry, Mesh, Texture } from 'pixi.js';

const positions = new Float32Array([0, 0, 100, 0, 100, 100]);
const posBuf = new Buffer({ data: positions, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
const uvBuf = new Buffer({ data: new Float32Array(positions.length), usage: BufferUsage.VERTEX });
const geometry = new Geometry({
  attributes: {
    aPosition: { buffer: posBuf, format: 'float32x2', stride: 8, offset: 0 },
    aUV: { buffer: uvBuf, format: 'float32x2', stride: 8, offset: 0 },
  },
  indexBuffer: new Uint32Array([0, 1, 1, 2]),
  topology: 'line-list',
});
const lines = new Mesh<Geometry>({ geometry, texture: Texture.WHITE });
lines.tint = 0x3344aa;

// Each frame: write in place, then flag the buffer for upload.
positions[2] = 110;
posBuf.update();
```

## Resolved "verify" lines

| Where | Question | Answer |
|---|---|---|
| 03 section 5, line 330 | Does `color: true` make per frame `alpha` and `tint` changes upload? | Yes. See section 7. Source read, 8.22.0. |
| 03 section 6, line 367 | Runtime behaviour of swapping `context` on a live Graphics | Safe. Old context is not destroyed by the setter. See section 3. Source read, not run in a browser. |
| 03 section 10, line 562 | Option names in `vite-plugin-pwa` and is `test` accepted? | `registerType`, `injectRegister`, `manifest`, `includeAssets`, `devOptions` and `workbox.{globPatterns, navigateFallback, cleanupOutdatedCaches, clientsClaim, skipWaiting, runtimeCaching}` all type check in `vite.config.ts` under vite-plugin-pwa 2.0.0. `test` is accepted once `/// <reference types="vitest/config" />` is the first line of `vite.config.ts`; `tsc --noEmit` is clean. |
| 03 section 10, line 568 | Does Vite replace `%BASE_URL%` in `index.html`? | Yes, in Vite 8.3.5. No hardcoding needed. |
| 04 section 6 | Does `lib.dom.d.ts` already type `ScreenOrientation.lock`? | No (TypeScript 5.9.3). Keep the cast. |
| 10 wave V2-D, Glow item 1 | Does a Mesh with line-list topology and a per frame position buffer update work? | Yes, with a plain `Geometry` (or `batchMode = 'no-batch'`) and `buffer.update()`. Lines are one device pixel. See section 15. Source read, 8.22.0. |

## Verification record

`node scripts/check-cheatsheet.ts` output is pasted in the Shipwright W0 hand-off. Re-run it after editing this file or after any change to the pinned versions.
