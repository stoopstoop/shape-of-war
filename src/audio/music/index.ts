// Music entry points (SPEC 3.9). Subscribes to the core bus; never imports src/game, src/ui
// or src/render. Nothing here starts music by itself: glue calls startMusic(seed), or
// wireMusic(bus).levelStart(seed), at level start. Pause and a hidden tab suspend scheduling;
// resume lands on the next bar line. Enemy layers (wave D) follow 'sim:enemyEnter' and
// 'sim:enemyExit'; see lifecycle.ts for the timing rules and layers.ts for the registry.
// Kill accents (v2 fixes) follow 'fx:kill' plus 'sfx' explode and 'fx:bomb'; see kills.ts. Hit
// ticks and shield deflects follow 'fx:hit'; see hits.ts. Bus handlers only queue; every Web
// Audio node is made inside the scheduler tick, between frames.
import { bus as coreBus, type Bus } from '../../core/events';
import type { EnemyKind } from '../../levelgen/leveldef';
import { getAudioGraph } from '../synth';
import { createMusicEngine, voiceLength, type MusicContext, type MusicEngine, type NodeLike, type Span, type VoiceTrace } from './engine';
import {
  clamp01,
  clampMusicVolume,
  cutoffChanged,
  masterCutoff,
  mixFor,
  MUSIC_VOLUME_DEFAULT,
  musicMasterGain,
  nextLift,
  smoothThreat,
  sumGains,
  type Mix,
} from './intensity';
import {
  bombStepFor,
  CHORD_GAIN,
  CHORD_STEPS,
  CHORD_TIMBRE,
  chordMidis,
  chordStepFor,
  enemyOf,
  gateBomb,
  gateKill,
  isBigSource,
  KILL_GATE_INIT,
  KILL_LEAD_SEC,
  KILL_QUEUE_MAX,
  KILL_SPECS,
  killMidi,
  sourceFor,
  type GateResult,
  type KillGate,
  type KillSource,
} from './kills';
import {
  DEFLECT_DROP,
  DEFLECT_DUR_SEC,
  DEFLECT_GAIN,
  DEFLECT_TIMBRE,
  deflectMidi,
  gateDeflect,
  gateHit,
  hasQueued,
  HIT_DUR_SEC,
  HIT_GATE_INIT,
  HIT_QUEUE_MAX,
  hitGain,
  hitMidi,
  hitOrder,
  hitTimbreFor,
  type HitGate,
  type QueuedHit,
} from './hits';
import { cutMotifs, LAYERS_FULL, STINGER_STEPS, stingerMidi, type LayerRegistry, type MotifNote } from './layers';
import {
  enterLayer,
  envelopeAt,
  exitLayer,
  layerMix,
  motifActive,
  pruneLayers,
  STINGER_GAIN,
  takeStingers,
  type LayerSet,
} from './lifecycle';
import { createScheduler, planStep, realTimer, type Scheduler, type Timer } from './scheduler';
import { buildBar, STEP_SEC, STEPS_PER_BAR, type BarPattern, type Layer } from './track';

/** One scheduled note, reported to `onNote` (tests and debugging). */
export interface NoteLog {
  readonly role: 'bed' | 'stinger' | 'motif' | 'kill' | 'chord' | 'hit' | 'deflect';
  /** Bed layer, or null for stingers, motifs, kill accents and hits. */
  readonly layer: Layer | null;
  /** Enemy kind, or null for the bed, chords, deflects and non enemy sources (wells, spawners, segments, Mines, Slime). */
  readonly kind: EnemyKind | null;
  /** Kill notes and hit ticks only: what was killed or hit (also wells, spawners, segments, Mines, Slime). */
  readonly source?: KillSource;
  /** Audio clock when the note was handed to the engine. */
  readonly at?: number;
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
  /** Voice spans from the engine (tests and debugging). */
  trace?: VoiceTrace;
}

type QueuedAccent = { readonly type: 'kill'; readonly source: KillSource } | { readonly type: 'bomb' };

interface KillStats {
  seen: number;
  notes: number;
  chords: number;
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
  /** High threat lift, with hysteresis (intensity.ts nextLift). */
  lift: boolean;
  /** Last cutoff sent to the engine, so near repeats are not sent. */
  lastCutoff: number | null;
  gate: KillGate;
  /** Kills in this level so far; the thinning hash reads it. */
  killOrdinal: number;
  readonly queue: QueuedAccent[];
  readonly stats: KillStats;
  hitGate: HitGate;
  readonly hits: QueuedHit[];
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
let voiceTrace: VoiceTrace | undefined;
/** Source of the last fx:kill; the 'explode' sfx that follows a scored kill consumes it. */
let pendingKill: KillSource | null = null;
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

function onTick(s: Session, now: number, sched: Scheduler): void {
  const dt = s.lastTick === null ? 0 : now - s.lastTick;
  s.lastTick = now;
  level = smoothThreat(level, target, dt);
  s.lift = nextLift(s.lift, level);
  const hz = masterCutoff(level, s.lift);
  // Only meaningful changes reach the AudioParam: 40 setTargetAtTime calls a second grew the
  // automation list for nothing.
  if (cutoffChanged(s.lastCutoff, hz)) {
    s.engine.setCutoff(hz);
    s.lastCutoff = hz;
  }
  // A kill pair ('fx:kill' then 'explode') is emitted synchronously inside one sim step, so a
  // source still pending at a tick never pairs.
  pendingKill = null;
  drainAccents(s, now, sched);
  drainHits(s, now, sched);
}

/**
 * Bed and motif notes that will start before `until` but are not scheduled yet. The track and
 * the motifs are composed, so the voice budget can count them before they exist.
 */
function upcomingSpans(s: Session, sched: Scheduler, until: number): Span[] {
  const out: Span[] = [];
  const mix = mixFor(level, s.lift);
  for (let step = sched.nextStep; sched.timeOf(step) < until; step++) {
    const time = sched.timeOf(step);
    const barIndex = Math.floor(step / STEPS_PER_BAR);
    const inBar = step % STEPS_PER_BAR;
    const bar = s.bar !== null && s.barIndex === barIndex ? s.bar : buildBar(s.seed, barIndex);
    for (const n of planStep(bar, inBar, mix, time)) out.push({ start: time, end: time + voiceLength(n.layer, n.dur) });
    for (const l of s.layers) {
      if (!motifActive(l, step) || envelopeAt(l, step) <= 0) continue;
      for (const n of motifBar(s, l.kind, barIndex)) {
        if (n.step === inBar) out.push({ start: time, end: time + n.durSteps * STEP_SEC });
      }
    }
  }
  return out;
}

/** Free accent voices for `steps` sixteenths from `step`. */
function roomAt(s: Session, sched: Scheduler, step: number, steps: number): number {
  const t = sched.timeOf(step);
  const len = steps * STEP_SEC;
  return s.engine.accentRoom(t, len, upcomingSpans(s, sched, t + len));
}

function applyGate(s: Session, sched: Scheduler, r: GateResult, source: KillSource | null, at: number): void {
  s.gate = r.gate;
  const a = r.action;
  if (a.type === 'note' && source !== null) {
    const spec = KILL_SPECS[source];
    const bar = Math.floor(a.step / STEPS_PER_BAR);
    const midi = killMidi(spec, bar);
    const time = sched.timeOf(a.step);
    const gain = spec.gain * (0.8 + 0.2 * level);
    s.engine.playVoice({ time, dur: spec.durSteps * STEP_SEC, midi, fromMidi: null, gain, timbre: spec.timbre }, 'accent');
    s.stats.notes++;
    noteHook?.({ role: 'kill', layer: null, kind: enemyOf(source), source, step: a.step, time, midi, gain, at });
  } else if (a.type === 'chord') {
    const bar = Math.floor(a.step / STEPS_PER_BAR);
    const time = sched.timeOf(a.step);
    const all = chordMidis(bar, a.big);
    const room = roomAt(s, sched, a.step, CHORD_STEPS);
    // Fewer free voices than notes: drop from the bottom (the big chord's low note goes first).
    const notes = all.slice(Math.max(0, all.length - room));
    const gain = CHORD_GAIN / Math.max(1, notes.length);
    for (const midi of notes) {
      s.engine.playVoice({ time, dur: CHORD_STEPS * STEP_SEC, midi, fromMidi: null, gain, timbre: CHORD_TIMBRE }, 'accent');
      noteHook?.({ role: 'chord', layer: null, kind: null, step: a.step, time, midi, gain, at });
    }
    s.stats.chords++;
  }
}

/** Decide and schedule queued kills and bombs on the 16th grid. Runs inside the tick only. */
function drainAccents(s: Session, now: number, sched: Scheduler): void {
  if (s.queue.length === 0) return;
  if (volume === 0) {
    s.queue.length = 0;
    return;
  }
  const step = sched.stepAtOrAfter(now + KILL_LEAD_SEC);
  // Every queued kill lands on the same step, so voice room is computed once per (start,
  // length) and only recomputed after an accent is actually scheduled.
  const cache = new Map<string, number>();
  const room = (at: number, steps: number): number => {
    const key = `${at}:${steps}`;
    let r = cache.get(key);
    if (r === undefined) {
      r = roomAt(s, sched, at, steps);
      cache.set(key, r);
    }
    return r;
  };
  for (const q of s.queue) {
    let r: GateResult;
    let source: KillSource | null = null;
    if (q.type === 'bomb') {
      r = gateBomb(s.gate, step, room(bombStepFor(s.gate, step), CHORD_STEPS));
    } else {
      source = q.source;
      const spec = KILL_SPECS[q.source];
      const absorbed = step < s.gate.chordEnd;
      r = gateKill(s.gate, {
        seed: s.seed,
        ordinal: s.killOrdinal++,
        step,
        level,
        big: isBigSource(q.source),
        // A head's segment burst lands in one tick; it must not turn into a streak chord that
        // would absorb the head's big chord.
        streaks: q.source !== 'segment',
        durSteps: spec.durSteps,
        noteRoom: absorbed ? 0 : room(step, spec.durSteps),
        chordRoom: absorbed ? 0 : room(chordStepFor(s.gate, step), CHORD_STEPS),
      });
    }
    applyGate(s, sched, r, source, now);
    if (r.action.type !== 'none') cache.clear();
  }
  s.queue.length = 0;
}

function queueAccent(q: QueuedAccent): void {
  const p = playing;
  if (!p || p.scheduler.paused) return;
  if (q.type === 'kill') p.session.stats.seen++;
  // Over the cap the kill keeps its sfx only.
  if (p.session.queue.length < KILL_QUEUE_MAX) p.session.queue.push(q);
}

/** The grid step whose sixteenth contains time t (for the bar a hit's pitch follows). */
function stepContaining(sched: Scheduler, t: number): number {
  const s = sched.stepAtOrAfter(t);
  return sched.timeOf(s) > t ? s - 1 : s;
}

/** Free accent voices over [t, t + len), seconds. */
function roomAtTime(s: Session, sched: Scheduler, t: number, len: number): number {
  return s.engine.accentRoom(t, len, upcomingSpans(s, sched, t + len));
}

/**
 * Decide and schedule queued hit ticks and deflects. Runs inside the tick only, after the kill
 * accents, so a kill note on this tick has already taken its voice. Hits play as accents and
 * only into free room, so they never steal a bed or motif voice.
 */
function drainHits(s: Session, now: number, sched: Scheduler): void {
  if (s.hits.length === 0) return;
  if (volume === 0) {
    s.hits.length = 0;
    return;
  }
  const t = now + KILL_LEAD_SEC;
  const step = stepContaining(sched, t);
  const bar = Math.max(0, Math.floor(step / STEPS_PER_BAR));
  for (const q of hitOrder(s.hits, s.hitGate)) {
    if (q.blocked) {
      const r = gateDeflect(s.hitGate, t, () => roomAtTime(s, sched, t, DEFLECT_DUR_SEC));
      s.hitGate = r.gate;
      if (!r.ok) continue;
      const midi = deflectMidi(bar);
      s.engine.playVoice({ time: t, dur: DEFLECT_DUR_SEC, midi, fromMidi: midi + DEFLECT_DROP, gain: DEFLECT_GAIN, timbre: DEFLECT_TIMBRE }, 'accent');
      noteHook?.({ role: 'deflect', layer: null, kind: null, step, time: t, midi, gain: DEFLECT_GAIN, at: now });
    } else {
      const source = q.source;
      const r = gateHit(s.hitGate, source, t, () => roomAtTime(s, sched, t, HIT_DUR_SEC));
      s.hitGate = r.gate;
      if (!r.ok) continue;
      const midi = hitMidi(source, bar);
      const gain = hitGain(source);
      s.engine.playVoice({ time: t, dur: HIT_DUR_SEC, midi, fromMidi: null, gain, timbre: hitTimbreFor(source) }, 'accent');
      noteHook?.({ role: 'hit', layer: null, kind: enemyOf(source), source, step, time: t, midi, gain, at: now });
    }
  }
  s.hits.length = 0;
}

function queueHit(h: QueuedHit): void {
  const p = playing;
  if (!p || p.scheduler.paused) return;
  const q = p.session.hits;
  if (q.length < HIT_QUEUE_MAX && !hasQueued(q, h)) q.push(h);
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
  return { ...m, gains: { bass: g.bass * k, pad: g.pad * k, kick: g.kick * k, perc: g.perc * k, hat: g.hat * k, arp: g.arp * k } };
}

function onStep(p: Session, step: number, time: number): void {
  // Layer state advances even at volume 0, so turning the volume up finds the right layers.
  p.layers = pruneLayers(p.layers, step);
  const take = takeStingers(p.layers, step);
  p.layers = take.set;
  if (volume === 0) return;
  const barIndex = Math.floor(step / STEPS_PER_BAR);
  const inBar = step % STEPS_PER_BAR;
  const mix = mixFor(level, p.lift);
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
  p.session.queue.length = 0;
  p.session.hits.length = 0;
  pendingKill = null;
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
  voiceTrace = opts.trace;
  pendingKill = null;
  if (opts.volume !== undefined) volume = clampMusicVolume(opts.volume);
  const vis = opts.visibility === undefined ? defaultVisibility() : opts.visibility;
  hidden = vis?.hidden ?? false;
  const offs = [
    b.on('sim:threat', (p) => {
      target = clamp01(p.level);
    }),
    b.on('sim:enemyEnter', (p) => onEnter(p.kind)),
    b.on('sim:enemyExit', (p) => onExit(p.kind)),
    // A scored kill, a Mine or Slime pop and a well going down emit 'fx:kill' then 'sfx'
    // explode, so their source waits for the explode. Snake segments in a head's death burst
    // emit 'fx:kill' alone (kind SnakeBody) and queue at once. The kind decides the source; the
    // colour is read only when the kind is missing. The payload object is reused by the sim:
    // read the fields here.
    b.on('fx:kill', (p) => {
      const source = sourceFor(p.kind, p.colour);
      if (source === 'segment') {
        queueAccent({ type: 'kill', source });
        return;
      }
      pendingKill = source;
    }),
    b.on('sfx', (name) => {
      const source = pendingKill;
      pendingKill = null;
      if (name !== 'explode') return;
      if (source !== null) queueAccent({ type: 'kill', source });
    }),
    // Damage that did not kill. A shield block is a deflect whatever the kind.
    b.on('fx:hit', (p) => {
      if (p.blocked === true) {
        queueHit({ blocked: true });
        return;
      }
      const source = sourceFor(p.kind, undefined);
      if (source !== null) queueHit({ blocked: false, source });
    }),
    b.on('fx:bomb', () => queueAccent({ type: 'bomb' })),
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
      voiceTrace = undefined;
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
  const engine = createMusicEngine(ctx, g.master, musicMasterGain(volume), voiceTrace ? { trace: voiceTrace } : {});
  // A new level starts calm; the next 'sim:threat' sets the target.
  level = 0;
  target = 0;
  gamePaused = false;
  pendingKill = null;
  // Layers start empty: a new or restarted level re-announces its kinds through the sim.
  const session: Session = {
    seed: seed >>> 0,
    engine,
    barIndex: -1,
    bar: null,
    lastTick: null,
    layers: [],
    motifs: new Map(),
    lift: false,
    lastCutoff: null,
    gate: KILL_GATE_INIT,
    killOrdinal: 0,
    queue: [],
    stats: { seen: 0, notes: 0, chords: 0 },
    hitGate: HIT_GATE_INIT,
    hits: [],
  };
  const scheduler: Scheduler = createScheduler({
    clock: { now: () => ctx.currentTime },
    timer,
    onStep: (step, time) => onStep(session, step, time),
    onTick: (now) => onTick(session, now, scheduler),
  });
  playing = { session, engine, scheduler };
  session.lastCutoff = masterCutoff(level);
  engine.setCutoff(session.lastCutoff);
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
  /** High threat lift on (perc, arp octave up, lowpass opened). */
  readonly lift: boolean;
  /** Steps lost to stalls longer than the lookahead this session (0 when it holds). */
  readonly skippedSteps: number;
  /** Motif voices stolen this session. */
  readonly motifSteals: number;
  /** Kills seen (scored kills, pops, wells and burst segments), kill notes and chords played this session. */
  readonly kills: Readonly<KillStats>;
}

/** Read only snapshot for tests and the debug overlay. */
export function musicState(): MusicState {
  const p = playing;
  const steals = p?.engine.steals;
  return {
    playing: p !== null,
    suspended: p?.scheduler.paused ?? false,
    level,
    voices: p?.engine.voiceCount ?? 0,
    motifVoices: p?.engine.motifVoiceCount ?? 0,
    bedSteals: steals?.bed ?? 0,
    nextStep: p?.scheduler.nextStep ?? 0,
    layers: p?.session.layers.map((l) => l.kind) ?? [],
    lift: p?.session.lift ?? false,
    skippedSteps: p?.scheduler.skipped ?? 0,
    motifSteals: steals?.motif ?? 0,
    kills: { ...(p?.session.stats ?? { seen: 0, notes: 0, chords: 0 }) },
  };
}
export { CUT1_KEEP, LAYER_KINDS } from './layers';
