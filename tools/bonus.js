const { chromium } = require('playwright');
const { gameUrl, PHONE, clearAd, watchAd, dieNow, reporter } = require('./harness');
const R = reporter(), ok = R.ok;
const st = (p, f) => p.evaluate(f);

const introOn = p => st(p, () => document.getElementById('adintro').classList.contains('on'));
const slotOn  = p => st(p, () => document.getElementById('adslot').classList.contains('on'));
const leave   = async p => { await p.evaluate(() => { __t.retry(); }); await p.waitForTimeout(250); };

async function waitSlotClosed(p) {                 // sit through a sim ad to the end
  for (let i = 0; i < 60; i++) {
    if (!await slotOn(p)) return true;
    await p.waitForTimeout(200);
  }
  return false;
}
async function toAdDeath(p) {                      // burn deaths until the next one triggers the gate
  for (let i = 0; i < 6; i++) {
    const next = await st(p, () => __t.S.deaths + 1);
    await dieNow(p);
    if (next % 3 === 0) return;
    await leave(p);
    for (let k = 0; k < 40 && await slotOn(p); k++) {
      if (await st(p, () => !document.getElementById('adskip').disabled)) { await p.click('#adskip'); break; }
      await p.waitForTimeout(200);
    }
    await p.waitForTimeout(200);
  }
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage(PHONE);
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto(gameUrl());
  await p.waitForTimeout(900);
  await p.click('#play'); await p.waitForTimeout(200);

  /* 1 — the offer appears at the ad slot, before any ad */
  await toAdDeath(p);
  await leave(p);
  const offered = { intro: await introOn(p), slot: await slotOn(p) };
  ok(offered.intro && !offered.slot, 'intro screen comes first, no ad behind it  ' + JSON.stringify(offered));
  const copy = await st(p, () => ({
    head: document.getElementById('introhead').textContent,
    sub: document.getElementById('introsub').textContent,
    watch: document.getElementById('introwatch').textContent,
    skip: document.getElementById('introskip').textContent,
    count: document.getElementById('introcount').textContent
  }));
  ok(/two revives/i.test(copy.sub) && /skip|no thanks/i.test(copy.skip) && /ad starts in/i.test(copy.count),
     'intro carries the reward, a countdown and a way out  ' + JSON.stringify(copy));

  /* 2 — taking the ad banks the bonus */
  await p.click('#introwatch'); await p.waitForTimeout(300);
  ok(await slotOn(p), 'accepting rolls the ad');
  ok(await st(p, () => document.getElementById('adkind').textContent) === 'REWARDED INTERSTITIAL',
     'the placeholder identifies itself as a rewarded interstitial');
  await waitSlotClosed(p); await p.waitForTimeout(400);
  ok(await st(p, () => __t.S.bonus) === 1, 'watching it through banks one bonus revive');

  /* 3 — the banked revive is free */
  await dieNow(p);
  const freeBtn = await st(p, () => ({ txt: document.getElementById('revive').textContent,
    off: document.getElementById('revive').disabled, offer: __t.reviveOffer() }));
  ok(freeBtn.offer === 'free' && /FREE/.test(freeBtn.txt) && !freeBtn.off,
     'death screen offers the free second revive  ' + JSON.stringify(freeBtn));
  await p.click('#revive'); await p.waitForTimeout(250);
  const afterFree = await st(p, () => ({ mode: __t.S.mode, bonus: __t.S.bonus, revives: __t.S.revives,
    adRevive: __t.S.adRevive, count: Math.ceil(__t.S.count) }));
  ok(!await slotOn(p) && afterFree.mode === 'play' && afterFree.bonus === 0 &&
     afterFree.revives === 1 && afterFree.adRevive === true && afterFree.count === 3,
     'spending it costs no ad and leaves the ad revive intact  ' + JSON.stringify(afterFree));

  /* 4 — the ad revive is still there underneath it */
  await p.waitForTimeout(3300);
  await dieNow(p);
  ok(/WATCH AD/.test(await st(p, () => document.getElementById('revive').textContent)),
     'next death falls back to the ad revive');
  await p.evaluate(() => { __t.revive(); });
  await waitSlotClosed(p); await p.waitForTimeout(400);
  const afterAd = await st(p, () => ({ revives: __t.S.revives, adRevive: __t.S.adRevive, mode: __t.S.mode }));
  ok(afterAd.revives === 2 && afterAd.adRevive === false && afterAd.mode === 'play',
     'two revives in one run, both spent  ' + JSON.stringify(afterAd));

  /* 5 — nothing left to offer */
  await p.waitForTimeout(3300);
  await dieNow(p);
  const spent = await st(p, () => ({ txt: document.getElementById('revive').textContent,
    off: document.getElementById('revive').disabled }));
  ok(/USED/.test(spent.txt) && spent.off, 'third death in the run has no revive left  ' + JSON.stringify(spent));

  /* 6 — one run, one row, flagged twice */
  const board = await st(p, () => __t.board().map(s => ({ t: +s.t.toFixed(1), r: s.r })));
  const twice = board.filter(s => s.r === 2);
  ok(twice.length === 1, 'the double-revived run left exactly one row  ' + JSON.stringify(board));
  ok(/↻↻/.test(await st(p, () => document.getElementById('board2').innerHTML)),
     'it is badged ↻↻ on the board');

  /* 7 — declining shows nothing at all */
  await leave(p);
  for (let k = 0; k < 40 && await slotOn(p); k++) {
    if (await st(p, () => !document.getElementById('adskip').disabled)) { await p.click('#adskip'); break; }
    await p.waitForTimeout(200);
  }
  await p.waitForTimeout(200);
  await toAdDeath(p);
  await leave(p);
  ok(await introOn(p), 'offer comes round again once the bonus is spent');
  await p.click('#introskip'); await p.waitForTimeout(500);
  const declined = { slot: await slotOn(p), bonus: await st(p, () => __t.S.bonus), mode: await st(p, () => __t.S.mode) };
  ok(!declined.slot && declined.bonus === 0 && declined.mode === 'play',
     'declining plays no ad and banks nothing  ' + JSON.stringify(declined));

  /* 8 — with one already banked, the slot falls back to a plain interstitial */
  await p.evaluate(() => { __t.S.bonus = 1; });
  await toAdDeath(p);
  await leave(p);
  const fallback = { intro: await introOn(p), slot: await slotOn(p),
    kind: await st(p, () => document.getElementById('adkind').textContent) };
  ok(!fallback.intro && fallback.slot && fallback.kind === 'INTERSTITIAL',
     'nothing left to reward -> plain interstitial, no empty promise  ' + JSON.stringify(fallback));

  /* 9 — the intro rolls the ad on its own if the player does nothing */
  for (let k = 0; k < 40 && await slotOn(p); k++) {
    if (await st(p, () => !document.getElementById('adskip').disabled)) { await p.click('#adskip'); break; }
    await p.waitForTimeout(200);
  }
  await p.evaluate(() => { __t.S.bonus = 0; });
  await p.waitForTimeout(300);
  await toAdDeath(p);
  await leave(p);
  ok(await introOn(p), 'offer shown for the auto-roll check');
  await p.waitForTimeout(5600);
  ok(!await introOn(p) && await slotOn(p), 'intro rolls the ad by itself after the countdown');

  R.finish(errs);
  await b.close();
})();
