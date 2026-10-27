// History guard (docs/04 section 11): the first system back press pauses instead of leaving.
// The emitter is injected so this file compiles before src/core/events.ts lands; Forge passes
// `bus` from src/core/events.ts, which satisfies PauseEmitter structurally.

/** The slice of the core bus this module needs. */
export interface PauseEmitter {
  emit(k: 'game:pause'): void;
}

/** The slice of window this module needs, so tests can pass a fake. */
export interface HistoryHost {
  history: { pushState(data: unknown, unused: string): void };
  addEventListener(type: 'popstate', h: () => void): void;
  removeEventListener(type: 'popstate', h: () => void): void;
}

export const GUARD_STATE = { sow: 1 } as const;

/** Arms the guard and returns a function that removes the listener. */
export function installHistoryGuard(bus: PauseEmitter, host: HistoryHost = window): () => void {
  host.history.pushState(GUARD_STATE, '');
  const onPop = (): void => {
    bus.emit('game:pause');
    host.history.pushState(GUARD_STATE, '');
  };
  host.addEventListener('popstate', onPop);
  return () => host.removeEventListener('popstate', onPop);
}
