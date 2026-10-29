// B7 regression: boot "Tap to start" screen, 1.5 s level intro card, Endless "Ready" text.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOSS_IDS } from '../../src/levelgen/leveldef';
import { BOSS_NAMES } from '../../src/ui/boss';
import { bootFlow, reduceFlow, simRunning, type FlowAction } from '../../src/ui/flow';
import {
  armIntro,
  bossIntroLine,
  createIntroScreen,
  INTRO_SEC,
  introActive,
  introCard,
  NO_INTRO,
  READY_TEXT,
  skipIntro,
  tickIntro,
} from '../../src/ui/intro';
import { asParent, installFakeDocument, type FakeEl } from './fakeDom';

describe('B7 boot screen in the flow', () => {
  it('launches on the boot screen with the sim stopped', () => {
    const s = bootFlow(4);
    expect(s.screen).toBe('boot');
    expect(s.levelIndex).toBe(4);
    expect(simRunning(s)).toBe(false);
  });

  it('the tap goes to the menu; nothing else leaves boot', () => {
    const s = bootFlow();
    const stray: FlowAction[] = [
      { type: 'start', mode: 'adventure', levelIndex: 1 },
      { type: 'pause' },
      { type: 'hidden' },
      { type: 'resume' },
      { type: 'quit' },
      { type: 'openSettings' },
      { type: 'openLevels' },
      { type: 'retry' },
    ];
    for (const a of stray) expect(reduceFlow(s, a)).toBe(s);
    const menu = reduceFlow(s, { type: 'tapStart' });
    expect(menu.screen).toBe('menu');
    expect(reduceFlow(menu, { type: 'tapStart' })).toBe(menu);
  });
});

describe('B7 intro gate', () => {
  it('Adventure gets the card, Endless gets Ready, both 1.5 s', () => {
    expect(INTRO_SEC).toBe(1.5);
    expect(armIntro('adventure')).toEqual({ kind: 'card', left: 1.5 });
    expect(armIntro('endless')).toEqual({ kind: 'ready', left: 1.5 });
    expect(READY_TEXT).toBe('Ready');
  });

  it('holds the sim for 1.5 s of sim time then releases', () => {
    let g = armIntro('adventure');
    const dt = 1 / 120;
    let steps = 0;
    while (introActive(g) && steps < 1000) {
      g = tickIntro(g, dt);
      steps++;
    }
    expect(steps).toBe(180);
    expect(g).toBe(NO_INTRO);
  });

  it('a tap skips the card but not the Ready text', () => {
    expect(skipIntro(armIntro('adventure'))).toBe(NO_INTRO);
    const ready = armIntro('endless');
    expect(skipIntro(ready)).toBe(ready);
  });

  it('a finished gate stays finished', () => {
    expect(introActive(NO_INTRO)).toBe(false);
    expect(tickIntro(NO_INTRO, 1)).toBe(NO_INTRO);
  });
});

describe('B7 intro card text', () => {
  it('shows level number, objective, par with star thresholds, drone and super', () => {
    const card = introCard(7, {
      objective: { kind: 'destroy', count: 40 },
      par: 1500,
      stars: [1500, 3000, 6000],
      drone: 'collect',
      superType: 'detonate',
    });
    expect(card.title).toBe('Level 7');
    expect(card.objective).toBe('Destroy 40 enemies');
    expect(card.par).toBe('Par 1,500   ★ 1,500  ★★ 3,000  ★★★ 6,000');
    expect(card.kit).toBe('Collect drone   Detonate super');
  });

  it('timed objectives read as clock text', () => {
    const card = introCard(1, {
      objective: { kind: 'survive', durationSec: 90 },
      par: 1000,
      stars: [1000, 2000, 4000],
      drone: 'attack',
      superType: 'homing',
    });
    expect(card.objective).toBe('Survive 1:30');
    expect(card.kit).toBe('Attack drone   Homing super');
  });
});

// V3-A: the card shows "Boss: <name>" on a boss level (docs/13 section 9).
describe('V3-A intro card boss line', () => {
  afterEach(() => vi.unstubAllGlobals());
  const def = {
    objective: { kind: 'survive', durationSec: 90 } as const,
    par: 4000,
    stars: [4000, 8000, 16000] as [number, number, number],
    drone: 'attack' as const,
    superType: 'homing' as const,
  };

  it('a boss level adds "Boss: <name>" from BOSS_NAMES', () => {
    expect(introCard(5, { ...def, boss: { id: 'warden', tier: 1, atSec: 20, hpMul: 1 } }).boss).toBe('Boss: Warden');
    expect(introCard(50, { ...def, boss: { id: 'prism', tier: 4, atSec: 20, hpMul: 1 } }).boss).toBe('Boss: Prism');
  });

  it('every boss id gets its own line', () => {
    const lines = BOSS_IDS.map((id) => bossIntroLine({ id, tier: 1, atSec: 20, hpMul: 1 }));
    expect(lines).toEqual(BOSS_IDS.map((id) => `Boss: ${BOSS_NAMES[id]}`));
    expect(new Set(lines).size).toBe(10);
  });

  it('follows an edit of BOSS_NAMES, the const Ryan edits: no name is written in intro.ts', () => {
    const src = readFileSync(fileURLToPath(new URL('../../src/ui/intro.ts', import.meta.url)), 'utf8');
    for (const name of Object.values(BOSS_NAMES)) expect(src).not.toContain(name);
    expect(src).toContain('bossName');
  });

  it('a level with no boss has no line, and the other card lines are unchanged', () => {
    const plain = introCard(7, def);
    expect(plain.boss).toBe('');
    expect(bossIntroLine(undefined)).toBe('');
    const withBoss = introCard(7, { ...def, boss: { id: 'brood', tier: 1, atSec: 20, hpMul: 1 } });
    expect({ ...withBoss, boss: '' }).toEqual(plain);
  });

  describe('screen', () => {
    const bossEl = (root: FakeEl): FakeEl | undefined => root.all().find((e) => e.getAttribute('data-intro') === 'boss');
    const build = () => {
      const root = installFakeDocument();
      const screen = createIntroScreen(asParent(root), () => undefined);
      return { root, screen };
    };

    it('shows the line on a boss card and hides it on a plain one', () => {
      const { root, screen } = build();
      screen.showCard(introCard(5, { ...def, boss: { id: 'warden', tier: 1, atSec: 20, hpMul: 1 } }));
      expect(bossEl(root)?.textContent).toBe('Boss: Warden');
      expect(bossEl(root)?.style.display).toBe('');
      screen.showCard(introCard(6, def));
      expect(bossEl(root)?.style.display).toBe('none');
    });

    it('the Endless Ready text never shows it, even right after a boss card', () => {
      const { root, screen } = build();
      screen.showCard(introCard(5, { ...def, boss: { id: 'warden', tier: 1, atSec: 20, hpMul: 1 } }));
      screen.showReady();
      expect(bossEl(root)?.style.display).toBe('none');
    });
  });
});
