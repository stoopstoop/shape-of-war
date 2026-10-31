# Swarm: weapons-combine

Create and check out branch feat/swarm-weapons-combine before any edit. Never push main.

Branch: feat/swarm-weapons-combine (create and check out before any edit; never push main)
Model: opus
Owned paths: src/game/weapons.ts, src/game/pickup.ts, src/game/bullets.ts, src/game/combat.ts, src/game/drones.ts, src/game/state.ts (weapon and drone fields only), src/core/events.ts (weapon and drone events only), tests/game/weapon*.test.ts, tests/game/drone*.test.ts
Do not touch: src/game/bosses/ (a parallel session owns it), src/render/, src/audio/, src/ui/
Read first: src/game/weapons.ts, src/game/pickup.ts, src/game/drones.ts, src/core/events.ts, docs/13-v3-spec-addendum.md SPEC 3.5 section only (search for "Weapon combining" and "Drone pickups", read those two subsections, nothing else)

## Goal
Wave D of the v3 plan, the sim side: weapon combining, the orbit redesign Ryan asked for, and drone pickups. Visuals, HUD and sounds follow in later sessions off the events you emit.

## Acceptance
- Orbit redesign (Ryan): orbit no longer fires a forward bullet. The orbiting shield of blades stays; aiming with the right stick expands the shield toward the aim direction (the blades on the aim side push out to 1.8x radius and back over 0.4 s while the stick is held) to push and hit enemies in that direction; the shield carries 4 to 6 spikes (fixed to the orbit, style 3 bullets) that damage enemies exactly like a blade hit. Deterministic; tests for the expansion curve and spike count.
- Combining: collecting a second weapon kind while one is active produces the pair weapon for a fresh 20 s: Hail (spread plus rapid), Trident (spread plus pierce), Halo (spread plus orbit), Needle (rapid plus pierce), Whirl (rapid plus orbit), Eclipse (pierce plus orbit); spread is droppable while another weapon is active; a third pickup replaces the older ingredient; the next drop arrives within 12 kills while a weapon is active. Each pair has a defined behaviour (document the six in the hand off: for example Needle is rapid pierce bullets, Halo is spread plus the shield, Eclipse is piercing spikes on the shield). Emit bus 'fx:weaponCombine' { x, y, weapon } on a combination and 'fx:weaponExpire' { weapon } on expiry; keep 'hud:weapon' with the pair name.
- Drone pickups: a separate pickup kind that arms the drone for 20 s with one of four modes chosen by a salted hash: homing (drone shots home), detach (the drone leaves the ship and acts as a decoy: enemies whose chase target is the ship prefer the decoy while it lives, via targetOf; it returns at expiry), rapid, double (a second drone body for the duration). A new drone pickup replaces the old mode. Emit 'fx:droneArm' { mode, secondsLeft } and 'fx:droneExpire'. Enemy targeting for the decoy must keep every v2 golden identical when no decoy is live.
- Tests for each pair, the replacement rule, the drop cadence, each drone mode, decoy targeting, determinism, and that level snapshots and the weapon drop replay goldens are updated only where this spec requires (list old and new values).
- npm test and npm run build pass on the branch

## Rules
TypeScript strict, no any. PixiJS v8 only. No Math.random outside src/core/rng.ts. Touch only, no keyboard, mouse or gamepad handlers. applyNeon(n) is the only neon entry point. No new runtime dependency without declaring it in the hand off. No audio, image or font assets beyond PWA icons. Vitest for every pure module. No em or en dashes in any file you write. tests/qa level snapshots must stay unchanged. Keep the Standard tier fps budget (lowest 58 in a boss fight on the device): one geometry buffer per layer, no per frame allocation.

## Working rules
Read only the files you need, one at a time; never read docs/12-v3-plan.md or docs/13-v3-spec-addendum.md in full (this brief carries what you need). While working run `npx vitest run <your test dir> --reporter=dot 2>&1 | tail -20`; run the full `npm test 2>&1 | tail -15` and `npm run build 2>&1 | tail -5` once before the commit. No exploratory refactors.

## Hand off
Write docs/handoffs/swarm-weapons-combine.md (under 50 lines): what changed, files touched, tests added, test and build output summary, risks, open questions, any dependency you want approved, an exact device check for Ryan written in words, and the session URL (echo https://claude.ai/code/${CLAUDE_CODE_REMOTE_SESSION_ID/#cse_/session_}). Commit and push the branch. Stop.
