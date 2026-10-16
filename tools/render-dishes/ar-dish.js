// Builds a real-scale (metres) 3D model of a beef skillet in a butter sauce, in the style
// of the Swiss Butter board, and exports it as GLB (Android/web) and USDZ (iPhone AR).
// This is a stand-in model for an AR test; the real one should come from a photo scan.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';

let seed = 11;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a, b) => a + rand() * (b - a);
function hash(x, y, z) { let h = x * 374761393 + y * 668265263 + z * 2147483647; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
const fade = (t) => t * t * (3 - 2 * t);
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const L = (a, b, t) => a + (b - a) * t, c = (a, b, d) => hash(xi + a, yi + b, zi + d);
  return L(L(L(c(0,0,0), c(1,0,0), xf), L(c(0,1,0), c(1,1,0), xf), yf), L(L(c(0,0,1), c(1,0,1), xf), L(c(0,1,1), c(1,1,1), xf), yf), zf) * 2 - 1;
}
const fbm = (x, y, z) => { let s = 0, a = .5, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, y * f, z * f); a *= .5; f *= 2; } return s; };
function displace(g, amp, freq) {
  g.computeVertexNormals(); const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), d = fbm(x * freq, y * freq, z * freq) * amp; p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d); }
  g.computeVertexNormals(); return g;
}
function tex(draw, w = 512, h = 512) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t;
}
const std = (o) => new THREE.MeshStandardMaterial({ roughness: .6, metalness: 0, ...o });

export function buildDish() {
  const g = new THREE.Group(); g.name = 'BeefSkillet';
  // cast-iron skillet, 21 cm across
  const R = 0.105, H = 0.032, T = 0.006;
  const prof = [[0, 0], [R - 0.012, 0], [R - 0.004, 0.004], [R, H], [R + 0.004, H + 0.002], [R - T, H], [R - T - 0.004, T + 0.006], [R - T - 0.014, T], [0, T]].map(([x, y]) => new THREE.Vector2(x, y));
  const iron = std({ color: '#1c1c1c', roughness: .55, metalness: .5 });
  const pan = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), iron); pan.name = 'Skillet'; g.add(pan);
  // handle with hanging hole
  const hs = new THREE.Shape(); hs.moveTo(0, -0.014); hs.lineTo(0.1, -0.012); hs.absarc(0.1, 0, 0.012, -Math.PI / 2, Math.PI / 2, false); hs.lineTo(0, 0.014); hs.lineTo(0, -0.014);
  const hole = new THREE.Path(); hole.absellipse(0.094, 0, 0.012, 0.006, 0, Math.PI * 2, true); hs.holes.push(hole);
  const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.008, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 3, curveSegments: 24 });
  hg.rotateX(Math.PI / 2); const handle = new THREE.Mesh(hg, iron); handle.position.set(R - 0.004, H - 0.004, 0); handle.rotation.z = 0.18; handle.name = 'Handle'; g.add(handle);

  // Swiss-Butter-style sauce, olive-mustard and glossy
  const sauceTex = tex((c, w, h) => { c.fillStyle = '#8f7f27'; c.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { c.fillStyle = rand() > .5 ? '#6f6219' : '#a8963a'; c.globalAlpha = rr(.05, .22); c.beginPath(); c.arc(rand() * w, rand() * h, rr(2, 9), 0, 7); c.fill(); } c.globalAlpha = .5; for (let i = 0; i < 120; i++) { c.fillStyle = '#3f4a1d'; c.beginPath(); c.arc(rand() * w, rand() * h, rr(.6, 1.6), 0, 7); c.fill(); } });
  const sg = displace(new THREE.CircleGeometry(R - T - 0.002, 96), 0.0012, 60); sg.rotateX(-Math.PI / 2);
  const sauce = new THREE.Mesh(sg, std({ map: sauceTex, roughness: .32, metalness: 0 })); sauce.position.y = 0.022; sauce.name = 'Sauce'; g.add(sauce);

  // sliced beef: a row of slices, grill-marked crust outside, medium inside
  const crust = tex((c, w, h) => { c.fillStyle = '#4a2416'; c.fillRect(0, 0, w, h); for (let i = 0; i < 5000; i++) { c.fillStyle = ['#2a120a', '#6a3420', '#1b0b05', '#7d4428'][Math.floor(rand() * 4)]; c.globalAlpha = rr(.2, .6); c.fillRect(rand() * w, rand() * h, rr(1, 4), rr(1, 4)); } c.globalAlpha = .85; c.strokeStyle = '#120804'; c.lineWidth = 14; for (let x = -w; x < w * 2; x += 70) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + h * .7, h); c.stroke(); } });
  const inside = tex((c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3b1a0f'); gr.addColorStop(.12, '#8a3b2b'); gr.addColorStop(.5, '#a8524a'); gr.addColorStop(.88, '#8a3b2b'); gr.addColorStop(1, '#3b1a0f'); c.fillStyle = gr; c.fillRect(0, 0, w, h); for (let i = 0; i < 2500; i++) { c.fillStyle = rand() > .5 ? '#c46a5c' : '#6e2a1f'; c.globalAlpha = rr(.05, .25); c.fillRect(rand() * w, rand() * h, rr(1, 3), rr(4, 12)); } });
  const crustM = std({ map: crust, roughness: .62 }), insideM = std({ map: inside, roughness: .38 });
  const beef = new THREE.Group(); beef.name = 'SlicedBeef';
  const N = 11;
  for (let i = 0; i < N; i++) {
    const len = 0.105 - Math.abs(i - N / 2) * 0.002, th = 0.0105, hgt = 0.024;
    const geo = displace(new THREE.BoxGeometry(th, hgt, len, 2, 6, 16), 0.0009, 140);
    const sl = new THREE.Mesh(geo, crustM);
    for (const sx of [-1, 1]) { const face = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.97, hgt * 0.9), insideM); face.rotation.y = sx * Math.PI / 2; face.position.x = sx * (th / 2 + 0.0004); sl.add(face); }
    sl.position.set(-0.058 + i * (th + 0.0006), 0.033, rr(-0.002, 0.002));
    sl.rotation.z = -0.42 + rr(-.04, .04); sl.rotation.y = rr(-.03, .03);
    beef.add(sl);
  }
  beef.rotation.y = 0.25; beef.position.set(-0.004, 0, -0.004); g.add(beef);
  // herb flecks on top
  const herbM = std({ color: '#3d5a1e', roughness: .6 });
  for (let i = 0; i < 40; i++) { const a = rand() * 6.28, r = rr(0, R - 0.02); const f = new THREE.Mesh(new THREE.SphereGeometry(0.0012, 5, 4), herbM); f.position.set(Math.cos(a) * r, 0.0235, Math.sin(a) * r); g.add(f); }
  return g;
}

export async function exportAll() {
  const dish = buildDish();
  const scene = new THREE.Scene(); scene.add(dish);
  scene.updateMatrixWorld(true);
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
  const usdz = await new USDZExporter().parseAsync(scene, { quickLookCompatible: true });
  const b64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  return { glb: b64(glb), usdz: b64(usdz.buffer ?? usdz) };
}
window.exportAll = exportAll;
window.ready = true;
