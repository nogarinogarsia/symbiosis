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
  await check('고양이 카드 네이티브 버튼·선택 상태·재렌더 후 초점', () => {
    const card=$('#panel [data-act="select"]');
    assert(card.tagName==='BUTTON', '고양이 카드 키보드 조작');
    card.focus();const id=card.dataset.id;card.click();
    assert(document.activeElement.dataset.id===id && document.activeElement.dataset.act==='select', '선택 후 초점 유지');
    assert(document.activeElement.getAttribute('aria-pressed')==='true', '고양이 선택 상태 전달');
    assert($('#tabs [data-tab="home"]').getAttribute('aria-expanded')==='true','패널 열림 상태');
  });
  await check('상세 대화창 초점 격리·순환·Escape 복귀', () => {
    const opener=$('#panel [data-act="detail"]');opener.focus();opener.click();
    const dialog=$('#modal .dialog');
    assert(dialog.contains(document.activeElement) && $('#tabs').inert && $('#panel').inert, '대화창 초점 격리');
    assert(dialog.getAttribute('aria-labelledby')==='dialogTitle' && $('#dialogTitle').textContent, '대화창 제목');
    const close=$('#modal [data-act="close"]');close.focus();
    close.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
    assert(dialog.contains(document.activeElement),'Tab 초점 순환');
    close.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    assert($('#modal').hidden && !$('#panel').hidden && !$('#panel').inert,'Escape는 상세 창만 닫기');
    assert(document.activeElement===opener,'대화창을 연 버튼으로 초점 복귀');
  });
  await check('판매·새 게임 확인 취소에 진행 보존', () => {
    const ids=[...game.G.mine],coins=game.G.coins;
    click('#panel [data-act="sell"]');
    assert($('#modal h2').textContent==='고양이 판매','판매 확인 표시');
    click('#modal [data-act="close"]');
    assert(JSON.stringify(game.G.mine)===JSON.stringify(ids) && game.G.coins===coins,'판매 취소');
    click('[data-dev="reset"]');
    assert($('#modal h2').textContent==='새 게임 시작','새 게임 확인 표시');
    const cancel=$('#modal [data-act="close"]'),confirm=$('#modal [data-act="confirm"]');
    cancel.focus();cancel.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
    assert(document.activeElement===confirm,'Shift+Tab은 마지막 확인 버튼으로 순환');
    confirm.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
    assert(document.activeElement===cancel,'Tab은 첫 취소 버튼으로 순환');
    click('#modal [data-act="close"]');
    assert(JSON.stringify(game.G.mine)===JSON.stringify(ids) && game.G.coins===coins,'새 게임 취소');
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
    assert([...$('#panel').querySelectorAll('.slot')].every(slot=>slot.tagName==='BUTTON'),'부모 슬롯 키보드 조작');
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
  await check('한글 조합 보호·실시간 검색 초점 유지→검색 해제', async () => {
    click('#tabs [data-tab="dex"]');
    const input = $('#dexSearch'); input.focus();input.value = 'no-result-smoke-xyz';
    input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
    input.dispatchEvent(new InputEvent('input', {bubbles:true,isComposing:true}));
    const compositionStart=performance.now();
    await waitUntil(()=>performance.now()-compositionStart>220);
    assert(input.isConnected && $('#panel').querySelectorAll('.card').length>=4,'조합 중 화면 재생성 방지');
    input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
    await waitUntil(()=>$('#panel').querySelectorAll('.card').length===0);
    assert($('#panel').querySelectorAll('.card').length === 0, '검색 결과 비우기');
    assert(document.activeElement.id==='dexSearch','실시간 검색 입력 초점 유지');
    $('#dexSearch').value = ''; $('#dexSearch').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',bubbles:true}));
    assert($('#panel').querySelectorAll('.card').length >= 4, '검색 해제');
  });
  await check('관찰 버튼→추적 카메라→기본 시점 복귀', () => {
    click('#tabs [data-tab="home"]'); click('#panel [data-act="focuscat"]');
    assert(U.world.followCatId === U.sel && !$('#watchingCat').hidden, '고양이 관찰');
    click('#returnCamera'); assert(!U.world.followCatId && $('#watchingCat').hidden, '관찰 종료');
  });
  await check('이웃 카드 상세·교환 버튼 분리와 교환 취소', () => {
    click('#tabs [data-tab="npc"]');
    assert($('#panel').querySelectorAll('article.card .card-main').length===15,'이웃 상세 버튼');
    assert($('#panel').querySelectorAll('button button').length===0,'버튼 중첩 방지');
    const mine=[...game.G.mine];click('#panel [data-act="trade"]');
    assert($('#modal').querySelectorAll('button[data-act="dotrade"]').length===mine.length,'키보드로 고를 수 있는 교환 후보');
    click('#modal [data-act="close"]');
    assert(JSON.stringify(game.G.mine)===JSON.stringify(mine),'교환 취소 진행 유지');
    click('#tabs [data-tab="npc"]');
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
  await check('공유 털 텍스처의 모델별 참조·중복 해제 보호', async () => {
    const {buildCat,disposeCat}=await import('./cat3d.js');
    const {texturePoolStats}=await import('./textures.js');
    const first=game.myCats()[0],live=U.world.catObjs.get(first.id).root;
    const refs=texturePoolStats().refs;
    const copy=buildCat(first);
    assert(copy.userData.textureSet === live.userData.textureSet, '공유 텍스처 재사용');
    assert(texturePoolStats().refs === refs+1, '모델 참조 횟수');
    disposeCat(copy); disposeCat(copy);
    assert(texturePoolStats().refs === refs && live.userData.textureSet, '중복 모델 해제의 참조 보호');
  });
  await check('썸네일 대량 생성 후 유휴 캐시 제한·라이브 텍스처 보호', async () => {
    const {thumbnail}=await import('./stage.js');
    const {texturePoolStats,clearUnusedTextures}=await import('./textures.js');
    const {createFounder}=await import('./engine.js');
    const live=U.world.catObjs.get(game.G.mine[0]).root.userData.textureSet;
    const before=texturePoolStats(),pixels=live.body.image.toDataURL();
    let disposedLive=false;const disposed=()=>{disposedLive=true;};
    live.body.addEventListener('dispose',disposed);
    try {
      for(let i=0;i<24;i++) thumbnail(createFounder(`smoke-texture-${i}`,{specialChance:0}),64);
      const after=texturePoolStats();
      assert(after.idle<=16 && after.refs===before.refs, '캐시 제한 또는 참조 누적');
      clearUnusedTextures();
      assert(texturePoolStats().idle===0 && !disposedLive, '사용 중인 텍스처 해제');
      assert(live.body.image.toDataURL()===pixels, '라이브 개체의 무늬 변경');
      U.world.frame();
    } finally {live.body.removeEventListener('dispose',disposed);}
  });
  await check('토티 털 텍스처를 완전히 해제·재생성해도 픽셀 유지', async () => {
    const {buildCat,disposeCat}=await import('./cat3d.js');
    const {clearUnusedTextures}=await import('./textures.js');
    const {createFounder,refreshCat}=await import('./engine.js');
    const cat=createFounder('smoke-barr-rebuild',{sex:'F',specialChance:0});
    cat.genome.O=['O','o'];const tortie=refreshCat(cat);
    let first,second;
    try {
      first=buildCat(tortie);
      const texture=first.userData.textureSet.body,pixels=texture.image.toDataURL();
      disposeCat(first); clearUnusedTextures();
      second=buildCat(tortie);
      assert(second.userData.textureSet.body!==texture, '완전 해제 후 새 텍스처 생성');
      assert(second.userData.textureSet.body.image.toDataURL()===pixels, '토티 패치 재생성 일관성');
    } finally {if(first)disposeCat(first);if(second)disposeCat(second);}
  });
  await check('명시적 판매·새 게임 확인 시에만 상태 변경', () => {
    click('#tabs [data-tab="home"]');
    const soldId=U.sel,before=game.G.mine.length;
    click('#panel [data-act="sell"]');click('#modal [data-act="confirm"]');
    assert(game.G.mine.length===before-1 && !game.G.mine.includes(soldId),'판매 확인 실행');
    click('[data-dev="reset"]');click('#modal [data-act="confirm"]');
    assert(game.G.mine.length===4 && game.G.offset===0 && !U.breed.father && !U.breed.mother,'새 게임 확인 실행');
    assert(JSON.parse(memory.getItem('catgene-save-v1')).mine.length===4,'새 게임 저장');
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
