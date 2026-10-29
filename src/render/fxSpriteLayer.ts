// Sprite layer for the boss hazards and the enemy bullets (docs/12 wave V3-A Glow items 3 and 6).
// One ParticleContainer per layer, every Particle created once at boot and parked offscreen when
// unused, all frames from one generated atlas: one geometry and one draw call per layer, no
// allocation and no Graphics.clear per frame. The container hides when it holds nothing, so an empty
// layer uploads nothing. Instances come from a pure SpriteBuf (fxSprites.ts).
import { Graphics, Particle, ParticleContainer, Rectangle, Texture, type Renderer } from 'pixi.js';
import { ATLAS_CELLS, BRING_R, BRING_STROKE, FRAME_COUNT, FX_ATLAS_H, FX_ATLAS_W, type SpriteBuf } from './fxSprites';

const PARK = -99999;
const GEN_TEX_RES = 2;

export interface FxAtlas {
  /** The whole atlas; a layer's ParticleContainer binds its source. */
  readonly texture: Texture;
  /** One sub texture per frame id (fxSprites.ts F_*). */
  readonly frames: readonly Texture[];
}

/** Generate the boss fx atlas: every cell drawn white, tinted per instance. */
export function makeBossFxAtlas(renderer: Renderer): FxAtlas {
  const g = new Graphics();
  const [bar, soft, fill, dot, glow, ring] = ATLAS_CELLS;
  if (bar) {
    g.rect(bar.x, 0.5, bar.w, 1.5).fill({ color: 0xffffff, alpha: 0.3 });
    g.rect(bar.x, 6, bar.w, 1.5).fill({ color: 0xffffff, alpha: 0.3 });
    g.rect(bar.x, 2, bar.w, 4).fill({ color: 0xffffff, alpha: 1 });
  }
  if (soft) {
    const mid = soft.h / 2;
    for (let k = 1; k <= 12; k++) {
      const h = (mid * k) / 12;
      g.rect(soft.x, mid - h, soft.w, 2 * h).fill({ color: 0xffffff, alpha: 0.085 });
    }
  }
  if (fill) g.rect(fill.x, 0, fill.w, fill.h).fill({ color: 0xffffff, alpha: 1 });
  if (dot) {
    const c = dot.x + dot.w / 2;
    g.circle(c, dot.h / 2, 10).fill({ color: 0xffffff, alpha: 0.35 });
    g.circle(c, dot.h / 2, 8).fill({ color: 0xffffff, alpha: 1 });
  }
  if (glow) {
    const c = glow.x + glow.w / 2;
    for (let k = 12; k >= 1; k--) g.circle(c, glow.h / 2, (22 * k) / 12).fill({ color: 0xffffff, alpha: 0.075 });
  }
  if (ring) {
    const c = ring.x + ring.w / 2;
    g.circle(c, ring.h / 2, BRING_R).stroke({ width: BRING_STROKE * 2.6, color: 0xffffff, alpha: 0.25 });
    g.circle(c, ring.h / 2, BRING_R).stroke({ width: BRING_STROKE, color: 0xffffff, alpha: 1 });
  }
  const texture = renderer.generateTexture({
    target: g,
    frame: new Rectangle(0, 0, FX_ATLAS_W, FX_ATLAS_H),
    resolution: GEN_TEX_RES,
    antialias: true,
  });
  g.destroy({ context: true });
  const frames = ATLAS_CELLS.map((c) => new Texture({ source: texture.source, frame: new Rectangle(c.x, c.y, c.w, c.h) }));
  return { texture, frames };
}

export interface FxSpriteLayer {
  readonly container: ParticleContainer;
  readonly cap: number;
  /** Instances shown after the last sync. */
  readonly shown: number;
  /** Mirror a buffer onto the pooled Particles; park the rest. No allocation. */
  sync(b: SpriteBuf): void;
  /** Park every Particle and hide the container. */
  clear(): void;
  /** Draw calls this layer costs this frame: 1 while it shows anything, else 0. */
  drawCalls(): number;
  /** Distinct texture sources among the shown Particles (1 means they batch into one call). */
  sources(): number;
  destroy(): void;
}

/**
 * A layer of cap pooled Particles in one ParticleContainer bound to atlas. frames[i] is the texture
 * for frame id i; every frame must share the atlas source.
 */
export function createFxSpriteLayer(label: string, atlas: Texture, frames: readonly Texture[], cap: number): FxSpriteLayer {
  const container = new ParticleContainer({
    label,
    texture: atlas,
    blendMode: 'add',
    dynamicProperties: { position: true, rotation: true, uvs: true, vertex: true, color: true },
  });
  const n = Math.max(0, Math.floor(cap));
  const items: Particle[] = [];
  const frameShown = new Int8Array(n).fill(-1);
  const first = frames[0] ?? atlas;
  for (let i = 0; i < n; i++) {
    const p = new Particle({ texture: first, x: PARK, y: PARK, alpha: 0, anchorX: 0.5, anchorY: 0.5 });
    items.push(p);
    container.addParticle(p);
  }
  container.visible = false;
  let shown = 0;

  function park(from: number, to: number): void {
    for (let i = from; i < to; i++) {
      const p = items[i];
      if (!p) continue;
      p.x = PARK;
      p.y = PARK;
      p.alpha = 0;
    }
  }

  function sync(b: SpriteBuf): void {
    const count = Math.min(b.count, n);
    for (let i = 0; i < count; i++) {
      const p = items[i];
      if (!p) continue;
      const f = b.frame[i] ?? 0;
      const cell = ATLAS_CELLS[f] ?? ATLAS_CELLS[0];
      if (frameShown[i] !== f) {
        p.texture = frames[f] ?? first;
        frameShown[i] = f;
      }
      p.x = b.x[i] ?? 0;
      p.y = b.y[i] ?? 0;
      p.rotation = b.rot[i] ?? 0;
      p.scaleX = (b.w[i] ?? 0) / (cell?.unitW ?? 1);
      p.scaleY = (b.h[i] ?? 0) / (cell?.unitH ?? 1);
      p.tint = b.tint[i] ?? 0xffffff;
      p.alpha = b.alpha[i] ?? 0;
    }
    if (count < shown) park(count, shown);
    shown = count;
    container.visible = count > 0;
  }

  function clear(): void {
    park(0, shown);
    shown = 0;
    container.visible = false;
  }

  function sources(): number {
    let firstSource: unknown = null;
    let distinct = 0;
    const seen: unknown[] = [];
    for (let i = 0; i < shown; i++) {
      const src = items[i]?.texture.source;
      if (src === undefined || src === firstSource || seen.includes(src)) continue;
      if (firstSource === null) firstSource = src;
      seen.push(src);
      distinct++;
    }
    return distinct;
  }

  return {
    container,
    cap: n,
    get shown(): number {
      return shown;
    },
    sync,
    clear,
    drawCalls(): number {
      return container.visible && shown > 0 ? 1 : 0;
    },
    sources,
    destroy(): void {
      if (!container.destroyed) container.destroy();
    },
  };
}

/** Frame count the atlas must provide (for callers that build frames by hand, such as tests). */
export const FX_FRAME_COUNT = FRAME_COUNT;
