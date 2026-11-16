import * as THREE from "../skyward/vendor/three.module.min.js";

"use strict";

const canvas = document.querySelector("#game");
const menu = document.querySelector("#menu");
const hud = document.querySelector("#hud");
const endScreen = document.querySelector("#end");
const announcement = document.querySelector("#announcement");
const clockLabel = document.querySelector("#clock");
const quotaFill = document.querySelector("#quotaFill");
const quotaText = document.querySelector("#quotaText");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.setClearColor(0x050706);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070a08);
scene.fog = new THREE.FogExp2(0x070a08, 0.035);
const world = new THREE.Group();
scene.add(world);

const Y = new THREE.Vector3(0, 1, 0);
const tempV = new THREE.Vector3();
const tempV2 = new THREE.Vector3();
const keys = new Set();
const pressed = new Set();
const blockers = [];
const storeLights = [];
const particles = [];
const players = [];
const tasks = [];
const customers = [];
const gamepadPrevious = [[], []];

let running = false;
let coop = true;
let startAt = 0;
let lastAt = 0;
let shiftTime = 0;
let quota = 0;
let quotaGoal = 6;
let powerOn = true;
let announcementTimer = 0;
let nextCustomer = 12;
let nextCart = 32;
let lateFlickerDone = false;
let stats = { tasks: 0, rescues: 0, knockdowns: 0 };
let audio = null;
let hum = null;
let monster = null;
let cart = null;

const COLORS = {
  cream: 0xdce3ce,
  green: 0x596b50,
  dark: 0x101511,
  orange: 0xe36c3f,
  blue: 0x4b95a8,
  acid: 0xd9ff57,
  red: 0xff4f45,
};

const clamp = THREE.MathUtils.clamp;
const damp = (a, b, lambda, dt) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-lambda * dt));
const rand = (a, b) => a + Math.random() * (b - a);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  const halves = coop && running ? 2 : 1;
  for (const p of players) {
    p.camera.aspect = innerWidth / halves / innerHeight;
    p.camera.updateProjectionMatrix();
  }
}
addEventListener("resize", resize);
resize();

addEventListener("keydown", (event) => {
  if (!keys.has(event.code)) pressed.add(event.code);
  keys.add(event.code);
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Slash", "Backspace", "Space"].includes(event.code)) event.preventDefault();
});
addEventListener("keyup", (event) => keys.delete(event.code));

function mat(color, roughness = 0.82, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04, emissive, emissiveIntensity: emissive ? 0.45 : 0 });
}

function cube(name, size, position, material, parent = world) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addBlocker(x, z, w, d, pad = 0) {
  blockers.push({ minX: x - w / 2 - pad, maxX: x + w / 2 + pad, minZ: z - d / 2 - pad, maxZ: z + d / 2 + pad });
}

function labelSprite(text, color = "#d9ff57", scale = 1) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const x = c.getContext("2d");
  x.fillStyle = "rgba(3,5,4,.82)";
  x.fillRect(8, 8, 496, 112);
  x.strokeStyle = color;
  x.lineWidth = 4;
  x.strokeRect(8, 8, 496, 112);
  x.fillStyle = color;
  x.font = "bold 34px monospace";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(text, 256, 65);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(3.6 * scale, .9 * scale, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function clearWorld() {
  while (world.children.length) world.remove(world.children[0]);
  blockers.length = 0;
  tasks.length = 0;
  customers.length = 0;
  particles.length = 0;
  storeLights.length = 0;
  players.length = 0;
  monster = null;
  cart = null;
}

function buildStore() {
  clearWorld();
  scene.fog.density = 0.028;
  world.add(new THREE.HemisphereLight(0x9eae8b, 0x141810, .8));

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 22), mat(0x343a31, .98));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  world.add(floor);
  const grid = new THREE.GridHelper(30, 30, 0x555d4c, 0x41473c);
  grid.position.y = .008;
  grid.material.opacity = .35;
  grid.material.transparent = true;
  world.add(grid);

  const wallMat = mat(0x5d6656, .95);
  const trimMat = mat(0x252b24, .92);
  cube("back wall", [30, 4, .35], [0, 2, -11], wallMat); addBlocker(0, -11, 30, .35);
  cube("left wall", [.35, 4, 22], [-15, 2, 0], wallMat); addBlocker(-15, 0, .35, 22);
  cube("right wall", [.35, 4, 22], [15, 2, 0], wallMat); addBlocker(15, 0, .35, 22);
  cube("front wall L", [11, 4, .35], [-9.5, 2, 11], wallMat); addBlocker(-9.5, 11, 11, .35);
  cube("front wall R", [11, 4, .35], [9.5, 2, 11], wallMat); addBlocker(9.5, 11, 11, .35);
  cube("door header", [8, .8, .35], [0, 3.6, 11], trimMat);

  for (let x = -12; x <= 12; x += 6) {
    for (let z = -7; z <= 7; z += 7) {
      const tile = cube("ceiling light", [3.2, .08, .35], [x, 3.72, z], mat(0xeaf4d5, .35, 0xd5ffae));
      tile.material.emissiveIntensity = 1.7;
      const light = new THREE.PointLight(0xe7ffd0, .7, 9, 2);
      light.position.set(x, 3.45, z);
      world.add(light);
      storeLights.push({ mesh: tile, light });
    }
  }

  const shelfMat = mat(0x68715e, .88);
  const productColors = [0xd66a44, 0x688db5, 0xd3b94d, 0x775e9d, 0x73a563];
  for (const x of [-8, -3, 2, 7]) {
    cube("shelf", [2.1, 1.65, 6.1], [x, .83, -1.1], shelfMat);
    addBlocker(x, -1.1, 2.1, 6.1, .15);
    for (let row = 0; row < 2; row++) {
      for (let item = 0; item < 6; item++) {
        const side = item < 3 ? -1 : 1;
        const box = cube("product", [.26, .34, .45], [x + side * 1.1, .52 + row * .65, -3.25 + (item % 3) * 1.8], mat(productColors[(item + row + x + 20) % productColors.length]));
        box.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
  }

  cube("counter", [7, 1.05, 1.5], [8.8, .53, 7.7], mat(0x394239)); addBlocker(8.8, 7.7, 7, 1.5, .1);
  cube("register", [1.1, .65, .8], [8.4, 1.38, 7.55], mat(0x1d231f, .5, 0x26301f));
  cube("freezers", [9, 2.6, 1.2], [4, 1.3, -10.1], mat(0x26343a, .42, 0x1f4c5a)); addBlocker(4, -10.1, 9, 1.2);
  cube("stockroom", [5.3, 3.5, .25], [-12.1, 1.75, -7.3], wallMat); addBlocker(-12.1, -7.3, 5.3, .25);
  cube("stockroom side", [.25, 3.5, 6], [-9.45, 1.75, -8.1], wallMat); addBlocker(-9.45, -8.1, .25, 6);
  cube("breaker", [.12, 1.1, .8], [-9.25, 1.5, -9], mat(0x283029, .6, 0x5d190f));

  for (const p of [[-13,8],[-11,8],[-13,6]]) {
    const bale = cube("boxes", [1.3, 1.1, 1.3], [p[0], .55, p[1]], mat(0x8b6b42));
    bale.rotation.y = rand(-.2, .2); addBlocker(p[0], p[1], 1.3, 1.3, .1);
  }
  const sign = labelSprite("SLEEPY MART  •  OPEN", "#d9ff57", 1.3);
  sign.position.set(0, 3.05, -10.78); world.add(sign);

  addTask("MOP THE MYSTERY SPILL", -5.4, 7.2, 0x65a978, "mop");
  addTask("RESTOCK THE CHIPS", -9.4, -1.2, 0xe27b45, "stock");
  addTask("TAKE OUT THE TRASH", 12.7, 6.8, 0x7b8b78, "trash");
  addTask("UNJAM THE FREEZER", 4.2, -8.9, 0x62b4c8, "freezer");

  monster = createMonster();
  monster.group.position.set(-12, 0, -9);
  monster.group.visible = false;
  world.add(monster.group);
  cart = createCart();
  world.add(cart.group);
}

function addTask(title, x, z, color, type) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.55, .07, 8, 24), mat(color, .45, color));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = .08;
  group.add(ring);
  let prop;
  if (type === "mop") {
    prop = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 1.5, 8), mat(0xc9b78e));
    prop.position.y = .78; prop.rotation.z = .22;
  } else if (type === "trash") {
    prop = new THREE.Mesh(new THREE.CylinderGeometry(.4, .33, .8, 10), mat(0x252b27)); prop.position.y = .4;
  } else {
    prop = new THREE.Mesh(new THREE.BoxGeometry(.65, .65, .65), mat(color)); prop.position.y = .38;
  }
  prop.castShadow = true; group.add(prop);
  const label = labelSprite(`[F] ${title}`, "#d9ff57", .82); label.position.y = 1.75; group.add(label);
  world.add(group);
  tasks.push({ title, x, z, type, group, ring, label, done: false, active: true });
}

function addBreakerTask() {
  if (tasks.some(t => t.type === "breaker" && t.active)) return;
  const task = { title: "RESET THE BREAKER", x: -8.65, z: -9, type: "breaker", done: false, active: true };
  const group = new THREE.Group(); group.position.set(task.x, 0, task.z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.55, .07, 8, 24), mat(COLORS.red, .4, COLORS.red));
  ring.rotation.x = Math.PI / 2; ring.position.y = .08; group.add(ring);
  const label = labelSprite("[F] RESET BREAKER", "#ff4f45", .9); label.position.y = 1.8; group.add(label);
  task.group = group; task.ring = ring; task.label = label;
  tasks.push(task); world.add(group);
}

function createWorker(number) {
  const group = new THREE.Group();
  const uniform = number === 1 ? COLORS.orange : COLORS.blue;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.34, .68, 5, 10), mat(uniform));
  body.position.y = 1.02; body.castShadow = true; group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.28, 12, 9), mat(number === 1 ? 0xc88e6b : 0x9c704f));
  head.position.y = 1.72; head.castShadow = true; group.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.295, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x202622));
  cap.position.y = 1.79; group.add(cap);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(.22, .15, .025), mat(COLORS.acid, .5, COLORS.acid));
  badge.position.set(.16, 1.2, -.31); group.add(badge);
  const light = new THREE.SpotLight(0xfff0c2, 3.2, 12, .42, .48, 1.5);
  light.castShadow = false;
  const target = new THREE.Object3D(); world.add(light, target);
  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, .08, 70);
  camera.position.set(0, 4, 5);
  return {
    number, group, camera, light, lightTarget: target,
    x: number === 1 ? -1.2 : 1.2, z: 8.3, angle: 0,
    vx: 0, vz: 0, stamina: 1, fear: 0, health: 3,
    down: false, downTime: 0, useCooldown: 0, flashlight: true,
    stepTimer: 0, bump: 0, cameraShake: 0, prompt: "",
  };
}

function createMonster() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.31, 1.15, 4, 8), mat(0x090a09)); body.position.y = 1.25; group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.32, 10, 7), mat(0xd7d3bd)); head.position.y = 2.18; group.add(head);
  const eyeMat = mat(0x080808, .5);
  for (const x of [-.1,.1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(.035, 6, 4), eyeMat); eye.position.set(x,2.22,-.3); group.add(eye); }
  return { group, x: -12, z: -9, active: false, attackCooldown: 0, frozen: false };
}

function createCart() {
  const group = new THREE.Group();
  const basket = new THREE.Mesh(new THREE.BoxGeometry(1.2, .65, 1.55), mat(0x66716a, .35)); basket.position.y = .75; basket.castShadow = true; group.add(basket);
  for (const x of [-.45,.45]) for (const z of [-.55,.55]) { const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.08,10),mat(0x151816)); wheel.rotation.z=Math.PI/2; wheel.position.set(x,.22,z); group.add(wheel); }
  group.visible = false;
  return { group, active: false, x: -13, z: 4, vx: 0, vz: 0, life: 0 };
}

function createCustomer(weird = false) {
  const group = new THREE.Group();
  const color = weird ? 0xaaa99d : [0xd28b4f,0x788fb3,0x9b6e9f][customers.length % 3];
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.33,.75,5,9),mat(color)); body.position.y=1.03; body.castShadow=true; group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.29,11,8),mat(weird?0xbebba9:0xb9825d)); head.position.y=1.78; group.add(head);
  if (weird) { for(const x of [-.09,.09]) { const eye=new THREE.Mesh(new THREE.SphereGeometry(.038,6,4),mat(0x090909)); eye.position.set(x,1.82,-.27); group.add(eye); } }
  const label = labelSprite(weird ? "[F] ASK WHAT IT WANTS" : "[F] SERVE CUSTOMER", weird ? "#ff4f45" : "#d9ff57", .8); label.position.y=2.55; group.add(label);
  group.position.set(0,0,10.4); world.add(group);
  const customer = { group, x:0, z:10.4, weird, state:"walking", targetX:8.4, targetZ:6.25, served:false, speed:weird?.72:1.1, wait:0 };
  customers.push(customer);
  say(weird ? "DOOR CHIME. The customer has no reflection." : "DOOR CHIME — Customer at the register.", weird, 3.2);
  sound(weird ? 72 : 760, weird ? .55 : .12, weird ? "sawtooth" : "sine", weird ? .07 : .035);
}

function startGame(twoPlayers) {
  coop = twoPlayers;
  buildStore();
  const p1 = createWorker(1); players.push(p1); world.add(p1.group);
  if (coop) { const p2 = createWorker(2); players.push(p2); world.add(p2.group); }
  quota = 0; quotaGoal = coop ? 8 : 6; powerOn = true; nextCustomer = 11; nextCart = 29; lateFlickerDone = false;
  stats = { tasks: 0, rescues: 0, knockdowns: 0 };
  shiftTime = 0; startAt = performance.now(); lastAt = startAt; running = true;
  menu.classList.add("hidden"); endScreen.classList.add("hidden"); hud.classList.remove("hidden");
  buildPlayerHud(); updateHud(); resize(); startAudio();
  say(coop ? "Clock in. Hit the quota. Try not to lose your coworker." : "Clock in. Hit the quota. Keep the flashlight on.", false, 4);
  requestAnimationFrame(loop);
}

function buildPlayerHud() {
  hud.querySelectorAll(".player-hud").forEach(el => el.remove());
  players.forEach((p, index) => {
    const el = document.createElement("div");
    el.className = `player-hud p${p.number}`;
    el.innerHTML = `<div class="p-name">P${p.number} <span>●●●</span></div><div class="stamina"><i></i></div><strong></strong>`;
    if (coop) el.style.left = index ? "calc(50% + 18px)" : "18px";
    p.hud = el; p.staminaBar = el.querySelector("i"); p.status = el.querySelector("strong"); p.hearts = el.querySelector("span");
    hud.appendChild(el);
  });
}

document.querySelector("#solo").addEventListener("click", () => startGame(false));
document.querySelector("#coop").addEventListener("click", () => startGame(true));
document.querySelector("#again").addEventListener("click", () => { endScreen.classList.add("hidden"); menu.classList.remove("hidden"); });

function controlFor(player) {
  const p1 = player.number === 1;
  let forward = (keys.has(p1 ? "KeyW" : "ArrowUp") ? 1 : 0) - (keys.has(p1 ? "KeyS" : "ArrowDown") ? 1 : 0);
  let strafe = (keys.has(p1 ? "KeyE" : "Period") ? 1 : 0) - (keys.has(p1 ? "KeyQ" : "Comma") ? 1 : 0);
  let turn = (keys.has(p1 ? "KeyD" : "ArrowRight") ? 1 : 0) - (keys.has(p1 ? "KeyA" : "ArrowLeft") ? 1 : 0);
  let run = keys.has(p1 ? "ShiftLeft" : "Slash");
  let use = pressed.has(p1 ? "KeyF" : "Enter");
  let toggle = pressed.has(p1 ? "KeyV" : "Backspace");
  const gp = navigator.getGamepads?.()[player.number - 1];
  if (gp) {
    const dead = v => Math.abs(v) > .16 ? v : 0;
    strafe += dead(gp.axes[0] || 0); forward -= dead(gp.axes[1] || 0); turn += dead(gp.axes[2] || 0) * 1.35;
    run ||= (gp.buttons[7]?.value || 0) > .4;
    const prev = gamepadPrevious[player.number - 1];
    use ||= gp.buttons[0]?.pressed && !prev[0];
    toggle ||= gp.buttons[2]?.pressed && !prev[2];
    gamepadPrevious[player.number - 1] = gp.buttons.map(b => b.pressed);
  }
  const length = Math.hypot(forward, strafe);
  if (length > 1) { forward /= length; strafe /= length; }
  return { forward, strafe, turn, run, use, toggle };
}

function updatePlayer(p, dt) {
  p.useCooldown = Math.max(0, p.useCooldown - dt);
  p.bump = Math.max(0, p.bump - dt);
  const c = controlFor(p);
  if (c.toggle) { p.flashlight = !p.flashlight; sound(p.flashlight ? 620 : 260, .05, "square", .02); }
  if (p.down) {
    p.downTime += dt;
    p.vx *= Math.exp(-7 * dt); p.vz *= Math.exp(-7 * dt);
    p.group.rotation.z = damp(p.group.rotation.z, 1.35, 9, dt);
    if (!coop && p.downTime > 3.2) revivePlayer(p, true);
    updatePlayerVisuals(p, dt);
    return;
  }
  p.angle += c.turn * 2.35 * dt;
  const moving = Math.abs(c.forward) + Math.abs(c.strafe) > .05;
  const sprinting = c.run && p.stamina > .04 && moving;
  const maxSpeed = sprinting ? 5.15 : 3.05;
  const fx = Math.sin(p.angle), fz = -Math.cos(p.angle);
  const rx = Math.cos(p.angle), rz = Math.sin(p.angle);
  const wishX = (fx * c.forward + rx * c.strafe) * maxSpeed;
  const wishZ = (fz * c.forward + rz * c.strafe) * maxSpeed;
  p.vx = damp(p.vx, wishX, moving ? 10 : 6.5, dt);
  p.vz = damp(p.vz, wishZ, moving ? 10 : 6.5, dt);
  if (sprinting) p.stamina = Math.max(0, p.stamina - dt * .26);
  else p.stamina = Math.min(1, p.stamina + dt * .18);
  moveWithCollisions(p, p.vx * dt, p.vz * dt);
  if (moving) {
    p.stepTimer -= dt;
    if (p.stepTimer <= 0) { p.stepTimer = sprinting ? .23 : .37; sound(rand(72,92), .035, "square", .008); }
  }
  if (c.use && p.useCooldown <= 0) interact(p);
  updatePlayerVisuals(p, dt);
}

function moveWithCollisions(p, dx, dz) {
  const radius = .38;
  let nx = clamp(p.x + dx, -14.3, 14.3);
  if (!blockers.some(b => p.z > b.minZ-radius && p.z < b.maxZ+radius && nx > b.minX-radius && nx < b.maxX+radius)) p.x = nx; else p.vx *= -.08;
  let nz = clamp(p.z + dz, -10.3, 10.3);
  if (!blockers.some(b => p.x > b.minX-radius && p.x < b.maxX+radius && nz > b.minZ-radius && nz < b.maxZ+radius)) p.z = nz; else p.vz *= -.08;
}

function updatePlayerVisuals(p, dt) {
  p.group.position.set(p.x, 0, p.z);
  p.group.rotation.y = p.angle;
  p.group.position.y = p.down ? .12 : Math.abs(Math.sin(performance.now() * .008)) * Math.min(.045, Math.hypot(p.vx,p.vz)*.012);
  if (!p.down) p.group.rotation.z = damp(p.group.rotation.z, 0, 9, dt);
  const fx = Math.sin(p.angle), fz = -Math.cos(p.angle);
  p.light.visible = p.flashlight && !p.down;
  p.light.position.set(p.x, 1.5, p.z);
  p.lightTarget.position.set(p.x + fx * 6, 1.1, p.z + fz * 6);
  p.light.target = p.lightTarget;
  p.cameraShake *= Math.exp(-7 * dt);
  const shakeX = rand(-1,1) * p.cameraShake;
  const desired = tempV.set(p.x - fx * 4.25 + shakeX, 3.25 + p.cameraShake, p.z - fz * 4.25);
  p.camera.position.lerp(desired, 1 - Math.exp(-7 * dt));
  p.camera.lookAt(p.x + fx * 1.55, 1.08, p.z + fz * 1.55);
  p.staminaBar.style.width = `${p.stamina * 100}%`;
  p.hearts.textContent = p.down ? "DOWN" : `${"●".repeat(p.health)}${"○".repeat(3-p.health)}`;
  p.hearts.classList.toggle("danger", p.health === 1 || p.down);
  p.status.textContent = p.down ? (coop ? "COWORKER! HELP ME!" : "MANAGEMENT IS RESPAWNING YOU…") : p.prompt;
}

function interact(p) {
  p.useCooldown = .32;
  const mate = players.find(other => other !== p && other.down && Math.hypot(p.x-other.x,p.z-other.z) < 1.8);
  if (mate) { revivePlayer(mate, false); stats.rescues++; say(`PLAYER ${p.number} PULLED PLAYER ${mate.number} BACK INTO THE SHIFT.`, false, 2.2); return; }
  const task = tasks.filter(t => t.active && !t.done).sort((a,b)=>Math.hypot(p.x-a.x,p.z-a.z)-Math.hypot(p.x-b.x,p.z-b.z))[0];
  if (task && Math.hypot(p.x-task.x,p.z-task.z) < 1.75) { completeTask(task, p); return; }
  const customer = customers.find(c => !c.served && c.state === "waiting" && Math.hypot(p.x-c.x,p.z-c.z) < 2);
  if (customer) { serveCustomer(customer, p); return; }
  say(`PLAYER ${p.number}: Nothing here except minimum wage.`, false, 1.2);
}

function completeTask(task, p) {
  task.done = true; task.active = false; task.group.visible = false; quota++; stats.tasks++;
  burst(task.x, .6, task.z, task.type === "breaker" ? COLORS.red : COLORS.acid, 13);
  const jokes = {
    mop: "Spill mopped. The mop whispered “thank you.”",
    stock: "Chips restocked. Mostly air, as required.",
    trash: "Trash removed. It tried to come back.",
    freezer: "Freezer unjammed. Something inside blinked.",
    breaker: "POWER RESTORED. Whatever moved in the dark is still here.",
  };
  if (task.type === "breaker") setPower(true);
  say(`${jokes[task.type]}  +1 QUOTA`, task.type === "breaker", 2.6);
  sound(680, .11, "sine", .04); sound(920, .08, "sine", .025, .09);
  updateHud();
}

function serveCustomer(c, p) {
  c.served = true; c.state = "leaving"; c.targetX = 0; c.targetZ = 11.8; quota++; stats.tasks++;
  say(c.weird ? "It bought one spoon and paid with a human tooth.  +1 QUOTA" : "Customer served. They left a one-star review anyway.  +1 QUOTA", c.weird, 3);
  sound(c.weird ? 95 : 880, .14, c.weird ? "sawtooth" : "sine", .04);
  updateHud();
  if (c.weird) { monster.active = true; monster.group.visible = true; }
}

function revivePlayer(p, automatic) {
  p.down = false; p.downTime = 0; p.health = automatic ? 2 : 1; p.group.rotation.z = 0;
  if (automatic) { p.x = 0; p.z = 8.4; say("Corporate replaced you with you.", false, 2); }
  sound(420,.12,"sine",.03);
}

function knockDown(p, reason) {
  if (p.down || p.bump > 0) return;
  p.health--;
  p.cameraShake = .36;
  p.bump = 1.2;
  stats.knockdowns++;
  sound(48,.45,"sawtooth",.09);
  if (p.health <= 0) {
    p.down = true; p.downTime = 0; p.vx = p.vz = 0;
    say(`PLAYER ${p.number} IS DOWN — ${reason}`, true, 3.5);
  } else {
    p.vx *= -2; p.vz *= -2;
    say(`PLAYER ${p.number}: ${reason}  ${p.health} HEART${p.health===1?"":"S"} LEFT`, true, 2.2);
  }
}

function updateCustomers(dt) {
  for (const c of customers) {
    if (c.state === "gone") continue;
    const dx = c.targetX-c.x, dz = c.targetZ-c.z, d = Math.hypot(dx,dz);
    if (d > .15) { c.x += dx/d*c.speed*dt; c.z += dz/d*c.speed*dt; c.group.rotation.y = Math.atan2(dx,-dz); }
    else if (c.state === "walking") { c.state="waiting"; c.wait=0; say(c.weird?"CUSTOMER: “Do you sell teeth?”":"CUSTOMER: “Can I return this soup? It knows my name.”",c.weird,3); }
    else if (c.state === "leaving") { c.state="gone"; world.remove(c.group); }
    if (c.state === "waiting") { c.wait += dt; c.group.children[1].rotation.y += (c.weird?.9:.15)*dt; }
    c.group.position.set(c.x,0,c.z);
  }
}

function setPower(on) {
  powerOn = on;
  storeLights.forEach((item, i) => {
    item.light.intensity = on ? .7 : (i % 5 === 0 ? .08 : 0);
    item.mesh.material.emissiveIntensity = on ? 1.7 : .05;
  });
  scene.fog.density = on ? .028 : .052;
}

function triggerOutage() {
  setPower(false); addBreakerTask(); monster.active = true; monster.group.visible = true;
  say("⚠ POWER FAILURE — Reset the stockroom breaker.", true, 4);
  sound(55,.8,"sawtooth",.1);
}

function launchCart() {
  cart.active = true; cart.group.visible = true; cart.life = 8;
  cart.x = -13; cart.z = rand(3.4,6.4); cart.vx = rand(6.5,8.2); cart.vz = rand(-.4,.4);
  cart.group.rotation.y = -Math.PI/2;
  say("ATTENTION: Shopping cart in aisle three has achieved sentience.", false, 3);
  sound(540,.08,"square",.025); sound(420,.08,"square",.025,.1);
}

function updateCart(dt) {
  if (!cart.active) return;
  cart.life -= dt; cart.x += cart.vx*dt; cart.z += cart.vz*dt; cart.group.position.set(cart.x,0,cart.z);
  cart.group.rotation.z = Math.sin(performance.now()*.02)*.04;
  for(const p of players) if(!p.down && Math.hypot(p.x-cart.x,p.z-cart.z)<1.05) knockDown(p,"A SHOPPING CART CHOSE VIOLENCE.");
  if(cart.life<=0 || cart.x>14){cart.active=false;cart.group.visible=false;}
}

function updateMonster(dt) {
  if (!monster.active) return;
  monster.attackCooldown = Math.max(0,monster.attackCooldown-dt);
  let seen = false;
  for (const p of players) {
    if (p.down || !p.flashlight) continue;
    const dx=monster.x-p.x,dz=monster.z-p.z,d=Math.hypot(dx,dz);
    const dot=(dx*Math.sin(p.angle)+dz*-Math.cos(p.angle))/Math.max(d,.001);
    if(d<10 && dot>.3) { seen=true; p.fear=Math.max(p.fear,1-d/12); }
  }
  monster.frozen = seen;
  const target = players.filter(p=>!p.down).sort((a,b)=>Math.hypot(a.x-monster.x,a.z-monster.z)-Math.hypot(b.x-monster.x,b.z-monster.z))[0];
  if(target && !seen) {
    const dx=target.x-monster.x,dz=target.z-monster.z,d=Math.hypot(dx,dz);
    const speed=powerOn?1.05:1.72;
    monster.x+=dx/d*speed*dt; monster.z+=dz/d*speed*dt;
    monster.group.rotation.y=Math.atan2(dx,-dz);
    if(d<.76 && monster.attackCooldown<=0){knockDown(target,"THE NIGHT MANAGER FOUND YOU.");monster.attackCooldown=2.3;monster.x=-12;monster.z=-8.7;}
  }
  monster.group.position.set(monster.x,0,monster.z);
  monster.group.children[1].rotation.y += (seen?.2:5.5)*dt;
}

function updatePrompts() {
  for (const p of players) {
    if (p.down) continue;
    let prompt="";
    const mate=players.find(q=>q!==p&&q.down&&Math.hypot(p.x-q.x,p.z-q.z)<2.2);
    const task=tasks.find(t=>t.active&&!t.done&&Math.hypot(p.x-t.x,p.z-t.z)<2.1);
    const customer=customers.find(c=>!c.served&&c.state==="waiting"&&Math.hypot(p.x-c.x,p.z-c.z)<2.2);
    if(mate) prompt="USE: REVIVE COWORKER"; else if(task) prompt=`USE: ${task.title}`; else if(customer) prompt="USE: SERVE CUSTOMER";
    p.prompt=prompt;
  }
}

function updateEvents(dt) {
  if (shiftTime > nextCustomer) { createCustomer(nextCustomer > 45); nextCustomer += nextCustomer > 45 ? 34 : 38; }
  if (shiftTime > nextCart) { launchCart(); nextCart += 48; }
  if (shiftTime > 49 && powerOn && !tasks.some(t=>t.type==="breaker")) triggerOutage();
  if (shiftTime > 84 && monster && !monster.active) { monster.active=true;monster.group.visible=true;say("PA: Night manager inspection in progress.",true,3); }
  if (shiftTime > 112 && powerOn && !lateFlickerDone && !tasks.some(t=>t.type==="breaker"&&t.active)) { lateFlickerDone=true;setPower(false);say("The lights are tired. So are you.",true,3);setTimeout(()=>running&&setPower(true),3200); }
}

function burst(x,y,z,color,count=10) {
  for(let i=0;i<count;i++){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.08),new THREE.MeshBasicMaterial({color}));
    mesh.position.set(x,y,z);world.add(mesh);
    particles.push({mesh,vx:rand(-1.6,1.6),vy:rand(.8,2.7),vz:rand(-1.6,1.6),life:rand(.5,1.1)});
  }
}
function updateParticles(dt){for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.vy-=4*dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;p.mesh.rotation.x+=dt*6;if(p.life<=0){world.remove(p.mesh);particles.splice(i,1);}}}

function updateHud() {
  quotaText.textContent=`${quota} / ${quotaGoal}`; quotaFill.style.width=`${Math.min(1,quota/quotaGoal)*100}%`;
}

function say(text, danger=false, seconds=2.4) {
  announcement.textContent=text; announcement.classList.remove("hidden"); announcement.classList.toggle("danger",danger); announcementTimer=seconds;
}

function startAudio() {
  if (!audio) audio=new (window.AudioContext||window.webkitAudioContext)();
  audio.resume();
  if (!hum) { const osc=audio.createOscillator(),gain=audio.createGain();osc.type="sine";osc.frequency.value=54;gain.gain.value=.008;osc.connect(gain).connect(audio.destination);osc.start();hum={osc,gain}; }
}

function sound(freq=220,duration=.08,type="square",volume=.03,delay=0) {
  if(!audio)return;const osc=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime+delay;osc.type=type;osc.frequency.setValueAtTime(freq,t);gain.gain.setValueAtTime(volume,t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);osc.connect(gain).connect(audio.destination);osc.start(t);osc.stop(t+duration+.02);
}

function update(dt) {
  shiftTime += dt;
  announcementTimer -= dt;
  if(announcementTimer<=0)announcement.classList.add("hidden");
  updateEvents(dt);
  players.forEach(p=>updatePlayer(p,dt));
  updateCustomers(dt);updateCart(dt);updateMonster(dt);updateParticles(dt);updatePrompts();
  for(const task of tasks)if(task.active){task.ring.rotation.z+=dt*1.4;task.label.position.y=1.75+Math.sin(performance.now()*.003+task.x)*.08;}
  const progress=clamp(shiftTime/140,0,1),minutes=Math.floor(progress*360),hour=Math.floor(minutes/60),mins=minutes%60;
  clockLabel.textContent=`${hour===0?12:hour}:${String(mins).padStart(2,"0")} AM`;
  if(shiftTime>=140)finish(quota>=quotaGoal);
  const alive=players.some(p=>!p.down);
  if(!alive&&coop&&players.every(p=>p.downTime>4))finish(false,"Both employees were found sleeping on the job. The claw marks were unrelated.");
}

function render() {
  const width=canvas.clientWidth,height=canvas.clientHeight;
  renderer.setScissorTest(coop);
  if(coop){
    const half=Math.floor(width/2);
    players.forEach((p,i)=>{const x=i*half,w=i===1?width-half:half;renderer.setViewport(x,0,w,height);renderer.setScissor(x,0,w,height);renderer.render(scene,p.camera);});
    renderer.setScissorTest(false);
  } else if(players[0]){renderer.setViewport(0,0,width,height);renderer.render(scene,players[0].camera);}
}

function finish(success, customCopy="") {
  if(!running)return;running=false;hud.classList.add("hidden");endScreen.classList.remove("hidden");
  const title=document.querySelector("#endTitle"),tag=document.querySelector("#endTag"),copy=document.querySelector("#endCopy");
  tag.textContent=success?"SHIFT COMPLETE":"INCIDENT REPORT";title.textContent=success?"6:00 AM":"STORE CLOSED";title.style.color=success?"var(--acid)":"var(--red)";
  copy.textContent=customCopy||(success?"Quota met. Sunrise achieved. Corporate has rewarded you with another shift tomorrow.":`You survived the paperwork but missed quota by ${Math.max(0,quotaGoal-quota)}. Corporate is somehow scarier than the monster.`);
  document.querySelector("#endStats").innerHTML=`<div><b>${quota}/${quotaGoal}</b><span>QUOTA</span></div><div><b>${stats.rescues}</b><span>RESCUES</span></div><div><b>${stats.knockdowns}</b><span>INCIDENTS</span></div>`;
  sound(success?620:48,.7,success?"sine":"sawtooth",.08);
}

function loop(now) {
  if(!running)return;const dt=Math.min(.033,Math.max(.001,(now-lastAt)/1000));lastAt=now;update(dt);render();pressed.clear();requestAnimationFrame(loop);
}

// Draw a dim store behind the title screen.
buildStore();
const previewCamera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.1,70);previewCamera.position.set(18,12,18);previewCamera.lookAt(0,0,-1);
renderer.render(scene,previewCamera);

// Small read-only surface for automated smoke tests.
window.__NIGHT_SHIFT__ = {
  state: () => ({ running, coop, quota, shiftTime, powerOn, players: players.map(p => ({ x:p.x, z:p.z, down:p.down, health:p.health })) })
};
