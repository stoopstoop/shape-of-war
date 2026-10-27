// HUD (docs/01 section 9). DOM overlay anchored to screen edges plus safe area insets, never to
// the arena. Numbers come from 'hud:score' (main.ts emits it at most every 100 ms); objective
// progress and the level line are set directly by main.ts at the same cadence.
import type { Bus, Events } from '../core/events';
import type { ButtonRects, Insets, Rect } from '../input/types';
import { el } from './dom';
import { formatInt, iconRun } from './format';
import type { ObjectiveProgress } from './objective';

export type AspectClass = 'cover' | 'main';

/** Pure: cover when width / height is 1.8 or more (docs/01 section 9). */
export function aspectClass(cssW: number, cssH: number): AspectClass {
  return cssW / Math.max(1, cssH) >= 1.8 ? 'cover' : 'main';
}

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

/** Pure: safe play rect for renderer.setPlayRect: viewport minus insets minus the HUD band. */
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
  /** Re-anchor on resize, fold and unfold. `rects` are Thumbs' button hit rects, if any. */
  layout(cssW: number, cssH: number, rects: ButtonRects | null): void;
  /** Subscribe to 'hud:score'. Returns the unsubscribe function. */
  listen(bus: Bus): () => void;
}

function edge(side: 'top' | 'left' | 'right', px: number): string {
  return `calc(env(safe-area-inset-${side}, 0px) + ${px}px)`;
}

function place(e: HTMLElement, r: Rect, d: number): void {
  const s = e.style;
  s.left = `${r.x + r.w / 2 - d / 2}px`;
  s.top = `${r.y + r.h / 2 - d / 2}px`;
  s.width = `${d}px`;
  s.height = `${d}px`;
}

/** DOM edge. */
export function createHud(parent: HTMLElement): Hud {
  const root = el('div', 'sow-hud');
  const score = el('div', 'sow-hud-item', '0');
  const mult = el('div', 'sow-hud-item', 'x1');
  mult.style.color = 'hsl(95, 100%, 65%)';
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
  root.append(bar, objLabel, score, mult, par, lives, bombs, pause, bombRing, superRing);
  parent.append(root);

  for (const e of [bar, objLabel, par]) {
    e.style.left = '50%';
    e.style.transform = 'translateX(-50%)';
  }
  objLabel.style.textAlign = 'center';
  for (const e of [lives, bombs]) e.style.textAlign = 'right';
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
    layout(cssW, cssH, rects) {
      const L = hudLayout(aspectClass(cssW, cssH));
      const pos = (e: HTMLElement, side: 'left' | 'right', x: number, y: number, size: number): void => {
        e.style.top = edge('top', y);
        e.style[side] = edge(side, x);
        e.style.fontSize = `${size}px`;
      };
      score.style.fontWeight = '600';
      pos(score, 'left', L.score.x, L.score.y, L.score.size);
      pos(mult, 'left', L.mult.x, L.mult.y, L.mult.size);
      pos(lives, 'right', L.lives.x, L.lives.y, L.lives.size);
      pos(bombs, 'right', L.bombs.x, L.bombs.y, L.bombs.size);
      bar.style.top = edge('top', L.objective.y);
      bar.style.width = `${L.objective.w}px`;
      bar.style.height = `${L.objective.h}px`;
      objLabel.style.top = edge('top', L.objective.y);
      objLabel.style.lineHeight = `${L.objective.h}px`;
      objLabel.style.fontSize = `${L.objective.size}px`;
      par.style.top = edge('top', L.par.y);
      par.style.fontSize = `${L.par.size}px`;
      par.style.opacity = '0.8';
      if (rects !== null) {
        place(pause, rects.pause, L.pauseIcon);
        place(bombRing, rects.bomb, L.bombD);
        place(superRing, rects.super, L.superD);
      }
      for (const e of [pause, bombRing, superRing]) e.style.display = rects === null ? 'none' : 'flex';
    },
    listen(bus) {
      return bus.on('hud:score', (p) => hud.update(p));
    },
  };
  return hud;
}
