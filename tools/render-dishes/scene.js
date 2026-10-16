// MENUVERSE sample-dish renderer.
// Builds stylised, procedurally generated dishes in three.js and renders a
// turntable sequence (N frames, dish rotating under fixed studio lights),
// exactly like a real 360° food-photography rig would produce.
// Output is SAMPLE content only: no real restaurant food or photos are used.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const SIZE = 900;          // output px
const SS = 2;              // supersampling factor
const ELEVATION = 34;      // camera elevation in degrees

// ---------- deterministic noise ----------
let seed = 1;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a, b) => a + rand() * (b - a);
function hash(x, y, z) {
  let h = x * 374761393 + y * 668265263 + z * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const fade = t => t * t * (3 - 2 * t);
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return L(L(L(c(0,0,0), c(1,0,0), xf), L(c(0,1,0), c(1,1,0), xf), yf),
           L(L(c(0,0,1), c(1,0,1), xf), L(c(0,1,1), c(1,1,1), xf), yf), zf) * 2 - 1;
}
const fbm = (x, y, z, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f, z * f); a *= 0.5; f *= 2; } return s; };

function displace(geo, amp, freq, mask = () => 1) {
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = fbm(x * freq, y * freq, z * freq) * amp * mask(x, y, z);
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  geo.computeVertexNormals();
  return geo;
}

function canvasTex(draw, w = 512, h = 512, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
function speckle(base, spots, n = 3000, size = [1, 4]) {
  return canvasTex((g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const s = spots[Math.floor(rand() * spots.length)];
      g.fillStyle = s; g.globalAlpha = rr(0.15, 0.6);
      g.beginPath(); g.arc(rand() * w, rand() * h, rr(size[0], size[1]), 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  });
}
const mat = (o) => new THREE.MeshPhysicalMaterial({ roughness: 0.6, ...o });
function lathe(profile, seg = 96) { return new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), seg); }
function mesh(geo, m, cast = true) { const o = new THREE.Mesh(geo, m); o.castShadow = cast; o.receiveShadow = true; return o; }

// ---------- shared props ----------
function plate(radius = 1.75, color = '#f4f1ec', depth = 0.12) {
  const pr = [];
  const inner = radius * 0.62;
  pr.push([0, 0], [inner, 0]);
  for (let i = 0; i <= 12; i++) { const t = i / 12; pr.push([inner + (radius - inner) * t, depth * Math.pow(t, 1.6)]); }
  pr.push([radius + 0.02, depth + 0.015], [radius, depth + 0.03]);
  for (let i = 12; i >= 0; i--) { const t = i / 12; pr.push([inner + (radius - inner) * t - 0.01, depth * Math.pow(t, 1.6) + 0.03]); }
  pr.push([0, 0.03]);
  return mesh(lathe(pr, 128), mat({ color, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }), true);
}
function bowl(radius = 1.45, height = 0.75, color = '#ece6dc') {
  const pr = [[0, 0], [radius * 0.45, 0], [radius * 0.5, 0.06]];
  for (let i = 0; i <= 16; i++) { const t = i / 16; pr.push([radius * 0.5 + radius * 0.5 * Math.sin(t * Math.PI / 2), 0.06 + height * (1 - Math.cos(t * Math.PI / 2))]); }
  pr.push([radius + 0.03, height + 0.07]);
  for (let i = 16; i >= 0; i--) { const t = i / 16; pr.push([radius * 0.5 + (radius - 0.06) * 0.5 * Math.sin(t * Math.PI / 2) - 0.03, 0.12 + (height - 0.03) * (1 - Math.cos(t * Math.PI / 2))]); }
  pr.push([0, 0.12]);
  return mesh(lathe(pr, 128), mat({ color, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
}
function leaf(len = 0.5, wid = 0.22, color = '#3f8a2e', curl = 0.12) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.quadraticCurveTo(wid, len * 0.45, 0, len); s.quadraticCurveTo(-wid, len * 0.45, 0, 0);
  const g = new THREE.ShapeGeometry(s, 16);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, curl * (x * x) / (wid * wid) - 0.08 * Math.sin(y / len * Math.PI)); }
  g.computeVertexNormals(); g.rotateX(-Math.PI / 2);
  const tex = canvasTex((c, w, h) => { const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, color); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, color); c.fillStyle = color; c.fillRect(0, 0, w, h); c.globalAlpha = 0.25; c.fillStyle = '#d6f5b0'; c.fillRect(w * 0.49, 0, w * 0.02, h); });
  return mesh(g, mat({ color: '#ffffff', map: tex, side: THREE.DoubleSide, roughness: 0.45, sheen: 0.4 }), true);
}

// ---------- dishes ----------
function burger() {
  const g = new THREE.Group();
  // walnut board
  const wood = canvasTex((c, w, h) => { c.fillStyle = '#6b4428'; c.fillRect(0, 0, w, h); for (let i = 0; i < 160; i++) { c.strokeStyle = rand() > .5 ? '#4e2f1a' : '#8a5a36'; c.globalAlpha = rr(.1, .4); c.lineWidth = rr(1, 4); c.beginPath(); const y = rand() * h; c.moveTo(0, y); for (let x = 0; x < w; x += 32) c.lineTo(x, y + Math.sin(x / 60 + i) * 6); c.stroke(); } });
  const board = mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.14, 96), mat({ map: wood, roughness: 0.55, clearcoat: .3 }));
  board.position.y = 0.07; g.add(board);
  const y0 = 0.14;
  const bunTex = canvasTex((c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7a3b10'); gr.addColorStop(.55, '#c4772e'); gr.addColorStop(1, '#f0c27a'); c.fillStyle = gr; c.fillRect(0, 0, w, h); for (let i = 0; i < 1500; i++) { c.fillStyle = '#5a2a08'; c.globalAlpha = rr(0, .12); c.beginPath(); c.arc(rand() * w, rand() * h * .6, rr(2, 10), 0, 7); c.fill(); } });
  // bottom bun
  const bb = []; for (let i = 0; i <= 10; i++) { const t = i / 10; bb.push([0.98 + 0.08 * Math.sin(t * Math.PI), t * 0.32]); } bb.unshift([0, 0]); bb.push([0, 0.32]);
  const bottom = mesh(displace(lathe(bb), 0.015, 3), mat({ color: '#e8a85a', roughness: .7 })); bottom.position.y = y0; g.add(bottom);
  // lettuce frill
  const lg = new THREE.CircleGeometry(1.12, 160, 0); const lp = lg.attributes.position;
  for (let i = 0; i < lp.count; i++) { const x = lp.getX(i), y = lp.getY(i), r = Math.hypot(x, y), a = Math.atan2(y, x); lp.setZ(i, r > .8 ? -Math.pow((r - .8) * 2.4, 2) * .25 + Math.sin(a * 17) * .05 * (r - .8) * 3 : 0); }
  lg.rotateX(-Math.PI / 2); lg.computeVertexNormals();
  const lettuce = mesh(lg, mat({ color: '#6fb33a', side: THREE.DoubleSide, roughness: .4, sheen: .5 })); lettuce.position.y = y0 + 0.34; g.add(lettuce);
  // tomato slices
  for (const [x, z] of [[-0.42, 0.2], [0.45, -0.1], [0.0, -0.5]]) {
    const t = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.07, 48), mat({ color: '#d9352b', roughness: .25, clearcoat: .6 }));
    t.position.set(x, y0 + 0.39, z); g.add(t);
  }
  // patty
  const pp = [[0, 0]]; for (let i = 0; i <= 12; i++) { const t = i / 12; pp.push([1.02 + 0.06 * Math.sin(t * Math.PI), t * 0.3]); } pp.push([0, 0.3]);
  const pattyTex = speckle('#4a2414', ['#2a120a', '#6e3a20', '#1a0a04'], 9000, [1, 3]);
  const patty = mesh(displace(lathe(pp), 0.05, 5), mat({ map: pattyTex, roughness: .85 })); patty.position.y = y0 + 0.43; g.add(patty);
  // cheese
  const cg = new THREE.PlaneGeometry(2.05, 2.05, 48, 48); cg.rotateX(-Math.PI / 2); const cp = cg.attributes.position;
  for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), z = cp.getZ(i); const r = Math.hypot(x, z); const over = Math.max(0, r - 0.95); cp.setXYZ(i, x * (r > .95 ? (0.95 + over * .4) / r : 1), -over * over * 2.2 - over * .4, z * (r > .95 ? (0.95 + over * .4) / r : 1)); }
  cg.computeVertexNormals(); cg.rotateY(Math.PI / 4);
  const cheese = mesh(cg, mat({ color: '#f5a524', roughness: .35, side: THREE.DoubleSide, clearcoat: .4, sheen: .3 })); cheese.position.y = y0 + 0.75; g.add(cheese);
  // top bun
  const tb = [[0, 0]]; for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI / 2; tb.push([1.08 * Math.cos(a) + 0.0, 0.08 + 0.72 * Math.sin(a)]); }
  const topG = displace(lathe(tb.map(([x, y], i) => i === 0 ? [x, y] : [Math.max(0.0001, x), y])), 0.02, 2.5);
  // uv-mapped gradient: lathe uv.y follows profile
  const top = mesh(topG, mat({ map: bunTex, roughness: .45, clearcoat: .5, clearcoatRoughness: .3 })); top.position.y = y0 + 0.79; g.add(top);
  // sesame
  const seedG = new THREE.SphereGeometry(0.03, 10, 8); seedG.scale(1, 0.45, 1.8);
  const seedM = mat({ color: '#f6e7c4', roughness: .5 });
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2, el = Math.acos(rr(0.35, 1)); // biased to top
    const x = 1.08 * Math.sin(el) * Math.cos(a), z = 1.08 * Math.sin(el) * Math.sin(a), y = 0.08 + 0.72 * Math.cos(el);
    const s = mesh(seedG, seedM, false); s.position.set(x, y0 + 0.79 + y + 0.01, z);
    s.lookAt(new THREE.Vector3(x * 2, y0 + 0.79 + (y - 0.08) * 2 / (0.72 / 1.08) + 0.08, z * 2)); s.rotateX(Math.PI / 2); s.rotateY(rand() * 3);
    g.add(s);
  }
  // fries cone
  const fryM = mat({ color: '#f2c14e', roughness: .55 });
  for (let i = 0; i < 9; i++) {
    const f = mesh(new THREE.BoxGeometry(0.09, 0.09, rr(0.7, 1.0)), fryM);
    f.position.set(rr(-1.55, -1.05), 0.2, rr(0.6, 1.15)); f.rotation.y = rr(-0.6, 0.6) + 0.8; f.rotation.x = rr(-.05, .05);
    if (i > 5) f.position.y = 0.29;
    g.add(f);
  }
  const ram = bowl(0.42, 0.24, '#ffffff'); ram.position.set(1.25, 0.14, 0.95); g.add(ram);
  const ketchup = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.02, 48), mat({ color: '#b3170e', roughness: .15, clearcoat: 1 })); ketchup.position.set(1.25, 0.14 + 0.25, 0.95); g.add(ketchup);
  return g;
}

function spaghetti() {
  const g = new THREE.Group();
  g.add(bowl(1.55, 0.55, '#2f3a44'));
  const pasta = mat({ color: '#f2d38a', roughness: .42, clearcoat: .5, clearcoatRoughness: .4 });
  const mound = r => 0.55 + 0.42 * Math.max(0, 1 - (r / 1.15) ** 2);
  for (let k = 0; k < 46; k++) {
    const pts = []; let a = rand() * Math.PI * 2; let r = rr(0.05, 0.3); const dir = rand() > .5 ? 1 : -1;
    for (let i = 0; i < 40; i++) { a += dir * rr(0.18, 0.32); r = Math.min(1.12, r + rr(-0.02, 0.05)); const x = r * Math.cos(a), z = r * Math.sin(a); pts.push(new THREE.Vector3(x, mound(r) + rr(-0.03, 0.03), z)); }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.026, 6, false);
    g.add(mesh(tube, pasta));
  }
  const sauce = mat({ color: '#b8261a', roughness: .2, clearcoat: 1, clearcoatRoughness: .1 });
  const sg = displace(new THREE.SphereGeometry(0.55, 64, 32), 0.08, 3); sg.scale(1, 0.32, 1);
  const s = mesh(sg, sauce); s.position.set(0.05, 0.98, -0.02); g.add(s);
  for (let i = 0; i < 6; i++) { const b = mesh(new THREE.SphereGeometry(rr(.08, .14), 24, 16), sauce); const a = rand() * 6.28; b.scale.y = .5; b.position.set(Math.cos(a) * rr(.45, .75), 0.85 + rr(0, .05), Math.sin(a) * rr(.45, .75)); g.add(b); }
  for (let i = 0; i < 3; i++) { const l = leaf(0.55, 0.24, '#2f7d1f'); l.position.set(rr(-.15, .2), 1.12, rr(-.15, .15)); l.rotation.y = i * 2.1 + .4; l.rotation.z = .25; g.add(l); }
  const parm = mat({ color: '#fbf3dc', roughness: .7 });
  for (let i = 0; i < 26; i++) { const p = mesh(new THREE.BoxGeometry(rr(.04, .12), .015, rr(.04, .1)), parm, false); const a = rand() * 6.28, r = rr(0, .7); p.position.set(Math.cos(a) * r, mound(r) + .08, Math.sin(a) * r); p.rotation.set(rr(-.5, .5), rand() * 3, rr(-.5, .5)); g.add(p); }
  return g;
}

function salmon() {
  const g = new THREE.Group();
  g.add(plate(1.85, '#f6f3ee'));
  // fillet: rounded slab with fat-line texture and seared top
  const shape = new THREE.Shape(); const L = 1.15, W = 0.42, R = 0.3;
  shape.moveTo(-L + R, -W); shape.lineTo(L - R, -W); shape.quadraticCurveTo(L, -W, L, -W + R); shape.lineTo(L, W - R); shape.quadraticCurveTo(L, W, L - R, W); shape.lineTo(-L + R, W); shape.quadraticCurveTo(-L, W, -L, W - R); shape.lineTo(-L, -W + R); shape.quadraticCurveTo(-L, -W, -L + R, -W);
  const fg = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 8, curveSegments: 24 });
  fg.rotateX(-Math.PI / 2); displace(fg, 0.02, 4);
  const ft = canvasTex((c, w, h) => { c.fillStyle = '#f07d4c'; c.fillRect(0, 0, w, h); c.strokeStyle = '#ffd9c4'; for (let i = -10; i < 30; i++) { c.globalAlpha = rr(.35, .7); c.lineWidth = rr(3, 7); c.beginPath(); c.moveTo(i * 28, 0); c.bezierCurveTo(i * 28 + 40, h * .3, i * 28 - 20, h * .7, i * 28 + 30, h); c.stroke(); } c.globalAlpha = .55; const gr = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * .5); gr.addColorStop(0, 'rgba(160,70,20,0.0)'); gr.addColorStop(1, 'rgba(120,50,15,0.7)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
  ft.repeat.set(0.45, 0.9);
  const fillet = mesh(fg, mat({ map: ft, roughness: .35, clearcoat: .6, clearcoatRoughness: .35, sheen: .3 }));
  fillet.position.set(0.1, 0.24, 0.18); fillet.rotation.y = 0.35; g.add(fillet);
  // crispy skin hint on top: herb crust specks
  for (let i = 0; i < 40; i++) { const c = mesh(new THREE.SphereGeometry(.018, 6, 4), mat({ color: rand() > .5 ? '#2e6b1f' : '#1b1b16' }), false); c.position.set(rr(-.85, 1.0), .66, rr(-.15, .45)); c.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0); g.add(c); }
  // asparagus
  const asp = mat({ color: '#5f9a35', roughness: .4, clearcoat: .4 }); const tip = mat({ color: '#476f2a', roughness: .5 });
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Group();
    const stem = mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.7, 16), asp); stem.rotation.z = Math.PI / 2; sp.add(stem);
    const t = mesh(displace(new THREE.ConeGeometry(0.085, 0.26, 16, 6), .015, 12), tip); t.rotation.z = -Math.PI / 2; t.position.x = 0.95; sp.add(t);
    sp.position.set(-0.05 + i * 0.03, 0.2 + (i % 2) * 0.1, -0.62 - i * 0.14 + (i % 2) * .05); sp.rotation.y = -0.25 + i * 0.03; g.add(sp);
  }
  // lemon wedge
  const lw = new THREE.SphereGeometry(0.38, 48, 24, 0, Math.PI / 2.2); lw.scale(1, .75, 1.4);
  const lemon = mesh(lw, mat({ color: '#f7d33c', roughness: .35, clearcoat: .5, side: THREE.DoubleSide })); lemon.position.set(-1.0, 0.18, 0.75); lemon.rotation.set(0, 2.6, Math.PI / 2); g.add(lemon);
  // sauce dots
  for (let i = 0; i < 7; i++) { const d = mesh(new THREE.SphereGeometry(rr(.05, .09), 24, 12), mat({ color: '#e8d27a', roughness: .15, clearcoat: 1 })); d.scale.y = .4; const a = 0.6 + i * 0.28; d.position.set(Math.cos(a) * 1.25, 0.2, Math.sin(a) * 1.25); g.add(d); }
  // microgreens
  for (let i = 0; i < 7; i++) { const l = leaf(.18, .07, '#7bc043', .04); l.position.set(rr(-.3, .5), .67, rr(.05, .35)); l.rotation.set(rr(-.6, .2), rand() * 6, rr(-.3, .3)); g.add(l); }
  return g;
}

function chocolateDome() {
  const g = new THREE.Group();
  g.add(plate(1.7, '#22252a', 0.08));
  const base = mesh(displace(new THREE.CylinderGeometry(0.78, 0.8, 0.14, 64), 0.01, 8), mat({ map: speckle('#8a5a2b', ['#5e3a18', '#b07a40'], 6000, [1, 3]), roughness: .9 }));
  base.position.y = 0.17; g.add(base);
  const dome = mesh(new THREE.SphereGeometry(0.72, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2), mat({ color: '#3b1d10', roughness: .08, clearcoat: 1, clearcoatRoughness: .03, metalness: 0.05 }));
  dome.position.y = 0.24; g.add(dome);
  // glaze drip ring
  const drip = mesh(displace(new THREE.TorusGeometry(0.72, 0.03, 12, 96), .02, 6), mat({ color: '#3b1d10', roughness: .08, clearcoat: 1 })); drip.rotation.x = Math.PI / 2; drip.position.y = 0.25; g.add(drip);
  // raspberries
  const rasp = mat({ color: '#c0183c', roughness: .3, clearcoat: .7, sheen: .6, sheenColor: new THREE.Color('#ff8fa8') });
  function berry() { const b = new THREE.Group(); for (let i = 0; i < 46; i++) { const u = rand(), v = rand(); const th = u * Math.PI * 2, ph = Math.acos(1 - v * 1.6); const s = mesh(new THREE.SphereGeometry(0.045, 10, 8), rasp, false); s.position.set(Math.sin(ph) * Math.cos(th) * .13, Math.cos(ph) * .17, Math.sin(ph) * Math.sin(th) * .13); b.add(s); } return b; }
  const top = berry(); top.position.y = 0.98; g.add(top);
  for (const [x, z] of [[1.05, 0.35], [0.95, 0.62], [1.22, 0.58]]) { const b = berry(); b.position.set(x, 0.24, z); b.rotation.z = Math.PI / 2.2; b.rotation.y = rand() * 3; g.add(b); }
  // gold leaf
  const gold = mat({ color: '#e7c06a', metalness: 1, roughness: .25, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) { const p = mesh(displace(new THREE.PlaneGeometry(.12, .09, 4, 4), .02, 20), gold, false); p.position.set(rr(-.1, .12), .99 + rr(0, .06), rr(-.12, .12)); p.rotation.set(rr(-1, 1), rr(0, 3), rr(-1, 1)); g.add(p); }
  // sauce swoosh
  const pts = []; for (let i = 0; i <= 30; i++) { const t = i / 30; const a = -2.4 + t * 1.9; pts.push(new THREE.Vector3(Math.cos(a) * (1.15 + t * .1), 0.11, Math.sin(a) * (1.15 + t * .1))); }
  const sw = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.07, 12); sw.scale(1, .35, 1);
  const swoosh = mesh(sw, mat({ color: '#8f0f26', roughness: .1, clearcoat: 1 })); swoosh.position.y = 0.07; g.add(swoosh);
  const mint = leaf(.32, .13, '#3d9a3d'); mint.position.set(-.05, 1.05, .05); mint.rotation.set(-.4, .8, .2); g.add(mint);
  const mint2 = leaf(.28, .12, '#3d9a3d'); mint2.position.set(.05, 1.03, -.02); mint2.rotation.set(-.3, 3.6, -.2); g.add(mint2);
  return g;
}

function burrata() {
  const g = new THREE.Group();
  g.add(plate(1.8, '#f2efe8', 0.1));
  const cream = mat({ color: '#fbf8f1', roughness: .32, clearcoat: .5, clearcoatRoughness: .3, sheen: .5 });
  const bg = displace(new THREE.SphereGeometry(0.62, 96, 64), 0.05, 2.2); bg.scale(1, .78, 1);
  const b = mesh(bg, cream); b.position.y = 0.55; g.add(b);
  // torn top knot
  const knot = mesh(displace(new THREE.SphereGeometry(0.16, 32, 16), .05, 6), cream); knot.position.set(0.05, 1.05, -0.03); knot.scale.y = .7; g.add(knot);
  // olive oil pool
  const oil = mesh(displace(new THREE.CircleGeometry(1.05, 96), .04, 2), mat({ color: '#b39b2a', roughness: .03, clearcoat: 1, transparent: true, opacity: .55 }), false);
  oil.rotation.x = -Math.PI / 2; oil.position.y = 0.04; g.add(oil);
  // heirloom tomatoes
  const cols = ['#d9302a', '#f2a51f', '#e04b2c', '#7a2a2a', '#f4c430', '#c62828'];
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + rr(-.1, .1), r = rr(1.0, 1.2);
    const t = new THREE.SphereGeometry(rr(.17, .24), 32, 16, 0, Math.PI * 2, 0, Math.PI / 2); t.scale(1, .8, 1);
    const tm = mesh(t, mat({ color: cols[i % cols.length], roughness: .18, clearcoat: 1 }));
    tm.position.set(Math.cos(a) * r, 0.04, Math.sin(a) * r); g.add(tm);
    const cut = mesh(new THREE.CircleGeometry(.2, 24), mat({ color: '#ff9b7a', roughness: .3 }), false); cut.rotation.x = -Math.PI / 2; cut.position.copy(tm.position); cut.position.y = .04; g.add(cut);
  }
  for (let i = 0; i < 6; i++) { const l = leaf(.42, .2, '#2f8a22'); const a = i * 1.05 + .3; l.position.set(Math.cos(a) * .82, .16, Math.sin(a) * .82); l.rotation.y = -a + Math.PI / 2; l.rotation.x = -.1; g.add(l); }
  const pep = mat({ color: '#1d1b18', roughness: .8 });
  for (let i = 0; i < 40; i++) { const p = mesh(new THREE.SphereGeometry(.015, 5, 4), pep, false); const a = rand() * 6.28, r = rr(0, .5); p.position.set(Math.cos(a) * r, .55 + Math.sqrt(Math.max(0, .62 * .62 - r * r)) * .78, Math.sin(a) * r); g.add(p); }
  return g;
}


function steakFrites() {
  const g = new THREE.Group();
  g.add(plate(1.85, '#efe9e0'));
  // sliced steak fan: each slice a rounded box, seared outside, pink inside
  const crust = mat({ map: speckle('#5a2a16', ['#2b1208', '#7a3f22'], 7000, [1, 3]), roughness: .7, clearcoat: .3 });
  const pink = canvasTex((c, w, h) => { const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#6b2c18'); gr.addColorStop(.12, '#b4483c'); gr.addColorStop(.5, '#d9706a'); gr.addColorStop(.88, '#b4483c'); gr.addColorStop(1, '#6b2c18'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
  const inside = mat({ map: pink, roughness: .45, clearcoat: .5 });
  for (let i = 0; i < 7; i++) {
    const sl = mesh(displace(new THREE.BoxGeometry(0.17, 0.34, 1.0, 2, 4, 8), .012, 6), [crust, crust, crust, crust, crust, crust]);
    const face = mesh(new THREE.PlaneGeometry(1.0, 0.34), inside, false); face.rotation.y = -Math.PI / 2; face.position.x = -0.0851; sl.add(face); const f2 = face.clone(); f2.rotation.y = Math.PI / 2; f2.position.x = 0.0851; sl.add(f2);
    sl.position.set(-0.6 + i * 0.19, 0.24, -0.1 - Math.sin(i / 6 * Math.PI) * 0.08); sl.rotation.z = 1.0; sl.rotation.y = 0.15 - i * 0.03;
    g.add(sl);
  }
  // butter-herb sauce over the slices
  const sauce = mat({ color: '#c9b84a', roughness: .08, clearcoat: 1, transparent: true, opacity: .92 });
  const sg = displace(new THREE.CylinderGeometry(0.62, 0.66, 0.03, 64, 1), .02, 4); sg.scale(1.35, 1, .55);
  const s = mesh(sg, sauce, false); s.position.set(0, 0.14, -0.1); g.add(s);
  for (let i = 0; i < 40; i++) { const h = mesh(new THREE.SphereGeometry(.016, 5, 4), mat({ color: '#3f6b25' }), false); h.position.set(rr(-.6, .6), .36, rr(-.5, .3)); g.add(h); }
  // fries pile
  const fryM = mat({ map: speckle('#f0b947', ['#c98a2a', '#ffd877'], 2000, [1, 3]), roughness: .55 });
  for (let i = 0; i < 34; i++) {
    const f = mesh(new THREE.BoxGeometry(0.075, 0.075, rr(0.55, 0.85)), fryM);
    f.position.set(rr(-.55, .55), 0.1 + Math.floor(i / 12) * 0.07 + rr(0, .03), rr(0.55, 0.95)); f.rotation.set(rr(-.15, .15), rr(-.5, .5) + (i % 2) * 1.4, rr(-.1, .1));
    g.add(f);
  }
  const ram = bowl(0.36, 0.22, '#ffffff'); ram.position.set(1.15, 0.13, -0.75); g.add(ram);
  const sb = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 48), sauce); sb.position.set(1.15, 0.33, -0.75); g.add(sb);
  return g;
}

const DISHES = { steakFrites, burger, spaghetti, salmon, chocolateDome, burrata };

// ---------- studio ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(SIZE * SS, SIZE * SS);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const key = new THREE.DirectionalLight(0xfff1e0, 2.6); key.position.set(-3.5, 7, 3); key.castShadow = true;
key.shadow.mapSize.set(4096, 4096); key.shadow.radius = 6; key.shadow.bias = -0.0004;
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 });
scene.add(key);
const rim = new THREE.DirectionalLight(0xffd7b0, 1.2); rim.position.set(4, 3, -5); scene.add(rim);
scene.add(new THREE.HemisphereLight(0xfff6ea, 0x3a2a20, 0.35));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.38 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
let current = null;

window.loadDish = (name, s = 7) => {
  seed = s;
  if (current) scene.remove(current);
  current = DISHES[name]();
  scene.add(current);
  // frame the dish: fit bounding sphere
  const box = new THREE.Box3().setFromObject(current);
  const sph = box.getBoundingSphere(new THREE.Sphere());
  const dist = sph.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.8;
  const el = THREE.MathUtils.degToRad(ELEVATION);
  const target = new THREE.Vector3(0, sph.center.y * 0.8, 0);
  camera.position.set(0, target.y + Math.sin(el) * dist, Math.cos(el) * dist);
  camera.lookAt(target);
  return true;
};

const out = document.createElement('canvas'); out.width = out.height = SIZE;
window.renderFrame = (i, n, quality = 0.86, size = SIZE) => {
  current.rotation.y = -i / n * Math.PI * 2;
  renderer.render(scene, camera);
  out.width = out.height = size;
  const ctx = out.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(renderer.domElement, 0, 0, size, size);
  return out.toDataURL('image/webp', quality);
};
window.ready = true;
