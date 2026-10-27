import { describe, expect, it } from 'vitest';
import {
  clampVolume,
  CUES,
  createRateLimiter,
  cueForSfx,
  isBigKillColour,
  masterGain,
  MAX_VOICES,
  RATE_LIMITS,
  SFX_TO_CUE,
  voiceToSteal,
} from '../../src/audio/cues';
import { setVolume } from '../../src/audio/synth';
import type { SfxName } from '../../src/core/events';

const ALL_SFX: SfxName[] = ['shot', 'explode', 'geom', 'bomb', 'death', 'spawn'];

describe('sfx mapping table', () => {
  it('maps every bus sfx name to a defined cue', () => {
    for (const s of ALL_SFX) {
      const cue = SFX_TO_CUE[s];
      expect(CUES[cue].voices.length).toBeGreaterThan(0);
    }
    expect(SFX_TO_CUE.shot).toBe('fire');
    expect(SFX_TO_CUE.explode).toBe('enemyKill');
    expect(SFX_TO_CUE.geom).toBe('geomPickup');
    expect(SFX_TO_CUE.bomb).toBe('bomb');
    expect(SFX_TO_CUE.death).toBe('shipDeath');
    expect(SFX_TO_CUE.spawn).toBe('telegraph');
  });

  it('big kills (snake, spawner, well colours) upgrade explode to bigKill', () => {
    expect(isBigKillColour('cyan')).toBe(true);
    expect(isBigKillColour('yellow')).toBe(true);
    expect(isBigKillColour('red')).toBe(true);
    expect(isBigKillColour('blue')).toBe(false);
    expect(cueForSfx('explode', true)).toBe('bigKill');
    expect(cueForSfx('explode', false)).toBe('enemyKill');
    expect(cueForSfx('shot', true)).toBe('fire');
  });

  it('cue table matches docs/01 section 13 for the fire cue', () => {
    const v = CUES.fire.voices[0];
    expect(v?.wave).toBe('square');
    expect(v?.f0).toBe(880);
    expect(v?.f1).toBe(660);
    expect(v?.dur).toBeCloseTo(0.04, 10);
    expect(v?.gain).toBeCloseTo(0.04, 10);
  });
});

describe('shot rate limit', () => {
  it('allows at most 12 shot sounds per second', () => {
    expect(RATE_LIMITS.fire).toBe(12);
    const lim = createRateLimiter(RATE_LIMITS.fire ?? 12);
    let played = 0;
    // A caller firing at 120 Hz for one second.
    for (let i = 0; i < 120; i++) if (lim.allow(i / 120)) played++;
    expect(played).toBeLessThanOrEqual(12);
    expect(played).toBeGreaterThanOrEqual(10);
  });

  it('a 12 Hz caller is never dropped', () => {
    const lim = createRateLimiter(12);
    let played = 0;
    for (let i = 0; i < 24; i++) if (lim.allow(i / 12)) played++;
    expect(played).toBe(24);
  });

  it('back to back calls in the same instant play once', () => {
    const lim = createRateLimiter(12);
    expect(lim.allow(5)).toBe(true);
    expect(lim.allow(5)).toBe(false);
    expect(lim.allow(5.01)).toBe(false);
  });
});

describe('volume', () => {
  it('setVolume clamps 0 to 100', () => {
    expect(setVolume(150)).toBe(100);
    expect(setVolume(-20)).toBe(0);
    expect(setVolume(42.4)).toBe(42);
    expect(setVolume(Number.NaN)).toBe(70);
    expect(clampVolume(100)).toBe(100);
    expect(clampVolume(0)).toBe(0);
  });

  it('master gain is volume / 100 x 0.6', () => {
    expect(masterGain(100)).toBeCloseTo(0.6, 10);
    expect(masterGain(50)).toBeCloseTo(0.3, 10);
    expect(masterGain(0)).toBe(0);
    expect(masterGain(500)).toBeCloseTo(0.6, 10);
  });
});

describe('polyphony', () => {
  it('steals the oldest voice only at the 24 voice cap', () => {
    expect(MAX_VOICES).toBe(24);
    expect(voiceToSteal([1, 2, 3])).toBe(-1);
    const full = Array.from({ length: 24 }, (_, i) => 10 + i);
    full[7] = 1;
    expect(voiceToSteal(full)).toBe(7);
  });
});
