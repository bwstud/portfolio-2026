/* Sound sources for the spectrogram. Each source writes mono samples at SR, in order, into
   whatever buffer it is handed, reading its settings live from the object it was made with,
   so a slider moves the sound on the next block. Most are additive: banks of sine
   oscillators whose frequencies and levels follow a score, which keeps them clean enough
   that what the spectrogram shows is what the source meant to make. */

export const SR = 48000;
export const TAU = Math.PI * 2;
const NYQ = SR / 2;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const midiHz = (n) => 440 * Math.pow(2, (n - 69) / 12);

/* ---------- chirp ---------- */

class Chirp {
  constructor(p) { this.p = p; this.ph = 0; this.n = 0; }
  freq(t) {
    const { from, to, period, curve, updown } = this.p;
    let u = t / period;
    u = updown ? ((u % 2) + 2) % 2 : ((u % 1) + 1) % 1;
    const tri = u < 1 ? u : 2 - u;
    return curve === 'exp' ? from * Math.pow(to / from, tri) : from + (to - from) * tri;
  }
  fill(o, n) {
    const H = Math.max(1, Math.round(this.p.harmonics));
    for (let i = 0; i < n; i++) {
      const f = this.freq(this.n++ / SR);
      this.ph += f / SR;
      this.ph -= Math.floor(this.ph);
      const a = TAU * this.ph;
      const s1 = Math.sin(a);
      let v = s1;
      if (H > 1) {
        // sin(k a) by the Chebyshev recurrence, skipping partials above Nyquist
        const c2 = 2 * Math.cos(a);
        let sp = 0, sc = s1;
        for (let k = 2; k <= H && k * f < NYQ; k++) {
          const sk = c2 * sc - sp;
          sp = sc; sc = sk;
          v += sk / k;
        }
        v *= 0.6;
      }
      o[i] = v * 0.5;
    }
  }
}

/* ---------- piano ---------- */

const PROGRESSION = [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]];   // I, V, vi, IV
const PENTA = [0, 2, 4, 7, 9];

class Piano {
  constructor(p) { this.p = p; this.n = 0; this.voices = []; this.next = 0; this.step = 0; this.r = rng(7); this.walk = 7; }
  strike(midi, vel) {
    const f0 = midiHz(midi);
    const B = 0.00035 * Math.pow(2, (midi - 60) / 24);   // stiff strings: partials run sharp
    const parts = [];
    const bright = this.p.brightness;
    for (let k = 1; k <= 16; k++) {
      const f = k * f0 * Math.sqrt(1 + B * k * k);
      if (f > NYQ * 0.95) break;
      const w = TAU * f / SR;
      const amp = vel * Math.pow(0.35 + 0.55 * bright, k - 1) / Math.sqrt(k) * (k === 1 ? 1 : 0.9);
      const decay = Math.exp(-(0.9 + 0.55 * k * (1.2 - bright * 0.6)) * (1 + (midi - 60) / 48) / SR);
      const ph = this.r() * TAU;
      parts.push({ c: Math.cos(ph), s: Math.sin(ph), dc: Math.cos(w), ds: Math.sin(w), a: amp, d: decay });
    }
    this.voices.push({ parts, age: 0 });
    if (this.voices.length > 14) this.voices.shift();
  }
  schedule() {
    const { tempo, pattern, key } = this.p;
    const beat = 60 / tempo;
    const root = 48 + key;
    const bar = Math.floor(this.step / 8) % 4;
    const chord = PROGRESSION[bar];
    const s = this.step % 8;
    if (pattern === 'chords') {
      if (s === 0 || s === 4) {
        for (const iv of chord) this.strike(root + 12 + iv, 0.32);
        this.strike(root + chord[0] - 12 + 12, 0.3);
      }
    } else if (pattern === 'melody') {
      this.walk = Math.max(0, Math.min(14, this.walk + Math.round((this.r() - 0.5) * 4)));
      const deg = this.walk;
      const midi = root + 12 + 12 * Math.floor(deg / 5) + PENTA[deg % 5];
      if (this.r() > 0.15) this.strike(midi, 0.32 + this.r() * 0.15);
      if (s === 0) this.strike(root + chord[0], 0.28);
    } else {
      const arp = [0, 1, 2, 1, 0, 1, 2, 1];
      const iv = chord[arp[s]] + (s >= 2 && s <= 4 ? 12 : 0);
      this.strike(root + 12 + iv, 0.36);
      if (s === 0) this.strike(root + chord[0], 0.3);
    }
    this.step++;
    this.next += Math.round((beat / 2) * SR);
  }
  fill(o, n) {
    for (let i = 0; i < n; i++) {
      if (this.n >= this.next) this.schedule();
      let v = 0;
      for (const vc of this.voices) {
        const env = vc.age < 96 ? vc.age / 96 : 1;
        for (const q of vc.parts) {
          v += q.s * q.a * env;
          const c = q.c * q.dc - q.s * q.ds;
          q.s = q.s * q.dc + q.c * q.ds;
          q.c = c;
          q.a *= q.d;
        }
        vc.age++;
      }
      o[i] = v * 0.5;
      this.n++;
    }
    // keep the oscillators on the unit circle and drop voices that have died away
    for (const vc of this.voices) for (const q of vc.parts) { const m = 1 / Math.hypot(q.c, q.s); q.c *= m; q.s *= m; }
    this.voices = this.voices.filter((vc) => vc.parts.some((q) => q.a > 2e-4));
  }
}

/* ---------- voice ---------- */

// formant frequencies and bandwidths (Hz) for an adult voice
export const VOWELS = {
  a: [[800, 80], [1150, 90], [2900, 120], [3900, 130]],
  e: [[400, 70], [1700, 80], [2600, 100], [3600, 120]],
  i: [[270, 60], [2300, 90], [3000, 100], [3700, 120]],
  o: [[450, 70], [800, 80], [2830, 100], [3800, 120]],
  u: [[325, 50], [700, 60], [2530, 170], [3500, 180]],
};
const VOWEL_ORDER = ['a', 'e', 'i', 'o', 'u'];

class Voice {
  constructor(p) { this.p = p; this.n = 0; this.ph = 0; this.amps = new Float64Array(82); this.r = rng(3); this.lp = 0; }
  formants(t) {
    const { vowel, rate } = this.p;
    if (vowel !== 'cycle') return VOWELS[vowel];
    const u = t * rate;
    const i = Math.floor(u), f = u - i;
    const a = VOWELS[VOWEL_ORDER[i % 5]], b = VOWELS[VOWEL_ORDER[(i + 1) % 5]];
    // hold each vowel, then glide quickly to the next
    const g = f < 0.6 ? 0 : (1 - Math.cos(((f - 0.6) / 0.4) * Math.PI)) / 2;
    return a.map(([fa, ba], k) => [fa + (b[k][0] - fa) * g, ba + (b[k][1] - ba) * g]);
  }
  pitch(t) {
    const { pitch, vibrato } = this.p;
    // a falling phrase contour, with a wobble of vibrato
    const ph = (t % 3.2) / 3.2;
    const contour = 1.12 - 0.22 * ph + 0.06 * Math.sin(TAU * t * 0.7);
    return pitch * contour * (1 + vibrato * 0.025 * Math.sin(TAU * 5.4 * t));
  }
  control(t, f0) {
    const fm = this.formants(t);
    const K = Math.min(80, Math.floor((NYQ * 0.9) / f0));
    this.K = K;
    for (let k = 1; k <= K; k++) {
      const f = k * f0;
      let g = 0;
      for (let j = 0; j < fm.length; j++) {
        const [F, B] = fm[j];
        const d = (f - F) / (B * 0.5);
        g += (j === 0 ? 1 : j === 1 ? 0.7 : 0.35) / (1 + d * d);
      }
      // the glottal source falls about 12 dB an octave
      this.amps[k] = (g + 0.012) / k;
    }
  }
  fill(o, n) {
    const { breath } = this.p;
    for (let i = 0; i < n; i++) {
      const t = this.n / SR;
      const f0 = this.pitch(t);
      if ((this.n & 63) === 0) this.control(t, f0);
      // syllables: the voice switches off briefly between them
      const sy = (t % 3.2);
      const env = !this.p.pauses ? 1 : sy > 2.8 ? 0 : Math.min(1, sy / 0.05, (2.8 - sy) / 0.05);
      this.ph += f0 / SR;
      this.ph -= Math.floor(this.ph);
      const a = TAU * this.ph;
      const s1 = Math.sin(a), c2 = 2 * Math.cos(a);
      let sp = 0, sc = s1, v = this.amps[1] * s1;
      for (let k = 2; k <= this.K; k++) {
        const sk = c2 * sc - sp;
        sp = sc; sc = sk;
        v += this.amps[k] * sk;
      }
      const w = this.r() * 2 - 1;
      this.lp += (w - this.lp) * 0.35;
      // the breath carries on, quieter, between syllables
      o[i] = v * 0.55 * env + (w - this.lp) * breath * 0.25 * (0.35 + 0.65 * env);
      this.n++;
    }
  }
}

/* ---------- birdsong ---------- */

const SHAPES = ['down', 'up', 'chevron', 'trill', 'whistle', 'hook'];

class Birds {
  constructor(p) {
    this.p = p; this.n = 0; this.r = rng(11);
    this.birds = [0, 1, 2].map((b) => ({ ph: 0, note: null, wait: Math.round((0.2 + b * 0.7) * SR), phrase: [], base: 0 }));
  }
  phrase(b, idx) {
    const r = this.r;
    const centre = this.p.pitch * (0.7 + 0.45 * idx) * (0.85 + r() * 0.3);
    const notes = [];
    const count = 3 + Math.floor(r() * 9 * this.p.busy);
    const kind = SHAPES[Math.floor(r() * SHAPES.length)];
    const dur = 0.04 + r() * 0.12;
    for (let i = 0; i < count; i++) {
      const sh = r() < 0.7 ? kind : SHAPES[Math.floor(r() * SHAPES.length)];
      notes.push({ shape: sh, fc: centre * (1 + (r() - 0.5) * 0.25 + (i / count) * (r() - 0.4) * 0.4), bw: centre * (0.15 + r() * 0.35), len: Math.round(dur * (0.7 + r() * 0.6) * SR), gap: Math.round((0.02 + r() * 0.06) * SR), trill: 18 + r() * 30 });
    }
    b.phrase = notes;
  }
  track(nt, u) {
    switch (nt.shape) {
      case 'down': return nt.fc + nt.bw * (0.5 - u);
      case 'up': return nt.fc + nt.bw * (u - 0.5);
      case 'chevron': return nt.fc + nt.bw * (0.5 - Math.abs(u - 0.5) * 2) * 0.8;
      case 'trill': return nt.fc + nt.bw * 0.35 * Math.sin(TAU * nt.trill * u * nt.len / SR);
      case 'hook': return nt.fc + nt.bw * (0.6 - u * u * 1.2);
      default: return nt.fc * (1 + 0.015 * u);
    }
  }
  fill(o, n) {
    const count = Math.round(this.p.count);
    o.fill(0, 0, n);
    for (let bi = 0; bi < count; bi++) {
      const b = this.birds[bi];
      for (let i = 0; i < n; i++) {
        if (!b.note) {
          if (b.wait > 0) { b.wait--; continue; }
          if (!b.phrase.length) {
            this.phrase(b, bi);
          }
          b.note = { ...b.phrase.shift(), k: 0 };
        }
        const nt = b.note;
        if (nt.k < nt.len) {
          const u = nt.k / nt.len;
          const f = Math.min(NYQ * 0.9, this.track(nt, u));
          b.ph += f / SR;
          b.ph -= Math.floor(b.ph);
          const env = Math.sin(Math.PI * u);
          const a = TAU * b.ph;
          o[i] += (Math.sin(a) + 0.12 * Math.sin(2 * a)) * env * env * 0.42;
        }
        nt.k++;
        if (nt.k >= nt.len + nt.gap) {
          b.note = null;
          if (!b.phrase.length) b.wait = Math.round((0.6 + this.r() * 2.2 / Math.max(0.2, this.p.busy)) * SR);
        }
      }
    }
    this.n += n;
  }
}

/* ---------- whale song ---------- */

class Whale {
  constructor(p) { this.p = p; this.n = 0; this.ph = 0; this.r = rng(5); this.unit = null; this.wait = Math.round(0.3 * SR); this.lp1 = 0; this.lp2 = 0; }
  newUnit() {
    const r = this.r, base = this.p.pitch;
    const kinds = ['rise', 'fall', 'moan', 'warble', 'whoop'];
    const kind = kinds[Math.floor(r() * kinds.length)];
    const len = Math.round((0.8 + r() * 2.4) / this.p.pace * SR);
    this.unit = { kind, len, k: 0, f0: base * (0.6 + r() * 1.2), span: base * (0.3 + r() * 1.4), wob: 2 + r() * 6, harm: 3 + Math.floor(r() * 6) };
  }
  freq(u) {
    const q = this.unit;
    switch (q.kind) {
      case 'rise': return q.f0 + q.span * u * u;
      case 'fall': return q.f0 + q.span * (1 - u);
      case 'warble': return q.f0 + q.span * 0.2 * Math.sin(TAU * q.wob * u * q.len / SR / 2);
      case 'whoop': return q.f0 + q.span * Math.sin(Math.PI * u);
      default: return q.f0 * (1 + 0.08 * Math.sin(TAU * u));
    }
  }
  fill(o, n) {
    for (let i = 0; i < n; i++) {
      let v = 0;
      if (!this.unit) {
        if (this.wait > 0) this.wait--;
        else this.newUnit();
      }
      const q = this.unit;
      if (q) {
        const u = q.k / q.len;
        const f = this.freq(u);
        this.ph += f / SR;
        this.ph -= Math.floor(this.ph);
        const a = TAU * this.ph;
        const s1 = Math.sin(a), c2 = 2 * Math.cos(a);
        let sp = 0, sc = s1;
        v = s1;
        for (let k = 2; k <= q.harm && k * f < NYQ; k++) {
          const sk = c2 * sc - sp;
          sp = sc; sc = sk;
          v += sk * Math.pow(0.55, k - 1);
        }
        const env = Math.pow(Math.sin(Math.PI * u), 0.7);
        v *= env * 0.4;
        if (++q.k >= q.len) { this.unit = null; this.wait = Math.round((0.15 + this.r() * 1.1) / this.p.pace * SR); }
      }
      // the sea: deep rumbling noise
      const w = this.r() * 2 - 1;
      this.lp1 += (w - this.lp1) * 0.01;
      this.lp2 += (this.lp1 - this.lp2) * 0.01;
      o[i] = v + this.lp2 * this.p.sea * 2.5;
    }
    this.n += n;
  }
}

/* ---------- FM synthesis ---------- */

class FM {
  constructor(p) { this.p = p; this.n = 0; this.cp = 0; this.mp = 0; this.voices = []; this.next = 0; this.r = rng(9); }
  fill(o, n) {
    const { carrier, ratio, index, sweep, mode } = this.p;
    for (let i = 0; i < n; i++) {
      const t = this.n / SR;
      let v = 0;
      if (mode === 'bells') {
        if (this.n >= this.next) {
          const deg = Math.floor(this.r() * 8);
          const f = carrier * Math.pow(2, (12 * Math.floor(deg / 5) + PENTA[deg % 5]) / 12);
          this.voices.push({ f, cp: 0, mp: 0, age: 0 });
          if (this.voices.length > 6) this.voices.shift();
          this.next = this.n + Math.round((0.35 + this.r() * 0.6) * SR);
        }
        for (const vc of this.voices) {
          const a = vc.age / SR;
          const env = Math.exp(-a * 1.1) * Math.min(1, vc.age / 40);
          const I = index * Math.exp(-a * 2.2);
          vc.mp += (vc.f * ratio) / SR; vc.mp -= Math.floor(vc.mp);
          vc.cp += vc.f / SR; vc.cp -= Math.floor(vc.cp);
          v += Math.sin(TAU * vc.cp + I * Math.sin(TAU * vc.mp)) * env * 0.3;
          vc.age++;
        }
      } else {
        const I = index * (0.5 - 0.5 * Math.cos(TAU * t / sweep));
        this.mp += (carrier * ratio) / SR; this.mp -= Math.floor(this.mp);
        this.cp += carrier / SR; this.cp -= Math.floor(this.cp);
        v = Math.sin(TAU * this.cp + I * Math.sin(TAU * this.mp)) * 0.45;
      }
      o[i] = v;
      this.n++;
    }
    this.voices = this.voices.filter((vc) => vc.age < SR * 5);
  }
}

/* ---------- phone dialling ---------- */

const DTMF_ROWS = [697, 770, 852, 941];
const DTMF_COLS = [1209, 1336, 1477, 1633];
const KEYPAD = ['123A', '456B', '789C', '*0#D'];
export function dtmfPair(ch) {
  for (let r = 0; r < 4; r++) {
    const c = KEYPAD[r].indexOf(ch.toUpperCase());
    if (c >= 0) return [DTMF_ROWS[r], DTMF_COLS[c]];
  }
  return null;
}

class Phone {
  constructor(p) { this.p = p; this.n = 0; this.events = []; this.k = 0; this.a = 0; this.b = 0; }
  plan() {
    // dial tone, the number, then the ringing tone twice
    const ev = [];
    const sp = this.p.speed;
    ev.push({ f: [350, 440], len: 1.2 }, { f: null, len: 0.25 });
    for (const ch of this.p.number) {
      const pr = dtmfPair(ch);
      if (!pr) { ev.push({ f: null, len: 0.25 / sp }); continue; }
      ev.push({ f: pr, len: 0.12 / sp }, { f: null, len: 0.08 / sp });
    }
    ev.push({ f: null, len: 0.8 });
    for (let i = 0; i < 2; i++) ev.push({ f: [440, 480], len: 1.0 }, { f: null, len: 1.4 });
    this.events = ev.map((e) => ({ ...e, len: Math.round(e.len * SR) }));
    this.k = 0;
  }
  fill(o, n) {
    for (let i = 0; i < n; i++) {
      if (!this.events.length) this.plan();
      const e = this.events[0];
      let v = 0;
      if (e.f) {
        this.a += e.f[0] / SR; this.a -= Math.floor(this.a);
        this.b += e.f[1] / SR; this.b -= Math.floor(this.b);
        const env = Math.min(1, this.k / 240, (e.len - this.k) / 240);
        v = (Math.sin(TAU * this.a) + Math.sin(TAU * this.b)) * 0.28 * env;
      }
      o[i] = v;
      if (++this.k >= e.len) { this.events.shift(); this.k = 0; }
      this.n++;
    }
  }
}

/* ---------- hidden message ---------- */

const MSG_ROWS = 44;

function rasterise(text) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = `700 ${MSG_ROWS - 8}px "Geist", Helvetica, Arial, sans-serif`;
  ctx.font = font;
  const w = Math.max(8, Math.ceil(ctx.measureText(text).width) + 8);
  c.width = w; c.height = MSG_ROWS;
  ctx.font = font;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 4, MSG_ROWS / 2 + 1);
  const px = ctx.getImageData(0, 0, w, MSG_ROWS).data;
  const img = new Float32Array(w * MSG_ROWS);
  for (let i = 0; i < w * MSG_ROWS; i++) img[i] = px[i * 4 + 3] / 255;
  return { w, img, perChar: w / Math.max(1, text.length) };
}

class Message {
  constructor(p) {
    this.p = p; this.n = 0; this.col = -1; this.key = '';
    this.c = new Float64Array(MSG_ROWS); this.s = new Float64Array(MSG_ROWS);
    this.dc = new Float64Array(MSG_ROWS); this.ds = new Float64Array(MSG_ROWS);
    const r = rng(21);
    for (let i = 0; i < MSG_ROWS; i++) { const ph = r() * TAU; this.c[i] = Math.cos(ph); this.s[i] = Math.sin(ph); }
    this.pos = 0;
  }
  setup() {
    const { text, low, high } = this.p;
    const key = `${text}|${low}|${high}`;
    if (key === this.key) return;
    this.key = key;
    this.bmp = rasterise(text || ' ');
    for (let r = 0; r < MSG_ROWS; r++) {
      const f = high - ((r + 0.5) / MSG_ROWS) * (high - low);
      const w = TAU * Math.min(f, NYQ * 0.98) / SR;
      this.dc[r] = Math.cos(w); this.ds[r] = Math.sin(w);
    }
  }
  fill(o, n) {
    this.setup();
    const { w, img, perChar } = this.bmp;
    const colLen = (this.p.perChar / perChar) * SR;
    const total = w + perChar * 1.5;   // a short gap before it repeats
    const R = MSG_ROWS;
    for (let i = 0; i < n; i++) {
      const x = this.pos / colLen;
      const xi = Math.floor(x), xf = x - xi;
      let v = 0;
      if (xi < w) {
        const x1 = Math.min(w - 1, xi + 1);
        for (let r = 0; r < R; r++) {
          const a = img[r * w + xi] * (1 - xf) + (xi + 1 < w ? img[r * w + x1] * xf : 0);
          if (a > 0.004) v += a * this.s[r];
        }
      }
      for (let r = 0; r < R; r++) {
        const c = this.c[r] * this.dc[r] - this.s[r] * this.ds[r];
        this.s[r] = this.s[r] * this.dc[r] + this.c[r] * this.ds[r];
        this.c[r] = c;
      }
      o[i] = v * 0.09;
      this.pos++;
      if (this.pos >= total * colLen) this.pos = 0;
      this.n++;
    }
    for (let r = 0; r < R; r++) { const m = 1 / Math.hypot(this.c[r], this.s[r]); this.c[r] *= m; this.s[r] *= m; }
  }
}

/* ---------- drum machine ---------- */

export const BEATS = {
  rock: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', open: '..............x.' },
  house: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', open: '..x...x...x...x.' },
  break: { kick: 'x.........x.....', snare: '....x..x.x..x..x', hat: 'x.xxx.x.x.xxx.x.', open: '.......x........' },
};

class Drums {
  constructor(p) { this.p = p; this.n = 0; this.next = 0; this.step = 0; this.r = rng(13); this.hits = []; this.hp = 0; this.hx = 0; }
  trigger() {
    const pat = BEATS[this.p.beat];
    const s = this.step % 16;
    for (const inst of ['kick', 'snare', 'hat', 'open']) if (pat[inst][s] === 'x') this.hits.push({ inst, age: 0, ph: 0 });
    this.step++;
    const sixteenth = 60 / this.p.tempo / 4;
    const swing = s % 2 === 0 ? 1 + this.p.swing * 0.5 : 1 - this.p.swing * 0.5;
    this.next += Math.round(sixteenth * swing * SR);
  }
  fill(o, n) {
    for (let i = 0; i < n; i++) {
      if (this.n >= this.next) this.trigger();
      const w = this.r() * 2 - 1;
      // high-passed noise for the cymbals
      const hpOut = w - this.hx + 0.6 * this.hp;
      this.hx = w; this.hp = hpOut;
      let v = 0;
      for (const h of this.hits) {
        const t = h.age / SR;
        if (h.inst === 'kick') {
          const f = 45 + 110 * Math.exp(-t * 28);
          h.ph += f / SR;
          v += Math.sin(TAU * h.ph) * Math.exp(-t * 7) * 0.9 + w * Math.exp(-t * 300) * 0.2;
        } else if (h.inst === 'snare') {
          h.ph += 185 / SR;
          v += Math.sin(TAU * h.ph) * Math.exp(-t * 30) * 0.35 + w * Math.exp(-t * 17) * 0.45;
        } else if (h.inst === 'hat') {
          v += hpOut * Math.exp(-t * 70) * 0.28;
        } else {
          v += hpOut * Math.exp(-t * 9) * 0.2;
        }
        h.age++;
      }
      o[i] = v * 0.7;
      this.n++;
    }
    this.hits = this.hits.filter((h) => h.age < SR * 1.2);
  }
}

/* ---------- noise ---------- */

class Noise {
  constructor(p) { this.p = p; this.n = 0; this.r = rng(17); this.b = new Float64Array(7); this.br = 0; this.lo = 0; this.band = 0; }
  fill(o, n) {
    const { color, sweep, period, q } = this.p;
    for (let i = 0; i < n; i++) {
      const w = this.r() * 2 - 1;
      let v;
      if (color === 'pink') {
        // Paul Kellet's pink filter
        const b = this.b;
        b[0] = 0.99886 * b[0] + w * 0.0555179; b[1] = 0.99332 * b[1] + w * 0.0750759;
        b[2] = 0.969 * b[2] + w * 0.153852; b[3] = 0.8665 * b[3] + w * 0.3104856;
        b[4] = 0.55 * b[4] + w * 0.5329522; b[5] = -0.7616 * b[5] - w * 0.016898;
        v = (b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362) * 0.11;
        b[6] = w * 0.115926;
      } else if (color === 'brown') {
        this.br = (this.br + w * 0.02) * 0.998;
        v = this.br * 3.2;
      } else v = w * 0.5;
      if (sweep) {
        // a resonant band-pass gliding up and down in pitch
        const t = this.n / SR;
        const u = 0.5 - 0.5 * Math.cos(TAU * t / period);
        const fc = 150 * Math.pow(12000 / 150, u);
        const F = 2 * Math.sin(Math.PI * fc / SR), damp = 1 / q;
        const hi = v - this.lo - damp * this.band;
        this.band += F * hi;
        this.lo += F * this.band;
        v = this.band * Math.min(1.5, 2.2 / Math.sqrt(q)) * 0.9;
      }
      o[i] = v;
      this.n++;
    }
  }
}

/* ---------- audio file ---------- */

class FilePlayer {
  constructor(p) { this.p = p; this.pos = 0; }
  fill(o, n) {
    const d = this.p.data;
    if (!d || !d.length) { o.fill(0, 0, n); return; }
    for (let i = 0; i < n; i++) {
      o[i] = d[this.pos];
      if (++this.pos >= d.length) this.pos = 0;
    }
  }
}

export const SOURCES = {
  chirp: { name: 'Chirp', make: (p) => new Chirp(p) },
  piano: { name: 'Piano', make: (p) => new Piano(p) },
  voice: { name: 'Voice', make: (p) => new Voice(p) },
  birds: { name: 'Birdsong', make: (p) => new Birds(p) },
  whale: { name: 'Whale song', make: (p) => new Whale(p) },
  fm: { name: 'FM synth', make: (p) => new FM(p) },
  phone: { name: 'Phone', make: (p) => new Phone(p) },
  message: { name: 'Hidden message', make: (p) => new Message(p) },
  drums: { name: 'Drum machine', make: (p) => new Drums(p) },
  noise: { name: 'Noise', make: (p) => new Noise(p) },
  file: { name: 'Audio file', make: (p) => new FilePlayer(p) },
};

export const sourceDefaults = () => ({
  chirp: { from: 60, to: 16000, period: 8, curve: 'exp', updown: true, harmonics: 1 },
  piano: { tempo: 96, pattern: 'arp', key: 0, brightness: 0.55 },
  voice: { pitch: 130, vowel: 'cycle', rate: 0.9, vibrato: 0.6, breath: 0.08, pauses: true },
  birds: { count: 2, pitch: 3800, busy: 0.6 },
  whale: { pitch: 220, pace: 1, sea: 0.4 },
  fm: { carrier: 440, ratio: 1.4, index: 6, sweep: 6, mode: 'drone' },
  phone: { number: '5550142', speed: 1 },
  message: { text: 'Hello', low: 2000, high: 12000, perChar: 0.9 },
  drums: { tempo: 112, beat: 'rock', swing: 0 },
  noise: { color: 'pink', sweep: true, period: 10, q: 8 },
  file: { data: null, name: '' },
});

/* ---------- a sample-exact white noise for the background ---------- */

export function whiteNoise(seed) {
  const r = rng(seed);
  return () => r() * 2 - 1;
}
