import { describe, expect, it } from 'vitest';
import { levelButtonLabel, levelPage, pageCount } from '../../src/ui/levelSelect';

describe('level select', () => {
  const scores = { '1': { best: 4000, stars: 3 as const }, '2': { best: 900, stars: 0 as const } };

  it('shows only unlocked levels with their best stars', () => {
    const p = levelPage(3, scores, 0);
    expect(p.entries).toEqual([
      { index: 1, stars: 3, best: 4000 },
      { index: 2, stars: 0, best: 900 },
      { index: 3, stars: 0, best: 0 },
    ]);
    expect(p.pages).toBe(1);
  });

  it('pages by 12 and clamps the page', () => {
    expect(pageCount(12)).toBe(1);
    expect(pageCount(13)).toBe(2);
    expect(pageCount(0)).toBe(1);
    const last = levelPage(13, {}, 5);
    expect(last.page).toBe(1);
    expect(last.entries.map((e) => e.index)).toEqual([13]);
    expect(levelPage(13, {}, -2).entries).toHaveLength(12);
  });

  it('button label', () => {
    expect(levelButtonLabel({ index: 7, stars: 2, best: 1 })).toBe('7\n★★☆');
  });
});
