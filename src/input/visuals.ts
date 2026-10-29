// Pure draw data for Glow. No pixi.js import; Glow turns these into Graphics.
import { BOMB_VISUAL, PAUSE_VISUAL, rectCentre, SUPER_VISUAL } from './buttons';
import type { TouchModel } from './model';
import { KNOB_RADIUS, STICK_RADIUS } from './stick';
import type { Track } from './stick';
import type { ButtonVisual, StickVisual, StickVisuals } from './types';

function trackVisual(t: Track): StickVisual | null {
  if (!t.active) return null;
  return {
    ring: { x: t.ox + t.cx, y: t.oy + t.cy, r: STICK_RADIUS },
    knob: { x: t.px + t.cx, y: t.py + t.cy, r: KNOB_RADIUS },
  };
}

/**
 * Ring at the stick centre (radius 120, it follows a finger past the ring) and knob at the clamped
 * finger, both shifted by the anchor clamp offset so the ring never covers a button. Canvas local CSS px.
 */
export function stickVisuals(m: TouchModel): StickVisuals {
  return { move: trackVisual(m.move), aim: trackVisual(m.aim) };
}

/** Visual button shapes (smaller than hit targets), with held state for a pressed look. */
export function buttonVisuals(m: TouchModel): ButtonVisual[] {
  const b = rectCentre(m.buttons.bomb);
  const s = rectCentre(m.buttons.super);
  const p = rectCentre(m.buttons.pause);
  return [
    { id: 'bomb', shape: 'circle', x: b.x, y: b.y, size: BOMB_VISUAL, held: m.latch.bomb.id !== -1 },
    { id: 'super', shape: 'circle', x: s.x, y: s.y, size: SUPER_VISUAL, held: m.latch.super.id !== -1 },
    { id: 'pause', shape: 'square', x: p.x, y: p.y, size: PAUSE_VISUAL, held: m.latch.pause.id !== -1 },
  ];
}
