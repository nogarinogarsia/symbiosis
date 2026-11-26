// 맵 배치 데이터. assets/map-layout.json이 있으면 그 배치로, 없으면 원래 마을 배치(DEFAULT_LAYOUT)로 맵을 만듦.
// 기능(교배·판매·돌봄·저장)은 여기 들어 있지 않음. 장소의 위치만 바뀌고 메뉴·도착 판정은 장소를 따라감.
export const LAYOUT_URL = new URL('../assets/map-layout.json', import.meta.url).href;

// 걸어 다닐 수 있는 마을 범위 (키아트 v2 비율에 맞춰 넓힘)
export const MAP_BOUNDS = Object.freeze({ minX: -40, maxX: 40, minZ: -34, maxZ: 27 });
export const PLACE_IDS = ['home', 'breed', 'shop', 'dex', 'neighbors', 'player'];
export const PLACE_LABELS = {
  home: '🏠 우리집 (우리)', breed: '💞 교배집', shop: '🛍️ 동물샵', dex: '📖 유전 도서관',
  neighbors: '🏘️ 이웃 다섯 집', player: '🧑 시작 위치',
};
// 장소마다 바꿀 수 있는 모양
export const PLACE_LOOKS = { breed: ['model'], shop: ['model'], dex: ['model'], home: ['fence', 'shelter'], neighbors: ['fence', 'shelter'] };
export const LOOK_LABELS = { model: '건물 모양', fence: '울타리 모양', shelter: '쉼터 모양' };
// 우리집 '둥근 마당' 스타일(사진 디자인): 둥근 잔디 바닥 + 울타리 + 뒤쪽 열린 집. 크기는 고정(우리 레벨과 무관).
// 디딤돌·나무·덤불 등 장식은 편집 모드에서 직접 배치
export const GARDEN = { w: 16, d: 14, house: 'red_hip_cottage', fence: 'wood_picket_fence' };   // 새 마을(키아트 v2) 에셋
export const isGarden = place => place?.style === 'garden';
export const placeAssetIds = layout => Object.values(layout.places).flatMap(p => [
  p.model, p.fence, p.shelter, p.house,
  ...(isGarden(p) ? [GARDEN.house, GARDEN.fence] : []), ...(p.slots ?? []).map(q => q.house),
]).filter(Boolean);
// 우리 최대 확장(Lv.8) 크기: world.js syncPen과 같은 식
export const PEN_MAX = { w: 12 + 7 * 0.8, d: 9 + 7 * 0.3 };

export const DEFAULT_LAYOUT = Object.freeze({
  version: 1,
  places: {
    home: { x: -9, z: 2 }, breed: { x: 6, z: 8 }, shop: { x: 20, z: 3 }, dex: { x: -23, z: 4 },
    neighbors: { x: 0, z: -14 }, player: { x: -1, z: 13 },
  },
  paths: [
    { x: 0, z: 13, w: 64, d: 3 }, { x: -9, z: 9, w: 3, d: 6 }, { x: 6, z: 11, w: 3, d: 4 }, { x: 20, z: 8.5, w: 3, d: 9 },
    { x: 0, z: -2, w: 3, d: 30 },
    ...[-24, -12, 0, 12, 24].map(x => ({ x, z: -9, w: 3, d: 5 })),
    { x: 0, z: -10.4, w: 54, d: 2.4 },
  ],
  randomDecor: true,
  props: [],
  roads: [],     // 곡선 흙길: { pts: [[x,z],...], w }
  plazas: [],    // 둥근 바닥: { x, z, r, kind: 'stone' | 'grass'(길 아래 잔디) | 'lawn'(광장 위 잔디) | 'sand' }
});

const num = (v, fallback) => (Number.isFinite(+v) ? +v : fallback);
const round = v => Math.round(v * 1000) / 1000;

/* 자유 모양 마당: poly(울타리 윤곽 [[x,z],...]) · gate({x,z,w}) · 집 위치(hx,hz) */
function shapeOf(q) {
  if (!Array.isArray(q?.poly) || q.poly.length < 3) return {};
  const o = { poly: q.poly.slice(0, 40).map(p => [round(num(p[0], 0)), round(num(p[1], 0))]) };
  if (q.gate) o.gate = { x: round(num(q.gate.x, 0)), z: round(num(q.gate.z, 0)), w: round(Math.min(8, Math.max(1.5, num(q.gate.w, 3)))) };
  if (Number.isFinite(+q.hx)) o.hx = round(+q.hx);
  if (Number.isFinite(+q.hz)) o.hz = round(+q.hz);
  return o;
}
/* 손상되거나 일부만 있는 파일도 안전하게: 모르는 값은 기본값으로 */
export function normalizeLayout(raw) {
  const base = structuredClone(DEFAULT_LAYOUT);
  if (!raw || typeof raw !== 'object') return base;
  const out = { version: 1, places: {}, paths: [], randomDecor: raw.randomDecor ?? base.randomDecor, props: [], roads: [], plazas: [] };
  out.roads = Array.isArray(raw.roads) ? raw.roads.filter(r => Array.isArray(r?.pts) && r.pts.length >= 2)
    .map(r => ({ pts: r.pts.map(q => [round(num(q[0], 0)), round(num(q[1], 0))]), w: round(Math.min(20, Math.max(0.5, num(r.w, 3)))) })) : [];
  out.plazas = Array.isArray(raw.plazas) ? raw.plazas.map(q => ({ x: round(num(q.x, 0)), z: round(num(q.z, 0)), r: round(Math.min(40, Math.max(0.5, num(q.r, 3)))), kind: ['stone', 'grass', 'sand', 'lawn', 'paw'].includes(q.kind) ? q.kind : 'sand' })) : [];
  for (const id of PLACE_IDS) {
    const p = raw.places?.[id], d = base.places[id];
    out.places[id] = { x: round(num(p?.x, d.x)), z: round(num(p?.z, d.z)) };
    // 장소 모양: 건물(model)·울타리(fence)·쉼터(shelter)를 내 에셋으로. 없으면 기본 모양
    for (const key of PLACE_LOOKS[id] ?? []) if (typeof p?.[key] === 'string' && p[key]) out.places[id][key] = p[key];
    if ((id === 'home' || id === 'neighbors') && p?.style === 'garden') {
      const dw = id === 'home' ? 16 : 11, dd = id === 'home' ? 14 : 9;
      Object.assign(out.places[id], { style: 'garden', gw: round(Math.min(40, Math.max(6, num(p.gw, dw)))), gd: round(Math.min(40, Math.max(6, num(p.gd, dd)))) });
      if (id === 'neighbors') out.places[id].gap = round(Math.min(20, Math.max(1, num(p.gap, 3))));
      // 이웃 집마다 자리·집 모양을 따로 (키아트처럼 흩어 놓기). 없으면 한 줄 배치
      if (id === 'neighbors' && Array.isArray(p.slots)) out.places[id].slots = p.slots.slice(0, 5).map(q => ({
        x: round(num(q?.x, 0)), z: round(num(q?.z, 0)), ...(typeof q?.house === 'string' ? { house: q.house } : {}), ...shapeOf(q), ...(Number.isFinite(+q?.ry) ? { ry: round(+q.ry) } : {}),
      }));
      if (Number.isFinite(+p.hs)) out.places[id].hs = round(Math.min(2, Math.max(0.3, +p.hs)));
      if (typeof p.house === 'string' && p.house) out.places[id].house = p.house;
      if (Number.isFinite(+p.hry)) out.places[id].hry = round(+p.hry);   // 마당 안 집 회전
      if (id === 'home') Object.assign(out.places[id], shapeOf(p));
    }
    if (out.places[id].model) {
      out.places[id].ry = round(num(p.ry, 0));
      out.places[id].s = round(Math.min(10, Math.max(0.1, num(p.s, 1))));
    }
  }
  out.paths = Array.isArray(raw.paths)
    ? raw.paths.map(p => ({ x: round(num(p.x, 0)), z: round(num(p.z, 0)), w: round(Math.max(0.5, num(p.w, 3))), d: round(Math.max(0.5, num(p.d, 3))) }))
    : base.paths;
  out.props = Array.isArray(raw.props)
    ? raw.props.filter(p => typeof p?.asset === 'string').map(p => ({
      asset: p.asset, x: round(num(p.x, 0)), z: round(num(p.z, 0)),
      ry: round(num(p.ry, 0)), s: round(Math.min(10, Math.max(0.1, num(p.s, 1)))),
    }))
    : [];
  out.randomDecor = !!out.randomDecor;
  // 계단식 지형: 가로 경계선마다 위쪽(above)·아래쪽(below) 높이, 계단(stairs) 자리
  if (Array.isArray(raw.terrain?.lines)) out.terrain = { lines: raw.terrain.lines.slice(0, 8).map(L => ({
    z: round(num(L.z, 0)), above: round(num(L.above, 0)), below: round(num(L.below, 0)), ...(Number.isFinite(+L.ramp) ? { ramp: round(Math.min(4, Math.max(0.3, +L.ramp))) } : {}),
    ...(Array.isArray(L.pts) && L.pts.length >= 2 ? { pts: L.pts.slice(0, 32).map(q => [round(num(q[0], 0)), round(num(q[1], 0))]) } : {}),
    stairs: Array.isArray(L.stairs) ? L.stairs.slice(0, 12).map(q => ({ x: round(num(q.x, 0)), w: round(Math.max(0.5, num(q.w, 3))) })) : [],
  })) };
  // 바닥 텍스처 (assets/textures/의 파일 이름). 없으면 예전처럼 단색·그린 잔디
  if (raw.ground && typeof raw.ground === 'object') {
    out.ground = {};
    for (const k of ['grass', 'path', 'plaza', 'paw']) if (typeof raw.ground[k] === 'string' && /^[\w.-]+$/.test(raw.ground[k])) out.ground[k] = raw.ground[k];
  }
  return out;
}

let current = structuredClone(DEFAULT_LAYOUT);
export const getMapLayout = () => current;
export function setMapLayout(layout) { current = normalizeLayout(layout); return current; }

/* 게임 시작 전에 한 번. 파일이 없거나 깨졌으면 기본 배치 */
export async function loadMapLayout() {
  try {
    const res = await fetch(LAYOUT_URL, { cache: 'no-store' });
    if (res.ok) current = normalizeLayout(await res.json());
  } catch (error) {
    console.warn('맵 배치 파일을 읽지 못해 기본 배치를 사용합니다.', error);
  }
  return current;
}
