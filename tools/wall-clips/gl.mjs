// Groom Lake: the coded prototype in ~/Projects/Personal/groom-lake/prototype (python3 dev-server.py, port 8081).
// Screens are filmed at 1600x1040, the size the wall's stills were taken at, and scaled to the 720x468 tile.
// Every tile on the wall is one of these, so there are enough to fill it without a screen showing twice at once, in both
// themes and as all four of the prototype's people. Each runs 10-12 seconds. Each act() undoes what it did, so the clip
// ends on its first frame; seam: 'fade' marks the ones that can't, which dissolve their end into their start.
const VIEW = n => `.viewswitch__btn >> nth=${n}`;   // list, table, card, calendar, folder, chart
const MID = [800, 560];
const clip = (name, url, theme, persona, extra) => ({ name, url, theme, persona, ...extra });

// ── the interactions, each written once and filmed as more than one person or theme
async function createNew(p, h) {
  await h.press('#ws-create-btn'); await h.wait(1000);
  await h.press('.cn-seg__btn:nth-child(2)', 450); await h.wait(1300);
  await h.press('.cn-seg__btn:nth-child(3)', 350); await h.wait(1300);
  await h.press('.cn-seg__btn:nth-child(1)', 350); await h.wait(700);
  await h.try(async () => { await h.press('.cn-search input, input[placeholder*="record type" i]', 400); await h.type('insp', 8); await h.wait(1400);
    for (let i = 0; i < 4; i++) { await p.keyboard.press('Backspace'); await h.wait(90); } });
  await h.wait(800);
  await h.press('.cn-close', 450); await h.wait(800);
}
async function mazlanDrawer(p, h) {
  await h.press('.appbar__mazlan'); await h.wait(1600);
  await h.try(async () => { await h.press('.mazlan-suggestions__shuffle', 500); await h.wait(1300); await h.press('.mazlan-suggestions__shuffle', 200); await h.wait(1300); });
  await h.try(async () => { await h.press('.mazlan-drawer__menu-btn >> nth=0', 500); await h.wait(1500); await h.press('.mazlan-drawer__menu-btn >> nth=0', 300); await h.wait(900); });
  await p.keyboard.press('Escape'); await h.wait(900);
}
async function homeTour(p, h) {   // a person reading down their own dashboard and back
  await h.glide(...MID, 600); await h.wait(500);
  await h.scroll(700, 2600); await h.wait(1200);
  await h.glide(1100, 500, 700); await h.wait(500);
  await h.scroll(-700, 2600); await h.wait(900);
}
async function customize(p, h) {
  await h.press('#home-customize'); await h.wait(1000);
  await h.press('.cz-pattern >> nth=4', 450); await h.wait(1500);
  await h.press('.cz-pattern >> nth=5', 300); await h.wait(1500);
  await h.press('.cz-pattern >> nth=1', 400); await h.wait(1200);
  await h.try(async () => { await h.press('.cz-size:has-text("L") >> nth=0', 500); await h.wait(1200); await h.press('.cz-size:has-text("M") >> nth=0', 300); await h.wait(1000); });
  await h.press('#cz-done', 450); await h.wait(900);
}
async function addComponent(p, h) {
  await h.press('#home-customize'); await h.wait(1000);
  await h.press('#cz-add', 450); await h.wait(1700);
  await h.glide(800, 420, 600); await h.wait(500); await h.scroll(400, 1500); await h.wait(800); await h.scroll(-400, 1200); await h.wait(500);
  await p.keyboard.press('Escape'); await h.wait(700);
  await h.press('#cz-done', 450); await h.wait(900);
}
async function searchViews(p, h) {
  for (const [n, ms] of [[1, 1500], [2, 1500], [3, 1600], [4, 1500], [0, 1000]]) { await h.press(VIEW(n), 350); await h.wait(ms); }
}
async function searchSort(p, h) {
  await h.press('#openFilterDrawer'); await h.wait(1800);
  await p.keyboard.press('Escape'); await h.wait(900);
  await h.press('#sortBtn', 450); await h.wait(800);
  await h.press('.sortmenu__opt:has-text("Due Date")', 350); await h.wait(1600);
  await h.press('#sortBtn', 400); await h.wait(700);
  await h.press('.sortmenu__opt:has-text("Last Updated")', 300); await h.wait(1300);
}
async function searchChart(p, h) {
  await h.press(VIEW(5)); await h.wait(1000);
  await h.press('.viz-tile:has-text("Area")', 450); await h.wait(2600);
  await h.try(async () => { await h.press('#chartOptBtn', 450); await h.wait(1200); await p.keyboard.press('Escape'); await h.wait(600); });
  await h.glide(700, 600, 900); await h.wait(500); await h.glide(1100, 560, 900); await h.wait(1400);
}
async function calendar(p, h) {
  await h.press('[aria-label*="Next month" i], button[aria-label*="next" i] >> nth=0'); await h.wait(1400);
  await h.press('[aria-label*="Next month" i], button[aria-label*="next" i] >> nth=0', 250); await h.wait(1400);
  await h.try(async () => { await h.press('button:text-is("Week")', 450); await h.wait(1700); await h.press('button:text-is("Month")', 350); await h.wait(1200); });
  await h.press('[aria-label*="Previous month" i], button[aria-label*="prev" i] >> nth=0', 400); await h.wait(1200);
  await h.press('[aria-label*="Previous month" i], button[aria-label*="prev" i] >> nth=0', 250); await h.wait(1000);
}
async function theme(p, h) {
  await h.press('#ws-avatar'); await h.wait(900);
  await h.press('.verswitch__opt >> nth=0', 450); await h.wait(2600);
  await h.press('.verswitch__opt >> nth=1', 350); await h.wait(1500);
  await p.keyboard.press('Escape'); await h.wait(600);
  await h.glide(...MID, 600); await h.scroll(500, 1800); await h.wait(600); await h.scroll(-500, 1800); await h.wait(600);
}
async function recordPanels(p, h) {
  await h.press('.panel-toggle >> nth=0'); await h.wait(1100);
  await h.press('.panel-toggle >> nth=1', 500); await h.wait(1300);
  await h.glide(...MID, 500); await h.scroll(600, 2000); await h.wait(700);
  await h.scroll(-600, 1800); await h.wait(500);
  await h.press('.panel-toggle >> nth=1', 400); await h.wait(900);
  await h.press('.panel-toggle >> nth=0', 500); await h.wait(1100);
}
async function recordRead(p, h) {   // down the record to its history and back
  await h.glide(...MID, 600); await h.scroll(800, 2600); await h.wait(700);
  await h.press('#rec-tab-history', 500); await h.wait(1600);
  await h.press('#rec-tab-details', 300); await h.wait(800);
  await h.glide(...MID, 400); await h.scroll(-800, 2600); await h.wait(800);
}
async function reports(p, h) {
  const chev = g => `.rm-row:has-text("${g}") .rm-row__chev >> nth=0`;
  await h.press(chev('Custom Reports')); await h.wait(1300);
  await h.press(chev('My Reports'), 300); await h.wait(1300);
  await h.press(chev('Shared Reports'), 300); await h.wait(1800);
  await h.press(chev('Shared Reports'), 250); await h.wait(1000);
  await h.press(chev('My Reports'), 300); await h.wait(1000);
  await h.press(chev('Custom Reports'), 300); await h.wait(1400);
}
async function reportFilter(p, h) {
  await h.press('#rm-filter', 450); await h.type('trend', 9); await h.wait(1800);
  for (let i = 0; i < 5; i++) { await p.keyboard.press('Backspace'); await h.wait(110); }
  await h.wait(900); await h.press('#rm-view-pinned', 500); await h.wait(1700); await h.press('#rm-view-pinned', 300); await h.wait(1400);
}
async function adminUsers(p, h) {
  await h.press('#au-first'); await h.wait(200); await h.type('Pri', 8); await h.wait(300);
  await h.press('#au-search', 400); await h.wait(2000);
  await h.press('#au-first', 400); for (let i = 0; i < 3; i++) { await p.keyboard.press('Backspace'); await h.wait(100); }
  await h.type('Mar', 8); await h.press('#au-search', 400); await h.wait(2000);
  await h.press('#au-locked', 450); await h.wait(1600);
}
async function editor(p, h) {
  await h.press('#we-tab-components', 450); await h.wait(1500);
  await h.press('#we-tab-reports', 350); await h.wait(1000);
  await h.press('.cz-pattern >> nth=4', 450); await h.wait(1500);
  await h.press('.cz-pattern >> nth=5', 300); await h.wait(1500);
  await h.press('.cz-pattern >> nth=1', 400); await h.wait(1500);
}
async function mazlanBuild(p, h) {
  await h.press('.mazlan-sugg >> nth=0', 400); await h.wait(3000);
  await h.press('.mzb-go', 400); await h.wait(2600);
  await h.try(async () => { await h.press('text=Next 3 days', 400); await h.wait(1000); });
  await h.press('.mzb-add', 400); await h.wait(1800);
}
const openDrawer = async (p, h) => { await p.click('.appbar__mazlan'); await h.wait(1500); };
const toView = n => async p => { await p.click(VIEW(n)); };

export default {
  base: 'http://127.0.0.1:8081/',
  viewport: [1600, 1040],
  css: '.proto-controls, .proto-controls__btn { display: none !important; }',
  async prepare(ctx, c) {
    await ctx.addInitScript(([t, who]) => { sessionStorage.setItem('gl-authed', '1'); localStorage.setItem('gl-theme', t); localStorage.setItem('gl-persona', who); }, [c.theme || 'dark', c.persona || 'manager']);
  },
  clips: [
    clip('create-new',        'index.html', 'dark',  'manager',   { act: createNew }),
    clip('create-new-light',  'index.html', 'light', 'lead',      { act: createNew }),
    clip('drawer',            'index.html', 'dark',  'manager',   { act: mazlanDrawer }),
    clip('drawer-light',      'index.html', 'light', 'operator',  { act: mazlanDrawer }),
    clip('build',             'index.html', 'dark',  'manager',   { setup: openDrawer, act: mazlanBuild, seam: 'fade', fade: 0.6 }),
    clip('build-light',       'index.html', 'light', 'executive', { setup: openDrawer, act: mazlanBuild, seam: 'fade', fade: 0.6 }),
    clip('home-exec',         'index.html', 'light', 'executive', { act: homeTour }),
    clip('home-operator',     'index.html', 'dark',  'operator',  { act: homeTour }),
    clip('home-lead',         'index.html', 'dark',  'lead',      { act: homeTour }),
    clip('customize',         'index.html', 'dark',  'manager',   { act: customize }),
    clip('customize-light',   'index.html', 'light', 'executive', { act: customize }),
    clip('add-component',     'index.html', 'dark',  'lead',      { act: addComponent }),
    clip('search-views',      'search-page.html', 'dark',  'manager', { act: searchViews }),
    clip('search-views-light','search-page.html', 'light', 'manager', { act: searchViews }),
    clip('search-sort',       'search-page.html', 'dark',  'manager', { act: searchSort }),
    clip('search-chart',      'search-page.html', 'dark',  'manager', { act: searchChart, seam: 'fade' }),
    clip('calendar',          'search-page.html', 'dark',  'manager', { setup: toView(3), act: calendar }),
    clip('theme',             'index.html', 'dark',  'manager',   { act: theme }),
    clip('record-panels',     'record.html?id=INC-2026-0412', 'dark',  'manager', { act: recordPanels }),
    clip('record-read',       'record.html?id=CA-2026-0702',  'light', 'manager', { act: recordRead }),
    clip('reports',           'report-management.html', 'dark',  'manager', { act: reports }),
    clip('reports-light',     'report-management.html', 'light', 'manager', { act: reportFilter }),
    clip('admin-users',       'admin-users.html', 'dark',  'manager', { act: adminUsers, seam: 'fade' }),
    clip('editor',            'workspace-editor.html', 'dark', 'manager', { act: editor }),
  ],
};
