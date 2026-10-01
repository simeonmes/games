// Skyward: the game. Ties the physics, course, scene, climber, controls, sound and menus
// together, runs the main loop and keeps the save.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { World, Player, P } from "./physics.js";
import { buildCourse, ZONES, zoneAt, TOP_Y } from "./course.js";
import { makeMaterials } from "./materials.js";
import { Scene3D } from "./scene.js";
import { Climber, makeDuck, makeFlag } from "./character.js";
import { Input } from "./input.js";
import { Audio } from "./audio.js";

const $ = (id) => document.getElementById(id);
const SAVE_KEY = "skyward.save.v1", SETTINGS_KEY = "skyward.settings.v1";
const STEP = 1 / 120;
const touchDevice = matchMedia("(pointer: coarse)").matches;

const fmtTime = (t) => {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
};

const Game = {
  state: "title",      // title | play | paused | end
  settings: null,
  save: null,

  init() {
    this.loadSettings();
    this.loadSave();
    const canvas = $("view");
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.settings.quality !== "low", powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.1, 5000);

    this.course = buildCourse();
    this.world = new World(this.course);
    this.M = makeMaterials();
    this.view = new Scene3D(this.renderer, this.course, this.M);
    this.topCollider = this.course.colliders[this.course.route[this.course.route.length - 1]];

    this.climber = new Climber();
    this.view.scene.add(this.climber.root);
    this.ducks = this.course.ducks.map((d, i) => {
      const m = makeDuck(this.M);
      m.position.set(d.x, d.y + 0.35, d.z);
      m.visible = !this.save.ducks.includes(i);
      this.view.scene.add(m);
      return m;
    });
    this.flags = this.course.checkpoints.map((c) => {
      const f = makeFlag(this.M);
      f.position.set(c.x, c.y, c.z);
      this.view.scene.add(f);
      return f;
    });

    const s = this.save;
    this.player = new Player(this.world, s.pos ? s.pos[0] : this.course.start.x, s.pos ? s.pos[1] : this.course.start.y, s.pos ? s.pos[2] : this.course.start.z);
    this.player.facing = s.pos ? s.pos[3] : this.course.start.facing;
    this.prev = new THREE.Vector3(this.player.x, this.player.y, this.player.z);
    this.cam = { yaw: this.player.facing + Math.PI, pitch: 0.28, dist: 6, d: 6, target: new THREE.Vector3(this.player.x, this.player.y + 1.4, this.player.z) };
    this.airPeak = this.player.y;
    this.acc = 0;
    this.zoneId = zoneAt(this.player.y).id;

    this.setupComposer();
    this.applySettings();
    Input.init(canvas, { pad: $("touchPad"), stick: $("stick"), knob: $("knob"), jump: $("btnJump"), sprint: $("btnSprint") });
    Input.onPause = () => { if (this.state === "play") this.pause(true); else if (this.state === "paused") this.pause(false); };
    Input.onRespawn = () => this.toCheckpoint();
    this.bindUI();
    addEventListener("resize", () => this.resize());
    this.resize();
    document.addEventListener("pointerlockchange", () => { if (!document.pointerLockElement && this.state === "play" && !touchDevice) this.pause(true); });
    document.addEventListener("visibilitychange", () => { if (document.hidden && this.state === "play") this.pause(true); });
    addEventListener("beforeunload", () => this.writeSave());
    this.showTitle();
    $("loading").classList.add("hidden");
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  },

  // ------------------------------------------------------------------ settings and save

  loadSettings() {
    const def = { quality: touchDevice ? "medium" : "high", sens: 1, invertY: false, fov: 70, easy: false, music: 0.5, sfx: 0.8, timer: true };
    try { this.settings = Object.assign(def, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); } catch (e) { this.settings = def; }
  },
  writeSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* ignore */ } },

  emptySave() { return { pos: null, time: 0, falls: 0, biggest: 0, best: 0, ducks: [], cp: -1, finished: false, bestTime: null, seen: [], runs: 0 }; },
  loadSave() {
    try { this.save = Object.assign(this.emptySave(), JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) { this.save = this.emptySave(); }
    if (!Array.isArray(this.save.ducks)) this.save.ducks = [];
    if (!Array.isArray(this.save.seen)) this.save.seen = [];
  },
  writeSave() {
    const p = this.player;
    if (p && this.started) this.save.pos = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.facing.toFixed(2)];
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* ignore */ }
  },

  setupComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.view.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  },

  applySettings() {
    const st = this.settings;
    const q = st.quality;
    this.pixelRatio = Math.min(devicePixelRatio || 1, q === "high" ? 2 : q === "medium" ? 1.5 : 1);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.view.setShadows(q === "high" ? 2048 : q === "medium" ? 1024 : 0);
    this.useBloom = q === "high";
    this.camera.fov = st.fov;
    this.camera.updateProjectionMatrix();
    Input.sens = st.sens; Input.invertY = st.invertY;
    Audio.setVolumes(st.sfx, st.music);
    for (const f of this.flags) f.visible = st.easy;
    $("hudTimer").hidden = !st.timer;
    $("cpHint").hidden = !st.easy;
    $("cpBtn").hidden = !st.easy;
    this.resize();
  },

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  },

  // ------------------------------------------------------------------ menus

  show(id) {
    for (const s of ["title", "pause", "settings", "end", "help"]) $(s).classList.toggle("hidden", s !== id);
    $("hud").classList.toggle("hidden", !(this.state === "play" || this.state === "paused"));
    $("touch").classList.toggle("hidden", !(touchDevice && this.state === "play" && id === null));
  },

  showTitle() {
    this.state = "title";
    Input.enabled = false;
    const s = this.save;
    const going = s.pos && (s.time > 1 || s.best > 15);
    $("playBtn").textContent = going ? "Continue" : "Start climbing";
    $("newBtn").hidden = !going;
    $("titleStats").innerHTML = going
      ? `Best height <b>${Math.floor(s.best)} m</b> · Time <b>${fmtTime(s.time)}</b> · Falls <b>${s.falls}</b> · Ducks <b>${s.ducks.length} / ${this.course.ducks.length}</b>` + (s.bestTime ? `<br>Reached the top in <b>${fmtTime(s.bestTime)}</b>` : "")
      : "";
    this.show("title");
  },

  start(fresh) {
    Audio.init();
    if (fresh) {
      const keep = { bestTime: this.save.bestTime, runs: (this.save.runs || 0) + 1 };
      this.save = Object.assign(this.emptySave(), keep);
      const st = this.course.start;
      this.player.reset(st.x, st.y, st.z);
      this.player.facing = st.facing;
      this.cam.yaw = st.facing + Math.PI;
      this.ducks.forEach((d) => (d.visible = true));
      this.endShown = false;
    }
    this.started = true;
    this.airPeak = this.player.y;
    this.prev.set(this.player.x, this.player.y, this.player.z);
    this.cam.target.set(this.player.x, this.player.y + 1.4, this.player.z);
    this.zoneId = zoneAt(this.player.y).id;
    this.state = "play";
    Input.enabled = true;
    this.show(null);
    if (!touchDevice) $("view").requestPointerLock?.();
    if (!this.save.seen.includes(this.zoneId)) this.zoneBanner(zoneAt(this.player.y));
    this.writeSave();
  },

  pause(on) {
    if (on) {
      this.state = "paused";
      Input.enabled = false;
      if (document.pointerLockElement) document.exitPointerLock();
      this.writeSave();
      this.show("pause");
    } else {
      this.state = "play";
      Input.enabled = true;
      this.show(null);
      if (!touchDevice) $("view").requestPointerLock?.();
    }
  },

  bindUI() {
    $("playBtn").onclick = () => this.start(false);
    $("newBtn").onclick = () => { if (confirm("Start a new climb from the bottom? Your best height and best time are kept.")) this.start(true); };
    $("resumeBtn").onclick = () => this.pause(false);
    $("menuBtn").onclick = () => { this.writeSave(); this.showTitle(); };
    $("helpBtn").onclick = () => this.show("help");
    $("helpBack").onclick = () => this.showTitle();
    $("cpBtn").onclick = () => { this.pause(false); this.toCheckpoint(); };
    for (const b of document.querySelectorAll(".openSettings")) b.onclick = () => this.openSettings(b.dataset.from);
    $("setBack").onclick = () => this.closeSettings();
    $("endKeep").onclick = () => { this.state = "play"; Input.enabled = true; this.show(null); if (!touchDevice) $("view").requestPointerLock?.(); };
    $("endMenu").onclick = () => this.showTitle();
  },

  openSettings(from) {
    this.settingsFrom = from;
    const st = this.settings;
    $("sQuality").value = st.quality; $("sSens").value = st.sens; $("sInvert").checked = st.invertY; $("sFov").value = st.fov;
    $("sEasy").checked = st.easy; $("sMusic").value = st.music; $("sSfx").value = st.sfx; $("sTimer").checked = st.timer;
    this.show("settings");
  },

  closeSettings() {
    const st = this.settings;
    st.quality = $("sQuality").value; st.sens = +$("sSens").value; st.invertY = $("sInvert").checked; st.fov = +$("sFov").value;
    st.easy = $("sEasy").checked; st.music = +$("sMusic").value; st.sfx = +$("sSfx").value; st.timer = $("sTimer").checked;
    this.writeSettings();
    this.applySettings();
    if (this.settingsFrom === "pause") this.show("pause"); else this.showTitle();
  },

  // ------------------------------------------------------------------ gameplay

  toCheckpoint() {
    if (!this.settings.easy || this.state !== "play") return;
    const cp = this.course.checkpoints[this.save.cp];
    const p = this.player;
    if (cp) p.reset(cp.x, cp.y + 0.05, cp.z);
    else { const st = this.course.start; p.reset(st.x, st.y, st.z); }
    this.prev.set(p.x, p.y, p.z);
    this.airPeak = p.y;
    this.toast(cp ? "Back to your checkpoint" : "Back to the start");
  },

  toast(text, big) {
    const el = $("toast");
    el.textContent = text;
    el.classList.toggle("big", !!big);
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  },

  zoneBanner(z) {
    if (!this.save.seen.includes(z.id)) this.save.seen.push(z.id);
    const el = $("banner");
    $("bannerName").textContent = z.name;
    $("bannerSub").textContent = `${Math.max(0, Math.round(z.from))} m`;
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    Audio.play({ type: "zone" });
  },

  stepGame(inp) {
    const p = this.player;
    // Camera-relative movement.
    const yaw = this.cam.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const mx = fx * inp.fy + rx * inp.fx, mz = fz * inp.fy + rz * inp.fx;
    this.prev.set(p.x, p.y, p.z);
    this.world.update(STEP);
    p.step({ mx, mz, jump: inp.jump, jumpPressed: inp.jumpPressed, sprint: inp.sprint }, STEP);
    inp.jumpPressed = false;

    if (!p.ground && !p.zip && !p.mantle) this.airPeak = Math.max(this.airPeak, p.y);
    for (const e of p.events) {
      if (e.type === "land" || (e.type === "bounce")) this.landed(e);
      Audio.play(e);
    }
    if ((p.ground || p.zip || p.mantle) && !p.events.some((e) => e.type === "land")) {
      if (p.ground && this.airPeak - p.y > 12) this.landed({ type: "land", v: 20, c: p.ground });
      this.airPeak = p.y;
    }
    p.events.length = 0;
    this.save.best = Math.max(this.save.best, p.y);
  },

  landed(e) {
    const p = this.player, fall = this.airPeak - p.y;
    this.airPeak = p.y;
    if (fall > 12) {
      this.save.falls++;
      this.save.biggest = Math.max(this.save.biggest, fall);
      const f = Math.round(fall);
      const line = fall > 150 ? `Fell ${f} m. Oof.` : fall > 60 ? `Fell ${f} m` : `Fell ${f} m`;
      this.toast(line, fall > 60);
      Audio.play({ type: "fall" });
    }
    // The street: back up to the starting rooftop.
    if (e.c && e.c.ground) {
      setTimeout(() => {
        if (this.player.ground && this.player.ground.ground) {
          const st = this.course.start;
          this.player.reset(st.x, st.y, st.z);
          this.prev.set(st.x, st.y, st.z);
          this.airPeak = st.y;
          this.toast("Back on the rooftop");
        }
      }, 1200);
    }
  },

  updateCollectibles(dt) {
    const p = this.player, t = performance.now() / 1000;
    this.ducks.forEach((d, i) => {
      if (!d.visible) return;
      d.rotation.y += dt * 1.2;
      const base = this.course.ducks[i].y + 0.35;
      d.position.y = base + Math.sin(t * 2 + i) * 0.08;
      if (Math.hypot(d.position.x - p.x, base - (p.y + 0.6), d.position.z - p.z) < 1.3) {
        d.visible = false;
        this.save.ducks.push(i);
        Audio.play({ type: "duck" });
        this.toast(`Rubber duck! ${this.save.ducks.length} / ${this.ducks.length}`, true);
        this.writeSave();
      }
    });
    if (this.settings.easy && p.ground) {
      this.course.checkpoints.forEach((c, i) => {
        if (i > this.save.cp && Math.hypot(c.x - p.x, c.z - p.z) < 3 && Math.abs(c.y - p.y) < 1) {
          this.save.cp = i;
          Audio.play({ type: "checkpoint" });
          this.toast("Checkpoint");
        }
      });
      this.flags.forEach((f, i) => { f.userData.flag.material = i <= this.save.cp ? this.M.flagOn : this.M.flagOff; });
    }
    // The top!
    if (p.ground === this.topCollider && !this.endShown) this.finish();
  },

  finish() {
    this.endShown = true;
    const s = this.save;
    const first = !s.finished, prevBest = s.bestTime;
    s.finished = true;
    if (!s.bestTime || s.time < s.bestTime) s.bestTime = s.time;
    this.writeSave();
    Audio.play({ type: "finish" });
    setTimeout(() => {
      this.state = "end";
      Input.enabled = false;
      if (document.pointerLockElement) document.exitPointerLock();
      $("endStats").innerHTML =
        `Time <b>${fmtTime(s.time)}</b><br>Falls <b>${s.falls}</b><br>Biggest fall <b>${Math.round(s.biggest)} m</b><br>Rubber ducks <b>${s.ducks.length} / ${this.ducks.length}</b>` +
        (prevBest ? (s.time < prevBest ? `<br><small>New best time! (was ${fmtTime(prevBest)})</small>` : `<br><small>Best time ${fmtTime(prevBest)}</small>`) : "");
      $("endTitle").textContent = first ? "You made it to the top." : "The top, again.";
      this.show("end");
    }, 2200);
  },

  updateCamera(dt, inp, alpha) {
    const c = this.cam, p = this.player;
    if (inp) {
      c.yaw -= inp.lookX;
      c.pitch = Math.max(-0.45, Math.min(1.25, c.pitch + inp.lookY));
      c.dist = Math.max(2.5, Math.min(11, c.dist + inp.zoom));
    }
    const px = this.prev.x + (p.x - this.prev.x) * alpha, py = this.prev.y + (p.y - this.prev.y) * alpha, pz = this.prev.z + (p.z - this.prev.z) * alpha;
    const want = new THREE.Vector3(px, py + 1.45, pz);
    // Follow closely sideways, a little loosely up and down.
    const kx = 1 - Math.pow(0.0005, dt), ky = 1 - Math.pow(0.02, dt);
    c.target.x += (want.x - c.target.x) * kx; c.target.z += (want.z - c.target.z) * kx;
    c.target.y += (want.y - c.target.y) * ky;
    if (Math.abs(want.y - c.target.y) > 6) c.target.y = want.y - Math.sign(want.y - c.target.y) * 6;
    const dir = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
    const hit = this.world.raycast(c.target.x, c.target.y, c.target.z, dir.x, dir.y, dir.z, c.dist + 0.3);
    const d = Math.max(0.5, Math.min(c.dist, hit - 0.3));
    c.d = d < c.d ? d : c.d + (d - c.d) * (1 - Math.pow(0.05, dt));
    this.camera.position.copy(c.target).addScaledVector(dir, c.d);
    if (this.camera.position.y < 0.4) this.camera.position.y = 0.4;
    this.camera.lookAt(c.target);
    // Fade the climber out when the camera is right on top of them.
    this.climber.root.visible = c.d > 0.9;
  },

  titleCamera(dt) {
    const t = performance.now() / 1000, st = this.course.start;
    const a = t * 0.05;
    this.camera.position.set(st.x + Math.sin(a) * 22, st.y + 9, st.z + Math.cos(a) * 22);
    this.camera.lookAt(st.x * 0.4, st.y + 30, st.z * 0.4);
  },

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const p = this.player;
    let inp = null;
    if (this.state === "play") {
      inp = Input.frame(dt);
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 8) {
        this.stepGame(inp);
        this.acc -= STEP; n++;
      }
      if (n === 8) this.acc = 0;
      if (!this.endShown) this.save.time += dt;
      this.updateCollectibles(dt);
      const z = zoneAt(p.y);
      if (z.id !== this.zoneId) {
        const up = ZONES.indexOf(z) > ZONES.findIndex((x) => x.id === this.zoneId);
        this.zoneId = z.id;
        if (up && !this.save.seen.includes(z.id)) this.zoneBanner(z);
      }
      if ((this.saveT = (this.saveT || 0) + dt) > 3) { this.saveT = 0; this.writeSave(); }
    } else if (this.state === "end") {
      this.world.update(dt);
    } else if (this.state === "title") {
      this.world.update(dt);
    }

    const alpha = this.state === "play" ? this.acc / STEP : 1;
    if (this.state === "title") this.titleCamera(dt);
    else this.updateCamera(dt, inp, alpha);

    // The climber's model.
    const r = this.climber.root;
    r.position.set(this.prev.x + (p.x - this.prev.x) * alpha, this.prev.y + (p.y - this.prev.y) * alpha, this.prev.z + (p.z - this.prev.z) * alpha);
    let dr = p.facing - r.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    r.rotation.y += dr * (1 - Math.pow(0.0002, dt));
    const sp = Math.hypot(p.vx, p.vz);
    const st = p.mantle ? "mantle" : p.zip ? "zip" : p.ground ? (sp > 0.6 ? "run" : "idle") : p.vy < -16 ? "fall" : "air";
    const before = this.climber.phase;
    this.climber.animate(dt, this.state === "title" ? "idle" : st, sp, p.vy);
    if (st === "run" && Math.floor(before / Math.PI) !== Math.floor(this.climber.phase / Math.PI)) Audio.play({ type: "step", soft: p.ground && /grass|snow|dirt|sofa/.test(p.ground.m || "") });

    this.view.update(dt, this.camera, this.state === "title" ? new THREE.Vector3(this.course.start.x, this.course.start.y, this.course.start.z) : r.position);
    Audio.update({ y: p.y, vy: p.vy, zone: this.state === "title" ? "slums" : zoneAt(p.y).id, rain: this.view.A ? this.view.A.rain : 0, zip: !!p.zip });
    if (this.state === "play" || this.state === "paused") this.hud();

    if (this.useBloom) this.composer.render(dt);
    else this.renderer.render(this.view.scene, this.camera);
    requestAnimationFrame((t) => this.frame(t));
  },

  hud() {
    const p = this.player, s = this.save;
    const h = Math.max(0, Math.floor(p.y));
    if (h !== this._h) { this._h = h; $("hudHeight").textContent = h + " m"; }
    $("hudBar").style.height = Math.min(100, (Math.max(0, p.y) / TOP_Y) * 100) + "%";
    $("hudBest").style.bottom = Math.min(100, (s.best / TOP_Y) * 100) + "%";
    const z = zoneAt(p.y).name;
    if (z !== this._z) { this._z = z; $("hudZone").textContent = z; }
    $("hudTimer").textContent = fmtTime(s.time);
    $("hudFalls").textContent = `Falls ${s.falls}`;
    $("hudDucks").textContent = `🦆 ${s.ducks.length}/${this.ducks.length}`;
  },
};

window.__SKY = Game;
Game.init();
