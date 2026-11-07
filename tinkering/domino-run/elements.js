/* Ready-made elements. Each builds itself in the current style, colour, size and spacing,
   with its first domino at the origin heading along +z. */
import { dims, MAX_HEIGHT } from './params.js';
import { fwd } from './layout.js';

/* a turtle that drops a domino every `sp`, turning `turns[i]` radians before step i */
function walk(n, sp, turnAt) {
  const out = [];
  let x = 0, z = 0, yaw = 0;
  for (let i = 0; i < n; i++) {
    if (i) {
      const t = turnAt(i);
      const mid = yaw + t / 2;                  // step along the chord of the turn
      const [fx, fz] = fwd(mid);
      x += fx * sp; z += fz * sp; yaw += t;
    }
    out.push({ x, z, yaw });
  }
  return out;
}

export const BUILT_INS = [
  {
    id: 'line', name: 'Straight line', note: '20 in a row',
    make: ({ sp }) => walk(20, sp, () => 0),
  },
  {
    id: 'curve', name: 'Quarter turn', note: '24 turning right',
    make: ({ sp }) => walk(24, sp, i => (i > 2 && i < 22 ? -Math.PI / 2 / 19 : 0)),
  },
  {
    id: 'uturn', name: 'U-turn', note: 'Turns round and comes back',
    make: ({ sp, h }) => {
      // the turn has to be wide enough that the far side doesn't hit the near side
      const r = Math.max(h * 1.4, sp * 3);
      const steps = Math.ceil(Math.PI * r / sp);
      return walk(steps + 10, sp, i => (i > 4 && i <= 4 + steps ? Math.PI / steps : 0));
    },
  },
  {
    id: 's', name: 'S-bend', note: '36 left then right',
    make: ({ sp }) => walk(36, sp, i => (i > 3 && i < 18 ? Math.PI / 2 / 14 : i >= 19 && i < 33 ? -Math.PI / 2 / 14 : 0)),
  },
  {
    id: 'spiral', name: 'Spiral', note: 'Winding in to the middle',
    make: ({ sp, h }) => {
      const out = [];
      let r = Math.max(h * 3, sp * 7);
      let a = 0, prev = null;
      const rMin = h * 1.1;
      while (out.length < 64 && r > rMin) {
        const x = r * Math.sin(a), z = -r * Math.cos(a);
        if (prev) out[out.length - 1].next = { x, z };
        out.push({ x, z, a, r });
        prev = { x, z };
        const da = sp / r;
        a += da;
        r -= (h * 1.6) * da / (2 * Math.PI);   // each turn closer in by more than a height, so they don't land on the next ring
      }
      // heading = direction to the next domino; shift so the first sits at the origin facing +z
      const pts = out.map((p, i) => {
        const q = out[Math.min(i + 1, out.length - 1)], o = out[Math.max(i - 1, 0)];
        return { x: p.x, z: p.z, yaw: Math.atan2(q.x - o.x, q.z - o.z) };
      });
      const f = pts[0];
      return pts.map(p => {
        const dx = p.x - f.x, dz = p.z - f.z, c = Math.cos(-f.yaw), s = Math.sin(-f.yaw);
        return { x: dx * c + dz * s, z: -dx * s + dz * c, yaw: p.yaw - f.yaw };
      });
    },
  },
  {
    id: 'fork', name: 'Split in two', note: 'One line becomes two',
    make: ({ sp, w }) => {
      const trunk = walk(8, sp, () => 0);
      const out = [...trunk];
      const last = trunk[trunk.length - 1];
      for (const side of [1, -1]) {
        let x = last.x + side * w * 0.62, z = last.z + sp, yaw = 0;
        out.push({ x, z, yaw });
        for (let i = 1; i < 14; i++) {
          const t = i < 6 ? side * 0.09 : i < 11 ? -side * 0.09 : 0;
          const [fx, fz] = fwd(yaw + t / 2);
          x += fx * sp; z += fz * sp; yaw += t;
          out.push({ x, z, yaw });
        }
      }
      return out;
    },
  },
  {
    id: 'growth', name: 'Growing', note: '8, each a quarter taller',
    make: ({ h, sp }) => {
      const out = [];
      let z = 0, hh = h;
      for (let i = 0; i < 8; i++) {
        out.push({ x: 0, z, yaw: 0, h: hh });
        const next = hh * 1.25;
        z += sp / h * hh * 1.0;    // keep the same spacing ratio for each size
        hh = next;
      }
      return out;
    },
    sized: true,
  },
];

export function builtIn(id, { h, style, color, spacing }) {
  const b = BUILT_INS.find(x => x.id === id);
  const { w } = dims(h);
  const sp = spacing * h;
  const pts = b.make({ h, w, sp });
  return {
    name: b.name, builtIn: true, count: pts.length,
    dominoes: pts.map(p => ({ x: p.x, y: 0, z: p.z, yaw: p.yaw, h: Math.min(MAX_HEIGHT, p.h ?? h), style, color, effects: [] })),
  };
}
