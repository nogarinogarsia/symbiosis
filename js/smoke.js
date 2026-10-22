// Browser integration tests use the real index markup and UI, with isolated storage.
const report = document.querySelector('#smokeReport');
const checks = document.querySelector('#smokeChecks');
const summary = document.querySelector('#smokeSummary');
const results = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const $ = selector => document.querySelector(selector);
const click = selector => { const element = $(selector); assert(element && !element.disabled, `조작할 수 없음: ${selector}`); element.click(); };
const waitUntil = (predicate, timeout = 12000) => new Promise((resolve, reject) => {
  const start = performance.now();
  const check = () => {
    if (predicate()) resolve();
    else if (performance.now() - start > timeout) reject(new Error('화면 갱신 시간 초과'));
    else requestAnimationFrame(check);
  };
  check();
});
async function check(name, action) {
  try { await action(); results.push({name,ok:true}); }
  catch (error) { results.push({name,ok:false,error:error.message}); }
  const line = document.createElement('div'), result = results.at(-1);
  line.className = result.ok ? 'ok' : 'bad'; line.textContent = `${result.ok ? '✅' : '❌'} ${name}${result.error ? ' — ' + result.error : ''}`;
  checks.appendChild(line);
}
try {
  const originalStorage = window.localStorage, originalSave = originalStorage.getItem('catgene-save-v1');
  const data = new Map();
  const memory = { getItem: key => data.get(String(key)) ?? null, setItem: (key,value) => data.set(String(key),String(value)), removeItem:key=>data.delete(String(key)), clear:()=>data.clear(), key:index=>[...data.keys()][index]??null, get length(){return data.size;} };
  Object.defineProperty(window, 'localStorage', { configurable: true, value: memory });
  assert(window.localStorage === memory, '테스트 저장 격리 실패');
  const response = await fetch('index.html', {cache:'no-store'});
  assert(response.ok, '게임 HTML을 불러오지 못했어요');
  const documentSource = new DOMParser().parseFromString(await response.text(), 'text/html');
  documentSource.querySelectorAll('script').forEach(script => script.remove());
  document.body.append(...documentSource.body.childNodes);
  const game = await import('./game.js');
  const { init, U } = await import('./ui.js');
  const { litterState } = await import('./wellbeing.js');
  game.newGame(); init();
  await check('실제 월드 생성·시작 고양이·샵·이웃 동기화', () => {
    assert(game.G.mine.length === 4 && game.G.shop.length === 8 && game.G.npcs.length === 5, '초기 개체 수');
    assert(U.world.catObjs.size === 19 && U.world.renderer.info.render.calls >= 0, '월드 개체 동기화');
    assert($('#panel').hidden, '초기 패널 닫힘');
  });
  await check('메뉴 클릭으로 우리집 패널 표시', () => {
    click('#tabs [data-tab="home"]');
    assert(!$('#panel').hidden && $('#panel').textContent.includes('고양이 4마리'), '우리집 렌더');
  });
  await check('성묘 돌봄 클릭·저장 반영', () => {
    const id = U.sel;
    click('#panel [data-act="dailycare"][data-a="feed"]');
    assert(game.cat(id).wellbeing.food > 0, '밥 주기 상태');
    const stored = JSON.parse(memory.getItem('catgene-save-v1'));
    assert(stored.cats[id].wellbeing.food === game.cat(id).wellbeing.food, '돌봄 저장');
  });
  await check('교배 후보 선택·부모 슬롯·실행 가능 상태', () => {
    click('#tabs [data-tab="breed"]');
    click('#panel [data-act="pick"]:not(.dis)');
    click('#panel [data-act="pick"]:not(.dis)');
    assert(U.breed.father && U.breed.mother && !$('#panel [data-act="dobreed"]').disabled, '부모 선택');
  });
  await check('교배 연출→새끼 1마리→탄생 결과 모달', async () => {
    click('#panel [data-act="dobreed"]');
    assert(!$('#breedOverlay').hidden, '교배 연출 표시');
    await waitUntil(() => !$('#modal').hidden && $('#modal').textContent.includes('새 가족'));
    assert(game.G.mine.length === 5 && !U.busy && $('#breedOverlay').hidden, '탄생 후 상태 복구');
    assert(game.cat(U.sel).personality === null, '새끼 성장 상태');
    click('#modal [data-act="close"]');
  });
  await check('아기 성장 돌봄·쿨다운 버튼 갱신', () => {
    click('#panel [data-act="care"][data-a="yarn"]');
    assert(game.cat(U.sel).care.log.length === 1, '성장 돌봄 로그');
    assert($('#panel [data-act="care"][data-a="yarn"]').disabled, '돌봄 쿨다운');
    assert($('#panel [data-act="gobreed"]').disabled, '아기 교배 비활성');
  });
  await check('숨겨진 교배 무대의 불필요한 렌더 중지', () => {
    assert(U.stage && $('#breedOverlay').hidden, '교배 무대 닫힘');
    const frame = U.stage.renderer.info.render.frame;
    U.stage.frame();
    assert(U.stage.renderer.info.render.frame === frame, '숨겨진 무대 렌더');
  });
  await check('도감 검색 이벤트→빈 결과→검색 해제', () => {
    click('#tabs [data-tab="dex"]');
    const input = $('#dexSearch'); input.value = 'no-result-smoke-xyz';
    input.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',bubbles:true}));
    assert($('#panel').querySelectorAll('.card').length === 0, '검색 결과 비우기');
    $('#dexSearch').value = ''; $('#dexSearch').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',bubbles:true}));
    assert($('#panel').querySelectorAll('.card').length >= 4, '검색 해제');
  });
  await check('관찰 버튼→추적 카메라→기본 시점 복귀', () => {
    click('#tabs [data-tab="home"]'); click('#panel [data-act="focuscat"]');
    assert(U.world.followCatId === U.sel && !$('#watchingCat').hidden, '고양이 관찰');
    click('#returnCamera'); assert(!U.world.followCatId && $('#watchingCat').hidden, '관찰 종료');
  });
  await check('시간 이동→성장 확정·월드 청소 오브젝트 생성', () => {
    click('[data-dev="1d"]');
    assert(game.cat(U.sel).personality !== null, '성장 성격 확정');
    assert(litterState(game.myCats(),game.now()).total > 0 && U.world.litterPiles.children.length > 0, '월드 화장실 오브젝트');
  });
  await check('월드 raycast 청소→개수 감소→저장 후 유지', () => {
    const before = litterState(game.myCats(),game.now()).total;
    const w = U.world;
    w.camPos.copy(w.litterTray.position); w.viewDistance = 8; w.placeCamera();
    w.scene.updateMatrixWorld(true); w.camera.updateMatrixWorld(true);
    const point = w.litterLabel.getWorldPosition(w.player.position.clone()).project(w.camera);
    const rect = w.canvas.getBoundingClientRect();
    w.pick({clientX:rect.left+(point.x+1)/2*rect.width,clientY:rect.top+(1-point.y)/2*rect.height});
    const after = litterState(game.myCats(),game.now()).total;
    assert(after < before, '월드 클릭 청소');
    const stored=JSON.parse(memory.getItem('catgene-save-v1'));
    assert(litterState(stored.mine.map(id=>stored.cats[id]),game.now()).total === after, '청소 상태 저장');
  });
  await check('실제 브라우저 저장 원본 보존', () => {
    assert(originalStorage.getItem('catgene-save-v1') === originalSave, '원래 게임 진행이 변경되었습니다');
    assert(window.localStorage === memory, '메모리 저장 격리 유지');
  });
} catch (error) {
  await check('자동 검사 환경 초기화', () => { throw error; });
}
const fails = results.filter(result => !result.ok).length;
summary.textContent = `${fails ? `${fails}개 실패` : '전체 통과'} · ${results.length}개 검사 · 실제 진행과 분리된 메모리 저장`;
summary.className = fails ? 'bad' : 'ok';
window.__uiSmokeResults = {total:results.length,fails,results};
report.dataset.complete = 'true';
