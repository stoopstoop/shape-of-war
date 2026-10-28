// Lattice and dust views (v2 SPEC addendum 3.8, docs/10 wave D). The pure sim lives in
// src/render/lattice/; this file owns the GPU side.
// Lines: one position buffer holds every lattice node. Two index buffers (major and minor lines)
// over that one buffer feed 'line-list' geometries, so every segment of the lattice is drawn from
// one geometry buffer that is rewritten in place and uploaded once a frame while the lattice
// moves, and not at all while it sleeps. No Graphics, no clear, no allocation per frame.
// WebGL lines are one device pixel wide, so major lines draw a second time through the same
// geometry offset by one device pixel: two pixels for major lines, one for minor.
// Brightness: the whole grid layer alpha is applyNeon's gridAlpha (bindNeon writes it); the
// major and minor alphas below are fixed multipliers on their own meshes.
// Dust: DUST_COUNT Particles created once, drifting behind the lattice.
import { Buffer, BufferUsage, Container, Geometry, Mesh, Particle, ParticleContainer, Rectangle, Texture } from 'pixi.js';
import type { ArenaDef } from '../levelgen/leveldef';
import { createDust, dustAlpha, insideArena, seedDust, stepDust, type Dust } from './lattice/dust';
import { buildLattice, type LatticeLayout } from './lattice/layout';
import { createLatticeSim, latticeAlpha, stepLattice, writePositions, type LatticeSim } from './lattice/sim';

/** Line alpha multipliers inside the grid layer (whose alpha is gridAlpha). */
export const MAJOR_ALPHA = 1;
export const MINOR_ALPHA = 0.6;
const PARK = -99999;

interface Gpu {
  readonly positions: Float32Array;
  readonly posBuf: Buffer;
  readonly uvBuf: Buffer;
  readonly majorIdx: Buffer;
  readonly minorIdx: Buffer;
  readonly majorGeom: Geometry;
  readonly minorGeom: Geometry;
  readonly major: Mesh<Geometry>;
  readonly majorEcho: Mesh<Geometry>;
  readonly minor: Mesh<Geometry>;
}

export interface LatticeView {
  /** Lattice lines. Add inside the grid layer. */
  readonly lines: Container;
  /** Dust motes. Add inside the grid layer, under the lines. */
  readonly dust: Container;
  /** The live sim, null before the first build or while off. */
  readonly sim: LatticeSim | null;
  readonly nodes: number;
  readonly spacing: number;
  /** Rebuild for an arena and spacing (allocates; arena, tier or governor change only). */
  build(arena: ArenaDef, spacing: number): void;
  /** Free the lattice GPU data and hide it (low tier). */
  clear(): void;
  /** Step the sim by dt and upload positions if they moved. */
  frame(dt: number): void;
  /** Drift and draw the dust. timeSec is the render clock. */
  dustFrame(dt: number, timeSec: number): void;
  /** Re-seed the dust for an arena. */
  seedDust(arena: ArenaDef): void;
  /** Line colour (palette.grid) for lines and dust. */
  setColour(c: number): void;
  /** One device pixel in arena units: the major line echo offset. */
  setPixel(px: number): void;
  destroy(): void;
}

function lineGeometry(posBuf: Buffer, uvBuf: Buffer, idx: Buffer): Geometry {
  return new Geometry({
    attributes: {
      aPosition: { buffer: posBuf, format: 'float32x2', stride: 8, offset: 0 },
      aUV: { buffer: uvBuf, format: 'float32x2', stride: 8, offset: 0 },
    },
    indexBuffer: idx,
    topology: 'line-list',
  });
}

function bounds(arena: ArenaDef, pad: number): Rectangle {
  return new Rectangle(-arena.width / 2 - pad, -arena.height / 2 - pad, arena.width + 2 * pad, arena.height + 2 * pad);
}

function makeGpu(layout: LatticeLayout, arena: ArenaDef, colour: number): Gpu {
  const positions = new Float32Array(layout.count * 2);
  for (let i = 0; i < layout.count; i++) {
    positions[2 * i] = layout.restX[i] ?? 0;
    positions[2 * i + 1] = layout.restY[i] ?? 0;
  }
  const posBuf = new Buffer({ data: positions, label: 'lattice-positions', usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
  // UVs all 0: every vertex samples the white texel, the mesh tint gives the colour.
  const uvBuf = new Buffer({ data: new Float32Array(layout.count * 2), label: 'lattice-uvs', usage: BufferUsage.VERTEX });
  // An empty index list still needs a valid buffer; such a mesh is simply hidden.
  const majorIdx = new Buffer({ data: layout.major.length > 0 ? layout.major : new Uint32Array(2), label: 'lattice-major', usage: BufferUsage.INDEX });
  const minorIdx = new Buffer({ data: layout.minor.length > 0 ? layout.minor : new Uint32Array(2), label: 'lattice-minor', usage: BufferUsage.INDEX });
  const majorGeom = lineGeometry(posBuf, uvBuf, majorIdx);
  const minorGeom = lineGeometry(posBuf, uvBuf, minorIdx);
  const area = bounds(arena, 40);
  const mk = (g: Geometry, label: string, alpha: number, visible: boolean): Mesh<Geometry> => {
    const m = new Mesh<Geometry>({ geometry: g, texture: Texture.WHITE, label });
    m.tint = colour;
    m.alpha = alpha;
    m.visible = visible;
    // Fixed bounds: never measure 16k floats for culling or filters.
    m.boundsArea = area;
    return m;
  };
  return {
    positions,
    posBuf,
    uvBuf,
    majorIdx,
    minorIdx,
    majorGeom,
    minorGeom,
    minor: mk(minorGeom, 'latticeMinor', MINOR_ALPHA, layout.minor.length > 0),
    major: mk(majorGeom, 'latticeMajor', MAJOR_ALPHA, layout.major.length > 0),
    majorEcho: mk(majorGeom, 'latticeMajorEcho', MAJOR_ALPHA, layout.major.length > 0),
  };
}

function freeGpu(g: Gpu): void {
  g.minor.destroy();
  g.major.destroy();
  g.majorEcho.destroy();
  g.majorGeom.destroy(false);
  g.minorGeom.destroy(false);
  g.posBuf.destroy();
  g.uvBuf.destroy();
  g.majorIdx.destroy();
  g.minorIdx.destroy();
}

/** Create the lattice and dust views. dotTexture is a small soft dot (one source for all motes). */
export function createLatticeView(dotTexture: Texture): LatticeView {
  const lines = new Container({ label: 'lattice' });
  const dustLayer = new ParticleContainer({
    label: 'dust',
    texture: dotTexture,
    dynamicProperties: { position: true, rotation: false, uvs: false, vertex: false, color: true },
  });
  let gpu: Gpu | null = null;
  let sim: LatticeSim | null = null;
  let colour = 0xffffff;
  let pixel = 1;
  let arenaNow: ArenaDef | null = null;
  const motes: Dust = createDust();
  const items: Particle[] = [];
  const dotW = Math.max(1, dotTexture.width);
  for (let i = 0; i < motes.count; i++) {
    const p = new Particle({ texture: dotTexture, x: PARK, y: PARK, alpha: 0, anchorX: 0.5, anchorY: 0.5 });
    items.push(p);
    dustLayer.addParticle(p);
  }

  function clear(): void {
    if (gpu) {
      lines.removeChildren();
      freeGpu(gpu);
    }
    gpu = null;
    sim = null;
  }

  function build(arena: ArenaDef, spacing: number): void {
    clear();
    const layout = buildLattice(arena, spacing);
    gpu = makeGpu(layout, arena, colour);
    gpu.majorEcho.position.set(pixel, pixel);
    lines.addChild(gpu.minor, gpu.major, gpu.majorEcho);
    sim = createLatticeSim(layout);
  }

  function frame(dt: number): void {
    if (!sim || !gpu) return;
    stepLattice(sim, dt);
    if (writePositions(sim, gpu.positions, latticeAlpha(sim))) gpu.posBuf.update();
  }

  function seed(arena: ArenaDef): void {
    arenaNow = arena;
    seedDust(motes, arena.width, arena.height);
    for (let i = 0; i < motes.count; i++) {
      const p = items[i];
      if (!p) continue;
      const s = (motes.size[i] ?? 2) / dotW;
      p.scaleX = s;
      p.scaleY = s;
      p.tint = colour;
    }
    dustLayer.update();
  }

  function dustFrame(dt: number, timeSec: number): void {
    const a = arenaNow;
    if (!a) return;
    stepDust(motes, dt);
    for (let i = 0; i < motes.count; i++) {
      const p = items[i];
      if (!p) continue;
      const x = motes.x[i] ?? 0;
      const y = motes.y[i] ?? 0;
      if (insideArena(a, x, y)) {
        p.x = x;
        p.y = y;
        p.alpha = dustAlpha(motes, i, timeSec);
      } else if (p.x !== PARK) {
        p.x = PARK;
        p.y = PARK;
        p.alpha = 0;
      }
    }
  }

  function setColour(c: number): void {
    colour = c;
    if (gpu) {
      gpu.minor.tint = c;
      gpu.major.tint = c;
      gpu.majorEcho.tint = c;
    }
    for (const p of items) p.tint = c;
  }

  function setPixel(px: number): void {
    pixel = Number.isFinite(px) && px > 0 ? px : 1;
    gpu?.majorEcho.position.set(pixel, pixel);
  }

  return {
    lines,
    dust: dustLayer,
    get sim(): LatticeSim | null {
      return sim;
    },
    get nodes(): number {
      return sim ? sim.layout.count : 0;
    },
    get spacing(): number {
      return sim ? sim.layout.spacing : 0;
    },
    build,
    clear,
    frame,
    dustFrame,
    seedDust: seed,
    setColour,
    setPixel,
    destroy(): void {
      clear();
      lines.destroy({ children: true });
      dustLayer.destroy();
    },
  };
}
