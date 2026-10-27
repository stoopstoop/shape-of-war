import { describe, expect, it } from 'vitest';
import type { LevelResult } from '../../src/ui/flow';
import { GAME_TITLE, SHOW_ENDLESS } from '../../src/ui/menu';
import { resultLines } from '../../src/ui/results';

const base: LevelResult = {
  mode: 'adventure',
  levelIndex: 2,
  score: 4500,
  stars: 3,
  success: true,
  par: 1000,
  best: 4500,
  newBest: true,
  hash: '0badf00d',
};

describe('results screen text', () => {
  it('success shows score, stars, par, best and hash', () => {
    const t = resultLines(base);
    expect(t.title).toBe('Level 2 complete');
    expect(t.score).toBe('4,500');
    expect(t.stars).toBe('★★★');
    expect(t.detail).toBe('Par 1,000  Best 4,500  New best\nLevel #0badf00d');
  });

  it('failure title and no new best flag', () => {
    const t = resultLines({ ...base, success: false, stars: 0, score: 200, best: 4500, newBest: false });
    expect(t.title).toBe('Level 2 failed');
    expect(t.stars).toBe('☆☆☆');
    expect(t.detail).toBe('Par 1,000  Best 4,500\nLevel #0badf00d');
  });
});

describe('menu', () => {
  it('title is Shape of War and Endless is hidden until W3', () => {
    expect(GAME_TITLE).toBe('Shape of War');
    expect(SHOW_ENDLESS).toBe(false);
  });
});
