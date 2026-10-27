// Pure text formatting for HUD and results. Locale independent so device and tests agree.

/** 1234567 to "1,234,567". Negative and fractional input is floored at 0. */
export function formatInt(n: number): string {
  const v = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Seconds to "m:ss", rounded up so the display reaches 0:00 only when time is out. */
export function formatClock(sec: number): string {
  const s = Number.isFinite(sec) ? Math.max(0, Math.ceil(sec)) : 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** Up to `max` icons, then the icon plus " x N" (docs/01 section 9: lives and bombs). */
export function iconRun(icon: string, n: number, max = 5): string {
  const c = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  return c <= max ? icon.repeat(c) : `${icon} x ${c}`;
}

/** "3 of 3" stars as filled and hollow glyphs. */
export function starGlyphs(stars: number): string {
  const s = Math.max(0, Math.min(3, Math.floor(stars)));
  return '★'.repeat(s) + '☆'.repeat(3 - s);
}
