# Swarm: boss-abilities

Create and check out branch feat/swarm-boss-abilities before any edit. Never push main.

Branch: feat/swarm-boss-abilities (create and check out before any edit; never push main)
Model: opus
Owned paths: src/game/bosses/, tests/game/boss*.test.ts (new test files for this work)
Do not touch: src/game/weapons.ts, src/game/pickup.ts, src/game/bullets.ts, src/game/drones.ts, src/core/events.ts (a parallel session owns them), src/render/, src/audio/, src/ui/
Read first: src/game/bosses/core.ts, kit.ts, types.ts, brood.ts (the split pattern from v3.1), warden.ts, gravitas.ts, mirage.ts

## Goal
Ryan's direction after G3C: bosses must differ in abilities, not only looks. Two new abilities and two more splits, using only the existing bus events (sim:bossCrack, sim:bossSplit, sim:bossExposed, sim:bossWindow, hud:boss) so no event declaration changes are needed.

## Acceptance
- Shield and swarm (Warden, phase 2 onward): every 14 s Warden stops, becomes invulnerable for 4 s (core closed, sim:bossExposed false, a visible state field the renderer can read: a new BossState flag `shielded` with a timer), and during the shield releases 8 to 12 small fast "hornet" adds (a new BossPart type Hornet, radius 10, 1 HP, 260 u/s, chase for 5 s then die on their own) in two bursts, "like bees leaving a hive"; bomb clears hornets; hornets never spawn beyond the add cap; after the shield drops the core is exposed for 2 s (a guaranteed window).
- Gravitas split: at the stage 2 crack Gravitas splits into two half mass wells (BossPart type Gravitant, radius 28, 160 HP each) that orbit each other and pull with half strength each; killing both ends the fight and awards the bonus once; hud:boss hp is the sum.
- Mirage split: at stage 2 Mirage leaves two mirror images (BossPart type Mirror, 1 HP, no contact kill) that copy its last two positions with a 0.6 s delay while the real body keeps warping; shooting a mirror pops it with no score; mirrors respawn every 6 s while Mirage lives.
- Every new part uses targetOf for chase, respects hazard and add caps (8 hazards, 8 adds, 4 parts) and emits sim:bossSplit { id, parts } once per split. Existing boss tests stay green and unmodified; new tests cover each ability's timing, caps, determinism over 60 s, fight end and bonus once.
- Hand off lists the render contract for each new part (PartType value, w.a, radius, w.rot meaning) so Glow can draw them in the next wave; until then they draw with the generic part look.
- npm test and npm run build pass on the branch

## Rules
TypeScript strict, no any. PixiJS v8 only. No Math.random outside src/core/rng.ts. Touch only, no keyboard, mouse or gamepad handlers. applyNeon(n) is the only neon entry point. No new runtime dependency without declaring it in the hand off. No audio, image or font assets beyond PWA icons. Vitest for every pure module. No em or en dashes in any file you write. tests/qa level snapshots must stay unchanged. Keep the Standard tier fps budget (lowest 58 in a boss fight on the device): one geometry buffer per layer, no per frame allocation.

## Working rules
Read only the files you need, one at a time; never read docs/12-v3-plan.md or docs/13-v3-spec-addendum.md in full (this brief carries what you need). While working run `npx vitest run <your test dir> --reporter=dot 2>&1 | tail -20`; run the full `npm test 2>&1 | tail -15` and `npm run build 2>&1 | tail -5` once before the commit. No exploratory refactors.

## Hand off
Write docs/handoffs/swarm-boss-abilities.md (under 50 lines): what changed, files touched, tests added, test and build output summary, risks, open questions, any dependency you want approved, an exact device check for Ryan written in words, and the session URL (echo https://claude.ai/code/${CLAUDE_CODE_REMOTE_SESSION_ID/#cse_/session_}). Commit and push the branch. Stop.
