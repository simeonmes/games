"use strict";
// Squint avatars: 16x16 pixel blobs built from layers (body colour, eyes, mouth, hat), drawn
// in code. An avatar is stored as four numbers: [body, eyes, mouth, hat].

const Art = (() => {
  const INK = "#14182e";
  const BODIES = ["#e8433f", "#f58a2e", "#ffd23f", "#8fd14f", "#2f9e5b", "#2ec4b6", "#5ab0ff", "#3456d1", "#a56ee8", "#ff6b98", "#f2c48d", "#8a8fa8", "#8a5a3b", "#ffffff"];
  const EYES = [
    [[5, 7, "k"], [5, 8, "k"], [10, 7, "k"], [10, 8, "k"]],
    [[4, 7, "k"], [5, 8, "k"], [4, 9, "k"], [11, 7, "k"], [10, 8, "k"], [11, 9, "k"]],
    [[4, 8, "k"], [5, 7, "k"], [6, 8, "k"], [9, 8, "k"], [10, 7, "k"], [11, 8, "k"]],
    [[4, 7, "w"], [5, 7, "w"], [4, 8, "w"], [5, 8, "k"], [9, 7, "w"], [10, 7, "w"], [9, 8, "w"], [10, 8, "k"]],
    [[6, 6, "w"], [7, 6, "w"], [8, 6, "w"], [9, 6, "w"], [6, 7, "w"], [7, 7, "k"], [8, 7, "k"], [9, 7, "w"], [6, 8, "w"], [7, 8, "w"], [8, 8, "w"], [9, 8, "w"]],
    [[3, 7, "k"], [4, 7, "w"], [5, 7, "k"], [6, 7, "k"], [7, 7, "k"], [8, 7, "k"], [9, 7, "w"], [10, 7, "k"], [11, 7, "k"], [12, 7, "k"], [4, 8, "k"], [5, 8, "k"], [6, 8, "k"], [9, 8, "k"], [10, 8, "k"], [11, 8, "k"]],
    [[4, 8, "k"], [5, 8, "k"], [6, 8, "k"], [9, 8, "k"], [10, 8, "k"], [11, 8, "k"]],
    [[4, 7, "k"], [6, 7, "k"], [5, 8, "k"], [4, 9, "k"], [6, 9, "k"], [9, 7, "k"], [11, 7, "k"], [10, 8, "k"], [9, 9, "k"], [11, 9, "k"]],
    [[4, 6, "k"], [5, 7, "k"], [6, 7, "k"], [5, 8, "k"], [11, 6, "k"], [10, 7, "k"], [9, 7, "k"], [10, 8, "k"]],
    [[4, 7, "w"], [5, 7, "w"], [6, 7, "w"], [4, 8, "w"], [5, 8, "k"], [6, 8, "w"], [9, 7, "k"], [10, 7, "k"], [11, 7, "k"]],
  ];
  const MOUTHS = [
    [[5, 10, "k"], [6, 11, "k"], [7, 11, "k"], [8, 11, "k"], [9, 11, "k"], [10, 10, "k"]],
    [[6, 10, "k"], [7, 10, "k"], [8, 10, "k"], [9, 10, "k"], [6, 11, "k"], [7, 11, "r"], [8, 11, "r"], [9, 11, "k"], [7, 12, "k"], [8, 12, "k"]],
    [[6, 11, "k"], [7, 11, "k"], [8, 11, "k"], [9, 11, "k"]],
    [[5, 10, "k"], [6, 10, "k"], [7, 10, "k"], [8, 10, "k"], [9, 10, "k"], [10, 10, "k"], [5, 11, "k"], [6, 11, "w"], [7, 11, "w"], [8, 11, "w"], [9, 11, "w"], [10, 11, "k"], [6, 12, "k"], [7, 12, "k"], [8, 12, "k"], [9, 12, "k"]],
    [[6, 10, "k"], [7, 10, "k"], [8, 10, "k"], [9, 10, "k"], [7, 11, "p"], [8, 11, "p"]],
    [[6, 10, "k"], [7, 10, "k"], [8, 10, "k"], [9, 10, "k"], [6, 11, "w"], [9, 11, "w"]],
    [[7, 10, "k"], [8, 10, "k"], [6, 11, "k"], [9, 11, "k"], [7, 12, "k"], [8, 12, "k"]],
    [[5, 11, "k"], [6, 10, "k"], [7, 11, "k"], [8, 10, "k"], [9, 11, "k"], [10, 10, "k"]],
    [[5, 11, "k"], [6, 10, "k"], [7, 10, "k"], [8, 10, "k"], [9, 10, "k"], [10, 11, "k"]],
    [[7, 10, "k"], [8, 10, "k"], [7, 11, "k"], [8, 11, "k"]],
  ];
  const row = (y, xs, c) => xs.map(x => [x, y, c]);
  const HATS = [
    [],
    [[5, 1, "y"], [7, 1, "y"], [8, 1, "y"], [10, 1, "y"], ...row(2, [5, 6, 7, 8, 9, 10], "y"), ...row(3, [5, 6, 9, 10], "y"), [7, 3, "r"], [8, 3, "r"]],
    [[7, 1, "w"], [8, 1, "w"], ...row(2, [5, 6, 7, 8, 9, 10], "b"), ...row(3, [4, 5, 6, 7, 8, 9, 10, 11], "b"), ...row(4, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "w")],
    [[9, 2, "p"], [9, 3, "p"], [10, 2, "r"], [11, 2, "p"], [11, 3, "p"]],
    [...row(0, [4, 5, 6], "y"), ...row(0, [9, 10, 11], "b"), [7, 1, "k"], [8, 1, "k"], ...row(2, [6, 7, 8, 9], "r"), [5, 3, "r"], [6, 3, "y"], [7, 3, "r"], [8, 3, "y"], [9, 3, "r"], [10, 3, "y"]],
    [[7, 1, "g"], [7, 2, "g"], [5, 1, "l"], [6, 1, "l"], [8, 0, "l"], [9, 0, "l"]],
    [...row(0, [6, 7, 8, 9], "k"), ...row(1, [6, 7, 8, 9], "k"), ...row(2, [6, 7, 8, 9], "r"), ...row(3, [4, 5, 6, 7, 8, 9, 10, 11], "k")],
    [[3, 4, "o"], [4, 3, "o"], [5, 2, "o"], [6, 2, "o"], [7, 1, "o"], [8, 1, "o"], [9, 2, "o"], [10, 2, "o"], [11, 3, "o"], [12, 4, "o"]],
  ];
  const KEY = { k: INK, w: "#ffffff", r: "#e8433f", p: "#ff6b98", y: "#ffd23f", b: "#3456d1", g: "#2f9e5b", l: "#8fd14f", o: "#b5773f" };
  const PARTS = [BODIES.length, EYES.length, MOUTHS.length, HATS.length];
  const ROWS = { 3: [6, 9], 4: [4, 11], 5: [3, 12], 6: [2, 13], 7: [2, 13], 8: [2, 13], 9: [2, 13], 10: [2, 13], 11: [2, 13], 12: [2, 13], 13: [3, 12] };

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
  }

  const wrap = (n, i) => ((i % n) + n) % n;
  const norm = av => (Array.isArray(av) ? PARTS.map((n, i) => wrap(n, av[i] | 0)) : [0, 0, 0, 0]);

  function pixels(av) {
    const [b, e, m, h] = norm(av);
    const g = new Array(256).fill(null);
    const body = BODIES[b];
    const inBody = (x, y) => (ROWS[y] && x >= ROWS[y][0] && x <= ROWS[y][1]) || (y === 14 && (x === 4 || x === 5 || x === 10 || x === 11));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (inBody(x, y)) g[y * 16 + x] = !inBody(x + 1, y) || !inBody(x, y + 1) ? shade(body, -0.28) : body;
    for (const [x, y] of [[5, 5], [4, 6], [4, 7]]) g[y * 16 + x] = shade(body, 0.45);
    for (const set of [EYES[e], MOUTHS[m], HATS[h]]) for (const [x, y, c] of set) g[y * 16 + x] = KEY[c];
    const edge = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (g[y * 16 + x]) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < 16 && ny < 16 && g[ny * 16 + nx] && g[ny * 16 + nx] !== INK; })) edge.push(y * 16 + x);
    }
    for (const i of edge) g[i] = INK;
    return g;
  }

  function draw(canvas, av) {
    canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 16, 16);
    pixels(av).forEach((c, i) => { if (c) { ctx.fillStyle = c; ctx.fillRect(i % 16, (i / 16) | 0, 1, 1); } });
    return canvas;
  }

  const cache = new Map();
  function url(av) {
    const k = norm(av).join(",");
    if (!cache.has(k)) cache.set(k, draw(document.createElement("canvas"), av).toDataURL());
    return cache.get(k);
  }

  // Small pixel icons, one string per row.
  const GLYPHS = {
    pencil: ["......kk", ".....kyk", "....kyyk", "...kyyk.", "..kyyk..", ".kwyk...", ".kkk....", "........"],
    crown: ["........", "y..y..y.", "yy.yy.yy", "yyyyyyyy", "yyrryyyy", "yyyyyyyy", "........", "........"],
    brush: ["......kk", ".....kkk", "....kkk.", "...kkk..", "..kk....", ".kkk....", "kkk.....", "kk......"],
    fill: ["...k....", "..kwk...", ".kwwwk..", "kwwwwwk.", ".kwwwk.b", "..kwk.bb", "...k..bb", "........"],
    undo: ["..k.....", ".kk.....", "kkkkkk..", ".kk...k.", "..k...k.", "......k.", "...kkk..", "........"],
    clear: ["..kkkk..", "kkkkkkkk", ".k.k.k..", ".k.k.k..", ".k.k.k..", ".k.k.k..", ".kkkkk..", "........"],
    up: ["...kk...", "..kyyk..", ".kyyyyk.", "kyyyyyyk", "kkkyykkk", "..kyyk..", "..kyyk..", "..kkkk.."],
    down: ["..kkkk..", "..kyyk..", "..kyyk..", "kkkyykkk", "kyyyyyyk", ".kyyyyk.", "..kyyk..", "...kk..."],
    clock: ["..kkkk..", ".kwwwwk.", "kwwkwwwk", "kwwkwwwk", "kwwkkkwk", "kwwwwwwk", ".kwwwwk.", "..kkkk.."],
    die: ["kkkkkkkk", "kwwwwwwk", "kwkwwkwk", "kwwwwwwk", "kwwkkwwk", "kwkwwkwk", "kwwwwwwk", "kkkkkkkk"],
    sound: ["....k...", "...kk.k.", "kkkwk..k", "kwwwk.k.", "kwwwk.k.", "kkkwk..k", "...kk.k.", "....k..."],
    mute: ["....k...", "...kk...", "kkkwk.k.", "kwwwk..k", "kwwwk.k.", "kkkwk..k", "...kk...", "....k..."],
  };
  const GKEY = { k: "#eef2ff", w: "#ffffff", y: "#ffd23f", r: "#e8433f", b: "#3ba7ff" };
  const gcache = new Map();
  function glyph(name, ink) {
    const k = name + (ink || "");
    if (gcache.has(k)) return gcache.get(k);
    const rows = GLYPHS[name], c = document.createElement("canvas");
    c.width = 8; c.height = 8;
    const ctx = c.getContext("2d");
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === ".") return; ctx.fillStyle = ch === "k" ? (ink || GKEY.k) : GKEY[ch]; ctx.fillRect(x, y, 1, 1); }));
    const u = c.toDataURL();
    gcache.set(k, u);
    return u;
  }

  const random = () => PARTS.map((n, i) => (i === 3 && Math.random() < 0.5 ? 0 : Math.floor(Math.random() * n)));

  return { draw, url, glyph, random, norm, PARTS, BODIES, INK };
})();
