# Dispatcher job queue

Command path between Fable (Claude Desktop project, connected repo folder) and the Mac. Canon: SPEC.md section 7.2. Runner: `scripts/dispatcher.mjs`, started once by Ryan with `npm run dispatcher` in the Shape of War terminal (runbook section D).

## Bad news first

- If the dispatcher terminal closes or the Mac sleeps, nothing runs. Jobs wait in `queue/` with no error. A job unclaimed for more than two minutes means the dispatcher is down.
- A dispatcher restart fails every job left in `running/` with `error: "stale: ..."`. Requeue them with a new seq.
- Ctrl C in the dispatcher terminal terminates running jobs. They land in `failed/` with `error: "interrupted: dispatcher stopped"`. The worktree keeps whatever the agent committed.
- The allowlist rejects any command containing `~`, including `HEAD~1`. Use `HEAD^`, `HEAD^^` or an explicit sha.
- `gh run watch` needs an explicit run id when not interactive. Use the form in the merge example below.
- A merge that conflicts leaves the main checkout mid merge. Queue merges one at a time and read each `result.json` before queuing the next.

## Directories

| Path | Meaning |
|---|---|
| `queue/` | Fable writes job files here |
| `running/` | Claimed by the dispatcher, in progress |
| `done/` | Finished with exit code 0 and no error |
| `failed/` | Non zero exit, rejected, timed out, interrupted or stale |
| `runs/<id>/log.txt` | stdout and stderr streamed, plus `[dispatcher]` lines |
| `runs/<id>/handoff.md` | Agent jobs only: the `result` field of claude's JSON output, or the stdout tail if parsing failed |
| `runs/<id>/result.json` | Written last. Its presence means the job is finished |

`<id>` is the job file name without `.json`. Everything in this directory except this file and `.gitignore` is git ignored.

## Job file name

`queue/<seq>-<nickname>-<slug>.json`, for example `0007-forge-world-store.json`. `<seq>` is a zero padded counter Fable keeps increasing for the whole build. Jobs are claimed in file name order. Reusing an id that already has a `result.json` is rejected (moved to `failed/<id>.duplicate-<epoch>.json`); requeue with a new seq. Write the file in one go; files modified in the last second are not claimed yet.

## Job types

### agent

```json
{
  "type": "agent",
  "nickname": "forge",
  "slug": "world-store",
  "model": "claude-opus-5-5",
  "branch": "feat/forge-world-store",
  "worktree": "../sow-forge-w1",
  "brief": "<full brief text>"
}
```

The dispatcher:
1. Creates the branch from `main` if missing (`git branch <branch> main`) and the worktree if missing (`git worktree add <worktree> <branch>`). An existing worktree must already be on `<branch>`.
2. Runs, with cwd = the worktree and the terminal's environment:
   `claude -p --model <model> --output-format json --permission-mode acceptEdits --max-turns <MAX_TURNS> --append-system-prompt-file <repo>/.claude/agents/<nickname>.md "<brief>"`
   If `claude --help` does not list `--append-system-prompt-file`, the roster file content is prepended to the brief instead (printed once at startup).
   The line `(dispatcher run <id>, worktree <absolute path>)` is appended to the brief so `pkill -f "<absolute worktree path>"` finds the run (runbook I.5).
3. Sends SIGTERM to the process group after `WALL_MS`, SIGKILL 10 s later.
4. Writes `handoff.md`, then `result.json`.

Validation: `nickname` and `slug` match `[a-z0-9-]`; `.claude/agents/<nickname>.md` exists; `branch` is not `main`; `worktree` starts with `../sow-` and has no further `..`.

### shell

```json
{ "type": "shell", "nickname": "fable", "slug": "merge-w1-forge", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/forge-core && npm test && npm run build" }
```

Runs `bash -lc "<cmd>"` in `cwd` (relative to the repo root, default `.`), 30 minute wall clock (`SHELL_WALL_MS`). Shell jobs that share a `cwd` run one at a time in file name order; shell jobs on different `cwd` values, and agent jobs, run in parallel.

## result.json

```json
{
  "id": "0007-forge-world-store",
  "type": "agent",
  "nickname": "forge",
  "slug": "world-store",
  "exitCode": 0,
  "startedAt": "2026-10-26T10:00:00.000Z",
  "endedAt": "2026-10-26T11:42:13.000Z",
  "durationMs": 6133000,
  "costUsd": 4.21,
  "branch": "feat/forge-world-store",
  "headSha": "<git rev-parse HEAD in the worktree or cwd>",
  "error": null
}
```

`costUsd` is present only when claude's JSON output reports it. `branch` is null for shell jobs. A job counts as passed only when `exitCode` is 0 and `error` is null.

## Shell allowlist

A shell `cmd` matching any of these is rejected: a failed `result.json` is written and nothing runs.

| Pattern | Blocks |
|---|---|
| `push.*--force` (within one command segment) | force push, including `--force-with-lease` |
| `push ... -f` | short force push |
| `reset --hard` | discarding work |
| `rebase` | history rewrite |
| `rm -rf <path>` unless every path starts with `../sow-` (no further `..`) | deleting outside worktrees |
| `filter-branch` | history rewrite |
| `~` | home directory (also blocks `HEAD~n`) |
| `$HOME` | home directory |
| `sudo` | privilege escalation |
| `curl ... \| ... sh` | piping downloads into a shell |

## How Fable polls

1. After writing a job, list `.agents/runs/` and `.agents/queue/` through the connected folder.
2. A job is finished when `runs/<id>/result.json` exists. Read it, then `handoff.md` (agent) or `log.txt` (shell).
3. While running, `runs/<id>/log.txt` grows; read its tail for progress. Agent jobs with `--output-format json` print little until the end, so an unchanging log is normal for up to `WALL_MS`.
4. If a job is still in `queue/` after two minutes, the dispatcher is down. Tell Ryan to run `npm run dispatcher` in the Shape of War terminal and paste the first three lines.
5. On any 429, credit or auth error in a `result.json` or `log.txt`, stop queuing agent jobs and report the exact error to Ryan.

## Settings (environment, set before `npm run dispatcher`)

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | none, required | The dispatcher refuses to start without it |
| `MAX_PARALLEL` | 4 | Jobs running at once. Use 2 if 429s appear |
| `MAX_BUDGET_USD` | 25 | `--max-budget-usd` per agent run (claude 2.1.x has no `--max-turns`) |
| `WALL_MS` | 5400000 (90 min) | Agent wall clock |
| `SHELL_WALL_MS` | 1800000 (30 min) | Shell wall clock |

## Startup output

```
dispatcher: watching .agents/queue (max parallel 4)
dispatcher: claude <version>
dispatcher: api key sk-ant-...<last 4>
```
Then one timestamped line per state change: `claimed`, `rejected`, `timeout`, `done`, `failed`, `stale`.

## Example job files

`queue/0002-shipwright-scaffold.json` (agent):
```json
{
  "type": "agent",
  "nickname": "shipwright",
  "slug": "scaffold",
  "model": "claude-sonnet-5-5",
  "branch": "feat/shipwright-scaffold",
  "worktree": "../sow-shipwright-w0",
  "brief": "Shipwright: scaffold. Branch feat/shipwright-scaffold. Worktree ../sow-shipwright-w0.\n<rest of the brief from docs/05-build-plan.md>"
}
```

`queue/0003-fable-merge-w0.json` (shell merge):
```json
{ "type": "shell", "nickname": "fable", "slug": "merge-w0", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/shipwright-scaffold && npm ci && npm test && npm run build && git push origin main && sleep 15 && gh run watch $(gh run list --workflow deploy.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status" }
```

`queue/0004-fable-diff-forge.json` (shell diff for review):
```json
{ "type": "shell", "nickname": "fable", "slug": "diff-forge", "cwd": ".", "cmd": "git diff main...feat/forge-core --stat && git diff main...feat/forge-core" }
```
