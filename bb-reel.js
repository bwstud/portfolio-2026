/* Blackbird reel: a ring of Blackbird phones turning slowly, head on, with their reflections on a dark floor, built
   inside any figure with data-reel (three.js, vendored in vendor/).
     <figure data-reel="images/blackbird-screens/" data-clips="mazlan-intake inspection …" data-label="What it shows">
       <img …>   the still, shown when the script, WebGL or three.js can't run
   Each phone plays a clip recorded live from the app in the simulator (tools/blackbird-clips): clips/<name>-dark and
   -light, as .mp4 (H.264), .av1.mp4 and a .webp of the first frame. Light and dark alternate around the ring. Only the
   phones facing the camera play; the rest show their first frame, which is where every clip starts, so a phone comes
   to life without a jump. The ring turns only while the picture is on screen, the tab is showing and it isn't paused;
   with reduced motion it is drawn once, at rest, with no clips. */
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
        return { a: a, clip: clips[i], screen: screen, screenRefl: screenRefl, v: null, vt: null };
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
          if (live && cd.v.paused) { var q = cd.v.play(); if (q && q.catch) q.catch(function () {}); }
          else if (!live && !cd.v.paused) cd.v.pause();
        });
      }

      /* ---- size, motion and its controls ---- */
      var clock = 0, last = 0;
      function draw() { group.rotation.y = -clock * Math.PI * 2 / TURN; renderer.render(world, camera); }
      new ResizeObserver(function (e) {
        var r = e[0].contentRect; if (!r.width || !r.height) return;
        renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); draw();
      }).observe(stage);

      var button = make('button', 'reel__pause'); button.type = 'button';
      button.innerHTML = '<svg class="reel__stop" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1.5" width="2.6" height="9" rx="0.6"/><rect x="7.4" y="1.5" width="2.6" height="9" rx="0.6"/></svg>' +
        '<svg class="reel__play" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.6v8.8a.6.6 0 0 0 .9.5l7-4.4a.6.6 0 0 0 0-1L3.9 1.1a.6.6 0 0 0-.9.5z"/></svg>';
      var label = function () { button.setAttribute('aria-label', el.classList.contains('is-paused') ? 'Play the moving screens' : 'Pause the moving screens'); };
      button.addEventListener('click', function () { el.classList.toggle('is-paused'); label(); });
      label(); el.appendChild(button);

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (en) { el.classList.toggle('is-offscreen', !en[0].isIntersecting); }, { rootMargin: '100px' }).observe(el);
      }
      function running() { return !STILL.matches && !document.hidden && !el.classList.contains('is-paused') && !el.classList.contains('is-offscreen'); }

      function loop(now) {
        var dt = last ? Math.min(0.1, (now - last) / 1000) : 0, live = running(); last = now;
        follow(live);
        if (live) { clock += dt; draw(); }
        requestAnimationFrame(loop);
      }
      draw();
      requestAnimationFrame(loop);
    }, function () { /* three.js didn't load: the still stays */ });
  }

  document.querySelectorAll('[data-reel]').forEach(build);
})();
