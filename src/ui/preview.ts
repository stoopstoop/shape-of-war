// Live preview arena behind the settings screen (docs/01 section 10: grid plus one of each enemy
// drifting). A separate World that never reaches stepGame: no AI, no spawner, no PRNG. Starting
// positions and headings come from hash01, so the scene is the same every time.
import { hash01 } from '../core/rng';
import type { LevelDef } from '../levelgen/leveldef';
import { createWorld, driftEntity, Kind, spawn, type World } from '../game/world';

/** One of each enemy, plus geoms so the multiplier pickups show too. */
export const PREVIEW_KINDS: readonly Kind[] = [
  Kind.Grunt,
  Kind.Wanderer,
  Kind.Weaver,
  Kind.Pinwheel,
  Kind.Dart,
  Kind.SnakeHead,
  Kind.GravityWell,
  Kind.Spawner,
  Kind.Geom,
  Kind.Geom,
  Kind.Geom,
];

const RADIUS: Partial<Record<Kind, number>> = {
  [Kind.Pinwheel]: 22,
  [Kind.GravityWell]: 26,
  [Kind.Spawner]: 22,
  [Kind.Geom]: 7,
};

/** Pure: start position and velocity for preview slot `i` inside an arena of width x height. */
export function previewSlot(i: number, width: number, height: number): { x: number; y: number; vx: number; vy: number } {
  const heading = hash01(i, 11) * Math.PI * 2;
  const speed = 40 + 50 * hash01(i, 12);
  return {
    x: (hash01(i, 13) - 0.5) * width * 0.7,
    y: (hash01(i, 14) - 0.5) * height * 0.7,
    vx: Math.cos(heading) * speed,
    vy: Math.sin(heading) * speed,
  };
}

export interface RectLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Pure: play rect for the arena while the settings panel is open. The panel is
 * min(440, 48% of width) wide plus margins on the left (see .sow-panel in dom.ts), so the arena
 * fits in the remaining space on the right and stays visible while dragging.
 */
export function previewRect(cssW: number, cssH: number, ins: { top: number; right: number; bottom: number; left: number }): RectLike {
  const panel = Math.min(440, cssW * 0.48) + 8 + 12;
  const x = ins.left + panel;
  return {
    x,
    y: ins.top,
    w: Math.max(1, cssW - x - ins.right),
    h: Math.max(1, cssH - ins.top - ins.bottom),
  };
}

export function createPreviewWorld(level: LevelDef): World {
  const w = createWorld(level, 64);
  const a = level.arena;
  PREVIEW_KINDS.forEach((kind, i) => {
    const s = previewSlot(i, a.width, a.height);
    const id = spawn(w, kind, s.x, s.y);
    if (id < 0) return;
    w.radius[id] = RADIUS[kind] ?? 16;
    w.vx[id] = s.vx;
    w.vy[id] = s.vy;
  });
  w.prevX.set(w.x);
  w.prevY.set(w.y);
  return w;
}

/** Drift and spin every preview entity. dt is clamped so a stalled tab does not jump. */
export function stepPreview(w: World, dtSec: number): void {
  const dt = Math.min(0.05, Math.max(0, dtSec));
  w.prevX.set(w.x);
  w.prevY.set(w.y);
  for (let id = 1; id < w.cap; id++) {
    if (w.alive[id] !== 1) continue;
    driftEntity(w, id, dt);
    w.rot[id] = (w.rot[id] ?? 0) + dt * 0.8;
  }
  w.time += dt;
  w.tick++;
}
