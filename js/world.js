// 3D 월드: 내 우리 + 이웃 우리 + 동물샵·교배집 건물. 플레이어가 걸어 다니며 다가가면 창이 열림.
import * as THREE from 'three';
import { behaviorOf, chooseActivity, ACTIVITY_NAMES, socialTarget, canReceiveGreeting } from './behavior.js';
import { buildCat, disposeCat } from './cat3d.js';
import { toon } from './cat3d.js';
import { addLights } from './stage.js';
import { RNG } from './rng.js';
import {nearbyZones,canOpenAt} from './locations.js';
import {findPath,segmentClear} from './navigation.js';
import { getMapLayout, PEN_MAX, GARDEN, isGarden, MAP_BOUNDS } from './map-layout.js';
import { makeTerrain } from './terrain.js';
import { loadCatalog, makeProp, propCollider, propNow, catalogEntry, assetScale } from './props.js';

// 에셋 복제본은 지오메트리·재질을 공유하므로, 우리를 다시 만들 때 dispose 전에 떼어 냄
function detachShared(root) {
  const shared = [];
  root.traverse(o => { if (o.userData.sharedAsset) shared.push(o); });
  for (const o of shared) o.parent?.remove(o);
}

const CAT_SCALE = 0.7;
const LAWN = 0;   // 둥근 마당 잔디 바닥 두께 (0 = 바닥 없음, 마을 잔디 그대로)
const BOUNDS = MAP_BOUNDS;

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function label(text, { bg = '#fffaf0', fg = '#6b4f3a', scale = 1 } = {}) {
  const t = canvasTex(320, 96, (g, w, h) => {
    g.fillStyle = bg; g.strokeStyle = '#fff'; g.lineWidth = 8;
    g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 40); g.fill(); g.stroke();
    g.fillStyle = fg; g.font = '44px Jua, "Malgun Gothic", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.scale.set(3.6 * scale, 1.08 * scale, 1); s.renderOrder = 20;
  return s;
}
const box = (w, h, d, color, x = 0, y = 0, z = 0, parent) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color));
  m.position.set(x, y + h / 2, z); if (parent) parent.add(m); return m;
};

export class World {
  constructor(canvas, hooks) {
    this.canvas = canvas; this.hooks = hooks;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0xbfe6f5);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xd8f0f0, 45, 95);
    addLights(this.scene);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    this.clock = new THREE.Clock();
    this.colliders = []; this.zones = []; this.pens = {}; this.catObjs = new Map(); this.npcAvatars = []; this.pulsers = [];
    this.keys = {}; this.target = null; this.enabled = true; this.inside = {}; this.stick = { x: 0, y: 0 };
    // 맵 배치(assets/map-layout.json). placeObjects: 편집 모드에서 장소를 옮길 때 함께 움직일 오브젝트
    this.layout = getMapLayout(); this.terrain = makeTerrain(this.layout.terrain); this.T = this.terrain.height; this.placeObjects = {}; this.pathMeshes = []; this.propObjects = []; this.propColliders = [];
    this.buildGround(); this.buildDecor(); this.buildBuildings(); this.buildPens();
    this.player = this.makeAvatar({ hair: 0xf1e3c8, shirt: 0xffffff, stripe: 0x3a4a63, pants: 0x4a5f8a, skin: 0xf3c9a6 });
    const start = this.layout.places.player;
    this.player.position.set(start.x, this.T(start.x, start.z), start.z); this.scene.add(this.player);
    this.placeObjects.player = [this.player];
    this.propsReady = this.loadProps(this.layout.props);
    this.camPos = new THREE.Vector3(); this.snapCamera();
    this.bind();
    this.resize();
    this.running = true;
    const loop = () => { if (!this.running) return; this.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  /* ───── 지형·장식 ───── */
  buildGround() {
    const tex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#79c277'; g.fillRect(0, 0, w, h);
      const r = new RNG('grass');
      for (let i = 0; i < 260; i++) {
        const x = r.range(0, w), y = r.range(0, h), s = r.range(8, 16);
        g.fillStyle = r.chance(0.5) ? '#86cd80' : '#6dba6c';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y); g.lineTo(x + s / 2, y - s * 0.9); g.closePath(); g.fill();
      }
    }, [26, 20]);
    // 지형이 있으면 바닥을 촘촘한 격자로 만들어 높이를 줌 (계단식 층)
    const groundGeo = this.terrain.enabled ? new THREE.PlaneGeometry(170, 130, 340, 260) : new THREE.PlaneGeometry(170, 130);
    groundGeo.rotateX(-Math.PI / 2);
    if (this.terrain.enabled) {
      const pa = groundGeo.attributes.position;
      for (let i = 0; i < pa.count; i++) pa.setY(i, this.T(pa.getX(i), pa.getZ(i)));
      pa.needsUpdate = true; groundGeo.computeVertexNormals();
    }
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshBasicMaterial({ map: tex }));
    // 배치 파일에 잔디 텍스처가 있으면 그것으로 (원래 색 그대로, 약 7칸마다 반복)
    if (this.layout.ground?.grass) this.groundTex(this.layout.ground.grass, 170 / 7, 130 / 7, t => { ground.material.map = t; ground.material.needsUpdate = true; });
    ground.userData.ground = true; this.scene.add(ground); this.ground = ground;
    this.buildPaths(this.layout.paths);
    this.buildRoads(this.layout.roads ?? [], this.layout.plazas ?? []);
  }
  /* 지형 바닥 메시(170×130, 0.5칸 격자)가 실제로 그려지는 높이: 격자 칸의 두 삼각형(대각선 왼아래-오른위)을 그대로 보간 */
  groundMeshY(x, z) {
    if (!this.terrain.enabled) return 0;
    const S = 0.5, fx = (x + 85) / S, fz = (z + 65) / S, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const x0 = -85 + i * S, z0 = -65 + j * S, a = this.T(x0, z0), b = this.T(x0, z0 + S), c = this.T(x0 + S, z0 + S), d = this.T(x0 + S, z0);
    return u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v);
  }
  /* assets/textures/ 텍스처를 불러와 반복 설정 (불러오기 실패해도 게임은 계속, 단색으로 남음) */
  groundTex(name, rx, ry, apply) {
    this.texLoader ??= new THREE.TextureLoader();
    this.texLoader.load(new URL(`../assets/textures/${name}`, import.meta.url).href, t => {
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4;
      apply(t);
    }, undefined, e => console.warn('바닥 텍스처를 불러오지 못했어요', name, e));
  }
  /* 곡선 흙길(부드러운 띠)과 둥근 바닥(광장 돌바닥·잔디 섬·모래 마당) */
  buildRoads(roads, plazas) {
    for (const m of this.roadMeshes ?? []) { this.scene.remove(m); m.geometry.dispose(); }
    this.roadMeshes = [];
    const mk = c => new THREE.MeshToonMaterial({ color: c, gradientMap: toon(0xffffff).gradientMap, side: THREE.DoubleSide });
    this.roadMats ??= { sand: mk(0xe8d3a2), stone: mk(0xeee3cf), stoneRim: mk(0xd9c6a3), grass: mk(0xa9cf6c) };
    // 길·광장은 지형 바닥 위에 항상 그려지게 (비탈에서 바닥이 길을 뚫고 올라오던 문제)
    for (const m of Object.values(this.roadMats)) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4; }
    if (this.layout.ground?.path && !this.roadMats.road) {   // 흙길 텍스처: 띠 너비 1칸, 길이 방향으로 반복
      this.roadMats.road = this.roadMats.sand.clone(); this.roadMats.road.color.set(0xffffff);
      const rm = this.roadMats.road; this.groundTex(this.layout.ground.path, 1, 1, t => { rm.map = t; rm.needsUpdate = true; });   // 반복 크기는 UV(월드 좌표)에서 정함
    }
    // 바닥 무늬를 월드 좌표에 고정: 길·광장 조각이 겹치거나 만나는 곳에서도 무늬가 이어짐 (tile = 그림 한 장이 덮는 칸 수)
    const PATH_TILE = 3.2, PLAZA_TILE = 5, GRASS_TILE = 7;
    const worldUV = (g, ox, oz, tile) => { const P = g.attributes.position, uv = new Float32Array(P.count * 2); for (let i = 0; i < P.count; i++) { uv[i * 2] = (P.getX(i) + ox) / tile; uv[i * 2 + 1] = -(P.getZ(i) + oz) / tile; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; };
    const M = this.roadMats, add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); this.scene.add(m); this.roadMeshes.push(m); return m; };
    const disc = (r, mat, x, y, z, tile) => { const g = new THREE.CircleGeometry(r, 48); g.rotateX(-Math.PI / 2); if (tile) worldUV(g, x, z, tile); return add(g, mat, x, y + this.T(x, z), z); };
    const G = this.layout.ground ?? {};
    // 텍스처를 쓰는 둥근 바닥은 크기마다 반복 횟수가 달라 재질을 따로 만듦
    const texMat = (base, name, r, tile) => {
      if (!name) return base;
      const m = base.clone(); m.color.set(0xffffff);
      this.groundTex(name, 1, 1, t => { m.map = t; m.needsUpdate = true; });
      return m;
    };
    for (const q of plazas) {
      if (q.kind === 'grass') disc(q.r, texMat(M.grass, G.grass, q.r, 7), q.x, 0.012, q.z, GRASS_TILE);
      else if (q.kind === 'lawn') { disc(q.r + 0.3, M.stoneRim, q.x, 0.04, q.z); disc(q.r, texMat(M.grass, G.grass, q.r, 7), q.x, 0.044, q.z, GRASS_TILE); }
      else if (q.kind === 'stone') { disc(q.r + (M.road ? 1.2 : 0.45), M.road ?? M.stoneRim, q.x, 0.03, q.z, PATH_TILE);   // 테두리는 흙길로 (키아트: 돌바닥이 고리 길로 이어짐)
        disc(q.r, texMat(M.stone, G.plaza, q.r, 4), q.x, 0.034, q.z, PLAZA_TILE); }
      else if (q.kind === 'paw') {   // 발바닥 돌 타일 (둥근 그림 한 장, 반복 없음)
        const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: M.stone.gradientMap, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
        if (G.paw) this.groundTex(G.paw, 1, 1, t => { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; m.map = t; m.needsUpdate = true; });
        disc(q.r, m, q.x, 0.05, q.z);
      }
      else disc(q.r, M.sand, q.x, 0.022, q.z);
    }
    for (const r of roads) {
      const curve = new THREE.CatmullRomCurve3(r.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
      // 길 띠를 가로로도 촘촘히 나누고, 바닥 격자(0.5칸) 사이 높이 중 가장 높은 값에 맞춤 → 절벽 가장자리·계단 비탈에서 잔디가 길을 뚫고 올라오지 않음
      const n = Math.max(8, Math.ceil(curve.getLength() / 0.3)), C = Math.max(2, Math.ceil(r.w / 0.35)), pos = [], idx = [], uvs = [];
      const hAt = (x, z) => Math.max(this.T(x, z), this.groundMeshY(x, z), this.groundMeshY(x + 0.18, z), this.groundMeshY(x - 0.18, z), this.groundMeshY(x, z + 0.18), this.groundMeshY(x, z - 0.18));
      for (let i = 0; i <= n; i++) {
        const p = curve.getPointAt(i / n), t = curve.getTangentAt(i / n), nx = -t.z * r.w / 2, nz = t.x * r.w / 2;
        for (let j = 0; j <= C; j++) {
          const f = 1 - 2 * j / C, x = p.x + nx * f, z = p.z + nz * f;
          pos.push(x, hAt(x, z), z); uvs.push(x / PATH_TILE, -z / PATH_TILE);
        }
        if (i) for (let j = 0; j < C; j++) { const a = (i - 1) * (C + 1) + j, b = a + C + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
      add(g, M.road ?? M.sand, 0, 0.02, 0);
      for (const [x, z] of [r.pts[0], r.pts[r.pts.length - 1]]) disc(r.w / 2, M.road ?? M.sand, x, 0.02, z, PATH_TILE);   // 둥근 끝
    }
  }
  /* 흙길: 배치 데이터의 사각형들. 편집 모드에서 다시 그릴 수 있게 분리 */
  buildPaths(paths) {
    for (const m of this.pathMeshes) { this.scene.remove(m); m.geometry.dispose(); }
    this.dirtMat ??= toon(0xe8d3a2);
    this.pathMeshes = paths.map((p, i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 1), this.dirtMat);
      m.scale.set(p.w, 1, p.d); m.position.set(p.x, this.T(p.x, p.z) + 0.02 + i * 0.0005, p.z);
      m.userData.pathIndex = i; this.scene.add(m); return m;
    });
  }
  /* 배경 에셋 배치. 파일이 없거나 실패한 에셋은 건너뜀(게임은 계속) */
  async loadProps(props) {
    for (const o of this.propObjects) this.scene.remove(o);
    this.colliders = this.colliders.filter(c => !this.propColliders.includes(c));
    this.propObjects = []; this.propColliders = [];
    if (!props.length) return;
    await loadCatalog();
    const token = this.propsToken = {};
    const objs = await Promise.all(props.map(item => makeProp(item).catch(error => { console.warn(error); return null; })));
    if (token !== this.propsToken) return;   // 그 사이 다시 불러왔으면 버림
    props.forEach((item, i) => {
      const obj = objs[i]; if (!obj) return;
      obj.userData.propIndex = i; obj.position.y = this.propY(item); this.scene.add(obj); this.propObjects.push(obj);
      const box = propCollider(item);
      if (box) { this.propColliders.push(box); this.colliders.push(box); }
    });
  }
  /* 에셋 높이: 지형 높이 + 마당 잔디 두께. 축대·계단은 경계에 걸치므로 아래층 높이에 세움 */
  propY(item) {
    const low = item.asset === 'stone_retaining_wall' || item.asset === 'stone_wood_steps';
    const base = low ? Math.min(this.T(item.x, item.z - 2.2), this.T(item.x, item.z + 2.2)) : this.T(item.x, item.z);
    return base + this.groundY(item.x, item.z);
  }
  /* 둥근 마당 위(잔디 바닥 두께 0.2)에 놓인 에셋은 그 위에 올림 */
  groundY(x, z) {
    for (const pen of Object.values(this.pens ?? {})) if (pen.garden && Math.abs(x - pen.cx) < pen.w / 2 && Math.abs(z - pen.cz) < pen.d / 2) return LAWN;
    return 0;
  }
  buildDecor() {
    if (!this.layout.randomDecor) return;
    const rng = new RNG('decor');
    // 장소 주변·흙길에는 나무를 심지 않음 (장소 위치가 바뀌어도 따라감)
    const P = this.layout.places, around = (p, hw, hd) => [p.x - hw, p.x + hw, p.z - hd, p.z + hd];
    const keepOut = [
      around(P.home, PEN_MAX.w / 2 + 1, PEN_MAX.d / 2 + 3), around(P.breed, 5, 6), around(P.shop, 6, 6), around(P.dex, 6, 6),
      [P.neighbors.x - 30, P.neighbors.x + 30, P.neighbors.z - 5, P.neighbors.z + 6],
      ...this.layout.paths.map(p => around(p, p.w / 2, p.d / 2)),
      ...(this.layout.plazas ?? []).map(q => around(q, q.r, q.r)),
      ...(this.layout.roads ?? []).flatMap(r => r.pts.slice(1).map((b, i) => { const a = r.pts[i]; return [Math.min(a[0], b[0]) - r.w, Math.max(a[0], b[0]) + r.w, Math.min(a[1], b[1]) - r.w, Math.max(a[1], b[1]) + r.w]; })),
    ];
    const free = (x, z) => (Math.abs(x) > 27 || z < -20) && !keepOut.some(([x0, x1, z0, z1]) => x > x0 - 2 && x < x1 + 2 && z > z0 - 2 && z < z1 + 2) && Math.abs(x) > 3;
    const green = [0x5faa5a, 0x74bd68, 0x6cb865];
    for (let i = 0; i < 90; i++) {
      const x = rng.range(-40, 40), z = rng.range(-30, 25);
      if (!free(x, z) || (Math.abs(x) < 3)) continue;
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 2.2, 8), toon(0xb07c4f)); trunk.position.y = 1.1; g.add(trunk);
      const c = rng.pick(green), s = rng.range(0.9, 1.35);
      for (const [dx, dy, dz, r] of [[0, 3.1, 0, 1.5], [0.8, 2.6, 0.3, 1.05], [-0.7, 2.7, -0.2, 1.1]]) {
        const sp = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), toon(c)); sp.position.set(dx, dy, dz); g.add(sp);
      }
      if (rng.chance(0.18)) for (let k = 0; k < 4; k++) { const o = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), toon(0xf08a2c)); o.position.set(rng.range(-1, 1), rng.range(2.5, 3.5), 1.0 + rng.range(0, 0.5)); g.add(o); }
      g.position.set(x, this.T(x, z), z); g.scale.setScalar(s); this.scene.add(g);
    }
    const fc = [0xffd23f, 0xff8fa3, 0xffffff, 0xb28cff];
    for (let i = 0; i < 160; i++) {
      const x = rng.range(-40, 40), z = rng.range(-30, 24);
      if (!free(x, z)) continue;
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), toon(rng.pick(fc))); f.position.set(x, 0.14, z); this.scene.add(f);
    }
  }

  /* ───── 건물 ───── */
  house(cx, cz, w, d, wallColor, roofColor, name, zoneId) {
    const g = new THREE.Group(); g.position.set(cx, this.T(cx, cz), cz);
    // 편집 모드에서 고른 내 에셋이 있으면 그 모양으로 (메뉴·도착 판정은 그 앞에)
    const look = this.layout.places[zoneId], item = look?.model ? { asset: look.model, x: cx, z: cz, ry: look.ry || 0, s: look.s || 1 } : null;
    const custom = item && propNow({ ...item, x: 0, z: 0 });
    if (custom) return this.customHouse(g, custom, item, name, zoneId);
    box(w, 3.4, d, wallColor, 0, 0, 0, g);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 2.4, 4), toon(roofColor));
    roof.rotation.y = Math.PI / 4; roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d)); roof.position.y = 4.6; g.add(roof);
    box(1.4, 2.2, 0.15, 0x8a5a3c, 0, 0, d / 2 + 0.05, g);
    box(1.1, 1.0, 0.12, 0xbfe4f5, -w / 2 + 1.3, 1.5, d / 2 + 0.05, g); box(1.1, 1.0, 0.12, 0xbfe4f5, w / 2 - 1.3, 1.5, d / 2 + 0.05, g);
    const aw = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.14, 1.5), toon(0xf4a7a0)); aw.position.set(0, 2.7, d / 2 + 0.6); aw.rotation.x = 0.28; g.add(aw);
    const lb = label(name, { scale: 1.1 }); lb.position.set(0, 7.4, 0); g.add(lb);
    this.scene.add(g);
    this.colliders.push([cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2]);
    const zx = cx, zz = cz + d / 2 + 1.6;
    this.zones.push({ id: zoneId, x: zx, z: zz, r: 1.9 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 28), new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(zx, this.T(zx, zz) + 0.07, zz); this.scene.add(ring); this.pulsers.push(ring);
    g.userData.zoneId = zoneId; this.clickables = (this.clickables || []).concat([g]);
    this.placeObjects[zoneId] = [g, ring];
    return g;
  }
  customHouse(g, model, item, name, zoneId) {
    model.userData.sharedAsset = true; g.add(model);
    const box3 = propCollider(item, true);
    this.colliders.push(box3);
    const e = catalogEntry(item.asset), S = item.s * assetScale(item.asset);
    const front = Math.max(0.5, e.bbox.max[2] * S), height = e.bbox.max[1] * S;
    const zx = item.x + Math.sin(item.ry) * (front + 1.6), zz = item.z + Math.cos(item.ry) * (front + 1.6);
    const lb = label(name, { scale: 1.1 }); lb.position.set(0, height + 1.6, 0); g.add(lb);
    this.scene.add(g);
    this.zones.push({ id: zoneId, x: zx, z: zz, r: 1.9 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 28), new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(zx, this.T(zx, zz) + 0.07, zz); this.scene.add(ring); this.pulsers.push(ring);
    g.userData.zoneId = zoneId; this.clickables = (this.clickables || []).concat([g]);
    this.placeObjects[zoneId] = [g, ring];
    return g;
  }
  buildBuildings() {
    const P = this.layout.places;
    this.house(P.dex.x, P.dex.z, 5.8, 4, 0xf1ead5, 0x8daf9c, '📖 유전 도서관', 'dex');
    this.house(P.shop.x, P.shop.z, 6.5, 4.6, 0xfbeed1, 0xe58a6a, '🛍️ 동물샵', 'shop');
    this.house(P.breed.x, P.breed.z, 5.4, 4, 0xffe0e6, 0xf08a9b, '💞 교배집', 'breed');
  }

  /* ───── 우리(울타리) ───── */
  buildPen(id, cx, cz, w, d, name, color = 0xf2e2b6) {
    const key = id === 'mine' ? 'home' : 'neighbors';
    if (isGarden(this.layout.places[key])) return this.buildGardenPen(id, cx, cz, name, key);
    const g = new THREE.Group(); this.scene.add(g);
    const look = this.layout.places[id === 'mine' ? 'home' : 'neighbors'];
    const fenceEntry = look?.fence && propNow({ asset: look.fence }) ? catalogEntry(look.fence) : null;
    const obstacles=[];
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color }));
    yard.rotation.x = -Math.PI / 2; yard.position.set(cx, 0.03, cz); g.add(yard);
    const wood = toon(0xc99a66), gate = 1.8;
    const postGeo = new THREE.BoxGeometry(0.22, 1.1, 0.22);
    const rail = (x, z, lw, ld) => {
      if (fenceEntry) this.fenceRun(g, look.fence, fenceEntry, x, z, lw, ld);
      else for (const y of [0.45, 0.85]) { const m = new THREE.Mesh(new THREE.BoxGeometry(lw, 0.12, ld), wood); m.position.set(x, y, z); g.add(m); }
      const obstacle=[x - lw / 2 - 0.05, x + lw / 2 + 0.05, z - ld / 2 - 0.05, z + ld / 2 + 0.05];
      this.colliders.push(obstacle);obstacles.push(obstacle);
    };
    const post = (x, z) => { if (fenceEntry) return; const m = new THREE.Mesh(postGeo, wood); m.position.set(x, 0.55, z); g.add(m); };
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    rail(cx, z0, w, 0.12);                       // 북쪽
    rail(x0, cz, 0.12, d); rail(x1, cz, 0.12, d); // 서·동
    const left = (cx - gate / 2) - x0, right = x1 - (cx + gate / 2);
    rail(x0 + left / 2, z1, left, 0.12); rail(x1 - right / 2, z1, right, 0.12); // 남쪽(문 열림)
    for (let x = x0; x <= x1 + 0.01; x += 1.5) { if (Math.abs(x - cx) > gate / 2 - 0.05) { post(x, z0); post(x, z1); } }
    for (let z = z0; z <= z1 + 0.01; z += 1.5) { post(x0, z); post(x1, z); }
    const lb = label(name, { scale: 0.95 }); lb.position.set(cx, 3.1, z0 + 0.3); g.add(lb);
    g.userData.ownedTextures=new Set([lb.material.map]);
    g.position.y = this.T(cx, cz);
    this.pens[id] = { id, cx, cz, w, d, group:g,obstacles,baseY: g.position.y,minX: x0 + 1, maxX: x1 - 1, minZ: z0 + 1, maxZ: z1 - 1, gate: { x: cx, z: z1 } };
    this.buildShelters(this.pens[id]);
  }
  /* 우리집 '둥근 마당' 스타일 (사진 디자인): 바닥·울타리·집만. 장식은 직접 배치. 크기는 고정이라 우리 레벨이 올라도 모양은 그대로(정원·확장 구매 기능은 그대로) */
  buildGardenPen(id, cx, cz, name, key = 'home') {
    // 자유 모양 마당(키아트 울타리 윤곽): 우리집은 places.home.poly, 이웃은 slots[i].poly
    const shapeOf = key === 'home' ? (this.layout.places.home.poly ? { poly: this.layout.places.home.poly, gate: this.layout.places.home.gate, hx: this.layout.places.home.hx, hz: this.layout.places.home.hz, hry: this.layout.places.home.hry } : null) : this.penShape?.[id];
    if (shapeOf) return this.buildShapedPen(id, shapeOf, name, key);
    const by = this.T(cx, cz);   // 이 마당이 놓인 층 높이
    const look = this.layout.places[key], w = look.gw ?? (key === 'home' ? GARDEN.w : 12.5), d = look.gd ?? (key === 'home' ? GARDEN.d : 12);
    const hsc = look.hs ?? 1;   // 집 크기 배율 (마당이 작으면 줄일 수 있음)
    const g = new THREE.Group(); g.position.y = by; this.scene.add(g);
    const obstacles = [], x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const shared = o => { if (o) { o.userData.sharedAsset = true; g.add(o); } return o; };
    // 바닥: 둥근 잔디
    const r = Math.min(3.2, w / 4, d / 4);
    const rounded = (W, D, R) => {
      const sh = new THREE.Shape(), hw = W / 2, hd = D / 2;
      sh.moveTo(-hw + R, -hd); sh.lineTo(hw - R, -hd); sh.quadraticCurveTo(hw, -hd, hw, -hd + R);
      sh.lineTo(hw, hd - R); sh.quadraticCurveTo(hw, hd, hw - R, hd); sh.lineTo(-hw + R, hd);
      sh.quadraticCurveTo(-hw, hd, -hw, hd - R); sh.lineTo(-hw, -hd + R); sh.quadraticCurveTo(-hw, -hd, -hw + R, -hd);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 10 });
      geo.rotateX(Math.PI / 2); return geo;   // 위로 0 → 아래로 -1
    };
    // 2026-11-26: 연두색 마당 바닥은 없앰 (키아트처럼 마을 잔디 그대로). LAWN > 0 이면 다시 깔림
    if (LAWN > 0) { const grass = new THREE.Mesh(rounded(w, d, r), toon(0xb2cf62)); grass.scale.y = LAWN; grass.position.set(cx, LAWN, cz); g.add(grass); }
    // 울타리: 둥근 테두리를 따라 (앞 가운데 문은 열어 둠)
    const inset = 0.45, fw = w / 2 - inset, fd = d / 2 - inset, fr = Math.max(0.5, r - inset), gate = 3;
    const path = [[gate / 2, fd], [fw - fr, fd]];
    // 앞 → 오른쪽 → 뒤 → 왼쪽 → 앞 순서로, 모서리는 6조각 호
    for (let i = 1; i <= 6; i++) { const a = Math.PI / 2 - i / 6 * Math.PI / 2; path.push([fw - fr + Math.cos(a) * fr, fd - fr + Math.sin(a) * fr]); }
    path.push([fw, -fd + fr]); for (let i = 1; i <= 6; i++) { const a = -i / 6 * Math.PI / 2; path.push([fw - fr + Math.cos(a) * fr, -fd + fr + Math.sin(a) * fr]); }
    path.push([-fw + fr, -fd]); for (let i = 1; i <= 6; i++) { const a = -Math.PI / 2 - i / 6 * Math.PI / 2; path.push([-fw + fr + Math.cos(a) * fr, -fd + fr + Math.sin(a) * fr]); }
    path.push([-fw, fd - fr]); for (let i = 1; i <= 6; i++) { const a = Math.PI - i / 6 * Math.PI / 2; path.push([-fw + fr + Math.cos(a) * fr, fd - fr + Math.sin(a) * fr]); }
    path.push([-gate / 2, fd]);
    const seg = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
    const total = seg.reduce((a, b) => a + b, 0);
    const at = t => { let k = 0; while (k < seg.length - 1 && t > seg[k]) { t -= seg[k]; k++; } const f = Math.min(1, t / seg[k]); return [path[k][0] + (path[k + 1][0] - path[k][0]) * f, path[k][1] + (path[k + 1][1] - path[k][1]) * f]; };
    const fenceId = look.fence || GARDEN.fence, fe = catalogEntry(fenceId), probe = propNow({ asset: fenceId });
    const L = fe && probe ? Math.max(0.5, (fe.bbox.max[0] - fe.bbox.min[0]) * assetScale(fenceId)) : 1.5;
    const n = Math.max(4, Math.round(total / L)), wood = toon(0xf3e3c4);
    for (let i = 0; i < n; i++) {
      const a = at(total * i / n), b = at(total * (i + 1) / n), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const mx = cx + (a[0] + b[0]) / 2, mz = cz + (a[1] + b[1]) / 2, ry = -Math.atan2(b[1] - a[1], b[0] - a[0]);
      const piece = fe && propNow({ asset: fenceId, x: mx, z: mz, ry });
      if (piece) { piece.position.y = LAWN; piece.scale.x *= len / L; shared(piece); }
      else for (const y of [0.65, 1.05]) { const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.12), wood); m.position.set(mx, y, mz); m.rotation.y = ry; g.add(m); }
      const o = [Math.min(cx + a[0], cx + b[0]) - 0.15, Math.max(cx + a[0], cx + b[0]) + 0.15, Math.min(cz + a[1], cz + b[1]) - 0.15, Math.max(cz + a[1], cz + b[1]) + 0.15];
      this.colliders.push(o); obstacles.push(o);
    }
    // 뒤쪽 가운데 열린 집 (정면 = 문 쪽)
    const houseId = this.penHouse?.[id] || look.house || GARDEN.house, he = catalogEntry(houseId);
    // 집 회전(키아트처럼 광장 쪽으로 살짝 돌림): 집 = penHouseRy, 우리집 = look.hry. 회전한 바닥 크기로 마당 뒤쪽에 붙임
    const hry = (id === 'mine' ? look.hry : this.penHouseRy?.[id]) || 0;
    const HS = assetScale(houseId) * hsc;
    let hw2 = 5, hd2 = 5, hcx = 0, hcz = 0;
    if (he) {
      const c = Math.cos(hry), sn = Math.sin(hry); let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const bx of [he.bbox.min[0], he.bbox.max[0]]) for (const bz of [he.bbox.min[2], he.bbox.max[2]]) {
        const rx = (bx * c + bz * sn) * HS, rz = (-bx * sn + bz * c) * HS;
        a0 = Math.min(a0, rx); a1 = Math.max(a1, rx); b0 = Math.min(b0, rz); b1 = Math.max(b1, rz);
      }
      hw2 = a1 - a0; hd2 = b1 - b0; hcx = (a0 + a1) / 2; hcz = (b0 + b1) / 2;
    }
    const hz = z0 + 0.9 + hd2 / 2 - hcz;
    const house = he && propNow({ asset: houseId, x: cx - hcx, z: hz, s: hsc, ry: hry });
    if (house) { house.position.y = LAWN; shared(house); }
    const houseFront = z0 + 0.9 + hd2, houseBack = z0 + 0.9;
    // 디딤돌·나무·덤불 같은 장식은 자동으로 놓지 않음: 편집 모드에서 직접 배치
    const lb = label(name, { scale: 0.95 }); lb.position.set(cx, 7.6, z0 + 0.8); g.add(lb);
    g.userData.ownedTextures = new Set([lb.material.map]);
    // 고양이가 다니는 범위: 울타리 안 + 집 안(뒤 벽 앞까지). 쉼터 두 자리는 집 안에
    // 고양이가 서는 높이: 잔디(0.2) + 집 바닥·계단. 집 위에서 아래로 쏜 광선으로 한 번만 재 둠
    const surface = this.sampleSurface(house, cx, cz, w, d, by);
    const catObstacles = this.sampleWalls(house, by);   // 고양이가 집 벽·기둥을 뚫지 않도록
    const pen = this.pens[id] = { id, cx, cz, w, d, group: g, obstacles, garden: true, surface, catObstacles, baseY: by,
      minX: x0 + 1.4, maxX: x1 - 1.4, minZ: houseBack + 0.9, maxZ: z1 - 1.4, gate: { x: cx, z: z1 },
      litterPos: { x: x1 - 2.6, z: z1 - 1.9 } };
    pen.shelters = [-1, 1].map((side, index) => {
      const spot = new THREE.Group(); spot.position.set(cx + side * Math.min(1.4, hw2 / 4), by, houseBack + 0.9 + hd2 * 0.35);
      this.scene.add(spot);
      return { id: `${id}:shelter:${index}`, x: spot.position.x, z: spot.position.z, object: spot };
    });
  }
  /* 자유 모양 마당: 윤곽(poly)을 따라 울타리, 문(gate) 자리만 비움. 집은 키아트 위치(hx,hz)·회전(hry) 그대로 */
  buildShapedPen(id, shape, name, key) {
    const look = this.layout.places[key], poly = shape.poly;
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length, cz = poly.reduce((a, p) => a + p[1], 0) / poly.length;
    const by = this.T(cx, cz), w = x1 - x0, d = z1 - z0;
    const g = new THREE.Group(); g.position.y = by; this.scene.add(g);
    const shared = o => { if (o) { o.userData.sharedAsset = true; g.add(o); } return o; };
    const obstacles = [], gate = shape.gate ?? { x: cx, z: z1, w: 3 };
    // 울타리: 각 변을 울타리 칸으로 나누어 놓음. 문 자리(gate 주변 w/2)는 비움
    const fenceId = look.fence || GARDEN.fence, fe = catalogEntry(fenceId), probe = propNow({ asset: fenceId });
    const L = fe && probe ? Math.max(0.5, (fe.bbox.max[0] - fe.bbox.min[0]) * assetScale(fenceId)) : 1.5, wood = toon(0xf3e3c4);
    for (let i = 0; i < poly.length; i++) {
      const A = poly[i], B = poly[(i + 1) % poly.length], len = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.round(len / L));
      for (let k = 0; k < n; k++) {
        const a = [A[0] + (B[0] - A[0]) * k / n, A[1] + (B[1] - A[1]) * k / n], b = [A[0] + (B[0] - A[0]) * (k + 1) / n, A[1] + (B[1] - A[1]) * (k + 1) / n];
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, pl = len / n;
        if (Math.hypot(mx - gate.x, mz - gate.z) < (gate.w ?? 3) / 2 + pl * 0.3) continue;   // 문
        const ry = -Math.atan2(b[1] - a[1], b[0] - a[0]);
        const piece = fe && propNow({ asset: fenceId, x: mx, z: mz, ry });
        if (piece) { piece.position.y = this.T(mx, mz) - by; piece.scale.x *= pl / L; shared(piece); }
        else for (const y of [0.65, 1.05]) { const m = new THREE.Mesh(new THREE.BoxGeometry(pl, 0.12, 0.12), wood); m.position.set(mx, y, mz); m.rotation.y = ry; g.add(m); }
        const o = [Math.min(a[0], b[0]) - 0.15, Math.max(a[0], b[0]) + 0.15, Math.min(a[1], b[1]) - 0.15, Math.max(a[1], b[1]) + 0.15];
        this.colliders.push(o); obstacles.push(o);
      }
    }
    // 집: 키아트 위치·회전 그대로
    const houseId = this.penHouse?.[id] || look.house || GARDEN.house, he = catalogEntry(houseId);
    const hx = shape.hx ?? cx, hz = shape.hz ?? cz, hry = shape.hry || 0;
    const house = he && propNow({ asset: houseId, x: hx, z: hz, s: look.hs ?? 1, ry: hry });
    if (house) { house.position.y = this.T(hx, hz) - by; shared(house); }
    const lb = label(name, { scale: 0.95 }); lb.position.set(hx, 7.6, hz - 1.5); g.add(lb);
    g.userData.ownedTextures = new Set([lb.material.map]);
    const surface = this.sampleSurface(house, cx, cz, w + 2, d + 2, by);
    const catObstacles = this.sampleWalls(house, by);
    // 문 바깥 방향(마당 가운데 → 문)과 화장실 자리(문 안쪽 옆)
    const out = (() => { const vx = gate.x - cx, vz = gate.z - cz, l = Math.hypot(vx, vz) || 1; return [vx / l, vz / l]; })();
    const inside = p => this.inPoly(poly, p.x, p.z);
    let litter = { x: gate.x - out[0] * 2.6 + out[1] * 2.6, z: gate.z - out[1] * 2.6 - out[0] * 2.6 };
    if (!inside(litter)) litter = { x: gate.x - out[0] * 2.6 - out[1] * 2.6, z: gate.z - out[1] * 2.6 + out[0] * 2.6 };
    if (!inside(litter)) litter = { x: (cx + gate.x) / 2, z: (cz + gate.z) / 2 };
    const pen = this.pens[id] = { id, cx, cz, w, d, group: g, obstacles, garden: true, surface, catObstacles, baseY: by, poly,
      minX: x0 + 1.2, maxX: x1 - 1.2, minZ: z0 + 1.2, maxZ: z1 - 1.2, gate: { x: gate.x, z: gate.z }, gateOut: out, litterPos: litter };
    // 쉼터 두 자리: 집 앞(현관 쪽)
    const fx = Math.sin(hry), fz = Math.cos(hry), half = he ? (he.bbox.max[2] - he.bbox.min[2]) * assetScale(houseId) / 2 : 2.5;
    pen.shelters = [-1, 1].map((side, index) => {
      const spot = new THREE.Group();
      let sx = hx + fx * (half + 0.4) + fz * side * 1.4, sz = hz + fz * (half + 0.4) - fx * side * 1.4;
      if (!inside({ x: sx, z: sz })) { sx = (sx + cx) / 2; sz = (sz + cz) / 2; }
      spot.position.set(sx, this.T(sx, sz), sz); this.scene.add(spot);
      return { id: `${id}:shelter:${index}`, x: sx, z: sz, object: spot };
    });
  }
  inPoly(poly, x, z) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  }
  /* 자유 모양 마당 밖 목표는 마당 가운데 쪽으로 끌어들임 (고양이가 울타리 밖을 목표로 삼지 않게) */
  intoPen(pen, p) {
    if (!pen?.poly || this.inPoly(pen.poly, p.x, p.z)) return p;
    for (let t = 0.1; t <= 1; t += 0.1) { const q = { x: p.x + (pen.cx - p.x) * t, z: p.z + (pen.cz - p.z) * t }; if (this.inPoly(pen.poly, q.x, q.z)) return q; }
    return { x: pen.cx, z: pen.cz };
  }
  /* 마당 위 높이표(0.25 간격): 기본은 잔디 높이 0.2, 집 범위 안은 집 바닥 높이 */
  sampleSurface(house, cx, cz, w, d, by = 0) {
    const step = 0.25, nx = Math.ceil(w / step) + 1, nz = Math.ceil(d / step) + 1, x0 = cx - w / 2, z0 = cz - d / 2;
    const data = new Float32Array(nx * nz).fill(LAWN);
    if (house) {
      house.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(house), ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
      const top = Math.min(box.max.y, by + LAWN + 1.4);   // 지붕 아래·바닥 위에서 쏨 (바닥·계단만 맞도록)
      for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
        const x = x0 + i * step, z = z0 + k * step;
        if (x < box.min.x || x > box.max.x || z < box.min.z || z > box.max.z) continue;
        ray.set(new THREE.Vector3(x, top, z), down); ray.far = top - by + 0.5;
        const hit = ray.intersectObject(house, true)[0];
        const hy = hit ? hit.point.y - by : 0;   // 층 높이를 뺀 마당 기준 높이
        if (hit && hy > LAWN + 0.02 && hy < 1.2) data[i * nz + k] = hy;
      }
    }
    return { x0, z0, step, nx, nz, data };
  }
  /* 집 벽·기둥 찾기: 고양이 몸 높이에서 집을 가로·세로로 가로지르는 광선을 쏘아 맞은 곳을 작은 막힘 상자로 */
  sampleWalls(house, by = 0) {
    if (!house) return [];
    house.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(house), ray = new THREE.Raycaster(), out = [], step = 0.25, half = 0.14;
    const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
    for (const y of [by + 0.85, by + 1.25]) {
      for (let z = box.min.z; z <= box.max.z; z += step) {
        ray.set(new THREE.Vector3(box.min.x - 1, y, z), X); ray.far = box.max.x - box.min.x + 2;
        for (const hit of ray.intersectObject(house, true)) out.push([hit.point.x - half, hit.point.x + half, z - step / 2, z + step / 2]);
      }
      for (let x = box.min.x; x <= box.max.x; x += step) {
        ray.set(new THREE.Vector3(x, y, box.min.z - 1), Z); ray.far = box.max.z - box.min.z + 2;
        for (const hit of ray.intersectObject(house, true)) out.push([x - step / 2, x + step / 2, hit.point.z - half, hit.point.z + half]);
      }
    }
    return out;
  }
  /* 고양이 이동 경로: 벽에 막히면 집 입구로 돌아서 가는 길을 찾음. 갈 수 없으면 false */
  routeCat(o, pen) {
    const obs = pen?.catObstacles; o.route = null;
    if (!obs?.length) return true;
    const a = { x: o.holder.position.x, z: o.holder.position.z }, b = { x: o.tx, z: o.tz };
    if (!segmentClear(a, a, obs, 0.3)) return true;          // 이미 벽에 걸쳐 있으면 빠져나오도록 그대로
    if (!segmentClear(b, b, obs, 0.42)) return false;        // 목적지가 벽 속
    if (segmentClear(a, b, obs, 0.42)) return true;
    const r = findPath(a, b, obs, { minX: pen.minX, maxX: pen.maxX, minZ: pen.minZ, maxZ: pen.maxZ }, 0.5);
    if (!r.length) return false;
    o.route = r; return true;
  }
  /* 고양이가 선 자리의 바닥 높이 (둥근 마당이 아니면 0) */
  surfaceY(pen, x, z) {
    const s = pen?.surface; if (!s) return 0;
    const i = Math.round((x - s.x0) / s.step), k = Math.round((z - s.z0) / s.step);
    if (i < 0 || k < 0 || i >= s.nx || k >= s.nz) return 0;
    return s.data[i * s.nz + k];
  }
  /* 울타리 에셋을 한 변(길이 lw 또는 ld)에 이어 붙임. 길이에 맞게 조각 수를 정하고 살짝 늘이거나 줄임 */
  fenceRun(g, asset, entry, x, z, lw, ld) {
    const along = lw >= ld, len = Math.max(lw, ld), L = Math.max(0.2, (entry.bbox.max[0] - entry.bbox.min[0]) * assetScale(asset));
    const n = Math.max(1, Math.round(len / L)), piece = len / n;
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + piece * (i + 0.5);
      const obj = propNow({ asset, x: along ? x + t : x, z: along ? z : z + t, ry: along ? 0 : Math.PI / 2 });
      obj.scale.x *= piece / L; obj.userData.sharedAsset = true; g.add(obj);
    }
  }
  buildShelters(pen) {
    const look = this.layout.places[pen.id === 'mine' ? 'home' : 'neighbors'];
    pen.shelters = [-1, 1].map((side, index) => {
      const x = side < 0 ? pen.minX + .65 : pen.maxX - .65, z = pen.minZ + .55;
      const hut = new THREE.Group(); hut.position.set(x, pen.baseY ?? 0, z);
      const model = look?.shelter && propNow({ asset: look.shelter });
      if (model) {
        // 쉼터 자리(약 2.3×1.9)에 들어가도록 너무 크면 줄임
        const sb = catalogEntry(look.shelter).bbox, SS = assetScale(look.shelter), k = Math.min(1, 2.3 / ((sb.max[0] - sb.min[0]) * SS), 1.9 / ((sb.max[2] - sb.min[2]) * SS));
        model.scale.multiplyScalar(k); model.userData.sharedAsset = true; hut.add(model);
        const top = sb.max[1] * SS * k;
        const sign = label('🌿 조용한 쉼터',{scale:.48});sign.position.set(0,top + .6,0);hut.add(sign);
        hut.userData.ownedTextures=new Set([sign.material.map]);
        this.scene.add(hut);
        return {id:`${pen.id}:shelter:${index}`,x,z,object:hut};
      }
      box(2.1, .12, 1.75, 0xd6ad83, 0, .04, 0, hut);
      const cushion = new THREE.Mesh(new THREE.CylinderGeometry(.72,.78,.12,24),toon(0xf4c6cd));
      cushion.position.y = .22; cushion.scale.z = .8; hut.add(cushion);
      for (const dx of [-.91,.91]) for (const dz of [-.7,.7]) box(.12,1.6,.12,0xc99a66,dx,.12,dz,hut);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.55,.65,4),toon(0xa9cbb9));
      roof.rotation.y = Math.PI/4; roof.scale.z = .85; roof.position.y = 1.92; hut.add(roof);
      const sign = label('🌿 조용한 쉼터',{scale:.48});sign.position.set(0,2.65,0);hut.add(sign);
      hut.userData.ownedTextures=new Set([sign.material.map]);
      this.scene.add(hut);
      return {id:`${pen.id}:shelter:${index}`,x,z,object:hut};
    });
  }
  buildPens() {
    const home = this.layout.places.home;
    this.buildPen('mine', home.x, home.z, 12, 9, '🏠 우리 집', 0xf5e6b8);
    this.buildLitterTray();
    const row = this.layout.places.neighbors;
    const step = isGarden(row) ? (row.gw ?? 12.5) + (row.gap ?? 1.6) : 12;
    // 이웃 자리: slots가 있으면 집마다 따로, 없으면 row 기준 한 줄
    this.npcSlots = row.slots?.length ? row.slots : [-2, -1, 0, 1, 2].map(k => ({ x: row.x + k * step, z: row.z }));
    this.npcPositions = this.npcSlots.map(q => q.x);
    this.npcRowZ = row.z;
    this.penLevel=1;
  }
  homeObjects() {
    const pen = this.pens.mine;
    return [pen.group, ...pen.shelters.map(s => s.object), this.litterTray];
  }
  syncPen(level,capacity,count){
    if(this.penLevel!==level){
      const previous=this.pens.mine,journey=this.destination;
      this.cancelJourney();this.colliders=this.colliders.filter(o=>!previous.obstacles.includes(o));
      this.scene.remove(previous.group);detachShared(previous.group);disposeCat(previous.group);
      for(const shelter of previous.shelters){this.scene.remove(shelter.object);detachShared(shelter.object);disposeCat(shelter.object);}
      this.scene.remove(this.litterTray);this.litterLabel?.material.map.dispose();disposeCat(this.litterTray);
      this.litterLabel=null;this.litterKey=null;this.penSign=null;this.penSignKey=null;
      const home=this.layout.places.home;
      this.buildPen('mine',home.x,home.z,12+(level-1)*.8,9+(level-1)*.3,`🏠 우리 집 Lv.${level}`,level>=5?0xe0e8b9:0xf5e6b8);
      this.buildLitterTray();this.penLevel=level;
      for(const o of this.catObjs.values())if(o.pen==='mine'){o.shelterId=null;o.partnerId=null;o.moving=false;o.activity='idle';o.wait=2;}
      if(!segmentClear(this.player.position,this.player.position,this.colliders)){
        const start=this.player.position.clone();let moved=false;
        for(let r=.5;r<=3&&!moved;r+=.5)for(let i=0;i<16&&!moved;i++){
          const point={x:start.x+Math.cos(i*Math.PI/8)*r,z:start.z+Math.sin(i*Math.PI/8)*r};
          if(segmentClear(point,point,this.colliders)){this.player.position.set(point.x,0,point.z);moved=true;}
        }
      }
      if(journey)this.goToZone(journey);
    }
    const key=`${level}:${capacity}:${count}`;
    if(this.penSignKey===key)return;
    const pen=this.pens.mine;
    if(this.penSign){pen.group.remove(this.penSign);pen.group.userData.ownedTextures.delete(this.penSign.material.map);this.penSign.material.map.dispose();this.penSign.material.dispose();}
    this.penSign=label('우리집',{scale:.8});
    this.penSign.position.set(pen.cx-3,2,pen.gate.z+.1);pen.group.add(this.penSign);pen.group.userData.ownedTextures.add(this.penSign.material.map);this.penSignKey=key;
  }
  buildLitterTray() {
    const pen = this.pens.mine;
    const tray = new THREE.Group(); tray.position.set(pen.litterPos?.x ?? pen.minX + .6, pen.baseY ?? 0, pen.litterPos?.z ?? pen.maxZ - .4);
    box(2.1, .18, 1.4, 0x9cbda6, 0, .06, 0, tray);
    box(1.85, .04, 1.15, 0xe6cfa3, 0, .25, 0, tray);
    for (const x of [-1, 1]) box(.14, .2, 1.4, 0x9cbda6, x, .12, 0, tray);
    for (const z of [-.65, .65]) box(2.1, .2, .14, 0x9cbda6, 0, .12, z, tray);
    this.scene.add(tray); this.litterTray = tray;
    this.litterPiles = new THREE.Group(); tray.add(this.litterPiles);
  }
  syncLitter(state) {
    const key = state.total + '|' + state.items.map(item => `${item.catId}:${item.index}`).join('|');
    if (key === this.litterKey) return;
    this.litterKey = key;
    for (const pile of [...this.litterPiles.children]) { this.litterPiles.remove(pile); disposeCat(pile); }
    if (this.litterLabel) {
      this.litterTray.remove(this.litterLabel); this.litterLabel.material.map.dispose(); this.litterLabel.material.dispose();
    }
    for (const item of state.items) {
      const rng = new RNG(item.seed), pile = new THREE.Group();
      pile.userData.cleanCatId = item.catId;
      pile.position.set(rng.range(-.75, .75), .3, rng.range(-.4, .4));
      for (let i = 0; i < 3; i++) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(.14 - i * .035, 10, 8), toon(0x987252));
        mesh.position.set(i * .015, i * .1, 0); mesh.scale.y = .65; pile.add(mesh);
      }
      this.litterPiles.add(pile);
    }
    this.litterLabel = label(state.total ? `🧹 청소 ${state.total}` : '✨ 깨끗한 화장실', { scale: .62, bg: state.total ? '#ffe5c7' : '#edf5df' });
    this.litterLabel.position.set(0, 1.6, 0); this.litterTray.add(this.litterLabel);
    this.litterTray.userData.cleanCatId = state.items[0]?.catId ?? null;
  }
  /* NPC 우리는 game 데이터가 정해진 뒤 만든다 */
  setupNpcs(npcs) {
    if (this.npcsBuilt) return; this.npcsBuilt = true;
    const hairs = [0x7a4a2b, 0x2d2d3a, 0xd9803a, 0xb8a1e0, 0x5aa07a];
    const shirts = [0xf6a98d, 0x8cc7ee, 0xf3d36a, 0xe58fb5, 0xa6d9a0];
    this.penHouse ??= {};
    this.placeObjects.neighbors = [];
    npcs.forEach((n, i) => {
      const slot = this.npcSlots?.[i] ?? { x: this.npcPositions[i], z: this.npcRowZ ?? -14 }, cx = slot.x, rz = slot.z;
      if (slot.house) this.penHouse['npc:' + n.id] = slot.house;
      this.penHouseRy ??= {}; if (slot.ry) this.penHouseRy['npc:' + n.id] = slot.ry;
      this.penShape ??= {}; if (slot.poly) this.penShape['npc:' + n.id] = { poly: slot.poly, gate: slot.gate, hx: slot.hx, hz: slot.hz, hry: slot.ry };
      this.buildPen('npc:' + n.id, cx, rz, 9, 7, `${n.icon} ${n.name}의 우리`, 0xf0e0c0);
      const av = this.makeAvatar({ hair: hairs[i % 5], shirt: shirts[i % 5], stripe: shirts[i % 5], pants: 0x6b5a4a, skin: 0xf3c9a6 });
      const gardenRow = isGarden(this.layout.places.neighbors), front = rz + (this.layout.places.neighbors.gd ?? 12) / 2;
      // 둥근 마당이면 이웃은 마당 문 옆(앞쪽)에 서 있음
      const shapedPen = this.pens['npc:' + n.id]?.poly ? this.pens['npc:' + n.id] : null;
      // 자유 모양 마당이면 이웃은 문 바깥 옆에 서 있음
      const ax = shapedPen ? shapedPen.gate.x + shapedPen.gateOut[0] * 1.6 + shapedPen.gateOut[1] * 2.2 : gardenRow ? cx + 2.8 : cx + 5.6;
      const az = shapedPen ? shapedPen.gate.z + shapedPen.gateOut[1] * 1.6 - shapedPen.gateOut[0] * 2.2 : gardenRow ? front + 1.3 : rz + 3.7;
      av.position.set(ax, this.T(ax, az), az); av.rotation.y = 0.3; av.userData.npcId = n.id; av.userData.idle = true;
      this.scene.add(av); this.npcAvatars.push(av);
      this.zones.push({ id: 'npc:' + n.id, x: gardenRow ? ax - 0.6 : cx + 4.4, z: gardenRow ? az + 0.4 : rz + 4.6, r: 2.6 });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.2, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(ax, this.T(ax, az) + 0.07, az); this.scene.add(ring); this.pulsers.push(ring);
      const pen = this.pens['npc:' + n.id];
      this.placeObjects.neighbors.push(pen.group, ...pen.shelters.map(s => s.object), av, ring);
    });
  }

  /* ───── 아바타 ───── */
  makeAvatar({ hair, shirt, stripe, pants, skin }) {
    const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner); g.userData.inner = inner;
    const mat = (c) => toon(c);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.5, 6, 12), mat(shirt)); body.position.y = 1.05; inner.add(body);
    const stripeTex = canvasTex(8, 32, (c, w, h) => { c.fillStyle = '#' + shirt.toString(16).padStart(6, '0'); c.fillRect(0, 0, w, h); c.fillStyle = '#' + stripe.toString(16).padStart(6, '0'); for (let y = 2; y < h; y += 8) c.fillRect(0, y, w, 3); });
    if (stripe !== shirt) body.material = new THREE.MeshToonMaterial({ map: stripeTex, gradientMap: body.material.gradientMap });
    const legs = [];
    for (const s of [-1, 1]) {
      const l = new THREE.Group(); l.position.set(s * 0.17, 0.62, 0);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.35, 4, 8), mat(pants)); m.position.y = -0.3; l.add(m); inner.add(l); legs.push(l);
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat(0x3b5ac2)); sh.scale.set(1, 0.6, 1.4); sh.position.set(0, -0.6, 0.06); l.add(sh);
    }
    const arms = [];
    for (const s of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(s * 0.44, 1.35, 0);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.32, 4, 8), mat(shirt)); m.position.y = -0.22; a.add(m); inner.add(a); arms.push(a);
    }
    const head = new THREE.Group(); head.position.y = 1.95; inner.add(head);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 16), mat(skin)); face.scale.set(1.08, 1, 1); head.add(face);
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), mat(hair)); hairM.position.set(0, 0.07, -0.04); hairM.scale.set(1.1, 1.05, 1.06); head.add(hairM);
    const bangs = new THREE.Mesh(new THREE.SphereGeometry(0.47, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), mat(hair)); bangs.position.set(0, 0.04, 0.1); bangs.rotation.x = 0.4; head.add(bangs);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2a2020 })); e.scale.set(0.9, 1.4, 0.6); e.position.set(s * 0.17, -0.02, 0.42); head.add(e); }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(0xf08a4c)); nose.position.set(0, -0.12, 0.47); head.add(nose);
    g.userData.legs = legs; g.userData.arms = arms; g.userData.head = head;
    return g;
  }

  /* ───── 입력 ───── */
  bind() {
    const k = (e, v) => {
      if (this.editor) return;   // 편집 모드: 키 입력은 편집기가 처리
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        if (!v) { delete this.keys[key]; return; }
        if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
        this.keys[key] = v; if (v) this.cancelJourney(); e.preventDefault();
      }
    };
    addEventListener('keydown', (e) => k(e, true)); addEventListener('keyup', (e) => k(e, false));
    addEventListener('blur', () => { this.keys = {}; });
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
    let down = null, lastX = 0;
    this.canvas.addEventListener('pointerdown', (e) => { if (this.editor) { this.editor.onPointer('down', e); return; } down = [e.clientX, e.clientY]; lastX = e.clientX; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', e => {
      if (this.editor) { this.editor.onPointer('move', e); return; }
      if (down && this.followCatId) { this.orbit = (this.orbit ?? 0) + (e.clientX - lastX) * .012; lastX = e.clientX; }
    });
    this.canvas.addEventListener('pointercancel', () => { down = null; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (this.editor) { this.editor.onPointer('up', e); return; }
      const start = down; down = null;
      if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 6) return;
      if (!this.enabled) return;
      this.pick(e);
    });
    addEventListener('resize', () => this.resize());
  }
  pick(e) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const catRoots = [...this.catObjs.values()].map((c) => c.holder);
    const hits = this.ray.intersectObjects([...catRoots, ...this.npcAvatars, this.litterTray, ...(this.clickables || [])], true);
    for (const h of hits) {
      let o = h.object;
      while (o) {
        if (o.userData.cleanCatId) { this.hooks.onClean?.(o.userData.cleanCatId); return; }
        if (o.userData.catId) { this.hooks.onCat?.(o.userData.catId); return; }
        if (o.userData.npcId) { this.hooks.onZone?.('npc:' + o.userData.npcId, true); return; }
        if (o.userData.zoneId) { this.hooks.onZone?.(o.userData.zoneId, true); return; }
        o = o.parent;
      }
    }
    const gh = this.ray.intersectObject(this.ground)[0];
    if (gh) { this.stopWatching(); this.cancelJourney();this.setRoute({x:gh.point.x,z:gh.point.z}); }
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  snapCamera() { this.camPos.set(this.player.position.x, this.player.position.y, this.player.position.z); this.placeCamera(); }
  placeCamera() {
    const distance = this.viewDistance ?? 15.5, orbit = this.followCatId ? this.orbit ?? 0 : 0;
    this.camera.position.set(this.camPos.x + Math.sin(orbit) * distance * .97, distance + this.camPos.y, this.camPos.z + Math.cos(orbit) * distance * .97);
    this.camera.lookAt(this.camPos.x, 1 + this.camPos.y, this.camPos.z - 0.5);
  }
  teleport(x, z) { this.player.position.set(x, this.T(x, z), z); this.cancelJourney(); this.snapCamera(); }
  canOpen(tab) {return canOpenAt(tab,this.player.position,this.zones);}
  nearZone(id) {return nearbyZones(this.player.position,this.zones).some(zone=>zone.id===id);}
  goToZone(id) {
    const zone=this.zones.find(z=>z.id===id);
    if(!zone)return false;
    this.stopWatching();this.keys={};if(!this.setRoute(zone))return false;this.destination=id;
    this.hooks.onJourney?.(id);return true;
  }
  setRoute(end){
    const route=findPath(this.player.position,{x:end.x,z:end.z},this.colliders,BOUNDS);
    this.waypoints=route;const first=route.shift();this.target=first?new THREE.Vector3(first.x,0,first.z):null;return !!first;
  }
  cancelJourney() {this.target=null;this.waypoints=[];this.destination=null;this.hooks.onJourney?.(null);}

  /* ───── 고양이 동기화 ───── */
  sync(desired) { // desired: [{cat, pen}]
    const want = new Map(desired.map((d) => [d.cat.id, d]));
    for (const [id, o] of [...this.catObjs]) {
      const d = want.get(id);
      if (!d || d.pen !== o.pen || o.key !== this.keyOf(d.cat)) { this.scene.remove(o.holder); disposeCat(o.root); this.catObjs.delete(id); }
    }
    for (const d of desired) {
      if (this.catObjs.has(d.cat.id) || !this.pens[d.pen]) continue;
      const pen = this.pens[d.pen];
      const root = buildCat(d.cat);
      const holder = new THREE.Group(); holder.add(root); holder.scale.setScalar(CAT_SCALE);
      holder.position.set(THREE.MathUtils.lerp(pen.minX, pen.maxX, Math.random()), 0, THREE.MathUtils.lerp(pen.minZ, pen.maxZ, Math.random()));
      for (let k = 0; k < 60 && ((pen.catObstacles?.length && !segmentClear(holder.position, holder.position, pen.catObstacles, 0.42)) || (pen.poly && !this.inPoly(pen.poly, holder.position.x, holder.position.z))); k++)
        holder.position.set(THREE.MathUtils.lerp(pen.minX, pen.maxX, Math.random()), 0, THREE.MathUtils.lerp(pen.minZ, pen.maxZ, Math.random()));
      holder.rotation.y = Math.random() * 6.28;
      holder.userData.catId = d.cat.id;
      this.scene.add(holder);
      const behavior = behaviorOf(d.cat);
      this.catObjs.set(d.cat.id, { id: d.cat.id, holder, root, behavior, personality: d.cat.personality, activity: 'idle', duration: behavior.rest,
        pen: d.pen, key: this.keyOf(d.cat), wait: Math.random() * behavior.rest, tx: 0, tz: 0, moving: false, speed: behavior.speed });
    }
    if (this.followCatId && !this.catObjs.has(this.followCatId)) this.stopWatching();
  }
  keyOf(c) { return [c.id, c.personality ?? 'baby', c.costume || ''].join('|'); }
  react(id, action) {
    const o = this.catObjs.get(id);
    if (!o) return;
    o.root.userData.react?.(action);
    o.moving = false; o.wait = 5; o.activity = 'care'; o.partnerId = null; o.shelterId = null;
  }
  activityOf(id) {
    const o = this.catObjs.get(id);
    if (o?.moving && o.activity === 'shelter') return '조용한 쉼터로 가요';
    if (o?.moving && o.partnerId) return '친구에게 다가가요';
    return ACTIVITY_NAMES[o?.activity] ?? ACTIVITY_NAMES.idle;
  }
  focusCat(id) { if (this.catObjs.has(id)) { this.followCatId = id; this.orbit = 0; this.target = null; this.keys = {}; this.hooks.onFocus?.(id); } }
  stopWatching() { if (!this.followCatId) return; this.followCatId = null; this.hooks.onFocus?.(null); }

  /* ───── 프레임 ───── */
  frame() {
    if(document.hidden||this.suspended){this.clock.getDelta();return;}
    const dt = Math.min(0.1, this.clock.getDelta()), t = this.clock.elapsedTime;
    if (!this.editor) this.movePlayer(dt, t);
    const followed = this.catObjs.get(this.followCatId);
    const anchor = this.editor ? this.editor.focus : followed ? followed.holder.position : this.player.position;
    this.camPos.lerp(new THREE.Vector3(anchor.x, this.editor ? this.T(anchor.x, anchor.z) : anchor.y, anchor.z), 1 - Math.exp(-dt * (this.editor ? 12 : 4)));
    this.viewDistance = THREE.MathUtils.lerp(this.viewDistance ?? 15.5, this.editor ? this.editor.zoom : followed ? 7.5 : 15.5, 1 - Math.exp(-dt * (this.editor ? 12 : 4)));
    this.placeCamera();
    const pen=this.pens.mine;
    const marker=new THREE.Vector3(pen.maxX,2.3+(pen.baseY??0),pen.gate.z).project(this.camera);
    const rect=this.canvas.getBoundingClientRect();
    this.hooks.onPenAnchor?.({x:rect.left+(marker.x+1)*rect.width/2,y:rect.top+(1-marker.y)*rect.height/2,visible:Math.abs(marker.x)<1&&Math.abs(marker.y)<1&&marker.z>-1&&marker.z<1});
    this.updateCats(dt, t);
    for (const av of this.npcAvatars) { av.userData.inner.position.y = Math.sin(t * 2 + av.position.x) * 0.03; av.userData.head.rotation.z = Math.sin(t * 1.3 + av.position.x) * 0.06; }
    for (const p of this.pulsers) { const s = 1 + Math.sin(t * 3) * 0.12; p.scale.set(s, s, 1); }
    if (!this.editor) this.checkZones(); else this.editor.frame?.(dt, t);
    this.renderer.render(this.scene, this.camera);
  }
  movePlayer(dt, t) {
    const p = this.player;
    let dx = 0, dz = 0, followsRoute=false;
    if (this.enabled) {
      dx = this.stick.x; dz = this.stick.y;
      if (this.keys.w || this.keys.arrowup) dz -= 1; if (this.keys.s || this.keys.arrowdown) dz += 1;
      if (this.keys.a || this.keys.arrowleft) dx -= 1; if (this.keys.d || this.keys.arrowright) dx += 1;
      if (!dx && !dz && this.target) {
        followsRoute=true;
        const ex = this.target.x - p.position.x, ez = this.target.z - p.position.z, dist = Math.hypot(ex, ez);
        if (dist < 0.1) {const next=this.waypoints?.shift();this.target=next?new THREE.Vector3(next.x,0,next.z):null;} else { dx = ex / dist; dz = ez / dist; }
      }
    }
    const moving = dx || dz;
    if (moving) {
      this.stopWatching();
      const l = Math.hypot(dx, dz); if (l > 1) { dx /= l; dz /= l; }
      const sp = followsRoute&&this.target?Math.min(6.2*dt,Math.hypot(this.target.x-p.position.x,this.target.z-p.position.z)):6.2*dt;
      this.tryMove(p.position, dx * sp, 0); this.tryMove(p.position, 0, dz * sp);
      p.position.y = this.T(p.position.x, p.position.z);   // 계단·층 높이 따라가기
      const ang = Math.atan2(dx, dz);
      let da = ang - p.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); p.rotation.y += da * Math.min(1, dt * 12);
    }
    const u = p.userData, sw = moving ? Math.sin(t * 12) * 0.7 : 0;
    u.legs[0].rotation.x = sw; u.legs[1].rotation.x = -sw; u.arms[0].rotation.x = -sw * 0.8; u.arms[1].rotation.x = sw * 0.8;
    u.inner.position.y = moving ? Math.abs(Math.sin(t * 12)) * 0.08 : Math.sin(t * 2) * 0.015;
  }
  tryMove(pos, dx, dz) {
    const nx = THREE.MathUtils.clamp(pos.x + dx, BOUNDS.minX, BOUNDS.maxX), nz = THREE.MathUtils.clamp(pos.z + dz, BOUNDS.minZ, BOUNDS.maxZ), r = 0.4;
    for (const [x0, x1, z0, z1] of this.colliders) if (nx > x0 - r && nx < x1 + r && nz > z0 - r && nz < z1 + r) return;
    pos.x = nx; pos.z = nz;
  }
  updateCats(dt, t) {
    for (const o of this.catObjs.values()) {
      const pen = this.pens[o.pen], h = o.holder, root = o.root;
      h.position.y = THREE.MathUtils.lerp(h.position.y, (pen.baseY ?? 0) + this.surfaceY(pen, h.position.x, h.position.z), Math.min(1, dt * 12));
      const behavior = o.behavior;
      if (!o.moving) {
        o.wait -= dt;
        root.position.y = 0;
        root.rotation.z = 0;
        if (o.wait <= 0) {
          const neighbors = [...this.catObjs.values()].filter(p => p !== o && p.pen === o.pen);
          const peers = neighbors.filter(p => ![2,6].includes(o.personality) || ((o.socialUntil ?? 0) <= t && canReceiveGreeting(p.activity) && (p.socialUntil ?? 0) <= t))
            .map(p => ({ id:p.id, x: p.holder.position.x, z: p.holder.position.z }));
          const shelters = pen.shelters.filter(s => !neighbors.some(p => p.shelterId === s.id));
          const plan = chooseActivity(o.personality, h.position, peers, pen, Math.random, shelters);
          o.activity = plan.kind; o.duration = plan.duration;
          o.partnerId = plan.partnerId; o.shelterId = plan.shelterId; o.chaseUntil = t + 8;
          o.wait = plan.duration;
          if (plan.target) {
            const tgt = this.intoPen(pen, plan.target); o.tx = tgt.x; o.tz = tgt.z; o.moving = true; o.routeAt = t;
            if (!this.routeCat(o, pen)) { o.moving = false; o.activity = 'idle'; o.partnerId = null; o.shelterId = null; o.wait = 0.6; }
          }
        }
      } else {
        if (o.partnerId) {
          const friend = this.catObjs.get(o.partnerId);
          if (!friend || friend.pen !== o.pen || !canReceiveGreeting(friend.activity) || (friend.socialUntil ?? 0) > t || t > o.chaseUntil) {
            o.partnerId = null; o.moving = false; o.activity = 'idle'; o.wait = 1;
          } else {
            const destination = this.intoPen(pen, socialTarget(h.position,friend.holder.position,pen));
            o.tx = destination.x; o.tz = destination.z;
            if (pen.catObstacles?.length && t - (o.routeAt ?? 0) > 0.8) {
              o.routeAt = t;
              if (!this.routeCat(o, pen)) { o.partnerId = null; o.moving = false; o.activity = 'idle'; o.wait = 1; }
            }
          }
        }
        if (!o.moving) { root.userData.tick?.(t,{activity:o.activity,moving:false,dt}); continue; }
        const ex = o.tx - h.position.x, ez = o.tz - h.position.z, dist = Math.hypot(ex, ez);
        if (dist < 0.15) {
          o.moving = false; o.wait = o.duration; root.position.y = 0; root.rotation.z = 0;
          const friend = this.catObjs.get(o.partnerId);
          if (friend) {
            friend.moving = false; friend.activity = 'greet'; friend.wait = o.duration;
            friend.partnerId = null; friend.shelterId = null;
            friend.socialUntil = o.socialUntil = t + o.duration + 6;
            h.rotation.y = Math.atan2(friend.holder.position.x-h.position.x,friend.holder.position.z-h.position.z);
            friend.holder.rotation.y = h.rotation.y + Math.PI;
          }
          o.partnerId = null;
        }
        else {
        // 경로가 있으면 다음 꺾이는 점부터 (마지막 점 = 목적지)
        let sx = ex, sz = ez, sd = dist;
        while (o.route?.length > 1 && Math.hypot(o.route[0].x - h.position.x, o.route[0].z - h.position.z) < 0.15) o.route.shift();
        if (o.route?.length > 1) { sx = o.route[0].x - h.position.x; sz = o.route[0].z - h.position.z; sd = Math.hypot(sx, sz) || 1; }
        const ang = Math.atan2(sx, sz);
        let da = ang - h.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); h.rotation.y += da * Math.min(1, dt * 6);
        const step = Math.min(sd, o.speed * dt);
        h.position.x += sx / sd * step; h.position.z += sz / sd * step;
        root.position.y = Math.abs(Math.sin(t * 9 + o.speed * 10)) * behavior.bounce;
        root.rotation.z = Math.sin(t * 9 + o.speed * 10) * behavior.sway;
        }
      }
      root.userData.tick?.(t, { activity: o.activity, moving: o.moving, dt });
    }
  }
  checkZones() {
    const p = this.player.position;
    const nearby=nearbyZones(p,this.zones),key=nearby.map(z=>z.id).join('|');
    if(this.locationKey!==key){this.locationKey=key;this.hooks.onLocation?.(nearby);}
    if(this.destination&&nearby.some(z=>z.id===this.destination)){const id=this.destination;this.cancelJourney();if(this.enabled)this.hooks.onZone?.(id,false);}
    for (const z of this.zones) {
      const d = Math.hypot(p.x - z.x, p.z - z.z), inside = d < z.r;
      if (inside && !this.inside[z.id]) { this.inside[z.id] = true; if (this.enabled&&(!this.destination||this.destination===z.id)) this.hooks.onZone?.(z.id, false); }
      else if (!inside && d > z.r + 0.8) this.inside[z.id] = false;
    }
  }
}
