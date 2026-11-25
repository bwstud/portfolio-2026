// Records the three AI moments for the hero film from the Groom Lake prototype: a filter expression written in plain
// language, the agentic incident intake, and a dashboard component built by asking Mazlan. No cursor.
//   node record-ai.mjs <outdir> [filter|intake|build …]
// Writes <outdir>/<flow>.mp4: the whole 1600 × 1000 window at 2x (3200 × 2000), 60 fps, near lossless. compose.html
// frames and cuts these masters; cut-ai.sh makes its clips from them.
// The page's time is stepped a frame at a time, so every timer, transition and typed letter lands on an even 60 fps
// however long a screenshot takes. Playwright's clock stands in for the page's timers, Date, performance.now and
// requestAnimationFrame; each frame, every CSS transition and animation is set to the same clock (and finished when its
// time is up, so code waiting on transitionend carries on). Chrome's own virtual time, which record-signin.mjs uses,
// stalled screenshots at random in these longer flows.
// Each flow is set up in real time (load, open the right panel), then a list of steps runs on the recording's clock:
// a step waits for its time (`at`, seconds after the previous step) and, if given, a condition in the page (`when`),
// then acts. Clicks are real mouse events at the element's centre, so hover and press states show.
// Needs Playwright: PW_PATH=<…/node_modules/playwright/index.mjs> if it isn't installed here.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = await import(process.env.PW_PATH || 'playwright');

const [outdir, ...only] = process.argv.slice(2);
const BASE = process.env.GL_BASE || 'http://127.0.0.1:8081/';
const VW = 1600, VH = 1000;
// DRAFT=1 checks a flow quickly: 15 fps at 1x, same timings
const DRAFT = !!process.env.DRAFT, FPS = DRAFT ? 15 : 60, DPR = DRAFT ? 1 : 2;
// the prototype's demo chrome: the Controls button and the demo stepper
const HIDE = '.proto-controls, .proto-controls__btn, .demo-stepper, [data-demo-stepper], .mzi-stepper { display: none !important; }';

const FLOWS = {
  // Search → Filters → Use Mazlan: a sentence becomes an either/or filter expression, applied to the results
  filter: {
    url: 'search-page.html', theme: 'dark', persona: 'manager',
    async setup(s) { await s.click('#openFilterDrawer'); await s.wait(1000); await s.click('.filter-assist-toggle'); await s.wait(1800); },
    steps: [
      { at: 0.5, type: ['#mazlan-drawer-textarea', 'Investigations at Seal Sands or near misses at Teesside', 30] },
      { at: 0.45, key: 'Enter' },
      { at: 1.6, when: `[...document.querySelectorAll('#mazlan-drawer button')].some(b => /Apply to filters/.test(b.textContent) && b.offsetParent)`, clickText: ['#mazlan-drawer button', 'Apply to filters'] },
      { at: 1.5, clickText: ['button.btn--primary', 'Show'] },
      { at: 2.4, end: true },
    ],
  },
  // Home → Mazlan, full screen: a spoken description of an incident; Mazlan reasons, then opens the draft record beside
  // the chat, filled field by field
  intake: {
    url: 'index.html', theme: 'dark', persona: 'manager',
    async setup(s) { await s.wait(500); },
    steps: [
      { at: 0.3, eval: 'window.openMazlanDrawer && window.openMazlanDrawer()' },
      { at: 0.9, eval: 'praxisMazlanIntake.setFull(true); praxisMazlanIntake.begin()' },
      // the description has dictated itself in full (it ends "job's stopped."): a click any sooner would cut it short
      { at: 0, when: `/stopped\.\s*$/.test((document.getElementById('mazlan-drawer-textarea') || {}).value || '')` },
      { at: 1.2, click: '#mazlan-primary-btn' },
      { at: 0.5, when: `!!document.getElementById('mzi-art-scroll') && document.getElementById('mzi-art-scroll').offsetParent !== null` },
      { at: 9, end: true },
    ],
  },
  // Home → Customize → Mazlan: asking for a component, three quick choices, the preview, and it lands on the dashboard
  build: {
    url: 'index.html', theme: 'dark', persona: 'manager',
    async setup(s) { await s.click('#home-customize'); await s.wait(1200); },
    steps: [
      { at: 0.4, click: '.appbar__mazlan' },
      { at: 1.0, type: ['#mazlan-drawer-textarea', 'Make me a component showing permits live around the shutdown', 30] },
      { at: 0.45, key: 'Enter' },
      { at: 1.4, when: `!!document.querySelector('.mzb-go') && document.querySelector('.mzb-go').offsetParent !== null`, clickText: ['#mazlan-drawer *', 'Live in the next 3 days'] },
      { at: 0.8, click: '.mzb-go' },
      { at: 2.2, when: `!!document.querySelector('.mzb-add') && document.querySelector('.mzb-add').offsetParent !== null`, click: '.mzb-add' },
      { at: 3.0, end: true },
    ],
  },
};

// ---- Recording -----------------------------------------------------------------------------------------------------
const wait = ms => new Promise(r => setTimeout(r, ms));
// moves every CSS transition and animation (and element.animate) to the recording's clock
const SYNC = `window.__sync = now => {
  for (const a of document.getAnimations()) {
    if (a.__born == null) a.__born = now - (a.currentTime || 0);
    const end = a.effect && a.effect.getComputedTiming().endTime, t = now - a.__born;
    if (Number.isFinite(end) && t >= end) { try { a.finish(); } catch (e) {} continue; }
    if (a.playState !== 'paused') a.pause();
    a.currentTime = t;
  }
};`;

async function record(name, flow, browser) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
  await ctx.addInitScript(([theme, persona, css, sync]) => {
    sessionStorage.setItem('gl-authed', '1'); localStorage.setItem('gl-theme', theme); localStorage.setItem('gl-persona', persona);
    document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.append(st); });
    (0, eval)(sync);
  }, [flow.theme, flow.persona, HIDE, SYNC]);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('  page error:', e.message));
  const center = async (sel, text) => page.evaluate(([sel, text]) => {
    // with text, the smallest visible element that holds it (the chip, not the panel around it)
    const all = [...document.querySelectorAll(sel)].filter(b => b.offsetParent && (!text || b.textContent.includes(text)));
    const e = text ? all.sort((a, b) => a.textContent.length - b.textContent.length)[0] : all[0];
    if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];
  }, [sel, text]);
  const press = async c => { await page.mouse.move(...c); await page.mouse.down(); await page.mouse.up(); await page.mouse.move(VW - 2, VH - 2); };
  const s = { wait, async click(sel) { const c = await center(sel); if (!c) throw new Error(`${name}: no ${sel}`); await press(c); } };

  await page.goto(BASE + flow.url, { waitUntil: 'load' });
  await wait(2500);   // fonts and the page's own entrance, in real time
  await flow.setup(s);
  await page.mouse.move(VW - 2, VH - 2);
  await wait(600);

  // from here the page's time is the recording's
  await page.clock.install();
  const start = await page.evaluate(() => Date.now());
  const out = path.join(outdir, name + '.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p', '-an', out], { stdio: ['pipe', 'inherit', 'inherit'] });

  let f = 0, k = 0, since = 0, typing = null;
  const steps = flow.steps, LIMIT = 40 * FPS, log = [];
  while (f < LIMIT) {
    const t = f / FPS;
    if (!typing && k < steps.length) {
      const st = steps[k];
      if (t - since >= st.at && (!st.when || await page.evaluate(st.when))) {
        if (st.end) break;
        log.push(`${t.toFixed(2)}s ${Object.keys(st).filter(x => x !== 'at').join('+')}`); console.error(`  ${name} ${log.at(-1)}`);
        if (st.eval) await page.evaluate(st.eval);
        if (st.key) await page.keyboard.press(st.key);
        if (st.click || st.clickText) {
          const c = st.click ? await center(st.click) : await center(...st.clickText);
          if (!c) throw new Error(`${name}: step ${k} found nothing to click`);
          await press(c);
        }
        if (st.type) { await page.focus(st.type[0]); typing = { text: st.type[1], cps: st.type[2], from: t, n: 0 }; }
        k++; since = t;
      }
    }
    if (typing) {
      const n = Math.min(typing.text.length, Math.floor((t - typing.from) * typing.cps));
      if (n > typing.n) { await page.keyboard.insertText(typing.text.slice(typing.n, n)); typing.n = n; }
      if (n >= typing.text.length) { typing = null; since = t; }
    }
    if (f > 0) await page.clock.runFor(1000 / FPS);
    await page.evaluate(now => window.__sync(now), 1000 * t);
    const shot = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(shot)) await new Promise(r => ff.stdin.once('drain', r));
    f++;
    if (f % (FPS * 5) === 0) console.error(`  ${name} ${(f / FPS).toFixed(0)}s recorded`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  await ctx.close();
  console.error(`${name}: ${(f / FPS).toFixed(2)}s${k < steps.length - 1 ? ` (stopped at step ${k + 1} of ${steps.length})` : ''}`);
}

fs.mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch();
for (const [name, flow] of Object.entries(FLOWS)) if (!only.length || only.includes(name)) await record(name, flow, browser);
await browser.close();
