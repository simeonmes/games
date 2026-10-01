// The climber: a small figure in a hoodie and beanie with a backpack, animated in code
// (running, jumping, falling, pulling up onto ledges, hanging from zip lines).
import * as THREE from "three";

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });

function limb(len, w, material) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(w, len - w * 2, 4, 8), material);
  m.position.y = -len / 2;
  m.castShadow = true;
  g.add(m);
  return g;
}

export class Climber {
  constructor() {
    const hoodie = mat("#e8743a"), pants = mat("#2a3a5a"), skin = mat("#f2c8a0"), shoe = mat("#f0f0f0"), dark = mat("#22242a"), beanie = mat("#2ab0a0"), pack = mat("#5a6a3a");
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = 0.95;
    root.add(body);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.32, 4, 10), hoodie);
    torso.position.y = 0.22; torso.scale.set(1.1, 1, 0.85); torso.castShadow = true;
    body.add(torso);
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.05), mat("#c85a2a"));
    pocket.position.set(0, 0.1, 0.17);
    body.add(pocket);
    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.38, 0.16), pack);
    backpack.position.set(0, 0.28, -0.22); backpack.castShadow = true;
    body.add(backpack);

    const head = new THREE.Group();
    head.position.y = 0.66;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), skin);
    face.castShadow = true;
    head.add(face);
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.9), beanie);
    hat.position.y = 0.03; head.add(hat);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat("#ffffff"));
    pom.position.y = 0.21; head.add(pom);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), dark);
      eye.position.set(s * 0.06, -0.01, 0.155); head.add(eye);
    }
    body.add(head);

    const arm = (s) => { const a = limb(0.5, 0.065, hoodie); a.position.set(s * 0.27, 0.42, 0); const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), skin); hand.position.y = -0.5; a.add(hand); body.add(a); return a; };
    const leg = (s) => {
      const l = limb(0.55, 0.08, pants); l.position.set(s * 0.11, 0, 0);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.26), shoe); foot.position.set(0, -0.56, 0.05); foot.castShadow = true;
      l.add(foot); body.add(l); return l;
    };
    this.parts = { body, head, armL: arm(-1), armR: arm(1), legL: leg(-1), legR: leg(1) };
    this.root = root;
    this.phase = 0;
    this.lean = 0;
  }

  // state: "idle" | "run" | "air" | "mantle" | "zip" | "fall"; speed in m/s.
  animate(dt, state, speed, vy) {
    const P = this.parts, t = performance.now() / 1000;
    let aL = 0, aR = 0, lL = 0, lR = 0, bob = 0, lean = 0, armOut = 0, head = 0;
    if (state === "run") {
      this.phase += dt * (4 + speed * 1.25);
      const s = Math.sin(this.phase), k = Math.min(1, speed / 6);
      lL = s * 0.9 * k; lR = -s * 0.9 * k; aL = -s * 0.8 * k; aR = s * 0.8 * k;
      bob = Math.abs(Math.cos(this.phase)) * 0.06 * k;
      lean = 0.18 * k;
    } else if (state === "idle") {
      bob = Math.sin(t * 2) * 0.01; aL = 0.05; aR = -0.05; head = Math.sin(t * 0.7) * 0.15;
    } else if (state === "air") {
      const up = vy > 0;
      lL = up ? -0.9 : -0.3; lR = up ? 0.3 : 0.5; aL = up ? -2.4 : -1.2; aR = up ? -0.6 : -1.6; armOut = 0.3;
    } else if (state === "fall") {
      const w = Math.sin(t * 14);
      lL = 0.4 + w * 0.5; lR = -0.4 - w * 0.5; aL = -2.6 + w * 0.6; aR = -2.6 - w * 0.6; armOut = 0.6;
    } else if (state === "mantle") {
      aL = aR = -2.8; lL = -1.2; lR = -0.2; lean = 0.4;
    } else if (state === "zip") {
      aL = aR = -3.0; lL = 0.25; lR = -0.25 + Math.sin(t * 6) * 0.1;
    }
    const k = 1 - Math.pow(0.0001, dt);
    const lerp = (o, key, v) => { o.rotation[key] += (v - o.rotation[key]) * k; };
    lerp(P.legL, "x", lL); lerp(P.legR, "x", lR);
    lerp(P.armL, "x", aL); lerp(P.armR, "x", aR);
    lerp(P.armL, "z", -armOut); lerp(P.armR, "z", armOut);
    lerp(P.body, "x", lean);
    lerp(P.head, "y", head);
    P.body.position.y = 0.95 + bob;
  }
}

// A rubber duck collectible.
export function makeDuck(M) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), M.duck);
  body.scale.set(1, 0.8, 1.25); body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), M.duck);
  head.position.set(0, 0.3, 0.16);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 8), M.beak);
  beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.28, 0.34);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 6), M.duck);
  tail.rotation.x = -Math.PI / 2.5; tail.position.set(0, 0.1, -0.36);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), new THREE.MeshBasicMaterial({ color: "#111" })); e.position.set(s * 0.08, 0.36, 0.29); g.add(e); }
  g.add(body, head, beak, tail);
  return g;
}

export function makeFlag(M) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), M.chrome);
  pole.position.y = 1.1;
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.03), M.flagOff);
  flag.position.set(0.36, 1.95, 0);
  g.add(pole, flag);
  g.userData.flag = flag;
  return g;
}
