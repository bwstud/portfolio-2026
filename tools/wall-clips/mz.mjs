// Mazlan Builder: the coded prototype in ~/Projects/Personal/Mazlan Builder Extended (any static server; port 8084 here).
// Filmed at 1512x982, the size the wall's stills were taken at (a 1512-wide window less its menu bar).
// Every tile on the wall is one of these, 10-12 seconds each, in light and dark. The Builder clips each start partway
// through the walkthrough: setup() plays the story up to the moment, off camera.
const OPENER = 'Show me how the Nonconformance module is configured today';
const ready = p => p.waitForFunction(() => window.MazlanBuilder, null, { timeout: 30000 });
const dark = p => p.evaluate(() => { document.body.dataset.theme = 'dark'; });
async function story(p, h, step) {   // 0 snapshot shown, 1 first question, 2 second, 3 third, 4 specification written
  await ready(p);
  await p.evaluate(t => window.MazlanBuilder.sendMessage(t), OPENER); await h.wait(9000);
  if (step < 1) return;
  await p.click('.followup >> nth=1'); await h.wait(9000);
  for (let i = 1; i < step; i++) { await p.click('.send-btn'); await h.wait(i === 3 ? 26000 : 8000); }
}
const at = (step, isDark) => async (p, h) => { await story(p, h, step); if (isDark) await dark(p); };
const home = async (p, h) => { await p.click('.wonb-x', { timeout: 5000 }).catch(() => {}); await h.wait(600); };
async function typeAndSend(p, h, sel, text) {
  await h.press(sel, 450); await h.wait(200); await h.type(text, 30); await h.wait(300); await p.keyboard.press('Enter');
}
const C = (name, url, extra) => ({ name, url, ...extra });

// ── the interactions
async function homeAsk(p, h) { await typeAndSend(p, h, '#textarea', 'Why is our nonconformance form asking if a critical safety item is affected?'); await h.wait(8500); }
async function homeApps(p, h) {
  await h.press('#navApps'); await h.wait(1300);
  await h.press('.wsapps-modechip >> nth=1', 450); await h.wait(1500);
  await h.press('.wsapps-modechip >> nth=2', 350); await h.wait(1300);
  await h.glide(900, 700, 500); await h.scroll(500, 1600); await h.wait(500); await h.scroll(-500, 1400);
  await h.press('.wsapps-modechip >> nth=0', 400); await h.wait(800);
  await h.press('#navNewChat', 450); await h.wait(1000);
}
async function homeNav(p, h) {
  for (const id of ['#navWork', '#navBriefs', '#navCapabilities', '#navDiscover']) { await h.press(id, 400); await h.wait(2000); }
  await h.press('#navNewChat', 400); await h.wait(1200);
}
async function welcome(p, h) {   // Builder's own home: a look along the three ways in, then the assistants shuffled
  for (const n of [0, 1, 2]) { await h.try(async () => { const [x, y] = await h.at(`.welcome-cat >> nth=${n}`); await h.glide(x, y, 500); await h.wait(900); }); }
  for (let i = 0; i < 3; i++) { await h.press('.welcome-assist-shuffle', 450); await h.wait(1700); }
  for (const n of [0, 1, 3]) { await h.try(async () => { const [x, y] = await h.at(`.assist-card >> nth=${n}`); await h.glide(x, y, 450); await h.wait(700); }); }
}
async function snapshot(p, h) { await typeAndSend(p, h, '#chatInput', OPENER); await h.wait(7500); await h.glide(1150, 600, 500); await h.scroll(500, 1600); await h.wait(600); }
async function workflow(p, h) { await h.press('.followup >> nth=0'); await h.wait(7000); await h.glide(1150, 500, 600); await h.wait(1200); }
async function answerSites(p, h) {
  await h.press('text=Every manufacturing site', 450); await h.wait(900);
  await h.press('text=Drive it from the Part Master flag instead', 300); await h.wait(900);
  await h.press('text=Toulouse and Querétaro, alongside Wichita >> nth=-1', 350); await h.wait(600);
  await h.press('.send-btn', 450); await h.wait(6000);
}
async function answerTypes(p, h) {
  await h.press('.seg-btn >> nth=1', 450); await h.wait(1000);
  await h.press('.seg-btn >> nth=0', 350); await h.wait(600);
  await h.press('.send-btn', 450); await h.wait(6500);
}
async function answerNotify(p, h) {
  await h.try(async () => { await h.press('text=The site MRB chair', 450); await h.wait(900); await h.press('text=Nobody', 300); await h.wait(900); await h.press('text=The Airworthiness Engineer for that site >> nth=-1', 350); await h.wait(600); });
  await h.press('.send-btn', 450); await h.wait(8000);
}
async function specPreview(p, h) {
  await h.press('.rp-pill:has-text("No")', 500); await h.wait(900);
  await h.press('.rp-pill:has-text("Unsure")', 350); await h.wait(900);
  await h.press('.rp-pill:has-text("Yes")', 350); await h.wait(900);
  await h.try(async () => { await h.press('.rp-control >> nth=1', 450); await h.wait(1500); await p.keyboard.press('Escape'); await h.wait(600); });
  await h.glide(1150, 500, 500); await h.scroll(400, 1400); await h.wait(500); await h.scroll(-400, 1400); await h.wait(700);
}
async function specTabs(p, h) {
  await h.press('.spec-viewtab >> nth=1'); await h.wait(1500);
  await h.glide(1150, 560, 500); await h.scroll(900, 3000); await h.wait(800); await h.scroll(-900, 2400); await h.wait(500);
  await h.press('.spec-viewtab >> nth=0', 350); await h.wait(1300);
}
async function artifacts(p, h) {
  await h.press('.rail-nav-item:has-text("Artifacts")'); await h.wait(2500);
  await h.glide(900, 500, 500); await h.scroll(500, 1800); await h.wait(700); await h.scroll(-500, 1600); await h.wait(1800);
}
async function engEnvs(p, h) {
  for (const [env, ms] of [['build', 1300], ['uat', 1300], ['prod', 1300]]) { await h.press(`.eng-env[data-env="${env}"]`, 350); await h.wait(ms); }
  await h.try(async () => { await p.selectOption('#engCustomer', 'northfield'); await h.wait(1800); await p.selectOption('#engCustomer', 'aerostar'); await h.wait(1500); });
  await h.press('.eng-env[data-env="test"]', 350); await h.wait(1200);
}
async function engHealth(p, h) {
  await h.press('.eng-hrow-main[data-module="Corrective Action"]'); await h.wait(1700);
  await h.press('.eng-hrow-main[data-module="First Article Inspection"]', 350); await h.wait(1700);
  await h.press('.eng-hrow-main[data-module="Supplier Quality"]', 300); await h.wait(1600);
  for (const m of ['Supplier Quality', 'First Article Inspection', 'Corrective Action']) { await h.press(`.eng-hrow-main[data-module="${m}"]`, 250); await h.wait(600); }
  await h.wait(800);
}
async function engQueue(p, h) {
  await h.press('[data-scope="all"]', 450); await h.wait(1800);
  await h.glide(1240, 600, 500); await h.scroll(400, 1400); await h.wait(600); await h.scroll(-400, 1300);
  await h.press('[data-scope="customer"]', 400); await h.wait(1300);
  await h.try(async () => { await p.selectOption('#engCustomer', 'calder'); await h.wait(1800); await p.selectOption('#engCustomer', 'aerostar'); await h.wait(1300); });
}
const tool = n => async (p, h) => { await h.press(`.eng-tool >> nth=${n}`); await h.wait(8000); await h.glide(1100, 520, 600); await h.wait(1500); };
async function engPickup(p, h) { await h.press('.eng-pick[data-ticket="CFG-2187"]'); await h.wait(9500); await h.glide(1150, 520, 600); await h.wait(800); }
async function engDepmap(p, h) {
  await h.press('.eng-tool >> nth=0'); await h.wait(6500);
  for (const n of [0, 2, 4, 1]) { await h.try(async () => { const b = await p.locator('.edm-node[data-node]').nth(n).boundingBox(); if (b) { await h.glide(b.x + b.width / 2, b.y + b.height / 2, 450); await h.wait(900); } }); }
}

export default {
  base: 'http://127.0.0.1:8084/',
  viewport: [1512, 982],
  hd: true,   // each clip also at full size, for a screen picked up off the wall
  css: '.demo-start, #startDemoBtn, .dev-fab, #devFab { display: none !important; }',
  clips: [
    // Mazlan Home (the customer's own Mazlan, dark)
    C('home-ask',      'index.html', { setup: home, act: homeAsk, seam: 'fade', fade: 0.6 }),
    C('home-apps',     'index.html', { setup: home, act: homeApps }),
    C('home-nav',      'index.html', { setup: home, act: homeNav }),
    // Builder, the customer's spec flow
    C('welcome',       'builder.html', { setup: ready, act: welcome }),
    C('snapshot',      'builder.html', { setup: ready, act: snapshot, seam: 'fade', fade: 0.6 }),
    C('snapshot-dark', 'builder.html', { setup: async p => { await ready(p); await dark(p); }, act: snapshot, seam: 'fade', fade: 0.6 }),
    C('workflow',      'builder.html', { setup: at(0, true),  act: workflow, seam: 'fade', fade: 0.6 }),
    C('answer-sites',  'builder.html', { setup: at(1, false), act: answerSites, seam: 'fade' }),
    C('answer-sites-dark', 'builder.html', { setup: at(1, true), act: answerSites, seam: 'fade' }),
    C('answer-types',  'builder.html', { setup: at(2, true),  act: answerTypes, seam: 'fade' }),
    C('answer-notify', 'builder.html', { setup: at(3, false), act: answerNotify, seam: 'fade', fade: 0.6 }),
    C('spec-preview',  'builder.html', { setup: at(4, true),  act: specPreview }),
    C('spec-tabs',     'builder.html', { setup: at(4, false), act: specTabs }),
    C('artifacts',     'builder.html', { setup: at(4, false), act: artifacts, seam: 'fade' }),
    // Builder · Engineering, the application engineer who can make the change
    C('eng-envs',      'engineer.html', { setup: ready, act: engEnvs }),
    C('eng-health',    'engineer.html', { setup: async p => { await ready(p); await dark(p); }, act: engHealth, seam: 'fade' }),
    C('eng-queue',     'engineer.html', { setup: async p => { await ready(p); await dark(p); }, act: engQueue, seam: 'fade' }),
    C('eng-pickup',    'engineer.html', { setup: ready, act: engPickup, seam: 'fade', fade: 0.6 }),
    C('eng-depmap',    'engineer.html', { setup: async p => { await ready(p); await dark(p); }, act: engDepmap, seam: 'fade', fade: 0.6 }),
    C('eng-compare',   'engineer.html', { setup: ready, act: tool(1), seam: 'fade', fade: 0.6 }),
    C('eng-tests',     'engineer.html', { setup: async p => { await ready(p); await dark(p); }, act: tool(2), seam: 'fade', fade: 0.6 }),
  ],
};
