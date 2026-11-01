/* Music for the light desk. Every source is a "transport" with the same small interface:
   play, pause, seek, time() and duration, plus an analyser when we can hear the audio.
   - The demo track is synthesised here and rendered offline, so it needs no download.
   - Uploaded audio or video plays through a media element we can analyse.
   - YouTube and Spotify play in their own embedded players. We can follow their clocks but
     not their sound, so the show runs on the beat grid (or a microphone, if you allow it). */

let ctx = null;
export function audioContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/* ---------- the demo track ---------- */
// "Afterglow": deep house at 124 bpm, 96 bars. Its sections are what the default show follows.
export const DEMO = {
  title: 'Afterglow', artist: 'Light desk house band', bpm: 124, bars: 96,
  sections: [
    { at: 0, bars: 8, kind: 'intro' }, { at: 8, bars: 8, kind: 'rise' }, { at: 16, bars: 16, kind: 'groove' },
    { at: 32, bars: 8, kind: 'build' }, { at: 40, bars: 16, kind: 'drop' }, { at: 56, bars: 8, kind: 'break' },
    { at: 64, bars: 8, kind: 'build' }, { at: 72, bars: 16, kind: 'drop2' }, { at: 88, bars: 8, kind: 'outro' },
  ],
};

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
// a four-bar loop: Am9, Fmaj7, Cmaj7, G6, voiced close around middle C
const CHORDS = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 69], [55, 60, 64, 67, 71], [55, 59, 62, 64, 67]];
const ROOTS = [33, 29, 36, 31];
const ARP = [0, 2, 1, 3, 4, 3, 1, 2];

// Rendered offline with a fixed set of instruments (about fifty nodes) played by automation,
// rather than a node per note, so three minutes of music renders in a second or two.
export async function renderDemo(onProgress) {
  const sr = 44100, spb = 60 / DEMO.bpm, bar = spb * 4, len = DEMO.bars * bar + 3;
  const oc = new OfflineAudioContext(2, Math.ceil(len * sr), sr);
  const noise = oc.createBuffer(1, sr * 2, sr);
  { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }

  // busses: drums to the master; music ducks under the kick; a reverb and a delay
  const master = oc.createDynamicsCompressor();
  master.threshold.value = -10; master.ratio.value = 4; master.attack.value = 0.004; master.release.value = 0.2;
  const out = oc.createGain(); out.gain.value = 0.9; master.connect(out); out.connect(oc.destination);
  const drums = oc.createGain(); drums.gain.value = 0.9; drums.connect(master);
  const duck = oc.createGain(); duck.connect(master);
  const verb = oc.createConvolver();
  { const n = sr * 2.8, ir = oc.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2); }
    verb.buffer = ir; }
  const verbOut = oc.createGain(); verbOut.gain.value = 0.32; verb.connect(verbOut); verbOut.connect(duck);
  const delay = oc.createDelay(1); delay.delayTime.value = spb * 0.75;
  const fb = oc.createGain(); fb.gain.value = 0.38; const dly = oc.createGain(); dly.gain.value = 0.3;
  delay.connect(fb); fb.connect(delay); delay.connect(dly); dly.connect(duck);
  const send = (node, dest, amount) => { const g = oc.createGain(); g.gain.value = amount; node.connect(g); g.connect(dest); };

  // an envelope on a gain: attack, then an exponential fall
  const hit = (param, t, peak, a, tau) => { param.setValueAtTime(0, t); param.linearRampToValueAtTime(peak, t + a); param.setTargetAtTime(0, t + a, tau); };
  const noiseVoice = (type, f, q, dest) => {
    const s = oc.createBufferSource(); s.buffer = noise; s.loop = true;
    const fl = oc.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = oc.createGain(); g.gain.value = 0;
    s.connect(fl); fl.connect(g); g.connect(dest); s.start(0, Math.random()); s.stop(len);
    return { fl, g };
  };
  // a bank of oscillators through one filter and one gain: a mono or chord voice
  const oscVoice = (n, type, det, dest) => {
    const fl = oc.createBiquadFilter(); fl.type = 'lowpass';
    const g = oc.createGain(); g.gain.value = 0;
    const oscs = [];
    for (let i = 0; i < n; i++) for (const d of det) {
      const o = oc.createOscillator(); o.type = type; o.detune.value = d; o.connect(fl); o.start(0); o.stop(len);
      oscs.push({ o, i });
    }
    fl.connect(g); g.connect(dest);
    return { fl, g, notes: (t, ms) => { for (const { o, i } of oscs) o.frequency.setValueAtTime(mtof(ms[i % ms.length]), t); } };
  };

  const kickO = oc.createOscillator(), kickG = oc.createGain(); kickG.gain.value = 0;
  kickO.connect(kickG); kickG.connect(drums); kickO.start(0); kickO.stop(len);
  const click = noiseVoice('highpass', 3000, 0.7, drums);
  const hatC = noiseVoice('highpass', 9000, 0.8, drums), hatO = noiseVoice('highpass', 7500, 0.8, drums);
  const clapV = noiseVoice('bandpass', 1400, 1.2, drums), snareV = noiseVoice('bandpass', 1900, 0.9, drums);
  send(clapV.g, verb, 0.35); send(snareV.g, verb, 0.3);
  const riserV = noiseVoice('bandpass', 300, 2, duck); send(riserV.g, verb, 0.5);
  const bass = oscVoice(1, 'sawtooth', [-4, 4], duck); bass.fl.Q.value = 4;
  const pad = oscVoice(5, 'sawtooth', [-12, 12], duck); send(pad.g, verb, 0.7);
  const stab = oscVoice(5, 'sawtooth', [-9, 9], duck); stab.fl.Q.value = 2; send(stab.g, verb, 0.5); send(stab.g, delay, 0.25);
  const lead = oscVoice(1, 'square', [0], duck); lead.fl.Q.value = 3; send(lead.g, verb, 0.35); send(lead.g, delay, 0.45);
  duck.gain.value = 1;

  const kick = t => {
    kickO.frequency.setValueAtTime(160, t); kickO.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    hit(kickG.gain, t, 1.1, 0.003, 0.1);
    hit(click.g.gain, t, 0.25, 0.001, 0.003);
    duck.gain.setValueAtTime(0.32, t); duck.gain.linearRampToValueAtTime(1, t + spb * 0.7);
  };
  let padOn = false;
  const kindAt = b => DEMO.sections.find(s => b >= s.at && b < s.at + s.bars);
  for (let b = 0; b < DEMO.bars; b++) {
    const t0 = 0.05 + b * bar, sec = kindAt(b), kind = sec.kind, ch = CHORDS[b % 4], root = ROOTS[b % 4];
    const inSec = (b - sec.at) / sec.bars;
    const drop = kind === 'drop' || kind === 'drop2', groove = kind === 'groove' || drop;
    const kickOn = (kind === 'rise' || groove || kind === 'outro') && !(kind === 'outro' && b >= 94);
    // drums, in time order within the bar
    const ev = [];
    for (let q = 0; q < 4; q++) {
      const t = t0 + q * spb;
      if (kickOn) ev.push([t, () => kick(t)]);
      if (groove && (q === 1 || q === 3)) ev.push([t, () => { hit(clapV.g.gain, t, 0.42, 0.001, 0.008); hit(clapV.g.gain, t + 0.011, 0.42, 0.001, 0.008); hit(clapV.g.gain, t + 0.023, 0.42, 0.001, 0.05); }]);
      if (groove) for (const [o, v] of [[0, 0.5], [0.25, 0.35], [0.75, 0.4]]) ev.push([t + spb * o, () => hit(hatC.g.gain, t + spb * o, 0.12 * v, 0.001, 0.012)]);
      if (kind !== 'break' && kind !== 'build') ev.push([t + spb / 2, () => groove ? hit(hatO.g.gain, t + spb / 2, 0.16, 0.001, 0.06) : hit(hatC.g.gain, t + spb / 2, 0.12 * (kind === 'intro' ? 0.6 : 1), 0.001, 0.012)]);
    }
    if (kind === 'build') {
      const div = inSec < 0.5 ? 4 : inSec < 0.75 ? 8 : 16;
      for (let i = 0; i < div; i++) { const t = t0 + i * bar / div; ev.push([t, () => hit(snareV.g.gain, t, 0.36 * (0.35 + inSec * 0.8), 0.001, 0.03)]); }
      if (b === sec.at) ev.push([t0, () => {
        const d = sec.bars * bar;
        riserV.fl.frequency.setValueAtTime(300, t0); riserV.fl.frequency.exponentialRampToValueAtTime(9000, t0 + d);
        riserV.g.gain.setValueAtTime(0.0001, t0); riserV.g.gain.exponentialRampToValueAtTime(0.22, t0 + d); riserV.g.gain.linearRampToValueAtTime(0, t0 + d + 0.05);
      }]);
    }
    ev.sort((x, y) => x[0] - y[0]).forEach(e => e[1]());
    // bass: syncopated root and octave
    if (kind !== 'intro' && kind !== 'break' && kind !== 'build') {
      for (const [st, o, d] of [[0.5, 0, 0.4], [1.5, 12, 0.25], [2.5, 0, 0.4], [3.25, 0, 0.2], [3.5, 12, 0.3]]) {
        const t = t0 + st * spb;
        bass.notes(t, [root + o]);
        bass.fl.frequency.setValueAtTime((drop ? 520 : 380) + (drop ? 900 : 500), t); bass.fl.frequency.setTargetAtTime(drop ? 520 : 380, t, 0.06);
        bass.g.gain.setValueAtTime(0, t); bass.g.gain.linearRampToValueAtTime(0.2, t + 0.004); bass.g.gain.setTargetAtTime(0, t + d * spb, 0.02);
      }
    }
    // chords: a held pad in the quiet sections, stabs in the groove
    const padNow = kind === 'intro' || kind === 'break' || kind === 'outro' || kind === 'build';
    if (padNow) {
      pad.notes(t0, ch);
      const c0 = kind === 'build' ? 500 + inSec * 3500 : kind === 'intro' ? 500 + inSec * 900 : 1400;
      const c1 = kind === 'build' ? 500 + (inSec + 1 / sec.bars) * 3500 : kind === 'intro' ? 500 + (inSec + 1 / sec.bars) * 900 : 1400;
      pad.fl.frequency.setValueAtTime(c0, t0); pad.fl.frequency.linearRampToValueAtTime(c1, t0 + bar);
      if (!padOn) { pad.g.gain.setValueAtTime(0, t0); pad.g.gain.setTargetAtTime(0.035, t0, 0.25); padOn = true; }
    } else if (padOn) { pad.g.gain.setTargetAtTime(0, t0, 0.15); padOn = false; }
    if (!padNow) {
      stab.notes(t0, ch);
      for (const st of [0.5, 1.75, 2.5, 3.5]) {
        const t = t0 + st * spb;
        stab.fl.frequency.setValueAtTime((drop ? 2600 : 1600) + 2000, t); stab.fl.frequency.setTargetAtTime(drop ? 2600 : 1600, t, 0.08);
        stab.g.gain.setValueAtTime(0, t); stab.g.gain.linearRampToValueAtTime(0.05, t + 0.004); stab.g.gain.setTargetAtTime(0, t + 0.16 * spb, 0.05);
      }
    }
    // lead arpeggio in the drops and the breakdown
    if (drop || kind === 'break') {
      for (let i = 0; i < 16; i++) {
        const t = t0 + i * spb / 4, m = ch[ARP[i % 8]] + 12 + (i >= 12 && drop ? 12 : 0);
        lead.notes(t, [m]);
        lead.fl.frequency.setValueAtTime((drop ? 3200 : 1800) + 1500, t); lead.fl.frequency.setTargetAtTime(drop ? 3200 : 1800, t, 0.05);
        lead.g.gain.setValueAtTime(0, t); lead.g.gain.linearRampToValueAtTime(drop ? 0.03 : 0.025, t + 0.003); lead.g.gain.setTargetAtTime(0, t + spb / 4 * 0.6, 0.03);
      }
    }
  }
  onProgress?.(0.15);
  const tick = setInterval(() => onProgress?.(0.15 + 0.85 * Math.min(1, (oc.currentTime || 0) / len)), 120);
  try {
    const buffer = await oc.startRendering();
    onProgress?.(1);
    return buffer;
  } finally { clearInterval(tick); }
}

/* ---------- analysis ---------- */
// low, mid and high levels, an overall level and a kick onset, from an AnalyserNode
export class Bands {
  constructor(analyser) {
    this.a = analyser; analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.55;
    this.f = new Uint8Array(analyser.frequencyBinCount);
    this.low = this.mid = this.high = this.level = 0; this.avg = 0.2; this.onset = 0; this.last = 0;
  }
  read(now) {
    this.a.getByteFrequencyData(this.f);
    const hz = this.a.context.sampleRate / this.a.fftSize, f = this.f;
    const band = (lo, hi) => { let s = 0, n = 0; for (let i = Math.max(1, Math.floor(lo / hz)); i <= Math.min(f.length - 1, hi / hz); i++, n++) s += f[i]; return n ? s / n / 255 : 0; };
    const low = band(30, 140), mid = band(140, 2200), high = band(2200, 11000);
    // an onset is the low band jumping well above its running average
    if (low > this.avg * 1.28 + 0.06 && low > this.low + 0.03 && now - this.last > 0.18) { this.onset = 1; this.last = now; }
    this.avg += (low - this.avg) * 0.04;
    this.low = low; this.mid = mid; this.high = high; this.level = low * 0.5 + mid * 0.35 + high * 0.15;
    return this;
  }
  fft() { return this.f; }
}

// tempo, downbeat and energy per bar, from decoded audio (mono, any rate)
export function analyse(buffer, knownBpm = 0) {
  const sr = buffer.sampleRate, d = buffer.getChannelData(0), hop = Math.round(sr / 86);  // ~86 frames a second
  const n = Math.floor(d.length / hop), en = new Float32Array(n), flux = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    let s = 0; const o = i * hop;
    for (let j = 0; j < hop; j++) { lp += (d[o + j] - lp) * 0.08; s += lp * lp; }   // a rough low-pass favours the kick
    en[i] = Math.sqrt(s / hop);
  }
  for (let i = 1; i < n; i++) flux[i] = Math.max(0, en[i] - en[i - 1]);
  const fps = sr / hop;
  let bpm = knownBpm;
  if (!bpm) {
    let best = 0;
    for (let b = 70; b <= 180; b += 0.5) {
      const lag = fps * 60 / b; let s = 0;
      for (let i = 0; i + lag * 4 < n; i += 2) s += flux[i] * (flux[Math.round(i + lag)] + 0.5 * flux[Math.round(i + lag * 2)] + 0.25 * flux[Math.round(i + lag * 4)]);
      s *= Math.exp(-Math.pow(Math.log2(b / 122), 2) * 1.6);   // prefer dance tempos when two fold into each other
      if (s > best) { best = s; bpm = b; }
    }
  }
  const per = fps * 60 / bpm;
  let off = 0, bestP = -1;
  for (let p = 0; p < per; p += 0.5) { let s = 0; for (let k = p; k < n; k += per) s += flux[Math.round(k)]; if (s > bestP) { bestP = s; off = p; } }
  const offset = off / fps, barLen = 4 * 60 / bpm, bars = Math.ceil((d.length / sr - offset) / barLen);
  const energy = new Float32Array(Math.max(1, bars));
  for (let b = 0; b < bars; b++) {
    const a = Math.floor((offset + b * barLen) * fps), z = Math.min(n, Math.floor((offset + (b + 1) * barLen) * fps));
    let s = 0; for (let i = a; i < z; i++) s += en[i]; energy[b] = z > a ? s / (z - a) : 0;
  }
  const mx = Math.max(...energy, 1e-6);
  for (let b = 0; b < bars; b++) energy[b] /= mx;
  return { bpm: Math.round(bpm * 10) / 10, offset, energy, duration: d.length / sr };
}

/* ---------- transports ---------- */
class Clock {
  constructor() { this.pos = 0; this.at = 0; this.playing = false; this.rate = 1; }
  time() { return this.playing ? this.pos + (performance.now() - this.at) / 1000 : this.pos; }
  set(t, playing = this.playing) { this.pos = t; this.at = performance.now(); this.playing = playing; }
}

export class BufferTransport {
  constructor(buffer, { title, artist } = {}) {
    const c = audioContext();
    this.kind = 'buffer'; this.buffer = buffer; this.title = title; this.artist = artist;
    this.duration = buffer.duration; this.gain = c.createGain(); this.analyser = c.createAnalyser();
    this.gain.connect(this.analyser); this.analyser.connect(c.destination);
    this.src = null; this.offset = 0; this.started = 0; this.playing = false;
  }
  time() { return this.playing ? Math.min(this.duration, this.offset + audioContext().currentTime - this.started) : this.offset; }
  play() {
    if (this.playing) return;
    const c = audioContext();
    if (this.offset >= this.duration - 0.05) this.offset = 0;
    this.src = c.createBufferSource(); this.src.buffer = this.buffer; this.src.connect(this.gain);
    this.src.onended = () => { if (this.playing && this.time() >= this.duration - 0.1) { this.playing = false; this.offset = this.duration; this.onend?.(); } };
    this.started = c.currentTime; this.src.start(0, this.offset); this.playing = true;
  }
  pause() { if (!this.playing) return; this.offset = this.time(); this.playing = false; this.src.onended = null; this.src.stop(); this.src = null; }
  seek(t) { const p = this.playing; if (p) this.pause(); this.offset = Math.max(0, Math.min(this.duration, t)); if (p) this.play(); }
  setVolume(v) { this.gain.gain.value = v; }
  destroy() { this.pause(); this.gain.disconnect(); this.analyser.disconnect(); }
}

export class MediaTransport {
  constructor(file) {
    const c = audioContext();
    this.kind = 'file'; this.title = file.name.replace(/\.[^.]+$/, ''); this.artist = 'Uploaded';
    this.el = document.createElement(file.type.startsWith('video') ? 'video' : 'audio');
    this.el.src = URL.createObjectURL(file); this.el.preload = 'auto'; this.el.crossOrigin = 'anonymous';
    this.node = c.createMediaElementSource(this.el); this.gain = c.createGain(); this.analyser = c.createAnalyser();
    this.node.connect(this.gain); this.gain.connect(this.analyser); this.analyser.connect(c.destination);
    this.duration = 0;
    this.ready = new Promise((res, rej) => {
      this.el.addEventListener('loadedmetadata', () => { this.duration = this.el.duration || 0; res(); }, { once: true });
      this.el.addEventListener('error', () => rej(new Error('That file could not be played in this browser.')), { once: true });
    });
    this.el.addEventListener('ended', () => this.onend?.());
  }
  get playing() { return !this.el.paused; }
  time() { return this.el.currentTime || 0; }
  play() { audioContext(); return this.el.play(); }
  pause() { this.el.pause(); }
  seek(t) { this.el.currentTime = Math.max(0, Math.min(this.duration || 1e9, t)); }
  setVolume(v) { this.gain.gain.value = v; }
  destroy() { this.el.pause(); URL.revokeObjectURL(this.el.src); this.node.disconnect(); this.gain.disconnect(); this.analyser.disconnect(); }
}

// silence on a clock, for programming without music
export class SilentTransport {
  constructor(duration = 210) { this.kind = 'silent'; this.title = 'No music'; this.artist = 'Metronome only'; this.duration = duration; this.c = new Clock(); }
  get playing() { return this.c.playing; }
  time() { const t = this.c.time(); if (t >= this.duration) { this.c.set(this.duration, false); this.onend?.(); } return Math.min(t, this.duration); }
  play() { this.c.set(this.c.pos >= this.duration ? 0 : this.c.pos, true); }
  pause() { this.c.set(this.time(), false); }
  seek(t) { this.c.set(Math.max(0, Math.min(this.duration, t))); }
  setVolume() {}
  destroy() {}
}

export function parseLink(url) {
  const s = url.trim();
  let m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
  if (m) return { kind: 'youtube', id: m[1] };
  m = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|episode)\/([A-Za-z0-9]+)/) || s.match(/spotify:(track|episode):([A-Za-z0-9]+)/);
  if (m) return { kind: 'spotify', type: m[1], id: m[2] };
  return null;
}

const loaded = {};
function loadScript(src, ready) {
  if (!loaded[src]) loaded[src] = new Promise((res, rej) => {
    ready(res);
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onerror = () => { delete loaded[src]; rej(new Error('Could not reach the player. Check your connection or content blocker.')); };
    document.head.append(s);
  });
  return loaded[src];
}

export class YouTubeTransport {
  constructor(id, host) {
    this.kind = 'youtube'; this.id = id; this.title = 'YouTube video'; this.artist = 'YouTube'; this.duration = 0; this.c = new Clock();
    this.ready = loadScript('https://www.youtube.com/iframe_api', res => {
      const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT); };
      if (window.YT?.Player) res(window.YT);
    }).then(YT => new Promise((res, rej) => {
      const el = document.createElement('div'); host.replaceChildren(el);
      this.player = new YT.Player(el, {
        videoId: id, width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 1 },
        events: {
          onReady: () => {
            this.duration = this.player.getDuration() || 0;
            const d = this.player.getVideoData?.(); if (d?.title) { this.title = d.title; this.artist = d.author || 'YouTube'; }
            res();
          },
          onStateChange: e => {
            const st = e.data, t = this.player.getCurrentTime?.() || 0;
            if (st === 1) { this.duration = this.player.getDuration() || this.duration; this.c.set(t, true); }
            else if (st === 2 || st === 3) this.c.set(t, false);
            else if (st === 0) { this.c.set(this.duration, false); this.onend?.(); }
            this.onstate?.();
          },
          onError: () => rej(new Error('YouTube would not play that video here. Some videos block embedding.')),
        },
      });
    }));
  }
  get playing() { return this.c.playing; }
  time() {
    // the player's own clock, smoothed so the show doesn't stutter between its updates
    const p = this.player?.getCurrentTime?.();
    if (this.c.playing && p != null && Math.abs(p - this.c.time()) > 0.08) this.c.set(p, true);
    return this.c.time();
  }
  play() { this.player?.playVideo(); }
  pause() { this.player?.pauseVideo(); this.c.set(this.time(), false); }
  seek(t) { this.player?.seekTo(t, true); this.c.set(t); }
  setVolume(v) { this.player?.setVolume?.(Math.round(v * 100)); }
  destroy() { try { this.player?.destroy(); } catch {} }
}

export class SpotifyTransport {
  constructor(type, id, host) {
    this.kind = 'spotify'; this.id = id; this.title = 'Spotify track'; this.artist = 'Spotify'; this.duration = 0; this.c = new Clock();
    this.ready = loadScript('https://open.spotify.com/embed/iframe-api/v1', res => {
      const prev = window.onSpotifyIframeApiReady; window.onSpotifyIframeApiReady = api => { prev?.(api); window.__spotifyApi = api; res(api); };
      if (window.__spotifyApi) res(window.__spotifyApi);
    }).then(api => new Promise(res => {
      const el = document.createElement('div'); host.replaceChildren(el);
      api.createController(el, { uri: `spotify:${type}:${id}`, width: '100%', height: 152 }, ctl => {
        this.ctl = ctl;
        ctl.addListener('ready', () => res());
        ctl.addListener('playback_update', e => {
          const { position, duration, isPaused, isBuffering } = e.data;
          if (duration) this.duration = duration / 1000;
          this.c.set(position / 1000, !isPaused && !isBuffering);
          if (!isPaused && this.duration && position / 1000 >= this.duration - 0.25) this.onend?.();
          this.onstate?.();
        });
      });
    }));
  }
  get playing() { return this.c.playing; }
  time() { return Math.min(this.c.time(), this.duration || 1e9); }
  play() { this.ctl?.resume(); }
  pause() { this.ctl?.pause(); this.c.set(this.time(), false); }
  seek(t) { this.ctl?.seek(t); this.c.set(t); }
  setVolume() {}
  destroy() { try { this.ctl?.destroy(); } catch {} }
}

// a microphone, to follow music that plays somewhere we can't analyse
export async function openMic() {
  const c = audioContext();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const src = c.createMediaStreamSource(stream), analyser = c.createAnalyser();
  src.connect(analyser);
  return { analyser, close: () => { stream.getTracks().forEach(t => t.stop()); src.disconnect(); } };
}

// decode an uploaded file at a low rate, just for tempo and energy
export async function decodeForAnalysis(file) {
  const buf = await file.arrayBuffer();
  const oc = new OfflineAudioContext(1, 11025, 11025);
  return oc.decodeAudioData(buf);
}
