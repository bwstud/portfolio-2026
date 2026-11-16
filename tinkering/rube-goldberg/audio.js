/* Synthesised sound: one-shots for each link in the chain and a few beds that follow what's
   moving (snow hiss, wind in flight, the fuse, the cube's hum, the laser). No samples. */
export class Sound {
  constructor() { this.ctx = null; this.vol = 0.6; this.beds = null; }
  _init() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.vol; this.master.connect(c.destination);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const bed = (type, freq, q) => {
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      return { g, f };
    };
    const tone = (freq, type = 'sine') => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
      const g = c.createGain(); g.gain.value = 0; o.connect(g); g.connect(this.master); o.start();
      return { g, o };
    };
    this.beds = {
      hiss: bed('highpass', 3500, 0.5), wind: bed('bandpass', 700, 0.6), fizz: bed('bandpass', 2600, 1.4),
      hum: tone(98, 'triangle'), hum2: tone(147.5, 'sine'), beam: tone(1760, 'sine'),
    };
    return true;
  }
  resume() { if (this._init() && this.ctx.state !== 'running') this.ctx.resume(); }
  volume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  quiet() { if (!this.beds) return; const t = this.ctx.currentTime; for (const b of Object.values(this.beds)) b.g.gain.setTargetAtTime(0, t, 0.05); }
  continuous(lv, rate) {
    if (!this.beds || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime, set = (b, v) => b.g.gain.setTargetAtTime(v, t, 0.06);
    set(this.beds.hiss, lv.hiss * 0.12);
    set(this.beds.wind, lv.wind * 0.1);
    const crackle = 0.06 + 0.06 * Math.random();
    set(this.beds.fizz, lv.fizz * crackle);
    this.beds.fizz.f.frequency.setTargetAtTime(2000 + Math.random() * 1500, t, 0.02);
    set(this.beds.hum, lv.hum * 0.05); set(this.beds.hum2, lv.hum * 0.03);
    set(this.beds.beam, lv.beam * 0.018);
    const r = Math.max(0.25, rate);
    this.beds.hum.o.frequency.setTargetAtTime(98 * Math.sqrt(r), t, 0.1);
  }
  _burst({ dur = 0.2, type = 'lowpass', freq = 1000, q = 1, gain = 0.5, sweep = 0, delay = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(20, freq * sweep), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  _tone({ f0 = 440, f1 = f0, dur = 0.2, type = 'sine', gain = 0.3, delay = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  event(id) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    switch (id) {
      case 'start': this._tone({ f0: 900, f1: 880, dur: 0.12, gain: 0.08, type: 'square' }); break;
      case 'takeoff': this._burst({ dur: 0.25, type: 'bandpass', freq: 900, q: 0.8, gain: 0.25, sweep: 2 }); break;
      case 'land': this._burst({ dur: 0.18, type: 'lowpass', freq: 1800, gain: 0.35 }); break;
      case 'bump': this._burst({ dur: 0.12, type: 'lowpass', freq: 500, gain: 0.6 }); this._tone({ f0: 160, f1: 90, dur: 0.15, gain: 0.25 }); break;
      case 'topple':
        this._burst({ dur: 0.2, type: 'lowpass', freq: 400, gain: 0.5, delay: 0 });
        this._burst({ dur: 0.08, type: 'bandpass', freq: 3000, q: 3, gain: 0.4, delay: 0.04 }); break;
      case 'detach':
        for (let i = 0; i < 5; i++) this._tone({ f0: 2400 + Math.random() * 1800, f1: 2000, dur: 0.05, gain: 0.08, type: 'triangle', delay: i * 0.07 + Math.random() * 0.03 }); break;
      case 'pad': this._tone({ f0: 180, f1: 900, dur: 0.35, gain: 0.25, type: 'triangle' }); this._burst({ dur: 0.05, type: 'highpass', freq: 2500, gain: 0.4 }); break;
      case 'enter': this._tone({ f0: 300, f1: 120, dur: 1.2, gain: 0.15, type: 'sine' }); break;
      case 'settle': this._tone({ f0: 660, f1: 660, dur: 0.5, gain: 0.07 }); this._tone({ f0: 990, f1: 990, dur: 0.6, gain: 0.05, delay: 0.08 }); break;
      case 'laser': this._tone({ f0: 3200, f1: 1400, dur: 0.25, gain: 0.12, type: 'sawtooth' }); break;
      case 'ignite': this._burst({ dur: 0.9, type: 'lowpass', freq: 2500, gain: 0.5, sweep: 0.3 }); this._burst({ dur: 0.3, type: 'highpass', freq: 4000, gain: 0.3 }); break;
      case 'reach': this._burst({ dur: 0.2, type: 'bandpass', freq: 1500, gain: 0.3 }); break;
      case 'boom':
        this._burst({ dur: 3.2, type: 'lowpass', freq: 1400, gain: 1.0, sweep: 0.05 });
        this._tone({ f0: 70, f1: 28, dur: 2.2, gain: 0.8 });
        this._burst({ dur: 0.4, type: 'highpass', freq: 1200, gain: 0.6 });
        for (let i = 0; i < 18; i++) this._burst({ dur: 0.06 + Math.random() * 0.08, type: 'lowpass', freq: 300 + Math.random() * 600, gain: 0.25 + Math.random() * 0.3, delay: 0.4 + Math.random() * 2.2 });
        break;
      case 'fail': this._tone({ f0: 330, f1: 220, dur: 0.4, gain: 0.08, type: 'triangle' }); break;
    }
  }
}
