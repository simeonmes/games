// The climb: one continuous route that spirals up through six zones. It's built in code
// from a fixed seed, so it's the same every time. Each piece of the route is placed a
// jumpable distance from the last; tools/verify.mjs plays every jump with the real physics
// to prove the whole climb can be done.
//
// Output (plain data, no rendering):
//   colliders  solid shapes (see physics.js)
//   parts      what to draw: { g: shape, s: size, p: position, r: rotation, m: material, c?: moving owner }
//   volumes    wind (fans, gusts);  zips  zip lines
//   route      the colliders of the intended path, in order
//   checkpoints, ducks, start, top

export const ZONES = [
  { id: "slums", name: "The Slums", from: -50, R: 30 },
  { id: "build", name: "The Construction Site", from: 120, R: 34 },
  { id: "isles", name: "The Floating Isles", from: 260, R: 40 },
  { id: "junk", name: "The Junkyard in the Clouds", from: 420, R: 38 },
  { id: "ice", name: "The Ice Peaks", from: 580, R: 34 },
  { id: "space", name: "The Edge of Space", from: 740, R: 44 },
  { id: "top", name: "The Top", from: 905, R: 44 },
];
export const TOP_Y = 905;
export const zoneAt = (y) => { let z = ZONES[0]; for (const zz of ZONES) if (y >= zz.from) z = zz; return z; };

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

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

class Builder {
  constructor(seed) {
    this.R = rng(seed);
    this.colliders = []; this.parts = []; this.volumes = []; this.zips = [];
    this.route = []; this.checkpoints = []; this.ducks = []; this.extras = [];
    this.cur = null;
    this.zone = ZONES[0];
    this.lastCheck = -Infinity;
  }
  rand(a, b) { return a + (b - a) * this.R(); }
  pick(list) { return list[Math.floor(this.R() * list.length)]; }
  chance(p) { return this.R() < p; }

  // ------------------------------------------------------------------ primitives
  part(g, s, p, m, r, extra) { const o = { g, s, p, m }; if (r) o.r = r; if (extra) Object.assign(o, extra); this.parts.push(o); return o; }

  // A solid box with its top surface at `top`. l runs along the yaw direction, w across it.
  box(x, top, z, l, w, h, yaw, m, o = {}) {
    const c = { shape: "box", x, y: top - h / 2, z, hx: w / 2, hy: h / 2, hz: l / 2, yaw, m, id: this.colliders.length };
    Object.assign(c, o.c);
    this.colliders.push(c);
    if (m) {
      const vis = { g: "box", s: [w, h, l], p: [x, top - h / 2, z], r: [0, yaw, 0], m };
      if (c.move || c.surf === "crumble") { vis.c = c.id; vis.p = [0, 0, 0]; vis.r = [0, 0, 0]; }
      this.parts.push(vis);
    }
    return c;
  }

  cyl(x, top, z, r, h, m, o = {}) {
    const c = { shape: "cyl", x, y: top - h / 2, z, r, hy: h / 2, yaw: 0, m, id: this.colliders.length };
    Object.assign(c, o.c);
    this.colliders.push(c);
    if (m) {
      const vis = { g: "cyl", s: [r, r, h, o.seg || 20], p: [x, top - h / 2, z], m };
      if (c.move || c.surf === "crumble") { vis.c = c.id; vis.p = [0, 0, 0]; }
      this.parts.push(vis);
    }
    return c;
  }

  // ------------------------------------------------------------------ the route
  // Turn gently so the route keeps circling the mountain's invisible axis.
  steer(turn) {
    const c = this.cur, R = this.zone.R;
    const ang = Math.atan2(c.x, c.z), r = Math.hypot(c.x, c.z);
    const want = ang + Math.PI / 2 + Math.max(-0.7, Math.min(0.7, (r - R) * 0.05));
    c.h += Math.max(-0.28, Math.min(0.28, wrap(want - c.h))) + turn;
  }

  // Place the next piece: `gap` metres past the end of the current one, `rise` higher,
  // `side` metres to the side. make(x, top, z, heading) builds it and returns its collider.
  go(gap, rise, half, make, side = 0, turn = 0) {
    this.steer(turn);
    const c = this.cur, h = c.h;
    const dx = Math.sin(h), dz = Math.cos(h), px = Math.cos(h), pz = -Math.sin(h);
    const dist = c.half + gap + half;
    const x = c.x + dx * dist + px * side, z = c.z + dz * dist + pz * side, top = c.y + rise;
    const col = make(x, top, z, h);
    this.add(col, x, top, z, h, half);
    return col;
  }

  add(col, x, top, z, h, half) {
    col.route = this.route.length;
    this.route.push(col.id);
    this.cur = { x, y: top, z, h, half, col };
    if (top - this.lastCheck >= 40 && !col.move && col.surf !== "crumble" && col.surf !== "bounce") {
      this.checkpoints.push({ x, y: top, z, route: col.route });
      this.lastCheck = top;
    }
  }

  // A hidden rubber duck on a little side platform, one jump off the route.
  duck(make, side, rise, dHalf = 0.7) {
    const c = this.cur, rc = c.col, h = c.h + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    const across = rc.shape === "cyl" ? rc.r : rc.hx;
    const d = across + 1.9 + dHalf;
    const x = c.x + Math.sin(h) * d, z = c.z + Math.cos(h) * d;
    const top = c.y + rise;
    const col = make(x, top, z, c.h);
    col.duckFrom = c.col.id;
    this.ducks.push({ x, y: top, z, c: col.id, from: c.col.id });
    return col;
  }
}

// ======================================================================== props
// Each makes one thing and returns the collider you stand on. Sizes in metres.

const P = {
  // --------------------------------------------------------------- the slums
  building(B, x, top, z, h, w, d, mat) {
    const c = B.box(x, top, z, d, w, top + 1, h, mat);
    c.noCam = false;
    B.part("box", [w + 0.3, 0.35, d + 0.3], [x, top - 0.15, z], "roof", [0, h, 0]);
    // Parapet lips on two sides, and some rooftop clutter.
    const px = Math.cos(h), pz = -Math.sin(h), dx = Math.sin(h), dz = Math.cos(h);
    for (const s of [-1, 1]) B.part("box", [0.3, 0.5, d], [x + px * s * (w / 2 - 0.15), top + 0.25, z + pz * s * (w / 2 - 0.15)], "concrete", [0, h, 0]);
    if (B.chance(0.6)) P.decoTank(B, x - dx * d * 0.25 + px * w * 0.3, top, z - dz * d * 0.25 + pz * w * 0.3);
    if (B.chance(0.5)) B.part("cyl", [0.05, 0.05, 2.5, 6], [x + px * w * 0.35, top + 1.25, z + pz * w * 0.35], "metal");
    return c;
  },
  decoTank(B, x, top, z) {
    B.cyl(x, top + 3.0, z, 1.0, 3.0, null);
    for (const [a, b] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) B.part("box", [0.12, 1.4, 0.12], [x + a, top + 0.7, z + b], "rust");
    B.part("cyl", [1, 1, 1.6, 16], [x, top + 2.2, z], "tank");
    B.part("cyl", [0.1, 1.05, 0.5, 16], [x, top + 3.25, z], "rust");
  },
  ac(B, x, top, z, h) {
    const c = B.box(x, top, z, 1.1, 1.5, 1.0, h, "metal");
    B.part("cyl", [0.42, 0.42, 0.06, 16], [x, top + 0.03, z], "grille");
    return c;
  },
  tank(B, x, top, z) {
    const c = B.cyl(x, top, z, 1.3, 2.4, "tank");
    B.part("cyl", [1.35, 1.35, 0.12, 20], [x, top + 0.04, z], "rust");
    for (const [a, b] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) B.part("box", [0.14, 2, 0.14], [x + a, top - 3.4, z + b], "rust");
    return c;
  },
  pipe(B, x, top, z, len, h, r = 0.32) {
    const c = B.box(x, top, z, len, r * 1.8, r * 2, h, null);
    B.part("cyl", [r, r, len, 12], [x, top - r, z], "pipe", [Math.PI / 2, h, 0]);
    for (const s of [-0.5, 0.5]) B.part("cyl", [r + 0.06, r + 0.06, 0.18, 12], [x + Math.sin(h) * len * s * 0.9, top - r, z + Math.cos(h) * len * s * 0.9], "rust", [Math.PI / 2, h, 0]);
    return c;
  },
  crate(B, x, top, z, h, s = 1.2) { return B.box(x, top, z, s, s, s, h, "crate"); },
  neon(B, x, top, z, len, h, m) {
    const c = B.box(x, top, z, len, 0.4, 1.3, h, "signBack");
    const px = Math.cos(h), pz = -Math.sin(h);
    for (const s of [-1, 1]) B.part("box", [0.04, 0.9, len - 0.4], [x + px * s * 0.22, top - 0.65, z + pz * s * 0.22], m, [0, h, 0]);
    return c;
  },
  billboard(B, x, top, z, len, h) {
    const c = B.box(x, top, z, len, 0.35, 3.2, h, "billboard");
    for (const s of [-0.35, 0.35]) B.part("box", [0.2, 5, 0.2], [x + Math.sin(h) * len * s, top - 5.7, z + Math.cos(h) * len * s], "rust");
    return c;
  },
  dumpster(B, x, top, z, h) {
    const c = B.box(x, top, z, 2.2, 1.6, 1.4, h, "dumpster");
    B.part("box", [1.7, 0.1, 2.3], [x, top + 0.05, z], "black", [0.05, h, 0]);
    return c;
  },
  sofa(B, x, top, z, h) {
    const c = B.box(x, top, z, 2.2, 0.9, 0.5, h, "sofa");
    const px = Math.cos(h), pz = -Math.sin(h);
    B.part("box", [0.3, 0.7, 2.2], [x - px * 0.6, top + 0.35, z - pz * 0.6], "sofa", [0, h, 0]);
    return c;
  },
  step(B, x, top, z, h, m = "metal") { return B.box(x, top, z, 1.1, 1.8, 0.2, h, m); },

  // --------------------------------------------------------------- construction
  beam(B, x, top, z, len, h) {
    const c = B.box(x, top, z, len, 0.5, 0.5, h, null);
    B.part("box", [0.5, 0.08, len], [x, top - 0.04, z], "girder", [0, h, 0]);
    B.part("box", [0.08, 0.34, len], [x, top - 0.25, z], "girder", [0, h, 0]);
    B.part("box", [0.5, 0.08, len], [x, top - 0.46, z], "girder", [0, h, 0]);
    return c;
  },
  container(B, x, top, z, h, m) {
    const c = B.box(x, top, z, 6.1, 2.4, 2.6, h, m);
    for (const e of [-1, 1]) B.part("box", [2.5, 2.7, 0.1], [x + Math.sin(h) * e * 3.03, top - 1.3, z + Math.cos(h) * e * 3.03], "rust", [0, h, 0]);
    return c;
  },
  deck(B, x, top, z, l, w, h) {
    const c = B.box(x, top, z, l, w, 0.18, h, "plank");
    const dx = Math.sin(h), dz = Math.cos(h), px = Math.cos(h), pz = -Math.sin(h);
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const xx = x + dx * a * (l / 2 - 0.1) + px * b * (w / 2 - 0.1), zz = z + dz * a * (l / 2 - 0.1) + pz * b * (w / 2 - 0.1);
      B.part("cyl", [0.05, 0.05, 3.4, 6], [xx, top - 1.8, zz], "scaffold");
    }
    B.part("box", [w, 0.05, 0.05], [x + dx * (l / 2 - 0.1), top - 1.5, z + dz * (l / 2 - 0.1)], "scaffold", [0, h, 0.5]);
    return c;
  },
  bigPipe(B, x, top, z, len, h) {
    const c = B.box(x, top, z, len, 1.5, 2.2, h, null);
    B.part("cyl", [1.1, 1.1, len, 18], [x, top - 1.1, z], "concretePipe", [Math.PI / 2, h, 0]);
    return c;
  },
  bags(B, x, top, z, h) {
    const c = B.box(x, top, z, 1.4, 1.4, 0.9, h, "pallet");
    B.part("box", [1.2, 0.5, 1.2], [x, top + 0.25, z], "bags", [0, h + 0.2, 0], { deco: 1 });
    return c;
  },
  crane(B, x, top, z, h) {
    // A crane's mast: a lattice tower you can stand on top of.
    const c = B.box(x, top, z, 2, 2, 16, h, null);
    B.part("box", [2, 16, 2], [x, top - 8, z], "lattice", [0, h, 0]);
    B.part("box", [2.4, 0.3, 2.4], [x, top - 0.15, z], "girder", [0, h, 0]);
    return c;
  },
  jib(B, x, top, z, len, h) {
    const c = B.box(x, top, z, len, 1.0, 0.8, h, null);
    B.part("box", [1.0, 0.8, len], [x, top - 0.4, z], "lattice", [0, h, 0]);
    B.part("box", [1.05, 0.06, len], [x, top - 0.02, z], "girder", [0, h, 0]);
    return c;
  },

  // --------------------------------------------------------------- floating isles
  island(B, x, top, z, r) {
    const c = B.cyl(x, top, z, r, 0.7, "grass", { seg: 14 });
    B.part("cyl", [r * 1.02, r * 0.85, 1.2, 14], [x, top - 1.3, z], "dirt");
    B.part("cyl", [r * 0.85, 0.2, r * 1.8, 9], [x, top - 1.9 - r * 0.9, z], "rock");
    // Flowers, tufts and stones.
    const n = Math.floor(r * 2);
    for (let i = 0; i < n; i++) {
      const a = B.rand(0, 6.28), d = B.rand(0.3, r - 0.3);
      if (B.chance(0.5)) B.part("ico", [B.rand(0.1, 0.18)], [x + Math.cos(a) * d, top + 0.1, z + Math.sin(a) * d], B.pick(["flowerR", "flowerY", "flowerW"]), null, { deco: 1 });
      else B.part("cyl", [0.02, 0.06, 0.35, 4], [x + Math.cos(a) * d, top + 0.17, z + Math.sin(a) * d], "leaf", null, { deco: 1 });
    }
    return c;
  },
  tree(B, x, top, z) {
    B.cyl(x, top + 3.2, z, 0.35, 3.2, "bark");
    const s = B.rand(1.6, 2.2);
    B.part("ico", [s], [x, top + 3.6 + s * 0.5, z], "leaf", null, { flat: 1 });
    B.part("ico", [s * 0.7], [x + s * 0.6, top + 3.2 + s * 0.3, z - s * 0.3], "leaf2", null, { flat: 1 });
  },
  stone(B, x, top, z, r) {
    const c = B.cyl(x, top, z, r, 0.6, "rock", { seg: 7 });
    B.part("cyl", [r, 0.1, r * 1.4, 7], [x, top - 0.6 - r * 0.7, z], "rock");
    return c;
  },
  mushroom(B, x, top, z, r) {
    const c = B.cyl(x, top, z, r, 0.5, "mushroom", { c: { surf: "bounce" } });
    B.part("sphere", [r * 1.02], [x, top - 0.25, z], "mushroom", null, { sy: 0.45, half: 1 });
    B.part("cyl", [0.35, 0.45, 1.6, 10], [x, top - 1.2, z], "stem");
    return c;
  },
  log(B, x, top, z, len, h) {
    const c = B.box(x, top, z, len, 0.9, 0.9, h, null);
    B.part("cyl", [0.45, 0.45, len, 12], [x, top - 0.45, z], "bark", [Math.PI / 2, h, 0]);
    return c;
  },
  waterfall(B, x, top, z, h) {
    B.part("box", [1.4, 26, 0.3], [x, top - 13.2, z], "water", [0, h, 0], { noShadow: 1 });
  },

  // --------------------------------------------------------------- junkyard
  car(B, x, top, z, h, m) {
    const body = B.box(x, top - 0.75, z, 4.2, 1.8, 0.8, h, m);
    const c = B.box(x, top, z, 2.0, 1.6, 0.75, h, "carGlass");
    const dx = Math.sin(h), dz = Math.cos(h), px = Math.cos(h), pz = -Math.sin(h);
    for (const a of [-1.3, 1.3]) for (const b of [-0.9, 0.9]) B.part("cyl", [0.38, 0.38, 0.3, 12], [x + dx * a + px * b, top - 1.15, z + dz * a + pz * b], "tire", [0, h, Math.PI / 2]);
    body.noGrab = false;
    return c;
  },
  bus(B, x, top, z, h) {
    const c = B.box(x, top, z, 10, 2.5, 3, h, "bus");
    return c;
  },
  train(B, x, top, z, h) { return B.box(x, top, z, 13, 3, 3.6, h, "train"); },
  fridge(B, x, top, z, h) { return B.box(x, top, z, 0.85, 0.9, 1.9, h, "fridge"); },
  washer(B, x, top, z, h) {
    const c = B.box(x, top, z, 0.9, 0.9, 1.0, h, "fridge");
    B.part("cyl", [0.3, 0.3, 0.05, 16], [x + Math.sin(h) * 0.46, top - 0.5, z + Math.cos(h) * 0.46], "chrome", [Math.PI / 2, h, 0]);
    return c;
  },
  tv(B, x, top, z, h) { return B.box(x, top, z, 0.8, 1.2, 1.0, h, "tv"); },
  tires(B, x, top, z) {
    const c = B.cyl(x, top, z, 0.7, 1.4, null);
    for (let i = 0; i < 4; i++) B.part("torus", [0.5, 0.2], [x, top - 0.18 - i * 0.35, z], "tire", [Math.PI / 2, 0, 0]);
    return c;
  },
  // A big fan blowing straight up: walk onto it and ride the air.
  fan(B, x, top, z, lift) {
    const c = B.cyl(x, top, z, 1.6, 0.5, "fanBase");
    B.part("cyl", [1.5, 1.5, 0.1, 20], [x, top + 0.1, z], "grille");
    B.part("fan", [1.3], [x, top + 0.02, z], "chrome", null, { spin: 1 });
    B.volumes.push({ x0: x - 1.5, x1: x + 1.5, z0: z - 1.5, z1: z + 1.5, y0: top - 0.2, y1: top + lift, fx: 0, fy: 62, fz: 0, maxUp: 10, fan: 1 });
    B.part("box", [3, lift, 3], [x, top + lift / 2, z], "air", null, { noShadow: 1 });
    return c;
  },

  // --------------------------------------------------------------- ice peaks
  floe(B, x, top, z, l, w, h) { return B.box(x, top, z, l, w, 0.7, h, "ice", { c: { surf: "ice" } }); },
  pillar(B, x, top, z, r) {
    const c = B.cyl(x, top, z, r, 3, "iceRock", { seg: 8 });
    B.part("cyl", [r * 1.05, r * 1.05, 0.25, 8], [x, top + 0.1, z], "snow");
    B.part("cyl", [r, 0.2, r * 3, 8], [x, top - 3 - r * 1.5, z], "iceRock");
    return c;
  },
  shard(B, x, top, z, h) { return B.box(x, top, z, 1.4, 1.4, 0.5, h, "iceCrack", { c: { surf: "crumble" } }); },

  // --------------------------------------------------------------- space
  asteroid(B, x, top, z, r) {
    const c = B.cyl(x, top, z, r * 0.8, r * 0.9, null);
    B.part("ico", [r], [x, top - r * 0.5, z], "asteroid", [B.rand(0, 3), B.rand(0, 3), 0], { sy: 0.55, flat: 1 });
    return c;
  },
  module(B, x, top, z, len, h) {
    const c = B.box(x, top, z, len, 2.4, 3.2, h, null);
    B.part("cyl", [1.6, 1.6, len, 20], [x, top - 1.6, z], "station", [Math.PI / 2, h, 0]);
    for (const s of [-0.42, 0, 0.42]) B.part("cyl", [1.75, 1.75, 0.3, 20], [x + Math.sin(h) * len * s, top - 1.6, z + Math.cos(h) * len * s], "chrome", [Math.PI / 2, h, 0]);
    B.part("box", [1.2, 0.05, len * 0.9], [x, top + 0.02, z], "panelWalk", [0, h, 0]);
    return c;
  },
  panelWing(B, x, top, z, len, h) { return B.box(x, top, z, len, 2.2, 0.15, h, "solar"); },
  debris(B, x, top, z, h) { return B.box(x, top, z, 1.2, 1.2, 0.8, h + 0.6, "station"); },
};

// ======================================================================== zones

function slums(B) {
  const Z = ZONES[0];
  B.zone = Z;
  // Start on a rooftop.
  const h0 = Math.PI;
  const start = P.building(B, 30, 14, 0, h0, 12, 12, "bldg1");
  B.box(33, 16.4, 3, 2.2, 2.4, 2.4, 0, "roof");                                  // stair hut
  B.part("box", [0.9, 1.8, 0.05], [33, 14.9, 1.88], "door");
  B.part("cyl", [0.7, 0.7, 0.1, 16], [26.5, 15.5, 4], "chrome", [0.6, 0.4, 0]);   // satellite dish
  B.add(start, 30, 14, 0, h0, 6);
  B.start = { x: 30, y: 14, z: 2, facing: Math.PI };

  let tall = 0;
  while (B.cur.y < 28) {
    // Rooftops first: real buildings standing on the street.
    const w = B.rand(6, 10), d = B.rand(6, 10);
    B.go(B.rand(1.8, 2.8), B.rand(0.6, 1.2), d / 2, (x, t, z, h) => P.building(B, x, t, z, h + B.rand(-0.15, 0.15), w, d, B.pick(["bldg1", "bldg2", "bldg3"])));
    if (B.chance(0.6)) {
      // Something to climb on the way up to the next roof.
      B.go(-1.0, 1.0, 0.55, (x, t, z, h) => P.ac(B, x, t, z, h), B.rand(-1, 1));
      B.go(1.2, -0.8, 0.5, (x, t, z, h) => P.crate(B, x, t, z, h, 1.0));
    }
    if (++tall === 3) { B.duck((x, t, z, h) => P.crate(B, x, t, z, h, 1.4), 1, 0.5); }
  }
  const patterns = [
    () => { for (let i = 0; i < 4; i++) B.go(B.rand(1.6, 2.3), B.rand(0.6, 1.0), 0.55, (x, t, z, h) => P.ac(B, x, t, z, h + 0.3 * (i % 2)), B.rand(-0.8, 0.8)); },
    () => { const L = B.rand(6, 9); B.go(B.rand(1.6, 2.2), B.rand(0.4, 0.9), L / 2, (x, t, z, h) => P.pipe(B, x, t, z, L, h)); },
    () => { B.go(B.rand(1.6, 2.2), 0.8, 0.6, (x, t, z, h) => P.crate(B, x, t, z, h)); B.go(0.6, 1.9, 1.3, (x, t, z) => P.tank(B, x, t, z)); },
    () => {
      // A floating fire escape: walk up the steps.
      B.go(B.rand(1.6, 2.2), 0.5, 1.2, (x, t, z, h) => B.box(x, t, z, 2.4, 2, 0.25, h, "metal"));
      for (let i = 0; i < 6; i++) B.go(0, 0.36, 0.55, (x, t, z, h) => P.step(B, x, t, z, h));
      B.go(0, 0.36, 1.2, (x, t, z, h) => B.box(x, t, z, 2.4, 2, 0.25, h, "metal"));
    },
    () => { for (let i = 0; i < 3; i++) { const L = B.rand(2.8, 4); B.go(B.rand(1.6, 2.4), B.rand(0.5, 1.0), L / 2, (x, t, z, h) => P.neon(B, x, t, z, L, h + B.rand(-0.3, 0.3), B.pick(["neonPink", "neonCyan", "neonYellow"]))); } },
    () => { const L = B.rand(7, 10); B.go(B.rand(1.8, 2.4), B.rand(0.6, 1.0), L / 2, (x, t, z, h) => P.billboard(B, x, t, z, L, h)); },
    () => { B.go(B.rand(1.6, 2.2), 0.7, 1.1, (x, t, z, h) => P.dumpster(B, x, t, z, h)); B.go(0.5, 1.8, 0.6, (x, t, z, h) => P.crate(B, x, t, z, h)); },
    () => { B.go(B.rand(1.6, 2.2), 0.6, 1.1, (x, t, z, h) => P.sofa(B, x, t, z, h)); },
  ];
  let n = 0;
  while (B.cur.y < ZONES[1].from) {
    B.pick(patterns)();
    if (++n === 9) B.duck((x, t, z, h) => P.ac(B, x, t, z, h), -1, 0.6);
  }
}

function construction(B) {
  B.zone = ZONES[1];
  const patterns = [
    () => { const L = B.rand(6, 10); B.go(B.rand(1.6, 2.4), B.rand(0.4, 0.9), L / 2, (x, t, z, h) => P.beam(B, x, t, z, L, h)); },
    () => { for (let i = 0; i < 3; i++) B.go(B.rand(1.4, 2.0), B.rand(0.7, 1.1), 1.5, (x, t, z, h) => P.beam(B, x, t, z, 3, h + (i % 2 ? 0.5 : -0.5)), i % 2 ? 1.2 : -1.2); },
    () => { B.go(B.rand(1.6, 2.4), B.rand(0.6, 1.0), 3.05, (x, t, z, h) => P.container(B, x, t, z, h, B.pick(["cont1", "cont2", "cont3"]))); },
    () => {
      // Scaffolding: pull yourself up from deck to deck.
      B.go(B.rand(1.6, 2.2), 0.6, 1.5, (x, t, z, h) => P.deck(B, x, t, z, 3, 2, h));
      for (let i = 0; i < 3; i++) B.go(0.5, B.rand(1.7, 2.0), 1.5, (x, t, z, h) => P.deck(B, x, t, z, 3, 2, h));
    },
    () => {
      // A pallet swinging across a gap on a crane hook.
      B.go(B.rand(1.6, 2.2), 0.5, 1.5, (x, t, z, h) => P.deck(B, x, t, z, 3, 2.2, h));
      const travel = 6;
      B.go(1.3, 0.3, 0.7, (x, t, z, h) => {
        const c = B.box(x, t, z, 1.4, 1.4, 0.2, h, "pallet", { c: { move: { kind: "line", ax: Math.sin(h) * travel, ay: 0, az: Math.cos(h) * travel, period: 5 } } });
        B.parts.push({ g: "cyl", s: [0.03, 0.03, 12, 4], p: [0, 6, 0], m: "cable", c: c.id });
        return c;
      });
      B.cur.half += travel;
      B.go(1.3, 0.3, 1.5, (x, t, z, h) => P.deck(B, x, t, z, 3, 2.2, h));
    },
    () => { const L = B.rand(5, 8); B.go(B.rand(1.6, 2.2), B.rand(0.5, 1.0), L / 2, (x, t, z, h) => P.bigPipe(B, x, t, z, L, h)); },
    () => { for (let i = 0; i < 3; i++) B.go(B.rand(1.6, 2.2), B.rand(0.5, 0.9), 0.7, (x, t, z, h) => P.bags(B, x, t, z, h), B.rand(-1, 1)); },
    () => {
      // A crane: up the mast top, then out along the jib.
      B.go(B.rand(1.5, 2.0), B.rand(0.8, 1.1), 1, (x, t, z, h) => P.crane(B, x, t, z, h));
      const L = B.rand(12, 16);
      B.go(0.2, 1.0, L / 2, (x, t, z, h) => P.jib(B, x, t, z, L, h));
    },
  ];
  let n = 0;
  while (B.cur.y < ZONES[2].from) {
    B.pick(patterns)();
    n++;
    if (n === 6) B.duck((x, t, z, h) => P.bags(B, x, t, z, h), 1, 0.4);
    if (n === 18) B.duck((x, t, z, h) => P.beam(B, x, t, z, 3, h), -1, 0.3);
  }
}

function isles(B) {
  B.zone = ZONES[2];
  const isle = (gap, rise, r, extra) => B.go(gap, rise, r, (x, t, z) => {
    const c = P.island(B, x, t, z, r);
    if (extra === "tree" && r > 3) P.tree(B, x + r * 0.45, t, z - r * 0.3);
    if (extra === "fall" && r > 3) P.waterfall(B, x + r, t, z, 0);
    return c;
  });
  const patterns = [
    () => { for (let i = 0; i < 3; i++) isle(B.rand(2.0, 3.2), B.rand(0.6, 1.2), B.rand(2.6, 4.5), B.pick(["tree", "fall", "", ""])); },
    () => { for (let i = 0; i < 5; i++) B.go(B.rand(1.7, 2.4), B.rand(0.3, 0.8), 0.8, (x, t, z) => P.stone(B, x, t, z, B.rand(0.7, 0.95)), B.rand(-1, 1)); },
    () => {
      // A bouncy mushroom up to a high island.
      isle(B.rand(2.0, 2.6), B.rand(0.5, 1.0), 3.2, "");
      B.go(-1.6, 0.4, 1.0, (x, t, z) => P.mushroom(B, x, t, z, 1.0));
      isle(1.4, B.rand(4.2, 5.2), B.rand(3, 4), "tree");
    },
    () => { const L = B.rand(7, 10); B.go(B.rand(1.8, 2.4), B.rand(0.3, 0.7), L / 2, (x, t, z, h) => P.log(B, x, t, z, L, h)); isle(1.6, 0.6, 3, "tree"); },
    () => {
      // A long plank spinning slowly in the air between two islands.
      isle(B.rand(2.0, 2.6), 0.6, 3, "");
      B.go(1.4, 0.3, 3.5, (x, t, z, h) => B.box(x, t, z, 7, 1.3, 0.35, h, "plankOld", { c: { move: { kind: "spin", rate: 0.55 } } }));
      isle(1.4, 0.4, 3.2, "fall");
    },
  ];
  let n = 0;
  while (B.cur.y < ZONES[3].from) {
    B.pick(patterns)();
    n++;
    if (n === 5) B.duck((x, t, z) => P.stone(B, x, t, z, 0.9), 1, 0.5);
    if (n === 14) B.duck((x, t, z) => P.stone(B, x, t, z, 0.9), -1, 0.8);
  }
}

function junk(B) {
  B.zone = ZONES[3];
  const cars = ["paintRed", "paintBlue", "paintTeal", "paintWhite", "paintYellow"];
  const patterns = [
    () => { for (let i = 0; i < 3; i++) B.go(B.rand(1.6, 2.3), B.rand(0.5, 1.0), 1.0, (x, t, z, h) => P.car(B, x, t, z, h + B.rand(-0.4, 0.4), B.pick(cars)), B.rand(-0.8, 0.8)); },
    () => { B.go(B.rand(1.8, 2.4), B.rand(0.6, 1.0), 5, (x, t, z, h) => P.bus(B, x, t, z, h)); },
    () => {
      B.go(B.rand(1.6, 2.0), B.rand(0.4, 0.8), 0.45, (x, t, z, h) => P.washer(B, x, t, z, h));
      B.go(B.rand(1.5, 1.9), B.rand(0.4, 0.8), 0.43, (x, t, z, h) => P.fridge(B, x, t, z, h));
      B.go(B.rand(1.5, 1.9), B.rand(0.3, 0.7), 0.4, (x, t, z, h) => P.tv(B, x, t, z, h));
    },
    () => {
      // Ride a fan's updraft up to a ledge high above.
      B.go(B.rand(1.6, 2.2), 0.5, 1.6, (x, t, z) => P.fan(B, x, t, z, 15));
      B.go(1.0, 12, 1.2, (x, t, z, h) => P.container(B, x, t, z, h + Math.PI / 2, "cont2"));
    },
    () => { B.go(B.rand(1.8, 2.4), B.rand(0.6, 1.0), 6.5, (x, t, z, h) => P.train(B, x, t, z, h)); B.go(B.rand(1.8, 2.2), 0.3, 6.5, (x, t, z, h) => P.train(B, x, t, z, h + 0.1)); },
    () => {
      // A conveyor belt that drags you sideways.
      B.go(B.rand(1.6, 2.2), B.rand(0.4, 0.8), 4, (x, t, z, h) => B.box(x, t, z, 8, 1.8, 0.5, h, "conveyor", { c: { surf: "conveyor", conv: [Math.cos(h) * 1.6, -Math.sin(h) * 1.6], convDir: 1 } }));
    },
    () => { for (let i = 0; i < 3; i++) B.go(B.rand(1.5, 2.0), B.rand(0.2, 0.6), 0.6, (x, t, z, h) => B.box(x, t, z, 1.2, 1.2, 0.9, h, "cardboard", { c: { surf: "crumble" } })); },
    () => { B.go(B.rand(1.6, 2.2), 0.6, 0.7, (x, t, z) => P.tires(B, x, t, z)); B.go(1.6, 0.7, 1.1, (x, t, z, h) => P.sofa(B, x, t, z, h)); },
  ];
  let n = 0;
  while (B.cur.y < ZONES[4].from) {
    B.pick(patterns)();
    n++;
    if (n === 4) B.duck((x, t, z, h) => P.tv(B, x, t, z, h), -1, 0.4);
    if (n === 15) B.duck((x, t, z, h) => P.fridge(B, x, t, z, h), 1, 0.3);
  }
}

function ice(B) {
  B.zone = ZONES[4];
  const patterns = [
    () => { for (let i = 0; i < 3; i++) B.go(B.rand(1.6, 2.3), B.rand(0.5, 0.9), 1.5, (x, t, z, h) => P.floe(B, x, t, z, 3, 2.4, h + B.rand(-0.3, 0.3))); },
    () => { for (let i = 0; i < 3; i++) B.go(B.rand(1.7, 2.4), B.rand(0.8, 1.2), 1.2, (x, t, z) => P.pillar(B, x, t, z, B.rand(1.0, 1.4)), B.rand(-1, 1)); },
    () => { for (let i = 0; i < 4; i++) B.go(B.rand(1.4, 1.9), B.rand(0.2, 0.6), 0.7, (x, t, z, h) => P.shard(B, x, t, z, h)); },
    () => {
      // A long bridge across gusty wind.
      B.go(B.rand(1.6, 2.2), 0.6, 1.2, (x, t, z) => P.pillar(B, x, t, z, 1.2));
      const L = 12;
      const c = B.go(0.4, 0.3, L / 2, (x, t, z, h) => B.box(x, t, z, L, 1.3, 0.3, h, "plankIce"));
      const px = Math.cos(c.yaw), pz = -Math.sin(c.yaw);
      B.volumes.push({ x0: c.x - 6, x1: c.x + 6, z0: c.z - 6, z1: c.z + 6, y0: c.y, y1: c.y + 4, fx: px * 9, fy: 0, fz: pz * 9, gust: 1.3, wind: 1 });
      B.go(0.4, 0.3, 1.2, (x, t, z) => P.pillar(B, x, t, z, 1.3));
    },
    () => { for (let i = 0; i < 6; i++) B.go(0, 0.38, 0.6, (x, t, z, h) => B.box(x, t, z, 1.2, 2, 0.4, h, "ice", { c: { surf: "ice" } })); B.go(0.6, 0.4, 1.2, (x, t, z) => P.pillar(B, x, t, z, 1.2)); },
  ];
  let n = 0;
  while (B.cur.y < ZONES[5].from) {
    B.pick(patterns)();
    n++;
    if (n === 5) B.duck((x, t, z) => P.pillar(B, x, t, z, 0.9), 1, 0.6);
    if (n === 15) B.duck((x, t, z) => P.pillar(B, x, t, z, 0.9), -1, 0.4);
  }
}

function space(B) {
  B.zone = ZONES[5];
  const patterns = [
    () => { for (let i = 0; i < 3; i++) B.go(B.rand(3.5, 5.5), B.rand(1.5, 2.8), 1.8, (x, t, z) => P.asteroid(B, x, t, z, B.rand(2.0, 2.8)), B.rand(-2, 2)); },
    () => { const L = B.rand(8, 11); B.go(B.rand(3.5, 5), B.rand(1.5, 2.5), L / 2, (x, t, z, h) => P.module(B, x, t, z, L, h)); },
    () => {
      // A satellite: panel, body, panel.
      B.go(B.rand(3.5, 4.5), B.rand(1.2, 2.0), 2.5, (x, t, z, h) => P.panelWing(B, x, t, z, 5, h));
      B.go(0.2, 0.6, 1.1, (x, t, z, h) => { const c = B.box(x, t, z, 2.2, 2.2, 2.6, h, "gold"); B.part("cyl", [0.9, 0.9, 0.1, 18], [x, t + 1.3, z], "chrome", [0.5, h, 0]); return c; });
      B.go(0.2, -0.6, 2.5, (x, t, z, h) => P.panelWing(B, x, t, z, 5, h));
    },
    () => { for (let i = 0; i < 4; i++) B.go(B.rand(3, 4.5), B.rand(1.0, 2.2), 0.6, (x, t, z, h) => P.debris(B, x, t, z, h), B.rand(-1.5, 1.5)); },
    () => {
      // A tether zip line between two station modules.
      const L1 = 8;
      const a = B.go(B.rand(3.5, 4.5), B.rand(1.5, 2.2), L1 / 2, (x, t, z, h) => P.module(B, x, t, z, L1, h));
      const h = a.yaw, dx = Math.sin(h), dz = Math.cos(h);
      const ex = a.x + dx * L1 / 2, ez = a.z + dz * L1 / 2, top = a.y + a.hy;
      const span = 26, drop = 3;
      const L2 = 8;
      const bx = ex + dx * span, bz = ez + dz * span;
      B.zips.push({ a: [ex - dx * 0.6, top + 3.0, ez - dz * 0.6], b: [bx + dx * 1.5, top - drop + 2.8, bz + dz * 1.5] });
      B.part("cyl", [0.15, 0.15, 3.0, 6], [ex - dx * 0.6, top + 1.5, ez - dz * 0.6], "chrome");
      B.part("rope", [], [0, 0, 0], "cable", null, { from: [ex - dx * 0.6, top + 3.0, ez - dz * 0.6], to: [bx + dx * 1.5, top - drop + 2.8, bz + dz * 1.5] });
      const c = P.module(B, bx + dx * L2 / 2, top - drop, bz + dz * L2 / 2, L2, h);
      B.add(c, bx + dx * L2 / 2, top - drop, bz + dz * L2 / 2, h, L2 / 2);
      c.viaZip = 1;
    },
  ];
  let n = 0;
  while (B.cur.y < TOP_Y - 3.5) {
    B.pick(patterns)();
    n++;
    if (n === 4) B.duck((x, t, z) => P.asteroid(B, x, t, z, 1.6), 1, 1.5);
    if (n === 13) B.duck((x, t, z) => P.asteroid(B, x, t, z, 1.6), -1, 1.0);
  }
}

function theTop(B) {
  B.zone = ZONES[6];
  const r = 9;
  const c = B.go(4, TOP_Y - B.cur.y, r, (x, t, z) => {
    const c = B.cyl(x, t, z, r, 1.0, "grass", { seg: 24 });
    B.part("cyl", [r * 1.02, r * 0.85, 1.5, 24], [x, t - 1.7, z], "dirt");
    B.part("cyl", [r * 0.85, 0.3, r * 1.6, 12], [x, t - 2.4 - r * 0.8, z], "rock");
    P.tree(B, x - 2.5, t, z + 2);
    // A bench and a telescope looking out at the planet below.
    B.part("box", [2.2, 0.12, 0.6], [x + 2, t + 0.55, z - 1], "plank");
    for (const s of [-0.9, 0.9]) B.part("box", [0.12, 0.55, 0.5], [x + 2 + s, t + 0.27, z - 1], "black");
    B.part("cyl", [0.1, 0.18, 1.6, 8], [x - 1, t + 1.0, z - 3], "gold", [0.9, 0.8, 0]);
    B.part("beacon", [], [x, t, z], "beacon");
    return c;
  });
  B.topSpot = { x: c.x, y: c.y + c.hy, z: c.z, r };
}

// The ground: city streets, so a fall from the slums lands somewhere.
function ground(B) {
  B.colliders.push({ shape: "box", x: 0, y: -1, z: 0, hx: 600, hy: 1, hz: 600, yaw: 0, m: null, id: B.colliders.length, ground: 1 });
}

export function buildCourse() {
  const B = new Builder(20261001);
  ground(B);
  slums(B);
  construction(B);
  isles(B);
  junk(B);
  ice(B);
  space(B);
  theTop(B);
  return {
    colliders: B.colliders, parts: B.parts, volumes: B.volumes, zips: B.zips,
    route: B.route, checkpoints: B.checkpoints, ducks: B.ducks, start: B.start, top: B.topSpot,
  };
}
