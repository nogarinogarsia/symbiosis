import { Stage, thumbnail } from './stage.js';
import { G, now, cat, myCats, shopCats, tick, care, sell, trade, doBreed, checkBreed, breedCost, sourceOf, collectIncome,
  pendingIncome, skipTime, reset, dexTotals, save } from './game.js';
import { phenotypeName, gradeLabel, sellPrice, shopBreedPrice, incomePerHour, canBreed, SPECIALS, FANTASY, COSTUMES, COLOR_KO, TYR_KO, isForbiddenPair } from './engine.js';
import { PERSONALITIES, CARE_ACTIONS, careCooldown, growthRemaining } from './personality.js';
import { GRADES, GRADE_COLORS, PARAMS } from './params.js';

const $ = (s) => document.querySelector(s);
const U = { tab: 'home', sel: null, breed: { father: null, mother: null, slot: 'father', src: 'mine' }, stage: null, dexPage: 1, dexGrade: -1, busy: false };
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
function card(c, { sel = false, dis = false, meta = '', attr = '' } = {}) {
  return `<div class="card ${sel ? 'sel' : ''} ${dis ? 'dis' : ''}" ${attr}>
    <img src="${thumbnail(c, 130)}" alt=""><div class="nm">${c.name} ${sexIcon(c)}</div>
    <div>${badge(c)}</div><div class="meta">${meta}</div></div>`;
}
const desc = (c) => (c.special ? `${SPECIALS[c.special]} · ` : '') + (c.fantasy ? `${FANTASY[c.fantasy]} · ` : '') + phenotypeName(c.ph);

/* ───── 렌더 ───── */
export function init() {
  U.stage = new Stage($('#stage'));
  document.addEventListener('click', onClick);
  $('#btnIncome').onclick = () => { const n = collectIncome(); toast(n > 0 ? `🐾 ${n} 재화를 받았어요!` : '아직 받을 수입이 없어요'); render(); };
  if (!U.sel || !cat(U.sel)) U.sel = myCats()[0]?.id ?? null;
  setInterval(everySecond, 1000);
  render();
}

export function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === U.tab));
  $('#coins').textContent = G.coins.toLocaleString();
  $('#incomeAmt').textContent = '+' + pendingIncome().toLocaleString();
  updateClock();
  const P = $('#panel');
  const scroll = P.scrollTop;
  P.innerHTML = { home: homeView, breed: breedView, dex: dexView, shop: shopView, npc: npcView }[U.tab]();
  P.scrollTop = scroll;
  updateStage();
}

function updateClock() {
  const d = new Date(now());
  $('#clock').textContent = `🕒 ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

let stageKey = '';
function updateStage() {
  if (U.busy) return;
  const hud = $('#stageHud');
  if (U.tab === 'breed') {
    const f = cat(U.breed.father), m = cat(U.breed.mother);
    const k = `pair|${f?.id}|${m?.id}|${f?.personality}|${m?.personality}`;
    if (k !== stageKey) { U.stage.showPair(f, m); stageKey = k; }
    hud.innerHTML = '';
    return;
  }
  const c = cat(U.sel);
  if (!c) { U.stage.clear(); hud.innerHTML = ''; stageKey = ''; return; }
  const k = `one|${c.id}|${c.personality}|${c.costume}`;
  if (k !== stageKey) { U.stage.showCat(c); stageKey = k; }
  hud.innerHTML = `<div class="hudcard">${c.name} ${sexIcon(c)} ${badge(c)}<small>${desc(c)}</small></div>`;
}

/* ───── 우리집 ───── */
function homeView() {
  const cats = myCats().slice().reverse();
  const c = cat(U.sel);
  const t = now();
  let html = `<h2>🏠 우리집 <small class="hint">고양이 ${cats.length}마리 · 하루 수입 ${Math.round(cats.reduce((s, x) => s + incomePerHour(x) * 24, 0))}</small></h2>`;
  if (c) html += detailBox(c, t);
  html += `<h3>우리 고양이들</h3><div class="grid">` + cats.map((x) => {
    const gr = growthRemaining(x, t);
    return card(x, { sel: x.id === U.sel, attr: `data-act="select" data-id="${x.id}"`, meta: gr > 0 ? `🍼 <span data-until="${x.birthTime + PARAMS.growthWindowMs}">${fmt(gr)}</span>` : `${PERSONALITIES[x.personality].emoji} ${PERSONALITIES[x.personality].name}` });
  }).join('') + '</div>';
  if (!cats.length) html += '<p class="sub">고양이가 없어요. 동물샵이나 이웃에게서 교배로 가족을 늘려 보세요!</p>';
  return html;
}

function detailBox(c, t) {
  const gr = growthRemaining(c, t);
  let body = `<div class="row" style="margin-bottom:6px">${badge(c)}${personalityChip(c)}${tags(c)}</div>
    <div class="hint" style="margin-bottom:8px">${desc(c)}</div>`;
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
  body += `<div class="row" style="margin-top:10px">`
    + `<button class="btn sm" data-act="detail" data-id="${c.id}">🧬 유전자·가계도</button>`
    + `<button class="btn sm peach" data-act="gobreed" data-id="${c.id}">💞 교배하기</button>`
    + `<button class="btn sm gray" data-act="sell" data-id="${c.id}">판매 ${sellPrice(c)}🐾</button></div>`
    + `<div class="hint" style="margin-top:6px">하루 수입 ${incomePerHour(c) * 24}🐾 · ${cdLeft > 0 ? `교배 쿨다운 <span data-until="${c.lastBreedAt + PARAMS.breedCooldownMs}">${fmt(cdLeft)}</span>` : '교배 가능'}</div>`;
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
  const slotHtml = (key, c, label) => `<div class="slot ${B.slot === key ? 'on' : ''}" data-act="slot" data-slot="${key}">
      <div class="hint">${label}</div>${c ? `<img src="${thumbnail(c, 110)}"><div>${c.name} ${badge(c)}</div><div class="hint">${srcLabel(c)}</div>` : '<div style="font-size:40px;margin-top:20px">＋</div>'}</div>`;
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
  const B = U.breed;
  const f = cat(B.father), m = cat(B.mother);
  const r = doBreed(B.father, B.mother);
  if (r.error) { toast(r.error); return; }
  U.busy = true; render0();
  await U.stage.playBreed(f, m, r.kitten);
  U.busy = false; stageKey = '';
  B.father = null; B.mother = null; B.slot = 'father'; U.sel = r.kitten.id;
  render();
  showResult(r);
}
function render0() { $('#coins').textContent = G.coins.toLocaleString(); }

function showResult(r) {
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
  const shown = entries.slice(0, U.dexPage * 60);
  let html = `<h2>📖 도감</h2>
    <div class="box"><div style="font-size:20px">발견 <b>${tot.found}</b>종</div>
    <div class="hint">일반 ${tot.normal}종 · 스페셜 ${tot.special}/4 · 판타지 ${tot.fantasy}/4<br>설계상 가능한 일반 외형은 11,040종 이상 (tests.html에서 실측 검증) · ${nextMs}종 더 발견하면 보너스 ${PARAMS.dexMilestoneReward}🐾</div></div>
    <div class="row" style="margin-bottom:8px"><button class="chip ${U.dexGrade === -1 ? 'on' : ''}" data-act="dexg" data-g="-1">전체</button>`
    + GRADES.map((g, i) => `<button class="chip ${U.dexGrade === i ? 'on' : ''}" data-act="dexg" data-g="${i}">${g}</button>`).join('')
    + `<button class="chip ${U.dexGrade === 'S' ? 'on' : ''}" data-act="dexg" data-g="S">⭐스페셜·판타지</button></div><div class="grid">`;
  html += shown.map((e) => card(e.c, { attr: `data-act="detail" data-id="${e.c.id}" data-view="1"`, meta: '' })).join('') + '</div>';
  if (shown.length < entries.length) html += `<div class="row" style="justify-content:center;margin-top:10px"><button class="btn sm" data-act="dexmore">더 보기</button></div>`;
  if (!entries.length) html += '<p class="sub">아직 이 분류의 고양이를 만나지 못했어요.</p>';
  return html;
}

/* ───── 동물샵 ───── */
function shopView() {
  const sc = shopCats();
  let html = `<h2>🛍️ 동물샵</h2><div class="sub">마음에 드는 고양이와 교배하면 (재화 지불) 그 고양이는 가게에서 사라지고 새 고양이가 들어와요. 새끼는 항상 1마리, 내가 데려가요.</div><div class="grid">`;
  html += sc.map((c) => card(c, { attr: `data-act="detail" data-id="${c.id}" data-view="1"`, meta: `🐾 ${shopBreedPrice(c)}${c.carriers ? ` · 🧬${c.carriers}` : ''}` })).join('') + '</div>';
  html += `<div class="hint" style="margin-top:6px">🧬 숫자 = 겉으로 안 드러나는 희귀 열성 유전자 보인자 수 (가격에 반영)</div>
    <h3>우리 고양이 팔기</h3><div class="grid">` + myCats().map((c) => card(c, { attr: `data-act="sell" data-id="${c.id}"`, meta: `팔기 ${sellPrice(c)}🐾` })).join('') + '</div>';
  return html;
}

/* ───── 이웃(NPC) ───── */
function npcView() {
  let html = `<h2>🏘️ 이웃</h2><div class="sub">프로토타입: 이웃(NPC)은 교환과 교배 신청을 언제나 수락해요. 횟수 제한 없음.</div>`;
  for (const n of G.npcs) {
    html += `<div class="box"><div style="font-size:18px">${n.icon} ${n.name}</div><div class="grid" style="margin-top:6px">`
      + n.cats.map(cat).map((c) => card(c, { attr: `data-act="detail" data-id="${c.id}" data-view="1"`, meta: `<button class="btn sm" data-act="trade" data-npc="${n.id}" data-id="${c.id}">교환</button> <button class="btn sm peach" data-act="npcbreed" data-id="${c.id}">교배신청</button>` })).join('')
      + '</div></div>';
  }
  return html;
}

/* ───── 모달 ───── */
function openModal(html) { const m = $('#modal'); m.innerHTML = `<div class="dialog">${html}</div>`; m.hidden = false; }
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }

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
function gotoTab(t) { U.tab = t; render(); }
function onClick(e) {
  const dev = e.target.closest('[data-dev]');
  if (dev) {
    const v = dev.dataset.dev;
    if (v === '1h') skipTime(3600e3); else if (v === '1d') skipTime(86400e3); else if (confirm('저장 데이터를 지우고 새 게임을 시작할까요?')) { reset(); U.sel = myCats()[0].id; U.breed = { father: null, mother: null, slot: 'father', src: 'mine' }; }
    stageKey = ''; afterTick(); render(); return;
  }
  const tb = e.target.closest('#tabs button');
  if (tb) { gotoTab(tb.dataset.tab); return; }
  const el = e.target.closest('[data-act]');
  if (!el) { if (e.target.id === 'modal') closeModal(); return; }
  if (U.busy) return;
  const d = el.dataset, B = U.breed;
  switch (d.act) {
    case 'select': U.sel = d.id; render(); break;
    case 'care': {
      const r = care(d.id, d.a);
      if (!r.ok) toast(r.msg); else fx(r.fx, 5);
      render(); break; }
    case 'detail': e.stopPropagation(); showDetail(d.id, !!d.view); break;
    case 'close': closeModal(); break;
    case 'goto': closeModal(); gotoTab(d.tab); break;
    case 'sell': {
      const c = cat(d.id);
      if (confirm(`${c.name}을(를) ${sellPrice(c)}🐾에 판매할까요? (되돌릴 수 없어요)`)) {
        const p = sell(d.id); toast(`🐾 ${p}에 판매했어요`);
        if (U.sel === d.id) U.sel = myCats()[0]?.id ?? null;
        if (B.father === d.id) B.father = null; if (B.mother === d.id) B.mother = null;
        stageKey = ''; render();
      } break; }
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
  const changed = afterTick();
  updateClock();
  $('#incomeAmt').textContent = '+' + pendingIncome().toLocaleString();
  const t = now();
  if (changed) { stageKey = ''; render(); return; }
  document.querySelectorAll('[data-until]').forEach((el) => {
    const left = +el.dataset.until - t;
    if (left <= 0) { render(); return; }
    el.textContent = fmt(left);
  });
  document.querySelectorAll('button[data-cdun]').forEach((b) => { if (b.disabled && +b.dataset.cdun <= t) render(); });
}

void canBreed; void save;
