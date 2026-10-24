import { Stage, thumbnail } from './stage.js';
import { World } from './world.js';
import { G, now, cat, myCats, shopCats, tick, care, sell, trade, doBreed, checkBreed, breedCost, sourceOf, collectIncome,
  pendingIncome, skipTime, reset, dexTotals, save, exportSave, importSave, saveError } from './game.js';
import { phenotypeName, gradeLabel, sellPrice, shopBreedPrice, incomePerHour, canBreed, SPECIALS, FANTASY, COSTUMES, COLOR_KO, TYR_KO, isForbiddenPair } from './engine.js';
import { PERSONALITIES, CARE_ACTIONS, careCooldown, growthRemaining } from './personality.js';
import { GRADES, GRADE_COLORS, PARAMS } from './params.js';
import { comfort, litterState } from './wellbeing.js';
import { careDaily } from './game.js';
import { bindTouchControls } from './touch-controls.js';
import { sound } from './audio.js';
import { loadAudioPreferences, saveAudioPreferences } from './preferences.js';
import { trapDialogFocus, rememberPanelFocus } from './focus.js';

const $ = (s) => document.querySelector(s);
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const U = { tab: 'home', sel: null, breed: { father: null, mother: null, slot: 'father', src: 'mine' }, stage: null, world: null, open: false, npc: null, dexPage: 1, dexGrade: -1, dexSearch: '', busy: false };
let dexSearchTimer = null;
let dexComposing = false;
export { U };

/* ───── 공통 헬퍼 ───── */
const sexIcon = (c) => `<span class="sex ${c.sex === 'M' ? 'm' : 'f'}">${c.sex === 'M' ? '♂' : '♀'}</span>`;
function gradeColor(c) { return c.grade === 'SPECIAL' ? '#ff6fb0' : GRADE_COLORS[c.grade]; }
const badge = (c) => `<span class="badge" style="background:${gradeColor(c)}">${gradeLabel(c)}</span>`;
function fmt(ms) {
  const s = Math.ceil(ms / 1000);
  if (s >= 3600) return `${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function toast(msg) {
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg;
  $('#toasts').appendChild(d); setTimeout(() => d.remove(), 3200);
}
function fx(emoji, n = 5) {
  const L = $('#fxLayer'), r = L.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div'); d.className = 'fx'; d.textContent = emoji;
    d.style.left = (r.width * (0.35 + Math.random() * 0.3)) + 'px'; d.style.top = (r.height * (0.45 + Math.random() * 0.2)) + 'px';
    d.style.animationDelay = (i * 0.08) + 's'; L.appendChild(d); setTimeout(() => d.remove(), 1800);
  }
}
function personalityChip(c) {
  if (c.personality === null || c.personality === undefined) return '<span class="chip">🍼 성장 중</span>';
  const p = PERSONALITIES[c.personality];
  return `<span class="chip">${p.emoji} ${p.name}</span>`;
}
function tags(c) {
  const t = [];
  if (c.special) t.push(`<span class="chip">⭐ ${SPECIALS[c.special]}</span>`);
  if (c.fantasy) t.push(`<span class="chip sheen">✨ ${FANTASY[c.fantasy]}</span>`);
  if (c.costume) t.push(`<span class="chip">👒 ${COSTUMES.find((x) => x.id === c.costume).name}</span>`);
  return t.join('');
}
function card(c, { sel = false, dis = false, meta = '', attr = '', actions = '' } = {}) {
  const content = `<img src="${thumbnail(c, 130)}" alt=""><span class="nm">${c.name} ${sexIcon(c)}</span><span>${badge(c)}</span><span class="meta">${meta}</span>`;
  const selection = /data-act="(select|pick)"/.test(attr) ? `aria-pressed="${sel}"` : '';
  if (actions) return `<article class="card"><button type="button" class="card-main" ${attr}>${content}</button><div class="meta">${actions}</div></article>`;
  return `<button type="button" class="card ${sel ? 'sel' : ''} ${dis ? 'dis' : ''}" ${attr} ${selection} ${dis ? 'disabled' : ''}>${content}</button>`;
}
const desc = (c) => (c.special ? `${SPECIALS[c.special]} · ` : '') + (c.fantasy ? `${FANTASY[c.fantasy]} · ` : '') + phenotypeName(c.ph);
const litterSummary = state => state.total ? `🧹 화장실 청소 ${state.total}개 · 우리 안 화장실을 클릭하거나 아래 청소 버튼을 눌러 주세요.` : '✨ 우리 안 화장실이 깨끗해요.';

/* ───── 렌더 ───── */
export function init() {
  try { sound.setVolumes(loadAudioPreferences(window.localStorage)); } catch { /* storage access may be unavailable */ }
  U.world = new World($('#world'), { onZone: (id) => handleZone(id), onCat: (id) => {
    if (sourceOf(id) === 'mine') { U.sel = id; openPanel('home'); }
    else showDetail(id, true);
  }, onFocus: id => { $('#watchingCat').hidden = !id; $('#watchingCat').dataset.id = id ?? ''; $('#watchingLabel').textContent = id ? `${cat(id).name} 관찰 중 · ${U.world.activityOf(id)}` : ''; }, onClean: id => {
    const result = careDaily(id, 'clean');
    if (result.ok) { sound.play('clean'); fx('🧹'); toast(`${cat(id).name}의 화장실을 치웠어요`); render(); }
    else toast(result.msg);
  } });
  $('#returnCamera').onclick = () => U.world.stopWatching();
  $('#skipBreed').onclick = () => U.stage?.clear();
  U.world.setupNpcs(G.npcs);
  U.clearStick = bindTouchControls($('#touchStick'), (x, y) => { U.world.stick = { x, y }; if (x || y) U.world.target = null; });
  document.addEventListener('visibilitychange', () => { sound.visibility(document.hidden).catch(() => toast('소리를 다시 켜 주세요')); });
  $('#btnSound').onclick = toggleSound;
  document.addEventListener('click', onClick);
  document.addEventListener('input', e => {
    if (e.target.matches('[data-volume]')) {
      const key=e.target.dataset.volume;
      sound.setVolumes({...sound.volumes,[key]:Number(e.target.value)/100});
      $(`#${key}VolumeValue`).textContent=`${Math.round(sound.volumes[key]*100)}%`;
      try { if(!saveAudioPreferences(window.localStorage,sound.volumes)) toast('음량을 저장하지 못했어요. 현재 창에는 적용했어요'); }
      catch { toast('음량을 저장하지 못했어요. 현재 창에는 적용했어요'); }
    }
    if (e.target.id === 'dexSearch') {
      U.dexSearch = e.target.value; U.dexPage = 1; clearTimeout(dexSearchTimer);
      if (e.isComposing || dexComposing) return;
      dexSearchTimer = setTimeout(() => { if (U.open && U.tab === 'dex') render(); }, 180);
    }
  });
  document.addEventListener('compositionstart', e => { if (e.target.id === 'dexSearch') { dexComposing = true; clearTimeout(dexSearchTimer); } });
  document.addEventListener('compositionend', e => { if (e.target.id === 'dexSearch') { dexComposing = false; e.target.dispatchEvent(new Event('input', {bubbles:true})); } });
  document.addEventListener('keydown', e => {
    if (e.target.id === 'dexSearch' && e.key === 'Enter' && !e.isComposing && !dexComposing) { clearTimeout(dexSearchTimer); U.dexSearch = e.target.value; U.dexPage = 1; render(); }
  });
  document.addEventListener('keydown', e => {
    if (U.busy && !$('#breedOverlay').hidden) {
      trapDialogFocus(e, $('#breedOverlay'));
      if (e.key === 'Escape') { e.preventDefault(); U.stage?.clear(); }
    } else if (!$('#modal').hidden) {
      trapDialogFocus(e, $('#modal .dialog'));
      if (e.key === 'Escape' && !U.busy) { e.preventDefault(); closeModal(); }
    } else if (e.key === 'Escape' && !U.busy && U.open) { e.preventDefault(); closePanel(); }
  });
  $('#saveFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('10MB 이하의 저장 파일을 골라 주세요');
      const raw = await file.text();
      const { validateSave } = await import('./save-data.js');
      validateSave(JSON.parse(raw));
      confirmDialog('백업 불러오기', '이 백업으로 현재 진행을 교체할까요? 먼저 현재 진행을 백업해 두세요.', () => {
        try {
          importSave(raw);
          U.sel = myCats()[0]?.id ?? null; U.breed.father = null; U.breed.mother = null;
          U.world.setupNpcs(G.npcs); render(); toast('진행을 불러왔어요');
        } catch (error) { toast(error.message); }
      });
    } catch (err) { toast(err.message); }
    finally { e.target.value = ''; }
  });
  $('#btnIncome').onclick = () => { const n = collectIncome(); if (n > 0) sound.play('income'); toast(n > 0 ? `🐾 ${n} 재화를 받았어요!` : '아직 받을 수입이 없어요'); render(); };
  if (!U.sel || !cat(U.sel)) U.sel = myCats()[0]?.id ?? null;
  setInterval(everySecond, 1000);
  render();
}

function handleZone(id) {
  if (U.busy) return;
  if (id === 'shop') openPanel('shop');
  else if (id === 'breed') openPanel('breed');
  else if (id.startsWith('npc:')) { U.npc = id.slice(4); openPanel('npc'); }
}
function openPanel(tab) { dexComposing = false; clearTimeout(dexSearchTimer); U.clearStick?.(); U.world.keys = {}; U.world.target = null; U.tab = tab; U.open = true; render(); $('#panel .xbtn').focus({preventScroll:true}); }
function closePanel() { dexComposing = false; clearTimeout(dexSearchTimer); U.open = false; render(); document.querySelector(`#tabs [data-tab="${U.tab}"]`)?.focus({preventScroll:true}); }

export function render() {
  backgroundInert(U.busy || !$('#modal').hidden);
  $('#touchStick').hidden = U.open || U.busy || !$('#modal').hidden;
  document.querySelectorAll('#tabs button').forEach((b) => { const expanded = U.open && b.dataset.tab === U.tab; b.classList.toggle('on', expanded); b.setAttribute('aria-expanded', String(expanded)); b.setAttribute('aria-controls', 'panel'); });
  $('#coins').textContent = G.coins.toLocaleString();
  $('#incomeAmt').textContent = '+' + pendingIncome().toLocaleString();
  updateClock();
  const P = $('#panel');
  if (!U.open) P.hidden = true;
  else {
    const scroll = P.scrollTop;
    const restoreFocus = rememberPanelFocus(P);
    P.hidden = false;
    P.innerHTML = '<button class="xbtn" data-act="closepanel" aria-label="패널 닫기">✕</button>' + { home: homeView, breed: breedView, dex: dexView, shop: shopView, npc: npcView }[U.tab]();
    P.querySelector('h2').id = 'panelTitle'; P.setAttribute('aria-labelledby','panelTitle');
    P.scrollTop = scroll;
    restoreFocus();
  }
  syncWorld();
}
function syncWorld() {
  const d = [];
  for (const c of myCats()) d.push({ cat: c, pen: 'mine' });
  for (const n of G.npcs) for (const id of n.cats) { const c = cat(id); if (c) d.push({ cat: c, pen: 'npc:' + n.id }); }
  U.world.sync(d);
  U.world.syncLitter(litterState(myCats(), now()));
}
function updateClock() {
  const d = new Date(now());
  $('#clock').textContent = `🕒 ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
let stageKey = '';

/* ───── 우리집 ───── */
function homeView() {
  const cats = myCats().slice().reverse();
  const c = cat(U.sel);
  const t = now();
  let html = `<h2>🏠 우리집 <small class="hint">고양이 ${cats.length}마리 · 하루 수입 ${Math.round(cats.reduce((s, x) => s + incomePerHour(x) * 24, 0))}</small></h2>`;
  const litter = litterState(cats, t);
  html += `<p class="hint" id="litterStatus">${litterSummary(litter)}</p>`;
  html += `<div class="row"><button class="btn sm gray" data-act="backup">💾 진행 백업</button><button class="btn sm gray" data-act="restore">📂 백업 불러오기</button><button class="btn sm gray" data-act="audioSettings">🎵 소리 설정</button></div>`;
  html += '<p class="hint"><a href="lab.html">🧪 유전 실험실 — 부모 유전자 편집 · 대량 교배 통계</a></p>';
  if (saveError) html += `<p role="alert" class="warn-msg">${saveError}</p>`;
  if (c) html += detailBox(c, t);
  html += `<h3>우리 고양이들</h3><div class="grid">` + cats.map((x) => {
    const gr = growthRemaining(x, t);
    return card(x, { sel: x.id === U.sel, attr: `data-act="select" data-id="${x.id}"`, meta: gr > 0 ? `🍼 <span data-until="${x.birthTime + PARAMS.growthWindowMs}">${fmt(gr)}</span>` : `${PERSONALITIES[x.personality].emoji} ${PERSONALITIES[x.personality].name}` });
  }).join('') + '</div>';
  if (!cats.length) html += '<p class="sub">우리집이 비었어요. 도감은 그대로 보관됩니다. 진행을 백업하거나 새 게임을 시작할 수 있어요.</p><button class="btn sm gray" data-dev="reset">새 게임 시작</button>';
  return html;
}

function detailBox(c, t) {
  const gr = growthRemaining(c, t);
  let body = `<div class="row" style="margin-bottom:6px">${badge(c)}${personalityChip(c)}${tags(c)}</div>
    <div class="hint" style="margin-bottom:8px">${desc(c)}</div>`;
  body += `<p class="activity-note" data-cat-activity="${c.id}">🐾 ${U.world.activityOf(c.id)}</p>`;
  if (gr > 0) {
    const p = 1 - gr / PARAMS.growthWindowMs;
    body += `<div class="row" style="justify-content:space-between"><span>🍼 성격 형성 중 (탄생 후 1시간 돌봄)</span><span data-until="${c.birthTime + PARAMS.growthWindowMs}">${fmt(gr)}</span></div>
      <div class="bar"><i style="width:${Math.round(p * 100)}%"></i></div><div class="care" style="margin-top:10px">`;
    for (const a of CARE_ACTIONS) {
      const cd = careCooldown(c, a.id, t);
      body += `<button data-act="care" data-id="${c.id}" data-a="${a.id}" ${cd > 0 ? 'disabled' : ''} data-cdun="${t + cd}"><span>${a.icon}</span>${a.name}<small class="hint">${cd > 0 ? fmt(cd) : ' '}</small></button>`;
    }
    body += '</div><div class="hint" style="margin-top:8px">어떻게 돌보느냐에 따라 확률적으로 성격이 정해져요. (같은 돌봄이라도 결과는 달라질 수 있어요)</div>';
  } else {
    const p = PERSONALITIES[c.personality];
    body += `<div class="box" style="margin:0">${p.emoji} <b>${p.name}</b> — ${p.desc}<br><span class="hint">${p.act}</span></div>`;
  }
  const cdLeft = Math.max(0, c.lastBreedAt + PARAMS.breedCooldownMs - t);
  body += '<h3>오늘의 돌봄</h3><div class="care">' + comfort(c, t).filter(a => gr <= 0 || a.id === 'clean').map(a => `<button data-act="dailycare" data-id="${c.id}" data-a="${a.id}"><span>${a.icon}</span>${a.name}<small class="hint">편안함 ${a.value}%</small></button>`).join('') + '</div><p class="hint">성장 후에도 매일 돌볼 수 있어요. 편안함은 성격·유전·교배 확률에 영향을 주지 않아요.</p>';
  body += `<div class="row" style="margin-top:10px">`
    + `<button class="btn sm" data-act="focuscat" data-id="${c.id}">🔎 월드에서 보기</button>`
    + `<button class="btn sm" data-act="detail" data-id="${c.id}">🧬 유전자·가계도</button>`
    + `<button class="btn sm peach" data-act="gobreed" data-id="${c.id}" ${gr > 0 ? 'disabled' : ''}>💞 교배하기</button>`
    + `<button class="btn sm gray" data-act="sell" data-id="${c.id}">판매 ${sellPrice(c)}🐾</button></div>`
    + `<div class="hint" style="margin-top:6px">하루 수입 ${incomePerHour(c) * 24}🐾 · ${gr > 0 ? '성장 후 교배 가능' : cdLeft > 0 ? `교배 쿨다운 <span data-until="${c.lastBreedAt + PARAMS.breedCooldownMs}">${fmt(cdLeft)}</span>` : '교배 가능'}</div>`;
  return `<div class="box">${body}</div>`;
}

/* ───── 교배 ───── */
function candidateList(slot, src) {
  const need = slot === 'father' ? 'M' : 'F';
  const other = cat(slot === 'father' ? U.breed.mother : U.breed.father);
  const t = now();
  let list = [];
  if (src === 'mine') list = myCats();
  else if (src === 'shop') list = shopCats();
  else list = G.npcs.flatMap((n) => n.cats.map(cat));
  return list.filter((c) => c.sex === need).map((c) => {
    let reason = null;
    if (c.personality === null || c.personality === undefined) reason = '아기';
    else if (src !== 'shop' && t - c.lastBreedAt < PARAMS.breedCooldownMs) reason = '쿨다운';
    else if (other && isForbiddenPair(c, other)) reason = '근친';
    return { c, reason };
  });
}

function breedView() {
  const B = U.breed, f = cat(B.father), m = cat(B.mother);
  const slotHtml = (key, c, label) => `<button type="button" class="slot ${B.slot === key ? 'on' : ''}" data-act="slot" data-slot="${key}" aria-pressed="${B.slot === key}">
      <span class="hint">${label}</span>${c ? `<img src="${thumbnail(c, 110)}" alt=""><span>${c.name} ${badge(c)}</span><span class="hint">${srcLabel(c)}</span>` : '<span style="font-size:40px;margin-top:20px">＋</span>'}</button>`;
  let html = `<h2>💞 교배</h2><div class="sub">수컷 1 + 암컷 1. 새끼는 항상 1마리, 신청자(나)가 데려가요. 교배한 고양이는 24시간 쉬어요.</div>
    <div class="row" style="align-items:stretch">${slotHtml('father', f, '아빠(수컷)')}<div style="align-self:center;font-size:28px">💕</div>${slotHtml('mother', m, '엄마(암컷)')}</div>`;
  const msg = f && m ? checkBreed(f, m) : '아빠와 엄마를 골라 주세요';
  const cost = f && m ? breedCost(f, m) : 0;
  html += `<div class="${msg ? 'warn-msg' : 'ok-msg'}">${msg ?? '교배할 수 있어요! ' + (cost ? `(샵 비용 ${cost}🐾)` : '(무료)')}</div>
    <div class="row"><button class="btn peach" data-act="dobreed" ${msg ? 'disabled' : ''}>💞 교배하기</button>
    <button class="btn gray sm" data-act="clearbreed">비우기</button></div>`;
  html += `<h3>${B.slot === 'father' ? '아빠' : '엄마'} 고르기</h3><div class="row" style="margin-bottom:8px">`
    + [['mine', '🏠 내 고양이'], ['npc', '🏘️ 이웃'], ['shop', '🛍️ 동물샵']].map(([k, n]) => `<button class="chip ${B.src === k ? 'on' : ''}" data-act="src" data-src="${k}">${n}</button>`).join('') + '</div>';
  const list = candidateList(B.slot, B.src);
  html += '<div class="grid">' + list.map(({ c, reason }) => card(c, {
    dis: !!reason, sel: c.id === B[B.slot], attr: `data-act="pick" data-id="${c.id}"`,
    meta: reason ? `❌ ${reason}` : B.src === 'shop' ? `🐾 ${shopBreedPrice(c)}` : B.src === 'npc' ? '이웃의 고양이' : '',
  })).join('') + '</div>';
  if (!list.length) html += '<p class="sub">후보가 없어요.</p>';
  return html;
}
function srcLabel(c) {
  const s = sourceOf(c.id);
  if (s === 'mine') return '내 고양이';
  if (s === 'shop') return `동물샵 · ${shopBreedPrice(c)}🐾`;
  if (s?.startsWith('npc')) return G.npcs.find((n) => 'npc:' + n.id === s).name + '의 고양이';
  return '';
}

async function runBreed() {
  if (U.busy) return;
  const B = U.breed;
  const f = cat(B.father), m = cat(B.mother);
  const r = doBreed(B.father, B.mother);
  if (r.error) { toast(r.error); return; }
  sound.play('breed');
  U.busy = true; U.world.enabled = false; U.open = false;
  const ov = $('#breedOverlay');
  try {
    render(); ov.hidden = false;
    $('#skipBreed').focus({preventScroll:true});
    if (!U.stage) U.stage = new Stage($('#breedCanvas'));
    U.stage.resize();
    await U.stage.playBreed(f, m, r.kitten);
  } catch {
    U.stage?.clear();
    toast('연출을 표시하지 못했지만 새 가족은 우리집에 안전하게 도착했어요');
  } finally {
    ov.hidden = true; U.busy = false; U.world.enabled = true;
    backgroundInert(false);
  }
  B.father = null; B.mother = null; B.slot = 'father'; U.sel = r.kitten.id;
  U.tab = 'home'; U.open = true;
  render();
  showResult(r);
}
function render0() { $('#coins').textContent = G.coins.toLocaleString(); }

function showResult(r) {
  sound.play('birth');
  const k = r.kitten;
  openModal(`<h2>🎉 새 가족이 태어났어요!</h2>
    <div class="row" style="align-items:flex-start"><img src="${thumbnail(k, 220)}" style="width:200px;border-radius:20px;background:#fdeccd">
    <div style="flex:1"><div style="font-size:22px">${k.name} ${sexIcon(k)} ${badge(k)}</div>
    <div class="row" style="margin:6px 0">${tags(k)}</div><div class="hint">${desc(k)}</div>
    <div class="box" style="margin-top:10px">부: ${r.father.name} · 모: ${r.mother.name}<br>
    ${r.cost ? `비용 ${r.cost}🐾<br>` : ''}${r.reward ? `📖 새 도감 등록! +${r.reward}🐾` : '이미 도감에 있는 모습이에요'}</div>
    <div class="hint">🍼 앞으로 1시간 동안 돌봐 주면 성격이 정해져요.</div></div></div>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-act="goto" data-tab="home">우리집에서 돌보기</button><button class="btn gray" data-act="close">닫기</button></div>`);
}

/* ───── 도감 ───── */
function dexView() {
  const tot = dexTotals();
  const keys = Object.keys(G.dex);
  const nextMs = PARAMS.dexMilestoneEvery - (keys.length % PARAMS.dexMilestoneEvery);
  let entries = keys.map((k) => ({ k, c: cat(G.dex[k].catId) })).filter((e) => e.c);
  if (U.dexGrade >= 0) entries = entries.filter((e) => e.c.grade === U.dexGrade);
  if (U.dexGrade === 'S') entries = keys.map((k) => ({ k, c: cat(G.dex[k].catId) })).filter((e) => e.c && (e.c.special || e.c.fantasy));
  entries.sort((a, b) => G.dex[b.k].first - G.dex[a.k].first);
  const query = U.dexSearch.trim().toLocaleLowerCase();
  if (query) entries = entries.filter(e => `${e.c.name} ${desc(e.c)} ${gradeLabel(e.c)} ${PERSONALITIES[e.c.personality]?.name ?? '성장 중'}`.toLocaleLowerCase().includes(query));
  const shown = entries.slice(0, U.dexPage * 60);
  let html = `<h2>📖 도감</h2>
    <div class="box"><div style="font-size:20px">발견 <b>${tot.found}</b>종</div>
    <div class="hint">일반 ${tot.normal}종 · 스페셜 ${tot.special}/4 · 판타지 ${tot.fantasy}/4<br>설계상 가능한 일반 외형은 11,040종 이상 (tests.html에서 실측 검증) · ${nextMs}종 더 발견하면 보너스 ${PARAMS.dexMilestoneReward}🐾</div></div>
    <div class="row" style="margin-bottom:8px"><button class="chip ${U.dexGrade === -1 ? 'on' : ''}" data-act="dexg" data-g="-1">전체</button>`
    + GRADES.map((g, i) => `<button class="chip ${U.dexGrade === i ? 'on' : ''}" data-act="dexg" data-g="${i}">${g}</button>`).join('')
    + `<button class="chip ${U.dexGrade === 'S' ? 'on' : ''}" data-act="dexg" data-g="S">⭐스페셜·판타지</button></div><div class="grid">`;
  html = html.replace('<div class="grid">', `<label class="dex-search">🔎 도감 검색 <input id="dexSearch" type="search" maxlength="80" placeholder="이름, 털색, 무늬, 성격" value="${escapeHtml(U.dexSearch)}"></label><div class="hint" role="status">검색 결과 ${entries.length}종</div><div class="grid">`);
  html += shown.map((e) => card(e.c, { attr: `data-act="detail" data-id="${e.c.id}" data-view="1"`, meta: '' })).join('') + '</div>';
  if (shown.length < entries.length) html += `<div class="row" style="justify-content:center;margin-top:10px"><button class="btn sm" data-act="dexmore">더 보기</button></div>`;
  if (!entries.length) html += '<p class="sub">아직 이 분류의 고양이를 만나지 못했어요.</p>';
  return html;
}

/* ───── 동물샵 ───── */
function shopView() {
  const sc = shopCats();
  let html = `<h2>🛍️ 동물샵</h2><div class="sub">마음에 드는 고양이와 교배하면 (재화 지불) 그 고양이는 가게에서 사라지고 새 고양이가 들어와요. 새끼는 항상 1마리, 내가 데려가요.</div><p class="hint">다음 입고까지 <span data-until="${G.shopRefreshAt}">${fmt(Math.max(0, G.shopRefreshAt - now()))}</span> · 6시간마다 새 친구가 와요</p><div class="grid">`;
  html += sc.map((c) => card(c, { attr: `data-act="detail" data-id="${c.id}" data-view="1"`, meta: `🐾 ${shopBreedPrice(c)}${c.carriers ? ` · 🧬${c.carriers}` : ''}` })).join('') + '</div>';
  html += `<div class="hint" style="margin-top:6px">🧬 숫자 = 겉으로 안 드러나는 희귀 열성 유전자 보인자 수 (가격에 반영)</div>
    <h3>우리 고양이 팔기</h3><div class="grid">` + myCats().map((c) => card(c, { attr: `data-act="sell" data-id="${c.id}"`, meta: `팔기 ${sellPrice(c)}🐾` })).join('') + '</div>';
  return html;
}

/* ───── 이웃(NPC) ───── */
function npcView() {
  let html = `<h2>🏘️ 이웃</h2><div class="sub">프로토타입: 이웃(NPC)은 교환과 교배 신청을 언제나 수락해요. 횟수 제한 없음.</div>`;
  for (const n of (U.npc ? G.npcs.filter((x) => x.id === U.npc) : G.npcs)) {
    html += `<div class="box"><div style="font-size:18px">${n.icon} ${n.name}</div><div class="grid" style="margin-top:6px">`
      + n.cats.map(cat).map((c) => card(c, { attr: `data-act="detail" data-id="${c.id}" data-view="1"`, actions: `<button class="btn sm" data-act="trade" data-npc="${n.id}" data-id="${c.id}">교환</button> <button class="btn sm peach" data-act="npcbreed" data-id="${c.id}">교배신청</button>` })).join('')
      + '</div></div>';
  }
  return html;
}

/* ───── 모달 ───── */
let modalReturnFocus = null, pendingConfirm = null;
function backgroundInert(value) { for (const selector of ['#top','#tabs','#panel','#world','#watchingCat','#touchStick']) $(selector).inert = value; }
function openModal(html) {
  if ($('#modal').hidden) modalReturnFocus = document.activeElement;
  pendingConfirm = null;
  U.clearStick?.(); U.world.keys = {}; U.world.target = null; $('#touchStick').hidden = true;
  const m = $('#modal'); m.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" tabindex="-1">${html}</div>`; m.hidden = false; U.world.enabled = false;
  const dialog = m.querySelector('.dialog'), heading = dialog.querySelector('h2');
  if (heading) { heading.id = 'dialogTitle'; dialog.setAttribute('aria-labelledby',heading.id); }
  backgroundInert(true);
  dialog.focus({preventScroll:true});
}
function closeModal() {
  if ($('#modal').hidden) return;
  $('#modal').hidden = true; $('#modal').innerHTML = ''; pendingConfirm = null;
  backgroundInert(U.busy);
  if (!U.busy) U.world.enabled = true;
  $('#touchStick').hidden = U.open || U.busy;
  if (modalReturnFocus?.isConnected && modalReturnFocus.matches('button,a[href],input,select,textarea,[tabindex]') && !modalReturnFocus.closest('[hidden],[inert]') && !modalReturnFocus.disabled) modalReturnFocus.focus({preventScroll:true});
  else document.querySelector(`#tabs [data-tab="${U.tab}"]`)?.focus({preventScroll:true});
  modalReturnFocus = null;
}
function confirmDialog(title, message, action) {
  openModal(`<h2>${escapeHtml(title)}</h2><p class="confirm-message" id="confirmDescription">${escapeHtml(message)}</p><div class="row" style="justify-content:flex-end"><button class="btn gray" data-act="close">취소</button><button class="btn peach" data-act="confirm">확인</button></div>`);
  $('#modal .dialog').setAttribute('aria-describedby','confirmDescription');
  pendingConfirm = action;
}
function updateSoundButtons() {
  const button=$('#btnSound');button.textContent=sound.enabled?'🔊':'🔇';
  button.setAttribute('aria-pressed',String(sound.enabled));
  button.setAttribute('aria-label',sound.enabled?'소리 끄기':'소리 켜기');button.title=button.getAttribute('aria-label');
  const toggle=$('#audioToggle');
  if(toggle){toggle.textContent=sound.enabled?'🔇 소리 끄기':'🔊 소리 켜기';toggle.setAttribute('aria-pressed',String(sound.enabled));}
}
async function toggleSound() {
  const buttons=[$('#btnSound'),$('#audioToggle')].filter(Boolean);buttons.forEach(b=>b.disabled=true);
  try {await sound.setEnabled(!sound.enabled);updateSoundButtons();}
  catch(error){toast(error.message);}
  finally{buttons.forEach(b=>b.disabled=false);}
}
function showAudioSettings() {
  openModal(`<h2>🎵 소리 설정</h2><p class="hint">음량은 이 브라우저에 기억해요. 게임을 다시 열면 소리는 직접 켜 주세요.</p>
    ${[['music','배경음악'],['effects','효과음']].map(([key,label])=>`<label class="volume-control" for="${key}Volume">${label} <output id="${key}VolumeValue" for="${key}Volume">${Math.round(sound.volumes[key]*100)}%</output><input id="${key}Volume" data-volume="${key}" type="range" min="0" max="100" step="1" value="${Math.round(sound.volumes[key]*100)}"></label>`).join('')}
    <p class="hint">0%로 내리면 해당 소리만 꺼져요.</p><div class="row"><button class="btn gray" id="audioToggle" data-act="audioToggle"></button><button class="btn" data-act="close">닫기</button></div>`);
  updateSoundButtons();
}

const REC = { B: ['b', 'bl'], D: ['d'], A: ['a'], T: ['m'], S: ['s'], C: ['cb', 'cs'], L: ['l'], I: ['i'], O: ['o'] };
const LOCI_KO = { B: '갈색(B)', D: '희석(D)', A: '아구티(A)', T: '태비(T)', S: '흰반점(S)', C: '색소제한(C)', L: '털길이(L)', I: '실버(I)', O: '오렌지(X^O)', P1: '농도1', P2: '농도2', P3: '농도3' };
function geneRow(c, loc, show) {
  const al = c.genome[loc];
  const html = al.map((a) => `<span class="allele ${REC[loc]?.includes(a) ? 'rec' : ''}">${show ? a : '?'}</span>`).join('');
  return `<tr><td>${LOCI_KO[loc]}</td><td>${html}</td></tr>`;
}
function pedNode(id, depth) {
  const c = id ? cat(id) : null;
  if (!c) return `<div class="c"><div style="font-size:30px;margin-top:10px">?</div><div>알 수 없음</div></div>`;
  const inner = depth > 1 && (c.fatherId || c.motherId)
    ? `<div class="pcol" style="flex-direction:row;gap:4px;margin-top:4px">${pedNode(c.fatherId, depth - 1)}${pedNode(c.motherId, depth - 1)}</div>` : '';
  return `<div class="c"><img src="${thumbnail(c, 70)}"><div>${c.name} ${sexIcon(c)}</div>${inner}</div>`;
}
function showDetail(id, viewOnly) {
  const c = cat(id), owned = sourceOf(id) === 'mine';
  const ph = c.ph;
  const bars = [['whisker', '수염 길이'], ['ear', '귀 크기'], ['face', '얼굴 둥글기'], ['bulk', '체형(뚱냥)']]
    .map(([k, n]) => `<div class="row" style="gap:6px"><span style="width:90px;font-size:13px">${n}</span><div class="bar" style="flex:1;height:12px"><i style="width:${Math.round(c.body[k] * 100)}%"></i></div></div>`).join('');
  const feats = [`털색 ${ph.colors.map((x) => COLOR_KO[x]).join('+')}`, ph.tyr !== 'full' ? `색소제한 ${TYR_KO[ph.tyr]}` : '풀컬러',
    ph.pattern === 'solid' ? '단색' : ph.tabbyType === 'mackerel' ? '고등어태비' : '클래식태비', ph.white === 'none' ? '흰반점 없음' : ph.white === 'bicolor' ? '바이컬러' : '하이화이트',
    ph.long ? '장모' : '단모', ph.silver ? '실버/스모크' : '실버 없음', `농도 ${ph.density + 1}/5`, ph.tortie ? '🐱 Barr body 패치(암컷)' : ''].filter(Boolean);
  openModal(`<h2>${c.name} ${sexIcon(c)} ${badge(c)} ${personalityChip(c)}</h2>
    <div class="row" style="align-items:flex-start"><img src="${thumbnail(c, 220)}" style="width:190px;border-radius:20px;background:#fdeccd">
    <div style="flex:1"><div class="row">${tags(c)}</div><div class="hint">${desc(c)}</div>
      <div style="margin-top:6px">${feats.map((f) => `<span class="chip">${f}</span>`).join('')}</div>
      <div style="margin-top:8px">${bars}</div></div></div>
    <h3>가계도 (부·모 / 조부모)</h3>
    <div class="ped">${pedNode(c.fatherId, 2)}${pedNode(c.motherId, 2)}</div>
    <h3>🧬 유전자형 ${owned ? '' : '<small class="hint">(내 고양이만 확인할 수 있어요)</small>'}</h3>
    <table class="g">${['B', 'D', 'A', 'T', 'S', 'C', 'L', 'I', 'O', 'P1', 'P2', 'P3'].map((l) => geneRow(c, l, owned)).join('')}</table>
    <div class="hint" style="margin-top:6px">붉은 칸 = 열성 대립유전자(숨어 있을 수 있어요). 겉모습이 같아도 자손에게 다른 모습이 나올 수 있어요. 숨은 희귀 보인자 ${c.carriers}개.</div>
    <div class="row" style="justify-content:flex-end;margin-top:12px">${owned && !viewOnly ? '' : ''}<button class="btn gray" data-act="close">닫기</button></div>`);
}

/* ───── 이벤트 ───── */
function gotoTab(t) { if (U.open && U.tab === t) { closePanel(); return; } openPanel(t); }
function onClick(e) {
  const dev = e.target.closest('[data-dev]');
  if (dev) {
    const v = dev.dataset.dev;
    if (U.busy) return;
    if (v === '1h') skipTime(3600e3); else if (v === '1d') skipTime(86400e3); else {
      confirmDialog('새 게임 시작', '저장 데이터를 교체하고 새 게임을 시작할까요? 먼저 진행을 백업해 주세요.', () => {
        reset(); U.sel = myCats()[0].id; U.breed = { father: null, mother: null, slot: 'father', src: 'mine' };
        stageKey = ''; afterTick(); render();
      });
      return;
    }
    stageKey = ''; afterTick(); render(); return;
  }
  const tb = e.target.closest('#tabs button');
  if (tb) { if (!U.busy && $('#modal').hidden) gotoTab(tb.dataset.tab); return; }
  const el = e.target.closest('[data-act]');
  if (!el) { if (e.target.id === 'modal') closeModal(); return; }
  if (U.busy) return;
  const d = el.dataset, B = U.breed;
  switch (d.act) {
    case 'audioSettings': showAudioSettings(); break;
    case 'audioToggle': toggleSound(); break;
    case 'confirm': { const action = pendingConfirm; closeModal(); action?.(); break; }
    case 'focuscat': U.world.focusCat(d.id); closePanel(); break;
    case 'dailycare': {
      const r = careDaily(d.id, d.a);
      if (r.ok) { fx(r.fx); sound.play(d.a); U.world.react(d.id, d.a); } else toast(r.msg);
      render(); break;
    }
    case 'backup': {
      const url = URL.createObjectURL(new Blob([exportSave()], { type: 'application/json' }));
      const date = new Date(), stamp = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      const a = document.createElement('a'); a.href = url; a.download = `냥냥하우스-${stamp}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); break;
    }
    case 'restore': $('#saveFile').click(); break;
    case 'closepanel': closePanel(); break;
    case 'select': U.sel = d.id; render(); break;
    case 'care': {
      const r = care(d.id, d.a);
      if (!r.ok) toast(r.msg); else { fx(r.fx, 5); sound.play(d.a); U.world.react(d.id, d.a); }
      render(); break; }
    case 'detail': e.stopPropagation(); showDetail(d.id, !!d.view); break;
    case 'close': closeModal(); break;
    case 'goto': closeModal(); gotoTab(d.tab); break;
    case 'sell': {
      const c = cat(d.id);
      confirmDialog('고양이 판매', `${c.name}을(를) ${sellPrice(c)}🐾에 판매할까요? (되돌릴 수 없어요)`, () => {
        const p = sell(d.id);
        if (p === null) { toast('지금은 판매할 수 없는 고양이예요'); return; }
        toast(`🐾 ${p}에 판매했어요`);
        if (U.sel === d.id) U.sel = myCats()[0]?.id ?? null;
        if (B.father === d.id) B.father = null; if (B.mother === d.id) B.mother = null;
        stageKey = ''; render();
      }); break; }
    case 'gobreed': { const c = cat(d.id); B[c.sex === 'M' ? 'father' : 'mother'] = c.id; B.slot = c.sex === 'M' ? 'mother' : 'father'; B.src = 'mine'; gotoTab('breed'); break; }
    case 'slot': B.slot = d.slot; render(); break;
    case 'src': B.src = d.src; render(); break;
    case 'pick': {
      const c = cat(d.id);
      if (el.classList.contains('dis')) { toast('지금은 고를 수 없어요'); break; }
      B[B.slot] = c.id; B.slot = B.slot === 'father' ? 'mother' : 'father'; render(); break; }
    case 'clearbreed': B.father = null; B.mother = null; B.slot = 'father'; render(); break;
    case 'dobreed': runBreed(); break;
    case 'dexg': U.dexGrade = d.g === 'S' ? 'S' : +d.g; U.dexPage = 1; render(); break;
    case 'dexmore': U.dexPage++; render(); break;
    case 'trade': e.stopPropagation(); openTrade(d.npc, d.id); break;
    case 'dotrade': { if (trade(d.my, d.npc, d.id)) { toast('교환 완료! 이웃이 기뻐해요 🎁'); closeModal(); U.sel = d.id; stageKey = ''; render(); } break; }
    case 'npcbreed': {
      e.stopPropagation();
      const c = cat(d.id);
      B[c.sex === 'M' ? 'father' : 'mother'] = c.id; B.slot = c.sex === 'M' ? 'mother' : 'father'; B.src = 'mine';
      toast('💌 교배 신청을 보냈어요! 이웃이 수락했어요 (프로토타입)'); gotoTab('breed'); break; }
  }
}

function openTrade(npcId, npcCatId) {
  const n = G.npcs.find((x) => x.id === npcId), c = cat(npcCatId);
  openModal(`<h2>🎁 ${n.name}와 교환</h2><div class="sub">${c.name}과(와) 바꿀 내 고양이를 고르세요. 이웃은 무조건 수락해요.</div>
    <div class="grid">${myCats().map((m) => card(m, { attr: `data-act="dotrade" data-my="${m.id}" data-npc="${npcId}" data-id="${npcCatId}"`, meta: '이 아이와 교환' })).join('')}</div>
    <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn gray" data-act="close">닫기</button></div>`);
}

/* ───── 초당 갱신 ───── */
function afterTick() {
  const done = tick();
  for (const c of done) toast(`${c.emoji ?? ''}${c.name}의 성격은 "${PERSONALITIES[c.personality].name}"!`);
  return done.length > 0;
}
function everySecond() {
  if (U.busy) return;
  const shopRefreshAt = G.shopRefreshAt;
  const changed = afterTick();
  updateClock();
  $('#incomeAmt').textContent = '+' + pendingIncome().toLocaleString();
  const t = now();
  const litter = litterState(myCats(), t);
  U.world.syncLitter(litter);
  if ($('#litterStatus')) $('#litterStatus').textContent = litterSummary(litter);
  document.querySelectorAll('[data-cat-activity]').forEach(el => { el.textContent = '🐾 ' + U.world.activityOf(el.dataset.catActivity); });
  const watchedId = $('#watchingCat').dataset.id;
  if (watchedId && cat(watchedId)) $('#watchingLabel').textContent = `${cat(watchedId).name} 관찰 중 · ${U.world.activityOf(watchedId)}`;
  if (changed || shopRefreshAt !== G.shopRefreshAt) { stageKey = ''; render(); return; }
  document.querySelectorAll('[data-until]').forEach((el) => {
    const left = +el.dataset.until - t;
    if (left <= 0) { render(); return; }
    el.textContent = fmt(left);
  });
  document.querySelectorAll('button[data-cdun]').forEach((b) => { if (b.disabled && +b.dataset.cdun <= t) render(); });
}

void canBreed; void save; void stageKey;
