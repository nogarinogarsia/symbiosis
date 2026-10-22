// 도감 유효성 검사: 유전자형 클래스를 전수 열거 → 표현형 서명 / 렌더 서명 중복 제거
import { phenotype, phenotypeName, rarityScore, gradeOfScore, SPECIALS, FANTASY } from './engine.js';
import { resolveAppearance } from './appearance.js';
import { PARAMS } from './params.js';

const EU = [['B', 'B'], ['b', 'b'], ['bl', 'bl']];
const D = [['D', 'D'], ['d', 'd']];
const OC = [['orange', ['O']], ['none', ['o', 'o']], ['tortie', ['O', 'o']]]; // 수컷 O / 암컷 o/o / 암컷 O/o
const A = [['A', 'A'], ['a', 'a']];
const T = [['M', 'M'], ['m', 'm']];
const C = [['C', 'C'], ['cb', 'cb'], ['cs', 'cs'], ['cb', 'cs']];
const S = [['s', 's'], ['S', 's'], ['S', 'S']];
const L = [['L', 'L'], ['l', 'l']];
const I = [['i', 'i'], ['I', 'i']];
const PSUM = [1, 2, 3, 4, 5]; // 합계 → 농도 0~4 각각 대표

function polyFromSum(sum) {
  const arr = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < sum; i++) arr[i] = 1;
  return { P1: [arr[0], arr[1]], P2: [arr[2], arr[3]], P3: [arr[4], arr[5]] };
}

export function enumerateCatalog() {
  const sigs = new Map();     // 표현형 서명 → 대표 정보
  const renders = new Set();  // 렌더 서명
  let genomeClasses = 0;
  for (const B of EU) for (const d of D) for (const [, o] of OC) for (const a of A) for (const t of T)
    for (const c of C) for (const s of S) for (const l of L) for (const i of I) for (const ps of PSUM) {
      genomeClasses++;
      const genome = { B, D: d, A: a, T: t, C: c, S: s, L: l, I: i, O: o, ...polyFromSum(ps) };
      const ph = phenotype(genome);
      if (!sigs.has(ph.sig)) {
        const score = rarityScore(ph);
        sigs.set(ph.sig, { name: phenotypeName(ph), grade: gradeOfScore(score), score });
        const app = resolveAppearance({ ph, seed: 'catalog', special: null, fantasy: null });
        renders.add(app.renderSig);
      }
    }
  return {
    genomeClasses,
    theoreticalProduct: 3 * 2 * 3 * 2 * 2 * 4 * 3 * 2 * 2 * 5, // 독립 가정 곱 (17,280)
    distinctPhenotypes: sigs.size,         // 도감 ID(표현형 서명) 수
    distinctRenders: renders.size,         // 렌더 결과(색 양자화 포함) 구별 수
    special: Object.keys(SPECIALS).length,
    fantasy: Object.keys(FANTASY).length,
    sigs,
  };
}

export function gradeHistogram(sigs) {
  const h = new Array(7).fill(0);
  for (const v of sigs.values()) h[v.grade]++;
  return h;
}
void PARAMS;
