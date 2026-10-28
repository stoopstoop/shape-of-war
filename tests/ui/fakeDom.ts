// A minimal DOM stand in for the node test environment (vitest runs without jsdom and no new
// dependency is allowed). It supports only what src/ui/dom.ts, slider.ts, menu.ts, pause.ts and
// settings.ts touch while they build a screen and handle a tap. Not a general purpose fake.
import { vi } from 'vitest';

export interface FakeEvent {
  pointerId: number;
  /** Pointer x in CSS px. Only the slider reads it. */
  clientX: number;
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
  /** What getBoundingClientRect reports. A slider track needs a width before it can be dragged. */
  rect = { left: 0, width: 0 };
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

  getBoundingClientRect(): { left: number; width: number } {
    return this.rect;
  }

  setPointerCapture(_pointerId: number): void {
    // no capture model in the fake
  }

  /** Dispatch one pointer event to this element's own listeners (no bubbling). */
  fire(type: string, pointerId = 1, clientX = 0): void {
    const ev: FakeEvent = { pointerId, clientX, preventDefault: () => undefined, stopPropagation: () => undefined };
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

/**
 * The slider whose label starts with `label` (the label reads "Music 50"), or undefined. The track
 * is given a 200 px wide rect at x 0, so a pointer at x maps to the value x / 2 on a 0 to 100 range.
 */
export function sliderNamed(root: FakeEl, label: string): { root: FakeEl; label: FakeEl } | undefined {
  const found = root.all().find((e) => e.classList.contains('sow-slider') && (e.children[0]?.textContent ?? '').startsWith(`${label} `));
  const text = found?.children[0];
  const track = found?.children[1];
  if (found === undefined || text === undefined || track === undefined) return undefined;
  track.rect = { left: 0, width: 200 };
  return { root: found, label: text };
}

/** The buttons inside the element with role group and this aria-label, in DOM order. */
export function groupButtons(root: FakeEl, label: string): FakeEl[] {
  const group = root.all().find((e) => e.getAttribute('role') === 'group' && e.getAttribute('aria-label') === label);
  return group === undefined ? [] : group.all().filter((e) => e.tag === 'button');
}
