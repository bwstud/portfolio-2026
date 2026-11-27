/* Blackbird reel: a ring of Blackbird phones turning slowly, head on, with their reflections on a dark floor, built
   inside any figure with data-reel (three.js, vendored in vendor/).
     <figure data-reel="images/blackbird-screens/" data-clips="mazlan-intake inspection …" data-label="What it shows">
       <img …>   the still, shown when the script, WebGL or three.js can't run
   Each phone plays a clip recorded live from the app in the simulator (tools/blackbird-clips): clips/<name>-dark and
   -light, as .mp4 (H.264), .av1.mp4 and a .webp of the first frame. Light and dark alternate around the ring. Only the
   phones facing the camera play; the rest show their first frame, which is where every clip starts, so a phone comes
   to life without a jump. The ring turns only while the picture is on screen, the tab is showing and it isn't paused;
   with reduced motion it is drawn once, at rest, with no clips.
   A phone can be picked up, as a screen is off a drift wall with data-focus: under the pointer a phone facing the camera
   rises off the ring; pressing it stops the ring, and the phone rises, turns to face the viewer square on and fills the
   frame, still playing. Pressing again, or Escape, puts it back. It moves by the walls' settings (DriftWall.FOCUS, which
   the Lift Lab tunes), lengths measured in the reel's height at the front of the ring. */
(function () {
  'use strict';
  var STILL = window.matchMedia('(prefers-reduced-motion: reduce)');
  var THREE_URL = new URL('vendor/three-0.160.0.module.min.js', document.baseURI).href;
  var CARDS = 18, TURN = 90;                 // phones in the ring; seconds for one turn
  var FACING = 0.55;                         // a phone plays while cos(its angle to the camera) is above this
  var K = 0.6;                               // the card pictures, drawn at this share of the screenshots' size
  // the device, in screen px (the clips' and screenshots' 600 × 1304)
  var SCREEN_W = 600, SCREEN_H = 1304, SCREEN_R = 85, BAND = 7, BEZEL = 19, P = BAND + BEZEL;
  var ISLAND = [228, 19, 144, 58];           // over the screenshots' own Dynamic Island, where they have one

  // the walls' pick-up settings, if drift-wall.js isn't on the page
  var LIFT = { hover: 1.4, hoverMs: 200, lift: 5, fill: 0.94, dim: 0.62, motion: 'two', riseMs: 140, turnMs: 480, oneMs: 560, outMs: 440,
    riseX1: 0.3, riseY1: 0, riseX2: 0.2, riseY2: 1, turnX1: 0.23, turnY1: 1, turnX2: 0.32, turnY2: 1, oneX1: 0.23, oneY1: 1, oneX2: 0.32, oneY2: 1 };
  // a CSS cubic-bezier as a function of time
  function bezier(x1, y1, x2, y2) {
    var at = function (a, b, t) { return ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t; };
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var lo = 0, hi = 1, t = x;
      for (var i = 0; i < 24; i++) { var v = at(x1, x2, t); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      return at(y1, y2, t);
    };
  }
  var OUT = bezier(0.23, 1, 0.32, 1);   // the hover rise, as on the walls
  function make(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function mod(a, n) { return ((a % n) + n) % n; }

  /* Each clip comes as AV1 and H.264, as on the drift walls: AV1 only where the browser decodes it in hardware. */
  var AV1 = false;
  try {
    if (navigator.mediaCapabilities && navigator.mediaCapabilities.decodingInfo) {
      navigator.mediaCapabilities.decodingInfo({ type: 'file', video: { contentType: 'video/mp4; codecs="av01.0.04M.08"', width: 360, height: 782, bitrate: 300000, framerate: 60 } })
        .then(function (r) { AV1 = !!(r && r.supported && r.smooth && r.powerEfficient); }, function () {});
    }
  } catch (e) {}

  /* The order around the ring: dark and light alternate, and the light ones run half the list ahead of the dark, so
     neighbours are different interactions in different themes and every interaction shows at least once. */
  function order(el) {
    var names = (el.dataset.clips || '').split(/\s+/).filter(Boolean), out = [];
    if (!names.length) return out;
    for (var c = 0; c < CARDS; c++) {
      var h = c >> 1, light = c % 2;
      out.push(el.dataset.reel + 'clips/' + names[mod(light ? h + Math.ceil(names.length / 2) : h, names.length)] + (light ? '-light' : '-dark'));
    }
    return out;
  }

  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function canvas(w, h) { var cv = make('canvas'); cv.width = Math.round(w * K); cv.height = Math.round(h * K); var g = cv.getContext('2d'); g.scale(K, K); return [cv, g]; }

  // a phone as one picture: a metal band lit from above, a black glass bezel, the screen and its island
  function cardCanvas(img) {
    var W = SCREEN_W + 2 * P, H = SCREEN_H + 2 * P, R = SCREEN_R + P, c = canvas(W, H), g = c[1];
    var fr = g.createLinearGradient(0, 0, 0, H);
    fr.addColorStop(0, '#7a7d83'); fr.addColorStop(0.035, '#2c2e32'); fr.addColorStop(0.5, '#1b1c1f'); fr.addColorStop(1, '#101113');
    roundRect(g, 0, 0, W, H, R); g.fillStyle = fr; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 2; roundRect(g, 1, 1, W - 2, H - 2, R - 1); g.stroke();
    roundRect(g, BAND, BAND, W - 2 * BAND, H - 2 * BAND, R - BAND); g.fillStyle = '#030304'; g.fill();
    g.save(); roundRect(g, P, P, SCREEN_W, SCREEN_H, SCREEN_R); g.clip();
    if (img) g.drawImage(img, P, P, SCREEN_W, SCREEN_H);
    g.fillStyle = '#000'; roundRect(g, P + ISLAND[0], P + ISLAND[1], ISLAND[2], ISLAND[3], ISLAND[3] / 2); g.fill(); g.restore();
    return c[0];
  }
  function backCanvas() {
    var cv = make('canvas'); cv.width = 315; cv.height = 667; var g = cv.getContext('2d');
    var fr = g.createLinearGradient(0, 0, 0, 667); fr.addColorStop(0, '#2a2c30'); fr.addColorStop(1, '#101113');
    roundRect(g, 0, 0, 315, 667, 54); g.fillStyle = fr; g.fill(); return cv;
  }
  // the reflection fades out from where the phone stands: seen at its foot, gone 42% of the way up
  var FADE_TO = 0.42;
  function fadeCanvas() {
    var cv = make('canvas'); cv.width = 4; cv.height = 256; var g = cv.getContext('2d'), gr = g.createLinearGradient(0, 256, 0, 0);
    gr.addColorStop(0, '#fff'); gr.addColorStop(FADE_TO, '#000'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); return cv;
  }
  /* The shape a clip shows through: the screen's rounded corners, less the island (the card underneath draws it).
     For the reflection, the same shape faded as the card's reflection is, measured in the card's own height. */
  function screenMask(reflected) {
    var c = canvas(SCREEN_W, SCREEN_H), g = c[1];
    g.fillStyle = '#000'; g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    roundRect(g, 0, 0, SCREEN_W, SCREEN_H, SCREEN_R);
    if (reflected) {
      var H = SCREEN_H + 2 * P, gr = g.createLinearGradient(0, SCREEN_H + P, 0, SCREEN_H + P - H);   // card bottom → top
      gr.addColorStop(0, '#fff'); gr.addColorStop(FADE_TO, '#000'); gr.addColorStop(1, '#000'); g.fillStyle = gr;
    } else g.fillStyle = '#fff';
    g.fill();
    g.fillStyle = '#000'; roundRect(g, ISLAND[0], ISLAND[1], ISLAND[2], ISLAND[3], ISLAND[3] / 2); g.fill();
    return c[0];
  }
  function groundColour(el) {
    for (var n = el; n; n = n.parentElement) {
      var c = getComputedStyle(n).backgroundColor;
      if (c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c)) return c;
    }
    return '#0d0d0e';
  }
  function load(src) {
    return new Promise(function (res) { var im = new Image(); im.decoding = 'async'; im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = src; });
  }
  function stills(el) {   // without clips: the screenshots, dark and light in turn
    var base = el.dataset.reel, l = +el.dataset.light || 0, d = +el.dataset.dark || 0, out = [];
    var pad = function (n) { return String(n).padStart(2, '0'); };
    for (var c = 0; c < CARDS; c++) out.push(base + (c % 2 && l ? 'l' + pad((c >> 1) % l + 1) : 'd' + pad((c >> 1) % Math.max(d, 1) + 1)) + '.webp');
    return out;
  }

  function build(el) {
    var clips = order(el);
    var sources = clips.length ? clips.map(function (c) { return c + '.webp'; }) : stills(el);
    var stage = make('div', 'reel__stage');
    stage.setAttribute('role', 'img'); stage.setAttribute('aria-label', el.dataset.label || '');

    Promise.all([import(THREE_URL), Promise.all(sources.map(load))]).then(function (got) {
      var THREE = got[0], imgs = got[1], renderer;
      try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); }
      catch (e) { return; }   // no WebGL: the still stays
      el.classList.add('reel');
      el.appendChild(stage);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      stage.appendChild(renderer.domElement);

      var world = new THREE.Scene();
      world.fog = new THREE.Fog(new THREE.Color(groundColour(el)), 4.0, 7.4);
      var camera = new THREE.PerspectiveCamera(26, 16 / 11, 0.1, 50);
      var CH = 1, CW = CH * (SCREEN_W + 2 * P) / (SCREEN_H + 2 * P), R = CARDS * (CW + 0.16) / (2 * Math.PI);
      var SW = CW * SCREEN_W / (SCREEN_W + 2 * P), SH = CH * SCREEN_H / (SCREEN_H + 2 * P);
      camera.position.set(0, 0.16, R + 3.1); camera.lookAt(0, -0.06, 0);

      var aniso = renderer.capabilities.getMaxAnisotropy(), keep = [];
      function tex(t) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; keep.push(t); return t; }
      var plane = new THREE.PlaneGeometry(CW, CH), screenPlane = new THREE.PlaneGeometry(SW, SH);
      var backT = tex(new THREE.CanvasTexture(backCanvas())), fade = new THREE.CanvasTexture(fadeCanvas());
      var mask = new THREE.CanvasTexture(screenMask(false)), reflMask = new THREE.CanvasTexture(screenMask(true));
      var group = new THREE.Group(); world.add(group);

      var cards = imgs.map(function (im, i) {
        var a = i / CARDS * Math.PI * 2, t = tex(new THREE.CanvasTexture(cardCanvas(im)));
        var face = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: t, transparent: true }));
        var back = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: backT, transparent: true }));
        var refl = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.16, alphaMap: fade, depthWrite: false }));
        // the clip's two surfaces, over the screen and over its reflection, shown once the clip is playing
        var screen = new THREE.Mesh(screenPlane, new THREE.MeshBasicMaterial({ alphaMap: mask, transparent: true }));
        var screenRefl = new THREE.Mesh(screenPlane, new THREE.MeshBasicMaterial({ alphaMap: reflMask, transparent: true, opacity: 0.16, depthWrite: false }));
        screen.position.z = 0.0015; screen.visible = screenRefl.visible = false;
        var holder = new THREE.Group();
        holder.position.set(Math.sin(a) * R, 0, Math.cos(a) * R); holder.rotation.y = a;
        back.rotation.y = Math.PI; back.position.z = -0.002;
        refl.scale.y = -1; refl.position.y = -CH - 0.035;
        screenRefl.scale.y = -1; screenRefl.position.set(0, -CH - 0.035, 0.0015);
        holder.add(face, back, refl, screen, screenRefl); group.add(holder);
        return { a: a, clip: clips[i], screen: screen, screenRefl: screenRefl, v: null, vt: null, holder: holder, face: face,
          refl: refl, up: 0 };
      });

      /* ---- the clips: a video texture each, made when a phone turns to face the camera and let go when it turns away */
      var bin = make('div', 'reel__bin'); el.appendChild(bin);
      function show(cd, map) {
        cd.screen.material.map = cd.screenRefl.material.map = map;
        cd.screen.material.needsUpdate = cd.screenRefl.material.needsUpdate = true;
        cd.screen.visible = cd.screenRefl.visible = !!map;
      }
      function start(cd) {
        var v = document.createElement('video');
        v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
        v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
        v.src = cd.clip + (AV1 ? '.av1.mp4' : '.mp4');
        bin.appendChild(v);
        cd.v = v; cd.vt = new THREE.VideoTexture(v); cd.vt.colorSpace = THREE.SRGBColorSpace;
        v.addEventListener('playing', function () { if (cd.v === v) show(cd, cd.vt); });
        var q = v.play(); if (q && q.catch) q.catch(function () {});
      }
      function stop(cd) {
        if (!cd.v) return;
        show(cd, null);
        cd.vt.dispose(); cd.v.pause(); cd.v.removeAttribute('src'); cd.v.load(); cd.v.remove();
        cd.v = cd.vt = null;
      }
      // paused, hidden or off screen, the clips stop where they are and go on from there
      function follow(live) {
        cards.forEach(function (cd) {
          var facing = !!cd.clip && Math.cos(cd.a + group.rotation.y) > FACING;
          if (facing && live && !cd.v) start(cd);
          else if (!facing && cd.v) stop(cd);
          if (!cd.v) return;
          var on = held ? held.cd === cd : live;   // a phone picked up plays on; the rest hold still behind it
          if (on && cd.v.paused) { var q = cd.v.play(); if (q && q.catch) q.catch(function () {}); }
          else if (!on && !cd.v.paused) cd.v.pause();
        });
      }

      /* ---- picking a phone up ---- */
      var F = function () { return (window.DriftWall && window.DriftWall.FOCUS) || LIFT; };
      var half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      // a share of the reel's height (cqh), as a length at the front of the ring
      var cqh = function (n) { return n * 2 * half * camera.position.distanceTo(new THREE.Vector3(0, 0, R)) / 100; };
      var ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), FINE = window.matchMedia('(hover: hover) and (pointer: fine)');
      var hovered = null, held = null, pointer = null, dim = 0, lastHover = 0;
      /* A phone picked up is drawn on a canvas of its own over the ring's, so the ring's can be dimmed and blurred
         behind it. Made the first time a phone is picked up. */
      var layer = null;
      function lift() {
        if (layer) return layer;
        var r2 = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
        r2.setPixelRatio(renderer.getPixelRatio()); r2.outputColorSpace = THREE.SRGBColorSpace;
        var box = make('div', 'reel__lift'); box.appendChild(r2.domElement); el.insertBefore(box, stage.nextSibling);
        layer = { r: r2, scene: new THREE.Scene(), size: function () { r2.setSize(stage.clientWidth, stage.clientHeight, false); } };
        layer.size();
        return layer;
      }
      function under(cx, cy) {
        var r = stage.getBoundingClientRect();
        ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        var faces = cards.filter(function (cd) { return Math.cos(cd.a + group.rotation.y) > FACING; }).map(function (cd) { return cd.face; });
        var hit = ray.intersectObjects(faces, false)[0];
        return hit ? cards.filter(function (cd) { return cd.face === hit.object; })[0] : null;
      }
      function hover(cd) { hovered = cd; el.classList.toggle('is-pointing', !!cd); }
      // the pose a phone has on the ring, risen off it by d along the way it faces
      function home(cd, d) {
        var m = new THREE.Matrix4().compose(new THREE.Vector3(Math.sin(cd.a) * R, 0, Math.cos(cd.a) * R), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), cd.a), new THREE.Vector3(1, 1, 1));
        m.premultiply(group.matrixWorld);
        var p = new THREE.Vector3(), q = new THREE.Quaternion(); m.decompose(p, q, new THREE.Vector3());
        return { p: p.add(new THREE.Vector3(0, 0, 1).applyQuaternion(q).multiplyScalar(d)), q: q };
      }
      // square on to the camera, as large as fills that share of the frame
      function framed() {
        var k = 2 * half * F().fill, d = Math.max(CH / k, CW / (k * camera.aspect));
        return { p: camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(d)), q: camera.quaternion.clone() };
      }
      function place(cd, at) { cd.holder.position.copy(at.p); cd.holder.quaternion.copy(at.q); }
      function mix(a, b, t) { return { p: a.p.clone().lerp(b.p, t), q: a.q.clone().slerp(b.q, t) }; }
      // a path of poses, each leg with its share of the time and its curve
      function path(legs, ms, done) {
        var t0 = performance.now();
        return function (now) {
          var t = Math.min(1, (now - t0) / ms), s = 0, i = 0;
          while (i < legs.length - 1 && t > s + legs[i].share) { s += legs[i].share; i++; }
          var leg = legs[i], u = leg.share ? Math.min(1, (t - s) / leg.share) : 1;
          place(held.cd, mix(leg.a, leg.b, leg.ease(u)));
          if (t >= 1 && done) done();
          return t >= 1;
        };
      }
      function curve(m) { var f = F(); return bezier(f[m + 'X1'], f[m + 'Y1'], f[m + 'X2'], f[m + 'Y2']); }
      function open(cd) {
        if (held || STILL.matches) return;
        var f = F(), one = f.motion === 'one', ms = one ? f.oneMs : f.riseMs + f.turnMs, rise = one || !ms ? 0 : f.riseMs / ms;
        var risen = cqh(f.hover) * OUT(cd.up), from = home(cd, risen), up = home(cd, risen + cqh(f.lift)), to = framed();
        hover(null);
        group.remove(cd.holder); lift().scene.add(cd.holder); place(cd, from);
        if (cd.clip && !cd.v) start(cd);
        held = { cd: cd, from: from, up: up, to: to, rise: rise, run: path(one ? [{ a: from, b: to, share: 1, ease: curve('one') }]
          : [{ a: from, b: up, share: rise, ease: curve('rise') }, { a: up, b: to, share: 1 - rise, ease: curve('turn') }], ms) };
        el.style.setProperty('--reel-in-ms', ms + 'ms'); el.style.setProperty('--reel-out-ms', f.outMs + 'ms');
        el.classList.add('is-focused');
      }
      function close(now) {
        if (!held || held.closing) return;
        var h = held, cd = h.cd, f = F(), at = { p: cd.holder.position.clone(), q: cd.holder.quaternion.clone() };
        h.closing = true;
        el.classList.remove('is-focused');
        var back = function () {
          layer.scene.remove(cd.holder); group.add(cd.holder);
          cd.holder.position.set(Math.sin(cd.a) * R, 0, Math.cos(cd.a) * R); cd.holder.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), cd.a);
          cd.up = 0; held = null;
        };
        if (now === true || STILL.matches) { back(); return draw(); }
        // the way back runs the way up in turn: the turn back to the ring, then down onto it, a step quicker
        h.run = path(f.motion === 'one' ? [{ a: at, b: h.from, share: 1, ease: curve('one') }]
          : [{ a: at, b: h.up, share: 1 - h.rise, ease: curve('turn') }, { a: h.up, b: h.from, share: h.rise, ease: curve('rise') }], f.outMs, back);
      }
      // the ring under a still pointer turns, so while the pointer is over it, look again each frame
      function point(now) {
        var dt = lastHover ? now - lastHover : 0, f = F(); lastHover = now;
        if (!held) hover(pointer ? under(pointer.x, pointer.y) : null);
        var moving = false;
        cards.forEach(function (cd) {
          var aim = cd === hovered ? 1 : 0;
          if (cd.up === aim || (held && held.cd === cd)) return;
          cd.up = aim > cd.up ? Math.min(1, cd.up + dt / f.hoverMs) : Math.max(0, cd.up - dt / f.hoverMs);
          var e = OUT(cd.up);
          cd.holder.position.set(Math.sin(cd.a) * (R + cqh(f.hover) * e), 0, Math.cos(cd.a) * (R + cqh(f.hover) * e));
          moving = true;
        });
        // the phone picked up leaves its reflection on the floor (the ring behind it dims and blurs in bb-reel.css)
        var want = held && !held.closing ? 1 : 0, ms = want ? (f.motion === 'one' ? f.oneMs : f.riseMs + f.turnMs) : f.outMs;
        if (dim !== want) {
          dim = want > dim ? Math.min(1, dim + dt / ms) : Math.max(0, dim - dt / ms);
          if (held) held.cd.refl.material.opacity = held.cd.screenRefl.material.opacity = 0.16 * (1 - OUT(dim));
          moving = true;
        }
        if (held && held.run && held.run(now)) { if (held) held.run = null; }
        return moving || !!held;
      }
      stage.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse' && FINE.matches) pointer = { x: e.clientX, y: e.clientY }; });
      stage.addEventListener('pointerleave', function () { pointer = null; });
      stage.addEventListener('click', function (e) {
        if (held) return close();
        var cd = under(e.clientX, e.clientY);
        if (cd) open(cd);
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && held) close(); });
      window.addEventListener('resize', function () { close(true); });

      /* ---- size, motion and its controls ---- */
      var clock = 0, last = 0;
      function draw() { if (!held) group.rotation.y = -clock * Math.PI * 2 / TURN; group.updateMatrixWorld(); renderer.render(world, camera); if (layer) layer.r.render(layer.scene, camera); }
      new ResizeObserver(function (e) {
        var r = e[0].contentRect; if (!r.width || !r.height) return;
        renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); if (layer) layer.size(); draw();
      }).observe(stage);

      var button = make('button', 'reel__pause'); button.type = 'button';
      button.innerHTML = '<svg class="reel__stop" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1.5" width="2.6" height="9" rx="0.6"/><rect x="7.4" y="1.5" width="2.6" height="9" rx="0.6"/></svg>' +
        '<svg class="reel__play" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.6v8.8a.6.6 0 0 0 .9.5l7-4.4a.6.6 0 0 0 0-1L3.9 1.1a.6.6 0 0 0-.9.5z"/></svg>';
      var label = function () { button.setAttribute('aria-label', el.classList.contains('is-paused') ? 'Play the moving screens' : 'Pause the moving screens'); };
      button.addEventListener('click', function () { el.classList.toggle('is-paused'); label(); });
      label(); el.appendChild(button);

      if ('IntersectionObserver' in window) {   // off screen until the observer's first report says otherwise
        el.classList.add('is-offscreen');
        new IntersectionObserver(function (en) { var off = !en[en.length - 1].isIntersecting; el.classList.toggle('is-offscreen', off); if (off) close(true); }).observe(el);
      }
      function running() { return !STILL.matches && !document.hidden && !el.classList.contains('is-paused') && !el.classList.contains('is-offscreen'); }

      function loop(now) {
        var dt = last ? Math.min(0.1, (now - last) / 1000) : 0, live = running(); last = now;
        follow(live);
        var busy = !STILL.matches && point(now);
        if (live && !held) clock += dt;
        if (live || busy) draw();
        requestAnimationFrame(loop);
      }
      draw();
      requestAnimationFrame(loop);
    }, function () { /* three.js didn't load: the still stays */ });
  }

  // three.js, the stills and the clips load only as the reel nears the window. It starts watching once the page has
  // loaded: before its fonts and pictures are in, the page is shorter and the reel would seem nearer than it is.
  function watch() {
    document.querySelectorAll('[data-reel]').forEach(function (el) {
      if (!('IntersectionObserver' in window)) return build(el);
      var io = new IntersectionObserver(function (en) {
        if (!en[en.length - 1].isIntersecting) return;
        io.disconnect(); build(el);
      }, { rootMargin: '200px 0px' });
      io.observe(el);
    });
  }
  if (document.readyState === 'complete') watch(); else window.addEventListener('load', watch, { once: true });
})();
