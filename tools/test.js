const { chromium } = require('playwright');
const { gameUrl, PHONE, clearAd, watchAd, dieNow, reporter } = require('./harness');
const R = reporter(), ok = R.ok;



(async () => {
  const b = await chromium.launch();
  const p = await b.newPage(PHONE);
  const errs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

  await p.goto(gameUrl());
  await p.waitForTimeout(2500);
  await p.screenshot({ path: './shot-menu.png' });

  // does the demo arena actually spawn hazards behind the menu?
  const demoHaz = await p.evaluate(() => document.querySelectorAll('canvas').length);
  console.log('canvas count:', demoHaz);

  // start a run
  await p.click('#play');
  await p.waitForTimeout(400);

  // drive it: hold a direction, fire abilities
  await p.keyboard.down('d');
  await p.waitForTimeout(700);
  await p.keyboard.up('d');
  await p.keyboard.press('f');
  await p.keyboard.down('w');
  await p.waitForTimeout(600);
  await p.keyboard.up('w');
  await p.keyboard.press(' ');
  await p.waitForTimeout(300);
  await p.keyboard.press('g');
  await p.waitForTimeout(1200);

  const mid = await p.evaluate(() => ({
    timer: document.getElementById('ctime').textContent,
    hudOn: document.getElementById('hud').classList.contains('on'),
    visibleAbils: [...document.querySelectorAll('.ab')].filter(e => !e.classList.contains('hide')).length
  }));
  console.log('mid-run:', JSON.stringify(mid));
  await p.screenshot({ path: './shot-play.png' });

  // let it run until death (stand still -> should die)
  for (let i = 0; i < 90; i++) {
    const over = await p.evaluate(() => document.getElementById('over').classList.contains('on'));
    if (over) break;
    await p.waitForTimeout(500);
  }
  const dead = await p.evaluate(() => ({
    over: document.getElementById('over').classList.contains('on'),
    time: document.getElementById('otime').textContent,
    sub: document.getElementById('osub').textContent,
    rows: document.querySelectorAll('#board2 .r').length,
    stored: localStorage.getItem('skillshot.scores.v1')
  }));
  console.log('death:', JSON.stringify(dead));
  await p.screenshot({ path: './shot-over.png' });

  // revive path
  await p.click('#revive');
  await p.waitForTimeout(6000);   // rewarded ad (5s) then the 3s countdown starts
  const rev = await p.evaluate(() => ({ overHidden: !document.getElementById('over').classList.contains('on') }));
  console.log('revive:', JSON.stringify(rev));

  // back to menu after the next death
  for (let i = 0; i < 90; i++) {
    const over = await p.evaluate(() => document.getElementById('over').classList.contains('on'));
    if (over) break;
    await p.waitForTimeout(500);
  }
  await clearAd(p);
  await p.click('#tomenu');
  await clearAd(p);
  await p.waitForTimeout(500);
  const menu = await p.evaluate(() => ({
    menuOn: document.getElementById('menu').classList.contains('on'),
    rows: document.querySelectorAll('#board .r').length,
    runcount: document.getElementById('runcount').textContent
  }));
  console.log('menu:', JSON.stringify(menu));

  // purist toggle
  await p.click('.card[data-a="flash"]');
  await p.click('.card[data-a="dash"]');
  const load = await p.evaluate(() => document.getElementById('loadstate').textContent);
  console.log('loadstate after disarming:', load);
  await p.screenshot({ path: './shot-menu2.png' });

  await p.click('#play');
  await p.waitForTimeout(600);
  const noAb = await p.evaluate(() => [...document.querySelectorAll('.ab')].filter(e => !e.classList.contains('hide')).length);
  console.log('visible abilities in purist run:', noAb);

  R.finish(errs);
  await b.close();
})();
