# Glow: look-v32

Create and check out branch feat/glow-look-v32 before any edit. Never push main.

Branch: feat/glow-look-v32 (create and check out before any edit; never push main)
Model: opus
Owned paths: src/render/, tests/render/
Do not touch: src/game/, src/audio/, src/ui/, src/input/, docs/ other than your hand off
Read first: docs/pixi8-cheatsheet.md (Graphics and Mesh sections), src/render/bossLook.ts, src/render/bossShapes.ts, the crack module you find under src/render/ (search for bossCrack), src/render/enemyFx.ts for the gravity well draw path

## Goal
Three device verified failures from the v3.1 retest (build 3cf8ace), in Ryan's words. (1) Cracks: "still cartoon like lines with sharp black strokes"; he wants "natural cracks and degradation from battle" that "appear similar to the colouring and look of the boss as one would expect after being in battle". (2) "Ember and Spindle look similar. Ember should be fire like with flames in which the flames are multi coloured similar to how fire shifts colour and shimmers." (3) Gravity well supernova: works but "is the same colour. It must be majestic and shimmer with colour, go from primary red as it is now to exploding into many colours that pulsate and shimmer."

## Acceptance
- Cracks: no black or dark strokes anywhere; no straight jagged polylines. Degradation is drawn as: outline segments that dim and drop out at the crack sites (gaps in the neon line), a soft inner fracture glow in the boss primary hue at about 35 percent brightness that spreads from the hit side with a noisy, branching edge (use a hashed noise table, no PRNG), scorch darkening of the fill near the gaps (lower alpha, not black), fragments that are pieces of the outline in the boss colour tumbling away and fading in 1.2 s, and after stage 2 an uneven flicker of the whole outline. Both crack stages read as damage on a 7 inch screen at arm's length. A pure helper produces the gap list and fracture polygon for a given stage and seed, with tests.
- Ember: redrawn as a flame body: a diamond core wrapped in 5 to 7 flame tongues that animate upward (vertex offsets from a hashed noise table on w.time), each tongue's colour shifting through deep red, orange, yellow and white tip over its height, with a slow shimmer so the hue mix changes every 0.5 s; dash and fan attacks use the same flame palette. Spindle stays yellow with the cyan axis but gains a thin rotating white spindle thread and sharp tips so the two silhouettes differ at a glance. A test asserts the Ember palette uses at least four distinct hues and that Ember and Spindle primary hues differ by at least 30 degrees.
- Supernova: on sim:wellNova the well transitions over 1 s from its red to a multicolour state: a two arm spiral whose arm colour cycles through at least six hues along its length (one full cycle per 2 s), shimmering particles in the swirl that pulse in brightness, a pulsating outer halo whose radius breathes between 1.0x and 1.15x of the nova pull radius, and the outward drifting harmless shimmer stream already present now coloured per particle from the same cycle. A pure hue cycle helper with tests; the budget test shows the nova adds at most 96 particles and one extra draw per well.
- npm test and npm run build pass on the branch

## Rules
TypeScript strict, no any. PixiJS v8 only. No Math.random outside src/core/rng.ts. Touch only, no keyboard, mouse or gamepad handlers. applyNeon(n) is the only neon entry point. No new runtime dependency without declaring it in the hand off. No audio, image or font assets beyond PWA icons. Vitest for every pure module. No em or en dashes in any file you write. tests/qa level snapshots must stay unchanged. Keep the Standard tier fps budget (lowest 58 in a boss fight on the device): one geometry buffer per layer, no per frame allocation.

## Working rules
Read only the files you need, one at a time; never read docs/12-v3-plan.md or docs/13-v3-spec-addendum.md in full (this brief carries what you need). While working run `npx vitest run <your test dir> --reporter=dot 2>&1 | tail -20`; run the full `npm test 2>&1 | tail -15` and `npm run build 2>&1 | tail -5` once before the commit. No exploratory refactors.

## Hand off
Write docs/handoffs/glow-look-v32.md (under 50 lines): what changed, files touched, tests added, test and build output summary, risks, open questions, any dependency you want approved, an exact device check for Ryan written in words, and the session URL (echo https://claude.ai/code/${CLAUDE_CODE_REMOTE_SESSION_ID/#cse_/session_}). Commit and push the branch. Stop.
