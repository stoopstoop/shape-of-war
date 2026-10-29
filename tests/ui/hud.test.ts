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
import type { Insets, Rect } from '../../src/input/types';
import { BOSS_IDS } from '../../src/levelgen/leveldef';
import { BOSS_NAMES, BOSS_TIER, bossColour, bossFill, type HudBoss } from '../../src/ui/boss';
import { BOSS_PIPS_W, COVER_LEFT, COVER_RIGHT, hudFrame, MAIN_ROWS, mainTop, overlaps, type HudFrame } from '../../src/ui/hudFrame';
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

// Boss bar (V3-A). hud:boss is { id, hp, maxHp, phase, phases, mode }; hit points are tenths of a hit.

const boss = (over: Partial<HudBoss> = {}): HudBoss => ({ id: 'warden', hp: 3600, maxHp: 3600, phase: 1, phases: 2, mode: 2, ...over });
const ZERO: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

describe('boss bar: DOM', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function build() {
    const root = installFakeDocument();
    const bus = new Bus();
    let t = 0;
    const hud = createHud(asParent(root), () => t);
    const off = hud.listen(bus);
    const find = (name: string): FakeEl => {
      const e = root.all().find((n) => n.getAttribute('data-hud') === name);
      if (e === undefined) throw new Error(`no element ${name}`);
      return e;
    };
    const pips = find('boss-pips');
    return {
      root,
      bus,
      hud,
      off,
      name: find('boss-name'),
      bar: find('boss-bar'),
      fill: find('boss-fill'),
      pips,
      pipEls: pips.children,
      at: (ms: number) => {
        t = ms;
      },
    };
  }

  const shown = (e: FakeEl): boolean => e.style.display !== 'none';
  const litPips = (pipEls: FakeEl[]): string[] => pipEls.filter((e) => e.style.display === 'block').map((e) => e.style.background ?? '');

  it('is hidden before any boss arrives', () => {
    const { name, bar, pips } = build();
    for (const e of [name, bar, pips]) expect(shown(e)).toBe(false);
  });

  it('a boss entering shows its name and a full bar with no pips yet', () => {
    const { bus, name, bar, fill, pips } = build();
    bus.emit('sim:bossEnter', { id: 'brood', tier: 1 });
    expect(shown(name)).toBe(true);
    expect(shown(bar)).toBe(true);
    expect(name.textContent).toBe(BOSS_NAMES.brood);
    expect(fill.style.width).toBe('100%');
    expect(shown(pips)).toBe(false); // the phase count arrives with the first hud:boss
  });

  it('shows the boss name in the tier colour', () => {
    const { bus, name } = build();
    bus.emit('hud:boss', boss({ id: 'ember' }));
    expect(name.textContent).toBe('Ember');
    expect(name.style.color).toBe(bossColour('ember'));
    expect(name.style.textShadow).toContain(bossColour('ember', 0.8)); // the glow follows the tier too
  });

  it('the hit point bar reads full, half and 0 at 3600, 1800 and 0 of 3600', () => {
    const { hud, fill, name, bar } = build();
    hud.setBoss(boss({ hp: 3600 }));
    expect(fill.style.width).toBe('100%');
    hud.setBoss(boss({ hp: 1800 }));
    expect(fill.style.width).toBe('50%');
    hud.setBoss(boss({ hp: 0 }));
    expect(fill.style.width).toBe('0%');
    expect(shown(name)).toBe(true); // still up at 0 hit points: only sim:bossDown takes it away
    expect(shown(bar)).toBe(true);
  });

  it('works through the bus too, on the first draw', () => {
    const { bus, fill } = build();
    bus.emit('hud:boss', boss({ hp: 900 }));
    expect(fill.style.width).toBe('25%');
  });

  it('draws one pip per phase and marks the current one', () => {
    const { hud, pips, pipEls } = build();
    hud.setBoss(boss({ id: 'mirage', phase: 2, phases: 3 }));
    expect(shown(pips)).toBe(true);
    const solid = bossColour('mirage');
    const faint = bossColour('mirage', 0.45);
    expect(litPips(pipEls)).toEqual([faint, solid, 'transparent']); // done, current, next
    expect(pipEls[1]?.style.boxShadow).toContain(solid); // only the current pip glows
    expect(pipEls[0]?.style.boxShadow).toBe('');
    expect(pipEls[2]?.style.boxShadow).toBe('');
    expect(pipEls.slice(3).every((e) => e.style.display === 'none')).toBe(true);
  });

  it('the pip count follows the boss: 2, 3 and 4 phases', () => {
    const { hud, pipEls } = build();
    for (const n of [2, 3, 4]) {
      hud.setBoss(boss({ phases: n }));
      expect(litPips(pipEls)).toHaveLength(n);
    }
    hud.setBoss(boss({ phases: 1 })); // a one phase payload has nothing to count
    expect(litPips(pipEls)).toHaveLength(0);
  });

  it('a phase change moves the lit pip at once, inside the throttle window', () => {
    const { bus, at, pipEls } = build();
    at(1000);
    bus.emit('hud:boss', boss({ phase: 1, phases: 3 }));
    expect(litPips(pipEls)[0]).toBe(bossColour('warden'));
    at(1010);
    bus.emit('hud:boss', boss({ phase: 2, phases: 3 }));
    expect(litPips(pipEls)[1]).toBe(bossColour('warden'));
    expect(litPips(pipEls)[0]).toBe(bossColour('warden', 0.45));
  });

  it('updates at most every 100 ms', () => {
    const { bus, at, fill } = build();
    at(1000);
    bus.emit('hud:boss', boss({ hp: 3600 }));
    expect(fill.style.width).toBe('100%');
    at(1050);
    bus.emit('hud:boss', boss({ hp: 1800 }));
    expect(fill.style.width).toBe('100%'); // skipped
    at(1099);
    bus.emit('hud:boss', boss({ hp: 1800 }));
    expect(fill.style.width).toBe('100%');
    at(1100);
    bus.emit('hud:boss', boss({ hp: 1800 }));
    expect(fill.style.width).toBe('50%');
  });

  it('a burst of 50 events inside one window draws once', () => {
    const { bus, at, fill } = build();
    at(0);
    bus.emit('hud:boss', boss({ hp: 3600 }));
    for (let i = 1; i <= 50; i++) {
      at(i);
      bus.emit('hud:boss', boss({ hp: 3600 - i * 10 }));
    }
    expect(fill.style.width).toBe('100%');
  });

  it('the move to 0 hit points draws at once, inside the window', () => {
    const { bus, at, fill } = build();
    at(1000);
    bus.emit('hud:boss', boss({ hp: 200 }));
    at(1005);
    bus.emit('hud:boss', boss({ hp: 0 }));
    expect(fill.style.width).toBe('0%');
  });

  it('sim:bossDown takes the bar away, and a late hud:boss with no hit points does not bring it back', () => {
    const { bus, at, name, bar, pips } = build();
    at(1000);
    bus.emit('sim:bossEnter', { id: 'warden', tier: 1 });
    bus.emit('hud:boss', boss({ phases: 2 }));
    bus.emit('sim:bossDown', { id: 'warden', x: 0, y: 0 });
    for (const e of [name, bar, pips]) expect(shown(e)).toBe(false);
    at(1001);
    bus.emit('hud:boss', boss({ hp: 0 }));
    for (const e of [name, bar, pips]) expect(shown(e)).toBe(false);
  });

  it('the next boss shows again after one went down (Endless): on its enter and on a living hud:boss', () => {
    const { bus, at, name, hud } = build();
    bus.emit('sim:bossEnter', { id: 'warden', tier: 1 });
    bus.emit('sim:bossDown', { id: 'warden', x: 0, y: 0 });
    at(5000);
    bus.emit('sim:bossEnter', { id: 'brood', tier: 1 });
    expect(shown(name)).toBe(true);
    expect(name.textContent).toBe('Brood');
    bus.emit('sim:bossDown', { id: 'brood', x: 0, y: 0 });
    expect(hud.bossShown()).toBe(false);
    bus.emit('hud:boss', boss({ id: 'spindle', hp: 100 })); // no enter event, still alive
    expect(shown(name)).toBe(true);
    expect(name.textContent).toBe('Spindle');
  });

  it('an enter that arrives after the first hud:boss does not reset the bar', () => {
    const { bus, fill, pipEls } = build();
    bus.emit('hud:boss', boss({ hp: 1800, phases: 3 }));
    bus.emit('sim:bossEnter', { id: 'warden', tier: 1 });
    expect(fill.style.width).toBe('50%');
    expect(litPips(pipEls)).toHaveLength(3);
  });

  it('clearBoss hides it and forgets the throttle, so the next payload draws at once', () => {
    const { bus, hud, at, name, fill } = build();
    at(500);
    bus.emit('hud:boss', boss({ hp: 3600 }));
    hud.clearBoss();
    expect(shown(name)).toBe(false);
    expect(hud.bossShown()).toBe(false);
    bus.emit('hud:boss', boss({ hp: 1800 })); // same instant, same boss
    expect(shown(name)).toBe(true);
    expect(fill.style.width).toBe('50%');
  });

  it('clearBoss also lifts the late payload guard, so a fresh level can show a boss at once', () => {
    const { bus, hud, name } = build();
    bus.emit('sim:bossDown', { id: 'warden', x: 0, y: 0 });
    hud.clearBoss();
    bus.emit('hud:boss', boss({ hp: 0 }));
    expect(shown(name)).toBe(true);
  });

  it('an unreadable payload hides the bar instead of drawing a broken one', () => {
    const { hud, name, bar, pips } = build();
    hud.setBoss(boss());
    hud.setBoss(boss({ maxHp: 0 }));
    for (const e of [name, bar, pips]) expect(shown(e)).toBe(false);
    expect(hud.bossShown()).toBe(false);
  });

  it('the bar takes the tier colour and the tier glow; Prism is a moving rainbow', () => {
    const { hud, fill, at } = build();
    for (const id of BOSS_IDS.filter((b) => b !== 'prism')) {
      hud.setBoss(boss({ id }));
      expect(fill.style.background, id).toBe(bossColour(id));
      expect(fill.style.boxShadow, id).toBe(bossFill(id, 0).glow);
    }
    at(0);
    hud.setBoss(boss({ id: 'prism', phases: 4 }));
    const first = fill.style.background;
    expect(first).toContain('linear-gradient');
    at(750);
    hud.setBoss(boss({ id: 'prism', phases: 4 }));
    expect(fill.style.background).not.toBe(first);
  });

  it('the thick red glow of tier 3 is wider than tier 1', () => {
    const { hud, fill } = build();
    const px = (id: 'warden' | 'bastion'): number => {
      hud.setBoss(boss({ id }));
      return Number.parseInt(fill.style.boxShadow?.match(/0 0 (\d+)px/)?.[1] ?? '0', 10);
    };
    expect(px('bastion')).toBeGreaterThan(px('warden'));
    expect(BOSS_TIER.bastion).toBe(3);
  });

  it('the unsubscribe function stops the boss events too', () => {
    const { bus, off, name } = build();
    off();
    bus.emit('sim:bossEnter', { id: 'warden', tier: 1 });
    bus.emit('hud:boss', boss());
    expect(shown(name)).toBe(false);
  });

  it('adds no pointer target: plain divs inside the HUD root, which has pointer-events none', () => {
    const { root, name, bar, fill, pips, pipEls } = build();
    const hudRoot = root.children[0];
    expect(hudRoot?.classList.contains('sow-hud')).toBe(true);
    for (const e of [name, bar, fill, pips, ...pipEls]) {
      expect(e.tag).toBe('div');
      expect(hudRoot?.all()).toContain(e);
    }
    expect(UI_CSS).toMatch(/\.sow-hud \{[^}]*pointer-events: none/);
    expect(root.all().filter((e) => ['button', 'input', 'a'].includes(e.tag))).toEqual([]);
  });

  it('layout puts the boxes in the frame and leaves visibility alone', () => {
    const { hud, bus, name, bar, pips } = build();
    const f = hudFrame(960, 411, ZERO, 1600, 1000);
    hud.layout(f, true);
    expect(name.style.left).toBe(`${f.boxes.bossName.x}px`);
    expect(name.style.top).toBe(`${f.boxes.bossName.y}px`);
    expect(name.style.width).toBe(`${f.boxes.bossName.w}px`);
    expect(bar.style.left).toBe(`${f.boxes.bossBar.x}px`);
    expect(bar.style.top).toBe(`${f.boxes.bossBar.y}px`);
    expect(bar.style.height).toBe(`${f.boxes.bossBar.h}px`);
    expect(pips.style.left).toBe(`${f.boxes.bossPips.x}px`);
    expect(shown(name)).toBe(false); // no boss yet
    bus.emit('hud:boss', boss());
    hud.layout(f, true); // a resize while the boss is up keeps it up
    expect(shown(name)).toBe(true);
    expect(shown(bar)).toBe(true);
    hud.layout(f, false); // no touch input: rings and pause go, the boss bar is not a button
    expect(shown(name)).toBe(true);
  });

  it('on main the level line steps aside for the boss bar and returns when it goes; on cover it stays', () => {
    const { hud, root } = build();
    hud.setLevel(5, 4000, 'abcd1234');
    const par = root.all().find((n) => n.textContent.startsWith('L5'));
    expect(par).toBeDefined();
    const main = hudFrame(832, 750, ZERO, 1800, 1000);
    const cover = hudFrame(960, 411, ZERO, 1800, 1000);
    expect(main.cls).toBe('main');
    expect(cover.cls).toBe('cover');
    hud.layout(main, true);
    expect(par?.style.display).toBe(''); // no boss: the line is up
    hud.setBoss(boss());
    expect(par?.style.display).toBe('none');
    hud.layout(cover, true); // a fold while the boss is up: cover has room for both
    expect(par?.style.display).toBe('');
    hud.layout(main, true); // and back
    expect(par?.style.display).toBe('none');
    hud.clearBoss();
    expect(par?.style.display).toBe('');
  });

  it('a boss level with no hud:boss ever sent changes nothing: the level line stays on main', () => {
    const { hud, root } = build();
    hud.setLevel(6, 4000, 'abcd1234');
    hud.layout(hudFrame(832, 750, ZERO, 1800, 1000), true);
    const par = root.all().find((n) => n.textContent.startsWith('L6'));
    expect(par?.style.display).toBe('');
  });
});

describe('boss bar: layout against the buttons on cover and main', () => {
  const COVER_VIEWS: Array<[number, number]> = [
    [960, 411],
    [904, 388],
    [1176, 504],
    [840, 360],
  ];
  const MAIN_VIEWS: Array<[number, number]> = [
    [832, 750],
    [794, 716],
    [1092, 984],
    [884, 800],
  ];
  const INSETS: Insets[] = [ZERO, { top: 0, right: 0, bottom: 0, left: 32 }, { top: 24, right: 0, bottom: 16, left: 0 }, { top: 24, right: 20, bottom: 16, left: 32 }];
  const ARENAS: Array<[number, number]> = [
    [700, 700],
    [1100, 1100],
    [1260, 700],
    [1800, 1000],
    [1600, 1000],
  ];

  function frames(views: Array<[number, number]>): HudFrame[] {
    const out: HudFrame[] = [];
    for (const [w, h] of views) for (const ins of INSETS) for (const [aw, ah] of ARENAS) out.push(hudFrame(w, h, ins, aw, ah));
    return out;
  }

  const label = (f: HudFrame): string => `${f.cssW}x${f.cssH} ${f.arrangement} insets ${JSON.stringify(f.insets)} arena ${Math.round(f.arena.w)}x${Math.round(f.arena.h)}`;
  const bossBoxes = (f: HudFrame): Array<[string, Rect]> => [
    ['bossName', f.boxes.bossName],
    ['bossPips', f.boxes.bossPips],
    ['bossBar', f.boxes.bossBar],
  ];
  const cover = frames(COVER_VIEWS);
  const main = frames(MAIN_VIEWS);

  it('both main arrangements are in the matrix, so the checks below cover the right column and the bottom band', () => {
    expect(new Set(main.map((f) => f.arrangement))).toEqual(new Set(['topRight', 'topBottom']));
    expect(new Set(cover.map((f) => f.arrangement))).toEqual(new Set(['sides']));
  });

  it('never overlaps the bomb, super or pause button rects, on cover or main, in any arrangement', () => {
    for (const f of [...cover, ...main]) {
      for (const [id, b] of bossBoxes(f)) {
        for (const [name, r] of [
          ['bomb', f.buttons.bomb],
          ['super', f.buttons.super],
          ['pause', f.buttons.pause],
        ] as const) {
          expect(overlaps(b, r), `${label(f)} ${id} vs ${name}`).toBe(false);
        }
      }
    }
  });

  it('never overlaps the arena or the play rect, and stays on screen', () => {
    const screen = (f: HudFrame): Rect => ({ x: 0, y: 0, w: f.cssW, h: f.cssH });
    for (const f of [...cover, ...main]) {
      for (const [id, b] of bossBoxes(f)) {
        expect(overlaps(b, f.arena), `${label(f)} ${id} arena`).toBe(false);
        expect(overlaps(b, f.playRect), `${label(f)} ${id} play rect`).toBe(false);
        const s = screen(f);
        expect(b.x >= s.x && b.y >= s.y && b.x + b.w <= s.x + s.w && b.y + b.h <= s.y + s.h, `${label(f)} ${id} on screen`).toBe(true);
      }
    }
  });

  it('overlaps no other HUD box on cover; on main only the level line slot it replaces', () => {
    for (const f of [...cover, ...main]) {
      for (const [id, b] of bossBoxes(f)) {
        for (const [other, o] of Object.entries(f.boxes)) {
          if (other.startsWith('boss') || o.w <= 0 || o.h <= 0) continue;
          if (other === 'par' && f.cls === 'main') continue;
          expect(overlaps(b, o), `${label(f)} ${id} vs ${other}`).toBe(false);
        }
      }
    }
  });

  it('main: inside the existing top band, under the objective bar, and the band stays 60 px', () => {
    for (const f of main) {
      const { bossName, bossPips, bossBar, bar, par } = f.boxes;
      expect(bossBar.y + bossBar.h, label(f)).toBeLessThanOrEqual(f.insets.top + MAIN_ROWS);
      expect(bossName.y, label(f)).toBeGreaterThanOrEqual(bar.y + bar.h);
      expect(bossName.y, label(f)).toBeGreaterThanOrEqual(par.y - 2); // the level line's slot
      expect(bossBar.y, label(f)).toBeGreaterThanOrEqual(bossName.y + bossName.h);
      expect(mainTop(f.buttons, f.insets), label(f)).toBe(Math.max(MAIN_ROWS, f.buttons.pause.y + f.buttons.pause.h - f.insets.top));
      expect(f.playRect.y, label(f)).toBe(f.insets.top + mainTop(f.buttons, f.insets));
      expect(overlaps(bossName, bossPips), label(f)).toBe(false);
      expect(bossPips.x + bossPips.w, label(f)).toBeLessThanOrEqual(bossBar.x + bossBar.w + 1e-6);
    }
    const f = hudFrame(832, 750, ZERO, 1800, 1000);
    expect(mainTop(f.buttons, ZERO)).toBe(60);
    expect(f.playRect.y).toBe(60);
  });

  it('main: the bar is centred under the objective bar', () => {
    for (const f of main) {
      const { bossBar, bar } = f.boxes;
      expect(bossBar.x + bossBar.w / 2, label(f)).toBeCloseTo(bar.x + bar.w / 2, 6);
      expect(bossBar.w, label(f)).toBeLessThanOrEqual(bar.w);
    }
  });

  it('cover: in the left column below the level line, clear of the right column', () => {
    for (const f of cover) {
      const { bossName, bossPips, bossBar, par } = f.boxes;
      for (const b of [bossName, bossPips, bossBar]) {
        expect(b.x, label(f)).toBeGreaterThanOrEqual(f.insets.left);
        expect(b.x + b.w, label(f)).toBeLessThanOrEqual(f.insets.left + COVER_LEFT);
        expect(b.x + b.w, label(f)).toBeLessThanOrEqual(f.cssW - f.insets.right - COVER_RIGHT);
      }
      expect(bossName.y, label(f)).toBeGreaterThanOrEqual(par.y + par.h);
      expect(bossBar.y, label(f)).toBeGreaterThanOrEqual(bossName.y + bossName.h);
      expect(overlaps(bossName, bossPips), label(f)).toBe(false);
    }
  });

  it('the bar is thick: at least 12 px on both screens, thicker than the 5 px weapon bar', () => {
    for (const f of [...cover, ...main]) {
      expect(f.boxes.bossBar.h, label(f)).toBeGreaterThanOrEqual(12);
      expect(f.boxes.bossBar.h, label(f)).toBeGreaterThan(f.boxes.weaponBar.h);
    }
  });

  it('the name box fits the longest boss name and the pip box fits four pips', () => {
    const longest = Math.max(...BOSS_IDS.map((id) => BOSS_NAMES[id].length));
    for (const f of [...cover, ...main]) {
      const { bossName, bossPips } = f.boxes;
      // Bold sans-serif glyphs are about 0.6 em wide; allow 0.65.
      expect(bossName.w, label(f)).toBeGreaterThanOrEqual(longest * bossName.size * 0.65);
      expect(bossPips.w, label(f)).toBe(BOSS_PIPS_W);
      expect(bossPips.w, label(f)).toBeGreaterThanOrEqual(4 * 8 + 3 * 4);
    }
  });

  it('the boss boxes are always in the frame, so a boss arriving never moves the arena: play rects stay as before', () => {
    expect(hudFrame(832, 750, ZERO, 1800, 1000).playRect).toEqual({ x: 0, y: 60, w: 832, h: 750 - 60 - 158 });
    expect(hudFrame(832, 750, ZERO, 960, 720).playRect).toEqual({ x: 0, y: 60, w: 832 - 92, h: 690 });
    const c = hudFrame(960, 411, ZERO, 1600, 1000);
    expect(c.playRect.x).toBe(160);
    expect(c.playRect.y).toBe(0);
  });
});

