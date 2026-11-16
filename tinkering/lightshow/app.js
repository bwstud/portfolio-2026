/* Light desk: a playground for designing concert light shows.
   app.js wires the pieces together: the renderer and its glow, the venue, rig and crowd,
   the music, the camera director, the programmer, the timeline, history and versions. */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VENUES, GROUPS, PRESETS, PALETTES, EASES, fullLook } from './data.js';
import { Engine, demoCues, autoCues, cueFrom, cueId, beatAt, timeAt, compile } from './show.js';
import { buildRig, makeScreenMaterial } from './rig.js';
import { buildVenue, buildCrowd } from './venues.js';
import { defaultPlot } from './plot.js';
import { rigEditor, GROUP_HUES } from './rigedit.js';
import * as A from './audio.js';

const gsap = window.gsap;
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fract = x => x - Math.floor(x);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('lightdesk:' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('lightdesk:' + k, JSON.stringify(v)); return true; } catch { return false; } },
};
const easeCache = {};
const ease = name => easeCache[name] || (easeCache[name] = gsap ? gsap.parseEase(name) : (k => k));

/* ---------- state ---------- */
const S = {
  venue: 'redrocks', shot: 'auto', follow: true, sel: 0, master: 1, volume: 0.8, bloom: 1,
  quality: coarse || innerWidth < 760 ? 'balanced' : 'high', srcTab: 'demo', source: { kind: 'demo' },
  started: false, keepColours: true,
};
// rig: the rig plot, or null for the venue's own rig
let prog = { bpm: A.DEMO.bpm, offset: 0.05, cues: demoCues(), rig: null };

/* ---------- renderer and glow ---------- */
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 7000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enabled = false;
const hemi = new THREE.HemisphereLight(0xffe6c8, 0x101014, 0.05);
scene.add(hemi);

let composer, bloom, grade;
function buildComposer() {
  const hi = S.quality === 'high';
  renderer.setPixelRatio(Math.min(devicePixelRatio, hi ? 2 : 1.25));
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: hi ? 4 : 0 }));
  composer.addPass(new RenderPass(scene, camera));
  // guard the glow: a stray NaN or a blown-out pixel would bloom into a square blotch
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (!(c.r == c.r && c.g == c.g && c.b == c.b) || any(isinf(c.rgb))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 12.0), 1.0); }',
  }));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.6 * S.bloom, 0.5, 1.05);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFlash: { value: 0 }, uAb: { value: 0.0025 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float uTime, uFlash, uAb; varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
      void main() {
        vec2 d = vUv - 0.5; float r = length(d);
        vec3 c = vec3(texture2D(tDiffuse, vUv - d * uAb * r * 2.0).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + d * uAb * r * 2.0).b);
        c *= 1.0 - 0.38 * smoothstep(0.35, 0.95, r * 1.25);
        c += (h(floor(gl_FragCoord.xy)) - 0.5) * 0.022;
        c += vec3(uFlash);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  composer.addPass(grade);
  resize();
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer?.setSize(w, h);
  bloom?.setSize(w / (S.quality === 'high' ? 1 : 2), h / (S.quality === 'high' ? 1 : 2));
  camera.aspect = w / h;
  camera.fov = w < 760 ? 55 : 42;
  frameAround();
  camera.updateProjectionMatrix();
  renderTimeline();
}
addEventListener('resize', resize);
// with the plan open, centre the picture in the space between the plan and the programmer
function frameAround() {
  const w = innerWidth, h = innerHeight, plan = $('plan'), side = $('side');
  if (S.rigMode && w >= 760 && plan && side) {
    const l = plan.getBoundingClientRect().right, r = side.getBoundingClientRect().left;
    camera.setViewOffset(w, h, -((l + r) / 2 - w / 2), 0, w, h);
  } else camera.clearViewOffset();
}

/* ---------- the room ---------- */
const screen = makeScreenMaterial();
let world = null, engine = null;
function dispose(obj) {
  obj.traverse(o => {
    o.geometry?.dispose();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) { if (m === screen.mat) continue; for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); }
  });
}
function loadVenue(id) {
  if (world) { scene.remove(world.group); dispose(world.group); }
  S.venue = id;
  const def = VENUES[id];
  const venue = buildVenue(id, def, { screenMat: screen.mat, screenU: screen.u });
  const rig = buildRig(venue, def, screen.mat, prog.rig);
  const budget = S.quality === 'high' ? 7000 : 2600;
  const crowd = buildCrowd(venue.spots, budget, -def.stage.d * 0.4);
  const group = new THREE.Group();
  group.add(venue.group, rig.group, crowd.group);
  scene.add(group);
  scene.fog = new THREE.FogExp2(venue.fog[0], venue.fog[1]);
  scene.background = new THREE.Color(venue.fog[0]);
  hemi.groundColor.set(venue.outdoor ? 0x0a0c14 : 0x08080a);
  world = { id, def, venue, rig, crowd, group };
  if (engine) engine.setRig(rigInfo()); else engine = new Engine(rigInfo());
  syncVenueUI();
  rigEd?.reframe();
  cutTo(S.rigMode ? 'rig' : S.shot === 'auto' || S.shot === 'free' ? 'foh' : S.shot, true);
  saveSession();
}
const rigInfo = () => { const r = world.rig; return { beams: r.beams, washes: r.washes, lasers: r.lasers, strobes: r.strobes, pixels: r.pixels, venue: { stage: world.def.stage, crowd: world.venue.crowd } }; };
// hang the rig again from the plot, leaving the room and the crowd as they are
function rebuildRig() {
  if (!world) return;
  const rig = buildRig(world.venue, world.def, screen.mat, prog.rig);
  world.group.add(rig.group);
  world.group.remove(world.rig.group); dispose(world.rig.group);
  world.rig = rig;
  engine.setRig(rigInfo());
}
// while dragging, rebuild at most every few frames
let previewT = 0;
function previewRig(plot) {
  prog.rig = plot;
  if (!previewT) previewT = setTimeout(() => { previewT = 0; rebuildRig(); }, 50);
}
// the venue's own rig, made once per venue so its ids stay put between reads
const housePlots = {};
const plotNow = () => prog.rig || housePlots[S.venue] || (housePlots[S.venue] = defaultPlot(VENUES[S.venue]));

/* ---------- music ---------- */
let transport = null, bands = null, mic = null, micBands = null, analysis = null, demoBuffer = null, demoProgress = 0, wired = false;
const demoReady = A.renderDemo(p => { demoProgress = p; if (wired) syncSourceUI(); }).then(b => {
  demoBuffer = b; demoProgress = 1;
  analysis = analysis || (S.source.kind === 'demo' ? A.analyse(b, A.DEMO.bpm) : analysis);
  if (wired) { syncSourceUI(); renderTimeline(); }
  return b;
}).catch(e => { console.error(e); toast('The demo track could not be made in this browser.'); });

function sourceMeta() {
  const s = S.source;
  if (s.kind === 'file') return { kind: 'file', name: s.name, duration: transport?.duration || s.duration };
  if (s.kind === 'youtube' || s.kind === 'spotify') return { kind: s.kind, url: s.url };
  if (s.kind === 'silent') return { kind: 'silent', duration: transport?.duration || s.duration || 210 };
  return { kind: 'demo' };
}
const duration = () => transport?.duration || S.source.duration || 210;

// switch the music. rebuild: lay out a fresh program for it (undoable)
async function setSource(src, { rebuild = false } = {}) {
  const was = transport?.playing;
  transport?.pause(); transport?.destroy?.();
  transport = null; bands = null; analysis = null;
  $('player').hidden = true;
  setStatus('');
  try {
    if (src.kind === 'demo') {
      setStatus('Making the demo track…');
      const b = await demoReady;
      transport = new A.BufferTransport(b, { title: A.DEMO.title, artist: A.DEMO.artist });
      bands = new A.Bands(transport.analyser);
      analysis = A.analyse(b, A.DEMO.bpm);
      if (rebuild) { prog.bpm = A.DEMO.bpm; prog.offset = 0.05; prog.cues = demoCues(); }
      setStatus('');
    } else if (src.kind === 'file') {
      setStatus(`Opening ${src.file.name}…`);
      transport = new A.MediaTransport(src.file);
      await transport.ready;
      bands = new A.Bands(transport.analyser);
      src.name = src.file.name; src.duration = transport.duration;
      setStatus('Listening for the tempo…');
      try {
        const buf = await A.decodeForAnalysis(src.file);
        analysis = A.analyse(buf);
        if (rebuild) { prog.bpm = analysis.bpm; prog.offset = analysis.offset; }
        setStatus(`${transport.title}: ${analysis.bpm} bpm, ${fmt(transport.duration)}. Tap along if the grid feels off.`);
      } catch {
        setStatus(`${transport.title}: couldn't read its tempo. Tap it in below.`, true);
      }
    } else if (src.kind === 'youtube' || src.kind === 'spotify') {
      const host = $('player-host');
      host.classList.toggle('is-spotify', src.kind === 'spotify');
      $('player').hidden = false;
      $('player-say').textContent = src.kind === 'youtube' ? 'YouTube · the show follows the beat grid' : 'Spotify · previews are 30 seconds unless you are logged in';
      setStatus(`Connecting to ${src.kind === 'youtube' ? 'YouTube' : 'Spotify'}…`);
      transport = src.kind === 'youtube' ? new A.YouTubeTransport(src.id, host) : new A.SpotifyTransport(src.type, src.id, host);
      await transport.ready;
      // Spotify reports the length once it starts; until then assume a radio edit
      if (!transport.duration) transport.duration = src.duration || 210;
      transport.onstate = () => { if (transport?.duration && Math.abs(transport.duration - (src.duration || 0)) > 1) { src.duration = transport.duration; renderTimeline(); } };
      setStatus('Linked. Set the tempo below: tap along, or type the bpm. The mic can listen too.');
    } else {
      transport = new A.SilentTransport(src.duration || 210);
      setStatus('No music: the show runs on the metronome.');
    }
  } catch (e) {
    setStatus(e.message || 'That source could not be opened.', true);
    transport = new A.SilentTransport(210);
    src = { kind: 'silent', duration: 210 };
  }
  S.source = src;
  transport.setVolume?.(S.volume);
  transport.onend = () => syncPlay();
  if (rebuild && src.kind !== 'demo') prog.cues = autoCues({ duration: duration(), bpm: prog.bpm, offset: prog.offset, energy: analysis?.energy });
  if (rebuild) commit('New music');
  syncSourceUI(); renderTimeline(); syncPlay(); saveSession();
  if (was) play();
}

function play() {
  if (!transport) return;
  A.audioContext();
  const p = transport.play();
  if (p?.catch) p.catch(() => {});
  syncPlay();
}
function pause() { transport?.pause(); syncPlay(); }
function toggle() { transport?.playing ? pause() : play(); }
function seek(t) { transport?.seek(clamp(t, 0, duration())); }

/* ---------- history and saving ---------- */
let hist = [], hi = -1;
const snap = () => JSON.stringify({ bpm: prog.bpm, offset: prog.offset, cues: prog.cues, rig: prog.rig || null });
function commit(label) {
  hist = hist.slice(0, hi + 1);
  hist.push({ label, s: snap() });
  if (hist.length > 150) hist.shift();
  hi = hist.length - 1;
  syncUndo(); renderTimeline(); saveSession();
}
// fold a follow-on change into the last undo step
function amend() { if (hi >= 0) hist[hi].s = snap(); saveSession(); }
function restore(k) {
  hi = k; const p = JSON.parse(hist[hi].s);
  const rigChanged = JSON.stringify(p.rig || null) !== JSON.stringify(prog.rig || null);
  prog.bpm = p.bpm; prog.offset = p.offset; prog.cues = p.cues; prog.rig = p.rig || null;
  S.sel = clamp(S.sel, 0, prog.cues.length - 1);
  if (rigChanged) { rebuildRig(); rigEd?.render(); }
  syncUndo(); renderTimeline(); renderCue(); syncTempo(); saveSession();
}
function undo() { if (hi > 0) { const l = hist[hi].label; restore(hi - 1); toast(`Undid ${l.toLowerCase()}`); } }
function redo() { if (hi < hist.length - 1) { restore(hi + 1); toast(`Redid ${hist[hi].label.toLowerCase()}`); } }
function syncUndo() { $('undo').disabled = hi <= 0; $('redo').disabled = hi >= hist.length - 1; }

let saveT = 0;
function saveSession() {
  clearTimeout(saveT);
  saveT = setTimeout(() => store.set('session', { venue: S.venue, prog, source: sourceMeta(), shot: S.shot, master: S.master, volume: S.volume, bloom: S.bloom, quality: S.quality }), 400);
}

let versions = store.get('versions') || [];
function saveVersion(name) {
  name = (name || '').trim() || `${VENUES[S.venue].name.split(' ')[0]} ${versions.length + 1}`;
  const v = { name, savedAt: new Date().toISOString(), venue: S.venue, prog: JSON.parse(JSON.stringify(prog)), source: sourceMeta() };
  const at = versions.findIndex(x => x.name === name);
  if (at >= 0) versions[at] = v; else versions.unshift(v);
  toast(store.set('versions', versions) ? `Saved “${name}”` : 'Not saved: storage is full or unavailable');
  renderVersions();
  $('version-name').value = '';
}
async function loadVersion(v) {
  prog = JSON.parse(JSON.stringify(v.prog));
  prog.rig = prog.rig || null;
  if (v.venue !== S.venue) loadVenue(v.venue); else rebuildRig();
  rigEd?.render();
  const m = v.source || { kind: 'demo' };
  if (m.kind === 'file') { await setSource({ kind: 'silent', duration: m.duration || 210 }); toast(`Loaded “${v.name}”. Attach ${m.name || 'its song'} again under Show › Music.`); }
  else if (m.kind === 'youtube' || m.kind === 'spotify') { const l = A.parseLink(m.url); await setSource(l ? { ...l, url: m.url } : { kind: 'silent' }); toast(`Loaded “${v.name}”`); }
  else { await setSource(m.kind === 'silent' ? { kind: 'silent', duration: m.duration } : { kind: 'demo' }); toast(`Loaded “${v.name}”`); }
  S.sel = 0; commit(`Load ${v.name}`); renderCue(); syncTempo();
}

/* ---------- live pads ---------- */
const pads = { flash: { v: 0 }, strobe: false, blackout: { v: 0, on: false }, lasers: false };
function padDown(id) {
  if (id === 'flash') gsap.fromTo(pads.flash, { v: 1 }, { v: 0, duration: 0.9, ease: 'expo.out', overwrite: true });
  else if (id === 'blackout') { pads.blackout.on = true; gsap.to(pads.blackout, { v: 1, duration: 0.06, overwrite: true }); }
  else pads[id] = true;
  document.querySelector(`[data-pad="${id}"]`)?.classList.add('is-on');
}
function padUp(id) {
  if (id === 'blackout') { pads.blackout.on = false; gsap.to(pads.blackout, { v: 0, duration: 0.25, overwrite: true }); }
  else if (id !== 'flash') pads[id] = false;
  document.querySelector(`[data-pad="${id}"]`)?.classList.remove('is-on');
}

/* ---------- the camera director ---------- */
const SHOTS = [['foh', 'Front of house'], ['crowd', 'In the crowd'], ['stage', 'On stage'], ['side', 'Side'], ['wide', 'Wide'], ['drone', 'Drone']];
const cam = { p: new THREE.Vector3(0, 8, 40), t: new THREE.Vector3(0, 4, 0), drone: false, droneA: 0 };
let camTween = null, nextCut = 0, lastShot = 'foh', shake = 0;
function shotVec(name) {
  // the rig view: high and in front, looking down over the trusses
  if (name === 'rig') {
    const { w: W, d: D, h: H } = world.def.stage, rh = world.def.rig.h;
    return [new THREE.Vector3(0, H + rh * 2.1 + D * 0.4, D * 1.1 + W * 0.7), new THREE.Vector3(0, H + rh * 0.4, -D * 0.45)];
  }
  const s = world.venue.shots[name] || world.venue.shots.foh;
  const p = new THREE.Vector3(...s[0]);
  // never inside the stands: at least eye height above whatever is underfoot
  p.y = Math.max(p.y, world.venue.groundAt(p.x, p.z) + (name === 'crowd' ? 1.7 : 3.4));
  return [p, new THREE.Vector3(...s[1])];
}
// move to a shot, then drift slowly through it, the way a crane holds a move
function cutTo(name, instant = false, hold = 8) {
  if (!world) return;
  lastShot = name;
  const [p, t] = shotVec(name);
  cam.drone = name === 'drone';
  camTween?.kill();
  const drift = p.clone().sub(t).multiplyScalar(-0.07).add(new THREE.Vector3((Math.random() - 0.5) * 2, 0.4, 0));
  const spb = 60 / prog.bpm;
  if (instant) { cam.p.copy(p); cam.t.copy(t); }
  const tl = gsap.timeline();
  if (!instant) tl.to(cam.p, { x: p.x, y: p.y, z: p.z, duration: 2.2, ease: 'power2.inOut' }, 0).to(cam.t, { x: t.x, y: t.y, z: t.z, duration: 2.2, ease: 'power2.inOut' }, 0);
  if (!cam.drone) tl.to(cam.p, { x: p.x + drift.x, y: p.y + drift.y, z: p.z + drift.z, duration: Math.max(4, hold * 4 * spb), ease: 'sine.inOut' }, instant ? 0 : 2.2);
  camTween = tl;
}
function setShot(name) {
  S.shot = name;
  controls.enabled = name === 'free';
  if (name === 'free') { controls.target.copy(cam.t); camTween?.kill(); }
  else if (name === 'auto') { nextCut = 0; }
  else cutTo(name);
  for (const b of document.querySelectorAll('#shots [data-shot]')) b.setAttribute('aria-pressed', b.dataset.shot === name);
  saveSession();
}
// in auto, cut on phrase boundaries: long, slow moves in quiet passages, quicker cuts when it hits
function direct(beat, energy) {
  if (S.shot !== 'auto' || S.rigMode || !transport?.playing) return;
  if (beat < nextCut - 64) nextCut = 0;
  if (beat < nextCut) return;
  const hot = energy > 0.55, bars = hot ? 4 : 8;
  const pool = hot ? ['crowd', 'stage', 'side', 'foh', 'crowd'] : ['foh', 'wide', 'drone', 'side', 'foh'];
  let next = pool[Math.floor(Math.random() * pool.length)];
  if (next === lastShot) next = pool[(pool.indexOf(next) + 1) % pool.length];
  if (world.venue.shots.dome && !hot && Math.random() < 0.4) next = 'dome';
  cutTo(next, hot, bars);
  nextCut = (Math.floor(beat / (bars * 4)) + 1) * bars * 4;
}
canvas.addEventListener('pointerdown', e => { if (S.shot !== 'free' && (e.button === 0 || e.pointerType === 'touch')) setShot('free'); });

/* ---------- the frame loop ---------- */
const clock = new THREE.Clock();
let fxBeat = 0, lastT = -1, liveIndex = -1, uiT = 0, prevTarget = new THREE.Vector3();
const fftData = screen.u.uFFT.value.image.data;
const tint = new THREE.Color();
let first = true;

function frame() {
  requestAnimationFrame(frame);
  if (!world) return;
  const dt = Math.min(0.05, clock.getDelta()), time = performance.now() / 1000;
  const t = transport ? transport.time() : 0, playing = !!transport?.playing;
  const beat = beatAt(prog, t);
  // effects keep moving while paused, from wherever the playhead stopped
  fxBeat = playing ? beat : (Math.abs(t - lastT) > 1e-4 ? beat : fxBeat + dt * prog.bpm / 60);
  lastT = t;

  // what we can hear: the analyser, the mic, or a pulse built from the beat grid
  let low, mid, high;
  const B = micBands ? micBands.read(time) : playing && bands ? bands.read(time) : null;
  if (B) { low = B.low; mid = B.mid; high = B.high; }
  else { const k = Math.exp(-fract(fxBeat) * 5); low = 0.25 + 0.6 * k; mid = 0.45 + 0.15 * Math.sin(fxBeat * 1.57); high = 0.3 + 0.4 * Math.exp(-fract(fxBeat * 2) * 6); }

  const { frame: F, index } = engine.evaluate(prog, beat, ease, fxBeat);
  // follow the music on top of the programmed levels
  const r = F.react, pump = 1 - r * 0.4 + r * 0.8 * low, wpump = 1 - r * 0.3 + r * 0.6 * mid, ppump = 1 - r * 0.4 + r * 1.1 * high;
  for (let i = 6; i < F.beams.length; i += 8) F.beams[i] *= pump;
  for (let i = 3; i < F.washes.length; i += 5) F.washes[i] *= wpump;
  for (let i = 0; i < F.pixels.length; i++) F.pixels[i] *= ppump;
  // the pads
  if (pads.strobe) {
    const on = fract(fxBeat * 8) < 0.32 ? 1 : 0;
    for (let i = 0; i < F.beams.length; i += 8) { F.beams[i + 3] = F.beams[i + 4] = F.beams[i + 5] = 1; F.beams[i + 6] = on; }
    F.strobes.fill(on);
  }
  if (pads.lasers) { const st = F.lasers.length / world.rig.lasers.length; for (let i = 0; i < F.lasers.length; i += st) { F.lasers[i + 3] = 1; F.lasers[i + 4] = Math.max(F.lasers[i + 4], 10); } }
  const bo = 1 - pads.blackout.v;
  if (bo < 1) for (const k of ['strobes', 'pixels']) for (let i = 0; i < F[k].length; i++) F[k][i] *= bo;
  if (bo < 1) { for (let i = 6; i < F.beams.length; i += 8) F.beams[i] *= bo; for (let i = 3; i < F.washes.length; i += 5) F.washes[i] *= bo; const st = F.lasers.length / Math.max(1, world.rig.lasers.length); for (let i = 3; i < F.lasers.length; i += st) F.lasers[i] *= bo; }

  const res = world.rig.update(F, { time, beat: fxBeat, master: S.master, flash: pads.flash.v });

  // the screen
  const s = F.screen, u = screen.u;
  u.uTime.value = time; u.uBeat.value = fxBeat; u.uMix.value = s.mix;
  u.uVisA.value = s.visA; u.uVisB.value = s.visB;
  u.uLevelA.value = s.levelA * S.master * bo; u.uLevelB.value = s.levelB * S.master * bo;
  u.uSpeedA.value = s.speedA; u.uSpeedB.value = s.speedB;
  for (let i = 0; i < 3; i++) { u.uPalA.value[i].setRGB(...s.palA[i]); u.uPalB.value[i].setRGB(...s.palB[i]); }
  u.uLow.value = low * r; u.uMid.value = mid; u.uHigh.value = high;
  u.uFlash.value = res.strobeMax * 0.12;
  if (B) { const f = (micBands || bands).fft(); for (let i = 0; i < 64; i++) { const k = Math.floor(Math.pow(i / 64, 1.6) * 300) + 1; fftData[i * 4] = f[k]; } }
  else for (let i = 0; i < 64; i++) fftData[i * 4] = 255 * clamp((0.65 - i / 110) * (0.5 + 0.5 * low) + 0.12 * Math.sin(i * 0.9 + fxBeat * 3.1), 0, 1);
  u.uFFT.value.needsUpdate = true;
  const sl = s.levelA + (s.levelB - s.levelA) * s.mix;
  world.rig.setScreenSpill([s.palB[0][0] * 0.6 + s.palB[1][0] * 0.4, s.palB[0][1] * 0.6 + s.palB[1][1] * 0.4, s.palB[0][2] * 0.6 + s.palB[1][2] * 0.4], sl * S.master * bo);

  // the room: tints, house lights, the crowd
  const nw = Math.max(1, res.n);
  for (const ti of world.venue.tints) {
    if (ti.from === 'house') { const k = 0.25 + 0.75 * F.house; ti.mat.color.setRGB(...ti.base.map((b, i) => b + (ti.peak[i] - b) * k)); continue; }
    tint.setRGB(res.avgW[0] / nw * ti.gain, res.avgW[1] / nw * ti.gain, res.avgW[2] / nw * ti.gain);
    if (ti.basic) ti.mat.color.copy(tint); else ti.mat.emissive.copy(tint);
  }
  hemi.intensity = (world.venue.outdoor ? 0.06 : 0.025) + F.house * 1.3;
  const beamAvg = res.beamSum / Math.max(1, world.rig.beams.length);
  const energy = clamp(beamAvg * 0.8 + res.strobeMax * 0.4, 0, 1);
  world.crowd.update(fxBeat, clamp((0.2 + low) * (energy * 1.2 + 0.1), 0, 1), clamp(0.9 - energy * 1.6 - F.house, 0, 0.85));
  for (const o of world.venue.group.children) if (o.material?.uniforms?.uTime) o.material.uniforms.uTime.value = time;
  grade.uniforms.uTime.value = time % 100;
  grade.uniforms.uFlash.value = pads.flash.v * 0.25;
  renderer.toneMappingExposure = 1 + F.house * 0.15;

  // the camera
  direct(beat, energy);
  if (S.shot === 'free') controls.update();
  else {
    if (cam.drone) {
      cam.droneA += dt * 0.05;
      const [p, t0] = shotVec('drone'), rr = Math.hypot(p.x, p.z - t0.z) + 18;
      cam.p.set(Math.sin(cam.droneA) * rr, p.y, t0.z + Math.cos(cam.droneA) * rr);
    }
    shake += (low * r * (lastShot === 'crowd' ? 0.05 : 0.015) - shake) * 0.3;
    camera.position.copy(cam.p).add(prevTarget.set(Math.sin(time * 31) * shake, Math.sin(time * 27 + 1) * shake, 0));
    camera.lookAt(cam.t);
  }

  // the dock, not every frame
  if (index !== liveIndex) { liveIndex = index; markLive(); if (S.follow && index >= 0 && index !== S.sel) { S.sel = index; renderCue(); } }
  if (time - uiT > 0.05) { uiT = time; syncClock(t, beat); }
  composer.render();
  if (first) { first = false; $('loading').style.opacity = 0; setTimeout(() => $('loading').remove(), 500); }
}

/* ---------- UI: small helpers ---------- */
const fmt = s => { s = Math.max(0, s); const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
const barBeat = b => { const bb = Math.max(0, b); return `Bar ${Math.floor(bb / 4) + 1} · beat ${Math.floor(bb % 4) + 1}`; };
let toastT = 0;
function toast(text, act, fn) {
  $('toast-text').textContent = text; $('toast').hidden = false;
  const b = $('toast-act'); b.hidden = !act; if (act) { b.textContent = act; b.onclick = () => { fn(); $('toast').hidden = true; }; }
  clearTimeout(toastT); toastT = setTimeout(() => { $('toast').hidden = true; }, act ? 6000 : 2600);
}
function seg(el, options, value, onPick) {
  el.innerHTML = '';
  for (const [v, label] of options) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.setAttribute('aria-pressed', String(v) === String(value));
    b.addEventListener('click', () => { for (const o of el.children) o.setAttribute('aria-pressed', o === b); onPick(v); });
    el.append(b);
  }
}
const grad = cols => `linear-gradient(90deg, ${cols[0]}, ${cols[1]} 55%, ${cols[2]})`;
const cueColours = c => {
  const L = compile(c.look), lit = L.beams.level + L.washes.level + L.screen.level + L.lasers.level;
  return lit < 0.05 ? 'linear-gradient(90deg,#15161b,#0c0d10)' : L.atmos.house > 0.5 ? 'linear-gradient(90deg,#4a3a24,#2a2218)' : grad(c.look.palette);
};
let statusText = '', statusBad = false;
function setStatus(t, bad = false) { statusText = t; statusBad = bad; for (const el of document.querySelectorAll('[data-status]')) { el.textContent = t; el.classList.toggle('is-bad', bad); } }

/* ---------- UI: shots ---------- */
function buildShots() {
  const n = $('shots');
  const mk = (id, label, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.dataset.shot = id; b.textContent = label; if (cls) b.className = cls; b.addEventListener('click', () => setShot(id)); n.append(b); };
  mk('auto', 'Auto');
  const sep = document.createElement('span'); sep.className = 'sep'; n.append(sep);
  SHOTS.forEach(([id, label], i) => mk(id, label, i > 3 ? 'wide-only' : ''));
  mk('free', 'Free');
  for (const b of n.querySelectorAll('[data-shot]')) b.setAttribute('aria-pressed', b.dataset.shot === S.shot);
}

/* ---------- UI: venues and music ---------- */
function venueButtons(el, onPick) {
  el.innerHTML = '';
  for (const [id, v] of Object.entries(VENUES)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'venue m-key m-key--tile'; b.dataset.venue = id;
    b.innerHTML = `<i style="background:${v.swatch}"></i><b>${v.name}</b><small>${v.city.split(',')[0]} · ${v.cap.toLocaleString()}</small>`;
    b.title = v.note;
    b.addEventListener('click', () => onPick(id));
    el.append(b);
  }
}
function syncVenueUI() {
  for (const b of document.querySelectorAll('[data-venue]')) b.setAttribute('aria-pressed', b.dataset.venue === S.venue);
  const v = VENUES[S.venue];
  $('venue-meta').textContent = `${v.kind} · ${v.cap.toLocaleString()}`;
}
const SRC = [
  ['demo', 'Demo', '<path d="M9 13V3l6-1.5v10"/><circle cx="6.5" cy="13" r="2.5"/><circle cx="12.5" cy="11.5" r="2.5"/>'],
  ['file', 'Upload', '<path d="M10 13V3M6 7l4-4 4 4"/><path d="M3 13v3h14v-3"/>'],
  ['link', 'Link', '<path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.8.8"/><path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.8-.8"/>'],
  ['silent', 'None', '<path d="M4 10h12"/>'],
];
function sourceButtons(el, detail, live) {
  el.innerHTML = '';
  for (const [id, label, icon] of SRC) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'm-key m-key--tile'; b.dataset.src = id;
    b.innerHTML = `<svg viewBox="0 0 20 20">${icon}</svg>${label}`;
    b.addEventListener('click', () => { S.srcTab = id; syncSourceUI(); if (live && id === 'demo' && S.source.kind !== 'demo') setSource({ kind: 'demo' }, { rebuild: true }); if (live && id === 'silent' && S.source.kind !== 'silent') setSource({ kind: 'silent', duration: 210 }); });
    el.append(b);
  }
  el._detail = detail; el._live = live;
}
function sourceDetail(el, live) {
  const tab = S.srcTab;
  if (el._tab === tab && el.childElementCount) { el.querySelector('[data-demo-bar]')?.style.setProperty('width', `${demoProgress * 100}%`); return; }
  el._tab = tab;
  if (tab === 'demo') {
    el.innerHTML = `<p class="say">${A.DEMO.title}: an original deep house track at ${A.DEMO.bpm} bpm, about three minutes long, synthesised in your browser. The default program is written for it.</p><div class="meterbar"><span data-demo-bar style="width:${demoProgress * 100}%"></span></div>`;
  } else if (tab === 'file') {
    el.innerHTML = `<label class="drop">Drop an audio or video file here, or choose one<input type="file" accept="audio/*,video/*" hidden></label><p class="hint">It stays on this device. We listen for its tempo and energy and build a program to fit.</p>`;
    const drop = el.querySelector('.drop'), input = el.querySelector('input');
    const take = f => { if (!f) return; pendingSource = { kind: 'file', file: f }; if (live) setSource(pendingSource, { rebuild: true }); else setStatus(`Ready: ${f.name}`); };
    input.addEventListener('change', () => take(input.files[0]));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-over'); take(e.dataTransfer.files[0]); });
  } else if (tab === 'link') {
    el.innerHTML = `<div class="row" style="flex-wrap:nowrap"><input class="text m-input m-input--sm" type="url" placeholder="Paste a YouTube or Spotify link" aria-label="Song link"><button class="btn btn--accent m-key m-key--accent" type="button">Load</button></div><p class="hint">These play in their own players, which don't let the page hear the audio. The show follows the beat grid: tap the tempo in, or let the mic listen.</p>`;
    const input = el.querySelector('input'), go = el.querySelector('button');
    if (S.source.url) input.value = S.source.url;
    const load = () => { const l = A.parseLink(input.value); if (!l) { setStatus('That doesn’t look like a YouTube video or a Spotify track link.', true); return; } pendingSource = { ...l, url: input.value.trim() }; if (live) setSource(pendingSource, { rebuild: true }); else setStatus(`Ready: ${l.kind === 'youtube' ? 'YouTube video' : 'Spotify track'}`); };
    go.addEventListener('click', load); input.addEventListener('keydown', e => { if (e.key === 'Enter') load(); });
  } else {
    el.innerHTML = `<p class="say">Program in silence: the show runs on a metronome at the tempo below.</p>`;
  }
  const st = document.createElement('p'); st.className = 'status'; st.dataset.status = ''; st.textContent = statusText; st.classList.toggle('is-bad', statusBad); el.append(st);
}
let pendingSource = null;
function syncSourceUI() {
  for (const el of [$('sources'), $('setup-sources')]) {
    for (const b of el.querySelectorAll('[data-src]')) b.setAttribute('aria-pressed', b.dataset.src === S.srcTab);
    sourceDetail(el._detail, el._live);
  }
  const k = S.source.kind;
  $('src-kind').textContent = { demo: 'Demo track', file: 'Uploaded', youtube: 'YouTube', spotify: 'Spotify', silent: 'Metronome' }[k] || '';
  const sb = $('start');
  if (!S.started) {
    const waiting = S.srcTab === 'demo' && !demoBuffer;
    sb.disabled = waiting || ((S.srcTab === 'file' || S.srcTab === 'link') && !pendingSource);
    sb.textContent = waiting ? `Making the track… ${Math.round(demoProgress * 100)}%` : 'Start the show';
  }
}

/* ---------- UI: tempo ---------- */
function syncTempo() {
  if (document.activeElement !== $('bpm')) $('bpm').value = prog.bpm;
  $('tempo-meta').textContent = `${prog.bpm} bpm · grid at ${prog.offset.toFixed(2)} s`;
}
let taps = [], tapT = 0;
function tap() {
  const now = performance.now() / 1000, tt = transport?.playing ? transport.time() : null;
  if (taps.length && now - taps[taps.length - 1].n > 2) taps = [];
  taps.push({ n: now, t: tt });
  if (taps.length >= 4) {
    const iv = []; for (let i = 1; i < taps.length; i++) iv.push(taps[i].n - taps[i - 1].n);
    const bpm = Math.round(600 / (iv.reduce((a, b) => a + b, 0) / iv.length)) / 10;
    if (bpm >= 40 && bpm <= 220) {
      prog.bpm = bpm;
      const last = taps[taps.length - 1].t;
      if (last != null) prog.offset = last - Math.round((last - prog.offset) * bpm / 60) * 60 / bpm;
      syncTempo(); renderTimeline();
      $('tempo-say').textContent = `${bpm} bpm from ${taps.length} taps.${last == null ? ' Play the song and tap again to line up the grid.' : ''}`;
    }
  } else $('tempo-say').textContent = `Keep tapping… ${taps.length}`;
  clearTimeout(tapT); tapT = setTimeout(() => { if (taps.length >= 4) commit('Tap tempo'); taps = []; }, 2200);
  const dot = $('beatdot'); dot.style.background = 'var(--m-signal)'; setTimeout(() => { dot.style.background = ''; }, 90);
}

/* ---------- UI: the cue editor ---------- */
const FADES = [[0, 'Snap'], [0.5, '½'], [1, '1'], [2, '2'], [4, '4'], [8, '8'], [16, '16']];
const openGroups = new Set(['beams']);
const groupTarget = {};
const cue = () => prog.cues[S.sel];
function editLook(fn, label) {
  const c = cue(); if (!c) return;
  const look = JSON.parse(JSON.stringify(c.look)); fn(look); c.look = look;   // a new object, so it recompiles
  if (label) commit(label); else renderTimeline();
}
function renderCue() {
  const c = cue();
  if (!c) return;
  $('cue-name').value = c.name;
  $('cue-at').textContent = barBeat(c.at);
  $('cue-count').textContent = `Cue ${S.sel + 1} of ${prog.cues.length}`;
  $('fade-out').textContent = c.fade ? `${c.fade} beat${c.fade === 1 ? '' : 's'}` : 'Snap';
  seg($('cue-fade'), FADES, c.fade, v => { cue().fade = v; $('fade-out').textContent = v ? `${v} beat${v === 1 ? '' : 's'}` : 'Snap'; commit('Fade'); });
  seg($('cue-ease'), EASES, c.ease || 'power1.inOut', v => { cue().ease = v; commit('Fade shape'); });
  $('follow').setAttribute('aria-pressed', S.follow);
  // colours
  const pal = $('palette'); pal.innerHTML = '';
  c.look.palette.forEach((h, i) => {
    const l = document.createElement('label'); l.style.background = h; l.title = 'Pick a colour';
    const inp = document.createElement('input'); inp.type = 'color'; inp.value = h; inp.setAttribute('aria-label', `Colour ${i + 1}`);
    inp.addEventListener('input', () => { l.style.background = inp.value; editLook(L => { L.palette[i] = inp.value; }); });
    inp.addEventListener('change', () => commit('Colour'));
    l.append(inp); pal.append(l);
  });
  // groups
  const host = $('groups'); host.innerHTML = '';
  const custom = prog.rig?.groups || [];
  for (const g of GROUPS) {
    // a custom group of this type can have its own settings, laid over the type's
    const mine = custom.filter(x => x.type === g.id);
    const target = mine.some(x => x.id === groupTarget[g.id]) ? groupTarget[g.id] : '';
    const own = target ? (c.look.groups?.[target] || {}) : null;
    const val = target ? { ...c.look[g.id], ...own } : c.look[g.id], wrap = document.createElement('div');
    const write = (L, key, v) => { if (target) { L.groups = L.groups || {}; (L.groups[target] = L.groups[target] || {})[key] = v; } else L[g.id][key] = v; };
    const who = target ? ` (${mine.find(x => x.id === target).name})` : '';
    wrap.className = 'group' + (openGroups.has(g.id) ? ' is-open' : '');
    const lvl = g.id === 'atmos' ? `Haze ${Math.round(val.haze * 100)}%` : val.level > 0.001 ? `${Math.round(val.level * 100)}%` : 'Off';
    const head = document.createElement('button'); head.type = 'button';
    head.innerHTML = `<span class="dot" style="${g.id === 'atmos' || val.level > 0.001 ? 'background:var(--m-signal);box-shadow:0 0 5px var(--m-signal)' : ''}"></span><b>${g.name}</b><span class="lv">${lvl}</span><span class="caret">›</span>`;
    head.setAttribute('aria-expanded', openGroups.has(g.id));
    head.addEventListener('click', () => { wrap.classList.toggle('is-open'); const o = wrap.classList.contains('is-open'); o ? openGroups.add(g.id) : openGroups.delete(g.id); head.setAttribute('aria-expanded', o); });
    const body = document.createElement('div');
    body.innerHTML = `<p class="note">${g.note}</p>`;
    if (mine.length) {
      const gi = custom.indexOf.bind(custom);
      const pick = document.createElement('div'); pick.className = 'field';
      pick.innerHTML = `<div class="label m-legend">Settings for</div><div class="seg seg--groups m-seg m-seg--wrap"></div>`;
      seg(pick.querySelector('.seg'), [['', `All ${g.name.toLowerCase()}`], ...mine.map(x => [x.id, x.name])], target, v => { groupTarget[g.id] = v; renderCue(); });
      // the group's colour from the plan, on its chip
      [...pick.querySelectorAll('.seg button')].slice(1).forEach((b, k) => b.style.setProperty('--hue', GROUP_HUES[gi(mine[k]) % GROUP_HUES.length]));
      body.append(pick);
      if (target) {
        const n = Object.keys(own).length;
        body.insertAdjacentHTML('beforeend', `<p class="hint">Only what you change here applies to ${mine.find(x => x.id === target).name}; the rest follows all ${g.name.toLowerCase()}. ${n ? `${n} setting${n === 1 ? '' : 's'} of its own.` : ''}</p>`);
        if (n) {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'btn m-key'; b.style.marginTop = '8px'; b.textContent = `Match all ${g.name.toLowerCase()}`;
          b.addEventListener('click', () => { editLook(L => { delete L.groups[target]; if (!Object.keys(L.groups).length) delete L.groups; }, `${g.name}: match all`); renderCue(); });
          body.append(b);
        }
      }
    }
    for (const f of g.fields) {
      const fl = document.createElement('div'); fl.className = 'field';
      const mark = own && f.key in own ? ' <span class="own">own</span>' : '';
      if (f.type === 'seg') {
        fl.innerHTML = `<div class="label m-legend"><span>${f.label}${mark}</span></div><div class="seg m-seg m-seg--wrap"></div>`;
        seg(fl.querySelector('.seg'), f.options, val[f.key], v => { editLook(L => write(L, f.key, v), `${g.name}${who}: ${f.label.toLowerCase()}`); if (target) renderCue(); else refreshHead(); });
      } else {
        const show = v => f.key === 'count' ? String(v) : `${Math.round(v * 100)}%`;
        fl.innerHTML = `<div class="label m-legend"><span>${f.label}${mark}</span> <output>${show(val[f.key])}</output></div><input class="m-fader" type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${val[f.key]}" aria-label="${g.name}${who} ${f.label}">`;
        const inp = fl.querySelector('input'), out = fl.querySelector('output');
        inp.addEventListener('input', () => { const v = Number(inp.value); out.textContent = show(v); editLook(L => write(L, f.key, v)); refreshHead(); });
        inp.addEventListener('change', () => { commit(`${g.name}${who}: ${f.label.toLowerCase()}`); if (target && !mark) renderCue(); });
      }
      if (f.hint) fl.insertAdjacentHTML('beforeend', `<p class="hint">${f.hint}</p>`);
      body.append(fl);
    }
    const refreshHead = () => {
      const v = cue().look[g.id];
      head.querySelector('.lv').textContent = g.id === 'atmos' ? `Haze ${Math.round(v.haze * 100)}%` : v.level > 0.001 ? `${Math.round(v.level * 100)}%` : 'Off';
      head.querySelector('.dot').style.background = g.id === 'atmos' || v.level > 0.001 ? 'var(--accent)' : '';
    };
    wrap.append(head, body); host.append(wrap);
  }
  markSelected();
}
function buildPresets() {
  const el = $('presets'); el.innerHTML = '';
  for (const [id, p] of Object.entries(PRESETS)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'm-key m-key--tile';
    const cols = p.look.palette || PALETTES.ice.colors;
    b.innerHTML = `<i style="background:${id === 'blackout' ? '#0c0d10' : grad(cols)}"></i>${p.name}`;
    b.addEventListener('click', () => {
      const c = cue(); if (!c) return;
      const keep = $('keep-colours').checked ? c.look.palette.slice() : null;
      c.look = fullLook(JSON.parse(JSON.stringify(p.look)));
      if (keep && id !== 'blackout' && id !== 'house') c.look.palette = keep;
      if (c.name.startsWith('Cue ') || Object.values(PRESETS).some(x => x.name === c.name)) c.name = p.name;
      commit(`Look: ${p.name}`); renderCue();
    });
    el.append(b);
  }
  const chips = $('palchips'); chips.innerHTML = '';
  for (const [id, p] of Object.entries(PALETTES)) {
    const b = document.createElement('button'); b.type = 'button'; b.title = p.name; b.setAttribute('aria-label', `${p.name} colours`);
    b.innerHTML = p.colors.map(c => `<span style="background:${c}"></span>`).join('');
    b.addEventListener('click', () => { editLook(L => { L.palette = p.colors.slice(); }, `Colours: ${p.name}`); renderCue(); });
    chips.append(b);
  }
}
function selectCue(i, { seekTo = false } = {}) {
  S.sel = clamp(i, 0, prog.cues.length - 1);
  if (seekTo) { const c = cue(); seek(timeAt(prog, c.at + Math.min(c.fade, 8)) + 0.001); }
  renderCue();
}
// a new cue: a copy of the given cue, or of whatever is live at that point
function addCue(at, from = null) {
  at = Math.max(0, at);
  const i = prog.cues.findIndex(c => c.at > at), live = from || prog.cues[(i < 0 ? prog.cues.length : i) - 1];
  const c = { id: cueId(), at, name: from ? `${from.name}, again` : `Cue ${prog.cues.length + 1}`, fade: from ? from.fade : 2, ease: from?.ease || 'power1.inOut', look: JSON.parse(JSON.stringify(live ? live.look : fullLook(PRESETS.blackout.look))) };
  if (prog.cues.some(x => Math.abs(x.at - at) < 0.01)) { toast('There is already a cue there'); return; }
  const at2 = i < 0 ? prog.cues.length : i;
  prog.cues.splice(at2, 0, c);
  S.follow = false; S.sel = at2;
  commit('New cue'); renderCue();
}

/* ---------- UI: the timeline ---------- */
const tl = $('timeline'), lane = $('lane');
const total = () => Math.max(16, (duration() - prog.offset) * prog.bpm / 60);
const xOf = b => b / total() * tl.clientWidth;
const bOf = x => x / tl.clientWidth * total();
function renderTimeline() {
  if (!tl.clientWidth) return;
  lane.innerHTML = '';
  prog.cues.forEach((c, i) => {
    const next = prog.cues[i + 1], x0 = xOf(c.at), x1 = next ? xOf(next.at) : xOf(total());
    const d = document.createElement('div'); d.className = 'cue'; d.dataset.i = i;
    d.style.left = `${x0}px`; d.style.width = `${Math.max(3, x1 - x0 - 1)}px`;
    d.style.background = cueColours(c);
    if (x1 - x0 > 44) d.innerHTML = `${c.name}<small>Bar ${Math.floor(c.at / 4) + 1}</small>`;
    d.title = `${c.name} · ${barBeat(c.at)}`;
    if (c.fade) { const f = document.createElement('span'); f.className = 'fade'; f.style.width = `${Math.min(x1 - x0, xOf(c.at + c.fade) - x0)}px`; d.prepend(f); }
    lane.append(d);
  });
  markSelected(); markLive();
  // bar numbers
  const t = $('ticks'), bars = total() / 4, every = [4, 8, 16, 32].find(n => tl.clientWidth / bars * n > 46) || 64;
  t.innerHTML = '';
  for (let b = 0; b < bars; b += every) t.insertAdjacentHTML('beforeend', `<i style="left:${xOf(b * 4)}px"></i><span style="left:${xOf(b * 4)}px">${b + 1}</span>`);
  // energy across the song, when we've heard it
  const cv = $('energy'), w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(2, devicePixelRatio);
  cv.width = w * dpr; cv.height = h * dpr;
  const x = cv.getContext('2d'); x.scale(dpr, dpr); x.clearRect(0, 0, w, h);
  if (analysis?.energy) {
    const e = analysis.energy, off = (analysis.offset - prog.offset) * prog.bpm / 60;
    x.fillStyle = 'rgba(125,226,255,0.16)'; x.beginPath(); x.moveTo(0, h);
    for (let b = 0; b < e.length; b++) { const px = xOf(b * 4 * (analysis.bpm ? prog.bpm / analysis.bpm : 1) + off); x.lineTo(px, h - e[b] * (h - 2)); }
    x.lineTo(w, h); x.closePath(); x.fill();
  }
}
function markSelected() { for (const d of lane.children) d.classList.toggle('is-selected', Number(d.dataset.i) === S.sel); }
function markLive() { for (const d of lane.children) d.classList.toggle('is-live', Number(d.dataset.i) === liveIndex); }
let drag = null;
tl.addEventListener('pointerdown', e => {
  const r = tl.getBoundingClientRect(), x = e.clientX - r.left, el = e.target.closest('.cue');
  tl.setPointerCapture(e.pointerId);
  if (el) {
    const i = Number(el.dataset.i);
    S.follow = false; selectCue(i);
    drag = { kind: 'cue', i, x0: x, at0: prog.cues[i].at, moved: false };
  } else { drag = { kind: 'scrub' }; seek(timeAt(prog, bOf(x))); }
});
tl.addEventListener('pointermove', e => {
  if (!drag) return;
  const r = tl.getBoundingClientRect(), x = clamp(e.clientX - r.left, 0, r.width);
  if (drag.kind === 'scrub') { seek(timeAt(prog, bOf(x))); return; }
  const dx = x - drag.x0;
  if (!drag.moved && Math.abs(dx) < 4) return;
  drag.moved = true;
  const q = e.shiftKey ? 1 : 4, c = prog.cues[drag.i], prev = prog.cues[drag.i - 1], next = prog.cues[drag.i + 1];
  let at = Math.round((drag.at0 + bOf(dx)) / q) * q;
  at = clamp(at, prev ? prev.at + q : 0, next ? next.at - q : total());
  if (at !== c.at) { c.at = at; renderTimeline(); $('cue-at').textContent = barBeat(at); }
});
tl.addEventListener('pointerup', () => {
  if (drag?.kind === 'cue') { if (drag.moved) commit('Move cue'); else selectCue(drag.i, { seekTo: true }); }
  drag = null;
});
tl.addEventListener('dblclick', e => { const r = tl.getBoundingClientRect(); addCue(Math.round(bOf(e.clientX - r.left) / 4) * 4); });

/* ---------- UI: clock and transport ---------- */
function syncClock(t, beat) {
  $('clock').textContent = fmt(t);
  $('clock-dur').textContent = ` / ${fmt(duration())}`;
  $('barbeat').textContent = barBeat(beat);
  $('playhead').style.left = `${xOf(beat)}px`;
  $('beatdot').style.opacity = transport?.playing ? 0.35 + 0.65 * Math.exp(-fract(beat) * 5) : 0.35;
  if (!$('beatdot').style.background) $('beatdot').style.background = 'var(--m-lit)';
}
function syncPlay() {
  const p = !!transport?.playing;
  $('play').setAttribute('aria-label', p ? 'Pause' : 'Play');
  $('play-icon').innerHTML = p ? '<rect x="3.5" y="2.5" width="3" height="11" rx="0.6"/><rect x="9.5" y="2.5" width="3" height="11" rx="0.6"/>' : '<path d="M4 2.5v11l9-5.5z"/>';
}

/* ---------- UI: versions ---------- */
function renderVersions() {
  const el = $('versions'); el.innerHTML = '';
  $('version-count').textContent = versions.length ? `${versions.length}` : '';
  if (!versions.length) { el.innerHTML = '<p class="empty">Nothing saved yet.</p>'; return; }
  versions.forEach((v, i) => {
    const d = document.createElement('div'); d.className = 'version';
    const tot = Math.max(1, v.prog.cues.at(-1)?.at || 1);
    const strip = v.prog.cues.map((c, k) => { const nx = v.prog.cues[k + 1]?.at ?? tot + 8; return `<span style="flex:${Math.max(0.5, nx - c.at)};background:${cueColours(c)}"></span>`; }).join('');
    const when = new Date(v.savedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    d.innerHTML = `<div><b></b><small>${VENUES[v.venue]?.name || v.venue} · ${v.prog.cues.length} cues · ${when}</small></div><div class="row"><button class="btn m-key" type="button" data-load>Load</button><button class="btn btn--danger m-key" type="button" data-del aria-label="Delete">✕</button></div><div class="strip">${strip}</div>`;
    d.querySelector('b').textContent = v.name;
    d.querySelector('[data-load]').addEventListener('click', () => loadVersion(v));
    d.querySelector('[data-del]').addEventListener('click', () => {
      versions.splice(i, 1); store.set('versions', versions); renderVersions();
      toast(`Deleted “${v.name}”`, 'Undo', () => { versions.splice(i, 0, v); store.set('versions', versions); renderVersions(); });
    });
    el.append(d);
  });
}

/* ---------- title card ---------- */
function showTitle() {
  if (!gsap) return;
  const v = VENUES[S.venue], song = transport?.title || A.DEMO.title;
  const h = $('title-song'); h.innerHTML = '';
  for (const ch of song) { const s = document.createElement('span'); s.textContent = ch === ' ' ? ' ' : ch; h.append(s); }
  $('title-venue').textContent = `${v.name} · ${v.city}`;
  gsap.killTweensOf(['#title', '#title-song span', '#title-venue']);
  gsap.timeline()
    .set('#title', { opacity: 1 })
    .fromTo('#title-song span', { opacity: 0, y: 40, filter: 'blur(12px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.1, ease: 'expo.out', stagger: 0.035 })
    .fromTo('#title-venue', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' }, '-=0.7')
    .to('#title', { opacity: 0, duration: 1.2, ease: 'power2.in' }, '+=2.4');
}

/* ---------- wiring ---------- */
function setTab(name) {
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', b.dataset.tab === name);
  for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== name;
  setRigMode(name === 'rig');
}
// the Rig tab opens the plan and moves the camera up over the trusses
function setRigMode(on) {
  if (on === !!S.rigMode) return;
  S.rigMode = on;
  document.body.classList.toggle('rig-mode', on);
  $('plan').hidden = !on;
  frameAround(); camera.updateProjectionMatrix();
  if (on) { rigEd.render(); if (S.shot !== 'free') cutTo('rig'); }
  else if (S.shot === 'auto') { nextCut = 0; cutTo('foh'); }
  else if (S.shot !== 'free') cutTo(S.shot);
}
function openSheet(open) { $('side').classList.toggle('is-open', open); $('sheet-toggle').setAttribute('aria-expanded', open); }
function setShowMode(on) { document.body.classList.toggle('show-mode', on); if (on) { setShot('auto'); toast('Show mode. Move the mouse to the top right, or press Esc, to come back.'); } }

let rigEd = null;
function wire() {
  wired = true;
  rigEd = rigEditor({
    svg: $('plan-svg'), panel: $('rig-panel'),
    ctx: {
      def: () => VENUES[S.venue],
      plot: plotNow,
      custom: () => !!prog.rig,
      apply(plot, label) { prog.rig = plot; clearTimeout(previewT); previewT = 0; rebuildRig(); commit(label); },
      preview: previewRig,
      // put the rig back as the last undo step left it
      revert() { clearTimeout(previewT); previewT = 0; prog.rig = JSON.parse(hist[hi].s).rig || null; rebuildRig(); },
      groupsChanged() { renderCue(); },
      // a deleted group's settings go from every cue, in the same undo step
      groupDeleted(gid) { for (const c of prog.cues) if (c.look.groups?.[gid]) { c.look = JSON.parse(JSON.stringify(c.look)); delete c.look.groups[gid]; } amend(); renderCue(); },
      toast, undo,
    },
  });
  $('mirror').addEventListener('click', () => { rigEd.setMirror(!rigEd.mirror); $('mirror').setAttribute('aria-pressed', rigEd.mirror); });
  $('plan-done').addEventListener('click', () => setTab('cue'));
  buildShots(); buildPresets();
  venueButtons($('venues'), id => { loadVenue(id); showTitle(); });
  venueButtons($('setup-venues'), id => loadVenue(id));
  sourceButtons($('sources'), $('source-detail'), true);
  sourceButtons($('setup-sources'), $('setup-source-detail'), false);
  syncVenueUI(); syncSourceUI(); syncTempo();
  for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => setTab(b.dataset.tab));
  $('sheet-toggle').addEventListener('click', () => openSheet(!$('side').classList.contains('is-open')));
  document.querySelector('[data-close-sheet]').addEventListener('click', () => openSheet(false));
  $('show-mode').addEventListener('click', () => setShowMode(true));
  $('exit-show').addEventListener('click', () => setShowMode(false));
  $('start').addEventListener('click', async () => {
    S.started = true;
    $('start').disabled = true; $('start').textContent = 'Starting…';
    const src = S.srcTab === 'demo' ? { kind: 'demo' } : S.srcTab === 'silent' ? { kind: 'silent', duration: 210 } : pendingSource || { kind: 'demo' };
    await setSource(src, { rebuild: true });
    hist = []; hi = -1; commit('Start');
    $('setup').hidden = true; $('side').hidden = false; $('dock').hidden = false;
    resize(); renderCue();
    setShot('auto'); seek(0); play(); showTitle();
  });
  $('play').addEventListener('click', toggle);
  $('bpm').addEventListener('change', () => { const v = clamp(Number($('bpm').value) || prog.bpm, 40, 220); prog.bpm = Math.round(v * 10) / 10; syncTempo(); commit('Tempo'); });
  $('tap').addEventListener('click', tap);
  $('nudge-back').addEventListener('click', () => { prog.offset -= 0.02; syncTempo(); commit('Nudge grid'); });
  $('nudge-fwd').addEventListener('click', () => { prog.offset += 0.02; syncTempo(); commit('Nudge grid'); });
  $('mic').addEventListener('click', async () => {
    if (mic) { mic.close(); mic = micBands = null; $('mic').setAttribute('aria-pressed', 'false'); $('mic').textContent = 'Listen with the mic'; return; }
    try { mic = await A.openMic(); micBands = new A.Bands(mic.analyser); $('mic').setAttribute('aria-pressed', 'true'); $('mic').textContent = 'Stop listening'; toast('Listening. Play the song out loud near this device.'); }
    catch { toast('The microphone is blocked or unavailable.'); }
  });
  $('auto-program').addEventListener('click', () => {
    prog.cues = S.source.kind === 'demo' ? demoCues() : autoCues({ duration: duration(), bpm: prog.bpm, offset: prog.offset, energy: analysis?.energy });
    S.sel = 0; commit('Build program'); renderCue();
    toast(`Built ${prog.cues.length} cues for this song`, 'Undo', undo);
  });
  $('clear-program').addEventListener('click', () => {
    prog.cues = [cueFrom('blackout', 0, { fade: 0, name: 'Blackout' }), cueFrom('ocean', 4, { fade: 4, name: 'First look' })];
    S.sel = 1; S.follow = false; commit('Start from scratch'); renderCue();
    toast('A blank program with one look. Double-click the timeline to add cues.', 'Undo', undo);
  });
  $('cue-name').addEventListener('input', () => { cue().name = $('cue-name').value || 'Cue'; renderTimeline(); });
  $('cue-name').addEventListener('change', () => commit('Rename cue'));
  $('cue-prev').addEventListener('click', () => { S.follow = false; selectCue(S.sel - 1, { seekTo: true }); });
  $('cue-next').addEventListener('click', () => { S.follow = false; selectCue(S.sel + 1, { seekTo: true }); });
  $('follow').addEventListener('click', () => { S.follow = !S.follow; $('follow').setAttribute('aria-pressed', S.follow); if (S.follow && liveIndex >= 0) selectCue(liveIndex); });
  $('cue-dup').addEventListener('click', () => { const c = cue(), nx = prog.cues[S.sel + 1]; addCue(nx ? Math.round((c.at + nx.at) / 8) * 4 : c.at + 32, c); });
  $('cue-del').addEventListener('click', () => {
    if (prog.cues.length <= 1) { toast('A program needs at least one cue'); return; }
    const name = cue().name; prog.cues.splice(S.sel, 1); S.sel = clamp(S.sel - 1, 0, prog.cues.length - 1);
    commit('Delete cue'); renderCue(); toast(`Deleted “${name}”`, 'Undo', undo);
  });
  $('keep-colours').addEventListener('change', e => { S.keepColours = e.target.checked; });
  $('add-cue').addEventListener('click', () => addCue(Math.round(beatAt(prog, transport?.time() || 0) / 4) * 4));
  $('undo').addEventListener('click', undo); $('redo').addEventListener('click', redo);
  for (const b of document.querySelectorAll('[data-pad]')) {
    const id = b.dataset.pad;
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); padDown(id); });
    b.addEventListener('pointerup', () => padUp(id)); b.addEventListener('pointercancel', () => padUp(id));
  }
  $('master').addEventListener('input', e => { S.master = Number(e.target.value); $('master-out').textContent = `${Math.round(S.master * 100)}%`; saveSession(); });
  $('volume').addEventListener('input', e => { S.volume = Number(e.target.value); $('volume-out').textContent = `${Math.round(S.volume * 100)}%`; transport?.setVolume?.(S.volume); saveSession(); });
  $('bloom').addEventListener('input', e => { S.bloom = Number(e.target.value); bloom.strength = 0.6 * S.bloom; $('bloom-out').textContent = `${Math.round(S.bloom * 100)}%`; saveSession(); });
  $('master').value = S.master; $('master-out').textContent = `${Math.round(S.master * 100)}%`;
  $('volume').value = S.volume; $('volume-out').textContent = `${Math.round(S.volume * 100)}%`;
  $('bloom').value = S.bloom; $('bloom-out').textContent = `${Math.round(S.bloom * 100)}%`;
  seg($('quality'), [['high', 'High'], ['balanced', 'Balanced']], S.quality, v => { S.quality = v; buildComposer(); loadVenue(S.venue); saveSession(); });
  $('save-version').addEventListener('click', () => saveVersion($('version-name').value));
  $('version-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveVersion($('version-name').value); });
  $('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'light-desk', current: { venue: S.venue, prog, source: sourceMeta() }, versions }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'light-desk-programs.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('import').addEventListener('change', async e => {
    try {
      const d = JSON.parse(await e.target.files[0].text()), list = d.versions || (Array.isArray(d) ? d : []);
      let n = 0; for (const v of list) if (v?.prog?.cues) { if (!versions.some(x => x.name === v.name && x.savedAt === v.savedAt)) { versions.push(v); n++; } }
      store.set('versions', versions); renderVersions(); toast(n ? `Imported ${n} version${n === 1 ? '' : 's'}` : 'Nothing new to import');
    } catch { toast('That file isn’t a light desk export'); }
    e.target.value = '';
  });
  $('player-hide').addEventListener('click', () => { $('player').style.transform = $('player').style.transform ? '' : 'translateY(calc(100% - 34px))'; $('player-hide').textContent = $('player').style.transform ? 'Show' : 'Hide'; });

  // keys
  const held = new Set();
  addEventListener('keydown', e => {
    if (e.target.matches('input[type="text"], input[type="url"], input[type="number"], textarea')) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 's') { e.preventDefault(); saveVersion(''); return; }
    if (mod || !S.started) return;
    if (S.rigMode && rigEd.key(e)) { e.preventDefault(); return; }
    if (e.key === ' ') { e.preventDefault(); toggle(); return; }
    if (e.key === 'Escape') { setShowMode(false); return; }
    const pad = { f: 'flash', s: 'strobe', b: 'blackout', l: 'lasers' }[k];
    if (pad) { if (!held.has(k)) { held.add(k); padDown(pad); } e.preventDefault(); return; }
    if (k === 't') tap();
    else if (k === '[') { S.follow = false; selectCue(S.sel - 1, { seekTo: true }); }
    else if (k === ']') { S.follow = false; selectCue(S.sel + 1, { seekTo: true }); }
    else if (k === 'n') addCue(Math.round(beatAt(prog, transport?.time() || 0) / 4) * 4);
    else if (k === '0') setShot('auto');
    else if (k >= '1' && k <= '6') setShot(SHOTS[Number(k) - 1][0]);
  });
  addEventListener('keyup', e => { const k = e.key.toLowerCase(), pad = { f: 'flash', s: 'strobe', b: 'blackout', l: 'lasers' }[k]; if (pad && held.has(k)) { held.delete(k); padUp(pad); } });
  addEventListener('blur', () => { for (const k of held) padUp({ f: 'flash', s: 'strobe', b: 'blackout', l: 'lasers' }[k]); held.clear(); });
}

/* ---------- start ---------- */
const saved = params.has('new') ? null : store.get('session');
if (saved?.prog?.cues?.length) {
  prog = saved.prog;
  prog.rig = prog.rig || null;
  Object.assign(S, { venue: VENUES[saved.venue] ? saved.venue : S.venue, master: saved.master ?? 1, volume: saved.volume ?? 0.8, bloom: saved.bloom ?? 1, quality: saved.quality || S.quality, shot: saved.shot === 'free' ? 'auto' : saved.shot || 'auto' });
}
buildComposer();
wire();
loadVenue(S.venue);
renderVersions();
requestAnimationFrame(frame);

if (saved?.prog?.cues?.length) {
  // pick up where we left off, with the desk open and the music paused
  S.started = true;
  $('side').hidden = false; $('dock').hidden = false;
  const m = saved.source || { kind: 'demo' };
  S.srcTab = m.kind === 'youtube' || m.kind === 'spotify' ? 'link' : m.kind;
  hist = []; hi = -1; commit('Restore');
  resize(); renderCue();
  (async () => {
    if (m.kind === 'file') { await setSource({ kind: 'silent', duration: m.duration || 210 }); toast(`Attach ${m.name || 'the song'} again under Show › Music to hear it.`); S.srcTab = 'file'; syncSourceUI(); }
    else if (m.kind === 'youtube' || m.kind === 'spotify') { const l = A.parseLink(m.url || ''); await setSource(l ? { ...l, url: m.url } : { kind: 'silent' }); }
    else await setSource(m.kind === 'silent' ? { kind: 'silent', duration: m.duration } : { kind: 'demo' });
    setShot(S.shot);
  })();
} else {
  $('setup').hidden = false;
  hist = []; hi = -1; commit('Start');
}

window.lightdesk = { get rigEd() { return rigEd; }, rebuildRig, setTab, S, get prog() { return prog; }, setShot, cutTo, loadVenue, setSource, play, pause, seek, padDown, padUp, scene, camera, get world() { return world; }, get transport() { return transport; }, commit, addCue, selectCue, undo, redo, saveVersion, renderer };
