/* A run: the layout simulated in Rapier and recorded, so the timeline can play, pause, seek
   and change speed without re-simulating. The simulation runs ahead of the playhead a few
   milliseconds per frame; everything before its frontier is on tape.

   Recording: each domino keeps keyframes only while it moves. A keyframe is a frame number
   plus position and quaternion. Between two consecutive frames the pose is interpolated;
   across a gap the domino was still, so the earlier pose holds.

   Impacts: Rapier reports contact forces per collider pair each step. A jump in force is an
   impact; dividing the extra impulse by the lighter body's mass gives the change in speed,
   which sets how loud it sounds. No three.js here, so it also runs under Node for tests. */

export class Run {
  constructor(R, layout, room, P, styles) {
    this.R = R; this.P = P;
    const H = layout.dominoes.map(d => d.h).sort((a, b) => a - b)[layout.dominoes.length >> 1] ?? 0.048;
    const world = this.world = new R.World({ x: 0, y: -P.gravity, z: 0 });
    const ip = world.integrationParameters;
    ip.dt = 1 / P.hz;
    ip.numSolverIterations = P.iterations;
    ip.lengthUnit = H;
    this.dt = ip.dt;
    this.every = Math.max(1, Math.round(P.hz / P.recordHz));
    this.frameDt = this.every * this.dt;

    this.info = new Map();      // collider handle -> { i } for dominoes, { mat } for the room
    for (const c of room.colliders) {
      const col = world.createCollider(
        R.ColliderDesc.cuboid(...c.half).setTranslation(...c.pos)
          .setFriction(c.mat === 'floor' ? P.floorFriction : c.mat === 'fabric' ? 0.9 : 0.5)
          .setRestitution(c.mat === 'fabric' ? 0 : P.restitution));
      this.info.set(col.handle, { mat: c.mat });
    }

    const n = this.n = layout.dominoes.length;
    this.ids = layout.dominoes.map(d => d.id);
    this.bodies = [];
    this.mass = new Float64Array(n);
    this.half = new Float64Array(n);
    this.style = layout.dominoes.map(d => d.style);
    this.sizes = layout.dominoes.map(d => d.h);
    this.rec = [];
    const wr = P.widthRatio, tr = P.thicknessRatio;
    layout.dominoes.forEach((d, i) => {
      const s = styles[d.style] ?? styles.toppling;
      const h = d.h, w = h * wr, t = h * tr, r = Math.min(t * 0.18, 0.002 * h / 0.048);
      const qy = Math.sin(d.yaw / 2), qw = Math.cos(d.yaw / 2);
      const desc = R.RigidBodyDesc.dynamic()
        .setTranslation(d.x, d.y + h / 2 + 0.00002, d.z)
        .setRotation({ x: 0, y: qy, z: 0, w: qw })
        .setSleeping(true).setCanSleep(true)
        .setLinearDamping(P.linearDamping).setAngularDamping(P.angularDamping)
        .setCcdEnabled(!!P.ccd);
      const body = world.createRigidBody(desc);
      const col = world.createCollider(
        R.ColliderDesc.roundCuboid(w / 2 - r, h / 2 - r, t / 2 - r, r)
          .setDensity(s.density * P.densityScale)
          .setFriction(P.friction * (s.friction ?? 1))
          .setRestitution(P.restitution)
          .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS), body);
      this.info.set(col.handle, { i });
      this.bodies.push(body);
      this.mass[i] = body.mass();
      this.half[i] = h / 2;
      this.rec.push({ f: [0], v: [d.x, d.y + h / 2, d.z, 0, qy, 0, qw] });
    });
    this.starts = layout.dominoes.map((d, i) => (d.start ? i : -1)).filter(i => i >= 0);
    if (!this.starts.length && n) {
      // nothing marked: the first domino placed starts it
      let k = 0;
      layout.dominoes.forEach((d, i) => { if (d.seq < layout.dominoes[k].seq) k = i; });
      this.starts = [k];
    }

    this.queue = new R.EventQueue(true);
    this.pairForce = new Map();
    this.pairLast = new Map();
    this.events = [];
    this.hit = new Float64Array(n).fill(Infinity);
    this.rest = new Float64Array(n).fill(Infinity);
    this.steps = 0;
    this.t = 0;
    this.frame = 0;
    this.started = false;
    this.stillSince = null;
    this.done = n === 0;
    this.hitCos = Math.cos(P.hitAngle * Math.PI / 180);
  }

  get frontier() { return this.frame * this.frameDt; }
  get duration() { return this.frontier; }

  push(i) {
    const b = this.bodies[i], h = this.half[i] * 2;
    const q = b.rotation();
    // the domino's facing (+z local) on the floor
    const fx = 2 * (q.x * q.z + q.w * q.y), fz = 1 - 2 * (q.x * q.x + q.y * q.y);
    const l = Math.hypot(fx, fz) || 1;
    const ax = fz / l, az = -fx / l;               // tipping axis: up × facing
    const w = this.P.push * 3.2 * Math.sqrt(0.048 / h);
    b.wakeUp();
    b.setAngvel({ x: ax * w, y: 0, z: az * w }, true);
    b.setLinvel({ x: fx / l * w * h * 0.5, y: 0, z: fz / l * w * h * 0.5 }, true);
  }

  step() {
    const P = this.P;
    if (!this.started && this.t >= P.startDelay) {
      for (const i of this.starts) this.push(i);
      this.started = true;
    }
    this.world.step(this.queue);
    this.steps++;
    this.t = this.steps * this.dt;

    const dt = this.dt, g = P.gravity;
    this.queue.drainContactForceEvents(e => {
      const a = this.info.get(e.collider1()), b = this.info.get(e.collider2());
      if (!a || !b) return;
      const key = e.collider1() < e.collider2() ? `${e.collider1()}:${e.collider2()}` : `${e.collider2()}:${e.collider1()}`;
      const F = e.totalForceMagnitude();
      const prev = this.pairForce.get(key);
      this.pairForce.set(key, { F, s: this.steps });
      const Fp = prev && prev.s === this.steps - 1 ? prev.F : 0;
      const m = Math.min(a.i != null ? this.mass[a.i] : Infinity, b.i != null ? this.mass[b.i] : Infinity);
      const dv = (F - Fp) * dt / m - g * dt * 1.5;
      if (dv < 0.008) return;
      const last = this.pairLast.get(key);
      if (last != null && this.t - last < 0.035) return;
      this.pairLast.set(key, this.t);
      const d = a.i != null ? a : b, o = a.i != null ? b : a;
      const p = this.bodies[d.i].translation();
      this.events.push({
        t: this.t, speed: dv, i: d.i, j: o.i ?? -1,
        kind: o.i != null ? 'domino' : o.mat === 'floor' ? 'floor' : o.mat === 'fabric' ? 'soft' : 'furniture',
        mat: o.mat ?? this.style[o.i], style: this.style[d.i], h: this.sizes[d.i],
        x: p.x, y: p.y, z: p.z,
      });
    });

    if (this.steps % this.every === 0) this.record();
  }

  record() {
    const f = ++this.frame, t = this.frontier;
    let moving = 0;
    for (let i = 0; i < this.n; i++) {
      const b = this.bodies[i];
      if (b.isSleeping()) continue;
      const p = b.translation(), q = b.rotation();
      const r = this.rec[i], v = r.v, k = v.length - 7;
      const changed = Math.abs(p.x - v[k]) + Math.abs(p.y - v[k + 1]) + Math.abs(p.z - v[k + 2]) > 1e-5
        || Math.abs(q.x - v[k + 3]) + Math.abs(q.y - v[k + 4]) + Math.abs(q.z - v[k + 5]) + Math.abs(q.w - v[k + 6]) > 2e-5;
      if (changed) {
        const lastF = r.f[r.f.length - 1];
        if (lastF < f - 1) { r.f.push(f - 1); v.push(v[k], v[k + 1], v[k + 2], v[k + 3], v[k + 4], v[k + 5], v[k + 6]); }
        r.f.push(f); v.push(p.x, p.y, p.z, q.x, q.y, q.z, q.w);
      }
      // the domino's up axis tipping past the hit angle
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      if (this.hit[i] === Infinity && upY < this.hitCos) this.hit[i] = t;
      const lv = b.linvel(), av = b.angvel();
      const spd = Math.hypot(lv.x, lv.y, lv.z), ang = Math.hypot(av.x, av.y, av.z);
      const still = spd < 0.02 * this.half[i] / 0.024 && ang < 0.25;
      if (!still) moving++;
      if (this.hit[i] !== Infinity && this.rest[i] === Infinity && still && t - this.hit[i] > 0.08) this.rest[i] = t;
    }
    if (this.started && t > this.P.startDelay + 0.3) {
      if (moving === 0) {
        if (this.stillSince == null) this.stillSince = t;
        if (t - this.stillSince >= this.P.settle) this.done = true;
      } else this.stillSince = null;
    }
    if (t >= this.P.maxDuration) this.done = true;
  }

  /* simulate until `until` seconds are on tape, or `ms` milliseconds have gone by */
  advance(until, ms = 8) {
    if (this.done) return;
    const t0 = performance.now();
    while (!this.done && this.frontier < until) {
      this.step();
      if ((this.steps & 7) === 0 && performance.now() - t0 > ms) break;
    }
  }

  /* pose of domino i at time t into out[0..6] */
  pose(i, t, out) {
    const r = this.rec[i], f = r.f, v = r.v;
    const x = t / this.frameDt;
    let lo = 0, hi = f.length - 1;
    if (x >= f[hi]) lo = hi;
    else {
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (f[mid] <= x) lo = mid; else hi = mid; }
    }
    const k = lo * 7;
    if (lo < f.length - 1 && f[lo + 1] === f[lo] + 1) {
      const a = x - f[lo], j = k + 7;
      for (let c = 0; c < 3; c++) out[c] = v[k + c] + (v[j + c] - v[k + c]) * a;
      // nlerp is plenty between frames this close
      let dot = v[k + 3] * v[j + 3] + v[k + 4] * v[j + 4] + v[k + 5] * v[j + 5] + v[k + 6] * v[j + 6];
      const s = dot < 0 ? -1 : 1;
      let len = 0;
      for (let c = 3; c < 7; c++) { out[c] = v[k + c] + (s * v[j + c] - v[k + c]) * a; len += out[c] * out[c]; }
      len = Math.sqrt(len) || 1;
      for (let c = 3; c < 7; c++) out[c] /= len;
    } else {
      for (let c = 0; c < 7; c++) out[c] = v[k + c];
    }
    return out;
  }

  /* how much has fallen by time t */
  fallenBy(t) {
    let n = 0;
    for (let i = 0; i < this.n; i++) if (this.hit[i] !== Infinity && this.hit[i] <= t) n++;
    return n;
  }

  dispose() {
    try { this.queue.free(); this.world.free(); } catch {}
    this.world = null;
  }
}
