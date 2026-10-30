/* Lessons for the GSAP Playground. Each one follows a single official GSAP skill
   (installed in ~/.claude/skills), so a question about a lesson can go to the skill
   it names.
   { id, skill, title, docs, scroll?, html, code, notes, tries } */

const times = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join('');

const lane = (label, inner) => `<div class="lane"><span>${label}</span>${inner}</div>`;

// five-point star centred in a 240 box, for the MorphSVG lesson
const star = (() => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 32 : 78, a = -Math.PI / 2 + i * Math.PI / 5;
    pts.push((120 + r * Math.cos(a)).toFixed(1) + ' ' + (120 + r * Math.sin(a)).toFixed(1));
  }
  return 'M' + pts.join(' L') + ' Z';
})();

export const SKILLS = [
  { id: 'gsap-core', name: 'Core' },
  { id: 'gsap-timeline', name: 'Timelines' },
  { id: 'gsap-scrolltrigger', name: 'ScrollTrigger' },
  { id: 'gsap-plugins', name: 'Plugins' },
  { id: 'gsap-utils', name: 'Utilities' },
  { id: 'gsap-performance', name: 'Performance' },
  { id: 'gsap-frameworks', name: 'Frameworks' },
];

export const LESSONS = [
  /* ---------------- gsap-core ---------------- */
  {
    id: 'tweens',
    skill: 'gsap-core',
    title: 'to, from, fromTo and set',
    docs: 'https://gsap.com/docs/v3/GSAP/gsap.to()',
    html: `<div class="lanes">
  ${lane('to', '<div class="box c1" id="a"></div>')}
  ${lane('from', '<div class="box c2" id="b"></div>')}
  ${lane('fromTo', '<div class="box c3" id="c"></div>')}
</div>`,
    code: `// to(): animate from where the box is now to these values
gsap.to("#a", { x: 200, rotation: 180, duration: 1.2 });

// from(): animate from these values back to where the box is now
gsap.from("#b", { x: 200, autoAlpha: 0, duration: 1.2 });

// fromTo(): spell out both ends, so nothing is read from the page
gsap.fromTo("#c", { x: 0, scale: 0.4 }, { x: 200, scale: 1, duration: 1.2 });

// set(): jump straight there, a tween with no duration
// gsap.set("#a", { backgroundColor: "#ff8fb1" });
`,
    notes: `<p>A <em>tween</em> moves properties of one or more targets over time. The code runs on the right, and each tween shows up as a bar in the timeline below. Drag the playhead to scrub through it.</p>
<p>Property names are camelCase. <code>x</code>, <code>y</code> and <code>rotation</code> are GSAP's transform shortcuts. <code>autoAlpha</code> is opacity that also hides the element once it reaches 0.</p>`,
    tries: [
      'Add <code>repeat: -1, yoyo: true</code> to the first tween.',
      'Uncomment the <code>set()</code> line, then move it above the <code>to()</code>.',
      'Give the three tweens different durations and watch the bars change length.',
    ],
  },
  {
    id: 'eases',
    skill: 'gsap-core',
    title: 'Easing',
    docs: 'https://gsap.com/docs/v3/Eases',
    html: `<div class="lanes">
  ${times(6, i => `<div class="lane lane--stack" id="lane${i}"><span></span><div class="dot c${(i % 5) + 1}"></div></div>`)}
</div>`,
    code: `const eases = ["none", "power2.out", "power4.inOut", "back.out(1.7)", "elastic.out(1, 0.3)", "bounce.out"];

eases.forEach((ease, i) => {
  document.querySelector("#lane" + i + " span").textContent = ease;
  gsap.to("#lane" + i + " .dot", { x: 240, duration: 1.6, ease });
});
`,
    notes: `<p>An ease shapes the speed of a tween over its duration. Each bar in the timeline draws its own curve. Steeper means faster.</p>
<p>The name is the family, and the suffix says where the curve bends: <code>.in</code> eases in, <code>.out</code> eases out, <code>.inOut</code> does both. On its own, a family name means <code>.out</code>. Power runs from 1 (gentle) to 4 (steep).</p>`,
    tries: [
      'Swap <code>power2.out</code> for <code>power2.in</code> and compare.',
      'Try <code>"steps(6)"</code>, <code>"expo.out"</code> or <code>"circ.inOut"</code>.',
      'Change the numbers in <code>back.out(1.7)</code> and <code>elastic.out(1, 0.3)</code>.',
    ],
  },
  {
    id: 'stagger',
    skill: 'gsap-core',
    title: 'Stagger',
    docs: 'https://gsap.com/resources/getting-started/Staggers',
    html: `<div class="grid" style="--cols: 7">${times(49, () => '<div class="cell"></div>')}</div>`,
    code: `gsap.from(".cell", {
  scale: 0,
  autoAlpha: 0,
  duration: 0.6,
  ease: "back.out(2)",
  stagger: {
    each: 0.05,       // seconds between each start
    grid: [7, 7],     // rows, columns
    from: "center"    // "start", "end", "edges", "random" or an index
  }
});
`,
    notes: `<p>One tween can animate many targets, and <code>stagger</code> offsets each target's start. It's cheaper and tidier than writing a separate tween with its own delay for every element.</p>
<p>A plain number such as <code>stagger: 0.1</code> is the simple form. The object form adds direction, grid awareness and easing across the group.</p>`,
    tries: [
      'Change <code>from</code> to <code>"edges"</code>, <code>"random"</code> or <code>0</code>.',
      'Replace <code>each: 0.05</code> with <code>amount: 1</code> (one second spread over the whole group).',
      'Add <code>axis: "x"</code> inside the stagger, then <code>repeat: -1, yoyo: true</code>.',
    ],
  },
  {
    id: 'transforms',
    skill: 'gsap-core',
    title: 'Transforms and autoAlpha',
    docs: 'https://gsap.com/docs/v3/GSAP/CorePlugins/CSS',
    html: `<div class="row">
  <div class="box c1" id="spin"></div>
  <div class="box c2" id="flip"></div>
  <div class="box c3" id="orbit"></div>
  <div class="box c4" id="fade"></div>
</div>`,
    code: `// asks for 270 degrees but takes the short way round (-90)
gsap.to("#spin", { rotation: "270_short", duration: 1, ease: "power2.inOut" });

// 3D: transformPerspective gives the element its own depth
gsap.to("#flip", { rotationY: 180, transformPerspective: 400, duration: 1.2, ease: "power2.inOut" });

// transformOrigin moves the pivot, here below the box
gsap.to("#orbit", { rotation: 360, transformOrigin: "50% 150%", duration: 2, ease: "none", repeat: -1 });

// autoAlpha: opacity plus visibility: hidden at 0, so it stops catching clicks
gsap.to("#fade", { autoAlpha: 0, duration: 0.8, repeat: 1, yoyo: true, repeatDelay: 0.4 });
`,
    notes: `<p>Use GSAP's transform shortcuts (<code>x</code>, <code>y</code>, <code>scale</code>, <code>rotation</code>, <code>rotationX/Y</code>, <code>skewX/Y</code>, <code>xPercent</code>) rather than a raw <code>transform</code> string. They're applied in a fixed order, they're fast, and you can animate each one on its own.</p>
<p>Rotation accepts direction suffixes: <code>_short</code>, <code>_cw</code> and <code>_ccw</code>.</p>`,
    tries: [
      'Change <code>"270_short"</code> to <code>"270_cw"</code>, then to <code>"-90_ccw"</code>.',
      'Set <code>transformOrigin: "left top"</code> on the orbiting box.',
      'Add <code>clearProps: "all"</code> to the flip and watch it snap back when it finishes.',
    ],
  },
  {
    id: 'values',
    skill: 'gsap-core',
    title: 'Function, relative and random values',
    docs: 'https://gsap.com/docs/v3/GSAP/gsap.to()#function-based-values',
    html: `<div class="bars">${times(10, () => '<div class="bar"></div>')}</div>`,
    code: `// a function runs once per target and gets (index, element, allTargets)
gsap.fromTo(".bar",
  { scaleY: 0.05 },
  {
    scaleY: (i, el, all) => (i + 1) / all.length,
    transformOrigin: "50% 100%",
    duration: 1,
    stagger: 0.05
  });

// relative values build on whatever is there when the tween starts
gsap.to(".bar", { y: "-=30", duration: 0.5, delay: 1.3, stagger: 0.03 });

// random() strings are rolled separately for each target
gsap.to(".bar", { backgroundColor: "random([#7cc4ff, #ffb36b, #8fe0b8, #ff8fb1])", duration: 0.4, delay: 2 });
`,
    notes: `<p>A value doesn't have to be a fixed number. A <strong>function</strong> gives each target its own value. A <strong>relative</strong> string (<code>"+=20"</code>, <code>"-=30"</code>, <code>"*=2"</code>) builds on the current value. A <strong>random</strong> string (<code>"random(-100, 100, 5)"</code>) rolls a fresh value for every target.</p>
<p>The <code>delay</code>s here are a stopgap. The timeline lessons show the better way to sequence.</p>`,
    tries: [
      'Make the heights a wave: <code>scaleY: i =&gt; 0.5 + 0.5 * Math.sin(i)</code>.',
      'Use <code>y: "random(-60, 0, 10)"</code> in place of <code>"-=30"</code>.',
      'Press Run a few times. Do the colours change on each run?',
    ],
  },
  {
    id: 'control',
    skill: 'gsap-core',
    title: 'Controlling a tween',
    docs: 'https://gsap.com/docs/v3/GSAP/Tween',
    html: `<div class="stack">
  <div class="track"><div class="box c5" id="box"></div></div>
  <div class="controls">
    <button id="play">play()</button><button id="pause">pause()</button>
    <button id="reverse">reverse()</button><button id="restart">restart()</button>
    <button id="half">progress(0.5)</button><button id="fast">timeScale 1 ↔ 3</button>
  </div>
  <output id="readout">progress 0.00</output>
</div>`,
    code: `// keep the returned Tween so you can drive it later
const tween = gsap.to("#box", {
  x: 240,
  rotation: 360,
  duration: 2,
  ease: "power1.inOut",
  paused: true,
  onUpdate: () => {
    document.querySelector("#readout").textContent = "progress " + tween.progress().toFixed(2);
  }
});

const on = (id, fn) => document.querySelector(id).addEventListener("click", fn);
on("#play", () => tween.play());
on("#pause", () => tween.pause());
on("#reverse", () => tween.reverse());
on("#restart", () => tween.restart());
on("#half", () => tween.progress(0.5).pause());
on("#fast", () => tween.timeScale(tween.timeScale() === 1 ? 3 : 1));
`,
    notes: `<p>Every tween method returns a <code>Tween</code>. Store it whenever you need to pause, reverse, seek or kill the animation later. Timelines have the same controls.</p>
<p>The tween starts with <code>paused: true</code>, so nothing happens until you press a button in the stage.</p>`,
    tries: [
      'Add <code>onComplete: () =&gt; console.log("done")</code> and watch the console.',
      'Add <code>yoyo: true, repeat: 1</code> and press restart.',
      'Add a button that calls <code>tween.kill()</code>. What do the other buttons do after that?',
    ],
  },
  {
    id: 'matchmedia',
    skill: 'gsap-core',
    title: 'Responsive and reduced motion',
    docs: 'https://gsap.com/docs/v3/GSAP/gsap.matchMedia()',
    html: `<div class="stack">
  <output id="mode"></output>
  <div class="row">${times(3, i => `<div class="box c${i + 1}"></div>`)}</div>
</div>`,
    code: `const mm = gsap.matchMedia();

mm.add({
  wide: "(min-width: 520px)",
  narrow: "(max-width: 519px)",
  reduceMotion: "(prefers-reduced-motion: reduce)"
}, (context) => {
  const { wide, reduceMotion } = context.conditions;
  document.querySelector("#mode").textContent =
    (wide ? "wide stage" : "narrow stage") + (reduceMotion ? ", reduced motion" : "");

  gsap.to(".box", {
    y: wide ? -60 : 0,
    rotation: wide ? 0 : 180,
    duration: reduceMotion ? 0 : 1,   // no movement for people who asked for less
    ease: "power2.inOut",
    stagger: 0.15,
    repeat: -1,
    yoyo: true
  });
  // when the conditions change, everything made in here is reverted automatically
});
`,
    notes: `<p><code>gsap.matchMedia()</code> runs setup code only while a media query matches. When the query stops matching, it reverts every animation made inside. Use it for breakpoints and for <code>prefers-reduced-motion</code>.</p>
<p>The queries test the stage's own width, so you can trigger a change by resizing the browser window.</p>`,
    tries: [
      'Resize the window until the stage crosses 520px and watch it switch.',
      'Turn on Reduce Motion (System Settings › Accessibility › Display), then press Run.',
      'Add a third condition such as <code>tall: "(min-height: 500px)"</code>.',
    ],
  },

  /* ---------------- gsap-timeline ---------------- */
  {
    id: 'position',
    skill: 'gsap-timeline',
    title: 'The position parameter',
    docs: 'https://gsap.com/resources/position-parameter',
    html: `<div class="lanes">
  ${['a', 'b', 'c', 'd'].map((id, i) => lane(id, `<div class="box c${i + 1}" id="${id}"></div>`)).join('\n  ')}
</div>`,
    code: `const tl = gsap.timeline({ defaults: { duration: 1, ease: "power2.inOut" } });

tl.to("#a", { x: 200 })            // starts at 0
  .to("#b", { x: 200 })            // ">"  starts when the previous one ends (the default)
  .to("#c", { x: 200 }, "<")       // "<"  starts when the previous one starts
  .to("#d", { x: 200 }, "-=0.5");  // starts 0.5s before the timeline's end
`,
    notes: `<p>A timeline is a container for tweens with its own playhead. By default, each new tween goes on the end. The optional third argument, the <strong>position parameter</strong>, places it anywhere else.</p>
<p><code>1</code> means at 1s. <code>"+=0.5"</code> or <code>"-=0.5"</code> means relative to the timeline's end. <code>"&lt;"</code> and <code>"&gt;"</code> mean the start or end of the previous tween. <code>"&lt;0.2"</code> means 0.2s after the previous tween starts.</p>`,
    tries: [
      'Change <code>"&lt;"</code> to <code>"&lt;0.25"</code> and watch the bar slide.',
      'Put <code>#d</code> at absolute time <code>0</code>.',
      'Add <code>repeat: -1, yoyo: true</code> to the timeline (next to <code>defaults</code>).',
    ],
  },
  {
    id: 'labels',
    skill: 'gsap-timeline',
    title: 'Labels and defaults',
    docs: 'https://gsap.com/docs/v3/GSAP/Timeline/addLabel()',
    html: `<div class="stack">
  <div class="row">${times(4, i => `<div class="card c${i + 1}"></div>`)}</div>
  <div class="controls">
    <button data-label="deal">play("deal")</button>
    <button data-label="fan">play("fan")</button>
    <button data-label="collect">play("collect")</button>
  </div>
</div>`,
    code: `const tl = gsap.timeline({ defaults: { duration: 0.6, ease: "back.out(1.6)" } });

tl.addLabel("deal")
  .from(".card", { y: 80, autoAlpha: 0, stagger: 0.1 })
  .addLabel("fan", "+=0.3")
  .to(".card", {
    x: (i) => (1.5 - i) * 60,
    rotation: (i) => (i - 1.5) * 12,
    ease: "power3.inOut"
  }, "fan")
  .addLabel("collect", "+=0.6")
  .to(".card", { y: -120, autoAlpha: 0, stagger: { each: 0.08, from: "end" }, ease: "power2.in" }, "collect");

document.querySelectorAll("[data-label]").forEach((btn) => {
  btn.addEventListener("click", () => tl.play(btn.dataset.label));
});
`,
    notes: `<p>A label names a point in time, so you place tweens with <code>"fan"</code> or <code>"fan+=0.2"</code> rather than counting seconds. Labels also act as jump points: <code>tl.play("fan")</code>, <code>tl.seek("collect")</code>, or <code>tl.tweenFromTo("deal", "fan")</code>.</p>
<p><code>defaults</code> on the timeline are inherited by every child tween, so the shared duration and ease are written once. The labels appear as ticks on the timeline ruler.</p>`,
    tries: [
      'Change a button to call <code>tl.tweenFromTo("fan", "collect")</code>.',
      'Move the fan earlier with <code>.addLabel("fan", "-=0.2")</code>.',
      'Override the default ease on just one tween.',
    ],
  },
  {
    id: 'nesting',
    skill: 'gsap-timeline',
    title: 'Nesting timelines',
    docs: 'https://gsap.com/resources/getting-started/timelines',
    html: `<div class="stack stack--left">
  <h2 id="title">Nested timelines</h2>
  <div id="rule"></div>
  <div class="row row--tight">${times(6, i => `<div class="dot c${(i % 5) + 1}"></div>`)}</div>
</div>`,
    code: `// each function builds and returns one self-contained piece
function intro() {
  return gsap.timeline({ id: "intro" })
    .from("#title", { y: 30, autoAlpha: 0, duration: 0.6 })
    .from("#rule", { scaleX: 0, transformOrigin: "left center", duration: 0.5 }, "-=0.2");
}

function dots() {
  return gsap.timeline({ id: "dots" })
    .from(".dot", { scale: 0, stagger: 0.08, duration: 0.4, ease: "back.out(3)" })
    .to(".dot", { y: -24, stagger: 0.08, duration: 0.3, yoyo: true, repeat: 1 }, "<0.3");
}

// the master timeline arranges the pieces
const master = gsap.timeline();
master.add(intro())
      .add(dots(), "-=0.3")
      .to("#title", { color: "#ffb36b", duration: 0.4 });
`,
    notes: `<p>Timelines can hold other timelines. Write each part of a sequence as a function that returns its own timeline, then arrange the parts in a master. The parts stay easy to read and easy to rearrange.</p>
<p>Speed up, reverse or seek the master and every child follows. The timeline below shows each nested timeline as a group.</p>`,
    tries: [
      'Add <code>master.timeScale(0.5)</code> at the end.',
      'Swap the order so the dots come first.',
      'Start both at once with <code>master.add(dots(), 0)</code>.',
    ],
  },

  /* ---------------- gsap-scrolltrigger ---------------- */
  {
    id: 'toggle',
    skill: 'gsap-scrolltrigger',
    title: 'Triggers and toggleActions',
    docs: 'https://gsap.com/docs/v3/Plugins/ScrollTrigger/',
    scroll: true,
    html: `<div class="spacer">Scroll down inside the stage</div>
<div class="center"><div class="box c1" id="box"></div></div>
<div class="spacer"></div>`,
    code: `gsap.registerPlugin(ScrollTrigger);

gsap.to("#box", {
  x: 200,
  rotation: 360,
  duration: 1,
  scrollTrigger: {
    trigger: "#box",
    start: "top 75%",   // when the box's top reaches 75% down the viewport
    end: "top 25%",
    // what to do on: enter, leave, enter going back, leave going back
    toggleActions: "play reverse play reverse",
    markers: true       // development only
  }
});
`,
    notes: `<p>ScrollTrigger is a plugin, so register it once first. A <code>scrollTrigger</code> object on a tween ties it to the scroll position.</p>
<p><code>start</code> and <code>end</code> read as "trigger position, viewport position". <code>toggleActions</code> lists four actions, one each for enter, leave, enter back and leave back: <code>play</code>, <code>pause</code>, <code>resume</code>, <code>reverse</code>, <code>restart</code>, <code>reset</code>, <code>complete</code> or <code>none</code>.</p>`,
    tries: [
      'Try <code>toggleActions: "restart none none reset"</code>.',
      'Change <code>start</code> to <code>"center center"</code> and watch the marker move.',
      'Add <code>onEnter: () =&gt; console.log("entered")</code>.',
    ],
  },
  {
    id: 'scrub',
    skill: 'gsap-scrolltrigger',
    title: 'Scrub and pin',
    docs: 'https://gsap.com/docs/v3/Plugins/ScrollTrigger/',
    scroll: true,
    html: `<div class="spacer">Scroll down inside the stage</div>
<section class="panel" id="panel">
  <div class="lanes">
    ${['a', 'b', 'c'].map((id, i) => lane(id, `<div class="box c${i + 2}" id="${id}"></div>`)).join('\n    ')}
  </div>
</section>
<div class="spacer">Pin released</div>`,
    code: `gsap.registerPlugin(ScrollTrigger);

// put the ScrollTrigger on the timeline, never on the tweens inside it
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: "#panel",
    start: "top top",
    end: "+=800",    // stays pinned for 800px of scrolling
    pin: true,
    scrub: 1,        // the playhead takes 1s to catch up with the scrollbar
    markers: true
  }
});

tl.to("#a", { x: 200, rotation: 90 })
  .to("#b", { x: 200, rotation: 90 })
  .to("#c", { x: 200, rotation: 90 });
`,
    notes: `<p><code>scrub</code> links the timeline's progress to the scrollbar. <code>true</code> follows it exactly, and a number adds smoothing in seconds. <code>pin</code> holds the trigger element in place while the range is active.</p>
<p>Pick either <code>scrub</code> or <code>toggleActions</code> for a trigger, not both. Animate the children of a pinned element, not the element itself.</p>`,
    tries: [
      'Compare <code>scrub: true</code> with <code>scrub: 3</code>.',
      'Lengthen the pin with <code>end: "+=2000"</code>.',
      'Add <code>snap: 1 / 3</code> to the scrollTrigger.',
    ],
  },
  {
    id: 'batch',
    skill: 'gsap-scrolltrigger',
    title: 'Batch reveals',
    docs: 'https://gsap.com/docs/v3/Plugins/ScrollTrigger/static.batch/',
    scroll: true,
    html: `<div class="spacer spacer--short">Scroll down inside the stage</div>
<div class="tiles">${times(28, i => `<div class="tile c${(i % 5) + 1}"></div>`)}</div>
<div class="spacer spacer--short"></div>`,
    code: `gsap.registerPlugin(ScrollTrigger);

gsap.set(".tile", { autoAlpha: 0, y: 40 });

// one trigger per tile, but tiles that arrive together animate together
ScrollTrigger.batch(".tile", {
  start: "top 90%",
  onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, stagger: 0.1, overwrite: true }),
  onLeaveBack: (batch) => gsap.to(batch, { autoAlpha: 0, y: 40, overwrite: true })
});
`,
    notes: `<p><code>ScrollTrigger.batch()</code> makes a trigger for each element and groups callbacks that fire at about the same time. The tiles in one row can then stagger in together. It does the job of an IntersectionObserver with less code.</p>
<p>Batch callbacks receive an array of elements, unlike normal callbacks, which receive the ScrollTrigger.</p>`,
    tries: [
      'Add <code>batchMax: 2</code> and scroll quickly.',
      'Add <code>interval: 0.3</code> to collect bigger batches.',
      'Give the entrance a little spin: <code>rotation: 0</code> with a starting <code>rotation: -15</code>.',
    ],
  },
  {
    id: 'horizontal',
    skill: 'gsap-scrolltrigger',
    title: 'Horizontal scroll',
    docs: 'https://gsap.com/docs/v3/Plugins/ScrollTrigger/#containerAnimation',
    scroll: true,
    html: `<div class="spacer spacer--short">Scroll down inside the stage</div>
<section class="hwrap" id="wrap">
  <div class="htrack" id="track">
    ${times(5, i => `<div class="hpanel" id="panel${i + 1}"><span>${i + 1}</span>${i === 2 ? '<div class="box c4 badge"></div>' : ''}</div>`)}
  </div>
</section>
<div class="spacer spacer--short">Done</div>`,
    code: `gsap.registerPlugin(ScrollTrigger);

const track = document.querySelector("#track");
const distance = () => track.scrollWidth - window.innerWidth;

// vertical scrolling drives a horizontal tween
const scrollTween = gsap.to(track, {
  x: () => -distance(),
  ease: "none",            // required, so scroll position and x stay in step
  scrollTrigger: {
    trigger: "#wrap",
    pin: true,             // pin the wrapper, move the track inside it
    scrub: true,
    start: "top top",
    end: () => "+=" + distance(),
    invalidateOnRefresh: true
  }
});

// this trigger watches the horizontal movement, not the page scroll
gsap.from("#panel3 .badge", {
  scale: 0,
  rotation: -90,
  ease: "back.out(2)",
  scrollTrigger: {
    containerAnimation: scrollTween,
    trigger: "#panel3",
    start: "left center",
    toggleActions: "play none none reverse",
    markers: true
  }
});
`,
    notes: `<p>To fake a horizontal scroll, pin a wrapper and scrub a tween that moves the track inside it to the left. That tween must use <code>ease: "none"</code>, otherwise the scroll position and the track position drift apart.</p>
<p>Triggers for things inside the track pass the tween as <code>containerAnimation</code>, so their <code>start</code> and <code>end</code> are measured horizontally.</p>`,
    tries: [
      'Change the scroll tween to <code>ease: "power2.inOut"</code> and feel what breaks.',
      'Add <code>snap: 1 / 4</code> to the first scrollTrigger.',
      'Give panel 5 its own containerAnimation trigger.',
    ],
  },

  /* ---------------- gsap-plugins ---------------- */
  {
    id: 'flip',
    skill: 'gsap-plugins',
    title: 'Flip',
    docs: 'https://gsap.com/docs/v3/Plugins/Flip/',
    html: `<div class="stack">
  <div class="flipgrid" id="grid">${times(6, i => `<div class="tile c${(i % 5) + 1}">${i + 1}</div>`)}</div>
  <div class="controls"><button id="shuffle">Shuffle</button><button id="layout">Grid ↔ list</button></div>
</div>`,
    code: `gsap.registerPlugin(Flip);

const grid = document.querySelector("#grid");

function flip(change) {
  const state = Flip.getState(".tile");  // First: record where everything is
  change();                               // Last: change the DOM however you like
  Flip.from(state, {                      // Invert + Play: animate from old to new
    duration: 0.7,
    ease: "power2.inOut",
    stagger: 0.03,
    absolute: true
  });
}

document.querySelector("#shuffle").addEventListener("click", () => flip(() => {
  gsap.utils.shuffle([...grid.children]).forEach((el) => grid.appendChild(el));
}));

document.querySelector("#layout").addEventListener("click", () => flip(() => {
  grid.classList.toggle("is-list");
}));
`,
    notes: `<p>Flip animates between two layouts that CSS can't tween: a reordered list, a class change, an element moved to a new parent. Record the state, change the DOM, then call <code>Flip.from()</code>.</p>
<p>The animation only runs when you press a button, so the timeline below stays empty.</p>`,
    tries: [
      'Add <code>scale: true</code> and toggle the layout.',
      'Add <code>onComplete: () =&gt; console.log("flipped")</code>.',
      'Try <code>ease: "elastic.out(1, 0.6)"</code> with a longer duration.',
    ],
  },
  {
    id: 'draggable',
    skill: 'gsap-plugins',
    title: 'Draggable and Inertia',
    docs: 'https://gsap.com/docs/v3/Plugins/Draggable/',
    html: `<div class="table" id="table">
  <div class="puck c2" id="puck"></div>
  <div class="knob" id="knob"><i></i></div>
  <output id="deg">0°</output>
</div>`,
    code: `gsap.registerPlugin(Draggable, InertiaPlugin);

// throw the puck around inside the table
Draggable.create("#puck", {
  type: "x,y",
  bounds: "#table",
  inertia: true,          // keep gliding after you let go
  edgeResistance: 0.7,
  onPress() { gsap.to(this.target, { scale: 1.15, duration: 0.2 }); },
  onRelease() { gsap.to(this.target, { scale: 1, duration: 0.3 }); }
});

// spin the knob; it lands on the nearest 45 degrees
const deg = document.querySelector("#deg");
Draggable.create("#knob", {
  type: "rotation",
  inertia: true,
  snap: (end) => gsap.utils.snap(45, end),
  onDrag() { deg.textContent = Math.round(this.rotation) + "°"; },
  onThrowUpdate() { deg.textContent = Math.round(this.rotation) + "°"; }
});
`,
    notes: `<p>Draggable makes any element draggable, spinnable or throwable with mouse or touch. Add <code>InertiaPlugin</code> and <code>inertia: true</code>, and the element keeps its momentum after release.</p>
<p>Callbacks such as <code>onDrag</code> run with <code>this</code> set to the Draggable, so <code>this.x</code>, <code>this.rotation</code> and <code>this.target</code> are all available.</p>`,
    tries: [
      'Limit the puck to one axis with <code>type: "x"</code>.',
      'Snap the puck to a grid: <code>snap: { x: v =&gt; gsap.utils.snap(40, v), y: v =&gt; gsap.utils.snap(40, v) }</code>.',
      'Set <code>edgeResistance: 0</code>, then <code>1</code>.',
    ],
  },
  {
    id: 'splittext',
    skill: 'gsap-plugins',
    title: 'SplitText',
    docs: 'https://gsap.com/docs/v3/Plugins/SplitText/',
    html: `<h1 class="headline" id="head">Every letter can move on its own.</h1>`,
    code: `gsap.registerPlugin(SplitText);

const split = SplitText.create("#head", { type: "words, chars" });

gsap.from(split.chars, {
  y: 40,
  autoAlpha: 0,
  rotation: () => gsap.utils.random(-40, 40),
  duration: 0.6,
  ease: "back.out(2)",
  stagger: 0.03
});
`,
    notes: `<p>SplitText wraps each character, word or line in its own element, and you animate the resulting arrays (<code>split.chars</code>, <code>split.words</code>, <code>split.lines</code>). Call <code>split.revert()</code> to put the original text back.</p>
<p>Every GSAP plugin is free now, including the ones that used to be Club-only, like SplitText and MorphSVG.</p>`,
    tries: [
      'Animate <code>split.words</code> in place of <code>split.chars</code>.',
      'Use <code>type: "lines", mask: "lines"</code> and animate <code>split.lines</code> up from <code>yPercent: 100</code>.',
      'Use <code>stagger: { each: 0.03, from: "random" }</code>.',
    ],
  },
  {
    id: 'drawsvg',
    skill: 'gsap-plugins',
    title: 'DrawSVG',
    docs: 'https://gsap.com/docs/v3/Plugins/DrawSVGPlugin/',
    html: `<svg class="art" viewBox="0 0 360 240" aria-hidden="true">
  <path id="squiggle" d="M20 130 C 60 20, 100 20, 120 100 S 180 190, 220 100 S 300 20, 340 120" />
  <circle id="ring" cx="180" cy="196" r="26" />
</svg>`,
    code: `gsap.registerPlugin(DrawSVGPlugin);

const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });

tl.from("#squiggle", { drawSVG: 0, duration: 2 })                        // draw it on
  .fromTo("#ring", { drawSVG: "50% 50%" }, { drawSVG: "0% 100%", duration: 1 }, "<0.6")
  .to("#squiggle", { drawSVG: "45% 55%", duration: 1 })                  // shrink to a middle slice
  .to("#squiggle", { drawSVG: "100% 100%", duration: 0.8 });             // run off the end
`,
    notes: `<p>DrawSVG animates how much of an SVG stroke is visible. The value is the visible segment, from a start point to an end point: <code>"0% 100%"</code> shows the whole stroke, <code>"20% 80%"</code> just the middle, and <code>0</code> nothing.</p>
<p>A tween moves from the current segment to the one you give it, so you can slide a short segment along a path too.</p>`,
    tries: [
      'Slide a short dash along the path: <code>fromTo(..., { drawSVG: "0% 10%" }, { drawSVG: "90% 100%" })</code>.',
      'Draw the ring clockwise from the top with <code>"0% 0%"</code> as the start.',
      'Add <code>repeat: -1, yoyo: true</code> to the timeline.',
    ],
  },
  {
    id: 'morphsvg',
    skill: 'gsap-plugins',
    title: 'MorphSVG',
    docs: 'https://gsap.com/docs/v3/Plugins/MorphSVGPlugin/',
    html: `<svg class="art art--square" viewBox="0 0 240 240" aria-hidden="true">
  <path id="shape" class="fill" d="M60 60 H180 V180 H60 Z" />
  <g class="hidden">
    <path id="square" d="M60 60 H180 V180 H60 Z" />
    <path id="star" d="${star}" />
    <path id="heart" d="M120 196 C 36 134, 40 58, 88 58 C 108 58, 120 74, 120 88 C 120 74, 132 58, 152 58 C 200 58, 204 134, 120 196 Z" />
    <path id="circle" d="M120 50 A70 70 0 1 1 119.9 50 Z" />
  </g>
</svg>`,
    code: `gsap.registerPlugin(MorphSVGPlugin);

const tl = gsap.timeline({ repeat: -1, defaults: { duration: 0.9, ease: "power2.inOut" } });

tl.to("#shape", { morphSVG: "#star" }, "+=0.4")
  .to("#shape", { morphSVG: "#heart", fill: "#ff8fb1" }, "+=0.4")
  .to("#shape", { morphSVG: "#circle", fill: "#8fe0b8" }, "+=0.4")
  .to("#shape", { morphSVG: "#square", fill: "#7cc4ff" }, "+=0.4");
`,
    notes: `<p>MorphSVG turns one SVG path into another, even when the two have different numbers of points. The target can be another path's selector, raw path data, or a <code>&lt;circle&gt;</code> or <code>&lt;rect&gt;</code> converted with <code>MorphSVGPlugin.convertToPath()</code>.</p>
<p>The hidden shapes in the stage HTML are only there as targets.</p>`,
    tries: [
      'Add <code>type: "rotational"</code>: <code>morphSVG: { shape: "#heart", type: "rotational" }</code>.',
      'Try <code>shapeIndex: 3</code> on the star to change how points pair up.',
      'Pass raw path data such as <code>"M60 180 L120 60 L180 180 Z"</code> (a triangle).',
    ],
  },
  {
    id: 'motionpath',
    skill: 'gsap-plugins',
    title: 'MotionPath',
    docs: 'https://gsap.com/docs/v3/Plugins/MotionPathPlugin/',
    html: `<svg class="art" viewBox="0 0 360 240" aria-hidden="true">
  <path id="track" d="M60,120 C60,40 180,40 180,120 S300,200 300,120 S180,40 180,120 S60,200 60,120 Z" />
  <path id="ship" class="ship" d="M-12,-7 L14,0 L-12,7 L-6,0 Z" />
</svg>`,
    code: `gsap.registerPlugin(MotionPathPlugin);

gsap.to("#ship", {
  duration: 4,
  repeat: -1,
  ease: "none",
  motionPath: {
    path: "#track",
    align: "#track",          // sit on the path's coordinates
    alignOrigin: [0.5, 0.5],  // centre the ship on the line
    autoRotate: true          // face the direction of travel
  }
});
`,
    notes: `<p>MotionPath moves an element along a path, which can be an SVG path, an array of points, or path data. <code>autoRotate</code> turns the element to face along the curve.</p>
<p>Ease shapes the speed along the path. <code>"none"</code> keeps the speed constant, which suits an endless loop.</p>`,
    tries: [
      'Ride only half the loop: add <code>start: 0.25, end: 0.75</code> inside motionPath.',
      'Use <code>ease: "power2.inOut"</code> with <code>yoyo: true</code>.',
      'Give it points: <code>path: [{x: 0, y: 0}, {x: 100, y: -60}, {x: 200, y: 0}]</code> and remove <code>align</code>.',
    ],
  },
  {
    id: 'customease',
    skill: 'gsap-plugins',
    title: 'CustomEase',
    docs: 'https://gsap.com/docs/v3/Eases/CustomEase/',
    html: `<div class="lanes">
  ${lane('power2.out', '<div class="dot c1" id="a"></div>')}
  ${lane('snappy', '<div class="dot c2" id="b"></div>')}
  ${lane('hop', '<div class="dot c3" id="c"></div>')}
</div>`,
    code: `gsap.registerPlugin(CustomEase);

// a cubic-bezier, like CSS cubic-bezier()
CustomEase.create("snappy", ".2, .9, .1, 1");

// any curve, as normalised SVG path data: this one goes up and back down twice
CustomEase.create("hop", "M0,0 C0,0 0.056,0.442 0.175,0.442 0.294,0.442 0.332,0 0.332,0 0.332,0 0.414,1 0.671,1 0.991,1 1,0 1,0");

gsap.to("#a", { x: 220, duration: 1.5, ease: "power2.out" });
gsap.to("#b", { x: 220, duration: 1.5, ease: "snappy" });
gsap.to("#c", { y: -50, duration: 1.5, ease: "hop" });
`,
    notes: `<p>When no built-in ease fits, <code>CustomEase</code> takes any curve. Register it under a name and use that name like any other ease.</p>
<p>The curve doesn't have to end at 1. The "hop" ease returns to 0, so the dot comes back where it started. Compare the curve drawn in each bar below.</p>`,
    tries: [
      'Paste a curve from the <a href="https://gsap.com/docs/v3/Eases/CustomEase/" target="_blank" rel="noopener">ease visualizer</a>.',
      'Make "snappy" overshoot: <code>".2, 1.4, .3, 1"</code>.',
      'Use the hop ease on <code>scale: 1.8</code>.',
    ],
  },

  /* ---------------- gsap-utils ---------------- */
  {
    id: 'mapping',
    skill: 'gsap-utils',
    title: 'mapRange, snap, wrap and friends',
    docs: 'https://gsap.com/docs/v3/GSAP/UtilityMethods/',
    html: `<div class="pad" id="pad">
  <div class="cursor" id="dot"></div>
  <output class="readout" id="out">Move the pointer over the stage</output>
</div>`,
    code: `// a util called with every argument gives an answer...
console.log(gsap.utils.clamp(0, 100, 150));   // 100
console.log(gsap.utils.wrap(0, 360, 370));    // 10
console.log(gsap.utils.snap(25, 61));         // 50

// ...leave the value off and it gives back a reusable function
const pad = document.querySelector("#pad");
const toHue = gsap.utils.mapRange(0, pad.clientWidth, 0, 360);
const toScale = gsap.utils.pipe(
  gsap.utils.normalize(0, pad.clientHeight),  // y as 0..1
  gsap.utils.interpolate(2, 0.5)              // 0..1 as 2..0.5
);
const toGrid = gsap.utils.snap(40);
const spin = gsap.utils.wrap(0, 360);

let angle = 0;
pad.addEventListener("pointermove", (e) => {
  const box = pad.getBoundingClientRect();
  const x = e.clientX - box.left, y = e.clientY - box.top;
  angle = spin(angle + e.movementX);

  gsap.set("#dot", {
    x: toGrid(x), y: toGrid(y),
    scale: toScale(y),
    rotation: angle,
    backgroundColor: "hsl(" + toHue(x) + ", 80%, 70%)"
  });
  document.querySelector("#out").textContent =
    "hue " + Math.round(toHue(x)) + "  scale " + toScale(y).toFixed(2) + "  angle " + Math.round(angle);
});
`,
    notes: `<p><code>gsap.utils</code> is a set of small maths and array helpers that need no registration. Most of them return a function when you leave off the final value, which suits pointer handlers that do the same mapping on every event.</p>
<p>The <code>console.log</code> lines print in the console under the stage.</p>`,
    tries: [
      'Use <code>gsap.utils.snap([0, 80, 200], ...)</code> to snap to set positions.',
      'Clamp the scale between 0.8 and 1.5 by adding <code>gsap.utils.clamp(0.8, 1.5)</code> to the pipe.',
      'Log <code>gsap.utils.random(0, 100, 5)</code> and <code>gsap.utils.splitColor("#ffb36b")</code>.',
    ],
  },
  {
    id: 'distribute',
    skill: 'gsap-utils',
    title: 'distribute',
    docs: 'https://gsap.com/docs/v3/GSAP/UtilityMethods/distribute()',
    html: `<div class="grid grid--dots" style="--cols: 9">${times(81, () => '<div class="cell"></div>')}</div>`,
    code: `gsap.to(".cell", {
  // a value for each cell based on its distance from the centre
  scale: gsap.utils.distribute({
    base: 0.2,
    amount: 1.2,
    grid: [9, 9],
    from: "center",
    ease: "power2.in"
  }),
  duration: 1,
  ease: "power2.inOut",
  repeat: -1,
  yoyo: true,
  stagger: { each: 0.04, grid: [9, 9], from: "center" }
});
`,
    notes: `<p><code>distribute()</code> returns a function that gives each target a value based on its place in the group, either its index or its position in a grid. Stagger works the same way under the hood. Use <code>distribute()</code> for any property you want spread across a group, not only timing.</p>`,
    tries: [
      'Distribute <code>rotation</code> with <code>amount: 180</code>.',
      'Change both <code>from</code> values to <code>"edges"</code> or <code>[0, 0]</code>.',
      'Add <code>axis: "y"</code> to the distribute config.',
    ],
  },

  /* ---------------- gsap-performance ---------------- */
  {
    id: 'quickto',
    skill: 'gsap-performance',
    title: 'quickTo for pointer followers',
    docs: 'https://gsap.com/docs/v3/GSAP/gsap.quickTo()',
    html: `<div class="pad" id="pad">
  <div class="cursor c1" id="quick"></div>
  <div class="cursor cursor--ring c2" id="naive"></div>
  <output class="readout" id="count">Move the pointer over the stage</output>
</div>`,
    code: `// quickTo: one reusable tween per property; each call just retargets it
const xTo = gsap.quickTo("#quick", "x", { duration: 0.5, ease: "power3" });
const yTo = gsap.quickTo("#quick", "y", { duration: 0.5, ease: "power3" });

let made = 0;
document.querySelector("#pad").addEventListener("pointermove", (e) => {
  xTo(e.clientX);
  yTo(e.clientY);

  // the naive way: a brand-new tween on every single pointermove
  gsap.to("#naive", { x: e.clientX, y: e.clientY, duration: 0.8, ease: "power3", overwrite: "auto" });
  made++;

  document.querySelector("#count").textContent =
    "tweens created  quickTo: 2   naive: " + made;
});
`,
    notes: `<p>Animate transforms and opacity. They're handled by the compositor, while <code>width</code>, <code>top</code> and <code>left</code> force layout on every frame. Add <code>will-change: transform</code> only to elements that actually animate.</p>
<p>For values that change constantly, such as a cursor follower, <code>gsap.quickTo()</code> reuses a single tween and doesn't allocate a new one on every event.</p>`,
    tries: [
      'Change the quickTo <code>duration</code> to 0.1, then to 1.5.',
      'Remove <code>overwrite: "auto"</code> from the naive tween. What happens to the ring?',
      'Animate <code>left</code>/<code>top</code> in place of <code>x</code>/<code>y</code> and compare in DevTools › Performance.',
    ],
  },

  /* ---------------- gsap-frameworks ---------------- */
  {
    id: 'context',
    skill: 'gsap-frameworks',
    title: 'Scoping and cleanup with gsap.context()',
    docs: 'https://gsap.com/docs/v3/GSAP/gsap.context()',
    html: `<div class="stack">
  <div class="widget" id="widget">
    <span>#widget</span>
    <div class="row">${times(3, i => `<div class="box c${i + 1}"></div>`)}</div>
  </div>
  <div class="row"><div class="box c5"></div><small>outside the widget</small></div>
  <div class="controls"><button id="mount">mount</button><button id="unmount">unmount (revert)</button></div>
</div>`,
    code: `const widget = document.querySelector("#widget");
let ctx;

// in a component this is your mount/onMounted/onMount hook
function mount() {
  ctx = gsap.context(() => {
    // selectors in here only match inside #widget
    gsap.from(".box", { scale: 0, stagger: 0.1, ease: "back.out(2)" });
    gsap.to(".box", { rotation: 360, duration: 2, ease: "none", repeat: -1 });
  }, widget);
}

document.querySelector("#mount").addEventListener("click", () => { ctx?.revert(); mount(); });
// in a component this is your unmount/onUnmounted/onDestroy hook
document.querySelector("#unmount").addEventListener("click", () => ctx?.revert());

mount();
`,
    notes: `<p>In a component framework, animations have to be cleaned up when the component unmounts. <code>gsap.context()</code> records every tween and ScrollTrigger created inside it. <code>ctx.revert()</code> then kills them all and restores the original inline styles.</p>
<p>The second argument scopes selectors, so <code>".box"</code> leaves the box outside the widget alone. In React, the <code>useGSAP()</code> hook (gsap-react skill) does exactly this for you.</p>`,
    tries: [
      'Remove the <code>widget</code> argument and press mount.',
      'Add <code>ctx.add(() =&gt; ...)</code> in a click handler, so later tweens are cleaned up too.',
      'Log <code>ctx.data.length</code> after mounting.',
    ],
  },
];
