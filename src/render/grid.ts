// Grid and arena wall drawing. Redrawn only on resize, arena change or neon change.
import type { Graphics } from 'pixi.js';
import type { ArenaDef } from '../levelgen/leveldef';
import { gridSegments, hexagonPoints } from './gridGeom';

/** Line widths in CSS px; divided by the world scale so they stay constant on screen. */
const GRID_LINE_PX = 1.25;
const WALL_LINE_PX = 3;
const WALL_GLOW_PX = 9;

/** Grid lines clipped to the arena. Brightness comes from the Graphics alpha (gridAlpha). */
export function drawGrid(g: Graphics, arena: ArenaDef, colour: number, scale: number): void {
  g.clear();
  const segs = gridSegments(arena);
  for (let i = 0; i + 3 < segs.length; i += 4) {
    g.moveTo(segs[i] ?? 0, segs[i + 1] ?? 0).lineTo(segs[i + 2] ?? 0, segs[i + 3] ?? 0);
  }
  if (segs.length > 0) g.stroke({ width: GRID_LINE_PX / Math.max(scale, 0.01), color: colour, alpha: 1 });
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
export function drawWalls(g: Graphics, arena: ArenaDef, colour: number, glowAlpha: number, scale: number): void {
  g.clear();
  const s = Math.max(scale, 0.01);
  const passes: { width: number; alpha: number }[] = [];
  if (glowAlpha > 0) passes.push({ width: WALL_GLOW_PX / s, alpha: glowAlpha * 0.35 });
  passes.push({ width: WALL_LINE_PX / s, alpha: 1 });
  for (const pass of passes) {
    traceOutline(g, arena);
    g.stroke({ width: pass.width, color: colour, alpha: pass.alpha, join: 'round' });
    for (const o of arena.obstacles) {
      g.rect(o.cx - o.w / 2, o.cy - o.h / 2, o.w, o.h);
      g.stroke({ width: pass.width, color: colour, alpha: pass.alpha, join: 'round' });
    }
  }
}
