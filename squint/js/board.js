"use strict";
// The drawing canvas. Every browser in the room replays the same list of commands, so the
// strokes are drawn by hand into a pixel buffer with no anti-aliasing: that way a bucket fill
// floods exactly the same pixels on every screen.
//
//   [0, colour, size, x1, y1, x2, y2, begin]   brush line (begin = 1 on the first segment of a stroke)
//   [1, colour, x, y]                          bucket fill
//   [2]                                        clear

const Board = (() => {
  const W = 800, H = 600;
  // 13 light colours on top, their darker partners underneath.
  const COLORS = [
    "#ffffff", "#c4c4c4", "#ef3b3b", "#ff8c1a", "#ffe23f", "#3ccf4e", "#2fd1c1", "#3ba7ff", "#3a4fe0", "#a24ef0", "#ff7ac0", "#ffc89a", "#b5773f",
    "#000000", "#4d4d4d", "#8f1d1d", "#b54a0d", "#b8920f", "#1d6b2a", "#13786e", "#1d5c99", "#1c247a", "#5a1f8a", "#a3245e", "#c27b52", "#5b3417",
  ];
  const SIZES = [4, 10, 20, 32, 40];
  const RGBA = COLORS.map(h => {
    const n = parseInt(h.slice(1), 16);
    return (255 << 24 | (n & 255) << 16 | ((n >> 8) & 255) << 8 | (n >> 16)) >>> 0;   // little-endian ABGR
  });

  function create(canvas) {
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(W, H);
    const buf = new Uint32Array(img.data.buffer);
    let dirty = null, raf = 0;
    const log = [];

    function mark(x0, y0, x1, y1) {
      x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
      if (x0 >= x1 || y0 >= y1) return;
      if (!dirty) dirty = [x0, y0, x1, y1];
      else { dirty[0] = Math.min(dirty[0], x0); dirty[1] = Math.min(dirty[1], y0); dirty[2] = Math.max(dirty[2], x1); dirty[3] = Math.max(dirty[3], y1); }
      if (!raf) raf = requestAnimationFrame(flush);
    }
    function flush() {
      raf = 0;
      if (!dirty) return;
      const [x0, y0, x1, y1] = dirty;
      dirty = null;
      ctx.putImageData(img, 0, 0, x0, y0, x1 - x0, y1 - y0);
    }

    function wipe() { buf.fill(RGBA[0]); mark(0, 0, W, H); }

    // A round-ended thick line: every pixel whose centre is within the radius of the segment.
    function line(c, size, x1, y1, x2, y2) {
      const col = RGBA[c] ?? RGBA[13];
      const r = Math.max(1, size / 2), r2 = r * r;
      const minX = Math.max(0, Math.floor(Math.min(x1, x2) - r)), maxX = Math.min(W - 1, Math.ceil(Math.max(x1, x2) + r));
      const minY = Math.max(0, Math.floor(Math.min(y1, y2) - r)), maxY = Math.min(H - 1, Math.ceil(Math.max(y1, y2) + r));
      const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
      for (let y = minY; y <= maxY; y++) {
        const py = y + 0.5;
        let row = y * W;
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = px - (x1 + t * dx), ey = py - (y1 + t * dy);
          if (ex * ex + ey * ey <= r2) buf[row + x] = col;
        }
      }
      mark(minX, minY, maxX + 1, maxY + 1);
    }

    function fill(c, x, y) {
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const col = RGBA[c] ?? RGBA[13], target = buf[y * W + x];
      if (target === col) return;
      const stack = [x, y];
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      while (stack.length) {
        const sy = stack.pop(), sx = stack.pop();
        let l = sx;
        const row = sy * W;
        if (buf[row + l] !== target) continue;
        while (l > 0 && buf[row + l - 1] === target) l--;
        let r = sx;
        while (r < W - 1 && buf[row + r + 1] === target) r++;
        for (let i = l; i <= r; i++) buf[row + i] = col;
        if (l < x0) x0 = l; if (r > x1) x1 = r; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
        for (const ny of [sy - 1, sy + 1]) {
          if (ny < 0 || ny >= H) continue;
          const nrow = ny * W;
          let i = l;
          while (i <= r) {
            if (buf[nrow + i] === target) {
              stack.push(i, ny);
              while (i <= r && buf[nrow + i] === target) i++;
            } else i++;
          }
        }
      }
      mark(x0, y0, x1 + 1, y1 + 1);
    }

    function apply(cmd) {
      if (cmd[0] === 0) line(cmd[1], cmd[2], cmd[3], cmd[4], cmd[5], cmd[6]);
      else if (cmd[0] === 1) fill(cmd[1], cmd[2], cmd[3]);
      else if (cmd[0] === 2) wipe();
    }

    function add(cmds) { for (const c of cmds) { log.push(c); apply(c); } }
    function replace(cmds) { log.length = 0; wipe(); add(cmds); }
    function truncate(n) { const keep = log.slice(0, n); replace(keep); }

    wipe();
    return {
      add, replace, truncate,
      get length() { return log.length; },
      get log() { return log; },
      toPNG: () => canvas.toDataURL("image/png"),
    };
  }

  return { create, COLORS, SIZES, W, H };
})();
