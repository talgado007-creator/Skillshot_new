# Skillshot — project context

Read this first. It is the handover from the Cowork session that built this project.

## What this is

A mobile dodge game. Skillshots, ground AoE, sidestep beams, homing orbs and tumbling
laser boomerangs fly in from every edge; you move one circle with a floating joystick and
survive as long as you can. No levels, no waves — a continuous procedural difficulty ramp.
Built by Ondrej Luka (finance manager, not a developer — explain things plainly and don't
assume tooling knowledge).

Monetised with AdMob. Target: Google Play first, App Store second.

## Architecture — deliberately unusual, don't "fix" it

**The entire game is one file: `www/index.html`.** Canvas 2D, no framework, no bundler,
no build step for the web layer. This is intentional and worth preserving:

- Capacitor plugins are reached via `window.Capacitor.Plugins.<Name>`, which works without
  a bundler. That is why `Ads` and `Store` are written the way they are.
- Fonts are bundled in `www/fonts/` via `@font-face` (Oxanium + Barlow, 7 woff2, 136 KB)
  so the app launches offline with correct type.
- Do not introduce npm-imported frontend dependencies without a strong reason. It would
  force a bundler and lose the single-file property.

Capacitor 8.5.0. Plugins: `@capacitor-community/admob` 8.1.0, `@capacitor/preferences`,
`@capacitor/splash-screen`, `@capacitor/app`. Node >= 22 required.

**`@capacitor/app` is there for one reason: the Android back gesture.** The game is a
single page with no history, so Capacitor handed the press to the system and the activity
closed — and the floating stick is often dragged near a screen edge, so an accidental back
swipe killed the run. A `backButton` listener now maps back to pause / resume / leave the
death screen, and exits the app only from the menu. Registering any listener disables
Capacitor's default handling, which is why `App.exitApp()` is called explicitly.
Back on the death screen calls `goMenu()` rather than `toMenu()` — no interstitial in front
of someone navigating away, and the slot is not lost because `adGate()` was never called.

## Build

No local Android SDK needed. GitHub Actions does it:

- `.github/workflows/android.yml` — runs on push to `main`. Outputs a signed `.aab` and a
  debug `.apk` as artifacts.
- `.github/workflows/ios.yml` — `workflow_dispatch` only, `macos-26` runner (Xcode 26.4.1).
  Unsigned unless the App Store Connect secrets are set, then signed + optional TestFlight
  upload. macOS minutes bill at 10x on private repos, hence manual-only.

**Two iOS traps, both fixed, both invisible until CI actually runs:**

- **No CocoaPods.** Capacitor 8 wires plugins through Swift Package Manager
  (`ios/App/CapApp-SPM`). There is no Podfile and no `.xcworkspace`. The first draft of
  `ios.yml` ran `pod install` against `App.xcworkspace` and would have failed twice over.
  Every `xcodebuild` call uses `-project App.xcodeproj`.
- **`App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` is committed on purpose.** Xcode
  writes schemes into `xcuserdata`, which is gitignored, so a clean CI checkout has none
  and `xcodebuild -scheme App archive` fails with "scheme not found". Do not delete it.

`android/app/build.gradle` reads the signing config from `SKILLSHOT_STORE_FILE` /
`_STORE_PASSWORD` / `_KEY_ALIAS` / `_KEY_PASSWORD` and only attaches it when a keystore is
actually present, so unsigned builds still succeed. Secrets: `KEYSTORE_BASE64`,
`KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.

**`versionCode` tracks `github.run_number`** via `SKILLSHOT_VERSION_CODE`, matching what
`ios.yml` does with `CURRENT_PROJECT_VERSION`. Play permanently reserves every version code
it has accepted and refuses a repeat, so a hardcoded number blocks the second upload. A
local build with the variable unset falls back to 1. The one way this breaks is a fresh
repo: `run_number` restarts at 1, and codes below what Play already holds are refused —
add an offset to the workflow if that ever happens. As of 23 Aug 2026 Play has accepted no
build at all, so no version code is spoken for yet.

**The Play package name is `skillshot.dodge.app`, and it is permanent.** The listing was
created with that name before the first upload was attempted, and Play fixes the package
name at creation — it cannot be renamed, and the bundle is rejected if it does not match.
`applicationId` in `android/app/build.gradle` and `appId` in `capacitor.config.json` were
changed to suit; the iOS `PRODUCT_BUNDLE_IDENTIFIER` was aligned too, since nothing is
registered with App Store Connect yet. The Gradle `namespace` and the `MainActivity` source
folder deliberately stay `com.ondrejluka.skillshot`: namespace only governs generated code
(`R`, `BuildConfig`), Android allows the two to differ, and leaving it alone avoided moving
Java sources for no benefit. Do not "tidy" them into agreement.

**The `chmod +x android/gradlew` step is load-bearing.** Ondrej is on Windows, which does
not carry the executable bit; without it the Linux runner exits 126 with "Permission
denied". Do not remove it.

## Game design decisions (he is happy with the feel — do not retune without asking)

Five hazards, unlocking by elapsed time: linear skillshot (0s, weight 5), ground AoE (7s,
3), sidestep beam (12s, 2.6), homing orb (18s, 1.2), laser boomerang (24s, 1.7).

Two independent spawn clocks: **aimed** threats solved against the player's position, and
**ambient** traffic thrown at random points from t=3. The ambient stream is what makes the
arena feel alive rather than like a shooting gallery.

A five-second warm-up multiplies the spawn gaps by up to 2.1x and runs shots at 72% speed,
easing to full pace at t=5.

**Projectiles have no telegraph** — the shot is the warning. Two things keep that fair:
`edgePointFar()` guarantees at least 0.52 screen-diagonals of runway so nothing spawns
just off-screen beside you, and base speed is 280–375 u/s.

Aiming: 55% of shots fire at the player's current position (punishes standing still), 45%
solve flight time and lead the smoothed velocity (punishes holding one direction).

Cut hazards, and why, so they don't get reinvented: a **sweeping laser** (rotation felt
bad; the fixed-line beam replaced it) and an **expanding ring** (the gap outran the player;
its crescent shape became the boomerang).

Abilities, toggled before each run: Flash (blink, 9s), Dash (0.16s at 4.4x, 5s), Ghost
(1.62x for 2.5s, 11s). Running with nothing armed earns a "purist" mark — this is the
fairness mechanism instead of a score multiplier.

**The joystick origin trails the thumb.** Drag past the ring and the origin is pulled
along so it is never more than one radius behind. It used to stay where the finger
first landed, so everything dragged beyond the ring was dead travel that had to be
retraced before the stick could point the other way: commit hard to one direction and
a sharp reversal took as long as the drag that preceded it. Reported from play as "if
I go too much to the right and then I need a sharp left it takes too long".

**Ability buttons are player-positioned and player-sized.** Each of the three is placed
from a saved layout (`skillshot.layout.v1`) rather than a fixed bottom-right row, via a
"Customise controls" screen on the menu. Positions are fractions of the viewport, never
pixels, so a layout arranged on a large phone still lands on screen on a small one, and
`clampBtn()` drags anything out of range back into view on load. Sizes drive a `--s`
custom property, so the glyph, cooldown number and label all scale with the button.
`inThumbZone()` needed no change: it already measured real button rectangles rather
than a fixed corner, so the joystick dead zone follows the buttons for free.

Three traps here, all caught by `tools/layout.js` and none visible by reading the code:
`loadLayout()` must run *after* `Store` is declared (a `const` in its temporal dead zone
threw, leaving every saved layout unread while the defaults still rendered perfectly);
the drag is tracked on `window`, because pointer capture on the button stops delivering
moves once the pointer leaves the circle; and the customise panel sits at the **top** of
the screen because at the bottom its DONE button covered FLASH exactly, making the
buttons impossible to grab at their default positions.

### Test harnesses — `tools/`
Playwright, driving the real `www/index.html` headless at phone size. `cd tools &&
npm install && npx playwright install chromium`, then `node race.js` / `node bonus.js`.
See `tools/README.md`.

`harness.js` builds a throwaway copy at `tools/.test-build.html` with a `window.__t` hook
appended inside the IIFE — the shipping file never carries it. If the tail of the script
is restructured, `harness.js` throws rather than silently testing nothing.

**n=5 samples swing wildly on this game — only trust n>=12.** Reference figures:
stationary ~3.5s, holding one direction ~3.3s, random wiggling ~7.3s. Any harness must
dismiss the ad surfaces or it hangs on RETRY, and `page.evaluate(() => __t.toMenu())`
deadlocks because evaluate awaits a promise that only resolves once the ad closes — wrap
it in braces.

## Ads

One `Ads` adapter with two backends. On device it drives the AdMob plugin; in a browser it
runs a placeholder overlay with identical timing and reward gating so the flow is testable
without a build. Game code calls `Ads.interstitial()`, `Ads.rewarded()` and `Ads.bonus()`.

Three formats, all fired when the player *leaves* the death screen, never on arrival — so
they always read their own time first. `S.lastAdDeath` guards re-firing.

- **Rewarded interstitial (`Ads.bonus()`) on every third death.** This is the main slot.
  The reward is one **bonus revive**, banked on `S.bonus` and spendable on any later death
  with no ad attached. Cap of one banked at a time; with one already in hand the slot falls
  back to the plain interstitial rather than promising a reward that cannot be given.
- **Plain interstitial** is now only the fallback: no rewarded-interstitial fill, an older
  plugin build without `prepareRewardInterstitialAd`, or a bonus already banked.
- **Rewarded video** still grants the one ad revive per run. `S.adRevive` tracks it.
  If it fails to load the revive is granted anyway — no fill is our problem, not the
  player's. Only an actual dismissal is refused, and even then the button stays live.
- No banner ads — they steal arena space in a full-screen dodge game.

### The intro screen is not decoration
A rewarded interstitial does not ask the player to opt in the way a rewarded video does, so
Google requires the app itself to show an intro screen carrying the reward and a way out
**before** the ad starts. That is `adIntro()` — reward line, five-second countdown, WATCH AD
and NO THANKS. It is shown **only after an ad has actually loaded**, and declining shows no
ad at all rather than falling through to an interstitial. Removing or weakening that screen
is a policy violation, not a UX tweak.

### `Ads.watch()` — why the dismiss event and not the promise
`showRewardVideoAd()` and `showRewardInterstitialAd()` both resolve from inside the
*earned-reward* listener, which fires while the ad is still on screen — verified in
`AdRewardInterstitialExecutor.java`, not assumed. Resolving there would start the 3-2-1
underneath a playing ad. `Ads.watch()` therefore listens for `...Dismissed` and uses
`...Reward` only as a flag. Two traps it works around:

- The show call is deliberately **not awaited**. Dismiss an Android rewarded ad without
  earning and the plugin's `PluginCall` is never resolved *or* rejected; awaiting it would
  lock the death screen behind a promise that never settles.
- A 120s guard resolves the wait if a platform ever stops emitting dismiss.

Event names are hardcoded strings (`onRewardedInterstitialAdReward` etc.) because the
plugin ships them as TS enums, which cannot be imported without a bundler. They are checked
against `RewardInterstitialAdPluginEvents.kt` / `RewardAdPluginEvents.kt` in the plugin.

### Leaderboard interaction
`S.revives` counts revives used in a run and is written to the board as `r`. One revive
badges `↻`, two badge `↻↻`. Entries written before this stored a boolean, so `render()`
coerces. A run still occupies exactly one row however many times it was revived, and counts
as one death against the ad cadence.

The AdMob **App ID** is not an ad unit ID and lives in
`android/app/src/main/res/values/strings.xml` (`admob_app_id`) and iOS
`Info.plist` (`GADApplicationIdentifier`). Missing it crashes the app on launch with no
useful error.

## OPEN WORK

1. ~~EU/UK consent~~ — **done, and the shapes are now confirmed from the plugin source
   rather than guessed.** `Ads.consent()` runs Google's UMP via `requestConsentInfo` /
   `showConsentForm` before `initialize()`, which is the order Google requires. When
   `privacyOptionsRequirementStatus === 'REQUIRED'` a "Privacy & ad settings" button
   appears on the menu and calls `showPrivacyOptionsForm()` — that persistent entry point
   is a condition of serving, not a nicety. Consent failures are swallowed so the game
   never blocks; Google then serves non-personalised ads.

   Two things were wrong and are fixed. `status` and `privacyOptionsRequirementStatus`
   are **always strings** — `AdConsentExecutor.java` and `ConsentExecutor.swift` both
   stringify before crossing the bridge — so the numeric fallback in `needsConsent()` was
   dead code. And `debugGeography` is an **int** (1 = EEA), not a string: passing `'EEA'`
   made Android throw on unboxing and iOS fall through to "disabled", so the forced
   geography never worked. It also only applies to a device listed in
   `testDeviceIdentifiers`, hence `AD_DEBUG_DEVICE`. Ondrej is UK-based, so real
   geography gives him the consent flow anyway; the debug path is only for testers
   outside the EEA/UK.
2. **Real AdMob IDs.** Six unit IDs in `AD_UNITS` in `www/index.html` (interstitial,
   rewarded, rewarded interstitial — Android and iOS each) plus the two App IDs above are
   currently Google's *test* IDs, and `AD_TESTING` is still `true`. The rewarded
   interstitial needs its **own** unit type in the AdMob console; a rewarded video unit
   will not serve in that slot.
3. ~~`SKAdNetworkItems`~~ — **done.** 50 identifiers pulled from Google's published list
   on 22 Aug 2026 and written into `ios/App/App/Info.plist`. Re-pull before each release;
   Google adds and removes networks. Same edit removed a duplicate
   `UIViewControllerBasedStatusBarAppearance` key that was declared both true and false —
   duplicate keys in a plist are undefined behaviour, and this one governs whether the
   status bar actually hides.
4. ~~Ad frequency~~ — **done.** Now every **third** death (`S.deaths % 3`), fired when
   the player leaves the death screen. Was every other, which risked a reviewer hitting
   several ads in two minutes.
5. ~~iOS signing~~ — **done and verified end to end.** A signed `.ipa` was produced on
   24 Aug 2026. `ios.yml` uses **manual signing, and must keep doing so.** Automatic
   signing is impossible on this account and three runs proved it: `xcodebuild archive`
   with `CODE_SIGN_STYLE=Automatic` always requests a *development* profile, development
   profiles embed device UDIDs, and Apple refuses to issue one to a team with no
   registered devices — "Your team has no devices from which to generate a provisioning
   profile". Deleting Capacitor's hardcoded `CODE_SIGN_IDENTITY = "iPhone Developer"`
   from the Release config did not help (that line is gone anyway, and Debug keeps its
   copy), and forcing `CODE_SIGN_IDENTITY=Apple Distribution` is rejected outright with
   "conflicting provisioning settings" because automatic signing owns that decision.
   Do not try to "simplify" this back to `-allowProvisioningUpdates`.

   The certificate and profile were minted once, from a CSR generated with OpenSSL on
   Windows — no Mac needed — and live in `Downloads/skillshot-keystore/ios/` alongside
   the private key. Secrets: `IOS_P12_BASE64`, `IOS_P12_PASSWORD`, `IOS_PROFILE_BASE64`,
   `IOS_TEAM_ID` (`9N75USU2RM`). The build imports them into a throwaway keychain and
   deletes it in an `always()` step. `set-key-partition-list` is load-bearing: without it
   codesign raises a GUI keychain prompt nothing can answer and the job hangs to timeout.

   **The distribution certificate expires 24 Aug 2027.** After that every signed build
   fails with "no identity found"; regenerate from the same CSR flow and replace
   `IOS_P12_BASE64`. The provisioning profile expires with it.

   TestFlight upload is a separate `upload: true` input and needs `ASC_KEY_ID`,
   `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY`. One bug was fixed there unseen: the step passed
   `--api-key` / `--api-issuer`, but `altool(1)` spells them `--apiKey` / `--apiIssuer`.
   Build number is `github.run_number`, because App Store Connect permanently reserves
   every build number it has accepted.

   Every `xcodebuild` call builds its arguments in a bash array rather than using
   backslash line continuations, so a reflowed line cannot silently truncate a command.

6. ~~Rewarded-ad resolve timing~~ — **done.** The plugin's own Android source confirms the
   show call resolves from the earned-reward listener, while the ad is still up. `Ads.watch()`
   waits for the dismiss event instead. Still worth eyeballing once on a real device: watch a
   rewarded ad to the end and confirm the 3-2-1 starts only after it closes.
**iOS ships iPhone-only** (`TARGETED_DEVICE_FAMILY = "1"`). It was `"1,2"`, and Apple
rejected the first TestFlight upload for it: error 90474, "you need to include all of the
Portrait, PortraitUpsideDown, LandscapeLeft, LandscapeRight orientations to support iPad
multitasking". Adding those orientations would be the wrong fix — the game is portrait-locked
by design, and iPad multitasking is exactly the resize case that open item 7 below says is
broken. It still runs on iPad in iPhone compatibility mode.

7. **Resize mid-run.** `resize()` rebuilds the canvas but hazards keep their old
   coordinates. Portrait is locked on both platforms, so this only reaches Android
   multi-window and unfolding foldables. Left alone deliberately.

## Robustness pass (post-review)

An adversarial read of `www/index.html` turned up twelve issues; the ones that could reach
a player are fixed. Do not undo these without reading why they exist:

- **One ad request at a time.** An ad can take ten seconds to load and shows nothing while
  it does. `S.busy` plus `lockOver()` disable RETRY / MENU / REVIVE for the duration, and
  `uiTok` is captured before every `await` so a resolved request that no longer matches the
  screen is dropped. Before this, double-tapping RETRY started two runs, and RETRY then
  MENU launched a run underneath the menu.
- **`resetStick()`** in `startRun()`, `die()`, `revive()` and both halves of `setPause()`.
  A finger still down at death used to drive the next run off spawn at full speed.
  `pointermove` also clears the stick whenever the mode is not `play`.
- **`setPause(true)` clears `S.count`.** The countdown draws above the pause panel and
  `update()` does not run while paused, so nothing else would ever take it down.
- **No invulnerability on resume.** `P.inv` now ticks down during the frozen countdown, and
  any grace is deferred to the moment the count hits zero via `S.grace`. Pausing gave a
  free 0.5s of invulnerability that survived the freeze, which made pause-spam a way to
  walk through shots. Revive still gets 1.4s, applied on GO.
- **The leaderboard is never overwritten before it is read.** `Store.get()` returns
  `{ok, v}` so a failed read is distinguishable from an empty store, and `write()` is gated
  on `scoresLoaded`. One bad read used to replace real history with a one-entry array.
- **`inThumbZone()`** measures the ability buttons that are actually visible instead of
  reserving a fixed bottom-right rectangle. A purist run had 12% of the arena dead to the
  joystick for no reason.
- **One run, one death, one board entry.** `die()` only increments `S.deaths` when the run
  was not revived, and `save()` replaces this run's earlier entry via `S.rec`. A revived
  run used to count twice against the ad cadence and leave a worse duplicate on the board.
- Also: `cast()` is blocked while `S.count > 0` (flash was a free reposition during the
  frozen countdown) and the flash clamp uses `P.r * U` rather than raw `P.r`.

`race.js` in the Cowork workspace covers all of the above — thirteen assertions against a
copy of the game with a `window.__t` hook appended inside the IIFE. `bonus.js` covers the
rewarded-interstitial flow in seventeen more: intro before ad, reward copy, banking,
spending the free revive with no ad, the ad revive still underneath it, `↻↻` on the board,
declining showing nothing at all, the interstitial fallback, and the auto-roll countdown.
The shipping file has no `__t` hook.

## Store state

Play Console account exists. Not yet uploaded. The blocking constraint is Google's rule
that a personal developer account must run a **closed test with 12+ testers opted in for 14
consecutive days** before applying for production. Nothing else on the Android path takes
that long, so getting a build into closed testing is always the priority.

Assets are done and correctly sized: icon pack (all densities generated into both native
projects), four store screenshots per store at 1320x2868 (App Store 6.9") and 1440x2560
(Play, 16:9 — a separate capture, because Apple's ratio exceeds Play's 2x limit), and a
static website with privacy policy + `app-ads.txt`.

## House style

Dark-only "rift" palette, used in the game and every document: void `#07090F`, rift
`#0F1828`, mana `#37E1FF` (the player), ember `#FF3B5C`, flare `#FFA02E`, hex `#B45CFF`,
acid `#C8FF3D`. Type is Oxanium (display/HUD) + Barlow (body).
