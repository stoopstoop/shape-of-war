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
import { BOSS_IDS, type BossId } from '../../src/levelgen/leveldef';
import {
  BANNER_FADE_IN_SEC,
  BANNER_MAX_STEP_SEC,
  BANNER_TOTAL_SEC,
  BOSS_NAMES,
  BOSS_TIER,
  bossBannerText,
  bossColour,
  bossFill,
  type HudBoss,
} from '../../src/ui/boss';
import {
  BOSS_PIPS_W,
  BOSS_TEXT_MIN,
  COVER_BOSS_STRIP,
  COVER_LEFT,
  COVER_RIGHT,
  hudFrame,
  hudRects,
  MAIN_ROWS,
  mainTop,
  overlaps,
  type FrameOptions,
  type HudFrame,
} from '../../src/ui/hudFrame';
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

// Boss banner (G3A): "WARDEN" and a dot, fades in over 1.2 s on sim:bossEnter, then clears itself.

describe('boss banner: DOM', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function build() {
    const root = installFakeDocument();
    const bus = new Bus();
    let t = 0;
    const hud = createHud(asParent(root), () => t);
    const off = hud.listen(bus);
    const banner = root.all().find((n) => n.getAttribute('data-hud') === 'boss-banner');
    if (banner === undefined) throw new Error('no banner element');
    const score = { score: 0, multiplier: 1, lives: 3, bombs: 3, superCharge: 0 };
    return {
      root,
      bus,
      hud,
      off,
      banner,
      at: (ms: number) => {
        t = ms;
      },
      /** The sim's hud:score at clock `ms`: this is what advances the banner. */
      tick: (ms: number) => {
        t = ms;
        bus.emit('hud:score', score);
      },
    };
  }

  const shown = (e: FakeEl): boolean => e.style.display !== 'none';
  const alpha = (e: FakeEl): number => Number(e.style.opacity);

  it('is hidden before any boss arrives, and hud:score alone never shows it', () => {
    const { banner, hud, tick } = build();
    expect(shown(banner)).toBe(false);
    expect(hud.bannerShown()).toBe(false);
    tick(100);
    expect(shown(banner)).toBe(false);
  });

  it('sim:bossEnter shows the one line "WARDEN" plus the dot, starting at opacity 0', () => {
    const { bus, banner, hud } = build();
    bus.emit('sim:bossEnter', { id: 'warden', tier: 1 });
    expect(shown(banner)).toBe(true);
    expect(hud.bannerShown()).toBe(true);
    expect(banner.textContent).toBe(bossBannerText('warden'));
    expect(banner.textContent).toBe('WARDEN ●');
    expect(alpha(banner)).toBe(0);
  });

  it('takes the boss colour for the text and the glow', () => {
    const { bus, banner } = build();
    bus.emit('sim:bossEnter', { id: 'ember', tier: 2 });
    expect(banner.style.color).toBe(bossColour('ember'));
    expect(banner.style.textShadow).toContain(bossColour('ember', 0.9));
  });

  it('fades in over 1.2 s as the sim ticks hud:score: half at 0.6 s, full at 1.2 s', () => {
    const { bus, banner, at, tick } = build();
    at(0);
    bus.emit('sim:bossEnter', { id: 'warden', tier: 1 });
    for (let ms = 100; ms <= 600; ms += 100) tick(ms);
    expect(alpha(banner)).toBeCloseTo(0.5, 2);
    for (let ms = 700; ms <= 1200; ms += 100) tick(ms);
    expect(alpha(banner)).toBe(1);
    expect(BANNER_FADE_IN_SEC).toBe(1.2);
  });

  it('opacity never falls during the fade in, holds, falls, and the banner hides itself at the end', () => {
    const { bus, banner, hud, at, tick } = build();
    at(0);
    bus.emit('sim:bossEnter', { id: 'warden', tier: 1 });
    const seen: number[] = [];
    let ms = 0;
    let ticks = 0;
    while (hud.bannerShown() && ticks < 100) {
      ms += 100;
      ticks++;
      tick(ms);
      seen.push(alpha(banner));
    }
    const peak = seen.indexOf(1);
    expect(peak).toBeGreaterThan(0);
    for (let i = 1; i <= peak; i++) expect(seen[i] ?? 0).toBeGreaterThanOrEqual(seen[i - 1] ?? 0);
    expect(Math.max(...seen)).toBe(1);
    // 2.8 s of 100 ms ticks, give or take one for floating point in the running sum.
    expect(ticks).toBeGreaterThanOrEqual(Math.round(BANNER_TOTAL_SEC * 10));
    expect(ticks).toBeLessThanOrEqual(Math.round(BANNER_TOTAL_SEC * 10) + 1);
    expect(shown(banner)).toBe(false);
    expect(hud.bannerShown()).toBe(false);
    tick(ms + 100); // more ticks after the end change nothing
    expect(shown(banner)).toBe(false);
  });

  it('a pause skips no fade: no hud:score arrives, and the first tick after it moves one capped step', () => {
    const { bus, banner, at, tick } = build();
    at(0);
    bus.emit('sim:bossEnter', { id: 'warden', tier: 1 });
    tick(100);
    tick(200);
    const before = alpha(banner);
    tick(200 + 60_000); // a minute in the pause menu
    expect(alpha(banner)).toBeCloseTo(before + BANNER_MAX_STEP_SEC / BANNER_FADE_IN_SEC, 2);
    expect(shown(banner)).toBe(true);
  });

  it('sim:bossDown takes the banner away at once', () => {
    const { bus, banner, hud, tick } = build();
    bus.emit('sim:bossEnter', { id: 'warden', tier: 1 });
    tick(300);
    bus.emit('sim:bossDown', { id: 'warden', x: 0, y: 0 });
    expect(shown(banner)).toBe(false);
    expect(hud.bannerShown()).toBe(false);
  });

  it('clearBoss (a new world) takes it away too', () => {
    const { bus, banner, hud } = build();
    bus.emit('sim:bossEnter', { id: 'brood', tier: 1 });
    hud.clearBoss();
    expect(shown(banner)).toBe(false);
  });

  it('the next boss in Endless gets its own banner from zero', () => {
    const { bus, banner, at, tick } = build();
    at(0);
    bus.emit('sim:bossEnter', { id: 'warden', tier: 1 });
    for (let ms = 100; ms <= 1500; ms += 100) tick(ms);
    bus.emit('sim:bossDown', { id: 'warden', x: 0, y: 0 });
    at(60_000);
    bus.emit('sim:bossEnter', { id: 'spindle', tier: 1 });
    expect(banner.textContent).toBe('SPINDLE ●');
    expect(alpha(banner)).toBe(0);
    expect(shown(banner)).toBe(true);
    tick(60_100);
    expect(alpha(banner)).toBeCloseTo(0.1 / BANNER_FADE_IN_SEC, 2);
  });

  it('an enter after the first hud:boss still shows the banner, and leaves the bar as it was', () => {
    const { bus, banner, hud } = build();
    bus.emit('hud:boss', boss({ hp: 1800, phases: 3 }));
    bus.emit('sim:bossEnter', { id: 'warden', tier: 1 });
    expect(shown(banner)).toBe(true);
    expect(hud.bossShown()).toBe(true);
  });

  it('every boss id has a banner line that reaches the element', () => {
    const { bus, banner } = build();
    for (const id of BOSS_IDS) {
      bus.emit('sim:bossEnter', { id, tier: BOSS_TIER[id] });
      expect(banner.textContent, id).toBe(`${BOSS_NAMES[id].toUpperCase()} ●`);
    }
  });

  it('an unknown id shows nothing', () => {
    const { hud, banner } = build();
    hud.showBanner('nobody' as BossId);
    expect(shown(banner)).toBe(false);
    expect(hud.bannerShown()).toBe(false);
  });

  it('layout puts it in the frame banner box on cover and on main, and leaves its visibility alone', () => {
    const { bus, hud, banner } = build();
    bus.emit('sim:bossEnter', { id: 'warden', tier: 1 });
    for (const f of [hudFrame(960, 411, ZERO, 1600, 1000), hudFrame(960, 411, ZERO, 1600, 1000, { bossStrip: false }), hudFrame(832, 750, ZERO, 1800, 1000)]) {
      hud.layout(f, true);
      expect(banner.style.left).toBe(`${f.banner.x}px`);
      expect(banner.style.top).toBe(`${f.banner.y}px`);
      expect(banner.style.width).toBe(`${f.banner.w}px`);
      expect(banner.style.height).toBe(`${f.banner.h}px`);
      expect(banner.style.fontSize).toBe(`${f.banner.size}px`);
      expect(banner.style.textAlign).toBe('center');
      expect(banner.style.overflow).toBe('visible'); // the glow is not clipped to the box
      expect(shown(banner)).toBe(true);
    }
    hud.layout(hudFrame(960, 411, ZERO, 1600, 1000), false); // no touch input: the banner is not a button
    expect(shown(banner)).toBe(true);
  });

  it('the unsubscribe function stops the banner too', () => {
    const { bus, off, banner } = build();
    off();
    bus.emit('sim:bossEnter', { id: 'warden', tier: 1 });
    expect(shown(banner)).toBe(false);
  });

  it('adds no pointer target: a plain div inside the HUD root, which has pointer-events none', () => {
    const { root, banner } = build();
    const hudRoot = root.children[0];
    expect(banner.tag).toBe('div');
    expect(hudRoot?.all()).toContain(banner);
    expect(UI_CSS).toMatch(/\.sow-hud \{[^}]*pointer-events: none/);
    expect(banner.getAttribute('data-hud')).toBe('boss-banner');
    expect(root.all().filter((e) => ['button', 'input', 'a'].includes(e.tag))).toEqual([]);
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

  function frames(views: Array<[number, number]>, opts: FrameOptions = {}): HudFrame[] {
    const out: HudFrame[] = [];
    for (const [w, h] of views) for (const ins of INSETS) for (const [aw, ah] of ARENAS) out.push(hudFrame(w, h, ins, aw, ah, opts));
    return out;
  }

  const label = (f: HudFrame): string =>
    `${f.cssW}x${f.cssH} ${f.arrangement} insets ${JSON.stringify(f.insets)} arena ${Math.round(f.arena.w)}x${Math.round(f.arena.h)} play.y ${f.playRect.y}`;
  const bossBoxes = (f: HudFrame): Array<[string, Rect]> => [
    ['bossName', f.boxes.bossName],
    ['bossPips', f.boxes.bossPips],
    ['bossBar', f.boxes.bossBar],
  ];
  /** Cover with the boss strip (the default, a boss run) and without it (a run with no boss), and main. */
  const cover = frames(COVER_VIEWS);
  const coverColumn = frames(COVER_VIEWS, { bossStrip: false });
  const main = frames(MAIN_VIEWS);
  const everyFrame = [...cover, ...coverColumn, ...main];

  it('both main arrangements are in the matrix, so the checks below cover the right column and the bottom band', () => {
    expect(new Set(main.map((f) => f.arrangement))).toEqual(new Set(['topRight', 'topBottom']));
    expect(new Set(cover.map((f) => f.arrangement))).toEqual(new Set(['sides']));
    expect(new Set(coverColumn.map((f) => f.arrangement))).toEqual(new Set(['sides']));
  });

  it('never overlaps the bomb, super or pause button rects, on cover or main, in any arrangement', () => {
    for (const f of everyFrame) {
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
    for (const f of everyFrame) {
      for (const [id, b] of bossBoxes(f)) {
        expect(overlaps(b, f.arena), `${label(f)} ${id} arena`).toBe(false);
        expect(overlaps(b, f.playRect), `${label(f)} ${id} play rect`).toBe(false);
        const s = screen(f);
        expect(b.x >= s.x && b.y >= s.y && b.x + b.w <= s.x + s.w && b.y + b.h <= s.y + s.h, `${label(f)} ${id} on screen`).toBe(true);
      }
    }
  });

  it('overlaps no other HUD box on cover; on main only the level line slot it replaces', () => {
    for (const f of everyFrame) {
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

  it('cover with no boss run: the left column boxes under the level line, clear of the right column', () => {
    for (const f of coverColumn) {
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
    for (const f of everyFrame) {
      expect(f.boxes.bossBar.h, label(f)).toBeGreaterThanOrEqual(12);
      expect(f.boxes.bossBar.h, label(f)).toBeGreaterThan(f.boxes.weaponBar.h);
    }
  });

  it('the name box fits the longest boss name and the pip box fits four pips', () => {
    const longest = Math.max(...BOSS_IDS.map((id) => BOSS_NAMES[id].length));
    for (const f of everyFrame) {
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
    // Main ignores the strip option: the same play rect either way.
    expect(hudFrame(832, 750, ZERO, 1800, 1000, { bossStrip: false })).toEqual(hudFrame(832, 750, ZERO, 1800, 1000, { bossStrip: true }));
    // Cover with no boss run keeps the v2 play rect exactly; a boss run takes the strip off the top.
    const plain = hudFrame(960, 411, ZERO, 1600, 1000, { bossStrip: false });
    expect(plain.playRect).toEqual({ x: 160, y: 0, w: 688, h: 411 });
    const strip = hudFrame(960, 411, ZERO, 1600, 1000);
    expect(strip.playRect).toEqual({ x: 160, y: COVER_BOSS_STRIP, w: 688, h: 411 - COVER_BOSS_STRIP });
  });
});

// G3A: the cover boss strip. The left column bar was unreadable on the folded screen.
describe('cover boss strip (G3A)', () => {
  const COVER_VIEWS: Array<[number, number]> = [
    [960, 411],
    [904, 388],
    [1176, 504],
    [840, 360],
  ];
  const INSETS: Insets[] = [ZERO, { top: 0, right: 0, bottom: 0, left: 32 }, { top: 24, right: 0, bottom: 16, left: 0 }, { top: 24, right: 20, bottom: 16, left: 32 }];
  const ARENAS: Array<[number, number]> = [
    [700, 700],
    [1100, 1100],
    [1260, 700],
    [1800, 1000],
    [1600, 1000],
  ];
  const all: HudFrame[] = [];
  for (const [w, h] of COVER_VIEWS) for (const ins of INSETS) for (const [aw, ah] of ARENAS) all.push(hudFrame(w, h, ins, aw, ah));
  const label = (f: HudFrame): string => `${f.cssW}x${f.cssH} insets ${JSON.stringify(f.insets)} arena ${Math.round(f.arena.w)}x${Math.round(f.arena.h)}`;

  it('the boss row is one strip across the top of the play area: name, then the bar, then the pips', () => {
    for (const f of all) {
      const { bossName, bossBar, bossPips } = f.boxes;
      expect(bossName.x + bossName.w, label(f)).toBeLessThanOrEqual(bossBar.x);
      expect(bossBar.x + bossBar.w, label(f)).toBeLessThanOrEqual(bossPips.x);
      for (const b of [bossName, bossBar, bossPips]) {
        expect(b.y, label(f)).toBeGreaterThanOrEqual(f.insets.top);
        expect(b.y + b.h, label(f)).toBeLessThanOrEqual(f.insets.top + COVER_BOSS_STRIP + 1e-6);
        expect(b.y + b.h, label(f)).toBeLessThanOrEqual(f.playRect.y + 1e-6); // above the play rect, not in it
      }
      expect(bossBar.h, label(f)).toBe(12);
    }
  });

  it('it sits between the two HUD columns, clear of the left and right column boxes and the pause button', () => {
    for (const f of all) {
      const lo = f.insets.left + COVER_LEFT;
      const hi = f.cssW - f.insets.right - COVER_RIGHT;
      for (const [id, b] of [
        ['bossName', f.boxes.bossName],
        ['bossBar', f.boxes.bossBar],
        ['bossPips', f.boxes.bossPips],
      ] as const) {
        expect(b.x, `${label(f)} ${id}`).toBeGreaterThanOrEqual(lo);
        expect(b.x + b.w, `${label(f)} ${id}`).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('the bar runs the width of the play area: at least 340 px on every cover view, 516 px at 960 x 411', () => {
    // The narrowest case is 840 wide with 52 px of side insets: 344 px, still 2.5 times the old 136 px bar.
    for (const f of all) expect(f.boxes.bossBar.w, label(f)).toBeGreaterThanOrEqual(340);
    expect(hudFrame(960, 411, ZERO, 1600, 1000).boxes.bossBar.w).toBe(960 - 160 - 112 - 2 * 8 - 92 - 52 - 2 * 6);
    expect(hudFrame(960, 411, ZERO, 1600, 1000).boxes.bossBar.w).toBe(516);
    // The old left column bar was 136 px wide: this one is nearly four times longer.
    expect(hudFrame(960, 411, ZERO, 1600, 1000).boxes.bossBar.w).toBeGreaterThan(3.5 * 136);
  });

  it('the name is 14 px, over the 13 px floor, and still fits the longest name', () => {
    const longest = Math.max(...BOSS_IDS.map((id) => BOSS_NAMES[id].length));
    for (const f of all) {
      expect(f.boxes.bossName.size, label(f)).toBe(14);
      expect(f.boxes.bossName.size, label(f)).toBeGreaterThanOrEqual(BOSS_TEXT_MIN);
      expect(f.boxes.bossName.w, label(f)).toBeGreaterThanOrEqual(longest * 14 * 0.65);
    }
  });

  it('is fixed for the run: the strip is reserved from the first frame, so a boss arriving moves nothing', () => {
    for (const [w, h] of COVER_VIEWS) {
      for (const ins of INSETS) {
        const f = hudFrame(w, h, ins, 1600, 1000);
        expect(f.playRect.y, `${w}x${h}`).toBe(ins.top + COVER_BOSS_STRIP);
        expect(f.playRect.h, `${w}x${h}`).toBe(h - ins.top - ins.bottom - COVER_BOSS_STRIP);
      }
    }
  });

  it('costs 5 percent of arena scale on a tall arena at 960 x 411 (6 percent at the smallest view) and nothing on a wide one', () => {
    for (const [w, h] of COVER_VIEWS) {
      for (const [aw, ah] of ARENAS) {
        const withStrip = hudFrame(w, h, ZERO, aw, ah).fit.scale;
        const without = hudFrame(w, h, ZERO, aw, ah, { bossStrip: false }).fit.scale;
        expect(withStrip, `${w}x${h} ${aw}x${ah}`).toBeLessThanOrEqual(without + 1e-9);
        expect(withStrip / without, `${w}x${h} ${aw}x${ah}`).toBeGreaterThanOrEqual(0.94);
      }
    }
    for (const [aw, ah] of ARENAS) {
      const ratio = hudFrame(960, 411, ZERO, aw, ah).fit.scale / hudFrame(960, 411, ZERO, aw, ah, { bossStrip: false }).fit.scale;
      expect(ratio, `960x411 ${aw}x${ah}`).toBeGreaterThanOrEqual(0.95);
    }
    // 1800 x 1000 is width limited at 960 x 411, so the strip takes nothing from it.
    expect(hudFrame(960, 411, ZERO, 1800, 1000).fit.scale).toBeCloseTo(hudFrame(960, 411, ZERO, 1800, 1000, { bossStrip: false }).fit.scale, 9);
  });

  it('the strip frame keeps the bomb, super and pause rects where Thumbs puts them', () => {
    for (const [w, h] of COVER_VIEWS) {
      for (const ins of INSETS) {
        const a = hudFrame(w, h, ins, 1600, 1000);
        const b = hudFrame(w, h, ins, 1600, 1000, { bossStrip: false });
        expect(a.buttons, `${w}x${h}`).toEqual(b.buttons);
        expect(a.buttonInsets, `${w}x${h}`).toEqual(b.buttonInsets);
      }
    }
  });
});

describe('boss text size floor (G3A): 13 px on both screens', () => {
  const frames: HudFrame[] = [];
  for (const [w, h] of [
    [960, 411],
    [840, 360],
    [832, 750],
    [794, 716],
    [1092, 984],
  ] as const) {
    for (const [aw, ah] of [
      [1100, 1100],
      [1800, 1000],
    ] as const) {
      frames.push(hudFrame(w, h, ZERO, aw, ah));
      frames.push(hudFrame(w, h, ZERO, aw, ah, { bossStrip: false }));
    }
  }

  it('the boss name box is at least 13 px in every layout, cover strip, cover column and both main arrangements', () => {
    expect(new Set(frames.map((f) => f.arrangement))).toEqual(new Set(['sides', 'topRight', 'topBottom']));
    for (const f of frames) expect(f.boxes.bossName.size, `${f.cssW}x${f.cssH} ${f.arrangement}`).toBeGreaterThanOrEqual(BOSS_TEXT_MIN);
  });

  it('the boss name line height fits its text, so a 13 px name is not clipped', () => {
    for (const f of frames) expect(f.boxes.bossName.h, `${f.cssW}x${f.cssH} ${f.arrangement}`).toBeGreaterThanOrEqual(f.boxes.bossName.size + 1);
  });

  it('the banner text is at least 13 px', () => {
    for (const f of frames) expect(f.banner.size).toBeGreaterThanOrEqual(BOSS_TEXT_MIN);
    expect(BOSS_TEXT_MIN).toBe(13);
  });
});

describe('boss banner box (G3A): one line, both screens, no overlap', () => {
  const VIEWS: Array<[number, number]> = [
    [960, 411],
    [904, 388],
    [1176, 504],
    [840, 360],
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
  const all: HudFrame[] = [];
  for (const [w, h] of VIEWS) {
    for (const ins of INSETS) {
      for (const [aw, ah] of ARENAS) {
        all.push(hudFrame(w, h, ins, aw, ah));
        if (w / h >= 1.8) all.push(hudFrame(w, h, ins, aw, ah, { bossStrip: false }));
      }
    }
  }
  const label = (f: HudFrame): string => `${f.cssW}x${f.cssH} ${f.cls} ${f.arrangement} insets ${JSON.stringify(f.insets)} play.y ${f.playRect.y}`;

  it('both screens and every arrangement are covered', () => {
    expect(new Set(all.map((f) => f.cls))).toEqual(new Set(['cover', 'main']));
    expect(new Set(all.map((f) => f.arrangement))).toEqual(new Set(['sides', 'topRight', 'topBottom']));
  });

  it('overlaps no HUD box, no bomb, super or pause button, and no boss strip box', () => {
    for (const f of all) {
      for (const r of hudRects(f)) expect(overlaps(f.banner, r), `${label(f)} vs ${JSON.stringify(r)}`).toBe(false);
      for (const [id, b] of [
        ['bossName', f.boxes.bossName],
        ['bossBar', f.boxes.bossBar],
        ['bossPips', f.boxes.bossPips],
      ] as const) {
        expect(overlaps(f.banner, b), `${label(f)} vs ${id}`).toBe(false);
      }
    }
  });

  it('sits at the top of the play rect, centred, inside the overlay content rect and on screen', () => {
    for (const f of all) {
      const b = f.banner;
      expect(b.y, label(f)).toBeGreaterThanOrEqual(f.playRect.y);
      expect(b.y + b.h, label(f)).toBeLessThanOrEqual(f.playRect.y + f.playRect.h);
      expect(b.x, label(f)).toBeGreaterThanOrEqual(f.content.x);
      expect(b.x + b.w, label(f)).toBeLessThanOrEqual(f.content.x + f.content.w + 1e-6);
      expect(b.x + b.w / 2, label(f)).toBeCloseTo(f.playRect.x + f.playRect.w / 2, 6);
      expect(b.x >= 0 && b.y >= 0 && b.x + b.w <= f.cssW && b.y + b.h <= f.cssH, label(f)).toBe(true);
      expect(b.y - f.playRect.y, label(f)).toBeLessThanOrEqual(12); // top of the play area, not the middle
    }
  });

  it('is one line: no wrap, centred, a single row tall enough for its text', () => {
    for (const f of all) {
      expect(f.banner.wrap, label(f)).toBe(false);
      expect(f.banner.align, label(f)).toBe('center');
      expect(f.banner.h, label(f)).toBeGreaterThanOrEqual(f.banner.size + 2);
    }
  });

  it('fits the longest banner line: twelve capitals with the dot, wide tracking included', () => {
    for (const f of all) {
      // Bold capitals are about 0.75 em wide, the 0.14 em tracking adds to each of 14 characters.
      const need = 14 * f.banner.size * (0.75 + 0.14);
      expect(f.banner.w, label(f)).toBeGreaterThanOrEqual(need);
    }
    const longest = Math.max(...BOSS_IDS.map((id) => bossBannerText(id).length));
    expect(longest).toBeLessThanOrEqual(14);
  });

  it('is not part of boxes or hudRects, so it adds nothing to the B6 no overlap checks', () => {
    for (const f of all.slice(0, 40)) {
      expect(Object.keys(f.boxes)).not.toContain('banner');
      expect(hudRects(f)).not.toContain(f.banner);
    }
  });
});

