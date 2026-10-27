import { describe, expect, it } from 'vitest';
import { GUARD_STATE, installHistoryGuard } from '../../src/input/history';
import type { HistoryHost, PauseEmitter } from '../../src/input/history';

// Local copy of the bus shape from docs/03-architecture.md section 9 (trimmed events),
// to prove at compile time that Forge's real bus satisfies PauseEmitter.
interface Events {
  'game:pause': void;
  'game:resume': void;
  'viewport:changed': { cssW: number; cssH: number; dpr: number };
}
class Bus {
  calls: string[] = [];
  emit<K extends keyof Events>(k: K, ...p: Events[K] extends void ? [] : [Events[K]]): void {
    this.calls.push(`${k}:${p.length}`);
  }
}

function fakeHost(): HistoryHost & { pushes: unknown[]; fire(): void; listeners: number } {
  let handlers: (() => void)[] = [];
  const host = {
    pushes: [] as unknown[],
    history: {
      pushState(data: unknown): void {
        host.pushes.push(data);
      },
    },
    addEventListener(_t: 'popstate', h: () => void): void {
      handlers.push(h);
    },
    removeEventListener(_t: 'popstate', h: () => void): void {
      handlers = handlers.filter((x) => x !== h);
    },
    fire(): void {
      handlers.forEach((h) => h());
    },
    get listeners(): number {
      return handlers.length;
    },
  };
  return host;
}

describe('installHistoryGuard', () => {
  it('arms one history entry, then each back emits game:pause and re-arms', () => {
    const bus = new Bus();
    const emitter: PauseEmitter = bus; // type check: the 03 section 9 bus fits
    const host = fakeHost();
    installHistoryGuard(emitter, host);
    expect(host.pushes).toEqual([GUARD_STATE]);
    host.fire();
    expect(bus.calls).toEqual(['game:pause:0']);
    expect(host.pushes.length).toBe(2);
    host.fire();
    expect(bus.calls.length).toBe(2);
  });

  it('removes its listener on dispose', () => {
    const bus = new Bus();
    const host = fakeHost();
    const off = installHistoryGuard(bus, host);
    expect(host.listeners).toBe(1);
    off();
    host.fire();
    expect(bus.calls).toEqual([]);
  });
});
