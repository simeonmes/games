"use strict";
// Drawing: the surface (sky, headframe, ore pile, warehouse, transporters), the elevator,
// and every visible shaft with its crate, miners and rock face. Everything is drawn in world
// units; the caller gives the scale and scroll. No image files: it's all shapes.

const Render = (() => {
  let cv, ctx, dpr = 1;
  let rockPat = null, rockKey = -1;
  const floats = []; // rising "+$12" texts in world units
  const sparks = []; // pickaxe chips

  function init(canvas) {
    cv = canvas;
    ctx = cv.getContext("2d", { alpha: false });
  }

  function resize(vw, vh) {
    // Chromebooks and phones: cap the pixel ratio so big screens stay smooth.
    dpr = Math.min(window.devicePixelRatio || 1, vw * vh > 1.2e6 ? 1.25 : 1.75);
    cv.width = Math.round(vw * dpr);
    cv.height = Math.round(vh * dpr);
    cv.style.width = vw + "px";
    cv.style.height = vh + "px";
  }

  // ---------------------------------------------------------------- helpers

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function makeRock(theme) {
    const c = document.createElement("canvas");
    c.width = c.height = 160;
    const g = c.getContext("2d");
    g.fillStyle = theme.rock;
    g.fillRect(0, 0, 160, 160);
    const r = rng(99);
    for (let k = 0; k < 46; k++) {
      const x = r() * 160, y = r() * 160, s = 3 + r() * 11;
      g.fillStyle = r() < 0.5 ? shade(theme.rock, -0.1 - r() * 0.12) : shade(theme.rock, 0.03 + r() * 0.06);
      g.beginPath();
      g.ellipse(x, y, s, s * (0.5 + r() * 0.4), r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (let k = 0; k < 120; k++) {
      g.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.2})`;
      g.fillRect(r() * 160, r() * 160, 1.5, 1.5);
    }
    return ctx.createPattern(c, "repeat");
  }

  // Easy-to-read money in a pill.
  function label(text, x, y, opts = {}) {
    ctx.font = `800 ${opts.size || 11}px "Segoe UI", system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 12, h = (opts.size || 11) + 7;
    ctx.fillStyle = opts.bg || "rgba(10,8,6,0.72)";
    rrect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = opts.color || "#ffe27a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y + 0.5);
  }

  // ---------------------------------------------------------------- people

  const SKIN = ["#f1c7a0", "#d9a273", "#a86b45", "#7a4a2c", "#ffd9b8"];
  const HAIR = ["#2b1a10", "#6b3b1c", "#c9a14a", "#1a1a1a", "#9c9c9c"];

  // A miner (or transporter) standing at x with feet at y. dir: 1 right, -1 left.
  function person(x, y, dir, walkT, o) {
    const bob = o.walking ? Math.abs(Math.sin(walkT * 9)) * 1.4 : 0;
    const swing = o.walking ? Math.sin(walkT * 9) * 5 : 0;
    ctx.save();
    const k = o.scale || 1.25;
    ctx.translate(x, y - bob * k);
    ctx.scale(dir * k, k);
    // legs
    ctx.strokeStyle = o.pants || "#2d3a5a";
    ctx.lineWidth = 3.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-1.5, -10); ctx.lineTo(-1.5 + swing * 0.6, -1);
    ctx.moveTo(1.5, -10); ctx.lineTo(1.5 - swing * 0.6, -1);
    ctx.stroke();
    // body
    ctx.fillStyle = o.shirt || "#e8822a";
    rrect(-5, -21, 10, 12, 3);
    ctx.fill();
    if (o.tie) { ctx.fillStyle = o.tie; ctx.fillRect(-1, -20, 2, 8); }
    // straps / vest stripe
    if (o.vest) { ctx.fillStyle = "#ffe14d"; ctx.fillRect(-5, -16, 10, 2); }
    // head
    ctx.fillStyle = o.skin || SKIN[0];
    ctx.beginPath();
    ctx.arc(0, -25.5, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(1.6, -27, 1.2, 1.4);
    // hat
    if (o.hat === "helmet") {
      ctx.fillStyle = o.hatColor || "#ffcc22";
      ctx.beginPath();
      ctx.arc(0, -27, 5.4, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-6, -27.5, 12.5, 1.8);
      ctx.fillStyle = "#fffbe0";
      ctx.beginPath(); ctx.arc(4.6, -29, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (o.hat === "top") {
      ctx.fillStyle = "#1c1c22";
      ctx.fillRect(-4, -36, 8, 7);
      ctx.fillRect(-6, -30, 12, 1.8);
      ctx.fillStyle = o.tie || "#c33";
      ctx.fillRect(-4, -31.5, 8, 1.5);
    } else if (o.hair) {
      ctx.fillStyle = o.hair;
      ctx.beginPath();
      ctx.arc(0, -27, 4.8, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
    }
    ctx.restore();
  }

  function pickaxe(x, y, dir, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    ctx.rotate(angle);
    ctx.strokeStyle = "#8a5a2b";
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -13); ctx.stroke();
    ctx.strokeStyle = "#c9ced6";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-6, -11); ctx.quadraticCurveTo(0, -16, 6, -11);
    ctx.stroke();
    ctx.restore();
  }

  function sack(x, y, ore, size) {
    ctx.fillStyle = "#b08d5a";
    ctx.beginPath();
    ctx.ellipse(x, y, 5 * size, 4.5 * size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ore[1];
    ctx.beginPath(); ctx.arc(x - 1.5 * size, y - 3.5 * size, 1.8 * size, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ore[2];
    ctx.beginPath(); ctx.arc(x + 1.5 * size, y - 3.8 * size, 1.4 * size, 0, Math.PI * 2); ctx.fill();
  }

  function managerLook(m) {
    const r = rng(m.look * 7919 + 13);
    return {
      skin: SKIN[Math.floor(r() * SKIN.length)],
      hair: HAIR[Math.floor(r() * HAIR.length)],
      tie: ["#3fbf6a", "#3d8bff", "#ffc53d"][m.rarity],
      shirt: ["#55606e", "#2f3a52", "#3a2340"][m.rarity],
      pants: "#20242c",
      hat: m.rarity === 2 ? "top" : null,
    };
  }

  // Head-and-shoulders portrait in a circle of radius r at (x, y).
  function portrait(m, x, y, r, t) {
    const L = managerLook(m);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = ["#1f3b2a", "#1c2c4a", "#3f2f12"][m.rarity];
    ctx.fill();
    ctx.clip();
    ctx.translate(x, y + r * 1.075);
    ctx.scale(r / 20, r / 20);
    person(0, 0, 1, t, Object.assign({ scale: 1 }, L));
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = m.active > 0 ? "#7dffb0" : ["#3fbf6a", "#3d8bff", "#ffc53d"][m.rarity];
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }

  // ---------------------------------------------------------------- scene parts

  function drawSky(m, theme, top, bottom, x0, x1, t) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, theme.sky[0]);
    g.addColorStop(1, theme.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(x0, top, x1 - x0, GROUND_Y - top + 1);
    // sun or moon
    ctx.fillStyle = m.mineIndex % MINES.length === 7 ? "#e8ecff" : "rgba(255,248,214,0.9)";
    ctx.beginPath(); ctx.arc(250, 70, 18, 0, Math.PI * 2); ctx.fill();
    // clouds drift across the whole screen width
    const span = x1 - x0 + 160;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (let k = 0; k < 4; k++) {
      const cx = x0 - 80 + ((k * 211 + t * (6 + k * 2)) % span);
      const cy = 46 + k * 22;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 22, 8, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 14, cy - 5, 14, 9, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 13, cy - 2, 11, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // hills
    ctx.fillStyle = shade(theme.rock, 0.25);
    ctx.beginPath();
    ctx.moveTo(x0, GROUND_Y);
    for (let x = x0; x <= x1 + 20; x += 20) ctx.lineTo(x, GROUND_Y - 34 - Math.sin(x * 0.021) * 16 - Math.sin(x * 0.053) * 7);
    ctx.lineTo(x1, GROUND_Y);
    ctx.fill();
    ctx.fillStyle = shade(theme.rock, 0.1);
    ctx.beginPath();
    ctx.moveTo(x0, GROUND_Y);
    for (let x = x0; x <= x1 + 20; x += 20) ctx.lineTo(x, GROUND_Y - 16 - Math.sin(x * 0.034 + 2) * 9);
    ctx.lineTo(x1, GROUND_Y);
    ctx.fill();
  }

  function drawHeadframe(m, t) {
    const x = ELEV_X, w = ELEV_W, topY = 70;
    ctx.strokeStyle = "#4b5563";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 2, GROUND_Y); ctx.lineTo(x + 12, topY);
    ctx.moveTo(x + w - 2, GROUND_Y); ctx.lineTo(x + w - 12, topY);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const y0 = topY + 10 + k * 27, y1 = y0 + 27;
      const ix = (yy) => x + 2 + ((GROUND_Y - yy) / (GROUND_Y - topY)) * 10;
      ctx.moveTo(ix(y0), y0); ctx.lineTo(x + w - (ix(y1) - x), y1);
      ctx.moveTo(x + w - (ix(y0) - x), y0); ctx.lineTo(ix(y1), y1);
    }
    ctx.stroke();
    ctx.fillStyle = "#6b7280";
    ctx.fillRect(x + 6, topY - 4, w - 12, 6);
    // the big wheel turns while the cage moves
    const e = m.elevator, moving = e.state === "down" || e.state === "up";
    const spin = (e.y / 9) % (Math.PI * 2);
    ctx.save();
    ctx.translate(x + w / 2, topY - 12);
    ctx.rotate(moving ? spin : spin);
    ctx.strokeStyle = "#9aa3ad";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 4; ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14); ctx.lineTo(-Math.cos(a) * 14, -Math.sin(a) * 14); }
    ctx.stroke();
    ctx.restore();
  }

  function drawStash(m, mult) {
    const amount = m.stash;
    const size = amount > 0 ? Math.min(1, 0.3 + Math.log10(1 + amount) / 14) : 0;
    const cx = STASH_X + 30;
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(STASH_X + 2, GROUND_Y - 3, 56, 4);
    if (size > 0) {
      ctx.fillStyle = "#3a3a40";
      ctx.beginPath();
      ctx.moveTo(cx - 26 * size - 4, GROUND_Y);
      ctx.quadraticCurveTo(cx, GROUND_Y - 34 * size, cx + 26 * size + 4, GROUND_Y);
      ctx.fill();
      ctx.fillStyle = "#ffd34d";
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.arc(cx - 14 * size + k * 5.6 * size, GROUND_Y - 6 - ((k * 7) % 11) * size, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    label("$" + Fmt.money(amount * mult), cx, GROUND_Y - 46);
  }

  function drawWarehouse(m, theme, mult, t) {
    const x = DOCK_X + 2, y = 112, w = 92, h = GROUND_Y - y;
    ctx.fillStyle = "#8c3b2a";
    ctx.fillRect(x, y + 18, w, h - 18);
    // planks
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 1; k < 9; k++) { ctx.moveTo(x + k * 10.2, y + 20); ctx.lineTo(x + k * 10.2, GROUND_Y); }
    ctx.stroke();
    // roof
    ctx.fillStyle = "#5a2a1e";
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 20); ctx.lineTo(x + w / 2, y - 6); ctx.lineTo(x + w + 6, y + 20);
    ctx.fill();
    // door with the cross brace
    ctx.fillStyle = "#3b1d14";
    ctx.fillRect(x + 10, y + 46, 34, h - 46);
    ctx.strokeStyle = "#e9d8b0";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 10, y + 46, 34, h - 46);
    ctx.beginPath(); ctx.moveTo(x + 10, y + 46); ctx.lineTo(x + 44, GROUND_Y); ctx.moveTo(x + 44, y + 46); ctx.lineTo(x + 10, GROUND_Y); ctx.stroke();
    // sign
    ctx.fillStyle = "#f3e2b3";
    rrect(x + 50, y + 26, 38, 13, 3);
    ctx.fill();
    ctx.fillStyle = "#5a2a1e";
    ctx.font = '900 7.5px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SELL", x + 69, y + 33);
    // coins stacked by the door
    ctx.fillStyle = "#ffd23f";
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(x + 64 + (k % 2) * 9, GROUND_Y - 3 - Math.floor(k / 2) * 4, 4, 2, 0, 0, Math.PI * 2); ctx.fill(); }
  }

  function drawTransporters(m, t) {
    const w = m.warehouse, ore = oreFor(0);
    w.workers.forEach((p, k) => {
      const walking = p.state === "walk" || p.state === "back";
      const dir = p.state === "walk" || p.state === "load" ? -1 : 1;
      const x = p.x;
      // cart in front
      const cx = x + dir * 13;
      ctx.fillStyle = "#6b7280";
      rrect(cx - 8, GROUND_Y - 13, 16, 8, 2);
      ctx.fill();
      ctx.fillStyle = "#1f2937";
      ctx.beginPath(); ctx.arc(cx - 4, GROUND_Y - 3, 2.6, 0, Math.PI * 2); ctx.arc(cx + 4, GROUND_Y - 3, 2.6, 0, Math.PI * 2); ctx.fill();
      if (p.carry > 0) {
        ctx.fillStyle = "#3a3a40";
        ctx.beginPath(); ctx.ellipse(cx, GROUND_Y - 13, 7, 4, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#ffd34d";
        ctx.beginPath(); ctx.arc(cx + 2, GROUND_Y - 15, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = "#4b5563";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + dir * 3, GROUND_Y - 15); ctx.lineTo(cx - dir * 8, GROUND_Y - 11); ctx.stroke();
      person(x, GROUND_Y, dir, t + k * 0.3, { walking, shirt: "#3b82c4", vest: true, hat: "helmet", hatColor: "#ff8c1a", skin: SKIN[(k + 1) % SKIN.length] });
    });
  }

  function drawCage(m, mult) {
    const e = m.elevator, x = ELEV_X + 6, w = ELEV_W - 12;
    // cable from the wheel
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ELEV_X + ELEV_W / 2, 58); ctx.lineTo(ELEV_X + ELEV_W / 2, e.y); ctx.stroke();
    ctx.fillStyle = "#374151";
    ctx.fillRect(x, e.y, w, CAGE_H);
    ctx.fillStyle = "#111827";
    ctx.fillRect(x + 4, e.y + 6, w - 8, CAGE_H - 12);
    // ore fill
    const cap = elevStats(e.level).load;
    const f = Math.min(1, e.carry / cap);
    if (f > 0) {
      ctx.fillStyle = "#4b4b55";
      ctx.fillRect(x + 4, e.y + CAGE_H - 6 - (CAGE_H - 14) * f, w - 8, (CAGE_H - 14) * f);
      ctx.fillStyle = "#ffd34d";
      ctx.fillRect(x + 10, e.y + CAGE_H - 10 - (CAGE_H - 14) * f * 0.5, 3, 3);
      ctx.fillRect(x + 26, e.y + CAGE_H - 14 - (CAGE_H - 14) * f * 0.3, 3, 3);
    }
    // mesh
    ctx.strokeStyle = "rgba(170,180,195,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 1; k < 5; k++) { ctx.moveTo(x + 4 + k * (w - 8) / 5, e.y + 6); ctx.lineTo(x + 4 + k * (w - 8) / 5, e.y + CAGE_H - 6); }
    ctx.stroke();
    ctx.fillStyle = "#facc15";
    ctx.fillRect(x, e.y, w, 3);
    ctx.fillRect(x, e.y + CAGE_H - 3, w, 3);
    if (e.carry > 0) label("$" + Fmt.money(e.carry * mult), x + w / 2, e.y + CAGE_H / 2, { size: 9 });
  }

  function drawShaft(m, s, theme, mult, t) {
    const top = shaftTop(s.i), floor = shaftFloor(s.i), ore = oreFor(s.i);
    const tx0 = ELEV_X + ELEV_W, tx1 = FACE_X + 14, ty0 = top + 30;
    // tunnel
    ctx.fillStyle = shade(theme.deep, 0.12);
    ctx.fillRect(tx0, ty0, tx1 - tx0, floor - ty0 + 4);
    const g = ctx.createLinearGradient(0, ty0, 0, floor);
    g.addColorStop(0, "rgba(0,0,0,0.45)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(tx0, ty0, tx1 - tx0, floor - ty0);
    // lantern light
    for (const lx of [190, 300]) {
      const lg = ctx.createRadialGradient(lx, ty0 + 14, 2, lx, ty0 + 14, 70);
      lg.addColorStop(0, "rgba(255,200,110,0.28)");
      lg.addColorStop(1, "rgba(255,200,110,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(lx - 70, ty0, 140, floor - ty0);
    }
    // rock face with ore veins
    const r = rng(s.i * 31 + 5);
    ctx.fillStyle = theme.rock;
    ctx.beginPath();
    ctx.moveTo(tx1 + 2, ty0);
    for (let k = 0; k <= 8; k++) ctx.lineTo(FACE_X - 4 + r() * 10, ty0 + (k * (floor - ty0)) / 8);
    ctx.lineTo(tx1 + 2, floor);
    ctx.fill();
    for (let k = 0; k < 9; k++) {
      const vx = FACE_X + r() * 16, vy = ty0 + 8 + r() * (floor - ty0 - 16), vs = 2.2 + r() * 3;
      ctx.fillStyle = k % 3 ? ore[1] : ore[2];
      ctx.beginPath();
      ctx.moveTo(vx, vy - vs); ctx.lineTo(vx + vs, vy); ctx.lineTo(vx, vy + vs); ctx.lineTo(vx - vs, vy);
      ctx.fill();
    }
    // a glint now and then
    const gl = (t * 0.7 + s.i * 0.37) % 3;
    if (gl < 0.4) {
      ctx.fillStyle = `rgba(255,255,255,${0.9 - gl * 2})`;
      const gx = FACE_X + 6, gy = ty0 + 30 + (s.i * 13) % 40;
      ctx.fillRect(gx - 4, gy - 0.5, 8, 1); ctx.fillRect(gx - 0.5, gy - 4, 1, 8);
    }
    // supports
    ctx.fillStyle = "#6b4423";
    for (const bx of [152, 236, 320]) {
      ctx.fillRect(bx, ty0, 5, floor - ty0);
    }
    ctx.fillRect(tx0, ty0, tx1 - tx0 - 10, 5);
    // lanterns
    for (const lx of [190, 300]) {
      ctx.strokeStyle = "#2a2a2a"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(lx, ty0 + 5); ctx.lineTo(lx, ty0 + 10); ctx.stroke();
      ctx.fillStyle = "#ffd27a";
      ctx.fillRect(lx - 2.5, ty0 + 10, 5, 7);
    }
    // floor & rail planks
    ctx.fillStyle = "#4a3020";
    ctx.fillRect(tx0, floor, tx1 - tx0, 5);
    // crate
    const cx = CRATE_X, cw = 40, ch = 26;
    ctx.fillStyle = "#9c6a35";
    ctx.fillRect(cx, floor - ch, cw, ch);
    ctx.strokeStyle = "#6b4423";
    ctx.lineWidth = 2;
    ctx.strokeRect(cx + 1, floor - ch + 1, cw - 2, ch - 2);
    ctx.beginPath(); ctx.moveTo(cx + 1, floor - ch + 1); ctx.lineTo(cx + cw - 1, floor - 1); ctx.stroke();
    if (s.stored > 0) {
      const f = Math.min(1, 0.35 + Math.log10(1 + s.stored) / 18);
      ctx.fillStyle = ore[1];
      ctx.beginPath(); ctx.ellipse(cx + cw / 2, floor - ch, (cw / 2) * f, 9 * f, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = ore[2];
      ctx.beginPath(); ctx.arc(cx + cw / 2 + 4, floor - ch - 4 * f, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    label("$" + Fmt.money(s.stored * mult), cx + cw / 2, floor - ch - 18);
    // shaft number plate on the elevator side
    ctx.fillStyle = "#e9d8b0";
    rrect(tx0 + 2, floor - 52, 18, 14, 3);
    ctx.fill();
    ctx.fillStyle = "#3b2a1e";
    ctx.font = '900 9px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(s.i + 1), tx0 + 11, floor - 44.5);
    // manager standing by the crate
    if (s.manager) {
      const L = managerLook(s.manager);
      person(cx + cw + 8, floor, 1, t, L);
      if (s.manager.active > 0) ringFx(cx + cw + 8, floor - 16, t);
    }
    // miners
    const st = shaftStats(s.i, s.level);
    const start = CRATE_X + 50;
    for (const w of s.workers) {
      const walking = w.state === "walk" || w.state === "back";
      const dir = w.state === "back" ? -1 : 1;
      const k = w.k;
      const o = { walking, hat: "helmet", shirt: k % 2 ? "#d9622b" : "#e8822a", pants: "#2d3a5a", skin: SKIN[(k * 2 + s.i) % SKIN.length] };
      if (w.state === "idle") {
        // waiting at the crate for someone to tap
        person(start + k * 9, floor, -1, t, o);
        pickaxe(start + k * 9 - 2, floor - 14, -1, -0.5);
        continue;
      }
      person(w.x, floor, dir, t + k * 0.21, o);
      if (w.state === "dig") {
        const ph = (w.t / st.dig) * 4 * Math.PI * 2;
        const a = -0.9 + Math.max(0, Math.sin(ph)) * 2.0;
        pickaxe(w.x + 4, floor - 15, 1, a);
        if (Math.sin(ph) < -0.95 && Math.random() < 0.5) spark(w.x + 14, floor - 14 - Math.random() * 10, ore);
      } else if (w.state === "back") {
        sack(w.x + 4, floor - 22, ore, 1);
      } else {
        pickaxe(w.x - 2, floor - 14, 1, -0.5);
      }
    }
  }

  function ringFx(x, y, t) {
    ctx.strokeStyle = `rgba(125,255,176,${0.5 + Math.sin(t * 6) * 0.3})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 14 + Math.sin(t * 6) * 2, 0, Math.PI * 2); ctx.stroke();
  }

  function drawLocked(m, i, theme) {
    const top = shaftTop(i), floor = shaftFloor(i);
    const tx0 = ELEV_X + ELEV_W, ty0 = top + 30;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(tx0, ty0, FACE_X + 14 - tx0, floor - ty0 + 4);
    // boarded-up entrance
    ctx.fillStyle = "#6b4423";
    for (let k = 0; k < 3; k++) {
      ctx.save();
      ctx.translate(tx0 + 40, ty0 + 24 + k * 26);
      ctx.rotate(k % 2 ? 0.08 : -0.06);
      ctx.fillRect(-30, -5, 60, 10);
      ctx.restore();
    }
  }

  function spark(x, y, ore) {
    if (sparks.length > 80) return;
    sparks.push({ x, y, vx: -10 - Math.random() * 40, vy: -30 - Math.random() * 40, t: 0, c: Math.random() < 0.5 ? ore[1] : ore[2] });
  }

  function addFloat(text, x, y, color) {
    if (floats.length > 30) floats.shift();
    floats.push({ text, x, y, t: 0, color: color || "#7dff9a" });
  }

  // ---------------------------------------------------------------- frame

  // view: { s, x0, scroll, vw, vh }
  function draw(m, view, t, dt) {
    const theme = mineFor(m.mineIndex);
    if (rockKey !== m.mineIndex % MINES.length) { rockPat = makeRock(theme); rockKey = m.mineIndex % MINES.length; }
    const { s, x0, scroll, vw, vh } = view;
    const mult = m.mult();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.deep;
    ctx.fillRect(0, 0, vw, vh);

    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * x0, -dpr * scroll);
    const top = scroll / s, bottom = (scroll + vh) / s;
    const left = -x0 / s, right = (vw - x0) / s;

    // surface
    if (top < SURF) {
      drawSky(m, theme, Math.min(top, 0) - 10, bottom, left, right, t);
      ctx.fillStyle = "#5aa83a";
      ctx.fillRect(left, GROUND_Y - 2, right - left, 6);
    }
    // underground rock, everywhere below the grass, edge to edge
    ctx.fillStyle = rockPat;
    const ry = Math.max(GROUND_Y + 4, top - 2);
    ctx.fillRect(left, ry, right - left, bottom - ry + 2);
    // darken the sides so the playfield stands out on wide screens
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    if (left < 0) ctx.fillRect(left, ry, -left, bottom - ry + 2);
    if (right > W) ctx.fillRect(W, ry, right - W, bottom - ry + 2);
    // the deeper you go the darker it gets
    const dg = ctx.createLinearGradient(0, SURF, 0, SURF + MAX_SHAFTS * SHAFT_H);
    dg.addColorStop(0, "rgba(0,0,0,0)");
    dg.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = dg;
    ctx.fillRect(left, ry, right - left, bottom - ry + 2);

    // elevator column
    const n = m.shafts.length;
    const colBottom = shaftFloor(n - 1) + 10;
    if (top < colBottom) {
      ctx.fillStyle = "#0b0b0f";
      ctx.fillRect(ELEV_X, GROUND_Y, ELEV_W, colBottom - GROUND_Y);
      ctx.fillStyle = "#3f3f46";
      ctx.fillRect(ELEV_X + 2, GROUND_Y, 3, colBottom - GROUND_Y);
      ctx.fillRect(ELEV_X + ELEV_W - 5, GROUND_Y, 3, colBottom - GROUND_Y);
    }

    // shafts
    for (let i = 0; i < Math.min(n + 1, MAX_SHAFTS); i++) {
      const y0 = shaftTop(i);
      if (y0 > bottom || y0 + SHAFT_H < top) continue;
      if (i < n) drawShaft(m, m.shafts[i], theme, mult, t);
      else drawLocked(m, i, theme);
    }

    // surface things on top of the grass
    if (top < SURF) {
      drawHeadframe(m, t);
      drawStash(m, mult);
      drawWarehouse(m, theme, mult, t);
      drawTransporters(m, t);
      if (m.elevator.manager) {
        person(ELEV_X + ELEV_W + 24, GROUND_Y, -1, t, managerLook(m.elevator.manager));
        if (m.elevator.manager.active > 0) ringFx(ELEV_X + ELEV_W + 24, GROUND_Y - 16, t);
      }
      if (m.warehouse.manager) {
        person(DOCK_X + 84, GROUND_Y, -1, t, managerLook(m.warehouse.manager));
        if (m.warehouse.manager.active > 0) ringFx(DOCK_X + 84, GROUND_Y - 16, t);
      }
    }
    drawCage(m, mult);

    // chips and floating money
    for (let k = sparks.length - 1; k >= 0; k--) {
      const p = sparks[k];
      p.t += dt; p.vy += 220 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t > 0.6) { sparks.splice(k, 1); continue; }
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, 2, 2);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let k = floats.length - 1; k >= 0; k--) {
      const f = floats[k];
      f.t += dt;
      if (f.t > 1.4) { floats.splice(k, 1); continue; }
      ctx.globalAlpha = Math.min(1, (1.4 - f.t) * 2);
      ctx.font = '900 12px "Segoe UI", system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.strokeText(f.text, f.x, f.y - f.t * 26);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - f.t * 26);
      ctx.globalAlpha = 1;
    }
  }

  // Portrait for a DOM <canvas> (manager panels and buttons).
  function portraitTo(canvas, m, t = 0) {
    const g = canvas.getContext("2d");
    const save = ctx;
    ctx = g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    portrait(m, canvas.width / 2, canvas.height / 2, canvas.width / 2 - 2, t);
    ctx = save;
  }

  return { init, resize, draw, addFloat, portraitTo };
})();
