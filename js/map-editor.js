// 맵 편집 모드 (localhost에서 ?edit=1). 게임 기능은 건드리지 않고 assets/map-layout.json만 고침.
// 조작: 에셋 고르기 → 땅 클릭으로 놓기 · 끌어서 옮기기 · Q/E 회전 · -/= 크기 · Delete 삭제 · Ctrl+D 복제 · Ctrl+Z 되돌리기
//       빈 땅 드래그/WASD로 화면 이동 · 휠로 확대/축소 · Ctrl+S 저장
import * as THREE from 'three';
import { getMapLayout, normalizeLayout, PLACE_IDS, PLACE_LABELS, PEN_MAX, PLACE_LOOKS, LOOK_LABELS, GARDEN, isGarden, MAP_BOUNDS } from './map-layout.js';
const DRAFT_KEY = 'mapLayoutDraft';
import { loadCatalog, thumbUrl, catalogEntry, makeProp, propCollider, assetScale, renderThumb } from './props.js';

const STEP_ROT = Math.PI / 12;   // 15도
const BOUNDS = MAP_BOUNDS;
const r2 = v => Math.round(v * 100) / 100;
const clampX = x => Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, x));
const clampZ = z => Math.min(BOUNDS.maxZ, Math.max(BOUNDS.minZ, z));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 장소 입구(도착 판정 위치): world.js house()와 같은 식
const ENTRANCE = { breed: 2 + 1.6, shop: 2.3 + 1.6, dex: 2 + 1.6 };

export function startEditor(world) {
  const editor = new MapEditor(world);
  world.editor = editor;
  return editor;
}

class MapEditor {
  constructor(world) {
    this.w = world;
    this.layout = structuredClone(getMapLayout());
    this.saved = JSON.stringify(this.layout);
    // 장소 모양을 바꾸느라 새로고침했으면, 그 전의 '저장된 상태'를 이어받아 저장 안 됨 표시를 유지
    try { const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); if (draft?.saved) this.saved = draft.saved; } catch {}
    this.focus = new THREE.Vector3(world.player.position.x, 0, world.player.position.z - 6);
    this.zoom = 30;
    this.history = []; this.future = [];
    this.sel = null; this.placing = null; this.ghost = null; this.drag = null; this.pan = null;
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    // 장소 오브젝트의 처음 위치를 기억해 두고, 장소 좌표가 바뀐 만큼 함께 옮김
    world.placeObjects.home = world.homeObjects();
    this.placeBase = structuredClone(this.layout.places);
    this.objBase = new Map();
    for (const id of PLACE_IDS) for (const o of world.placeObjects[id] ?? []) this.objBase.set(o, o.position.clone());
    world.cancelJourney(); world.stopWatching(); world.keys = {};
    this.buildOverlays();
    this.applyPlaces();   // 점선(우리 최대 크기)을 우리 위치에 맞춤
    this.buildPanel();
    this.bindKeys();
    loadCatalog().then(list => {
      this.catalog = list; this.renderAssets();
      try {   // 모양 변경으로 새로고침했으면 보던 장소·화면 위치를 이어서
        const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
        if (draft?.select && this.layout.places[draft.select]) { this.focus.set(draft.focus[0], 0, draft.focus[1]); this.zoom = draft.zoom; this.select({ kind: 'place', id: draft.select }); }
      } catch {}
    });
    addEventListener('beforeunload', e => { if (!this.reloading && this.dirty()) { e.preventDefault(); e.returnValue = ''; } });
    this.refresh();
  }

  dirty() { return JSON.stringify(this.layout) !== this.saved; }

  /* ───── 기록·되돌리기 ───── */
  snapshot() { this.history.push(JSON.stringify(this.layout)); if (this.history.length > 200) this.history.shift(); this.future = []; }
  undo() {
    const prev = this.history.pop(); if (!prev) return;
    this.future.push(JSON.stringify(this.layout));
    this.layout = JSON.parse(prev); this.sel = null; this.applyAll(); this.refresh();
  }
  redo() {
    const next = this.future.pop(); if (!next) return;
    this.history.push(JSON.stringify(this.layout));
    this.layout = JSON.parse(next); this.sel = null; this.applyAll(); this.refresh();
  }

  /* ───── 화면 반영 ───── */
  applyPlaces() {
    for (const id of PLACE_IDS) {
      const p = this.layout.places[id], b = this.placeBase[id];
      for (const o of this.w.placeObjects[id] ?? []) {
        const base = this.objBase.get(o); if (!base) continue;
        o.position.set(base.x + p.x - b.x, base.y, base.z + p.z - b.z);
      }
    }
    const home = this.layout.places.home;
    this.penOutline.position.set(home.x, 0.08, home.z);
  }
  applyPaths() { this.w.buildPaths(this.layout.paths); }
  applyProps() { return this.w.loadProps(this.layout.props).then(() => this.updateSelectionBox()); }
  applyPropTransform(i) {
    const item = this.layout.props[i], obj = this.w.propObjects.find(o => o.userData.propIndex === i);
    if (!item || !obj) return;
    obj.position.set(item.x, this.w.propY(item), item.z); obj.rotation.y = item.ry; obj.scale.setScalar(item.s * assetScale(item.asset));
  }
  applyAll() { this.applyPlaces(); this.applyPaths(); this.applyProps(); }

  /* ───── 보조 표시: 우리 최대 크기 점선, 선택 상자, 배치 미리보기 ───── */
  /* 우리 영역: 기본 스타일은 최대 확장(Lv.8) 크기, 둥근 마당은 고정 크기 */
  penArea() {
    const h = this.layout.places.home;
    return isGarden(h) ? { w: h.gw ?? GARDEN.w, d: h.gd ?? GARDEN.d } : PEN_MAX;
  }
  buildOverlays() {
    const area = this.penArea();
    const g = new THREE.BufferGeometry().setFromPoints([
      [-1, -1], [1, -1], [1, -1], [1, 1], [1, 1], [-1, 1], [-1, 1], [-1, -1],
    ].map(([x, z]) => new THREE.Vector3(x * area.w / 2, 0, z * area.d / 2)));
    this.penOutline = new THREE.LineSegments(g, new THREE.LineDashedMaterial({ color: 0xd2691e, dashSize: 0.6, gapSize: 0.4, depthTest: false }));
    this.penOutline.computeLineDistances(); this.penOutline.renderOrder = 30;
    this.w.scene.add(this.penOutline);
    this.selBox = new THREE.Box3Helper(new THREE.Box3(), 0x2f80ed); this.selBox.visible = false; this.selBox.material.depthTest = false; this.selBox.renderOrder = 31;
    this.w.scene.add(this.selBox);
    this.colliderGroup = new THREE.Group(); this.w.scene.add(this.colliderGroup);
    // 크기 손잡이: 선택한 에셋의 바운딩 박스 모서리에 표시. 끌면 크기가 바뀜 (Blender의 스케일처럼)
    this.handle = new THREE.Group(); this.handle.visible = false; this.handle.renderOrder = 33;
    const ring = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.72, 20, 14), new THREE.MeshBasicMaterial({ color: 0xff8a3d, depthTest: false }));
    ring.renderOrder = 33; dot.renderOrder = 34; this.handle.add(ring, dot); this.w.scene.add(this.handle);
  }
  selectedObject() {
    const s = this.sel; if (!s) return null;
    if (s.kind === 'prop') return this.w.propObjects.find(o => o.userData.propIndex === s.i) ?? null;
    if (s.kind === 'path') return this.w.pathMeshes[s.i] ?? null;
    return null;
  }
  updateSelectionBox() {
    const s = this.sel, box = this.selBox.box;
    box.makeEmpty();
    if (s?.kind === 'place') for (const o of this.w.placeObjects[s.id] ?? []) box.expandByObject(o);
    else { const o = this.selectedObject(); if (o) box.setFromObject(o); }
    this.selBox.visible = !box.isEmpty();
    this.handle.visible = s?.kind === 'prop' && !box.isEmpty() && !this.placing;
    if (this.handle.visible) this.handle.position.set(box.max.x, box.max.y, box.max.z);
    this.drawColliders();
  }
  /* 지나갈 수 없는 에셋의 충돌 영역을 빨간 테두리로 */
  drawColliders() {
    for (const c of [...this.colliderGroup.children]) { this.colliderGroup.remove(c); c.geometry.dispose(); }
    const mat = this.colliderMat ??= new THREE.LineBasicMaterial({ color: 0xe74c3c, transparent: true, opacity: 0.7, depthTest: false });
    for (const item of this.layout.props) {
      const b = propCollider(item); if (!b) continue;
      const [x0, x1, z0, z1] = b, y = 0.1;
      const g = new THREE.BufferGeometry().setFromPoints([[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]].map(([x, z]) => new THREE.Vector3(x, y, z)));
      const line = new THREE.Line(g, mat); line.renderOrder = 29; this.colliderGroup.add(line);
    }
  }

  /* ───── 입력 ───── */
  groundAt(e) {
    const r = this.w.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.w.camera);
    // 지형(층 높이)이 있으면 실제 바닥 면에 맞춤
    const hit = this.ray.intersectObject(this.w.ground, false)[0];
    if (hit) return hit.point.clone();
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.plane, p) ? p : null;
  }
  pickAt(e) {
    this.groundAt(e);
    const owner = new Map();
    const targets = [];
    for (const o of this.w.propObjects) { targets.push(o); owner.set(o, { kind: 'prop', i: o.userData.propIndex }); }
    for (const id of PLACE_IDS) for (const o of this.w.placeObjects[id] ?? []) { targets.push(o); owner.set(o, { kind: 'place', id }); }
    // 흙길은 넓어서 빈 땅 드래그(화면 이동)를 방해하므로 '흙길 고치기'를 켰을 때만 선택
    if (this.pathEdit) this.w.pathMeshes.forEach((m, i) => { targets.push(m); owner.set(m, { kind: 'path', i }); });
    for (const hit of this.ray.intersectObjects(targets, true)) {
      if (hit.object.isSprite) continue;
      let o = hit.object;
      while (o && !owner.has(o)) o = o.parent;
      if (o) return owner.get(o);
    }
    return null;
  }
  posOf(s) {
    if (s.kind === 'prop') return this.layout.props[s.i];
    if (s.kind === 'path') return this.layout.paths[s.i];
    return this.layout.places[s.id];
  }
  onPointer(type, e) {
    if (type === 'down') {
      if (e.button === 2) { this.stopPlacing(); return; }
      const g = this.groundAt(e); if (!g) return;
      if (this.placing) { this.addProp(this.placing, g.x, g.z); return; }
      if (this.onHandle(e)) {
        const item = this.layout.props[this.sel.i], c = this.screenOf(new THREE.Vector3(item.x, 0, item.z));
        this.resize = { s0: item.s, cx: c.x, cy: c.y, d0: Math.max(8, Math.hypot(e.clientX - c.x, e.clientY - c.y)), before: JSON.stringify(this.layout), moved: false };
        this.w.canvas.setPointerCapture(e.pointerId); return;
      }
      const hit = this.pickAt(e);
      if (hit) {
        this.select(hit);
        const p = this.posOf(hit);
        this.drag = { dx: p.x - g.x, dz: p.z - g.z, before: JSON.stringify(this.layout), moved: false };
      } else {
        this.select(null);
        this.pan = { x: e.clientX, y: e.clientY };
      }
      this.w.canvas.setPointerCapture(e.pointerId);
    } else if (type === 'move') {
      if (this.placing) { const g = this.groundAt(e); if (g && this.ghost) { this.ghost.visible = true; this.ghost.position.set(g.x, this.w.propY({ asset: this.placing, x: g.x, z: g.z }), g.z); } return; }
      if (this.resize && this.sel?.kind === 'prop') {
        const item = this.layout.props[this.sel.i], r = this.resize;
        const f = Math.hypot(e.clientX - r.cx, e.clientY - r.cy) / r.d0, step = e.shiftKey ? 0.5 : 0.05;
        item.s = r2(Math.min(10, Math.max(0.1, Math.round(r.s0 * f / step) * step)));
        r.moved = true; this.applyPropTransform(this.sel.i); this.updateSelectionBox(); this.renderInfo(true);
        return;
      }
      if (!this.drag && !this.pan) this.w.canvas.style.cursor = this.onHandle(e) ? 'nwse-resize' : '';
      if (this.drag && this.sel) {
        const g = this.groundAt(e); if (!g) return;
        const p = this.posOf(this.sel), snap = e.shiftKey ? 1 : 0.1;
        p.x = r2(clampX(Math.round((g.x + this.drag.dx) / snap) * snap));
        p.z = r2(clampZ(Math.round((g.z + this.drag.dz) / snap) * snap));
        this.drag.moved = true;
        if (this.sel.kind === 'prop') this.applyPropTransform(this.sel.i);
        else if (this.sel.kind === 'path') this.applyPaths();
        else this.applyPlaces();
        this.updateSelectionBox(); this.renderInfo(true);
      } else if (this.pan) {
        const k = this.zoom / innerHeight * 1.6;
        this.focus.x = clampX(this.focus.x - (e.clientX - this.pan.x) * k);
        this.focus.z = clampZ(this.focus.z - (e.clientY - this.pan.y) * k);
        this.pan = { x: e.clientX, y: e.clientY };
      }
    } else if (type === 'up') {
      if (this.resize?.moved) { this.history.push(this.resize.before); this.future = []; this.applyProps(); this.refresh(); }
      this.resize = null;
      if (this.drag?.moved) {
        this.history.push(this.drag.before); this.future = [];
        if (this.sel?.kind === 'prop') this.applyProps();   // 충돌 영역 갱신
        this.refresh();
      }
      this.drag = null; this.pan = null;
    }
  }
  bindKeys() {
    this.w.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoom = Math.min(70, Math.max(8, this.zoom * (e.deltaY > 0 ? 1.12 : 0.89)));
    }, { passive: false });
    this.w.canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('keydown', e => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && k === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
      if (ctrl && k === 'y') { e.preventDefault(); this.redo(); return; }
      if (ctrl && k === 's') { e.preventDefault(); this.save(); return; }
      if (ctrl && k === 'd') { e.preventDefault(); this.duplicate(); return; }
      if (k === 'escape') { this.placing ? this.stopPlacing() : this.select(null); return; }
      if (k === 'delete' || k === 'backspace') { e.preventDefault(); this.remove(); return; }
      if (k === 'q' || k === 'e') { this.transformSel({ ry: k === 'q' ? STEP_ROT : -STEP_ROT }); return; }
      if (k === '-' || k === '=' || k === '+') { this.transformSel({ s: k === '-' ? 1 / 1.1 : 1.1 }); return; }
      const pan = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] }[k];
      if (pan && !ctrl) { e.preventDefault(); this.focus.x = clampX(this.focus.x + pan[0] * this.zoom * 0.06); this.focus.z = clampZ(this.focus.z + pan[1] * this.zoom * 0.06); }
    });
  }

  /* ───── 편집 동작 ───── */
  select(s) { this.sel = s; this.updateSelectionBox(); this.renderInfo(); }
  async startPlacing(id) {
    this.stopPlacing();
    this.placing = id; this.select(null);
    try {
      const ghost = await makeProp({ asset: id, x: this.focus.x, z: this.focus.z, ry: 0, s: 1 });
      if (this.placing !== id) return;
      ghost.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; } });
      ghost.visible = false; this.ghost = ghost; this.w.scene.add(ghost);
    } catch (error) { this.toast('에셋을 불러오지 못했어요: ' + error.message); this.placing = null; }
    this.renderAssets(); this.renderInfo();
  }
  stopPlacing() {
    if (this.ghost) { this.w.scene.remove(this.ghost); this.ghost.traverse(o => o.isMesh && o.material.dispose()); }
    this.ghost = null; this.placing = null; this.renderAssets(); this.renderInfo();
  }
  addProp(asset, x, z) {
    this.snapshot();
    const last = [...this.layout.props].reverse().find(p => p.asset === asset);
    this.layout.props.push({ asset, x: r2(clampX(x)), z: r2(clampZ(z)), ry: last?.ry ?? 0, s: last?.s ?? 1 });
    this.applyProps(); this.refresh();
  }
  addPath() {
    this.snapshot();
    this.layout.paths.push({ x: r2(this.focus.x), z: r2(this.focus.z), w: 3, d: 6 });
    this.pathEdit = true; this.panel.querySelector('[data-a=pathedit]').checked = true;
    this.applyPaths(); this.select({ kind: 'path', i: this.layout.paths.length - 1 }); this.refresh();
  }
  transformSel({ ry = 0, s = 1 }) {
    if (this.sel?.kind !== 'prop') return;
    const item = this.layout.props[this.sel.i];
    this.snapshot();
    item.ry = r2(((item.ry + ry) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2));
    item.s = r2(Math.min(10, Math.max(0.1, item.s * s)));
    this.applyPropTransform(this.sel.i); this.applyProps(); this.refresh();
  }
  duplicate() {
    const s = this.sel;
    if (s?.kind === 'prop') {
      this.snapshot();
      const item = { ...this.layout.props[s.i], x: r2(clampX(this.layout.props[s.i].x + 1.5)) };
      this.layout.props.push(item); this.sel = { kind: 'prop', i: this.layout.props.length - 1 };
      this.applyProps(); this.refresh();
    } else if (s?.kind === 'path') {
      this.snapshot();
      const p = { ...this.layout.paths[s.i], x: r2(clampX(this.layout.paths[s.i].x + 3)) };
      this.layout.paths.push(p); this.sel = { kind: 'path', i: this.layout.paths.length - 1 };
      this.applyPaths(); this.refresh();
    }
  }
  remove() {
    const s = this.sel;
    if (!s) return;
    if (s.kind === 'place') { this.toast('장소는 지울 수 없어요. 옮기기만 가능해요.'); return; }
    this.snapshot();
    if (s.kind === 'prop') { this.layout.props.splice(s.i, 1); this.applyProps(); }
    else { this.layout.paths.splice(s.i, 1); this.applyPaths(); }
    this.sel = null; this.refresh();
  }
  setField(field, value) {
    const s = this.sel; if (!s) return;
    const v = +value; if (!Number.isFinite(v)) return;
    this.snapshot();
    const p = this.posOf(s);
    if (field === 'rot') p.ry = r2(((v % 360) + 360) % 360 * Math.PI / 180);
    else if (field === 'x') p.x = r2(clampX(v));
    else if (field === 'z') p.z = r2(clampZ(v));
    else if (field === 's') p.s = r2(Math.min(10, Math.max(0.1, v)));
    else if (field === 'w' || field === 'd') p[field] = r2(Math.min(120, Math.max(0.5, v)));
    if (s.kind === 'prop') { this.applyPropTransform(s.i); this.applyProps(); }
    else if (s.kind === 'path') this.applyPaths();
    else this.applyPlaces();
    this.refresh(true);
  }

  /* 장소 모양 바꾸기: 월드를 다시 만들어야 하므로 편집본을 잠시 보관하고 새로고침 */
  setLook(id, key, value) {
    const place = id && this.layout.places[id]; if (!place) return;
    if (key === 'style') { if (value === 'garden') { place.style = 'garden'; place.gw ??= GARDEN.w; place.gd ??= GARDEN.d; } else { delete place.style; delete place.gw; delete place.gd; delete place.house; } }
    else if (key === 'gw' || key === 'gd') place[key] = r2(Math.min(40, Math.max(8, +value || GARDEN[key === 'gw' ? 'w' : 'd'])));
    else if (key === 'ry') place.ry = r2(((+value % 360) + 360) % 360 * Math.PI / 180);
    else if (key === 's') place.s = r2(Math.min(10, Math.max(0.1, +value || 1)));
    else if (value) { place[key] = value; if (key === 'model') { place.ry ??= 0; place.s ??= 1; } }
    else { delete place[key]; if (key === 'model') { delete place.ry; delete place.s; } }
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ layout: this.layout, saved: this.saved, select: id, focus: [this.focus.x, this.focus.z], zoom: this.zoom })); } catch {}
    this.reloading = true; location.reload();
  }

  screenOf(v) {
    const p = v.clone().project(this.w.camera), r = this.w.canvas.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }
  onHandle(e) {
    if (!this.handle?.visible || this.sel?.kind !== 'prop') return false;
    const c = this.screenOf(this.handle.position), r = this.screenOf(this.handle.position.clone().add(new THREE.Vector3(this.handle.scale.x, 0, 0)));
    return Math.hypot(e.clientX - c.x, e.clientY - c.y) <= Math.max(18, Math.hypot(r.x - c.x, r.y - c.y) * 1.8);
  }

  /* 장소 입구·우리를 막는 에셋 찾기 */
  warnings() {
    const out = [], P = this.layout.places;
    const spots = [
      // 실제 입구 위치(월드가 만든 도착 판정) + 편집 중 옮긴 만큼
      ...Object.keys(ENTRANCE).map(id => {
        const z0 = this.w.zones.find(z => z.id === id), b = this.placeBase[id];
        return z0 ? { id, x: z0.x + P[id].x - b.x, z: z0.z + P[id].z - b.z, r: 1.9 } : { id, x: P[id].x, z: P[id].z + ENTRANCE[id], r: 1.9 };
      }),
    ];
    const home = P.home, area = this.penArea(), hw = area.w / 2, hd = area.d / 2;
    this.layout.props.forEach((item, i) => {
      const b = propCollider(item); if (!b) return;
      const [x0, x1, z0, z1] = b, name = catalogEntry(item.asset)?.name ?? item.asset;
      for (const s of spots) {
        const cx = Math.max(x0, Math.min(s.x, x1)), cz = Math.max(z0, Math.min(s.z, z1));
        if (Math.hypot(cx - s.x, cz - s.z) < s.r) out.push({ i, text: `${name}이(가) ${PLACE_LABELS[s.id]} 입구를 막고 있어요` });
      }
      // 둥근 마당은 크기가 고정이라 안에 장식을 놓아도 괜찮음 (확장 범위 경고는 기본 스타일에서만)
      if (!isGarden(P.home) && x1 > home.x - hw && x0 < home.x + hw && z1 > home.z - hd && z0 < home.z + hd + 1.5) out.push({ i, text: `${name}이(가) 우리 확장 범위(점선) 안에 있어요` });
    });
    return out;
  }

  async save() {
    const layout = normalizeLayout(this.layout);
    try {
      const res = await fetch('/__save-layout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(layout) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || res.status);
      this.saved = JSON.stringify(this.layout);
      try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
      this.toast('저장했어요 · assets/map-layout.json');
    } catch (error) {
      // 저장 서버가 아니면(일반 http.server 등) 파일로 내려받기
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(layout, null, 1)], { type: 'application/json' }));
      a.download = 'map-layout.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      this.toast('저장 서버에 연결하지 못해 파일로 내려받았어요. symbiosis-web/assets/ 폴더에 넣어 주세요.');
      console.warn(error);
    }
    this.refresh();
  }

  frame() {
    if (this.handle?.visible) this.handle.scale.setScalar(this.zoom * 0.014);
    // 편집 중에는 고양이를 숨겨 배치가 잘 보이게
    for (const o of this.w.catObjs.values()) o.holder.visible = false;
  }

  /* ───── 패널 ───── */
  buildPanel() {
    document.body.classList.add('map-editing');
    const style = document.createElement('style');
    style.textContent = `
body.map-editing #tabs, body.map-editing #hint, body.map-editing #touchStick, body.map-editing #journey, body.map-editing #worldPenUpgrade, body.map-editing #panel { display:none !important; }
#mapEditor { position:fixed; left:10px; top:66px; bottom:10px; width:290px; z-index:60; display:flex; flex-direction:column; gap:8px;
  background:#fffaf0f2; border:2px solid #e6d3b3; border-radius:16px; padding:10px; font:13px/1.4 'Malgun Gothic',sans-serif; color:#5a4332; overflow:auto; box-shadow:0 6px 20px #0002 }
#mapEditor h2 { margin:0; font-size:16px } #mapEditor h3 { margin:6px 0 2px; font-size:13px; color:#8a6a4c }
#mapEditor .row { display:flex; gap:6px; flex-wrap:wrap; align-items:center }
#mapEditor button { font:inherit; border:1px solid #d9c3a0; background:#fff; border-radius:10px; padding:4px 8px; cursor:pointer; color:inherit }
#mapEditor button:hover { background:#fff1dc } #mapEditor button.on { background:#2f80ed; color:#fff; border-color:#2f80ed }
#mapEditor button.primary { background:#e9875f; color:#fff; border-color:#e9875f; font-weight:bold }
#mapEditor .assets { display:grid; grid-template-columns:repeat(3,1fr); gap:6px }
#mapEditor .asset { display:flex; flex-direction:column; align-items:center; padding:4px; font-size:11px; text-align:center; min-height:84px }
#mapEditor .asset img { width:56px; height:56px; object-fit:contain } #mapEditor .asset .noimg { width:56px; height:56px; display:grid; place-items:center; font-size:24px }
#mapEditor label { display:flex; gap:6px; align-items:center } #mapEditor input[type=number] { width:64px; font:inherit }
#mapEditor input[type=range] { flex:1 } #mapEditor .warn { color:#c0392b; font-size:12px } #mapEditor .muted { color:#9a8470; font-size:12px }
#mapEditorToast { position:fixed; left:50%; bottom:20px; transform:translateX(-50%); background:#5a4332; color:#fff; padding:8px 14px; border-radius:12px; z-index:70; font:13px 'Malgun Gothic',sans-serif }`;
    document.head.appendChild(style);
    const el = this.panel = document.createElement('aside');
    el.id = 'mapEditor';
    el.innerHTML = `
<h2>🛠️ 맵 편집 모드</h2>
<div class="row"><button class="primary" data-a="save">💾 저장</button><button data-a="undo">↶ 되돌리기</button><button data-a="redo">↷</button><a href="./index.html"><button type="button">▶ 플레이로</button></a></div>
<div class="muted" data-status></div>
<div data-info></div>
<h3>장소 (옮기기만 가능)</h3><div class="row" data-places></div>
<h3>흙길</h3><div class="row"><button data-a="path">＋ 흙길 추가</button><label><input type="checkbox" data-a="pathedit"> 흙길 고치기</label><label><input type="checkbox" data-a="decor"> 기본 나무·꽃 자동 배치</label></div>
<div class="muted" data-decornote></div>
<h3>배경 에셋</h3><div data-assets class="assets"></div>
<div class="muted">땅 클릭: 놓기 · 끌기: 옮기기(Shift=1칸 단위) · Q/E: 회전 · -/= 또는 주황 손잡이 끌기: 크기(Shift=0.5 단위) · Delete: 삭제 · Ctrl+D: 복제 · Ctrl+Z: 되돌리기 · 빈 곳 드래그/WASD: 화면 이동 · 휠: 확대 · Esc/우클릭: 놓기 끝</div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-a],[data-asset],[data-place]'); if (!b) return;
      if (b.dataset.asset) { this.placing === b.dataset.asset ? this.stopPlacing() : this.startPlacing(b.dataset.asset); return; }
      if (b.dataset.place) { const p = this.layout.places[b.dataset.place]; this.focus.set(p.x, 0, p.z); this.select({ kind: 'place', id: b.dataset.place }); return; }
      const a = b.dataset.a;
      if (a === 'save') this.save(); else if (a === 'undo') this.undo(); else if (a === 'redo') this.redo();
      else if (a === 'path') this.addPath(); else if (a === 'dup') this.duplicate(); else if (a === 'del') this.remove();
      else if (a === 'rotl') this.transformSel({ ry: STEP_ROT }); else if (a === 'rotr') this.transformSel({ ry: -STEP_ROT });
      else if (a === 'warn') this.select({ kind: 'prop', i: +b.dataset.i });
    });
    el.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.a === 'pathedit') { this.pathEdit = t.checked; if (!t.checked && this.sel?.kind === 'path') this.select(null); return; }
      if (t.dataset.a === 'decor') { this.snapshot(); this.layout.randomDecor = t.checked; this.refresh(); return; }
      if (t.dataset.f) this.setField(t.dataset.f, t.value);
      if (t.dataset.look) this.setLook(this.sel?.id, t.dataset.look, t.value);
    });
    el.querySelector('[data-places]').innerHTML = PLACE_IDS.map(id => `<button data-place="${id}">${esc(PLACE_LABELS[id])}</button>`).join('');
    this.renderAssets();
  }
  renderAssets() {
    const box = this.panel?.querySelector('[data-assets]'); if (!box) return;
    if (!this.catalog) { box.innerHTML = '<div class="muted">불러오는 중…</div>'; return; }
    if (!this.catalog.length) { box.innerHTML = '<div class="muted">변환된 배경 에셋이 없어요. tools/export_props.py로 .blend를 변환하면 여기에 나타나요.</div>'; return; }
    const groups = { building: '🏠 건물', furniture: '🪑 가구·울타리', nature: '🌳 자연', prop: '🎁 소품' };
    box.innerHTML = Object.entries(groups).map(([cat, title]) => {
      const items = this.catalog.filter(a => a.category === cat); if (!items.length) return '';
      return `<div style="grid-column:1/-1" class="muted">${title}</div>` + items.map(a => {
        const img = thumbUrl(a);
        return `<button class="asset ${this.placing === a.id ? 'on' : ''}" data-asset="${esc(a.id)}" title="${esc(a.name)} · ${a.size.join('×')}m">${img ? `<img src="${esc(img)}" alt="">` : '<span class="noimg">📦</span>'}${esc(a.name)}</button>`;
      }).join('');
    }).join('');
    // 미리보기 이미지가 없는 에셋은 모델을 찍어 썸네일로
    for (const a of this.catalog) {
      if (thumbUrl(a)) continue;
      renderThumb(a).then(url => {
        const span = box.querySelector(`[data-asset="${CSS.escape(a.id)}"] .noimg`);
        if (span) span.outerHTML = `<img src="${url}" alt="">`;
      }).catch(() => {});
    }
  }
  renderInfo(light = false) {
    const box = this.panel?.querySelector('[data-info]'); if (!box) return;
    const s = this.sel;
    if (this.placing) { box.innerHTML = `<b>놓는 중: ${esc(catalogEntry(this.placing)?.name ?? this.placing)}</b><div class="muted">땅을 클릭할 때마다 하나씩 놓여요. Esc 또는 우클릭으로 끝내요.</div>`; return; }
    if (!s) { box.innerHTML = '<div class="muted">오브젝트를 클릭하면 여기서 위치·회전·크기를 바꿀 수 있어요.</div>'; return; }
    const p = this.posOf(s); if (!p) { this.sel = null; return this.renderInfo(); }
    if (light) {  // 드래그 중엔 숫자만 갱신
      for (const f of ['x', 'z', 's']) { const inp = box.querySelector(`[data-f=${f}]`); if (inp && p[f] !== undefined) inp.value = p[f]; }
      return;
    }
    const num = (f, v, step = 0.1) => `<label>${f.toUpperCase()} <input type="number" step="${step}" data-f="${f}" value="${v}"></label>`;
    if (s.kind === 'place') {
      const opts = cur => `<option value="">기본 모양</option>` + (this.catalog ?? []).map(a => `<option value="${esc(a.id)}" ${a.id === cur ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
      const garden = s.id === 'home' && isGarden(p);
      const styleSel = s.id === 'home' ? `<label>스타일 <select data-look="style"><option value="">기본 (레벨마다 커지는 네모 우리)</option><option value="garden" ${garden ? 'selected' : ''}>둥근 마당 (사진 디자인)</option></select></label>` : '';
      const lookKeys = (PLACE_LOOKS[s.id] ?? []).filter(key => !(garden && key === 'shelter'));
      const looks = styleSel + lookKeys.map(key => `<label>${LOOK_LABELS[key]} <select data-look="${key}">${opts(p[key])}</select></label>`).join('')
        + (garden ? `<label>집 모양 <select data-look="house">${opts(p.house).replace('기본 모양', '기본 (올리브 기와 집)')}</select></label>
<div class="row"><label>가로 <input type="number" step="1" min="8" max="40" data-look="gw" value="${p.gw ?? GARDEN.w}"></label><label>세로 <input type="number" step="1" min="8" max="40" data-look="gd" value="${p.gd ?? GARDEN.d}"></label></div>
<div class="muted">둥근 마당은 크기가 고정이에요. 우리 레벨을 올려도 모양은 그대로이고, 마릿수(정원)만 늘어나요. 고양이 쉼터 자리는 집 안이에요.</div>` : '');
      const modelExtra = p.model ? `<label>회전 <input type="range" min="0" max="345" step="15" data-look="ry" value="${Math.round((p.ry || 0) * 180 / Math.PI)}"> ${Math.round((p.ry || 0) * 180 / Math.PI)}°</label><label>크기 <input type="number" step="0.1" min="0.1" max="10" data-look="s" value="${p.s ?? 1}"></label><div class="muted">입구(노란 원)는 건물 정면(회전 방향) 앞에 생겨요.</div>` : '';
      box.innerHTML = `<b>${esc(PLACE_LABELS[s.id])}</b><div class="row">${num('x', p.x)}${num('z', p.z)}</div>${looks}${modelExtra}<div class="muted">장소는 지울 수 없어요. 옮기면 메뉴가 열리는 위치도 따라가요.${looks ? ' 모양을 바꾸면 화면을 다시 불러와요(편집 내용은 유지).' : ''}</div>`;
    } else if (s.kind === 'path') {
      box.innerHTML = `<b>흙길</b><div class="row">${num('x', p.x)}${num('z', p.z)}${num('w', p.w)}${num('d', p.d)}</div><div class="row"><button data-a="dup">복제</button><button data-a="del">🗑 삭제</button></div>`;
    } else {
      const deg = Math.round(p.ry * 180 / Math.PI);
      box.innerHTML = `<b>${esc(catalogEntry(p.asset)?.name ?? p.asset)}</b>
<div class="row">${num('x', p.x)}${num('z', p.z)}</div>
<label>회전 <input type="range" min="0" max="345" step="15" data-f="rot" value="${deg}"> ${deg}°</label>
<label>크기 <input type="number" step="0.1" min="0.1" max="10" data-f="s" value="${p.s}"></label>
<div class="row"><button data-a="rotl">⟲ 15°</button><button data-a="rotr">⟳ 15°</button><button data-a="dup">복제</button><button data-a="del">🗑 삭제</button></div>
<div class="muted">충돌: ${{ solid: '지나갈 수 없음', trunk: '줄기만 막힘', none: '지나갈 수 있음' }[catalogEntry(p.asset)?.collider] ?? '-'}</div>`;
    }
  }
  refresh(light = false) {
    if (!this.panel) return;
    const status = this.panel.querySelector('[data-status]');
    status.textContent = `${this.dirty() ? '● 저장 안 된 변경 있음' : '✓ 저장됨'} · 에셋 ${this.layout.props.length}개 · 흙길 ${this.layout.paths.length}개`;
    const decor = this.panel.querySelector('[data-a=decor]'); decor.checked = this.layout.randomDecor;
    this.panel.querySelector('[data-decornote]').textContent = this.layout.randomDecor !== getMapLayout().randomDecor ? '자동 배치 변경은 저장 후 새로고침하면 보여요.' : '';
    let warn = this.panel.querySelector('[data-warnings]');
    if (!warn) { warn = document.createElement('div'); warn.dataset.warnings = ''; status.after(warn); }
    warn.innerHTML = this.warnings().slice(0, 6).map(w => `<div class="warn" data-a="warn" data-i="${w.i}" style="cursor:pointer">⚠ ${esc(w.text)}</div>`).join('');
    this.updateSelectionBox();
    if (!light) this.renderInfo();
  }
  toast(text) {
    let t = document.getElementById('mapEditorToast');
    if (!t) { t = document.createElement('div'); t.id = 'mapEditorToast'; document.body.appendChild(t); }
    t.textContent = text; t.hidden = false;
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  }
}
