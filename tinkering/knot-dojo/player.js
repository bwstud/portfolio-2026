/* Plays a knot: builds the paths, lays the rope out, then runs the steps as timed hand
   moves on top of the physics. During a move the tip is held by a hand that travels the
   path and the rope behind it is steered along the path by gentle guides (the other hand
   shaping the loops); the slack is drawn in by the rope itself. During tightening the
   guides let go and grips pull the ends apart with a bounded force, so the knot sets
   under its own friction and contact. */
import { Sim, TABLE } from './physics.js';
import { buildPaths, sampleAt, tangentAt, DS } from './tracks.js';

export const DT = 1 / 240;
const SEG = 0.0125;           // particle spacing, m
const HAND_SPEED = 0.13;      // m/s along the path at 1x
const HOLD = 0.7;             // pause after each step, s
const GUIDE = 0.22;           // guide stiffness per solver iteration
const TIGHTEN = 4;          // s
const SETTLE = 1.6;           // s

export class Player {
  constructor(knot, { radius, material }) {
    this.knot = knot;
    this.r = radius;
    this.def = resolve(knot);
    const built = buildPaths(this.def, radius);
    this.paths = built.paths;
    this.crossings = built.crossings;
    this.warning = built.warning;

    // each rope: the path, plus enough tail to reach back to the table edge and hang over it
    this.ropes = this.paths.map((P) => {
      const s0 = sampleAt(P, 0, [0, 0, 0]);
      const t0 = tangentAt(P, 0);
      const edge = distToEdge(s0, t0);
      const free = edge + 0.3;
      const L = P.length + free;
      const n = Math.round(L / SEG) + 1;
      return { path: P, n, L: (n - 1) * SEG, progress: 0, start: s0, back: [-t0[0], -t0[1], -t0[2]] };
    });
    this.sim = new Sim(this.ropes.map(rp => ({ n: rp.n, seg: SEG })), radius, material, { bar: !!knot.bar });
    this.layout();
    this.timeline = this.plan();
    this.duration = this.timeline.at(-1).end;
    this.t = 0;
    this.hands = [];
    this.setTipsPinned(true);
    for (let i = 0; i < 240; i++) this.sim.step(DT);   // let the tail settle over the edge
  }

  // rope lies straight back from where the path starts: tip at the path start
  layout() {
    const { sim } = this;
    this.ropes.forEach((rp, k) => {
      const base = sim.ropes[k].start;
      for (let j = 0; j < rp.n; j++) {
        const d = (rp.n - 1 - j) * SEG;          // distance from the tip
        const o = (base + j) * 3;
        sim.pos[o] = rp.start[0] + rp.back[0] * d;
        sim.pos[o + 1] = Math.max(this.r, rp.start[1] + rp.back[1] * d);
        sim.pos[o + 2] = rp.start[2] + rp.back[2] * d;
      }
    });
    sim.prev.set(sim.pos);
  }

  tipIndex(k) { return this.sim.ropes[k].start + this.ropes[k].n - 1; }

  setTipsPinned(on) {
    this.ropes.forEach((rp, k) => {
      const i = this.tipIndex(k);
      if (on) { const o = i * 3; this.sim.pin(i, this.sim.pos[o], this.sim.pos[o + 1], this.sim.pos[o + 2]); }
      else this.sim.unpin(i);
    });
  }

  /* ---------- timeline ---------- */
  plan() {
    const out = [];
    let t = 0;
    const reached = this.ropes.map(() => 0);
    this.def.steps.forEach((st, si) => {
      if (st.tighten) {
        out.push({ step: si, kind: 'tighten', start: t, end: t + TIGHTEN, grips: st.tighten });
        t += TIGHTEN;
        out.push({ step: si, kind: 'settle', start: t, end: t + SETTLE });
        t += SETTLE;
        return;
      }
      const moves = st.moves.map(mv => {
        const P = this.paths[mv.rope];
        const to = mv.to === 'end' ? P.length : P.ctrl[mv.to];
        const m = { rope: mv.rope, from: reached[mv.rope], to };
        reached[mv.rope] = to;
        return m;
      });
      const dur = Math.max(0.6, ...moves.map(m => (m.to - m.from) / HAND_SPEED));
      out.push({ step: si, kind: 'move', start: t, end: t + dur, moves });
      t += dur;
      out.push({ step: si, kind: 'hold', start: t, end: t + HOLD });
      t += HOLD;
    });
    this.stepStarts = this.def.steps.map((_, si) => out.find(p => p.step === si).start);
    return out;
  }

  stepAt(t = this.t) {
    let s = 0;
    for (let i = 0; i < this.stepStarts.length; i++) if (t >= this.stepStarts[i] - 1e-9) s = i;
    return s;
  }

  get done() { return this.t >= this.duration - 1e-9; }

  // advance simulated time by dt seconds (in fixed substeps)
  advance(dt) {
    this.acc = (this.acc || 0) + dt;
    let steps = 0;
    while (this.acc >= DT && !this.done) {
      this.acc -= DT;
      this.tick();
      steps++;
    }
    if (this.done) this.acc = 0;
    return steps;
  }

  tick() {
    const t = this.t;
    const phase = this.timeline.find(p => t >= p.start && t < p.end) || this.timeline.at(-1);
    this.hands.length = 0;
    if (phase.kind === 'move') {
      const f = ease((t - phase.start) / (phase.end - phase.start));
      for (const m of phase.moves) this.ropes[m.rope].progress = m.from + (m.to - m.from) * f;
      for (const m of phase.moves) this.hands.push({ rope: m.rope, tip: true });
      this.guide(GUIDE);
    } else if (phase.kind === 'hold') {
      this.guide(GUIDE);
    } else if (phase.kind === 'tighten') {
      if (!this.gripsOn) this.startGrips(phase.grips);
      const f = (t - phase.start) / (phase.end - phase.start);
      this.guide(GUIDE * Math.max(0, 1 - f / 0.35));     // let the shape go early in the pull
      // hands pull apart but follow the knot, so it tightens where it lies instead of being dragged off
      const c = this.knotCenter();
      const sx = c[0] - this.c0[0], sz = c[2] - this.c0[2];
      for (const g of this.sim.grips) {
        const e = ease(Math.min(1, f / 0.85));
        g.x = g.x0 + g.dx * e - sx; g.y = g.y0 + g.dy * e; g.z = g.z0 + g.dz * e - sz;
        this.hands.push({ i: g.i });
      }
    } else {
      this.guide(0);
      for (const g of this.sim.grips) this.hands.push({ i: g.i });
    }
    this.sim.step(DT);
    this.t += DT;
  }

  // steer the laid part of each rope along its path; the tip is the hand itself
  guide(w) {
    const { sim } = this;
    const tmp = [0, 0, 0];
    this.ropes.forEach((rp, k) => {
      const base = sim.ropes[k].start;
      const p = rp.progress;
      for (let j = 0; j < rp.n; j++) {
        const i = base + j;
        const d = (rp.n - 1 - j) * SEG;
        const u = p - d;
        if (u < 0 || w === 0) { sim.guideW[i] = 0; continue; }
        sampleAt(rp.path, u, tmp);
        const o = i * 3;
        if (j === rp.n - 1 && !this.gripsOn) { sim.pin(i, tmp[0], tmp[1], tmp[2]); continue; }
        sim.guide[o] = tmp[0]; sim.guide[o + 1] = tmp[1]; sim.guide[o + 2] = tmp[2];
        sim.guideW[i] = w;
      }
    });
  }

  // middle of the knot: the average of the rope at every crossing laid so far
  knotCenter() {
    const { sim } = this, out = [0, 0, 0];
    let n = 0;
    for (const c of this.crossings) {
      for (const end of [c.mover, c.still]) {
        const rp = this.ropes[end.rope];
        const u = end.k * DS;
        if (u > rp.progress) continue;
        const j = Math.round(rp.n - 1 - (rp.progress - u) / SEG);
        if (j < 0) continue;
        const o = (sim.ropes[end.rope].start + j) * 3;
        out[0] += sim.pos[o]; out[1] += sim.pos[o + 1]; out[2] += sim.pos[o + 2];
        n++;
      }
    }
    if (!n) {
      // nothing crossed yet: wherever the hands are
      this.ropes.forEach((rp, k) => { const o = this.tipIndex(k) * 3; out[0] += sim.pos[o]; out[1] += sim.pos[o + 1]; out[2] += sim.pos[o + 2]; n++; });
    }
    return out.map(v => v / n);
  }

  startGrips(specs) {
    this.gripsOn = true;
    this.c0 = this.knotCenter();
    this.setTipsPinned(false);
    const rot = (this.knot.rotate || 0) * Math.PI / 180;
    const { sim } = this;
    sim.grips = specs.map(g => {
      const k = g.rope || 0;
      const rp = this.ropes[k];
      let u;
      if (g.at === 'standing') u = -0.03;
      else if (g.at === 'tip') u = rp.path.length;
      else u = rp.path.ctrl[g.at];
      const d = rp.path.length - u;                     // distance back from the tip
      const j = Math.max(0, Math.min(rp.n - 1, Math.round((rp.n - 1) - d / SEG)));
      const i = sim.ropes[k].start + j;
      let dir;
      if (g.dir) {
        const [x, z] = g.dir;
        dir = [x * Math.cos(rot) + z * Math.sin(rot), 0, -x * Math.sin(rot) + z * Math.cos(rot)];
      } else if (g.at === 'standing') dir = rp.back;
      else if (g.at === 'tip') dir = tangentAt(rp.path, rp.path.length);
      else dir = tangentAt(rp.path, u).map(v => -v);     // a named point pulls back toward the standing side
      const h = Math.hypot(dir[0], dir[2]) || 1;
      const o = i * 3;
      return {
        i, k: 0.08, max: 0.0005,
        x0: sim.pos[o], y0: sim.pos[o + 1], z0: sim.pos[o + 2],
        x: sim.pos[o], y: sim.pos[o + 1], z: sim.pos[o + 2],
        dx: dir[0] / h * g.dist, dy: 0, dz: dir[2] / h * g.dist,
      };
    });
  }
}

// replace '#name' references in steps and grips with point indices
function resolve(knot) {
  const ropes = knot.ropes.map(rp => ({ points: rp.points }));
  const idx = (rope, name) => {
    if (name === 'end' || name === 'standing' || name === 'tip') return name;
    const i = knot.ropes[rope].marks[name];
    if (i === undefined) throw new Error(`${knot.id}: no point named ${name}`);
    return i;
  };
  const steps = knot.steps.map(st => ({
    ...st,
    moves: st.moves && st.moves.map(m => ({ ...m, to: idx(m.rope, m.to) })),
    tighten: st.tighten && st.tighten.map(g => ({ ...g, at: idx(g.rope || 0, g.at) })),
  }));
  return { ...knot, ropes, steps };
}

function distToEdge(p, t) {
  // distance from p back along -t to the table edge
  const bx = -t[0], bz = -t[2];
  let best = 0.6;
  if (bx < -1e-6) best = Math.min(best, (p[0] + TABLE.w / 2) / -bx);
  if (bx > 1e-6) best = Math.min(best, (TABLE.w / 2 - p[0]) / bx);
  if (bz < -1e-6) best = Math.min(best, (p[2] + TABLE.d / 2) / -bz);
  if (bz > 1e-6) best = Math.min(best, (TABLE.d / 2 - p[2]) / bz);
  return Math.max(0.05, best);
}

function ease(x) { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); }
