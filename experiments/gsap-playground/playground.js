import { LESSONS, SKILLS } from './lessons.js';

const GSAP = 'https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/';
// plugins are loaded only when the code mentions them; order matters for the eases
const PLUGINS = [
  ['ScrollTrigger'], ['ScrollToPlugin'], ['ScrollSmoother'], ['Observer'],
  ['Flip'], ['Draggable'], ['InertiaPlugin'],
  ['SplitText'], ['ScrambleTextPlugin'], ['TextPlugin'],
  ['DrawSVGPlugin'], ['MorphSVGPlugin'], ['MotionPathPlugin'], ['MotionPathHelper'],
  ['CustomEase'], ['CustomWiggle'], ['CustomBounce'],
  ['EasePack', /\b(EasePack|RoughEase|SlowMo|ExpoScaleEase)\b/],
  ['Physics2DPlugin'], ['PhysicsPropsPlugin'], ['GSDevTools'],
];
const NEEDS = { CustomWiggle: 'CustomEase', CustomBounce: 'CustomEase', ScrollSmoother: 'ScrollTrigger', MotionPathHelper: 'MotionPathPlugin' };

const COLORS = ['#7cc4ff', '#ffb36b', '#8fe0b8', '#ff8fb1', '#b8a4ff'];

const STAGE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:#1a1d25 radial-gradient(rgba(255,255,255,.07) 1px,transparent 1.5px) 0 0/22px 22px;color:#e9e6df;
  font:13px/1.45 -apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;
  display:grid;place-items:center;overflow:hidden;padding:20px}
body.is-scroll{display:block;place-items:normal;overflow-x:hidden;overflow-y:auto;padding:0}
code,output,.lane>span{font:11px/1.4 ui-monospace,"SF Mono",Menlo,monospace;color:#8a8f9c}
.c1{--c:#7cc4ff}.c2{--c:#ffb36b}.c3{--c:#8fe0b8}.c4{--c:#ff8fb1}.c5{--c:#b8a4ff}
.box{width:56px;height:56px;border-radius:10px;background:var(--c,#7cc4ff);flex:none}
.dot{width:22px;height:22px;border-radius:50%;background:var(--c,#7cc4ff);flex:none}
.lanes{display:grid;gap:16px;width:min(340px,100%)}
.lane{display:flex;align-items:center;gap:12px;min-height:22px}
.lane>span{width:52px;flex:none}
.lane--stack{flex-direction:column;align-items:flex-start;gap:4px}
.lane--stack>span{width:auto}
.row{display:flex;align-items:center;gap:22px;flex-wrap:wrap;justify-content:center}
.row--tight{gap:10px;justify-content:flex-start}
.row small{color:#8a8f9c}
.stack{display:grid;gap:22px;justify-items:center}
.stack--left{justify-items:start;gap:14px}
.controls{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:360px}
button{font:12px/1 ui-monospace,"SF Mono",Menlo,monospace;color:#e9e6df;background:#262a35;border:1px solid #363b48;
  border-radius:7px;padding:7px 10px;cursor:pointer}
button:hover{background:#2e3340}
button:focus-visible{outline:2px solid #b8a4ff;outline-offset:2px}
.track{width:min(320px,90vw);padding:6px 0;border-bottom:1px dashed #363b48}
.grid{display:grid;grid-template-columns:repeat(var(--cols),22px);gap:8px}
.cell{width:22px;height:22px;border-radius:5px;background:#7cc4ff}
.grid--dots{gap:10px}.grid--dots .cell{border-radius:50%;background:#b8a4ff}
.bars{display:flex;align-items:flex-end;gap:8px;height:180px}
.bar{width:20px;height:180px;border-radius:4px 4px 0 0;background:#8fe0b8}
.card{width:58px;height:82px;border-radius:8px;background:var(--c);box-shadow:0 6px 18px rgba(0,0,0,.35)}
h2{font-size:28px;font-weight:650;letter-spacing:-.01em}
#rule{width:260px;height:3px;border-radius:2px;background:#b8a4ff}
.spacer{height:110vh;display:grid;place-items:center;color:#8a8f9c}
.spacer--short{height:70vh}
.center{display:flex;padding:0 40px}
.panel{height:100vh;display:grid;place-items:center;background:#20242e}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:0 24px;max-width:520px;margin:0 auto}
.tiles .tile{aspect-ratio:1;border-radius:10px;background:var(--c)}
.hwrap{width:100%;height:100vh;overflow:hidden;background:#20242e}
.htrack{display:flex;height:100%;width:max-content}
.hpanel{width:100vw;height:100%;display:grid;place-items:center;border-right:1px solid #2e3340;position:relative}
.hpanel>span{position:absolute;top:16px;left:18px;font:600 44px/1 -apple-system,sans-serif;color:#363b48}
.flipgrid{display:grid;grid-template-columns:repeat(3,64px);gap:10px}
.flipgrid .tile{height:64px;border-radius:10px;background:var(--c);display:grid;place-items:center;color:#1a1d25;font-weight:700}
.flipgrid.is-list{grid-template-columns:220px}
.flipgrid.is-list .tile{height:28px;place-items:center start;padding-left:12px}
.table{position:relative;width:min(360px,92vw);height:240px;border:1px solid #363b48;border-radius:14px;background:#20242e}
.puck{position:absolute;left:24px;top:24px;width:52px;height:52px;border-radius:50%;background:var(--c);cursor:grab;box-shadow:0 6px 16px rgba(0,0,0,.4)}
.knob{position:absolute;right:34px;bottom:34px;width:84px;height:84px;border-radius:50%;background:#2e3340;border:2px solid #4a5060;cursor:grab}
.knob i{position:absolute;left:50%;top:6px;width:4px;height:22px;margin-left:-2px;border-radius:2px;background:#b8a4ff}
.table output{position:absolute;right:58px;bottom:10px}
.headline{font-size:clamp(26px,6vw,44px);font-weight:700;letter-spacing:-.02em;line-height:1.1;max-width:14ch;text-align:center}
.art{width:min(420px,100%);height:auto;overflow:visible}
.art--square{width:min(260px,100%)}
.art path,.art circle{fill:none;stroke:#ffb36b;stroke-width:6;stroke-linecap:round;stroke-linejoin:round}
.art #ring{stroke:#7cc4ff}
.art #track{stroke:#363b48;stroke-width:3;stroke-dasharray:2 8}
.art .ship{fill:#ff8fb1;stroke:none}
.art .fill{fill:#7cc4ff;stroke:none}
.hidden{display:none}
.pad{position:fixed;inset:0;overflow:hidden;cursor:crosshair}
.cursor{position:absolute;left:0;top:0;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;background:var(--c,#b8a4ff);will-change:transform;pointer-events:none}
.cursor--ring{background:none;border:2px solid var(--c);width:40px;height:40px;margin:-20px 0 0 -20px}
.readout{position:absolute;left:14px;bottom:12px}
.widget{position:relative;padding:30px 26px 22px;border:1px dashed #4a5060;border-radius:12px}
.widget>span{position:absolute;top:8px;left:12px;font:11px ui-monospace,Menlo,monospace;color:#8a8f9c}
`;

// runs inside the stage before the lesson code: forwards console output and errors
const BRIDGE = `(() => {
  const send = (m) => parent.postMessage(Object.assign({ pg: 1 }, m), "*");
  const name = (el) => "<" + el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + ">";
  const fmt = (v) => {
    if (typeof v === "string") return v;
    if (v instanceof Element) return name(v);
    if (typeof v === "function") return "ƒ " + (v.name || "anonymous");
    try {
      return JSON.stringify(v, (k, x) => x instanceof Element ? name(x) : typeof x === "function" ? "ƒ" : x) ?? String(v);
    } catch { return String(v); }
  };
  ["log", "info", "warn", "error"].forEach((level) => {
    const orig = console[level];
    console[level] = (...a) => { send({ type: "log", level, text: a.map(fmt).join(" ") }); orig.apply(console, a); };
  });
  addEventListener("error", (e) => send({ type: "error", text: e.message, line: e.lineno }));
  addEventListener("unhandledrejection", (e) => send({ type: "error", text: String(e.reason) }));
  window.__pg = { send };
})();`;

// runs after the lesson code: wraps everything made on load in one timeline we can drive
const CONTROLLER = `(() => {
  const { send } = window.__pg;
  if (!window.gsap) {
    send({ type: "error", text: "GSAP didn't load from the CDN, so nothing can run. Check your connection, then run again." });
    return;
  }
  if (document.body.classList.contains("is-scroll")) { send({ type: "sheet", scroll: true }); return; }

  const root = gsap.exportRoot();
  const SKIP = /^(duration|ease|delay|stagger|repeat|repeatDelay|repeatRefresh|yoyo|yoyoEase|paused|immediateRender|overwrite|id|data|defaults|inherit|runBackwards|startAt|callbackScope|reversed|lazy|keyframes|scrollTrigger|onComplete|onStart|onUpdate|onRepeat|onReverseComplete|onInterrupt|transformOrigin|svgOrigin|transformPerspective|smoothOrigin|parent|stringFilter|autoRound)$/;
  const label = (el) => !el ? "?" : el === window ? "window" : el.id ? "#" + el.id
    : el.classList && el.classList[0] ? "." + el.classList[0] : el.tagName ? el.tagName.toLowerCase() : "object";
  const describe = (a) => {
    if (!a.targets) return { name: a.vars.id || "timeline", props: "" };
    const t = a.targets();
    const names = [...new Set(t.map(label))];
    const name = t.length > 1 ? t.length + " × " + (names.length === 1 ? names[0] : "targets") : label(t[0]);
    const ease = typeof a.vars.ease === "string" ? a.vars.ease : "";
    return { name, props: Object.keys(a.vars).filter((k) => !SKIP.test(k)).join(", "), ease, from: !!a.vars.runBackwards };
  };
  const curve = (a) => {
    let fn;
    try { fn = gsap.parseEase(a.vars.ease || (gsap.defaults().ease) || "power1.out"); } catch {}
    if (typeof fn !== "function") return null;
    return Array.from({ length: 33 }, (_, i) => +fn(i / 32).toFixed(4));
  };
  const timing = (a, offset) => ({
    start: offset + a.startTime(),
    dur: a.duration(),
    repeat: a.repeat(),
    gap: a.repeatDelay(),
    yoyo: a.yoyo()
  });

  const rows = [], labels = [];
  const internal = (a) => a.targets && !a.duration() && Object.keys(a.vars).every((k) => SKIP.test(k) || /^(userSelect|touchAction|cursor|zIndex)$/.test(k));
  root.getChildren(false, true, true).filter((a) => !internal(a)).forEach((a) => {
    const isTl = !a.targets;
    rows.push(Object.assign({ depth: 0, group: isTl, curve: isTl ? null : curve(a) }, describe(a), timing(a, 0)));
    if (isTl) {
      Object.entries(a.labels).forEach(([n, t]) => labels.push({ name: n, t: a.startTime() + t }));
      a.getChildren(false, true, true).forEach((c) => {
        rows.push(Object.assign({ depth: 1, group: !c.targets, curve: c.targets ? curve(c) : null }, describe(c), timing(c, a.startTime())));
      });
    }
  });
  send({ type: "sheet", rows: rows.slice(0, 60), labels });

  let span = 1, loop = false;
  addEventListener("message", (e) => {
    const m = e.data || {};
    if (m.cmd === "span") span = m.span;
    else if (m.cmd === "loop") loop = m.on;
    else if (m.cmd === "toggle") {
      if (root.paused() || !root.isActive()) {
        if (root.time() >= span - 0.001 || root.progress() === 1) root.time(0);
        root.play();
      } else root.pause();
    }
    else if (m.cmd === "restart") root.restart();
    else if (m.cmd === "seek") root.pause().time(m.t);
    else if (m.cmd === "speed") root.timeScale(m.v);
  });
  gsap.ticker.add(() => {
    if (loop && !root.paused() && root.time() >= span) root.time(0);
    send({ type: "time", t: root.time(), playing: !root.paused() && root.isActive() });
  });
})();`;

/* ---------- state ---------- */
const $ = (s) => document.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem('gsap-playground:' + k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem('gsap-playground:' + k) : localStorage.setItem('gsap-playground:' + k, v); } catch {} },
};

const els = {
  nav: $('#lessons'), select: $('#lesson-select'), lesson: $('#lesson'),
  code: $('#code'), hl: $('#hl'), gutter: $('#gutter'), frame: $('#stage'),
  log: $('#log'), sheet: $('#sheet'), rows: $('#rows'), ruler: $('#ruler'), body: $('#sheet-body'),
  play: $('#play'), restart: $('#restart'), loop: $('#loop'), speed: $('#speed'), clock: $('#clock'),
  auto: $('#auto'), run: $('#run'), reset: $('#reset'), ask: $('#ask'), toast: $('#toast'),
};

let current = null;
let codeOffset = 0;   // line in the stage document where the lesson code begins
let span = 1;
let errorLine = 0;

const byId = Object.fromEntries(LESSONS.map((l) => [l.id, l]));
const savedCode = (l) => store.get('code:' + l.id);

/* ---------- lesson list ---------- */
function renderNav() {
  els.nav.innerHTML = SKILLS.map((s) => {
    const items = LESSONS.filter((l) => l.skill === s.id);
    return `<section class="group">
      <h2 class="group__name">${s.name} <code>${s.id}</code></h2>
      <ul>${items.map((l) => `<li><a href="#${l.id}" data-id="${l.id}">${l.title}<i class="edited" title="Edited" hidden></i></a></li>`).join('')}</ul>
    </section>`;
  }).join('');
  els.select.innerHTML = SKILLS.map((s) => `<optgroup label="${s.name} (${s.id})">${
    LESSONS.filter((l) => l.skill === s.id).map((l) => `<option value="${l.id}">${l.title}</option>`).join('')
  }</optgroup>`).join('');
  els.select.addEventListener('change', () => { location.hash = els.select.value; });
  markEdited();
}

function markEdited() {
  els.nav.querySelectorAll('a[data-id]').forEach((a) => {
    a.querySelector('.edited').hidden = savedCode(byId[a.dataset.id]) == null;
    if (a.dataset.id === current?.id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function open(id) {
  const l = byId[id] || LESSONS[0];
  current = l;
  store.set('last', l.id);
  els.select.value = l.id;
  const i = LESSONS.indexOf(l);
  els.lesson.innerHTML = `
    <header class="lesson__head">
      <h1 class="lesson__title">${l.title}</h1>
      <span class="chip m-tag m-tag--print" title="Official GSAP skill installed for Claude">${l.skill}</span>
    </header>
    <div class="lesson__notes">${l.notes}</div>
    <h2 class="lesson__sub">Try this</h2>
    <ol class="lesson__tries">${l.tries.map((t) => `<li>${t}</li>`).join('')}</ol>
    <footer class="lesson__foot">
      <a href="${l.docs}" target="_blank" rel="noopener">GSAP docs</a>
      <span class="pager">
        ${i > 0 ? `<a href="#${LESSONS[i - 1].id}">Previous</a>` : ''}
        ${i < LESSONS.length - 1 ? `<a href="#${LESSONS[i + 1].id}">Next: ${LESSONS[i + 1].title}</a>` : ''}
      </span>
    </footer>`;
  els.lesson.scrollTop = 0;
  setCode(savedCode(l) ?? l.code);
  markEdited();
  run();
}

/* ---------- editor ---------- */
const KEYWORDS = /^(const|let|var|function|return|if|else|for|of|in|new|true|false|null|undefined|this|while|do|break|continue|typeof|class|async|await)$/;
const API = /^(gsap|ScrollTrigger|ScrollToPlugin|ScrollSmoother|Observer|Flip|Draggable|InertiaPlugin|SplitText|ScrambleTextPlugin|TextPlugin|DrawSVGPlugin|MorphSVGPlugin|MotionPathPlugin|MotionPathHelper|CustomEase|CustomWiggle|CustomBounce|Physics2DPlugin|PhysicsPropsPlugin|GSDevTools|console|document|window|Math)$/;
const TOKENS = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b|\.\d+\b)|([A-Za-z_$][\w$]*)(\s*:(?!:))?|(=>)/g;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function highlight(src) {
  let out = '', last = 0;
  src.replace(TOKENS, (m, com, str, num, word, colon, arrow, at) => {
    out += esc(src.slice(last, at));
    last = at + m.length;
    if (com) out += `<span class="t-com">${esc(com)}</span>`;
    else if (str) out += `<span class="t-str">${esc(str)}</span>`;
    else if (num) out += `<span class="t-num">${num}</span>`;
    else if (arrow) out += `<span class="t-kw">=&gt;</span>`;
    else if (KEYWORDS.test(word)) out += `<span class="t-kw">${word}</span>${colon || ''}`;
    else if (API.test(word)) out += `<span class="t-api">${word}</span>${colon || ''}`;
    else if (colon) out += `<span class="t-key">${word}</span>${colon}`;
    else out += word;
    return m;
  });
  return out + esc(src.slice(last)) + '\n';
}

function paint() {
  const src = els.code.value;
  els.hl.innerHTML = highlight(src);
  const n = src.split('\n').length;
  els.gutter.innerHTML = Array.from({ length: n }, (_, i) =>
    `<span${i + 1 === errorLine ? ' class="is-error"' : ''}>${i + 1}</span>`).join('');
  syncScroll();
}

function syncScroll() {
  els.hl.scrollTop = els.code.scrollTop;
  els.hl.scrollLeft = els.code.scrollLeft;
  els.gutter.scrollTop = els.code.scrollTop;
}

function setCode(src) {
  els.code.value = src;
  errorLine = 0;
  paint();
  els.code.scrollTop = 0;
}

function insert(text) {
  // execCommand keeps the browser's undo stack; setRangeText is the fallback
  if (!document.execCommand('insertText', false, text)) {
    els.code.setRangeText(text, els.code.selectionStart, els.code.selectionEnd, 'end');
    els.code.dispatchEvent(new Event('input'));
  }
}

let tabReleased = false;
els.code.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); return; }
  if (e.key === 'Escape') { tabReleased = true; return; }
  if (e.key === 'Tab' && !tabReleased && !e.shiftKey) { e.preventDefault(); insert('  '); return; }
  if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
    const before = els.code.value.slice(0, els.code.selectionStart);
    const line = before.slice(before.lastIndexOf('\n') + 1);
    let indent = line.match(/^\s*/)[0];
    if (/[{([]\s*$/.test(line)) indent += '  ';
    e.preventDefault();
    insert('\n' + indent);
  }
});
els.code.addEventListener('blur', () => { tabReleased = false; });

let autoTimer;
els.code.addEventListener('input', () => {
  paint();
  const v = els.code.value;
  store.set('code:' + current.id, v === current.code ? null : v);
  markEdited();
  if (els.auto.checked) { clearTimeout(autoTimer); autoTimer = setTimeout(run, 700); }
});
els.code.addEventListener('scroll', syncScroll);

/* ---------- running ---------- */
function stageDoc(l, code) {
  const wanted = new Set();
  PLUGINS.forEach(([name, re]) => { if ((re || new RegExp('\\b' + name + '\\b')).test(code)) wanted.add(name); });
  Object.entries(NEEDS).forEach(([p, dep]) => { if (wanted.has(p)) wanted.add(dep); });
  const scripts = [`<script src="${GSAP}gsap.min.js"><\/script>`]
    .concat(PLUGINS.filter(([n]) => wanted.has(n)).map(([n]) => `<script src="${GSAP}${n}.min.js"><\/script>`));
  const head = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${STAGE_CSS}</style>
<script>${BRIDGE}<\/script>
${scripts.join('\n')}
</head><body${l.scroll ? ' class="is-scroll"' : ''}>
${l.html}
<script>
`;
  codeOffset = head.split('\n').length - 1;
  // keep a stray </script> in the lesson code from closing the tag early
  return head + code.replace(/<\/script/gi, '<\\/script') + `
<\/script>
<script>${CONTROLLER}<\/script>
</body></html>`;
}

function run() {
  clearTimeout(autoTimer);
  errorLine = 0;
  els.log.innerHTML = '';
  log('info', 'Ran ' + current.title);
  setSheet({ rows: [], labels: [], pending: true });
  els.frame.srcdoc = stageDoc(current, els.code.value);
  paint();
}

function log(level, text, line) {
  const li = document.createElement('li');
  li.className = 'log--' + level;
  li.textContent = text;
  if (line) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'log__line';
    b.textContent = 'line ' + line;
    b.addEventListener('click', () => goToLine(line));
    li.prepend(b);
  }
  els.log.appendChild(li);
  els.log.scrollTop = els.log.scrollHeight;
}

function goToLine(n) {
  const lines = els.code.value.split('\n');
  const at = lines.slice(0, n - 1).join('\n').length + (n > 1 ? 1 : 0);
  els.code.focus();
  els.code.setSelectionRange(at, at + (lines[n - 1] || '').length);
  const lh = parseFloat(getComputedStyle(els.code).lineHeight);
  els.code.scrollTop = Math.max(0, (n - 4) * lh);
}

addEventListener('message', (e) => {
  if (e.source !== els.frame.contentWindow || !e.data || !e.data.pg) return;
  const m = e.data;
  if (m.type === 'log') log(m.level, m.text);
  else if (m.type === 'error') {
    const line = m.line ? m.line - codeOffset : 0;
    const inCode = line > 0 && line <= els.code.value.split('\n').length;
    if (inCode) { errorLine = line; paint(); }
    log('error', m.text, inCode ? line : 0);
  }
  else if (m.type === 'sheet') setSheet(m);
  else if (m.type === 'time') setTime(m.t, m.playing);
});

/* ---------- timeline strip ---------- */
function send(msg) { els.frame.contentWindow?.postMessage(msg, '*'); }

function cycles(r, until) {
  // each repeat as its own segment, so repeats and yoyos read at a glance
  const out = [];
  const step = r.dur + r.gap;
  const count = r.repeat < 0 ? Math.min(40, Math.ceil((until - r.start) / Math.max(step, 0.01))) : Math.min(r.repeat + 1, 40);
  for (let i = 0; i < count; i++) out.push({ t: r.start + i * step, back: r.yoyo && i % 2 === 1 });
  return out;
}

function curvePath(c, back) {
  if (!c) return '';
  const lo = Math.min(0, ...c), hi = Math.max(1, ...c);
  const pts = c.map((v, i) => {
    const x = (back ? 1 - i / (c.length - 1) : i / (c.length - 1)) * 100;
    const y = 92 - ((v - lo) / (hi - lo)) * 84;
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  const base = (back ? '100' : '0') + ',92 ' + pts.join(' ') + ' ' + (back ? '0' : '100') + ',92';
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="${base}"/><polyline points="${pts.join(' ')}"/></svg>`;
}

function niceStep(s) {
  return [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 60].find((v) => s / v <= 8) || 120;
}

function setSheet(m) {
  els.sheet.classList.toggle('is-scroll', !!m.scroll);
  els.sheet.classList.toggle('is-empty', !m.scroll && !m.pending && !m.rows.length);
  if (m.scroll || m.pending || !m.rows.length) {
    els.rows.innerHTML = '';
    els.ruler.innerHTML = '';
    span = 1;
    setTime(0, false);
    return;
  }
  const finiteEnd = Math.max(0, ...m.rows.filter((r) => r.repeat >= 0)
    .map((r) => r.start + r.dur * (r.repeat + 1) + r.gap * r.repeat));
  const loopEnd = Math.max(0, ...m.rows.filter((r) => r.repeat < 0).map((r) => r.start + (r.dur + r.gap) * 2));
  span = Math.max(finiteEnd, loopEnd, 0.5);
  send({ cmd: 'span', span });
  send({ cmd: 'loop', on: els.loop.checked });
  send({ cmd: 'speed', v: +els.speed.value });

  const pct = (t) => (t / span * 100).toFixed(3) + '%';
  const step = niceStep(span);
  let ticks = '';
  for (let t = 0; t <= span + 1e-6; t += step) ticks += `<span class="tick" style="left:${pct(t)}">${+t.toFixed(2)}s</span>`;
  ticks += m.labels.map((l) => `<span class="mark" style="left:${pct(l.t)}" title="label ${esc(l.name)}">${esc(l.name)}</span>`).join('');
  els.ruler.innerHTML = ticks;

  let color = 0;
  els.rows.innerHTML = m.rows.map((r) => {
    const c = r.group ? 'var(--faint)' : COLORS[color++ % COLORS.length];
    const segs = r.dur > 0 ? cycles(r, span).filter((s) => s.t < span).map((s) =>
      `<span class="seg" style="left:${pct(s.t)};width:${pct(Math.min(r.dur, span - s.t))}">${r.group ? '' : curvePath(r.curve, s.back)}</span>`).join('')
      : `<span class="seg seg--instant" style="left:${pct(r.start)}"></span>`;
    const what = r.group ? '' : `<span class="row__props">${r.from ? 'from ' : ''}${esc(r.props || '')}${r.ease ? ` <em>${esc(r.ease)}</em>` : ''}</span>`;
    const reps = r.repeat < 0 ? ' ∞' : r.repeat > 0 ? ' ×' + (r.repeat + 1) : '';
    return `<div class="row${r.group ? ' row--group' : ''}" style="--c:${c};--depth:${r.depth}">
      <div class="row__label" title="${esc(r.name)} ${esc(r.props || '')}"><span class="row__name">${esc(r.name)}${reps}</span>${what}</div>
      <div class="row__track">${segs}</div>
    </div>`;
  }).join('');
}

let lastPlaying = null;
function setTime(t, playing) {
  const p = Math.min(1, Math.max(0, t / span));
  els.body.style.setProperty('--p', p);
  els.clock.textContent = Math.min(t, span).toFixed(2) + 's / ' + span.toFixed(2) + 's';
  els.ruler.setAttribute('aria-valuenow', t.toFixed(2));
  els.ruler.setAttribute('aria-valuemax', span.toFixed(2));
  if (playing !== lastPlaying) {
    lastPlaying = playing;
    els.play.textContent = playing ? 'Pause' : 'Play';
    els.play.setAttribute('aria-pressed', String(playing));
  }
}

function seekFromPointer(e) {
  const r = els.ruler.getBoundingClientRect();
  const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * span;
  send({ cmd: 'seek', t });
  setTime(t, false);
}
let scrubbing = false;
els.body.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.row__label') || e.button !== 0) return;
  scrubbing = true;
  els.body.setPointerCapture(e.pointerId);
  seekFromPointer(e);
});
els.body.addEventListener('pointermove', (e) => { if (scrubbing) seekFromPointer(e); });
els.body.addEventListener('pointerup', () => { scrubbing = false; });
els.ruler.addEventListener('keydown', (e) => {
  const now = +els.ruler.getAttribute('aria-valuenow') || 0;
  const d = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: 1, ArrowDown: -1 }[e.key];
  if (d) {
    e.preventDefault();
    const t = Math.min(span, Math.max(0, now + d * span / (e.shiftKey ? 10 : 50)));
    send({ cmd: 'seek', t }); setTime(t, false);
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    const t = e.key === 'Home' ? 0 : span;
    send({ cmd: 'seek', t }); setTime(t, false);
  } else if (e.key === ' ') { e.preventDefault(); send({ cmd: 'toggle' }); }
});

els.play.addEventListener('click', () => send({ cmd: 'toggle' }));
els.restart.addEventListener('click', () => send({ cmd: 'restart' }));
els.loop.addEventListener('change', () => { store.set('loop', els.loop.checked ? '1' : null); send({ cmd: 'loop', on: els.loop.checked }); });
els.speed.addEventListener('change', () => send({ cmd: 'speed', v: +els.speed.value }));

/* ---------- toolbar ---------- */
els.run.addEventListener('click', run);
els.auto.addEventListener('change', () => store.set('auto', els.auto.checked ? null : '0'));
els.reset.addEventListener('click', () => {
  store.set('code:' + current.id, null);
  setCode(current.code);
  markEdited();
  run();
  toast('Restored the original code for this lesson.');
});
els.ask.addEventListener('click', async () => {
  const prompt = `Use the ${current.skill} skill. I'm working through the "${current.title}" lesson in my GSAP Playground (experiments/gsap-playground). Here is my current code:

\`\`\`js
${els.code.value.trim()}
\`\`\`

Explain what each part does, point out anything that goes against the skill's best practices, and suggest one small experiment to try next.`;
  try {
    await navigator.clipboard.writeText(prompt);
    toast('Prompt copied. Paste it into Claude Code.');
  } catch {
    toast("Couldn't reach the clipboard. Select the code and copy it by hand.");
  }
});

let toastTimer;
function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('is-on'), 2600);
}

$('#clear').addEventListener('click', () => { els.log.innerHTML = ''; });

/* ---------- start ---------- */
els.auto.checked = store.get('auto') !== '0';
els.loop.checked = store.get('loop') === '1';
renderNav();
addEventListener('hashchange', () => open(location.hash.slice(1)));
open(location.hash.slice(1) || store.get('last') || LESSONS[0].id);
