// Static spark: when the cursor gets close to a button, a small bolt jumps
// from the button's edge to the cursor tip. Buttons never spark while the cursor
// is on them, and strike again the moment it leaves.
(() => {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  if (!fine.matches || still.matches) return;

  // Settings come from buttons.js (tuned in the Button Lab), read fresh on every use.
  // Fallbacks keep the spark working on a page without it.
  const FALLBACK = {
    spark: true, sparkJump: 50, sparkLife: 200, sparkRestrike: 45, sparkJag: 0.35,
    sparkCore: 1.2, sparkGlow: 3, sparkBlur: 10, sparkCoreColor: '#ffffff', sparkGlowColor: '#6eaaff', sparkFlash: true,
  };
  const opt = () => (window.Buttons && window.Buttons.cfg) || FALLBACK;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  };
  resize();
  addEventListener('resize', resize);

  const readyAt = new WeakMap(); // button -> time it is charged again
  const inside = new WeakSet();  // buttons the cursor is currently over
  const bolts = [];
  const mouse = { x: 0, y: 0 };
  let raf = 0;

  // Closest point on a rounded rectangle and the gap to it (0 when inside).
  function nearest(el, x, y) {
    const r = el.getBoundingClientRect();
    const rad = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, r.height / 2, r.width / 2);
    const ix = Math.max(r.left + rad, Math.min(x, r.right - rad));
    const iy = Math.max(r.top + rad, Math.min(y, r.bottom - rad));
    const dx = x - ix, dy = y - iy;
    const d = Math.hypot(dx, dy);
    if (d <= rad) return { gap: 0 };
    return { gap: d - rad, px: ix + (dx / d) * rad, py: iy + (dy / d) * rad };
  }

  // Jagged shape by midpoint displacement, in bolt-relative units: u runs 0→1
  // from button to cursor, v is sideways offset as a fraction of the length.
  // Mapping it onto live endpoints each frame lets the bolt stretch with the cursor.
  function shape() {
    let pts = [[0, 0], [1, 0]];
    let spread = opt().sparkJag;
    for (let i = 0; i < 3; i++) {
      const next = [pts[0]];
      for (let j = 1; j < pts.length; j++) {
        const [ax, ay] = pts[j - 1], [bx, by] = pts[j];
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const off = (Math.random() - 0.5) * spread;
        next.push([(ax + bx) / 2 + (-(by - ay) / len) * off, (ay + by) / 2 + ((bx - ax) / len) * off], pts[j]);
      }
      pts = next;
      spread *= 0.5;
    }
    return pts;
  }

  function place(b) {
    const dx = b.x2 - b.x1, dy = b.y2 - b.y1;
    return b.shape.map(([u, v]) => [b.x1 + u * dx - v * dy, b.y1 + u * dy + v * dx]);
  }

  function stroke(pts, width, color, blur) {
    if (width <= 0) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.shadowBlur = blur;
    ctx.shadowColor = color;
    ctx.stroke();
  }

  function frame(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.lineCap = ctx.lineJoin = 'round';
    const o = opt();
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      const t = (now - b.born) / o.sparkLife;
      if (t >= 1) { bolts.splice(i, 1); continue; }
      // Re-strike with a new shape a few times, like a real arc flickering.
      if (now - b.struck > o.sparkRestrike) { b.shape = shape(); b.struck = now; }
      // The far end tracks the cursor; the near end slides to the closest point on the button.
      b.x2 = mouse.x; b.y2 = mouse.y;
      const n = nearest(b.el, mouse.x, mouse.y);
      if (n.gap > 0) { b.x1 = n.px; b.y1 = n.py; }
      b.pts = place(b);
      const a = (1 - t) * (0.75 + Math.random() * 0.25);
      ctx.globalAlpha = a;
      stroke(b.pts, o.sparkGlow, o.sparkGlowColor, o.sparkBlur);
      stroke(b.pts, o.sparkCore, o.sparkCoreColor, 4);
      // Hot spots where the arc lands.
      if (o.sparkCore > 0) {
        const dot = o.sparkCore * 1.4;
        ctx.shadowBlur = 8;
        ctx.shadowColor = o.sparkGlowColor;
        ctx.fillStyle = o.sparkCoreColor;
        ctx.beginPath(); ctx.arc(b.x1, b.y1, dot, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(b.x2, b.y2, dot * 1.1, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    raf = bolts.length ? requestAnimationFrame(frame) : 0;
    if (!raf) ctx.clearRect(0, 0, innerWidth, innerHeight);
  }

  function zap(el, x1, y1, x2, y2) {
    const now = performance.now();
    for (let i = bolts.length - 1; i >= 0; i--) if (bolts[i].el === el) bolts.splice(i, 1);
    bolts.push({ el, x1, y1, x2, y2, born: now, struck: now, shape: shape() });
    if (opt().sparkFlash) {
      el.classList.remove('is-zapped');
      void el.offsetWidth;
      el.classList.add('is-zapped');
    }
    if (!raf) raf = requestAnimationFrame(frame);
  }

  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const x = e.clientX, y = e.clientY;
    const now = performance.now();
    mouse.x = x; mouse.y = y;
    const o = opt();
    if (!o.spark) return;
    for (const el of document.querySelectorAll('.button, .nav .chip')) {
      const r = el.getBoundingClientRect();
      const reach = o.sparkJump * 2;
      if (x < r.left - reach || x > r.right + reach || y < r.top - reach || y > r.bottom + reach) {
        inside.delete(el);
        continue;
      }
      const n = nearest(el, x, y);
      if (n.gap === 0) {
        inside.add(el);   // never sparks while the cursor is on the button
        continue;
      }
      // Leaving the button strikes at once, replacing any bolt still fading.
      // Otherwise, near the button, a new bolt follows when the last one ends.
      const leaving = inside.delete(el);
      if (leaving ? n.gap <= reach : n.gap <= o.sparkJump && now >= (readyAt.get(el) || 0)) {
        zap(el, n.px, n.py, x, y);
        readyAt.set(el, now + o.sparkLife);
      }
    }
  }, { passive: true });

  document.addEventListener('animationend', (e) => {
    if (e.animationName === 'button-zap' || e.animationName === 'chip-zap') e.target.classList.remove('is-zapped');
  });
})();
