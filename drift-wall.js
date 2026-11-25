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
   (A list of numbers, "3 8 14", makes only those tiles move.) Every tile in view plays, up to MAX_PLAYING, the ones
   nearest the middle first; a tile drifting out of view stops and rests on its still. Nothing plays while the wall is
   paused or off screen, under reduced motion, or with Save-Data on. */
(function () {
  'use strict';

  var COPIES = 3;      // sets of tiles in a column; the keyframe in the stylesheet slides by one of them
  var UNIT = 24.65;    // a tile and its gap, as a percentage of the wall's height (see --wall-tile-h and --wall-gap)
  var ICONS = '<svg class="wall__stop" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1.5" width="3" height="9" rx="0.5"/><rect x="7" y="1.5" width="3" height="9" rx="0.5"/></svg>' +
              '<svg class="wall__play" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z"/></svg>';

  var MAX_PLAYING = 24;   // a wall shows about 18 tiles at once
  var BAND = [0.02, 0.98];   // where a tile's middle must be to play, as shares of the wall's height
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
      plane.querySelectorAll('img').forEach(function (img) { img.src = img.dataset.src; });
    }

    el.classList.add('wall');
    el.append(stage, button);

    var screens = movers.length && !SAVE ? focus(el, stage, movers) : null;

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        var seen = entries[entries.length - 1].isIntersecting;
        el.classList.toggle('is-offscreen', !seen);
        if (seen) load();
        if (screens) screens.check();
      }, { rootMargin: '300px' }).observe(el);
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
    function video(tile) {
      if (tile._video) return tile._video;
      var v = document.createElement('video');
      v.className = 'wall__clip';
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
      v.src = AV1 ? tile.dataset.clip.replace(/\.mp4$/, '.av1.mp4') : tile.dataset.clip;
      v.addEventListener('playing', function () { if (tile._on) tile.classList.add('is-playing'); });
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
      tile.classList.remove('is-playing');
      var v = tile._video;
      // after the fade back to the still, let the video go: a browser runs only so many players at once (phones fewer)
      setTimeout(function () {
        if (tile._on || tile._video !== v) return;
        v.pause(); v.removeAttribute('src'); v.load(); v.remove(); tile._video = null;
      }, 420);
    }
    function tick() {
      var box = stage.getBoundingClientRect(), lo = box.top + box.height * BAND[0], hi = box.top + box.height * BAND[1];
      var mid = (lo + hi) / 2;
      var inBand = movers.map(function (t) {
        var r = t.getBoundingClientRect(), y = r.top + r.height / 2, x = r.left + r.width / 2;
        return { t: t, d: Math.abs(y - mid), ok: y > lo && y < hi && x > box.left && x < box.right };
      }).filter(function (m) { return m.ok; }).sort(function (a, b) { return a.d - b.d; }).slice(0, MAX_PLAYING);
      var keep = inBand.map(function (m) { return m.t; });
      movers.forEach(function (t) { if (keep.indexOf(t) < 0) stop(t); });
      keep.forEach(start);
    }
    function check() {
      var live = !STILL.matches && !document.hidden && !el.classList.contains('is-paused') && !el.classList.contains('is-offscreen');
      if (live && !timer) { tick(); timer = setInterval(tick, 250); }
      if (!live && timer) { clearInterval(timer); timer = null; movers.forEach(stop); }
    }
    document.addEventListener('visibilitychange', check);
    if (STILL.addEventListener) STILL.addEventListener('change', check);
    return { check: check };
  }

  document.querySelectorAll('[data-wall]').forEach(build);
})();
