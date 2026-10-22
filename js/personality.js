// 성격 형성: 탄생 후 1시간(실시간)의 돌봄 행동 점수 → 소프트맥스 확률 추첨. 유전 아님 [확정]
import { RNG } from './rng.js';
import { PARAMS } from './params.js';

export const PERSONALITIES = [
  { id: 0, name: '활발함', desc: '에너지가 넘치고 활동적', act: '자주 뛰어다니고 장난침', emoji: '⚡' },
  { id: 1, name: '소심함', desc: '겁이 많고 경계심이 강함', act: '낯선 고양이를 피하고 숨음', emoji: '🫣' },
  { id: 2, name: '애교쟁이', desc: '친화적이고 관심을 좋아함', act: '다른 고양이에게 다가가고 비빔', emoji: '💗' },
  { id: 3, name: '도도함', desc: '독립적이고 자기주장이 강함', act: '혼자 있는 시간을 즐김', emoji: '👑' },
  { id: 4, name: '호기심쟁이', desc: '새로운 환경과 물건에 관심이 많음', act: '주변을 탐색하고 물건을 건드림', emoji: '🔍' },
  { id: 5, name: '느긋함', desc: '차분하고 여유로움', act: '자주 눕거나 낮잠을 잠', emoji: '😴' },
  { id: 6, name: '장난꾸러기', desc: '짓궂고 예측하기 어려움', act: '다른 고양이를 놀라게 하거나 방해함', emoji: '😈' },
  { id: 7, name: '예민함', desc: '작은 자극에도 민감하게 반응', act: '소리나 움직임에 빠르게 반응함', emoji: '❗' },
];

//                 활발 소심 애교 도도 호기심 느긋 장난 예민
export const CARE_ACTIONS = [
  { id: 'yarn', name: '털실로 놀아주기', icon: '🧶', cd: 120e3, w: [2, 0, 1, 0, 1, 0, 2, 0], fx: '🧶' },
  { id: 'pet', name: '쓰다듬기', icon: '🤲', cd: 120e3, w: [0, 0, 2, -1, 0, 1, 0, 0], fx: '💗' },
  { id: 'feed', name: '먹이 주기', icon: '🐟', cd: 300e3, w: [0, 0, 1, 0, 0, 2, 0, 0], fx: '🐟' },
  { id: 'novel', name: '새 물건 보여주기', icon: '🎁', cd: 300e3, w: [0, -1, 0, 0, 2, 0, 1, 1], fx: '✨' },
  { id: 'quiet', name: '가만히 두기', icon: '🌙', cd: 300e3, w: [0, 1, 0, 2, 0, 1, 0, 1], fx: '💤' },
];
const SLOT = 300e3;            // 방치 판정 5분 슬롯
const IDLE_BONUS = 0.5;        // 빈 슬롯당 소심·도도·느긋 +0.5
const TEMPERATURE = 2.5;
const OVERSTIM = 14;           // 과잉 자극(행동 14회 초과) → 예민 +3

export function ensureCare(cat) {
  if (!cat.care) cat.care = { scores: new Array(8).fill(0), last: {}, log: [] };
  if (!cat.care.log) cat.care.log = [];
  return cat.care;
}

export function growthRemaining(cat, now) {
  if (cat.personality !== null && cat.personality !== undefined) return 0;
  return Math.max(0, cat.birthTime + PARAMS.growthWindowMs - now);
}

export function careCooldown(cat, actionId, now) {
  const a = CARE_ACTIONS.find((x) => x.id === actionId);
  const last = ensureCare(cat).last[actionId] ?? -1e15;
  return Math.max(0, last + a.cd - now);
}

export function applyCare(cat, actionId, now) {
  if (cat.personality !== null && cat.personality !== undefined) return { ok: false, msg: '성격이 이미 정해졌어요' };
  if (growthRemaining(cat, now) <= 0) return { ok: false, msg: '성장 시간이 끝났어요' };
  const a = CARE_ACTIONS.find((x) => x.id === actionId);
  const care = ensureCare(cat);
  const cd = careCooldown(cat, actionId, now);
  if (cd > 0) return { ok: false, msg: `아직 쉬는 중이에요 (${Math.ceil(cd / 1000)}초)` };
  care.last[actionId] = now;
  care.log.push(now);
  a.w.forEach((v, i) => { care.scores[i] += v; });
  return { ok: true, fx: a.fx };
}

export function personalityOdds(cat) {
  const care = ensureCare(cat);
  const scores = care.scores.slice();
  const slotsWithAction = new Set(care.log.map((t) => Math.floor((t - cat.birthTime) / SLOT))).size;
  const idle = Math.max(0, Math.round(PARAMS.growthWindowMs / SLOT) - slotsWithAction);
  for (const i of [1, 3, 5]) scores[i] += idle * IDLE_BONUS;
  if (care.log.length > OVERSTIM) scores[7] += 3;
  const ex = scores.map((s) => Math.exp(s / TEMPERATURE));
  const sum = ex.reduce((a, b) => a + b, 0);
  return ex.map((v) => v / sum);
}

/* 1시간이 지난 아기의 성격을 확정. 확정되면 true */
export function finalizePersonality(cat, now) {
  if (cat.personality !== null && cat.personality !== undefined) return false;
  if (growthRemaining(cat, now) > 0) return false;
  const odds = personalityOdds(cat);
  cat.personality = new RNG(cat.seed + ':personality').weighted(odds);
  return true;
}
