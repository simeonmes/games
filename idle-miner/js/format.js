"use strict";
// Money and time as short text: 950, 12.4K, 3.21M, ... then aa, ab, ac like the real game.

const Fmt = (() => {
  const NAMES = ["", "K", "M", "B", "T"];
  function suffix(k) {
    if (k < NAMES.length) return NAMES[k];
    const n = k - NAMES.length; // 0 -> aa
    return String.fromCharCode(97 + Math.floor(n / 26) % 26) + String.fromCharCode(97 + (n % 26));
  }
  function money(v) {
    if (!isFinite(v)) return "∞";
    if (v < 1000) return v < 10 && v % 1 ? v.toFixed(1).replace(/\.0$/, "") : String(Math.floor(v));
    const k = Math.floor(Math.log10(v) / 3);
    const x = v / Math.pow(1000, k);
    return (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)) + suffix(k);
  }
  function time(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}:${String(s).padStart(2, "0")}`;
    return `${s}s`;
  }
  return { money, time };
})();

if (typeof module !== "undefined") module.exports = { Fmt };
