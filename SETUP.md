# Getting this onto GitHub

The files in this archive are the repository. Extract it and the project root — the
folder containing `package.json`, `capacitor.config.json` and `.github/` — is what
becomes the repo root.

**This matters:** GitHub Actions only looks for workflows at `.github/workflows/` at the
**top level of the repo**. If the project ends up nested one folder deep, the workflows
are simply ignored — no error, no warning, the Actions tab just stays empty.

## Use git, not the web uploader

GitHub's drag-and-drop upload is unreliable with folders whose names start with a dot,
and `.github` and `.gitignore` are both dotfiles. Use git or GitHub Desktop.

```bash
cd skillshot                     # the folder with package.json in it
git init
git add .
git commit -m "Skillshot: Capacitor project"

# create an empty repo on github.com first, then:
git remote add origin https://github.com/<you>/skillshot.git
git branch -M main
git push -u origin main
```

Then check: the repo's file list should show `package.json` and `www/` at the top, and
a green tick or running spinner should appear within a minute. If the Actions tab says
"no workflows", the nesting is wrong.

## Public or private?

**Public** — Actions minutes are unlimited and free, including macOS. Your source is
readable, but a Capacitor game ships its JavaScript inside the APK anyway, so anyone
determined can already read it. Your AdMob IDs are likewise visible in any installed
app; that is normal and not a secret.

**Private** — 2,000 free minutes a month, and macOS minutes bill at 10x. An Android
build is a few minutes; an iOS build costs 10x that against your allowance.

Either way the keystore stays out of the repo. It lives in repo secrets, and
`.gitignore` blocks `*.jks` and `*.keystore`.

## First run

1. Push. The Android workflow fires automatically on `main`.
2. Actions tab → the run → **Artifacts** at the bottom → download `skillshot-android`.
3. Inside is a debug `.apk`. Put it on your phone (email it to yourself, or
   `adb install`) and enable "install from unknown sources" when prompted.
4. That is the first time this game has ever run on a phone. Check the joystick under
   a thumb, the HUD clearing the notch, and the leaderboard surviving a force-quit.

The release `.aab` in the same artifact will be **unsigned** until you add the four
keystore secrets — Play will reject an unsigned bundle, so do that before your first
Play Console upload. The workflow says which of the two it built in its log.

The iOS workflow is manual-only (Actions tab → iOS → Run workflow) so it does not burn
macOS minutes on every push.
