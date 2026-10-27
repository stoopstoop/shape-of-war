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
