/* Drift wall: turns an element into a slowly drifting wall of image tiles. Styles are in drift-wall.css.

   <figure data-wall="images/groom-lake-wall/" data-count="42" data-label="What the wall shows">
     <img ...>   the still image, kept for when this script doesn't run
   </figure>

   The folder holds 01.webp, 02.webp and so on up to data-count. Optional: data-cols (columns, default 6) and
   data-speed (how far a column travels each second, as a percentage of the wall's height; default 2).
   The far and near tiles are out of focus. The wall leans a few degrees toward the pointer. It stops while it is off screen, and has a pause button. */
(function () {
  'use strict';

  var COPIES = 3;      // sets of tiles in a column; the keyframe in the stylesheet slides by one of them
  var UNIT = 24.65;    // a tile and its gap, as a percentage of the wall's height (see --wall-tile-h and --wall-gap)
  var ICONS = '<svg class="wall__stop" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1.5" width="3" height="9" rx="0.5"/><rect x="7" y="1.5" width="3" height="9" rx="0.5"/></svg>' +
              '<svg class="wall__play" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z"/></svg>';

  function make(tag, cls) { var n = document.createElement(tag); n.className = cls; return n; }

  function build(el) {
    var dir = el.dataset.wall.replace(/\/?$/, '/');
    var count = parseInt(el.dataset.count, 10) || 0;
    var cols = parseInt(el.dataset.cols, 10) || 6;
    var speed = parseFloat(el.dataset.speed) || 2;
    if (!count) return;

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
          img.dataset.src = dir + String(n).padStart(2, '0') + '.webp';
          inner.appendChild(img);
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

    // Parallax: the whole wall leans a few degrees toward the pointer and settles back when it leaves.
    var MAX = 4.8, TAU = 120;   // degrees at the wall's edge (the reference's parallax 0.6), and how quickly it follows
    var still = window.matchMedia('(prefers-reduced-motion: reduce)');
    var aim = { x: 0, y: 0 }, lean = { x: 0, y: 0 }, leanRaf = 0, leanAt = 0;
    function leanStep(now) {
      var k = 1 - Math.exp(-Math.min(50, now - leanAt) / TAU);
      leanAt = now;
      lean.x += (aim.x - lean.x) * k;
      lean.y += (aim.y - lean.y) * k;
      var done = Math.abs(aim.x - lean.x) < 0.01 && Math.abs(aim.y - lean.y) < 0.01;
      if (done) { lean.x = aim.x; lean.y = aim.y; }
      plane.style.setProperty('--wall-px', lean.x.toFixed(3) + 'deg');
      plane.style.setProperty('--wall-py', lean.y.toFixed(3) + 'deg');
      leanRaf = done ? 0 : requestAnimationFrame(leanStep);
    }
    function leanTo(x, y) {
      aim.x = x; aim.y = y;
      if (!leanRaf) { leanAt = performance.now(); leanRaf = requestAnimationFrame(leanStep); }
    }

    el.addEventListener('pointermove', function (e) {
      if (!still.matches && e.pointerType !== 'touch') {
        var box = el.getBoundingClientRect();
        leanTo(((e.clientX - box.left) / box.width - 0.5) * MAX, -((e.clientY - box.top) / box.height - 0.5) * MAX);
      }
    });
    el.addEventListener('pointerleave', function () { leanTo(0, 0); });

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

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        var seen = entries[entries.length - 1].isIntersecting;
        el.classList.toggle('is-offscreen', !seen);
        if (seen) load();
      }, { rootMargin: '300px' }).observe(el);
    } else load();
  }

  document.querySelectorAll('[data-wall]').forEach(build);
})();
