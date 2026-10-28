// Music entry points (SPEC 3.9). Subscribes to the core bus; never imports src/game, src/ui
// or src/render. Nothing here starts music by itself: glue calls startMusic(seed), or
// wireMusic(bus).levelStart(seed), at level start. Pause and a hidden tab suspend scheduling;
// resume lands on the next bar line. Enemy layers (wave D) follow 'sim:enemyEnter' and
// 'sim:enemyExit'; see lifecycle.ts for the timing rules and layers.ts for the registry.
import { bus as coreBus, type Bus } from '../../core/events';
import type { EnemyKind } from '../../levelgen/leveldef';
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
  sumGains,
  type Mix,
} from './intensity';
import { cutMotifs, LAYERS_FULL, STINGER_STEPS, stingerMidi, type LayerRegistry, type MotifNote } from './layers';
import {
  enterLayer,
  envelopeAt,
  exitLayer,
  layerMix,
  pruneLayers,
  STINGER_GAIN,
  takeStingers,
  type LayerSet,
} from './lifecycle';
import { createScheduler, planStep, realTimer, type Scheduler, type Timer } from './scheduler';
import { buildBar, STEP_SEC, STEPS_PER_BAR, type BarPattern, type Layer } from './track';

/** One scheduled note, reported to `onNote` (tests and debugging). */
export interface NoteLog {
  readonly role: 'bed' | 'stinger' | 'motif';
  /** Bed layer, or null for stingers and motifs. */
  readonly layer: Layer | null;
  /** Enemy kind, or null for the bed. */
  readonly kind: EnemyKind | null;
  readonly step: number;
  readonly time: number;
  readonly midi: number | null;
  readonly gain: number;
}

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
  /**
   * Kinds that keep a motif. Default: every kind. Cut 1 passes CUT1_KEEP (grunt, wanderer,
   * weaver); every other kind keeps its stinger and gets an empty motif.
   */
  motifKinds?: readonly EnemyKind[];
  /** Called for every note handed to the engine. */
  onNote?: (n: NoteLog) => void;
}

interface MotifCache {
  bar: number;
  notes: readonly MotifNote[];
}

interface Session {
  readonly seed: number;
  readonly engine: MusicEngine;
  barIndex: number;
  bar: BarPattern | null;
  lastTick: number | null;
  layers: LayerSet;
  readonly motifs: Map<EnemyKind, MotifCache>;
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
let registry: LayerRegistry = LAYERS_FULL;
let noteHook: ((n: NoteLog) => void) | null = null;
/** Uninstall of the live initMusic install; a new install replaces it. */
let installed: (() => void) | null = null;
let installToken = 0;

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

function motifBar(s: Session, kind: EnemyKind, bar: number): readonly MotifNote[] {
  const c = s.motifs.get(kind);
  if (c && c.bar === bar) return c.notes;
  const notes = registry[kind].motif(s.seed, bar);
  s.motifs.set(kind, { bar, notes });
  return notes;
}

function scaleMix(m: Mix, k: number): Mix {
  if (k >= 1) return m;
  const g = m.gains;
  return { ...m, gains: { bass: g.bass * k, pad: g.pad * k, kick: g.kick * k, hat: g.hat * k, arp: g.arp * k } };
}

function onStep(p: Session, step: number, time: number): void {
  // Layer state advances even at volume 0, so turning the volume up finds the right layers.
  p.layers = pruneLayers(p.layers, step);
  const take = takeStingers(p.layers, step);
  p.layers = take.set;
  if (volume === 0) return;
  const barIndex = Math.floor(step / STEPS_PER_BAR);
  const inBar = step % STEPS_PER_BAR;
  const mix = mixFor(level);
  const lm = layerMix(sumGains(mix.gains), p.layers, registry, step);
  for (const n of planStep(barFor(p, barIndex), inBar, scaleMix(mix, lm.bedScale), time)) {
    p.engine.play(n);
    noteHook?.({ role: 'bed', layer: n.layer, kind: null, step, time, midi: n.midi, gain: n.gain });
  }
  for (const kind of take.due) {
    const spec = registry[kind];
    const midi = stingerMidi(spec, barIndex);
    p.engine.playVoice({ time, dur: STINGER_STEPS * STEP_SEC, midi, fromMidi: null, gain: STINGER_GAIN, timbre: spec.timbre });
    noteHook?.({ role: 'stinger', layer: null, kind, step, time, midi, gain: STINGER_GAIN });
  }
  for (const l of p.layers) {
    const env = envelopeAt(l, step);
    if (env <= 0) continue;
    const spec = registry[l.kind];
    for (const n of motifBar(p, l.kind, barIndex)) {
      if (n.step !== inBar) continue;
      const gain = spec.gain * lm.motifScale * env * n.vel;
      p.engine.playVoice({ time, dur: n.durSteps * STEP_SEC, midi: n.midi, fromMidi: n.fromMidi, gain, timbre: spec.timbre });
      noteHook?.({ role: 'motif', layer: null, kind: l.kind, step, time, midi: n.midi, gain });
    }
  }
}

function onEnter(kind: EnemyKind): void {
  const p = playing;
  if (!p || !(kind in registry)) return;
  p.session.layers = enterLayer(p.session.layers, kind, p.scheduler.nextStep);
}

function onExit(kind: EnemyKind): void {
  const p = playing;
  if (!p || !(kind in registry)) return;
  p.session.layers = exitLayer(p.session.layers, kind, p.scheduler.nextStep);
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
 * stops any music. Calling it again replaces the previous install, so handlers never double.
 */
export function initMusic(opts: MusicOptions = {}): () => void {
  installed?.();
  const token = ++installToken;
  const b = opts.bus ?? coreBus;
  graphSource = opts.graph ?? getAudioGraph;
  timer = opts.timer ?? realTimer;
  registry = opts.motifKinds === undefined ? LAYERS_FULL : cutMotifs(opts.motifKinds);
  noteHook = opts.onNote ?? null;
  if (opts.volume !== undefined) volume = clampMusicVolume(opts.volume);
  const vis = opts.visibility === undefined ? defaultVisibility() : opts.visibility;
  hidden = vis?.hidden ?? false;
  const offs = [
    b.on('sim:threat', (p) => {
      target = clamp01(p.level);
    }),
    b.on('sim:enemyEnter', (p) => onEnter(p.kind)),
    b.on('sim:enemyExit', (p) => onExit(p.kind)),
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
  let done = false;
  const uninstall = (): void => {
    if (done) return;
    done = true;
    for (const off of offs) off();
    vis?.removeEventListener('visibilitychange', onVisibility);
    if (installToken === token) {
      installed = null;
      noteHook = null;
    }
    stopMusic();
  };
  installed = uninstall;
  return uninstall;
}

/** True while the install made by `token` is the live one. */
function isLive(token: number): boolean {
  return installed !== null && installToken === token;
}

export interface MusicWiring {
  readonly bus: Bus;
  /** Start the loop from bar 0 for this level seed (start, restart, retry, next). */
  levelStart(seed: number): boolean;
  /** Remove every subscription and stop the music. */
  unwire(): void;
}

let wiring: { w: MusicWiring; token: number } | null = null;

/**
 * Single idempotent entry point for main.ts glue. The first call installs the music on `b`
 * (sim:threat, sim:enemyEnter, sim:enemyExit, game:pause, game:resume, game:over and game:quit,
 * plus the hidden tab hook); later calls with the same bus return the same wiring and ignore
 * `opts`. Level start is a call, not a bus event, because restart, retry and next level do
 * not emit 'game:start' and 'game:start' carries no seed:
 *   wireMusic(bus).levelStart(seed)
 */
export function wireMusic(b: Bus = coreBus, opts: Omit<MusicOptions, 'bus'> = {}): MusicWiring {
  if (wiring && wiring.w.bus === b && isLive(wiring.token)) return wiring.w;
  const off = initMusic({ ...opts, bus: b });
  const token = installToken;
  const w: MusicWiring = {
    bus: b,
    levelStart: (seed) => startMusic(seed),
    unwire: () => {
      off();
      if (wiring?.w === w) wiring = null;
    },
  };
  wiring = { w, token };
  return w;
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
  // Layers start empty: a new or restarted level re-announces its kinds through the sim.
  const session: Session = {
    seed: seed >>> 0,
    engine,
    barIndex: -1,
    bar: null,
    lastTick: null,
    layers: [],
    motifs: new Map(),
  };
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
  /** Voices that are motifs or stingers. */
  readonly motifVoices: number;
  /** Bed voices cut short by the voice cap this session (0 when the budget holds). */
  readonly bedSteals: number;
  readonly nextStep: number;
  /** Kinds with a layer (live, fading or in the 2 bar tail), in entry order. */
  readonly layers: readonly EnemyKind[];
}

/** Read only snapshot for tests and the debug overlay. */
export function musicState(): MusicState {
  const p = playing;
  return {
    playing: p !== null,
    suspended: p?.scheduler.paused ?? false,
    level,
    voices: p?.engine.voiceCount ?? 0,
    motifVoices: p?.engine.motifVoiceCount ?? 0,
    bedSteals: p?.engine.steals.bed ?? 0,
    nextStep: p?.scheduler.nextStep ?? 0,
    layers: p?.session.layers.map((l) => l.kind) ?? [],
  };
}
export { CUT1_KEEP, LAYER_KINDS } from './layers';
