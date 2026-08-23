const { chromium } = require('playwright');
const { gameUrl, PHONE, clearAd, watchAd, dieNow, reporter } = require('./harness');
const R = reporter(), ok = R.ok;

const st = (p, f) => p.evaluate(f);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage(PHONE);
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto(gameUrl());
  await p.waitForTimeout(900);

  /* 1 — RETRY twice while the interstitial is loading */
  await p.click('#play'); await p.waitForTimeout(200);
  for (let i = 0; i < 2; i++) { await dieNow(p); await p.evaluate(() => { __t.retry(); }); await clearAd(p); await p.waitForTimeout(250); }
  await dieNow(p);                                   // third death -> ad on leaving
  await p.evaluate(() => { __t.retry(); __t.retry(); });
  await p.waitForTimeout(300);
  const locked = await st(p, () => ({ busy: __t.S.busy, again: document.getElementById('again').disabled,
    menu: document.getElementById('tomenu').disabled, mode: __t.S.mode }));
  ok(locked.busy && locked.again && locked.menu && locked.mode === 'over',
     'RETRY locks the death screen while the ad loads  ' + JSON.stringify(locked));
  await clearAd(p); await p.waitForTimeout(400);
  const after = await st(p, () => ({ mode: __t.S.mode, t: +__t.S.t.toFixed(2),
    overOn: document.getElementById('over').classList.contains('on') }));
  ok(after.mode === 'play' && !after.overOn && after.t < 1.5, 'one run starts, not two  ' + JSON.stringify(after));

  console.log('..'+'2 —');
  /* 2 — MENU pressed while the revive ad is in flight */
  await dieNow(p);
  await p.evaluate(() => { __t.revive(); });
  await p.waitForTimeout(200);
  ok(await st(p, () => document.getElementById('tomenu').disabled && __t.S.busy),
     'MENU is locked out while the rewarded ad loads');
  await watchAd(p); await p.waitForTimeout(300);
  const rev = await st(p, () => ({ mode: __t.S.mode, count: Math.ceil(__t.S.count),
    grace: __t.S.grace, inv: +__t.P.inv.toFixed(2) }));
  ok(rev.mode === 'play' && rev.count === 3 && rev.grace === 1.4 && rev.inv === 0,
     'revive: grace deferred to the end of the countdown  ' + JSON.stringify(rev));
  await p.waitForTimeout(3400);
  const graced = await st(p, () => ({ inv: +__t.P.inv.toFixed(2), grace: __t.S.grace }));
  ok(graced.inv > 0.2 && graced.grace === 0, 'grace applied on GO, not banked  ' + JSON.stringify(graced));

  console.log('..'+'3 —');
  /* 3 — a finger still down at death does not drive the next run */
  await p.mouse.move(160, 500); await p.mouse.down(); await p.mouse.move(160, 300);
  const held = await st(p, () => ({ on: __t.stick.on, dy: +__t.stick.dy.toFixed(2) }));
  await dieNow(p);
  const atDeath = await st(p, () => __t.stick.on);
  await p.mouse.move(160, 260);                        // still dragging on the death screen
  await p.evaluate(() => { __t.retry(); }); await clearAd(p); await p.waitForTimeout(300);
  const fresh = await st(p, () => ({ on: __t.stick.on, dx: __t.stick.dx, dy: __t.stick.dy }));
  await p.mouse.up();
  ok(held.on && held.dy < -0.5, 'joystick was engaged before the death  ' + JSON.stringify(held));
  ok(!atDeath && !fresh.on && fresh.dy === 0, 'joystick cleared, next run starts still  ' + JSON.stringify(fresh));

  /* 4 — backgrounding mid-countdown must not leave the count over the pause panel */
  await p.evaluate(() => { __t.S.count = 3; __t.syncCount(); __t.setPause(true); });
  await p.waitForTimeout(150);
  const paused = await st(p, () => ({ mode: __t.S.mode, countOn: document.getElementById('countdown').classList.contains('on'),
    pauseOn: document.getElementById('pause').classList.contains('on') }));
  ok(paused.mode === 'paused' && !paused.countOn && paused.pauseOn,
     'countdown cleared when the pause screen opens  ' + JSON.stringify(paused));

  /* 5 — pause hands out no invulnerability, and a pause cannot bank it */
  const pre = await st(p, () => { __t.P.inv = 0.9; return +__t.P.inv.toFixed(2); });
  await p.evaluate(() => { __t.setPause(false); });
  const onResume = await st(p, () => ({ inv: +__t.P.inv.toFixed(2), count: Math.ceil(__t.S.count), grace: __t.S.grace }));
  await p.waitForTimeout(3400);
  const postCount = await st(p, () => +__t.P.inv.toFixed(2));
  ok(onResume.inv <= pre && onResume.grace === 0 && onResume.count === 3,
     'resume gives the 3-count and no extra invulnerability  ' + JSON.stringify(onResume));
  ok(postCount === 0, 'invulnerability burns down during the frozen count, not after  inv=' + postCount);

  console.log('..'+'6 —');
  /* 6 — purist runs get the whole arena back */
  await dieNow(p);
  await p.evaluate(() => { __t.toMenu(); }); await clearAd(p); await p.waitForTimeout(300);
  await p.evaluate(() => ['flash','dash','ghost'].forEach(a => { if (__t.LOAD[a]) document.querySelector('.card[data-a="'+a+'"]').click(); }));
  await p.click('#play'); await p.waitForTimeout(300);
  await p.mouse.move(340, 790); await p.mouse.down(); await p.mouse.move(340, 740);
  const corner = await st(p, () => ({ on: __t.stick.on, dy: +__t.stick.dy.toFixed(2) }));
  await p.mouse.up();
  ok(corner.on && corner.dy < 0, 'bottom-right corner drives the stick in a purist run  ' + JSON.stringify(corner));

  console.log('..'+'7 —');
  /* 7 — an armed run still protects the ability thumb */
  await dieNow(p);
  await p.evaluate(() => { __t.toMenu(); }); await clearAd(p); await p.waitForTimeout(300);
  await p.evaluate(() => ['flash','dash','ghost'].forEach(a => { if (!__t.LOAD[a]) document.querySelector('.card[data-a="'+a+'"]').click(); }));
  await p.click('#play'); await p.waitForTimeout(300);
  const box = await st(p, () => { const r = __t.abBtns.dash.el.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; });
  await p.mouse.move(box.x, box.y); await p.mouse.down(); await p.mouse.move(box.x, box.y - 40);
  const onBtn = await st(p, () => __t.stick.on);
  await p.mouse.up();
  ok(!onBtn, 'a press on a visible ability button does not spawn a joystick');

  console.log('..'+'8 —');
  /* 8 — an unread leaderboard is never overwritten */
  ok(await st(p, () => __t.wipeGuard()), 'an unread leaderboard is never overwritten');

  /* 9 — one revived run = one death and one board entry */
  const board = await st(p, () => ({ deaths: __t.S.deaths, rows: document.querySelectorAll('#board2 .r').length }));
  console.log('\nSTAGE 9'); console.log('deaths counted:', board.deaths);
  R.finish(errs);
  await b.close();
})();
