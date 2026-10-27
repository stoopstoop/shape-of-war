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
