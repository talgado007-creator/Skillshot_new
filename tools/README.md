# tools — Playwright harnesses

These drive the real game in a headless Chromium at phone dimensions and assert on it.
They are the reason the ad flows and the race-condition fixes can be changed with any
confidence at all. Run them after touching `www/index.html`.

## Setup (once)

```bash
cd tools
npm install
npx playwright install chromium
```

Kept out of the root `package.json` on purpose: CI runs `npm ci` at the root and has no
business downloading a browser.

## Running

```bash
node race.js      # 13 assertions — async races, input, pause, storage
node bonus.js     # 17 assertions — the rewarded-interstitial flow end to end
node test.js      # functional sweep, writes screenshots into tools/
node balance2.js  # difficulty: a random wiggler, n=12, ~4 minutes
node balance.js   # difficulty: stationary and hold-one-direction, n=5 each
```

## How they reach inside the game

`www/index.html` wraps everything in an IIFE, so nothing is reachable from the page's
global scope. `harness.js` builds a throwaway copy at `tools/.test-build.html` with a
`window.__t` hook appended inside that IIFE, and points the browser at that. The copy is
gitignored. **The shipping file never carries the hook.**

If you rename `frame()` or restructure the tail of the script, `harness.js` will throw a
clear error rather than silently testing nothing — fix `ANCHOR` there.

## Reading the results

`race.js` and `bonus.js` print `PASS` / `FAIL` per assertion and a count at the end. Any
`PAGEERROR` line is a real bug, not test noise.

The balance numbers are noisy. Reference figures, n≥12: stationary ~3.5s, holding one
direction ~3.3s, random wiggling ~7.3s. **n=5 samples swing wildly on this game** — a
five-sample run once read 4.1s where twelve settled at 6.3s. Do not retune off a small
sample.

## A trap worth knowing

Anything that clicks `RETRY` must be able to dismiss whatever ad surface appears, or it
hangs forever. `clearAd()` in `harness.js` handles both the bonus intro screen and the
interstitial. Use it after every retry.

Also: `page.evaluate(() => __t.toMenu())` **awaits the returned promise**, and `toMenu()`
does not resolve until the ad closes — which your script is what's supposed to close.
That deadlocks. Wrap it: `page.evaluate(() => { __t.toMenu(); })`.
