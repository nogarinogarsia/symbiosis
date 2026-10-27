// Browser integration tests use the real index markup and UI, with isolated storage.
const report = document.querySelector('#smokeReport');
const checks = document.querySelector('#smokeChecks');
const summary = document.querySelector('#smokeSummary');
const results = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const $ = selector => document.querySelector(selector);
const click = selector => { const element = $(selector); assert(element && !element.disabled, `조작할 수 없음: ${selector}`); element.closest('details:not([open])')?.querySelector('summary').click();element.click(); };
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
  game.newGame(); init({development:true});
  // Existing UI regressions now visit the required place before exercising its menu.
  const visit=tab=>{
    if(tab!=='home'){
      const zone=U.world.zones.find(z=>tab==='npc'?z.id==='npc:n1':z.id===tab);
      U.world.teleport(zone.x,zone.z);U.world.checkZones();
    }
    if(!U.open||U.tab!==tab)click(`#tabs [data-tab="${tab}"]`);
  };
  await check('실제 월드 생성·시작 고양이·샵·이웃 동기화', () => {
    assert(game.G.mine.length === 4 && game.G.shop.length === 8 && game.G.npcs.length === 5, '초기 개체 수');
    assert(U.world.catObjs.size === 19 && U.world.renderer.info.render.calls >= 0, '월드 개체 동기화');
    assert($('#panel').hidden, '초기 패널 닫힘');
  });
  await check('메뉴 클릭으로 우리집 패널 표시', () => {
    visit('home');
    assert(!$('#panel').hidden && $('#panel').textContent.includes('고양이 4마리'), '우리집 렌더');
  });
  await check('원격 메뉴 차단·지도 길찾기·도착 후 메뉴·이탈 시 닫기',()=>{
    click('#panel [data-act="closepanel"]');
    for(const tab of ['breed','shop','dex','npc'])assert($(`#tabs [data-tab="${tab}"]`).hidden,'장소 밖 메뉴 숨김');
    $('#tabs [data-tab="breed"]').click();assert(!U.open&&U.world.destination==='breed','숨긴 메뉴 직접 호출도 원격 실행 방지');
    U.world.cancelJourney();click('#tabs [data-act="mapguide"]');
    click('#modal [data-act="navigate"][data-zone="npc:n1"]');
    assert(!U.open&&U.world.destination==='npc:n1'&&U.world.target,'지도는 즉시 기능 대신 이동');
    for(let i=0;i<2000&&!U.open;i++){U.world.movePlayer(.05,i*.05);U.world.checkZones();}
    assert(U.open&&U.tab==='npc'&&U.world.canOpen('npc'),'울타리를 우회해 이웃 도착');
    U.world.teleport(-1,13);U.world.checkZones();assert(!U.open&&$('#tabs [data-tab="npc"]').hidden,'장소 이탈 시 메뉴 닫기');
    visit('home');
  });
  await check('현재 위치 지도·이웃 다섯 목적지·다음 할 일·접는 설정',()=>{
    assert($('#panel .next-step').textContent.includes('새 가족'),'초기 목표 안내');
    assert(!$('#homeTools').open,'돌봄 우선으로 설정 접기');
    click('#panel [data-act="penlevels"]');assert($('#homeTools').open,'설정 펼쳐 계획 열기');
    click('#modal [data-act="close"]');
    click('#tabs [data-act="mapguide"]');
    assert($('#modal .village-map').getAttribute('role')==='img','지도 설명');
    assert($('#modal').querySelectorAll('[data-act="navigate"]').length===8,'건물 셋과 이웃 다섯');
    assert($('#modal').textContent.includes('밤토리')&&$('#modal').textContent.includes('미루'),'이웃별 이름');
    click('#modal [data-zone="npc:n5"]');
    assert(U.world.destination==='npc:n5'&&$('#journeyLabel').textContent.includes('미루'),'선택한 이웃과 이동 안내 일치');
    click('#journey [data-act="canceljourney"]');visit('home');
  });
  await check('쉼터 1마리 예약·도착·만석 대체 행동', () => {
    const world=U.world, all=[...world.catObjs.values()], mine=all.filter(o=>o.pen==='mine');
    const snapshots=all.map(o=>({o,state:{...o},position:o.holder.position.clone(),rotation:o.holder.rotation.clone()}));
    try {
      for(const o of all) {o.moving=false;o.activity='care';o.wait=100;o.partnerId=null;o.shelterId=null;}
      for(const o of mine.slice(0,3)) {o.personality=1;o.wait=0;}
      world.updateCats(.01,1000);
      const [first,second,third]=mine;
      assert(first.activity==='shelter' && second.activity==='shelter','실제 쉼터 선택');
      assert(first.shelterId!==second.shelterId && !third.shelterId,'쉼터 중복 예약 방지');
      assert(world.pens.mine.shelters.every(s=>s.object.parent===world.scene),'쉼터 모델 배치');
      assert(world.activityOf(first.id)==='조용한 쉼터로 가요','이동 상태');
      first.holder.position.set(first.tx,0,first.tz);world.updateCats(.01,1000.1);
      assert(!first.moving && world.activityOf(first.id)==='포근한 쉼터에서 쉬어요','쉼터 도착');
      world.react(first.id,'pet');assert(!first.shelterId && first.activity==='care','돌봄 시 예약 해제');
    } finally {for(const {o,state,position,rotation} of snapshots){for(const key of Object.keys(o))if(!(key in state))delete o[key];Object.assign(o,state);o.holder.position.copy(position);o.holder.rotation.copy(rotation);}}
  });
  await check('친구 위치 추적·서로 인사·돌봄 중 접근 취소', () => {
    const world=U.world,all=[...world.catObjs.values()],mine=all.filter(o=>o.pen==='mine');
    const snapshots=all.map(o=>({o,state:{...o},position:o.holder.position.clone(),rotation:o.holder.rotation.clone()}));
    try {
      for(const o of all){o.moving=false;o.activity='care';o.wait=100;o.partnerId=null;o.shelterId=null;}
      const [a,b]=mine;a.personality=2;a.wait=0;a.socialUntil=b.socialUntil=0;
      a.holder.position.set(-9,0,2);b.holder.position.set(-7,0,2);b.activity='idle';
      const random=Math.random;
      try{Math.random=()=>.1;world.updateCats(.01,1000);}finally{Math.random=random;}
      assert(a.partnerId===b.id && a.moving,'친구 선택');
      const oldZ=a.tz;b.holder.position.z=3;world.updateCats(.01,1000.1);
      assert(a.tz!==oldZ,'움직이는 친구 목적지 갱신');
      a.holder.position.set(a.tx,0,a.tz);world.updateCats(.01,1000.2);
      assert(a.activity==='rub' && b.activity==='greet' && !b.moving && !a.partnerId,'서로 마주 보는 인사');
      assert(a.socialUntil>1000.2 && b.socialUntil>1000.2,'연속 인사 방지');
      a.wait=0;a.activity=b.activity='idle';world.updateCats(.01,1000.3);
      assert(!a.partnerId,'인사를 건 개체도 연속 인사 쿨다운');
      a.partnerId=b.id;a.moving=true;a.chaseUntil=2000;b.activity='care';
      world.updateCats(.01,1001);assert(!a.partnerId && !a.moving && a.activity==='idle','돌봄 받는 친구 방해 방지');
    } finally {for(const {o,state,position,rotation} of snapshots){for(const key of Object.keys(o))if(!(key in state))delete o[key];Object.assign(o,state);o.holder.position.copy(position);o.holder.rotation.copy(rotation);}}
  });
  await check('고양이 카드 네이티브 버튼·선택 상태·재렌더 후 초점', () => {
    const card=$('#panel [data-act="select"]');
    assert(card.tagName==='BUTTON', '고양이 카드 키보드 조작');
    card.focus();const id=card.dataset.id;card.click();
    assert(document.activeElement.dataset.id===id && document.activeElement.dataset.act==='select', '선택 후 초점 유지');
    assert(document.activeElement.getAttribute('aria-pressed')==='true', '고양이 선택 상태 전달');
    assert($('#tabs [data-tab="home"]').getAttribute('aria-expanded')==='true','패널 열림 상태');
  });
  await check('배경음악·효과음 개별 음량·설정 저장·자동 재생 없음', async () => {
    const {sound}=await import('./audio.js');const {loadAudioPreferences}=await import('./preferences.js');
    click('#panel [data-act="audioSettings"]');
    assert($('#modal').textContent.includes('소리 설정') && !sound.enabled && !sound.context,'소리 설정만 열면 자동 재생하지 않음');
    const music=$('#musicVolume');music.value='0';music.dispatchEvent(new Event('input',{bubbles:true}));
    const effects=$('#effectsVolume');effects.value='27';effects.dispatchEvent(new Event('input',{bubbles:true}));
    assert($('#musicVolumeValue').textContent==='0%' && $('#effectsVolumeValue').textContent==='27%','음량 표시');
    assert(sound.volumes.music===0 && sound.volumes.effects===.27,'개별 음량 적용');
    assert(loadAudioPreferences(memory).effects===.27,'음량 설정 저장');
    click('#modal [data-act="close"]');click('#panel [data-act="audioSettings"]');
    assert($('#effectsVolume').value==='27' && $('#musicVolume').value==='0','설정 다시 열기');
    click('#modal [data-act="close"]');
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
    visit('shop');
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
    visit('home');
  });
  await check('성묘 돌봄 클릭·저장 반영', () => {
    const id = U.sel;
    click('#panel [data-act="dailycare"][data-a="feed"]');
    assert(game.cat(id).wellbeing.food > 0, '밥 주기 상태');
    const stored = JSON.parse(memory.getItem('catgene-save-v1'));
    assert(stored.cats[id].wellbeing.food === game.cat(id).wellbeing.food, '돌봄 저장');
  });
  await check('교배 후보 선택·부모 슬롯·실행 가능 상태', () => {
    visit('breed');
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
  await check('연출 뒤에 가려진 월드 렌더 중지·복귀',()=>{
    const world=U.world,frame=world.renderer.info.render.frame;
    try{world.suspended=true;world.frame();assert(world.renderer.info.render.frame===frame,'가려진 월드 렌더 중지');}
    finally{world.suspended=false;}
    world.frame();assert(world.renderer.info.render.frame>frame,'월드 렌더 복귀');
  });
  await check('한글 조합 보호·실시간 검색 초점 유지→검색 해제', async () => {
    visit('dex');
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
    visit('home'); click('#panel [data-act="focuscat"]');
    assert(U.world.followCatId === U.sel && !$('#watchingCat').hidden, '고양이 관찰');
    click('#returnCamera'); assert(!U.world.followCatId && $('#watchingCat').hidden, '관찰 종료');
  });
  await check('이웃 카드 상세·교환 버튼 분리와 교환 취소', () => {
    visit('npc');
    assert($('#panel').querySelectorAll('article.card .card-main').length===3,'도착한 이웃의 상세 버튼');
    assert($('#panel').querySelectorAll('button button').length===0,'버튼 중첩 방지');
    const mine=[...game.G.mine];click('#panel [data-act="trade"]');
    assert($('#modal').querySelectorAll('button[data-act="dotrade"]').length===mine.length,'키보드로 고를 수 있는 교환 후보');
    click('#modal [data-act="close"]');
    assert(JSON.stringify(game.G.mine)===JSON.stringify(mine),'교환 취소 진행 유지');
    visit('npc');
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
  await check('네 발 보행·장모 셸 정렬·기본 자세 복귀·개별 입 텍스처 해제', async () => {
    const {buildCat,disposeCat}=await import('./cat3d.js');const {createFounder,refreshCat}=await import('./engine.js');
    for(const long of [false,true]){
      const base=createFounder(`walk-smoke-${long}`,{specialChance:0,personality:0});base.genome.L=long?['l','l']:['L','L'];const c=refreshCat(base);
      const original=JSON.stringify(c),root=buildCat(c),parts=root.userData.parts;
      const mouth=[...root.userData.ownedTextures][0];let releases=0;mouth.addEventListener('dispose',()=>releases++);
      try{
        assert(parts.bodyLayers.length===(long?7:1),'장모/단모 별도 모델 생성');
        for(let i=0;i<60;i++)root.userData.tick(i/60,{moving:true,dt:1/60});
        assert(parts.head.position.z>.6 && parts.hindParts.every(p=>p.paw.position.z<-.3),'네 발 자세');
        assert(parts.frontParts.every(p=>p.paw.position.z>.5),'앞발 위치');
        assert(parts.bodyLayers.every(layer=>Math.abs(layer.scale.y-parts.bodyLayers[0].scale.y)<1e-10),'장모 몸통 셸 정렬');
        assert(parts.hindParts.every(p=>p.layers.every(layer=>layer.position.z===p.thigh.position.z)),'장모 뒷다리 셸 정렬');
        for(let i=0;i<120;i++)root.userData.tick(1+i/60,{moving:false,dt:1/60});
        assert(Math.abs(parts.head.position.z-.2)<1e-6 && parts.hindParts.every(p=>Math.abs(p.paw.position.z-.2)<1e-6),'기본 자세 복귀');
        assert(JSON.stringify(c)===original,'유전·개체 정보 보존');
      }finally{disposeCat(root);disposeCat(root);}
      assert(releases===1 && root.userData.ownedTextures.size===0,'전용 입 텍스처 1회 해제');
    }
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
  await check('재화로 우리 확장·취소 보존·확인 차감·저장',()=>{
    visit('home');click('#btnIncome');
    const before=game.G.coins,level=game.G.penLevel,cost=game.penStatus().next.cost,oldPen=U.world.pens.mine,walls=U.world.colliders.length;
    assert(before>=cost,'첫 확장 재화');
    click('#panel [data-act="upgradepen"]');click('#modal [data-act="close"]');
    assert(game.G.coins===before&&game.G.penLevel===level,'확장 취소');
    click('#panel [data-act="upgradepen"]');click('#modal [data-act="confirm"]');
    assert(game.G.coins===before-cost&&game.G.penLevel===level+1&&game.penStatus().capacity===7,'확장 확인');
    assert(U.world.pens.mine.w>oldPen.w&&oldPen.group.userData.disposed&&U.world.colliders.length===walls,'실제 울타리 확장·이전 자원/충돌체 정리');
    assert(JSON.parse(memory.getItem('catgene-save-v1')).penLevel===2,'우리 레벨 저장');
  });
  await check('교배 연출 건너뛰기·중복 클릭 방지·새끼 저장', async () => {
    click('[data-dev="1d"]');visit('breed');
    click('#panel [data-act="pick"]:not(:disabled)');click('#panel [data-act="pick"]:not(:disabled)');
    const before=game.G.mine.length,button=$('#panel [data-act="dobreed"]');button.click();button.click();
    assert(U.busy && document.activeElement.id==='skipBreed','건너뛰기 초점');
    click('#skipBreed');await waitUntil(()=>!U.busy);
    assert(game.G.mine.length===before+1 && !$('#modal').hidden && $('#breedOverlay').hidden,'중복 탄생 없이 결과 복구');
    assert(JSON.parse(memory.getItem('catgene-save-v1')).mine.includes(U.sel),'건너뛴 새끼 저장');
    click('#modal [data-act="close"]');
  });
  await check('교배 연출 Tab 초점 격리·Escape 건너뛰기', async () => {
    click('[data-dev="1d"]');visit('breed');
    click('#panel [data-act="pick"]:not(:disabled)');click('#panel [data-act="pick"]:not(:disabled)');
    const before=game.G.mine.length;click('#panel [data-act="dobreed"]');
    const skip=$('#skipBreed');skip.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
    assert(document.activeElement===skip && $('#top').inert,'연출 중 초점 격리');
    skip.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    await waitUntil(()=>!U.busy);
    assert(game.G.mine.length===before+1 && $('#breedOverlay').hidden && !$('#modal').hidden,'Escape 후 탄생 결과');
    click('#modal [data-act="close"]');
  });
  await check('교배 무대 초기화 오류에도 새끼 보존·초점 격리 해제', async () => {
    click('[data-dev="1d"]');visit('breed');
    click('#panel [data-act="pick"]:not(:disabled)');click('#panel [data-act="pick"]:not(:disabled)');
    const before=game.G.mine.length,resize=U.stage.resize;
    try{
      U.stage.resize=()=>{throw new Error('isolated initialization failure');};
      click('#panel [data-act="dobreed"]');await waitUntil(()=>!U.busy);
      assert(game.G.mine.length===before+1 && $('#breedOverlay').hidden && !$('#modal').hidden,'초기화 오류 뒤 결과');
      assert(JSON.parse(memory.getItem('catgene-save-v1')).mine.includes(U.sel),'초기화 오류 뒤 새끼 저장');
      click('#modal [data-act="close"]');assert(!$('#top').inert && U.world.enabled,'초기화 오류 뒤 조작 복귀');
    }finally{U.stage.resize=resize;}
  });
  await check('교배 프레임 오류에도 새끼 보존·조작 복구', async () => {
    visit('shop');click(`#panel [data-act="sell"][data-id="${U.sel}"]`);click('#modal [data-act="confirm"]');
    click('[data-dev="1d"]');visit('breed');
    click('#panel [data-act="pick"]:not(:disabled)');click('#panel [data-act="pick"]:not(:disabled)');
    const before=game.G.mine.length;click('#panel [data-act="dobreed"]');
    U.stage.anim=()=>{throw new Error('isolated animation failure');};U.stage.frame();
    await waitUntil(()=>!U.busy);
    assert(game.G.mine.length===before+1 && $('#breedOverlay').hidden && !$('#modal').hidden,'오류 뒤 탄생 결과');
    assert(!U.stage.breedTask && U.stage.cats.length===0,'실패 무대 정리');
    assert($('#toasts').textContent.includes('안전하게 도착'),'복구 안내');
    click('#modal [data-act="close"]');
    assert(!$('#top').inert && U.world.enabled,'배경 조작 복귀');
  });
  await check('정원 초과 새끼 보존·추가 교배 차단·확장으로 해소',()=>{
    assert(game.penStatus().over===1&&game.G.mine.length===8,'8마리 중 정원 7 초과 보호');
    const before=JSON.stringify(game.G);const parents=game.myCats().filter(c=>c.personality!==null);
    assert(game.checkBreed(parents.find(c=>c.sex==='M'),parents.find(c=>c.sex==='F')).includes('정원'),'초과 교배 차단');
    assert(JSON.stringify(game.G)===before,'차단 시 진행 보존');
    visit('home');assert($('#panel').textContent.includes('정원 1마리 초과'),'초과 안내');click('#btnIncome');
    // Low-income random founders may need more than one capped day to afford level three.
    for(let day=0;day<8&&game.G.coins<game.penStatus().next.cost;day++){click('[data-dev="1d"]');click('#btnIncome');}
    click('#panel [data-act="upgradepen"]');click('#modal [data-act="confirm"]');
    assert(game.penStatus().capacity===9&&game.penStatus().over===0&&game.G.mine.length===8,'확장해 모든 고양이 보존');
  });
  await check('명시적 판매·새 게임 확인 시에만 상태 변경', () => {
    visit('home');
    const soldId=U.sel,before=game.G.mine.length;visit('shop');
    click(`#panel [data-act="sell"][data-id="${soldId}"]`);click('#modal [data-act="confirm"]');
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
const explore=document.createElement('button');explore.textContent='검사창 접고 직접 둘러보기';explore.id='exploreSmoke';explore.onclick=()=>{report.hidden=true;};report.appendChild(explore);
