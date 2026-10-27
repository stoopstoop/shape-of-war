// B7 regression: boot "Tap to start" screen, 1.5 s level intro card, Endless "Ready" text.
import { describe, expect, it } from 'vitest';
import { bootFlow, reduceFlow, simRunning, type FlowAction } from '../../src/ui/flow';
import { armIntro, INTRO_SEC, introActive, introCard, NO_INTRO, READY_TEXT, skipIntro, tickIntro } from '../../src/ui/intro';

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
