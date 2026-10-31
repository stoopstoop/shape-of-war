# Chorus: battle-polish

Create and check out branch feat/chorus-battle-polish before any edit. Never push main.

Branch: feat/chorus-battle-polish (create and check out before any edit; never push main)
Model: opus
Owned paths: src/audio/, tests/audio/
Do not touch: anything outside src/audio and tests/audio
Read first: src/audio/music/boss.ts, src/audio/music/tunes.ts (or the battle track file you find), src/audio/music/index.ts

## Goal
Ryan rated the three battle tracks 3 of 5 and asked that users "become accustomed to the type of battle when they hear the change". Make the boss music unmistakable and more intense without breaking the 4 s Prism window alignment.

## Acceptance
- Each of the three battle tracks gets a signature intro hit (one bar) that plays at the cross fade so the switch is obvious, a driving kick and snare pattern at double density compared with the level tunes, a bass that moves (octave jumps on bar 4 and 8), and a hook line in the lead voice that returns every 8 bars; all in minor keys; the three are clearly different from each other (different key, different hook rhythm, different drum feel).
- Intensity follows the boss: phase changes (sim:bossPhase) raise the filter and add a layer; the exposed window (sim:bossWindow open) ducks the drums 6 dB and lifts the hook; the defeat (sim:bossDown) resolves on a major chord then returns to the level tune after two bars.
- Also: new weapon and drone cues on the new events 'fx:weaponCombine' (a rising three note upgrade sound in key), 'fx:weaponExpire' (a short falling two note), 'fx:droneArm' and 'fx:droneExpire' (lighter variants); subscribe by name, they arrive from a parallel session, so guard with typeof and never throw if the event is absent.
- Tests: each track validates (minor key, chords, hook present), the intro hit lands on the cross fade bar, ducking during the window, the new cues scheduled in key and rate limited, voice cap holds in a tier 4 fight with every layer active.
- npm test and npm run build pass on the branch

## Rules
TypeScript strict, no any. PixiJS v8 only. No Math.random outside src/core/rng.ts. Touch only, no keyboard, mouse or gamepad handlers. applyNeon(n) is the only neon entry point. No new runtime dependency without declaring it in the hand off. No audio, image or font assets beyond PWA icons. Vitest for every pure module. No em or en dashes in any file you write. tests/qa level snapshots must stay unchanged. Keep the Standard tier fps budget (lowest 58 in a boss fight on the device): one geometry buffer per layer, no per frame allocation.

## Working rules
Read only the files you need, one at a time; never read docs/12-v3-plan.md or docs/13-v3-spec-addendum.md in full (this brief carries what you need). While working run `npx vitest run <your test dir> --reporter=dot 2>&1 | tail -20`; run the full `npm test 2>&1 | tail -15` and `npm run build 2>&1 | tail -5` once before the commit. No exploratory refactors.

## Hand off
Write docs/handoffs/chorus-battle-polish.md (under 50 lines): what changed, files touched, tests added, test and build output summary, risks, open questions, any dependency you want approved, an exact device check for Ryan written in words, and the session URL (echo https://claude.ai/code/${CLAUDE_CODE_REMOTE_SESSION_ID/#cse_/session_}). Commit and push the branch. Stop.
