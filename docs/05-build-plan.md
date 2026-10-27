# Shape of War: 30 hour build plan

Derived from SPEC.md sections 6 to 8, with interfaces from `docs/03-architecture.md` section 1 and device rules from `docs/04-device-and-pwa.md`. SPEC.md wins on any conflict.

## Bad news first

- No slack inside W1 and W2. A G1 or G2 miss of more than 1 hour triggers the next cut at the next checkpoint, not at a later gate.
- W2 has no renderer owner. Glow must ship a shape context for every `Kind` in W1, or Swarm's enemies are invisible at G2.
- W2 and W3 have no Shipwright. A service worker or deploy bug found at G3 goes to the W4 fixer and eats hardening time.
- Every gate needs Ryan on the device (5 to 20 minutes). If Ryan is unreachable the gate is provisional (SPEC 9 item 5) and the next wave starts at risk.
- `docs/03-architecture.md` puts parallel W1 agents' shared types in each other's files (`Kind` in `src/game/world.ts`, `InputState` in `src/input/`, `LevelDef` in `src/levelgen/`). Parallel branches cannot compile against code that does not exist yet, so Fable commits signature stubs on `main` at 1:00 (section "Contract stubs"). Skipping this guarantees W1 merge conflicts.

## Knowns and unknowns

| Known | Unknown at kickoff |
|---|---|
| Stack, waves, gates, roster, directory layout (SPEC 2, 6, 7, 8) | GitHub username, written below as `<gh-user>` |
| Pages URL: `https://<gh-user>.github.io/shape-of-war/` | Chrome or Samsung Internet as the test browser (default Chrome) |
| Deploy runs on push to `main` via GitHub Actions | Real Opus wall time per brief under API rate limits |
| Public interfaces in 03-architecture section 1 | Whether AdvancedBloomFilter holds 60 fps on the main screen (decided at G2) |
| Perf protocol in 04-device-and-pwa section 14 | CSS viewport sizes and DPR on the Fold 7 (logged at G0) |

## Shared rules for every wave

1. Device check prompts here are the build plan copies. If `docs/07-install-runbook.md` section G differs, Fable reconciles before the gate; the runbook wins for Ryan facing steps.
2. The dispatcher creates the branch (from `main`) and the worktree from the agent job file's `branch` and `worktree` fields before launching the agent, so parallel agents never share a working tree. Naming: `feat/<nickname>-<slug>` in `../sow-<nickname>-w<n>`. A fresh worktree has no `node_modules`; builders run `npm ci` there before their first `npm test`.
3. Directory ownership inside a wave is exclusive. A file not in an agent's owned list is read only for that agent.
4. Only Fable edits `package.json`, `package-lock.json`, `CLAUDE.md`, `SPEC.md`, `docs/STATUS.md`, `docs/DECISIONS.md` (Shipwright edits `package.json` in W0 and the buffer only). An agent needing a dependency or a signature change lists it in the hand-off.
5. Changing any signature in 03-architecture section 1 needs Fable approval (03 rule). Additive exports are allowed.
6. `npm test && npm run build` must pass on the branch before the hand-off is printed.
7. Every builder reads `docs/pixi8-cheatsheet.md` before writing code that imports `pixi.js` or `pixi-filters`.
8. No agent adds features outside its brief and `docs/01-game-design.md`. Extra ideas go under "Known gaps".
9. Glue edits by Fable stay under 20 lines (CLAUDE.md).
10. If any agent reports a 429 or credit error, Fable stops dispatching and reports to Ryan (PROJECT-INSTRUCTIONS.md).
11. Fable runs no command itself. Every git, npm, gh and grep command in this plan, including the "Fable verifies" checks, is a `shell` job written to `.agents/queue/` (formats in `.agents/README.md`); Fable reads `.agents/runs/<id>/log.txt` and `result.json`. Glue edits are file writes in the connected main checkout followed by a commit job.
12. Shell jobs on cwd `.` run one at a time. Queue merge jobs one by one and read each `result.json` before queuing the next; a failed merge leaves the main checkout mid merge and needs Fable's decision first.
13. `gh run watch` in a job needs an explicit run id (no terminal to pick one). Always use: `sleep 15 && gh run watch $(gh run list --workflow deploy.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status`.
14. The allowlist rejects `~` anywhere in a shell command, so write `HEAD^` not `HEAD~1`.

### Test directory ownership

| Test dir | W0 | W1 | W2 | W3 | W4 |
|---|---|---|---|---|---|
| tests/core/ | Shipwright (smoke) | Forge | none | none | fixer |
| tests/settings/ | none | Forge | Ledger | Ledger | fixer |
| tests/input/ | none | Thumbs | none | none | fixer |
| tests/render/ | none | Glow | none | Glow | fixer |
| tests/audio/ | none | none | none | Glow | fixer |
| tests/levelgen/ | none | Foundry | Foundry | none | fixer |
| tests/game/ | none | Forge | Swarm | Swarm | fixer |
| tests/scoring/ | none | none | Ledger | Ledger | fixer |
| tests/ui/ | none | none | Ledger | Ledger | fixer |
| tests/qa/ | none | none | none | Proctor | Proctor |

## Clock summary

| Wave | Clock | Fable setup | Build | Merge | Gate | Agents |
|---|---|---|---|---|---|---|
| W0 scaffold | 0:00 to 1:00 | 0:00 to 0:05 | 0:05 to 0:40 | 0:40 to 0:50 | 0:50 to 1:00 | Shipwright |
| W1 foundations | 1:00 to 8:00 | 1:00 to 1:20 | 1:20 to 6:45 | 6:45 to 7:30 | 7:30 to 8:00 | Forge, Thumbs, Glow, Foundry |
| W2 gameplay | 8:00 to 16:00 | 8:00 to 8:15 | 8:15 to 14:45 | 14:45 to 15:30 | 15:30 to 16:00 | Swarm, Foundry, Ledger |
| W3 complete | 16:00 to 24:00 | 16:00 to 16:15 | 16:15 to 22:45 | 22:45 to 23:30 | 23:30 to 24:00 | Swarm, Ledger, Glow, Proctor |
| W4 harden | 24:00 to 28:00 | 24:00 to 24:15 | 24:15 to 27:00 | 27:00 to 27:30 | 27:30 to 28:00 | Proctor, one Opus fixer |
| Buffer | 28:00 to 30:00 | none | none | none | none | none by default |

## Cut order and decision times

SPEC list, cut from the top (SPEC 8). At most one cut per checkpoint unless a trigger fires twice.

| Cut # | Item | Decision clock | Trigger |
|---|---|---|---|
| 1 | Endless mode | 12:00 | W2 midpoint: fewer than 4 enemy types running in Swarm's branch, or G1 slipped past 9:00 |
| 2 | Super abilities | 16:30 | G2 not passed by 16:30 |
| 3 | Snake enemy | 20:00 | W3 midpoint: any W3 agent more than 1 hour behind, or Snake has an open crash bug |
| 4 | Three-star thresholds | 22:00 | Any W3 agent not yet at "tests green" on its branch |
| 5 | Audio | 24:30 | G3 not passed by 24:30, or audio fails at G3 and the fix is more than one line |
| 6 | Spawner enemy | 25:00 | W4 open bug count above 8, or any P0 open |
| 7 | Drone types beyond Attack | 26:00 | Device checklist below 80 percent green |

Never cut: touch controls, level generator, neon slider, PWA install.

Executing a cut: Fable removes the item from remaining briefs, disables it with a glue change on `main` (generator weight 0 or menu entry hidden), logs it in `docs/STATUS.md` under "Cuts taken" and in `docs/DECISIONS.md`, and tells Ryan in one line.

---

## W0 scaffold (0:00 to 1:00)

### Agents and ownership

| Nickname | Model | Branch | Owns (exclusive) | Tests |
|---|---|---|---|---|
| Shipwright | sonnet | feat/shipwright-scaffold | `index.html`, `vite.config.ts`, `tsconfig.json`, `package.json` (extend only), `.gitignore` (extend only), `public/`, `.github/`, `scripts/` except `scripts/dispatcher.mjs`, `src/main.ts`, `.gitkeep` files under `src/` and `tests/`, `docs/pixi8-cheatsheet.md` | tests/core/smoke.test.ts |

Fable queues shell job(s), 0:00 to 0:05. Ryan already created and pushed the repo (runbook section C), and the dispatcher is running (runbook section D). Fable writes the kickoff ISO timestamp on line 1 of `docs/STATUS.md` through the connected folder, then queues:

```json
{ "type": "shell", "nickname": "fable", "slug": "kickoff", "cwd": ".", "cmd": "git add docs/STATUS.md && git commit -m 'chore: kickoff' && git push origin main" }
```

### Brief: Shipwright

Agent job `.agents/queue/<seq>-shipwright-scaffold.json`:

```json
{ "type": "agent", "nickname": "shipwright", "slug": "scaffold", "model": "claude-sonnet-5-5", "branch": "feat/shipwright-scaffold", "worktree": "../sow-shipwright-w0", "brief": "<the text block below>" }
```

```text
Shipwright: scaffold. Branch feat/shipwright-scaffold. Worktree ../sow-shipwright-w0.
Read first: SPEC.md, docs/03-architecture.md sections 10 and 11, docs/04-device-and-pwa.md
sections 3, 6, 7, 8.

Task: scaffold Shape of War and deploy a blank PixiJS v8 canvas to GitHub Pages.
1. Run npm view for pixi.js, pixi-filters, vite, vite-plugin-pwa, vitest, typescript.
   Pin per SPEC section 2: pixi.js ^8, pixi-filters ^6, typescript ^5, vite-plugin-pwa
   ^2, and the newest Vite major that vite-plugin-pwa and vitest both accept as a peer
   (Vite 8 if accepted, else 7, else 6). Record exact versions.
2. package.json already exists with the "dispatcher" script; extend it, do not replace it.
   Scripts exactly as 03 section 11 (which keeps "dispatcher"). Do not touch
   scripts/dispatcher.mjs. Adding .agents/ handling to .gitignore is already done; do not
   remove it, extend .gitignore only. tsconfig: strict, noImplicitAny,
   noUncheckedIndexedAccess, target es2022.
3. vite.config.ts as 03 section 10 (base '/shape-of-war/', manifest: false, workbox precache,
   no runtime caching). Confirm option names against node_modules/vite-plugin-pwa types.
4. public/manifest.webmanifest exactly as 04 section 7. Four original icons (neon cyan
   triangle on black, maskable variants inside the 80 percent safe zone) generated by a
   script in scripts/ from an inline SVG. No external image assets.
5. Inject __BUILD_ID__ (short git sha plus UTC time) via Vite define. Show it in a small
   corner label. Why: a stale service worker cache must be visible on device.
6. index.html and base CSS per 04 section 3: viewport meta, #game fixed inset 0,
   touch-action none, user-select none, overscroll-behavior none, background #000.
7. src/main.ts (temporary, Forge rewrites in W1): PixiJS v8 async Application.init with
   preference 'webgl', resolution Math.min(devicePixelRatio, 2), black stage, one neon
   triangle. On resize, orientationchange and visualViewport resize: re-measure
   visualViewport, app.renderer.resize(cssW, cssH, dpr), and both console.log and draw on
   screen "[sow] viewport <cssW>x<cssH> @ <dpr>". Request fullscreen on first pointerup.
8. Empty dirs with .gitkeep: src/core src/game/enemies src/levelgen src/render src/input
   src/ui src/audio and every tests/ subdir in docs/05-build-plan.md.
9. tests/core/smoke.test.ts so npm test is green.
10. Pages deploys via GitHub Actions, not a gh-pages branch. Do not create a gh-pages
    branch or use the gh-pages npm package.
    .github/workflows/deploy.yml: on push to main, Node 22, npm ci, npm test,
    npm run build, actions/upload-pages-artifact (dist), actions/deploy-pages.
    Enable Pages with source "GitHub Actions":
    gh api -X POST repos/{owner}/shape-of-war/pages -f build_type=workflow
    (a 409 means already enabled; then run
    gh api -X PUT repos/{owner}/shape-of-war/pages -f build_type=workflow).
11. docs/pixi8-cheatsheet.md written from node_modules/pixi.js and pixi-filters type
    definitions, not memory. Cover every item in 03 section 12 plus Container, Sprite,
    GraphicsContext, generateTexture, filterArea. Each entry: correct v8 snippet, the v7
    form to avoid, and the installed version it was checked against. Resolve every
    "verify against node_modules ... at W0" line in 03 and list the answers.
12. Compatibility check, recorded at the top of docs/pixi8-cheatsheet.md in a table
    (package, installed version, peer range, compatible yes/no): pixi.js, pixi-filters,
    vite, vite-plugin-pwa, vitest. Verify with `npm ls pixi.js pixi-filters vite
    vite-plugin-pwa vitest` (no "invalid" or "UNMET PEER") and by reading each package's
    peerDependencies in node_modules. pixi-filters peer must accept the installed pixi.js;
    vite-plugin-pwa and vitest peers must accept the installed Vite major. If any pair is
    incompatible, stop and report in the hand-off; do not force or use --legacy-peer-deps.

Do not write game logic. Do not edit docs/ except docs/pixi8-cheatsheet.md.

Definition of done:
- npm test and npm run build pass. No `any`.
- Workflow present, Pages enabled.
- Every cheatsheet snippet type checks against installed types (paste the tsc result).
Tests to add: tests/core/smoke.test.ts.
End with the hand-off block from your agent definition.
```

### Merge order

Single branch. Merge shell job (`npm ci` because W0 created the lockfile):

```json
{ "type": "shell", "nickname": "fable", "slug": "merge-w0", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/shipwright-scaffold && npm ci && npm test && npm run build && git push origin main && sleep 15 && gh run watch $(gh run list --workflow deploy.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status" }
```

### Gate G0 (0:50 to 1:00)

Fable verifies in the diff:
- `base: '/shape-of-war/'` in vite.config.ts, `manifest: false`, `runtimeCaching: []`.
- `public/manifest.webmanifest` has `display: fullscreen`, `orientation: landscape`, relative `start_url` and `scope`.
- Resolution uses `Math.min(devicePixelRatio, 2)` and `preference: 'webgl'`.
- `grep -rnE "app\.view|beginFill|drawRect|new Application\(\{" src/` returns nothing.
- Cheatsheet names installed versions, has the compatibility table with every row "yes", and answers every W0 verify line from 03.
- `.github/workflows/deploy.yml` uses `actions/deploy-pages`; no `gh-pages` branch exists (`git ls-remote --heads origin gh-pages` returns nothing).
- The merge job's deploy watch ended green (`result.json` exit 0).

Ryan verifies on device:

```text
G0 device check, about 5 minutes.
1. Phone folded (cover screen). Open Chrome, go to https://<gh-user>.github.io/shape-of-war/
   Expect: black screen, a glowing triangle, a viewport label, a build id in a corner.
2. Tap the screen once. Expect: fullscreen.
3. Chrome menu (three dots) > Add to Home screen > Install. Open Shape of War from the home
   screen icon. Expect: fullscreen, no browser bar.
4. Unfold with the app open. Expect: the viewport label changes, no reload.
5. Fold again. Expect: the label changes back.
Paste back:
G0: install=<yes/no> fullscreen=<yes/no> folded=<label> unfolded=<label> build=<build id>
```

### If G0 fails

| Failure | Action | Deadline |
|---|---|---|
| Deploy workflow red | Fable queues `gh run view --log-failed` as a shell job, requeues Shipwright with the log | 1:15 |
| Pages not serving 10 minutes after green run | Fallback host: `npx netlify-cli deploy --dir=dist --prod` (Ryan logs in once; Fable gives steps) | 1:30 |
| No install option in Chrome | Try Samsung Internet. If both fail, W1 starts in a browser tab; Shipwright runs `feat/shipwright-pwa-fix` in parallel owning `vite.config.ts`, `public/`, `index.html` only | 1:30 |
| Label does not change on fold | Goes into Forge's W1 brief as item 1 (Forge owns resize in W1) | n/a |

W1 starts at 1:00 if the canvas renders on device. Install or label fixes run in parallel.

---

## W1 foundations (1:00 to 8:00)

### Agents and ownership

| Nickname | Model | Branch | Owns (exclusive) | Tests |
|---|---|---|---|---|
| Forge | opus | feat/forge-core | `src/core/` (loop, rng, math, events, settings stub), `src/main.ts`, `src/game/world.ts`, `src/game/ship.ts`, `src/game/bullets.ts`, `src/game/collide.ts`, `src/game/arena.ts` | tests/core/, tests/settings/, tests/game/ |
| Thumbs | opus | feat/thumbs-input | `src/input/` | tests/input/ |
| Glow | opus | feat/glow-render | `src/render/` | tests/render/ |
| Foundry | opus | feat/foundry-spec | `src/levelgen/leveldef.ts`, `src/levelgen/validate.ts`, `src/levelgen/fixtures/` | tests/levelgen/ |

Not touched in W1: `src/ui/`, `src/audio/`, `src/game/enemies/`, `src/game/drones.ts`, `supers.ts`, `spawner.ts`, `scoring.ts`.

### Contract stubs (Fable, 1:00 to 1:15)

Fable commits on `main`, before branching, signature only stubs copied from 03-architecture section 1 (types exact, function bodies `throw new Error('stub')`):
- `src/game/world.ts`: `Kind`, `ENTITY_CAP`, `World` (03 section 3), `createWorld`, `spawn`, `kill`, `stepWorld`.
- `src/input/types.ts`: `StickState`, `InputState`, `Insets`, `ButtonRects`.
- `src/levelgen/leveldef.ts`: `LevelDef` with the field list from Foundry's brief below.
- `src/render/neon.ts`: `NeonParams`, `PaletteKey` signatures.
- `src/core/rng.ts`: `Rng` type and signatures.

Each owner replaces its stub bodies. Types may only grow additively without Fable approval. This exceeds the 20 line glue limit; Fable has Scribe draft the stubs from 03 and reviews the diff (a docs to code copy, no logic).

Agent job `.agents/queue/<seq>-scribe-w1-stubs.json`:

```json
{ "type": "agent", "nickname": "scribe", "slug": "w1-stubs", "model": "claude-sonnet-5-5", "branch": "feat/scribe-w1-stubs", "worktree": "../sow-scribe-w1-stubs", "brief": "<the text block below>" }
```

```text
Scribe: W1 contract stubs. Branch feat/scribe-w1-stubs. Worktree ../sow-scribe-w1-stubs.
This brief overrides your roster: you own exactly these files this run:
src/game/world.ts, src/input/types.ts, src/levelgen/leveldef.ts, src/render/neon.ts,
src/core/rng.ts. Copy the signatures listed in docs/05-build-plan.md "Contract stubs"
from docs/03-architecture.md section 1. Types exact, every function body
throw new Error('stub'). No logic, no other files. Run npm ci, then npm run build.
Commit "glue: W1 contract stubs from 03-architecture section 1". End with your hand-off.
```

After Fable reviews the diff, merge shell job. The dispatcher creates the four W1 branches and worktrees from `main` when Fable queues the W1 agent jobs, so this merge must land first:

```json
{ "type": "shell", "nickname": "fable", "slug": "merge-w1-stubs", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/scribe-w1-stubs && npm run build && git push origin main" }
```

### Brief: Forge

Agent job `.agents/queue/<seq>-forge-core.json`:

```json
{ "type": "agent", "nickname": "forge", "slug": "core", "model": "claude-opus-5-5", "branch": "feat/forge-core", "worktree": "../sow-forge-w1", "brief": "<the text block below>" }
```

```text
Forge: core. Branch feat/forge-core. Worktree ../sow-forge-w1.
Read first: docs/pixi8-cheatsheet.md, docs/03-architecture.md sections 1 to 5 and 9,
docs/04-device-and-pwa.md sections 2, 4, 5, 13, SPEC 3.5 and 5.
Own: src/core/ (loop.ts, rng.ts, math.ts, events.ts, settings.ts stub), src/main.ts,
src/game/world.ts, ship.ts, bullets.ts, collide.ts, arena.ts, tests/core/, tests/settings/,
tests/game/. Everything else is read only.

Task (signatures from 03 section 1 are fixed):
1. If G0 showed the viewport label not updating on fold, fix resize first.
2. core/rng.ts: mulberry32, deriveSeed, rngInt, rngPick (weighted). Pure.
3. core/math.ts: clamp, lerp, len, angle, wrapAngle, hslToRgbInt. Pure.
4. core/loop.ts: createLoop per 03 section 2. SIM_DT 1/120, MAX_FRAME_DT 0.05,
   setRenderDivisor(1|2). Inject the clock so tests run without rAF.
5. core/events.ts: bus per 03 section 9, but with no `any` (use a typed handler map).
   Add these keys for sim to fx and audio (additive, needed by Glow in W3):
   'fx:kill' { x, y, colour: PaletteKey }, 'fx:death' { x, y }, 'fx:bomb' { x, y },
   'fx:geom' { x, y }.
6. core/settings.ts: loadSettings and saveSetting per 03 section 8, every access in
   try/catch. Ledger takes ownership in W2.
7. game/world.ts per 03 section 3: SoA, ENTITY_CAP 512, ship id 0, free list, simRng
   seeded from level.seed. No per step allocation.
8. game/collide.ts per 03 section 4: CELL 64, counting sort rebuild, queryCircle.
9. game/arena.ts: confine(x, y, r) analytic for rect, roundRect, circle, hex, rect with
   up to 3 walls, writing into a reused result object.
10. game/ship.ts and bullets.ts per 03 sections 1 and 5: move from input.move, aim from
    input.aim, 3-way spread at 12 shots per second while aim.active, BulletPool cap 512,
    drop shot when full, invulnerability timer on respawn.
11. src/main.ts boot order per 03 section 1. Resize per 04 section 4 (debounced,
    visualViewport, safe area insets, world scale to fit the safe play rect, re-anchor
    input, no reload, log "[sow] viewport ..."). Fullscreen on first pointerup (04 s6).
    Until Thumbs and Glow merge, use local null implementations behind their 03 signatures.
    Use fixture tests/../src/levelgen/fixtures easy level if present, else an inline rect.
12. Debug hooks: window.sowDebug.stress(entities, particles) spawns drifting Grunt dummies
    (particles arg forwarded to an optional hook Glow registers); URL ?stress=400 calls it
    at boot; ?glow=sprite calls renderer.setBloomEnabled(false). The FPS label and
    settings toggles belong to Glow's devpanel (src/render); main.ts only exposes the
    loop's measured frame time to it. Keep the build id label.
13. Render divisor policy per 04 section 13.

Definition of done: npm test and npm run build pass, no `any`, no new dependencies.
Tests to add:
- tests/core/rng.test.ts: same seed identical 10k sequence; different seeds differ;
  rngInt inclusive bounds; rngPick weights respected over 100k draws within 2 percent;
  deriveSeed hard coded expected values.
- tests/core/loop.test.ts: 1 s of 16.67 ms frames gives 120 steps; a 500 ms frame is
  clamped to 6 steps; alpha in [0,1).
- tests/game/collide.test.ts: overlap found, distant not found, cell edge, dead ids skipped.
- tests/game/arena.test.ts: confine per shape keeps a circle inside, wall push out.
- tests/game/world.test.ts: spawn to cap returns -1, kill recycles, ship id 0.
- tests/settings/settings.test.ts: defaults, clamp, round trip, localStorage throwing.
End with the hand-off block, listing the exact Thumbs and Glow calls you expect.
```

### Brief: Thumbs

Agent job `.agents/queue/<seq>-thumbs-input.json`:

```json
{ "type": "agent", "nickname": "thumbs", "slug": "input", "model": "claude-opus-5-5", "branch": "feat/thumbs-input", "worktree": "../sow-thumbs-w1", "brief": "<the text block below>" }
```

```text
Thumbs: input. Branch feat/thumbs-input. Worktree ../sow-thumbs-w1.
Read first: docs/03-architecture.md section 1 (src/input), docs/04-device-and-pwa.md
sections 5, 9, 10, 11, SPEC 5. src/input/types.ts already holds the contract types.
Own: src/input/, tests/input/. Everything else is read only.

Task:
1. attachTouch(canvas) per 03 section 1 and 04 section 9. Pointer Events only,
   setPointerCapture, preventDefault on touch events. First pointer in the left half is
   the move stick origin, first in the right half the aim stick. Floating origin, max
   radius 120 px at DPR 1 (CSS px), dead zone 0.12, output in [-1,1]. Release frees only
   that stick. Touches starting within 24 CSS px of the left or right edge are ignored
   (back gesture, 04 bad news item 1). Third finger ignored unless it hits a button.
2. layoutButtons(cssW, cssH, insets) per 04 section 10: bomb bottom centre, super above
   bomb, pause top right, respecting safe area insets. Buttons are edge triggered.
3. reanchor(): recompute button rects and cancel any stick whose origin is now outside
   the canvas (fold or unfold mid touch).
4. History guard per 04 section 11: first back press emits bus 'game:pause' instead of
   leaving. Import only the bus from src/core/events.ts.
5. Export a pure stickVisuals(state) returning ring and knob circles for Glow to draw.
   Do not import pixi.js.
Pure math in separate functions from DOM wiring so vitest runs it in node.

Definition of done: npm test and npm run build pass, no `any`, no new dependencies,
no keyboard, mouse or gamepad handlers.
Tests to add (tests/input/):
- stick.test.ts: dead zone, radius clamp, DPR independence in CSS px, half assignment,
  release frees only its own stick, edge 24 px ignored, third pointer ignored.
- buttons.test.ts: rects for a 21:9 and a 10:9 CSS viewport with and without insets;
  edge trigger fires once per press.
- reanchor.test.ts: stick cancelled when its origin leaves the canvas.
End with the hand-off block, including exact exports for Forge to wire.
```

### Brief: Glow

Agent job `.agents/queue/<seq>-glow-render.json`:

```json
{ "type": "agent", "nickname": "glow", "slug": "render", "model": "claude-opus-5-5", "branch": "feat/glow-render", "worktree": "../sow-glow-w1", "brief": "<the text block below>" }
```

```text
Glow: render. Branch feat/glow-render. Worktree ../sow-glow-w1.
Read first: docs/pixi8-cheatsheet.md (mandatory), docs/03-architecture.md sections 1, 6,
7, 12, docs/04-device-and-pwa.md section 2, SPEC 2, 3.4, 4.
Own: src/render/, tests/render/. Everything else is read only.

Task (signatures from 03 section 1 are fixed):
1. render/neon.ts per 03 section 7: neonParams pure, applyNeon(n) recomputes palette and
   emits 'neon:changed'. applyNeon is the only code that sets bloom, threshold,
   saturation, glow alpha or grid alpha.
2. render/renderer.ts: createRenderer(host) per 03 section 6 scene graph, init options
   per 03 "Resolution". Both glow paths: bloom (AdvancedBloomFilter on glowLayer,
   resolution 0.5, filterArea updated in resize) and fallback sprites (03 "Fallback glow
   sprite path"). setBloomEnabled switches at runtime. Default bloom.
3. render/shapes.ts: one GraphicsContext per Kind, for EVERY Kind including SnakeBody,
   GravityWell (white core, red ring), Spawner, Geom, Drone, Ship. Swarm cannot touch
   src/render in W2, so nothing may be missing. Unknown kinds draw a magenta circle.
4. render/grid.ts: grid clipped to the arena shape, alpha from gridAlpha, redrawn only on
   resize, arena change or neon change.
5. Entity view pool indexed by entity id per 03 section 6; tint from palette; position
   interpolated with prevX/prevY and alpha.
6. Bullets in a ParticleContainer per 03 section 5 (read world bullet pool).
7. Sticks layer outside bloom drawing stickVisuals output (define a structural type if
   Thumbs has not merged).
8. src/render/devpanel.ts: a small DOM settings panel, opened by ?debug=1 or a two finger
   long press (1 s) on the top left corner, containing:
   a. Neon slider bound to applyNeon (throttled to one call per frame) with saveSetting
      on change. This is the G1 slider.
   b. "Show FPS" toggle: shows an FPS and live entity count label; persisted with
      saveSetting('showFps', ...) (key sow.settings.showFps, 03 section 8). Needed at G1
      to G3.
   c. "Bloom / Fallback" toggle: calls setBloomEnabled; current path shown in the label.
      Needed at G2. Session only in W1; Ledger persists it in W2.
   Export setShowFps(on), getGlowPath(), setGlowPath('bloom' | 'fallback') so Ledger can
   surface the same controls on the real settings screen in W2 without touching
   src/render.

Definition of done: npm test and npm run build pass, no `any`, no new dependencies
(pixi-filters already pinned). grep finds no app.view, beginFill, endFill, drawRect,
drawCircle, lineStyle, BLEND_MODES, @pixi/.
Tests to add (tests/render/):
- neon.test.ts: all five outputs at n = 0, 70, 100; clamp below 0 and above 100;
  monotonic; a known HSL base gives a known hex at saturation 1.0.
- shapes.test.ts: every Kind except None has a shape builder entry (registry test; keep
  pixi out of the test by testing the registry map, not GraphicsContext).
- devpanel.test.ts: showFps toggle persists through saveSetting; glow path toggle calls
  setBloomEnabled with the right value (pure state functions, DOM mocked).
End with the hand-off block, including exact exports for Forge to wire.
```

### Brief: Foundry (spec and tests only)

Agent job `.agents/queue/<seq>-foundry-spec.json`:

```json
{ "type": "agent", "nickname": "foundry", "slug": "spec", "model": "claude-opus-5-5", "branch": "feat/foundry-spec", "worktree": "../sow-foundry-w1", "brief": "<the text block below>" }
```

```text
Foundry: level spec. Branch feat/foundry-spec. Worktree ../sow-foundry-w1.
Read first: docs/03-architecture.md section 1 (src/levelgen), SPEC 3.3 to 3.6.
Own: src/levelgen/leveldef.ts, src/levelgen/validate.ts, src/levelgen/fixtures/,
tests/levelgen/. Do not create generator.ts this wave.

Task:
1. leveldef.ts: complete LevelDef, plain JSON. Fields: version, seed, index,
   mode ('adventure' | 'endless'), arena (rect | roundRect | circle | hex | rectWalls with
   1 to 3 walls), size in arena units (max 2400 x 2400 per 03), objective
   (scoreInTime | survive | destroyN | none), roster (3 to 6 enemy kinds with weights),
   waves (cadence, batch min and max, ramp), hazards (0 to 3 gravity wells), spawners,
   drone ('attack' | 'collect' | 'ram'), superKind ('homing' | 'detonate' | 'turbo'),
   par, stars [par, 2*par, 4*par], retries.
2. validate.ts: validateLevel(def): string[] ([] means valid). Checks every SPEC 3.3
   invariant: roster size, hazard count, arena fits both 21:9 and 10:9 safe rects at the
   chosen scale, hazards inside arena and clear of the ship spawn, walls do not seal the
   arena, stars ordered, JSON round trip deep equal.
3. src/levelgen/fixtures/: three valid LevelDefs (rect easy, hex with wells, rectWalls)
   as exported constants, and three invalid ones. Forge and Swarm use these before the
   generator exists.
4. tests/levelgen/generator.test.ts: the full W2 suite written now against
   generateLevel(seed, index) and generateEndless(seed), wrapped in describe.skip with
   a TODO naming W2. Cases: determinism, 1000 seeds validate, arena size scales with
   index, roster weighting by index, JSON round trip, seeds 0 and 0xFFFFFFFF.

Definition of done: npm test passes (skipped suite allowed), npm run build passes,
no `any`, no new dependencies.
Tests to add: tests/levelgen/validate.test.ts (every invariant has a failing fixture),
tests/levelgen/generator.test.ts (skipped).
End with the hand-off block.
```

### Merge order and why

1. `feat/foundry-spec`: nothing imports it at runtime yet. Lowest risk.
2. `feat/forge-core`: owns `main.ts`, world and loop; everything else wires into it.
3. `feat/thumbs-input`: then Fable swaps the input null stub in `main.ts` for `attachTouch` (glue).
4. `feat/glow-render`: highest v7 regression risk and largest perf impact, so last; a revert is clean. Fable swaps the renderer null stub (glue).

Shell jobs, queued one at a time (rule 12). Glue jobs follow Fable's glue edit in the main checkout:

```json
{ "type": "shell", "nickname": "fable", "slug": "merge-w1-foundry", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/foundry-spec && npm test && npm run build" }
{ "type": "shell", "nickname": "fable", "slug": "merge-w1-forge", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/forge-core && npm test && npm run build" }
{ "type": "shell", "nickname": "fable", "slug": "merge-w1-thumbs", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/thumbs-input && npm test && npm run build" }
{ "type": "shell", "nickname": "fable", "slug": "glue-w1-touch", "cwd": ".", "cmd": "git commit -am 'glue: wire attachTouch' && npm test && npm run build" }
{ "type": "shell", "nickname": "fable", "slug": "merge-w1-glow", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/glow-render && npm test && npm run build" }
{ "type": "shell", "nickname": "fable", "slug": "glue-w1-render", "cwd": ".", "cmd": "git commit -am 'glue: wire createRenderer' && npm test && npm run build" }
{ "type": "shell", "nickname": "fable", "slug": "push-w1", "cwd": ".", "cmd": "git push origin main && sleep 15 && gh run watch $(gh run list --workflow deploy.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status" }
```

### Gate G1 (7:30 to 8:00)

Fable verifies in the diff:
- `grep -rnE "app\.view|beginFill|endFill|drawRect|drawCircle|lineStyle|BLEND_MODES|@pixi/" src/` returns nothing.
- `grep -rnE ":\s*any\b|as any|ts-ignore" src/ tests/` returns nothing.
- `grep -rn "Math.random" src/ | grep -v src/core/rng.ts` returns nothing.
- `grep -rnE "keydown|keyup|mousedown|getGamepads" src/` returns nothing.
- `package.json` dependencies unchanged since G0.
- neon tests assert the SPEC 4 endpoints numerically.
- Each merge touched only its owner's paths: `git diff --stat <merge>^1 <merge>`.

Ryan verifies on device:

```text
G1 device check, about 5 minutes.
1. Open Shape of War from the home screen. Compare the corner build id with <build id>.
   If different: close the app from recents, reopen, wait 5 seconds, close and reopen again.
2. Cover screen: left thumb anywhere on the left half. Expect: a stick appears, ship moves.
3. Right thumb on the right half, hold. Expect: 3-way spread fires toward the thumb.
4. Both thumbs for 10 seconds, then release. Expect: smooth, no stuck stick.
5. In Chrome open https://<gh-user>.github.io/shape-of-war/?debug=1&stress=400
   The dev panel opens. Turn "Show FPS" on. Read the FPS label folded, then unfold and
   read it again. Try "Bloom / Fallback" once to confirm it switches.
6. Drag the debug neon slider 0 to 100. Expect: glow changes while dragging.
7. Settings app > Display > Motion smoothness: note Adaptive or Standard.
Paste back:
G1: move=<ok/fail> fire=<ok/fail> both=<ok/fail> fps_cover=<n> fps_main=<n> slider_live=<ok/fail> motion=<adaptive/standard> notes=<text>
```

Pass: all ok, fps_cover 60 or better (120 target; a stable 60 with motion=standard passes per 04 section 14), fps_main 60 or better.

### If G1 fails

| Failure | Action | Deadline |
|---|---|---|
| fps_main under 60 with bloom | Ryan retests with `&glow=sprite`. If sprite passes, continue; formal decision stays at G2 | 8:15 |
| fps under 60 on both paths | `feat/glow-perf` in parallel with W2 (owns `src/render/` only; nobody else owns it in W2) | 9:00 |
| Sticks wrong or stuck | `feat/thumbs-fix` in parallel with W2 (owns `src/input/`) | 9:00 |
| Ship does not move or fire | `feat/forge-fix` owning `src/game/ship.ts`, `bullets.ts`, `collide.ts`, `arena.ts`; Swarm's W2 brief excludes those 4 files until it merges | 9:00 |
| Still failing at 9:00 | Execute cut #1 (Endless) now and reassess at 12:00 | 9:00 |

---

## W2 gameplay (8:00 to 16:00)

### Agents and ownership

| Nickname | Model | Branch | Owns (exclusive) | Tests |
|---|---|---|---|---|
| Swarm | opus | feat/swarm-gameplay | `src/game/` except `scoring.ts` | tests/game/ |
| Foundry | opus | feat/foundry-generator | `src/levelgen/` | tests/levelgen/ |
| Ledger | opus | feat/ledger-flow | `src/game/scoring.ts`, `src/ui/`, `src/main.ts`, `src/core/settings.ts` | tests/scoring/, tests/ui/, tests/settings/ |

Untouched in W2: `src/render/`, `src/input/`, `src/audio/`, `src/core/` except `settings.ts`.

Fable queues shell job(s), 8:00 to 8:15: fresh Desktop chat in the project, read `docs/STATUS.md`, then queue the tag job below. The dispatcher creates the W2 branches and worktrees from the agent jobs.

```json
{ "type": "shell", "nickname": "fable", "slug": "tag-g1", "cwd": ".", "cmd": "git checkout main && git tag g1 && git push origin g1" }
```

### Brief: Swarm

Agent job `.agents/queue/<seq>-swarm-gameplay.json`:

```json
{ "type": "agent", "nickname": "swarm", "slug": "gameplay", "model": "claude-opus-5-5", "branch": "feat/swarm-gameplay", "worktree": "../sow-swarm-w2", "brief": "<the text block below>" }
```

```text
Swarm: gameplay. Branch feat/swarm-gameplay. Worktree ../sow-swarm-w2.
Read first: docs/STATUS.md, docs/03-architecture.md sections 1, 3, 4, 5, 9,
src/levelgen/leveldef.ts, src/levelgen/fixtures/, SPEC 3.1, 3.4, 3.5, 3.6.
Own: src/game/ except scoring.ts, tests/game/. src/render is NOT yours: Glow drew every
Kind. Report visual problems under known gaps.

Task, in priority order (stop at the deadline, do not reorder):
1. src/game/enemies/*.ts per 03 section 1, one file each, exporting def and step:
   grunt, wanderer, weaver, pinwheel, dart, gravitywell, spawner, snake.
2. Collisions via collide.ts: bullet vs enemy, ship vs enemy, ship vs geom, ship vs well;
   wells bend bullets and ship (direct loop, at most 3). Kill calls awardKill from
   scoring.ts (signature from 03; Ledger implements) and emits 'fx:kill'.
3. spawner.ts: stepSpawner consumes level.waves and roster only. Randomness from
   w.simRng only. Never import mulberry32.
4. Geoms (drift, pickup, multiplier via scoring), bomb (clear, no score, 'fx:bomb'),
   lives 3, respawn invulnerability, 'fx:death', navigator.vibrate?.(60) once per death
   through an injectable function.
5. drones.ts: Attack first. Collect and Ram only after items 1 to 4.
6. supers.ts: triggerSuper signature with a no-op body this wave.
7. Objective tracking per level.objective; emit 'game:over' per 03 section 9.

Definition of done: npm test and npm run build pass, no `any`, no new dependencies,
400 live entities with no per step allocation.
Tests to add (tests/game/): one per enemy (grunt converges, wanderer bounces, weaver
dodges, dart turn rate cap, snake only head vulnerable, well kills, grows, explodes);
collision pairs; spawner reproducibility (same LevelDef gives identical spawn log over
60 s of steps); each objective type completes and fails.
End with the hand-off block.
```

### Brief: Foundry (generator)

Agent job `.agents/queue/<seq>-foundry-generator.json`:

```json
{ "type": "agent", "nickname": "foundry", "slug": "generator", "model": "claude-opus-5-5", "branch": "feat/foundry-generator", "worktree": "../sow-foundry-w2", "brief": "<the text block below>" }
```

```text
Foundry: generator. Branch feat/foundry-generator. Worktree ../sow-foundry-w2.
Read first: src/core/rng.ts, src/levelgen/, tests/levelgen/, SPEC 3.3.
Own: src/levelgen/, tests/levelgen/.

Task:
1. generator.ts: generateLevel(seed, index) per 03 section 1, using
   mulberry32(deriveSeed(seed, index)). Every SPEC 3.3 parameter generated. Arena size
   scales with index, bounded so the ship is visible at both fold aspect ratios.
2. generateEndless(seed): mode 'endless', large arena, full roster ramp, unbounded wave
   ramp, objective 'none'. Additive export, used by Ledger in W3.
3. Output passes validateLevel for 1000 consecutive seeds. On failure retry with a
   deterministic re-derive up to 8 times; record retries in the LevelDef.
4. levelHash(def): short stable hash of canonical JSON for on screen comparison.
5. Remove describe.skip from generator.test.ts and make it pass.
6. v2 hook, no scope expansion (docs/09-v2-roadmap.md section 5): add the reserved field
   `surface: 'flat'` to LevelDef and validateLevel (only 'flat' is valid in v1), and create
   src/core/surface.ts with a `Surface` interface and `flatSurface` implementation. Nothing
   in v1 consumes it beyond one unit test. Budget 30 minutes, do it last.

Definition of done: npm test and npm run build pass, no `any`, no new dependencies,
pure (no Date, no Math.random, no DOM).
Tests to add: un-skipped generator suite; a test that stubs Math.random to throw and
still generates; levelHash hard coded expected values for seeds 1, 42, 0xDEADBEEF at
index 0 and 7.
End with the hand-off block.
```

### Brief: Ledger

Agent job `.agents/queue/<seq>-ledger-flow.json`:

```json
{ "type": "agent", "nickname": "ledger", "slug": "flow", "model": "claude-opus-5-5", "branch": "feat/ledger-flow", "worktree": "../sow-ledger-w2", "brief": "<the text block below>" }
```

```text
Ledger: flow. Branch feat/ledger-flow. Worktree ../sow-ledger-w2.
Read first: docs/pixi8-cheatsheet.md, docs/03-architecture.md sections 1, 8, 9,
src/main.ts, src/core/settings.ts, src/levelgen/fixtures/, SPEC 3.2, 3.6.
Own: src/game/scoring.ts, src/ui/, src/main.ts, src/core/settings.ts, tests/scoring/,
tests/ui/, tests/settings/.

Task:
1. scoring.ts: awardKill(w, kind) and stars(score, par) per 03. Base values from SPEC
   3.6, multiplier +1 per geom, reset on death. Keep score state in a plain object so the
   logic is pure and testable.
2. src/ui/hud.ts: score, multiplier, lives, bombs, objective progress, level hash.
   DOM overlay anchored to screen edges and safe insets, updated from 'hud:score'
   (emitted at most every 100 ms).
3. src/ui/results.ts: score, stars, par, Next, Retry, Menu.
4. src/ui/menu.ts: title "Shape of War", Adventure button. Endless entry hidden until W3.
5. src/main.ts: screen flow menu, level, results via bus events. Level source:
   generateLevel(runSeed, index) if generator.ts exists on main at merge, else a fixture.
   URL params ?seed=<n>&level=<n>. Keep build id label and Forge's debug hooks.
6. Pause: pause button and 'game:pause' freeze the sim; resume and quit. Auto pause on
   visibilitychange hidden.
7. src/ui/settings.ts (first version, needed at G2): reachable from the menu and pause
   screen, with "Show FPS" (calls Glow's setShowFps, persisted in sow.settings.showFps)
   and "Bloom / Fallback" (calls Glow's setGlowPath; persist the choice in a new key
   sow.settings.glowPath, values "bloom" or "fallback", default "bloom", applied at boot).
   Use only Glow's exported functions; do not edit src/render. The neon slider moves here
   in W3.

Definition of done: npm test and npm run build pass, no `any`, no new dependencies.
Tests to add: tests/ui/settings.test.ts (showFps and glowPath round trip, invalid stored
glowPath falls back to "bloom"), tests/scoring/scoring.test.ts (each base value, multiplier growth and reset,
stars at par, 2x, 4x and just below each), tests/ui/flow.test.ts (screen state machine,
pause on hidden), tests/settings/ kept green.
End with the hand-off block.
```

### Merge order and why

1. `feat/foundry-generator`: pure module, no runtime coupling; Ledger's `main.ts` prefers it when present.
2. `feat/swarm-gameplay`: owns the session logic Ledger calls.
3. `feat/ledger-flow`: last, because it rewires `main.ts` around both. Fable swaps any stubs (glue).

Shell jobs, queued one at a time (rule 12):

```json
{ "type": "shell", "nickname": "fable", "slug": "merge-w2-foundry", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/foundry-generator && npm test && npm run build" }
{ "type": "shell", "nickname": "fable", "slug": "merge-w2-swarm", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/swarm-gameplay && npm test && npm run build" }
{ "type": "shell", "nickname": "fable", "slug": "merge-w2-ledger", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/ledger-flow && npm test && npm run build" }
{ "type": "shell", "nickname": "fable", "slug": "glue-w2-session", "cwd": ".", "cmd": "git commit -am 'glue: wire generator and session' && npm test && npm run build" }
{ "type": "shell", "nickname": "fable", "slug": "push-w2", "cwd": ".", "cmd": "git push origin main && sleep 15 && gh run watch $(gh run list --workflow deploy.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status" }
```

### Gate G2 (15:30 to 16:00)

Fable verifies in the diff:
- `grep -rn "Math.random" src/ | grep -v src/core/rng.ts` returns nothing.
- `grep -rn "mulberry32" src/game` returns nothing.
- Generator suite un-skipped and green, 1000 seed test present.
- `git diff g1..main --stat -- src/render src/input` is empty (or only approved fix branches).
- Scoring logic pure; base values match SPEC 3.6 in tests.

Ryan verifies on device:

```text
G2 device check, about 8 minutes. Reopen the app; confirm build id <id>.
1. Tap Adventure. Play level 1 to the results screen (win or lose).
   Expect: several enemy shapes, score rises, multiplier rises on pickups, death vibrates
   once and resets the multiplier.
2. On results note the level hash, tap Retry. Expect: same arena and same hash.
3. In Chrome open https://<gh-user>.github.io/shape-of-war/?seed=42&level=3&debug=1 , note
   the hash, reload, note again.
4. Same URL unfolded. Settings > Show FPS on. Play 30 seconds, note FPS. Settings >
   Bloom / Fallback set to Fallback, play 30 seconds, note FPS. Set it back to Bloom.
5. Fold mid level. Expect: no reload, ship visible, sticks work.
Paste back:
G2: completed=<yes/no> retry_same=<yes/no> hash_a=<h> hash_b=<h> fps_main_bloom=<n> fps_main_sprite=<n> fold_mid=<ok/fail> notes=<text>
```

Bloom decision at G2: `fps_main_bloom` 60 or better keeps bloom. Otherwise Fable tries the 03 section 6 perf knobs in order by URL flag if Glow exposed them; if still under 60, Fable changes the `sow.settings.glowPath` default to "fallback" (one line glue in `src/core/settings.ts`), logs it in `docs/STATUS.md` and `docs/DECISIONS.md`. The neon slider must still visibly work on the chosen path.

### If G2 fails

| Failure | Action | Deadline |
|---|---|---|
| Level not completable | First item of Swarm's W3 brief | 17:00 |
| Hashes differ for one seed | `feat/foundry-fix` in parallel with W3 (owns `src/levelgen/`, unowned in W3). P0, never cut | 17:00 |
| Fold mid level breaks | First item of Ledger's W3 brief (Ledger owns `main.ts` in W3; Forge is not relaunched, one owner per file) | 17:30 |
| G2 not passed by 16:30 | Execute cut #2 (Super abilities) | 16:30 |

---

## W3 complete (16:00 to 24:00)

### Agents and ownership

| Nickname | Model | Branch | Owns (exclusive) | Tests |
|---|---|---|---|---|
| Swarm | opus | feat/swarm-polish | `src/game/` except `scoring.ts` | tests/game/ |
| Ledger | opus | feat/ledger-complete | `src/ui/`, `src/main.ts`, `src/core/settings.ts`, `src/game/scoring.ts` | tests/ui/, tests/scoring/, tests/settings/ |
| Glow | opus | feat/glow-fx | `src/render/`, `src/audio/` | tests/render/, tests/audio/ |
| Proctor | sonnet | feat/proctor-qa | `tests/qa/`, `docs/qa/` | tests/qa/ |

Fable queues shell job(s), 16:00 to 16:15: fresh Desktop chat in the project, read `docs/STATUS.md`, prepend G2 failures to briefs, strike cut items, then queue the tag job below. The dispatcher creates the W3 branches and worktrees from the agent jobs.

```json
{ "type": "shell", "nickname": "fable", "slug": "tag-g2", "cwd": ".", "cmd": "git checkout main && git tag g2 && git push origin g2" }
```

### Brief: Swarm (polish)

Agent job `.agents/queue/<seq>-swarm-polish.json`:

```json
{ "type": "agent", "nickname": "swarm", "slug": "polish", "model": "claude-opus-5-5", "branch": "feat/swarm-polish", "worktree": "../sow-swarm-w3", "brief": "<the text block below>" }
```

```text
Swarm: polish. Branch feat/swarm-polish. Worktree ../sow-swarm-w3.
Read first: docs/STATUS.md (open bugs, cuts), docs/03-architecture.md sections 3 to 5,
SPEC 3.4, 3.5.
Own: src/game/ except scoring.ts, tests/game/.

Task, in order (skip any item that docs/STATUS.md lists as cut):
1. Every open bug in docs/STATUS.md owned by swarm.
2. supers.ts: Homing (5 s homing shots via BulletPool.homing), Detonate (drone explodes),
   Turbo (2x fire rate 5 s). Charged by geoms, one per level, super button triggers.
3. Drones Collect and Ram if not done in W2.
4. Endless: stepSpawner escalates without bound from generateEndless waves; respect
   ENTITY_CAP (spawn returns -1 when full, never throw).
5. Snake: finish or fix.
6. Tuning: enemy speed scales with arena size so the 21:9 cover arena is fair.

Definition of done: npm test and npm run build pass, no `any`, no new dependencies.
Tests to add: each super's effect and duration; Endless spawn rate non decreasing over
300 s; entity cap respected under Endless at 600 s.
End with the hand-off block.
```

### Brief: Ledger (complete)

Agent job `.agents/queue/<seq>-ledger-complete.json`:

```json
{ "type": "agent", "nickname": "ledger", "slug": "complete", "model": "claude-opus-5-5", "branch": "feat/ledger-complete", "worktree": "../sow-ledger-w3", "brief": "<the text block below>" }
```

```text
Ledger: complete. Branch feat/ledger-complete. Worktree ../sow-ledger-w3.
Read first: docs/STATUS.md, docs/03-architecture.md section 8 (key table),
docs/04-device-and-pwa.md sections 6, 12, 14 step 8, src/main.ts, src/ui/, SPEC 3.2, 4.
Own: src/ui/, src/main.ts, src/core/settings.ts, src/game/scoring.ts, tests/ui/,
tests/scoring/, tests/settings/.

Task (skip cut items listed in docs/STATUS.md):
1. Every open bug in docs/STATUS.md owned by ledger, including any fold resize bug.
2. Adventure progression with keys from 03 section 8: sow.progress.runSeed (created once
   from crypto.getRandomValues), sow.progress.unlocked, sow.scores.adventure. Level select
   shows unlocked levels and stars.
3. Endless: menu entry, generateEndless(seed), top 10 in sow.scores.endless.
4. src/ui/settings.ts: neon slider 0 to 100 with live preview arena, applyNeon throttled
   to one call per frame while dragging, saveSetting on change (03 section 7). Volume
   slider. "Play seed" field that starts Adventure with a typed run seed and shows the
   level hash. Remove Glow's debug slider from the ?debug path once this works.
5. Debug menu: tap the version label 5 times in Settings to open it; item
   "Stress: 400 entities, 2000 particles" calls window.sowDebug.stress(400, 2000);
   the Show FPS and Bloom / Fallback toggles from W2 stay on the main settings screen.
6. Audio unlock: call unlockAudio() inside the first pointerup handler in main.ts
   (04 sections 6 and 12). If Glow has not merged, call a local no-op.
7. Results: Endless high score badge; Adventure stars (hide if three-star is cut).
8. sow.schema = 1 written on first launch.

Definition of done: npm test and npm run build pass, no `any`, no new dependencies,
every localStorage access in try/catch with a default.
Tests to add: unlock rules; Endless insert, sort, cap 10; settings round trip;
corrupt JSON in sow.scores.* ignored; runSeed created once.
End with the hand-off block.
```

### Brief: Glow (particles and audio)

Agent job `.agents/queue/<seq>-glow-fx.json`:

```json
{ "type": "agent", "nickname": "glow", "slug": "fx", "model": "claude-opus-5-5", "branch": "feat/glow-fx", "worktree": "../sow-glow-w3", "brief": "<the text block below>" }
```

```text
Glow: fx. Branch feat/glow-fx. Worktree ../sow-glow-w3.
Read first: docs/pixi8-cheatsheet.md, docs/STATUS.md (glow path decided at G2),
docs/03-architecture.md sections 5, 6, 9, docs/04-device-and-pwa.md sections 12, 13.
Own: src/render/, src/audio/, tests/render/, tests/audio/.

Task (skip audio if docs/STATUS.md lists it as cut):
1. render/particles.ts per 03 section 5: 2048 pre-created Particles, never removed,
   parallel Float32Arrays for state. burst(x, y, colour, count). Subscribe to 'fx:kill',
   'fx:death', 'fx:bomb', 'fx:geom'. Grid ripple on bomb and death.
2. Register the particles half of window.sowDebug.stress (hook name agreed in Forge's
   hand-off; check src/main.ts).
3. Particles and glow honour 'neon:changed' on both glow paths.
4. src/audio/synth.ts per 04 section 12 and 03 section 1: unlockAudio, play, setVolume.
   Oscillators and noise only. Subscribe to bus 'sfx' and fx events; no imports from
   src/game or src/ui. Shot sound rate limited.
5. Perf: with stress(400, 2000) hold 60 fps on the main screen on the chosen path.
   Report desktop Chrome numbers with 4x CPU throttle as a proxy only.

Definition of done: npm test and npm run build pass, no `any`, no new dependencies,
no v7 APIs.
Tests to add: particle pool never exceeds 2048 and reuses slots; fx event to burst
mapping; sfx mapping table; shot rate limit; setVolume clamps 0 to 100.
End with the hand-off block.
```

### Brief: Proctor

Agent job `.agents/queue/<seq>-proctor-qa.json`:

```json
{ "type": "agent", "nickname": "proctor", "slug": "qa", "model": "claude-sonnet-5-5", "branch": "feat/proctor-qa", "worktree": "../sow-proctor-w3", "brief": "<the text block below>" }
```

```text
Proctor: QA. Branch feat/proctor-qa. Worktree ../sow-proctor-w3.
Read first: docs/06-test-and-acceptance.md, docs/04-device-and-pwa.md section 14,
docs/STATUS.md.
Own: tests/qa/, docs/qa/. Read everything else; edit nothing else.

Task:
1. tests/qa/: cross module tests needing no browser: generateLevel x validateLevel over
   5000 seeds; LevelDef snapshots for 5 fixed seeds; scoring replay of a recorded
   kill and geom sequence; localStorage key set has no collisions and all use sow. prefix.
2. Run npm test 5 times; report flakes with file and line. Do not fix other agents'
   tests; list them.
3. Not this wave: docs/device-checklist.md is a W4 deliverable.
4. docs/qa/perf-log.md: table per 04 section 14 step 10, columns for build id, screen,
   glow path, fps avg, fps min, longest frame, motion smoothness setting.
5. Ownership audit: every file changed since tag g2 outside its owner's directories.

Definition of done: npm test green 5 consecutive runs; docs/qa/perf-log.md exists.
Tests to add: as item 1.
End with the hand-off block.
```

### Merge order and why

1. `feat/proctor-qa`: tests and docs only, cannot break runtime, and its suite then guards the later merges.
2. `feat/glow-fx`: event driven, imports nothing from game or ui.
3. `feat/swarm-polish`: game logic, covered by Proctor's generator and scoring tests.
4. `feat/ledger-complete`: last, rewires `main.ts` and calls `unlockAudio`.

Shell jobs, queued one at a time (rule 12):

```json
{ "type": "shell", "nickname": "fable", "slug": "merge-w3-proctor", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/proctor-qa && npm test && npm run build" }
{ "type": "shell", "nickname": "fable", "slug": "merge-w3-glow", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/glow-fx && npm test && npm run build" }
{ "type": "shell", "nickname": "fable", "slug": "merge-w3-swarm", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/swarm-polish && npm test && npm run build" }
{ "type": "shell", "nickname": "fable", "slug": "merge-w3-ledger", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/ledger-complete && npm test && npm run build" }
{ "type": "shell", "nickname": "fable", "slug": "glue-w3-audio", "cwd": ".", "cmd": "git commit -am 'glue: wire audio unlock and endless' && npm test && npm run build" }
{ "type": "shell", "nickname": "fable", "slug": "push-w3", "cwd": ".", "cmd": "git push origin main && sleep 15 && gh run watch $(gh run list --workflow deploy.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status" }
```

### Gate G3 (23:30 to 24:00)

Fable verifies in the diff:
- Proctor's ownership audit is empty or every line is explained.
- Every `localStorage` call sits inside try/catch: `grep -rn "localStorage" src/`.
- `grep -rnE "from '\.\./(game|ui)" src/audio src/render` returns nothing.
- Cuts applied match `docs/STATUS.md`.

Ryan verifies on device:

```text
G3 device check, about 10 minutes. Reopen the app online once, close it, reopen;
confirm build id <id>.
1. Adventure: finish level 1, confirm level 2 unlocks. Close from recents, reopen.
   Expect: level 2 still unlocked.
2. Settings: drag neon 0 to 100. Expect: preview changes live. Close and reopen; same value.
3. Settings: type 1234 in Play seed, start, note hash. Back, same seed, start. Same hash.
4. Endless: play until death. Expect: score in the high score table. Close and reopen;
   still there.
5. After the first tap, sounds play on kill, pickup and death.
6. Airplane mode on. Close the app from recents. Open from the home screen icon.
   Expect: menu loads, a level plays. Airplane mode off.
Paste back:
G3: unlock_persist=<ok/fail> neon_live=<ok/fail> neon_persist=<ok/fail> seed_same=<ok/fail> endless_score=<ok/fail> audio=<ok/fail> offline=<ok/fail> notes=<text>
```

### If G3 fails

| Failure | Action | Deadline |
|---|---|---|
| Offline launch fails | W4 fixer for the first hour is Shipwright (owns `vite.config.ts`, `public/`, `index.html`) | 25:00 |
| Persistence fails | Ledger bug to W4 fixer | 25:00 |
| Audio fails | Execute cut #5 (Audio) unless the fix is one line | 24:30 |
| G3 not passed by 24:30 | Execute the next unexecuted cut in order | 24:30 |

---

## W4 harden (24:00 to 28:00)

### Agents and ownership

| Nickname | Model | Branch | Owns (exclusive) |
|---|---|---|---|
| Proctor | sonnet | feat/proctor-harden | `tests/qa/`, `docs/qa/`, `docs/device-checklist.md` |
| Fixer: the roster builder whose module holds the most open P0 and P1 bugs (default Forge; Shipwright if offline failed) | opus (sonnet if Shipwright) | feat/<nickname>-fixes | only the files named in its brief |

Fable queues shell job(s), 24:00 to 24:15: fresh Desktop chat in the project, then the tag job below. The dispatcher creates both branches and worktrees from the agent jobs.

```json
{ "type": "shell", "nickname": "fable", "slug": "tag-g3", "cwd": ".", "cmd": "git checkout main && git tag g3 && git push origin g3" }
```

### Brief: fixer (template)

Agent job `.agents/queue/<seq>-<nickname>-fixes.json` (model `claude-sonnet-5-5` if the fixer is Shipwright):

```json
{ "type": "agent", "nickname": "<nickname>", "slug": "fixes", "model": "claude-opus-5-5", "branch": "feat/<nickname>-fixes", "worktree": "../sow-<nickname>-w4", "brief": "<the text block below>" }
```

```text
<Nickname>: W4 fixes. Branch feat/<nickname>-fixes. Worktree ../sow-<nickname>-w4.
Read first: docs/STATUS.md, docs/qa/bugs.md, docs/pixi8-cheatsheet.md.
Own only these files: <Fable lists them>. Everything else is read only.

Task: fix in this order: <Fable pastes P0 then P1 ids>.
One commit per bug: "fix(<id>): <summary>". No refactors, no features.
Each fix gets a regression test in the owning tests/<area>/ directory.
Stop at 26:45 whatever the state.
Definition of done: npm test and npm run build pass after every commit.
End with the hand-off block listing fixed and unfixed ids.
```

### Brief: Proctor (harden)

Agent job `.agents/queue/<seq>-proctor-harden.json`:

```json
{ "type": "agent", "nickname": "proctor", "slug": "harden", "model": "claude-sonnet-5-5", "branch": "feat/proctor-harden", "worktree": "../sow-proctor-w4", "brief": "<the text block below>" }
```

```text
Proctor: harden. Branch feat/proctor-harden. Worktree ../sow-proctor-w4.
Own: tests/qa/, docs/qa/, docs/device-checklist.md.
Task:
1. Triage Ryan's G3 paste and docs/STATUS.md open bugs into docs/qa/bugs.md: id,
   P0 to P2, repro steps, owning directory, owner nickname. Deliver to Fable by 24:30.
2. Write docs/device-checklist.md from the device acceptance checklist in
   docs/06-test-and-acceptance.md: every line item with its pass criteria, a result
   column (pass, fail, n/a), a notes column, cut items marked n/a from docs/STATUS.md,
   and at the end a single paste-back block Ryan fills in for G4
   (format: G4: <item id>=<pass/fail> ... build=<id>). Deliver to Fable by 25:30.
3. Run npm test 10 times; list flakes.
4. Bundle size from npm run build; flag gzipped JS over 1.5 MB.
Definition of done: bugs.md by 24:30, docs/device-checklist.md by 25:30, 10 consecutive
green runs or flakes listed.
End with the hand-off block.
```

### Merge order and why

1. `feat/proctor-harden`: docs and tests only.
2. `feat/<nickname>-fixes`: each fix is covered by the suite Proctor just stabilised.

Shell jobs, queued one at a time (rule 12):

```json
{ "type": "shell", "nickname": "fable", "slug": "merge-w4-proctor", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/proctor-harden && npm test && npm run build" }
{ "type": "shell", "nickname": "fable", "slug": "merge-w4-fixes", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/<nickname>-fixes && npm test && npm run build" }
{ "type": "shell", "nickname": "fable", "slug": "push-w4", "cwd": ".", "cmd": "git push origin main && sleep 15 && gh run watch $(gh run list --workflow deploy.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status" }
```

### Gate G4 (27:30 to 28:00)

Fable verifies: `npm test` green 3 runs in a row, no P0 open, every fix has a regression test, `docs/STATUS.md` current.

Ryan verifies: the full device checklist in `docs/device-checklist.md` (Proctor's W4 deliverable, from docs/06), about 20 minutes, started at 27:30, plus the 04 section 14 perf protocol if any perf line failed earlier. Paste back the filled G4 block at the end of that file.

On pass:

```json
{ "type": "shell", "nickname": "fable", "slug": "tag-v1", "cwd": ".", "cmd": "git checkout main && git tag -a v1.0.0 -m 'Shape of War v1.0.0' && git push origin v1.0.0" }
```

### If G4 fails

| Failure | Action | Deadline |
|---|---|---|
| A never cut item fails (touch, generator, neon slider, PWA install) | Fixer continues into the buffer on that item only | 29:30 |
| Other items fail | Execute the next cut, tag v1.0.0 with the cut logged | 28:30 |
| Ryan unavailable | Tag `v1.0.0-rc1` as provisional; Ryan runs G4 when reachable | 28:00 |

---

## Buffer (28:00 to 30:00)

No parallel agents. In order:
1. Finish any never cut item still failing at G4.
2. Re-run the failed G4 checklist lines.
3. Capacitor APK only if G4 passed before 27:00 and Ryan wants an APK (SPEC 9 default: no). Then Shipwright runs solo on `feat/shipwright-capacitor` owning `capacitor.config.ts`, `android/`, `package.json`, using `npm run build:cap`. Merge only if the APK installs and plays; the PWA stays the finish line.

Agent job skeleton: nickname `shipwright`, slug `capacitor`, model `claude-sonnet-5-5`, branch `feat/shipwright-capacitor`, worktree `../sow-shipwright-buffer`. Merge shell job (`npm ci` because Capacitor adds dependencies):

```json
{ "type": "shell", "nickname": "fable", "slug": "merge-buffer-capacitor", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/shipwright-capacitor && npm ci && npm test && npm run build" }
```

---

## Session hygiene

- Split the Fable session at every landing wave: once a gate passes and merges are pushed, Fable updates `docs/STATUS.md`, queues the commit job, and tells Ryan to open a new chat in the Shape of War Claude Desktop project (with the repo folder connected, runbook D.7) and paste: "Resume Shape of War from docs/STATUS.md". Boundaries: 1:00, 8:00, 16:00, 24:00, 28:00.
- Every new Fable session gets `PROJECT-INSTRUCTIONS.md` from the project automatically, then reads `docs/STATUS.md`, then `SPEC.md`, then queues a shell job and reads its log. Nothing else is assumed from earlier sessions. The dispatcher and its jobs survive session splits.

```json
{ "type": "shell", "nickname": "fable", "slug": "resume-check", "cwd": ".", "cmd": "git log --oneline -15 && git worktree list && npm test" }
```

- `docs/STATUS.md` holds: kickoff timestamp on line 1, current wave and clock, gate log with Ryan's paste-back verbatim and pass or fail, merged branches, open bugs (id, priority, owner nickname, directory), cuts taken, glow path decision, active worktrees, last job seq used, next session's first action.
- Scribe drafts the STATUS update and hand-off at each boundary on `feat/scribe-w<n>-handoff` (agent job, worktree `../sow-scribe-w<n>-handoff`), owning only `docs/STATUS.md`, `docs/DECISIONS.md` and `docs/handoffs/`. Fable reviews the diff and queues the merge. Scribe never runs while a builder owns a docs path.
- Clean up at each boundary, one shell job per merged branch:

```json
{ "type": "shell", "nickname": "fable", "slug": "cleanup-<nickname>-w<n>", "cwd": ".", "cmd": "git worktree remove ../sow-<nickname>-w<n> && git branch -d feat/<nickname>-<slug>" }
```
