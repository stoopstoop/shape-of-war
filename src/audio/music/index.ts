// Music entry points (SPEC 3.9). Subscribes to the core bus; never imports src/game, src/ui
// or src/render. Nothing here starts music by itself: wave D glue calls startMusic(seed) at
// level start. Pause and a hidden tab suspend scheduling; resume lands on the next bar line.
import { bus as coreBus, type Bus } from '../../core/events';
import { getAudioGraph } from '../synth';
import { createMusicEngine, type MusicContext, type MusicEngine, type NodeLike } from './engine';
import {
  clamp01,
  clampMusicVolume,
  masterCutoff,
  mixFor,
  MUSIC_VOLUME_DEFAULT,
  musicMasterGain,
  smoothThreat,
} from './intensity';
import { createScheduler, planStep, realTimer, type Scheduler, type Timer } from './scheduler';
import { buildBar, STEPS_PER_BAR, type BarPattern } from './track';

export interface MusicGraph {
  readonly ctx: MusicContext;
  /** The synth master gain; the music bus feeds it. */
  readonly master: NodeLike;
}

/** Visibility source, document in the browser. */
export interface VisibilitySource {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', fn: () => void): void;
  removeEventListener(type: 'visibilitychange', fn: () => void): void;
}

export interface MusicOptions {
  /** Defaults to the core bus. */
  bus?: Bus;
  /** Defaults to synth getAudioGraph(). */
  graph?: () => MusicGraph | null;
  /** Defaults to setInterval. */
  timer?: Timer;
  /** Defaults to document when present; null disables the hidden tab hook. */
  visibility?: VisibilitySource | null;
  /** Initial music volume 0 to 100, default 50. */
  volume?: number;
}

interface Session {
  readonly seed: number;
  readonly engine: MusicEngine;
  barIndex: number;
  bar: BarPattern | null;
  lastTick: number | null;
}

interface Playing {
  readonly session: Session;
  readonly engine: MusicEngine;
  readonly scheduler: Scheduler;
}

let volume = MUSIC_VOLUME_DEFAULT;
let target = 0;
let level = 0;
let gamePaused = false;
let hidden = false;
let graphSource: () => MusicGraph | null = getAudioGraph;
let timer: Timer = realTimer;
let playing: Playing | null = null;

function defaultVisibility(): VisibilitySource | null {
  return typeof document === 'undefined' ? null : document;
}

function barFor(s: Session, index: number): BarPattern {
  if (s.bar === null || s.barIndex !== index) {
    s.bar = buildBar(s.seed, index);
    s.barIndex = index;
  }
  return s.bar;
}

function onTick(s: Session, now: number): void {
  const dt = s.lastTick === null ? 0 : now - s.lastTick;
  s.lastTick = now;
  level = smoothThreat(level, target, dt);
  s.engine.setCutoff(masterCutoff(level));
}

function onStep(p: Session, step: number, time: number): void {
  if (volume === 0) return;
  const bar = barFor(p, Math.floor(step / STEPS_PER_BAR));
  for (const n of planStep(bar, step % STEPS_PER_BAR, mixFor(level), time)) p.engine.play(n);
}

function suspend(): void {
  const p = playing;
  if (!p || p.scheduler.paused) return;
  p.scheduler.pause();
  p.engine.silence();
}

function maybeResume(): void {
  const p = playing;
  if (!p || !p.scheduler.paused || gamePaused || hidden) return;
  p.session.lastTick = null;
  p.scheduler.resume();
}

/**
 * Wire music to the bus and the visibility hook. Returns an uninstall function that also
 * stops any music.
 */
export function initMusic(opts: MusicOptions = {}): () => void {
  const b = opts.bus ?? coreBus;
  graphSource = opts.graph ?? getAudioGraph;
  timer = opts.timer ?? realTimer;
  if (opts.volume !== undefined) volume = clampMusicVolume(opts.volume);
  const vis = opts.visibility === undefined ? defaultVisibility() : opts.visibility;
  hidden = vis?.hidden ?? false;
  const offs = [
    b.on('sim:threat', (p) => {
      target = clamp01(p.level);
    }),
    b.on('game:pause', () => {
      gamePaused = true;
      suspend();
    }),
    b.on('game:resume', () => {
      gamePaused = false;
      maybeResume();
    }),
    b.on('game:over', () => stopMusic()),
    b.on('game:quit', () => stopMusic()),
  ];
  const onVisibility = (): void => {
    hidden = vis?.hidden ?? false;
    if (hidden) suspend();
    else maybeResume();
  };
  vis?.addEventListener('visibilitychange', onVisibility);
  return () => {
    for (const off of offs) off();
    vis?.removeEventListener('visibilitychange', onVisibility);
    stopMusic();
  };
}

/**
 * Start the base track from bar 0 for a level seed. Returns false (and stays silent) when
 * audio is not unlocked yet. Restarts cleanly if music is already playing.
 */
export function startMusic(seed: number): boolean {
  stopMusic();
  const g = graphSource();
  if (!g) return false;
  const ctx = g.ctx;
  const engine = createMusicEngine(ctx, g.master, musicMasterGain(volume));
  // A new level starts calm; the next 'sim:threat' sets the target.
  level = 0;
  target = 0;
  gamePaused = false;
  const session: Session = { seed: seed >>> 0, engine, barIndex: -1, bar: null, lastTick: null };
  const scheduler = createScheduler({
    clock: { now: () => ctx.currentTime },
    timer,
    onStep: (step, time) => onStep(session, step, time),
    onTick: (now) => onTick(session, now),
  });
  playing = { session, engine, scheduler };
  engine.setCutoff(masterCutoff(level));
  scheduler.start();
  if (hidden) suspend();
  return true;
}

/** Stop the music and release every node. Safe to call when nothing plays. */
export function stopMusic(): void {
  const p = playing;
  if (!p) return;
  playing = null;
  p.scheduler.stop();
  p.engine.dispose();
}

/** Music volume 0 to 100 (clamped, default 50). 0 is silence. Returns the applied value. */
export function setMusicVolume(v: number): number {
  volume = clampMusicVolume(v);
  if (playing) {
    playing.engine.setMaster(musicMasterGain(volume));
    if (volume === 0) playing.engine.silence();
  }
  return volume;
}

export function getMusicVolume(): number {
  return volume;
}

export interface MusicState {
  readonly playing: boolean;
  readonly suspended: boolean;
  /** Smoothed threat 0 to 1. */
  readonly level: number;
  readonly voices: number;
  readonly nextStep: number;
}

/** Read only snapshot for tests and the debug overlay. */
export function musicState(): MusicState {
  const p = playing;
  return {
    playing: p !== null,
    suspended: p?.scheduler.paused ?? false,
    level,
    voices: p?.engine.voiceCount ?? 0,
    nextStep: p?.scheduler.nextStep ?? 0,
  };
}
