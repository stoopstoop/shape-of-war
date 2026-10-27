// Level intro card and Endless "Ready" text (B7, docs/01 section 10). The card shows the level
// number, objective, par and star thresholds, drone and super; it holds the sim for 1.5 s and a
// tap skips it. Endless gets a 1.5 s "Ready" text instead, which does not take touches, so the
// thumbs can settle on the sticks. The gate is pure and ticks on sim time, so a pause during the
// intro freezes it.
import type { DroneKind, LevelDef, SuperKind } from '../levelgen/leveldef';
import { createScreen, el, type Screen } from './dom';
import { formatInt } from './format';
import type { Mode } from './flow';
import { objectiveText } from './objective';

/** Seconds the intro card or the Ready text holds the sim. */
export const INTRO_SEC = 1.5;
export const READY_TEXT = 'Ready';

export interface IntroGate {
  readonly kind: 'card' | 'ready' | 'none';
  /** Seconds left. */
  readonly left: number;
}

export const NO_INTRO: IntroGate = { kind: 'none', left: 0 };

/** Pure: the gate at the start of a run: card for Adventure, Ready for Endless. */
export function armIntro(mode: Mode, sec = INTRO_SEC): IntroGate {
  return { kind: mode === 'endless' ? 'ready' : 'card', left: Math.max(0, sec) };
}

/** Pure: true while the intro holds the sim. */
export function introActive(g: IntroGate): boolean {
  return g.kind !== 'none' && g.left > 0;
}

/** Pure: advance by `dt` seconds of sim time. Ends as NO_INTRO. */
export function tickIntro(g: IntroGate, dt: number): IntroGate {
  if (!introActive(g)) return NO_INTRO;
  const left = g.left - Math.max(0, dt);
  return left > 1e-6 ? { kind: g.kind, left } : NO_INTRO; // epsilon: float sums of the fixed step
}

/** Pure: a tap skips the card. The Ready text is not skippable (it takes no touches). */
export function skipIntro(g: IntroGate): IntroGate {
  return g.kind === 'card' ? NO_INTRO : g;
}

function title(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function droneName(d: DroneKind): string {
  return `${title(d)} drone`;
}

export function superName(s: SuperKind): string {
  return `${title(s)} super`;
}

export interface IntroCard {
  title: string;
  objective: string;
  par: string;
  kit: string;
}

/** Pure: intro card text for an Adventure level. */
export function introCard(levelIndex: number, def: Pick<LevelDef, 'objective' | 'par' | 'stars' | 'drone' | 'superType'>): IntroCard {
  const [s1, s2, s3] = def.stars;
  return {
    title: `Level ${Math.max(1, Math.floor(levelIndex))}`,
    objective: objectiveText(def.objective),
    par: `Par ${formatInt(def.par)}   ★ ${formatInt(s1)}  ★★ ${formatInt(s2)}  ★★★ ${formatInt(s3)}`,
    kit: `${droneName(def.drone)}   ${superName(def.superType)}`,
  };
}

export interface IntroScreen extends Screen {
  showCard(card: IntroCard): void;
  showReady(): void;
}

/** DOM edge. `onSkip` fires on a tap on the card. */
export function createIntroScreen(parent: HTMLElement, onSkip: () => void): IntroScreen {
  const s = createScreen(parent);
  s.root.style.background = 'rgba(2, 4, 12, 0.45)';
  const head = el('div', 'sow-title');
  const objective = el('div', 'sow-sub');
  objective.style.fontSize = '20px';
  const par = el('div', 'sow-sub');
  const kit = el('div', 'sow-sub');
  const hint = el('div', 'sow-small', 'tap to skip');
  s.root.append(head, objective, par, kit, hint);
  let armed = -1;
  s.root.addEventListener('pointerdown', (e) => {
    armed = e.pointerId;
  });
  s.root.addEventListener('pointerup', (e) => {
    if (armed !== e.pointerId) return;
    armed = -1;
    onSkip();
  });
  const show = (ready: boolean): void => {
    for (const e of [objective, par, kit, hint]) e.style.display = ready ? 'none' : '';
    s.root.style.pointerEvents = ready ? 'none' : 'auto';
    s.root.style.background = ready ? 'transparent' : 'rgba(2, 4, 12, 0.45)';
    s.show();
  };
  return {
    ...s,
    showCard(card) {
      head.textContent = card.title;
      objective.textContent = card.objective;
      par.textContent = card.par;
      kit.textContent = card.kit;
      show(false);
    },
    showReady() {
      head.textContent = READY_TEXT;
      show(true);
    },
  };
}
