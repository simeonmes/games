// The 3D world: the course itself (merged into a few big meshes for speed), the moving
// pieces, the sky and sun that change with height, clouds, the city far below, distant
// scenery, weather and the lights.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ZONES, TOP_Y } from "./course.js";

// ------------------------------------------------------------------------------ atmosphere

// What the sky looks like at each height. Values blend smoothly between zones.
const ATMOS = [
  { y: 0, top: "#121a36", hor: "#9a5a7a", bot: "#2a2236", fog: 0.011, sunEl: 6, sunAz: 40, sun: "#ff9a6a", sunI: 1.3, sky: "#6a7ab0", gnd: "#3a2a34", hemiI: 1.0, stars: 0.25, exp: 1.0, rain: 1 },
  { y: 110, top: "#2a5aa8", hor: "#ffb07a", bot: "#b07a6a", fog: 0.006, sunEl: 11, sunAz: 50, sun: "#ffc890", sunI: 2.6, sky: "#a8c0e8", gnd: "#80605a", hemiI: 1.0, stars: 0, exp: 1.0, rain: 0 },
  { y: 250, top: "#3a8ae0", hor: "#cfe9ff", bot: "#f2f8ff", fog: 0.0035, sunEl: 48, sunAz: 70, sun: "#fff4e0", sunI: 3.0, sky: "#c0e0ff", gnd: "#a0b890", hemiI: 1.1, stars: 0, exp: 1.0, rain: 0 },
  { y: 415, top: "#2a62cc", hor: "#b0d4ff", bot: "#ffffff", fog: 0.0028, sunEl: 36, sunAz: 100, sun: "#ffffff", sunI: 3.0, sky: "#c8e0ff", gnd: "#c8c8d0", hemiI: 1.1, stars: 0, exp: 1.0, rain: 0 },
  { y: 575, top: "#0a1440", hor: "#6a80c0", bot: "#c8d8f0", fog: 0.005, sunEl: 4, sunAz: 130, sun: "#ffb0c8", sunI: 1.6, sky: "#7a90d0", gnd: "#c0d0e8", hemiI: 1.0, stars: 0.6, exp: 1.05, rain: 0, snow: 1, aurora: 1 },
  { y: 735, top: "#000208", hor: "#101a40", bot: "#1e4aa0", fog: 0.0012, sunEl: 25, sunAz: 160, sun: "#ffffff", sunI: 3.4, sky: "#5060a0", gnd: "#101828", hemiI: 0.55, stars: 1, exp: 1.0, rain: 0 },
  { y: 890, top: "#020410", hor: "#ff9a6a", bot: "#2a4ab0", fog: 0.0012, sunEl: 3, sunAz: 175, sun: "#ffc890", sunI: 3.4, sky: "#8070a0", gnd: "#202040", hemiI: 0.7, stars: 0.8, exp: 1.05, rain: 0 },
];
const COLOR_KEYS = ["top", "hor", "bot", "sun", "sky", "gnd"];
const NUM_KEYS = ["fog", "sunEl", "sunAz", "sunI", "hemiI", "stars", "exp", "rain", "snow", "aurora"];

function atmosAt(y) {
  let i = 0;
  while (i < ATMOS.length - 1 && y > ATMOS[i + 1].y) i++;
  const a = ATMOS[i], b = ATMOS[Math.min(i + 1, ATMOS.length - 1)];
  // Hold each zone's look, then blend over the 30 m before the next one starts.
  const k = b === a ? 0 : THREE.MathUtils.smoothstep(y, b.y - 30, b.y);
  const out = {};
  for (const key of COLOR_KEYS) out[key] = new THREE.Color(a[key]).lerp(new THREE.Color(b[key]), k);
  for (const key of NUM_KEYS) out[key] = (a[key] || 0) + ((b[key] || 0) - (a[key] || 0)) * k;
  return out;
}

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const SKY_FRAG = `
varying vec3 vDir;
uniform vec3 top, hor, bot, sunDir, sunCol; uniform float stars, time, planet;
float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(hor, top, pow(clamp(h,0.0,1.0), 0.55)) : mix(hor, bot, pow(clamp(-h,0.0,1.0), 0.35));
  float s = max(dot(d, sunDir), 0.0);
  col += sunCol * (pow(s, 900.0) * 14.0 + pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.08);
  if (stars > 0.0) {
    vec3 p = floor(d * 420.0);
    float n = hash(p);
    float tw = 0.6 + 0.4 * sin(time * 2.0 + n * 50.0);
    col += vec3(step(0.9975, n) * tw * stars * smoothstep(-0.05, 0.25, h));
  }
  // From space, the curve of the planet's atmosphere glows along the horizon.
  if (planet > 0.0) col += vec3(0.25, 0.5, 1.0) * planet * exp(-abs(h + 0.06) * 30.0) * 0.8;
  gl_FragColor = vec4(col, 1.0);
}`;

// ------------------------------------------------------------------------------ geometry

function scaleUVBox(geo, w, h, d, tm) {
  const uv = geo.attributes.uv;
  // Faces: +x, -x, +y, -y, +z, -z; 4 vertices each.
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, (uv.getX(i) * dims[f][0]) / tm, (uv.getY(i) * dims[f][1]) / tm);
  }
}

function scaleUVCyl(geo, r1, r2, h, seg, tm) {
  const uv = geo.attributes.uv, side = (seg + 1) * 2;
  const circ = Math.PI * (r1 + r2);
  for (let i = 0; i < uv.count; i++) {
    if (i < side) uv.setXY(i, Math.max(1, Math.round(circ / tm)) * uv.getX(i), (uv.getY(i) * h) / tm);
    else uv.setXY(i, (uv.getX(i) * 2 * Math.max(r1, r2)) / tm, (uv.getY(i) * 2 * Math.max(r1, r2)) / tm);
  }
}

function makeGeo(part, M) {
  const s = part.s, tm = (M[part.m] && M[part.m].userData.tm) || 2;
  let geo;
  switch (part.g) {
    case "box": geo = new THREE.BoxGeometry(s[0], s[1], s[2]); scaleUVBox(geo, s[0], s[1], s[2], tm); break;
    case "cyl": geo = new THREE.CylinderGeometry(s[0], s[1], s[2], s[3] || 16); scaleUVCyl(geo, s[0], s[1], s[2], s[3] || 16, tm); break;
    case "sphere": geo = part.half ? new THREE.SphereGeometry(s[0], 18, 8, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.SphereGeometry(s[0], 14, 10); break;
    case "ico": geo = new THREE.IcosahedronGeometry(s[0], 1); break;
    case "torus": geo = new THREE.TorusGeometry(s[0], s[1], 8, 18); break;
    case "rope": {
      const a = new THREE.Vector3(...part.from), b = new THREE.Vector3(...part.to), len = a.distanceTo(b);
      geo = new THREE.CylinderGeometry(0.04, 0.04, len, 5);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      geo.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
      return geo.toNonIndexed();
    }
    default: return null;
  }
  if (part.sy) geo.scale(1, part.sy, 1);
  const m = new THREE.Matrix4();
  const e = new THREE.Euler(...(part.r || [0, 0, 0]), "YXZ");
  if (part.r) e.set(part.r[0], part.r[1], part.r[2], "YXZ");
  m.compose(new THREE.Vector3(...part.p), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(m);
  geo = geo.index ? geo.toNonIndexed() : geo;
  if (part.flat || part.g === "ico") geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------------------------ the scene

export class Scene3D {
  constructor(renderer, course, M) {
    this.renderer = renderer;
    this.course = course;
    this.M = M;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x888888, 0.01);
    this.dyn = [];          // { c: collider, obj }
    this.spinners = [];
    this.flows = Object.values(M).filter((m) => m.userData.flow);
    this.time = 0;
    this.buildCourse();
    this.buildSky();
    this.buildLights();
    this.buildClouds();
    this.buildCity();
    this.buildScenery();
    this.buildWeather();
    this.buildBeacon();
  }

  buildCourse() {
    const { course, M } = this;
    const groups = new Map();
    const ownerParts = new Map();
    for (const part of course.parts) {
      if (part.g === "fan") { this.addFan(part); continue; }
      if (part.g === "beacon") continue;
      if (part.c !== undefined) { if (!ownerParts.has(part.c)) ownerParts.set(part.c, []); ownerParts.get(part.c).push(part); continue; }
      const geo = makeGeo(part, M);
      if (!geo) continue;
      // Group by material and by 80 m height band, so each band can be culled.
      const band = Math.floor(part.p[1] / 80);
      const key = part.m + "|" + band;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(geo);
    }
    for (const [key, geos] of groups) {
      const mat = M[key.split("|")[0]];
      if (!mat) { console.warn("no material", key); continue; }
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      const mesh = new THREE.Mesh(merged, mat);
      const see = !mat.transparent;
      mesh.castShadow = see && !mat.userData.noShadow; mesh.receiveShadow = see;
      this.scene.add(mesh);
    }
    // Moving and crumbling pieces get their own meshes, updated every frame.
    for (const [cid, parts] of ownerParts) {
      const c = course.colliders[cid];
      const obj = new THREE.Group();
      for (const part of parts) {
        const geo = makeGeo(part, M);
        const mesh = new THREE.Mesh(geo, M[part.m]);
        mesh.castShadow = mesh.receiveShadow = true;
        obj.add(mesh);
      }
      this.scene.add(obj);
      this.dyn.push({ c, obj });
    }
  }

  addFan(part) {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(part.s[0] * 0.9, 0.04, 0.35), this.M.chrome);
      blade.position.x = part.s[0] * 0.45;
      blade.rotation.x = 0.35;
      const arm = new THREE.Group(); arm.rotation.y = (i * Math.PI) / 2; arm.add(blade);
      g.add(arm);
    }
    g.position.set(...part.p);
    this.scene.add(g);
    this.spinners.push(g);
  }

  buildSky() {
    this.skyU = {
      top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, stars: { value: 0 }, time: { value: 0 }, planet: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
    // A moon, seen from the high zones.
    const moon = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 16), new THREE.MeshStandardMaterial({ color: "#d8d4cc", roughness: 1, emissive: "#3a3a44", emissiveIntensity: 0.4, fog: false }));
    moon.position.set(-900, 1250, -700);
    this.scene.add(moon);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -32; sc.right = 32; sc.top = 32; sc.bottom = -32; sc.near = 1; sc.far = 220;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
  }

  setShadows(size) {
    this.renderer.shadowMap.enabled = size > 0;
    this.sun.castShadow = size > 0;
    if (size > 0) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
  }

  buildClouds() {
    const R = (a, b) => a + Math.random() * (b - a);
    const puffs = [];
    const cluster = (x, y, z, size) => {
      const n = 4 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) puffs.push([x + R(-1, 1) * size * 1.4, y + R(-0.2, 0.4) * size * 0.6, z + R(-1, 1) * size, size * R(0.5, 1)]);
    };
    // A sea of cloud just below the floating isles, and a cloud floor under the junkyard.
    for (let i = 0; i < 260; i++) { const a = R(0, 6.28), r = R(20, 700); cluster(Math.cos(a) * r, R(238, 262), Math.sin(a) * r, R(8, 22)); }
    for (let i = 0; i < 220; i++) { const a = R(0, 6.28), r = R(60, 900); cluster(Math.cos(a) * r, R(395, 410), Math.sin(a) * r, R(14, 34)); }
    for (let i = 0; i < 110; i++) { const a = R(0, 6.28), r = R(120, 800); cluster(Math.cos(a) * r, R(140, 700), Math.sin(a) * r, R(6, 18)); }
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, emissive: "#8090a8", emissiveIntensity: 0.35, flatShading: false });
    const inst = new THREE.InstancedMesh(geo, mat, puffs.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    puffs.forEach(([x, y, z, s], i) => { m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s * 1.3, s * 0.6, s)); inst.setMatrixAt(i, m); });
    inst.receiveShadow = false;
    this.scene.add(inst);
    this.clouds = inst;
    // Solid cloud floors: seen from above as a sea of cloud, invisible from underneath.
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#dfe6f2"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, r = 10 + Math.random() * 30;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, "rgba(255,255,255,0.9)"); grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { g.save(); g.translate(ox, oy); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore(); }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); t.colorSpace = THREE.SRGBColorSpace;
    const floorMat = new THREE.MeshStandardMaterial({ map: t, roughness: 1, emissive: "#9aa8c0", emissiveIntensity: 0.3 });
    for (const y of [244, 398]) {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = y;
      this.scene.add(floor);
    }
  }

  buildCity() {
    // The ground and a city around the start (kept clear of where the route climbs).
    const groundTex = (() => {
      const c = document.createElement("canvas"); c.width = c.height = 256;
      const g = c.getContext("2d");
      g.fillStyle = "#2a2a2e"; g.fillRect(0, 0, 256, 256);
      g.fillStyle = "#3a3a40"; g.fillRect(0, 0, 256, 34); g.fillRect(0, 0, 34, 256);
      g.fillStyle = "#c8b040"; for (let x = 40; x < 256; x += 30) g.fillRect(x, 16, 14, 2);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 60); t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const list = [];
    for (let i = 0; i < 700; i++) {
      const a = Math.random() * Math.PI * 2, r = 58 + Math.pow(Math.random(), 0.7) * 650;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = (12 + Math.random() * 50) * (r < 200 ? 1 : 1.4) * (Math.random() < 0.08 ? 2.2 : 1);
      list.push([x, z, 8 + Math.random() * 14, h, 8 + Math.random() * 14, Math.random() * 3]);
    }
    for (const k of [1, 2, 3]) {
      const mine = list.filter((_, i) => i % 3 === k - 1);
      const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.cityMat(k), mine.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion();
      mine.forEach(([x, z, w, h, d, rot], i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot); m.compose(new THREE.Vector3(x, h / 2, z), q, new THREE.Vector3(w, h, d)); inst.setMatrixAt(i, m); });
      inst.receiveShadow = true;
      this.scene.add(inst);
    }
  }

  // Buildings far away: a copy of the facade material with windows scaled to building size.
  cityMat(k) {
    const m = this.M["bldg" + k].clone();
    m.map = m.map.clone(); m.emissiveMap = m.emissiveMap.clone();
    m.map.repeat.set(2, 4); m.emissiveMap.repeat.set(2, 4);
    m.map.needsUpdate = m.emissiveMap.needsUpdate = true;
    return m;
  }

  buildScenery() {
    const R = (a, b) => a + Math.random() * (b - a);
    // Distant floating islands around the isles zone.
    const isleMat = this.M.grass, rockMat = this.M.rock;
    for (let i = 0; i < 40; i++) {
      const a = R(0, 6.28), r = R(130, 520), y = R(270, 440), s = R(6, 22);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(s, s * 0.9, s * 0.25, 10), isleMat);
      const under = new THREE.Mesh(new THREE.ConeGeometry(s * 0.9, s * 2, 8), rockMat);
      under.rotation.x = Math.PI; under.position.y = -s * 1.1;
      const g = new THREE.Group(); g.add(top, under);
      if (Math.random() < 0.6) { const t = new THREE.Mesh(new THREE.IcosahedronGeometry(s * 0.3, 1), this.M.leaf); t.position.set(s * 0.3, s * 0.35, 0); g.add(t); }
      g.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      this.scene.add(g);
    }
    // Snowy peaks rising through the clouds around the ice zone.
    const peakMat = new THREE.MeshStandardMaterial({ color: "#8a98b0", roughness: 1, flatShading: true });
    const snowMat = new THREE.MeshStandardMaterial({ color: "#f4f8ff", roughness: 1, flatShading: true });
    for (let i = 0; i < 26; i++) {
      const a = R(0, 6.28), r = R(500, 1300), h = R(250, 420), w = R(110, 220);
      const peak = new THREE.Mesh(new THREE.ConeGeometry(w, h, 7), peakMat);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.36, h * 0.36, 7), snowMat);
      cap.position.y = h * 0.33;
      const g = new THREE.Group(); g.add(peak, cap);
      g.position.set(Math.cos(a) * r, 300 + h * 0.5 + R(0, 120), Math.sin(a) * r);
      g.rotation.y = R(0, 3);
      this.scene.add(g);
    }
    // Distant cranes on the construction site's skyline.
    for (let i = 0; i < 8; i++) {
      const a = R(0, 6.28), r = R(150, 300);
      const g = new THREE.Group();
      const mast = new THREE.Mesh(new THREE.BoxGeometry(3, 160, 3), this.M.lattice); mast.position.y = 80;
      const jib = new THREE.Mesh(new THREE.BoxGeometry(60, 2.5, 2.5), this.M.lattice); jib.position.set(18, 160, 0);
      g.add(mast, jib);
      g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); g.rotation.y = R(0, 6.28);
      this.scene.add(g);
    }
    // Aurora ribbons over the ice zone.
    this.auroraU = { time: { value: 0 }, strength: { value: 0 } };
    const aMat = new THREE.ShaderMaterial({
      uniforms: this.auroraU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform float time, strength;
        void main(){ float w = sin(vUv.x * 18.0 + time * 0.6) * 0.5 + sin(vUv.x * 7.0 - time * 0.3) * 0.5;
          float band = smoothstep(0.0, 0.35, vUv.y) * (1.0 - vUv.y) * (0.6 + 0.4 * w);
          vec3 c = mix(vec3(0.2, 1.0, 0.6), vec3(0.6, 0.3, 1.0), vUv.y);
          gl_FragColor = vec4(c * band * strength, band * strength); }`,
    });
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.PlaneGeometry(1600, 260, 60, 1);
      const pos = geo.attributes.position;
      for (let k = 0; k < pos.count; k++) pos.setZ(k, Math.sin(pos.getX(k) * 0.004 + i) * 200);
      const mesh = new THREE.Mesh(geo, aMat);
      mesh.position.set(R(-300, 300), 760 + i * 50, -900 + i * 120);
      mesh.rotation.y = R(-0.4, 0.4);
      this.scene.add(mesh);
    }
  }

  buildWeather() {
    // Rain streaks and snowflakes in a box that follows the camera.
    const n = 1400;
    const rain = new Float32Array(n * 6);
    this.rainData = [];
    for (let i = 0; i < n; i++) this.rainData.push([Math.random() * 60 - 30, Math.random() * 40 - 20, Math.random() * 60 - 30]);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(rain, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: "#9ab0d8", transparent: true, opacity: 0.35 }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
    const sn = new Float32Array(900 * 3);
    this.snowData = [];
    for (let i = 0; i < 900; i++) this.snowData.push([Math.random() * 50 - 25, Math.random() * 30 - 15, Math.random() * 50 - 25, Math.random() * 6]);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sn, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffffff", size: 0.12, transparent: true, opacity: 0.9 }));
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);
  }

  buildBeacon() {
    const top = this.course.top;
    if (!top) return;
    const mat = new THREE.MeshBasicMaterial({ color: "#ffe8b0", transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.5, 400, 20, 1, true), mat);
    this.beacon.position.set(top.x, top.y + 200, top.z);
    this.scene.add(this.beacon);
  }

  // Every frame: move the moving parts, the sky, weather and light to match where we are.
  update(dt, camera, focus) {
    this.time += dt;
    for (const d of this.dyn) {
      const c = d.c;
      d.obj.position.set(c.x, c.y, c.z);
      d.obj.rotation.y = c.yaw;
      if (c.surf === "crumble") {
        d.obj.visible = !c.off;
        if (c.crumbleT > 0 && !c.off) { d.obj.position.x += (Math.random() - 0.5) * 0.08; d.obj.position.z += (Math.random() - 0.5) * 0.08; }
      }
    }
    for (const s of this.spinners) s.rotation.y += dt * 9;
    for (const m of this.flows) {
      if (!m.map) continue;
      if (m.userData.flowX) m.map.offset.x -= dt * m.userData.flow * 0.5; else m.map.offset.y += dt * m.userData.flow * 0.3;
    }

    const A = atmosAt(focus.y);
    this.A = A;
    const u = this.skyU;
    u.top.value.copy(A.top); u.hor.value.copy(A.hor); u.bot.value.copy(A.bot); u.sunCol.value.copy(A.sun);
    u.stars.value = A.stars; u.time.value = this.time; u.planet.value = THREE.MathUtils.smoothstep(focus.y, 700, 820);
    const el = THREE.MathUtils.degToRad(A.sunEl), az = THREE.MathUtils.degToRad(A.sunAz);
    const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    u.sunDir.value.copy(dir);
    this.sky.position.copy(camera.position);
    this.scene.fog.color.copy(A.hor).lerp(A.top, 0.15);
    this.scene.fog.density = A.fog;
    // Keep the sun's shadow box around the climber.
    const lightDir = new THREE.Vector3(dir.x, Math.max(dir.y, 0.35), dir.z).normalize();
    this.sun.position.set(focus.x + lightDir.x * 100, focus.y + lightDir.y * 100, focus.z + lightDir.z * 100);
    this.sun.target.position.copy(focus);
    this.sun.color.copy(A.sun);
    this.sun.intensity = A.sunI;
    this.hemi.color.copy(A.sky); this.hemi.groundColor.copy(A.gnd); this.hemi.intensity = A.hemiI;
    this.renderer.toneMappingExposure = A.exp;
    if (this.auroraU) { this.auroraU.time.value = this.time; this.auroraU.strength.value = A.aurora || 0; }
    if (this.beacon) this.beacon.material.opacity = 0.12 + 0.06 * Math.sin(this.time * 2);

    // Weather
    const cp = camera.position;
    this.rain.visible = A.rain > 0.02;
    if (this.rain.visible) {
      const pos = this.rain.geometry.attributes.position.array;
      this.rainData.forEach((r, i) => {
        r[1] -= dt * 28;
        if (r[1] < -20) r[1] += 40;
        const x = cp.x + r[0], y = cp.y + r[1], z = cp.z + r[2];
        pos.set([x, y, z, x + 0.05, y + 0.9, z], i * 6);
      });
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.opacity = 0.35 * A.rain;
    }
    this.snow.visible = (A.snow || 0) > 0.02;
    if (this.snow.visible) {
      const pos = this.snow.geometry.attributes.position.array;
      this.snowData.forEach((s, i) => {
        s[1] -= dt * 1.6;
        if (s[1] < -15) s[1] += 30;
        pos.set([cp.x + s[0] + Math.sin(this.time + s[3]) * 0.6, cp.y + s[1], cp.z + s[2] + Math.cos(this.time * 0.7 + s[3]) * 0.6], i * 3);
      });
      this.snow.geometry.attributes.position.needsUpdate = true;
      this.snow.material.opacity = 0.9 * A.snow;
    }
  }
}

export { atmosAt, ZONES, TOP_Y };
