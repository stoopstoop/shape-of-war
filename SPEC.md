# Shape of War: master build spec

Working title: Shape of War. Personal-use digital twin of the Geometry Wars 3: Dimensions play loop. Mobile only, Samsung Galaxy Z Fold 7, playable within 30 hours of kickoff. This file is canon. Every other document in the package derives from it. If a document conflicts with this file, this file wins.

Style rules for every document in this package: no em or en dashes (use commas, colons or periods), sentence case headings, terse technical prose, bad news first, knowns and unknowns stated explicitly.

## 1. Non-negotiable requirements

1. Playable on the Z Fold 7 (cover screen 2520 x 1080, 21:9; main screen 2184 x 1968, roughly 10:9) within 30 hours of kickoff. Kickoff is when the first message is sent in the Desktop project chat.
2. Mobile only. Touch controls only. No keyboard or gamepad code paths in v1.
3. Random level generator: every Adventure level is procedurally generated from a seed. Same seed, same level.
4. Neon brightness setting: a user-adjustable slider (0 to 100) controlling how vivid the colours are. Persisted across launches.
5. Original assets only. No Geometry Wars name, logo, sprites, music or sound. Shapes, colours and behaviours are reimplemented from the public description of the game. Repo name and in-game title are "Shape of War".

## 2. Stack decisions (fixed)

| Decision | Choice | Why |
|---|---|---|
| Language | TypeScript, strict | Agents write it reliably; types catch collisions between parallel agents |
| Bundler | Vite 6 | Zero config, fast HMR, static output |
| Renderer | PixiJS v8 (WebGL), pixi-filters for bloom | Neon bloom is the whole look; WebGL additive blending and a bloom pass are the cheapest path to it at 120 Hz |
| Bloom fallback | Pre-rendered glow sprites with additive blend, no post filter | If AdvancedBloomFilter drops below 60 fps on device, switch at the G2 gate; the brightness slider still works via sprite alpha and saturation |
| Audio | Web Audio API, synthesised oscillators and noise, no audio files | No asset pipeline, no licensing, tiny bundle |
| Persistence | localStorage (settings, high scores, unlocked level index) | No backend, no accounts |
| Delivery | PWA over HTTPS, installed via "Add to Home screen", manifest display fullscreen | No Android Studio, Gradle, JDK, keystore or ADB in the critical path |
| Hosting | GitHub Pages from the repo (fallback Cloudflare Pages or Netlify) | gh CLI already in use; HTTPS is required for service worker and fullscreen PWA install |
| Native wrapper | Capacitor 8 APK is a stretch goal only, after G4 | Adds roughly 2 hours of toolchain risk with no gameplay benefit |

Why PWA and not APK: the deliverable is "playable on my device", not "an APK". A fullscreen PWA on Samsung Internet or Chrome gives touch, fullscreen, home screen icon and offline play. APK is additive and can be done after the deadline.

Version pins (Shipwright verifies at kickoff with `npm view <pkg> version` and records the installed set in docs/pixi8-cheatsheet.md): pixi.js ^8 (8.22 at package time), pixi-filters ^6 (6.1.5), typescript ^5, vite-plugin-pwa ^2, vitest latest. Vite: use the newest major that vite-plugin-pwa's peer range accepts (Vite 8 is current; the docs in this package were written against Vite 6 syntax, which is unchanged for our config). Node 22 LTS or later on the Mac.

## 3. Game design scope

### 3.1 Core loop
Twin-stick arena shooter. Left thumb moves the ship, right thumb aims and auto-fires while held. Enemies spawn in waves, destroyed enemies drop geoms (multiplier pickups). Score = base enemy value x multiplier. Bombs clear the arena. Lives are limited per level.

### 3.2 Modes
- Adventure: a sequence of generated levels, each with a seed, an objective and a par score. Completing a level unlocks the next. Infinite sequence; the seed for level n is derived from a run seed plus n.
- Endless: single large arena, escalating waves, no objective, high score table. Equivalent of the Evolved mode.

### 3.3 Level generator (requirement 4)
Deterministic from a 32-bit seed via a seeded PRNG (mulberry32 or xoshiro128). Generated parameters:
- Arena shape: rectangle, rounded rectangle, circle, hexagon, rectangle with 1 to 3 wall obstacles.
- Arena size: scales with level index, bounded so the ship is always visible at both fold aspect ratios.
- Objective: one of score target in time limit, survive N seconds, destroy N enemies.
- Enemy roster: 3 to 6 enemy types enabled from the catalogue, weighted by level index.
- Wave schedule: spawn cadence, batch sizes and ramp curve.
- Hazards: 0 to 3 gravity wells, optional spawner enemies.
- Drone assignment: one drone type from the catalogue.
- Par score and three-star thresholds.
v2 hook: LevelDef carries a reserved field `surface: 'flat'` and src/core/surface.ts holds a `Surface` interface with the flat implementation only. Nothing in v1 consumes it. Why: v2 restores curved arena surfaces (docs/09-v2-roadmap.md) without a LevelDef migration.
Hard rule: generator output is a plain JSON-serialisable LevelDef. Rendering and simulation consume LevelDef and never call the PRNG themselves. Why: a frozen LevelDef makes levels reproducible and lets the generator be unit tested without the game running.

### 3.4 Enemy catalogue (v1)
| Name | Behaviour | Colour family |
|---|---|---|
| Grunt | Seeks the ship at constant speed, pulses in size | Blue |
| Wanderer | Drifts on a random heading, bounces off walls | Purple |
| Weaver | Seeks the ship, dodges perpendicular to incoming bullets | Green |
| Pinwheel | Slow spin, slow drift, large hitbox, low value | Magenta |
| Dart | Spawns in groups of 5 to 8, homing with limited turn rate | Orange |
| Snake | Head seeks the ship, body segments follow with lag, only the head is vulnerable | Cyan |
| Gravity well | Static hazard, pulls ship and bullets, kills on contact, grows when fed enemies, explodes above a mass threshold | White core, red ring |
| Spawner | Slow mover that emits Darts on a timer | Yellow |

### 3.5 Player kit
- Ship: triangle, 3 lives per Adventure level, 3 bombs per level, invulnerability flash on respawn.
- Weapon: 3-way spread, auto-fire at 12 shots per second while the right stick is held.
- Bomb: full-arena clear, no score for cleared enemies, button on screen.
- Drone (one per level, from LevelDef): Attack (orbits and fires), Collect (vacuums geoms), Ram (charges enemies).
- Super (charged by geoms collected, one per level): Homing (next 5 seconds of shots home in), Detonate (drone explodes), Turbo (double fire rate for 5 seconds).

### 3.6 Scoring
Geoms raise the multiplier by 1 each, multiplier resets on death. Enemy base values: Grunt 50, Wanderer 10, Weaver 100, Pinwheel 25, Dart 30, Snake head 200, Spawner 150. Stars at par, 2x par, 4x par.

### 3.7 Cut from v1 (explicit)
3D curved arena surfaces, online leaderboards, achievements, multiple ship types, licensed music, campaign narrative, haptics beyond a single vibrate on death, gamepad and keyboard. Why: none of these affect "playable within 30 hours" and each is a scope risk. Everything cut here except online leaderboards is scheduled for v2 in docs/09-v2-roadmap.md, which starts only after tag v1.0.0.

## 4. Neon brightness setting (requirement 4)
One integer, `neon` in 0 to 100, default 70, persisted in localStorage key `sow.settings.neon`. It drives, via one function `applyNeon(n)`:
- Bloom strength: linear 0.0 to 2.0.
- Bloom threshold: 0.8 at n=0 to 0.2 at n=100.
- Colour saturation of the palette: 0.4 to 1.3 in HSL space, computed once per change.
- Line glow width (outer stroke alpha): 0.0 to 0.9.
- Grid line brightness: 0.1 to 0.6.
Settings screen shows a live preview arena so the user sees the effect while dragging. The slider must work in the bloom fallback path too.

## 5. Device and input rules (Z Fold 7)
- Handle `resize` and `orientationchange`: on fold or unfold the canvas re-measures `visualViewport`, re-fits the arena, and re-anchors the virtual sticks. No reload.
- Design for two aspect ratios: 21:9 (cover, folded) and 10:9 (main, unfolded). Arena is letterboxed inside a safe play rect; HUD anchors to screen edges, not arena edges.
- Device pixel ratio capped at 2 for the render target. Why: the main screen is 2184 x 1968 at DPR about 3; rendering at native DPR with bloom will not hold 60 fps.
- Fixed timestep simulation at 120 Hz (dt = 1/120) with an accumulator; render every animation frame. Clamp frame dt at 50 ms to prevent spiral of death on tab switches.
- Input via Pointer Events only, `touch-action: none` on the canvas, `preventDefault` on all touch events, `user-select: none`. Two floating virtual sticks: the first touch in the left half becomes the move stick origin, the first touch in the right half becomes the aim stick origin. Sticks appear where the thumb lands and have a 120 px max radius at DPR 1. Bomb button bottom centre, pause button top right, super button above bomb.
- Fullscreen: request on first user gesture; manifest `display: fullscreen`, `orientation: landscape`.
- Vibrate once on death (navigator.vibrate(60)), nothing else.
- Target 120 fps on the cover screen, hold 60 fps minimum on the main screen with 400 live entities and 2000 particles.

## 6. Repository layout
```
shape-of-war/
  CLAUDE.md                 builder rules read by every headless Claude Code run
  .claude/agents/*.md       roster files appended to each builder's system prompt
  scripts/dispatcher.mjs    job runner Ryan starts once; executes agent and shell jobs
  .agents/                  queue, running, done, failed, runs (git-ignored)
  docs/                     this package's documents, copied in
  index.html
  vite.config.ts
  public/manifest.webmanifest, icons/
  src/
    main.ts                 boot, resize, loop
    core/                   loop.ts, rng.ts, math.ts, events.ts, settings.ts
    game/                   world.ts (entity store), ship.ts, bullets.ts, enemies/*.ts, drones.ts, supers.ts, scoring.ts, spawner.ts
    levelgen/               generator.ts, leveldef.ts, validate.ts
    render/                 renderer.ts, neon.ts (applyNeon), grid.ts, particles.ts, shapes.ts
    input/                  touch.ts (virtual sticks), buttons.ts
    ui/                     menu.ts, settings.ts, hud.ts, results.ts
    audio/                  synth.ts
  tests/                    vitest: rng, generator, validate, scoring, collision
```
Module ownership is assigned per agent in the build plan so parallel agents never edit the same directory in the same wave.

## 7. Orchestration model

### 7.1 Roles
- Lead orchestrator: Fable 5.1 running inside a Claude Desktop app project named "Shape of War", linked to Ryan's Mac with the repo folder connected. Fable plans, assigns, reviews diffs, runs gates, decides merges and maintains STATUS and DECISIONS. Fable writes no feature code. Fable's spend is on Ryan's Max subscription; everything else is on API credits.
- Builders: headless Claude Code runs on the Mac (`claude -p`), model claude-opus-5-5 for feature work and claude-sonnet-5-5 for mechanical tasks, authenticated with a console.claude.ai API key so spend lands on org API credits. One run per brief. Each run reads the repo `CLAUDE.md` (builder rules) and its roster file in `.claude/agents/`.
- Ryan: starts the dispatcher once, approves gates, runs device checks, pastes results back. Everything Ryan does is a numbered step with the exact command, prompt and expected result.

### 7.2 Command path: the dispatcher
Fable cannot run long processes on the Mac directly; a Desktop shell call is capped at about three minutes and the Mac's git must run natively. So commands travel through files in the connected repo folder, executed by a small dispatcher that Ryan starts once in a terminal.

- `scripts/dispatcher.mjs`: Node script, zero dependencies, started by Ryan with `npm run dispatcher` in the "Shape of War terminal" where `ANTHROPIC_API_KEY` is exported. It watches `.agents/queue/`.
- Fable queues a job by writing `.agents/queue/<seq>-<nickname>-<slug>.json`. Two job types:
  - `agent`: `{ "type": "agent", "nickname": "forge", "slug": "world-store", "model": "claude-opus-5-5", "branch": "feat/forge-world-store", "worktree": "../sow-forge-w1", "brief": "<full brief text>" }`. The dispatcher creates the branch and worktree if missing, then runs `claude -p --model <model> --output-format json --permission-mode acceptEdits --append-system-prompt-file .claude/agents/<nickname>.md "<brief>"` in the worktree with a per-run max turns and a wall clock limit, streaming to `.agents/runs/<id>/log.txt`, writing `.agents/runs/<id>/handoff.md` (the agent's final message) and `.agents/runs/<id>/result.json` (exit code, cost, duration, branch head sha).
  - `shell`: `{ "type": "shell", "nickname": "fable", "slug": "merge-w1", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/forge-world-store && npm test && npm run build" }`. Output to `.agents/runs/<id>/log.txt` and `result.json`. Fable uses this for every git, npm and gh command. An allowlist in the dispatcher rejects `push --force`, `reset --hard`, `rebase`, `rm -rf` outside worktrees, and anything touching `~`.
- Jobs run in parallel up to `MAX_PARALLEL` (default 4). A job file moves from `queue/` to `running/` to `done/` or `failed/`. Fable polls by listing `.agents/runs/` through the connected folder.
- The `.agents/` directory is git-ignored except `.agents/README.md`.

Why this design: Fable keeps full command of the agents with nothing more than file writes, all git runs natively on the Mac, the API key never leaves Ryan's terminal, and the dispatcher survives Fable session splits.

Verify at kickoff (unknowns): that headless `claude -p` honours `ANTHROPIC_API_KEY` over the Max login on this Mac (runbook B.3 proves it with a one line run and a Console usage check), and that `--append-system-prompt-file` exists in the installed Claude Code version (fallback: the dispatcher prepends the roster file to the brief).

### 7.3 Roster and git rules
- Every agent run has a nickname. Fixed roster: Forge (core loop, world, math), Thumbs (touch input and on-screen buttons), Glow (renderer, bloom, neon setting), Swarm (enemies, drones, supers, spawner), Foundry (level generator and validator), Ledger (scoring, settings persistence, UI screens), Shipwright (PWA, manifest, service worker, GitHub Pages deploy), Proctor (QA: tests, device checklist, perf audit), Scribe (docs and hand-offs).
- Git: `main` is protected by convention. Each agent works on `feat/<nickname>-<slug>` in its own worktree. Only Fable queues merges, always `git merge --no-ff` after `npm test && npm run build` on the branch. One builder per directory per wave.
- Session hygiene: Fable splits its Desktop project session at every landing wave. The new session starts with the one line "Resume Shape of War from docs/STATUS.md".

## 8. Waves and gates (30 hour clock)
| Wave | Clock | Parallel agents | Gate |
|---|---|---|---|
| W0 scaffold | 0:00 to 1:00 | Shipwright | G0: blank Pixi canvas deployed to GitHub Pages, opens fullscreen on the Fold, logs viewport size on fold and unfold |
| W1 foundations | 1:00 to 8:00 | Forge, Thumbs, Glow, Foundry (spec and tests only) | G1: ship moves and fires with both thumbs on device at 60 fps or better, neon slider changes bloom live |
| W2 gameplay | 8:00 to 16:00 | Swarm, Foundry (generator), Ledger | G2: one generated Adventure level is playable start to results screen on device; bloom fallback decision taken |
| W3 complete | 16:00 to 24:00 | Swarm (polish), Ledger (menus, Endless, persistence), Glow (particles, audio hooks), Proctor | G3: Adventure progression, Endless, settings, high scores, audio all working on device; offline launch works |
| W4 harden | 24:00 to 28:00 | Proctor, one Opus fixer | G4: device checklist all green, build frozen, tagged v1.0.0 |
| Buffer | 28:00 to 30:00 | none | Capacitor APK only if G4 passed before 27:00 |

Cut order if behind schedule (cut in the order listed, Endless first): Endless mode, Super abilities, Snake enemy, three-star thresholds, audio, Spawner enemy, Drone types beyond Attack. Never cut: touch controls, level generator, neon slider, PWA install.

## 9. Unknowns Ryan must answer before kickoff (defaults in brackets)
1. Does headless `claude -p` on the Mac bill the console.claude.ai API key when `ANTHROPIC_API_KEY` is exported, even though the Mac is also logged into Max? [Runbook B.3 proves it before kickoff; if it does not, builders stop until it does.]
2. Is `gh` authenticated and may the repo be public? GitHub Pages on a free plan needs a public repo. [Public repo "shape-of-war"; original assets make this safe.]
3. Node version on the Mac (`node -v`)? [22 LTS or later.]
4. Which browser on the Fold: Samsung Internet or Chrome? [Chrome, better PWA fullscreen behaviour; Samsung Internet works too.]
5. Will the dispatcher terminal stay open and the Mac awake for 30 hours (disable sleep, keep the lid open or use caffeinate)? [Yes; runbook A covers `caffeinate`.]
6. Will you be reachable at the four gate times to run device checks? Each check takes about 5 minutes. [Yes; if not, Proctor runs browser-emulated checks and the gate is provisional.]
7. Is an APK wanted at all, or is the home screen PWA the finish line? [PWA is the finish line.]

## 10. Known risks (top five)
1. PixiJS v8 API drift: agents trained on v7 will write v7 code. Mitigation: Shipwright pins versions and writes `docs/pixi8-cheatsheet.md` in W0 from the installed package's type definitions; every builder reads it first.
2. Bloom performance on the main screen: mitigated by DPR cap, fallback path, and the G2 decision point.
3. Fold and unfold mid-game: canvas resize bugs. Mitigated by the G0 viewport logging requirement and a Proctor test case.
4. Touch stick ergonomics on a 21:9 cover screen: thumbs cover the arena. Mitigated by floating sticks and HUD edge anchoring; tune at G1.
5. Agent merge collisions: mitigated by one builder per directory per wave and Fable-only merges.
