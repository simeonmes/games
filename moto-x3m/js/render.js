"use strict";
// Rendering: parallax sky and hills in screen space, then the level, obstacles, bike, rider
// and particles in world space, then the HUD (clock, star targets, flip call-outs, touch
// buttons). Everything is drawn with canvas paths; there are no image files.

const THEMES = [
  { // Canyon, midday
    sky: ["#4fa9e8", "#a9dcfb", "#ffe7bd"], sun: "#fff4c9", sunY: 0.2,
    layers: ["#e8b27a", "#cf8649", "#a95e2f"], ground: "#7a4524", ground2: "#653619",
    edge: "#2f1709", edgeHi: "#e7a563", dust: "#d9a878", signal: "#ffd23f",
  },
  { // Harbour at sunset
    sky: ["#2a1a4f", "#b3426b", "#ffa45c"], sun: "#ffd58c", sunY: 0.55,
    layers: ["#7b3563", "#56234f", "#3a1739"], ground: "#43263a", ground2: "#361c2e",
    edge: "#12060f", edgeHi: "#ff9e5a", dust: "#a8708a", signal: "#ffb347",
  },
  { // Factory at night
    sky: ["#050817", "#10193f", "#2a2f6b"], sun: "#e9f0ff", sunY: 0.16, stars: true,
    layers: ["#1e2455", "#171c44", "#10143a"], ground: "#2d313e", ground2: "#252834",
    edge: "#07080c", edgeHi: "#ffcf3f", dust: "#7c8196", signal: "#ffcf3f",
  },
];

const Render = (() => {
  let canvas, ctx, dpr = 1, cw = 1, ch = 1;
  const cam = { x: 0, y: 0, scale: 1, init: false, shake: 0 };
  const parts = [];
  const pops = [];
  const patterns = [];
  let skyStars = null;

  function init(c) {
    canvas = c;
    ctx = c.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", () => setTimeout(resize, 200));
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = Math.max(1, window.innerWidth);
    ch = Math.max(1, window.innerHeight);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
    Input.layout(cw, ch);
  }

  // Dirt texture for the ground: strata lines and pebbles, tiled in world space.
  function groundPattern(ti) {
    if (patterns[ti]) return patterns[ti];
    const T = THEMES[ti];
    const c = document.createElement("canvas");
    c.width = 160; c.height = 160;
    const g = c.getContext("2d");
    g.fillStyle = T.ground;
    g.fillRect(0, 0, 160, 160);
    let seed = 7 + ti * 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.strokeStyle = T.ground2;
    g.lineWidth = 6;
    for (let y = 20; y < 160; y += 40) {
      g.beginPath();
      for (let x = 0; x <= 160; x += 10) g.lineTo(x, y + Math.sin((x / 160) * Math.PI * 2 + y) * 4);
      g.stroke();
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = rnd() < 0.5 ? T.ground2 : "rgba(255,255,255,0.05)";
      g.beginPath();
      g.arc(rnd() * 160, rnd() * 160, 1.5 + rnd() * 3.5, 0, Math.PI * 2);
      g.fill();
    }
    patterns[ti] = ctx.createPattern(c, "repeat");
    return patterns[ti];
  }

  // ------------------------------------------------------------------ camera

  function updateCamera(world, bx, by, dt, snap) {
    const b = world.bike;
    const base = Math.max(0.5, Math.min(1.45, ch / 640));
    const spd = Math.min(1, b.speed / 1100);
    const targetScale = base * (1 - 0.14 * spd);
    const lookX = Math.max(-120, Math.min(300, b.vx * 0.32));
    const lookY = Math.max(-80, Math.min(140, b.vy * 0.12));
    const tx = bx + lookX, ty = by - 70 + lookY;
    if (snap || !cam.init) {
      cam.x = tx; cam.y = ty; cam.scale = targetScale; cam.init = true;
    } else {
      const k = 1 - Math.exp(-dt * 6);
      cam.x += (tx - cam.x) * k;
      cam.y += (ty - cam.y) * Math.min(1, k * 1.2);
      cam.scale += (targetScale - cam.scale) * (1 - Math.exp(-dt * 2));
    }
    cam.shake = Math.max(0, cam.shake - dt * 30);
  }

  function snapCamera() { cam.init = false; }

  // ------------------------------------------------------------------ background

  function drawSky(T, ti) {
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, T.sky[0]);
    g.addColorStop(0.55, T.sky[1]);
    g.addColorStop(1, T.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);

    if (T.stars) {
      if (!skyStars) {
        skyStars = [];
        for (let i = 0; i < 90; i++) skyStars.push([Math.random(), Math.random() * 0.6, Math.random() * 1.4 + 0.4]);
      }
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      for (const [x, y, r] of skyStars) {
        ctx.beginPath();
        ctx.arc(((x * cw * 1.3 - cam.x * 0.02) % (cw * 1.3) + cw * 1.3) % (cw * 1.3) - cw * 0.15, y * ch, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Sun or moon
    const sx = cw * 0.78 - ((cam.x * 0.01) % 50), sy = ch * T.sunY;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, ch * 0.3);
    glow.addColorStop(0, T.sun);
    glow.addColorStop(0.15, T.sun);
    glow.addColorStop(0.16, "rgba(255,255,255,0.18)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(sx - ch * 0.3, sy - ch * 0.3, ch * 0.6, ch * 0.6);

    // Three parallax ridges.
    const par = [0.08, 0.18, 0.32];
    const hs = [0.52, 0.62, 0.74];
    for (let i = 0; i < 3; i++) {
      const off = cam.x * par[i] * cam.scale;
      const yOff = (cam.y * par[i] * 0.5) * cam.scale;
      ctx.fillStyle = T.layers[i];
      ctx.beginPath();
      ctx.moveTo(0, ch);
      for (let x = 0; x <= cw + 20; x += 16) {
        const wx = (x + off) / (140 + i * 60);
        let y = Math.sin(wx) * 0.5 + Math.sin(wx * 2.3 + i) * 0.3 + Math.sin(wx * 0.37 + i * 2) * 0.6;
        if (ti === 0 && i < 2) y = Math.min(y, 0.35) + (y > 0.35 ? 0 : 0); // flat-topped mesas
        if (ti === 2 && i === 0) y = Math.round(y * 3) / 3;               // blocky skyline
        ctx.lineTo(x, ch * hs[i] - y * ch * 0.09 - yOff * 0.2);
      }
      ctx.lineTo(cw, ch);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ------------------------------------------------------------------ world

  function view() {
    const s = cam.scale;
    return [cam.x - cw / 2 / s - 80, cam.y - ch / 2 / s - 80, cam.x + cw / 2 / s + 80, cam.y + ch / 2 / s + 80];
  }

  function drawGround(world, T, ti, V) {
    const L = world.L;
    for (const p of L.polys) {
      if (!p.box) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const [x, y] of p.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        p.box = [x0, y0, x1, y1];
      }
      const b = p.box;
      if (b[2] < V[0] || b[0] > V[2] || b[3] < V[1] || b[1] > V[3]) continue;
      if (p.kind === "ground") drawGroundPoly(p, T, ti, V);
      else drawBlock(p.pts, p.kind, T);
    }
  }

  function drawGroundPoly(p, T, ti, V) {
    ctx.fillStyle = groundPattern(ti);
    ctx.beginPath();
    const pts = p.pts;
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], Math.min(pts[i][1], V[3] + 200));
    ctx.closePath();
    ctx.fill();
    // Top edge: a dark rim with a lit lip.
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < p.top.length; i++) {
      const [x, y] = p.top[i];
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = T.edge;
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.strokeStyle = T.edgeHi;
    ctx.lineWidth = 4;
    ctx.stroke();
    // Cliff faces at the ends of each piece.
    const a = p.top[0], z = p.top[p.top.length - 1];
    ctx.strokeStyle = T.edge;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0], a[1] + 900);
    ctx.moveTo(z[0], z[1]); ctx.lineTo(z[0], z[1] + 900);
    ctx.stroke();
  }

  function polyPath(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function drawBlock(pts, kind, T, extra) {
    ctx.lineJoin = "round";
    polyPath(pts);
    if (kind === "crate") {
      ctx.fillStyle = "#b67b3d"; ctx.fill();
      ctx.strokeStyle = "#5b3814"; ctx.lineWidth = 5; ctx.stroke();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = "rgba(91,56,20,0.7)"; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[2][0], pts[2][1]);
      ctx.moveTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[3][0], pts[3][1]);
      ctx.stroke();
      ctx.restore();
    } else if (kind === "crumble") {
      ctx.fillStyle = "#9a6a3a"; ctx.fill();
      ctx.strokeStyle = "#4e2f12"; ctx.lineWidth = 4; ctx.stroke();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = "rgba(40,20,5,0.8)"; ctx.lineWidth = 2;
      const [x0, y0] = pts[0], [x1] = pts[1];
      ctx.beginPath();
      for (let x = x0 + 20; x < x1; x += 46) { ctx.moveTo(x, y0); ctx.lineTo(x + 8, y0 + 8); ctx.lineTo(x + 2, y0 + 20); }
      ctx.stroke();
      ctx.restore();
    } else if (kind === "mover") {
      ctx.fillStyle = "#59636f"; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = T.signal;
      const [x0, y0] = pts[0];
      const w = Math.hypot(pts[1][0] - x0, pts[1][1] - y0);
      for (let x = -10; x < w + 20; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x0 + x, y0); ctx.lineTo(x0 + x + 14, y0); ctx.lineTo(x0 + x + 4, y0 + 18); ctx.lineTo(x0 + x - 10, y0 + 18);
        ctx.fill();
      }
      ctx.restore();
      polyPath(pts);
      ctx.strokeStyle = "#1c2027"; ctx.lineWidth = 4; ctx.stroke();
    } else { // steel
      ctx.fillStyle = "#6f7b8a"; ctx.fill();
      ctx.strokeStyle = "#252b33"; ctx.lineWidth = 5; ctx.stroke();
      ctx.fillStyle = "#c6ced8";
      for (const [x, y] of pts) {
        ctx.beginPath(); ctx.arc(x + (x < pts[1][0] ? 7 : -7), y + 7, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawLoops(world, T, V) {
    for (const lp of world.loops) {
      if (lp.cx + lp.r < V[0] || lp.cx - lp.r > V[2]) continue;
      ctx.strokeStyle = T.edge;
      ctx.lineWidth = 26;
      ctx.beginPath(); ctx.arc(lp.cx, lp.cy, lp.r + 12, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "#8d98a8";
      ctx.lineWidth = 16;
      ctx.beginPath(); ctx.arc(lp.cx, lp.cy, lp.r + 9, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = T.signal;
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 14]);
      ctx.beginPath(); ctx.arc(lp.cx, lp.cy, lp.r + 9, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(lp.cx, lp.cy, lp.r + 2, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawObjects(world, T, V, time) {
    for (const o of world.objs) {
      if (o.x < V[0] - 400 || o.x > V[2] + 400) continue;
      switch (o.type) {
        case "mover": case "crumble":
          if (!o.world) break;
          if (o.type === "mover") {
            ctx.strokeStyle = "rgba(0,0,0,0.25)";
            ctx.lineWidth = 4;
            ctx.setLineDash([10, 10]);
            ctx.beginPath();
            ctx.moveTo(o.bx + o.w / 2, o.by + 9);
            ctx.lineTo(o.bx + o.w / 2 + (o.ex || 0), o.by + 9 + (o.ey || 0));
            ctx.stroke();
            ctx.setLineDash([]);
          }
          if (o.type === "crumble" && o.state === "shake") {
            ctx.save();
            ctx.translate((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2);
            drawBlock(o.world, "crumble", T);
            ctx.restore();
          } else {
            drawBlock(o.world, o.type === "crumble" ? "crumble" : "mover", T);
          }
          break;
        case "saw": drawSaw(o); break;
        case "tnt": if (o.alive) drawTNT(o, time); break;
        case "spikes": drawSpikes(o); break;
      }
    }
  }

  function drawSaw(o) {
    if (o.period && (o.ex || o.ey)) {
      ctx.strokeStyle = "rgba(20,20,30,0.5)";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(o.bx, o.by); ctx.lineTo(o.bx + (o.ex || 0), o.by + (o.ey || 0)); ctx.stroke();
    }
    if (o.orbit) {
      ctx.strokeStyle = "rgba(20,20,30,0.45)";
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(o.bx, o.by); ctx.lineTo(o.x, o.y); ctx.stroke();
      ctx.fillStyle = "#2a2f38";
      ctx.beginPath(); ctx.arc(o.bx, o.by, 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot);
    const n = Math.max(14, Math.round(o.r / 3));
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const r = i % 2 ? o.r - 7 : o.r;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = "#d3d9e0";
    ctx.fill();
    ctx.strokeStyle = "#59616c";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = "#9aa4b0";
    ctx.beginPath(); ctx.arc(0, 0, o.r * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, o.r * 0.45, -0.5, 1.2); ctx.stroke();
    ctx.fillStyle = "#2a2f38";
    ctx.beginPath(); ctx.arc(0, 0, o.r * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawTNT(o, time) {
    const x = o.x - o.w / 2, y = o.y - o.h;
    ctx.fillStyle = "#c62828";
    ctx.fillRect(x, y, o.w, o.h);
    ctx.fillStyle = "#8e1414";
    ctx.fillRect(x, y + 5, o.w, 5);
    ctx.fillRect(x, y + o.h - 10, o.w, 5);
    ctx.strokeStyle = "#3b0606";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, o.w, o.h);
    ctx.fillStyle = "#fff";
    ctx.font = "900 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("TNT", o.x, y + o.h / 2 + 1);
    // Fuse with a flickering spark.
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(o.x, y); ctx.quadraticCurveTo(o.x + 6, y - 8, o.x + 2, y - 12); ctx.stroke();
    ctx.fillStyle = Math.sin(time * 40) > 0 ? "#ffd23f" : "#ff7b1f";
    ctx.beginPath(); ctx.arc(o.x + 2, y - 13, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawSpikes(o) {
    ctx.fillStyle = "#b9c1cc";
    ctx.strokeStyle = "#3e4550";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const n = Math.max(1, Math.round(o.w / 16));
    const step = o.w / n;
    for (let i = 0; i < n; i++) {
      const x = o.x + i * step;
      ctx.moveTo(x, o.y + 2);
      ctx.lineTo(x + step / 2, o.y - o.h);
      ctx.lineTo(x + step, o.y + 2);
    }
    ctx.fill();
    ctx.stroke();
  }

  function drawSigns(world, T, V) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const s of world.L.signs) {
      if (s.x < V[0] - 200 || s.x > V[2] + 200) continue;
      ctx.fillStyle = "#5b3814";
      ctx.fillRect(s.x - 3, s.y - 70, 6, 70);
      ctx.font = "900 15px system-ui, sans-serif";
      const w = Math.max(80, ctx.measureText(s.text).width + 24);
      ctx.fillStyle = "#e9c48c";
      ctx.strokeStyle = "#5b3814";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.rect(s.x - w / 2, s.y - 104, w, 36);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#3a2008";
      ctx.fillText(s.text, s.x, s.y - 85);
    }
  }

  function drawFlags(world, T, V, time) {
    world.L.checkpoints.forEach((c, i) => {
      if (c.x < V[0] - 100 || c.x > V[2] + 100) return;
      const on = i <= world.cp;
      ctx.fillStyle = "#2b2f38";
      ctx.fillRect(c.x - 3, c.y - 96, 6, 96);
      ctx.fillStyle = on ? "#3ddc5a" : "#e9edf3";
      ctx.beginPath();
      ctx.moveTo(c.x + 3, c.y - 96);
      const wv = on ? Math.sin(time * 8) * 4 : 0;
      ctx.quadraticCurveTo(c.x + 26, c.y - 92 + wv, c.x + 46, c.y - 84);
      ctx.quadraticCurveTo(c.x + 26, c.y - 76 - wv, c.x + 3, c.y - 70);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    const f = world.L.finish;
    if (f.x > V[0] - 200 && f.x < V[2] + 200) {
      const sq = 12;
      for (let row = 0; row < 14; row++) {
        for (let col = 0; col < 2; col++) {
          ctx.fillStyle = (row + col) % 2 ? "#111" : "#fff";
          ctx.fillRect(f.x - sq + col * sq, f.y - 168 + row * sq, sq, sq);
        }
      }
      ctx.fillStyle = "#2b2f38";
      ctx.fillRect(f.x - 16, f.y - 200, 5, 200);
      ctx.fillRect(f.x + 11, f.y - 200, 5, 200);
      ctx.fillStyle = "#e8412c";
      ctx.fillRect(f.x - 70, f.y - 222, 140, 30);
      ctx.fillStyle = "#fff";
      ctx.font = "italic 900 20px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("FINISH", f.x, f.y - 206);
    }
  }

  // ------------------------------------------------------------------ bike and rider

  function drawWheel(x, y, rot) {
    ctx.fillStyle = "#16171b";
    ctx.beginPath(); ctx.arc(x, y, WHEEL_R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#24262c";
    for (let i = 0; i < 12; i++) {
      const a = rot + (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * (WHEEL_R - 0.5), y + Math.sin(a) * (WHEEL_R - 0.5), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#c9ced6";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, WHEEL_R - 5, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = rot + (i / 6) * Math.PI * 2;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * (WHEEL_R - 5), y + Math.sin(a) * (WHEEL_R - 5));
    }
    ctx.stroke();
    ctx.fillStyle = "#7d8591";
    ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
  }

  function limb(pts, width, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }

  function helmet(x, y, ang, S) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = S.helmet;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = S.body;
    ctx.fillRect(-10, -3, 20, 4);
    ctx.fillStyle = S.visor;
    ctx.beginPath();
    ctx.moveTo(2, -4); ctx.lineTo(11, -2); ctx.lineTo(10, 5); ctx.lineTo(3, 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = S.helmet;
    ctx.beginPath(); ctx.moveTo(4, -9); ctx.lineTo(15, -7); ctx.lineTo(9, -4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawBike(b, x, y, a, S, crashed) {
    const c = Math.cos(a), s = Math.sin(a);
    const W = (lx, ly) => [x + c * lx - s * ly, y + s * lx + c * ly];
    const [rw, fw] = b.wheels;
    const rwp = W(rw.lx, rw.ly), fwp = W(fw.lx, fw.ly);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    // Swingarm and fork.
    limb([[-4, -4], [rw.lx, rw.ly]], 6, "#30343c");
    limb([[26, -26], [fw.lx, fw.ly]], 5, "#c9ced6");
    limb([[24, -24], [fw.lx - 2, fw.ly - 6]], 3, "#8b929c");
    // Engine and exhaust.
    ctx.fillStyle = "#2f333b";
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-10, -14, 22, 16, 4) : ctx.rect(-10, -14, 22, 16); ctx.fill();
    limb([[8, -4], [-6, 0], [-28, -12], [-40, -14]], 4, "#b9bfc8");
    // Bodywork.
    ctx.fillStyle = S.body;
    ctx.beginPath();
    ctx.moveTo(-50, -18); ctx.lineTo(-24, -22); ctx.lineTo(-16, -15); ctx.lineTo(-36, -12);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-6, -25); ctx.lineTo(18, -30); ctx.lineTo(27, -22); ctx.lineTo(12, -13); ctx.lineTo(-6, -15);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = S.trim;
    ctx.beginPath();
    ctx.moveTo(0, -22); ctx.lineTo(16, -26); ctx.lineTo(20, -22); ctx.lineTo(6, -18);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#1b1d22";
    ctx.beginPath();
    ctx.moveTo(-30, -24); ctx.lineTo(-4, -27); ctx.lineTo(-2, -23); ctx.lineTo(-28, -20);
    ctx.closePath(); ctx.fill();
    // Front fender and number plate.
    ctx.fillStyle = S.body;
    ctx.beginPath();
    ctx.moveTo(28, -10); ctx.quadraticCurveTo(40, -16, 54, -8); ctx.lineTo(50, -6); ctx.quadraticCurveTo(40, -11, 30, -6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = S.trim;
    ctx.beginPath();
    ctx.moveTo(24, -34); ctx.lineTo(33, -28); ctx.lineTo(30, -18); ctx.lineTo(24, -24);
    ctx.closePath(); ctx.fill();
    // Handlebar.
    limb([[22, -30], [20, -38], [14, -38]], 3, "#1b1d22");
    ctx.restore();

    drawWheel(rwp[0], rwp[1], rw.rot);
    drawWheel(fwp[0], fwp[1], fw.rot);

    if (crashed) return;
    // Rider: leans with the bike input.
    const L = b.lean;
    const P = {};
    for (const k in RIDER) P[k] = RIDER[k].slice();
    P.chest[0] += L * 7; P.chest[1] += Math.abs(L) * 2;
    P.head[0] += L * 10; P.head[1] += Math.abs(L) * 3 + (L < 0 ? 2 : 0);
    P.hip[0] += L * 3;
    const w = {};
    for (const k in P) w[k] = W(P[k][0], P[k][1]);
    const elbow = W((P.chest[0] + P.hand[0]) / 2 + 2, (P.chest[1] + P.hand[1]) / 2 + 7);
    limb([w.hip, w.knee, w.foot], 8, "#23262e");
    limb([w.foot, W(P.foot[0] + 7, P.foot[1] + 1)], 6, "#111");
    limb([w.hip, w.chest], 13, S.body);
    limb([w.hip, w.chest], 4, S.trim);
    limb([w.chest, elbow, w.hand], 6, S.body);
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.arc(w.hand[0], w.hand[1], 3.5, 0, Math.PI * 2); ctx.fill();
    helmet(w.head[0], w.head[1], a + L * 0.2, S);
  }

  function drawRagdoll(r, S) {
    const P = {};
    for (const q of r.p) P[q.n] = [q.x, q.y];
    limb([P.hip, P.knee, P.foot], 8, "#23262e");
    limb([P.hip, P.chest], 13, S.body);
    limb([P.chest, P.hand], 6, S.body);
    const ang = Math.atan2(P.head[1] - P.chest[1], P.head[0] - P.chest[0]) + Math.PI / 2;
    helmet(P.head[0], P.head[1], ang, S);
  }

  // ------------------------------------------------------------------ particles and effects

  function spawn(x, y, vx, vy, life, size, color, kind = "dot", grav = 600) {
    if (parts.length > 500) return;
    parts.push({ x, y, vx, vy, life, max: life, size, color, kind, grav, rot: Math.random() * 6 });
  }

  function effect(e, world) {
    const T = THEMES[world.L.theme] || THEMES[0];
    switch (e.type) {
      case "crash":
        cam.shake = 10;
        for (let i = 0; i < 18; i++) spawn(e.x, e.y, (Math.random() - 0.5) * 500, -Math.random() * 400, 0.7, 3 + Math.random() * 3, i % 2 ? "#ffd23f" : "#fff", "spark");
        break;
      case "boom":
        cam.shake = 22;
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * Math.PI * 2, v = 150 + Math.random() * 450;
          spawn(e.x, e.y, Math.cos(a) * v, Math.sin(a) * v - 120, 0.6 + Math.random() * 0.4, 8 + Math.random() * 14, ["#fff3b0", "#ffb12b", "#ff5a1f", "#c62828"][i % 4], "fire", -80);
        }
        for (let i = 0; i < 14; i++) spawn(e.x, e.y, (Math.random() - 0.5) * 240, -Math.random() * 200, 1.4, 16 + Math.random() * 16, "rgba(60,60,70,0.6)", "smoke", -60);
        for (let i = 0; i < 12; i++) spawn(e.x, e.y, (Math.random() - 0.5) * 700, -200 - Math.random() * 500, 1.3, 5, "#8e1414", "chunk", 1200);
        break;
      case "land":
        if (e.power > 0.15) {
          const b = world.bike;
          for (let i = 0; i < 8 + e.power * 10; i++) spawn(b.x + (Math.random() - 0.5) * 70, b.y + 24, (Math.random() - 0.5) * 300, -Math.random() * 160, 0.6, 5 + Math.random() * 6, T.dust, "smoke", 200);
        }
        break;
      case "flip": {
        const txt = (e.n > 1 ? (e.n === 2 ? "DOUBLE " : e.n === 3 ? "TRIPLE " : e.n + "× ") : "") + (e.dir === "back" ? "BACKFLIP" : "FRONTFLIP");
        pops.push({ text: txt, sub: "−" + (e.n * FLIP_BONUS).toFixed(1) + "s", t: 0 });
        break;
      }
      case "checkpoint":
        pops.push({ text: "CHECKPOINT", sub: "", t: 0, color: "#3ddc5a" });
        for (let i = 0; i < 16; i++) spawn(e.x + 20, e.y - 80, (Math.random() - 0.5) * 300, -Math.random() * 300, 0.8, 4, "#3ddc5a", "spark");
        break;
      case "finish":
        for (let i = 0; i < 90; i++) {
          spawn(e.x + (Math.random() - 0.5) * 200, e.y - 220 - Math.random() * 80, (Math.random() - 0.5) * 500, -Math.random() * 400,
            2 + Math.random(), 6, ["#e8412c", "#ffd23f", "#3ddc5a", "#4f9bff", "#fff"][i % 5], "confetti", 500);
        }
        break;
    }
  }

  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      if (p.kind === "confetti") { p.vx *= 1 - 1.5 * dt; p.vy = Math.min(p.vy, 140); }
      if (p.kind === "smoke") { p.vx *= 1 - 2 * dt; p.vy *= 1 - 2 * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += dt * 8;
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      pops[i].t += dt;
      if (pops[i].t > 1.4) pops.splice(i, 1);
    }
  }

  function drawParts() {
    for (const p of parts) {
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.fillStyle = p.color;
      if (p.kind === "confetti" || p.kind === "chunk") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else {
        const r = p.kind === "smoke" || p.kind === "fire" ? p.size * (1.4 - k * 0.6) : p.size * k;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Dust kicked up by the back wheel while riding hard.
  function trail(world, dt) {
    const b = world.bike;
    if (b.crashed || !b.wheels[0].contact || !b.gas || Math.random() > dt * 30) return;
    const T = THEMES[world.L.theme] || THEMES[0];
    const w = b.wheels[0];
    spawn(w.x - 8, w.y + 12, -80 - Math.random() * 120 + b.vx * 0.2, -40 - Math.random() * 90, 0.45, 3 + Math.random() * 4, T.dust, "smoke", 150);
  }

  // ------------------------------------------------------------------ HUD

  function fmt(t) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s < 10 ? "0" : ""}${s.toFixed(2)}`;
  }

  function hudText(text, x, y, size, color, align = "left", italic = true) {
    ctx.font = `${italic ? "italic " : ""}900 ${size}px system-ui, "Segoe UI", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.lineWidth = Math.max(3, size * 0.18);
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawStar(x, y, r, fill) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawHUD(world, info) {
    const L = world.L;
    const small = Math.min(cw, ch) < 500;
    const pad = small ? 12 : 20;
    hudText(`LEVEL ${info.levelIndex + 1}`, pad, pad + 14, small ? 13 : 15, "#ffd23f");
    hudText(L.name.toUpperCase(), pad + (small ? 70 : 80), pad + 14, small ? 13 : 15, "#fff", "left");
    const score = world.score;
    hudText(fmt(score), pad, pad + (small ? 46 : 56), small ? 30 : 40, "#fff");
    // Star targets: lit while you can still make them.
    const [t3, t2] = L.stars;
    const y = pad + (small ? 70 : 84);
    const items = [[3, t3], [2, t2]];
    let x = pad;
    for (const [n, t] of items) {
      const ok = score <= t;
      for (let i = 0; i < n; i++) drawStar(x + 8 + i * 15, y - 5, 7, ok ? "#ffd23f" : "#5b5f6b");
      hudText(t.toFixed(0) + "s", x + 8 + n * 15, y + 1, 13, ok ? "#fff" : "#8a8f9c", "left", false);
      x += n * 15 + 44;
    }
    if (world.flips) hudText(`FLIPS ${world.flips}`, pad, y + 24, 13, "#8fe3ff", "left", false);

    // Checkpoint progress bar along the top.
    const f = L.finish.x, s0 = L.start.x;
    const prog = Math.max(0, Math.min(1, (world.bike.x - s0) / (f - s0)));
    const bw = Math.min(360, cw * 0.36), bx = cw / 2 - bw / 2, by = pad + 4;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(bx - 2, by - 2, bw + 4, 10);
    ctx.fillStyle = "#e8412c";
    ctx.fillRect(bx, by, bw * prog, 6);
    for (const c of L.checkpoints) {
      const p = (c.x - s0) / (f - s0);
      ctx.fillStyle = world.bike.x >= c.x ? "#3ddc5a" : "#fff";
      ctx.fillRect(bx + bw * p - 1.5, by - 4, 3, 14);
    }

    // Call-outs for flips and checkpoints.
    for (const p of pops) {
      const k = p.t / 1.4;
      ctx.globalAlpha = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
      const sc = p.t < 0.12 ? 0.6 + (p.t / 0.12) * 0.4 : 1;
      const yy = ch * 0.3 - p.t * 30;
      ctx.save();
      ctx.translate(cw / 2, yy);
      ctx.scale(sc, sc);
      hudText(p.text, 0, 0, small ? 28 : 40, p.color || "#ffd23f", "center");
      if (p.sub) hudText(p.sub, 0, small ? 26 : 34, small ? 18 : 24, "#8fe3ff", "center");
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    if (!world.started) {
      const blink = 0.6 + 0.4 * Math.sin(performance.now() / 200);
      ctx.globalAlpha = blink;
      hudText(Input.touch.enabled ? "HOLD ▲ TO RIDE" : "HOLD ↑ OR W TO RIDE", cw / 2, ch * 0.34, small ? 22 : 30, "#fff", "center");
      ctx.globalAlpha = 1;
    }

    // Pause button (touch) and key hint.
    if (Input.touch.enabled) {
      const pb = Input.touch.pause;
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath(); ctx.arc(pb.x, pb.y, pb.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(pb.x - 7, pb.y - 9, 5, 18);
      ctx.fillRect(pb.x + 2, pb.y - 9, 5, 18);
      for (const b of Input.touch.buttons) {
        const on = Input.touch.held[b.key];
        ctx.fillStyle = on ? "rgba(255,210,63,0.55)" : "rgba(0,0,0,0.32)";
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = `900 ${Math.round(b.r * 0.8)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(b.label, b.x, b.y + 2);
      }
    } else {
      hudText("Esc pause · R restart", cw - pad, pad + 14, 12, "rgba(255,255,255,0.75)", "right", false);
    }
  }

  // ------------------------------------------------------------------ frame

  function frame(world, pose, dt, info) {
    const ti = world.L.theme || 0;
    const T = THEMES[ti];
    updateCamera(world, pose.x, pose.y, dt, info.snap);
    updateParts(dt);
    if (dt > 0) trail(world, dt);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSky(T, ti);

    const s = cam.scale;
    const shx = cam.shake ? (Math.random() - 0.5) * cam.shake : 0;
    const shy = cam.shake ? (Math.random() - 0.5) * cam.shake : 0;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (cw / 2 - cam.x * s + shx), dpr * (ch / 2 - cam.y * s + shy));
    const V = view();
    drawLoops(world, T, V);
    drawSigns(world, T, V);
    drawGround(world, T, ti, V);
    drawFlags(world, T, V, world.time);
    drawObjects(world, T, V, world.time);
    const S = world.stats;
    drawBike(world.bike, pose.x, pose.y, pose.a, S, world.bike.crashed);
    if (world.ragdoll) drawRagdoll(world.ragdoll, S);
    drawParts();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (info.hud) drawHUD(world, info);
  }

  function clearEffects() { parts.length = 0; pops.length = 0; }

  // A still picture of a bike for the bike picker.
  function preview(cnv, S) {
    const saved = ctx;
    const r = Math.min(window.devicePixelRatio || 1, 2);
    const w = cnv.clientWidth || 110, h = cnv.clientHeight || 60;
    cnv.width = w * r; cnv.height = h * r;
    ctx = cnv.getContext("2d");
    ctx.setTransform(r * 0.72, 0, 0, r * 0.72, (w / 2) * r, (h / 2 + 12) * r);
    const fake = { wheels: GEO.wheels.map(([lx, ly]) => ({ lx, ly, rot: 0.4 })), lean: 0 };
    drawBike(fake, 0, 0, 0, S, false);
    ctx = saved;
  }

  return { init, frame, effect, snapCamera, clearEffects, fmt, drawStar, resize, preview };
})();
