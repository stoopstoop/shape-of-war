// Viewport helpers (docs/04 sections 2, 4, 5). Pure functions first, DOM edges at the bottom.
import type { Insets } from '../input/types';
import type { ArenaFit } from './events';

export const DPR_CAP = 2;
/** CSS px reserved for the HUD strip at the top of the safe rect (docs/04 section 4). */
export const HUD_TOP = 40;
export const HUD_BOTTOM = 0;

/** Pure: capped render resolution for a raw devicePixelRatio. */
export function capDpr(raw: number): number {
  const d = Number.isFinite(raw) && raw > 0 ? raw : 1;
  return Math.min(d, DPR_CAP);
}

/** Pure: letterbox the arena inside the safe play rect. Scale never drops below a tiny positive value. */
export function fitArena(cssW: number, cssH: number, ins: Insets, arenaW: number, arenaH: number): ArenaFit {
  const rx = ins.left;
  const ry = ins.top + HUD_TOP;
  const rw = Math.max(1, cssW - ins.left - ins.right);
  const rh = Math.max(1, cssH - ins.top - ins.bottom - HUD_TOP - HUD_BOTTOM);
  const scale = Math.max(1e-4, Math.min(rw / Math.max(1, arenaW), rh / Math.max(1, arenaH)));
  return { scale, x: rx + rw / 2, y: ry + rh / 2 };
}

/** Pure: round to three decimals so 2.6250000001 prints as 2.625. */
export function fmt3(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** Pure: the G0 line logged and drawn on screen for every resize. */
export function viewportLine(cssW: number, cssH: number, rawDpr: number): string {
  return `[sow] viewport ${cssW}x${cssH} @ ${fmt3(rawDpr)}`;
}

// DOM edges below. Not imported by tests.

export function renderDpr(): number {
  return capDpr(window.devicePixelRatio || 1);
}

let probe: HTMLDivElement | null = null;

/** Safe area insets via a hidden probe element, since JS has no direct API (docs/04 section 5). */
export function readInsets(): Insets {
  if (probe === null) {
    probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) ' +
      'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
}
