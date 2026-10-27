// Audio port (docs/03 section 1, docs/04 section 12). main.ts finds Glow's src/audio/synth.ts
// with import.meta.glob; until it merges, both calls are no-ops. Pure: the module is passed in
// and checked at runtime, so a missing or partial synth never breaks the build or the boot.

export interface AudioPort {
  /** Resume the AudioContext. Must be called inside a user gesture handler. */
  unlock(): void;
  /** Master volume 0 to 100. */
  setVolume(v: number): void;
  /** True when Glow's synth was found. */
  readonly live: boolean;
}

type Fn = (...args: never[]) => unknown;

function isFn(v: unknown): v is Fn {
  return typeof v === 'function';
}

export function resolveAudio(mod: unknown): AudioPort {
  const unlock: unknown = typeof mod === 'object' && mod !== null ? Reflect.get(mod, 'unlockAudio') : undefined;
  const vol: unknown = typeof mod === 'object' && mod !== null ? Reflect.get(mod, 'setVolume') : undefined;
  return {
    live: isFn(unlock),
    unlock() {
      if (!isFn(unlock)) return;
      try {
        const r: unknown = (unlock as () => unknown)();
        if (r instanceof Promise) r.catch(() => undefined);
      } catch {
        // audio is optional; the game runs silent
      }
    },
    setVolume(v) {
      if (!isFn(vol)) return;
      try {
        (vol as (n: number) => unknown)(Math.min(100, Math.max(0, Math.round(v))));
      } catch {
        // ignore
      }
    },
  };
}
