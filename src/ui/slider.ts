// Touch slider for the settings screen (G1 fix). A native range input does not drag on the
// device: the document level touchmove preventDefault (docs/04 section 11) and touch-action none
// on the page swallow it. This slider reads Pointer Events with pointer capture instead, so it
// works under both. The value maths and the per frame throttle are pure and tested.
import { el } from './dom';

/** Pure: integer slider value for a pointer at `x` over a track at [left, left + width]. */
export function sliderValueAt(x: number, left: number, width: number, min: number, max: number): number {
  if (!(width > 0) || !Number.isFinite(x)) return min;
  const t = Math.min(1, Math.max(0, (x - left) / width));
  return Math.round(min + t * (max - min));
}

/** Pure: 0 to 1 position of `v` on [min, max]. */
export function sliderFraction(v: number, min: number, max: number): number {
  if (!(max > min)) return 0;
  return Math.min(1, Math.max(0, (v - min) / (max - min)));
}

export interface FrameThrottle<T> {
  /** Queue a value; it is applied on the next frame, latest value wins. */
  push(v: T): void;
  /** Apply a queued value now (finger up), so the last drag position is never lost. */
  flush(): void;
  /** True while a frame callback is outstanding. */
  readonly pending: boolean;
}

/**
 * At most one `apply` per animation frame while dragging (docs/03 section 7). `requestFrame` is
 * injected so tests can drive frames by hand.
 */
export function createFrameThrottle<T>(apply: (v: T) => void, requestFrame: (cb: () => void) => void): FrameThrottle<T> {
  let queued = false;
  let scheduled = false;
  let latest: T | undefined;
  const run = (): void => {
    scheduled = false;
    if (!queued) return;
    queued = false;
    apply(latest as T);
  };
  return {
    push(v) {
      latest = v;
      queued = true;
      if (scheduled) return;
      scheduled = true;
      requestFrame(run);
    },
    flush() {
      if (!queued) return;
      queued = false;
      apply(latest as T);
    },
    get pending() {
      return scheduled;
    },
  };
}

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  value: number;
  /** Every pointer move while dragging. */
  onInput(v: number): void;
  /** Finger up (the "change" event). */
  onCommit(v: number): void;
}

export interface Slider {
  readonly root: HTMLDivElement;
  set(v: number): void;
  readonly value: number;
}

/** DOM edge: label, track, fill and knob. The whole row is the touch target. */
export function createSlider(o: SliderOptions): Slider {
  const root = el('div', 'sow-slider');
  const label = el('div', 'sow-slider-label');
  const track = el('div', 'sow-slider-track');
  const fill = el('div', 'sow-slider-fill');
  const knob = el('div', 'sow-slider-knob');
  track.append(fill, knob);
  root.append(label, track);
  let value = o.value;
  let active = -1;

  const paint = (): void => {
    label.textContent = `${o.label} ${value}`;
    const pct = `${Math.round(sliderFraction(value, o.min, o.max) * 1000) / 10}%`;
    fill.style.width = pct;
    knob.style.left = pct;
  };
  const read = (e: PointerEvent): number => {
    const r = track.getBoundingClientRect();
    return sliderValueAt(e.clientX, r.left, r.width, o.min, o.max);
  };
  const update = (e: PointerEvent): void => {
    const v = read(e);
    if (v === value) return;
    value = v;
    paint();
    o.onInput(v);
  };

  root.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    active = e.pointerId;
    try {
      root.setPointerCapture(e.pointerId);
    } catch {
      // capture is best effort
    }
    update(e);
  });
  root.addEventListener('pointermove', (e) => {
    if (e.pointerId !== active) return;
    e.preventDefault();
    update(e);
  });
  const end = (e: PointerEvent): void => {
    if (e.pointerId !== active) return;
    active = -1;
    o.onCommit(value);
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  paint();

  return {
    root,
    set(v) {
      if (active !== -1) return; // never fight the finger
      value = Math.min(o.max, Math.max(o.min, Math.round(v)));
      paint();
    },
    get value() {
      return value;
    },
  };
}
