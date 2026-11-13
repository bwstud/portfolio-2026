/* Small control builder for the "Play with it" section. Every control calls its onChange once
   on creation, so a lesson writes its update logic one time and the scene starts in sync. */
let uid = 0;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function makeUI(root) {
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); const n = t.content.firstChild; root.append(n); return n; };
  const help = h => (h ? `<div class="help">${h}</div>` : '');

  return {
    /* Numeric slider. log: true spreads the range exponentially (good for light intensities). */
    slider(label, { min = 0, max = 1, step = 0.01, value = 0, unit = '', log = false, fmt, help: h } = {}, onChange = () => {}) {
      const id = `c${uid++}`;
      const N = 1000;
      const toPos = v => log ? (Math.log(v / min) / Math.log(max / min)) * N : v;
      const fromPos = p => {
        if (!log) return +p;
        const v = min * Math.pow(max / min, p / N);
        const mag = Math.pow(10, Math.floor(Math.log10(v)) - 2);   // three significant digits
        return Math.round(v / mag) * mag;
      };
      const show = v => fmt ? fmt(v) : `${+(+v).toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0)}${unit ? ` ${unit}` : ''}`;
      const node = el(`<div class="ctl"><div class="row"><label for="${id}">${esc(label)}</label><output></output></div>
        <input type="range" id="${id}" min="${log ? 0 : min}" max="${log ? N : max}" step="${log ? 1 : step}">${help(h)}</div>`);
      const input = node.querySelector('input'), out = node.querySelector('output');
      let v = value;
      const apply = (nv, fire = true) => { v = nv; out.textContent = show(v); if (fire) onChange(v); };
      input.value = toPos(value);
      input.addEventListener('input', () => apply(fromPos(input.value)));
      apply(value);
      return { get: () => v, set(nv, fire = true) { input.value = toPos(nv); apply(nv, fire); }, node };
    },

    toggle(label, value, onChange = () => {}, h) {
      const id = `c${uid++}`;
      const node = el(`<div class="ctl toggle"><label for="${id}">${esc(label)}</label><input type="checkbox" class="switch" id="${id}">${help(h)}</div>`);
      const input = node.querySelector('input');
      input.checked = value;
      input.addEventListener('change', () => onChange(input.checked));
      onChange(value);
      return { get: () => input.checked, set(v, fire = true) { input.checked = v; if (fire) onChange(v); }, node };
    },

    /* Segmented buttons. options: ['a', 'b'] or [{ value, label }] */
    seg(label, options, value, onChange = () => {}, h) {
      const opts = options.map(o => typeof o === 'object' ? o : { value: o, label: o });
      const node = el(`<div class="ctl">${label ? `<div class="row"><label>${esc(label)}</label></div>` : ''}<div class="seg" role="group" aria-label="${esc(label || '')}">
        ${opts.map(o => `<button type="button" data-v="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</div>${help(h)}</div>`);
      const buttons = [...node.querySelectorAll('button')];
      let v = value;
      const apply = (nv, fire = true) => {
        v = nv;
        for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.v === String(nv)));
        if (fire) onChange(opts.find(o => String(o.value) === String(nv))?.value ?? nv);
      };
      buttons.forEach(b => b.addEventListener('click', () => apply(b.dataset.v)));
      apply(value);
      return { get: () => v, set: apply, node };
    },

    select(label, options, value, onChange = () => {}, h) {
      const id = `c${uid++}`;
      const opts = options.map(o => typeof o === 'object' ? o : { value: o, label: o });
      const node = el(`<div class="ctl"><div class="row"><label for="${id}">${esc(label)}</label></div><select id="${id}">
        ${opts.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>${help(h)}</div>`);
      const s = node.querySelector('select');
      s.value = value;
      s.addEventListener('change', () => onChange(s.value));
      onChange(value);
      return { get: () => s.value, set(v, fire = true) { s.value = v; if (fire) onChange(v); }, node };
    },

    color(label, value, onChange = () => {}, h) {
      const id = `c${uid++}`;
      const node = el(`<div class="ctl"><div class="row"><label for="${id}">${esc(label)}</label><output></output></div><input type="color" id="${id}">${help(h)}</div>`);
      const input = node.querySelector('input'), out = node.querySelector('output');
      input.value = value;
      const apply = () => { out.textContent = input.value; onChange(input.value); };
      input.addEventListener('input', apply);
      apply();
      return { get: () => input.value, node };
    },

    buttons(list) {
      const node = el(`<div class="btnrow"></div>`);
      for (const b of list) {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = `btn${b.primary ? ' primary' : ''}`; btn.textContent = b.label;
        btn.addEventListener('click', b.onClick);
        node.append(btn);
      }
      return node;
    },

    label(text) { return el(`<div class="group-label">${esc(text)}</div>`); },
    html(html) { return el(`<div>${html}</div>`); },
  };
}
