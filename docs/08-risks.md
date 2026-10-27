# Shape of War: risk register

Derived from SPEC.md section 10, extended. SPEC.md wins on any conflict. Clock times are hours since kickoff, matching `docs/05-build-plan.md`. "Decide by" is the latest clock time at which Fable must choose the mitigation; after it, the risk becomes a cut or a gate failure.

## Bad news first

- Seven risks (R1, R6, R7, R13, R14, R21, R24) can stop all progress at once rather than slow one module. None of them is a code risk. Their decisions are due before kickoff or in W0. R21 (dispatcher down) is the one most likely to happen silently; Fable checks for unclaimed jobs every time it polls.
- The highest likelihood risks are v7 Pixi code (R1) and scope creep (R12). Both are cheap to detect by grep at review and expensive if merged.
- Nothing in the plan can absorb Ryan missing two gates in a row. R14 has no technical mitigation, only a provisional gate path.

## Scales

- Likelihood: H (more likely than not), M (plausible, seen in similar builds), L (unlikely).
- Impact: H (threatens the 30 hour deadline or a never cut item), M (costs 1 to 3 hours or forces a cut), L (under 1 hour).

## Register

| ID | Risk | L | I | Trigger signal | Mitigation | Owner | Decide by |
|---|---|---|---|---|---|---|---|
| R1 | Agent writes PixiJS v7 code (SPEC 10.1) | H | H | `grep -rnE "app\.view\|beginFill\|drawRect\|lineStyle\|BLEND_MODES\|@pixi/" src/` matches; type errors on Graphics or Application | Shipwright writes `docs/pixi8-cheatsheet.md` from installed types in W0; every builder reads it first; grep is a hard gate check at every merge; reject branch on any match | Shipwright (cheatsheet), Glow (main exposure) | 1:00 |
| R2 | Bloom too slow on the main screen (SPEC 10.2) | M | H | `fps_main_bloom` under 60 at G1 stress or G2 | DPR cap 2, bloom resolution 0.5, quality and blur knobs (03 section 6), fallback sprite path built in W1, Bloom / Fallback toggle tested on device; formal switch at G2 | Glow | 16:00 |
| R3 | Fold or unfold breaks the canvas (SPEC 10.3) | M | H | G0 viewport label does not update; U2 to U4 fail | G0 logging, debounced visualViewport resize with no reload (04 section 4), stick cancel on reanchor, Proctor device lines U1 to U4 | Forge (W1), Ledger (W2 onward, owns main.ts) | 8:00 |
| R4 | Thumbs cover the 21:9 arena (SPEC 10.4) | M | M | Ryan reports "can't see enemies under thumbs" at G1 | Floating sticks, HUD at screen edges, arena letterboxed in safe rect; tune stick radius and arena scale at G1; enemy speed scaled by arena size in W3 | Thumbs, Swarm (tuning) | 8:00 |
| R5 | Merge collision between parallel agents (SPEC 10.5) | M | M | `git merge` conflicts; a diff touches a path outside the owner's list | One owner per directory per wave, separate worktrees, contract stubs on main at 1:00, Fable only merges, per merge `git diff --stat` ownership check | Fable | 1:15 |
| R6 | API credit exhaustion on console.claude.ai | M | H | Agent reports a credit or billing error; console balance below expected spend for remaining waves | Ryan checks balance and sets a spend alert before kickoff; Fable reports any credit error immediately and stops dispatching (CLAUDE.md); keep Sonnet for mechanical work; top up before W2 if under half the starting balance | Fable (detect), Ryan (top up) | 0:00, recheck 8:00 |
| R7 | Rate limits (429) with 4 parallel Opus agents | M | H | 429 or overloaded errors in any agent; agents stalling mid brief | Stop dispatching and report on first 429 (CLAUDE.md), no retry loops; stagger W1 launches by 2 minutes; if 429 repeats, run W1 as two pairs (Forge with Foundry, then Thumbs with Glow) and pull cut #1 forward | Fable | 1:30 |
| R8 | GitHub Pages deploy fails or never serves | L | H | `gh run watch` red; Pages URL 404 10 minutes after a green run | Pages via GitHub Actions only (no gh-pages branch); public repo confirmed pre kickoff (SPEC 9.2); fallback Netlify or Cloudflare Pages deploy of `dist` | Shipwright | 1:30 |
| R9 | Service worker serves a stale build | H | M | On screen build id does not match the latest `gh run`; a fixed bug reappears on device | Visible build id; `autoUpdate`, `skipWaiting`, `clientsClaim`, `cleanupOutdatedCaches` (03 section 10); every device check starts with the build id step and the open, close, reopen routine; last resort: Chrome site settings, clear storage for the Pages origin | Shipwright (config), Proctor (check) | 1:00 |
| R10 | PWA install prompt missing in Samsung Internet | M | M | No "Add page to" Home screen option, or the icon opens a normal tab | Default browser is Chrome (SPEC 9.4); manifest has 192 and 512 any plus maskable icons, `id`, relative `start_url` and `scope` (04 section 7); if Samsung Internet fails, Ryan uses Chrome; logged, not a blocker | Shipwright | 1:00 |
| R11 | Thermal throttling in long sessions | M | M | Frame time rises slowly at constant entity count after 10 to 15 minutes (04 section 13) | Render divisor drop to 60 fps on main screen, then bloom resolution down, then fallback path; not chased before G4; P5 checks it once at G4 | Glow | 27:00 |
| R12 | Scope creep: agents add features | H | M | Diff contains files or exports not named in the brief; new UI, modes or effects not in `docs/01-game-design.md` | Briefs list exact tasks and "no features outside the brief"; hand-off "Known gaps" captures ideas; Fable rejects the branch (CLAUDE.md) rather than trimming it | Fable | every merge, latest 23:30 |
| R13 | Ryan unavailable at a gate | M | H | No paste-back within 30 minutes of a gate start | Gate times shared before kickoff (SPEC 9.5); Proctor runs browser emulated checks and the gate is provisional; next wave starts at risk; provisional gates re-run before v1.0.0; two missed gates in a row means stop and wait | Fable, Proctor | each gate start plus 0:30 |
| R14 | Headless `claude -p` bills the Max login instead of the API key | M | H | Console usage for the `shape-of-war` key shows nothing after runbook B.3; Max usage climbs | Runbook B.3 proof run before kickoff; if it fails, `/config` custom API key toggle, then re-prove; no W0 until the key shows usage | Ryan | 0:00 |
| R15 | Touch latency or dropped input in Chrome | L | M | T7 reports lag; sticks jump or stick after release | Pointer Events with `setPointerCapture`, `touch-action: none`, no Pixi federated events on game objects (03 section 12.10), input sampled once per sim step; check Motion smoothness setting before blaming code | Thumbs | 8:00 |
| R16 | Test suite flakiness | M | M | A test passes and fails on reruns of the same commit | Inject RNG, clock and storage in all tests; no real timers; Proctor 5 runs at G3, 10 at G4; a flake is a P1 for its owner, quarantined with `it.skip` only by Fable with a logged bug | Proctor | 23:30 |
| R17 | Package version incompatibility (Vite major versus vite-plugin-pwa 2.x or vitest peer ranges) | M | M | `npm ls` shows invalid or UNMET PEER; build or test fails on fresh install | Shipwright records a compatibility table in the cheatsheet in W0; no `--legacy-peer-deps`; pin the newest Vite major both peers accept | Shipwright | 1:00 |
| R18 | Determinism leak: sim or render calls the level PRNG or `Math.random` | M | H | Same seed gives a different hash or spawn log; grep finds `Math.random` outside `src/core/rng.ts` | Generator purity tests, spawner reproducibility test, grep gate check at G1 and G2; never cut item, P0 when found | Foundry, Swarm | 16:00 |
| R19 | Contract drift from 03-architecture signatures | M | M | An agent changes an exported signature; wiring glue exceeds 20 lines | Contract stubs on main at 1:00; signature changes need Fable approval; additive exports only | Fable | 1:15 |
| R20 | Android back gesture exits the game | M | L | Edge swipe closes the app or navigates away | History guard turns first back into pause (04 section 11); sticks ignore touches within 24 CSS px of side edges | Thumbs | 8:00 |
| R21 | Dispatcher terminal closed or Mac asleep | M | H | Job files sit in `.agents/queue/` unclaimed for over 2 minutes | `caffeinate -dims` in runbook A; dispatcher in its own terminal window, never in a Claude session; Fable reports "dispatcher down" with the restart command; jobs on disk survive a restart | Ryan | 0:00 |
| R22 | Connected folder disconnects mid session | M | M | Fable cannot list the repo; file writes fail | Re-add the folder from the "+" menu; nothing is lost because queue and runs live on disk; Fable re-reads `docs/STATUS.md` | Ryan, Fable | any |
| R23 | `--append-system-prompt-file` missing in the installed Claude Code | L | L | Dispatcher log shows the fallback line at start | Dispatcher prepends the roster file to the brief automatically; no action | Shipwright | 0:00 |
| R24 | 4 parallel Opus runs hit API tier rate limits | M | H | Repeated 429 in two or more `result.json` within one wave | Restart dispatcher with `MAX_PARALLEL=2`; stagger W1 by 10 minutes; raise tier in Console if spend allows | Fable | 1:30 |
| R25 | Fable runs a long command itself and hits the Desktop shell cap (about 180 s) | M | M | A Fable shell call times out; partial git state | Rule: Fable never runs git, npm or claude itself; everything is a dispatcher job; review catches violations | Fable | any |
| R26 | Shell job allowlist blocks a needed command | L | L | `result.json` error "rejected by allowlist" | Fable rewrites the command without the blocked pattern; destructive patterns are never allowed | Fable | any |

## Decision timeline

| Clock | Decisions due |
|---|---|
| 0:00 | R6 credit balance and alert, R14 auth method |
| 1:00 | R1 cheatsheet merged, R9 build id visible, R10 manifest check, R17 compatibility table |
| 1:15 | R5 and R19 contract stubs on main and worktrees created |
| 1:30 | R7 dispatch pattern (parallel or pairs), R8 host fallback |
| 8:00 | R3, R4, R15, R20 at G1; R6 recheck |
| 16:00 | R2 bloom or fallback, R18 determinism at G2 |
| 23:30 | R12 final scope review, R16 flake status at G3 |
| 27:00 | R11 thermal response before G4 |

## Unknowns that change this register

- Starting API credit balance and expected spend per Opus brief (R6). Ask Ryan for the balance before kickoff.
- The org's rate limit tier for claude-opus-5-5 (R7). Check the console limits page before kickoff.
- Ryan's availability windows across the 30 hours (R13).
- Motion smoothness setting on the device (affects R2 and R11 readings).
