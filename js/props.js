// 배경 에셋(assets/models/props/*.glb) 불러오기 · 툰 재질 교체 · 충돌 영역 계산
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toon } from './cat3d.js';

const BASE = new URL('../assets/models/props/', import.meta.url).href;
let catalog = null;
// Blender 1m → 게임 단위. 게임 세계는 캐릭터·고양이가 크게 과장되어 있어(집사 키 ≈ 2.4) 실제 크기 그대로면 작아 보임.
// 올리브 집(2.4m) → 약 5.8 = 기존 건물 높이와 비슷. 배치 데이터의 s는 이 값에 곱하는 상대 크기(1 = 기본).
export const WORLD_SCALE = 2.4;
// 분류별 기본 크기 배율 (Blender 파일은 그대로, 게임에서만).
// 원래 게임 비율에 맞춤: 집사 키 2.4 기준으로 울타리 ≈ 1.1(원래 나무 울타리와 같음), 가로등 ≈ 2.9, 벤치 ≈ 1.2.
// 건물은 원래 건물 크기(약 5.8)와 같도록 그대로, 나무·덤불은 원래 나무 높이에 맞게 조금만 줄임
export const CATEGORY_SCALE = { furniture: 0.6, prop: 0.6, nature: 0.85 };
/* 에셋 1m → 게임 단위 (분류 배율 포함) */
export const assetScale = id => WORLD_SCALE * (CATEGORY_SCALE[catalogEntry(id)?.category] ?? 1);
// Blender 미리보기(밝은 스튜디오 조명 + AgX)와 비슷하게: 색을 흰색 쪽으로 조금 옮기고 자기 빛을 약간 더함
const PASTEL = 0, COLOR_LIFT = 0;   // 2026-11-26 사용자 요청: 색·채도 보정 없이 원래 색 그대로
const WHITE = new THREE.Color(0xffffff);
// 텍스처 에셋 보정: 채도 낮춤 · 흰색 쪽 이동 · 자기 빛
const TEX_DESAT = 0, TEX_PASTEL = 0, TEX_LIFT = 0;   // 텍스처도 원래 색 그대로
const templates = new Map();   // id -> Promise<Object3D>
const resolved = new Map();    // id -> Object3D (불러오기가 끝난 것: 월드를 만들 때 바로 복제)

export async function loadCatalog() {
  if (catalog) return catalog;
  try {
    const res = await fetch(BASE + 'catalog.json', { cache: 'no-store' });
    catalog = res.ok ? (await res.json()).assets ?? [] : [];
  } catch { catalog = []; }
  return catalog;
}
export const catalogEntry = id => catalog?.find(a => a.id === id) ?? null;
export const thumbUrl = entry => (entry?.thumb ? BASE + entry.thumb : null);

/* glTF 재질(Principled)을 게임 툰 재질로 교체: 색과 이미지 텍스처만 유지 */
function toonify(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    const swap = m => {
      const base = m.color ? m.color.clone().convertLinearToSRGB().lerp(WHITE, PASTEL).convertSRGBToLinear() : WHITE.clone();
      const t = toon(base.getHex(), { map: m.map ?? null, transparent: m.transparent, alphaTest: m.alphaTest, side: m.side });
      if (t.map) t.map.colorSpace = THREE.SRGBColorSpace;
      t.emissive = t.color.clone().multiplyScalar(COLOR_LIFT); if (t.map) t.emissiveMap = t.map;
      // 텍스처(Meshy 등)도 단색 에셋처럼 파스텔 쪽으로: 텍스처 색을 흰색 쪽으로 조금 옮기고 채도를 살짝 낮춤
      if (t.map && (TEX_DESAT || TEX_PASTEL || TEX_LIFT)) {
        t.emissive.setScalar(TEX_LIFT);
        t.onBeforeCompile = sh => {
          sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
            float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum), ${TEX_DESAT.toFixed(2)});
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), ${TEX_PASTEL.toFixed(2)});`);
        };
        t.customProgramCacheKey = () => 'prop-tex-pastel';
      }
      t.vertexColors = !!o.geometry.attributes.color;
      return t;
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    o.castShadow = o.receiveShadow = true;
  });
  return root;
}

function template(id) {
  if (!templates.has(id)) {
    const entry = catalogEntry(id);
    templates.set(id, entry
      ? new GLTFLoader().loadAsync(BASE + entry.file).then(g => { const obj = toonify(g.scene); resolved.set(id, obj); return obj; })
      : Promise.reject(new Error('알 수 없는 에셋: ' + id)));
  }
  return templates.get(id);
}

/* 배치 1개 → Object3D (지오메트리·재질은 같은 에셋끼리 공유: 지울 때 dispose 하지 말 것) */
export async function makeProp(item) {
  const obj = (await template(item.asset)).clone(true);
  obj.position.set(item.x, 0, item.z);
  obj.rotation.y = item.ry || 0;
  obj.scale.setScalar((item.s || 1) * assetScale(item.asset));
  obj.userData.prop = item;
  return obj;
}

/* 장소 모양(건물·울타리·쉼터)으로 쓸 에셋을 게임 시작 전에 미리 불러옴. 실패한 것은 기본 모양으로 */
export async function preloadAssets(ids) {
  await loadCatalog();
  await Promise.all([...new Set(ids)].filter(id => id && catalogEntry(id)).map(id => template(id).catch(error => console.warn(error))));
}
/* 미리 불러온 에셋을 바로 복제 (없으면 null → 기본 모양 사용) */
export function propNow(item) {
  const t = resolved.get(item.asset); if (!t) return null;
  const obj = t.clone(true);
  obj.position.set(item.x ?? 0, 0, item.z ?? 0); obj.rotation.y = item.ry || 0;
  obj.scale.setScalar((item.s || 1) * assetScale(item.asset));
  return obj;
}

/* 충돌 영역 [x0,x1,z0,z1]. solid=회전한 바운딩 박스, trunk=줄기 주변만, none=통과. forceSolid: 건물처럼 항상 막기 */
export function propCollider(item, forceSolid = false) {
  const entry = catalogEntry(item.asset);
  if (!entry || (entry.collider === 'none' && !forceSolid)) return null;
  const s = (item.s || 1) * assetScale(item.asset);
  if (entry.collider === 'trunk' && !forceSolid) {
    const r = 0.16 * s;   // 줄기 굵기 정도 (기본 크기에서 반지름 약 0.4)
    return [item.x - r, item.x + r, item.z - r, item.z + r];
  }
  const { min, max } = entry.bbox, c = Math.cos(item.ry || 0), sn = Math.sin(item.ry || 0);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const x of [min[0], max[0]]) for (const z of [min[2], max[2]]) {
    const rx = (x * c + z * sn) * s, rz = (-x * sn + z * c) * s;
    x0 = Math.min(x0, rx); x1 = Math.max(x1, rx); z0 = Math.min(z0, rz); z1 = Math.max(z1, rz);
  }
  const k = entry.collider_scale ?? 1;   // 나무+화단처럼 위쪽만 넓은 에셋은 바닥(화단) 크기만 막음
  if (k !== 1) { const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2; x0 = mx + (x0 - mx) * k; x1 = mx + (x1 - mx) * k; z0 = mz + (z0 - mz) * k; z1 = mz + (z1 - mz) * k; }
  return [item.x + x0, item.x + x1, item.z + z0, item.z + z1];
}

/* 편집기 목록용 썸네일: 미리보기 이미지가 없으면 모델을 직접 찍어서 만듦 */
let thumbRenderer = null;
const thumbCache = new Map();
export async function renderThumb(entry, size = 112) {
  if (thumbCache.has(entry.id)) return thumbCache.get(entry.id);
  const obj = (await template(entry.id)).clone(true);
  thumbRenderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  thumbRenderer.setSize(size, size, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8d8a8, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(3, 5, 4); scene.add(sun);
  scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2 || 1;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  cam.position.copy(c).add(new THREE.Vector3(1, 0.75, 1.3).normalize().multiplyScalar(r / Math.sin(Math.PI / 12)));
  cam.lookAt(c);
  thumbRenderer.render(scene, cam);
  const url = thumbRenderer.domElement.toDataURL('image/png');
  thumbCache.set(entry.id, url);
  return url;
}
