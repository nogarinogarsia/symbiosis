import { RNG } from './rng.js';
import { AUTOSOMAL, POLY, FREQ, drawAllele } from './genes.js';
import { PARAMS, GRADES } from './params.js';

/* ───────── 표현형 ───────── */
const EU_RANK = { B: 0, b: 1, bl: 2 };
const EU_NAME = ['black', 'chocolate', 'cinnamon'];
const DILUTE_NAME = ['blue', 'lilac', 'fawn'];
export const COLOR_KO = {
  black: '블랙', blue: '블루', chocolate: '초콜릿', lilac: '라일락',
  cinnamon: '시나몬', fawn: '폰', orange: '오렌지', cream: '크림',
};
export const TYR_KO = { full: '', point: '포인트', sepia: '세피아', mink: '밍크' };
export const SPECIALS = {
  sphynx: '스핑크스', manx: '맨스크', curl: '아메리칸 컬', singapura: '싱가푸라',
};
export const FANTASY = {
  mint: '네온 민트', galaxy: '은하 보라', holo: '홀로그램 핑크', aurora: '오로라 블루',
};

export function densityLevel(genome) {
  const sum = POLY.reduce((s, k) => s + genome[k][0] + genome[k][1], 0); // 0~6
  if (sum <= 1) return 0;
  if (sum >= 5) return 4;
  return sum - 1; // 2→1, 3→2, 4→3
}

export function phenotype(genome) {
  const eu = EU_NAME[Math.min(EU_RANK[genome.B[0]], EU_RANK[genome.B[1]])];
  const euIdx = EU_NAME.indexOf(eu);
  const dilute = genome.D[0] === 'd' && genome.D[1] === 'd';
  const euColor = dilute ? DILUTE_NAME[euIdx] : eu;
  const O = genome.O;
  const nO = O.filter((x) => x === 'O').length;
  // 토티는 XX O/o 에서만 가능 (Barr body = X 불활성화 모자이크)
  const orangeKind = nO === O.length ? 'orange' : nO === 0 ? 'none' : 'tortie';
  const orangeColor = dilute ? 'cream' : 'orange';
  let family, colors;
  if (orangeKind === 'orange') { family = orangeColor; colors = [orangeColor]; }
  else if (orangeKind === 'tortie') { family = `${euColor}+${orangeColor}`; colors = [euColor, orangeColor]; }
  else { family = euColor; colors = [euColor]; }
  const aGood = genome.A.includes('A');
  const tabbyType = genome.T.includes('M') ? 'mackerel' : 'classic';
  // 오렌지는 A와 무관하게 태비가 보임. 토티: 오렌지 패치는 항상 태비, 어두운 패치는 A_일 때만
  let pattern;
  if (orangeKind === 'orange') pattern = tabbyType;
  else if (orangeKind === 'none') pattern = aGood ? tabbyType : 'solid';
  else pattern = aGood ? tabbyType : `solid-dark/${tabbyType}-orange`;
  const sCount = genome.S.filter((x) => x === 'S').length;
  const white = ['none', 'bicolor', 'high'][sCount];
  const [c1, c2] = genome.C;
  let tyr;
  if (c1 === 'C' || c2 === 'C') tyr = 'full';
  else if (c1 === 'cs' && c2 === 'cs') tyr = 'point';
  else if (c1 === 'cb' && c2 === 'cb') tyr = 'sepia';
  else tyr = 'mink';
  const long = genome.L[0] === 'l' && genome.L[1] === 'l';
  const silver = genome.I.includes('I');
  const density = densityLevel(genome);
  const calico = orangeKind === 'tortie' && white !== 'none';
  const sig = [family, tyr, pattern, white, long ? 'long' : 'short', silver ? 'silver' : 'plain', 'd' + density].join('|');
  return {
    euColor, family, colors, orangeKind, tortie: orangeKind === 'tortie', calico, pattern, tabbyType,
    darkTabby: aGood, white, tyr, long, silver, density, sig,
  };
}

export function phenotypeName(p) {
  const colorKo = p.colors.map((c) => COLOR_KO[c]).join('+');
  const parts = [];
  if (p.calico) parts.push('삼색');
  else if (p.tortie) parts.push('토티');
  parts.push(colorKo);
  if (p.tyr !== 'full') parts.push(TYR_KO[p.tyr]);
  if (p.silver) parts.push('실버');
  if (p.pattern !== 'solid') parts.push(p.tabbyType === 'mackerel' ? '고등어태비' : '클래식태비');
  if (p.white === 'bicolor') parts.push('바이컬러');
  if (p.white === 'high' && !p.calico) parts.push('하이화이트');
  if (p.long) parts.push('장모');
  return parts.join(' ');
}

/* 숨은 열성 보인자 수 (가격 반영) */
export function hiddenCarrierCount(genome) {
  let n = 0;
  const [b1, b2] = genome.B;
  if (b1 === 'B' || b2 === 'B') n += (b1 !== 'B' ? 1 : 0) + (b2 !== 'B' ? 1 : 0);
  else if (b1 !== b2) n += 1; // b/bl → bl 숨음
  if (genome.D[0] !== genome.D[1]) n++;
  if (genome.L[0] !== genome.L[1]) n++;
  if (genome.A[0] !== genome.A[1]) n++;
  const c = genome.C;
  if (c.includes('C')) n += c.filter((x) => x !== 'C').length;
  return n;
}

/* ───────── 희귀도 (점수 → 창업 풀 분위수로 등급 캘리브레이션) ───────── */
export function rarityScore(p) {
  let s = 0;
  if (p.euColor === 'chocolate' || p.euColor === 'lilac') s += 1;
  if (p.euColor === 'cinnamon' || p.euColor === 'fawn') s += 2;
  if (p.colors.some((c) => c === 'blue' || c === 'lilac' || c === 'fawn' || c === 'cream')) s += 1;
  if (p.tortie) s += 2;
  if (p.calico) s += 2;
  if (p.pattern.includes('classic')) s += 1;
  if (p.long) s += 1;
  if (p.white === 'bicolor') s += 1;
  if (p.white === 'high') s += 2;
  if (p.tyr === 'sepia') s += 2;
  if (p.tyr === 'point') s += 3;
  if (p.tyr === 'mink') s += 3;
  if (p.silver) s += 2;
  if (p.density === 0 || p.density === 4) s += 1;
  return s;
}

let _thresholds = null;
export function gradeThresholds() {
  if (_thresholds) return _thresholds;
  const rng = new RNG('calibration-v1');
  const scores = [];
  for (let i = 0; i < 30000; i++) {
    const sex = rng.chance(0.5) ? 'M' : 'F';
    scores.push(rarityScore(phenotype(randomGenome(rng, sex))));
  }
  scores.sort((a, b) => a - b);
  let cum = 0;
  const cuts = [];
  for (let g = 0; g < 6; g++) {
    cum += PARAMS.gradeTargets[g];
    cuts.push(scores[Math.min(scores.length - 1, Math.floor(cum * scores.length))]);
  }
  _thresholds = cuts; // 점수 <= cuts[g] → 등급 g
  return cuts;
}
export function gradeOfScore(score) {
  const cuts = gradeThresholds();
  for (let g = 0; g < 6; g++) if (score <= cuts[g]) return g;
  return 6;
}

/* ───────── 개체 생성 ───────── */
export function randomGenome(rng, sex) {
  const g = {};
  for (const loc of Object.keys(AUTOSOMAL)) g[loc] = [drawAllele(rng, FREQ[loc]), drawAllele(rng, FREQ[loc])];
  g.O = sex === 'F' ? [drawAllele(rng, FREQ.O), drawAllele(rng, FREQ.O)] : [drawAllele(rng, FREQ.O)];
  for (const k of POLY) g[k] = [rng.chance(0.5) ? 1 : 0, rng.chance(0.5) ? 1 : 0];
  return g;
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const BODY_KEYS = ['whisker', 'ear', 'face', 'bulk']; // 수염 길이·귀 크기·얼굴 둥글기·체형(뚱냥)

function finalizeCat(base) {
  const p = phenotype(base.genome);
  const score = rarityScore(p);
  const baseGrade = gradeOfScore(score);
  const cat = { ...base, ph: p, score, baseGrade };
  cat.grade = cat.special ? 'SPECIAL' : baseGrade;
  cat.catalogId = cat.special ? `special:${cat.special}` : cat.fantasy ? `fantasy:${cat.fantasy}` : p.sig;
  cat.carriers = hiddenCarrierCount(cat.genome);
  return cat;
}
export function refreshCat(cat) { return finalizeCat(cat); }

export function gradeLabel(cat) { return cat.grade === 'SPECIAL' ? 'SPECIAL' : GRADES[cat.grade]; }

const NAMES = ['모찌', '두부', '호두', '콩이', '보리', '쌀이', '김치', '치즈', '라떼', '구름', '별이', '달이', '밤이', '자두', '망고', '레몬', '푸딩', '쿠키', '마루', '나비', '하루', '솜이', '밍밍', '초코', '복실', '찹쌀', '고구마', '유자', '도토리', '미소'];
export function randomName(rng) { return rng.pick(NAMES); }

let _idCounter = 1;
export function newId() { return 'c' + Date.now().toString(36) + (_idCounter++).toString(36); }

/* 창업 개체 (시작·샵·NPC) */
export function createFounder(seed, opts = {}) {
  const rng = new RNG(seed);
  const sex = opts.sex ?? (rng.chance(0.5) ? 'M' : 'F');
  const genome = randomGenome(rng, sex);
  const body = {};
  for (const k of BODY_KEYS) body[k] = clamp01(0.5 + rng.gauss() * 0.2);
  let special = null;
  if (rng.chance(opts.specialChance ?? PARAMS.specialChance * 0.5)) special = rng.pick(Object.keys(SPECIALS));
  const base = {
    id: newId(), name: randomName(rng), sex, genome, body, special, fantasy: null, costume: null,
    fatherId: null, motherId: null, seed: String(seed), birthTime: opts.birthTime ?? 0,
    personality: opts.personality ?? rng.int(8), lastBreedAt: -1e15,
  };
  return finalizeCat(base);
}

/* ───────── 근친 규칙 ───────── */
// 금지: 부모↔자식, 형제자매(동복·이복 포함). 사촌·삼촌/이모↔조카·조부모↔손자는 허용.
export function isForbiddenPair(a, b) {
  if (a.id === b.id) return '자기 자신과는 교배할 수 없어요';
  if (a.fatherId === b.id || a.motherId === b.id || b.fatherId === a.id || b.motherId === a.id)
    return '부모와 자식은 교배할 수 없어요';
  if ((a.fatherId && a.fatherId === b.fatherId) || (a.motherId && a.motherId === b.motherId))
    return '형제자매는 교배할 수 없어요';
  return null;
}

export function canBreed(father, mother, now) {
  if (!father || !mother) return '부모를 선택하세요';
  if (father.sex !== 'M' || mother.sex !== 'F') return '수컷 1마리와 암컷 1마리가 필요해요';
  const bad = isForbiddenPair(father, mother);
  if (bad) return bad;
  for (const c of [father, mother]) {
    if (c.personality === null) return `${c.name}은(는) 아직 아기라서 성장이 끝나야 해요 (1시간)`;
    if (now - c.lastBreedAt < PARAMS.breedCooldownMs) return `${c.name}은(는) 쿨다운 중이에요`;
  }
  return null;
}

/* ───────── 교배 ───────── */
function pickOne(rng, pair) { return pair[rng.int(2)]; }

export const COSTUMES = [
  { id: 'chef', name: '요리사' }, { id: 'wizard', name: '마법사' }, { id: 'crown', name: '왕관' },
  { id: 'captain', name: '선장' }, { id: 'detective', name: '탐정' }, { id: 'santa', name: '산타' },
  { id: 'hanbok', name: '한복' }, { id: 'astronaut', name: '우주비행사' }, { id: 'strawberry', name: '딸기 모자' },
  { id: 'raincoat', name: '노란 우비' },
];

export function breed(father, mother, seed, now = 0) {
  const rng = new RNG(seed);
  const genome = {};
  for (const loc of [...Object.keys(AUTOSOMAL), ...POLY]) {
    genome[loc] = [pickOne(rng, father.genome[loc]), pickOne(rng, mother.genome[loc])];
  }
  // 성별은 아비의 생식세포(X/Y)가 결정. 오렌지는 X연관
  const sex = rng.chance(0.5) ? 'M' : 'F';
  const momX = pickOne(rng, mother.genome.O);
  genome.O = sex === 'F' ? [father.genome.O[0], momX] : [momX];
  const body = {};
  for (const k of BODY_KEYS) {
    const mid = (father.body[k] + mother.body[k]) / 2;
    const spread = Math.abs(father.body[k] - mother.body[k]) / 2;
    body[k] = clamp01(mid + (rng.next() - 0.5) * 2 * spread * 0.6 + rng.gauss() * PARAMS.bodyMutationSigma);
  }
  const special = rng.chance(PARAMS.specialChance) ? rng.pick(Object.keys(SPECIALS)) : null; // 비유전
  let cat = finalizeCat({
    id: newId(), name: randomName(rng), sex, genome, body, special, fantasy: null, costume: null,
    fatherId: father.id, motherId: mother.id, seed: String(seed), birthTime: now,
    personality: null, lastBreedAt: -1e15, care: { scores: new Array(8).fill(0), last: {}, count: 0 },
  });
  if (!special && cat.baseGrade === 6 && rng.chance(PARAMS.fantasyChanceOnMythical)) {
    cat.fantasy = rng.pick(Object.keys(FANTASY));
    cat = finalizeCat(cat);
  }
  // 의상: 일반 등급이 같은 부모(둘 다 SPECIAL 아님)일 때만. 유전 엔진과 독립 RNG
  const cr = new RNG(seed + ':costume');
  if (father.grade !== 'SPECIAL' && mother.grade !== 'SPECIAL' && father.grade === mother.grade
      && cr.chance(PARAMS.costumeChanceByGrade[father.grade])) {
    cat.costume = cr.pick(COSTUMES).id;
  }
  return cat;
}

/* 가격 */
export function sellPrice(cat) {
  let base = cat.grade === 'SPECIAL' ? PARAMS.sellSpecial : PARAMS.sellPriceByGrade[cat.grade];
  if (cat.fantasy) base *= PARAMS.fantasyPriceMult;
  if (cat.costume) base *= 1.3;
  base *= 1 + PARAMS.carrierBonusRate * cat.carriers;
  return Math.round(base);
}
export function shopBreedPrice(cat) { return Math.round(sellPrice(cat) * PARAMS.shopBreedMult); }
export function incomePerHour(cat) {
  return cat.grade === 'SPECIAL' ? PARAMS.incomeSpecialPerHour : PARAMS.incomePerHourByGrade[cat.grade] * (cat.fantasy ? 2 : 1);
}
