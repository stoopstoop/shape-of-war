# Decisions not covered by SPEC.md

One line per decision: clock time, who raised it, what was decided, why.

| Clock | Raised by | Decision | Why |
|---|---|---|---|
| 0:00 | package | Hosting is GitHub Pages; Capacitor APK only after G4 | No native toolchain in the critical path |
| 0:00 | Ryan | v1 ships as packaged; v2 (docs/09-v2-roadmap.md) restores the cut items including curved surfaces; v1 lands the `surface: 'flat'` hook in W2 | Avoids a LevelDef migration and keeps v1 scope fixed |
| 0:00 | Fable | Kickoff stamped at 2026-10-26T17:16:13Z although runbook sections A to D (repo, package.json, dispatcher, key proof) were not yet done; the connected folder is the package, not the repo. Ryan may reset line 1 of STATUS.md once D is done if setup exceeds 0:30. | Instruction said kickoff is now; the clock must not be silently stretched |
| 0:00 | Ryan | Kickoff reset to the ping claim time 2026-10-27T08:49:39Z; the earlier stamp (2026-10-26T17:16Z) was pre setup | Runbook A to D took 15 hours (key format confusion, heredoc paste, secret in a commit); nothing was built |
| 0:00 | Ryan | Budget framing: $192.49 Console credits expire 2026-10-29, a further $200 expire 2026-11-29; the build should consume the first tranche before it expires | Credits are use it or lose it; favour Opus and parallel runs over thrift |
| 0:03 | Fable | Dispatcher patched (glue, 17 lines): claude 2.1.310 has no --max-turns and no --append-system-prompt-file; now uses --max-budget-usd (MAX_BUDGET_USD, default 25), --bare, --append-system-prompt with CLAUDE.md plus roster, and -- before the brief | 0002-shipwright-scaffold failed in 92 ms: the prepended roster began with --- and claude parsed it as an option |
| 0:03 | Fable | Builders run under --bare: user level hooks, auto-memory and ~/.claude CLAUDE.md are skipped; the repo CLAUDE.md is injected explicitly | The B.3 proof run showed a user hook adding 41k tokens and git chatter to every run |
| 0:15 | Fable | Dispatcher passes --allowedTools with a Bash allowlist (npm, npx, node, tsc, gh api, local git add/commit/status/diff/log, read only shell tools); no git push, merge, checkout or rm; env ALLOWED_TOOLS overrides | 0007 Shipwright exited clean in 54 s having built nothing: acceptEdits refuses every Bash call headless |
| 1:05 | Fable | LevelDef follows docs/02 section 3 naming (levelIndex, hexagon, rectObstacles, destroy, superType, hazards.spawners); the Foundry brief names in docs/05 are superseded; validateLevel returns ValidationResult per docs/02 | docs/02 is the only typed source and docs/01 already uses its names |
| 1:05 | Fable | git credential helper switched to gh (gh auth setup-git); the keychain helper prompted on every push and hung job 0014 for 25 minutes while Ryan was away | Unattended pushes must not depend on a dialog |
