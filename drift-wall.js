/* Drift wall: turns an element into a slowly drifting wall of image tiles. Styles are in drift-wall.css.

   <figure data-wall="images/groom-lake-wall/" data-count="42" data-label="What the wall shows">
     <img ...>   the still image, kept for when this script doesn't run
   </figure>

   The folder holds 01.webp, 02.webp and so on up to data-count (with data-clips="all", they are in clips/). Optional: data-cols (columns, default 6) and
   data-speed (how far a column travels each second, as a percentage of the wall's height; default 2), data-tilt (degrees
   the wall is laid back; default 66) and data-turn (degrees it is turned; default -45, columns running down to the right).
   The far and near tiles are out of focus. It stops while it is off screen, and has a pause button.

   Moving screens (optional): data-clips="all" makes every tile a short loop of a real interaction recorded from the
   prototype: clips/01.mp4 up to data-count in the same folder (and clips/01.av1.mp4, the same in AV1), each with
   clips/01.webp, its first frame, as its still. tools/wall-clips/ records and encodes them.
   (A list of numbers, "3 8 14", makes only those tiles move. data-hold keeps them still until it is removed.) Every tile in view plays, up to MAX_PLAYING, the ones
   nearest the middle first; a tile drifting out of view stops and rests on its still. Nothing plays while the wall is
   paused or off screen, under reduced motion, or with Save-Data on.
   Screens to pick up (optional): data-focus lets a visitor lift one screen out of the wall. Hovering a screen raises it
   off the wall; pressing it stops the wall, and the screen rises, turns to face the viewer square on and fills the frame,
   still playing. Pressing it again, pressing beside it or Escape puts it back. Tuned by FOCUS below. With data-hd too,
   each clip has a full-size twin, clips/NN.hd.mp4, which a screen picked up plays in place of its small clip. */
(function () {
  'use strict';

  var COPIES = 3;      // sets of tiles in a column; the keyframe in the stylesheet slides by one of them
  var UNIT = 24.65;    // a tile and its gap, as a percentage of the wall's height (see --wall-tile-h and --wall-gap)
  var ICONS = '<svg class="wall__stop" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1.5" width="3" height="9" rx="0.5"/><rect x="7" y="1.5" width="3" height="9" rx="0.5"/></svg>' +
              '<svg class="wall__play" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z"/></svg>';

  var MAX_PLAYING = 24;   // a wall shows about 18 tiles at once
  var BAND = [0.02, 0.98];   // where a tile's middle must be to play, as shares of the wall's height
  /* Picking a screen up (data-focus). Lengths are shares of the wall's height (cqh), times in ms. The Lift Lab
     (experiments/lift-lab) tunes these and saves versions to wall-focus-versions.js; the one named by "active" is laid
     over them here. A version stores only what differs. */
  var FOCUS = {
    hover: 1.4,        // how far a screen rises off the wall under the pointer
    hoverMs: 200,      // how long that rise takes
    lift: 5,           // how far it rises off the wall before it turns toward the viewer
    fill: 0.94,        // how much of the frame it fills, at most, in either direction
    radius: 10,        // its corners once it faces the viewer, in px
    dim: 0.62,         // how dark the wall behind it goes
    motion: 'two',     // the way up as two moves, rising off the wall and then turning into the frame, or as 'one'
    riseMs: 140,       // two moves: how long it takes to rise off the wall,
    turnMs: 480,       // then to turn to face the viewer and grow into the frame
    oneMs: 560,        // one move: how long it takes to come off the wall and into the frame, all at once
    outMs: 440,        // the way back down, split between the two moves as the way up is: a step quicker than the way up
    // the rise off the wall and the turn into the frame, each a cubic-bezier's two handles; the way back runs them in turn
    riseX1: 0.3, riseY1: 0, riseX2: 0.2, riseY2: 1,
    turnX1: 0.23, turnY1: 1, turnX2: 0.32, turnY2: 1,
    oneX1: 0.23, oneY1: 1, oneX2: 0.32, oneY2: 1   // one move's curve, which the way back runs too
  };
  try {
    var saved = window.WALL_FOCUS_VERSIONS, on = saved && saved.versions.filter(function (v) { return v.id === saved.active; })[0];
    if (on) Object.keys(on.config || {}).forEach(function (k) { if (k in FOCUS) FOCUS[k] = on.config[k]; });
  } catch (e) {}
  var one = function () { return FOCUS.motion === 'one'; };
  var upMs = function () { return one() ? FOCUS.oneMs : FOCUS.riseMs + FOCUS.turnMs; };
  var riseShare = function () { return upMs() ? FOCUS.riseMs / upMs() : 0; };   // the share of either move spent rising
  var ease = function (m) { return 'cubic-bezier(' + [FOCUS[m + 'X1'], FOCUS[m + 'Y1'], FOCUS[m + 'X2'], FOCUS[m + 'Y2']].join(', ') + ')'; };
  var focusWalls = [];   // each wall with data-focus, so the lab can change the settings on the fly
  window.DriftWall = {
    FOCUS: FOCUS,
    apply: function (c) { Object.keys(c).forEach(function (k) { if (k in FOCUS) FOCUS[k] = c[k]; }); focusWalls.forEach(function (w) { w.retune(); }); }
  };
  var STILL = window.matchMedia('(prefers-reduced-motion: reduce)');
  var SAVE = navigator.connection && navigator.connection.saveData;
  var pad = function (n) { return String(n).padStart(2, '0'); };

  /* Each clip comes twice: NN.av1.mp4, about half the size, and NN.mp4 (H.264), which plays everywhere. AV1 is used only
     where the browser says it decodes it smoothly and power-efficiently, meaning in hardware; a wall plays a dozen or more
     at once, too many to decode in software. Until the browser answers, and wherever it can't, H.264. */
  var AV1 = false;
  try {
    if (navigator.mediaCapabilities && navigator.mediaCapabilities.decodingInfo) {
      navigator.mediaCapabilities.decodingInfo({ type: 'file', video: { contentType: 'video/mp4; codecs="av01.0.04M.08"', width: 720, height: 468, bitrate: 250000, framerate: 24 } })
        .then(function (r) { AV1 = !!(r && r.supported && r.smooth && r.powerEfficient); }, function () {});
    }
  } catch (e) {}

  function make(tag, cls) { var n = document.createElement(tag); n.className = cls; return n; }

  function build(el) {
    var dir = el.dataset.wall.replace(/\/?$/, '/');
    var count = parseInt(el.dataset.count, 10) || 0;
    var cols = parseInt(el.dataset.cols, 10) || 6;
    var speed = parseFloat(el.dataset.speed) || 2;
    var clips = {};
    if (el.dataset.clips === 'all') for (var k = 1; k <= count; k++) clips[k] = true;
    else (el.dataset.clips || '').split(/[\s,]+/).forEach(function (n) { if (+n) clips[+n] = true; });
    if (!count) return;
    if (el.dataset.tilt) el.style.setProperty('--wall-tilt', parseFloat(el.dataset.tilt) + 'deg');
    if (el.dataset.turn) el.style.setProperty('--wall-turn', parseFloat(el.dataset.turn) + 'deg');

    var stage = make('div', 'wall__stage');
    // the stage is the picture, named by data-label; the element itself stays plain so it can hold buttons as well
    if (el.dataset.label) { stage.setAttribute('role', 'img'); stage.setAttribute('aria-label', el.dataset.label); }
    else stage.setAttribute('aria-hidden', 'true');
    var scene = make('div', 'wall__scene');
    var plane = make('div', 'wall__plane');
    scene.appendChild(plane);
    stage.appendChild(scene);
    var dof = make('div', 'wall__dof');   // the blur over the far and near tiles (see the stylesheet)
    dof.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
    stage.appendChild(dof);

    var movers = [];   // tiles with a clip, every copy of them
    for (var c = 0; c < cols; c++) {
      var col = make('div', 'wall__col');
      var track = make('div', 'wall__track');
      var own = [];
      for (var n = c; n < count; n += cols) own.push(n + 1);   // dealt out like cards, so similar screens end up apart
      while (own.length < 7) own = own.concat(own);             // one set must be taller than the wall, or the loop shows a gap
      for (var pass = 0; pass < COPIES; pass++) {
        own.forEach(function (n) {
          var tile = make('div', 'wall__tile');
          var inner = make('span', 'wall__inner');
          var img = new Image();
          img.alt = '';
          img.decoding = 'async';
          img.draggable = false;
          img.width = 720; img.height = 468;
          img.dataset.src = dir + (clips[n] ? 'clips/' : '') + pad(n) + '.webp';
          inner.appendChild(img);
          if (clips[n]) { tile.dataset.clip = dir + 'clips/' + pad(n) + '.mp4'; movers.push(tile); }
          tile.appendChild(inner);
          track.appendChild(tile);
        });
      }
      // One loop is one set of tiles. A little spread in the timing keeps the columns from falling back into step.
      var seconds = (own.length * UNIT / speed) * (1 + ((c * 37) % 5 - 2) * 0.06);
      track.style.setProperty('--wall-dur', seconds.toFixed(1) + 's');
      track.style.setProperty('--wall-delay', (-seconds * ((c * 0.37) % 1)).toFixed(1) + 's');
      col.appendChild(track);
      plane.appendChild(col);
    }

    var button = make('button', 'wall__pause');
    button.type = 'button';
    button.innerHTML = ICONS;
    var label = function () { button.setAttribute('aria-label', el.classList.contains('is-paused') ? 'Play the moving screenshots' : 'Pause the moving screenshots'); };
    button.addEventListener('click', function () { el.classList.toggle('is-paused'); label(); });
    label();

    // The pictures are fetched the first time the wall comes near the screen, so a record that is never opened costs nothing.
    var loaded = false;
    function load() {
      if (loaded) return;
      loaded = true;
      var imgs = [].slice.call(plane.querySelectorAll('img'));
      imgs.forEach(function (img) { img.src = img.dataset.src; });
      // ready once its pictures are decoded (or after a second and a half, whatever has come): a page can bring the
      // wall in then (.is-ready), so no picture pops in while it does
      Promise.all(imgs.map(function (img) { return img.decode ? img.decode().catch(function () {}) : null; })).then(ready);
      setTimeout(ready, 1500);
    }
    function ready() { if (el.classList.contains('is-ready')) return; el.classList.add('is-ready'); el.dispatchEvent(new Event('wallready')); }

    el.classList.add('wall');
    el.append(stage, button);

    var screens = movers.length && !SAVE ? focus(el, stage, movers) : null;
    if (el.hasAttribute('data-focus')) pickUp(el, stage, plane, screens);

    // the wall's pictures load as it nears the window; its clips play only while it is actually in it
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (entries[entries.length - 1].isIntersecting) load();
      }, { rootMargin: '300px' }).observe(el);
      new IntersectionObserver(function (entries) {
        el.classList.toggle('is-offscreen', !entries[entries.length - 1].isIntersecting);
        if (screens) screens.check();
      }).observe(el);
    } else load();
    button.addEventListener('click', function () { if (screens) screens.check(); });
  }

  /* The moving screens. Four times a second, find the clip tiles whose middle is in view, nearest the middle first; the
     first MAX_PLAYING of them play and the rest rest on their stills. A tile starts its clip from the beginning each
     time it comes into view, and its copies further down the column start at their own moments, so they never move
     in step. A clip fades in over its
     own first frame once it is actually playing, so it never flashes; leaving the band, it fades back to the still. */
  function focus(el, stage, movers) {
    var timer = null;
    // a playing clip shows over its still; the mark goes on the screen too, which keeps it once it is picked up
    function lit(tile, on) {   // (the screen is found once and kept: while it is picked up it isn't inside the tile)
      var inner = tile._inner || (tile._inner = tile.querySelector('.wall__inner'));
      tile.classList.toggle('is-playing', on); inner.classList.toggle('is-playing', on);
    }
    function video(tile) {
      if (tile._video) return tile._video;
      var v = document.createElement('video');
      v.className = 'wall__clip';
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
      v.src = AV1 ? tile.dataset.clip.replace(/\.mp4$/, '.av1.mp4') : tile.dataset.clip;
      v.addEventListener('playing', function () { if (tile._on) lit(tile, true); });
      tile.querySelector('.wall__inner').appendChild(v);
      return (tile._video = v);
    }
    function start(tile) {
      if (tile._on) return;
      tile._on = true;
      var v = video(tile);
      v.currentTime = 0;
      var p = v.play();
      if (p && p.catch) p.catch(function () { tile._on = false; });
    }
    function stop(tile) {
      if (!tile._on) return;
      tile._on = false;
      lit(tile, false);
      var v = tile._video;
      // after the fade back to the still, let the video go: a browser runs only so many players at once (phones fewer)
      setTimeout(function () {
        if (tile._on || tile._video !== v) return;
        v.pause(); v.removeAttribute('src'); v.load(); v.remove(); tile._video = null;
      }, 420);
    }
    function tick() {
      // the band is the wall's, cut to the window: a tile past the window's edge doesn't play
      var box = stage.getBoundingClientRect(), vh = window.innerHeight || document.documentElement.clientHeight;
      var lo = Math.max(box.top + box.height * BAND[0], 0), hi = Math.min(box.top + box.height * BAND[1], vh);
      var mid = (lo + hi) / 2;
      var inBand = movers.map(function (t) {
        var r = t.getBoundingClientRect(), y = r.top + r.height / 2, x = r.left + r.width / 2;
        return { t: t, d: Math.abs(y - mid), ok: y > lo && y < hi && x > box.left && x < box.right };
      }).filter(function (m) { return m.ok; }).sort(function (a, b) { return a.d - b.d; }).slice(0, MAX_PLAYING);
      var keep = inBand.map(function (m) { return m.t; });
      movers.forEach(function (t) { if (t._held && keep.indexOf(t) < 0) keep.push(t); });
      movers.forEach(function (t) { if (keep.indexOf(t) < 0) stop(t); });
      keep.forEach(start);
    }
    function check() {
      var live = !STILL.matches && !document.hidden && !el.classList.contains('is-paused') && !el.classList.contains('is-offscreen') && !el.hasAttribute('data-hold');
      if (live && !timer) { tick(); timer = setInterval(tick, 250); }
      if (!live && timer) { clearInterval(timer); timer = null; movers.forEach(function (t) { if (!t._held) stop(t); }); }
    }
    // a screen that has been picked up plays whatever the wall is doing, until it is put back
    function hold(tile, on) {
      tile._held = on;
      if (on) start(tile); else check();
    }
    document.addEventListener('visibilitychange', check);
    // data-hold: the page keeps the clips still (the wall shows its stills) until it lets go, say while the wall is coming
    // in; whatever happens, it lets go after four seconds
    if (el.hasAttribute('data-hold')) {
      new MutationObserver(check).observe(el, { attributes: true, attributeFilter: ['data-hold'] });
      setTimeout(function () { el.removeAttribute('data-hold'); }, 4000);
    }
    if (STILL.addEventListener) STILL.addEventListener('change', check);
    return { check: check, hold: hold };
  }

  /* Picking a screen up. The screen's own box (.wall__inner, with its still and its clip) leaves the wall for a flat
     layer over it, carrying a transform that puts it exactly where it was, so nothing jumps. That transform is worked
     out from the wall's: where the plane sits, its tilt and turn, where the column has drifted to, and where the screen
     sits in it. From there it rises along the wall's normal, then turns square to the viewer and grows to fill the frame;
     the browser interpolates between the matrices by their rotations, so the turn is a true one. Putting it back runs
     the same way in reverse, and the screen goes home to its tile. The wall is held still meanwhile.
     The wall has no perspective (it is a true isometric view), so a rise off the wall shows on screen as a move straight
     up. Under the pointer, a hovered screen rises by sliding within the wall's plane by whatever amount shows as that
     same move, which keeps the wall flat and cheap to draw. */
  function pickUp(el, stage, plane, screens) {
    var deg = Math.PI / 180;
    var tilt = (parseFloat(el.dataset.tilt) || 66) * deg, turn = (parseFloat(el.dataset.turn) || -45) * deg;
    // the slide within the plane that looks like a rise of 1 off it: (0, -tan tilt) on the wall, turned back by its turn
    var a = -Math.tan(tilt), rise = { x: 0, y: 0 };   // rise: that slide for a hover, in hundredths of the wall's height
    function retune() {
      rise = { x: a * Math.sin(turn) * FOCUS.hover, y: a * Math.cos(turn) * FOCUS.hover };
      el.style.setProperty('--wall-rise-x', rise.x.toFixed(3));
      el.style.setProperty('--wall-rise-y', rise.y.toFixed(3));
      el.style.setProperty('--wall-hover-ms', FOCUS.hoverMs + 'ms');
      el.style.setProperty('--wall-dim', FOCUS.dim);
      el.style.setProperty('--wall-in-ms', upMs() + 'ms');
      el.style.setProperty('--wall-out-ms', FOCUS.outMs + 'ms');
    }
    retune();
    el.classList.add('wall--focus');

    var layer = make('div', 'wall__lift');
    layer.setAttribute('aria-hidden', 'true');
    el.insertBefore(layer, stage.nextSibling);
    var held = null, run = null;

    // the transform that maps the screen's box, from its top left corner, onto where it shows in the wall
    function inWall(tile, inner) {
      var track = tile.parentNode;
      var p = new DOMMatrix(getComputedStyle(plane).transform), t = new DOMMatrix(getComputedStyle(track).transform);
      var ox = plane.offsetWidth / 2, oy = plane.offsetHeight / 2;
      // where the box sits in the plane as laid out: browsers differ on which ancestors they measure from (Chrome counts
      // the moving column), so add up the steps to the plane, then add how far the column has drifted
      var x = 0, y = 0;
      for (var n = inner; n && n !== plane; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
      return new DOMMatrix()
        .translate(plane.offsetLeft + ox, plane.offsetTop + oy).multiply(p).translate(-ox, -oy)
        .translate(t.m41, t.m42)
        .translate(x, y);
    }
    function framed(w, h) {
      var W = stage.clientWidth, H = stage.clientHeight, k = Math.min(W * FOCUS.fill / w, H * FOCUS.fill / h);
      return { m: new DOMMatrix().translate((W - w * k) / 2, (H - h * k) / 2).scale(k, k), k: k };
    }
    var cqh = function (n) { return n * stage.clientHeight / 100; };
    var str = function (m) { return m.toString(); };

    function open(tile) {
      if (held || STILL.matches) return;
      var inner = tile.querySelector('.wall__inner');
      el.classList.add('is-holding');   // the columns stop where they are (read below, so after this)
      var w = inner.offsetWidth, h = inner.offsetHeight, look = getComputedStyle(inner), r0 = look.borderRadius;
      var lifted = (look.translate || 'none') === 'none' ? [0, 0] : look.translate.split(' ').map(parseFloat);   // a hover rise, if it has one
      var from = inWall(tile, inner).translate(lifted[0] || 0, lifted[1] || 0), up = from.translate(0, 0, cqh(FOCUS.lift)), to = framed(w, h);
      held = { tile: tile, inner: inner, from: from, up: up, to: to, r0: r0, w: w, h: h };
      if (screens) screens.hold(tile, true);
      sharpen(held);
      inner.style.cssText = 'width:' + w + 'px;height:' + h + 'px;transform-origin:0 0;transform:' + str(from);
      layer.appendChild(inner);
      tile.classList.add('is-lifted');
      el.classList.add('is-focused');
      layer.style.pointerEvents = 'auto';
      var rEnd = (FOCUS.radius / to.k) + 'px';
      run = inner.animate(one() ? [
        { transform: str(from), borderRadius: r0, easing: ease('one') },
        { transform: str(to.m), borderRadius: rEnd }
      ] : [
        { transform: str(from), borderRadius: r0, easing: ease('rise') },
        { transform: str(up), borderRadius: r0, offset: riseShare(), easing: ease('turn') },
        { transform: str(to.m), borderRadius: rEnd }
      ], { duration: upMs(), fill: 'forwards' });
      // once it is up, its place goes into its own style and the animation lets go: Chrome draws a moving layer at the
      // size it started at, so the screen would stay soft at full frame until something made it redraw
      var mine = run, box = inner;
      run.onfinish = function () {
        if (run !== mine) return;
        box.style.transform = str(to.m); box.style.borderRadius = rEnd; box.style.willChange = 'auto';
        mine.cancel(); run = null;
      };
    }
    /* A tile's clip is small (a wall plays a couple of dozen at once), too small to fill the frame. With data-hd, each clip
       has a twin at the size it was filmed, NN.hd.mp4, cut the same way so its frames fall at the same moments. A screen
       picked up fetches its twin, starts it where its own clip has got to, and once the two are in step fades it in over
       the small one; putting the screen back fades it out again and lets it go. */
    function sharpen(h) {
      var small = h.tile._video;
      if (!small || !el.hasAttribute('data-hd')) return;
      var v = document.createElement('video');
      v.className = 'wall__clip wall__clip--hd';
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
      v.src = h.tile.dataset.clip.replace(/\.mp4$/, '.hd.mp4');
      h.inner.appendChild(v);
      h.hd = v;
      var tries = 0;
      // where the small clip will be a moment from now, by when the seek should be done
      var aim = function (lead) { var d = small.duration || v.duration || 1; return (small.currentTime + lead) % d; };
      var gap = function () { var d = v.duration || 1, x = Math.abs(small.currentTime - v.currentTime) % d; return Math.min(x, d - x); };
      var check = function () {
        if (h.hd !== v) return;
        if (gap() < 0.06 || tries >= 4) { v.classList.add('is-sharp'); keep(); return; }
        tries++;
        v.currentTime = aim(0.12);
        v.addEventListener('seeked', function () { setTimeout(check, 60); }, { once: true });
      };
      // then keep it in step: a touch faster or slower while it is more than a frame out, so the small one under it
      // matches if it ever shows through (fading out on the way back)
      var keep = function () {
        v.addEventListener('timeupdate', function () {
          if (h.hd !== v || !small.duration) return;
          var d = v.duration, x = ((small.currentTime - v.currentTime) % d + d * 1.5) % d - d / 2;
          v.playbackRate = Math.abs(x) > 0.04 ? 1 + Math.max(-0.15, Math.min(0.15, x)) : 1;
        });
      };
      v.addEventListener('canplay', function () {
        if (h.hd !== v) return;
        v.currentTime = aim(0.25);
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
        v.addEventListener('playing', function () { setTimeout(check, 60); }, { once: true });
      }, { once: true });
      v.addEventListener('error', function () { if (h.hd === v) { v.remove(); h.hd = null; } });
    }
    function blunt(h) { if (h.hd) h.hd.classList.remove('is-sharp'); }
    function close(now) {
      if (!held) return;
      var h = held; held = null;
      el.classList.remove('is-focused');
      layer.style.pointerEvents = '';
      blunt(h);
      var home = function () {
        if (h.hd) { h.hd.pause(); h.hd.removeAttribute('src'); h.hd.load(); h.hd.remove(); h.hd = null; }
        if (run) run.cancel();
        h.inner.style.cssText = '';
        h.tile.appendChild(h.inner);
        h.tile.classList.remove('is-lifted');
        if (screens) screens.hold(h.tile, false);
        if (!held) el.classList.remove('is-holding');
      };
      if (now === true || STILL.matches) return home();
      h.inner.style.willChange = '';
      var cur = getComputedStyle(h.inner);
      if (run) { var m = cur.transform, r = cur.borderRadius; run.cancel(); h.inner.style.transform = m; h.inner.style.borderRadius = r; }
      var now0 = { transform: h.inner.style.transform || str(h.to.m), borderRadius: h.inner.style.borderRadius || h.r0 };
      run = h.inner.animate(one() ? [
        Object.assign(now0, { easing: ease('one') }),
        { transform: str(h.from), borderRadius: h.r0 }
      ] : [
        Object.assign(now0, { easing: ease('turn') }),
        { transform: str(h.up), borderRadius: h.r0, offset: 1 - riseShare(), easing: ease('rise') },
        { transform: str(h.from), borderRadius: h.r0 }
      ], { duration: FOCUS.outMs, fill: 'forwards' });
      run.onfinish = home;
    }

    /* Which screen is under the pointer. The browser's own answer (:hover, a click's target) can't be trusted on a wall
       laid back in 3D: the columns lie in the same plane as their screens, so at any point either may win, and screens
       answered in some places and not others. So the pointer is carried back onto the wall's plane, by undoing the
       plane's transform, and looked up there: which column, then, allowing for how far it has drifted, which screen. The
       screens' places in their columns are measured once (and again after a resize). A screen already raised keeps the
       pointer anywhere over where it shows now as well as where it sits, so it doesn't flicker at its edge. */
    var cols = null;
    function measure() {
      cols = [].map.call(plane.querySelectorAll('.wall__track'), function (track) {
        var boxes = [].map.call(track.querySelectorAll('.wall__inner'), function (inner) {
          var x = 0, y = 0;
          for (var n = inner; n && n !== plane; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
          return { tile: inner.parentNode, x: x, y: y, w: inner.offsetWidth, h: inner.offsetHeight };
        });
        var x0 = Math.min.apply(null, boxes.map(function (b) { return b.x; })), x1 = Math.max.apply(null, boxes.map(function (b) { return b.x + b.w; }));
        return { track: track, boxes: boxes, x0: x0, x1: x1 };
      });
    }
    function under(cx, cy) {
      if (!cols) measure();
      var r = el.getBoundingClientRect(), ox = plane.offsetWidth / 2, oy = plane.offsetHeight / 2;
      var m = new DOMMatrix().translate(plane.offsetLeft + ox, plane.offsetTop + oy).multiply(new DOMMatrix(getComputedStyle(plane).transform)).translate(-ox, -oy);
      // no perspective, so the plane meets the screen as a flat map: undo its 2D part
      var X = cx - r.left - m.m41, Y = cy - r.top - m.m42, det = m.m11 * m.m22 - m.m21 * m.m12;
      if (!det) return null;
      var u = (X * m.m22 - Y * m.m21) / det, v = (Y * m.m11 - X * m.m12) / det;
      var inBox = function (b, t, dx, dy) { return u >= b.x + t.m41 + dx && u <= b.x + t.m41 + dx + b.w && v >= b.y + t.m42 + dy && v <= b.y + t.m42 + dy + b.h; };
      var found = null;
      cols.forEach(function (c) {
        var slack = Math.abs(cqh(rise.x));
        if (found || u < c.x0 - slack || u > c.x1 + slack) return;
        var t = null;
        c.boxes.forEach(function (b) {
          if (found) return;
          if (b.tile !== hovered && (u < b.x || u > b.x + b.w)) return;
          t = t || new DOMMatrix(getComputedStyle(c.track).transform);
          if (inBox(b, t, 0, 0) || (b.tile === hovered && inBox(b, t, cqh(rise.x), cqh(rise.y)))) found = b.tile;
        });
      });
      return found;
    }
    var hovered = null, pointer = null, ticking = 0;
    var FINE = window.matchMedia('(hover: hover) and (pointer: fine)');
    function hover(tile) {
      if (tile === hovered) return;
      if (hovered) hovered.classList.remove('is-hover');
      hovered = tile;
      if (tile) tile.classList.add('is-hover');
      el.classList.toggle('is-pointing', !!tile);
    }
    // the wall drifts under a still pointer, so while the pointer is over it, look again every frame
    function follow() {
      ticking = 0;
      if (!pointer || held) return hover(null);
      hover(under(pointer.x, pointer.y));
      ticking = requestAnimationFrame(follow);
    }
    stage.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' || !FINE.matches) return;
      pointer = { x: e.clientX, y: e.clientY };
      if (!ticking) follow();
    });
    stage.addEventListener('pointerleave', function () { pointer = null; cancelAnimationFrame(ticking); ticking = 0; hover(null); });
    stage.addEventListener('click', function (e) {
      var tile = under(e.clientX, e.clientY);
      if (tile) { hover(null); open(tile); }
    });
    layer.addEventListener('click', function () { close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && held) close(); });
    // gone from view, or the window changes size: straight home
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { if (!es[es.length - 1].isIntersecting) close(true); }).observe(el);
    window.addEventListener('resize', function () { close(true); cols = null; });
    // for the lab: pick up the screen nearest the middle of the frame (one that is wholly in view), or put it back
    function middle() {
      var box = stage.getBoundingClientRect(), mx = box.left + box.width / 2, my = box.top + box.height / 2, best = null;
      plane.querySelectorAll('.wall__tile').forEach(function (t) {
        var r = t.getBoundingClientRect();
        if (r.left < box.left || r.right > box.right || r.top < box.top || r.bottom > box.bottom) return;
        var d = Math.hypot(r.left + r.width / 2 - mx, r.top + r.height / 2 - my);
        if (!best || d < best.d) best = { t: t, d: d };
      });
      return best && best.t;
    }
    el.wallLift = { open: function () { var t = middle(); if (t) open(t); }, close: function () { close(); }, held: function () { return !!held; } };
    focusWalls.push({ retune: retune });
  }

  document.querySelectorAll('[data-wall]').forEach(build);
})();
