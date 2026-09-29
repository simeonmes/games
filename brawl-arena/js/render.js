"use strict";
// Top-down renderer with fake-3D walls, bushes that hide brawlers, goals and the ball,
// and the HUD.

const R = { canvas: null, ctx: null, W: 0, H: 0, dpr: 1, cam: { x: 10.5, y: 16.5, s: 40, init: false }, aim: null };
const TEAM_COLORS = ["#3d8bff", "#ff4b4b"];
const WALL_H = 0.42;

function initRender(canvas) {
  R.canvas = canvas;
  R.ctx = canvas.getContext("2d");
  resizeRender();
  addEventListener("resize", resizeRender);
}

function resizeRender() {
  R.dpr = Math.min(2, devicePixelRatio || 1);
  R.W = innerWidth; R.H = innerHeight;
  R.canvas.width = Math.round(R.W * R.dpr);
  R.canvas.height = Math.round(R.H * R.dpr);
  R.canvas.style.width = R.W + "px";
  R.canvas.style.height = R.H + "px";
}

function updateCamera(dt) {
  const m = G.map, c = R.cam;
  c.s = Math.min(R.W / 22, R.H / 14.5);
  const visW = R.W / c.s, visH = R.H / c.s;
  const p = G.player;
  let fx = (m.mine || m.center).x, fy = (m.mine || m.center).y;
  if (p) { fx = p.x; fy = p.y + (p.team === 0 ? -1.3 : 1.3); }
  const tx = visW >= m.w + 1 ? m.w / 2 : clamp(fx, visW / 2 - 0.5, m.w - visW / 2 + 0.5);
  // Brawl Ball leaves extra room at the ends so the score panel doesn't cover a goal.
  const pad = m.mode === "ball" ? 2 : 1;
  const ty = visH >= m.h + 2 * pad ? m.h / 2 : clamp(fy, visH / 2 - pad, m.h - visH / 2 + pad);
  if (!c.init) { c.x = tx; c.y = ty; c.init = true; }
  const k = 1 - Math.exp(-7 * dt);
  c.x += (tx - c.x) * k;
  c.y += (ty - c.y) * k;
}

const toScreen = (x, y) => ({ x: (x - R.cam.x) * R.cam.s + R.W / 2, y: (y - R.cam.y) * R.cam.s + R.H / 2 });
const toWorld = (sx, sy) => ({ x: (sx - R.W / 2) / R.cam.s + R.cam.x, y: (sy - R.H / 2) / R.cam.s + R.cam.y });

function hash(x, y, k = 0) {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Lighten (f > 0) or darken (f < 0) a #rrggbb colour. Memoised: called every frame.
const _shades = new Map();
function shade(hex, f) {
  const key = hex + f;
  let v = _shades.get(key);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = "rgb(" + [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f)).join(",") + ")";
    _shades.set(key, v);
  }
  return v;
}

// Soft ball shading: bright upper-left, base colour, darker rim.
function ballGrad(ctx, x, y, r, hex) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r * 1.05);
  g.addColorStop(0, shade(hex, 0.38));
  g.addColorStop(0.5, hex);
  g.addColorStop(1, shade(hex, -0.28));
  return g;
}

// ---------------------------------------------------------------------------- frame

// Backdrop and a soft vignette that pulls the eye to the middle; rebuilt on resize.
function screenGrad(ctx) {
  if (R.gradFor !== R.W + "x" + R.H) {
    R.gradFor = R.W + "x" + R.H;
    const bg = ctx.createLinearGradient(0, 0, 0, R.H);
    bg.addColorStop(0, "#23405a"); bg.addColorStop(1, "#142230");
    R.bg = bg;
    const r = Math.hypot(R.W, R.H) / 2;
    const v = ctx.createRadialGradient(R.W / 2, R.H / 2, r * 0.55, R.W / 2, R.H / 2, r * 1.05);
    v.addColorStop(0, "rgba(10,20,35,0)"); v.addColorStop(1, "rgba(10,20,35,0.38)");
    R.vignette = v;
  }
  return R.bg;
}

function drawGame(dt) {
  const ctx = R.ctx, m = G.map, c = R.cam;
  ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  ctx.fillStyle = screenGrad(ctx);
  ctx.fillRect(0, 0, R.W, R.H);
  if (!m) return;
  updateCamera(dt);

  ctx.save();
  ctx.translate(R.W / 2 - c.x * c.s, R.H / 2 - c.y * c.s);
  ctx.scale(c.s, c.s);
  const view = {
    x0: Math.max(0, Math.floor(c.x - R.W / 2 / c.s) - 1), x1: Math.min(m.w - 1, Math.ceil(c.x + R.W / 2 / c.s) + 1),
    y0: Math.max(0, Math.floor(c.y - R.H / 2 / c.s) - 1), y1: Math.min(m.h - 1, Math.ceil(c.y + R.H / 2 / c.s) + 2),
  };

  drawFloor(ctx, m, view);
  drawAim(ctx);
  drawLayer(ctx, m, view);
  drawShots(ctx);
  drawBushes(ctx, m, view);
  // Your team (and revealed enemies) show through the bushes as ghosts.
  for (const b of G.brawlers) {
    if (!b.dead && b.inBush && visibleTo(0, b)) drawBrawler(ctx, b, b.team === 0 ? 0.6 : 0.85);
  }
  drawBombs(ctx);
  drawFx(ctx);
  ctx.restore();

  ctx.fillStyle = R.vignette;
  ctx.fillRect(0, 0, R.W, R.H);

  drawTags(ctx);
  drawTexts(ctx);
  drawBallPointer(ctx);
  drawHUD(ctx);
}

// ---------------------------------------------------------------------------- map

// The ground never changes during a match (broken walls and bushes leave plain floor), so
// it is painted once into an offscreen texture and redrawn when the map or zoom changes.
const Floor = { map: null, px: 0, canvas: null, pad: 1 };

function floorTexture(m) {
  const px = Math.min(72, Math.ceil(R.cam.s * R.dpr));
  if (Floor.map === m && Floor.px === px) return Floor.canvas;
  const pad = Floor.pad, c = Floor.canvas || document.createElement("canvas");
  c.width = (m.w + pad * 2) * px; c.height = (m.h + pad * 2) * px;
  const g = c.getContext("2d");
  g.setTransform(px, 0, 0, px, pad * px, pad * px);
  paintFloor(g, m);
  Object.assign(Floor, { map: m, px, canvas: c });
  return c;
}

function paintFloor(ctx, m) {
  const isWater = (x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y][x] === "~";
  // Earth rim around the arena.
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  roundRect(ctx, -0.3, -0.1, m.w + 0.6, m.h + 0.6, 0.35); ctx.fill();
  ctx.fillStyle = "#6b4a2b";
  roundRect(ctx, -0.3, -0.3, m.w + 0.6, m.h + 0.6, 0.35); ctx.fill();

  // Sand tiles: checkered, each a touch different, with a bevel and some grit.
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const t = m.tiles[y][x];
    if (t === "~" || t === "B") continue;
    const n = Math.round((hash(x, y, 11) - 0.5) * 6) / 100;
    ctx.fillStyle = shade((x + y) & 1 ? "#e3c48c" : "#eed7a6", n);
    ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = "rgba(255,250,230,0.28)";
    ctx.fillRect(x, y, 1, 0.045); ctx.fillRect(x, y, 0.045, 1);
    ctx.fillStyle = "rgba(140,95,40,0.13)";
    ctx.fillRect(x, y + 0.955, 1, 0.045); ctx.fillRect(x + 0.955, y, 0.045, 1);
    ctx.fillStyle = "rgba(150,105,50,0.22)";
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.arc(x + 0.12 + hash(x, y, k + 20) * 0.76, y + 0.12 + hash(x, y, k + 30) * 0.76, 0.018 + hash(x, y, k + 40) * 0.02, 0, TAU);
      ctx.fill();
    }
    const deco = hash(x, y, 50);
    const dx = x + 0.25 + hash(x, y, 51) * 0.5, dy = y + 0.3 + hash(x, y, 52) * 0.45;
    if (t === "G") continue;
    if (deco < 0.07) {
      // Pebble.
      ctx.fillStyle = "rgba(90,60,30,0.25)";
      ctx.beginPath(); ctx.ellipse(dx + 0.02, dy + 0.03, 0.09, 0.055, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#b8a58a";
      ctx.beginPath(); ctx.ellipse(dx, dy, 0.085, 0.06, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#d9cab2";
      ctx.beginPath(); ctx.ellipse(dx - 0.02, dy - 0.02, 0.04, 0.025, 0, 0, TAU); ctx.fill();
    } else if (deco < 0.13) {
      // Grass tuft.
      ctx.strokeStyle = "#8fae4a"; ctx.lineWidth = 0.035; ctx.lineCap = "round";
      ctx.beginPath();
      for (const a of [-0.5, 0, 0.45]) { ctx.moveTo(dx, dy); ctx.lineTo(dx + Math.sin(a) * 0.12, dy - Math.cos(a) * 0.14); }
      ctx.stroke();
    }
  }

  if (m.mode === "ball") drawPitch(ctx, m);

  // Spawn pads.
  for (let t = 0; t < 2; t++) {
    const sp = m.spawns[t], col = t === 0 ? "61,139,255" : "255,75,75";
    const py = clamp(sp[0].y - 1.05, 0.2, m.h - 2.3), w = sp[2].x - sp[0].x + 3;
    ctx.fillStyle = `rgba(${col},0.2)`;
    ctx.strokeStyle = `rgba(${col},0.65)`;
    ctx.lineWidth = 0.08;
    roundRect(ctx, sp[0].x - 1.5, py, w, 2.1, 0.4);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 0.035;
    ctx.setLineDash([0.2, 0.14]);
    roundRect(ctx, sp[0].x - 1.35, py + 0.15, w - 0.3, 1.8, 0.3); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Water: a damp sand rim, then the pool with depth, a shaded top lip and foam edges.
  ctx.fillStyle = "rgba(120,85,40,0.3)";
  ctx.beginPath();
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (isWater(x, y)) ctx.rect(x - 0.1, y - 0.1, 1.2, 1.2);
  ctx.fill();
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (!isWater(x, y)) continue;
    const deep = isWater(x - 1, y) && isWater(x + 1, y) && isWater(x, y - 1) && isWater(x, y + 1);
    const wg = ctx.createLinearGradient(0, y, 0, y + 1);
    wg.addColorStop(0, deep ? "#2d8acb" : "#3a9fdc"); wg.addColorStop(1, deep ? "#2780c2" : "#3396d6");
    ctx.fillStyle = wg;
    ctx.fillRect(x - 0.01, y - 0.01, 1.02, 1.02);
    if (!isWater(x, y - 1)) {
      ctx.fillStyle = "#1f6a9e"; ctx.fillRect(x, y, 1, 0.16);
      ctx.fillStyle = "rgba(20,70,110,0.35)"; ctx.fillRect(x, y + 0.16, 1, 0.1);
    }
    ctx.strokeStyle = "rgba(235,250,255,0.75)"; ctx.lineWidth = 0.05; ctx.lineCap = "round";
    ctx.beginPath();
    if (!isWater(x, y + 1)) { ctx.moveTo(x, y + 0.97); ctx.lineTo(x + 1, y + 0.97); }
    if (!isWater(x - 1, y)) { ctx.moveTo(x + 0.03, y); ctx.lineTo(x + 0.03, y + 1); }
    if (!isWater(x + 1, y)) { ctx.moveTo(x + 0.97, y); ctx.lineTo(x + 0.97, y + 1); }
    ctx.stroke();
  }

  // Arena fence: wooden planks with a lit top edge and bolts.
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (m.tiles[y][x] !== "B") continue;
    ctx.fillStyle = "#5a3b20";
    ctx.fillRect(x - 0.01, y - 0.01, 1.02, 1.02);
    for (let k = 0; k < 2; k++) {
      const py = y + k * 0.5;
      ctx.fillStyle = shade("#7b5431", Math.round((hash(x, y, k) - 0.5) * 10) / 100);
      ctx.fillRect(x, py + 0.04, 1, 0.42);
      ctx.fillStyle = "rgba(255,220,170,0.18)"; ctx.fillRect(x, py + 0.04, 1, 0.06);
      ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(x, py + 0.4, 1, 0.06);
    }
    ctx.fillStyle = "#3a2513";
    ctx.beginPath(); ctx.arc(x + 0.5, y + 0.25, 0.04, 0, TAU); ctx.arc(x + 0.5, y + 0.75, 0.04, 0, TAU); ctx.fill();
  }
}

function drawFloor(ctx, m, v) {
  const pad = Floor.pad;
  ctx.drawImage(floorTexture(m), -pad, -pad, m.w + pad * 2, m.h + pad * 2);

  // Gem mine.
  const mn = m.mine;
  if (mn) {
    ctx.fillStyle = "rgba(60,30,10,0.25)";
    ctx.beginPath(); ctx.arc(mn.x + 0.06, mn.y + 0.1, 0.82, 0, TAU); ctx.fill();
    const rim = ctx.createLinearGradient(mn.x, mn.y - 0.8, mn.x, mn.y + 0.8);
    rim.addColorStop(0, "#7a5a92"); rim.addColorStop(1, "#3b2750");
    ctx.fillStyle = rim;
    ctx.beginPath(); ctx.arc(mn.x, mn.y, 0.78, 0, TAU); ctx.fill();
    const pit = ctx.createRadialGradient(mn.x, mn.y + 0.1, 0.05, mn.x, mn.y, 0.55);
    pit.addColorStop(0, "#6a3aa0"); pit.addColorStop(0.6, "#2a173c"); pit.addColorStop(1, "#150b20");
    ctx.fillStyle = pit;
    ctx.beginPath(); ctx.arc(mn.x, mn.y, 0.54, 0, TAU); ctx.fill();
    const pulse = clamp(1 - G.mineT / GEM_SPAWN_T, 0, 1);
    ctx.strokeStyle = "rgba(90,50,130,0.9)"; ctx.lineWidth = 0.1;
    ctx.beginPath(); ctx.arc(mn.x, mn.y, 0.66, 0, TAU); ctx.stroke();
    ctx.strokeStyle = "#d59cff"; ctx.lineWidth = 0.1;
    ctx.beginPath(); ctx.arc(mn.x, mn.y, 0.66, -Math.PI / 2, -Math.PI / 2 + TAU * pulse); ctx.stroke();
    ctx.globalAlpha = 0.25 + pulse * 0.5;
    ctx.fillStyle = "#c07cff";
    ctx.beginPath(); ctx.arc(mn.x, mn.y, 0.2 + pulse * 0.2, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Ripples and glints on the water.
  ctx.lineCap = "round";
  for (let y = v.y0; y <= v.y1; y++) for (let x = v.x0; x <= v.x1; x++) {
    if (m.tiles[y][x] !== "~") continue;
    const ph = G.time * 1.5 + x * 0.9 + y * 0.6;
    ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 0.045;
    ctx.beginPath();
    ctx.moveTo(x + 0.2, y + 0.5 + Math.sin(ph) * 0.06);
    ctx.quadraticCurveTo(x + 0.5, y + 0.35 + Math.sin(ph + 1) * 0.06, x + 0.8, y + 0.5 + Math.sin(ph + 2) * 0.06);
    ctx.stroke();
    const tw = Math.sin(G.time * 2.3 + hash(x, y, 60) * 40);
    if (tw > 0.75) {
      ctx.fillStyle = `rgba(255,255,255,${(tw - 0.75) * 3})`;
      ctx.beginPath(); ctx.arc(x + 0.2 + hash(x, y, 61) * 0.6, y + 0.3 + hash(x, y, 62) * 0.5, 0.04, 0, TAU); ctx.fill();
    }
  }

  // Soft shadows under walls (one path per layer so overlaps don't stack).
  for (const [off, a] of [[0.08, 0.13], [0.2, 0.09]]) {
    ctx.fillStyle = `rgba(70,40,10,${a})`;
    ctx.beginPath();
    for (let y = v.y0; y <= v.y1; y++) for (let x = v.x0; x <= v.x1; x++) {
      if (BREAKABLE.has(m.tiles[y][x])) ctx.rect(x + off, y + off * 0.6, 1, 1);
    }
    ctx.fill();
  }

  for (let t = 0; t < 2; t++) if (m.goals[t]) drawGoal(ctx, m.goals[t], t);
}

// Pitch markings for Brawl Ball: halfway line, centre circle and the boxes.
function drawPitch(ctx, m) {
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 0.08;
  const c = m.ballSpot;
  ctx.beginPath(); ctx.moveTo(0.2, c.y); ctx.lineTo(m.w - 0.2, c.y); ctx.stroke();
  ctx.beginPath(); ctx.arc(c.x, c.y, 2.2, 0, TAU); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath(); ctx.arc(c.x, c.y, 0.14, 0, TAU); ctx.fill();
  for (const g of m.goals) {
    if (!g) continue;
    const bw = g.x1 - g.x0 + 4, bh = 3;
    const y = g.out > 0 ? g.line : g.line - bh;
    ctx.strokeRect(g.cx - bw / 2, y, bw, bh);
  }
}

// A net in the defending team's colour, with white posts at the goal mouth.
function drawGoal(ctx, g, team) {
  const col = team === 0 ? "61,139,255" : "255,75,75";
  ctx.fillStyle = `rgba(${col},0.35)`;
  ctx.fillRect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0);
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  for (let x = g.x0; x <= g.x1 + 1e-6; x += 0.25) { ctx.moveTo(x, g.y0); ctx.lineTo(x, g.y1); }
  for (let y = g.y0; y <= g.y1 + 1e-6; y += 0.25) { ctx.moveTo(g.x0, y); ctx.lineTo(g.x1, y); }
  ctx.stroke();
  // Goal line and posts.
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.1;
  ctx.beginPath(); ctx.moveTo(g.x0, g.line); ctx.lineTo(g.x1, g.line); ctx.stroke();
  ctx.fillStyle = "#f4f4f4"; ctx.strokeStyle = "#333"; ctx.lineWidth = 0.04;
  for (const x of [g.x0, g.x1]) {
    ctx.beginPath(); ctx.arc(x, g.line, 0.2, 0, TAU); ctx.fill(); ctx.stroke();
  }
}

const WALL_PAL = {
  stone: { top: "#c99f73", hi: "#e3c29b", lo: "#a47a52", face0: "#9a7049", face1: "#6f4c2e", seam: "rgba(60,35,15,0.45)", edge: "#5b3d24" },
  crate: { top: "#dba35f", hi: "#f0c486", lo: "#b37b3b", face0: "#a86f33", face1: "#7a4d1f", seam: "rgba(70,35,5,0.55)", edge: "#6b4118" },
};

function drawWall(ctx, m, x, y) {
  const crate = m.tiles[y][x] === "C", P = crate ? WALL_PAL.crate : WALL_PAL.stone;
  const below = y + 1 < m.h && BREAKABLE.has(m.tiles[y + 1][x]);
  const top = y - WALL_H;
  if (!below) {
    // Front face, darker towards the ground.
    const fy = y + 1 - WALL_H;
    const fg = ctx.createLinearGradient(0, fy, 0, y + 1);
    fg.addColorStop(0, P.face0); fg.addColorStop(1, P.face1);
    ctx.fillStyle = fg;
    ctx.fillRect(x, fy, 1, WALL_H);
    ctx.strokeStyle = P.seam; ctx.lineWidth = 0.03;
    ctx.beginPath();
    if (crate) {
      for (const k of [0.33, 0.66]) { ctx.moveTo(x + k, fy + 0.03); ctx.lineTo(x + k, y + 0.97); }
    } else {
      const j = 0.25 + hash(x, y, 5) * 0.4;
      ctx.moveTo(x, fy + WALL_H * 0.5); ctx.lineTo(x + 1, fy + WALL_H * 0.5);
      ctx.moveTo(x + j, fy); ctx.lineTo(x + j, fy + WALL_H * 0.5);
      ctx.moveTo(x + (j + 0.45) % 1, fy + WALL_H * 0.5); ctx.lineTo(x + (j + 0.45) % 1, y + 1);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(x, y + 1 - 0.06, 1, 0.06);
  }

  // Top face with a bevel: lit top-left, shaded bottom-right.
  ctx.fillStyle = P.top;
  ctx.fillRect(x, top, 1, 1);
  ctx.fillStyle = P.hi;
  ctx.fillRect(x, top, 1, 0.08); ctx.fillRect(x, top, 0.08, 1);
  ctx.fillStyle = P.lo;
  ctx.fillRect(x, top + 0.92, 1, 0.08); ctx.fillRect(x + 0.92, top, 0.08, 1);
  if (crate) {
    // Planks, a frame, a brace and nails.
    ctx.strokeStyle = P.seam; ctx.lineWidth = 0.03;
    ctx.beginPath();
    for (const k of [0.36, 0.64]) { ctx.moveTo(x + 0.12, top + k); ctx.lineTo(x + 0.88, top + k); }
    ctx.stroke();
    ctx.strokeStyle = P.edge; ctx.lineWidth = 0.07;
    ctx.strokeRect(x + 0.12, top + 0.12, 0.76, 0.76);
    ctx.lineWidth = 0.09; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x + 0.16, top + 0.84); ctx.lineTo(x + 0.84, top + 0.16); ctx.stroke();
    ctx.strokeStyle = P.hi; ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.moveTo(x + 0.17, top + 0.8); ctx.lineTo(x + 0.8, top + 0.17); ctx.stroke();
    ctx.fillStyle = "#4a2c10";
    ctx.beginPath();
    for (const [a, b] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) { ctx.moveTo(x + a + 0.03, top + b); ctx.arc(x + a, top + b, 0.03, 0, TAU); }
    ctx.fill();
  } else {
    // A couple of worn stones and a crack.
    const j = hash(x, y) * 0.2;
    ctx.fillStyle = P.hi;
    roundRect(ctx, x + 0.14, top + 0.14 + j * 0.3, 0.4, 0.28, 0.08); ctx.fill();
    roundRect(ctx, x + 0.5 - j * 0.3, top + 0.56, 0.34, 0.25, 0.08); ctx.fill();
    ctx.fillStyle = "rgba(90,55,25,0.25)";
    roundRect(ctx, x + 0.14, top + 0.36 + j * 0.3, 0.4, 0.06, 0.03); ctx.fill();
    roundRect(ctx, x + 0.5 - j * 0.3, top + 0.75, 0.34, 0.06, 0.03); ctx.fill();
    if (hash(x, y, 9) < 0.4) {
      ctx.strokeStyle = "rgba(80,50,25,0.45)"; ctx.lineWidth = 0.025;
      ctx.beginPath(); ctx.moveTo(x + 0.62, top + 0.12); ctx.lineTo(x + 0.7, top + 0.3); ctx.lineTo(x + 0.64, top + 0.42); ctx.stroke();
    }
  }
  ctx.strokeStyle = P.edge; ctx.lineWidth = 0.045;
  ctx.strokeRect(x + 0.022, top + 0.022, 0.956, 0.956);
}

function drawLayer(ctx, m, v) {
  const items = [];
  for (let y = v.y0; y <= v.y1; y++) for (let x = v.x0; x <= v.x1; x++) {
    if (BREAKABLE.has(m.tiles[y][x])) items.push({ y: y + 1, wall: true, x, ty: y });
  }
  for (const g of G.gems) items.push({ y: g.y, gem: g });
  if (G.ball) items.push({ y: G.ball.y + (G.ball.holder ? 0.05 : 0), ball: G.ball });
  for (const b of G.brawlers) {
    if (b.dead || !visibleTo(0, b)) continue;
    items.push({ y: b.y + b.r * 0.6, b });
  }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    if (it.wall) drawWall(ctx, m, it.x, it.ty);
    else if (it.gem) drawGemWorld(ctx, it.gem);
    else if (it.ball) drawBall(ctx, it.ball);
    else drawBrawler(ctx, it.b, 1);
  }
}

function drawBushes(ctx, m, v) {
  const blobs = [];
  for (let y = v.y0; y <= v.y1; y++) for (let x = v.x0; x <= v.x1; x++) {
    if (m.tiles[y][x] !== '"') continue;
    for (let k = 0; k < 3; k++) {
      const sway = Math.sin(G.time * 1.7 + x * 0.8 + y * 0.5 + k * 2) * 0.018;
      blobs.push({ x: x + 0.25 + hash(x, y, k) * 0.5 + sway, y: y + 0.25 + hash(x, y, k + 7) * 0.5 - 0.18, r: 0.36 + hash(x, y, k + 3) * 0.12, h: hash(x, y, k + 13) });
    }
  }
  if (!blobs.length) return;
  // Each layer is one merged path, so the clump reads as a single leafy mass.
  const layer = (color, dx, dy, grow, scale = 1) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const b of blobs) {
      const r = b.r * scale + grow, cx = b.x + dx * b.r, cy = b.y + dy * b.r;
      ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, TAU);
    }
    ctx.fill();
  };
  layer("rgba(40,60,10,0.22)", 0.25, 0.45, 0.06);
  layer("#1c5a26", 0, 0, 0.07);
  layer("#2f8a38", 0, 0, 0);
  layer("#46a947", -0.12, -0.16, 0, 0.78);
  layer("#66c65a", -0.28, -0.36, 0, 0.42);
  // Leaf flecks.
  ctx.fillStyle = "#8fe07a";
  ctx.beginPath();
  for (const b of blobs) {
    const a = b.h * TAU, cx = b.x - b.r * 0.35 + Math.cos(a) * b.r * 0.2, cy = b.y - b.r * 0.45 + Math.sin(a) * b.r * 0.15;
    ctx.moveTo(cx + 0.05, cy); ctx.ellipse(cx, cy, 0.05, 0.028, -0.6, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = "rgba(20,70,25,0.55)";
  ctx.beginPath();
  for (const b of blobs) {
    const cx = b.x + b.r * 0.3, cy = b.y + b.r * 0.35;
    ctx.moveTo(cx + 0.045, cy); ctx.ellipse(cx, cy, 0.045, 0.025, 0.5, 0, TAU);
  }
  ctx.fill();
}

// ---------------------------------------------------------------------------- entities

function drawGemShape(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.75, y - s * 0.3); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.75, y - s * 0.3);
  ctx.closePath();
}

function drawGemWorld(ctx, g) {
  const bob = Math.sin(G.time * 4 + g.x * 3) * 0.05;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath(); ctx.ellipse(g.x, g.y + 0.12, 0.18, 0.07, 0, 0, TAU); ctx.fill();
  const x = g.x, y = g.y - 0.15 - g.z + bob, s = 0.2;
  // Glow.
  const glow = ctx.createRadialGradient(x, y, 0, x, y, 0.45);
  glow.addColorStop(0, "rgba(200,130,255,0.45)"); glow.addColorStop(1, "rgba(200,130,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(x, y, 0.45, 0, TAU); ctx.fill();
  // Facets: dark left, light right, bright crown.
  drawGemShape(ctx, x, y, s);
  ctx.fillStyle = "#a34ff2"; ctx.fill();
  ctx.fillStyle = "#7b2fc4";
  ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x - s * 0.75, y - s * 0.3); ctx.lineTo(x, y + s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#d7a6ff";
  ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.75, y - s * 0.3); ctx.lineTo(x, y - s * 0.1); ctx.lineTo(x - s * 0.75, y - s * 0.3); ctx.closePath(); ctx.fill();
  drawGemShape(ctx, x, y, s);
  ctx.strokeStyle = "#3d1266"; ctx.lineWidth = 0.035; ctx.stroke();
  // Twinkle.
  const tw = Math.sin(G.time * 5 + g.x * 7 + g.y * 3);
  if (tw > 0.6) {
    const k = (tw - 0.6) * 2.5, sx = x + s * 0.3, sy = y - s * 0.55;
    ctx.fillStyle = `rgba(255,255,255,${k})`;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 0.1 * k); ctx.lineTo(sx + 0.025, sy); ctx.lineTo(sx, sy + 0.1 * k); ctx.lineTo(sx - 0.025, sy); ctx.closePath();
    ctx.moveTo(sx - 0.1 * k, sy); ctx.lineTo(sx, sy + 0.025); ctx.lineTo(sx + 0.1 * k, sy); ctx.lineTo(sx, sy - 0.025); ctx.closePath();
    ctx.fill();
  }
}

function drawBall(ctx, ball) {
  const x = ball.x, y = ball.y, z = ball.z, r = BALL_R + 0.03;
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(x, y + 0.08, r / (1 + z * 0.4), r * 0.45 / (1 + z * 0.4), 0, 0, TAU); ctx.fill();
  const cy = y - r * 0.7 - z;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, cy, r, 0, TAU);
  ctx.fillStyle = "#fafafa"; ctx.fill();
  ctx.clip();
  // Patches roll with the ball.
  ctx.fillStyle = "#26262e";
  for (let k = 0; k < 5; k++) {
    const a = k * TAU / 5 + ball.spin * 0.35, ph = ((ball.spin * 0.25 + k * 0.4) % 2) - 1;
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.75, cy + ph * r * 0.9, r * 0.28, 0, TAU); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(x + Math.sin(ball.spin) * r * 0.2, cy, r * 0.26, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#1b1b1b"; ctx.lineWidth = 0.035;
  ctx.beginPath(); ctx.arc(x, cy, r, 0, TAU); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath(); ctx.arc(x - r * 0.35, cy - r * 0.4, r * 0.18, 0, TAU); ctx.fill();
  // A Super kick glows while it's travelling fast.
  if (ball.power) {
    ctx.strokeStyle = `rgba(255,205,60,${0.6 + Math.sin(G.time * 30) * 0.3})`; ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.arc(x, cy, r * 1.35, 0, TAU); ctx.stroke();
  }
}

function drawBrawler(ctx, b, alpha) {
  const d = b.def, a = b.faceAng, z = b.z;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(b.x, b.y);
  // Team ring, then a soft shadow.
  const ring = b.isPlayer ? "#8ff08f" : TEAM_COLORS[b.team];
  ctx.fillStyle = ring;
  ctx.globalAlpha = alpha * 0.22;
  ctx.beginPath(); ctx.ellipse(0, 0.08, 0.44, 0.21, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = ring;
  ctx.lineWidth = 0.07;
  ctx.beginPath(); ctx.ellipse(0, 0.08, 0.44, 0.21, 0, 0, TAU); ctx.stroke();
  const sk = 1 / (1 + z * 0.3);
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.beginPath(); ctx.ellipse(0, 0.1, 0.38 * sk, 0.17 * sk, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath(); ctx.ellipse(0, 0.1, 0.28 * sk, 0.11 * sk, 0, 0, TAU); ctx.fill();
  if (b.superC >= 1) {
    ctx.strokeStyle = `rgba(255,205,60,${0.55 + Math.sin(G.time * 8) * 0.3})`;
    ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.ellipse(0, 0.08, 0.54, 0.27, 0, 0, TAU); ctx.stroke();
  }
  if (b.shieldT > 0) {
    ctx.fillStyle = "rgba(160,220,255,0.18)";
    ctx.beginPath(); ctx.arc(0, -0.3, 0.6, 0, TAU); ctx.fill();
  }

  const bob = Math.abs(Math.sin(b.walkT * 3.2)) * 0.04;
  ctx.translate(0, -0.18 - z - bob);
  if (b.key === "rook") ctx.scale(1.18, 1.18);
  const facingAway = Math.sin(a) < -0.35;
  const behind = Math.sin(a) < 0;
  if (behind) drawWeapon(ctx, b, a);

  // Body: shaded like a toy, with a belt and a rim of light.
  const hit = b.hitT > 0;
  ctx.lineWidth = 0.055;
  ctx.strokeStyle = "#1e140d";
  ctx.fillStyle = hit ? "#fff" : ballGrad(ctx, 0, 0, 0.3, d.color);
  ctx.beginPath(); ctx.ellipse(0, 0, 0.3, 0.27, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = hit ? "#fff" : d.dark;
  ctx.beginPath(); ctx.ellipse(0, 0.12, 0.24, 0.1, 0, 0, Math.PI); ctx.fill();
  if (!hit) {
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 0.035; ctx.lineCap = "round";
    ctx.beginPath(); ctx.ellipse(0, 0, 0.22, 0.19, 0, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
    ctx.strokeStyle = "#1e140d";
  }

  // Head.
  const hy = -0.33;
  ctx.lineWidth = 0.055;
  ctx.fillStyle = hit ? "#fff" : ballGrad(ctx, 0, hy, 0.22, b.key === "rook" ? d.color : d.skin);
  ctx.beginPath(); ctx.arc(0, hy, 0.22, 0, TAU); ctx.fill(); ctx.stroke();
  if (!hit && !facingAway && b.key !== "rook") {
    ctx.fillStyle = "rgba(255,120,110,0.3)";
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 0.13 + Math.cos(a) * 0.05, hy + 0.07, 0.045, 0.028, 0, 0, TAU); ctx.fill(); }
  }
  const ex = Math.cos(a) * 0.07, ey = Math.sin(a) * 0.04;
  if (!facingAway) {
    if (b.key === "tink") {
      ctx.fillStyle = "#9be7ff"; ctx.strokeStyle = "#231710"; ctx.lineWidth = 0.035;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 0.085 + ex, hy + ey, 0.07, 0, TAU); ctx.fill(); ctx.stroke(); }
    } else {
      if (b.key === "rook") {
        ctx.fillStyle = "#ffd23f";
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 0.08 + ex, hy + ey, 0.07, 0.055, 0, 0, TAU); ctx.fill(); }
      }
      if (b.key !== "rook") {
        ctx.fillStyle = "#fff";
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 0.08 + ex, hy + ey, 0.052, 0.062, 0, 0, TAU); ctx.fill(); }
      }
      const px = Math.cos(a) * 0.015, py = Math.sin(a) * 0.012;
      ctx.fillStyle = "#1b1b1b";
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 0.08 + ex + px, hy + ey + py, 0.033, 0, TAU); ctx.fill(); }
      ctx.fillStyle = "#fff";
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 0.08 + ex + px - 0.012, hy + ey + py - 0.014, 0.011, 0, TAU); ctx.fill(); }
    }
  }
  // Hats and hair.
  ctx.lineWidth = 0.04; ctx.strokeStyle = "#231710";
  if (b.key === "buck") {
    ctx.fillStyle = "#6b4220";
    ctx.beginPath(); ctx.ellipse(0, hy - 0.14, 0.33, 0.09, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#7f5129";
    ctx.beginPath(); ctx.ellipse(0, hy - 0.21, 0.17, 0.12, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
  } else if (b.key === "pike") {
    ctx.fillStyle = "#1d2a44";
    ctx.beginPath(); ctx.arc(0, hy - 0.04, 0.22, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    ctx.fillStyle = "#e0403a";
    ctx.fillRect(-0.22, hy - 0.11, 0.44, 0.06);
  } else if (b.key === "tink") {
    ctx.fillStyle = "#ff9d2e";
    ctx.beginPath(); ctx.arc(0, hy - 0.06, 0.22, Math.PI * 1.1, Math.PI * 1.9); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-0.05, hy - 0.26); ctx.lineTo(0.02, hy - 0.4); ctx.lineTo(0.07, hy - 0.25); ctx.fill();
  } else if (b.key === "rook") {
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath(); ctx.moveTo(-0.06, hy - 0.2); ctx.lineTo(0, hy - 0.32); ctx.lineTo(0.06, hy - 0.2); ctx.fill();
  }
  if (!behind) drawWeapon(ctx, b, a);
  ctx.restore();
}

function drawWeapon(ctx, b, a) {
  ctx.save();
  ctx.translate(0, -0.02);
  ctx.rotate(a);
  ctx.lineWidth = 0.035; ctx.strokeStyle = "#1b1b1b";
  const kick = b.cool > 0.2 ? -0.06 : 0;
  if (b.key === "buck") {
    ctx.fillStyle = "#8a5a2b"; ctx.fillRect(0.08 + kick, -0.06, 0.2, 0.12);
    ctx.fillStyle = "#3a3a3a"; ctx.fillRect(0.26 + kick, -0.07, 0.38, 0.14); ctx.strokeRect(0.26 + kick, -0.07, 0.38, 0.14);
  } else if (b.key === "pike") {
    for (const s of [-1, 1]) {
      ctx.fillStyle = "#454b57"; ctx.fillRect(0.14 + kick, s * 0.14 - 0.045, 0.34, 0.09); ctx.strokeRect(0.14 + kick, s * 0.14 - 0.045, 0.34, 0.09);
      ctx.fillStyle = "#e2b340"; ctx.fillRect(0.14 + kick, s * 0.14 - 0.045, 0.1, 0.09);
    }
  } else if (b.key === "tink") {
    ctx.fillStyle = "#2b2b2b"; ctx.beginPath(); ctx.arc(0.36, 0.08, 0.13, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = Math.sin(G.time * 20) > 0 ? "#ffcf3a" : "#ff6a2a";
    ctx.beginPath(); ctx.arc(0.4, -0.08, 0.05, 0, TAU); ctx.fill();
  } else if (b.key === "rook") {
    const punching = !!b.burst;
    for (const s of [-1, 1]) {
      const ext = punching && ((b.burst.i || 0) % 2 === (s > 0 ? 1 : 0)) ? 0.18 : 0;
      ctx.fillStyle = "#e04848";
      ctx.beginPath(); ctx.arc(0.3 + ext, s * 0.2, 0.12, 0, TAU); ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawShots(ctx) {
  ctx.lineCap = "round";
  for (const s of G.shots) {
    const sp = Math.hypot(s.vx, s.vy), ux = s.vx / sp, uy = s.vy / sp;
    if (s.fist) {
      ctx.fillStyle = "rgba(255,225,190,0.35)";
      ctx.beginPath(); ctx.arc(s.x - ux * 0.12, s.y - uy * 0.12, s.r * 1.1, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,235,210,0.95)";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
      continue;
    }
    // Team-coloured streak, a glowing core and a white-hot tip.
    ctx.strokeStyle = s.team === 0 ? "rgba(110,180,255,0.35)" : "rgba(255,110,110,0.35)";
    ctx.lineWidth = s.r * 3.2;
    ctx.beginPath(); ctx.moveTo(s.x - ux * 0.6, s.y - uy * 0.6); ctx.lineTo(s.x, s.y); ctx.stroke();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = s.color;
    ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 2.2, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.r * 1.7;
    ctx.beginPath(); ctx.moveTo(s.x - ux * 0.3, s.y - uy * 0.3); ctx.lineTo(s.x, s.y); ctx.stroke();
    ctx.fillStyle = "#fffbe8";
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.6, 0, TAU); ctx.fill();
  }
}

function drawBombs(ctx) {
  for (const bm of G.bombs) {
    const t = bm.t / bm.T;
    const x = lerp(bm.x0, bm.x1, t), y = lerp(bm.y0, bm.y1, t);
    const dist = Math.hypot(bm.x1 - bm.x0, bm.y1 - bm.y0);
    const z = 4 * t * (1 - t) * (1.2 + dist * 0.18);
    // Landing zone, so you can dodge.
    ctx.fillStyle = bm.team === 0 ? "rgba(61,139,255,0.12)" : "rgba(255,60,60,0.16)";
    ctx.strokeStyle = bm.team === 0 ? "rgba(61,139,255,0.5)" : "rgba(255,60,60,0.6)";
    ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.arc(bm.x1, bm.y1, bm.radius, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(x, y, 0.16, 0.07, 0, 0, TAU); ctx.fill();
    const r = bm.big ? 0.3 : 0.16;
    ctx.fillStyle = ballGrad(ctx, x, y - z, r, bm.color); ctx.strokeStyle = "#111"; ctx.lineWidth = 0.04;
    ctx.beginPath(); ctx.arc(x, y - z, r, 0, TAU); ctx.fill(); ctx.stroke();
    const fl = 0.06 + Math.sin(G.time * 40) * 0.02;
    ctx.fillStyle = "rgba(255,180,60,0.45)";
    ctx.beginPath(); ctx.arc(x + r * 0.6, y - z - r * 0.8, fl * 2, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fff2a0";
    ctx.beginPath(); ctx.arc(x + r * 0.6, y - z - r * 0.8, fl, 0, TAU); ctx.fill();
  }
}

function drawFx(ctx) {
  for (const f of G.fx) {
    const t = f.t / f.T;
    if (f.type === "spark") {
      ctx.globalAlpha = (1 - t) * 0.5; ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.arc(f.x, f.y, 0.12 + t * 0.15, 0, TAU); ctx.fill();
      ctx.strokeStyle = f.color; ctx.globalAlpha = 1 - t; ctx.lineWidth = 0.05;
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + 0.6, r0 = 0.05 + t * 0.2, r1 = 0.15 + t * 0.35;
        ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0); ctx.lineTo(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1); ctx.stroke();
      }
    } else if (f.type === "boom") {
      // Scorch, smoke puffs, then a fireball that burns out from the middle.
      ctx.globalAlpha = (1 - t) * 0.35; ctx.fillStyle = "#3a2410";
      ctx.beginPath(); ctx.ellipse(f.x, f.y + 0.05, f.r * 0.8, f.r * 0.55, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = (1 - t) * 0.6; ctx.fillStyle = "#8a7f76";
      ctx.beginPath();
      for (let k = 0; k < 7; k++) {
        const a = k * TAU / 7 + f.r, d = f.r * (0.45 + t * 0.7), pr = f.r * 0.28 * (1 - t * 0.4);
        const cx = f.x + Math.cos(a) * d, cy = f.y + Math.sin(a) * d * 0.7 - t * 0.5;
        ctx.moveTo(cx + pr, cy); ctx.arc(cx, cy, pr, 0, TAU);
      }
      ctx.fill();
      const fr = f.r * (0.45 + t * 0.65);
      const fg = ctx.createRadialGradient(f.x, f.y - 0.1, 0, f.x, f.y, fr);
      fg.addColorStop(0, "#fffbe0");
      fg.addColorStop(0.35, f.big ? "#ffc04a" : "#ffd36b");
      fg.addColorStop(0.75, f.big ? "#ff6a1f" : "#ff9a3a");
      fg.addColorStop(1, "rgba(220,60,20,0)");
      ctx.globalAlpha = (1 - t * t) * 0.95; ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(f.x, f.y, fr, 0, TAU); ctx.fill();
    } else if (f.type === "ring" || f.type === "dust") {
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = f.type === "ring" ? f.color : "#b39a7a";
      ctx.lineWidth = 0.12 * (1 - t) + 0.02;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + t * (f.type === "ring" ? 0.8 : 1.1)), 0, TAU); ctx.stroke();
    } else if (f.type === "debris") {
      ctx.globalAlpha = 1 - t; ctx.fillStyle = f.color;
      for (const bit of f.bits) {
        const d = bit.s * t * (1 - t * 0.5), h = 4 * t * (1 - t) * 0.6;
        ctx.save();
        ctx.translate(f.x + Math.cos(bit.a) * d, f.y + Math.sin(bit.a) * d - h);
        ctx.rotate(bit.a + t * bit.s * 3);
        ctx.fillRect(-0.08, -0.08, 0.16, 0.16);
        ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(-0.08, 0.03, 0.16, 0.05);
        ctx.fillStyle = f.color;
        ctx.restore();
      }
    } else if (f.type === "poof") {
      ctx.globalAlpha = (1 - t) * 0.8; ctx.fillStyle = "#ddd";
      for (let k = 0; k < 6; k++) {
        const a = k * TAU / 6, d = 0.2 + t * 0.6;
        ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * d, f.y - 0.3 + Math.sin(a) * d * 0.6 - t * 0.4, 0.22 * (1 - t * 0.5), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

// Aim indicator for the player's attack or super.
function drawAim(ctx) {
  const p = G.player, a = R.aim;
  if (!p || p.dead || !a || G.state !== "play") return;
  const carrying = G.ball && G.ball.holder === p;
  const shape = aimShapes(p)[a.kind];
  const ready = a.kind === "sup" ? p.superC >= 1 : p.ammo >= 1;
  const col = a.kind === "sup" ? (ready ? "255,205,60" : "160,160,160") : (ready ? "255,255,255" : "255,120,120");
  const strong = a.strong ? 1 : 0.55;
  ctx.fillStyle = `rgba(${col},${0.22 * strong})`;
  ctx.strokeStyle = `rgba(${col},${0.55 * strong})`;
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  if (shape.type === "cone") {
    ctx.moveTo(p.x, p.y);
    ctx.arc(p.x, p.y, shape.range, a.ang - shape.spread / 2, a.ang + shape.spread / 2);
    ctx.closePath();
  } else if (shape.type === "line") {
    const w = (shape.width || 0.5) / 2, ux = Math.cos(a.ang), uy = Math.sin(a.ang);
    ctx.moveTo(p.x - uy * w, p.y + ux * w);
    ctx.lineTo(p.x - uy * w + ux * shape.range, p.y + ux * w + uy * shape.range);
    ctx.lineTo(p.x + uy * w + ux * shape.range, p.y - ux * w + uy * shape.range);
    ctx.lineTo(p.x + uy * w, p.y - ux * w);
    ctx.closePath();
  } else {
    const d = clamp(a.dist, shape.minRange || 0, shape.range);
    const tx = p.x + Math.cos(a.ang) * d, ty = p.y + Math.sin(a.ang) * d;
    ctx.arc(tx, ty, shape.radius, 0, TAU);
    ctx.fill(); ctx.stroke();
    ctx.setLineDash([0.15, 0.15]);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(${col},0.15)`;
    ctx.beginPath(); ctx.arc(p.x, p.y, shape.range, 0, TAU); ctx.stroke();
    return;
  }
  ctx.fill(); ctx.stroke();
}

// ---------------------------------------------------------------------------- screen-space overlays

function drawTags(ctx) {
  const s = R.cam.s;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  for (const b of G.brawlers) {
    if (b.dead || !visibleTo(0, b)) continue;
    const scale = b.key === "rook" ? 1.18 : 1;
    const p = toScreen(b.x, b.y - b.z - 0.62 - 0.45 * scale);
    const w = s * 1.0, h = Math.max(6, s * 0.15);
    const color = b.isPlayer ? "#5fe35f" : b.team === 0 ? "#4aa3ff" : "#ff5a5a";
    // Health bar.
    ctx.fillStyle = "rgba(15,15,20,0.85)";
    roundRect(ctx, p.x - w / 2 - 2, p.y - h - 2, w + 4, h + 4, 3); ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, p.x - w / 2, p.y - h, w * clamp(b.hp / b.maxHp, 0, 1), h, 2); ctx.fill();
    // Health number and name.
    const fs = Math.max(10, Math.round(s * 0.24));
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.fillStyle = "#fff";
    ctx.strokeText(String(Math.ceil(b.hp)), p.x, p.y - h - 4);
    ctx.fillText(String(Math.ceil(b.hp)), p.x, p.y - h - 4);
    ctx.font = `700 ${Math.round(fs * 0.8)}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.strokeText(b.name, p.x, p.y - h - 5 - fs);
    ctx.fillText(b.name, p.x, p.y - h - 5 - fs);
    // Gems carried.
    if (b.gems > 0) {
      const gx = p.x - w / 2 - fs * 0.9, gy = p.y - h / 2;
      drawGemShape(ctx, gx, gy - 1, fs * 0.45);
      ctx.fillStyle = "#c07cff"; ctx.fill(); ctx.strokeStyle = "#2b0f47"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = `900 ${fs}px system-ui, sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.fillStyle = "#fff";
      ctx.strokeText(String(b.gems), gx, gy - fs * 0.55);
      ctx.fillText(String(b.gems), gx, gy - fs * 0.55);
    }
    // Your ammo.
    if (b.isPlayer) {
      const aw = (w - 4) / 3, ah = Math.max(4, s * 0.08);
      for (let i = 0; i < 3; i++) {
        const x = p.x - w / 2 + i * (aw + 2), y = p.y + 4;
        ctx.fillStyle = "rgba(15,15,20,0.85)"; ctx.fillRect(x, y, aw, ah);
        const f = clamp(b.ammo - i, 0, 1);
        ctx.fillStyle = f >= 1 ? "#ff9d2e" : "#a86a2a";
        ctx.fillRect(x, y, aw * f, ah);
      }
    }
  }
}

function drawTexts(ctx) {
  const s = R.cam.s;
  ctx.textAlign = "center";
  for (const t of G.texts) {
    const k = t.t / t.T;
    const p = toScreen(t.x, t.y - k * 0.6);
    ctx.globalAlpha = 1 - k * k;
    ctx.font = `900 ${Math.max(11, Math.round(s * 0.3))}px system-ui, sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.fillStyle = t.color;
    ctx.strokeText(t.text, p.x, p.y); ctx.fillText(t.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

function drawHUD(ctx) {
  const W = R.W, H = R.H, u = Math.min(W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Score: gems, or goals and the match clock.
  const pw = Math.min(260, W * 0.5), ph = Math.max(34, u * 0.08), px = W / 2 - pw / 2, py = 8;
  ctx.fillStyle = "rgba(10,14,30,0.75)";
  roundRect(ctx, px, py, pw, ph, ph / 2); ctx.fill();
  const fs = Math.round(ph * 0.55);
  drawScorePanel(ctx, px, py, pw, ph, fs);
  if (G.mode === "gem" && G.countTeam >= 0 && G.state === "play") {
    const mine = G.countTeam === 0;
    const text = G.countPaused ? `TIED ON GEMS · COUNTDOWN PAUSED AT ${Math.ceil(G.countdown)}`
      : `${mine ? "YOUR TEAM WINS" : "ENEMIES WIN"} IN ${Math.ceil(G.countdown)}`;
    ctx.font = `900 ${Math.round(fs * 0.85)}px system-ui, sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.fillStyle = mine ? "#7fc1ff" : "#ff7a7a";
    ctx.strokeText(text, W / 2, py + ph + fs * 0.8); ctx.fillText(text, W / 2, py + ph + fs * 0.8);
  }

  // Kill feed.
  ctx.textAlign = "left";
  ctx.font = `700 ${Math.max(11, Math.round(u * 0.028))}px system-ui, sans-serif`;
  let fy = 18;
  for (const f of G.feed) {
    if (G.time - f.t > 4) continue;
    const k = f.killer && f.killer !== f.victim ? f.killer : null;
    const text = k ? `${k.name} (${k.def.name})  ✖  ${f.victim.name}` : `${f.victim.name} was defeated`;
    ctx.fillStyle = "rgba(10,14,30,0.6)";
    const tw = ctx.measureText(text).width;
    roundRect(ctx, 10, fy - 11, tw + 16, 22, 6); ctx.fill();
    ctx.fillStyle = k ? TEAM_COLORS[k.team] : "#ddd";
    ctx.fillText(text, 18, fy);
    fy += 26;
  }

  const p = G.player;
  ctx.textAlign = "center";
  // Intro countdown.
  if (G.intro > 0) {
    const n = Math.ceil(G.intro);
    bigText(ctx, n > 0 ? String(n) : "", W / 2, H * 0.42, u * 0.16, "#fff");
    ctx.font = `800 ${Math.round(u * 0.035)}px system-ui, sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.fillStyle = "#e6d3ff";
    const sub = G.mode === "ball"
      ? (G.kickoffs ? `KICKOFF  ·  ${G.score[0]} - ${G.score[1]}` : "BRAWL BALL: first team to score 2 goals wins")
      : "GEM GRAB: grab 10 gems and hold them for 15 seconds";
    ctx.strokeText(sub, W / 2, H * 0.56); ctx.fillText(sub, W / 2, H * 0.56);
  } else if (G.time < 3.8 && G.state === "play" && !G.kickoffs) {
    bigText(ctx, "BRAWL!", W / 2, H * 0.42, u * 0.13, "#ffd23f");
  }
  if (G.goalT > 0 && G.lastGoal) {
    const g = G.lastGoal, ours = g.team === 0;
    bigText(ctx, "GOAL!", W / 2, H * 0.4, u * 0.15, ours ? "#7fc1ff" : "#ff7a7a");
    const who = g.own ? "Own goal!" : g.scorer ? `${g.scorer.name} (${g.scorer.def.name}) scores` : "";
    ctx.font = `800 ${Math.round(u * 0.04)}px system-ui, sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.fillStyle = "#fff";
    ctx.strokeText(who, W / 2, H * 0.53); ctx.fillText(who, W / 2, H * 0.53);
  }
  if (p && p.dead && G.state === "play" && G.goalT <= 0) {
    bigText(ctx, `Respawning in ${Math.ceil(p.respawnT)}`, W / 2, H * 0.45, u * 0.06, "#fff");
  }
  if (G.state === "ending") {
    if (G.draw) bigText(ctx, "DRAW", W / 2, H * 0.42, u * 0.14, "#e6e6e6");
    else bigText(ctx, G.winner === 0 ? "VICTORY!" : "DEFEAT", W / 2, H * 0.42, u * 0.14, G.winner === 0 ? "#ffd23f" : "#ff6b6b");
  }

  if (!p || G.state !== "play") return;
  if (Input.touchMode) drawTouchControls(ctx, p);
  else drawDesktopSuper(ctx, p);
}

// Team scores (gems or goals) either side of the match clock.
function drawScorePanel(ctx, px, py, pw, ph, fs) {
  const W = R.W, cy = py + ph / 2, gem = G.mode === "gem";
  for (let t = 0; t < 2; t++) {
    const cx = W / 2 + (t === 0 ? -pw * 0.32 : pw * 0.32);
    const pg = ctx.createLinearGradient(0, py + 4, 0, py + ph - 4);
    pg.addColorStop(0, shade(TEAM_COLORS[t], 0.25)); pg.addColorStop(1, shade(TEAM_COLORS[t], -0.2));
    ctx.fillStyle = pg;
    roundRect(ctx, cx - pw * 0.15, py + 4, pw * 0.3, ph - 8, (ph - 8) / 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    roundRect(ctx, cx - pw * 0.13, py + 6, pw * 0.26, (ph - 8) * 0.4, (ph - 8) * 0.2); ctx.fill();
    let tx = cx;
    if (gem) {
      drawGemShape(ctx, cx - fs * 0.55, cy, fs * 0.36);
      ctx.fillStyle = "#e3c4ff"; ctx.fill();
      tx = cx + fs * 0.3;
    }
    ctx.font = `900 ${fs}px system-ui, sans-serif`;
    ctx.fillStyle = "#fff";
    ctx.fillText(String(gem ? G.teamGems[t] : G.score[t]), tx, cy + 1);
  }
  const secs = Math.max(0, Math.ceil(G.clock)), clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const hurry = G.overtime || secs <= 10;
  ctx.font = `900 ${Math.round(fs * 0.85)}px system-ui, sans-serif`;
  ctx.fillStyle = hurry ? "#ffb347" : "#fff";
  ctx.fillText(clock, W / 2, cy + 1);
  if (G.overtime && G.state === "play") {
    ctx.font = `900 ${Math.round(fs * 0.7)}px system-ui, sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.fillStyle = "#ffb347";
    const text = "OVERTIME · NEXT GOAL WINS";
    ctx.strokeText(text, W / 2, py + ph + fs * 0.8); ctx.fillText(text, W / 2, py + ph + fs * 0.8);
  }
}

// Arrow at the screen edge pointing at the ball when it's off camera.
function drawBallPointer(ctx) {
  const ball = G.ball;
  if (!ball || G.state !== "play") return;
  const p = toScreen(ball.x, ball.y - ball.z), m = 26;
  if (p.x > m && p.x < R.W - m && p.y > m && p.y < R.H - m) return;
  const x = clamp(p.x, m, R.W - m), y = clamp(p.y, m + Math.max(34, Math.min(R.W, R.H) * 0.08) + 30, R.H - m);
  const a = Math.atan2(p.y - R.H / 2, p.x - R.W / 2);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(10,14,30,0.7)";
  ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill();
  ctx.fillStyle = "#fafafa"; ctx.strokeStyle = "#222"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.rotate(a);
  ctx.fillStyle = ball.holder ? TEAM_COLORS[ball.holder.team] : "#fff";
  ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(14, -6); ctx.lineTo(14, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function bigText(ctx, text, x, y, size, color) {
  ctx.font = `900 italic ${Math.round(size)}px system-ui, sans-serif`;
  ctx.lineWidth = Math.max(4, size * 0.08);
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.fillStyle = color;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

function drawDesktopSuper(ctx, p) {
  const u = Math.min(R.W, R.H), r = u * 0.055, x = R.W - r * 1.8, y = R.H - r * 1.8;
  superDial(ctx, x, y, r, p);
  const carrying = G.ball && G.ball.holder === p;
  ctx.font = `800 ${Math.round(r * 0.32)}px system-ui, sans-serif`;
  ctx.fillStyle = p.superC >= 1 ? "#ffd23f" : "#aab";
  ctx.fillText(p.superC >= 1 ? (carrying ? "SUPER KICK (E)" : "E / RIGHT-CLICK") : "SUPER", x, y + r * 1.45);
}

function superDial(ctx, x, y, r, p) {
  const ready = p.superC >= 1;
  ctx.fillStyle = ready ? "#ffc526" : "rgba(40,40,50,0.75)";
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  if (!ready) {
    ctx.strokeStyle = "#ffc526"; ctx.lineWidth = r * 0.16;
    ctx.beginPath(); ctx.arc(x, y, r * 0.88, -Math.PI / 2, -Math.PI / 2 + TAU * p.superC); ctx.stroke();
  } else {
    ctx.strokeStyle = `rgba(255,240,170,${0.5 + Math.sin(G.time * 8) * 0.4})`; ctx.lineWidth = r * 0.12;
    ctx.beginPath(); ctx.arc(x, y, r * 1.08, 0, TAU); ctx.stroke();
  }
  // Skull-ish star icon.
  ctx.fillStyle = ready ? "#5a3b00" : "#888";
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.22 : r * 0.5;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

function drawTouchControls(ctx, p) {
  const L = touchLayout(R.W, R.H);
  // Move stick.
  const m = Input.move;
  const bx = m ? m.ox : L.maxDrag * 1.4, by = m ? m.oy : R.H - L.maxDrag * 1.4;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath(); ctx.arc(bx, by, L.maxDrag * 0.8, 0, TAU); ctx.fill();
  let kx = bx, ky = by;
  if (m) {
    const dx = m.x - m.ox, dy = m.y - m.oy, d = Math.hypot(dx, dy), k = Math.min(1, L.maxDrag * 0.8 / (d || 1));
    kx = bx + dx * k; ky = by + dy * k;
  }
  ctx.fillStyle = "rgba(90,160,255,0.75)";
  ctx.beginPath(); ctx.arc(kx, ky, L.maxDrag * 0.35, 0, TAU); ctx.fill();

  // Attack button (a kick while carrying the ball).
  const at = Input.aimTouch.atk;
  ctx.fillStyle = G.ball && G.ball.holder === p ? "rgba(240,240,240,0.85)" : "rgba(255,90,70,0.8)";
  ctx.beginPath(); ctx.arc(L.atk.x, L.atk.y, L.atk.r, 0, TAU); ctx.fill();
  if (at) {
    ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(at.ox, at.oy, L.maxDrag, 0, TAU); ctx.stroke();
    const dx = at.x - at.ox, dy = at.y - at.oy, d = Math.hypot(dx, dy), k = Math.min(1, L.maxDrag / (d || 1));
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath(); ctx.arc(at.ox + dx * k, at.oy + dy * k, L.atk.r * 0.45, 0, TAU); ctx.fill();
  } else {
    ctx.strokeStyle = G.ball && G.ball.holder === p ? "#333" : "#fff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(L.atk.x, L.atk.y, L.atk.r * 0.4, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L.atk.x - L.atk.r * 0.6, L.atk.y); ctx.lineTo(L.atk.x + L.atk.r * 0.6, L.atk.y);
    ctx.moveTo(L.atk.x, L.atk.y - L.atk.r * 0.6); ctx.lineTo(L.atk.x, L.atk.y + L.atk.r * 0.6); ctx.stroke();
  }
  // Super button.
  const su = Input.aimTouch.sup;
  if (su && p.superC >= 1) {
    const dx = su.x - su.ox, dy = su.y - su.oy, d = Math.hypot(dx, dy), k = Math.min(1, L.maxDrag / (d || 1));
    superDial(ctx, su.ox + dx * k, su.oy + dy * k, L.sup.r, p);
  } else superDial(ctx, L.sup.x, L.sup.y, L.sup.r, p);

  // Pause.
  ctx.fillStyle = "rgba(10,14,30,0.6)";
  ctx.beginPath(); ctx.arc(L.pause.x, L.pause.y, L.pause.r, 0, TAU); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillRect(L.pause.x - L.pause.r * 0.35, L.pause.y - L.pause.r * 0.4, L.pause.r * 0.25, L.pause.r * 0.8);
  ctx.fillRect(L.pause.x + L.pause.r * 0.1, L.pause.y - L.pause.r * 0.4, L.pause.r * 0.25, L.pause.r * 0.8);
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
