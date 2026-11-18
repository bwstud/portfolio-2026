/* Smooth scroll, shared by the pages that use it (Lenis, loaded just before this file). The page eases toward where the
   wheel sends it, a fraction of the way each frame, so it glides to a stop. That fraction is the lerp: lower is heavier.
   Each page sets its own default on this script's tag, <script src="smooth-scroll.js" data-lerp="0.05">.

   - Touch scrolling stays the device's own, and nothing runs for reduced motion.
   - Dialogs, and anything marked data-lenis-prevent, keep their own scrolling: the wheel over them is left alone.
   - The tuner: Shift+T, or ?tune in the address, shows a Lerp fader with a typed number beside it (matte-page.css).
     A typed value inside the range takes effect as it is typed; leaving the field, or Enter, brings one outside it
     to the nearest end, or an empty field back to the current value. The value is kept for this page in this
     browser only; ?friction=0.08 in the address tries one without keeping it.
   - window.siteLenis is the running instance, for a page's own scrolling (the Bio's Back to top). */
(() => {
  const tag = document.currentScript;
  if (!window.Lenis || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const MIN = 0.02, MAX = 0.3, KEY = 'lerp:' + location.pathname;
  const ok = (v) => Number.isFinite(v) && v >= MIN && v <= MAX;
  const DEFAULT = ok(parseFloat(tag && tag.dataset.lerp)) ? parseFloat(tag.dataset.lerp) : 0.08;
  let kept = NaN;
  try { kept = parseFloat(localStorage.getItem(KEY)); } catch (e) {}
  const tried = parseFloat(new URLSearchParams(location.search).get('friction'));
  const lenis = window.siteLenis = new Lenis({
    lerp: ok(tried) ? tried : ok(kept) ? kept : DEFAULT,
    smoothWheel: true, autoRaf: true, anchors: true,
    prevent: (node) => !!node.closest('dialog, [data-lenis-prevent]'),
  });

  const tuner = document.createElement('div');
  tuner.className = 'tuner m-panel m-panel--col matte';
  tuner.setAttribute('role', 'group');
  tuner.setAttribute('aria-label', 'Scroll tuner');
  tuner.hidden = true;
  tuner.innerHTML = `<div class="m-cell"><div class="tuner__row">
      <label class="m-legend" for="tuner-lerp">Lerp</label>
      <input class="m-fader" type="range" id="tuner-lerp" min="${MIN}" max="${MAX}" step="0.005">
      <input class="m-input tuner__num" type="number" id="tuner-lerp-num" min="${MIN}" max="${MAX}" step="0.005" aria-label="Lerp, typed">
    </div></div>`;
  document.body.append(tuner);
  const fader = tuner.querySelector('.m-fader'), num = tuner.querySelector('.tuner__num');
  const set = (v, from, keep = true) => {
    lenis.options.lerp = v;
    if (from !== 'fader') fader.value = v;
    if (from !== 'number') num.value = v;
    if (keep) try { localStorage.setItem(KEY, v); } catch (e) {}
  };
  set(lenis.options.lerp, null, false);
  fader.addEventListener('input', () => set(Number(fader.value), 'fader'));
  num.addEventListener('input', () => { const v = num.valueAsNumber; if (ok(v)) set(v, 'number'); });
  num.addEventListener('change', () => { const v = num.valueAsNumber; set(Number.isFinite(v) ? Math.min(MAX, Math.max(MIN, v)) : lenis.options.lerp); });
  const toggle = () => { tuner.hidden = !tuner.hidden; };
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'T' || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, textarea, select')) return;
    toggle();
  });
  if (new URLSearchParams(location.search).has('tune')) toggle();
})();
