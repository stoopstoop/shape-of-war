// Touch scroll fallback policy (docs/04 section 11), pure so it runs under node tests.
// A touch keeps its start element as target for its whole life, so the target of each
// changed touch on a touchmove is where that touch began.

/** True when at least one changed touch began on the game canvas. */
export function startedOnCanvas(targets: readonly unknown[], canvas: unknown): boolean {
  return targets.some((t) => t === canvas);
}

/** The slice of TouchEvent the policy reads, so tests can pass a fake. */
export interface TouchMoveLike {
  changedTouches: ArrayLike<{ target: unknown }>;
  preventDefault(): void;
}

/** Targets of the changed touches, in order. */
export function touchTargets(e: TouchMoveLike): unknown[] {
  return Array.from(e.changedTouches, (t) => t.target);
}

/**
 * Builds the document touchmove listener. Prevents the default only for touches that began on
 * the canvas; touches that began in the DOM UI overlay (sliders, scroll areas) stay native.
 */
export function makeTouchMoveGuard(canvas: unknown): (e: TouchMoveLike) => void {
  return (e) => {
    if (startedOnCanvas(touchTargets(e), canvas)) e.preventDefault();
  };
}
