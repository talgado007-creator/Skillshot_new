// Compose the Play Store feature graphic (1024x500, required for every listing).
//
//   cd tools && node feature.js
//
// Renders an HTML composition in headless Chromium and shoots it at exactly 1024x500
// with no alpha, which is what Play accepts. The artwork is built from the game's own
// vocabulary — arena grid, ember projectiles, an acid boomerang, a flare AoE bloom and
// the mana player dot — rather than generic marketing furniture.
//
// Play crops this graphic differently across surfaces, so everything that must survive
// sits inside the middle ~80%; the streaks are the only things allowed near the edges.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const FONTS = path.join(__dirname, '..', 'www', 'fonts');
const OUT = path.join(__dirname, '..', 'assets', 'store', 'feature-graphic-1024x500.png');

const font = f => fs.readFileSync(path.join(FONTS, f)).toString('base64');

const HTML = `
<meta charset="utf-8">
<style>
  @font-face{font-family:'Oxanium';font-weight:800;font-display:block;
    src:url(data:font/woff2;base64,${font('oxanium-latin-800-normal.woff2')}) format('woff2')}
  @font-face{font-family:'Barlow';font-weight:500;font-display:block;
    src:url(data:font/woff2;base64,${font('barlow-latin-500-normal.woff2')}) format('woff2')}

  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1024px;height:500px;overflow:hidden}
  body{
    position:relative;background:#07090F;
    font-family:'Barlow',sans-serif;
  }
  /* arena grid, same 40px cell feel as the game canvas */
  .grid{
    position:absolute;inset:0;
    background-image:
      linear-gradient(#12203a 1px, transparent 1px),
      linear-gradient(90deg, #12203a 1px, transparent 1px);
    background-size:56px 56px;
    opacity:.55;
  }
  /* depth: cool wash behind the type, warm bloom behind the hazards */
  .wash{position:absolute;inset:0;
    background:
      radial-gradient(120% 90% at 22% 50%, rgba(55,225,255,.16), transparent 60%),
      radial-gradient(70% 70% at 78% 62%, rgba(255,160,46,.20), transparent 65%),
      radial-gradient(100% 100% at 50% 50%, transparent 40%, rgba(7,9,15,.85) 100%);
  }
  .type{
    position:absolute;left:74px;top:50%;transform:translateY(-50%);
    display:flex;flex-direction:column;gap:14px;
  }
  h1{
    font-family:'Oxanium',sans-serif;font-weight:800;
    font-size:92px;line-height:.92;letter-spacing:.01em;color:#F2FAFF;
    text-shadow:0 0 28px rgba(55,225,255,.55), 0 0 64px rgba(55,225,255,.25);
  }
  .rule{width:96px;height:3px;background:#37E1FF;box-shadow:0 0 14px rgba(55,225,255,.8)}
  /* the line breaks are authored with <br>; the width only needs to be wide enough
     that neither line re-wraps and orphans its last word */
  p{
    font-size:23px;line-height:1.45;color:#AFC2D8;width:400px;font-weight:500;
  }
  p b{color:#F2FAFF;font-weight:500}
  svg{position:absolute;inset:0}
</style>

<div class="grid"></div>
<div class="wash"></div>

<svg viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shot" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#FF3B5C" stop-opacity="0"/>
      <stop offset="100%" stop-color="#FF3B5C" stop-opacity="1"/>
    </linearGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="7" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="16"/>
    </filter>
  </defs>

  <!-- ground AoE: filled bloom plus the warning ring -->
  <g filter="url(#soft)" opacity=".55">
    <circle cx="742" cy="300" r="104" fill="#FFA02E" opacity=".30"/>
  </g>
  <circle cx="742" cy="300" r="104" fill="none" stroke="#FFA02E" stroke-width="3" opacity=".85"/>
  <circle cx="742" cy="300" r="58" fill="#FFA02E" opacity=".30"/>

  <!-- skillshots streaking toward the player -->
  <g filter="url(#glow)" stroke-linecap="round">
    <line x1="1005" y1="126" x2="905" y2="182" stroke="url(#shot)" stroke-width="13"/>
    <line x1="612"  y1="44"  x2="668" y2="130" stroke="url(#shot)" stroke-width="11"/>
    <line x1="1010" y1="430" x2="918" y2="392" stroke="url(#shot)" stroke-width="12"/>
    <line x1="560"  y1="470" x2="620" y2="404" stroke="url(#shot)" stroke-width="10"/>
  </g>

  <!-- laser boomerang: the crescent that replaced the expanding ring -->
  <g filter="url(#glow)">
    <path d="M812 108 a86 86 0 0 1 74 92" fill="none" stroke="#C8FF3D"
          stroke-width="12" stroke-linecap="round" opacity=".95"/>
    <path d="M812 108 a86 86 0 0 1 74 92" fill="none" stroke="#FFFFFF"
          stroke-width="3" stroke-linecap="round" opacity=".75"/>
  </g>

  <!-- sidestep beam, kept on the hazard side so it does not cut the composition in two -->
  <g filter="url(#glow)" opacity=".8">
    <line x1="905" y1="500" x2="1000" y2="30" stroke="#B45CFF" stroke-width="7" opacity=".5"/>
  </g>

  <!-- the player -->
  <g filter="url(#glow)">
    <circle cx="742" cy="300" r="17" fill="#37E1FF" opacity=".35"/>
    <circle cx="742" cy="300" r="11" fill="#EAFEFF"/>
    <circle cx="742" cy="300" r="11" fill="none" stroke="#37E1FF" stroke-width="3"/>
  </g>
</svg>

<div class="type">
  <h1>SKILLSHOT</h1>
  <div class="rule"></div>
  <p>Everything is aimed at you.<br><b>Survive as long as you can.</b></p>
</div>
`;

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1024, height: 500 },
    deviceScaleFactor: 1
  });
  await page.setContent(HTML, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  // omitBackground stays false so the PNG is opaque — Play rejects alpha here.
  await page.screenshot({ path: OUT, omitBackground: false });
  await browser.close();
  console.log('wrote', path.relative(process.cwd(), OUT));
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
