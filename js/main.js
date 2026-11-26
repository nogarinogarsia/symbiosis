import { G, load, newGame, tick, save, loadIssue } from './game.js';
import { showRecovery } from './recovery.js';
import { preloadModelCat } from './model-cat.js';
import { loadMapLayout, setMapLayout, getMapLayout, placeAssetIds } from './map-layout.js';
import { preloadAssets } from './props.js';

// Blender 고양이 모델을 먼저 불러옴(실패하면 기본 코드 고양이). ?cat=classic 이면 기존 고양이
const query = new URLSearchParams(location.search);
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
await Promise.all([query.get('cat') !== 'classic' ? preloadModelCat() : null, loadMapLayout()]);
// 편집 모드: 저장 전 편집본(장소 모양을 바꾸면 새로고침하며 이어감)이 있으면 그걸로
const editing = local && query.get('edit') === '1';
if (editing) { try { const draft = JSON.parse(sessionStorage.getItem('mapLayoutDraft') || 'null'); if (draft?.layout) setMapLayout(draft.layout); } catch {} }
// 장소 모양(건물·울타리·쉼터)에 쓴 에셋은 월드를 만들기 전에 미리 불러옴
await preloadAssets(placeAssetIds(getMapLayout()));

async function start() {
  tick(); save();
  const { init, U } = await import('./ui.js');
  const development=['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).get('dev')==='1';
  init({development});
  if(development){window.__game = G;window.__ui = U;}
  // 맵 편집 모드: 이 PC(localhost)에서 ?edit=1 일 때만. 공개 사이트에서는 열리지 않음
  if(editing){const {startEditor}=await import('./map-editor.js');startEditor(U.world);}
}
if (load()) await start();
else if (loadIssue) showRecovery(start);
else { newGame(); await start(); }
