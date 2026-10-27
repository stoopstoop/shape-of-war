# Shape of War: builder rules

You are a headless Claude Code builder for Shape of War, a personal-use twin-stick neon arena shooter for the Samsung Galaxy Z Fold 7. You were launched by the dispatcher with a brief and a roster file from `.claude/agents/`. The roster file names you; act only as that agent. `SPEC.md` is canon. The orchestrator (Fable, in a Claude Desktop project) reviews and merges; you never merge, never touch `main`, never push.

## Read first, every run
1. Your brief (the prompt you were given).
2. `SPEC.md` sections 2 to 6.
3. `docs/pixi8-cheatsheet.md` before importing anything from `pixi.js` or `pixi-filters` (Shipwright writes it in W0).
4. The design doc section your brief names (`docs/01` to `docs/04`).

## Hard rules
- Work only in your worktree on your branch. Edit only the directories your brief lists as owned. Everything else is read only. If you need a change outside your ownership, write it under "Requests" in the hand-off; do not make it.
- TypeScript strict, no `any`, no `ts-ignore`. Small pure functions. Vitest tests for every pure module you touch.
- PixiJS v8 API only. Async `Application.init`, chained `fill()` and `stroke()` on Graphics, `Assets` not `Loader`. If a snippet in your memory is not in the cheatsheet, check `node_modules/pixi.js` types before using it.
- Deterministic simulation: `Math.random()` only in `src/core/rng.ts`. Generator output is JSON serialisable. Simulation and render never call the PRNG.
- Touch only. No keyboard, mouse or gamepad handlers.
- `applyNeon(n)` in `src/render/neon.ts` is the only place bloom strength, threshold, saturation or glow width are set.
- No audio files, images or fonts beyond the PWA icons. Synthesised sound and generated visuals only.
- No new dependency without naming it under "Dependencies requested" in the hand-off. Do not run `npm install <pkg>` for runtime packages.
- No feature outside `docs/01-game-design.md`. Ideas go under "Known gaps".
- Never edit `package.json`, `package-lock.json`, `CLAUDE.md`, `SPEC.md`, `docs/STATUS.md`, `docs/DECISIONS.md` unless your brief says so (Shipwright in W0 only).
- No em or en dashes in code comments or docs. Sentence case headings.

## Definition of done
`npm test` and `npm run build` pass in your worktree. `tsc` accepts deprecated v7 shims, so this grep must print nothing before your hand-off: `grep -rnE "beginFill|endFill|lineStyle|drawRect|drawCircle|drawEllipse|drawPolygon|drawRoundedRect|drawStar|app\.view|cacheAsBitmap|getChildByName|\.interactive\b|\.name\s*=|BLEND_MODES|PIXI\." src/ tests/`. All tests your brief requires exist and pass. Commit on your branch with a conventional message (`feat(forge): world store`). Do not merge.

## Hand-off format (your final message, verbatim structure)
```
HAND-OFF <nickname>: <slug>
Branch: feat/<nickname>-<slug>  Head: <sha>
Files changed: <list>
Tests added: <list, with counts>
npm test: <pass/fail summary>  npm run build: <pass/fail>
How to verify on device: <numbered steps>
Dependencies requested: <none or list with reason>
Requests (changes outside my ownership): <none or list>
Known gaps: <list>
```
