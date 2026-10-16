// Real-photo AR object: the restaurant's own top-down photo of a dish, cut out and laid flat at real size.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';
window.exportPhoto = async (src, widthM) => {
  const img = await new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = src; });
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
  const h = widthM * img.height / img.width;
  const g = new THREE.PlaneGeometry(widthM, h); g.rotateX(-Math.PI / 2);
  // flipY=false: flip v so the photo is not mirrored
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m); mesh.position.y = 0.003; mesh.name = 'DishPhoto';
  const scene = new THREE.Scene(); scene.add(mesh); scene.updateMatrixWorld(true);
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true, maxTextureSize: 2048 });
  const usdz = await new USDZExporter().parseAsync(scene, { quickLookCompatible: true });
  const b64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  return { glb: b64(glb), usdz: b64(usdz.buffer ?? usdz), h };
};
window.ready = true;
