"use strict";
// "Play your own music": players pick audio files from their own device and the game plays
// them while they climb. The files are kept in this browser (IndexedDB) so they don't have
// to be picked again, and are never uploaded anywhere.
//
// With several songs, the chapter is split into equal stretches of rooms and each stretch
// gets the next song, fading between them, so the music changes as you climb.

const Music = {
  tracks: [],          // { id, name, url }
  audio: null,
  cur: -1,
  volume: 0.6,
  muted: false,
  ducked: false,
  fadeTimer: null,
  db: null,

  async init() {
    this.audio = new Audio();
    this.audio.loop = true;
    try {
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("celesteFanMusic", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("tracks", { keyPath: "id", autoIncrement: true });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const rows = await this.tx("readonly", (s) => s.getAll());
      this.tracks = rows.map((r) => ({ id: r.id, name: r.name, url: URL.createObjectURL(r.blob) }));
    } catch (e) {
      this.db = null;   // private window etc.: songs work for this visit only
    }
    if (this.onChange) this.onChange();
  },

  tx(mode, fn) {
    return new Promise((resolve, reject) => {
      const t = this.db.transaction("tracks", mode);
      const req = fn(t.objectStore("tracks"));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
    });
  },

  async add(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith("audio/") || /\.(mp3|ogg|oga|m4a|aac|wav|flac|opus|webm)$/i.test(f.name));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const f of files) {
      const name = f.name.replace(/\.[^.]+$/, "");
      let id = Math.random();
      if (this.db) {
        try { id = await this.tx("readwrite", (s) => s.add({ name, blob: f })); } catch (e) { /* storage full: keep for this visit */ }
      }
      this.tracks.push({ id, name, url: URL.createObjectURL(f) });
    }
    if (this.onChange) this.onChange();
    return files.length;
  },

  async clear() {
    this.stop();
    for (const t of this.tracks) URL.revokeObjectURL(t.url);
    this.tracks = [];
    if (this.db) { try { await this.tx("readwrite", (s) => s.clear()); } catch (e) { /* ignore */ } }
    if (this.onChange) this.onChange();
  },

  target() { return this.muted ? 0 : this.volume * (this.ducked ? 0.35 : 1); },

  // Pick the song for this room and fade to it if it's a different one.
  playFor(roomIndex, roomCount) {
    if (!this.tracks.length) return;
    const n = this.tracks.length;
    const idx = Math.min(n - 1, Math.floor((roomIndex * n) / roomCount));
    if (idx === this.cur && !this.audio.paused) { this.fadeTo(this.target()); return; }
    const start = () => {
      this.cur = idx;
      this.audio.src = this.tracks[idx].url;
      this.audio.volume = 0;
      this.audio.play().catch(() => {});
      this.fadeTo(this.target());
    };
    if (this.cur >= 0 && !this.audio.paused) this.fadeTo(0, start);
    else start();
  },

  stop() {
    if (!this.audio) return;
    this.fadeTo(0, () => { this.audio.pause(); this.cur = -1; });
  },

  duck(on) { this.ducked = on; if (this.cur >= 0) this.fadeTo(this.target()); },
  setVolume(v) { this.volume = v; if (this.cur >= 0) this.audio.volume = this.target(); },
  setMuted(m) { this.muted = m; if (this.audio && this.cur >= 0) this.audio.volume = this.target(); },

  fadeTo(v, done) {
    clearInterval(this.fadeTimer);
    const a = this.audio;
    this.fadeTimer = setInterval(() => {
      const d = v - a.volume;
      if (Math.abs(d) < 0.03) {
        a.volume = v;
        clearInterval(this.fadeTimer);
        if (done) done();
        return;
      }
      a.volume = Math.max(0, Math.min(1, a.volume + Math.sign(d) * 0.03));
    }, 30);
  },
};
