"use strict";
// The pixel-art ocean behind every screen. It is drawn at low resolution and scaled up, with
// dithered water, rock walls, kelp, fish, a wreck and deep-sea vents placed by depth. The
// camera follows the diver: every point scored sinks it ten metres. A ruler on the right
// edge marks the depth, and a banner names each zone the first time you reach it.

const Scene = (() => {
  const cv = document.getElementById("sea"), cx = cv.getContext("2d");
  const ruler = document.getElementById("ruler"), mark = document.getElementById("rmark");
  const CSS_PER_M = 2;               // 100 m of ocean is 200 css px tall
  let P = 2, W = 0, H = 0, MPP = 1, Y0 = 0, img = null, buf = null;
  let cam = 0, target = 0, from = 0, animT0 = 0, animDur = 0, t = 0, last = 0;
  let banners = false, zoneShown = -1, zoneTimer = 0;
  let bubbles = [];

  const ZONES = [
    { at: 0,    name: "Surface Waters",     line: "bright, warm and crowded." },
    { at: 40,   name: "Kelp Forest",        line: "green towers sway overhead." },
    { at: 150,  name: "The Drop-off",       line: "the seabed falls away beneath you." },
    { at: 300,  name: "Twilight Zone",      line: "the blue fades to almost nothing." },
    { at: 600,  name: "Shipwreck Ridge",    line: "someone else came down here first." },
    { at: 1000, name: "Midnight Zone",      line: "the only lights down here are alive." },
    { at: 2000, name: "The Abyss",          line: "cold, crushing and very quiet." },
    { at: 4000, name: "Hydrothermal Vents", line: "the water here is boiling." },
    { at: 6000, name: "Hadal Trench",       line: "almost nobody has been this deep." },
    { at: 8000, name: "Beyond the Map",     line: "no chart goes down this far." },
  ];
  const zoneIndex = m => { let i = 0; while (i + 1 < ZONES.length && m >= ZONES[i + 1].at) i++; return i; };

  // ---------- colours ----------
  const pack = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r;
  const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  const scale = (c, f) => [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];
  function ramp(stops, m) {
    if (m <= stops[0][0]) return [stops[0][1], stops[0][1], 0];
    for (let i = 1; i < stops.length; i++) {
      if (m <= stops[i][0]) return [stops[i - 1][1], stops[i][1], (m - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0])];
    }
    const l = stops[stops.length - 1][1];
    return [l, l, 0];
  }
  const WATER = [[0, [86, 200, 238]], [25, [60, 170, 222]], [100, [44, 132, 192]], [250, [32, 98, 154]], [500, [24, 72, 118]],
    [1000, [16, 50, 84]], [2000, [11, 34, 60]], [4000, [9, 24, 44]], [7000, [6, 14, 28]], [12000, [3, 7, 15]]];
  const ROCK = [[0, [104, 148, 182]], [100, [76, 110, 146]], [300, [52, 78, 110]], [1000, [32, 48, 74]], [3000, [22, 32, 52]], [7000, [14, 20, 34]]];
  const SKY_TOP = [104, 184, 238], SKY_LOW = [196, 234, 250];
  const CORAL = [[255, 120, 150], [255, 160, 80], [190, 120, 255], [255, 214, 90], [120, 230, 170]];
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return (h ^ (h >>> 16)) & 255;
  };

  // Wall widths in logical pixels at depth m (left and right).
  function wallL(m) {
    if (m < 4) return 0;
    const s = Math.min(1, (m - 4) / 70);
    const trench = Math.min(1, Math.max(0, (m - 5500) / 1500)) * 0.13;
    return W * s * (0.07 + trench + 0.045 * Math.sin(m * 0.0105 + 1.3) + 0.028 * Math.sin(m * 0.041 + 0.2) + 0.012 * Math.sin(m * 0.17));
  }
  function wallR(m) {
    if (m < 4) return 0;
    const s = Math.min(1, (m - 4) / 50);
    const trench = Math.min(1, Math.max(0, (m - 5500) / 1500)) * 0.13;
    return W * s * (0.11 + trench + 0.05 * Math.sin(m * 0.0087 + 4.1) + 0.03 * Math.sin(m * 0.033 + 2.2) + 0.012 * Math.sin(m * 0.21 + 1));
  }

  // ---------- sprites ----------
  const PAL = {
    k: "#0d1424", w: "#ffffff", W: "#cfe8f6", p: "#ff4f86", P: "#ff9ab8", q: "#c42a62",
    y: "#ffd23f", Y: "#d99a00", o: "#ff8a3d", O: "#c45a14", r: "#e83b3b", R: "#9e1f2a",
    g: "#5fc35a", G: "#2f7d3a", l: "#a6e86b", b: "#3b6ea8", B: "#1f3f6e", c: "#7fe3f5", C: "#2fa8c8",
    s: "#f2d59a", S: "#c9a565", n: "#8a5a32", N: "#5c3a1e", v: "#c79bff", V: "#7a52cf",
    a: "#8b96a8", A: "#4c566a", m: "#fff3a8", t: "#3fb1a0", T: "#1f7a6e", h: "#ffffff",
  };
  const S = {
    krill: [
      "...........P...P",
      "............P.P.",
      "...qpppppppppP..",
      "..qpPPPPPPPPPpp.",
      ".qpPPPPPPPPPPkwp",
      "qqpPPPPPPPPPPkkp",
      ".q.qpqpqpqpqpp..",
      "...p.p.p.p.p....",
    ],
    boat: [
      "...............r................",
      "...............a................",
      "...............a.......a........",
      "...........wwwwwww....a.a.......",
      "...........wcbwcbw...a...a......",
      "...........wwwwwww..a.....a.....",
      ".....aa....wwwwwww.aa.....m.....",
      "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy.",
      "yYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYy",
      ".YYYYYYYYYYYYYYYYYYYYYYYYYYYYYY.",
      "..rrrrrrrrrrrrrrrrrrrrrrrrrrrr..",
      "...RRRRRRRRRRRRRRRRRRRRRRRRRRR..",
    ],
    buoy: ["..m..", "..a..", ".rrr.", ".www.", ".rrr.", "rrrrr", "RRRRR"],
    hut: ["....n....", "...nnn...", "..nnnnn..", ".nnnnnnn.", "nnnnnnnnn", ".SSSSSSS.", ".SNNSSSS.", ".SNNSSSS."],
    fronds: [
      ".GG.......GG.",
      "GggG.....GggG",
      "G..gGg.gGg..G",
      "....gggggg...",
      "...g..n...g..",
      "..g...n....g.",
    ],
    gull: [["k...k", ".k.k.", "..k.."], ["kk.kk", "..k..", "....."]],
    fishY: ["y.yy.", "yyyyk", "y.yy."],
    fishB: ["....BB..", "B..BbbB.", "BBBbbbwk", "B..BbbB.", "....BB.."],
    turtle: [
      "....TTTTT...",
      "..TTtTTtTTT.",
      ".TtTTtTTtTTtt",
      "TTTTTTTTTTTtk",
      ".t.t....t.t.",
    ],
    jelly: ["..PPP..", ".PwPPP.", "PPPPPPP", "P.P.P.P", ".P.P.P.", "P..P..P", ".P..P..", "P.....P"],
    angler: [
      "m............",
      ".a...........",
      "..a..........",
      "..aAAAAAA....",
      ".AAkAAAAAAA..",
      "AwAwAAAAAAAAA",
      "AAAAAAAAAAA.A",
      ".AAAAAAAA..AA",
    ],
    squid: [".aWa.", "aWWWa", "aWWWa", "aWkWa", "aWWWa", "aWWWa", ".aWa.", "a.a.a", "a.a.a", ".a.a.", "a...a"],
    wreck: [
      "..............N.....................",
      "..............N.....................",
      "..........NnnnNnnnN.................",
      "..............N.....................",
      "..............N.....................",
      ".......NNNNNNNNNNNNNNNNNNN..........",
      "....NNNnnnnnnnnnnnnnnnnnnnNNN.......",
      "..NNnnnnkknnnnkknnnnnkknnnnnnNN.....",
      ".NnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnN...",
      "NnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnN.",
      "NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN",
    ],
  };
  // Small icons shown with each result.
  const ICONS = {
    p: ["................", "...cc......g....", "..c..c....ggg...", "...cc......g....", "......g.........", ".....gGg...cc...",
      "......g...c..c..", "...........cc...", "..l.............", ".lll......g.....", "..l......g.g....", ".....cc...g.....",
      "....c..c........", ".....cc.....l...", "...........lll..", "............l..."],
    c: ["................", ".....v..v..v....", "...v.vvvvvv.v...", "....vvVVVVvvv...", "..vvvVVVVVVvvv..", "...vVVwkVVVVvv.v",
      ".vvvVVkkVVVVVvvv", "...vVVVVVVVVVv..", "..vvVVVVVVVVvv.v", "...vvVVVVVVvv...", "..v.vvvvvvvv.v..", ".....v..v..v....",
      "................", "................", "................", "................"],
    s: ["................", "................", "..g..ggg........", "..ggggggk.......", "..g..ggg........", "................",
      "........g..ggg..", "........ggggggk.", "........g..ggg..", "................", "...g..ggg.......", "...ggggggk......",
      "...g..ggg.......", "................", "................", "................"],
    r: ["......yyy.......", ".....yyyky......", "....yy.yyyyy....", ".......yyy......", "......yyyy......", ".....yyYyy......",
      ".....yYyyy..y...", "......yyYy.yy...", ".......yyyyy....", "........yyy.....", ".........yy.....", "........yy......",
      ".......yy.......", "........yy......", ".........y......", "................"],
    d: ["..m.............", "...o............", "....o...........", "....oOOOOOO.....", "...OOkOOOOOOO...", "..OwOwOOOOOOOO.O",
      "..OOOOOOOOOOOOOO", "...OOOOOOOOO..OO", "................", "................", "................", "................",
      "................", "................", "................", "................"],
    k: ["......y.y.y.....", "......yyyyy.....", "......yYyYy.....", "................", "...........P...P", "............P.P.",
      "...qpppppppppP..", "..qpPPPPPPPPPpp.", ".qpPPPPPPPPPPkwp", "qqpPPPPPPPPPPkkp", ".q.qpqpqpqpqpp..", "...p.p.p.p.p....",
      "................", "..m...........m.", "................", "........m......."],
    miss: ["................", ".....aaaaaa.....", "....a......a....", "...a..W.....a...", "..a..W.......a..", "..a..........a..",
      "..a..........a..", "..a..........a..", "..a..........a..", "...a........a...", "....a......a....", ".....aaaaaa.....",
      "................", "................", "................", "................"],
    pass: ["................", "................", "................", "................", "..aa......aa....", ".a..a....a..a...",
      "a....a..a....a..", "......aa......a.", "................", "................", "....aa......aa..", "...a..a....a..a.",
      "..a....a..a....a", "........aa......", "................", "................"],
  };

  function sprite(rows, x, y, flip, alpha) {
    if (alpha !== undefined) cx.globalAlpha = alpha;
    const w = rows[0].length;
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === ".") continue;
        cx.fillStyle = PAL[ch];
        cx.fillRect(Math.round(x + (flip ? w - 1 - i : i)), Math.round(y + j), 1, 1);
      }
    }
    if (alpha !== undefined) cx.globalAlpha = 1;
  }

  // ---------- frame ----------
  const yOf = m => Y0 + Math.round(m / MPP) - Math.round(cam / MPP);   // screen row of depth m
  const vis = (y, h) => y > -h - 4 && y < H + 4;

  function resize() {
    const cw = innerWidth, ch = innerHeight;
    P = Math.max(2, Math.min(5, Math.round(cw / 200)));
    W = Math.ceil(cw / P); H = Math.ceil(ch / P);
    cv.width = W; cv.height = H;
    MPP = P / CSS_PER_M;
    Y0 = Math.round(H * 0.42);
    img = cx.createImageData(W, H);
    buf = new Uint32Array(img.data.buffer);
  }

  function paintBackground() {
    const camRow = Math.round(cam / MPP);
    const swayRay = Math.sin(t * 0.4) * 6;
    for (let y = 0; y < H; y++) {
      const wy = camRow + y - Y0;          // world row: 0 is the waterline
      const m = wy * MPP;
      const o = y * W;
      if (wy < 0) {                          // sky, with a band of swell just above the line
        const f = Math.max(0, Math.min(1, 1 + wy / (Y0 + 1)));
        const sky = mix(SKY_TOP, SKY_LOW, f);
        const swell = wy >= -2;
        for (let x = 0; x < W; x++) {
          let c = sky;
          if (swell) {
            const crest = ((x + Math.floor(t * 6) + (wy === -1 ? 3 : 0)) % 9) < 2;
            c = crest ? [236, 250, 255] : [70, 186, 232];
            if (wy === -2 && !crest) c = sky;
          }
          buf[o + x] = pack(c[0], c[1], c[2]);
        }
        continue;
      }
      const [wa, wb, wf] = ramp(WATER, m);
      const v = wf * 8, lo = Math.floor(v), frac = v - lo;
      const cLo = mix(wa, wb, lo / 8), cHi = mix(wa, wb, Math.min(8, lo + 1) / 8);
      const pLo = pack(cLo[0], cLo[1], cLo[2]), pHi = pack(cHi[0], cHi[1], cHi[2]);
      const rayAmt = m < 140 ? (1 - m / 140) * 0.22 : 0;
      const rLo = rayAmt ? (() => { const c = scale(cLo, 1 + rayAmt); return pack(c[0], c[1], c[2]); })() : 0;
      const rHi = rayAmt ? (() => { const c = scale(cHi, 1 + rayAmt); return pack(c[0], c[1], c[2]); })() : 0;
      const [ra, rb, rf] = ramp(ROCK, m);
      const rock = mix(ra, rb, rf);
      const rockP = [pack(...scale(rock, 0.72)), pack(...scale(rock, 0.86)), pack(...rock), pack(...scale(rock, 1.12))];
      const edgeP = pack(...scale(rock, 1.35));
      const wl = wallL(m), wr = W - wallR(m);
      const coralZone = m > 12 && m < 320;
      const surfaceLine = wy === 0;
      for (let x = 0; x < W; x++) {
        let px;
        if (x < wl || x >= wr) {
          const block = hash(x >> 2, wy >> 2) & 3;
          px = rockP[block];
          const hsh = hash(x, wy);
          if (hsh < 26) px = rockP[0];
          const edge = x < wl ? wl - x < 1.6 : x - wr < 1.6;
          if (edge) {
            px = edgeP;
            if (coralZone && (hash(x >> 1, wy >> 1) < 70)) {
              const c = CORAL[hash(wy >> 3, x >> 3) % CORAL.length];
              px = pack(c[0], c[1], c[2]);
            }
          }
        } else {
          const hi = BAYER[((y & 3) << 2) | (x & 3)] / 16 < frac;
          const inRay = rayAmt && ((x * 2 + wy + swayRay + 400) % 70) < 12;
          px = inRay ? (hi ? rHi : rLo) : (hi ? pHi : pLo);
          if (surfaceLine && ((x + Math.floor(t * 4)) % 7) < 3) px = pack(220, 246, 255);
        }
        buf[o + x] = px;
      }
    }
    cx.putImageData(img, 0, 0);
  }

  function paintSurface() {
    const wl = yOf(0);
    if (wl < -30 || wl > H + 60) return;
    // sun and clouds
    cx.fillStyle = "#fff6c2";
    const sx = Math.round(W * 0.84), sy = wl - Math.round(Y0 * 0.72);
    for (let j = -7; j <= 7; j++) for (let i = -7; i <= 7; i++) {
      const d = i * i + j * j;
      if (d <= 49) { cx.fillStyle = d <= 20 ? "#fffbe0" : "#ffe680"; cx.fillRect(sx + i, sy + j, 1, 1); }
    }
    const clouds = [[0.18, 0.62, 16, 0.6], [0.55, 0.78, 22, 0.35], [0.9, 0.45, 12, 0.5]];
    for (const [fx, fy, w, sp] of clouds) {
      const cxp = ((fx * W + t * sp * 3) % (W + 50)) - 25, cyp = wl - Math.round(Y0 * fy);
      for (let i = 0; i < w; i++) {
        const hgt = Math.round(Math.sin(i / (w - 1) * Math.PI) * 4) + 1;
        cx.fillStyle = "#ffffff";
        cx.fillRect(Math.round(cxp + i), cyp - hgt, 1, hgt);
        cx.fillStyle = "#d6eefa";
        cx.fillRect(Math.round(cxp + i), cyp, 1, 1);
      }
    }
    // gulls
    const flap = Math.floor(t * 3) % 2;
    sprite(S.gull[flap], Math.round((W * 0.3 + t * 5) % (W + 20)) - 10, wl - Math.round(Y0 * 0.5));
    sprite(S.gull[1 - flap], Math.round((W * 0.65 + t * 4) % (W + 20)) - 10, wl - Math.round(Y0 * 0.58));
    // island: a sand mound with two palms and a hut
    const ix = Math.round(W * 0.03), iw = 44;
    for (let i = 0; i < iw; i++) {
      const h = Math.round(9 * Math.sqrt(Math.max(0, 1 - ((i - iw / 2) / (iw / 2)) ** 2)));
      cx.fillStyle = PAL.S; cx.fillRect(ix + i, wl - h, 1, h);
      cx.fillStyle = PAL.s; cx.fillRect(ix + i, wl - h, 1, Math.min(2, h));
      if (h > 6 && hash(i, 7) < 90) { cx.fillStyle = PAL.g; cx.fillRect(ix + i, wl - h - 1, 1, 1); }
    }
    const palm = (bx, h, lean) => {
      for (let j = 0; j < h; j++) {
        cx.fillStyle = j % 3 ? PAL.n : PAL.N;
        cx.fillRect(Math.round(bx + lean * (j / h) ** 2), wl - 7 - j, 1, 1);
      }
      sprite(S.fronds, Math.round(bx + lean) - 6, wl - 7 - h - 3);
    };
    palm(ix + 13, 15, 3);
    palm(ix + 31, 11, -2);
    sprite(S.hut, ix + 18, wl - 15);
    // buoy and boat bob on the swell
    const bob = Math.round(Math.sin(t * 1.6));
    sprite(S.buoy, Math.round(W * 0.76), wl - 5 + bob);
    sprite(S.boat, Math.round(W * 0.44) - 16, wl - 9 + Math.round(Math.sin(t * 1.2 + 1)));
  }

  function paintLife() {
    // kelp growing up from the walls
    for (let k = 0; k < 9; k++) {
      const base = 60 + k * 17, by = yOf(base);
      if (!vis(by, 70)) continue;
      const left = k % 2 === 0;
      const x0 = left ? wallL(base) + 1 : W - wallR(base) - 2;
      const len = 26 + (k * 13) % 30;
      for (let j = 0; j < len; j++) {
        const sway = Math.sin(t * 1.3 + j * 0.18 + k) * (j / len) * 4;
        cx.fillStyle = j % 5 === 0 ? PAL.l : (j % 2 ? PAL.g : PAL.G);
        cx.fillRect(Math.round(x0 + sway + (left ? j * 0.08 : -j * 0.08)), by - j, 1, 1);
        if (j % 6 === 3) cx.fillRect(Math.round(x0 + sway + (left ? 1 : -1)), by - j, 1, 1);
      }
    }
    // schools of fish crossing the open water
    const schools = [[18, 8, 7, "fishY", 1], [70, 6, 9, "fishY", -1], [135, 7, 6, "fishY", 1], [215, 5, 4, "fishB", -1],
      [380, 4, 5, "fishB", 1], [520, 3, 3, "fishB", -1]];
    for (const [m, sp, n, kind, dir] of schools) {
      const y = yOf(m);
      if (!vis(y, 30)) continue;
      const span = W + 60;
      const head = ((t * sp * (dir > 0 ? 1 : -1) + m * 7) % span + span) % span - 30;
      for (let i = 0; i < n; i++) {
        const fx = head - dir * ((i % 4) * 7 + (i >> 2) * 3), fy = y + ((i * 5) % 11) - 5 + Math.round(Math.sin(t * 2 + i));
        sprite(S[kind], fx, fy, dir < 0);
      }
    }
    // a turtle in the kelp
    let y = yOf(48);
    if (vis(y, 10)) sprite(S.turtle, ((t * 4 + 30) % (W + 30)) - 15, y + Math.round(Math.sin(t)), false);
    // jellyfish drifting in the twilight
    for (const [m, fx] of [[270, 0.62], [430, 0.35], [575, 0.55], [820, 0.4]]) {
      y = yOf(m) + Math.round(Math.sin(t * 0.8 + m) * 6);
      if (vis(y, 10)) sprite(S.jelly, Math.round(W * fx), y, false, 0.8);
    }
    // the wreck on the right wall
    y = yOf(640);
    if (vis(y, 16)) sprite(S.wreck, W - wallR(650) - 30, y, false, 0.85);
    // anglers and a squid in the dark, each with a little glow
    for (const [m, sp] of [[1150, 3], [2400, 2], [3600, 2.5], [5200, 2]]) {
      y = yOf(m);
      if (!vis(y, 10)) continue;
      const x = W - (((t * sp + m) % (W + 30))) + 10;
      cx.fillStyle = "rgba(255,243,168,0.25)";
      cx.fillRect(Math.round(x) - 2, y - 2, 5, 5);
      sprite(S.angler, x, y, false);
    }
    y = yOf(1600) + Math.round(Math.sin(t * 0.6) * 8);
    if (vis(y, 12)) sprite(S.squid, Math.round(W * 0.6), y, false, 0.7);
    // vents: dark chimneys glowing at the top and pouring bubbles
    for (const [m, fx] of [[4150, 0], [4500, 1], [4800, 0]]) {
      y = yOf(m);
      if (!vis(y, 40)) continue;
      const x = fx ? W - wallR(m) - 6 : wallL(m) + 1;
      for (let j = 0; j < 22; j++) { cx.fillStyle = j < 2 ? PAL.o : (j % 4 ? PAL.A : PAL.k); cx.fillRect(Math.round(x), y - j + 20, 4, 1); }
      cx.fillStyle = "rgba(255,138,61,0.35)";
      cx.fillRect(Math.round(x) - 2, y + 17, 8, 4);
      for (let b = 0; b < 5; b++) {
        const by = y + 16 - ((t * 14 + b * 9) % 40);
        cx.fillStyle = "rgba(200,220,240,0.6)";
        cx.fillRect(Math.round(x + 1 + Math.sin(t * 3 + b) * 2), Math.round(by), 1, 1);
      }
    }
  }

  // Marine snow everywhere, and blinking lights below 700 m.
  function paintMotes() {
    const camRow = Math.round(cam / MPP);
    const cell = 9;
    const r0 = Math.floor((camRow - Y0) / cell) - 1, r1 = r0 + Math.ceil(H / cell) + 2;
    for (let r = r0; r <= r1; r++) {
      if (r < 0) continue;
      const m = r * cell * MPP;
      const glowOK = m > 700;
      for (let c = 0; c < Math.ceil(W / cell); c++) {
        const h = hash(c * 31 + 7, r);
        if (h > 36) continue;
        const x = c * cell + (h % cell) + Math.sin(t * 0.7 + h) * 1.5;
        const y = r * cell - camRow + Y0 + ((h * 7) % cell) + ((t * 2 + h) % cell) - cell / 2;
        if (glowOK && h < 10) {
          const a = 0.5 + 0.5 * Math.sin(t * 2 + h);
          cx.fillStyle = h % 2 ? `rgba(120,255,230,${a})` : `rgba(255,120,190,${a})`;
        } else {
          cx.fillStyle = "rgba(220,240,255,0.35)";
        }
        cx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
  }

  function paintDiver(sinking) {
    // Just under the surface at the top; above the prompt card once the dive is under way.
    const x = Math.round(W * 0.08), y = Y0 + Math.round(10 - 34 * Math.min(1, cam / 40) + Math.sin(t * 2) * 1.2);
    if (sinking && Math.random() < 0.5) bubbles.push({ x: x + 13, y: y + 2, m: cam, life: 1 });
    for (const b of bubbles) {
      b.y -= 0.6; b.life -= 0.012;
      cx.fillStyle = `rgba(220,245,255,${Math.max(0, b.life)})`;
      cx.fillRect(Math.round(b.x + Math.sin(b.y * 0.3)), Math.round(b.y), 1, 1);
    }
    bubbles = bubbles.filter(b => b.life > 0 && b.y > 0);
    cx.globalAlpha = 0.2;
    cx.fillStyle = "#ff4f86";
    cx.fillRect(x - 2, y - 2, 20, 12);
    cx.globalAlpha = 1;
    sprite(S.krill, x, y);
  }

  const fmtM = m => m.toLocaleString("en-US") + "m";

  // Ruler down the right edge, in css pixels.
  const ticks = [];
  function paintRuler() {
    if (!ruler) return;
    const ch = innerHeight, y0 = Y0 * P;
    const top = cam - y0 / CSS_PER_M, bot = cam + (ch - y0) / CSS_PER_M;
    const step = 100;
    let n = 0;
    for (let m = Math.max(0, Math.ceil(top / step) * step); m <= bot; m += step) {
      const y = y0 + (m - cam) * CSS_PER_M;
      if (Math.abs(y - y0) < 26) continue;
      let el = ticks[n];
      if (!el) { el = document.createElement("div"); el.className = "tick"; ruler.appendChild(el); ticks.push(el); }
      el.style.display = "";
      el.style.transform = `translateY(${Math.round(y)}px)`;
      const txt = fmtM(m);
      if (el.textContent !== txt) el.textContent = txt;
      n++;
    }
    for (; n < ticks.length; n++) ticks[n].style.display = "none";
    if (mark) {
      mark.style.transform = `translateY(${Math.round(y0)}px)`;
      const txt = fmtM(Math.round(cam));
      if (mark.firstChild.textContent !== txt) mark.firstChild.textContent = txt;
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    t += dt;
    let sinking = false;
    if (animDur) {
      const k = Math.min(1, (now - animT0) / animDur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      cam = from + (target - from) * e;
      sinking = k < 1 && target > from;
      if (k >= 1) animDur = 0;
    }
    paintBackground();
    paintSurface();
    paintMotes();
    paintLife();
    paintDiver(sinking);
    paintRuler();
    const el = document.getElementById("hDepth");
    if (el) {
      const txt = fmtM(Math.round(cam));
      if (el.textContent !== txt) el.textContent = txt;
    }
    if (banners) {
      const z = zoneIndex(cam);
      if (z !== zoneShown) { zoneShown = z; showBanner(ZONES[z]); }
    }
    requestAnimationFrame(frame);
  }

  function showBanner(z) {
    const el = document.getElementById("zone");
    if (!el) return;
    el.innerHTML = `<b>${z.name}</b><span>${z.line}</span>`;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(zoneTimer);
    zoneTimer = setTimeout(() => el.classList.remove("show"), 4500);
  }

  addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);

  return {
    // Moves the camera to depth m, sinking smoothly unless instant. Returns how long the
    // move takes in milliseconds.
    set(m, instant) {
      if (instant) { cam = target = m; animDur = 0; return 0; }
      if (m === target) return animDur ? Math.max(0, animT0 + animDur - performance.now()) : 0;
      from = cam; target = m; animT0 = performance.now();
      animDur = Math.min(2600, 800 + Math.abs(m - cam) * 1.1);
      return animDur;
    },
    get depth() { return target; },
    banners(on) {
      banners = on;
      zoneShown = on ? zoneIndex(cam) : -1;
      if (on) showBanner(ZONES[zoneShown]);
      else { const el = document.getElementById("zone"); if (el) el.classList.remove("show"); }
    },
    zone: m => ZONES[zoneIndex(m)],
    // Paints one of the 16×16 icons into a small canvas.
    icon(canvas, name) {
      const rows = ICONS[name] || S[name];
      const c = canvas.getContext("2d");
      canvas.width = rows[0].length; canvas.height = rows.length;
      c.clearRect(0, 0, canvas.width, canvas.height);
      for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
        const ch = rows[j][i];
        if (ch === ".") continue;
        c.fillStyle = PAL[ch];
        c.fillRect(i, j, 1, 1);
      }
    },
  };
})();
