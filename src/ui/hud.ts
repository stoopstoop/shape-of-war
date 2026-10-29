// HUD (docs/01 section 9). DOM overlay anchored to screen edges plus safe area insets, never to
// the arena. Numbers come from 'hud:score' (main.ts emits it at most every 100 ms); objective
// progress and the level line are set directly by main.ts at the same cadence. The weapon
// indicator (V2-B) comes from 'hud:weapon' and is throttled here to the same 100 ms.
import type { Bus, Events, WeaponKind } from '../core/events';
import type { Insets, Rect } from '../input/types';
import type { SuperKind } from '../levelgen/leveldef';
import { el } from './dom';
import { formatInt, iconRun } from './format';
import { aspectClass, type AspectClass, type HudBox, type HudFrame } from './hudFrame';
import type { ObjectiveProgress } from './objective';
import { weaponHue } from './weaponHue';

export { aspectClass, type AspectClass };

export interface HudLayout {
  band: number;
  score: { x: number; y: number; size: number };
  mult: { x: number; y: number; size: number };
  objective: { y: number; w: number; h: number; size: number };
  par: { y: number; size: number };
  lives: { x: number; y: number; size: number };
  bombs: { x: number; y: number; size: number };
  bombD: number;
  superD: number;
  pauseIcon: number;
}

const COVER: HudLayout = {
  band: 52,
  score: { x: 16, y: 8, size: 20 },
  mult: { x: 16, y: 30, size: 14 },
  objective: { y: 8, w: 220, h: 16, size: 12 },
  par: { y: 28, size: 12 },
  lives: { x: 64, y: 8, size: 12 },
  bombs: { x: 64, y: 26, size: 10 },
  bombD: 64,
  superD: 56,
  pauseIcon: 20,
};

const MAIN: HudLayout = {
  band: 76,
  score: { x: 24, y: 12, size: 28 },
  mult: { x: 24, y: 44, size: 18 },
  objective: { y: 12, w: 320, h: 20, size: 14 },
  par: { y: 40, size: 14 },
  lives: { x: 80, y: 12, size: 16 },
  bombs: { x: 80, y: 36, size: 14 },
  bombD: 72,
  superD: 64,
  pauseIcon: 24,
};

/** Pure: element offsets in CSS px from docs/01 tables 9.1 and 9.2. */
export function hudLayout(c: AspectClass): HudLayout {
  return c === 'cover' ? COVER : MAIN;
}

/**
 * Pure: legacy top band play rect from the docs/01 section 9 tables. main.ts now uses hudFrame,
 * which also keeps the side and bottom HUD elements clear of the arena (B6).
 */
export function playRect(cssW: number, cssH: number, ins: Insets, c: AspectClass): Rect {
  const band = hudLayout(c).band;
  return {
    x: ins.left,
    y: ins.top + band,
    w: Math.max(1, cssW - ins.left - ins.right),
    h: Math.max(1, cssH - ins.top - ins.bottom - band),
  };
}

export type HudScore = Events['hud:score'];

export interface HudText {
  score: string;
  mult: string;
  lives: string;
  bombs: string;
  bombCount: string;
  /** 0 to 1. */
  charge: number;
}

export const LIFE_ICON = '▲';
export const BOMB_ICON = '●';

/** Pure: display strings for a hud:score payload. */
export function hudText(p: HudScore): HudText {
  const charge = Number.isFinite(p.superCharge) ? Math.max(0, Math.min(1, p.superCharge)) : 0;
  return {
    score: formatInt(p.score),
    mult: `x${formatInt(p.multiplier)}`,
    lives: iconRun(LIFE_ICON, p.lives),
    bombs: iconRun(BOMB_ICON, p.bombs),
    bombCount: String(Math.max(0, Math.floor(p.bombs))),
    charge,
  };
}

/** Pure: true when at least `intervalMs` passed since `lastMs` (hud:score throttle). */
export function due(lastMs: number, nowMs: number, intervalMs = 100): boolean {
  return nowMs - lastMs >= intervalMs;
}

export type HudWeapon = Events['hud:weapon'];

/** What the weapon indicator shows for one hud:weapon payload. */
export interface WeaponView {
  /** False while the weapon is spread (the default) or the payload cannot be drawn. */
  visible: boolean;
  label: string;
  /** Time left as 0 to 1: remaining over total, clamped. 1 on pickup, 0 when out. */
  fraction: number;
}

export const WEAPON_NAMES: Readonly<Record<WeaponKind, string>> = {
  spread: 'SPREAD',
  rapid: 'RAPID',
  pierce: 'PIERCE',
  orbit: 'ORBIT',
};

/** Pure: CSS colour for a weapon's label and bar. The hue comes from weaponHue (B14). */
export function weaponColour(kind: WeaponKind): string {
  return `hsl(${weaponHue(kind)}, 95%, 68%)`;
}

/**
 * Pure: indicator state for a hud:weapon payload. Hidden while the weapon is spread. A non-finite
 * remaining or total, or a total of 0 or less, hides it too (there is no bar to draw). The bar
 * drains from full at pickup to empty at expiry.
 */
export function weaponView(p: HudWeapon): WeaponView {
  const drawable = Number.isFinite(p.remaining) && Number.isFinite(p.total) && p.total > 0;
  const fraction = drawable ? Math.max(0, Math.min(1, p.remaining / p.total)) : 0;
  return { visible: drawable && p.kind !== 'spread', label: WEAPON_NAMES[p.kind], fraction };
}

/** Throttle memory for hud:weapon: when it last drew and which weapon that was. */
export interface WeaponGate {
  lastMs: number;
  kind: WeaponKind;
}

export const WEAPON_GATE_START: Readonly<WeaponGate> = { lastMs: Number.NEGATIVE_INFINITY, kind: 'spread' };

/**
 * Pure: should this hud:weapon payload be drawn now? At most every `intervalMs` (100, like
 * hud:score), except that a change of weapon always draws. Otherwise a throttled change to
 * spread, the last event of a weapon's life, would leave a stale indicator up. A skipped payload
 * leaves the gate as it was.
 */
export function weaponGate(
  g: Readonly<WeaponGate>,
  p: HudWeapon,
  nowMs: number,
  intervalMs = 100,
): { gate: WeaponGate; draw: boolean } {
  const draw = p.kind !== g.kind || due(g.lastMs, nowMs, intervalMs);
  return { gate: draw ? { lastMs: nowMs, kind: p.kind } : { ...g }, draw };
}

/** Pure: super ring label, for example "SUPER: HOMING". The drone has no upgrades in v1. */
export function superLabel(kind: SuperKind): string {
  return `SUPER: ${kind.toUpperCase()}`;
}

/** Pure: small hint under the super label, from the charge (0 to 1). */
export function superHint(charge: number): string {
  return charge >= 1 ? 'ready: tap ring' : 'charges with geoms';
}

/** Pure: "L3  Par 1,000  #abcd1234". */
export function levelLine(levelIndex: number, par: number, hash: string): string {
  return `L${levelIndex}  Par ${formatInt(par)}  #${hash}`;
}

export interface Hud {
  show(): void;
  hide(): void;
  update(p: HudScore): void;
  setLevel(levelIndex: number, par: number, hash: string): void;
  /** Free text in the level line slot (Endless seed and clock). */
  setLine(text: string): void;
  setObjective(p: ObjectiveProgress): void;
  /** Super kind for the ring label. */
  setSuper(kind: SuperKind): void;
  /** Draw the weapon indicator for a hud:weapon payload now, with no throttle. */
  setWeapon(p: HudWeapon): void;
  /** Hide the weapon indicator and forget the throttle: a new world starts on spread. */
  clearWeapon(): void;
  /**
   * Re-anchor on resize, fold, unfold and arena change from the pure HUD frame. `buttons` is
   * false when there is no touch input (renderer failed), which hides the rings and pause.
   */
  layout(frame: HudFrame, buttons: boolean): void;
  /** Subscribe to 'hud:score' and 'hud:weapon'. Returns the unsubscribe function for both. */
  listen(bus: Bus): () => void;
}

function setBox(e: HTMLElement, b: HudBox, text: boolean): void {
  const s = e.style;
  s.left = `${b.x}px`;
  s.top = `${b.y}px`;
  s.width = `${b.w}px`;
  s.height = `${b.h}px`;
  if (!text) return;
  s.fontSize = `${b.size}px`;
  s.lineHeight = b.wrap ? `${b.size + 3}px` : `${b.h}px`;
  s.textAlign = b.align;
  s.whiteSpace = b.wrap ? 'normal' : 'pre';
  s.overflow = 'hidden';
}

function place(e: HTMLElement, r: Rect, d: number): void {
  const s = e.style;
  s.left = `${r.x + r.w / 2 - d / 2}px`;
  s.top = `${r.y + r.h / 2 - d / 2}px`;
  s.width = `${d}px`;
  s.height = `${d}px`;
}

/** DOM edge. `now` is the clock for the hud:weapon throttle, injected for tests. */
export function createHud(parent: HTMLElement, now: () => number = () => performance.now()): Hud {
  const root = el('div', 'sow-hud');
  const score = el('div', 'sow-hud-item', '0');
  const mult = el('div', 'sow-hud-item', 'x1');
  mult.style.color = 'hsl(95, 100%, 65%)';
  // Weapon indicator: text and a bar, no pointer target (the whole HUD is pointer-events: none).
  // Hidden until a weapon other than spread is active.
  const weaponLabel = el('div', 'sow-hud-item', '');
  weaponLabel.style.fontWeight = '600';
  weaponLabel.style.display = 'none';
  const weaponBar = el('div', 'sow-hud-bar');
  weaponBar.style.boxSizing = 'border-box';
  weaponBar.style.display = 'none';
  const weaponFill = el('div', 'sow-hud-fill');
  weaponBar.append(weaponFill);
  weaponLabel.setAttribute('data-hud', 'weapon');
  weaponBar.setAttribute('data-hud', 'weapon-bar');
  weaponFill.setAttribute('data-hud', 'weapon-fill');
  let gate: WeaponGate = { ...WEAPON_GATE_START };
  const bar = el('div', 'sow-hud-bar');
  const fill = el('div', 'sow-hud-fill');
  const objLabel = el('div', 'sow-hud-item', '');
  bar.append(fill);
  const par = el('div', 'sow-hud-item', '');
  const lives = el('div', 'sow-hud-item', '');
  const bombs = el('div', 'sow-hud-item', '');
  const pause = el('div', 'sow-hud-item');
  const bombRing = el('div', 'sow-hud-ring', '');
  const superRing = el('div', 'sow-hud-ring', '');
  const superName = el('div', 'sow-hud-item', superLabel('homing'));
  superName.style.color = 'hsl(55, 95%, 70%)';
  superName.style.fontWeight = '600';
  const superTip = el('div', 'sow-hud-item', superHint(0));
  superTip.style.opacity = '0.7';
  root.append(bar, objLabel, score, mult, weaponBar, weaponLabel, par, lives, bombs, pause, bombRing, superRing, superName, superTip);
  parent.append(root);
  pause.style.cssText += ';display:flex;gap:22%;justify-content:center;align-items:center';
  const bars = [el('div'), el('div')];
  for (const b of bars) {
    b.style.cssText = 'width:22%;height:70%;background:hsl(190,60%,90%);border-radius:2px;box-shadow:0 0 6px hsl(190,80%,60%)';
    pause.append(b);
  }

  const hud: Hud = {
    show: () => root.classList.add('sow-open'),
    hide: () => root.classList.remove('sow-open'),
    update(p) {
      const t = hudText(p);
      score.textContent = t.score;
      mult.textContent = t.mult;
      lives.textContent = t.lives;
      bombs.textContent = t.bombs;
      bombRing.textContent = t.bombCount;
      const deg = Math.round(t.charge * 360);
      superRing.style.background = `conic-gradient(hsla(55, 95%, 60%, 0.55) ${deg}deg, transparent ${deg}deg)`;
      superTip.textContent = superHint(t.charge);
    },
    setSuper(kind) {
      superName.textContent = superLabel(kind);
    },
    setWeapon(p) {
      const v = weaponView(p);
      const display = v.visible ? '' : 'none';
      weaponLabel.style.display = display;
      weaponBar.style.display = display;
      if (!v.visible) return;
      const colour = weaponColour(p.kind);
      weaponLabel.textContent = v.label;
      weaponLabel.style.color = colour;
      weaponFill.style.background = colour;
      weaponFill.style.boxShadow = `0 0 6px ${colour}`;
      weaponFill.style.width = `${Math.round(v.fraction * 1000) / 10}%`;
    },
    clearWeapon() {
      gate = { ...WEAPON_GATE_START };
      weaponLabel.style.display = 'none';
      weaponBar.style.display = 'none';
    },
    setLevel(levelIndex, parScore, hash) {
      par.textContent = levelLine(levelIndex, parScore, hash);
    },
    setLine(text) {
      par.textContent = text;
    },
    setObjective(p) {
      objLabel.textContent = p.label;
      fill.style.width = `${Math.round(p.fraction * 1000) / 10}%`;
    },
    layout(frame, buttons) {
      const B = frame.boxes;
      score.style.fontWeight = '600';
      setBox(score, B.score, true);
      setBox(mult, B.mult, true);
      setBox(weaponLabel, B.weapon, true);
      setBox(weaponBar, B.weaponBar, false);
      setBox(lives, B.lives, true);
      setBox(bombs, B.bombs, true);
      setBox(bar, B.bar, false);
      setBox(objLabel, B.objLabel, true);
      setBox(par, B.par, true);
      par.style.opacity = '0.8';
      setBox(superName, B.superLabel, true);
      setBox(superTip, B.superHint, true);
      place(pause, frame.buttons.pause, frame.pauseIcon);
      place(bombRing, frame.buttons.bomb, frame.bombD);
      place(superRing, frame.buttons.super, frame.superD);
      for (const e of [pause, bombRing, superRing]) e.style.display = buttons ? 'flex' : 'none';
      for (const e of [superName, superTip]) e.style.display = buttons ? '' : 'none';
    },
    listen(bus) {
      const offScore = bus.on('hud:score', (p) => hud.update(p));
      const offWeapon = bus.on('hud:weapon', (p) => {
        const g = weaponGate(gate, p, now());
        gate = g.gate;
        if (g.draw) hud.setWeapon(p);
      });
      return () => {
        offScore();
        offWeapon();
      };
    },
  };
  return hud;
}
