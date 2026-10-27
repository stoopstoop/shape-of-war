import { describe, expect, it } from 'vitest';
import { makeTouchMoveGuard, startedOnCanvas, touchTargets } from '../../src/input/gesture';
import type { TouchMoveLike } from '../../src/input/gesture';
import { attachTouch } from '../../src/input/touch';

type Listener = (e: unknown) => void;

interface FakeTarget {
  listeners: Map<string, Listener[]>;
  addEventListener(t: string, h: Listener): void;
  removeEventListener(t: string, h: Listener): void;
  fire(t: string, e: unknown): void;
}

function fakeTarget(): FakeTarget {
  const listeners = new Map<string, Listener[]>();
  return {
    listeners,
    addEventListener(t, h): void {
      listeners.set(t, [...(listeners.get(t) ?? []), h]);
    },
    removeEventListener(t, h): void {
      listeners.set(t, (listeners.get(t) ?? []).filter((x) => x !== h));
    },
    fire(t, e): void {
      (listeners.get(t) ?? []).forEach((h) => h(e));
    },
  };
}

function fakeMove(...targets: unknown[]): TouchMoveLike & { prevented: number } {
  const ev = {
    prevented: 0,
    changedTouches: targets.map((target) => ({ target })),
    preventDefault(): void {
      ev.prevented += 1;
    },
  };
  return ev;
}

function fakeCanvas(): { canvas: HTMLCanvasElement; doc: FakeTarget } {
  const doc = fakeTarget();
  const self = fakeTarget();
  const c = {
    ...self,
    style: { touchAction: '', userSelect: '' },
    clientWidth: 1000,
    clientHeight: 600,
    ownerDocument: doc,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }),
    setPointerCapture: (): void => undefined,
    hasPointerCapture: (): boolean => false,
    releasePointerCapture: (): void => undefined,
  };
  return { canvas: c as unknown as HTMLCanvasElement, doc };
}

describe('startedOnCanvas', () => {
  const canvas = { id: 'canvas' };
  const slider = { id: 'slider' };
  it('is true when any changed touch began on the canvas', () => {
    expect(startedOnCanvas([canvas], canvas)).toBe(true);
    expect(startedOnCanvas([slider, canvas], canvas)).toBe(true);
  });
  it('is false for UI element touches and for no touches', () => {
    expect(startedOnCanvas([slider], canvas)).toBe(false);
    expect(startedOnCanvas([], canvas)).toBe(false);
  });
});

describe('touchTargets', () => {
  it('lists changed touch targets in order', () => {
    const a = { n: 1 };
    const b = { n: 2 };
    const t = touchTargets(fakeMove(a, b));
    expect(t[0]).toBe(a);
    expect(t[1]).toBe(b);
  });
});

describe('makeTouchMoveGuard', () => {
  const canvas = { id: 'canvas' };
  const guard = makeTouchMoveGuard(canvas);
  it('does not prevent a touchmove on a UI element', () => {
    const e = fakeMove({ ui: 'neon slider' });
    guard(e);
    expect(e.prevented).toBe(0);
  });
  it('prevents a touchmove that began on the canvas', () => {
    const e = fakeMove(canvas);
    guard(e);
    expect(e.prevented).toBe(1);
  });
});

describe('attachTouch touchmove wiring', () => {
  it('keeps touch-action none on the canvas and scopes the document guard', () => {
    const { canvas, doc } = fakeCanvas();
    const h = attachTouch(canvas);
    expect(canvas.style.touchAction).toBe('none');
    expect(doc.listeners.get('touchmove')?.length).toBe(1);

    const onUi = fakeMove({ ui: 'results list' });
    doc.fire('touchmove', onUi);
    expect(onUi.prevented).toBe(0);

    const onCanvas = fakeMove(canvas);
    doc.fire('touchmove', onCanvas);
    expect(onCanvas.prevented).toBe(1);

    h.detach();
    expect(doc.listeners.get('touchmove')?.length).toBe(0);
  });
});
