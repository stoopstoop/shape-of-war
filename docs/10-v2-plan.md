# Shape of War: v2 plan (five features)

Derived from SPEC.md, `docs/01-game-design.md`, `docs/03-architecture.md`, `docs/05-build-plan.md` and `docs/09-v2-roadmap.md`. Status: draft by Scribe for Fable review, 2026-10-28, revised the same day with Ryan's answers (section "Questions for Ryan"). Not canon until Fable merges it and writes the v2 SPEC addendum (decision D1). SPEC.md wins on v1 behaviour; the addendum wins on v2 additions.

Priority order from Ryan (`docs/STATUS.md` v2 backlog, brief v2-plan):

1. Space physics: thrust. Acceleration builds the longer the stick is held (exponential in hold time), the ship drifts under drag on release, and a brake assist speeds up reversals. Settings option "Space physics": off, low, medium, high. Default off. Off is exactly v1. Owner Forge.
2. Weapon upgrades that change firing style (spread, rapid, pierce, orbit), deterministic. Owner Swarm, Ledger for settings and persistence.
3. Advanced enemy types beyond v1 (six, floor five, each with its own movement rule and counter): Charger, Bulwark, Blink, Swirl, Sower and Splime, plus the Mine and Slime hazards. Owner Swarm, Foundry for generator weights.
4. Visual pass toward the Geometry Wars 3 reference: higher resolution grid deformation, more particles, richer trails and map effects inside the 60 fps budget. Owner Glow.
5. Dynamic generative music: WebAudio only, a composed base track, each enemy type entering the arena adds a note, motif or loop, intensity scales with threat. Owner Chorus (new roster nickname, Appendix A).

Curved surfaces stay a hook: Foundry keeps the flat `surface` field and `src/core/surface.ts` as they are. Nothing curved is built.

## Bad news first

1. Money is not the constraint (Ryan, question 1). About $137 of Console credits remain (STATUS says $192.49 start, about $55 spent) and they expire 2026-10-29. A further $200 expires 2026-11-29 (`docs/DECISIONS.md`, 0:00) and Ryan confirms it is usable for v2. The plan costs about $58 to $84 including the B9 fix wave (Cost section) against about $337 usable. What does bind is about 12.5 hours of serial wall clock with Ryan at five gates, and Ryan confirms he is available for all five (question 2). Whatever is left of the first $137 on 2026-10-29 is lost; the plan does not add scope to use it (D11).
2. Every feature here is outside the v1 scope rules. SPEC 3.4 (enemy catalogue), 3.5 (weapon), 3.6 (scores), 3.7 (cuts), 7.3 (fixed roster, no Chorus) and `docs/01` sections 4.2, 6 and 14 (no pierce, no enemy types beyond section 6, no reactive grid, no music) all say no. CLAUDE.md tells builders "no feature outside docs/01". Without a v2 SPEC addendum every builder must refuse its brief. I did not edit SPEC.md. The addendum is drafted by Scribe (as the docs/09 header says) and committed by Fable before T0 (D1).
3. This plan does not use `docs/09-v2-roadmap.md` sections 1, 2 and 4. No Three.js migration, no Lens or Lattice agents, no curved surfaces. Glow stays on PixiJS v8 and builds the deforming grid under `src/render/lattice/`, not `src/fx/lattice/` (docs/09 section 3.9). Docs/09 section 3.5 (procedural music, Glow) is superseded by Chorus. Gamepad (docs/09 section 3.13) stays out: touch only.
4. B9 (left stick feels limited, STATUS) is open. Space physics tuning is meaningless on an unfixed stick. Wave A starts only after B9 closes (D2). Note for Forge: at a1a8887 `stepShip` sets velocity directly from the stick, so a B9 cause in ship acceleration must sit elsewhere (the input path, the `stepWells` pull channel or the loop divisor). Forge reads the B9 hand-offs before tuning.
5. Space physics on the 21:9 cover screen is a thumb ergonomics risk (SPEC 10.4). Drift makes fine positioning harder under a thumb that already covers the arena. Agents cannot judge this. Only the device paste at GA can.
6. The visual pass is the highest performance risk. v1 holds 60 fps on the main screen with motion Adaptive (G4 P1 accepted at 60, not 120). A per frame Graphics redraw of thousands of lattice lines is the v7 habit that kills frame rate. The lattice must draw from one geometry buffer, and whether PixiJS 8.22 supports the needed line topology and per frame buffer updates is unverified (Glow checks the `node_modules/pixi.js` types first).
7. Advanced enemies change generator output for bands 2 and up. Same seed, different level. Levels 1 to 5 and every level with the flag off must keep today's hashes (the five pins in `tests/qa/levelSnapshots.test.ts`, which Foundry pins to flag off in wave C). Progress keys survive; level content for 6 and up does not.
8. Music can glitch on Android Chrome under load, and an AudioContext can suspend on fold (the U4 fullscreen after fold bug is the precedent). CPU headroom next to 24 sfx voices is unknown. Chorus caps music voices at 16 and Ryan listens at GD.
9. The GW3 reference screenshots (shared 2026-10-27) are not in the repo yet. Ryan will add them under `docs/ref/` (question 10). Until they land builders cannot see them, so briefs below describe the targets in words and must be satisfiable without them. SPEC 1 requirement 5 (no Geometry Wars sprites) and a public repo still apply to what goes in `docs/ref/`; Fable decides whether that folder is git-ignored.

## Knowns and unknowns

| Known | Unknown |
|---|---|
| v1.0.0 tagged at 4fbdaf7; sim 120 Hz; ship velocity set directly from the stick at 420 u/s (`src/game/ship.ts`) | Whether the thrust numbers Ryan gave feel right on the Fold (tuned at GA) |
| Grid is static at 50 u spacing plus a ripple (`src/render/gridGeom.ts`, `ripple.ts`); particle cap 2048 (`particlePool.ts`) | Whether a 25 u lattice plus 4096 particles holds 60 fps on the main screen with bloom |
| Settings enum precedent: `glowPath` (`src/core/settings.ts`); bus in `src/core/events.ts`; stateless `hash01` in `src/core/rng.ts`; "exponential acceleration" means thrust that builds with hold time (Ryan, question 3) | Whether the Slime slow (20 percent for 2 s) reads as fair and not as a trap on the 21:9 cover screen (GC paste) |
| Synth in `src/audio/synth.ts`: oscillators and a hashed noise buffer, 24 voice cap, no audio files | Music CPU cost beside sfx on the Fold, and fold behaviour of the AudioContext |
| Run cost per merged branch in STATUS: $0.26 to $4.21; the large builds (forge-core, glow-fx) cost $2.88 to $4.21 | B9 root cause and whether it touches Forge's ship feel |
| Dispatcher: `MAX_PARALLEL` 4, `WALL_MS` 90 min per run, `MAX_BUDGET_USD` default 25 (`scripts/dispatcher.mjs`); it refuses a job whose `.claude/agents/<nickname>.md` is missing | Whether a sixth enemy plus a second hazard entity fits the wave C build window (cut 6 if not) |

## Scope

In: the five features above, their settings (Appendix B), their device gates, a v2 harden wave.

Out, parked: Three.js, curved surfaces beyond the flat hook, gamepad, haptics beyond death, achievements, leaderboards, ship types, enemy bullets, bosses, any online feature. None is touched. Ideas go under "Known gaps".

## Shared rules for every wave

1. `docs/05-build-plan.md` shared rules 1 to 14 apply unchanged (dispatcher only, exclusive directories, Fable only edits package.json, CLAUDE.md, SPEC.md, STATUS and DECISIONS, no signature change without approval, glue under 20 lines, the `gh run watch` form, no `~` in commands).
2. v1 engineering rules stay (CLAUDE.md): TypeScript strict, no `any`, no `ts-ignore`; small pure functions; vitest for every pure module; PixiJS v8 only with `docs/pixi8-cheatsheet.md` read first; `Math.random()` only in `src/core/rng.ts`; simulation and render never call a PRNG; generator output JSON serialisable; touch only; no audio files, images or fonts beyond the PWA icons; no new dependency (this plan requests none); conventional commits; no em or en dashes; sentence case headings; the DoD grep for v7 APIs prints nothing.
3. `applyNeon(n)` stays the only writer of bloom strength, threshold, saturation, glow width and grid base brightness. Transient effects (pulses, flashes, trails) are multipliers on their own layers. A new tunable that SPEC 4 assigns to the neon slider becomes a `NeonParams` field computed in `neonParams(n)`.
4. New randomness in the simulation uses `w.simRng` or the stateless `hash01`, never a new PRNG. Drop schedules, blink destinations and swirl directions are functions of the LevelDef seed and counters. Music is a pure function of (level seed, kind, bar) via `hash01`. Render and lattice never feed the sim.
5. v1 stays reachable (the Off invariant, never cut): with space physics off, weapon pickups off and `enableV2Enemies` false, the simulation is bit identical to v1.0.0 for the same inputs. The Low effects tier and music volume 0 reproduce the v1 look and silence. Visuals and music are additive.
6. Agent hand-offs name any change needed outside their directories under "Requests". Cross-branch types are matched structurally and wired by Fable glue (for example `SpaceLevel` is declared in both `src/core/physics.ts` and `src/core/settings.ts` as the same literal union).
7. Shared gate checks Fable runs as shell jobs at every merge: the DoD v7 grep; `grep -rn "Math.random" src/ | grep -v src/core/rng.ts`; `grep -rnE "keydown|keyup|mousedown|getGamepads" src/`; `grep -rnE ":\s*any\b|as any|ts-ignore" src/ tests/`; `git diff --stat <merge>^1 <merge>` against the ownership table; `tests/qa/__snapshots__` unchanged unless the brief says otherwise; `package.json` unchanged.

## Performance budget

| Budget | Value | Where enforced |
|---|---|---|
| Main screen fps, stress scene (400 entities, 2000 particles), Standard tier | 60 or better, motion setting recorded | Every gate with an fps line |
| Particle cap | 2048 Standard, 4096 High; trails are shed first above 80 percent live | Glow B and D |
| Lattice nodes | Standard 25 u spacing (cap 4096 nodes), High 16 u (cap 8192), Low keeps the v1 grid and ripple | Glow D |
| Bullet pool | 512 unchanged; rapid at Turbo about 125 live; orbit uses 4 slots | Swarm B |
| Per step allocation | none in physics, weapons or enemies | tests plus review |
| Music voices | 16 for music, sfx cap 24 untouched, summed layer gain at most 1.0 | Chorus A and D |

If a tier misses 60 fps on the main screen at its gate, that tier is not the default (D8).

## Contract stubs (V2-W0)

Parallel branches cannot compile against code that does not exist (docs/05 bad news, last item). Fable has Scribe draft signature stubs on `feat/scribe-v2-stubs` (the brief overrides the roster, as in v1 W1), reviews the diff and merges before wave A. Types exact, bodies absent, behaviour unchanged.

| File | Stub |
|---|---|
| `src/game/world.ts` | Append to `Kind`: `WeaponPickup, Charger, Bulwark, Blink, Swirl, Sower, Mine` (end of the enum, existing values unchanged) |
| `src/levelgen/leveldef.ts` | Add `'charger'`, `'bulwark'`, `'blink'`, `'swirl'`, `'sower'` to `EnemyKind`; a `V2_ENEMY_KINDS` const that is not part of `ENEMY_KINDS`; zero weight, base value and geom entries in the tables so v1 generator output is byte identical |
| `src/game/defs.ts` | `kindOf` cases for the new names; `defOf` returns null for them |
| `src/core/events.ts` | `WeaponKind` type and the keys in Appendix B |
| `src/render/neon.ts` | Palette keys for the five enemies and three weapons (placeholder HSL, Glow tunes them) |
| `src/game/bullets.ts` | `style: Uint8Array` on `BulletPool` (0 spread, 1 rapid, 2 pierce, 3 orbit), zero filled |
| `src/render/shapeSpecs.ts`, `tests/render/shapes.test.ts` | `DrawnKind` is `Exclude<Kind, Kind.None>`, so `SHAPE_SPECS` gains placeholder entries (the unknown magenta circle spec) for each new Kind; the registry test's `LAST_KIND` moves to `Kind.Mine` and its length checks follow |

The same rule covers any other exhaustive `Record<Kind, ...>`, `Record<EnemyKind, ...>` or switch that `tsc` flags: the stub author adds a placeholder entry only and lists each file in the hand-off.

Invariant: `npm test` and `npm run build` green with zero snapshot changes. Also at W0 Fable creates `.claude/agents/chorus.md` from Appendix A and adds Chorus to the SPEC 7.3 roster line in the addendum.

```text
Scribe: V2 contract stubs. Branch feat/scribe-v2-stubs. Worktree ../sow-scribe-v2-stubs.
This brief overrides your roster: you own exactly the files in the docs/10-v2-plan.md
"Contract stubs" table, plus any file tsc flags for an exhaustive Kind or EnemyKind record
or switch (placeholder entry only, list each in the hand-off). Types exact, additive only,
no behaviour change, no new tests beyond keeping existing ones green. Run npm ci, npm test,
npm run build. The tests/qa snapshots must not change. Commit "glue: V2 contract stubs".
End with your hand-off.
```

The first stubs run is merged on main (47b727f). Ryan's answer to question 8 adds a sixth enemy, Splime, and a second hazard, Slime. A follow-up stubs run (Scribe, after Fable commits the addendum, same rules and invariant) adds:

| File | Follow-up stub |
|---|---|
| `src/game/world.ts` | Append `Splime, Slime` to `Kind`, after `Mine` (existing values unchanged) |
| `src/levelgen/leveldef.ts` | Add `'splime'` to `EnemyKind` and to `V2_ENEMY_KINDS` (not to `ENEMY_KINDS`); a `splime` entry with zero weight, base value and geoms in every table, including the `NO_V2_ENEMIES` object; Slime has no `EnemyKind` |
| `src/game/defs.ts` | `kindOf` case for `'splime'`; `defOf` returns null for it |
| `src/render/neon.ts` | Palette keys `splime` and `slime` (placeholder HSL, Glow tunes them) |
| `src/render/shapeSpecs.ts`, `tests/render/shapes.test.ts` | Placeholder `SHAPE_SPECS` entries for `Kind.Splime` and `Kind.Slime`; the registry test's `LAST_KIND` moves from `Kind.Mine` to `Kind.Slime` and its length checks follow |

The same rule covers any other exhaustive record or switch that `tsc` flags (placeholder entry only, list each file in the hand-off). The `slowUntil` and `slowFactor` ship fields are not a stub: Forge adds them in wave A.

Job file shape for every brief below (same as docs/05; the table above each brief gives the values):

```json
{ "type": "agent", "nickname": "<n>", "slug": "<slug>", "model": "claude-opus-5-5", "branch": "feat/<n>-<slug>", "worktree": "../sow-<n>-v2<w>", "brief": "<the text block>" }
```

## Clock summary

T0 is the moment Fable queues the W0 job. Hours after T0, estimates. Evidence: v1 W3 ran 2:55 to 6:35 with four builders and fixes (`docs/DECISIONS.md`).

| Wave | Clock | Setup | Build | Merge | Gate | Agents |
|---|---|---|---|---|---|---|
| V2-W0 stubs | 0:00 to 0:30 | 0:05 | 0:05 to 0:20 | 0:20 to 0:30 | none | Scribe |
| V2-A physics | 0:30 to 2:30 | 0:10 | 0:40 to 1:30 | 1:30 to 1:50 | 1:50 to 2:30 | Forge, Ledger, Chorus |
| V2-B weapons | 2:30 to 5:00 | 0:15 | 2:45 to 4:00 | 4:00 to 4:20 | 4:20 to 5:00 | Swarm, Ledger, Glow |
| V2-C enemies | 5:00 to 7:30 | 0:15 | 5:15 to 6:30 | 6:30 to 6:50 | 6:50 to 7:30 | Swarm, Foundry, Glow |
| V2-D look and sound | 7:30 to 10:30 | 0:15 | 7:45 to 9:15 | 9:15 to 9:40 | 9:40 to 10:30 | Glow, Chorus, Ledger |
| V2-E harden | 10:30 to 12:30 | 0:10 | 10:40 to 11:30 | 11:30 to 11:50 | 11:50 to 12:30 | Proctor, fixers |

Waves are serial because they share `src/game/` and `src/render/`. Lanes that touch disjoint directories ride along (Chorus in wave A). Max 4 parallel runs (dispatcher default). Waves A to D run 3 each; wave E runs up to 4.

Budget check at every gate (D10): Fable compares spend to date with the usable pool (about $137 expiring 2026-10-29 plus $200 expiring 2026-11-29, Ryan's answer to question 1). The pool is four to six times the plan cost, so no cut is expected on budget. Cuts are triggered by gate pastes, hand-offs and Ryan's availability. Fable takes the next cut only if a trigger in the cut order table fires.

## Decision points

| ID | Clock | Decision | Default | Decided by |
|---|---|---|---|---|
| D1 | before T0 | v2 SPEC addendum (3.4, 3.5, 3.6, section 5 perf wording, 7.3 roster) and approval of this plan | Scribe drafts, Fable commits, Ryan approves | Fable, Ryan |
| D2 | before T0 | B9 closed on device | Wave A waits for it | Ryan |
| D3 | T0 | Rider lane: Chorus engine in wave A, dark (not wired) until D | Yes. If no, Chorus runs only in D and D grows by one serial run | Fable |
| D4 | GA | Thrust numbers from the paste (the model is decided, question 3) | Accept, or one Forge fix run changing `SPACE_TABLE` only, or drop High | Ryan |
| D5 | 2:30 | Weapon acquisition: pickup or level based | Pickup based (Ryan, question 6); the level band gates the pool (no LevelDef change) | Ryan |
| D6 | 5:00 | Generator flag `enableV2Enemies` default and `GENERATOR_VERSION` 2 | On; levels 1 to 5 and flag-off hashes unchanged (question 9, unanswered) | Ryan |
| D7 | GC | Keep or cut Sower and Mine, then Splime and Slime, from the fairness paste | Keep unless "unfair". Cutting Splime and Slime goes below the floor of five, so Ryan decides | Ryan |
| D8 | GD | Effects tier default from fps; lattice spacing | Standard unless fps_main is below 60 | Fable, Ryan |
| D9 | GD | Music default level and menu music | 50, in play only (Ryan, question 11) | Ryan |
| D10 | every gate | Budget check against the usable pool | No budget cut expected; gate triggers only | Fable |
| D11 | T0 | Use of surplus credits | Nothing added. Optional: two Forge feel variants at GA (different `SPACE_TABLE`), Ryan picks on device | Ryan |

## Cut order

Cut from the top. At most one cut per checkpoint unless a trigger fires twice. Executing a cut follows docs/05: remove it from the remaining briefs, disable it with glue (weight 0, control hidden, tier removed), log it in STATUS "Cuts taken" and DECISIONS, tell Ryan in one line.

| Cut # | Item | Decision clock | Trigger |
|---|---|---|---|
| 1 | Music motifs for enemy kinds beyond the first three (keep stingers, base track, intensity) | 7:30 (Chorus A glitches) or 10:00 (GD) | The Chorus A hand-off reports scheduler glitches, or music glitches at GD persist after one Chorus fix run |
| 2 | Music entirely (Chorus D not dispatched, or its output left unwired; engine stays unwired) | 10:00 | Music glitches at GD persist after cut 1 and a second Chorus fix run |
| 3 | Map effects and dust (keep the lattice) | 9:00 | Glow D incomplete at the 9:00 check |
| 4 | Visual tiers: High, then Standard lattice 25 u to 33 u, then Low (v1 grid and ripple) | 10:00 | `fps_main` under 60 at GD |
| 5 | Sower and Mine (five enemies remain, the floor) | 6:50 | Fairness paste "unfair" or Mine cap trouble |
| 6 | Splime and Slime (four enemies remain, below the floor, so reported to Ryan first) | 6:50 | Fairness paste "unfair" for Splime or Slime, Slime cap trouble, or the Swarm C build window runs out before Splime |
| 7 | Orbit weapon (rapid and pierce remain) | 4:20 | Orbit fails at GB or collides with the pool |
| 8 | Space physics High (low and medium remain) | 2:30 | Paste says High is unplayable and no retune fits |

Order of the two enemy cuts is Ryan's: Sower and Mine first, Splime and Slime second. Because Splime is the last item in Swarm's task order (wave C brief), running out of window cuts it cleanly.

Never cut: the Off invariant (shared rule 5); touch controls; generator determinism with flags off; the neon slider; PWA install. Floors: at least five of the six new enemies and at least two new weapon styles. Below a floor the feature is reported incomplete to Ryan; Fable does not ship a partial feature silently. Cut 6 is below the floor by construction, so it needs Ryan's reply, not just Fable's decision.

## Cost

Assumptions: Opus run $3 to $4 (brief), Sonnet run $1 to $2 for small tasks (per branch costs in STATUS run from $0.26 to $4.21). The reserve covers reruns, stale runs (v1 lost one to a Claude Code auto update) and fixers.

| Wave | Runs | Low | High |
|---|---|---|---|
| V2-W0 | Scribe: SPEC addendum draft and stubs (Sonnet, two runs) | $1 | $2 |
| V2-A | Forge, Chorus (Opus); Ledger (Sonnet) | $7 | $10 |
| V2-B | Swarm, Glow (Opus); Ledger (Sonnet) | $7 | $10 |
| V2-C | Swarm, Foundry, Glow (Opus); Splime and Slime add about $1 to $2 across the three | $10 | $14 |
| V2-D | Glow, Chorus (Opus); Ledger (Sonnet) | $7 | $10 |
| V2-E | Proctor (Sonnet); two fixers (Opus) | $7 | $10 |
| Reserve | five reruns or fixes (Opus) | $15 | $20 |
| Plan total | | $54 | $76 |
| B9 fix wave (v1.1, Thumbs and Forge, same pool) | | $4 | $8 |
| Grand total | | $58 | $84 |

Remaining credits about $137.49 ($192.49 start less about $55 spent, `docs/STATUS.md`) plus the second $200 (usable, Ryan question 1), about $337 in all. The plan uses about 17 to 25 percent of it. Nothing here justifies adding scope to spend it (D11). Fable runs on Max, not on credits. The $137 part expires 2026-10-29 and anything left of it then is lost.

Per run cost cap: the dispatcher default `MAX_BUDGET_USD` is 25 (integer env var). Recommend Ryan restarts the dispatcher with `MAX_BUDGET_USD=8` for v2. The largest v1 run cost $4.21.

## Merge job template

Same shape as docs/05, queued one at a time (docs/05 shared rule 12). Each wave below lists only the order and the glue.

```json
{ "type": "shell", "nickname": "fable", "slug": "merge-v2a-forge", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/forge-space-physics && npm test && npm run build" }
```

After the last merge of a wave: glue commit job, then `git push origin main && sleep 15 && gh run watch $(gh run list --workflow deploy.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status`, then `git tag v2-ga` (or gb, gc, gd) and push the tag, then the session split from docs/05 "Session hygiene" with Scribe drafting the STATUS update on `feat/scribe-v2<w>-handoff`.

## Test directory ownership

| Test dir | A | B | C | D | E |
|---|---|---|---|---|---|
| tests/core/ | Forge (physics.test.ts only) | none | none | none | fixer |
| tests/game/ | Forge (ship.space.test.ts only) | Swarm | Swarm | none | fixer |
| tests/scoring/ | none | none | Swarm | none | fixer |
| tests/settings/ | Ledger | Ledger | none | Ledger | fixer |
| tests/ui/ | Ledger | Ledger | none | Ledger | fixer |
| tests/levelgen/ | none | none | Foundry | none | fixer |
| tests/render/ | none | Glow | Glow | Glow | fixer |
| tests/audio/ | Chorus | none | none | Chorus | fixer |
| tests/qa/ | none | none | Foundry (levelSnapshots only) | none | Proctor |

---

## Wave V2-A: space physics (T+0:30 to 2:30)

### Agents and ownership

| Nickname | Model | Branch | Owns (exclusive) | Worktree |
|---|---|---|---|---|
| Forge | opus | feat/forge-space-physics | `src/core/physics.ts` (new), `src/game/ship.ts` | ../sow-forge-v2a |
| Ledger | sonnet | feat/ledger-space-setting | `src/core/settings.ts`, `src/ui/`, `src/main.ts` | ../sow-ledger-v2a |
| Chorus | opus | feat/chorus-engine | `src/audio/` | ../sow-chorus-v2a |

Not touched in A: the rest of `src/game/`, `src/render/`, `src/input/`, `src/levelgen/`. Chorus is a rider lane (D3): it has no gate item and stays dark.

### Design: the physics model

Ryan's model (question 3): thrust, not easing. Acceleration builds the longer the stick is held. Per sim step, with `dir` the stick vector (magnitude capped at 1 as in v1) and `held` true when the stick is active past its dead zone:

```
if held:
  t = t + dt                          // continuous hold time
  a = min(A_MIN * exp(t / TAU), A_MAX)
  if dot(dir, v) < 0: a = a * BRAKE   // brake assist when reversing
  v = v + a * dir * dt
  if |v| > V_MAX: v = v * V_MAX / |v|
else:
  t = 0
  v = v * exp(-DRAG * dt)             // drift
```

Low, Medium and High each set one row of `SPACE_TABLE` (A_MIN, TAU, A_MAX, V_MAX, DRAG, BRAKE). Off reproduces v1 exactly: velocity is set directly from the stick and every existing feel test passes. Starting values, tuned at GA:

| Level | A_MIN (u/s2) | TAU (s) | A_MAX (u/s2) | V_MAX (u/s) | DRAG (1/s) | BRAKE |
|---|---|---|---|---|---|---|
| off | none, velocity set from the stick | none | none | 420 | none | none |
| low | 1200 | 0.6 | 2400 | 420 | 4 | 2.5 |
| medium | 800 | 0.8 | 2000 | 460 | 2.5 | 2.0 |
| high | 500 | 1.0 | 1800 | 520 | 1.2 | 1.6 |

Derived values from the formulas, not measured:

| Level | From rest to V_MAX | Hold time at which a reaches A_MAX | Coast after release at V_MAX (V_MAX / DRAG) | To 10 percent speed after release | Stop on reversal after a long hold |
|---|---|---|---|---|---|
| low | 0.28 s | 0.42 s | 105 u | 0.58 s | 0.07 s |
| medium | 0.43 s | 0.73 s | 184 u | 0.92 s | 0.12 s |
| high | 0.71 s | 1.28 s | 433 u | 1.92 s | 0.18 s |

Arenas are 700 to 1100 u high (docs/01 section 2.3), so High coasts 0.4 to 0.6 of an arena height. A_MAX binds on a reversal after a long hold, not on the first push from rest. Off is the exact v1 path. Medium and High cap speed above the v1 420 u/s (460 and 520), which Forge must keep out of the Off path.

Interactions, all decided here so Forge does not guess:

1. Walls: slide as v1, no bounce (Ryan, question 3). The into-wall component is removed and the stored velocity is the post slide velocity, so the ship does not keep pushing into the wall. A wall hit does not reset the hold time.
2. Hold time `t` resets only when the stick is released. A direction change while held keeps it, and the brake multiplier does the turning.
3. Drag acts only while released. Below 3 u/s on release the velocity snaps to 0, so a coast ends in finite time (starting value).
4. Gravity wells: unchanged. The pull stays a separate displacement channel (`shipPullX` and `shipPullY` applied in `stepWells`, `src/game/enemies/gravitywell.ts`). Wells do not transfer momentum under physics. Known gap, optional for Swarm in wave B.
5. Bullets: `fireSpread` adds the ship velocity along the aim, clamped to 1600. Unchanged.
6. Nose direction: aim while aiming, else stick direction (v1). Not the velocity.
7. `dir` is not normalised above magnitude 1, so a half deflected stick gives half thrust. V_MAX does not scale with deflection.
8. Slow channel for Slime (question 8): `ShipState` gains `slowUntil` (a `w.time` value, default 0) and `slowFactor` (default 1). While `w.time < slowUntil` the speed cap is V_MAX x `slowFactor`; under Off the stick velocity is multiplied by `slowFactor`. Forge adds the fields and the read in wave A so the physics work stays in one owner. Swarm sets them in wave C. The Off path gains only guarded added lines that do nothing while `slowUntil` is in the past, so Off stays bit identical to v1 whenever no Slime exists.
9. Respawn zeroes velocity and hold time, and resets `slowUntil` to 0 and `slowFactor` to 1 (`respawnShip`). Pause and fold hold no extra state.
10. Changing the setting mid level takes effect on the next step with the current velocity and hold time.
11. Thrust integration is first order at the fixed 120 Hz step, so 60 Hz and 120 Hz agree to a tolerance, not exactly. The drag term is exact for any dt.

### Brief: Forge (space physics)

```text
Forge: space physics. Branch feat/forge-space-physics. Worktree ../sow-forge-v2a.
Read first: docs/10-v2-plan.md "Wave V2-A", the v2 SPEC addendum, docs/01 sections 3 and 4.1,
src/game/ship.ts, tests/game/ship.test.ts, and the B9 hand-offs under .agents/runs if present.
Own: src/core/physics.ts, src/game/ship.ts, tests/core/physics.test.ts,
tests/game/ship.space.test.ts. Everything else is read only.

Task:
1. src/core/physics.ts (new, pure, no allocation): SpaceLevel = 'off' | 'low' | 'medium' |
   'high'; SPACE_TABLE with aMin, tau, aMax, vMax, drag and brake for low, medium and high
   (plan table); stepThrust(level, vx, vy, dirX, dirY, held, holdT, dt, slowFactor, out)
   implementing the plan model: when held, holdT += dt, a = min(aMin * exp(holdT / tau), aMax),
   a *= brake when dot(dir, v) < 0, v += a * dir * dt, then cap |v| at vMax * slowFactor; when
   released, holdT = 0, v *= exp(-drag * dt), and speed under 3 u/s becomes 0. Writes vx, vy and
   holdT into out. Starting numbers are the plan table; keep them in SPACE_TABLE only so GA
   tuning is a one file edit.
2. ship.ts: ShipState gains space: SpaceLevel (default 'off'), holdT (0), slowUntil (0, a w.time
   value) and slowFactor (1); export setShipSpace(w, level). In stepShip the 'off' branch runs
   the existing v1 lines; the only addition inside it is one guarded block, placed before the
   confine call, that multiplies vx and vy by slowFactor while w.time < slowUntil (the diff
   must show nothing else edited in the v1 path). Any other level computes velocity with stepThrust, then confines and slides exactly
   as v1 and stores the post slide velocity in w.vx and w.vy. respawnShip also zeroes holdT and
   resets slowUntil to 0 and slowFactor to 1.
3. Slime slow channel (Ryan's Splime answer): slowUntil and slowFactor are for Swarm's Slime in
   wave C, which sets slowUntil = w.time + 2 and slowFactor = 0.8 on contact. Forge only adds the
   fields, the read in stepShip and the reset. Nothing in src/ sets them in wave A. Do not add
   Slime logic.
4. Firing, aim, nose direction and invulnerability are untouched.
5. No new dependency, no allocation per step, no Math.random.

Definition of done: npm test and npm run build pass, tests/game/ship.test.ts unmodified and
green, no any.
Tests to add:
- tests/core/physics.test.ts: table values match the plan; a reaches aMax at tau * ln(aMax /
  aMin) of hold and never exceeds it; from rest speed reaches vMax in the plan time (within 5
  percent) and low < medium < high; after release speed is 36.8 percent of its start after
  1 / drag seconds (within 1e-3) and snaps to 0 under 3 u/s; reversing (dot < 0) decelerates
  brake times faster than the same step without the brake; holdT resets on release and survives
  a direction change; 120 steps at 1/120 and 60 steps at 1/60 agree within 2 percent of speed
  after 0.5 s of hold (first order integration) and within 1e-9 for pure drag; speed never above
  vMax * slowFactor over 1000 fuzzed inputs; no NaN at dt 0.
- tests/game/ship.space.test.ts: off matches a frozen inline copy of the v1 formula over a
  recorded 600 step input stream (x, y, vx, vy equal), with default state; medium coasts about
  184 u after release at full speed (within 5 percent); after a 2 s hold at full speed a
  reversal stops in about 0.12 s (within 15 percent); wall slide keeps the tangent and drops the
  normal component; respawn zeroes velocity, holdT and the slow fields; the same stream twice
  gives identical values; fireSpread still receives the ship velocity; slow channel: with
  slowUntil in the future and slowFactor 0.8 the off velocity is 0.8 of the stick velocity and
  the medium cap is 0.8 x 460, and both return to normal once w.time passes slowUntil.
End with the hand-off block.
```

### Brief: Ledger (space physics setting)

```text
Ledger: space physics setting. Branch feat/ledger-space-setting. Worktree ../sow-ledger-v2a.
Read first: docs/10-v2-plan.md "Wave V2-A", src/core/settings.ts (glowPath is the pattern),
src/ui/settings.ts, src/main.ts, docs/03 section 8.
Own: src/core/settings.ts, src/ui/, src/main.ts, tests/settings/, tests/ui/.

Task:
1. settings.ts: SpaceLevelSetting = 'off' | 'low' | 'medium' | 'high' (the same literal
   union as Forge's SpaceLevel, declared here on purpose), key sow.settings.spacePhysics,
   default 'off', parseSpacePhysics (anything else gives 'off'), loadSpacePhysics,
   saveSpacePhysics, every access in try/catch like glowPath.
2. ui/settings.ts: a "Space physics" row with four buttons Off, Low, Medium, High, 44 CSS px
   minimum hit height, current choice highlighted, saved on tap, reachable from the menu and
   the pause screen. Add setSpacePhysics(level) to SettingsEffects and SettingsModel.
3. main.ts: read the setting at boot and pass it through the effects port. Do not import
   src/game/ship.ts; Forge's setShipSpace is wired by Fable glue after both merge. Leave
   one clearly named port call.
4. Reset progress does not reset settings (unchanged).

Definition of done: npm test and npm run build pass, no any, no new dependency.
Tests to add: tests/settings/spacePhysics.test.ts (default off, round trip, invalid and null
fall back to off, storage throwing); tests/ui/settings.test.ts additions (button state, a tap
saves and calls the effect once, pause path).
End with the hand-off block.
```

### Brief: Chorus (music engine and base track)

```text
Chorus: music engine and base track. Branch feat/chorus-engine. Worktree ../sow-chorus-v2a.
Read first: docs/10-v2-plan.md "Wave V2-A" and "Appendix A", src/audio/synth.ts,
src/audio/cues.ts, src/core/events.ts, src/core/rng.ts (hash01), docs/04 sections 12 and 13.
Own: src/audio/, tests/audio/. Everything else is read only.

Task (no game wiring this wave; the music stays dark until wave D):
1. src/audio/synth.ts: additive export getAudioGraph() returning the lazily created
   AudioContext and master GainNode, or null before unlockAudio(). No behaviour change to
   existing cues.
2. src/audio/music/: scale.ts, track.ts, intensity.ts, scheduler.ts, engine.ts, index.ts.
   scale: A minor pentatonic plus natural minor for pads, note to Hz.
   track: the composed base, 120 BPM, 4/4, 16 steps per bar, 8 bar loop, chords Am, F, C, G
   two bars each. Layers from the bottom: sub bass (triangle through a lowpass, eighths on
   the root), pad (two detuned saws through a lowpass with a slow filter LFO), kick (sine
   120 to 45 Hz), hat (noise through a highpass), arp (square, pentatonic, sixteenths). A bar
   is a pure function of (seed, bar) built on hash01.
   intensity: threat 0 to 1 smoothed (attack 0.5 s, release 3 s) maps to layer gains and a
   master lowpass from 600 Hz to 6 kHz. Kick from 0.15, hat from 0.3, arp from 0.45, hat
   sixteenths from 0.7, pad always.
   scheduler: lookahead; a timer every 25 ms schedules notes 100 ms ahead on
   AudioContext.currentTime; clock and timer injected so vitest runs in node.
   engine: voices as oscillator and gain nodes disposed after the note, music voice cap 16,
   music master at 0.35 of the synth master.
   index: initMusic(), startMusic(seed), stopMusic(), setMusicVolume(v) with v 0 to 100 and
   default 50; subscribes to bus 'sim:threat', 'game:pause', 'game:resume', 'game:over' and
   'game:quit'. Pause and a hidden tab suspend the scheduler; resume continues on the next
   bar line.
3. No audio files, no new dependency, no Math.random, no import from src/game, src/ui or
   src/render.

Definition of done: npm test and npm run build pass, no any.
Tests to add (tests/audio/music/): scale (every base track note is in the scale); track
determinism (same seed and bar give identical notes, different seeds differ in the arp only);
scheduler (event times strictly increasing, never more than 100 ms ahead of the fake clock, no
duplicate step after pause and resume); intensity (monotonic layer gains, attack and release
times, summed gain at most 1.0); engine voice cap (the 17th voice steals the oldest).
End with the hand-off block.
```

### Merge order and why

1. `feat/forge-space-physics`: owns the sim path the setting drives.
2. `feat/ledger-space-setting`, then glue (about 5 lines): wire the effects port to `setShipSpace(world, level)` at level start and on change.
3. `feat/chorus-engine`: last and dark, nothing imports it yet.

### Gate GA (1:50 to 2:30)

Fable verifies: `git diff main...feat/forge-space-physics -- src/game/ship.ts` shows no edit inside the v1 path except the one guarded slow block (a no-op while `slowUntil` is in the past); `ShipState` carries `slowUntil` and `slowFactor` and `respawnShip` resets them; no code in `src/` other than tests sets them; `tests/game/ship.test.ts` unmodified; the shared gate checks; `grep -rnE "initMusic|startMusic" src | grep -v src/audio` returns nothing (music is dark); the setting defaults to `off`.

Ryan verifies on device:

```text
V2-GA device check, about 8 minutes. Confirm build id <id>.
1. Settings > Space physics. Expect Off selected on first open. Play 60 seconds on Off.
   Expect: the same feel as v1.0.0 plus the B9 fix.
2. Select Low, play 60 seconds. Medium, 60 seconds. High, 60 seconds. After each rate
   reaction (1 sluggish to 5 crisp), drift (1 none to 5 far too much), control (1 lost to 5 fine).
   Hold one direction for two seconds, then flip the stick the other way: rate the turn around
   (1 slow to 5 snappy).
3. On Medium fly at a wall at full speed and release. Expect: slide along the wall, no sticking.
4. Close the app from recents and reopen. Expect: the chosen level is still selected.
5. Show FPS on, Medium, ?stress=400. Note fps cover and main.
Paste back:
V2-GA: off_ok=<yes/no> low=<r>/<d>/<c>/<t> medium=<r>/<d>/<c>/<t> high=<r>/<d>/<c>/<t> wall_ok=<yes/no> persist=<yes/no> fps_cover=<n> fps_main=<n> notes=<text>
```

Pass: off_ok yes, persist yes, wall_ok yes, fps as v1, low control 4 or better. Medium and high are judged by feel and feed D4.

### If GA fails

| Failure | Action | Deadline |
|---|---|---|
| Off differs from v1.0.0 | P0. Forge fix run owning `ship.ts` only | before B setup |
| A level feels wrong | Fable edits `SPACE_TABLE` numbers (A_MIN, TAU, A_MAX, V_MAX, DRAG, BRAKE) as glue (under 20 lines), or one Forge fix run | before B setup |
| Setting does not persist | Ledger fix run | before B setup |
| High unplayable and no retune fits | Execute cut 8 | 2:30 |

---

## Wave V2-B: weapon upgrades (T+2:30 to 5:00)

### Agents and ownership

| Nickname | Model | Branch | Owns (exclusive) | Worktree |
|---|---|---|---|---|
| Swarm | opus | feat/swarm-weapons | `src/game/` except `scoring.ts` (touches `ship.ts`, `bullets.ts`, `combat.ts`, `state.ts`, new `weapons.ts`) | ../sow-swarm-v2b |
| Ledger | sonnet | feat/ledger-weapon-hud | `src/core/settings.ts`, `src/ui/`, `src/main.ts` | ../sow-ledger-v2b |
| Glow | opus | feat/glow-weapon-fx | `src/render/` | ../sow-glow-v2b |

Swarm cannot touch `src/render/`, so Glow runs in this wave or the new bullets and pickups are invisible (the v1 W2 lesson, docs/05 bad news). Forge does not run in B, so Swarm owns `ship.ts` for the one line that dispatches fire.

### Design: weapons

| Weapon | Pattern | Volleys per s | Bullet | Use |
|---|---|---|---|---|
| spread (v1, default) | 3 bullets at minus 6, 0, plus 6 deg | 12 | speed 1400, radius 4, life 1.2 s | crowds |
| rapid | 2 parallel bullets, 5 u either side of the aim line | 26 | speed 1500, radius 3, life 1.0 s | single targets |
| pierce | 1 bullet | 8 | speed 1600, radius 6, passes through up to 3 enemies after its first hit (4 hits), stopped by walls, snake segments and wells | lines of enemies |
| orbit | 4 blades circling the ship at radius 80 u, 2.4 rev/s, plus 1 forward bullet at 6 per s while aiming | 6 forward | blade radius 7, damages any enemy it touches, 0.12 s cooldown per blade, lives for the weapon duration, follows the ship including drift | close defence |

Starting values. Orbit radius 80 u sits outside the Attack drone orbit (60 u) so the two read apart.

Acquisition, pickups from kills, lost on death, 20 s (Ryan, question 6; D5), no LevelDef change so v1 hashes stay:

1. A counter of scoring kills drives drops. First drop at kill 15, then every 25 kills. Only one pickup is live; a due drop waits.
2. The pickup appears at the kill position as `Kind.WeaponPickup`, lives 8 s (blinks the last 2 s), collect radius 28 u from the ship. Bombs leave it alone. Level end clears it.
3. The weapon is `pool[floor(hash01(level.seed, dropIndex) * pool.length)]`, skipping one step if it equals the previous drop. Pool by `level.band`: band 1 rapid; band 2 rapid and pierce; bands 3 and 4 rapid, pierce and orbit. Endless uses the band 4 pool.
4. A collected weapon lasts 20 s. The same weapon refreshes the timer; a different one replaces it. Ship death returns to spread.
5. Turbo (super) doubles the volley rate of every weapon. Orbit rotation is unaffected.
6. The Settings switch "Weapon pickups" (default on, question 7). Off means no pickups spawn and the counter does not run.

Alternative, not default: level based, a `weapon` field in LevelDef chosen by Foundry. It changes every level hash and needs a generator version bump and a Foundry run in B. Rejected as default because pickup based keeps goldens intact (D5).

Render contract for Glow (parallel branches agree on this table):

| Entity | Fields Glow reads |
|---|---|
| `Kind.WeaponPickup` | `w.a[id]` weapon index (1 rapid, 2 pierce, 3 orbit), `w.t[id]` seconds of life left, `w.radius[id]` 14 |
| Player bullets | `BulletPool.style[i]` (0 spread, 1 rapid, 2 pierce, 3 orbit). Orbit blades are ordinary pool bullets with style 3 whose position Swarm sets each step |

### Brief: Swarm (weapons)

```text
Swarm: weapons. Branch feat/swarm-weapons. Worktree ../sow-swarm-v2b.
Read first: docs/10-v2-plan.md "Wave V2-B", the v2 SPEC addendum, docs/01 sections 4.2, 4.5 and 5,
src/game/ship.ts, bullets.ts, combat.ts, state.ts, supers.ts, tests/game/.
Own: src/game/ except scoring.ts, tests/game/. src/render is NOT yours: Glow draws the new
bullets and pickup from the render contract table in the plan.

Task, in order:
1. src/game/weapons.ts (new, pure where possible): WeaponKind from src/core/events.ts,
   WEAPONS table (plan table), fireWeapon(w, x, y, aim) dispatching on the current weapon,
   the drop counter (first drop at kill 15, then every 25 scoring kills), the pool by
   level.band, weapon choice by hash01(level.seed, dropIndex) with the no immediate repeat
   rule, a 20 s timer, death reset, setWeaponPickups(w, on) (default on). No Math.random,
   no mulberry32, no new PRNG.
2. ship.ts: replace the single fireSpread call with fireWeapon. With the current weapon
   spread the shots, rate and bullet pool state must be identical to v1 (golden test).
3. bullets.ts: BulletPool gains pierce (remaining hits), lastHit (last enemy id, so one bullet
   cannot hit the same enemy on consecutive steps), phase (orbit angle). stepBulletPool is
   unchanged for style 0. Orbit blades are pool bullets with style 3 positioned from the ship
   each step.
4. combat.ts: pierce hits (decrement, stop at 0, stopped by snake segments and wells), orbit
   contact with the 0.12 s per blade cooldown, rapid needs no special case.
5. Pickup: Kind.WeaponPickup spawn, 8 s life, collect radius 28 u, one live, emits bus
   'fx:pickup' and 'hud:weapon' (at most every 100 ms and on change). Bombs ignore it.
6. Optional last item if time remains: let wells add the ship pull to velocity when
   space physics is not off. Skip it otherwise and list it under Known gaps.

Definition of done: npm test and npm run build pass, no any, no new dependency, no per step
allocation, pool cap 512 respected (rapid at Turbo stays under it).
Tests to add (tests/game/weapons.test.ts and additions): spread golden (same bullets as v1
over 10 s); rapid rate and offsets; pierce hits exactly 4 enemies in a line and not twice the
same one; pierce stopped by a snake segment; orbit blades follow a moving ship and respect the
cooldown; drop schedule identical across two runs of the same LevelDef and kill log; first drop
at kill 15, next at 40; pool by band; death resets to spread; Turbo doubles the volley rate;
setWeaponPickups(false) spawns nothing.
End with the hand-off block.
```

### Brief: Ledger (weapon HUD and setting)

```text
Ledger: weapon HUD and setting. Branch feat/ledger-weapon-hud. Worktree ../sow-ledger-v2b.
Read first: docs/10-v2-plan.md "Wave V2-B", src/ui/hud.ts, hudFrame.ts, settings.ts,
src/core/settings.ts, docs/01 section 9.
Own: src/core/settings.ts, src/ui/, src/main.ts, tests/settings/, tests/ui/.

Task:
1. settings.ts: key sow.settings.weaponPickups, default on ('1'), strict parse (anything but
   '0' or '1' gives the default), load and save in try/catch.
2. ui/settings.ts: a "Weapon pickups" On/Off toggle, 44 CSS px minimum hit height; add
   setWeaponPickups(on) to SettingsEffects. main.ts reads it at boot and calls the port.
   Fable glue wires it to Swarm's setWeaponPickups(world, on).
3. ui/hud.ts: a weapon indicator fed by bus 'hud:weapon' ({ kind, remaining, total }): the
   weapon name or glyph and a countdown bar, inside the existing top band, to the right of the
   multiplier, no new pointer target, hidden while the weapon is spread. Update at most
   every 100 ms like hud:score.

Definition of done: npm test and npm run build pass, no any, no new dependency.
Tests to add: tests/settings/weaponPickups.test.ts (default on, round trip, invalid falls back,
storage throwing); tests/ui/hud.test.ts additions (indicator shows and hides, countdown at
0, half and full); tests/ui/settings.test.ts additions (toggle persists).
End with the hand-off block.
```

### Brief: Glow (weapon visuals and first trails)

```text
Glow: weapon visuals and first trails. Branch feat/glow-weapon-fx. Worktree ../sow-glow-v2b.
Read first: docs/pixi8-cheatsheet.md (mandatory), docs/10-v2-plan.md "Wave V2-B" and
"Performance budget", src/render/renderer.ts, particles.ts, particlePool.ts, shapes.ts, neon.ts.
Own: src/render/, tests/render/. Everything else is read only.

Task:
1. Tune the weapon palette keys already stubbed in neon.ts (rapid, pierce, orbit) against
   docs/01 section 11 so they read apart from the player bullet and from enemy colours.
2. shapes.ts: the WeaponPickup glyph, a rotating outline with a per weapon inner mark,
   blinking when w.t[id] is under 2 (render contract table in the plan).
3. Bullet styles by BulletPool.style: rapid thin short streak, pierce long bright with a halo,
   orbit crescent blade. At most 4 draw calls for bullets in total.
4. New src/render/effects.ts: type EffectsTier = 'low' | 'standard' | 'high', setEffectsTier,
   getEffectsTier, default 'standard'; particle cap 2048 for low and standard, 4096 for high
   (the ring buffered pool and the pre-created Particle objects are sized for the largest tier
   at boot); trails off on low. Ledger exposes the control in wave D.
5. Ship trail: emitted into the particle pool at a rate proportional to speed above 60 u/s,
   ship colour, so drift reads clearly under space physics. Bullet trails: a short fading
   streak for styles 1 and 2 only. Trails are shed first when the pool is above 80 percent live.
   Trail emission uses hash01 for jitter, never a PRNG. Glow modifies nothing in the sim.
6. Everything honours 'neon:changed' on both glow paths; applyNeon stays the only writer of
   glow width and bloom.

Definition of done: npm test and npm run build pass, no any, no v7 APIs, no new dependency.
Desktop Chrome with stress(400, 2000) and 4x CPU throttle is reported as a proxy only.
Tests to add: shapes registry covers Kind.WeaponPickup; style to texture mapping; tier to cap
mapping; trail shedding above 80 percent; trail emission rate is zero below 60 u/s and
monotonic above; the pool never exceeds its cap in either tier.
End with the hand-off block.
```

### Merge order and why

1. `feat/glow-weapon-fx`: render only, reads fields that exist.
2. `feat/swarm-weapons`: sim, covered by the golden tests.
3. `feat/ledger-weapon-hud`, then glue (about 6 lines): wire `setWeaponPickups` and the temporary `?music=1` debug hook that calls Chorus's `initMusic()` and `startMusic(seed)` at level start.

### Gate GB (4:20 to 5:00)

Fable verifies: the shared gate checks; `tests/qa/__snapshots__` unchanged; the spread golden test present; `grep -rn "mulberry32" src/game` returns nothing; `git diff main...feat/swarm-weapons --stat` stays inside `src/game/` and `tests/game/`.

Ryan verifies on device:

```text
V2-GB device check, about 10 minutes. Confirm build id <id>.
1. Open ?seed=42&level=3. Play until a pickup appears (about 15 kills). Collect it.
   Expect: the HUD shows the weapon and a countdown, fire changes.
2. Collect rapid, pierce and, on ?seed=42&level=20, orbit. Rate each as clearly different (ok or fail).
3. Die while holding a weapon. Expect: spread again, no pickup left on screen.
4. Settings > Weapon pickups Off. Play 60 seconds. Expect: no pickups. Close and reopen: still Off.
5. With Medium space physics, hold orbit and drift. Expect: blades follow the ship.
6. Optional: open with ?music=1 and listen for a minute. Expect the bed only (bass and pad);
   threat events arrive in wave C.
Paste back:
V2-GB: pickup=<ok/fail> rapid=<ok/fail> pierce=<ok/fail> orbit=<ok/fail> death_reset=<ok/fail> toggle=<ok/fail> drift_orbit=<ok/fail> fps_main=<n> music_base=<ok/meh/bad/skipped> notes=<text>
```

### If GB fails

| Failure | Action | Deadline |
|---|---|---|
| Pickup never appears or appears twice | Swarm fix run (`src/game/weapons.ts`, `combat.ts`) | before C setup |
| A weapon is invisible or unreadable | Glow fix run, render only | before C setup |
| Orbit fails or crowds the pool | Execute cut 7 | 4:20 |
| Spread differs from v1 | P0, Swarm fix run | before C setup |

---

## Wave V2-C: advanced enemies (T+5:00 to 7:30)

### Agents and ownership

| Nickname | Model | Branch | Owns (exclusive) | Worktree |
|---|---|---|---|---|
| Swarm | opus | feat/swarm-enemies | `src/game/` including `scoring.ts` and `defs.ts` | ../sow-swarm-v2c |
| Foundry | opus | feat/foundry-v2-enemies | `src/levelgen/`, and for this wave only `tests/qa/levelSnapshots.test.ts` plus `tests/qa/__snapshots__/levels/` | ../sow-foundry-v2c |
| Glow | opus | feat/glow-enemy-fx | `src/render/` | ../sow-glow-v2c |

Swarm owns `scoring.ts` this wave because Ledger does not run (`baseValue` is keyed by `Kind`, so new kinds score 0 until it is edited). Chorus and Ledger idle. Foundry owns the level pin test because those pins call `generateLevel` with the default config; with `enableV2Enemies` on by default they would change for bands 2 and up (they pin levels 13, 18 and 36).

### Design: six enemies, two hazard entities

Each has its own movement rule and a counter the player can learn. All v1 global rules hold (docs/01 section 6.1): 0.6 s telegraph, contact kills the ship, speeds times `speedScale` and the arena factor (`src/game/tuning.ts`), soft separation between same type, `maxLiveEnemies` cap, variation only from LevelDef fields, `w.simRng` or `hash01`. Starting values.

| Enemy | Movement rule | Counter | Speed (u/s) | HP | Base | Radius (u) | Geoms |
|---|---|---|---|---|---|---|---|
| Charger | Cycle of 2.7 s: wind up 1.0 s (turns toward the ship at 120 deg/s, a 600 u lane line is drawn), then dash 0.5 s straight along the locked heading at 720 u/s (a wall ends the dash), then rest 1.2 s. Not pulled by wells while dashing | Leave the lane during the wind up; shoot it while it rests | 720 dash, 0 otherwise | 2 | 120 | 15 | 2 |
| Bulwark | Moves along its heading toward the ship at 90 u/s but may turn only 70 deg/s. A frontal arc of plus and minus 60 deg around the heading absorbs player bullets, drone shots and orbit blades. Bombs and Detonate ignore it | Flank it: circle faster than it turns, hit the side or rear | 90 | 3 | 150 | 18 | 3 |
| Blink | Drifts toward the ship at 100 u/s for 2.2 s, then a 0.4 s warp phase: harmless and untargetable, a ghost fades at the old spot and a ring marks the destination, then it jumps. Destination is 180 to 260 u from the ship, ahead along the ship velocity when it moves faster than 40 u/s, else at an angle from `hash01(id, cycle)`; pulled inside the arena as in docs/01 section 6.5 | Change direction when the ring shows; shoot right after it lands | 100 | 1 | 130 | 13 | 2 |
| Swirl | Orbits the ship at radius 240 u (0.6 rad/s, direction from `hash01(id)`), closing 20 u/s. At radius 90 u it commits to a straight dive at 300 u/s | Lead it along the tangent while it circles (pierce and spread both work); sidestep the committed dive | about 144 tangential | 1 | 80 | 12 | 1 |
| Sower | Hugs the nearest arena boundary at 70 u/s, circulating clockwise, and drops a Mine every 3.0 s (6 live mines per Sower, 24 in total) | Shoot the mines from range; stay off the walls; kill the Sower | 70 | 4 | 180 | 16 | 3 |
| Splime | Walks straight toward the ship at about 0.35 x ship speed (147 u/s at 420), no turn limit. Every 3.5 s it drops one Slime at its position; at 3 live Slime per Splime or 12 in total it skips the drop. Contact kills the ship like any enemy | Shoot it from range (slow, 3 HP); keep moving so its puddles end up behind you; kill it before it fills your lane | 147 | 3 | 140 | 16 | 2 |
| Mine (not in rosters) | Static. Harmless for 0.8 s after the drop, then kills the ship on contact. 1 HP, removed after 12 s, no score, no geoms, not pulled by wells, not a destroy kill | Shoot it | 0 | 1 | 0 | 9 | 0 |
| Slime (hazard, not an enemy, not in rosters) | Static puddle, radius 40 u, lives 8 s. Not deadly. While the ship overlaps it, each step sets `ship.slowUntil = w.time + 2` and `ship.slowFactor = 0.8`: slowed by 20 percent for 2 s, the timer refreshed on each contact, never below 0.8 because the factor is set, not multiplied. Player bullets, drone shots and orbit blades pass through. Drones ignore it. A bomb clears all live Slime. Not pulled by wells, no score, no geoms, not a destroy kill | Steer around it; a bomb clears it | 0 | none | 0 | 40 | 0 |

Shapes must differ at a glance at 12 u radius. Five of the six enemies satisfy the floor. Sower and Mine are the first cut (cut 5). Splime and Slime are the second (cut 6), which goes below the floor, so Ryan decides.

Splime and Slime numbers beyond Ryan's (speed about 0.35 of the ship, radius about 40 u, lifetime about 8 s, a few per Splime, 20 percent for 2 s, bombs clear all) are Scribe's starting values for Fable to confirm: drop every 3.5 s, 3 per Splime and 12 in total, HP 3, base 140, hitbox 16 u, 2 geoms. Detonate versus Slime is not specified (Known gaps).

New sim events (Appendix B), emitted by Swarm, consumed by Glow in this wave and by Chorus in wave D:

| Event | When |
|---|---|
| `sim:enemyEnter` `{ kind, live }` | The telegraph ends and no other live entity of that kind existed |
| `sim:enemyExit` `{ kind }` | The last live entity of that kind is removed (kill, bomb, death clear) |
| `sim:threat` `{ level }` | At most every 100 ms: `clamp(sum(weight * live) / 40, 0, 1)`. Weights: grunt 1, wanderer 0.5, weaver 1.5, pinwheel 0.8, dart 0.4, snake 3, charger 2, bulwark 2.5, blink 2, swirl 1.5, sower 3, splime 2, mine 0.2, slime 0, well 0.5, spawner 1. Telegraphing entities do not count. Hazards (Mine, Slime) emit no enter or exit |

Generator target shares (Foundry picks the mechanism, section "Brief: Foundry"):

| Enemy | Band 1 (1 to 5) | Band 2 (6 to 15) | Band 3 (16 to 30) | Band 4 (31+) |
|---|---|---|---|---|
| Charger | 0 | 12 | 16 | 18 |
| Swirl | 0 | 10 | 12 | 12 |
| Bulwark | 0 | 0 | 12 | 16 |
| Blink | 0 | 0 | 10 | 14 |
| Sower | 0 | 0 | 0 | 10 |
| Splime | 0 | 8 | 10 | 10 |

The Splime row is Scribe's proposal (Ryan gave no shares). Band 4 new kinds now total 80 percent, so Foundry may rescale the v1 remainder, but roster size, spawner and well counts stay as in v1.

Render contract for Glow (what it reads from the World arrays):

| Kind | Fields |
|---|---|
| Charger | `w.t[id]` phase seconds in [0, 2.7): lane line along `w.rot[id]` while t is under 1.0, dash streak for 1.0 to 1.5 |
| Bulwark | shield arc centred on `w.rot[id]`, plus and minus 60 deg, radius 26 u |
| Blink | `w.t[id]` phase in [0, 2.6): during 2.2 to 2.6 a ghost fades from alpha 1 to 0 at the entity position and a ring is drawn at (`w.vx[id]`, `w.vy[id]`), which hold the destination |
| Swirl, Sower | position and rotation only |
| Splime | `w.t[id]` seconds since its last drop in [0, 3.5): the body may swell over the last 0.5 s as the tell for the next drop. Rotation is the heading |
| Mine | `w.t[id]` seconds since the drop: dim under 0.8, bright after, blinking in the last 2 s of 12 |
| Slime | `w.t[id]` seconds since the drop in [0, 8): the blob grows from half to full radius over the first 0.3 s, blinks in the last 2 s. `w.radius[id]` is 40 |

### Brief: Swarm (enemies)

```text
Swarm: enemies. Branch feat/swarm-enemies. Worktree ../sow-swarm-v2c.
Read first: docs/10-v2-plan.md "Wave V2-C", the v2 SPEC addendum, docs/01 sections 6 and 8,
src/game/enemies/ (weaver.ts and snake.ts as patterns), defs.ts, spawner.ts, steer.ts,
scoring.ts, tuning.ts, tests/game/enemies.test.ts.
Own: src/game/ including scoring.ts, tests/game/, tests/scoring/. src/render is NOT yours:
Glow draws the new kinds from the render contract table in the plan.

Task, in order (stop at the deadline, do not reorder):
1. One file per enemy under src/game/enemies/ exporting def and step: charger.ts, bulwark.ts,
   blink.ts, swirl.ts, sower.ts, mine.ts, then splime.ts and slime.ts last (cut 6 removes
   them cleanly, so do not interleave them), with the plan table values and the plan's use of
   w.t, w.rot, w.vx and w.vy as the render contract. Register in defs.ts; kindOf and defOf
   cover the six names (Kind.Splime and Kind.Slime are stubbed; Slime has no EnemyKind).
   Compute seek vectors through steer.ts helpers so a later surface change is one edit.
   Variation only from hash01 or w.simRng.
2. Combat: Bulwark shield (absorbs player bullets, drone shots and orbit blades in the front
   arc; bombs and Detonate ignore it), Mine shot-able, Charger not pulled by wells while
   dashing, Mines not pulled. Swirl, Blink, Bulwark, Charger, Sower and Splime are pulled like
   other enemies. ENTITY_CAP respected: spawn returns -1, never throw. Mine cap 6 per Sower,
   24 total. Slime cap 3 per Splime, 12 total (skip the drop at the cap).
3. Slime rules: not an enemy and not a kill. Player bullets, drone shots and orbit blades never
   collide with it, drones ignore it, wells do not pull it, a bomb removes every live Slime (no
   score, no geoms). While the ship overlaps a Slime, slime.ts sets w.ship.slowUntil = w.time + 2
   and w.ship.slowFactor = 0.8 (set, never multiplied). The fields and the read in stepShip are
   Forge's wave A work: do not edit stepShip's slow handling, only set the fields.
4. scoring.ts baseValue: Charger 120, Bulwark 150, Blink 130, Swirl 80, Sower 180, Splime 140,
   Mine 0, Slime 0 (countsAsKill false for Mine and Slime). Geom drops per the table. Slime and
   Mine never count toward a destroy objective.
5. Bus: emit 'sim:enemyEnter', 'sim:enemyExit' and 'sim:threat' as the plan defines, threat at
   most every 100 ms, computed with the plan weights (splime 2, slime 0). Mine and Slime emit
   no enter or exit.
6. spawner.ts and the objective code accept the new EnemyKind names (including 'splime') from a
   LevelDef.

Definition of done: npm test and npm run build pass, no any, no new dependency, no per step
allocation, 400 live entities hold.
Tests to add: one per enemy (charger phases and dash end at a wall; bulwark blocks a frontal
bullet and loses HP to a side hit; blink never targetable during the warp and lands 180 to 260
u from the ship; swirl radius closes and dives at 90 u; sower drops a mine every 3 s up to the
cap; mine arms after 0.8 s and expires at 12 s; splime closes on the ship at 0.35 x ship speed
(within 5 percent) and drops a Slime every 3.5 s up to 3 live and 12 total; slime expires at
8 s, a ship overlap sets slowUntil to now plus 2 and slowFactor to 0.8, a second overlap
refreshes the timer and leaves the factor at 0.8 (not 0.64), a bullet passes through it and
both survive, a drone ignores it, a bomb clears all of it, wells do not pull it, it scores 0 and
never counts toward a destroy objective); scoring values; events (enter on 0 to 1, exit on last
removal, threat rate limit and clamp, no enter or exit for Mine and Slime); determinism (same
LevelDef and input log give an identical spawn and event log over 60 s); every existing test
unmodified and green.
End with the hand-off block.
```

### Brief: Foundry (v2 enemy weights and the flat hook)

```text
Foundry: v2 enemies. Branch feat/foundry-v2-enemies. Worktree ../sow-foundry-v2c.
Read first: docs/10-v2-plan.md "Wave V2-C", docs/02-level-generator.md, src/levelgen/
leveldef.ts, generator.ts, validate.ts, tests/levelgen/, tests/qa/__snapshots__.
Own: src/levelgen/, tests/levelgen/. src/core/surface.ts is read only.

Task:
1. GenConfig.enableV2Enemies (default true). With it false, generateLevel and generateEndless
   output is byte identical to v1 for every seed (the existing goldens and tests/qa snapshots
   do not change). With it true, bands 2 and up may use the six new kinds (charger, bulwark,
   blink, swirl, sower, splime) per the plan's target share table. Mine and Slime are hazards
   with no EnemyKind and are never in a roster or a wave. Mechanism is yours but must satisfy:
   the v1 draw sequence is untouched; a
   separate salted stream (as docs/09 section 2.5 does for surface) runs after it and
   substitutes non Grunt roster and wave kinds; band 1 never contains a new kind; roster size
   stays 3 to 6 with Grunt forced; wave spawn units for the new kinds are 1.
2. Output made with the flag on carries generator version 2; output made with the flag off
   still reports version 1, so v1 hashes and anything keyed by them stay valid. Keep
   LEVELDEF_VERSION 1 unless a field shape changes. Record how the version is carried in the
   hand-off. validateLevel accepts the new kinds.
3. Tables: ENEMY_BASE and ENEMY_GEOMS values from the plan (splime 140 and 2 geoms); par and
   star calculations include them (tests/levelgen/par.test.ts and parSim.ts stay green).
   Splime weights per the share table (0, 8, 10, 10 by band); the splime entry is already
   stubbed at zero.
4. generateEndless includes the new kinds in its band 4 ramp when the flag is on.
5. Flat hook: do not change src/core/surface.ts or the `surface: 'flat'` emission and
   validator check. Add a test that every generated level is 'flat' with the flag on and that
   any other value fails validation.
6. In the hand-off list, for run seed 42, the first level index in each band where each of the
   six new kinds is in the roster (Ryan uses these at GC).
7. tests/qa/levelSnapshots.test.ts: pin the existing five pins to enableV2Enemies false so
   their hard coded hashes and snapshot files stay byte for byte unchanged, and add flag on
   pins as new files. Touch nothing else under tests/qa.

Definition of done: npm test and npm run build pass, no any, no new dependency, pure (no
Date, no Math.random, no DOM).
Tests to add: flag off equals v1 over 1000 seeds (hash compare); flag on validates for 1000
seeds; band 1 has no new kind; share of each new kind within 3 points of the table over 1000
seeds per band (splime included); roster 3 to 6 and Grunt present; no roster or wave ever names
a hazard; JSON round trip; Math.random stubbed to throw
still generates; levelHash goldens for the flag on path (seeds 1, 42, 0xDEADBEEF at index 7
and 20); surface stays flat.
End with the hand-off block.
```

### Brief: Glow (enemy visuals and map effects)

```text
Glow: enemy visuals and map effects. Branch feat/glow-enemy-fx. Worktree ../sow-glow-v2c.
Read first: docs/pixi8-cheatsheet.md (mandatory), docs/10-v2-plan.md "Wave V2-C" and
"Performance budget", src/render/shapes.ts, shapeSpecs.ts, neon.ts, fx.ts, renderer.ts.
Own: src/render/, tests/render/. Everything else is read only.

Task:
1. Tune the five enemy palette keys (stubbed in neon.ts) in the hue gaps left by docs/01
   section 11, roughly 10, 240, 335, 160 and 75, and check each against its neighbours. Then
   tune `splime` in the remaining gap and `slime` as the same hue family at lower alpha, so the
   puddle reads as the Splime's and as a hazard, not as an enemy.
2. shapes.ts and shapeSpecs.ts: Charger (arrowhead), Bulwark (square with the shield arc),
   Blink (ring with a gap, ghost and destination ring from the render contract), Swirl
   (spiral glyph), Sower (hexagon with a drop notch), Splime (rounded blob body with a soft
   inner nucleus and a drip notch, swelling over the last 0.5 s before a drop), Mine (small
   diamond, dim until armed, blinking at the end), Slime (a soft blob: irregular rounded
   puddle, translucent fill, brighter rim, edge wobble from hash01(id), no hard polygon; grows
   from half to full radius over 0.3 s and blinks in the last 2 s of 8). Silhouettes must
   differ at 12 u radius, and Slime must read as a floor hazard, never as an enemy.
3. Enemy fx: Charger lane line during the wind up and a dash streak, a Blink arrival flash,
   a Swirl trail, a small splat flash when a Slime lands. Trails use the shared particle pool
   and obey the 80 percent shedding rule.
4. Threat driven map effects from bus 'sim:threat': a slow pulse of the arena wall glow and a
   brief wall flash on kills within 120 u of a wall ('fx:kill' x, y). Each effect is a
   multiplier on its own layer. Never write bloom strength, threshold, saturation, glow width
   or the grid base alpha outside applyNeon.
5. Honour 'neon:changed' on both glow paths and the effects tier (low turns map effects and
   trails off).

Definition of done: npm test and npm run build pass, no any, no v7 APIs, no new dependency.
Desktop Chrome with stress(400, 2000) is a proxy only; report it.
Tests to add: shapes registry covers every Kind including the new ones; render contract
helpers as pure functions (charger phase to lane visibility, blink phase to ghost alpha, mine
arming, slime age to radius scale and blink, splime phase to swell); threat to pulse mapping is monotonic and bounded; tier gating; the neon tests still
assert the SPEC 4 endpoints.
End with the hand-off block.
```

### Merge order and why

1. `feat/foundry-v2-enemies`: pure, flag guarded.
2. `feat/swarm-enemies`: the sim; its tests cover Foundry's new kinds.
3. `feat/glow-enemy-fx`: render only, last so a revert is clean. Then glue (about 4 lines) if any registry needs wiring.

### Gate GC (6:50 to 7:30)

Fable verifies: the shared gate checks; flag off goldens unchanged (existing files under `tests/qa/__snapshots__` untouched, the five hard coded hashes unchanged, new flag on files only added); `git diff main...feat/foundry-v2-enemies -- src/core src/game` is empty; `tests/levelgen/surface.test.ts` unmodified; `grep -rn "mulberry32" src/game` returns nothing; `git diff main...feat/swarm-enemies -- src/game/ship.ts` is empty (Swarm only sets the slow fields, Forge's read stays as merged); no roster or wave in any generated level names Mine or Slime; Foundry's level index list is in the hand-off.

Ryan verifies on device:

```text
V2-GC device check, about 14 minutes. Confirm build id <id>.
1. Use the level indices from Foundry's hand-off: <Fable fills in from the hand-off>. Play one
   level per new enemy, seed 42.
2. For each of Charger, Bulwark, Blink, Swirl, Sower, Splime: can you tell what it will do
   (yes/no) and did you learn a counter (yes/no). Rate fairness 1 unfair to 5 fair.
3. Same level twice. Expect: same enemies, same hash.
4. Turn on Medium space physics and meet a Blink. Note whether it still feels fair.
5. On a Splime level, drive through a Slime puddle. Expect: you slow by about a fifth for
   about two seconds, staying in it keeps you slowed, your shots pass through it, a bomb
   clears every puddle, the puddle is not deadly. Rate the slow 1 unfair to 5 fair.
6. Show FPS on with ?stress=400. Note fps main.
Paste back:
V2-GC: charger=<tell>/<counter>/<fair> bulwark=<tell>/<counter>/<fair> blink=<tell>/<counter>/<fair> swirl=<tell>/<counter>/<fair> sower=<tell>/<counter>/<fair> splime=<tell>/<counter>/<fair> slime=<ok/fail>/<fair> hash_same=<yes/no> fps_main=<n> notes=<text>
```

Pass: all six tell and counter yes, no fairness under 3, slime ok, hash_same yes. A fairness 1 or 2 on Sower triggers cut 5 (D7). A fairness 1 or 2 on Splime or on the Slime slow triggers cut 6, which is below the floor of five, so Fable reports it to Ryan and Ryan decides. A failure on any of Charger, Bulwark, Blink or Swirl is a Swarm fix run, because five is the floor.

### If GC fails

| Failure | Action | Deadline |
|---|---|---|
| Hash differs for one seed | P0, Foundry fix run (`src/levelgen/` only) | before D setup |
| An enemy is unreadable or unfair | Tuning numbers as glue, or a Swarm fix run | before D setup |
| Sower or Mine unfair | Execute cut 5 | 6:50 |
| Splime or Slime unfair, or Slime cap trouble | Tune the slow (factor or seconds) or the drop interval as glue first; if that fails, execute cut 6 after Ryan agrees (below the floor) | 6:50 |
| fps under 60 | Glow fix run first (trails and map effects), then lower the particle cap | before D setup |

---

## Wave V2-D: look and sound (T+7:30 to 10:30)

### Agents and ownership

| Nickname | Model | Branch | Owns (exclusive) | Worktree |
|---|---|---|---|---|
| Glow | opus | feat/glow-lattice | `src/render/` (new `src/render/lattice/`) | ../sow-glow-v2d |
| Chorus | opus | feat/chorus-layers | `src/audio/` | ../sow-chorus-v2d |
| Ledger | sonnet | feat/ledger-fx-music | `src/core/settings.ts`, `src/ui/`, `src/main.ts` | ../sow-ledger-v2d |

Three disjoint lanes. Glow and Chorus both depend on the events Swarm emitted in wave C, now merged. Cut 1 is decided at setup if the Chorus A hand-off reports scheduler glitches, otherwise at GD together with cut 2; cuts 3 and 4 at the end.

### Design: visual targets in words

The GW3 screenshots are not in the repo (bad news item 9), so the targets are written out. Glow reads any images Ryan adds under `docs/ref/` (docs only, never bundled) but the brief must be satisfiable without them.

1. Grid: dense, thin, bright lines on a dark field. Every second line brighter (major) than the rest (minor). Explosions send a visible shock ring through the grid that decays with a slow wobble. Wells pull the grid into a visible dimple. The ship and fast bullets leave a faint wake.
2. Particles: denser, longer lived kill bursts at High; sparks follow the kill colour.
3. Trails: ship, bullets (wave B), dash and swirl (wave C), tuned here.
4. Map effects: the threat pulse and wall flashes from wave C, plus dim drifting dust behind the grid (render only, Standard and High).
5. Brightness stays on the neon slider through `applyNeon` on both glow paths.

Tiers (`src/render/effects.ts`, from wave B):

| Tier | Particle cap | Grid | Trails and map effects |
|---|---|---|---|
| low | 2048 | v1 grid and ripple, unchanged | off |
| standard (default) | 2048 | lattice at 25 u spacing, 4096 node cap | on |
| high | 4096 | lattice at 16 u spacing, 8192 node cap | on, denser bursts |

A pure governor (same pattern as `src/core/perf.ts`, injected measurements) steps the lattice spacing down one notch after 3 s of sustained overload and never steps back up inside a level, so the grid does not flicker.

### Brief: Glow (lattice and tiers)

```text
Glow: lattice. Branch feat/glow-lattice. Worktree ../sow-glow-v2d.
Read first: docs/pixi8-cheatsheet.md (mandatory), docs/10-v2-plan.md "Wave V2-D" and
"Performance budget", src/render/grid.ts, gridGeom.ts, ripple.ts, renderer.ts, effects.ts,
particles.ts, src/core/perf.ts, and node_modules/pixi.js types for Mesh and geometry buffers.
Own: src/render/, tests/render/. Everything else is read only.

Task, in order:
1. Verify against node_modules/pixi.js types and record in the cheatsheet notes whether a Mesh
   with a line list topology and a per frame position buffer update works in 8.22. If not,
   say so first and use the cheapest alternative that avoids Graphics.clear per frame.
2. src/render/lattice/ (pure sim, no pixi import): nodes on a regular grid clipped to the
   arena shape and obstacles (reuse gridGeom), springs to 4 neighbours plus a weak rest
   anchor, Verlet at a fixed 60 Hz sub rate inside the render loop (at most 3 sub steps per
   frame), damping, a displacement clamp so energy stays bounded. Impulses: 'fx:kill' small,
   'fx:death' large, 'fx:bomb' large and expanding, wells as a continuous inward pull read
   from the World each frame (at most 3), ship wake above 120 u/s. Spacing from the tier,
   node caps from the plan. Cosmetic only, never read by the sim, no PRNG.
3. Rendering: one geometry buffer for every segment; major lines every second line; brightness
   from applyNeon's gridAlpha, never set elsewhere; works on both glow paths. Low tier keeps
   the v1 grid and ripple code path unchanged.
4. The spacing governor (pure) and effects tier wiring: High raises the particle cap to 4096
   and burst counts by 1.5 (cap limited).
5. Dust: about 200 dim motes drifting behind the grid, Standard and High, pool allocated once.
6. Optional if time remains: a short tint of the lattice around an impulse in the kill colour.
   List it under Known gaps if skipped.

Definition of done: npm test and npm run build pass, no any, no v7 APIs, no new dependency,
no per frame Graphics.clear for lattice lines, no allocation per frame. Report desktop Chrome
stress(400, 2000) numbers with 4x CPU throttle as a proxy only.
Tests to add (tests/render/lattice/): rest state stays at rest for 10 s; an impulse decays to
rest; displacement bounded over 20 s of fuzzed impulses; node counts per tier on 1800 x 1100
and 2400 x 2400 arenas respect the caps; no node outside the arena shape plus one spacing;
identical impulse logs give identical positions; the governor only steps down, after 3 s;
neon tests still assert the SPEC 4 endpoints.
End with the hand-off block.
```

### Design: music layers and intensity

Wave A built the bed (bass, pad, kick, hat, arp) driven by threat. Wave D adds the enemy layers:

1. Event `sim:enemyEnter` for a kind plays a stinger: one note of the current chord (or its pentatonic neighbour), quantized to the next sixteenth. Then the kind's motif joins, quantized to the next bar, fading in over one bar.
2. A kind's motif leaves 2 bars after `sim:enemyExit`.
3. Twelve kinds (six v1, six new) each get a distinct timbre, register and rhythmic character that mirrors the behaviour: grunts a steady pulse, wanderers a drifting random walk, weavers off beat dodges, pinwheels a rotating cycle, darts fast runs, snakes long sliding notes, chargers a rising wind up each cycle, bulwarks a heavy low pair, blinks a bright staccato with gaps, swirls a looping spiral arpeggio, sowers a sparse tick, splimes a slow wobbling glide between two low notes. Chorus writes the exact table in its hand-off. Hazards (wells, spawners, Mine, Slime) add no layer in v2.0.
4. Motifs are pure functions of (level seed, kind, bar) built on `hash01`. At most 6 kinds are live (roster limit), so at most 6 motif voices plus the bed fit inside the 16 voice cap.
5. Music plays in play and not in menus (D9). Level start calls `startMusic(seed)`; quit and game over call `stopMusic()`.

### Brief: Chorus (enemy layers)

```text
Chorus: enemy layers. Branch feat/chorus-layers. Worktree ../sow-chorus-v2d.
Read first: docs/10-v2-plan.md "Wave V2-D" and "Appendix A", src/audio/music/ (your wave A
work), src/core/events.ts, docs/01 section 6 (behaviours).
Own: src/audio/, tests/audio/. Everything else is read only.

Task:
1. src/audio/music/layers.ts: a registry mapping every EnemyKind (grunt, wanderer, weaver,
   pinwheel, dart, snake, charger, bulwark, blink, swirl, sower, splime) to { stinger degree, motif
   builder, timbre, register, gain }. Distinct timbre and register per kind, character per the
   plan's design section. Motifs are 2 bar loops of 4 to 8 notes, pure functions of
   (seed, kind, bar) on hash01, all notes inside the scale.
2. Lifecycle from bus 'sim:enemyEnter' and 'sim:enemyExit': stinger quantized to the next
   sixteenth, motif quantized to the next bar with a one bar fade in, motif leaves 2 bars after
   exit. Handle exit before the fade in finishes and re-entry during the 2 bar tail.
3. Intensity uses 'sim:threat' as in wave A. Add the layers to the voice budget: bed plus up
   to 6 motifs inside the 16 voice cap, stealing the oldest motif voice first. Summed gain
   at most 1.0.
4. index.ts: startMusic(seed) and stopMusic() unchanged in signature; level restart restarts the
   loop from bar 0 deterministically.
5. Cut 1 note: if Fable cuts motifs beyond the first three kinds, keep every stinger and
   leave the remaining motifs as an empty list entry, not a missing key.

Definition of done: npm test and npm run build pass, no any, no new dependency, no Math.random,
no audio files, no import from src/game, src/ui or src/render.
Tests to add (tests/audio/music/): registry covers every EnemyKind (the test fails if a kind is
added without an entry); every motif note is in the scale; stinger and motif quantization with a
fake clock; exit tail of 2 bars; re-entry during the tail; 6 kinds plus the bed stay under 16
voices and under gain 1.0; determinism per (seed, kind, bar); different kinds produce different
motifs.
End with the hand-off block.
```

### Brief: Ledger (effects tier and music settings)

```text
Ledger: effects and music settings. Branch feat/ledger-fx-music. Worktree ../sow-ledger-v2d.
Read first: docs/10-v2-plan.md "Wave V2-D" and "Appendix B", src/core/settings.ts,
src/ui/settings.ts, slider.ts, src/main.ts, src/audio/music/index.ts.
Own: src/core/settings.ts, src/ui/, src/main.ts, tests/settings/, tests/ui/.

Task:
1. settings.ts: sow.settings.effects ('low' | 'standard' | 'high', default 'standard', invalid
   gives 'standard') and sow.settings.music (integer 0 to 100, default 50; 0 is off), with
   load and save in try/catch.
2. ui/settings.ts: an "Effects" row with Low, Standard, High buttons and a "Music" slider (reuse
   createSlider), 44 CSS px hit height. Add setEffectsTier(tier) and setMusicVolume(v) to
   SettingsEffects. Fable glue wires setEffectsTier to Glow's export; music uses
   src/audio/music/index.ts directly.
3. main.ts: call initMusic() at boot after the audio unlock path, startMusic(levelSeed) at
   level start (Adventure and Endless), stopMusic() on quit and game over, nothing in menus.
   Keep the temporary ?music=1 hook working.

Definition of done: npm test and npm run build pass, no any, no new dependency.
Tests to add: tests/settings/effectsMusic.test.ts (defaults, round trip, invalid values, storage
throwing, music clamps 0 to 100); tests/ui/settings.test.ts additions (tier buttons, slider
commit persists, effect calls once per change); a flow test that menus never start music.
End with the hand-off block.
```

### Merge order and why

1. `feat/glow-lattice`: render only.
2. `feat/chorus-layers`: audio only, covered by the registry test.
3. `feat/ledger-fx-music`, then glue (about 4 lines): wire `setEffectsTier`.

### Gate GD (9:40 to 10:30)

Fable verifies: the shared gate checks; `grep -rnE "from '\.\./(game|ui)" src/audio src/render` returns nothing; no per frame `clear()` in `src/render/lattice/`; `git ls-files | grep -E "\.(mp3|ogg|wav|flac|m4a|png|jpg)$"` shows only the PWA icons; the Low tier still draws the v1 grid; every glow related write outside `neon.ts` and `neonApply.ts` is a multiplier on its own layer (Fable reads the diff).

Ryan verifies on device:

```text
V2-GD device check, about 15 minutes. Confirm build id <id>.
1. Settings > Effects. For Low, Standard and High: unfolded, ?stress=400, Show FPS on. Note
   the average fps, then fire a bomb and note the lowest fps you saw.
2. On Standard play a normal level for 2 minutes. Rate grid deformation, trails, particles and map
   effects, 1 dull to 5 close to your reference.
3. Settings > Music at 50. Start a level. Expect music after the first tap.
4. Watch the layers. When a new enemy type appears a note sounds and later its motif joins.
   When that type is gone the motif leaves about 2 bars later. Rate ok or fail.
5. Compare an empty arena with a crowded wave. Expect clearly more drive when crowded.
6. Pause and resume. Fold and unfold mid level. Expect: music stops and resumes cleanly, no reload.
7. Drag the music slider to 0. Expect silence while sound effects still play.
Paste back:
V2-GD: fps_low=<avg>/<bomb> fps_standard=<avg>/<bomb> fps_high=<avg>/<bomb> grid=<1-5> trails=<1-5> particles=<1-5> map=<1-5> music_layers=<ok/fail> music_intensity=<ok/fail> music_glitch=<none/some/bad> pause_fold_music=<ok/fail> music_zero=<ok/fail> notes=<text>
```

Pass: Standard at 60 or better with the bomb dip above 50; no `bad` glitch; the rest ok. High is the default only if its numbers also hold 60 (D8). A Standard miss triggers cut 4 in order.

### If GD fails

| Failure | Action | Deadline |
|---|---|---|
| Standard under 60 | Cut 4 in order (spacing 33 u, then Low); Glow fix run owning `src/render/` only | 10:00 |
| Music glitches or stutters | Chorus fix run (voice count, lookahead); if unresolved, cut 1 then cut 2 | 10:00 |
| Music dies after fold | Chorus fix run for AudioContext resume; precedent U4 | before E |
| Settings do not persist | Ledger fix run | before E |

---

## Wave V2-E: harden (T+10:30 to 12:30)

### Agents and ownership

| Nickname | Model | Branch | Owns (exclusive) |
|---|---|---|---|
| Proctor | sonnet | feat/proctor-v2-harden | `tests/qa/`, `docs/qa/`, `docs/device-checklist.md` |
| Fixers: the roster builder whose area holds the most open P0 and P1 (default Swarm, then Glow); up to two | opus | feat/<nickname>-v2-fixes | only the files named in the brief |
| Scribe | sonnet | feat/scribe-v2e-handoff | `docs/STATUS.md` and `docs/DECISIONS.md` drafts, `docs/handoffs/` |

### Brief: Proctor (v2 harden)

```text
Proctor: v2 harden. Branch feat/proctor-v2-harden. Worktree ../sow-proctor-v2e.
Read first: docs/10-v2-plan.md, docs/STATUS.md, docs/device-checklist.md, docs/qa/bugs.md.
Own: tests/qa/, docs/qa/, docs/device-checklist.md.

Task:
1. Triage the GA to GD pastes (Fable supplies them) and STATUS open bugs into docs/qa/bugs.md,
   a v2 section: id, P0 to P2, repro, owning directory, owner nickname. Deliver by 10:50.
2. tests/qa/: generator sweep over 5000 seeds with enableV2Enemies true and false (false equals
   the v1 hash); weapon drop log replay (same LevelDef and recorded kill log give an identical
   drop log); physics replay (same input log, identical ship path, per level); the storage key
   set (sow.settings.spacePhysics, weaponPickups, effects, music) has no collisions and keeps
   the sow. prefix; no audio, image or font files in the repo except the PWA icons; update the
   ownership audit for the v2 owner table.
3. docs/device-checklist.md: add a v2 section. One line per GA to GD item with its pass criteria,
   a result column and a notes column, then v1 regression lines for touch, fold, offline and
   fps, then one paste-back block "V2-G4: <id>=<pass/fail> ... build=<id>". Deliver by 11:20.
4. Run npm test 10 times; list flakes with file and line. Report bundle size from npm run
   build and flag gzipped JS over 1.5 MB.
Definition of done: bugs.md by 10:50, checklist by 11:20, 10 green runs or flakes listed.
End with the hand-off block.
```

### Brief: fixer (template)

```text
<Nickname>: v2 fixes. Branch feat/<nickname>-v2-fixes. Worktree ../sow-<nickname>-v2e.
Read first: docs/STATUS.md, docs/qa/bugs.md, docs/pixi8-cheatsheet.md.
Own only these files: <Fable lists them>. Everything else is read only.

Task: fix in this order: <Fable pastes P0 then P1 ids>.
One commit per bug: "fix(<id>): <summary>". No refactors, no features. Each fix gets a
regression test in the owning tests/<area>/ directory. Stop at 11:30 whatever the state.
Definition of done: npm test and npm run build pass after every commit.
End with the hand-off block listing fixed and unfixed ids.
```

### Merge order

1. `feat/proctor-v2-harden`: tests and docs only. 2. Fixers, one at a time. 3. `feat/scribe-v2e-handoff`.

### Gate GE (11:50 to 12:30)

Fable verifies: `npm test` green three runs in a row; no P0 open; every fix has a regression test; flags off golden unchanged (the Off invariant); `docs/STATUS.md` current; the shared gate checks.

Ryan verifies: the v2 section of `docs/device-checklist.md`, about 25 minutes, and pastes the `V2-G4` block. On pass:

```json
{ "type": "shell", "nickname": "fable", "slug": "tag-v2", "cwd": ".", "cmd": "git checkout main && git tag -a v2.0.0 -m 'Shape of War v2.0.0' && git push origin v2.0.0" }
```

### If GE fails

| Failure | Action | Deadline |
|---|---|---|
| The Off invariant, touch, neon slider or PWA install fails | Fixer continues on that item only | until the credits end |
| Other items fail | Execute the next cut, tag with the cut logged | 12:50 |
| Ryan unavailable or credits about to expire | Tag `v2.0.0-rc1` from the last green gate and log unfinished items; `v1.0.0` stays the rollback | at the moment |

---

## Session hygiene

Same as docs/05: split Fable's session at every landing boundary (T+0:30, 2:30, 5:00, 7:30, 10:30, 12:30) with the one line "Resume Shape of War from docs/STATUS.md". Scribe drafts the STATUS update on `feat/scribe-v2<w>-handoff` owning only `docs/STATUS.md`, `docs/DECISIONS.md` and `docs/handoffs/`. Clean up worktrees one shell job per merged branch (docs/05 pattern). STATUS gains the rows "v2 gate log" and "Cuts taken (v2)".

## Questions for Ryan

Ryan replied on 2026-10-28 with seven numbered items that cover these questions as follows (his item number in brackets). His item numbers differ from the numbers below: item 3 answers questions 3 and 4, item 4 answers 6, item 5 answers 8, item 6 answers 11 and item 7 answers 10. Questions he did not cover keep their bracketed default and say so.

1. Exact expiry hour of the $192.49 credits on 2026-10-29, and is the second $200 (expires 2026-11-29) still unspent and usable for this work? Answered [item 1]: the second $200 credit is usable, so budget is not the constraint. The exact expiry hour of the first credit was not given and no longer gates the plan.
2. When are you free for five gates (GA to GE, 10 to 25 minutes each) and the B9 recheck? Answered [item 2]: all five gates are available.
3. Space physics: does "exponential acceleration" mean the ship eases toward the stick velocity, or thrust that builds up the longer you hold? Should high ever coast forever? Should reversing get a brake assist? Answered [item 3]: thrust, not easing. Acceleration is `a(t) = A_MIN x exp(t / TAU)` capped at `A_MAX`, with `t` the continuous hold time; velocity gains `a x dir x dt`, capped at `V_MAX`; on release the ship drifts under exponential drag `DRAG`. Brake assist on reversing: when the stick opposes the velocity (dot below 0) the deceleration is multiplied by `BRAKE`. Low, Medium and High each set the row (A_MIN, TAU, A_MAX, V_MAX, DRAG, BRAKE). Off reproduces v1 exactly and every existing feel test passes. Starting numbers are in "Design: the physics model", tuned at GA. Exponential drag never reaches zero by itself, so the snap to rest below 3 u/s (so no level coasts forever) is Scribe's addition for Fable to confirm.
4. Walls under physics: slide (v1) or bounce? Answered [item 3]: walls slide, no bounce.
5. Separate score tables per space physics level? Not covered by Ryan's reply. Default stands: no, one table, the level is shown on the results line. No docs/10 brief gives Ledger the results line task (open).
6. Weapon acquisition: pickups from kills or unlock by level? Does death lose the weapon? Weapon length 20 s? Answered [item 4]: pickups from kills, lost on death, 20 s.
7. Weapon pickups on by default? Not covered by Ryan's reply. Default stands: on; the Settings switch turns them off.
8. Enemies: Charger, Bulwark, Blink, Swirl, Sower (with Mines). Any you dislike, or behaviours you want instead? Answered [item 5]: as drafted plus a sixth enemy, Splime. It moves slowly (about 0.35 x ship speed) toward the ship and every few seconds drops Space Slime, a static puddle hazard (radius about 40 u, lifetime about 8 s, a few live per Splime). Slime is not deadly; a ship touching it is slowed 20 percent for 2 s (a ship speed multiplier channel, timer refreshed on each contact, not stacking below 0.8). Bullets pass through Slime, a bomb clears all of it, drones ignore it. New names: Kinds `Splime` and `Slime`, `EnemyKind` `'splime'`, palette keys `splime` and `slime`. Slime is drawn as a soft blob and is a hazard, not an enemy, for the destroy objective. Cut order: Sower and Mine first, Splime and Slime second. Floor five of six.
9. Bands 2 and up change for the same run seed after v2. Levels 1 to 5, unlocked progress and old scores stay. Acceptable? Not covered by Ryan's reply. Default stands: yes, behind `enableV2Enemies`.
10. Reference images: put 3 to 6 GW3 screenshots under `docs/ref/` (docs only, never shipped). Which matter most: grid deformation, trails, colour, background? Answered [item 7]: priority grid deformation, trails, particles. Ryan will add screenshots to `docs/ref/`. Background and colour were not ranked.
11. Music taste: mood, key and tempo? Menu music? Default volume? Answered [item 6]: music as drafted (minor key, A minor, 120 BPM, in play only, default volume 50).
12. Is the 60 fps main screen floor strict for Standard, with High opt in only if it also holds 60? Not covered by Ryan's reply. Default stands: yes.
13. Restart the dispatcher with `MAX_BUDGET_USD=8` for v2? Not covered by Ryan's reply. Default stands: yes (still sensible with the larger pool).
14. Chorus as a tenth roster nickname (SPEC 7.3 lists nine)? Not covered by Ryan's reply. Default stands: yes, through the addendum.
15. Curved surfaces: confirm they stay a flat hook only for this plan. Not covered by Ryan's reply. Default stands: yes.

## Known gaps in this plan

- Gravity wells do not transfer momentum under space physics (Swarm optional item in B).
- No sound cues for weapon pickups or the Blink warp; hazards add no music layer.
- No bounce and no per level score tables for physics. (Brake assist is now in the model.)
- Detonate versus Slime is not specified. Swarm gives it no effect on Slime unless Fable says otherwise.
- Splime drop interval, per Splime and total Slime caps, HP, score, shares and threat weights are Scribe's starting values, not Ryan's.
- Whether a half deflected stick should scale V_MAX as well as thrust is not specified; the plan scales thrust only.
- No level based weapon loadout (rejected as default, D5).
- Music has no menu track and no per seed key change.
- The lattice impulse tint is optional in Glow D.
- Nothing here is measured on the Fold yet: every number is a starting value tuned at its gate.

## Appendix A: Chorus roster file (proposal, not created)

Fable creates `.claude/agents/chorus.md` from this text at V2-W0. The dispatcher refuses an agent job without it (`scripts/dispatcher.mjs`, roster check). Chorus is not in SPEC 7.3; the addendum adds it.

````markdown
---
name: chorus
description: Delegate to Chorus for the dynamic generative music system: WebAudio synthesis only, a composed base track, per enemy motifs and threat driven intensity.
model: opus
tools: Read, Edit, Write, Bash, Grep, Glob
---

# Chorus

You are Chorus, music builder for Shape of War v2. You own the generative music engine: a composed base track, one motif per enemy type that enters the arena, and intensity that follows threat. SPEC.md and the v2 SPEC addendum are canon; CLAUDE.md and docs/10-v2-plan.md are your rules. Fable, the lead orchestrator in a Claude Desktop project, queues your brief; the dispatcher launches you headless (`claude -p`) in your worktree with this file appended to your system prompt. Your final message is the hand-off; it lands in `.agents/runs/<id>/handoff.md`. Only Fable merges.

## Owned directories
- src/audio/ (v2 waves A and D; Glow does not touch src/audio in v2)
- tests/audio/

Ownership per wave is in the brief Fable sends. If the brief and this list differ, the brief wins for that wave.

## Forbidden
- src/game/, src/ui/, src/render/, src/levelgen/, src/input/, src/core/ (events are consumed here, never edited; ask under Requests)
- package.json, CLAUDE.md, SPEC.md, docs/STATUS.md (Fable only)
- Any file not listed as owned in your brief is read only. Need a change there? Put it in the hand-off.

## Coding standards
- TypeScript strict. No `any`, no `as any`, no ts-ignore.
- Small pure functions. Side effects at the edges. Pattern generation, scale maths, intensity mapping and scheduling decisions are pure and tested in node.
- Vitest for every pure module, in tests/audio/.
- No new dependencies. If one is unavoidable, stub locally and list it in the hand-off with the reason.
- No features outside your brief and the v2 SPEC addendum. Ideas go under known gaps.
- No em or en dashes in code comments or docs.

## Music rules
- Web Audio API only. No audio files, no samples, no fonts, no images.
- The composition is original. Do not reproduce any melody, bass line or rhythm from an existing game or song.
- Deterministic: a note pattern is a pure function of (level seed, kind, bar) built on the stateless hash01 from src/core/rng.ts. Never Math.random, never an advancing PRNG.
- Lookahead scheduling: a timer every 25 ms schedules notes 100 ms ahead on AudioContext.currentTime. Never start a note from timer time. Inject the clock and timer so tests run in node.
- Budget: music voice cap 16, sfx cap 24 untouched, summed layer gain at most 1.0, music master at most 0.35 of the synth master. Dispose nodes after each note.
- Subscribe to the event bus. Never import src/game or src/ui. Pause, a hidden tab and fold suspend scheduling; resume on the next bar line.

## Branch rule
Work only on feat/chorus-<slug> in the worktree named in your brief. Never commit to main, never merge, never rebase or force push. Commit small, message "chorus: <summary>".

## Definition of done
- [ ] Every task item in the brief done, or listed as a known gap.
- [ ] Tests named in the brief added and passing.
- [ ] `npm test && npm run build` green on the branch.
- [ ] No file outside owned directories changed (`git diff --stat main...HEAD`).
- [ ] Hand-off printed.

## Hand-off format
Print this block as your final message, filled in:
```text
HAND-OFF Chorus
Branch: feat/chorus-<slug>
Files changed: <path list>
Tests added: <file: what each asserts>
Test result: <npm test summary line>, build <ok/fail>
Exports for wiring: <function names and signatures, or none>
New dependencies requested: <name@version and reason, or none>
Verify on device: <numbered steps and expected result, or n/a>
Known gaps: <list, or none>
```
````

## Appendix B: Settings keys and bus events added

Settings (every read and write in try/catch with a default, docs/03 section 8; the `glowPath` pattern):

| Key | Values | Default | Owner | Wave |
|---|---|---|---|---|
| `sow.settings.spacePhysics` | `off`, `low`, `medium`, `high` | `off` | Ledger | A |
| `sow.settings.weaponPickups` | `0`, `1` | `1` | Ledger | B |
| `sow.settings.effects` | `low`, `standard`, `high` | `standard` | Ledger | D |
| `sow.settings.music` | integer 0 to 100 | 50 | Ledger | D |

Bus events, additive to `src/core/events.ts`, stubbed at V2-W0 (`WeaponKind = 'spread' | 'rapid' | 'pierce' | 'orbit'`):

| Event | Payload | Emitter | Consumers |
|---|---|---|---|
| `sim:enemyEnter` | `{ kind: EnemyKind; live: number }` | Swarm (C) | Chorus |
| `sim:enemyExit` | `{ kind: EnemyKind }` | Swarm (C) | Chorus |
| `sim:threat` | `{ level: number }`, at most every 100 ms | Swarm (C) | Chorus, Glow |
| `fx:pickup` | `{ x: number; y: number; weapon: WeaponKind }` | Swarm (B) | Glow |
| `hud:weapon` | `{ kind: WeaponKind; remaining: number; total: number }`, at most every 100 ms and on change | Swarm (B) | Ledger |

New `Kind` values (appended): `WeaponPickup, Charger, Bulwark, Blink, Swirl, Sower, Mine` (stubbed at 47b727f), then `Splime, Slime` (follow-up stubs). New `EnemyKind` names: `charger`, `bulwark`, `blink`, `swirl`, `sower`, and `splime` (follow-up stubs). Mine and Slime are hazard Kinds with no `EnemyKind`. New palette keys in `src/render/neon.ts`: the five enemies and three weapons (stubbed), then `splime` and `slime` (follow-up stubs).

Ship state fields (Forge, wave A, not bus events): `slowUntil` (a `w.time` value, default 0) and `slowFactor` (default 1) on `ShipState`, set by Swarm's Slime in wave C.

