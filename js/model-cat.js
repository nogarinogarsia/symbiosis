// Blender 모델 고양이 (assets/models/newcat.glb)
// - 털색: 기존 유전 부위 텍스처(body/head/legs/tail/ears)를 모델 표면에 구면 투영해 그대로 사용
// - 표정: newcat_face_smile.png를 두 번째 UV(FaceExpressionUV)로 얼굴 앞쪽에만 덮음
// - 리그가 없으므로 걷기(다리 흔들기)·꼬리 흔들기는 정점 셰이더로, 자세는 전체 회전으로 표현
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_URL = new URL('../assets/models/newcat.glb', import.meta.url).href;
const FACE_URL = new URL('../assets/models/newcat_face_smile.png', import.meta.url).href;
// 모델 원본(m) → 게임 단위. 기존 코드 고양이(키 약 1.9)와 비슷한 크기
export const MODEL_SCALE = 2.3;

let shared = null;      // { geometry, coatMap, faceMap }
let pending = null;

export function modelCatReady() { return !!shared; }

/* 게임 시작 전에 한 번 불러옴. 실패하면 false를 돌려주고 코드 고양이를 계속 사용 */
export function preloadModelCat() {
  if (pending) return pending;
  pending = (async () => {
    try {
      const [gltf, faceMap] = await Promise.all([
        new GLTFLoader().loadAsync(MODEL_URL),
        new THREE.TextureLoader().loadAsync(FACE_URL),
      ]);
      let mesh = null;
      gltf.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
      if (!mesh || !mesh.geometry.attributes.uv1) throw new Error('newcat.glb: 메시 또는 FaceExpressionUV 없음');
      faceMap.flipY = false; faceMap.colorSpace = THREE.SRGBColorSpace; faceMap.anisotropy = 4;
      const coatMap = mesh.material.map || null;
      shared = { geometry: mesh.geometry, coatMap, faceMap };
      return true;
    } catch (error) {
      console.warn('모델 고양이를 불러오지 못해 기본 고양이를 사용합니다.', error);
      return false;
    }
  })();
  return pending;
}

const VERT_HEAD = /* glsl */`
uniform float uWalk;
uniform float uPhase;
uniform float uTail;
varying vec3 vLocal;
varying vec2 vFaceUv;
`;
// 다리: 바닥(y<0.17)일수록 크게 앞뒤로. 대각선 다리끼리 같은 위상(고양이 보행)
// 꼬리: 몸 뒤(z<-0.24)·위(y>0.36)부터 끝으로 갈수록 좌우로
const VERT_BODY = /* glsl */`
vLocal = position;
vFaceUv = uv1;
{
  float legW = smoothstep(0.17, 0.0, position.y);
  float side = position.x >= 0.0 ? 1.0 : -1.0;
  float front = position.z >= -0.02 ? 1.0 : -1.0;
  float ph = uPhase + (side * front > 0.0 ? 0.0 : 3.14159);
  transformed.z += sin(ph) * 0.07 * legW * uWalk;
  transformed.y += max(0.0, cos(ph)) * 0.035 * legW * uWalk;
  float tailW = smoothstep(-0.22, -0.3, position.z) * smoothstep(0.36, 0.78, position.y);
  transformed.x += uTail * tailW * 0.6;
}
`;

const FRAG_HEAD = /* glsl */`
uniform sampler2D tBody, tHead, tLegs, tTail, tEars, tFace, tCoat;
uniform float uHasCoat;
varying vec3 vLocal;
varying vec2 vFaceUv;
vec2 sphereBody(vec3 p) {
  vec3 d = normalize((p - vec3(0.0, 0.30, -0.04)) / vec3(0.22, 0.17, 0.34));
  float u = atan(-d.y, -d.x) / (2.0 * PI); u = fract(u);
  return vec2(u, 1.0 - acos(clamp(d.z, -1.0, 1.0)) / PI);
}
vec2 sphereHead(vec3 p) {
  vec3 d = normalize((p - vec3(0.0, 0.50, 0.12)) / vec3(0.24, 0.2, 0.22));
  float u = fract(atan(d.z, -d.x) / (2.0 * PI));
  return vec2(u, 1.0 - acos(clamp(d.y, -1.0, 1.0)) / PI);
}
vec3 coatColor(vec3 p) {
  // 부위 가중치
  float wTail = smoothstep(-0.2, -0.27, p.z) * smoothstep(0.34, 0.42, p.y);
  float wLegs = smoothstep(0.17, 0.11, p.y) * (1.0 - wTail);
  float wHead = smoothstep(0.34, 0.42, p.y) * smoothstep(-0.2, -0.1, p.z) * (1.0 - wTail);
  float wEars = wHead * smoothstep(0.6, 0.66, p.y) * smoothstep(0.06, 0.1, abs(p.x));
  float wBody = max(0.0, 1.0 - wTail - wLegs - wHead);
  vec3 cBody = texture2D(tBody, sphereBody(p)).rgb;
  vec3 cHead = texture2D(tHead, sphereHead(p)).rgb;
  float legU = fract(atan(p.z - (p.z > -0.02 ? 0.1 : -0.17), p.x - sign(p.x) * 0.12) / (2.0 * PI));
  vec3 cLegs = texture2D(tLegs, vec2(legU, clamp(p.y / 0.17, 0.0, 1.0))).rgb;
  float tailT = clamp((p.y - 0.36) / 0.42, 0.0, 1.0);
  float tailA = fract(atan(p.x, p.z + 0.32) / (2.0 * PI));
  vec3 cTail = texture2D(tTail, vec2(tailT, tailA)).rgb;
  vec3 cEars = texture2D(tEars, vec2(0.5, 0.5)).rgb;
  vec3 c = cBody * wBody + cLegs * wLegs + cTail * wTail + cHead * (wHead - wEars) + cEars * wEars;
  return c;
}
`;
const FRAG_MAP = /* glsl */`
{
  vec3 coat = coatColor(vLocal);
  // 원본 텍스처의 귀 안쪽 분홍(크림 바탕과 다른 부분)만 덮어 씀
  if (uHasCoat > 0.5) {
    vec3 ref = texture2D(tCoat, vMapUv).rgb;
    float pink = clamp((ref.r - ref.g) * 6.0 - 0.6, 0.0, 1.0) * step(0.55, vLocal.y) * step(-0.2, vLocal.z);
    coat = mix(coat, ref, pink);
  }
  diffuseColor.rgb = coat;
  // 표정: 얼굴 앞쪽에서만
  vec4 fc = texture2D(tFace, vFaceUv);
  float front = smoothstep(0.02, 0.1, vLocal.z) * smoothstep(0.3, 0.38, vLocal.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, fc.rgb, fc.a * front);
}
`;

let gradTex = null;
function gradient() {
  if (gradTex) return gradTex;
  gradTex = new THREE.DataTexture(new Uint8Array([150, 200, 235, 255]), 4, 1, THREE.RedFormat);
  gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter; gradTex.needsUpdate = true;
  return gradTex;
}

function modelMaterial(tex, uniforms) {
  // map은 귀 분홍 참조용(coat 원본). vMapUv를 쓰기 위해 map을 켬
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradient(), map: shared.coatMap || tex.body });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms, {
      tBody: { value: tex.body }, tHead: { value: tex.head }, tLegs: { value: tex.legs },
      tTail: { value: tex.tail }, tEars: { value: tex.ears }, tFace: { value: shared.faceMap },
      tCoat: { value: shared.coatMap }, uHasCoat: { value: shared.coatMap ? 1 : 0 },
    });
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', VERT_HEAD + 'void main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', FRAG_HEAD + 'void main() {')
      .replace('#include <map_fragment>', FRAG_MAP);
  };
  m.customProgramCacheKey = () => 'newcat-model';
  return m;
}

/* buildCat에서 호출. 반환 구조(root.userData.tick/react/parts)는 코드 고양이와 같게 맞춤 */
export function buildModelCat(cat, app, tex, root, { addCostume, behavior }) {
  const rig = new THREE.Group(); root.add(rig);
  const uniforms = { uWalk: { value: 0 }, uPhase: { value: 0 }, uTail: { value: 0 } };
  const geometry = shared.geometry.clone();   // disposeCat이 개체별로 정리할 수 있게 복제
  const body = new THREE.Mesh(geometry, modelMaterial(tex, uniforms));
  body.scale.setScalar(MODEL_SCALE);
  body.castShadow = true;
  rig.add(body);

  // 의상 부착용 머리 기준점 (코드 고양이 머리 위치와 비슷하게)
  const head = new THREE.Group();
  head.position.set(0, 0.5 * MODEL_SCALE, 0.12 * MODEL_SCALE);
  rig.add(head);
  const bodyDims = { wK: 0.24 * MODEL_SCALE, hK: 0.2 * MODEL_SCALE, dK: 0.36 * MODEL_SCALE, fw: 1 };
  if (cat.costume) addCostume(cat.costume, head, rig, bodyDims);

  root.userData.sizeMul = app.special === 'singapura' ? 0.7 : 1;
  const baby = cat.personality === null || cat.personality === undefined;
  root.userData.baby = baby;
  rig.scale.setScalar((baby ? 0.62 : 1) * root.userData.sizeMul);

  let reaction = null, walkBlend = 0, walkPhase = 0;
  root.userData.react = action => { reaction = { action, start: performance.now() }; };
  const t0 = Math.random() * 10;
  root.userData.tick = (t, { activity = 'idle', moving = false, dt = 1 / 60 } = {}) => {
    const s = t + t0;
    const blend = 1 - Math.exp(-Math.min(.05, dt) * 9);
    walkBlend = THREE.MathUtils.lerp(walkBlend, moving ? 1 : 0, blend);
    if (moving) walkPhase += Math.min(.05, dt) * (7 + behavior.speed * 3);
    uniforms.uWalk.value = walkBlend;
    uniforms.uPhase.value = walkPhase;
    uniforms.uTail.value = Math.sin(s * behavior.speed * 1.6) * behavior.tail * 0.5;
    // 숨쉬기 + 걸을 때 통통 튀기
    body.scale.set(MODEL_SCALE, MODEL_SCALE * (1 + Math.sin(s * 1.8) * .012), MODEL_SCALE);
    body.position.y = Math.abs(Math.sin(walkPhase)) * .06 * walkBlend;
    body.rotation.z = Math.sin(walkPhase) * .04 * walkBlend + Math.sin(s * .9) * behavior.sway * .3;
    const elapsed = reaction ? (performance.now() - reaction.start) / 1000 : 99;
    const active = elapsed < 5;
    const pose = { x: 0, z: 0, y: 0, px: 0, ry: 0 };
    if (!active && !moving) {
      if (activity === 'nap') { pose.z = -1.2; pose.y = .45; uniforms.uTail.value *= .1; }
      else if (activity === 'groom') { pose.x = .12 + Math.sin(s * 5) * .04; }
      else if (activity === 'hide' || activity === 'shelter') { pose.x = .15; }
      else if (activity === 'rub' || activity === 'greet') { pose.z = Math.sin(s * 2) * .15; pose.px = Math.sin(s * 2) * .1; }
      else if (activity === 'pounce') { pose.x = -.12 + Math.sin(s * 4) * .1; pose.y = Math.abs(Math.sin(s * 4)) * .13; }
      else if (activity === 'watch' || activity === 'explore') { pose.ry = Math.sin(s * .7) * .25; }
      else if (activity === 'alert') { pose.ry = Math.sin(s * 2) * .2; uniforms.uTail.value = Math.sin(s * 7) * .3; }
    }
    if (active) {
      if (reaction.action === 'yarn') { pose.x = Math.sin(elapsed * 6) * .06; pose.y = Math.abs(Math.sin(elapsed * 5)) * .1; }
      else if (reaction.action === 'feed') { pose.x = .12 + Math.sin(elapsed * 5) * .05; }
      else if (reaction.action === 'pet') { pose.z = Math.sin(elapsed * 2) * .1; uniforms.uTail.value = Math.sin(elapsed * 6) * .4; }
    }
    rig.rotation.x = THREE.MathUtils.lerp(rig.rotation.x, pose.x, blend);
    rig.rotation.z = THREE.MathUtils.lerp(rig.rotation.z, pose.z, blend);
    rig.rotation.y = THREE.MathUtils.lerp(rig.rotation.y, pose.ry, blend);
    rig.position.x = THREE.MathUtils.lerp(rig.position.x, pose.px, blend);
    rig.position.y = THREE.MathUtils.lerp(rig.position.y, pose.y, blend);
  };
  root.userData.parts = { rig, head, body, app, model: true };
  return root;
}
