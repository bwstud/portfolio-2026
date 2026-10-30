/* The simulation worker. It owns the timeline so the page never stutters while the tree grows.

   A project is a seed, a species and a starting environment, plus one or more branches of
   history. Each branch is a list of interventions, each stamped with the step it happened at.
   The tree at any step is fully determined by that list, so time travel is just replay:
   restore the nearest yearly snapshot at or before the target, then step forward, re-applying
   interventions as their steps come round.

   Snapshots are taken before that step's interventions are applied, so adding an intervention
   at step k only invalidates snapshots after k. Acting while there are later interventions on
   the branch forks a new branch rather than rewriting the old one. */

import { createTree, stepTree, applyOp, START_STEP, STEPS_PER_YEAR } from './sim.js';
import { buildFrame } from './build.js';

let project = null;
let state = null;
const snaps = new Map();                          // branch id -> Map(step -> frozen state)

const branchOf = id => project.branches.find(b => b.id === id);
const active = () => branchOf(project.active);
const clone = s => structuredClone(s);

function snapshotsFor(id) {
  if (!snaps.has(id)) snaps.set(id, new Map());
  return snaps.get(id);
}

function applyAt(step) {
  for (const o of active().ops) if (o.step === step) applyOp(state, o.op);
}

function fresh() {
  const s = createTree({ species: project.species, seed: project.seed, light: project.light, potCapacity: project.potCap });
  s.env.pot = project.pot;
  s.env.setting = project.setting;
  return s;
}

function goTo(target) {
  const b = active();
  target = Math.max(START_STEP, Math.round(target));
  if (!state || state.step > target) {
    // rewind: nearest snapshot at or before the target
    const map = snapshotsFor(b.id);
    let best = -1;
    for (const k of map.keys()) if (k <= target && k > best) best = k;
    if (best >= 0) {
      state = clone(map.get(best));
    } else {
      state = fresh();
      while (state.step < START_STEP) stepTree(state);
      map.set(state.step, clone(state));
    }
    applyAt(state.step);
  }
  const map = snapshotsFor(b.id);
  while (state.step < target) {
    stepTree(state);
    if ((state.step - START_STEP) % STEPS_PER_YEAR === 0 && !map.has(state.step)) map.set(state.step, clone(state));
    applyAt(state.step);
  }
  b.reach = Math.max(b.reach || START_STEP, state.step);
}

function meta() {
  return {
    active: project.active,
    branches: project.branches.map(b => ({
      id: b.id, name: b.name, parent: b.parent, fork: b.fork, reach: b.reach,
      ops: b.ops.map(o => ({ step: o.step, t: o.op.t })),
    })),
  };
}

function post(extra = {}, preview = null) {
  const frame = buildFrame(preview || state);
  const transfer = [
    frame.branch.position.buffer, frame.branch.normal.buffer, frame.branch.uv.buffer, frame.branch.info.buffer,
    frame.branch.dfs.buffer, frame.branch.index.buffer,
    frame.leaves.matrix.buffer, frame.leaves.color.buffer, frame.leaves.dfs.buffer,
    frame.wires.position.buffer, frame.wires.normal.buffer, frame.wires.index.buffer,
  ];
  // subarrays share one buffer; only transfer each buffer once
  postMessage({ type: 'frame', frame, meta: meta(), preview: !!preview, ...extra }, [...new Set(transfer)]);
}

function save() {
  return {
    v: 1, species: project.species, seed: project.seed, light: project.light, potCap: project.potCap,
    pot: project.pot, setting: project.setting,
    branches: project.branches, active: project.active, nextBranch: project.nextBranch,
    step: state ? state.step : START_STEP,
  };
}

self.onmessage = ({ data: msg }) => {
  try {
    switch (msg.type) {
      case 'new': {
        project = {
          species: msg.species, seed: msg.seed, light: msg.light, potCap: msg.potCap,
          pot: msg.pot, setting: msg.setting,
          branches: [{ id: 1, name: 'Original', parent: null, fork: START_STEP, ops: [], reach: START_STEP }],
          active: 1, nextBranch: 2,
        };
        snaps.clear();
        state = null;
        goTo(START_STEP);
        post({ saved: save() });
        break;
      }
      case 'load': {
        project = { ...msg.project };
        snaps.clear();
        state = null;
        goTo(msg.project.step ?? START_STEP);
        post({ saved: save() });
        break;
      }
      case 'goto': {
        goTo(msg.step);
        post({ saved: msg.save ? save() : null });
        break;
      }
      case 'act': {
        if (!state) break;
        const b = active();
        const k = state.step;
        let target = b;
        if (b.ops.some(o => o.step > k)) {
          // changing the past: keep the old future on its own branch
          target = {
            id: project.nextBranch++, name: `Branch ${project.nextBranch - 1}`, parent: b.id, fork: k,
            ops: b.ops.filter(o => o.step <= k).map(o => ({ ...o })), reach: k,
          };
          project.branches.push(target);
          const from = snapshotsFor(b.id), to = snapshotsFor(target.id);
          for (const [s, snap] of from) if (s <= k) to.set(s, snap);
          project.active = target.id;
        }
        const op = { step: k, op: msg.op };
        if (!applyOp(state, msg.op)) { post({ rejected: msg.op.t }); break; }
        target.ops.push(op);
        const map = snapshotsFor(target.id);
        for (const s of [...map.keys()]) if (s > k) map.delete(s);
        target.reach = k;
        post({ saved: save(), acted: msg.op.t });
        break;
      }
      case 'undo': {
        if (!state) break;
        const b = active();
        const last = b.ops.at(-1);
        if (!last || last.step !== state.step) { post({ rejected: 'undo' }); break; }
        b.ops.pop();
        const k = state.step;
        state = null;
        const map = snapshotsFor(b.id);
        for (const s of [...map.keys()]) if (s > k) map.delete(s);
        goTo(k);
        post({ saved: save(), acted: 'undo' });
        break;
      }
      case 'preview': {
        if (!state) break;
        const s = clone(state);
        if (applyOp(s, msg.op)) post({}, s);
        break;
      }
      case 'branch': {
        if (!branchOf(msg.id)) break;
        const k = state ? state.step : START_STEP;
        project.active = msg.id;
        state = null;
        goTo(Math.min(k, Math.max(branchOf(msg.id).reach, START_STEP)));
        post({ saved: save() });
        break;
      }
    }
  } catch (err) {
    postMessage({ type: 'error', message: String(err && err.stack || err) });
  }
};
