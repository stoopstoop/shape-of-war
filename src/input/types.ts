// Contract stub (docs/03-architecture.md section 1, docs/04-device-and-pwa.md sections 5 and 10).
// Types only. Thumbs owns this file from W1 and may grow it additively.

/** x, y in [-1, 1] after dead zone. */
export interface StickState {
  active: boolean;
  x: number;
  y: number;
}

export interface InputState {
  move: StickState;
  aim: StickState;
  bomb: boolean;
  superPressed: boolean;
  pause: boolean;
}

/** Safe area insets in CSS px. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Axis aligned rectangle in CSS px. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Hit target bounds in CSS px (docs/04 section 10: bomb 88, super 76, pause 56). */
export interface ButtonRects {
  bomb: Rect;
  super: Rect;
  pause: Rect;
}

/** Circle in CSS px, canvas local coordinates. */
export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** Ring at the floating origin and knob at the clamped finger position. */
export interface StickVisual {
  ring: Circle;
  knob: Circle;
}

/** Pure draw data for Glow. A stick that is not held is null. */
export interface StickVisuals {
  move: StickVisual | null;
  aim: StickVisual | null;
}

export type ButtonId = keyof ButtonRects;

/** Visual (not hit) shape of one on screen button, in CSS px (docs/04 section 10). */
export interface ButtonVisual {
  id: ButtonId;
  shape: 'circle' | 'square';
  /** Centre. */
  x: number;
  y: number;
  /** Diameter for circles, side for squares. */
  size: number;
  held: boolean;
}
