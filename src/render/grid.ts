// Grid and arena wall drawing. Redrawn only on resize, arena change or neon change.
import type { Graphics } from 'pixi.js';
import type { ArenaDef } from '../levelgen/leveldef';
import { gridSegments, hexagonPoints } from './gridGeom';

/**
 * Line widths in device independent (CSS) px; divided by the world scale so they stay constant
 * on screen. Fractional on purpose: lines are antialiased (MSAA) and never snapped to integers.
 */
export const GRID_LINE_PX = 1.25;
export const WALL_LINE_PX = 3;
export const WALL_GLOW_PX = 10;

/** Pure: grid stroke width in arena units for a world scale. Unrounded. */
export function gridLineWidth(scale: number): number {
  return GRID_LINE_PX / Math.max(scale, 0.01);
}

export interface WallPass {
  /** Arena units. */
  width: number;
  alpha: number;
}

/**
 * Pure: stroke passes for the arena outline, widest first. 'crisp' is the full resolution line
 * layer: outer halo, inner halo, core. 'bloom' is the source drawn into the reduced resolution
 * bloom layer: a slightly thick core only, the filter makes the glow.
 */
export function wallPasses(glowAlpha: number, widthMul: number, scale: number, mode: 'crisp' | 'bloom'): WallPass[] {
  const s = Math.max(scale, 0.01);
  const m = widthMul > 0 ? widthMul : 1;
  if (mode === 'bloom') return [{ width: (WALL_LINE_PX * m * 1.5) / s, alpha: 1 }];
  const passes: WallPass[] = [];
  if (glowAlpha > 0) {
    passes.push({ width: (WALL_GLOW_PX * m * 1.8) / s, alpha: glowAlpha * 0.16 });
    passes.push({ width: (WALL_GLOW_PX * m) / s, alpha: glowAlpha * 0.38 });
  }
  passes.push({ width: (WALL_LINE_PX * m) / s, alpha: 1 });
  return passes;
}

/** Grid lines clipped to the arena. Brightness comes from the Graphics alpha (gridAlpha). */
export function drawGrid(g: Graphics, segs: readonly number[], colour: number, scale: number): void {
  g.clear();
  for (let i = 0; i + 3 < segs.length; i += 4) {
    g.moveTo(segs[i] ?? 0, segs[i + 1] ?? 0).lineTo(segs[i + 2] ?? 0, segs[i + 3] ?? 0);
  }
  if (segs.length > 0) g.stroke({ width: gridLineWidth(scale), color: colour, alpha: 1 });
}

/** Grid segments for an arena (cached by the renderer per arena). */
export function arenaGridSegments(arena: ArenaDef): number[] {
  return gridSegments(arena);
}

function traceOutline(g: Graphics, a: ArenaDef): void {
  const w = a.width;
  const h = a.height;
  switch (a.shape) {
    case 'rect':
    case 'rectObstacles':
      g.rect(-w / 2, -h / 2, w, h);
      return;
    case 'roundRect':
      g.roundRect(-w / 2, -h / 2, w, h, Math.min(a.cornerRadius, w / 2, h / 2));
      return;
    case 'circle':
      g.circle(0, 0, w / 2);
      return;
    case 'hexagon':
      g.poly(hexagonPoints(w, h), true);
      return;
  }
}

/** Arena wall and obstacle outlines. Lives inside the glow layer so it blooms. */
export function drawWalls(g: Graphics, arena: ArenaDef, colour: number, passes: readonly WallPass[]): void {
  g.clear();
  for (const pass of passes) {
    traceOutline(g, arena);
    g.stroke({ width: pass.width, color: colour, alpha: pass.alpha, join: 'round' });
    for (const o of arena.obstacles) {
      g.rect(o.cx - o.w / 2, o.cy - o.h / 2, o.w, o.h);
      g.stroke({ width: pass.width, color: colour, alpha: pass.alpha, join: 'round' });
    }
  }
}
