"use strict";
// Pixel-art renderer. Everything is drawn into a 320×180 buffer and scaled up by a whole
// number with smoothing off, so pixels stay crisp. Room tiles are drawn once per room into
// cached canvases; each frame is then a handful of big drawImage calls.

const HAIR = { 1: "#AC3232", 0: "#44B7FF", 2: "#FF6DEF" };   // dash state, from Celeste
const PAL = {
  rock: ["#6b5a8e", "#54466f", "#433859", "#352c48"], edge: "#8e7bb5", under: "#241d33",
  snow: "#eef3ff", snowShade: "#b9c6e8",
  plank: "#c9a36a", plankDark: "#8a6a3c",
  spike: "#dfe6f5", spikeDark: "#8f9bbd",
  coat: "#f0a13c", coatDark: "#b86e1c", skin: "#f5cfa6", legs: "#3b3355", eye: "#1b1726",
};

// Each chapter has its own rock and sky colours: dusky foothills, an icy ridge, a pink summit.
const THEMES = {
  c1: { rock: ["#6b5a8e", "#54466f", "#433859", "#352c48"], edge: "#8e7bb5", under: "#241d33",
    sky: [["#1b1a3a", "#0b0c22"], ["#4a3470", "#2a2152"], ["#b0607a", "#5a3a70"]], mtn: ["#2d2750", "#3d3363"] },
  c2: { rock: ["#5f7d99", "#4b6682", "#3b526b", "#2d4056"], edge: "#9cc0e0", under: "#1c2a3a",
    sky: [["#0f1c33", "#08101f"], ["#2e4a70", "#1d3150"], ["#86aecf", "#4f6f94"]], mtn: ["#22364f", "#314b69"] },
  c3: { rock: ["#7c5b70", "#654a5c", "#513c4a", "#40303b"], edge: "#c29ab4", under: "#2a1d26",
    sky: [["#1a1030", "#0c0718"], ["#5b2f5e", "#3a1f45"], ["#e38a5c", "#9a4d62"]], mtn: ["#3a2442", "#523156"] },
  // Clockwork City: rusty brick under an amber evening. Dream Hollow: violet and teal.
  c4: { rock: ["#8a5a46", "#6f4838", "#57392d", "#432c23"], edge: "#d59a72", under: "#2a1a14",
    sky: [["#231a2e", "#120c1a"], ["#6b3b3a", "#3b2230"], ["#f0a35a", "#b0584a"]], mtn: ["#3a2a36", "#553843"] },
  c5: { rock: ["#4f5f86", "#404e70", "#333f5b", "#283149"], edge: "#8fb0e8", under: "#161c2e",
    sky: [["#0d0a24", "#060414"], ["#2d1f5c", "#1a1240"], ["#3f7f8f", "#3a3a78"]], mtn: ["#1f1f48", "#2c2e62"] },
  // Lantern Terraces: warm earth under a golden dusk. Hall of Stillness: cold, glassy teal stone.
  c6: { rock: ["#7a6a3e", "#63552f", "#4f4325", "#3d341c"], edge: "#e0c070", under: "#241e10",
    sky: [["#2a1a30", "#140c1c"], ["#8a4a3a", "#5a2e38"], ["#ffb65a", "#e07a4a"]], mtn: ["#4a2e3a", "#6a3e40"] },
  c7: { rock: ["#3e6a70", "#30565c", "#26464b", "#1d373b"], edge: "#8fe0e0", under: "#0e1e22",
    sky: [["#08141a", "#040a0e"], ["#12303a", "#0a2028"], ["#2f6f78", "#1e4a58"]], mtn: ["#143038", "#1e424c"] },
  // Undertow: a black-blue gorge at night. The True Summit: pale rock under a pink dawn.
  c8: { rock: ["#34405a", "#2a3449", "#212a3b", "#19202e"], edge: "#6f8fb8", under: "#0a0e16",
    sky: [["#04060c", "#020306"], ["#0c1424", "#060a14"], ["#1a2a40", "#10182a"]], mtn: ["#0c1220", "#141c2e"] },
  c9: { rock: ["#9a8aa8", "#80728f", "#685c78", "#524861"], edge: "#ffe0f0", under: "#3a3048",
    sky: [["#3a4a8a", "#6a8ad0"], ["#c07aa0", "#f0a0b0"], ["#ffd0a0", "#fff0d0"]], mtn: ["#7a6a9a", "#a08ab8"] },
};

const Render = {
  canvas: null, ctx: null, buf: null, b: null, scale: 1, ox: 0, oy: 0,
  cam: { x: 0, y: 0 }, camFrom: null, roomCache: new Map(), game: null,
  particles: [], trails: [], hair: [], orbs: null, flashT: 0, shakeT: 0, shakeMag: 0,
  sprite: null, sp: null, sky: null, mtn: [], stars: [], snow: [], time: 0,
  banner: null, berryHud: 0, trailT: 0, settings: { shake: true, timer: false },
  farPeak: 0, farPeakTarget: 0,   // the real summit, revealed at the end of the false summit

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.buf = document.createElement("canvas");
    this.buf.width = VIEW_W; this.buf.height = VIEW_H;
    this.b = this.buf.getContext("2d");
    this.sprite = document.createElement("canvas");
    this.sprite.width = 16; this.sprite.height = 16;
    this.sp = this.sprite.getContext("2d");
    this.buildBackdrop();
    this.resize();
    addEventListener("resize", () => this.resize());
  },

  resize() {
    const dpr = Math.min(3, devicePixelRatio || 1);
    const W = innerWidth, H = innerHeight;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = W + "px"; this.canvas.style.height = H + "px";
    this.dpr = dpr;
    // Largest whole-number scale that fits; fall back to a fractional one on tiny screens.
    const fit = Math.min((W * dpr) / VIEW_W, (H * dpr) / VIEW_H);
    this.scale = fit >= 1 ? Math.floor(fit) : fit;
    this.ox = Math.floor((W * dpr - VIEW_W * this.scale) / 2);
    this.oy = Math.floor((H * dpr - VIEW_H * this.scale) / 2);
  },

  theme: THEMES.c1,
  themeId: null,
  setTheme(id) {
    if (this.themeId === id) return;
    this.themeId = id;
    this.theme = THEMES[id] || THEMES[String(id).replace(/b$/, "")] || THEMES.c1;
    PAL.rock = this.theme.rock; PAL.edge = this.theme.edge; PAL.under = this.theme.under;
    this.mtn[0].c = this.ridgeCanvas[0](this.theme.mtn[0]);
    this.mtn[1].c = this.ridgeCanvas[1](this.theme.mtn[1]);
  },

  // ------------------------------------------------------------------ backdrop

  buildBackdrop() {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) this.stars.push({ x: rnd() * 640, y: rnd() * 120, b: rnd() });
    for (let i = 0; i < 70; i++) this.snow.push({ x: rnd() * VIEW_W, y: rnd() * VIEW_H, s: 0.4 + rnd() * 0.9, p: rnd() * 6 });
    // Two mountain ridges, drawn once into wide strips that scroll with parallax.
    const ridge = (color, snowline, base, amp, rough) => {
      const c = document.createElement("canvas");
      c.width = 960; c.height = VIEW_H;
      const g = c.getContext("2d");
      const pts = [];
      let h = base;
      for (let x = 0; x <= 960; x += 4) {
        h += (rnd() - 0.5) * rough;
        h = Math.max(base - amp, Math.min(base + amp * 0.4, h + (base - h) * 0.02));
        pts.push(h);
      }
      pts[pts.length - 1] = pts[0];
      for (let i = 0; i < pts.length; i++) {
        const x = i * 4, top = Math.round(pts[i]);
        g.fillStyle = color; g.fillRect(x, top, 4, VIEW_H - top);
        if (top < snowline) { g.fillStyle = "rgba(230,236,255,0.55)"; g.fillRect(x, top, 4, Math.min(4, snowline - top)); }
      }
      return c;
    };
    // Keep each ridge's shape (same random sequence) but allow recolouring per chapter.
    const shapeSeed = seed;
    this.ridgeCanvas = [
      (col) => { seed = shapeSeed; return ridge(col, 70, 95, 55, 14); },
      (col) => { seed = shapeSeed + 99; return ridge(col, 105, 125, 40, 11); },
    ];
    this.mtn = [
      { c: this.ridgeCanvas[0]("#2d2750"), k: 0.08 },
      { c: this.ridgeCanvas[1]("#3d3363"), k: 0.2 },
    ];
  },

  drawBackdrop(b) {
    // Sky colour shifts as you climb: dusk at the trailhead, deep night near the summit.
    const alt = Math.max(0, Math.min(1, -this.cam.y / 800));
    const g = b.createLinearGradient(0, 0, 0, VIEW_H);
    const sky = this.theme.sky;
    g.addColorStop(0, mix(sky[0][0], sky[0][1], alt));
    g.addColorStop(0.6, mix(sky[1][0], sky[1][1], alt));
    g.addColorStop(1, mix(sky[2][0], sky[2][1], alt));
    b.fillStyle = g;
    b.fillRect(0, 0, VIEW_W, VIEW_H);
    b.fillStyle = "#fff";
    for (const s of this.stars) {
      const x = ((s.x - this.cam.x * 0.02) % 640 + 640) % 640, y = s.y - this.cam.y * 0.01;
      if (x > VIEW_W || y < 0 || y > VIEW_H) continue;
      b.globalAlpha = (0.3 + s.b * 0.7) * (0.5 + alt * 0.5) * (0.7 + 0.3 * Math.sin(this.time * 2 + s.b * 9));
      b.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    b.globalAlpha = 1;
    if (this.farPeak > 0.01) this.drawFarPeak(b);
    for (const m of this.mtn) {
      const x = -((this.cam.x * m.k) % 960 + 960) % 960;
      const y = Math.round(-this.cam.y * m.k * 0.25 + 20 - alt * 10);
      b.drawImage(m.c, Math.round(x), y);
      b.drawImage(m.c, Math.round(x) + 960, y);
    }
  },

  // A huge pale mountain behind everything, fading in as the fog lifts.
  drawFarPeak(b) {
    b.globalAlpha = this.farPeak * 0.85;
    const cx = 215, top = 6, base = VIEW_H;
    for (let y = top; y < base; y++) {
      const k = (y - top) / (base - top);
      const half = Math.round(8 + k * 150 + Math.sin(y * 0.3) * 2);
      b.fillStyle = y < top + 34 ? "#e9eefc" : k < 0.45 ? "#8c86b8" : "#6a6494";
      b.fillRect(cx - half, y, half * 2, 1);
      if (y < top + 34 && y > top + 4) { b.fillStyle = "#b9c0e0"; b.fillRect(cx, y, Math.round(half * 0.9), 1); }
    }
    b.globalAlpha = this.farPeak * 0.3;
    b.fillStyle = "#ffffff";
    b.fillRect(0, 0, VIEW_W, VIEW_H);
    b.globalAlpha = 1;
  },

  drawSnow(b, dt) {
    const wind = this.game ? this.game.room.wind || 0 : 0;
    this.windX = (this.windX || 0) + (wind - (this.windX || 0)) * Math.min(1, dt * 2);
    b.fillStyle = "rgba(235,240,255,0.8)";
    for (const f of this.snow) {
      f.x += (-18 - f.s * 16 + this.windX * 2.5 * f.s) * dt; f.y += (10 + f.s * 14) * dt;
      f.p += dt;
      const x = ((f.x + Math.sin(f.p) * 3 - this.cam.x * f.s * 0.3) % VIEW_W + VIEW_W) % VIEW_W;
      const y = ((f.y - this.cam.y * f.s * 0.3) % VIEW_H + VIEW_H) % VIEW_H;
      b.fillRect(Math.round(x), Math.round(y), f.s > 1 ? 2 : 1, 1);
    }
    // Wind streaks
    if (Math.abs(this.windX) > 5) {
      this.streaks = this.streaks || [];
      if (Math.random() < Math.abs(this.windX) * dt * 0.6) {
        this.streaks.push({ x: this.windX > 0 ? -30 : VIEW_W + 30, y: Math.random() * VIEW_H, len: 12 + Math.random() * 24, v: this.windX * (5 + Math.random() * 3) });
      }
    }
    if (this.streaks) {
      b.fillStyle = "rgba(230,240,255,0.35)";
      for (let i = this.streaks.length - 1; i >= 0; i--) {
        const w = this.streaks[i];
        w.x += w.v * dt;
        if (w.x < -80 || w.x > VIEW_W + 80) { this.streaks.splice(i, 1); continue; }
        b.fillRect(Math.round(w.x), Math.round(w.y), Math.round(w.len), 1);
      }
    }
  },

  // ------------------------------------------------------------------ room tiles

  roomCanvas(game, room) {
    const key = game.chapter.id + "/" + room.id;
    let c = this.roomCache.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = room.pw; c.height = room.ph;
    const g = c.getContext("2d");
    const solid = (gx, gy) => { const t = game.tileAt(gx, gy); return t === null ? true : t === "#"; };
    for (let y = 0; y < room.h; y++) {
      for (let x = 0; x < room.w; x++) {
        const t = room.grid[y][x], gx = room.tx + x, gy = room.ty + y, px = x * TILE, py = y * TILE;
        if (t === "#") drawRock(g, px, py, gx, gy, solid);
        else if (t === "=") drawPlank(g, px, py, solid(gx - 1, gy), solid(gx + 1, gy), game.tileAt(gx - 1, gy) === "=", game.tileAt(gx + 1, gy) === "=");
        else if ("^v<>".includes(t)) drawSpike(g, px, py, t);
      }
    }
    this.roomCache.set(key, c);
    return c;
  },

  // ------------------------------------------------------------------ camera

  camTarget(game, room) {
    const p = game.p;
    return {
      x: clampN(p.x - VIEW_W / 2, room.x, room.x + room.pw - VIEW_W),
      y: clampN(p.y - 6 - VIEW_H / 2, room.y, room.y + room.ph - VIEW_H),
    };
  },

  snapCamera(game) {
    const t = this.camTarget(game, game.room);
    this.cam.x = t.x; this.cam.y = t.y;
    this.camFrom = null;
  },

  reset(game) {
    this.game = game;
    this.setTheme(game.chapter.id);
    this.particles.length = 0; this.trails.length = 0; this.hair.length = 0;
    this.orbs = null; this.banner = null;
    this.farPeak = this.farPeakTarget = 0;
    this.snapCamera(game);
    this.resetHair(game.p);
  },

  resetHair(p) {
    this.hair = [];
    for (let i = 0; i < 5; i++) this.hair.push({ x: p.x - p.facing * i, y: p.y - 10 + i * 0.5 });
  },

  // ------------------------------------------------------------------ events → effects

  effect(e, game) {
    const P = this.particles;
    const burst = (x, y, n, color, speed, life, opts = {}) => {
      for (let i = 0; i < n; i++) {
        const a = opts.angle !== undefined ? opts.angle + (Math.random() - 0.5) * (opts.spread || 1) : Math.random() * Math.PI * 2;
        const s = speed * (0.4 + Math.random() * 0.6);
        P.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, g: opts.g || 0, size: opts.size || 1 });
      }
    };
    switch (e.type) {
      case "jump": burst(e.x, e.y, e.big ? 8 : 5, "#e7ecff", 30, 0.35, { angle: -Math.PI / 2, spread: 2.4 }); break;
      case "land": burst(e.x, e.y, 4 + Math.round(e.power * 6), "#e7ecff", 25 + e.power * 30, 0.35, { angle: -Math.PI / 2, spread: 3 }); break;
      case "wallJump": burst(e.x, e.y, 6, "#e7ecff", 30, 0.35, { angle: e.dir > 0 ? 0 : Math.PI, spread: 1.6 }); break;
      case "dash":
        burst(e.x, e.y, 10, HAIR[0], 50, 0.35, { angle: Math.atan2(-e.dy, -e.dx), spread: 1.2 });
        this.shake(0.12, 1);
        Input.rumble(0.3, 80);
        break;
      case "refill": burst(e.x, e.y, 12, e.two ? "#ffa8f5" : "#8ff5bf", 45, 0.5); break;
      case "refillBack": burst(e.x, e.y, 6, "#8ff5bf", 20, 0.3); break;
      case "spring": burst(e.x, e.y, 6, "#ffe08a", 30, 0.3, { angle: -Math.PI / 2, spread: 2 }); this.shake(0.08, 1); break;
      case "crumble": this.shake(0.05, 0.5); break;
      case "crumbled": for (let i = 0; i < e.w / 4; i++) burst(e.x + i * 4 + 2, e.y + 4, 1, "#9c8763", 20, 0.6, { g: 200, size: 2 }); break;
      case "grab": burst(e.x, e.y, 3, "#e7ecff", 15, 0.25); break;
      case "berryTouch": burst(e.x, e.y, 8, e.ghost ? "#8fb8ff" : "#ff8a8a", 30, 0.4); break;
      case "berry":
        burst(e.x, e.y, 14, e.ghost ? "#8fb8ff" : "#ffd36e", 50, 0.6);
        this.berryHud = 2.5;
        break;
      case "death": {
        const col = HAIR[e.dashes] || HAIR[1];
        this.orbs = { x: e.x, y: e.y, t: 0, T: C.DeathTime, color: col, out: true };
        this.flashT = 0.12;
        this.shake(0.3, 3);
        Input.rumble(0.8, 250);
        break;
      }
      case "respawn": this.orbs = { x: e.x, y: e.y, t: 0, T: C.RespawnTime, color: HAIR[1], out: false }; this.snapCamera(game); this.resetHair(game.p); break;
      case "room":
        this.camFrom = { x: this.cam.x, y: this.cam.y };
        this.banner = { text: game.room.name, t: 0 };
        break;
      case "complete": burst(e.x + 4, e.y + 4, 30, "#ffd36e", 60, 1.2); break;
      case "zipStart": this.shake(0.1, 1); Input.rumble(0.3, 100); break;
      case "zipStop": burst(e.x, e.y, 10, "#ffcf80", 50, 0.4); this.shake(0.15, 2); Input.rumble(0.5, 120); break;
      case "berryFly": burst(e.x, e.y, 8, "#ffffff", 30, 0.4); break;
      case "dreamIn": burst(e.x, e.y, 10, "#ff6def", 40, 0.4); break;
      case "dreamOut": burst(e.x, e.y, 12, "#6ff7ff", 50, 0.45); break;
      case "switch": burst(e.x, e.y, 10, "#7ff7ff", 40, 0.5); break;
      case "gate": this.shake(0.25, 2); Input.rumble(0.5, 200); break;
      case "moveStart": this.shake(0.08, 1); break;
      case "moveBreak":
        for (let i = 0; i < 14; i++) burst(e.x + Math.random() * e.w, e.y + Math.random() * e.h, 1, "#8a6a8a", 40, 0.7, { g: 250, size: 2 });
        this.shake(0.15, 2); break;
      case "moveBack": burst(e.x + e.w / 2, e.y + e.h / 2, 8, "#c9a0ff", 25, 0.4); break;
      case "cloudBreak": for (let i = 0; i < e.w / 4; i++) burst(e.x + i * 4 + 2, e.y + 2, 1, "#ffc4e6", 25, 0.5); break;
      case "swapStop": this.shake(0.06, 1); break;
      case "boostIn": burst(e.x, e.y, 8, e.red ? "#ff5a6a" : "#5ae07a", 30, 0.35); break;
      case "redLaunch": this.shake(0.1, 1); break;
      case "cassette": burst(e.x, e.y, 18, "#ff9ad8", 50, 0.7); this.shake(0.15, 1); break;
      case "heart": burst(e.x, e.y, 24, game.chapter.base ? "#ff5a7a" : "#5aa8ff", 60, 0.9); this.shake(0.2, 2); break;
      case "goldenTouch": case "golden": burst(e.x, e.y, 16, "#ffd24a", 50, 0.6); break;
      case "flyIn": burst(e.x, e.y, 14, "#ffe08a", 45, 0.5); break;
      case "flyOut": burst(e.x, e.y, 8, "#fff4c8", 25, 0.4); break;
      case "bump": burst(e.x, e.y, 14, "#bfe8ff", 55, 0.4); this.shake(0.12, 2); Input.rumble(0.4, 90); break;
      case "redEnd": burst(e.x, e.y, 8, "#ff5a6a", 40, 0.35); this.shake(0.1, 1); break;
      case "actorIn": case "actorOut":
        burst(e.x, e.y, 10, e.kind === "echo" ? "#c9c0ee" : e.kind === "lumen" ? "#fff1c8" : "#e7ecff", 30, 0.5);
        break;
    }
  },

  shake(t, mag) { if (this.settings.shake) { this.shakeT = Math.max(this.shakeT, t); this.shakeMag = Math.max(this.shakeMag, mag); } },

  // ------------------------------------------------------------------ frame

  frame(game, dt) {
    this.time += dt;
    this.farPeak += (this.farPeakTarget - this.farPeak) * Math.min(1, dt * 0.8);
    const b = this.b, p = game.p;

    // Camera: smooth follow (Celeste's 1 - 0.01^dt), slide between rooms.
    if (game.transition && this.camFrom) {
      const t = game.transition.t / C.TransitionTime, e = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
      const to = this.camTarget(game, game.room);
      this.cam.x = lerpN(this.camFrom.x, to.x, e);
      this.cam.y = lerpN(this.camFrom.y, to.y, e);
    } else {
      this.camFrom = null;
      const to = this.camTarget(game, game.room);
      const k = 1 - Math.pow(0.01, dt);
      this.cam.x += (to.x - this.cam.x) * k;
      this.cam.y += (to.y - this.cam.y) * k;
    }
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      sx = Math.round((Math.random() - 0.5) * 2 * this.shakeMag);
      sy = Math.round((Math.random() - 0.5) * 2 * this.shakeMag);
      if (this.shakeT <= 0) this.shakeMag = 0;
    }
    const cx = Math.round(this.cam.x) + sx, cy = Math.round(this.cam.y) + sy;

    this.drawBackdrop(b);

    // Rooms on screen (the current one plus any neighbour in view during a slide).
    for (const room of game.rooms) {
      if (room.x > cx + VIEW_W || room.x + room.pw < cx || room.y > cy + VIEW_H || room.y + room.ph < cy) continue;
      b.drawImage(this.roomCanvas(game, room), room.x - cx, room.y - cy);
      this.drawObjects(b, game, room, cx, cy);
    }

    this.drawActors(b, cx, cy);
    this.updateHair(game, dt);
    if (p.state === ST_FLY) {
      this.particles.push({ x: p.x + (Math.random() - 0.5) * 6, y: p.y - 6 + (Math.random() - 0.5) * 6, vx: -p.vx * 0.15, vy: -p.vy * 0.15, life: 0.4, max: 0.4, color: Math.random() < 0.5 ? "#ffe08a" : "#fff4c8", g: 0, size: 1 });
    }
    this.drawTrails(b, dt, cx, cy);
    const visible = p.state !== ST_DEAD && p.state !== ST_RESPAWN;
    if (p.state === ST_RED) {
      this.particles.push({ x: p.x + (Math.random() - 0.5) * 4, y: p.y - 6 + (Math.random() - 0.5) * 4, vx: 0, vy: 0, life: 0.3, max: 0.3, color: "#ff5a6a", g: 0, size: 2 });
    }
    if (p.state === ST_DREAM) {
      // Inside a dream block you're a bright streak with a sparkly wake.
      const cols = ["#ff6def", "#6ff7ff", "#fff27a"];
      this.particles.push({ x: p.x + (Math.random() - 0.5) * 6, y: p.y - 6 + (Math.random() - 0.5) * 6, vx: -p.vx * 0.1, vy: -p.vy * 0.1, life: 0.35, max: 0.35, color: cols[(Math.random() * 3) | 0], g: 0, size: 1 });
      this.drawClimber(b, game, p.x - cx, p.y - cy, 0.9, "#f4ecff");
    } else if (visible) this.drawClimber(b, game, p.x - cx, p.y - cy, 1);
    this.drawFollowers(b, game, dt, cx, cy);
    this.drawWater(b, game.room, cx, cy);
    this.drawParticles(b, dt, cx, cy);
    this.drawOrbs(b, dt, cx, cy);
    this.drawSnow(b, dt);

    if (this.flashT > 0) { this.flashT -= dt; b.fillStyle = `rgba(255,255,255,${Math.min(0.6, this.flashT * 5)})`; b.fillRect(0, 0, VIEW_W, VIEW_H); }

    // Blit the buffer at a whole-number scale, then draw the HUD at full resolution.
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#07060f";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, this.ox, this.oy, VIEW_W * this.scale, VIEW_H * this.scale);
    this.drawHud(game, dt);
  },

  // ------------------------------------------------------------------ objects

  drawObjects(b, game, room, cx, cy) {
    const t = this.time;
    this.drawDream(b, game, room, cx, cy);
    this.drawGate(b, room, cx, cy);
    for (const s of room.switches) {
      const x = s.x - cx, y = s.y - cy;
      b.fillStyle = s.on ? "#7ff7ff" : "#58607a"; diamond(b, x + 4, y + 4, 3);
      b.fillStyle = s.on ? "#ffffff" : "#8a93ad"; b.fillRect(x + 3, y + 3, 2, 2);
      if (s.on) { b.globalAlpha = 0.3 + 0.2 * Math.sin(t * 6); b.fillStyle = "#7ff7ff"; diamond(b, x + 4, y + 4, 5); b.globalAlpha = 1; }
    }
    for (const z of room.zips) this.drawZipTrack(b, z, cx, cy);
    for (const z of room.zips) this.drawZip(b, z, cx, cy);
    for (const m of room.swaps) this.drawSwapTrack(b, m, cx, cy);
    for (const m of room.swaps) this.drawSwap(b, m, cx, cy);
    for (const m of room.moves) this.drawMove(b, m, cx, cy);
    for (const c of room.clouds) this.drawCloud(b, c, cx, cy);
    for (const bo of room.boosters) this.drawBubble(b, game, bo, cx, cy);
    for (const f of room.feathers) this.drawFeather(b, f, cx, cy);
    for (const it of room.items) if (!it.got) this.drawItem(b, it, cx, cy, game.chapter.base);
    const gb = game.golden;
    if (gb && gb.state === 0 && gb.room === room) drawBerry(b, gb.hx - cx, gb.hy - cy + Math.round(Math.sin(this.time * 2.5) * 1.5), false, true);
    for (const bu of room.bumpers) this.drawBumper(b, bu, cx, cy);
    for (const c of room.crumbles) {
      const shake = c.state === 1 ? Math.round((Math.random() - 0.5) * 2) : 0;
      for (let k = 0; k < c.w / TILE; k++) {
        const x = c.x + k * TILE - cx + shake, y = c.y - cy;
        if (c.state === 2) {
          b.fillStyle = "rgba(200,180,140,0.25)";
          b.fillRect(x, y, 8, 1); b.fillRect(x, y + 7, 8, 1); b.fillRect(x, y, 1, 8); b.fillRect(x + 7, y, 1, 8);
          continue;
        }
        b.fillStyle = "#8f7a5c"; b.fillRect(x, y, 8, 8);
        b.fillStyle = "#b39a73"; b.fillRect(x, y, 8, 2);
        b.fillStyle = "#5e4d38"; b.fillRect(x + 2 + (k % 2) * 3, y + 3, 1, 3); b.fillRect(x, y + 7, 8, 1);
      }
    }
    for (const s of room.springs) {
      const x = s.x - cx, y = s.y - cy, ext = s.t > 0.12 ? 3 : s.t > 0 ? 1 : 0;
      b.fillStyle = "#5f6b84"; b.fillRect(x, y + 6, 8, 2);
      b.fillStyle = "#c9d2e3"; b.fillRect(x + 2, y + 4 - ext, 1, 2 + ext); b.fillRect(x + 5, y + 4 - ext, 1, 2 + ext);
      b.fillStyle = "#e25555"; b.fillRect(x, y + 3 - ext, 8, 2);
    }
    for (const r of room.refills) {
      const x = Math.round(r.x - cx), y = Math.round(r.y - cy + Math.sin(t * 3 + r.x) * 1.2);
      if (r.respawn > 0) {
        b.fillStyle = "rgba(143,245,191,0.35)";
        b.fillRect(x, y - 4, 1, 1); b.fillRect(x - 3, y, 1, 1); b.fillRect(x + 3, y, 1, 1); b.fillRect(x, y + 4, 1, 1);
        continue;
      }
      b.fillStyle = r.two ? "#9a2f86" : "#1f7a4d"; diamond(b, x, y, 4);
      b.fillStyle = r.two ? "#ff6def" : "#57e39a"; diamond(b, x, y, 3);
      b.fillStyle = "#d9ffe9"; b.fillRect(x - 1, y - 2, 1, 2);
    }
    for (const be of room.berries) {
      if (be.state === 3) {
        // Frightened off: flutter up and away.
        const ft = game.time - be.flyT;
        if (ft > 2) continue;
        const x = be.hx - cx + Math.sin(ft * 9) * 3, y = be.hy - cy - ft * 70 - ft * ft * 60;
        drawWings(b, x, y, t, 2);
        drawBerry(b, x, y, be.ghost);
        continue;
      }
      if (be.state !== 0) continue;
      const bob = Math.round(Math.sin(t * 2.5 + be.hx) * 1.5);
      if (be.winged) drawWings(b, be.hx - cx, be.hy - cy + bob, t, 1);
      drawBerry(b, be.hx - cx, be.hy - cy + bob, be.ghost);
    }
    if (room.goal) {
      const x = room.goal.x - cx, y = room.goal.y - cy;
      b.fillStyle = "#c8c0d8"; b.fillRect(x + 1, y - 6, 1, 22);
      const wave = Math.round(Math.sin(t * 4));
      b.fillStyle = "#ff6d8a";
      for (let i = 0; i < 7; i++) b.fillRect(x + 2 + i, y - 6 + (i > 3 ? wave : 0), 1, 5 - Math.floor(i / 2));
      b.fillStyle = `rgba(255,220,140,${0.4 + Math.sin(t * 3) * 0.2})`;
      b.fillRect(x - 2, y + 14, 8, 1);
    }
  },

  // Dream blocks: a dark window full of drifting coloured stars with a bright rim.
  drawDream(b, game, room, cx, cy) {
    if (!room.dreamTiles) {
      room.dreamTiles = [];
      for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) if (room.grid[y][x] === "D") room.dreamTiles.push([x, y]);
    }
    if (!room.dreamTiles.length) return;
    const inside = game.p.state === ST_DREAM, t = this.time;
    const cols = ["#ff6def", "#6ff7ff", "#fff27a", "#9d7bff", "#ffffff"];
    const isD = (x, y) => x >= 0 && y >= 0 && x < room.w && y < room.h && room.grid[y][x] === "D";
    for (const [x, y] of room.dreamTiles) {
      const px = room.x + x * TILE - cx, py = room.y + y * TILE - cy;
      if (px < -8 || py < -8 || px > VIEW_W || py > VIEW_H) continue;
      b.fillStyle = inside ? "#2a1c52" : "#140c2c"; b.fillRect(px, py, 8, 8);
      const h = hash2(room.tx + x, room.ty + y);
      for (let k = 0; k < 2; k++) {
        const hk = h >>> (k * 9);
        const sx = (hk & 7) + Math.round(Math.sin(t * 0.8 + (hk & 31)) * 1), sy = ((hk >> 3) & 7);
        b.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3 + (hk & 63));
        b.fillStyle = cols[(hk >> 6) % cols.length];
        b.fillRect(px + ((sx % 8) + 8) % 8, py + sy, 1, 1);
      }
      b.globalAlpha = 1;
      b.fillStyle = "#ffffff";
      if (!isD(x - 1, y)) b.fillRect(px, py, 1, 8);
      if (!isD(x + 1, y)) b.fillRect(px + 7, py, 1, 8);
      if (!isD(x, y - 1)) b.fillRect(px, py, 8, 1);
      if (!isD(x, y + 1)) b.fillRect(px, py + 7, 8, 1);
    }
  },

  // Gate blocks: steel with a glowing seam while locked, a faint outline once open.
  drawGate(b, room, cx, cy) {
    if (!room.hasGate) return;
    if (!room.gateTiles) {
      room.gateTiles = [];
      for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) if (room.grid[y][x] === "X") room.gateTiles.push([x, y]);
    }
    const lit = room.switches.filter((s) => s.on).length / Math.max(1, room.switches.length);
    for (const [x, y] of room.gateTiles) {
      const px = room.x + x * TILE - cx, py = room.y + y * TILE - cy;
      if (room.gateOpen) {
        b.fillStyle = "rgba(127,247,255,0.18)";
        b.fillRect(px, py, 8, 1); b.fillRect(px, py + 7, 8, 1); b.fillRect(px, py, 1, 8); b.fillRect(px + 7, py, 1, 8);
        continue;
      }
      b.fillStyle = "#4a5170"; b.fillRect(px, py, 8, 8);
      b.fillStyle = "#6d7699"; b.fillRect(px, py, 8, 1); b.fillRect(px, py, 1, 8);
      b.fillStyle = "#2c3148"; b.fillRect(px, py + 7, 8, 1); b.fillRect(px + 7, py, 1, 8);
      b.fillStyle = lit > 0 ? `rgba(127,247,255,${0.35 + lit * 0.6})` : "#343a55";
      b.fillRect(px + 3, py + 2, 2, 4);
    }
  },

  drawZipTrack(b, z, cx, cy) {
    const x0 = z.sx + z.w / 2 - cx, y0 = z.sy + z.h / 2 - cy, x1 = z.ex + z.w / 2 - cx, y1 = z.ey + z.h / 2 - cy;
    const len = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    b.fillStyle = "#1d1720";
    for (let i = 0; i <= len; i++) {
      const x = x0 + (x1 - x0) * i / len, y = y0 + (y1 - y0) * i / len;
      b.fillRect(Math.round(x + nx * 2), Math.round(y + ny * 2), 1, 1);
      b.fillRect(Math.round(x - nx * 2), Math.round(y - ny * 2), 1, 1);
    }
    for (const [gx, gy] of [[x0, y0], [x1, y1]]) {
      b.fillStyle = "#3a2f3e"; diamond(b, Math.round(gx), Math.round(gy), 4);
      b.fillStyle = "#8a7a6a"; diamond(b, Math.round(gx), Math.round(gy), 2);
    }
  },

  // The block itself, with a traffic light: yellow waiting, green going, red coming back.
  drawZip(b, z, cx, cy) {
    const shake = z.state === 1 || (z.state === 3 && z.t > 0.3) ? Math.round((Math.random() - 0.5) * 2) : 0;
    const x = z.x - cx + shake, y = z.y - cy;
    b.fillStyle = "#1f1a24"; b.fillRect(x, y, z.w, z.h);
    b.fillStyle = "#4b4152"; b.fillRect(x + 1, y + 1, z.w - 2, z.h - 2);
    b.fillStyle = "#6b5f73"; b.fillRect(x + 1, y + 1, z.w - 2, 1);
    b.fillStyle = "#2c2533";
    for (let i = 4; i < z.w - 2; i += 4) b.fillRect(x + i, y + 3, 1, z.h - 5);
    const light = z.state === 1 || z.state === 2 ? "#62e06a" : z.state === 3 || z.state === 4 ? "#ff5a5a" : "#ffd35a";
    const lx = x + Math.floor(z.w / 2) - 2, ly = y + Math.floor(z.h / 2) - 2;
    b.fillStyle = "#15111a"; b.fillRect(lx - 1, ly - 1, 6, 6);
    b.fillStyle = light; b.fillRect(lx, ly, 4, 4);
    b.fillStyle = "#ffffff"; b.fillRect(lx, ly, 1, 1);
  },

  // Story characters, standing where the current scene put them.
  drawActors(b, cx, cy) {
    if (typeof Story === "undefined") return;
    for (const a of Story.actors) {
      if (a.alpha <= 0) continue;
      const x = Math.round(a.x - cx), y = Math.round(a.y - cy);
      if (x < -20 || x > VIEW_W + 20 || y < -20 || y > VIEW_H + 30) continue;
      b.save();
      b.translate(x, y);
      if (a.facing < 0) b.scale(-1, 1);
      drawActor(b, a.kind, a.alpha, this.time);
      b.restore();
    }
  },

  // Cassettes and crystal hearts (blue in A-sides, red in B-sides), with a slow glow.
  drawItem(b, it, cx, cy, bside) {
    const x = Math.round(it.x - cx), y = Math.round(it.y - cy + Math.sin(this.time * 2 + it.x) * 1.5);
    b.globalAlpha = it.ghost ? 0.45 : 1;
    if (it.kind === "cassette") {
      b.fillStyle = "rgba(255,120,200,0.25)"; diamond(b, x, y, 8);
      b.fillStyle = "#2a2233"; b.fillRect(x - 6, y - 4, 12, 8);
      b.fillStyle = bside ? "#ff7090" : "#ff9ad8"; b.fillRect(x - 5, y - 3, 10, 3);
      b.fillStyle = "#e8e2ff"; b.fillRect(x - 3, y + 1, 2, 2); b.fillRect(x + 1, y + 1, 2, 2);
    } else {
      const col = bside ? ["#ff5a7a", "#ffb0c0"] : ["#5aa8ff", "#c0e4ff"];
      b.fillStyle = `rgba(${bside ? "255,90,122" : "90,168,255"},${0.2 + 0.15 * Math.sin(this.time * 3)})`; diamond(b, x, y, 9);
      b.fillStyle = col[0];
      b.fillRect(x - 4, y - 3, 3, 2); b.fillRect(x + 1, y - 3, 3, 2); b.fillRect(x - 5, y - 2, 11, 3); b.fillRect(x - 4, y + 1, 9, 1);
      b.fillRect(x - 3, y + 2, 7, 1); b.fillRect(x - 2, y + 3, 5, 1); b.fillRect(x - 1, y + 4, 3, 1); b.fillRect(x, y + 5, 1, 1);
      b.fillStyle = col[1]; b.fillRect(x - 3, y - 2, 2, 1); b.fillRect(x - 4, y - 1, 1, 1);
    }
    b.globalAlpha = 1;
  },

  drawFeather(b, f, cx, cy) {
    const x = Math.round(f.x - cx), y = Math.round(f.y - cy + Math.sin(this.time * 3 + f.x) * 1.5);
    if (f.respawn > 0) { b.fillStyle = "rgba(255,220,120,0.25)"; b.fillRect(x, y, 1, 1); return; }
    b.globalAlpha = 0.25 + 0.1 * Math.sin(this.time * 5); b.fillStyle = "#ffe08a"; diamond(b, x, y, 6); b.globalAlpha = 1;
    b.fillStyle = "#ffd24a";
    for (let i = 0; i < 7; i++) b.fillRect(x - 3 + i, y + 3 - i, 2, 1);   // quill
    b.fillStyle = "#fff4c8";
    for (let i = 0; i < 5; i++) b.fillRect(x - 2 + i, y + 1 - i, 1, 2);
    b.fillStyle = "#c98a1a"; b.fillRect(x - 4, y + 4, 1, 1);
  },

  drawBumper(b, bu, cx, cy) {
    const x = Math.round(bu.x - cx), y = Math.round(bu.y - cy);
    const hit = bu.respawn > 0, pulse = Math.sin(this.time * 4) * 0.5 + 0.5;
    b.fillStyle = hit ? "#5a3a6a" : "#2c1f4a"; diamond(b, x, y, 7); b.fillRect(x - 5, y - 5, 11, 11);
    b.fillStyle = hit ? "#ff9ad8" : `rgba(120,200,255,${0.6 + pulse * 0.4})`;
    for (let a = 0; a < 20; a++) {
      const ang = a / 20 * Math.PI * 2;
      b.fillRect(Math.round(x + Math.cos(ang) * 7), Math.round(y + Math.sin(ang) * 7), 1, 1);
    }
    b.fillStyle = hit ? "#ffd0ee" : "#bfe8ff"; b.fillRect(x - 2, y - 2, 4, 4);
    b.fillStyle = "#ffffff"; b.fillRect(x - 1, y - 1, 2, 2);
  },

  // Rising dark water, with a restless bright surface.
  drawWater(b, room, cx, cy) {
    const w = room.water;
    if (!w) return;
    const top = Math.round(w.y - cy), bottom = room.y + room.ph - cy + 20;
    if (top > VIEW_H) return;
    b.fillStyle = "rgba(10,30,44,0.88)"; b.fillRect(0, Math.max(0, top), VIEW_W, bottom - top);
    b.fillStyle = "rgba(90,200,220,0.7)";
    for (let x = 0; x < VIEW_W; x += 2) {
      const h = Math.round(Math.sin((x + cx) * 0.12 + this.time * 4) * 1.5);
      b.fillRect(x, top + h, 2, 1);
    }
  },

  drawCloud(b, c, cx, cy) {
    const x = c.x - cx, y = c.y - cy;
    if (c.gone) {
      b.fillStyle = "rgba(255,200,230,0.18)";
      for (let i = 0; i < c.w; i += 4) b.fillRect(x + i, c.by - cy + 2, 2, 1);
      return;
    }
    const body = c.fragile ? "#ffc4e6" : "#f4f6ff", shade = c.fragile ? "#e08ab8" : "#b9c3e8";
    b.fillStyle = shade; b.fillRect(x + 1, y + 3, c.w - 2, 3);
    b.fillStyle = body; b.fillRect(x, y, c.w, 4);
    for (let i = 2; i < c.w - 2; i += 6) b.fillRect(x + i, y - 2, 5, 2);
    b.fillStyle = "#ffffff"; b.fillRect(x + 3, y, c.w - 8, 1);
  },

  // Move blocks: dark stone with an arrow showing where they'll roll.
  drawMove(b, m, cx, cy) {
    if (m.gone) {
      b.fillStyle = "rgba(255,210,150,0.2)";
      const x = m.sx - cx, y = m.sy - cy;
      b.fillRect(x, y, m.w, 1); b.fillRect(x, y + m.h - 1, m.w, 1); b.fillRect(x, y, 1, m.h); b.fillRect(x + m.w - 1, y, 1, m.h);
      return;
    }
    const shake = m.state === 1 && m.t > 0 ? Math.round((Math.random() - 0.5) * 2) : 0;
    const x = m.x - cx + shake, y = m.y - cy;
    b.fillStyle = "#2a2230"; b.fillRect(x, y, m.w, m.h);
    b.fillStyle = m.state === 1 ? "#6a4a3a" : "#4a3c4c"; b.fillRect(x + 1, y + 1, m.w - 2, m.h - 2);
    b.fillStyle = m.state === 1 ? "#ffcf6a" : "#c9a0ff";
    b.fillRect(x, y, m.w, 1); b.fillRect(x, y + m.h - 1, m.w, 1); b.fillRect(x, y, 1, m.h); b.fillRect(x + m.w - 1, y, 1, m.h);
    const ax = x + Math.floor(m.w / 2), ay = y + Math.floor(m.h / 2);
    const [dx, dy] = DIRV[m.dir];
    for (let i = 0; i < 4; i++) {
      // an arrow head made of shrinking bars
      const len = 7 - i * 2;
      if (dx) b.fillRect(ax + dx * (i - 1), ay - Math.floor(len / 2), 1, len);
      else b.fillRect(ax - Math.floor(len / 2), ay + dy * (i - 1), len, 1);
    }
  },

  drawSwapTrack(b, m, cx, cy) {
    const x0 = m.sx - cx, y0 = m.sy - cy, x1 = m.ex - cx, y1 = m.ey - cy;
    const l = Math.min(x0, x1), t = Math.min(y0, y1), r = Math.max(x0, x1) + m.w, bt = Math.max(y0, y1) + m.h;
    b.fillStyle = "rgba(120,90,160,0.35)";
    b.fillRect(l, t, r - l, bt - t);
    b.fillStyle = "rgba(200,170,255,0.4)";
    b.fillRect(l, t, r - l, 1); b.fillRect(l, bt - 1, r - l, 1); b.fillRect(l, t, 1, bt - t); b.fillRect(r - 1, t, 1, bt - t);
  },

  // Swap blocks: red when heading for the far end, blue when heading home.
  drawSwap(b, m, cx, cy) {
    const x = m.x - cx, y = m.y - cy;
    b.fillStyle = "#1d1628"; b.fillRect(x, y, m.w, m.h);
    b.fillStyle = m.target ? "#8a3050" : "#30508a"; b.fillRect(x + 1, y + 1, m.w - 2, m.h - 2);
    b.fillStyle = m.target ? "#ff6d8a" : "#6db8ff";
    b.fillRect(x + 1, y + 1, m.w - 2, 1);
    const gx = x + Math.floor(m.w / 2) - 2, gy = y + Math.floor(m.h / 2) - 2;
    b.fillRect(gx, gy, 4, 4);
    b.fillStyle = "#ffffff"; b.fillRect(gx + 1, gy + 1, 2, 2);
  },

  drawBubble(b, game, bo, cx, cy) {
    const x = Math.round(bo.x - cx), y = Math.round(bo.y - cy + (bo.respawn > 0 ? 0 : Math.sin(this.time * 3 + bo.x) * 1));
    const col = bo.red ? "#ff5a6a" : "#5ae07a";
    if (bo.respawn > 0 && !(game.p.state === ST_BOOST && game.p.booster === bo)) {
      b.fillStyle = bo.red ? "rgba(255,90,106,0.25)" : "rgba(90,224,122,0.25)";
      b.fillRect(x - 1, y - 1, 2, 2);
      return;
    }
    b.globalAlpha = 0.35; b.fillStyle = col; diamond(b, x, y, 7); b.globalAlpha = 1;
    b.fillStyle = col;
    for (let a = 0; a < 16; a++) {
      const ang = a / 16 * Math.PI * 2;
      b.fillRect(Math.round(x + Math.cos(ang) * 7), Math.round(y + Math.sin(ang) * 7), 1, 1);
    }
    b.fillStyle = "#ffffff"; b.fillRect(x - 3, y - 4, 2, 1);
  },

  drawFollowers(b, game, dt, cx, cy) {
    const tr = game.trail;
    let i = 0;
    const gb = game.golden;
    if (gb && gb.state === 1) {
      // The golden strawberry follows closest.
      const pt = tr[Math.min(tr.length - 1, 8)];
      if (pt) { const k = 1 - Math.pow(0.0005, dt); gb.x += (pt.x - 6 * game.p.facing - gb.x) * k; gb.y += (pt.y - 8 - gb.y) * k; }
      drawBerry(b, Math.round(gb.x - cx), Math.round(gb.y - cy), false, true);
      i++;
    }
    for (const be of game.following()) {
      const pt = tr[Math.min(tr.length - 1, 10 + i * 10)];
      if (pt) {
        const k = 1 - Math.pow(0.0005, dt);
        be.x += (pt.x - 6 * game.p.facing - be.x) * k;
        be.y += (pt.y - 6 - be.y) * k;
      }
      drawBerry(b, Math.round(be.x - cx), Math.round(be.y - cy), be.ghost);
      i++;
    }
  },

  // ------------------------------------------------------------------ the climber

  hairColor(game) {
    const p = game.p;
    if (p.flash > 0) return "#ffffff";
    const tired = p.stamina < C.ClimbTiredThreshold && Math.floor(this.time / 0.05) % 2 === 0;
    if (tired) return "#ff3030";
    return HAIR[p.state === ST_DASH && p.dashPhase < 2 ? 0 : p.dashes] || HAIR[1];
  },

  updateHair(game, dt) {
    const p = game.p, h = this.hair;
    if (!h.length) this.resetHair(p);
    const duck = p.ducking ? 5 : 0;
    const head = { x: p.x - p.facing * 1, y: p.y - 10 + duck };
    h[0].x = head.x; h[0].y = head.y;
    for (let i = 1; i < h.length; i++) {
      const tx = h[i - 1].x - p.facing * 1.6, ty = h[i - 1].y + 0.6;
      const k = 1 - Math.pow(0.0001, dt);
      h[i].x += (tx - h[i].x) * k; h[i].y += (ty - h[i].y) * k;
      const dx = h[i].x - h[i - 1].x, dy = h[i].y - h[i - 1].y, d = Math.hypot(dx, dy);
      if (d > 2.2) { h[i].x = h[i - 1].x + dx / d * 2.2; h[i].y = h[i - 1].y + dy / d * 2.2; }
    }
  },

  // Draw the climber into a 16×16 sprite, then stamp it with squash and stretch.
  drawClimber(b, game, x, y, alpha, silhouette) {
    const p = game.p, s = this.sp;
    s.clearRect(0, 0, 16, 16);
    const hairCol = silhouette || this.hairColor(game);
    // The sprite is drawn facing right and mirrored when facing left.
    const f = 1, flipDir = p.facing, duck = p.ducking;
    const col = (c) => silhouette || c;
    // Local sprite origin: feet at (8, 15).
    const ox = 8, oy = 15;
    const walking = p.onGround && Math.abs(p.vx) > 10 && !duck;
    const stepPh = walking ? Math.floor(game.time * 10) % 2 : 0;
    const bodyTop = duck ? oy - 5 : oy - 8;
    // Hair (behind), in sprite space relative to feet.
    s.fillStyle = hairCol;
    for (let i = this.hair.length - 1; i >= 0; i--) {
      const hx = Math.round((this.hair[i].x - p.x) * flipDir + ox), hy = Math.round(this.hair[i].y - p.y + oy);
      const r = i === 0 ? 2 : i < 3 ? 2 : 1;
      s.fillRect(hx - r + 1, hy - r + 1, r * 2 - 1 + (i === 0 ? 1 : 0), r * 2 - 1);
    }
    // Legs
    s.fillStyle = col(PAL.legs);
    if (duck) s.fillRect(ox - 3, oy - 1, 6, 1);
    else { s.fillRect(ox - 2 + (stepPh ? 1 : 0), oy - 2, 1, 2); s.fillRect(ox + 1 - (stepPh ? 1 : 0), oy - 2, 1, 2); }
    // Coat
    s.fillStyle = col(PAL.coat);
    s.fillRect(ox - 3, bodyTop + 3, 6, duck ? 2 : 4);
    s.fillStyle = col(PAL.coatDark);
    s.fillRect(ox - 3, bodyTop + (duck ? 4 : 6), 6, 1);
    // Arm: up on the wall when climbing, otherwise at the side
    if (p.state === ST_CLIMB) { s.fillStyle = col(PAL.coat); s.fillRect(ox + f * 3, bodyTop + 1, 1, 3); }
    // Head
    s.fillStyle = col(PAL.skin);
    s.fillRect(ox - 2, bodyTop - 1, 5, 4);
    s.fillStyle = hairCol;
    s.fillRect(ox - 2, bodyTop - 2, 5, 2);
    s.fillRect(ox - 2 - (f > 0 ? 1 : -5), bodyTop - 1, 1, 2);
    if (!silhouette) { s.fillStyle = PAL.eye; s.fillRect(ox + (f > 0 ? 1 : -1), bodyTop + 1, 1, 1); }

    const w = Math.max(4, Math.round(16 * p.sx)), h = Math.max(4, Math.round(16 * p.sy));
    b.globalAlpha = alpha;
    const flip = flipDir < 0;
    b.save();
    b.translate(Math.round(x), Math.round(y) + 1);
    if (flip) b.scale(-1, 1);
    b.drawImage(this.sprite, -Math.round(w / 2), -h, w, h);
    b.restore();
    b.globalAlpha = 1;
  },

  drawTrails(b, dt, cx, cy) {
    const g = this.game, p = g.p;
    if (p.state === ST_DASH && p.dashPhase >= 2) {
      this.trailT -= dt;
      if (this.trailT <= 0) { this.trailT = 0.05; this.trails.push({ x: p.x, y: p.y, facing: p.facing, sx: p.sx, sy: p.sy, ducking: p.ducking, t: 0.3 }); }
    }
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i];
      t.t -= dt;
      if (t.t <= 0) { this.trails.splice(i, 1); continue; }
      const saved = { x: p.x, y: p.y, facing: p.facing, sx: p.sx, sy: p.sy, ducking: p.ducking };
      Object.assign(p, { x: t.x, y: t.y, facing: t.facing, sx: t.sx, sy: t.sy, ducking: t.ducking });
      this.drawClimber(b, g, t.x - cx, t.y - cy, t.t / 0.3 * 0.7, HAIR[p.dashes] === HAIR[0] ? "#6fc6ff" : "#ff8f8f");
      Object.assign(p, saved);
    }
  },

  drawParticles(b, dt, cx, cy) {
    const P = this.particles;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i];
      q.life -= dt;
      if (q.life <= 0) { P.splice(i, 1); continue; }
      q.vy += q.g * dt;
      q.vx *= 1 - 3 * dt; q.vy *= q.g ? 1 : 1 - 3 * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      b.globalAlpha = Math.min(1, q.life / q.max * 1.5);
      b.fillStyle = q.color;
      b.fillRect(Math.round(q.x - cx), Math.round(q.y - cy), q.size, q.size);
    }
    b.globalAlpha = 1;
  },

  // Death: the climber bursts into a ring of hair-coloured orbs; respawning plays it in reverse.
  drawOrbs(b, dt, cx, cy) {
    const o = this.orbs;
    if (!o) return;
    o.t += dt;
    const k = Math.min(1, o.t / o.T);
    const r = o.out ? 4 + k * 22 : 26 * (1 - k);
    b.globalAlpha = o.out ? 1 - k * 0.6 : 0.4 + k * 0.6;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + (o.out ? k : -k) * 1.5;
      const x = Math.round(o.x + Math.cos(a) * r - cx), y = Math.round(o.y + Math.sin(a) * r - cy);
      const s = o.out && k < 0.5 ? 5 : 4;
      b.fillStyle = o.color;
      b.fillRect(x - 2, y - 2, s, s);
      b.fillStyle = "#fff";
      b.fillRect(x - 1, y - 1, 2, 2);
    }
    b.globalAlpha = 1;
    if (k >= 1) this.orbs = null;
  },

  // ------------------------------------------------------------------ HUD

  drawHud(game, dt) {
    const ctx = this.ctx, s = this.scale, ox = this.ox, oy = this.oy;
    const fs = Math.max(12, Math.round(7 * s));
    ctx.textBaseline = "top";
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    const text = (t, x, y, align = "left", color = "#fff") => {
      ctx.textAlign = align;
      ctx.lineWidth = Math.max(3, fs * 0.18); ctx.strokeStyle = "rgba(10,8,25,0.85)"; ctx.fillStyle = color;
      ctx.strokeText(t, x, y); ctx.fillText(t, x, y);
    };
    if (this.banner) {
      this.banner.t += dt;
      const t = this.banner.t, a = t < 0.3 ? t / 0.3 : t > 2.2 ? Math.max(0, 1 - (t - 2.2) / 0.5) : 1;
      if (a <= 0) this.banner = null;
      else { ctx.globalAlpha = a; text(this.banner.text, ox + 8 * s, oy + 8 * s, "left", "#e8e2ff"); ctx.globalAlpha = 1; }
    }
    if ((this.berryHud > 0 || game.paused) && game.totalBerries() > 0) {
      this.berryHud -= dt;
      const a = Math.min(1, Math.max(this.berryHud, game.paused ? 1 : 0));
      ctx.globalAlpha = a;
      const y = oy + (this.banner ? 20 : 8) * s;
      ctx.fillStyle = "#e0404f";
      ctx.beginPath(); ctx.arc(ox + 12 * s, y + fs * 0.55, fs * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#5bd06b"; ctx.fillRect(ox + 12 * s - fs * 0.25, y, fs * 0.5, fs * 0.2);
      text(`${game.collected.size} / ${game.totalBerries()}`, ox + 12 * s + fs * 0.7, y);
      ctx.globalAlpha = 1;
    }
    if (this.settings.timer) text(formatTime(game.time), ox + (VIEW_W - 6) * s, oy + 6 * s, "right", "#ffe7a0");
  },
};

// ---------------------------------------------------------------------------- tile art

function drawRock(g, px, py, gx, gy, solid) {
  const up = solid(gx, gy - 1), dn = solid(gx, gy + 1), lf = solid(gx - 1, gy), rt = solid(gx + 1, gy);
  const inner = up && dn && lf && rt && solid(gx - 1, gy - 1) && solid(gx + 1, gy - 1) && solid(gx - 1, gy + 1) && solid(gx + 1, gy + 1);
  let depth = inner ? 2 : 0;
  if (inner && solid(gx, gy - 2) && solid(gx - 2, gy) && solid(gx + 2, gy) && solid(gx, gy + 2)) depth = 3;
  g.fillStyle = PAL.rock[depth];
  g.fillRect(px, py, 8, 8);
  // Speckles so big rock faces aren't flat.
  const h = hash2(gx, gy);
  g.fillStyle = PAL.rock[Math.min(3, depth + 1)];
  g.fillRect(px + (h & 7), py + ((h >> 3) & 7), 1, 1);
  g.fillRect(px + ((h >> 6) & 7), py + ((h >> 9) & 7), 2, 1);
  if (!inner) {
    g.fillStyle = PAL.rock[1];
    if (up) g.fillRect(px + ((h >> 12) & 3) + 2, py + 3, 2, 1);
  }
  if (!lf) { g.fillStyle = PAL.edge; g.fillRect(px, py, 1, 8); }
  if (!rt) { g.fillStyle = PAL.edge; g.fillRect(px + 7, py, 1, 8); }
  if (!dn) { g.fillStyle = PAL.under; g.fillRect(px, py + 7, 8, 1); }
  if (!up) {
    // Snow on every exposed top, with a ragged drip line.
    g.fillStyle = PAL.snow; g.fillRect(px, py, 8, 2);
    g.fillStyle = PAL.snowShade; g.fillRect(px, py + 2, 8, 1);
    g.fillStyle = PAL.snow;
    for (let i = 0; i < 8; i++) if (((h >> i) & 3) === 0) g.fillRect(px + i, py + 2, 1, 1);
  }
}

function drawPlank(g, px, py, wallL, wallR, joinL, joinR) {
  g.fillStyle = PAL.plank; g.fillRect(px, py, 8, 2);
  g.fillStyle = PAL.plankDark; g.fillRect(px, py + 2, 8, 1);
  if (!joinL) { g.fillRect(px + 1, py + 3, 1, wallL ? 0 : 3); }
  if (!joinR) { g.fillRect(px + 6, py + 3, 1, wallR ? 0 : 3); }
}

function drawSpike(g, px, py, t) {
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 4; i++) {
      const len = i < 2 ? i * 2 + 1 : (3 - i) * 2 + 1;
      g.fillStyle = i < 2 ? PAL.spike : PAL.spikeDark;
      const o = k * 4 + i;
      if (t === "^") g.fillRect(px + o, py + 8 - len - 1, 1, len + 1);
      else if (t === "v") g.fillRect(px + o, py, 1, len + 1);
      else if (t === ">") g.fillRect(px, py + o, len + 1, 1);
      else g.fillRect(px + 8 - len - 1, py + o, len + 1, 1);
    }
  }
}

function drawBerry(b, x, y, ghost, gold) {
  x = Math.round(x); y = Math.round(y);
  if (gold) { b.fillStyle = "rgba(255,215,90,0.3)"; diamond(b, x, y, 6); }
  b.fillStyle = gold ? "#f0b020" : ghost ? "rgba(111,160,255,0.75)" : "#d8323f";
  b.fillRect(x - 2, y - 1, 5, 3); b.fillRect(x - 1, y + 2, 3, 1); b.fillRect(x - 1, y - 2, 3, 1);
  b.fillStyle = ghost ? "rgba(200,220,255,0.8)" : "#ff9a8a";
  b.fillRect(x - 1, y - 1, 1, 1); b.fillRect(x + 1, y + 1, 1, 1);
  b.fillStyle = ghost ? "rgba(150,200,255,0.8)" : "#4cc15a";
  b.fillRect(x - 2, y - 3, 5, 1); b.fillRect(x, y - 4, 1, 1);
}

// Characters, drawn facing right with their feet at (0, 0).
function drawActor(b, kind, alpha, t) {
  const r = (c, x, y, w, h) => { b.fillStyle = c; b.fillRect(x, y, w, h); };
  if (kind === "echo") {
    // Wren's shape, pale and blurred, flickering slightly.
    b.globalAlpha = alpha * (0.7 + 0.15 * Math.sin(t * 7));
    r("#c9c0ee", -5, -12, 3, 5); r("#c9c0ee", -6, -9, 2, 4);             // hair
    r("#d7d3ee", -3, -6, 6, 4); r("#b8b2d8", -3, -3, 6, 1);              // coat
    r("#8e86b8", -2, -2, 1, 2); r("#8e86b8", 1, -2, 1, 2);               // legs
    r("#eceaff", -2, -10, 5, 4); r("#c9c0ee", -2, -11, 5, 2);           // head
    r("#3b2f70", 1, -8, 1, 1);
    b.globalAlpha = alpha * 0.25;
    r("#c9c0ee", -4 + Math.round(Math.sin(t * 3) * 2), -14, 1, 1);
    r("#c9c0ee", 3 + Math.round(Math.cos(t * 2) * 2), -12, 1, 1);
  } else if (kind === "tilly") {
    b.globalAlpha = alpha;
    r("#5a4030", -3, -2, 6, 2);                                          // skirt
    r("#3e6b52", -4, -7, 7, 5); r("#2f5540", -4, -3, 7, 1);              // shawl
    r("#e8c39e", -2, -10, 5, 3);                                         // face
    r("#d9d6d0", -3, -12, 6, 2); r("#d9d6d0", -2, -13, 3, 1);            // hair and bun
    r("#2a2020", 1, -9, 1, 1);
    r("#6a5a4a", 3, -6, 1, 3);                                           // lantern
    const glow = 0.35 + 0.1 * Math.sin(t * 5);
    b.globalAlpha = alpha * glow; r("#ffd98a", 1, -5, 5, 5); b.globalAlpha = alpha;
    r("#ffe7a0", 2, -3, 3, 3);
  } else if (kind === "pascal") {
    b.globalAlpha = alpha;
    r("#3b3355", -2, -3, 1, 3); r("#3b3355", 1, -3, 1, 3);              // legs
    r("#e8e0d0", -3, -9, 6, 6); r("#8a5a3a", -2, -8, 4, 5);              // shirt and apron
    r("#d9a57a", -2, -13, 5, 4);                                         // face
    r("#3a281c", -3, -15, 6, 2); r("#3a281c", -3, -13, 1, 2);            // hair
    r("#c9a25a", -2, -14, 5, 1); r("#8fd3e8", 1, -14, 1, 1);             // goggles
    r("#1a1410", 1, -12, 1, 1);
  } else if (kind === "pascalFrozen") {
    // Pascal caught in the temple: pale, glassy and perfectly still.
    b.globalAlpha = alpha;
    r("#6a8a9a", -2, -3, 1, 3); r("#6a8a9a", 1, -3, 1, 3);
    r("#cfe8f0", -3, -9, 6, 6); r("#8fb0c0", -2, -8, 4, 5);
    r("#bfe0ea", -2, -13, 5, 4);
    r("#7a9aaa", -3, -15, 6, 2); r("#7a9aaa", -3, -13, 1, 2);
    b.globalAlpha = alpha * (0.4 + 0.3 * Math.sin(t * 2));
    r("#e8ffff", -5, -16, 10, 17);
    b.globalAlpha = alpha; r("#ffffff", 2 + Math.round(Math.sin(t) * 2), -12, 1, 1);
  } else if (kind === "cairn" || kind === "cairnClip") {
    b.globalAlpha = alpha;
    r("#8a8298", -5, -3, 10, 3); r("#a39cb2", -4, -6, 8, 3); r("#bdb6ca", -3, -9, 6, 3); r("#d4cee0", -2, -11, 4, 2);
    if (kind === "cairnClip") {
      r("#d8323f", -1, -13, 3, 2); r("#e8e8f0", 1, -13, 1, 1);
      b.globalAlpha = alpha * (0.25 + 0.2 * Math.sin(t * 3)); r("#ffd0a0", -4, -16, 8, 6);
    }
  } else if (kind === "journal") {
    b.globalAlpha = alpha * (0.3 + 0.2 * Math.sin(t * 4)); r("#ffe7a0", -5, -8, 10, 8);
    b.globalAlpha = alpha;
    r("#6a3a22", -3, -4, 6, 4); r("#e8dcc0", -2, -4, 4, 1); r("#c9a25a", -3, -3, 1, 3);
  } else if (kind === "mirror") {
    // A tall mirror in a pale stone frame, its surface slowly shimmering.
    b.globalAlpha = alpha;
    r("#8fb0b8", -7, -30, 14, 30); r("#cfe8f0", -6, -29, 12, 28);
    for (let i = 0; i < 28; i += 3) { b.globalAlpha = alpha * (0.3 + 0.3 * Math.sin(t * 2 + i)); r("#ffffff", -5 + (i % 7), -28 + i, 3, 1); }
    b.globalAlpha = alpha; r("#5a7a82", -8, -1, 16, 1);
  } else if (kind === "lumen") {
    const bob = Math.round(Math.sin(t * 2.2) * 2), flap = Math.sin(t * 9) > 0 ? 1 : 0;
    b.globalAlpha = alpha * 0.25; r("#fff1c8", -9, -20 + bob, 18, 16);   // glow
    b.globalAlpha = alpha * 0.55;
    r("#e6dcff", -9, -17 + bob - flap, 6, 8); r("#e6dcff", 3, -17 + bob - flap, 6, 8);   // wings
    r("#fff1c8", -7, -15 + bob - flap, 2, 3); r("#fff1c8", 5, -15 + bob - flap, 2, 3);
    b.globalAlpha = alpha;
    r("#efe8ff", -3, -15 + bob, 6, 7); r("#ffffff", -2, -16 + bob, 4, 1);  // body
    r("#1a1430", -2, -13 + bob, 1, 2); r("#1a1430", 1, -13 + bob, 1, 2);   // eyes
    r("#d9c9ff", -2, -19 + bob, 1, 3); r("#d9c9ff", 1, -19 + bob, 1, 3);   // antennae
  }
  b.globalAlpha = 1;
}

function drawWings(b, x, y, t, speed) {
  x = Math.round(x); y = Math.round(y);
  const up = Math.sin(t * 14 * speed) > 0;
  b.fillStyle = "#ffffff";
  if (up) { b.fillRect(x - 6, y - 4, 3, 1); b.fillRect(x - 5, y - 3, 3, 1); b.fillRect(x + 4, y - 4, 3, 1); b.fillRect(x + 3, y - 3, 3, 1); }
  else { b.fillRect(x - 6, y, 3, 1); b.fillRect(x - 5, y - 1, 3, 1); b.fillRect(x + 4, y, 3, 1); b.fillRect(x + 3, y - 1, 3, 1); }
}

function diamond(b, x, y, r) {
  for (let i = -r; i <= r; i++) {
    const w = r - Math.abs(i);
    b.fillRect(x - w, y + i, w * 2 + 1, 1);
  }
}

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}
function clampN(v, a, b) { return b < a ? (a + b) / 2 : v < a ? a : v > b ? b : v; }
function lerpN(a, b, t) { return a + (b - a) * t; }
function mix(c1, c2, t) {
  const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return `rgb(${r},${g},${bl})`;
}
function formatTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(2)}`;
}
