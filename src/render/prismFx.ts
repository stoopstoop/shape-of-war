// The Prism gem outline (docs/12 wave V3-D Glow, roster row 10). A pooled set of line sprites, one
// per gem segment, tinted per frame from the pure hue function (bossPrism.ts): no Graphics.clear, no
// allocation per frame, no new asset (Texture.WHITE stretched into thick lines, so the tier 4 line
// weight is honoured; a WebGL line mesh is one pixel wide). A second set offset and hue shifted is the
// chromatic ghost. The glow halo of the body is the boss glow sprite (renderer.ts), which follows
// applyNeon; the colours here follow it through the saturation in the frame.
import { Container, Sprite, Texture } from 'pixi.js';
import {
  PRISM_BODY_R,
  prismColour,
  prismGhostAlpha,
  prismGhostHue,
  prismGhostOffset,
  prismHue,
  prismLod,
  prismLodLevel,
  prismSaturation,
  prismSegments,
  prismWidths,
  type Offset2,
  type PrismSegment,
} from './bossPrism';

/** Most segments any rung draws (24 outline vertices plus 24 facet segments). */
const MAX_SEGMENTS = 48;
/** Segments overlap by this share of the line width so thick corners have no notch. */
const JOIN_OVERLAP = 0.5;

/** Everything one frame of the gem needs. All plain numbers, one reused object. */
export interface PrismFrame {
  /** Sim clock (w.time) in seconds. */
  timeSec: number;
  x: number;
  y: number;
  rot: number;
  /** Boss view scale (radius over PRISM_BODY_R). */
  scale: number;
  /** Body alpha (entrance fade, dying flicker). */
  alpha: number;
  /** Whiteness 0 to 1 (prismWhite). */
  white: number;
  /** Borrowed phase colour as RGB. */
  borrowed: number;
  /** The applyNeon saturation multiplier (neon.ts current.saturation). */
  saturation: number;
  /** Cost ladder level (prismLodFor). */
  lod: number;
}

export function createPrismFrame(): PrismFrame {
  return { timeSec: 0, x: 0, y: 0, rot: 0, scale: 1, alpha: 1, white: 0, borrowed: 0xffffff, saturation: 1, lod: 0 };
}

export interface PrismLayer {
  update(f: Readonly<PrismFrame>): void;
  hide(): void;
  destroy(): void;
}

interface SegmentSet {
  root: Container;
  sprites: Sprite[];
}

function makeSet(label: string, blend: 'normal' | 'add'): SegmentSet {
  const root = new Container({ label });
  const sprites: Sprite[] = [];
  for (let i = 0; i < MAX_SEGMENTS; i++) {
    const s = new Sprite({ texture: Texture.WHITE, anchor: 0.5, blendMode: blend });
    s.visible = false;
    root.addChild(s);
    sprites.push(s);
  }
  return { root, sprites };
}

/** Lay one sprite along a segment: midpoint, angle, length plus overlap, thickness. */
function placeSegment(s: Sprite, seg: Readonly<PrismSegment>, width: number): void {
  const dx = seg.x1 - seg.x0;
  const dy = seg.y1 - seg.y0;
  s.position.set((seg.x0 + seg.x1) / 2, (seg.y0 + seg.y1) / 2);
  s.rotation = Math.atan2(dy, dx);
  s.width = Math.hypot(dx, dy) + width * JOIN_OVERLAP;
  s.height = width;
  s.visible = true;
}

/** Create the gem layer under parent (hidden until the first update). */
export function createPrismLayer(parent: Container, baseLine: number): PrismLayer {
  const root = new Container({ label: 'bossPrism' });
  const ghost = makeSet('bossPrismGhost', 'add');
  const main = makeSet('bossPrismGem', 'normal');
  root.addChild(ghost.root);
  root.addChild(main.root);
  root.visible = false;
  parent.addChild(root);
  const widths = prismWidths(baseLine);
  const off: Offset2 = { x: 0, y: 0 };
  let level = -1;

  function layout(next: number): void {
    level = next;
    const segs = prismSegments(prismLod(level).verts);
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      const seg = segs[i];
      const m = main.sprites[i];
      const g = ghost.sprites[i];
      if (!seg || !m || !g) {
        if (m) m.visible = false;
        if (g) g.visible = false;
        continue;
      }
      placeSegment(m, seg, seg.facet ? widths.facet : widths.outline);
      placeSegment(g, seg, widths.ghost);
    }
  }

  return {
    update(f: Readonly<PrismFrame>): void {
      const lv = prismLodLevel(f.lod);
      if (lv !== level) layout(lv);
      const lod = prismLod(lv);
      const segs = prismSegments(lod.verts);
      const sat = prismSaturation(f.saturation);
      root.visible = true;
      root.position.set(f.x, f.y);
      root.rotation = f.rot;
      root.scale.set(f.scale);
      root.alpha = f.alpha;
      const showGhost = lod.ghost && prismGhostAlpha(f.white) > 0.01;
      ghost.root.visible = showGhost;
      if (showGhost) {
        prismGhostOffset(f.timeSec, PRISM_BODY_R, off);
        ghost.root.position.set(off.x, off.y);
        ghost.root.alpha = prismGhostAlpha(f.white);
      }
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        const m = main.sprites[i];
        if (!seg || !m) continue;
        const hue = prismHue(seg.at, lod.verts, f.timeSec);
        m.tint = prismColour(hue, sat, f.borrowed, f.white);
        const g = ghost.sprites[i];
        if (showGhost && g) g.tint = prismColour(prismGhostHue(hue), sat, f.borrowed, f.white);
      }
    },
    hide(): void {
      root.visible = false;
    },
    destroy(): void {
      root.destroy({ children: true });
    },
  };
}
