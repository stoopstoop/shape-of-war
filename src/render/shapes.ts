// One shared GraphicsContext per Kind (docs/03-architecture.md section 6).
// Geometry and colours come from the pure registry in shapeSpecs.ts. Strokes are white
// unless a layer bakes a palette colour, so views are coloured by tint.
import { GraphicsContext } from 'pixi.js';
import type { Kind } from '../game/world';
import { currentRender, palette, type NeonRender, type PaletteKey } from './neon';
import {
  MAX_KIND,
  MAX_SLOT,
  specForSlot,
  type ShapeLayer,
  type ShapePrim,
  type ShapeSpec,
} from './shapeSpecs';

type Palette = Readonly<Record<PaletteKey, number>>;

function tracePrim(ctx: GraphicsContext, p: ShapePrim): void {
  switch (p.t) {
    case 'poly':
      ctx.poly([...p.pts], true);
      return;
    case 'line': {
      const pts = p.pts;
      if (pts.length < 4) return;
      ctx.moveTo(pts[0] ?? 0, pts[1] ?? 0);
      for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i] ?? 0, pts[i + 1] ?? 0);
      return;
    }
    case 'circle':
      ctx.circle(0, 0, p.r);
      return;
    case 'rect':
      ctx.rect(-p.w / 2, -p.h / 2, p.w, p.h);
      return;
    case 'regularPoly':
      ctx.regularPoly(0, 0, p.r, p.sides, p.rot);
      return;
  }
}

function layerColour(l: ShapeLayer, pal: Palette): number {
  return l.colour === null ? 0xffffff : pal[l.colour];
}

/** Each prim is traced and stroked separately so open lines are never closed. */
function strokeLayer(ctx: GraphicsContext, l: ShapeLayer, width: number, color: number, alpha: number): void {
  for (const p of l.prims) {
    tracePrim(ctx, p);
    ctx.stroke({ width, color, alpha, join: 'round', cap: 'round' });
  }
}

function fillLayer(ctx: GraphicsContext, l: ShapeLayer, color: number): void {
  for (const p of l.prims) {
    if (p.t === 'line') continue;
    tracePrim(ctx, p);
    ctx.fill({ color, alpha: l.fill });
  }
}

/** Glow settings a context is built from. A subset of NeonRender. */
export type GlowStyle = Pick<NeonRender, 'haloWidthMul' | 'haloAlpha' | 'innerWidthMul' | 'innerAlpha' | 'coreWidthMul'>;

/**
 * Entity context: wide outer halo, inner halo (both scale with the neon slider), then fill,
 * then the thick core line. With neon at 0 only the core line remains.
 */
export function buildContext(spec: ShapeSpec, style: GlowStyle, pal: Palette): GraphicsContext {
  const ctx = new GraphicsContext();
  for (const l of spec.layers) {
    if (!l.glow || l.width <= 0) continue;
    const c = layerColour(l, pal);
    if (style.haloAlpha > 0) strokeLayer(ctx, l, l.width * style.haloWidthMul, c, style.haloAlpha * l.alpha);
    if (style.innerAlpha > 0) strokeLayer(ctx, l, l.width * style.innerWidthMul, c, style.innerAlpha * l.alpha);
  }
  for (const l of spec.layers) {
    if (l.fill > 0) fillLayer(ctx, l, layerColour(l, pal));
    if (l.width > 0) strokeLayer(ctx, l, l.width * style.coreWidthMul, layerColour(l, pal), l.alpha);
  }
  return ctx;
}

/** Fallback glow source: wide, low alpha strokes only. Blurred once and captured by the renderer. */
export function buildGlowSourceContext(spec: ShapeSpec, pal: Palette): GraphicsContext {
  const ctx = new GraphicsContext();
  for (const l of spec.layers) {
    if (l.width <= 0 && l.fill <= 0) continue;
    const w = Math.max(l.width, 1.5);
    strokeLayer(ctx, l, w * 4, layerColour(l, pal), 0.35 * l.alpha);
    strokeLayer(ctx, l, w * 1.6, layerColour(l, pal), 0.8 * l.alpha);
  }
  return ctx;
}

/**
 * Bloom path source: the shape's core lines, a little thicker, no halo and no blur. Captured
 * once per kind at resolution 2 and drawn as a sprite inside the reduced resolution bloom layer,
 * so the filter blurs a cheap quad instead of every entity's full Graphics.
 */
export function buildBloomSourceContext(spec: ShapeSpec, pal: Palette): GraphicsContext {
  const ctx = new GraphicsContext();
  for (const l of spec.layers) {
    if (l.fill > 0) fillLayer(ctx, l, layerColour(l, pal));
    if (l.width > 0) strokeLayer(ctx, l, Math.max(l.width, 1.5) * 2.2, layerColour(l, pal), l.alpha);
  }
  return ctx;
}

// Index 0 holds the magenta unknown context; 1..MAX_KIND hold the registry kinds and
// MAX_KIND+1..MAX_SLOT the weapon pickup variants (shapeSpecs.ts visual slots).
let contexts: (GraphicsContext | null)[] = new Array<GraphicsContext | null>(MAX_SLOT + 1).fill(null);

function slotOf(kind: number): number {
  return kind >= 1 && kind <= MAX_KIND ? kind : 0;
}

/** The current shared context for a kind. Unknown kinds share the magenta circle. */
export function shapeContext(kind: Kind): GraphicsContext {
  return contextForValue(kind);
}

/** Same as shapeContext for a raw number read from a Uint8Array. */
export function contextForValue(kind: number): GraphicsContext {
  return contextForSlot(slotOf(kind));
}

/** The current shared context for a visual slot (shapeSpecs.ts visualSlot). */
export function contextForSlot(slot: number): GraphicsContext {
  const s = slot >= 0 && slot <= MAX_SLOT ? slot : 0;
  const existing = contexts[s];
  if (existing) return existing;
  const built = buildContext(specForSlot(s), currentRender, palette);
  contexts[s] = built;
  return built;
}

/**
 * Rebuild every context for new glow settings and palette. Returns the old contexts; the
 * caller reassigns view.context on live views and then destroys them.
 */
export function rebuildShapeContexts(style: GlowStyle): GraphicsContext[] {
  const old = contexts.filter((c): c is GraphicsContext => c !== null);
  contexts = contexts.map((_, slot) => buildContext(specForSlot(slot), style, palette));
  return old;
}
