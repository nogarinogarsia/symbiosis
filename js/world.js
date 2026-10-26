// 3D 월드: 내 우리 + 이웃 우리 + 동물샵·교배집 건물. 플레이어가 걸어 다니며 다가가면 창이 열림.
import * as THREE from 'three';
import { behaviorOf, chooseActivity, ACTIVITY_NAMES, socialTarget, canReceiveGreeting } from './behavior.js';
import { buildCat, disposeCat } from './cat3d.js';
import { toon } from './cat3d.js';
import { addLights } from './stage.js';
import { RNG } from './rng.js';
import {nearbyZones,canOpenAt} from './locations.js';
import {findPath,segmentClear} from './navigation.js';

const CAT_SCALE = 0.7;
const BOUNDS = { minX: -36, maxX: 36, minZ: -26, maxZ: 22 };

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
    this.buildGround(); this.buildDecor(); this.buildBuildings(); this.buildPens();
    this.player = this.makeAvatar({ hair: 0xf1e3c8, shirt: 0xffffff, stripe: 0x3a4a63, pants: 0x4a5f8a, skin: 0xf3c9a6 });
    this.player.position.set(-1, 0, 13); this.scene.add(this.player);
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
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(170, 130), new THREE.MeshBasicMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2; ground.userData.ground = true; this.scene.add(ground); this.ground = ground;
    // 흙길
    const dirt = toon(0xe8d3a2);
    const path = (x, z, w, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), dirt); m.position.set(x, 0.02, z); this.scene.add(m); };
    path(0, 13, 64, 3); path(-9, 9, 3, 6); path(6, 11, 3, 4); path(20, 8.5, 3, 9); path(0, -2, 3, 30);
    for (const x of [-24, -12, 0, 12, 24]) path(x, -9, 3, 5);
    path(0, -10.4, 54, 2.4);
  }
  buildDecor() {
    const rng = new RNG('decor');
    const keepOut = [[-16, -3, 7.5, 7], [0, 12, 12, 12], [14, 27, -2, 8], [-30, 30, -19, -8]];
    const free = (x, z) => (Math.abs(x) > 27 || z < -20) && !keepOut.some(([x0, x1, z0, z1]) => x > x0 - 2 && x < x1 + 2 && z > z0 - 2 && z < z1 + 2) && Math.abs(z - 13) > 2.5 && Math.abs(x) > 3;
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
      g.position.set(x, 0, z); g.scale.setScalar(s); this.scene.add(g);
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
    const g = new THREE.Group(); g.position.set(cx, 0, cz);
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
    ring.rotation.x = -Math.PI / 2; ring.position.set(zx, 0.07, zz); this.scene.add(ring); this.pulsers.push(ring);
    g.userData.zoneId = zoneId; this.clickables = (this.clickables || []).concat([g]);
    return g;
  }
  buildBuildings() {
    this.house(-23, 4, 5.8, 4, 0xf1ead5, 0x8daf9c, '📖 유전 도서관', 'dex');
    this.house(20, 3, 6.5, 4.6, 0xfbeed1, 0xe58a6a, '🛍️ 동물샵', 'shop');
    this.house(6, 8, 5.4, 4, 0xffe0e6, 0xf08a9b, '💞 교배집', 'breed');
  }

  /* ───── 우리(울타리) ───── */
  buildPen(id, cx, cz, w, d, name, color = 0xf2e2b6) {
    const g = new THREE.Group(); this.scene.add(g);
    const obstacles=[];
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color }));
    yard.rotation.x = -Math.PI / 2; yard.position.set(cx, 0.03, cz); g.add(yard);
    const wood = toon(0xc99a66), gate = 1.8;
    const postGeo = new THREE.BoxGeometry(0.22, 1.1, 0.22);
    const rail = (x, z, lw, ld) => {
      for (const y of [0.45, 0.85]) { const m = new THREE.Mesh(new THREE.BoxGeometry(lw, 0.12, ld), wood); m.position.set(x, y, z); g.add(m); }
      const obstacle=[x - lw / 2 - 0.05, x + lw / 2 + 0.05, z - ld / 2 - 0.05, z + ld / 2 + 0.05];
      this.colliders.push(obstacle);obstacles.push(obstacle);
    };
    const post = (x, z) => { const m = new THREE.Mesh(postGeo, wood); m.position.set(x, 0.55, z); g.add(m); };
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    rail(cx, z0, w, 0.12);                       // 북쪽
    rail(x0, cz, 0.12, d); rail(x1, cz, 0.12, d); // 서·동
    const left = (cx - gate / 2) - x0, right = x1 - (cx + gate / 2);
    rail(x0 + left / 2, z1, left, 0.12); rail(x1 - right / 2, z1, right, 0.12); // 남쪽(문 열림)
    for (let x = x0; x <= x1 + 0.01; x += 1.5) { if (Math.abs(x - cx) > gate / 2 - 0.05) { post(x, z0); post(x, z1); } }
    for (let z = z0; z <= z1 + 0.01; z += 1.5) { post(x0, z); post(x1, z); }
    const lb = label(name, { scale: 0.95 }); lb.position.set(cx, 3.1, z0 + 0.3); g.add(lb);
    g.userData.ownedTextures=new Set([lb.material.map]);
    this.pens[id] = { id, cx, cz, w, d, group:g,obstacles,minX: x0 + 1, maxX: x1 - 1, minZ: z0 + 1, maxZ: z1 - 1, gate: { x: cx, z: z1 } };
    this.buildShelters(this.pens[id]);
  }
  buildShelters(pen) {
    pen.shelters = [-1, 1].map((side, index) => {
      const x = side < 0 ? pen.minX + .65 : pen.maxX - .65, z = pen.minZ + .55;
      const hut = new THREE.Group(); hut.position.set(x, 0, z);
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
    this.buildPen('mine', -9, 2, 12, 9, '🏠 우리 집', 0xf5e6b8);
    this.buildLitterTray();
    this.npcPositions = [-24, -12, 0, 12, 24];
    this.penLevel=1;
  }
  syncPen(level,capacity,count){
    if(this.penLevel!==level){
      const previous=this.pens.mine,journey=this.destination;
      this.cancelJourney();this.colliders=this.colliders.filter(o=>!previous.obstacles.includes(o));
      this.scene.remove(previous.group);disposeCat(previous.group);
      for(const shelter of previous.shelters){this.scene.remove(shelter.object);disposeCat(shelter.object);}
      this.scene.remove(this.litterTray);this.litterLabel?.material.map.dispose();disposeCat(this.litterTray);
      this.litterLabel=null;this.litterKey=null;this.penSign=null;this.penSignKey=null;
      this.buildPen('mine',-9,2,12+(level-1)*.8,9+(level-1)*.3,`🏠 우리 집 Lv.${level}`,level>=5?0xe0e8b9:0xf5e6b8);
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
    this.penSign=label(`Lv.${level} · ${count}/${capacity}마리`,{scale:.8,bg:count>capacity?'#ffe1d3':'#fffaf0'});
    this.penSign.position.set(pen.cx-3,2,pen.gate.z+.1);pen.group.add(this.penSign);pen.group.userData.ownedTextures.add(this.penSign.material.map);this.penSignKey=key;
  }
  buildLitterTray() {
    const pen = this.pens.mine;
    const tray = new THREE.Group(); tray.position.set(pen.minX + .6, 0, pen.maxZ - .4);
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
    npcs.forEach((n, i) => {
      const cx = this.npcPositions[i];
      this.buildPen('npc:' + n.id, cx, -14, 9, 7, `${n.icon} ${n.name}의 우리`, 0xf0e0c0);
      const av = this.makeAvatar({ hair: hairs[i % 5], shirt: shirts[i % 5], stripe: shirts[i % 5], pants: 0x6b5a4a, skin: 0xf3c9a6 });
      av.position.set(cx + 5.6, 0, -10.3); av.rotation.y = 0.3; av.userData.npcId = n.id; av.userData.idle = true;
      this.scene.add(av); this.npcAvatars.push(av);
      this.zones.push({ id: 'npc:' + n.id, x: cx + 4.4, z: -9.4, r: 2.6 });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.2, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(cx + 5.6, 0.07, -10.3); this.scene.add(ring); this.pulsers.push(ring);
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
    this.canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; lastX = e.clientX; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', e => {
      if (down && this.followCatId) { this.orbit = (this.orbit ?? 0) + (e.clientX - lastX) * .012; lastX = e.clientX; }
    });
    this.canvas.addEventListener('pointercancel', () => { down = null; });
    this.canvas.addEventListener('pointerup', (e) => {
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
  snapCamera() { this.camPos.set(this.player.position.x, 0, this.player.position.z); this.placeCamera(); }
  placeCamera() {
    const distance = this.viewDistance ?? 15.5, orbit = this.followCatId ? this.orbit ?? 0 : 0;
    this.camera.position.set(this.camPos.x + Math.sin(orbit) * distance * .97, distance, this.camPos.z + Math.cos(orbit) * distance * .97);
    this.camera.lookAt(this.camPos.x, 1, this.camPos.z - 0.5);
  }
  teleport(x, z) { this.player.position.set(x, 0, z); this.cancelJourney(); this.snapCamera(); }
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
    const dt = Math.min(0.05, this.clock.getDelta()), t = this.clock.elapsedTime;
    this.movePlayer(dt, t);
    const followed = this.catObjs.get(this.followCatId);
    const anchor = followed ? followed.holder.position : this.player.position;
    this.camPos.lerp(new THREE.Vector3(anchor.x, 0, anchor.z), 1 - Math.exp(-dt * 4));
    this.viewDistance = THREE.MathUtils.lerp(this.viewDistance ?? 15.5, followed ? 7.5 : 15.5, 1 - Math.exp(-dt * 4));
    this.placeCamera();
    this.updateCats(dt, t);
    for (const av of this.npcAvatars) { av.userData.inner.position.y = Math.sin(t * 2 + av.position.x) * 0.03; av.userData.head.rotation.z = Math.sin(t * 1.3 + av.position.x) * 0.06; }
    for (const p of this.pulsers) { const s = 1 + Math.sin(t * 3) * 0.12; p.scale.set(s, s, 1); }
    this.checkZones();
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
          if (plan.target) { o.tx = plan.target.x; o.tz = plan.target.z; o.moving = true; }
        }
      } else {
        if (o.partnerId) {
          const friend = this.catObjs.get(o.partnerId);
          if (!friend || friend.pen !== o.pen || !canReceiveGreeting(friend.activity) || (friend.socialUntil ?? 0) > t || t > o.chaseUntil) {
            o.partnerId = null; o.moving = false; o.activity = 'idle'; o.wait = 1;
          } else {
            const destination = socialTarget(h.position,friend.holder.position,pen);
            o.tx = destination.x; o.tz = destination.z;
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
        const ang = Math.atan2(ex, ez);
        let da = ang - h.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); h.rotation.y += da * Math.min(1, dt * 6);
        const step = Math.min(dist, o.speed * dt);
        h.position.x += ex / dist * step; h.position.z += ez / dist * step;
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
