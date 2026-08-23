# Skillshot — Capacitor project

A wrapped, plugin-wired, icon-and-splash-generated Capacitor 8 project. It has never
been compiled or run on a device — no Android SDK or Xcode exists in the environment it
was assembled in — so treat the first build as the first real test.

```
npm install
npx cap sync
npx cap open android      # needs Android Studio
npx cap open ios          # needs a Mac with Xcode 26+
```

`node_modules` is not included. `npm install` restores it; the lockfile pins what was
assembled and tested against.

---

## What is already done

| | |
|---|---|
| Capacitor 8.5.0 project | `appId` `com.ondrejluka.skillshot`, `appName` Skillshot |
| Android + iOS platforms | scaffolded and synced |
| Plugins installed and registered | `@capacitor-community/admob` 8.1.0, `@capacitor/preferences`, `@capacitor/splash-screen` |
| `targetSdkVersion` | **36** — meets the 31 Aug 2026 Play deadline (Capacitor 8 defaults to it) |
| Portrait lock | `AndroidManifest.xml` and `Info.plist` |
| AdMob App ID plumbing | manifest `meta-data` + `Info.plist` key, both wired to placeholders |
| `AD_ID` permission | declared for Android 13+ personalised ads |
| ATT prompt | `NSUserTrackingUsageDescription` set; `Ads.init()` already calls `requestTrackingAuthorization()` |
| Icons and splashes | every Android density and iOS slot generated into the native projects |
| Splash behaviour | 900ms, auto-hide, `#07090F`, no spinner |

### Three changes made to the game itself

**Viewport meta added.** The game was written as an Artifact body with no `<head>`.
Without `viewport-fit=cover` the WebView lays out at desktop width and every
`env(safe-area-inset-*)` in the CSS resolves to zero. This was a guaranteed
broken-on-device bug.

**Fonts bundled.** Oxanium and Barlow now load from `www/fonts/` via `@font-face`
instead of Google Fonts. The app launches offline with the right type and no flash of
fallback. 136 KB for seven woff2 files.

**Storage moved to Preferences.** `localStorage` in a WebView can be cleared by the OS.
The leaderboard now reads and writes through `window.Capacitor.Plugins.Preferences`
when the native bridge is present, and falls back to `localStorage` on the web so the
browser build and the test harness still work. No bundler needed — that is why the
whole app is still one HTML file.

Verified after those changes: full test sweep passes with **zero console errors**, and
all seven font faces load from the bundle.

---

## Replace before release

**1 — AdMob App IDs** (currently Google's sample IDs, which serve test ads only)

- `android/app/src/main/res/values/strings.xml` → `admob_app_id`
- `ios/App/App/Info.plist` → `GADApplicationIdentifier`

**2 — Ad unit IDs and the test flag** in `www/index.html`

- `AD_UNITS` — four IDs, interstitial and rewarded per platform
- `AD_TESTING = false`

Never click your own live ads, not even once to check they work. That is the fastest
route to a permanent AdMob ban — the test IDs exist for exactly this.

**3 — Bundle ID** in `capacitor.config.json` if `com.ondrejluka.skillshot` is not what
you want. It is permanent on both stores after the first release, so decide now.

**4 — iOS `SKAdNetworkItems`.** Google publishes a list of network IDs to paste into
`Info.plist` for iOS ad attribution. It changes, so pull the current list from Google's
AdMob iOS docs rather than copying an old one. Ads work without it; attribution and
revenue reporting suffer.

---

## What still has to happen on your machine

1. **Build it and run it on a real phone.** Nothing here has been compiled. Check the
   joystick feels right under a thumb, the safe-area padding clears the notch, ads
   actually serve, and the leaderboard survives a force-quit.
2. **Create a signing keystore and back it up in two places.** Lose it and the app can
   never be updated — you would have to publish a new listing and abandon your installs
   and reviews. Enrol in Play App Signing at upload.
3. **Build a signed AAB** (Play does not accept APKs for new apps) and an iOS archive.
4. **Start the Play closed test immediately** — 12 testers, 14 continuous days. That
   clock is the whole timeline; see the release runbook.
5. Store listings, privacy policy, developer website + `app-ads.txt`, Data safety form,
   privacy nutrition labels.

Icons are in the icon pack; screenshots are in the screenshot pack, already at the
right sizes for both stores.

---

## Building without a Mac (and without installing anything)

`.github/workflows/` has two GitHub Actions pipelines. Push this project to a GitHub
repo and both become available from the Actions tab.

**`android.yml`** — runs on free Linux runners on every push to `main`. Installs the
Android SDK, syncs Capacitor, and produces a signed `.aab` for the Play Console plus a
debug `.apk` you can sideload onto your phone. Both land as downloadable artifacts.

**`ios.yml`** — runs on demand on a `macos-26` runner, which ships Xcode 26.4.1 and so
satisfies Apple's Xcode 26 / iOS 26 SDK requirement. It currently does an **unsigned**
build, which proves the project compiles without you setting up certificates first.
Once that is green, add Apple's `import-codesign-certs` and `upload-testflight-build`
actions with an App Store Connect API key to get an uploadable `.ipa`.

macOS runner minutes bill at 10x the Linux rate on private repos, which is why the iOS
job is `workflow_dispatch` only rather than running on every push.

### Signing secrets the Android workflow expects

Create the keystore once, locally:

```
keytool -genkey -v -keystore skillshot.jks -keyalg RSA -keysize 2048 \
        -validity 10000 -alias skillshot
base64 -w0 skillshot.jks        # macOS: base64 -i skillshot.jks
```

Then add four repository secrets: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`,
`KEY_ALIAS`, `KEY_PASSWORD`.

**Back the `.jks` file up somewhere you will still have in five years.** Base64 in a
GitHub secret is not a backup — you cannot read a secret back out.

`android/app/build.gradle` reads the signing config from environment variables, so the
keystore never enters the repo. Without them the release build still succeeds, just
unsigned. `.gitignore` blocks `*.jks` and `*.keystore` either way.

---

## Layout of interest

```
www/index.html                              the whole game, one file
www/fonts/                                  bundled Oxanium + Barlow
capacitor.config.json                       appId, splash config
assets/                                     icon + splash masters (regenerate with
                                            npx capacitor-assets generate)
android/app/src/main/AndroidManifest.xml    portrait lock, AdMob App ID, AD_ID
android/app/src/main/res/values/strings.xml admob_app_id placeholder
android/variables.gradle                    targetSdk 36
ios/App/App/Info.plist                      portrait, GADApplicationIdentifier, ATT
```
