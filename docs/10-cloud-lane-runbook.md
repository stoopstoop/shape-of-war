# Cloud lane runbook: Shape of War builders on cloud session credits

Written 2026-10-31 14:30 Abu Dhabi. Supersedes nothing; it adds a second builder lane beside the Console API lane in SPEC section 7.2. The orchestrator (Fable 5.1 in the Claude Desktop "Shape of War" project) and the review and merge discipline do not change. Only where builders run and what pays for them changes.

## 1. Facts that drive this design (verified 2026-10-31)

Source: support.claude.com article 17152539 "Cloud sessions bonus credit promotion" and code.claude.com docs "Use Claude Code in the cloud" and "Configure cloud environments".

- The $250 is a Claude Code cloud session bonus credit (Max tier). It is spent automatically, before plan limits, by cloud sessions only.
- Expiry: November 4 at 11:59 PM Pacific. US clocks leave daylight time on Sunday November 1, so that is Thursday November 5 at 11:59 am Abu Dhabi. Plan to 10:00 am Thursday to leave margin. Unused balance is lost.
- Covered: cloud sessions started from claude.ai/code, the Desktop app Code tab with Environment set to Remote, the terminal with `claude --cloud`, or the mobile app.
- Not covered: Projects, Routines (scheduled tasks), Remote Control, Chat and Cowork sessions, and any session authenticated with an API key. The Fable orchestrator session runs on Max and never touches the credit. The current dispatcher builders run on the Console API key and can never touch it either.
- Billing is model usage, not VM time. Each session gets its own VM (4 vCPU, 16 GB, 30 GB), Ubuntu 24.04, Node 22 on PATH, Trusted network (npm registry and GitHub reachable). No separate container charge.
- Cloud sessions pre approve file edits and are sandboxed; they run unattended once launched. Subagents work inside them.
- A cloud session clones the GitHub repo at the branch you launch from. It cannot see uncommitted local files. Push first.
- The GitHub proxy restricts push to the session's current working branch and rejects tag pushes and branch deletions. It does not stop a push to `main` if the session is still on `main`. Guardrail in section 6.
- `claude --cloud` requires the CLI to be logged in with the claude.ai Max account (`/login`), not the API key. Each `claude --cloud` call creates an independent session; several can run at once. `/tasks` in the CLI lists them.
- The remaining balance shows in the usage menu on claude.ai (a "Cloud session credits" card).

## 2. Configuration

| Item | Setting |
| --- | --- |
| Orchestrator | Fable 5.1, Claude Desktop Cowork or chat, "Shape of War" project, repo folder connected. Max plan. Unchanged. |
| Builders (feature and fix work) | Cloud sessions, model Opus (latest). Credit pays. |
| Builders (mechanical work: docs, mechanical refactors, lint) | Cloud sessions, model Sonnet. Credit pays. |
| Builders (hardest work, two or three per day at most) | Cloud sessions, model Fable, only when the brief says so. Credit pays and Fable is covered on Max. |
| Local command runner | The existing dispatcher, `shell` jobs only: fetch, diff, test, build, merge, push, tag. No model cost. |
| Console API credits (about $70, valid to 2026-11-29) | Paused until the cloud credit is spent or expired. Never run both lanes on the same wave. |
| Repo | github.com/stoopstoop/shape-of-war, main is the integration branch, feature branches `feat/<slug>`, fix branches `fix/<slug>`. |
| Cloud environment | Default (Trusted network). No env vars, no secrets. Optional: a repo SessionStart hook that runs `npm ci` only in the cloud (section 4, task 0). |
| Briefs | `docs/briefs/<slug>.md`, committed to main and pushed before launch. The launch prompt is one line that points at the brief. |
| Hand offs | `docs/handoffs/<slug>.md` written by the session on its branch, same content as the old `handoff.md`, plus the session URL. |
| Spend target | About $50 to $55 per day, 5 to 15 Opus sessions per day in waves of 3 to 4 parallel sessions. Check the balance after every wave. |

## 3. Why this shape and not the alternatives

- Routines or scheduled tasks from the orchestrator: excluded from the credit by the terms. Rejected.
- Claude Code Projects (the parallel cloud session coordinator): excluded from the credit by the terms. Rejected.
- Spawning a remote subagent from the Cowork session: the terms exclude Cowork sessions and nothing documents that such a subagent bills as a cloud session. Not verified, so not relied on. It may be tested once with a trivial task and a balance check before and after; if the balance moves, it becomes an accepted launch path.
- Desktop app Code tab, Environment Remote: covered, same infrastructure as `claude --cloud`. Accepted as the fallback launch path when the terminal path misbehaves.
- `claude --cloud` from the terminal: covered, scriptable, parallel. Primary path.

## 4. One time setup (Ryan, about 15 minutes)

All of this is in a new terminal window, not the dispatcher window. The dispatcher window exports the Console API key and that must not leak into the cloud lane.

1. Open a new terminal. Run `cd ~/shape-of-war && echo "key:${ANTHROPIC_API_KEY:+set}" && claude --version`. Expect `key:` with nothing after the colon, and a version of 2.1.195 or newer. If it prints `key:set`, run `unset ANTHROPIC_API_KEY` in that window. If the version is older, run `npm install -g @anthropic-ai/claude-code@latest` and check again.
2. Run `gh auth status`. Expect "Logged in to github.com account stoopstoop". If not, run `gh auth login` and follow the browser prompt.
3. Run `claude`. At the prompt type `/status`. Expect the login method to show your claude.ai account on Max, not an API key. If it shows an API key, type `/login` and sign in with the Max account in the browser. Then `/status` again.
4. Still inside `claude`, type `/web-setup`. Expect a confirmation that GitHub access is connected and a Default cloud environment exists. Then type `/exit`.
5. In the browser open claude.ai, open the usage menu, and read the "Cloud session credits" card. Paste the remaining amount and the expiry into the orchestrator session.
6. Task 0, the smoke session, which also calibrates cost per session. Confirm `git status` is clean and `git push origin main` reports up to date. Then run:

   `claude --cloud --model opus "Create and check out a branch named chore/cloud-smoke before touching any file. Run npm ci, npm test, npm run build. Write docs/handoffs/cloud-smoke.md containing the test and build summary, the output of node --version, and this session's URL (run: echo https://claude.ai/code/\${CLAUDE_CODE_REMOTE_SESSION_ID/#cse_/session_}). Commit on chore/cloud-smoke and push that branch. Never push main. Stop when the push succeeds."`

   If `--model` is rejected, rerun without it and set the model to Opus from the session page at claude.ai/code.
7. Paste back to the orchestrator: everything the terminal printed, whether the prompt returned to the shell or stayed attached, the session's final message from claude.ai/code, the output of `git ls-remote --heads origin`, and the new balance from step 5. The balance delta is the per session cost figure for planning.

## 5. Wave procedure (every wave)

1. Orchestrator writes one brief per builder in `docs/briefs/<slug>.md` (format in section 7) and queues one shell job: `git add docs/briefs && git commit -m "briefs: <wave name>" && git push origin main`.
2. Orchestrator posts the launch lines, one per builder, each on its own line, for example:

   `claude --cloud --model opus "Read docs/briefs/forge-boss-brood.md and carry it out exactly. Create the branch it names before any edit."`

3. Ryan pastes each line into the cloud terminal. Each call starts its own session. Ryan pastes the printed session URLs back.
4. Progress: `/tasks` inside `claude`, or claude.ai/code, or the Claude mobile app. Ryan tells the orchestrator when a session reports done, or pastes its last message.
5. Orchestrator queues a shell job per landed branch:

   `git fetch origin && git rev-parse origin/main && git diff main...origin/<branch> --stat && git show origin/<branch>:docs/handoffs/<slug>.md`

   and checks that `origin/main` still equals local `main` (guardrail, section 6).
6. Review against the standing checklist (ownership respected, tests added, no undeclared dependency, no Pixi v7 API, no keyboard or gamepad code, no dashes in docs, nothing outside the design doc and the agreed roadmap).
7. Merge exactly as before, in build plan order, one at a time, through shell jobs in the local worktree: `git checkout <branch> && npm ci && npm test && npm run build`, then `git checkout main && git merge --no-ff <branch> && git push origin main`.
8. Gate checks on the Z Fold 7 are unchanged: install runbook section G, paste back template, no gate passes on an assumed result.
9. After the wave: STATUS and DECISIONS updated, commit queued, balance checked, next wave planned. Split the orchestrator session at every landing wave as usual.

## 6. Guardrails

- Line one of every brief: "Create and check out branch `<type>/<slug>` before any edit. Never push main." The proxy only allows pushing the working branch, so once the session is on its branch it cannot reach main.
- After every landed session the orchestrator confirms `origin/main` did not move except by its own merges. If it moved, stop the wave, report the sha and the session URL to Ryan, and recover with a new branch from the previous main sha (no force push, no reset hard).
- One builder per owned directory per wave, as in the build plan ownership table. Parallel sessions must not overlap directories.
- No session is launched with uncommitted local work on main. `git status` clean and `git push origin main` up to date first.
- Credit hygiene: if a session reports a usage or rate limit error, stop launching, report the exact text to Ryan, and check the balance. Never relaunch in a loop.
- Secrets: none in briefs, none in environment variables. Push protection on GitHub stays on.
- Dashes: no em or en dashes in any brief, hand off, or doc. The existing perl check applies.

## 7. Brief format (docs/briefs/<slug>.md)

```
# <Nickname>: <slug>

Branch: feat/<slug> (create and check out before any edit; never push main)
Model: opus | sonnet | fable
Owned paths: <list>
Do not touch: <list>
Read first: SPEC.md, docs/pixi8-cheatsheet.md, <relevant docs>

## Goal
<one paragraph>

## Acceptance
- <testable items>
- npm test and npm run build pass on the branch

## Rules
TypeScript strict, no any. PixiJS v8 only. No Math.random outside src/core/rng.ts. Touch only, no keyboard, mouse or gamepad handlers. applyNeon(n) is the only neon entry point. No new runtime dependency without declaring it in the hand off. No audio, image or font assets beyond PWA icons. Vitest for every pure module. No em or en dashes in any file you write.

## Hand off
Write docs/handoffs/<slug>.md: what changed, files touched, tests added, test and build output summary, risks, open questions, any dependency you want approved, and the session URL (echo https://claude.ai/code/${CLAUDE_CODE_REMOTE_SESSION_ID/#cse_/session_}). Commit and push the branch. Stop.
```

## 8. Optional task 0b: dispatcher cloud job type (only if step 6 showed the command returns to the shell)

A Sonnet cloud session adds a `cloud` job type to the dispatcher: the job carries `slug`, `model` and `brief`; the dispatcher runs `env -u ANTHROPIC_API_KEY claude --cloud --model <model> "<launch line>"` from `~/shape-of-war`, captures the session URL into `.agents/runs/<id>/result.json`, and a `watch` job polls `git ls-remote --heads origin <branch>` every two minutes until `docs/handoffs/<slug>.md` exists on the branch. Cost: about $1 of credit. Skip it if the command stays attached; the manual paste path costs Ryan under a minute per wave.

## 9. Fallback launch paths

- Desktop app: Code tab, new session, Environment: Remote, project: the GitHub repo, model Opus, paste the same launch line.
- Browser: claude.ai/code, pick stoopstoop/shape-of-war, paste the launch line.
- Both are covered by the credit. Avoid Chat, Cowork, scheduled tasks and Projects for builders.

## 10. Known unknowns (resolve in task 0)

- Whether `claude --cloud` returns to the shell after creating the session or stays attached. Decides section 8.
- Whether `--model` is accepted on the `--cloud` command line. Fallback is `/model opus` on the session page.
- Per session cost on this repo. The old dispatcher cap was $12 per run; cloud sessions have no cap flag, the brief scope is the cap.
- Behaviour of a session still running at expiry. Assumption: it continues on plan limits. Launch the last wave by 06:00 Thursday November 5 Abu Dhabi so nothing straddles the deadline.

## 11. Spend plan

Clock from 2026-10-31 15:00 to 2026-11-05 10:00 Abu Dhabi: about 4 days 19 hours. Target about $50 to $55 per day. Order of work: open P2 bugs from docs/STATUS.md first, then the v3 backlog in the orchestrator's build plan order, bosses and boss music before home screen cosmetics. Console credits resume after the deadline for anything left.
