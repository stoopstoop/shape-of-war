# Shipwright: cloud-dispatch

Create and check out branch chore/cloud-dispatch before any edit. Never push main.

Branch: chore/cloud-dispatch (create and check out before any edit; never push main)
Model: sonnet
Owned paths: scripts/dispatcher.mjs, .agents/README.md, tests/scripts/ (new, if you add tests)
Do not touch: src/, docs/ other than your hand off, package.json dependencies
Read first: scripts/dispatcher.mjs, .agents/README.md, docs/10-cloud-lane-runbook.md section 8 only

## Goal
Add a `cloud` job type and a `watch` job type to the local dispatcher so the orchestrator can launch and track Claude Code cloud sessions from job files, as described in docs/10-cloud-lane-runbook.md section 8. `claude --cloud` returns to the shell immediately after printing "Created cloud session", a View URL and a Resume line (verified 2026-10-31), and `--model` must come before `--cloud` on the command line.

## Acceptance
- `cloud` job: `{ "type": "cloud", "nickname", "slug", "model": "opus" | "sonnet", "brief": "docs/briefs/<slug>.md", "branch": "<type>/<slug>" }`. The dispatcher validates the brief file exists and the branch is not main, then runs from the repo root: `env -u ANTHROPIC_API_KEY claude --model <model> --cloud "Read <brief> and carry it out exactly. Create the branch it names before any edit. Never push main."` and captures stdout; it parses the session URL (the View line, strip the query string) and the Resume line into `.agents/runs/<id>/result.json` as `sessionUrl` and `resume`, exit code as today. If the command stays attached for more than 60 s, kill it and record the URL already printed. The command must inherit the terminal environment minus ANTHROPIC_API_KEY so it bills the logged in Max account.
- `watch` job: `{ "type": "watch", "nickname", "slug", "branch", "handoff": "docs/handoffs/<slug>.md", "timeoutMin": 90 }`: every two minutes run `git ls-remote --heads origin <branch>`; when present, `git fetch origin <branch>` and check `git cat-file -e origin/<branch>:<handoff>`; when found, write result.json with `landed: true`, the branch head sha and `originMain` (sha of origin/main at that moment) and exit 0; on timeout exit 1 with `landed: false`. Watch jobs run in parallel with everything else and do not count against MAX_PARALLEL.
- Both job types documented in .agents/README.md with examples; the allowlist untouched for shell jobs; existing agent and shell jobs unchanged; `npm test` and `npm run build` still pass (add a small vitest for the URL parsing and the job validation if the repo has a tests/scripts pattern, otherwise a node self test invoked by `node scripts/dispatcher.mjs --selftest`).
- No em or en dashes.

## Rules
TypeScript strict where TypeScript, plain ESM in the dispatcher. No new runtime dependency. No secrets in files. No em or en dashes in any file you write.

## Hand off
Write docs/handoffs/shipwright-cloud-dispatch.md (under 40 lines): what changed, how to restart the dispatcher to pick it up, the exact job examples, test output summary, risks, and the session URL (echo https://claude.ai/code/${CLAUDE_CODE_REMOTE_SESSION_ID/#cse_/session_}). Commit and push the branch. Stop.
