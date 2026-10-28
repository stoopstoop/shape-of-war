// Sower (docs/10 wave C): heads for the nearest arena boundary, then hugs it at 70 u/s circulating
// clockwise on screen (y down), and drops a Mine every 3.0 s at its position (6 live per Sower,
// 24 in total; a drop at a cap is skipped). State: w.t seconds since the last drop.
// Render contract: position and rotation only.
import { confine, createConfineResult } from '../arena';
import { enemySpeedScale } from '../state';
import { moveTo } from '../steer';
import { Kind, type World } from '../world';
import { dropMine } from './mine';
import type { EnemyDef } from './types';

export const def: EnemyDef = { kind: Kind.Sower, radius: 16, speed: 70, value: 180, colour: 'sower', hp: 4, geoms: 3 };

export const DROP_SEC = 3.0;
/** Distance from the wall (beyond the hitbox) inside which the Sower counts as hugging. */
export const HUG_MARGIN = 8;
/** Share of the wall ward push mixed into the tangent so the Sower keeps contact on curves. */
const HUG_PULL = 0.35;

const probe = createConfineResult();
const dir = { x: 0, y: 0 };

/**
 * Writes the unit travel direction for a Sower at (x, y) with radius r into out: clockwise along
 * the wall when within HUG_MARGIN of it, else toward the nearest boundary. Returns true when hugging.
 */
export function sowerDirection(w: World, x: number, y: number, r: number, out: { x: number; y: number }): boolean {
  const arena = w.level.arena;
  const p = confine(arena, x, y, r + HUG_MARGIN, probe);
  let dx: number;
  let dy: number;
  let hugging = false;
  if (p.hit) {
    // Inward normal n; clockwise tangent on a y down screen is (ny, -nx).
    dx = p.ny - p.nx * HUG_PULL;
    dy = -p.nx - p.ny * HUG_PULL;
    hugging = true;
  } else if (arena.shape === 'circle' || arena.shape === 'hexagon') {
    dx = x;
    dy = y;
  } else {
    const gapX = arena.width / 2 - Math.abs(x);
    const gapY = arena.height / 2 - Math.abs(y);
    if (gapX < gapY) {
      dx = x >= 0 ? 1 : -1;
      dy = 0;
    } else {
      dx = 0;
      dy = y >= 0 ? 1 : -1;
    }
  }
  const l = Math.sqrt(dx * dx + dy * dy);
  if (l < 1e-9) {
    out.x = 1;
    out.y = 0;
  } else {
    out.x = dx / l;
    out.y = dy / l;
  }
  return hugging;
}

export function step(w: World, id: number, dt: number): void {
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  sowerDirection(w, x, y, w.radius[id] ?? def.radius, dir);
  const s = def.speed * enemySpeedScale(w) * dt;
  moveTo(w, id, x + dir.x * s, y + dir.y * s);
  w.rot[id] = Math.atan2(dir.y, dir.x);
  let t = (w.t[id] ?? 0) + dt;
  if (t >= DROP_SEC) {
    t -= DROP_SEC;
    dropMine(w, id, w.x[id] ?? 0, w.y[id] ?? 0);
  }
  w.t[id] = t;
}
