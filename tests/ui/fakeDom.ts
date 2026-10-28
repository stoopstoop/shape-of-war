// A minimal DOM stand in for the node test environment (vitest runs without jsdom and no new
// dependency is allowed). It supports only what src/ui/dom.ts, slider.ts, menu.ts, pause.ts and
// settings.ts touch while they build a screen and handle a tap. Not a general purpose fake.
import { vi } from 'vitest';

export interface FakeEvent {
  pointerId: number;
  preventDefault(): void;
  stopPropagation(): void;
}

type Listener = (e: FakeEvent) => void;

export class FakeEl {
  textContent = '';
  type = '';
  value = '';
  inputMode = '';
  autocomplete = '';
  placeholder = '';
  maxLength = 0;
  readonly style: Record<string, string> = {};
  readonly children: FakeEl[] = [];
  private readonly attrs = new Map<string, string>();
  private readonly classes = new Set<string>();
  private readonly listeners = new Map<string, Listener[]>();

  readonly classList = {
    add: (...names: string[]): void => {
      for (const n of names) this.classes.add(n);
    },
    remove: (...names: string[]): void => {
      for (const n of names) this.classes.delete(n);
    },
    toggle: (name: string, force?: boolean): boolean => {
      const on = force ?? !this.classes.has(name);
      if (on) this.classes.add(name);
      else this.classes.delete(name);
      return on;
    },
    contains: (name: string): boolean => this.classes.has(name),
  };

  constructor(readonly tag: string) {}

  get className(): string {
    return [...this.classes].join(' ');
  }

  set className(v: string) {
    this.classes.clear();
    for (const c of v.split(/\s+/)) if (c !== '') this.classes.add(c);
  }

  append(...nodes: FakeEl[]): void {
    this.children.push(...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  addEventListener(type: string, fn: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  blur(): void {
    // no focus model in the fake
  }

  /** Dispatch one pointer event to this element's own listeners (no bubbling). */
  fire(type: string, pointerId = 1): void {
    const ev: FakeEvent = { pointerId, preventDefault: () => undefined, stopPropagation: () => undefined };
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }

  /** A finger tap: pointerdown then pointerup with the same pointer id. */
  tap(pointerId = 1): void {
    this.fire('pointerdown', pointerId);
    this.fire('pointerup', pointerId);
  }

  /** This element and every descendant, depth first. */
  all(): FakeEl[] {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
}

/** Stub the global document so el() builds FakeEl nodes. Returns a root to pass as the parent. */
export function installFakeDocument(): FakeEl {
  vi.stubGlobal('document', { createElement: (tag: string) => new FakeEl(tag) });
  return new FakeEl('div');
}

/** The root typed as the HTMLElement the screen factories ask for. */
export function asParent(root: FakeEl): HTMLElement {
  return root as unknown as HTMLElement;
}

/** Every button under `root` whose label is exactly `text`. */
export function buttonsLabelled(root: FakeEl, text: string): FakeEl[] {
  return root.all().filter((e) => e.tag === 'button' && e.textContent === text);
}

/** The buttons inside the element with role group and this aria-label, in DOM order. */
export function groupButtons(root: FakeEl, label: string): FakeEl[] {
  const group = root.all().find((e) => e.getAttribute('role') === 'group' && e.getAttribute('aria-label') === label);
  return group === undefined ? [] : group.all().filter((e) => e.tag === 'button');
}
