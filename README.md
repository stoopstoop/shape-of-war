# Shape of War project package

Everything needed to kick off a Claude Desktop project (orchestrator: Fable 5.1) that builds Shape of War through headless Claude Code builders on console API credits, a personal-use twin-stick neon arena shooter for the Samsung Galaxy Z Fold 7, and installs it on the device as a fullscreen PWA within 30 hours.

## Read in this order
1. `SPEC.md`: canon. Stack, scope, device rules, orchestration model (section 7: Desktop project plus dispatcher), waves, gates, cut order, open questions for Ryan.
2. `docs/07-install-runbook.md`: what Ryan does before kickoff (sections A to D: Mac, API key proof, repo, Desktop project and dispatcher) and at each gate (section G).
3. `PROJECT-INSTRUCTIONS.md`: paste into the Desktop project's Instructions field. This is the orchestrator's rule set.
4. `00-HANDOFF-PROMPT.md`: the first message in the project chat.
5. `CLAUDE.md`: builder rules read by every headless Claude Code run. Lives in the repo root.
6. `.claude/agents/`: roster files appended to each builder's system prompt. `scripts/dispatcher.mjs` and `.agents/README.md`: the command path between Fable and the Mac.
7. `docs/01` to `docs/08`: design, generator, architecture, device and PWA, build plan, tests, runbook, risks.
8. `docs/09-v2-roadmap.md`: the follow-up build that restores the v1 cuts (curved surfaces first). Not read by the v1 orchestrator except for the W2 Foundry hook.
9. `docs/STATUS.md` and `docs/DECISIONS.md`: living files the orchestrator maintains.

## How the package becomes the repo
Copy the whole package into the new `shape-of-war` repo root (runbook section C). `docs/`, `CLAUDE.md`, `SPEC.md`, `.claude/`, `scripts/` and `.agents/` land as-is. `README.md`, `PROJECT-INSTRUCTIONS.md` and `00-HANDOFF-PROMPT.md` can stay; they do no harm.

## Before kickoff, answer SPEC.md section 9
Seven questions with defaults. The defaults are safe; the only hard blocker is question 1 (headless Claude Code billing the API key), proven in runbook B.3.

## Roster nicknames
Forge (core loop, world), Thumbs (touch input), Glow (render, bloom, neon slider), Swarm (enemies, drones, supers), Foundry (level generator), Ledger (scoring, settings, UI screens), Shipwright (PWA, deploy), Proctor (QA), Scribe (docs). Orchestrator: Fable 5.1 in the Claude Desktop project (Max). Builders: Opus 5.5. Mechanical tasks: Sonnet 5.5. Builders run as headless Claude Code on console API credits.
