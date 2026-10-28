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
| 1:35 | Fable | W2 dispatched with G0 and G1 provisional (Ryan away, SPEC 9.6 path); both device checks run on his return before anything is called passed | Credits expire 29/10 and all W1 branches were green in 18 minutes; waiting would waste the window |
| 2:55 | Ryan | G0 and G2 pass, G1 passes except the neon slider (B1); bloom path kept at G2 (60 fps on both screens, motion Standard) | Device paste on build 9ece364 |
| 2:55 | Fable | W3 dispatched 13 hours ahead of plan with no cuts; visual quality added as a G3 criterion; Supers restored to Swarm polish | Ryan's note on graphics, and the clock allows it |
| 3:05 | Ryan | Dev panel slider does change brightness; B1 reclassified to missing Settings screen slider (Ledger W3). New B4: pixelation on device | Ryan's follow-up paste |
| 3:05 | Fable | Weapon upgrades and new enemy types requested by Ryan are deferred to v2 (SPEC 3.7, docs/01 scope rule); v1 ships first, v2 starts right after tag v1.0.0 on the remaining credits | Scope control; the clock and credits allow v2 to begin the same day |
| 5:50 | Fable | Glow: quality run went stale when the dispatcher died (Claude Code auto updated 2.1.310 to 2.1.311 mid run); its commit a16a8bc covered all four tasks, so it was merged on green tests rather than rerun | No hand-off, but the diff and 633 passing tests stand in for it |
| 6:35 | Ryan | G3 pass on build 5bef4ae, all items yes, 60 fps both screens; stick rings to be removed; super ring out of the arena and labelled; dynamic music to v2 | Device paste |
| 21:45 | Ryan | G4: 55 of 57 pass on fec4b4f; U4 (fullscreen lost after fold) fixed by glue 0c1f98e; stars bug traced by Foundry to scoreInTime ending at 0.8 x par; P1 (120 fps target) accepted at 60 with motion Adaptive | Device paste plus Foundry analysis |
| 21:50 | Fable | scoreInTime levels run the full timer; target is the win line, stars from the final score (option a). docs/01 section 8 updated; par formula unchanged | Keeps par and the generator goldens stable; matches the genre's score attack convention |
| 23:05 | Ryan | G4 retests pass on 4fbdaf7 (super ring steady, super fires); v1.0.0 tagged | All never cut items pass on device; v2 needs a rollback point |
| 23:05 | Ryan | New: B9 stick feel regression (v1.1); Space Physics setting (low, medium, high) is a v2 feature | Ryan's retest notes |
