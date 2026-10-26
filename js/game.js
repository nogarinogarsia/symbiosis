// 게임 상태·규칙: 보유 고양이, 동물샵, NPC 이웃(교환·교배 신청 목업), 도감, 재화
import { createFounder, breed, canBreed, refreshCat, sellPrice, shopBreedPrice, incomePerHour, SPECIALS, FANTASY } from './engine.js';
import { PARAMS } from './params.js';
import { randomSeedString } from './rng.js';
import { applyCare, finalizePersonality } from './personality.js';
import { validateSave } from './save-data.js';
import { dailyCare } from './wellbeing.js';

const KEY = 'catgene-save-v1';
export const G = {
  coins: 0, incomeRemainder: 0, penLevel: 1, cats: {}, mine: [], shop: [], npcs: [], dex: {}, lastCollect: 0, shopRefreshAt: 0, offset: 0, seq: 0, log: [],
};
export let saveError = '';
export let loadIssue = null;

export const now = () => Date.now() + G.offset;
const uid = () => randomSeedString();

const NPC_DEF = [
  { id: 'n1', name: '밤토리', icon: '🌰' }, { id: 'n2', name: '하늘이', icon: '☁️' }, { id: 'n3', name: '복순이', icon: '🍑' },
  { id: 'n4', name: '달고나', icon: '🍬' }, { id: 'n5', name: '미루', icon: '🎀' },
];

function addCat(cat) { G.cats[cat.id] = cat; return cat; }
function makeFounder(prefix, opts = {}) {
  const c = createFounder(`${prefix}-${uid()}`, { birthTime: now() - 2 * PARAMS.growthWindowMs, ...opts });
  return addCat(c);
}

export function newGame() {
  G.offset = 0;
  Object.assign(G, { coins: PARAMS.startCoins, incomeRemainder: 0, penLevel: 1, cats: {}, mine: [], shop: [], npcs: [], dex: {}, lastCollect: now(), shopRefreshAt: now() + PARAMS.shopRefreshMs, seq: 0, log: [] });
  // 시작 고양이 4마리 (수컷2·암컷2, 12좌위 개체군에서 새로 생성)
  for (const sex of ['M', 'F', 'M', 'F']) { const c = makeFounder('start', { sex, specialChance: 0 }); G.mine.push(c.id); registerDex(c, true); }
  refillShop();
  for (const n of NPC_DEF) G.npcs.push({ ...n, cats: [0, 1, 2].map((i) => makeFounder('npc' + n.id, { sex: i === 0 ? 'M' : i === 1 ? 'F' : undefined }).id) });
  save();
}

export function refillShop() {
  G.shop = G.shop.filter((id) => G.cats[id]);
  while (G.shop.length < PARAMS.shopSize) G.shop.push(makeFounder('shop').id);
}
export function refreshShop(t = now()) {
  if (!G.shopRefreshAt) { G.shopRefreshAt = t + PARAMS.shopRefreshMs; return false; }
  if (t < G.shopRefreshAt) return false;
  G.shop = [];
  refillShop();
  G.shopRefreshAt = t + PARAMS.shopRefreshMs;
  save();
  return true;
}

export function save() {
  if (loadIssue) { saveError = '기존 저장을 보호하고 있어요. 복구 화면에서 진행 방법을 선택해 주세요.'; return false; }
  try { localStorage.setItem(KEY, exportSave()); saveError = ''; return true; }
  catch { saveError = '저장 공간에 기록하지 못했어요. 진행 백업을 내려받아 주세요.'; return false; }
}
export function exportSave() { return JSON.stringify({ ...G, version: 1, savedAt: Date.now() }, null, 2); }
export function importSave(raw) {
  const data = validateSave(JSON.parse(raw));
  const cats = Object.fromEntries(Object.entries(data.cats).map(([id, c]) => [id, refreshCat({ ...c, lastBreedAt: c.lastBreedAt ?? -1e15 })]));
  // Commit only after parsing, validation, and phenotype rebuilding all succeed.
  Object.assign(G, { coins: data.coins, incomeRemainder: data.incomeRemainder ?? 0, penLevel: data.penLevel ?? 1, cats, mine: data.mine, shop: data.shop, npcs: data.npcs,
    dex: data.dex, lastCollect: data.lastCollect, shopRefreshAt: Number.isFinite(data.shopRefreshAt) ? data.shopRefreshAt : Date.now() + data.offset + PARAMS.shopRefreshMs, offset: data.offset, seq: data.seq ?? 0, log: Array.isArray(data.log) ? data.log : [] });
  loadIssue = null;
  return save();
}
export function load() {
  let raw = null;
  loadIssue = null;
  try {
    raw = localStorage.getItem(KEY);
    if (raw === null) return false;
    importSave(raw);
    return true;
  } catch {
    loadIssue = { raw, message: raw === null ? '브라우저 저장 공간을 읽지 못했어요.' : '기존 저장 파일을 읽지 못했어요. 원본을 덮어쓰지 않고 보호하고 있습니다.' };
    return false;
  }
}
export function reset() { loadIssue = null; try { localStorage.removeItem(KEY); } catch { /* */ } newGame(); }

export const cat = (id) => G.cats[id];
export const myCats = () => G.mine.map(cat).filter(Boolean);
export const shopCats = () => G.shop.map(cat).filter(Boolean);

export function penStatus() {
  const current=PARAMS.penLevels[G.penLevel-1],next=PARAMS.penLevels[G.penLevel]??null;
  return {level:G.penLevel,capacity:current.capacity,count:G.mine.length,over:Math.max(0,G.mine.length-current.capacity),next};
}
export function upgradePen(expectedLevel=G.penLevel) {
  const status=penStatus();
  if(expectedLevel!==G.penLevel)return {ok:false,msg:'우리 레벨이 바뀌었어요. 다시 확인해 주세요'};
  if(!status.next)return {ok:false,msg:'이미 가장 넓은 우리예요'};
  if(G.coins<status.next.cost)return {ok:false,msg:`재화가 부족해요 (필요 ${status.next.cost}, 부족 ${status.next.cost-G.coins})`};
  G.coins-=status.next.cost;G.penLevel++;save();
  return {ok:true,...penStatus(),cost:status.next.cost};
}

/* 도감 */
export function dexTotals() {
  const keys = Object.keys(G.dex);
  return { found: keys.length, normal: keys.filter((k) => !k.startsWith('special:') && !k.startsWith('fantasy:')).length,
    special: keys.filter((k) => k.startsWith('special:')).length, fantasy: keys.filter((k) => k.startsWith('fantasy:')).length };
}
export function registerDex(c, silent = false) {
  if (G.dex[c.catalogId]) return 0;
  const before = Object.keys(G.dex).length;
  G.dex[c.catalogId] = { first: now(), catId: c.id };
  let reward = c.grade === 'SPECIAL' ? PARAMS.dexRewardSpecial : PARAMS.dexRewardByGrade[c.grade];
  if (c.fantasy) reward += 500;
  const after = before + 1;
  if (after % PARAMS.dexMilestoneEvery === 0) reward += PARAMS.dexMilestoneReward;
  if (!silent) G.coins += reward; else G.coins += 0;
  return silent ? 0 : reward;
}

/* 수입 */
function incomeTotal(t) {
  let sum = G.incomeRemainder;
  for (const c of myCats()) {
    const hours = Math.min(PARAMS.incomeCapHours, Math.max(0, (t - Math.max(c.birthTime, c.incomeSince ?? c.birthTime, G.lastCollect)) / 3600e3));
    sum += incomePerHour(c) * hours;
  }
  return sum;
}
// Normalize only floating-point noise near whole-coin boundaries.
const wholeIncome = total => Math.floor(total + Number.EPSILON * Math.max(1, total) * 4);
export function pendingIncome() { return wholeIncome(incomeTotal(now())); }
export function collectIncome() {
  const t = now(), total = incomeTotal(t), n = wholeIncome(total);
  G.incomeRemainder = Math.max(0, total - n);
  G.coins += n; G.lastCollect = t; save();
  return n;
}

/* 시간 / 성격 확정 */
export function tick() {
  const t = now(), done = [];
  refreshShop(t);
  for (const c of myCats()) if (finalizePersonality(c, t)) done.push(c);
  if (done.length) save();
  return done;
}
export function skipTime(ms) { G.offset += ms; save(); }

export function care(id, actionId) {
  if (!G.mine.includes(id)) return { ok: false, msg: '내 고양이만 돌볼 수 있어요' };
  const c = cat(id);
  const r = applyCare(c, actionId, now());
  if (r.ok) { dailyCare(c, actionId, now()); save(); }
  return r;
}
export function careDaily(id, action) {
  if (!G.mine.includes(id)) return { ok: false, msg: '내 고양이만 돌볼 수 있어요' };
  const r = dailyCare(cat(id), action, now());
  if (r.ok) save();
  return r;
}

/* 판매 */
export function sell(id) {
  const c = cat(id);
  if (!c || !G.mine.includes(id)) return null;
  collectIncome();
  const price = sellPrice(c);
  G.coins += price; G.mine = G.mine.filter((x) => x !== id);
  save();
  return price;
}

/* NPC 교환: 모든 교환 수락, 횟수 제한 없음 (프로토타입) */
export function trade(myId, npcId, npcCatId) {
  if(penStatus().over)return false;
  const npc = G.npcs.find((n) => n.id === npcId);
  if (!npc || !G.mine.includes(myId) || !npc.cats.includes(npcCatId)) return false;
  collectIncome();
  cat(npcCatId).incomeSince = now();
  G.mine = G.mine.filter((x) => x !== myId); G.mine.push(npcCatId);
  npc.cats = npc.cats.filter((x) => x !== npcCatId); npc.cats.push(myId);
  registerDex(cat(npcCatId));
  save();
  return true;
}

/* 교배 상대 목록: 내 고양이 / 이웃 NPC 고양이 / 동물샵 */
export function sourceOf(id) {
  if (G.mine.includes(id)) return 'mine';
  if (G.shop.includes(id)) return 'shop';
  const n = G.npcs.find((n) => n.cats.includes(id));
  return n ? 'npc:' + n.id : null;
}

export function breedCost(a, b) {
  let cost = 0;
  for (const c of [a, b]) if (sourceOf(c.id) === 'shop') cost += shopBreedPrice(c);
  return cost;
}

export function checkBreed(father, mother) {
  if(penStatus().over)return `우리 정원보다 ${penStatus().over}마리 많아요. 동물샵에서 판매하거나 우리를 확장해 주세요`;
  if (!father || !mother || !sourceOf(father.id) || !sourceOf(mother.id)) return '현재 교배할 수 있는 고양이를 골라 주세요';
  const msg = canBreed(father, mother, now());
  if (msg) return msg;
  const owned = [father, mother].filter((c) => sourceOf(c.id) === 'mine').length;
  if (owned === 0) return '내 고양이가 한 마리는 있어야 해요';
  const shopCount = [father, mother].filter((c) => sourceOf(c.id) === 'shop').length;
  if (shopCount === 2) return '샵 고양이끼리는 교배할 수 없어요';
  const cost = breedCost(father, mother);
  if (cost > G.coins) return `재화가 부족해요 (필요 ${cost})`;
  return null;
}

/* 교배 실행: 새끼 1마리는 항상 신청자(나)가 가져감. 샵 개체는 사라지고 새 개체 입고 */
export function doBreed(fatherId, motherId) {
  const f = cat(fatherId), m = cat(motherId);
  const err = checkBreed(f, m);
  if (err) return { error: err };
  const cost = breedCost(f, m);
  const kitten = breed(f, m, 'k-' + uid(), now());
  addCat(kitten);
  G.coins -= cost;
  const t = now();
  for (const p of [f, m]) {
    const src = sourceOf(p.id);
    if (src === 'shop') { G.shop = G.shop.filter((x) => x !== p.id); } else p.lastBreedAt = t;
  }
  G.mine.push(kitten.id);
  const reward = registerDex(kitten);
  refillShop();
  save();
  return { kitten, cost, reward, father: f, mother: m };
}

export { SPECIALS, FANTASY };
