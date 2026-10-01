// Materials, with textures painted in code on canvases (no image files to download).
// Each material has `tm`: how many metres one copy of its texture covers.
import * as THREE from "three";

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function canvas(w, h, paint) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  paint(g, w, h);
  return c;
}

function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Speckle a canvas with light and dark noise.
function grain(g, w, h, amt, n = 1) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (rnd() - 0.5) * amt * n;
    d[i] += v; d[i + 1] += v; d[i + 2] += v;
  }
  g.putImageData(img, 0, 0);
}

function blotches(g, w, h, color, count, size) {
  g.fillStyle = color;
  for (let i = 0; i < count; i++) {
    g.globalAlpha = 0.08 + rnd() * 0.18;
    g.beginPath();
    g.ellipse(rnd() * w, rnd() * h, size * (0.4 + rnd()), size * (0.3 + rnd() * 0.7), rnd() * 3, 0, 7);
    g.fill();
  }
  g.globalAlpha = 1;
}

const solid = (color, amt = 14) => canvas(128, 128, (g, w, h) => { g.fillStyle = color; g.fillRect(0, 0, w, h); grain(g, w, h, amt); });

function brick(base, mortar) {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = mortar; g.fillRect(0, 0, w, h);
    const bh = 16, bw = 48;
    for (let y = 0; y < h; y += bh) for (let x = -((y / bh) % 2) * bw / 2; x < w; x += bw) {
      const v = 0.8 + rnd() * 0.35;
      const c = new THREE.Color(base).multiplyScalar(v);
      g.fillStyle = `#${c.getHexString()}`;
      g.fillRect(x + 2, y + 2, bw - 3, bh - 3);
    }
    grain(g, w, h, 18);
  });
}

// A building wall: brick or concrete, with a grid of windows. Returns [colour, glow].
function facade(base, frame, kind) {
  const lit = [];
  const col = canvas(256, 256, (g, w, h) => {
    if (kind === "brick") g.drawImage(brick(base, "#5a4a44"), 0, 0);
    else { g.fillStyle = base; g.fillRect(0, 0, w, h); grain(g, w, h, 16); blotches(g, w, h, "#000", 12, 30); }
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const wx = x * 64 + 14, wy = y * 64 + 12;
      g.fillStyle = frame; g.fillRect(wx - 3, wy - 3, 42, 46);
      const on = rnd() < 0.45;
      lit.push([wx, wy, on]);
      g.fillStyle = on ? "#ffd9a0" : "#1d2433";
      g.fillRect(wx, wy, 36, 40);
      g.fillStyle = frame; g.fillRect(wx + 17, wy, 2, 40); g.fillRect(wx, wy + 19, 36, 2);
      if (!on && rnd() < 0.4) { g.fillStyle = "rgba(255,255,255,0.06)"; g.fillRect(wx + 2, wy + 2, 14, 16); }
    }
  });
  const glow = canvas(256, 256, (g) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, 256, 256);
    for (const [wx, wy, on] of lit) if (on) {
      g.fillStyle = rnd() < 0.2 ? "#9ad0ff" : "#ffcc88";
      g.fillRect(wx, wy, 36, 40);
    }
  });
  return [col, glow];
}

function planks(base, dark, n = 6, vertical = false) {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const s = h / n;
    for (let i = 0; i < n; i++) {
      const c = new THREE.Color(base).multiplyScalar(0.85 + rnd() * 0.3);
      g.fillStyle = `#${c.getHexString()}`;
      if (vertical) g.fillRect(i * s + 1, 0, s - 2, h); else g.fillRect(0, i * s + 1, w, s - 2);
      g.strokeStyle = dark; g.globalAlpha = 0.25;
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        const o = i * s + rnd() * s;
        if (vertical) { g.moveTo(o, 0); g.bezierCurveTo(o + 3, h / 3, o - 3, h * 0.6, o, h); }
        else { g.moveTo(0, o); g.bezierCurveTo(w / 3, o + 3, w * 0.6, o - 3, w, o); }
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = dark;
      if (vertical) g.fillRect(i * s, 0, 1.5, h); else g.fillRect(0, i * s, w, 1.5);
    }
    grain(g, w, h, 12);
  });
}

function corrugated(base) {
  return canvas(256, 256, (g, w, h) => {
    for (let x = 0; x < w; x++) {
      const v = 0.75 + 0.25 * Math.sin((x / w) * Math.PI * 2 * 12);
      const c = new THREE.Color(base).multiplyScalar(v);
      g.fillStyle = `#${c.getHexString()}`; g.fillRect(x, 0, 1, h);
    }
    blotches(g, w, h, "#6a3a1a", 10, 25);
    grain(g, w, h, 10);
  });
}

function stripes(a, b, n, angle = 0) {
  return canvas(128, 128, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h);
    g.save(); g.translate(w / 2, h / 2); g.rotate(angle); g.fillStyle = b;
    for (let i = -n; i < n; i += 2) g.fillRect((i * w) / n, -h, w / n, h * 2);
    g.restore();
    grain(g, w, h, 10);
  });
}

function rock(base, dark) {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    blotches(g, w, h, dark, 40, 26);
    blotches(g, w, h, "#ffffff", 14, 18);
    grain(g, w, h, 30);
  });
}

function grass() {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = "#4f9a3a"; g.fillRect(0, 0, w, h);
    blotches(g, w, h, "#7cc04a", 40, 22);
    blotches(g, w, h, "#2f6a2a", 30, 18);
    for (let i = 0; i < 900; i++) { g.fillStyle = rnd() < 0.5 ? "#8fd05a" : "#3a7a2e"; g.fillRect(rnd() * w, rnd() * h, 1.5, 3); }
  });
}

function grid(bg, line, n, w = 2) {
  return canvas(128, 128, (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = line;
    for (let i = 0; i <= n; i++) { g.fillRect((i * W) / n - w / 2, 0, w, H); g.fillRect(0, (i * H) / n - w / 2, W, w); }
    grain(g, W, H, 8);
  });
}

function lattice(color) {
  return canvas(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 7;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
  });
}

function windowsStrip(body, glass, rows = 1) {
  return canvas(256, 128, (g, w, h) => {
    g.fillStyle = body; g.fillRect(0, 0, w, h);
    g.fillStyle = glass;
    for (let r = 0; r < rows; r++) for (let x = 8; x < w - 20; x += 40) g.fillRect(x, 20 + r * 50, 32, 34);
    g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, h - 14, w, 14);
    grain(g, w, h, 8);
  });
}

function billboard() {
  return canvas(256, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#ff5a8a"); grad.addColorStop(1, "#ffb84a");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = "#fff"; g.font = "bold 44px sans-serif"; g.fillText("FIZZ UP!", 22, 70);
    g.font = "18px sans-serif"; g.fillText("the drink that goes higher", 26, 100);
    g.beginPath(); g.fillStyle = "#3ad0ff"; g.arc(212, 60, 28, 0, 7); g.fill();
  });
}

function mushroom() {
  return canvas(128, 128, (g, w, h) => {
    g.fillStyle = "#d8323f"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#fff6e8";
    for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(rnd() * w, rnd() * h, 6 + rnd() * 8, 0, 7); g.fill(); }
  });
}

function cracked(base) {
  return canvas(128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,0.8)"; g.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 50; y += (rnd() - 0.5) * 50; g.lineTo(x, y); }
      g.stroke();
    }
    grain(g, w, h, 8);
  });
}

function cardboard() {
  return canvas(128, 128, (g, w, h) => {
    g.fillStyle = "#b98a52"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#d8c08a"; g.fillRect(0, h / 2 - 8, w, 16);
    g.strokeStyle = "#6a4a2a"; g.lineWidth = 2; g.strokeRect(2, 2, w - 4, h - 4);
    grain(g, w, h, 14);
  });
}

function tvTex() {
  return canvas(128, 128, (g, w, h) => {
    g.fillStyle = "#222"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#2a3a4a"; g.fillRect(10, 12, w - 20, h - 40);
    for (let y = 12; y < h - 28; y += 3) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.15})`; g.fillRect(10, y, w - 20, 1); }
  });
}

function water() {
  return canvas(64, 256, (g, w, h) => {
    g.fillStyle = "#8fd8ff"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.5})`; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 10 + rnd() * 40); }
  });
}

function air() {
  return canvas(64, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.35})`; g.fillRect(rnd() * w, rnd() * h, 1.5, 10 + rnd() * 50); }
  });
}

function solarTex() {
  return canvas(128, 128, (g, w, h) => {
    g.fillStyle = "#1a2a6a"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#c8d0e0";
    for (let i = 0; i <= 8; i++) { g.fillRect((i * w) / 8 - 1, 0, 2, h); g.fillRect(0, (i * h) / 4 - 1, w, 2); }
  });
}

function foil() {
  return canvas(128, 128, (g, w, h) => {
    g.fillStyle = "#d8a83a"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(255,240,180,0.4)" : "rgba(120,80,20,0.35)"; g.beginPath(); g.moveTo(rnd() * w, rnd() * h); g.lineTo(rnd() * w, rnd() * h); g.lineTo(rnd() * w, rnd() * h); g.fill(); }
  });
}

// ------------------------------------------------------------------------------ the set

// cheap: simpler lighting (Lambert instead of physically based), for slow computers.
export function makeMaterials(cheap = false) {
  const M = {};
  const std = (name, map, o = {}) => {
    let m;
    if (cheap) {
      const { roughness, metalness, ...rest } = o.p || {};
      m = new THREE.MeshLambertMaterial({ map: map ? tex(map) : null, ...rest });
    } else m = new THREE.MeshStandardMaterial({ map: map ? tex(map) : null, roughness: 0.85, metalness: 0, ...o.p });
    if (o.color) m.color = new THREE.Color(o.color);
    m.userData.tm = o.tm || 2;
    M[name] = m;
    return m;
  };
  const glow = (name, color, intensity = 2.2) => {
    M[name] = cheap ? new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: intensity }) : new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
    M[name].userData.tm = 1;
  };

  // The slums
  for (const [i, base, frame, kind] of [[1, "#9a5a48", "#3a2a26", "brick"], [2, "#7a8088", "#2a2e36", "conc"], [3, "#b08a6a", "#4a3a2a", "brick"]]) {
    const [c, gl] = facade(base, frame, kind);
    const m = std("bldg" + i, c, { tm: 8 });
    m.emissiveMap = tex(gl); m.emissive = new THREE.Color("#ffffff"); m.emissiveIntensity = 1.3;
  }
  std("concrete", solid("#8a8a88", 22), { tm: 2 });
  std("roof", solid("#3a3a3e", 26), { tm: 3 });
  std("metal", stripes("#9aa4ac", "#808a92", 10), { tm: 1.5, p: { metalness: 0.5, roughness: 0.5 } });
  std("rust", rock("#8a4a2a", "#4a2410"), { tm: 1.5, p: { metalness: 0.3 } });
  std("crate", planks("#b8864a", "#5a3a1a", 5), { tm: 1.2 });
  std("tank", corrugated("#c8ccd0"), { tm: 3, p: { metalness: 0.4, roughness: 0.55 } });
  std("pipe", stripes("#6a7a6a", "#5a6a5a", 4), { tm: 1, p: { metalness: 0.4, roughness: 0.5 } });
  std("grille", grid("#2a2e33", "#6a7078", 8, 3), { tm: 1, p: { metalness: 0.6 } });
  std("signBack", solid("#2a2a30"), { tm: 2, p: { metalness: 0.6, roughness: 0.4 } });
  glow("neonPink", "#ff3aa0");
  glow("neonCyan", "#3af0ff");
  glow("neonYellow", "#ffd23a");
  std("billboard", billboard(), { tm: 8 });
  M.billboard.emissiveMap = M.billboard.map; M.billboard.emissive = new THREE.Color("#ffffff"); M.billboard.emissiveIntensity = 0.5;
  std("dumpster", stripes("#2a6a4a", "#22583c", 6), { tm: 1.5, p: { metalness: 0.4 } });
  std("sofa", solid("#7a3a5a", 30), { tm: 1 });
  std("black", solid("#1a1a1c"), { tm: 1 });
  std("door", planks("#5a3a2a", "#2a1a10", 4, true), { tm: 1 });
  std("brick", brick("#9a5a48", "#5a4a44"), { tm: 3 });

  // Construction
  std("girder", stripes("#e8b020", "#d09a10", 2), { tm: 2, p: { metalness: 0.4, roughness: 0.5 } });
  std("cont1", corrugated("#c84a2a"), { tm: 3, p: { metalness: 0.3 } });
  std("cont2", corrugated("#2a6ab0"), { tm: 3, p: { metalness: 0.3 } });
  std("cont3", corrugated("#3a9a5a"), { tm: 3, p: { metalness: 0.3 } });
  std("plank", planks("#c8a06a", "#6a4a2a", 4), { tm: 1.5 });
  std("scaffold", solid("#b8bcc0"), { tm: 1, p: { metalness: 0.7, roughness: 0.3 } });
  std("concretePipe", rock("#a8a49c", "#6a665e"), { tm: 2 });
  std("pallet", planks("#d0aa70", "#7a5a30", 6, true), { tm: 1.2 });
  std("bags", solid("#e0d8c8", 20), { tm: 1 });
  std("cable", solid("#202024"), { tm: 1, p: { metalness: 0.6 } });
  const lat = std("lattice", lattice("#e8b020"), { tm: 2, p: { metalness: 0.4, roughness: 0.5 } });
  lat.transparent = false; lat.alphaTest = 0.5; lat.side = THREE.DoubleSide;

  // Floating isles
  std("grass", grass(), { tm: 3 });
  std("dirt", rock("#7a5a3a", "#4a3020"), { tm: 2 });
  std("rock", rock("#8a8278", "#5a544a"), { tm: 3, p: { flatShading: true } });
  std("bark", planks("#6a4a30", "#3a2818", 8, true), { tm: 1.5 });
  std("leaf", null, { color: "#4a9a3a", p: { flatShading: true, roughness: 0.9 } });
  std("leaf2", null, { color: "#6ab84a", p: { flatShading: true, roughness: 0.9 } });
  std("flowerR", null, { color: "#ff5a6a" });
  std("flowerY", null, { color: "#ffd84a" });
  std("flowerW", null, { color: "#ffffff" });
  std("mushroom", mushroom(), { tm: 1.5, p: { roughness: 0.5 } });
  std("stem", solid("#f0e6d0", 10), { tm: 1 });
  std("plankOld", planks("#9a7a5a", "#4a3a2a", 4), { tm: 1.5 });
  const wat = std("water", water(), { tm: 3, p: { transparent: true, opacity: 0.75, roughness: 0.1, emissive: new THREE.Color("#4aa8e0"), emissiveIntensity: 0.4 } });
  wat.userData.flow = 0.8; wat.depthWrite = false;

  // Junkyard
  for (const [n, c] of [["paintRed", "#c8302a"], ["paintBlue", "#2a5ac8"], ["paintTeal", "#2aa89a"], ["paintWhite", "#e8e8ea"], ["paintYellow", "#e8b82a"]]) std(n, null, { color: c, p: { metalness: 0.5, roughness: 0.3 } });
  std("carGlass", null, { color: "#1a2a3a", p: { metalness: 0.8, roughness: 0.15 } });
  std("tire", solid("#1c1c1e", 8), { tm: 1, p: { roughness: 0.95 } });
  std("bus", windowsStrip("#e8b82a", "#2a3a4a"), { tm: 5, p: { metalness: 0.2, roughness: 0.5 } });
  std("train", windowsStrip("#b8c0c8", "#1a2a3a"), { tm: 6.5, p: { metalness: 0.6, roughness: 0.35 } });
  std("fridge", solid("#f0f0f2", 8), { tm: 1, p: { roughness: 0.3 } });
  std("chrome", null, { color: "#d8dce0", p: { metalness: 1, roughness: 0.2 } });
  std("tv", tvTex(), { tm: 1.2 });
  std("cardboard", cardboard(), { tm: 1.2 });
  std("fanBase", grid("#5a6068", "#3a3e44", 4, 3), { tm: 2, p: { metalness: 0.6, roughness: 0.4 } });
  std("conveyor", stripes("#2a2a2c", "#3e3e42", 8), { tm: 2, p: { roughness: 0.9 } });
  M.conveyor.userData.flow = 1.6; M.conveyor.userData.flowX = true;
  const airM = new THREE.MeshBasicMaterial({ map: tex(air()), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  airM.userData.tm = 3; airM.userData.flow = -6;
  M.air = airM;

  // Ice peaks
  std("ice", null, { color: "#bfe6ff", p: { roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88, emissive: new THREE.Color("#3a7ab0"), emissiveIntensity: 0.25 } });
  std("iceCrack", cracked("#a8d8f8"), { tm: 1.4, p: { roughness: 0.15, emissive: new THREE.Color("#3a7ab0"), emissiveIntensity: 0.3 } });
  std("snow", solid("#f4f8ff", 10), { tm: 2, p: { roughness: 1 } });
  std("iceRock", rock("#6a7a90", "#3a4a60"), { tm: 3, p: { flatShading: true } });
  std("plankIce", planks("#b8c8d8", "#6a7a8a", 4), { tm: 1.5 });

  // Space
  std("asteroid", rock("#5a5450", "#2a2624"), { tm: 3, p: { flatShading: true } });
  std("station", grid("#e8eaee", "#b0b4bc", 4, 2), { tm: 3, p: { metalness: 0.3, roughness: 0.45 } });
  std("panelWalk", grid("#3a3e48", "#6a7080", 10, 2), { tm: 1, p: { metalness: 0.6 } });
  std("solar", solarTex(), { tm: 2.2, p: { metalness: 0.7, roughness: 0.25 } });
  std("gold", foil(), { tm: 1.5, p: { metalness: 0.9, roughness: 0.35 } });

  // Characters and collectibles
  std("duck", null, { color: "#ffd23a", p: { roughness: 0.35, emissive: new THREE.Color("#ffb000"), emissiveIntensity: 0.35 } });
  std("beak", null, { color: "#ff8a1a", p: { roughness: 0.4 } });
  std("flagOn", null, { color: "#3ad06a", p: { emissive: new THREE.Color("#3ad06a"), emissiveIntensity: 0.6 } });
  std("flagOff", null, { color: "#d8d8d8" });
  return M;
}
