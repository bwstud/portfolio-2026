/* Powers of Watts — the sound (after Music of the Spheres).
   Built only after the learner presses Begin (browsers require a gesture). Two voices: a struck bell (FM, one per
   orbit event) and a soft drone whose pitch follows a body around its orbit. Everything runs through one reverb and a
   gentle compressor, so several voices together stay polite. */

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const MUTE_KEY = 'kardashev:muted';

export function createAudio() {
  let ctx = null, master = null, dry = null, wet = null;
  let muted = store.get(MUTE_KEY) === '1';
  const drones = new Set();
  const LEVEL = 0.8;

  function impulse(seconds = 3.2, decay = 3) {
    const rate = ctx.sampleRate, n = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, n, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return buf;
  }

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
    master = ctx.createGain(); master.gain.value = muted ? 0 : LEVEL;
    master.connect(comp).connect(ctx.destination);
    dry = ctx.createGain(); dry.gain.value = 0.75; dry.connect(master);
    const verb = ctx.createConvolver(); verb.buffer = impulse();
    wet = ctx.createGain(); wet.gain.value = 0.42;
    wet.connect(verb).connect(master);
  }

  function out(pan = 0) {
    const g = ctx.createGain();
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g._pan = p; g.connect(p); p.connect(dry); p.connect(wet); }
    else { g.connect(dry); g.connect(wet); }
    return g;
  }

  /* A struck bell: a sine carrier with a sine modulator whose depth falls away, so the strike is bright and the tail pure. */
  function pluck(freq, { gain = 0.22, pan = 0, decay = 2.4, bright = 1, delay = 0 } = {}) {
    if (!ctx || muted || !isFinite(freq) || freq <= 0) return;
    const t = ctx.currentTime + 0.01 + delay;
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), modGain = ctx.createGain(), amp = out(pan);
    car.frequency.value = freq;
    mod.frequency.value = freq * 3.5;   // an inharmonic ratio: bell, not string
    modGain.gain.setValueAtTime(freq * 2.2 * bright, t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.02 + 0.01, t + decay * 0.35);
    mod.connect(modGain).connect(car.frequency);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    car.connect(amp);
    car.start(t); mod.start(t);
    car.stop(t + decay + 0.05); mod.stop(t + decay + 0.05);
  }

  /* A goal met: a rising major triad and its octave, rolled like a harp. */
  function chord(root = 261.63) {
    [1, 5 / 4, 3 / 2, 2].forEach((r, i) => pluck(root * r, { gain: 0.16, delay: i * 0.07, decay: 3.2, pan: -0.3 + i * 0.2, bright: 0.7 }));
  }

  /* A held tone. Its pitch and level glide (setTargetAtTime), so following an orbit never clicks. */
  function drone({ freq = 220, gain = 0.06, pan = 0, colour = 1400, wave = 'triangle' } = {}) {
    const voice = { setFreq() {}, setGain() {}, setPan() {}, stop() {} };
    if (!ctx) return voice;
    const a = ctx.createOscillator(), b = ctx.createOscillator(), lp = ctx.createBiquadFilter(), env = ctx.createGain();
    const o = out(pan);
    a.type = 'sine'; b.type = wave;   // a sawtooth carries every harmonic, so two tones near a simple ratio beat audibly
    a.frequency.value = freq; b.frequency.value = freq; b.detune.value = 4;
    lp.type = 'lowpass'; lp.frequency.value = colour; lp.Q.value = 0.4;
    const bGain = ctx.createGain(); bGain.gain.value = 0.55;
    a.connect(lp); b.connect(bGain).connect(lp);
    lp.connect(env).connect(o);
    env.gain.value = 0;
    let target = gain;
    env.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.5);
    a.start(); b.start();
    voice.setFreq = f => { if (!isFinite(f) || f <= 0) return; const t = ctx.currentTime; a.frequency.setTargetAtTime(f, t, 0.03); b.frequency.setTargetAtTime(f, t, 0.03); };
    voice.setGain = g => { target = g; env.gain.setTargetAtTime(muted ? 0 : g, ctx.currentTime, 0.15); };
    voice.setPan = p => { if (o._pan) o._pan.pan.setTargetAtTime(p, ctx.currentTime, 0.1); };
    voice.stop = () => {
      const t = ctx.currentTime;
      env.gain.cancelScheduledValues(t); env.gain.setTargetAtTime(0, t, 0.25);
      a.stop(t + 1.5); b.stop(t + 1.5);
      drones.delete(voice);
    };
    voice._sync = () => env.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.15);
    drones.add(voice);
    return voice;
  }

  function setMuted(m) {
    muted = m;
    store.set(MUTE_KEY, m ? '1' : '0');
    if (!ctx) return;
    master.gain.setTargetAtTime(m ? 0 : LEVEL, ctx.currentTime, 0.08);
    drones.forEach(d => d._sync());
  }

  /* A whir: filtered noise whose level and brightness follow a rate (pedalling, a front spreading). */
  function whir() {
    const voice = { set() {}, stop() {} };
    if (!ctx) return voice;
    const n = ctx.sampleRate * 2, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2; bp.frequency.value = 300;
    const env = ctx.createGain(); env.gain.value = 0;
    src.connect(bp).connect(env).connect(out(0)); src.start();
    let target = 0;
    voice.set = (level, bright = 0.5) => { target = level; const t = ctx.currentTime; env.gain.setTargetAtTime(muted ? 0 : level, t, 0.08); bp.frequency.setTargetAtTime(160 + 1400 * bright, t, 0.08); };
    voice.stop = () => { const t = ctx.currentTime; env.gain.setTargetAtTime(0, t, 0.15); src.stop(t + 1); drones.delete(voice); };
    voice._sync = () => env.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.1);
    drones.add(voice);
    return voice;
  }

  return {
    start, pluck, chord, drone, whir, setMuted,
    get muted() { return muted; },
    get ready() { return !!ctx; },
    stopAll() { [...drones].forEach(d => d.stop()); },
  };
}

