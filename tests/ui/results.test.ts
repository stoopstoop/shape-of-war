import { describe, expect, it } from 'vitest';
import type { LevelResult } from '../../src/ui/flow';
import { continueLabel, GAME_TITLE, SHOW_ENDLESS } from '../../src/ui/menu';
import { badgeText, resultLines } from '../../src/ui/results';

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

describe('Endless results', () => {
  const endless: LevelResult = { ...base, mode: 'endless', success: false, stars: 0, par: 0, score: 12000, best: 12000, rank: 1, seed: 99 };
  it('new high score badge, seed, no stars', () => {
    const t = resultLines(endless);
    expect(t.title).toBe('Game over');
    expect(t.badge).toBe('New high score');
    expect(t.stars).toBe('');
    expect(t.detail).toBe('Best 12,000\nEndless seed 99');
  });
  it('lower ranks and misses', () => {
    expect(badgeText({ ...endless, rank: 4 })).toBe('Top 10: #4');
    expect(badgeText({ ...endless, rank: 0 })).toBe('');
    expect(badgeText({ ...base, rank: 1 })).toBe('');
  });
  it('adventure keeps stars and no badge', () => {
    expect(resultLines(base).badge).toBe('');
    expect(resultLines(base).stars).toBe('★★★');
  });
});

describe('menu', () => {
  it('title is Shape of War and Endless is shown', () => {
    expect(GAME_TITLE).toBe('Shape of War');
    expect(SHOW_ENDLESS).toBe(true);
  });
  it('continue label names the highest unlocked level', () => {
    expect(continueLabel(1)).toBe('Adventure');
    expect(continueLabel(4)).toBe('Continue  L4');
  });
});
