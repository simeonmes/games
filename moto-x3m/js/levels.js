"use strict";
// Levels, built with a little track-drawing language: a cursor rides along the top of the
// ground laying down flats, ramps, hills and gaps, and drops obstacles, checkpoints and the
// finish line where it is. Each gap starts a new piece of ground; everything under the top
// line is solid, and falling past the bottom of the level is a crash.
//
// Every level is checked by tools/verify.js, which rides it with an autopilot. Star times
// are set from the autopilot's time: it holds the gas and keeps the bike level, but never
// flips, so good riders beat it.

class Track {
  constructor(x = 0, y = 0) {
    this.x = x; this.y = y;
    this.pieces = [];
    this.blocks = [];
    this.loops = [];
    this.objects = [];
    this.checkpoints = [];
    this.signs = [];
    this.hints = [];
    // Ground runs back off-screen behind the start and ends in a wall, so there's no edge to see.
    this.cur = [[x - 900, y - 700], [x - 880, y]];
    this.pieces.push(this.cur);
    this.to(x, y);
    this.start = { x: x + 140, y };
  }

  piece() { this.cur = [[this.x, this.y]]; this.pieces.push(this.cur); }
  to(x, y) { this.cur.push([x, y]); this.x = x; this.y = y; return this; }

  // Shapes: `len` is how far along, `h`/`dy` how far up (-) or down (+) on screen.
  flat(len) { return this.to(this.x + len, this.y); }
  shape(len, fn, step = 22) {
    const x0 = this.x, y0 = this.y, n = Math.max(3, Math.round(len / step));
    for (let i = 1; i <= n; i++) { const t = i / n; this.to(x0 + len * t, y0 + fn(t)); }
    return this;
  }
  ease(len, dy) { return this.shape(len, (t) => dy * (1 - Math.cos(Math.PI * t)) / 2); }
  kick(len, h) { return this.shape(len, (t) => -h * t * t, 16); }             // gets steeper: a launch ramp
  land(len, h) { return this.shape(len, (t) => h * (2 * t - t * t)); }        // steep, then flattens out
  hill(len, h) { return this.shape(len, (t) => -h * (1 - Math.cos(2 * Math.PI * t)) / 2); }
  bumps(n, len, h) { for (let i = 0; i < n; i++) this.hill(len, h); return this; }
  gap(len, dy = 0) { this.x += len; this.y += dy; this.piece(); return this; }

  loop(r) {
    this.flat(40);
    this.loops.push({ cx: this.x, cy: this.y - r, r });
    return this.flat(40);
  }

  cp() { this.flat(90); this.checkpoints.push({ x: this.x, y: this.y }); return this.flat(160); }
  finish() { this.fin = { x: this.x, y: this.y }; return this.flat(900); }
  sign(dx, text) { this.signs.push({ x: this.x + dx, y: this.y, text }); return this; }
  hint(len, h, back = 0) { this.hints.push(Object.assign({ x0: this.x - back, x1: this.x + len }, h)); return this; }

  // Obstacles, placed relative to the cursor.
  saw(dx, dy, r, opt) { this.objects.push(Object.assign({ type: "saw", x: this.x + dx, y: this.y + dy, r }, opt)); return this; }
  tnt(dx, dy = 0) { this.objects.push({ type: "tnt", x: this.x + dx, y: this.y + dy }); return this; }
  spikes(dx, w) { this.objects.push({ type: "spikes", x: this.x + dx, y: this.y, w }); return this; }
  block(dx, dy, w, h, kind = "crate") {
    const x = this.x + dx, y = this.y + dy;
    this.blocks.push({ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], kind });
    return this;
  }
  ramp(dx, dy, w, h, kind = "steel") {           // a free-standing wedge, rising to the right
    const x = this.x + dx, y = this.y + dy;
    this.blocks.push({ pts: [[x, y], [x + w, y - h], [x + w, y]], kind });
    return this;
  }
  mover(dx, dy, w, ex, ey, period, phase = 0) {
    this.objects.push({ type: "mover", x: this.x + dx, y: this.y + dy, w, ex, ey, period, phase });
    return this;
  }
  crumble(dx, dy, w, delay) { this.objects.push({ type: "crumble", x: this.x + dx, y: this.y + dy, w, delay }); return this; }

  build(meta) {
    let maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const p of this.pieces) for (const [x, y] of p) { maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    const bottom = maxY + 1200;
    const polys = this.pieces.filter((p) => p.length > 1).map((top) => ({
      kind: "ground",
      top,
      pts: top.concat([[top[top.length - 1][0], bottom], [top[0][0], bottom]]),
    }));
    for (const b of this.blocks) polys.push(b);
    return Object.assign({
      polys,
      loops: this.loops,
      objects: this.objects,
      checkpoints: this.checkpoints,
      signs: this.signs,
      hints: this.hints,
      start: this.start,
      finish: this.fin,
      killY: maxY + 420,
      bounds: [minX, maxX],
    }, meta);
  }
}

// ------------------------------------------------------------------ the levels

const LEVELS = [];
const level = (meta, draw) => {
  const t = new Track(0, 0);
  draw(t);
  LEVELS.push(t.build(meta));
};

// 1 — learn the throttle and the lean
level({ name: "First Gear", theme: 0, stars: [13, 18] }, (t) => {
  t.flat(700).sign(-300, "HOLD ↑ TO GO").hill(500, 60).flat(300).kick(260, 90).gap(260, 40).land(400, 90).flat(300);
  t.cp().bumps(3, 420, 40).flat(300).kick(300, 110).gap(300, 60).land(500, 150).flat(300);
  t.ease(500, -160).flat(200).ease(600, 220).flat(300).finish();
});

// 2 — gaps and big air: the first chance to flip
level({ name: "Mesa Hop", theme: 0, stars: [13, 19] }, (t) => {
  t.flat(700).kick(280, 100).gap(420, 60).land(500, 120).flat(250);
  t.cp().ease(400, -120).flat(300).kick(220, 70).gap(520, 170).land(600, 200).flat(200);
  t.cp().flat(450).kick(300, 140).sign(-150, "LEAN TO FLIP").gap(480, 80).land(600, 200).flat(400);
  t.ease(300, -60).flat(200).kick(200, 50).gap(300, 40).land(300, 70).flat(300).finish();
});

// 3 — saws: stay on line
level({ name: "Saw Mill", theme: 0, stars: [14, 19] }, (t) => {
  t.flat(700).kick(260, 90).gap(380, 60).saw(-190, 90, 46).land(420, 100).flat(300);
  t.hill(500, 80).saw(-250, -260, 40).flat(250);
  t.cp().kick(300, 110).flat(360).saw(-180, 26, 48).land(400, 110).flat(250);
  t.ease(500, -150).flat(300).kick(220, 60).gap(420, 150).saw(-210, 120, 50).land(550, 190).flat(200);
  t.cp().flat(400).kick(300, 120).flat(320).spikes(-250, 200).land(420, 120).flat(300).finish();
});

// 4 — TNT: fly over it
level({ name: "Boom Town", theme: 0, stars: [14, 20] }, (t) => {
  t.flat(700).kick(260, 90).flat(320).tnt(-230).tnt(-190).tnt(-110).land(380, 90).flat(300);
  t.cp().kick(260, 110).gap(380, 40).land(420, 120).flat(250);
  t.kick(280, 110).flat(360).block(-300, -30, 80, 30).tnt(-160).land(420, 110).flat(250);
  t.cp().ease(450, -140).flat(300).kick(240, 70).gap(540, 180).land(600, 220).flat(250);
  t.kick(300, 120).flat(380).tnt(-280).tnt(-240).tnt(-200).tnt(-120).tnt(-80).land(460, 120).flat(300);
  t.finish();
});

// 5 — loops: keep the gas on all the way round
level({ name: "Loop Canyon", theme: 0, stars: [15, 21] }, (t) => {
  t.flat(900).loop(130).flat(500);
  t.kick(260, 90).gap(360, 60).land(420, 100).flat(300);
  t.cp().ease(400, 180).flat(300).loop(140).flat(300).kick(280, 110).gap(420, 40).land(460, 130).flat(200);
  t.cp().flat(500).loop(120).flat(300).loop(120).flat(500).finish();
});

// 6 — the docks: planks that fall away and platforms that bob on the tide
level({ name: "Dockside", theme: 1, stars: [12, 17] }, (t) => {
  t.flat(700).gap(600, 0).crumble(-600, 0, 200).crumble(-400, 0, 200).crumble(-200, 0, 200).flat(300);
  t.kick(260, 90).gap(420, 60).saw(-210, 100, 50).land(460, 110).flat(300);
  t.cp().flat(300).gap(720, 0).mover(-712, -8, 704, 0, 16, 2.6).flat(300);
  t.kick(280, 110).flat(340).tnt(-220).tnt(-180).land(420, 110).flat(200);
  t.cp().flat(500).kick(240, 80).gap(470, 60).saw(-235, 120, 50).land(520, 140).flat(300).finish();
});

// 7 — a loop over the water, then the pier falls apart behind you
level({ name: "Pier Pressure", theme: 1, stars: [16, 22] }, (t) => {
  t.flat(800).loop(130).flat(400);
  t.gap(560, 0).crumble(-560, 0, 140, 0.25).crumble(-420, 0, 140, 0.25).crumble(-280, 0, 140, 0.25).crumble(-140, 0, 140, 0.25);
  t.flat(300).kick(280, 100).gap(460, 80).saw(-230, 110, 54).land(500, 140).flat(250);
  t.cp().flat(350).loop(140).flat(450);
  t.kick(300, 130).flat(300).tnt(-200).tnt(-160).land(420, 130).flat(300);
  t.cp().flat(300).kick(260, 100).gap(520, 120).land(560, 180).flat(200).loop(120).flat(400).finish();
});

// 8 — saws on arms: go when they swing up
level({ name: "Spin Cycle", theme: 1, stars: [13, 18] }, (t) => {
  t.flat(300).hint(700, { watch: true }, 400).flat(400).saw(300, -150, 40, { orbit: 110, period: 2.4 }).flat(600);
  t.kick(260, 90).gap(420, 60).saw(-210, 90, 50).land(460, 110).flat(300);
  t.cp().hint(640, { watch: true }, 400).flat(400).saw(250, -140, 40, { orbit: 105, period: 2.6 }).flat(250).saw(250, -140, 40, { orbit: 105, period: 2.6, phase: -1.2 }).flat(500);
  t.kick(300, 120).gap(520, 40).saw(-260, 60, 60).land(500, 150).flat(300);
  t.cp().flat(450).gap(600, 0).crumble(-600, 0, 200, 0.4).crumble(-400, 0, 200, 0.4).crumble(-200, 0, 200, 0.4).flat(300).kick(260, 100).gap(500, 80).saw(-250, 140, 56).land(520, 150).flat(300).finish();
});

// 9 — moving saws in the gaps
level({ name: "Harbour Lights", theme: 1, stars: [16, 22] }, (t) => {
  t.flat(700).kick(260, 100).gap(460, 60).saw(-230, 170, 50, { ey: -200, period: 2.4 }).land(480, 120).flat(300);
  t.ease(400, -120).flat(250).kick(240, 70).gap(560, 160).saw(-300, 120, 44, { ex: 140, period: 1.8 }).land(600, 200).flat(250);
  t.cp().hint(1300, { watch: true }, 400).flat(400).saw(200, -40, 42, { ey: -170, period: 2.2 }).flat(700).saw(200, -40, 42, { ey: -170, period: 2.2, phase: 2 }).flat(500);
  t.loop(125).flat(450).kick(260, 100).gap(480, 80).saw(-240, 150, 56).land(520, 150).flat(300);
  t.cp().flat(500).gap(560, 0).crumble(-560, 0, 180, 0.45).crumble(-380, 0, 190, 0.45).crumble(-190, 0, 190, 0.45).flat(300).finish();
});

// 10 — big air: a huge drop with room for two flips
level({ name: "Sky High", theme: 1, stars: [19, 27] }, (t) => {
  t.flat(700).ease(700, -320).flat(200).kick(260, 80).sign(-100, "FLIP IT!").gap(640, 360).land(900, 380).flat(300);
  t.cp().flat(500).kick(300, 120).flat(360).tnt(-270).tnt(-220).land(460, 140).flat(300);
  t.ease(600, -260).flat(350).kick(240, 90).gap(580, 300).saw(-290, 250, 70).land(800, 340).flat(300);
  t.cp().flat(300).loop(130).flat(550).kick(300, 140).gap(400, 120).land(620, 220).flat(400).finish();
});

// 11 — the factory: steel kickers and saws on rails
level({ name: "Night Shift", theme: 2, stars: [14, 20] }, (t) => {
  t.flat(800).ramp(0, 0, 220, 70).flat(220).gap(400, 40).saw(-200, 90, 50).land(800, 130).flat(300);
  t.hint(1400, { watch: true }, 400).flat(500).saw(0, -40, 42, { ey: -170, period: 2.3 }).flat(600).saw(0, -40, 42, { ey: -170, period: 2.3, phase: 3 }).flat(600);
  t.cp().flat(200).ramp(0, 0, 240, 90).flat(240).gap(420, 0).saw(-210, 80, 46).saw(-210, -290, 40).flat(400);
  t.kick(300, 120).flat(360).tnt(-240).tnt(-200).tnt(-160).land(460, 120).flat(300);
  t.cp().flat(300).loop(125).flat(500).ramp(0, 0, 220, 80).flat(220).gap(460, 60).land(480, 120).flat(300).finish();
});

// 12 — climb the stacks, then drop off the top
level({ name: "Smokestack", theme: 2, stars: [16, 22] }, (t) => {
  t.flat(700).ease(500, -140).flat(200).kick(220, 60).gap(320, 30).land(320, 50).flat(250);
  t.ease(500, -160).flat(250).kick(220, 60).gap(320, 30).land(320, 50).flat(300);
  t.cp().ease(500, -160).flat(300).kick(240, 70).sign(-120, "BIG ONE!").gap(720, 380).saw(-360, 330, 80).land(900, 400).flat(300);
  t.cp().flat(450).kick(260, 90).gap(380, -20).flat(460);
  t.kick(260, 100).flat(320).spikes(-250, 180).land(420, 100).flat(300).finish();
});

// 13 — TNT everywhere
level({ name: "Minefield", theme: 2, stars: [15, 21] }, (t) => {
  t.flat(800).kick(260, 90).flat(340).tnt(-190).tnt(-150).tnt(-110).land(400, 90).flat(300);
  t.ramp(0, 0, 220, 80).flat(220).gap(420, 40).tnt(-200, 200).land(440, 110).flat(250);
  t.cp().flat(300).kick(280, 110).flat(360).tnt(-250).tnt(-150).tnt(-110).land(420, 110).flat(300);
  t.hint(900, { watch: true }, 400).flat(500).saw(0, -40, 42, { ey: -170, period: 2 }).flat(600);
  t.cp().flat(300).kick(300, 130).flat(420).tnt(-310).tnt(-270).tnt(-230).tnt(-160).land(480, 130).flat(300);
  t.loop(130).flat(400).finish();
});

// 14 — the gauntlet: every saw in the building
level({ name: "Gauntlet", theme: 2, stars: [15, 21] }, (t) => {
  t.flat(300).hint(1600, { watch: true }, 400).flat(400).saw(250, -150, 40, { orbit: 110, period: 2.2 }).flat(500)
    .saw(250, -150, 40, { orbit: 110, period: 2.2, phase: -1.4 }).flat(700);
  t.kick(260, 90).gap(420, 60).saw(-210, 100, 52).saw(-210, -330, 44).land(460, 110).flat(300);
  t.cp().flat(250).gap(600, 0).crumble(-600, 0, 200, 0.4).crumble(-400, 0, 200, 0.4).crumble(-200, 0, 200, 0.4).flat(300);
  t.hint(1000, { watch: true }, 400).flat(500).saw(0, -40, 42, { ey: -170, period: 2.1 }).flat(700);
  t.cp().flat(300).loop(130).flat(500).kick(300, 120).gap(500, 80).saw(-250, 140, 60).land(520, 150).flat(300);
  t.ramp(0, 0, 240, 90).flat(240).gap(420, 0).saw(-210, 90, 48).flat(400).finish();
});

// 15 — X3M: the whole lot
level({ name: "X3M", theme: 2, stars: [23, 31] }, (t) => {
  t.flat(800).loop(130).flat(500).kick(280, 110).gap(460, 60).saw(-230, 110, 54).land(500, 130).flat(300);
  t.hint(900, { watch: true }, 400).flat(500).saw(0, -150, 40, { orbit: 110, period: 2.3 }).flat(700);
  t.cp().flat(250).gap(560, 0).crumble(-560, 0, 180, 0.4).crumble(-380, 0, 190, 0.4).crumble(-190, 0, 190, 0.4).flat(300);
  t.kick(300, 130).flat(380).tnt(-270).tnt(-230).tnt(-190).tnt(-120).land(460, 130).flat(300);
  t.cp().ease(600, -280).flat(350).kick(240, 90).sign(-150, "SEND IT").gap(600, 320).saw(-300, 270, 70).land(820, 360).flat(300);
  t.hint(1300, { watch: true }, 400).flat(400).saw(200, -40, 42, { ey: -170, period: 2 }).flat(700).saw(200, -40, 42, { ey: -170, period: 2, phase: 2.5 }).flat(500);
  t.cp().flat(300).loop(125).flat(300).loop(125).flat(500).ramp(0, 0, 240, 90).flat(240).gap(460, 60).land(480, 120).flat(300).finish();
});

if (typeof module !== "undefined") module.exports = { LEVELS, Track };
