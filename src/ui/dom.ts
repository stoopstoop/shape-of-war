// DOM helpers shared by the UI screens (docs/03 section 1: DOM overlays above the canvas).
// Touch only: buttons activate on pointerup after a pointerdown on the same element.

const STYLE_ID = 'sow-ui-style';

const CSS = `
.sow-ui { position: fixed; inset: 0; z-index: 20; pointer-events: none;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: hsl(190, 60%, 90%); user-select: none; -webkit-user-select: none; touch-action: none; }
.sow-screen { position: absolute; inset: 0; pointer-events: auto; display: none;
  flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  background: rgba(2, 4, 12, 0.72);
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
    env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); box-sizing: border-box; }
.sow-screen.sow-open { display: flex; }
.sow-title { font-size: clamp(28px, 7vmin, 64px); font-weight: 700; letter-spacing: 0.06em;
  color: hsl(185, 90%, 70%); text-shadow: 0 0 8px hsl(185, 90%, 55%), 0 0 22px hsl(185, 90%, 45%); margin: 0 0 8px; }
.sow-sub { font-size: 16px; opacity: 0.85; text-align: center; white-space: pre-line; }
.sow-row { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
.sow-btn { font: inherit; font-size: 18px; min-width: 160px; min-height: 52px; padding: 10px 20px;
  color: hsl(190, 60%, 92%); background: rgba(10, 30, 50, 0.85); border: 2px solid hsl(185, 90%, 55%);
  border-radius: 10px; box-shadow: 0 0 10px hsla(185, 90%, 55%, 0.5); touch-action: none; }
.sow-btn:active { background: rgba(20, 60, 90, 0.95); }
.sow-stars { font-size: 34px; letter-spacing: 6px; color: hsl(55, 95%, 62%); text-shadow: 0 0 10px hsl(55, 95%, 50%); }
.sow-screen.sow-see { background: transparent; align-items: flex-start; justify-content: center; }
.sow-panel { display: flex; flex-direction: column; gap: 8px; box-sizing: border-box;
  width: min(440px, 48vw); max-height: 100%; overflow: hidden; padding: 10px 14px;
  margin-left: 8px; background: rgba(2, 4, 12, 0.66); border: 1px solid hsla(185, 90%, 55%, 0.45);
  border-radius: 12px; }
.sow-panel .sow-title { font-size: clamp(20px, 5vmin, 34px); margin: 0; }
.sow-panel .sow-btn { min-width: 0; min-height: 44px; font-size: 16px; padding: 6px 12px; flex: 1 1 0; }
.sow-panel .sow-row { flex-wrap: nowrap; gap: 8px; }
.sow-slider { display: flex; align-items: center; gap: 12px; min-height: 44px; touch-action: none; }
.sow-slider-label { min-width: 92px; font-size: 16px; }
.sow-slider-track { position: relative; flex: 1; height: 8px; border-radius: 4px; background: hsla(190, 60%, 90%, 0.2); }
.sow-slider-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; background: hsl(185, 90%, 55%);
  box-shadow: 0 0 8px hsl(185, 90%, 55%); }
.sow-slider-knob { position: absolute; top: 50%; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%;
  background: hsl(190, 60%, 95%); box-shadow: 0 0 10px hsl(185, 90%, 60%); }
.sow-input { font: inherit; font-size: 16px; min-height: 44px; box-sizing: border-box; padding: 6px 10px; flex: 1 1 0; min-width: 0;
  color: hsl(190, 60%, 92%); background: rgba(10, 30, 50, 0.85); border: 2px solid hsla(185, 90%, 55%, 0.6);
  border-radius: 10px; user-select: text; -webkit-user-select: text; touch-action: manipulation; }
.sow-small { font-size: 13px; opacity: 0.7; }
.sow-badge { font-size: 18px; font-weight: 700; padding: 4px 14px; border-radius: 999px; color: hsl(55, 95%, 70%);
  border: 2px solid hsl(55, 95%, 60%); box-shadow: 0 0 12px hsl(55, 95%, 50%); }
.sow-grid { display: grid; grid-template-columns: repeat(6, minmax(64px, 1fr)); gap: 8px; }
.sow-grid .sow-btn { min-width: 0; min-height: 56px; font-size: 16px; padding: 4px; line-height: 1.2; white-space: pre-line; }
.sow-hud { position: absolute; inset: 0; pointer-events: none; display: none; }
.sow-hud.sow-open { display: block; }
.sow-hud-item { position: absolute; white-space: pre; text-shadow: 0 0 6px hsla(190, 80%, 60%, 0.8); }
.sow-hud-bar { position: absolute; border: 1px solid hsla(190, 60%, 90%, 0.6); border-radius: 3px; overflow: hidden; }
.sow-hud-fill { height: 100%; width: 0; background: hsl(95, 100%, 60%); box-shadow: 0 0 8px hsl(95, 100%, 55%); }
.sow-hud-ring { position: absolute; border-radius: 50%; border: 2px solid hsla(190, 60%, 90%, 0.55);
  display: flex; align-items: center; justify-content: center; box-sizing: border-box; font-size: 16px; }
`;

/** Insert the shared stylesheet once. */
export function injectStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID) !== null) return;
  const s = doc.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  doc.head.append(s);
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls !== '') e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A touch button: fires on pointerup when the press started on it. */
export function button(label: string, onTap: () => void): HTMLButtonElement {
  const b = el('button', 'sow-btn', label);
  b.type = 'button';
  let armed = -1;
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    armed = e.pointerId;
  });
  b.addEventListener('pointerup', (e) => {
    e.preventDefault();
    if (armed !== e.pointerId) return;
    armed = -1;
    onTap();
  });
  b.addEventListener('pointercancel', () => {
    armed = -1;
  });
  return b;
}

/** Full screen overlay panel, hidden until show(). */
export interface Screen {
  readonly root: HTMLDivElement;
  show(): void;
  hide(): void;
}

export function createScreen(parent: HTMLElement): Screen {
  const root = el('div', 'sow-screen');
  // Keep overlay touches away from the canvas sticks.
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  parent.append(root);
  return {
    root,
    show: () => root.classList.add('sow-open'),
    hide: () => root.classList.remove('sow-open'),
  };
}

/** The UI layer above the canvas. Transparent to touches except where a screen is open. */
export function createUiRoot(doc: Document = document): HTMLDivElement {
  injectStyles(doc);
  const root = doc.createElement('div');
  root.className = 'sow-ui';
  root.id = 'sow-ui';
  doc.body.append(root);
  return root;
}
