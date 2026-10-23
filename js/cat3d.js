// 코드로 만든 프로시저럴 툰 고양이 (구·캡슐·튜브 조합 + 인버티드 헐 외곽선)
import * as THREE from 'three';
import { resolveAppearance, FANTASY_PALETTE, mix } from './appearance.js';
import { partTextures, releasePartTextures, eyeTexture, furAlpha } from './textures.js';
import { behaviorOf } from './behavior.js';

const INK = 0x4a3330;
const OUTLINES = false; // 툰 셰이딩은 유지, 테두리는 제거
let _grad = null;
function gradient() {
  if (_grad) return _grad;
  const data = new Uint8Array([150, 200, 235, 255]);
  _grad = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  _grad.minFilter = _grad.magFilter = THREE.NearestFilter; _grad.needsUpdate = true;
  return _grad;
}
export function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradient(), ...opts });
}
function outlineMat(thick) {
  const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${thick.toFixed(4)};`);
  };
  return m;
}
function addPart(parent, geo, mat, { pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0], outline = 0.028 } = {}) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos); mesh.scale.set(...scale); mesh.rotation.set(...rot);
  if (outline && OUTLINES) {
    const o = new THREE.Mesh(geo, outlineMat(outline));
    mesh.add(o);
  }
  parent.add(mesh);
  return mesh;
}

/* 솜털: 같은 메시를 법선 방향으로 조금씩 부풀린 반투명 셸을 겹쳐 가장자리가 솜처럼 보이게 함 */
function addFur(parent, geo, map, alphaMap, opts, shells = 6, len = 0.1) {
  for (let i = 1; i <= shells; i++) {
    const k = i / shells;
    const m = new THREE.MeshToonMaterial({ map, gradientMap: gradient(), alphaMap, alphaTest: 0.12 + 0.78 * k });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uInfl = { value: len * k };
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform float uInfl;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * uInfl;');
    };
    m.customProgramCacheKey = () => 'furshell';
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(...(opts.pos || [0, 0, 0])); mesh.scale.set(...(opts.scale || [1, 1, 1])); mesh.rotation.set(...(opts.rot || [0, 0, 0]));
    parent.add(mesh);
  }
}
const sphere = (r = 1) => new THREE.SphereGeometry(r, 28, 20);

export function buildCat(cat, opts = {}) {
  const app = resolveAppearance(cat);
  const tex = partTextures(THREE, cat, app);
  const b = cat.body;
  const long = app.long && !app.hairless;
  const root = new THREE.Group();
  root.userData.textureSet = tex;
  try {
  const rig = new THREE.Group(); root.add(rig);

  const matBody = toon(0xffffff, { map: tex.body });
  const matHead = toon(0xffffff, { map: tex.head });
  const matLegs = toon(0xffffff, { map: tex.legs });
  const matTail = toon(0xffffff, { map: tex.tail });
  const matEars = toon(0xffffff, { map: tex.ears });
  const matThigh = toon(0xffffff, { map: tex.thigh });

  const wK = (long ? 0.76 : 0.55) * (0.88 + 0.5 * b.bulk);
  const hK = long ? 0.7 : 0.62;
  const dK = long ? 0.8 : 0.84;
  const earK = 0.8 + 0.6 * b.ear + (app.hairless ? 0.4 : 0);
  const fw = 0.95 + 0.3 * b.face + (long ? 0.1 : 0);

  // 몸통
  const bodyGeo = sphere(); bodyGeo.rotateX(Math.PI / 2); // 극을 앞뒤축으로: 등 중앙선을 따라 줄무늬가 균일하게 배열
  const body = addPart(rig, bodyGeo, matBody, { pos: [0, 0.62, 0], scale: [wK, hK, dK] });
  // 다리 / 엉덩이
  const legGeo = new THREE.CapsuleGeometry(0.11, 0.32, 6, 12);
  const frontParts = [];
  for (const s of [-1, 1]) {
    const leg = addPart(rig, legGeo, matLegs, { pos: [s * 0.2 * (wK / 0.55) ** 0.5, 0.32, 0.5] });
    const paw = addPart(rig, sphere(), matLegs, { pos: [s * 0.2 * (wK / 0.55) ** 0.5, 0.08, 0.58], scale: [0.14, 0.09, 0.19], outline: 0.02 });
    frontParts.push({ leg, paw, side: s });
    addPart(rig, sphere(), matThigh, { pos: [s * wK * 0.78, 0.34, -0.2], scale: [0.27, 0.33, 0.44], outline: 0.026 });
    addPart(rig, sphere(), matLegs, { pos: [s * wK * 0.7, 0.08, 0.2], scale: [0.14, 0.09, 0.22], outline: 0.02 });
  }

  // 꼬리
  const tailGroup = new THREE.Group(); tailGroup.position.set(0, 0.25, -0.62); rig.add(tailGroup);
  if (app.special === 'manx') {
    addPart(tailGroup, sphere(), matBody, { pos: [0, 0.12, -0.08], scale: [0.15, 0.15, 0.15], outline: 0.022 });
  } else {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.02, -0.35), new THREE.Vector3(0.22, 0.12, -0.55),
      new THREE.Vector3(0.38, 0.55, -0.45), new THREE.Vector3(0.28, 0.95, -0.25)]);
    const r = app.hairless ? 0.05 : long ? 0.13 : 0.075;
    addPart(tailGroup, new THREE.TubeGeometry(curve, 28, r, 10), matTail, { outline: 0.022 });
    const end = curve.getPoint(1);
    addPart(tailGroup, sphere(), matTail, { pos: [end.x, end.y, end.z], scale: [r, r, r], outline: 0.022 });
    if (long) addPart(tailGroup, new THREE.ConeGeometry(0.17, 0.35, 8), matTail, { pos: [end.x, end.y + 0.1, end.z], outline: 0.02 });
  }

  // 머리
  const head = new THREE.Group(); head.position.set(0, 1.28, 0.2); rig.add(head);
  addPart(head, sphere(), matHead, { scale: [0.55 * fw, 0.47, 0.5], outline: 0.03 });
  // 귀
  const earGeo = app.special === 'curl'
    ? new THREE.TorusGeometry(0.11, 0.07, 8, 14, Math.PI * 1.5)
    : new THREE.ConeGeometry(0.17, 0.32, 4);
  for (const s of [-1, 1]) {
    const eg = new THREE.Group();
    eg.position.set(s * 0.33 * fw, 0.36, -0.02);
    if (app.special === 'curl') {
      eg.rotation.set(-0.5, s * 0.9, s * -0.25);
      const m = addPart(eg, earGeo, matEars, { scale: [earK, earK, earK] }); m.rotation.set(0, 0, s > 0 ? 2.0 : 1.2); m.position.set(0, 0.04, 0);
    } else {
      eg.rotation.set(-0.12, 0, s * -0.38);
      addPart(eg, earGeo, matEars, { scale: [earK, earK, earK * 0.7], pos: [0, 0.12 * earK, 0] });
    }
    head.add(eg);
  }
  // 눈 (성격별 모양)
  const eyeSize = 0.25 * (app.special === 'singapura' ? 1.4 : 1);
  const eyes = [];
  for (const s of [-1, 1]) {
    const mat = new THREE.MeshBasicMaterial({ map: eyeTexture(THREE, -1, app.eye, s > 0), transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(eyeSize, eyeSize), mat);
    m.position.set(s * 0.23 * fw, 0.0, 0.455); m.rotation.y = s * 0.28;
    head.add(m); eyes.push(m);
  }
  // 코/입/볼터치
  addPart(head, sphere(), toon(0xe58f94), { pos: [0, -0.1, 0.49], scale: [0.04, 0.03, 0.03], outline: 0 });
  const mouthC = document.createElement('canvas'); mouthC.width = 128; mouthC.height = 64;
  const mg = mouthC.getContext('2d'); mg.strokeStyle = '#4a3330'; mg.lineWidth = 7; mg.lineCap = 'round';
  mg.beginPath(); mg.moveTo(64, 4); mg.lineTo(64, 20); mg.moveTo(64, 20); mg.quadraticCurveTo(48, 40, 30, 24); mg.moveTo(64, 20); mg.quadraticCurveTo(80, 40, 98, 24); mg.stroke();
  const mouthT = new THREE.CanvasTexture(mouthC); mouthT.colorSpace = THREE.SRGBColorSpace;
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshBasicMaterial({ map: mouthT, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }));
  mouth.position.set(0, -0.15, 0.482); head.add(mouth);
  // 장모: 뺨 털/가슴 털
  if (long) {
    for (const s of [-1, 1]) addPart(head, new THREE.ConeGeometry(0.13, 0.25, 6), matHead, { pos: [s * 0.52 * fw, -0.12, 0.05], rot: [0, 0, s * -1.5], outline: 0.02 });
    addPart(rig, new THREE.ConeGeometry(0.28, 0.45, 8), matBody, { pos: [0, 0.78, 0.7], rot: [Math.PI, 0, 0], outline: 0.022 });
  }

  // 장모: 솜털 셸
  if (long) {
    const a = furAlpha(THREE, 'body', false), ah = furAlpha(THREE, 'head', true);
    addFur(rig, bodyGeo, tex.body, a, { pos: [0, 0.62, 0], scale: [wK, hK, dK] }, 6, 0.11);
    addFur(head, sphere(), tex.head, ah, { scale: [0.55 * fw, 0.47, 0.5] }, 6, 0.1);
    for (const sd of [-1, 1]) addFur(rig, sphere(), tex.thigh, a, { pos: [sd * wK * 0.78, 0.34, -0.2], scale: [0.27, 0.33, 0.44] }, 4, 0.08);
    const tg = tailGroup.children[0];
    if (tg && tg.geometry) addFur(tailGroup, tg.geometry, tex.tail, a, {}, 5, 0.1);
  }

  // SPECIAL 외형 보정
  if (app.special === 'singapura') {
    head.scale.setScalar(1.18);
    root.userData.sizeMul = 0.7;
  } else root.userData.sizeMul = 1;
  if (app.special === 'sphynx') head.scale.setScalar(1.04);

  // 판타지: 은은한 발광
  if (app.fantasy) {
    for (const m of [matBody, matHead, matLegs, matTail]) { m.emissive = new THREE.Color(FANTASY_PALETTE[app.fantasy][0]); m.emissiveIntensity = 0.18; m.emissiveMap = m.map; }
  }

  // 의상
  if (cat.costume) addCostume(cat.costume, head, rig, { wK, hK, dK, fw });

  // 갓 태어난 아기: 작고 머리 큼
  const baby = cat.personality === null || cat.personality === undefined;
  root.userData.baby = baby;
  const base = baby ? 0.62 : 1;
  rig.scale.setScalar(base * root.userData.sizeMul);
  if (baby) head.scale.multiplyScalar(1.22);

  // Different rhythms and head/tail gestures preserve the shared dot-eye style.
  const behavior = behaviorOf(cat);
  const yarn = addPart(rig, sphere(.18), toon(0xf09fbc), { pos: [0, .2, 1.35], outline: 0 });
  yarn.visible = false;
  let reaction = null;
  root.userData.react = action => { reaction = { action, start: performance.now() }; };
  const t0 = Math.random() * 10;
  root.userData.tick = (t, { activity = 'idle', moving = false, dt = 1 / 60 } = {}) => {
    const s = t + t0;
    body.scale.y = hK * (1 + Math.sin(s * 1.8) * 0.014);
    head.rotation.z = Math.sin(s * 0.9) * behavior.sway;
    head.position.y = 1.28 + Math.sin(s * 1.8) * 0.01;
    tailGroup.rotation.y = Math.sin(s * behavior.speed * 1.6) * behavior.tail;
    const blink = (s % 4.2) > 4.05 ? 0.1 : 1;
    for (const e of eyes) e.scale.y = blink;
    const elapsed = reaction ? (performance.now() - reaction.start) / 1000 : 99;
    const active = elapsed < 5;
    yarn.visible = active && reaction.action === 'yarn';
    const pose = { x: 0, z: 0, y: 0, px: 0 };
    head.rotation.x = 0; head.rotation.y = 0;
    for (const { leg, paw, side } of frontParts) {
      const swing = moving ? Math.sin(t * 9 + side * Math.PI / 2) : 0;
      leg.rotation.x = swing * .3; leg.position.y = .32;
      paw.position.set(paw.position.x, .08 + Math.max(0, swing) * .12, .58 + swing * .1);
    }
    if (!active && !moving) {
      if (activity === 'nap') {
        pose.z = -1.2; pose.y = .5;
        for (const e of eyes) e.scale.y = .12;
        tailGroup.rotation.y = Math.sin(s) * .04;
      } else if (activity === 'groom') {
        frontParts[0].leg.rotation.x = -.8; frontParts[0].leg.position.y = .5;
        frontParts[0].paw.position.y = .72; frontParts[0].paw.position.z = .7;
        head.rotation.x = .28 + Math.sin(s * 5) * .08; head.rotation.z = -.12;
      } else if (activity === 'hide') {
        pose.x = .2; head.rotation.x = .18;
        for (const e of eyes) e.scale.y = .65;
      } else if (activity === 'rub') {
        pose.z = Math.sin(s * 2) * .18; pose.px = Math.sin(s * 2) * .1;
        for (const e of eyes) e.scale.y = .4;
      } else if (activity === 'pounce') {
        pose.x = -.12 + Math.sin(s * 4) * .1; pose.y = Math.abs(Math.sin(s * 4)) * .13;
      } else if (activity === 'watch' || activity === 'explore') {
        head.rotation.y = Math.sin(s * .7) * .4;
      } else if (activity === 'alert') {
        head.rotation.y = Math.sin(s * 2) * .35; tailGroup.rotation.y = Math.sin(s * 7) * .3;
      }
    }
    if (active) {
      if (reaction.action === 'yarn') {
        yarn.position.set(Math.sin(elapsed * 4) * .5, .2 + Math.abs(Math.sin(elapsed * 5)) * .1, 1.25);
        yarn.rotation.z = elapsed * 5; head.rotation.z = Math.sin(elapsed * 4) * .18;
        pose.x = Math.sin(elapsed * 6) * .06;
      } else if (reaction.action === 'feed') {
        head.rotation.x = .15 + Math.sin(elapsed * 5) * .08;
      } else if (reaction.action === 'pet') {
        pose.z = Math.sin(elapsed * 2) * .12;
        for (const e of eyes) e.scale.y = .35;
      }
    }
    const blend = 1 - Math.exp(-Math.min(.05, dt) * 9);
    rig.rotation.x = THREE.MathUtils.lerp(rig.rotation.x, pose.x, blend);
    rig.rotation.z = THREE.MathUtils.lerp(rig.rotation.z, pose.z, blend);
    rig.position.x = THREE.MathUtils.lerp(rig.position.x, pose.px, blend);
    rig.position.y = THREE.MathUtils.lerp(rig.position.y, pose.y, blend);
  };
  root.userData.parts = { rig, head, tailGroup, app };
  return root;
  } catch (error) { disposeCat(root); throw error; }
}

/* ───────── 스페셜 의상 10종 ───────── */
function addCostume(id, head, rig, d) {
  const T = (c, o) => toon(c, o);
  const top = 0.43;
  const g = new THREE.Group(); head.add(g);
  const ap = (geo, mat, o) => addPart(g, geo, mat, { outline: 0.02, ...o });
  switch (id) {
    case 'chef': {
      const w = T(0xffffff);
      ap(new THREE.CylinderGeometry(0.28, 0.3, 0.14, 20), w, { pos: [0, top + 0.02, -0.02] });
      ap(sphere(), w, { pos: [0, top + 0.2, -0.02], scale: [0.36, 0.26, 0.36] });
      ap(sphere(), w, { pos: [0.22, top + 0.14, -0.02], scale: [0.16, 0.16, 0.16] });
      ap(sphere(), w, { pos: [-0.22, top + 0.14, -0.02], scale: [0.16, 0.16, 0.16] });
      break; }
    case 'wizard': {
      const p = T(0x6a4fb3);
      ap(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 24), p, { pos: [0, top - 0.02, 0], outline: 0.015 });
      const cone = ap(new THREE.ConeGeometry(0.3, 0.7, 20), p, { pos: [0, top + 0.34, -0.05], rot: [-0.18, 0, 0.1] });
      for (let i = 0; i < 4; i++) ap(sphere(0.035), T(0xffe27a), { pos: [Math.sin(i * 1.7) * 0.15, top + 0.14 + i * 0.12, 0.1 + (i % 2) * 0.02 - i * 0.025], outline: 0 });
      void cone; break; }
    case 'crown': {
      const gold = T(0xf6c945);
      ap(new THREE.CylinderGeometry(0.24, 0.26, 0.14, 16, 1, true), gold, { pos: [0, top + 0.03, 0] });
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; ap(new THREE.ConeGeometry(0.05, 0.14, 6), gold, { pos: [Math.sin(a) * 0.25, top + 0.17, Math.cos(a) * 0.25], outline: 0.012 }); }
      ap(sphere(0.045), T(0xe8484f), { pos: [0, top + 0.03, 0.27], outline: 0.01 });
      break; }
    case 'captain': {
      const navy = T(0x2c4a7c);
      ap(new THREE.SphereGeometry(0.36, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), navy, { pos: [0, top - 0.04, -0.02], scale: [1, 0.8, 1] });
      ap(new THREE.CylinderGeometry(0.37, 0.37, 0.08, 22), T(0xffffff), { pos: [0, top - 0.04, -0.02], outline: 0.01 });
      ap(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 20, 1, false, -Math.PI / 2 + 0.3, Math.PI - 0.6), T(0x1d1d24), { pos: [0, top - 0.07, 0.04], rot: [0, Math.PI / 2 * 0 + Math.PI / 2 * 0, 0], outline: 0.008 });
      ap(new THREE.TorusGeometry(0.05, 0.015, 6, 12), T(0xf6c945), { pos: [0, top + 0.1, 0.33], outline: 0 });
      break; }
    case 'detective': {
      const br = T(0xa57145), dk = T(0x6b4a2c);
      ap(new THREE.SphereGeometry(0.36, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), br, { pos: [0, top - 0.06, -0.02], scale: [1, 0.78, 1] });
      ap(new THREE.BoxGeometry(0.34, 0.025, 0.2), dk, { pos: [0, top - 0.06, 0.4], rot: [0.15, 0, 0], outline: 0.01 });
      ap(new THREE.BoxGeometry(0.34, 0.025, 0.2), dk, { pos: [0, top - 0.06, -0.42], rot: [-0.15, 0, 0], outline: 0.01 });
      ap(new THREE.TorusGeometry(0.06, 0.018, 6, 12), T(0xd8d8d8), { pos: [0.3, -0.25, 0.4], outline: 0 });
      ap(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 6), T(0x4a3330), { pos: [0.34, -0.33, 0.4], rot: [0, 0, 0.6], outline: 0 });
      break; }
    case 'santa': {
      const red = T(0xd9363e), wh = T(0xfafafa);
      ap(new THREE.ConeGeometry(0.3, 0.55, 20), red, { pos: [0, top + 0.22, -0.1], rot: [-0.45, 0, 0] });
      ap(new THREE.TorusGeometry(0.3, 0.07, 10, 22), wh, { pos: [0, top - 0.02, 0], rot: [Math.PI / 2, 0, 0] });
      ap(sphere(0.09), wh, { pos: [0, top + 0.37, -0.36] });
      break; }
    case 'hanbok': {
      const pink = T(0xf3a6bd), wh = T(0xffffff), red = T(0xd9363e);
      rig.add(g); g.position.set(0, 0, 0);
      const k = d.wK;
      ap(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, Math.PI * 0.38, Math.PI * 0.3), T(0xf3a6bd, { side: THREE.DoubleSide }), { pos: [0, 0.62, 0], scale: [k * 1.03, d.hK * 1.03, d.dK * 1.03], outline: 0.015 });
      ap(new THREE.BoxGeometry(0.05, 0.3, 0.02), wh, { pos: [0.08, 1.0, 0.82], rot: [0, 0, 0.5], outline: 0.008 });
      ap(new THREE.BoxGeometry(0.05, 0.3, 0.02), wh, { pos: [-0.08, 1.0, 0.82], rot: [0, 0, -0.5], outline: 0.008 });
      ap(new THREE.BoxGeometry(0.05, 0.28, 0.02), red, { pos: [0.04, 0.82, 0.88], rot: [0, 0, 0.12], outline: 0.008 });
      ap(new THREE.BoxGeometry(0.05, 0.24, 0.02), red, { pos: [-0.05, 0.84, 0.88], rot: [0, 0, -0.12], outline: 0.008 });
      void pink; break; }
    case 'astronaut': {
      ap(sphere(0.78), new THREE.MeshToonMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.22, gradientMap: gradient() }), { outline: 0, scale: [0.95, 0.85, 0.9], pos: [0, -0.02, 0.04] });
      ap(new THREE.TorusGeometry(0.55, 0.08, 10, 24), T(0xf2f2f6), { pos: [0, -0.4, 0], rot: [Math.PI / 2, 0, 0], outline: 0.018 });
      break; }
    case 'strawberry': {
      const red = T(0xe0434f), gr = T(0x6fb552);
      ap(new THREE.SphereGeometry(0.37, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), red, { pos: [0, top - 0.06, -0.02], scale: [1, 0.9, 1] });
      for (let i = 0; i < 9; i++) ap(sphere(0.022), T(0xfff0a0), { pos: [Math.sin(i * 2.4) * 0.25, top + 0.04 + (i % 3) * 0.08, Math.cos(i * 2.4) * 0.25 - 0.02], outline: 0 });
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; ap(new THREE.ConeGeometry(0.07, 0.18, 4), gr, { pos: [Math.sin(a) * 0.08, top + 0.3, Math.cos(a) * 0.08 - 0.02], rot: [Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9], outline: 0.01 }); }
      break; }
    case 'raincoat': {
      const ye = T(0xffd23f, { side: THREE.DoubleSide });
      ap(new THREE.SphereGeometry(1, 24, 14, Math.PI / 2 + 0.6, Math.PI * 2 - 1.2, 0, Math.PI * 0.62), ye, { pos: [0, 0.0, -0.04], scale: [0.62, 0.55, 0.58], outline: 0.02 });
      const b = new THREE.Group(); rig.add(b);
      addPart(b, new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.28), ye, { pos: [0, 0.62, 0], scale: [d.wK * 1.04, d.hK * 1.04, d.dK * 1.04], outline: 0.015 });
      for (let i = 0; i < 3; i++) addPart(b, sphere(0.035), T(0xd9363e), { pos: [0, 0.98 - i * 0.14, 0.85 - i * 0.05], outline: 0 });
      break; }
  }
}

export function disposeCat(root) {
  if (root.userData.disposed) return;
  root.userData.disposed = true;
  const geometries = new Set(), materials = new Set();
  root.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m) materials.add(m);
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
  if (root.userData.textureSet) { releasePartTextures(root.userData.textureSet); root.userData.textureSet = null; }
}
void mix;
