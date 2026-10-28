import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bus, type WeaponKind } from '../../src/core/events';
import { UI_CSS } from '../../src/ui/dom';
import {
  aspectClass,
  createHud,
  due,
  hudLayout,
  hudText,
  levelLine,
  playRect,
  WEAPON_GATE_START,
  WEAPON_NAMES,
  weaponColour,
  weaponGate,
  weaponView,
  type HudWeapon,
} from '../../src/ui/hud';
import { hudFrame } from '../../src/ui/hudFrame';
import { asParent, FakeEl, installFakeDocument } from './fakeDom';

describe('hud', () => {
  it('aspect class switches at 1.8', () => {
    expect(aspectClass(1176, 504)).toBe('cover'); // about 21:9
    expect(aspectClass(900, 500)).toBe('cover');
    expect(aspectClass(899, 500)).toBe('main');
    expect(aspectClass(1092, 984)).toBe('main'); // about 10:9
  });

  it('play rect removes insets and the HUD band', () => {
    const ins = { top: 10, right: 20, bottom: 5, left: 30 };
    expect(playRect(1200, 500, ins, 'cover')).toEqual({ x: 30, y: 62, w: 1150, h: 433 });
    expect(playRect(1000, 900, ins, 'main')).toEqual({ x: 30, y: 86, w: 950, h: 809 });
    expect(hudLayout('cover').band).toBe(52);
    expect(hudLayout('main').band).toBe(76);
  });

  it('formats the hud:score payload', () => {
    const t = hudText({ score: 123456, multiplier: 12, lives: 3, bombs: 7, superCharge: 1.4 });
    expect(t.score).toBe('123,456');
    expect(t.mult).toBe('x12');
    expect(t.lives).toBe('▲▲▲');
    expect(t.bombs).toBe('● x 7');
    expect(t.bombCount).toBe('7');
    expect(t.charge).toBe(1);
  });

  it('throttles to 100 ms', () => {
    expect(due(0, 99)).toBe(false);
    expect(due(0, 100)).toBe(true);
  });

  it('level line carries index, par and hash', () => {
    expect(levelLine(3, 1500, 'abcd1234')).toBe('L3  Par 1,500  #abcd1234');
  });
});

// Weapon indicator (v2 wave B). hud:weapon is { kind, remaining, total } in seconds.

const w = (kind: WeaponKind, remaining: number, total = 20): HudWeapon => ({ kind, remaining, total });
const NON_SPREAD: readonly WeaponKind[] = ['rapid', 'pierce', 'orbit'];

describe('weapon indicator: view', () => {
  it('is hidden while the weapon is spread, whatever the numbers say', () => {
    for (const remaining of [0, 5, 20, 99]) expect(weaponView(w('spread', remaining)).visible).toBe(false);
    expect(weaponView(w('spread', 20)).label).toBe('SPREAD');
  });

  it('shows for rapid, pierce and orbit with the weapon name', () => {
    expect(NON_SPREAD.map((k) => weaponView(w(k, 12)).visible)).toEqual([true, true, true]);
    expect(NON_SPREAD.map((k) => weaponView(w(k, 12)).label)).toEqual(['RAPID', 'PIERCE', 'ORBIT']);
    expect(WEAPON_NAMES.spread).toBe('SPREAD');
  });

  it('the countdown is full at pickup, half at 10 of 20 s and empty at 0', () => {
    expect(weaponView(w('rapid', 20)).fraction).toBe(1);
    expect(weaponView(w('rapid', 10)).fraction).toBe(0.5);
    expect(weaponView(w('rapid', 5)).fraction).toBe(0.25);
    expect(weaponView(w('rapid', 0)).fraction).toBe(0);
  });

  it('at 0 remaining the bar is empty but the indicator is still up until spread arrives', () => {
    const v = weaponView(w('pierce', 0));
    expect(v.fraction).toBe(0);
    expect(v.visible).toBe(true);
  });

  it('the fraction uses the payload total, not a fixed 20 s', () => {
    expect(weaponView(w('orbit', 15, 30)).fraction).toBe(0.5);
    expect(weaponView(w('orbit', 3, 12)).fraction).toBe(0.25);
  });

  it('clamps an overshoot and an undershoot into 0 to 1', () => {
    expect(weaponView(w('rapid', 25)).fraction).toBe(1);
    expect(weaponView(w('rapid', -3)).fraction).toBe(0);
  });

  it('a payload with no usable total or a non finite number hides the indicator and gives a finite fraction', () => {
    for (const p of [w('rapid', 5, 0), w('rapid', 5, -1), w('rapid', Number.NaN), w('rapid', 5, Number.NaN), w('rapid', Number.POSITIVE_INFINITY)]) {
      const v = weaponView(p);
      expect(v.visible, JSON.stringify(p)).toBe(false);
      expect(Number.isFinite(v.fraction)).toBe(true);
    }
  });

  it('each weapon has its own colour', () => {
    const colours = NON_SPREAD.map(weaponColour);
    expect(new Set(colours).size).toBe(3);
  });
});

describe('weapon indicator: 100 ms throttle', () => {
  it('draws the first payload', () => {
    expect(weaponGate(WEAPON_GATE_START, w('rapid', 20), 5000).draw).toBe(true);
  });

  it('skips a same weapon payload inside 100 ms and draws at 100 ms, like hud:score', () => {
    const first = weaponGate(WEAPON_GATE_START, w('rapid', 20), 1000);
    expect(weaponGate(first.gate, w('rapid', 19.9), 1099).draw).toBe(false);
    expect(weaponGate(first.gate, w('rapid', 19.9), 1100).draw).toBe(true);
  });

  it('a skipped payload leaves the gate alone, so the window runs from the last draw', () => {
    const first = weaponGate(WEAPON_GATE_START, w('rapid', 20), 1000);
    const skipped = weaponGate(first.gate, w('rapid', 19.95), 1060);
    expect(skipped.draw).toBe(false);
    expect(skipped.gate).toEqual(first.gate);
    expect(weaponGate(skipped.gate, w('rapid', 19.9), 1100).draw).toBe(true);
  });

  it('a change of weapon always draws, even inside the window', () => {
    const first = weaponGate(WEAPON_GATE_START, w('rapid', 20), 1000);
    expect(weaponGate(first.gate, w('pierce', 20), 1010).draw).toBe(true);
  });

  it('the change back to spread always draws, so the indicator cannot be left up', () => {
    const first = weaponGate(WEAPON_GATE_START, w('orbit', 0.05), 1000);
    const end = weaponGate(first.gate, w('spread', 0), 1020);
    expect(end.draw).toBe(true);
    expect(end.gate.kind).toBe('spread');
  });

  it('does not mutate the gate it is given', () => {
    const g = { lastMs: 10, kind: 'rapid' as const };
    weaponGate(g, w('pierce', 20), 20);
    expect(g).toEqual({ lastMs: 10, kind: 'rapid' });
  });
});

describe('weapon indicator: DOM', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function build() {
    const root = installFakeDocument();
    const bus = new Bus();
    let t = 0;
    const hud = createHud(asParent(root), () => t);
    hud.listen(bus);
    const find = (name: string): FakeEl => {
      const e = root.all().find((n) => n.getAttribute('data-hud') === name);
      if (e === undefined) throw new Error(`no element ${name}`);
      return e;
    };
    return {
      root,
      bus,
      hud,
      label: find('weapon'),
      bar: find('weapon-bar'),
      fill: find('weapon-fill'),
      at: (ms: number) => {
        t = ms;
      },
    };
  }

  const shown = (e: FakeEl): boolean => e.style.display !== 'none';

  it('is hidden before any weapon arrives', () => {
    const { label, bar } = build();
    expect(shown(label)).toBe(false);
    expect(shown(bar)).toBe(false);
  });

  it('shows the weapon name and a full bar when a pickup is collected', () => {
    const { bus, label, bar, fill } = build();
    bus.emit('hud:weapon', w('rapid', 20));
    expect(shown(label)).toBe(true);
    expect(shown(bar)).toBe(true);
    expect(label.textContent).toBe('RAPID');
    expect(fill.style.width).toBe('100%');
  });

  it('the bar reads full, half and empty at 20, 10 and 0 s left', () => {
    const { bus, hud, fill, label } = build();
    hud.setWeapon(w('pierce', 20));
    expect(fill.style.width).toBe('100%');
    hud.setWeapon(w('pierce', 10));
    expect(fill.style.width).toBe('50%');
    hud.setWeapon(w('pierce', 0));
    expect(fill.style.width).toBe('0%');
    expect(shown(label)).toBe(true);
    bus.emit('hud:weapon', w('pierce', 10)); // through the bus too (first draw, no throttle yet)
    expect(fill.style.width).toBe('50%');
  });

  it('hides when the weapon goes back to spread', () => {
    const { bus, at, label, bar } = build();
    bus.emit('hud:weapon', w('orbit', 20));
    expect(shown(label)).toBe(true);
    at(10); // inside the throttle window: the change to spread still lands
    bus.emit('hud:weapon', w('spread', 0));
    expect(shown(label)).toBe(false);
    expect(shown(bar)).toBe(false);
  });

  it('shows again on the next pickup after hiding', () => {
    const { bus, at, label } = build();
    bus.emit('hud:weapon', w('rapid', 20));
    at(50);
    bus.emit('hud:weapon', w('spread', 0));
    at(60);
    bus.emit('hud:weapon', w('orbit', 20));
    expect(shown(label)).toBe(true);
    expect(label.textContent).toBe('ORBIT');
  });

  it('updates the countdown at most every 100 ms', () => {
    const { bus, at, fill } = build();
    at(1000);
    bus.emit('hud:weapon', w('rapid', 20));
    expect(fill.style.width).toBe('100%');
    at(1050);
    bus.emit('hud:weapon', w('rapid', 10));
    expect(fill.style.width).toBe('100%'); // skipped
    at(1099);
    bus.emit('hud:weapon', w('rapid', 10));
    expect(fill.style.width).toBe('100%'); // still inside the window
    at(1100);
    bus.emit('hud:weapon', w('rapid', 10));
    expect(fill.style.width).toBe('50%');
  });

  it('a burst of 50 events inside one window draws once', () => {
    const { bus, at, fill } = build();
    at(0);
    bus.emit('hud:weapon', w('rapid', 20));
    for (let i = 1; i <= 50; i++) {
      at(i);
      bus.emit('hud:weapon', w('rapid', 20 - i * 0.1));
    }
    expect(fill.style.width).toBe('100%');
  });

  it('a different weapon replaces the label at once', () => {
    const { bus, at, label, fill } = build();
    bus.emit('hud:weapon', w('rapid', 3));
    at(20);
    bus.emit('hud:weapon', w('pierce', 20));
    expect(label.textContent).toBe('PIERCE');
    expect(fill.style.width).toBe('100%');
  });

  it('the label and the bar take the weapon colour', () => {
    const { bus, label, fill } = build();
    bus.emit('hud:weapon', w('orbit', 20));
    expect(label.style.color).toBe(weaponColour('orbit'));
    expect(fill.style.background).toBe(weaponColour('orbit'));
  });

  it('clearWeapon hides it and forgets the throttle, so the next payload draws at once', () => {
    const { bus, hud, at, label, fill } = build();
    at(500);
    bus.emit('hud:weapon', w('rapid', 20));
    hud.clearWeapon();
    expect(shown(label)).toBe(false);
    bus.emit('hud:weapon', w('rapid', 20)); // same instant, same weapon
    expect(shown(label)).toBe(true);
    expect(fill.style.width).toBe('100%');
  });

  it('the unsubscribe function stops both hud:score and hud:weapon', () => {
    const root = installFakeDocument();
    const bus = new Bus();
    const hud = createHud(asParent(root), () => 0);
    const off = hud.listen(bus);
    const label = root.all().find((n) => n.getAttribute('data-hud') === 'weapon');
    off();
    bus.emit('hud:weapon', w('rapid', 20));
    expect(label?.style.display).toBe('none');
  });

  it('hud:score still reaches the score line through the same listen call', () => {
    const { bus, root } = build();
    bus.emit('hud:score', { score: 4200, multiplier: 7, lives: 3, bombs: 2, superCharge: 0.5 });
    const texts = root.all().map((e) => e.textContent);
    expect(texts).toContain('4,200');
    expect(texts).toContain('x7');
  });

  it('adds no pointer target: plain divs inside the HUD root, which has pointer-events none', () => {
    const { root, label, bar, fill } = build();
    const hudRoot = root.children[0];
    expect(hudRoot?.classList.contains('sow-hud')).toBe(true);
    for (const e of [label, bar, fill]) {
      expect(e.tag).toBe('div');
      expect(hudRoot?.all()).toContain(e);
    }
    expect(UI_CSS).toMatch(/\.sow-hud \{[^}]*pointer-events: none/);
    // none of the three is a button, input or anchor
    expect(root.all().filter((e) => ['button', 'input', 'a'].includes(e.tag))).toEqual([]);
  });

  it('layout puts the label and bar in the frame boxes and leaves visibility alone', () => {
    const { hud, bus, label, bar } = build();
    const f = hudFrame(960, 411, { top: 0, right: 0, bottom: 0, left: 0 }, 1600, 1000);
    hud.layout(f, true);
    expect(label.style.left).toBe(`${f.boxes.weapon.x}px`);
    expect(label.style.top).toBe(`${f.boxes.weapon.y}px`);
    expect(label.style.width).toBe(`${f.boxes.weapon.w}px`);
    expect(bar.style.left).toBe(`${f.boxes.weaponBar.x}px`);
    expect(bar.style.top).toBe(`${f.boxes.weaponBar.y}px`);
    expect(bar.style.height).toBe(`${f.boxes.weaponBar.h}px`);
    expect(shown(label)).toBe(false); // no weapon yet
    bus.emit('hud:weapon', w('rapid', 20));
    hud.layout(f, true); // a resize while the weapon is up keeps it up
    expect(shown(label)).toBe(true);
    expect(shown(bar)).toBe(true);
    hud.layout(f, false); // no touch input: rings and pause go, the indicator is not a button
    expect(shown(label)).toBe(true);
  });
});

