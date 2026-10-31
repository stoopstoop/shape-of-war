# Glow hand off: look v32

Branch: feat/glow-look-v32 (from main 8a312ef)
Session: https://claude.ai/code/session_018Gwqi51KevzKtDahLjTxuF

## What changed
- Cracks: every black stroke is gone. Gaps are now cut out of the neon outline with the PixiJS `erase` blend on a new `bossErase` Graphics just under `bossOver`. The core of each gap drops out, its shoulders dim on an uneven flicker, and the fill beside it scorches (loses alpha, not painted dark). A soft fracture glow in the boss hue at 35 percent brightness spreads in from the hit side as a filled polygon with a noisy, branching edge. Outline fragments still tumble away in the boss colour and fade over 1.2 s. After stage 2 the whole outline flickers unevenly (erase alpha on a noise clock). The new pure helper `crackLayout(stage, seed, angle)` in `src/render/bossDamage.ts` builds the gap list and fracture polygon from a hashed noise table, with no PRNG.
- Ember: the body is now a diamond core (`emberDiamond`) wrapped in 6 animated flame tongues (`src/render/emberFlame.ts`). The tongues lick toward screen up whatever the facing, with motion from the noise table on `w.time`. Each tongue shades in 4 bands, deep red to orange, amber, yellow and a white hot tip, and the mix reshuffles every 0.5 s. The dash lane, flame trail, sparks and fan bullets (tier 2 enemy bullets while Ember lives) all take the same flame palette. Ember's body primary is now `bossRed` (hue 4), 41 degrees from Spindle's gold, and its core accent is white hot yellow.
- Spindle: the star waist went from 0.36 to 0.24 so the four tips read sharp, the tip accents are needles instead of dots, and two thin white thread strands wind round the axis and turn.
- Supernova: over 1 s after `sim:wellNova` the well shifts from the ring red to the cycle. The two arm spiral cycles through an 8 hue palette ring along its length, one full cycle per 2 s, and swirl points (now 24) pulse in brightness. A halo breathes between 1.0x and 1.15x of the pull radius, and each stream particle gets its own colour from the cycle. Everything still draws into the one shared nova Graphics.

## Files touched
src/render: bossDamage.ts (new), emberFlame.ts (new), bossIdentity.ts, bossLook.ts, bossShapes.ts, enemyBulletFx.ts, particles.ts, renderer.ts, wellNova.ts
tests/render: bossDamage.test.ts (new, 12), emberFlame.test.ts (new, 8), wellNova.test.ts (+6), bossIdentity.test.ts (3 old fracture network tests removed, colour row updated), bossLook.test.ts and bossTier2.test.ts (Ember colour and diamond)

## Tests and build
- npm test: 214 files, 3094 passed, 1 skipped, 1 todo. tests/qa snapshots unchanged.
- npm run build: pass (only the existing chunk size warning). The v7 API grep prints nothing.
- Headless smoke (swiftshader, ?boss=ember and ?boss=spindle): no console errors, Ember shows multicolour flames, Spindle shows gold with the cyan axis and white thread. A standalone page confirmed the erase blend cuts a real gap. I could not trigger cracks or a nova headless.

## Risks
- The erase blend also removes whatever sits under a gap or scorch spot (grid, glow sprite), so those few pixels read as true black background. That is intended for the gap; inside the scorch disc it slightly dims the grid seen through the boss.
- The Ember flame adds about 30 filled bands and 6 strokes per frame to bossOver, and a live nova now rebuilds about 40 arm strokes plus 24 dots. Both stay in one Graphics each, but fps on the Fold in an Ember fight and with three novas needs a device check.
- Ember's HUD bar still uses `bossOrange` (src/ui/boss.ts, src/game/bosses/table.ts), so the bar is orange and the body red.

## Requests (outside my ownership)
- Swarm or Ledger: decide whether Ember's HUD and boss table colour key should follow the render primary (`bossRed`) or stay `bossOrange`.

## Dependencies requested
None.

## Open questions
- Should the docs/12 schedule colour for Ember be renamed from orange to flame red?

## Device check for Ryan
1. Open with ?boss=ember. Ember should look like a red diamond in a crown of flickering flame tongues that rise upward even while it turns, shifting through red, orange, yellow and white. Its dash lane, trail and fan shots should be flame coloured too.
2. Open with ?boss=spindle. It should read as a gold sharp pointed star with a cyan axis and a thin white thread twisting round it, clearly not Ember.
3. On any boss, drop it below 66 percent. The outline should get dark breaks where the light is missing (no black lines drawn on top), with a dim glow in the boss colour spreading inward from the hit side and pieces of outline falling away. Below 33 percent there should be more breaks and the whole outline should flicker unevenly.
4. Let a gravity well go supernova. Within about 1 s it should go from red to a spinning rainbow spiral with pulsing sparkles, a breathing outer ring and coloured drifting particles.
5. Watch the fps readout in an Ember fight and with several novas. It should stay at 58 or above on Standard.
