# Shape of War: install runbook

For Ryan. Follow each step literally, in order. Every step says where to do it, what to type or tap, and what you should see. If what you see differs from "Expected", stop and paste the screen text or terminal output to the orchestrator (Fable) before continuing.

Derived from SPEC.md. If this file conflicts with SPEC.md, SPEC.md wins.

## Bad news first

1. While `ANTHROPIC_API_KEY` is exported, every `claude` run started from that terminal, including the headless builders the dispatcher launches, bills the API key, not your Max plan. If you forget to unset it after the project, your normal Claude Code use in that shell keeps spending API credits. Section B.4 reverts it.
2. While the API key is the active credential, features that need a claude.ai login (claude.ai connectors, `/schedule`) are unavailable to Claude Code in that terminal. Use a separate terminal without the key for anything else.
3. The build stops silently if the Shape of War terminal closes or the Mac sleeps: the dispatcher and `caffeinate` both live in that window. Keep the Mac plugged in, lid open, for 30 hours.
4. GitHub Pages on a free plan requires a public repo. Everything in the repo is visible to anyone. Never commit the API key. Section C.7 checks for it.
5. Clearing the PWA's site data on the phone (section I.3) also wipes local high scores, unlocked levels and the neon setting. There is no backup.
6. Some steps below depend on menu labels that vary by app version. These are marked "verify in your version". If the label differs, pick the closest match and tell the orchestrator what you saw.

## Knowns and unknowns

| Item | Status |
|---|---|
| Your Mac shell | Assumed zsh (macOS default). Check with `echo $SHELL`; if it prints `/bin/bash`, use `~/.bash_profile` where this says `~/.zshrc` |
| Your GitHub username | Unknown. Step C.1 prints it |
| Where the package folder is on your Mac | Unknown. Steps use `~/Downloads/shape-of-war-package`. Replace with the real path if different |
| Exact Claude Code prompt wording for API key approval | Verify in your Claude Code version |
| Claude Desktop app labels for Projects, Instructions, Project knowledge and "Add folder" | Verify in your Desktop app version |
| Whether headless `claude -p` bills the key while the Mac is also logged into Max | Unknown until B.3 proves it. Builders do not start until it does |
| Fold 7 model string in `adb devices` and `chrome://inspect` | Unknown until you connect |

## A. Mac prerequisites

1. Open Terminal (Cmd Space, type `Terminal`, Enter).
2. Run:
   ```bash
   node -v
   ```
   Expected: `v22.x.x` or higher (for example `v24.x.x`). If it prints a lower version or `command not found`, do step 3. Otherwise skip to step 5.
3. In Safari or Chrome go to `https://nodejs.org`. Click the button labelled "LTS" (Long Term Support) for macOS and download the `.pkg` installer. Open it and click through Continue, Agree, Install. Enter your Mac password when asked. Expected: "The installation was completed successfully."
4. Quit Terminal fully (Cmd Q), reopen it, and run `node -v` again. Expected: `v22.x.x` or higher. Also run `npm -v`. Expected: a version number, no error.
5. Run:
   ```bash
   gh auth status
   ```
   Expected: `Logged in to github.com account <your-username>` and a token scopes line including `repo` and `workflow`. If it says `not logged in`, run `gh auth login`, choose GitHub.com, HTTPS, "Login with a web browser", copy the one time code, press Enter, paste the code in the browser, approve. Then rerun `gh auth status`.
   If `gh` itself is `command not found`, run `brew install gh` (if Homebrew is installed) or download the macOS installer from `https://cli.github.com`, then do the login above.
6. If step 5 showed scopes without `workflow`, run:
   ```bash
   gh auth refresh -s workflow
   ```
   Expected: browser approval, then `Authentication complete`. Why: the Pages deploy workflow file cannot be pushed without the `workflow` scope.
7. Run:
   ```bash
   git --version
   ```
   Expected: `git version 2.x`. If macOS offers to install Command Line Tools, click Install, wait for it to finish, then rerun.
8. Run:
   ```bash
   claude --version
   ```
   Expected: a version number. If `command not found`, install Claude Code:
   ```bash
   npm i -g @anthropic-ai/claude-code
   claude --version
   ```
   Expected: `added N packages`, then a version number. If npm prints `EACCES`, do not use `sudo`; paste the error to the orchestrator. Why: the dispatcher launches every builder with `claude -p` and refuses to start if `claude` is missing.
9. Open a new Terminal window (Cmd N). This is the "Shape of War terminal" for the rest of the project. Every later step that says "Shape of War terminal" means this window.
10. In the Shape of War terminal, keep the Mac awake:
    ```bash
    caffeinate -dims &
    ```
    Expected: a line like `[1] 12345`. Why: the build runs for 30 hours and the dispatcher stops when the Mac sleeps. `caffeinate` lives as long as this window; closing the window ends it. Keep the Mac on power with the lid open (system sleep is only blocked on AC power). Check it is running at any time with `jobs` (expected: `[1]  + running    caffeinate -dims`).

Paste back to the orchestrator:
```
A done. node: <output of node -v>. gh: <logged in as ...>, scopes include workflow: yes/no. git: <version>. claude: <version>. caffeinate running in Shape of War terminal: yes/no.
```

## B. Claude Code authentication with a Console API key

Goal: the headless builders spend org API credits for this project, not your Max subscription (SPEC 7). Fable, in the Claude Desktop app, stays on Max.

### B.1 Create the key

1. In your browser go to `https://console.claude.ai`. It may redirect to `platform.claude.com`; that is the same Console. Sign in.
2. Top left, check the organization and workspace selector shows the org whose credits should pay. If not, switch it.
3. Open Settings, then "API keys" (left sidebar; verify in your version).
4. Click "Create key". Name it `shape-of-war`. Pick the workspace. Click "Create" (or "Add").
5. Expected: the key is shown once, starting with `sk-ant-`. Click Copy. Do not close the dialog until step B.2.2 is done. The Console will not show the full key again.
6. Optional but recommended: in the Console go to Settings, Limits (or Billing; verify in your version) and set a monthly spend limit for the workspace. Why: caps the damage from a runaway agent loop.

### B.2 Export it in the shell

Use the Shape of War terminal from A.9 only. Why: the key then applies only to that window, and closing it reverts everything.

1. Click into the Shape of War terminal window.
2. Type the following, replacing `sk-ant-PASTE-YOUR-KEY-HERE` with your key (keep the single quotes, no spaces around `=`), then press Enter:
   ```bash
   export ANTHROPIC_API_KEY='sk-ant-PASTE-YOUR-KEY-HERE'
   ```
   Expected: no output.
3. Check it is set without printing the whole key:
   ```bash
   echo "${ANTHROPIC_API_KEY:0:10}..."
   ```
   Expected: `sk-ant-api...` or similar.
4. Optional, so a new Shape of War terminal does not need the paste again: store the key in the macOS Keychain and load it with a command, instead of writing it into `~/.zshrc`:
   ```bash
   security add-generic-password -a "$USER" -s shape-of-war-anthropic -w "$ANTHROPIC_API_KEY"
   ```
   Then in any future Shape of War terminal run:
   ```bash
   export ANTHROPIC_API_KEY="$(security find-generic-password -a "$USER" -s shape-of-war-anthropic -w)"
   ```
   Expected: no output; step 3 check passes.

Never paste the key into a Claude prompt, a commit, a file in the repo, a job file, or a message to the orchestrator.

### B.3 Prove headless runs bill the key

This is the hard blocker in SPEC 9 item 1. Do not start section D until it passes.

1. In the Shape of War terminal run:
   ```bash
   cd ~
   claude -p --model claude-sonnet-5-5 --output-format json "Reply with the single word ok"
   ```
   Expected: one line of JSON within about 30 seconds containing `"result":"ok"` (or `"ok."`), `"is_error":false` and a `"total_cost_usd"` value above 0. Field names verify in your Claude Code version.
2. If it hangs for more than a minute with no output, or prints an auth or "API key" approval error: press Ctrl C, then run `claude` (interactive) once in the same terminal. On first launch with the key set, Claude Code may ask once whether to use the detected API key (wording varies; verify in your version). Choose Yes, then type `/exit` and repeat step 1. Claude Code remembers the answer.
3. Negative check, proves the key and not the Max login is in use (expected behaviour, verify in your version):
   ```bash
   ANTHROPIC_API_KEY='sk-ant-invalid' claude -p "Reply with the single word ok"
   ```
   Expected: an error mentioning an invalid API key or authentication, and no `ok`. If it replies `ok`, the run used your Max login: stop and paste the output to the orchestrator.
4. In the browser go to the Console, Usage (verify in your version). Filter to the `shape-of-war` key if the page allows. Expected: a small request for claude-sonnet-5-5 appears within about 5 minutes of step 1.

Paste back:
```
B done. Headless JSON result: <paste the JSON line, it holds no key text>. Invalid key run failed with auth error: yes/no. Console usage shows shape-of-war key activity: yes/no.
```

### B.4 Revert to Max afterwards

1. Stop the dispatcher if it is running (Ctrl C in the Shape of War terminal) and exit any interactive Claude Code session (`/exit`).
2. In that terminal run:
   ```bash
   unset ANTHROPIC_API_KEY
   ```
   Or simply close the Shape of War terminal window.
3. If you ever added `export ANTHROPIC_API_KEY=...` to `~/.zshrc`, open it with `open -e ~/.zshrc`, delete that line, save, and open a new terminal.
4. In a new terminal run `claude`, then `/status`. Expected: your claude.ai subscription login is the active credential.
5. Optional: revoke the key in the Console (Settings, API keys, the `shape-of-war` row, Delete or Revoke) once the project is finished.

## C. Create the repo

Do these in the Shape of War terminal.

1. Get your GitHub username:
   ```bash
   gh api user --jq .login
   ```
   Expected: your username. Write it down; it is `<user>` below.
2. Go to your projects folder and create the repo, public, cloned locally:
   ```bash
   cd ~
   gh repo create shape-of-war --public --clone
   ```
   Expected: `Created repository <user>/shape-of-war on GitHub` and a new folder `~/shape-of-war`.
3. Copy the package in. Replace the source path if your package is elsewhere:
   ```bash
   ls ~/Downloads/shape-of-war-package
   cp -R ~/Downloads/shape-of-war-package/. ~/shape-of-war/
   cd ~/shape-of-war
   ls -a
   ```
   Expected: the first `ls` lists `SPEC.md`, `CLAUDE.md`, `PROJECT-INSTRUCTIONS.md`, `docs`, `scripts` (and `.claude`, `.agents` with `ls -a`). The last `ls -a` shows the same files inside `~/shape-of-war` plus `.git`. `README.md` and `00-HANDOFF-PROMPT.md` may stay; they do no harm.
4. Create a `.gitignore`:
   ```bash
   printf 'node_modules/\ndist/\n.env\n.env.*\n.DS_Store\nandroid/app/build/\n*.apk\n.agents/*\n!.agents/README.md\n!.agents/.gitignore\n' > .gitignore
   ```
   Expected: no output. Why the `.agents` lines: job files, logs and hand-offs stay local (SPEC 7.2).
5. Create a minimal `package.json` so `npm run dispatcher` works before W0. Do not run `npm init`; Shipwright scaffolds the rest in W0 and extends this file rather than replacing it:
   ```bash
   cat > package.json <<'EOF'
   {
     "name": "shape-of-war",
     "private": true,
     "type": "module",
     "scripts": {
       "dispatcher": "node scripts/dispatcher.mjs"
     }
   }
   EOF
   node -e "console.log(require('./package.json').scripts.dispatcher)"
   ```
   Expected: `node scripts/dispatcher.mjs`.
6. First commit on `main`:
   ```bash
   git checkout -B main
   git add -A
   git commit -m "Add Shape of War build package"
   ```
   Expected: a commit summary listing the files.
7. Check no key is in the repo before pushing:
   ```bash
   git grep -n "sk-ant-" || echo "clean"
   ```
   Expected: `clean`. If anything else prints, stop and tell the orchestrator.
8. Push:
   ```bash
   git push -u origin main
   ```
   Expected: `branch 'main' set up to track 'origin/main'`.

Paste back:
```
C done. Repo: https://github.com/<user>/shape-of-war. First commit pushed: yes. Secret check: clean. package.json dispatcher script present: yes/no.
```

## D. Create the Claude Desktop project

Fable runs here, on your Max plan, with the repo folder connected. Builders run in the Shape of War terminal through the dispatcher. UI labels in this section: verify in your Desktop app version.

1. Open the Claude Desktop app on the Mac. In the menu bar choose Claude, "Check for Updates" and install any update. Expected: the app restarts on the newest version, or says it is up to date.
2. In the left sidebar click "Projects", then "New project" (or "Create project"). Name it `Shape of War`. Click Create. Expected: an empty project page titled Shape of War.
3. Copy the project instructions to the clipboard. In the Shape of War terminal:
   ```bash
   pbcopy < ~/shape-of-war/PROJECT-INSTRUCTIONS.md
   ```
   Expected: no output.
4. In the project page open the project settings (gear or "..." menu), find "Instructions" (or "Custom instructions"), click into the field, press Cmd V, then Save. Expected: the field starts with `# Shape of War: Claude Desktop project instructions` and is saved.
5. Open the repo folder in Finder:
   ```bash
   open ~/shape-of-war
   ```
   In the project page find "Project knowledge" (or "Files"), click Add or "+", and add `SPEC.md` and `docs/05-build-plan.md` from that Finder window. Expected: both files listed under project knowledge. Why only these two: Fable reads everything else live from the connected folder, and these copies go stale if the repo changes; the folder wins on any difference.
6. Click "New chat" inside the project. In the model picker under the message box choose Fable 5.1. Expected: the chat header shows the Shape of War project and Fable 5.1.
7. In that chat click the "+" menu beside the message box, choose "Add folder" (or "Connect folder"), select `~/shape-of-war` (your home folder, then `shape-of-war`), click Open. If macOS asks to allow Claude access to the folder, click Allow. Expected: a chip or banner naming `shape-of-war` shows as connected. Do not send a message yet.
8. In the Shape of War terminal (the one with the key exported and `caffeinate` running) start the dispatcher:
   ```bash
   cd ~/shape-of-war
   npm run dispatcher
   ```
   Expected, exactly these first three lines:
   ```
   dispatcher: watching .agents/queue (max parallel 4)
   dispatcher: claude <version>
   dispatcher: api key sk-ant-...<last 4 of your key>
   ```
   If it prints `ANTHROPIC_API_KEY is not set`, redo B.2 in this window and rerun. A fourth line saying the roster files will be prepended is fine; tell the orchestrator. If 429 errors appeared in B.3, start it as `MAX_PARALLEL=2 npm run dispatcher` instead.
9. Leave this terminal open and untouched for the whole build. For any other command, open a new tab with Cmd T (it does not have the key, which is fine for git and gh).
10. Go back to the Desktop chat from step 6 and paste the handoff prompt from `00-HANDOFF-PROMPT.md` (everything below the line) as the first message. To copy it:
    ```bash
    sed -n '/^---$/,$p' ~/shape-of-war/00-HANDOFF-PROMPT.md | tail -n +2 | pbcopy
    ```
    Run that in the Cmd T tab, then Cmd V in the chat and send. Expected: Fable lists the folder, queues a `ping` job, and the dispatcher terminal prints `claimed ...-fable-ping` then `done ...-fable-ping` within two minutes.

Paste back (to Fable, in the same chat, if it asks):
```
D done. Project created: yes. Instructions pasted: yes. Knowledge: SPEC.md, 05-build-plan.md. Model: Fable 5.1. Folder connected: yes. Dispatcher first three lines: <paste them>.
```

## E. GitHub Pages deploy

Shipwright writes the app scaffold and the workflow in W0. This section is what you do on GitHub, plus the reference content so you can check Shipwright's work.

### E.1 Enable Pages with GitHub Actions as the source

1. In the browser open `https://github.com/<user>/shape-of-war/settings/pages`.
2. Under "Build and deployment", "Source", choose "GitHub Actions". Expected: the page saves automatically; no branch selector is shown.

Alternative from the terminal (same result):
```bash
gh api -X POST repos/<user>/shape-of-war/pages -f build_type=workflow
```
Expected: JSON with `"build_type": "workflow"`. If it returns `409` or "already exists", Pages is already on; run `gh api -X PUT repos/<user>/shape-of-war/pages -f build_type=workflow` instead.

Why Actions instead of a `gh-pages` branch: no build output committed to the repo, and a deploy is just a push to `main`.

### E.2 The workflow file

Path in the repo: `.github/workflows/deploy.yml`.
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```
Action major versions are the ones known at writing time; Shipwright checks for newer majors at W0 (verify).

### E.3 The base setting

In `vite.config.ts`:
```ts
base: '/shape-of-war/',
```
Why: a project Pages site is served at `https://<user>.github.io/shape-of-war/`, so every asset path needs the `/shape-of-war/` prefix. If the repo name changes, this value must change with it.

### E.4 Find the URL and confirm the deploy

1. After Shipwright's W0 branch is merged and pushed, run:
   ```bash
   gh run list --workflow deploy.yml --limit 1
   ```
   Expected: a row with status `completed` and conclusion `success`. If `in_progress`, wait 1 minute and rerun. If `failure`, run `gh run view --log-failed` and paste the output to the orchestrator.
2. Get the URL:
   ```bash
   gh api repos/<user>/shape-of-war/pages --jq .html_url
   ```
   Expected: `https://<user>.github.io/shape-of-war/`.
3. Open that URL in Chrome on the Mac. Expected: a black page (G0 blank canvas) with a small debug line showing viewport size. No 404.

Paste back:
```
E done. Pages URL: <url>. Last deploy run: success. Mac Chrome shows black canvas and debug line: yes/no.
```

## F. Install on the Z Fold 7

### F.1 Chrome (default)

1. On the Fold, open Chrome. Type the Pages URL from E.4 exactly, including the trailing `/shape-of-war/`. Expected: the Shape of War page loads.
2. Wait 10 seconds on the page with Wi-Fi on. Why: the service worker downloads the app for offline use during this time.
3. Tap the three dot menu (top right). Tap "Add to Home screen" or "Install app" (label varies; verify in your version). If you see a choice between "Install" and "Create shortcut", pick "Install".
4. Confirm the dialog. Expected: "Shape of War" icon appears on the home screen (or in the app drawer; long press it and choose "Add to Home" if needed).
5. Close Chrome. From the home screen, tap the Shape of War icon. Expected: the app opens with no address bar and no Android status bar or navigation bar visible (fullscreen).
6. Offline test: swipe down from the top, turn on Airplane mode (make sure Wi-Fi is off too). Swipe away Shape of War from Recents. Tap the Shape of War icon again. Expected: the app opens and shows the same screen as online. No "You are offline" dinosaur page.
7. Turn Airplane mode off.

### F.2 Samsung Internet (alternative)

1. Open Samsung Internet and load the same URL. Wait 10 seconds.
2. Tap the menu (three lines, bottom right). Tap "Add page to", then "Home screen" (verify in your version). If an "Install" icon appears in the address bar (a download arrow or plus), tap that instead; it installs the PWA rather than a bookmark.
3. Confirm. Expected: Shape of War icon on the home screen.
4. Repeat F.1 steps 5 to 7 using this icon.

If both browsers installed an icon, delete one to avoid confusion: long press the extra icon, Remove.

Paste back:
```
F done. Browser: Chrome / Samsung Internet. Installed: yes/no. Launches fullscreen (no address bar, no system bars): yes/no. Offline launch in airplane mode: yes/no. Notes: <anything odd>.
```

## G. Gate checks

The orchestrator tells you when a gate is open. Before every gate:
1. On the Fold, launch Shape of War once with Wi-Fi on, wait 10 seconds, close it from Recents, launch it again. Why: makes sure the newest deploy is running, not the cached old one.
2. Check the build label on the menu or debug line matches the commit the orchestrator names.

### G0: blank canvas on Pages, fullscreen, viewport logging

Do:
1. Launch Shape of War from the home screen folded (cover screen), holding the phone landscape.
2. Read the debug line at top left. Write down the numbers.
3. Unfold the phone with the app open. Wait 2 seconds. Read the debug line again.
4. Fold it again. Read it again.
5. Rotate to portrait and back to landscape on the main screen.

Observe: fullscreen (no bars), black canvas filling the screen, the debug line updates on each fold and unfold without the page reloading (no white flash, no restart).

Paste back:
```
G0 result: PASS / FAIL
Build label: <text>
Fullscreen on launch: yes/no
Cover debug line: <copy text, e.g. 1008 x 432 dpr 2.5 render dpr 2>
Main debug line after unfold: <copy text>
Cover debug line after refold: <copy text>
Reload or flash on fold/unfold: yes/no
Portrait behaviour on main screen: <rotates / stays landscape / letterboxed>
Motion smoothness setting (Settings, Display): Adaptive / Standard
Notes:
```

### G1: ship moves and fires with both thumbs, 60 fps or better, neon slider live

Do:
1. Folded. Start the test arena from the menu.
2. Put your left thumb anywhere on the left half and drag. Ship should move in that direction; a ring appears where your thumb landed.
3. Put your right thumb anywhere on the right half and drag. Ship should fire a 3-way spread in that direction while held.
4. Do both at once for 30 seconds.
5. Open Settings, turn on "Show FPS". Return to the arena. Read the FPS counter during step 4.
6. Open Settings, drag the neon slider slowly from 0 to 100 and back. Watch the preview arena.
7. Unfold. Repeat steps 2 to 6 on the main screen.
8. Force close the app, relaunch, open Settings. Check the slider is where you left it.

Observe: smooth movement, sticks follow your thumbs, firing only while the right thumb is down, glow changes continuously while dragging (dim and grey at 0, bright and saturated at 100).

Paste back:
```
G1 result: PASS / FAIL
Build label: <text>
Cover: move works yes/no, aim and fire works yes/no, FPS min/typical: <n>/<n>
Main: move works yes/no, aim and fire works yes/no, FPS min/typical: <n>/<n>
Neon slider changes glow live: yes/no. At 0 looks: <short>. At 100 looks: <short>
Neon value persisted after relaunch: yes/no
Stick feel (too sensitive, too slow, thumbs cover action): <short>
Accidental back gesture or zoom: yes/no
Notes:
```

### G2: one generated Adventure level start to results, bloom fallback decision

Do:
1. From the menu tap Adventure, then level 1.
2. Read the objective shown at the start. Play until you win or lose all lives.
3. Observe the results screen.
4. Tap Retry. Check the arena shape and the first wave look the same as the first attempt (same seed, same level).
5. With Show FPS on, play level 1 on the main screen (unfolded) and note the lowest FPS during the busiest moment.
6. If the orchestrator asks, also run the USB perf protocol in `04-device-and-pwa.md` section 14 and fill in its numbers.
7. Settings, toggle "Glow mode" between Bloom and Fallback (Proctor adds this toggle for the G2 decision). Repeat step 5 in Fallback.

Paste back:
```
G2 result: PASS / FAIL
Build label: <text>
Level 1 objective shown: <text>
Played to results screen: yes/no. Outcome: win/lose. Score: <n>. Stars: <n>
Retry produced identical level: yes/no
Main screen lowest FPS, Bloom: <n>
Main screen lowest FPS, Fallback: <n>
Cover screen lowest FPS, Bloom: <n>
Which looks better to you: Bloom / Fallback / same
Crashes, freezes, stuck enemies: <short or none>
Notes:
```
The orchestrator makes the bloom or fallback decision from these numbers (SPEC 2: switch if bloom is below 60 fps).

### G3: progression, Endless, settings, high scores, audio, offline

Do:
1. Adventure: complete level 1. Check level 2 is now unlocked. Play level 2 briefly; check it differs from level 1.
2. Endless: play one run to game over. Check the score appears in the Endless high score table.
3. Settings: change neon and volume. Force close, relaunch. Check both values persisted.
4. Audio: with the media volume up, confirm you hear shots, explosions and the death sound. Confirm one short vibration on death.
5. Offline: Airplane mode on, force close, relaunch from the icon, play one Adventure level. Airplane mode off.
6. High scores: force close and relaunch. Check the Endless table and level 1 best score are still there.

Paste back:
```
G3 result: PASS / FAIL
Build label: <text>
Level 2 unlocked after level 1: yes/no. Level 2 differs: yes/no
Endless playable to game over: yes/no. Score in table: yes/no
Neon and volume persisted after relaunch: yes/no
Audio heard: shots yes/no, explosions yes/no, death yes/no. Vibrate on death: yes/no
Offline launch and play: yes/no
High scores persisted after relaunch: yes/no
Notes:
```

### G4: device checklist all green, frozen, tagged v1.0.0

Do:
1. Open `docs/device-checklist.md` in the repo (Proctor writes it in W3). On the Mac: `open ~/shape-of-war/docs/device-checklist.md` after `git pull`.
2. Go through every line on the Fold, folded and unfolded.
3. Mark each line PASS or FAIL.

Paste back:
```
G4 result: PASS / FAIL
Build label: <text>
Checklist lines total: <n>. PASS: <n>. FAIL: <n>
Failed lines (number and what happened): <list or none>
OK to tag v1.0.0: yes/no
```
After a G4 PASS the orchestrator tags `v1.0.0`. If asked to do it yourself, in the Shape of War terminal:
```bash
cd ~/shape-of-war
git checkout main && git pull
git tag -a v1.0.0 -m "Shape of War v1.0.0"
git push origin v1.0.0
```
Expected: `* [new tag] v1.0.0 -> v1.0.0`.

## H. Optional Capacitor 8 APK path (only after G4)

Do not start this unless G4 has passed and the orchestrator says there is time (SPEC 8: only if G4 passed before 27:00). Expected total time: about 2 hours, mostly downloads.

1. Install Android Studio: go to `https://developer.android.com/studio`, download the Mac version for your chip (Apple silicon or Intel), open the `.dmg`, drag Android Studio to Applications. Launch it. In the setup wizard choose "Standard", accept licences, click Finish. Expected: the wizard downloads the Android SDK and ends on the Welcome screen. Quit Android Studio.
2. In the Shape of War terminal, point the shell at Android Studio's bundled Java and the SDK:
   ```bash
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$ANDROID_HOME/platform-tools:$PATH"
   java -version
   adb version
   ```
   Expected: a Java version line (21 or similar) and `Android Debug Bridge version ...`.
3. Install Capacitor in the repo, on a branch:
   ```bash
   cd ~/shape-of-war
   git checkout main && git pull
   git checkout -b feat/shipwright-capacitor
   npm i @capacitor/core @capacitor/cli @capacitor/android
   ```
   Expected: `added N packages`, no `ERR!`. Run `npm ls @capacitor/core` and confirm `8.x`.
4. Initialise Capacitor:
   ```bash
   npx cap init "Shape of War" com.shapeofwar.app --web-dir dist
   ```
   Expected: a `capacitor.config.ts` (or `.json`) file is created.
5. Build the web app with relative paths (Capacitor serves from the app, not `/shape-of-war/`):
   ```bash
   npm run build:cap
   ```
   Expected: `dist/` created, no errors.
6. Add the Android platform and sync:
   ```bash
   npx cap add android
   npx cap sync android
   ```
   Expected: an `android/` folder, and `Sync finished`.
7. Build a debug APK from the command line:
   ```bash
   cd android
   ./gradlew assembleDebug
   cd ..
   ls android/app/build/outputs/apk/debug/
   ```
   Expected: `BUILD SUCCESSFUL` and `app-debug.apk` listed. First run downloads Gradle and takes several minutes.
8. On the Fold, enable developer options: Settings, About phone, Software information, tap "Build number" 7 times, enter PIN. Expected: "Developer mode has been turned on".
9. On the Fold: Settings, Developer options, turn on "USB debugging".
10. Connect the Fold by USB. On the phone tap "Allow" on "Allow USB debugging?" (tick "Always allow from this computer"). On the Mac run:
    ```bash
    adb devices
    ```
    Expected: one line ending in `device` (not `unauthorized`). If `unauthorized`, unplug, replug, and accept the dialog on the phone.
11. Install:
    ```bash
    adb install -r android/app/build/outputs/apk/debug/app-debug.apk
    ```
    Expected: `Success`. A "Shape of War" app appears in the app drawer, separate from the PWA icon.
12. Launch it and repeat the G1 checks quickly. Then commit the branch for review:
    ```bash
    git add -A
    git commit -m "Add Capacitor Android wrapper"
    git push -u origin feat/shipwright-capacitor
    ```
    Do not merge it yourself. The orchestrator reviews and merges.

Paste back:
```
APK result: PASS / FAIL
Capacitor version: <npm ls output line>
assembleDebug: success/fail (paste last 20 lines if fail)
adb install: Success / <error>
APK launches fullscreen and plays: yes/no
Notes:
```

## I. Rollback and recovery

### I.1 Redeploy a previous good version

Use when a new deploy breaks the game on the phone. The fast and safe path reverts `main`, which triggers a normal deploy.

1. In the Shape of War terminal:
   ```bash
   cd ~/shape-of-war
   git checkout main && git pull
   git log --oneline -10
   git tag --list
   ```
   Expected: recent commits and tags. Identify the last good commit or tag (ask the orchestrator if unsure).
2. Revert everything after the good point, as new commits (no history rewrite):
   ```bash
   git revert --no-edit <good-commit-or-tag>..HEAD
   ```
   Expected: one revert commit per reverted commit. If a merge commit is in the range, git asks for `-m 1`; stop and paste the message to the orchestrator.
3. Push and watch the deploy:
   ```bash
   git push origin main
   gh run watch
   ```
   Expected: the deploy run ends with `success`.
4. On the phone, do the "before every gate" relaunch twice (G, steps 1 and 2) so the service worker picks up the reverted build.

Alternative: deploy a tag directly with `gh workflow run deploy.yml --ref v1.0.0`. This fails by default because the `github-pages` environment only allows deploys from `main`. To allow it: GitHub repo, Settings, Environments, `github-pages`, Deployment branches and tags, Add rule, Tag, pattern `v*`. Then rerun the command. Expected: run ends with `success`.

### I.2 Phone still shows the old or broken version

1. Launch Shape of War with Wi-Fi on, wait 10 seconds, swipe it away from Recents, launch again. Repeat once. Why: `autoUpdate` activates the new service worker on the launch after it downloads.
2. If still old, go to I.3.

### I.3 Clear the PWA cache on the phone (wipes local scores and settings)

Chrome:
1. Open Chrome, three dot menu, Settings, Site settings, All sites (verify in your version).
2. Find `<user>.github.io`, tap it, tap "Delete data" or "Clear and reset". Confirm.
3. Launch Shape of War from the home screen with Wi-Fi on. Expected: it loads fresh. If the icon no longer opens fullscreen, delete the icon and reinstall via F.1.

Samsung Internet:
1. Menu, Settings, Sites and downloads (or Personal browsing data), Manage website data (verify in your version).
2. Find `<user>.github.io`, delete its data.
3. Relaunch as above.

Last resort: long press the Shape of War icon, App info (or Remove), uninstall, then reinstall via section F.

Paste back after any rollback:
```
Rollback: reverted to <commit or tag>. Deploy run: success/fail. Phone shows correct build label <text>: yes/no. Cache cleared: yes/no.
```

### I.4 Restart the dispatcher

Use when the Shape of War terminal was closed, the Mac slept, the dispatcher crashed, or Fable says "Dispatcher is down".
1. If the old terminal is still open, click into it and press Ctrl C once. Expected: `SIGINT: claiming nothing new. running: <ids or none>`. Any running job is terminated and lands in `failed/` as interrupted.
2. If the window was closed, open a new Terminal window (Cmd N) and redo A.10 (`caffeinate -dims &`) and B.2 steps 2 and 3 (or the Keychain line from B.2.4).
3. Start it again:
   ```bash
   cd ~/shape-of-war
   npm run dispatcher
   ```
   Expected: the same three startup lines as D.8. Jobs left in `running/` are reported as `stale ...` and moved to `failed/`. Jobs still in `queue/` are claimed within seconds.
4. Tell Fable: "Dispatcher restarted. Stale or interrupted ids: <ids from the output, or none>." Fable requeues them with new seq numbers.

### I.5 Kill a runaway agent

Use when Fable asks, or an agent has run far longer than its brief allows and you do not want to wait for the 90 minute wall clock.
1. Find the job id and its worktree. In a Cmd T tab:
   ```bash
   cd ~/shape-of-war
   ls .agents/running/
   cat .agents/running/<id>.json | grep worktree
   ```
   Expected: the id (for example `0007-forge-world-store.json`) and a line like `"worktree": "../sow-forge-w1"`.
2. Kill the run. The dispatcher puts the absolute worktree path on the claude command line, so match on it. The worktree `../sow-forge-w1` is `$HOME/sow-forge-w1` when the repo is `~/shape-of-war`:
   ```bash
   pkill -f "$HOME/sow-forge-w1"
   ```
   Expected: no output. Within a few seconds the dispatcher prints `failed <id> exit=...`, and `.agents/runs/<id>/result.json` appears. The dispatcher also stops any test or build processes the agent left behind.
3. If nothing happens after 15 seconds, the process may not carry the path in its command line. Kill the claude process for that run instead:
   ```bash
   pgrep -fl "claude -p"
   ```
   Pick the line that ends with the same run id, then `kill <pid>` with that number. Expected: the dispatcher prints `failed <id>`.
4. Tell Fable: "Killed <id>." The branch keeps whatever the agent committed; Fable decides whether to requeue.
