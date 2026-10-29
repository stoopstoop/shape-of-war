import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LevelResult } from '../../src/ui/flow';
import { continueLabel, GAME_TITLE, SHOW_ENDLESS } from '../../src/ui/menu';
import { badgeText, createResultsScreen, physicsLine, resultLines } from '../../src/ui/results';
import { asParent, installFakeDocument, type FakeEl } from './fakeDom';

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

describe('B13 Space physics on the results screen', () => {
  it('shows the level in effect when the run ended, omitted when Off or absent', () => {
    expect(physicsLine('medium')).toBe('Space physics: Medium');
    expect(physicsLine('low')).toBe('Space physics: Low');
    expect(physicsLine('high')).toBe('Space physics: High');
    expect(physicsLine('off')).toBe('');
    expect(physicsLine(undefined)).toBe('');
  });

  it('both modes carry the line and leave the other lines as they were', () => {
    const a = resultLines({ ...base, space: 'medium' });
    expect(a.physics).toBe('Space physics: Medium');
    expect(a.detail).toBe(resultLines(base).detail);
    expect(resultLines(base).physics).toBe('');
    const e = resultLines({ ...base, mode: 'endless', success: false, seed: 5, space: 'high' });
    expect(e.physics).toBe('Space physics: High');
  });

  describe('screen', () => {
    afterEach(() => vi.unstubAllGlobals());
    const physicsEl = (root: FakeEl): FakeEl | undefined => root.all().find((e) => e.getAttribute('data-results') === 'physics');

    it('draws the line under the detail and hides it when Off', () => {
      const root = installFakeDocument();
      const screen = createResultsScreen(asParent(root), { next: () => undefined, retry: () => undefined, menu: () => undefined });
      screen.showResult({ ...base, space: 'medium' });
      expect(physicsEl(root)?.textContent).toBe('Space physics: Medium');
      expect(physicsEl(root)?.style.display).toBe('');
      screen.showResult({ ...base, space: 'off' });
      expect(physicsEl(root)?.textContent).toBe('');
      expect(physicsEl(root)?.style.display).toBe('none');
    });
  });

  it('main.ts fills the result from the settings model at game over, both modes', () => {
    const src = readFileSync(fileURLToPath(new URL('../../src/main.ts', import.meta.url)), 'utf8');
    expect(src.match(/space: settingsModel\.state\.spacePhysics/g)?.length).toBe(2);
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
