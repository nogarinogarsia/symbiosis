import * as THREE from 'three';
import { buildCat, toon, disposeCat } from './cat3d.js';

export function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xfff3e0, 0xd9b99b, 1.05));
  const d = new THREE.DirectionalLight(0xfff0d8, 1.6); d.position.set(3, 6, 5); scene.add(d);
  const f = new THREE.DirectionalLight(0xffd9c0, 0.5); f.position.set(-4, 2, 3); scene.add(f);
}

function makeRug(r = 1.7) {
  const g = new THREE.Group();
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 40), toon(0xf3dcc0));
  rug.position.y = -0.03; g.add(rug);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.82, 0.03, 8, 48), toon(0xe9b8a0));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; g.add(ring);
  return g;
}

function heartTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#ff7d9b';
  g.beginPath(); g.moveTo(32, 56); g.bezierCurveTo(4, 36, 6, 8, 32, 20); g.bezierCurveTo(58, 8, 60, 36, 32, 56); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Stage {
  constructor(canvas, { transparent = true } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    addLights(this.scene);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    this.camera.position.set(0, 1.9, 5.6); this.camera.lookAt(0, 0.8, 0);
    this.rug = makeRug(); this.scene.add(this.rug);
    this.cats = []; this.extras = []; this.spin = 0; this.clock = new THREE.Clock(); this.anim = null;
    this.heart = heartTexture();
    this._drag = null;
    canvas.addEventListener('pointerdown', (e) => { this._drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (this._drag !== null) { this.spin += (e.clientX - this._drag) * 0.01; this._drag = e.clientX; } });
    canvas.addEventListener('pointerup', () => { this._drag = null; });
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement || canvas);
    this.resize();
    this.running = true;
    const loop = () => { if (!this.running) return; this.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  resize() {
    const p = this.canvas.parentElement || this.canvas;
    const w = Math.max(10, p.clientWidth), h = Math.max(10, p.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.wide = w / h;
  }
  clear() {
    for (const o of [...this.cats.map((c) => c.root), ...this.extras]) { this.scene.remove(o); disposeCat(o); }
    this.cats = []; this.extras = []; this.anim = null; this.spin = 0;
  }
  addCat(cat, x = 0, z = 0, face = 0) {
    const root = buildCat(cat);
    root.position.set(x, 0, z); root.rotation.y = face;
    this.scene.add(root);
    const entry = { cat, root, baseX: x, face };
    this.cats.push(entry);
    return entry;
  }
  showCat(cat) { this.clear(); this.rug.visible = true; this.addCat(cat, 0, 0, 0.0); this.camera.position.set(0, 1.8, 6.2); this.camera.lookAt(0, 0.9, 0); }
  showPair(f, m) {
    this.clear(); this.rug.visible = true;
    if (f) this.addCat(f, -1.25, 0, 0.35);
    if (m) this.addCat(m, 1.25, 0, -0.35);
    this.camera.position.set(0, 2.1, 9.2); this.camera.lookAt(0, 0.85, 0);
  }
  frame() {
    if (document.hidden || this.canvas.closest('[hidden]')) return;
    const t = this.clock.getElapsedTime();
    for (const c of this.cats) {
      c.root.userData.tick?.(t);
      if (!this.anim && this.cats.length === 1) c.root.rotation.y = c.face + this.spin;
    }
    if (this.anim) this.anim(t);
    this.renderer.render(this.scene, this.camera);
  }

  /* 교배 연출: 두 고양이가 집에 들어간 뒤, 잠시 두근두근 후 아기와 함께 등장 */
  playBreed(f, m, kitten) {
    return new Promise((resolve) => {
      this.clear(); this.rug.visible = true;
      this.camera.position.set(0, 2.3, 9.0); this.camera.lookAt(0, 0.9, 0);
      const house = new THREE.Group();
      const walls = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.2, 1.3), toon(0xf6e4c4)); walls.position.y = 0.6; house.add(walls);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.8, 4), toon(0xe58a6a)); roof.position.y = 1.6; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.8); house.add(roof);
      const door = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), toon(0x8a5a3c)); door.position.set(0, 0.34, 0.66); house.add(door);
      house.position.set(0, 0, -1.0); this.scene.add(house); this.extras.push(house);
      const A = this.addCat(f, -3.0, 0.2, Math.PI / 2), B = this.addCat(m, 3.0, 0.2, -Math.PI / 2);
      let K = null; const hearts = [];
      const start = this.clock.getElapsedTime();
      const finalK = { x: 0, z: 1.1 };
      this.anim = (now) => {
        const t = now - start;
        const walk = Math.min(1, t / 1.6);
        if (t < 1.8) {
          const e = walk * walk * (3 - 2 * walk);
          A.root.position.set(-3.0 + 2.75 * e, Math.abs(Math.sin(t * 9)) * 0.12 * (walk < 1), 0.2 - 1.15 * e);
          B.root.position.set(3.0 - 2.75 * e, Math.abs(Math.sin(t * 9 + 1)) * 0.12 * (walk < 1), 0.2 - 1.15 * e);
          if (t > 1.2) { const s = Math.max(0, 1 - (t - 1.2) / 0.6); A.root.scale.setScalar(s); B.root.scale.setScalar(s); }
        } else { A.root.visible = false; B.root.visible = false; }
        if (t > 1.8 && t < 3.6) {
          house.rotation.z = Math.sin(t * 26) * 0.03 * (1 - (t - 1.8) / 1.8);
          house.position.y = Math.abs(Math.sin(t * 6)) * 0.06;
          if (Math.random() < 0.18) {
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.heart, transparent: true }));
            sp.position.set((Math.random() - 0.5) * 1.2, 1.8, -1.0 + Math.random() * 0.6); sp.scale.setScalar(0.28 + Math.random() * 0.2);
            sp.userData.born = t; this.scene.add(sp); hearts.push(sp); this.extras.push(sp);
          }
        }
        for (const h of hearts) { h.position.y += 0.012; h.material.opacity = Math.max(0, 1 - (t - h.userData.born) / 1.6); }
        if (t > 3.6 && !K) {
          house.rotation.z = 0; house.position.y = 0;
          K = this.addCat(kitten, finalK.x, finalK.z, 0); K.root.scale.setScalar(0.01);
        }
        if (K) {
          const k = Math.min(1, (t - 3.6) / 0.7);
          const over = 1 + Math.sin(k * Math.PI) * 0.25;
          K.root.scale.setScalar(Math.max(0.01, k * over));
          K.root.position.y = Math.sin(Math.min(1, k) * Math.PI) * 0.5;
          this.camera.position.lerp(new THREE.Vector3(0, 1.9, 5.2), 0.03);
          this.camera.lookAt(0, 0.8, 0.4);
        }
        if (t > 5.0) { this.anim = null; this.clear(); this.showCat(kitten); resolve(); }
      };
    });
  }
}

/* 도감/목록용 썸네일: 공유 오프스크린 렌더러로 PNG 생성 후 캐시 */
let thumbR = null, thumbScene = null, thumbCam = null;
const thumbCache = new Map();
export function thumbnail(cat, size = 180) {
  const key = cat.seed + '|' + cat.catalogId + '|' + (cat.costume || '') + '|' + (cat.personality ?? 'b') + '|' + size;
  if (thumbCache.has(key)) return thumbCache.get(key);
  if (!thumbR) {
    const c = document.createElement('canvas');
    thumbR = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbR.setPixelRatio(1);
    thumbScene = new THREE.Scene(); addLights(thumbScene);
    thumbCam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  }
  thumbR.setSize(size, size, false);
  thumbCam.position.set(0, 1.6, 5.6); thumbCam.lookAt(0, 0.95, 0);
  const root = buildCat(cat);
  root.rotation.y = 0.35;
  root.userData.tick?.(0.2);
  thumbScene.add(root);
  thumbR.render(thumbScene, thumbCam);
  const url = thumbR.domElement.toDataURL('image/png');
  thumbScene.remove(root);
  disposeCat(root);
  if (thumbCache.size > 400) thumbCache.delete(thumbCache.keys().next().value);
  thumbCache.set(key, url);
  return url;
}
