# Shape of War: ownership audit, W3

Owner: Proctor. Task: every file changed since tag `g2` outside its owner's directories (docs/05 W3, Proctor item 5).

## Bad news first

- Result: 0 files outside ownership on any branch audited. Nothing to explain.
- The audit covers committed work only. Uncommitted edits sitting in other agents' worktrees were not inspected: reading another worktree needs an approval Proctor does not have in a headless run.
- The W3 branches were still moving while this ran (`feat/glow-fx` gained a commit mid run). Tips are recorded below; re-run the commands at merge time.
- When this started the repo had no `g2` tag. It appeared during the run, pointing at 9ece364, which is also the merge base of every W3 branch, so the early results with the SHA as the base are identical to the results with the tag.

## Baseline

| Item | Value |
|---|---|
| Tag `g2` | 9ece364 `glue: wire createGame, stepGame and scoring port; flat surface on inline level` |
| `main` | 9ece364, so nothing has landed on main since `g2` |
| Merge base of `feat/swarm-polish`, `feat/ledger-complete`, `feat/glow-fx`, `feat/proctor-qa` | 9ece364 |
| Build Ryan tested at G0 to G2 | 9ece364 |

## Results

Ownership comes from the docs/05 W3 table (the brief wins over the roster files for a wave), implemented in `tests/qa/ownership.ts`.

| Branch | Agent | Tip when audited | Changed paths | Outside ownership |
|---|---|---|---|---|
| `main` | any | 9ece364 | 0 | 0 |
| `feat/swarm-polish` | Swarm | 1037c40 | 20 (all under `src/game/` or `tests/game/`; `scoring.ts` untouched) | 0 |
| `feat/ledger-complete` | Ledger | df8bcaa | 22 (`src/ui/`, `src/main.ts`, `src/core/settings.ts`, `tests/ui/`, `tests/settings/`) | 0 |
| `feat/glow-fx` | Glow | 4cd8b59 | 18 (`src/render/`, `src/audio/`, `tests/render/`, `tests/audio/`) | 0 |
| `feat/proctor-qa` | Proctor | see hand-off | `tests/qa/`, `docs/qa/` only | 0 |

Shared or sensitive files, checked by hand:

- `src/main.ts` is Ledger's in W3 and only `feat/ledger-complete` touches it.
- `src/core/settings.ts` is Ledger's from W2 and only `feat/ledger-complete` touches it. Swarm and Glow do not touch `src/core/`.
- `src/game/scoring.ts` is Ledger's and no other branch touches it.
- `package.json`, `package-lock.json`, `CLAUDE.md`, `SPEC.md`, `docs/STATUS.md` and `docs/DECISIONS.md` are untouched on every branch.

## Rule scan of the lines each W3 branch adds

Patterns searched in added lines under `src/` and `tests/`: `Math.random`, keyboard, mouse and gamepad listeners, `click` handlers, `any`, `ts-ignore`, the v7 shim list from CLAUDE.md, `localStorage`, and em or en dashes.

| Branch | Hits |
|---|---|
| `feat/swarm-polish` | none |
| `feat/glow-fx` | none |
| `feat/ledger-complete` | Only storage keys: `ENDLESS_SCORES_KEY = 'sow.scores.endless'` and `SCHEMA_KEY = 'sow.schema'` in `src/core/settings.ts`. Both are documented in docs/03 section 8 and registered as reserved in `tests/qa/storageKeys.test.ts`. It adds no new field to `Settings` |

No branch other than Ledger's adds a storage API call.

## Out of scope here

- W0 to W2 history (before `g2`). Glue commits by Fable (`4acca26`, `9ece364`) are orchestrator edits and are exempt from roster ownership.
- Uncommitted work in other worktrees.
- Content of the branches beyond the rule scan above (reviewing their logic is Fable's merge review).

## How to re-run

Needs Node 22.18 or newer (runs TypeScript directly by stripping types). From the repo root:

```
node tests/qa/ownershipAudit.ts g2 feat/swarm-polish swarm
node tests/qa/ownershipAudit.ts g2 feat/ledger-complete ledger
node tests/qa/ownershipAudit.ts g2 feat/glow-fx glow
node tests/qa/ownershipAudit.ts g2 feat/proctor-qa proctor
```

Each prints one line per changed path (`ok` or `OUTSIDE`) and exits 1 if any path is outside the agent's owned set. For a later gate, replace `g2` with the new tag (for example `g3`). To change who owns what, edit `OWNERS` in `tests/qa/ownership.ts`; `tests/qa/ownership.test.ts` checks the matching rules and that every owned directory exists.

Rule scan, same base:

```
git diff g2...feat/glow-fx -U0 -- src tests | grep -E "^\+" | grep -nE "Math\.random|keydown|mousedown|gamepad|'click'|: any|as any|ts-ignore|localStorage"
```

---

# Shape of War: v2 ownership audit (wave E)

Owner: Proctor. Task: every file changed by each v2 wave branch against the owner table of its wave (docs/10 "Agents and ownership", docs/11 SPEC 7.3), plus the shared gate scans of docs/10 "Shared rules" item 7 at main 6f11afb. The v2 tables are `OWNERS_V2` in `tests/qa/ownership.ts`, one per wave A to E; `tests/qa/ownership.test.ts` checks them (who owns `ship.ts`, `scoring.ts`, `src/audio/` and the level pin test in each wave, that no path has two owners, that every nickname has a roster file).

## Bad news first (v2 audit)

- One path outside ownership: `docs/pixi8-cheatsheet.md`, changed by Glow in wave D (`f9e5083`). The Glow wave D brief asked for it itself (task 1: "record in the cheatsheet notes") while its "Own" line lists only `src/render/` and `tests/render/`, so the brief contradicts itself. Fable accepted the addition (DECISIONS 35:30). Recorded as an accepted exception, not a violation.
- The audit covers committed work on merged branches only. Fable's glue commits are exempt from roster ownership (v1 audit rule): `4f61c3b`, `aff933f`, `1c2a3d1`, `d117d8e`, `e6d6b66`, `c82eb1e`, `4113528`. V2-W0 (the Scribe stubs and addendum) is not audited either: its ownership is "the files in the stubs table plus whatever `tsc` flags", which a static table cannot express.
- The two wave E fixer branches (`feat/glow-v2-fixes`, `feat/chorus-v2-fixes`) had no commits when this ran, and their "files named in the brief" lists are not in the repo. Audit them with `--owns=` once Fable has the lists (commands at the end).
- `grep -rn "mulberry32" src/game` as written in the GB and GC gate text matches `src/game/world.ts` lines 3 and 107, the v1 `w.simRng`. The intent is "no new use", and that holds (see the scans). The gate line as written can never print nothing.
- `grep -rn "Math.random" src/ | grep -v src/core/rng.ts` as written prints one line, `src/levelgen/generator.ts:2`, a comment that says "no Math.random". It is not a call.

## Baseline

| Item | Value |
|---|---|
| Tag `v1.1.0` | e231b6d, the last v1 build (G5). 55 commits sit between it and 6f11afb |
| `main` | a6c78e3 (docs only: STATUS and DECISIONS, "GD pass, wave E dispatched"); this branch is based on 6f11afb |
| Build Ryan gated | GA 4f61c3b, GB 1612a53, GC fb25216, GD 6f11afb |

## Results

Each merge was audited with its own parents: base is the merge's first parent, branch is its second (`git diff <merge>^1...<merge>^2`), so the numbers are exactly what that branch brought in.

| Wave | Merge | Branch | Agent | Changed paths | Outside |
|---|---|---|---|---|---|
| A | 15c8e1b | feat/forge-space-physics | Forge | 4 (the four named files) | 0 |
| A | c888882 | feat/ledger-space-setting | Ledger | 7 | 0 |
| A | 5e5045e | feat/chorus-engine | Chorus | 14 (`src/audio/`, `tests/audio/`) | 0 |
| B | 1aed705 | feat/glow-weapon-fx | Glow | 14 | 0 |
| B | 5f3d858 | feat/swarm-weapons | Swarm | 11 | 0 |
| B | 5dd4062 | feat/ledger-weapon-hud | Ledger | 9 | 0 |
| C | d2e534b | feat/foundry-v2-enemies | Foundry | 12 | 0 |
| C | 1fe3a82 | feat/swarm-enemies | Swarm | 23 | 0 |
| C | 43c42a1 | feat/glow-enemy-fx | Glow | 15 | 0 |
| C | 050a6e7 | feat/foundry-gc-triage | Foundry | 1 | 0 |
| D | f9e5083 | feat/glow-lattice | Glow | 21 | 1 (`docs/pixi8-cheatsheet.md`, accepted) |
| D | 29b669e | feat/chorus-layers | Chorus | 9 | 0 |
| D | f466758 | feat/ledger-fx-music | Ledger | 9 | 0 |

Specific checks the brief asked for in docs/10 (Gate GA to GD "Fable verifies"), re-run at 6f11afb:

- `src/game/ship.ts` is touched by exactly two merged branches: Forge in wave A (`15c8e1b`) and Swarm in wave B (`5f3d858`, the one line that dispatches fire). Swarm's wave C branch (`1fe3a82`) does not touch it, as the GC check requires. No Glow, Ledger, Chorus or Foundry branch touches it.
- `git diff v1.1.0 HEAD -- package.json package-lock.json CLAUDE.md SPEC.md` is empty.
- `tests/qa/__snapshots__/`: the only change since v1.1.0 is four added files (`seed42-level13-v2.json`, `seed0xDEADBEEF-level18-v2.json`, `seed0xDEADBEEF-level36-v2.json`, `seed0x4E464F4C-level31-v2.json`); no existing snapshot was modified.
- `git ls-files | grep -E "\.(mp3|ogg|wav|flac|m4a|png|jpg)$"` prints the four PWA icons and nothing else (also `tests/qa/noAssets.test.ts`).

## Rule scan at 6f11afb

| Scan | Result |
|---|---|
| DoD v7 grep over `src/` and `tests/` | prints nothing |
| `Math.random` outside `src/core/rng.ts` | one comment line, `src/levelgen/generator.ts:2`; no call |
| `keydown`, `keyup`, `mousedown`, `getGamepads` in `src/` | nothing |
| `: any`, `as any`, `ts-ignore` in `src/` and `tests/` | nothing |
| Lines added since v1.1.0 under `src/game`, `src/render`, `src/audio` that mention `mulberry32` | nothing (the only use in `src/game` is the v1 `simRng` in `world.ts`) |
| Em or en dashes in any `.ts`, `.md`, `.json`, `.html` or `.mjs` file outside `node_modules`, `dist`, `.git` and `.agents` | 0 lines |
| `click` listeners | still the four in `src/render/devpanel.ts` (QA-009) |

## How to re-run

Needs Node 22.18 or newer. From the repo root, for any merged wave branch, with its merge commit `M`:

```
node tests/qa/ownershipAudit.ts M^1 M^2 <agent> <wave A to E>
node tests/qa/ownershipAudit.ts 15c8e1b^1 15c8e1b^2 forge A
node tests/qa/ownershipAudit.ts f9e5083^1 f9e5083^2 glow D
```

For a fixer branch, whose ownership is "only the files named in the brief", pass that list (a trailing slash means a directory):

```
node tests/qa/ownershipAudit.ts main feat/glow-v2-fixes glow --owns=src/render/,tests/render/
node tests/qa/ownershipAudit.ts main feat/chorus-v2-fixes chorus --owns=src/audio/,tests/audio/
```

Each prints one line per changed path (`ok` or `OUTSIDE`) and exits 1 if any path is outside. Without a fourth argument the v1 table of the section above is used. The flake report for the suite is `node tests/qa/repeatSuite.ts 10` (see `docs/qa/suite-runs.md`).

---

# v3 ownership audit (harden)

Owner: Proctor. Written in the v3 harden run against main 7263f75. The v3 table is `OWNERS_V3` in `tests/qa/ownership.ts`, one entry per wave of docs/12 "Agents and ownership": A, B, C1, C2, D, E, H (harden), G0 and G1 (the tilt). The CLI takes `v3A`, `v3B`, `v3C1`, `v3C2`, `v3D`, `v3E`, `v3H`, `v3G0` or `v3G1` as the fourth argument. `tests/qa/ownership.test.ts` has 16 tests for the table (roles per wave, Forge's three bullet files, Foundry's sweep files, Chorus in B, C and D only, Scribe only in H, nobody but Fable on the plans and the lockfile, no path with two owners, every roster file and owned path exists).

## Bad news first (v3 audit)

1. One real question and one non question. feat/swarm-boss-readability (17bfa9e) changed `src/core/events.ts`, which no v3 wave table gives to Swarm (V3-14 in `docs/qa/bugs.md`). It adds the window and crack events, so the brief may have named it, but Proctor does not have the fixer briefs. feat/swarm-boss-ends-level (115882d) changed `tests/scoring/scoring.boss.test.ts`; that directory is Swarm's in the V3-A table, so it only looks outside when audited by `src/game/,tests/game/` alone.
2. The fix waves (swarm-boss-fixes, glow-boss-fixes, ledger-boss-bar, chorus-tunes, thumbs-ring-clear, swarm-boss-ends-level and the readability wave) have no wave table, because their ownership was "only the files named in the brief". They were audited against the natural directories of the agent. A clean result there means "inside the agent's own area", not "inside the brief".
3. Waves D, E, G0 and G1 are tables only: nothing has merged for them, so there is no result to report.

## Results (v3, run at 7263f75)

Every merge below was audited with `node tests/qa/ownershipAudit.ts M^1 M^2 <agent> <table>`. Result: paths changed, paths outside.

| Wave | Merge | Branch | Agent | Table | Changed | Outside |
|---|---|---|---|---|---|---|
| A | 50a956c | feat/foundry-boss-schedule | Foundry | v3A | 14 | 0 |
| A | 573912b | feat/forge-enemy-bullets | Forge | v3A | 3 | 0 |
| A | 425f257 | feat/swarm-boss-core | Swarm | v3A | 32 | 0 |
| A | f545224 | feat/glow-boss-fx | Glow | v3A | 22 | 0 |
| A | 9b021a4 | feat/ledger-boss-hud | Ledger | v3A | 15 | 0 |
| B | 9b27ab5 | feat/swarm-tier2 | Swarm | v3B | 21 | 0 |
| B | 0528dda | feat/glow-tier2-fx | Glow | v3B | 8 | 0 |
| B | fcf384b | feat/chorus-boss-music | Chorus | v3B | 16 | 0 |
| C1 | 48469d3 | feat/swarm-tier3 | Swarm | v3C1 | 13 | 0 |
| C1 | 2e2aa52 | feat/glow-tier3-fx | Glow | v3C1 | 8 | 0 |
| C1 | 1000da8 | feat/chorus-tier3 | Chorus | v3C1 | 5 | 0 |
| C2 | 5ad97c8 | feat/swarm-prism | Swarm | v3C2 | 6 | 0 |
| C2 | 34cf4fe | feat/glow-prism | Glow | v3C2 | 8 | 0 |
| C2 | 193db9f | feat/chorus-prism | Chorus | v3C2 | 6 | 0 |
| fix | 0797208 | feat/swarm-boss-fixes | Swarm | `src/game/,tests/game/` | 25 | 0 |
| fix | c4df26e | feat/glow-boss-fixes | Glow | `src/render/,tests/render/` | 10 | 0 |
| fix | 328f22f | feat/ledger-boss-bar | Ledger | `src/ui/,src/main.ts,tests/ui/,tests/scoring/` | 8 | 0 |
| fix | 0789f73 | feat/chorus-tunes | Chorus | `src/audio/,tests/audio/` | 20 | 0 |
| fix | e71e9b1 | feat/thumbs-ring-clear | Thumbs | `src/input/,tests/input/` | 11 | 0 |
| fix | 115882d | feat/swarm-boss-ends-level | Swarm | `src/game/,tests/game/` | 9 | 1 (`tests/scoring/scoring.boss.test.ts`, Swarm's in V3-A) |
| readability | 17bfa9e | feat/swarm-boss-readability | Swarm | `src/game/,tests/game/` | 11 | 1 (`src/core/events.ts`, see bad news item 1) |
| readability | 7207b91 | feat/glow-boss-identity | Glow | `src/render/,tests/render/` | 3 | 0 |
| readability | e96762b | feat/chorus-window-cue | Chorus | `src/audio/,tests/audio/` | 8 | 0 |

Not audited here: the glue commits on main (Fable's), and the merges whose branch names were not in the v3 wave tables (feat/chorus-tune-wiring 4b3117f, feat/glow-exposed-cue ebd0a3e, feat/swarm-level-end b0a6ba4 and similar small fixes), because their briefs are not in the repo.

## Rule scan at 7263f75

| Scan | Result |
|---|---|
| DoD v7 grep over `src/` and `tests/` | prints nothing |
| `Math.random` outside `src/core/rng.ts` | one comment line, `src/levelgen/generator.ts:2`; no call |
| `keydown`, `keyup`, `mousedown`, `mouseup`, `mousemove`, `getGamepads`, `gamepadconnected` in `src/` | nothing |
| `: any`, `as any`, `ts-ignore`, `ts-expect-error` in `src/` and `tests/` | nothing (two prose lines contain the word "any") |
| `mulberry32` in `src/game/bosses`, `src/game/enemyBullets.ts`, `src/render`, `src/audio` | nothing |
| Em or en dashes in any `.ts`, `.md`, `.json`, `.html` or `.mjs` file outside `node_modules`, `dist`, `.git` and `.agents` | 0 files |
| `click` listeners | still the four in `src/render/devpanel.ts` (QA-009) |
| Binary assets | only the PWA icons (`tests/qa/noAssets.test.ts`, passing) |
| Storage keys | the 13 keys of v2, no v3 key (`tests/qa/storageKeysV3.test.ts`) |

## How to re-run (v3)

```
node tests/qa/ownershipAudit.ts 425f257^1 425f257^2 swarm v3A
node tests/qa/ownershipAudit.ts 9b27ab5^1 9b27ab5^2 swarm v3B
node tests/qa/ownershipAudit.ts main feat/proctor-v3-harden proctor v3H
```
