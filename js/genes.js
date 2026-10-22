// 유전자좌 12개: 상염색체 8 + X연관 O + 다유전자 P1~P3
export const AUTOSOMAL = {
  B: ['B', 'b', 'bl'],   // B > b > bl  (블랙/초콜릿/시나몬)
  D: ['D', 'd'],         // d/d 희석
  A: ['A', 'a'],         // A_ 태비 발현, a/a 비-아구티
  T: ['M', 'm'],         // 게임용: M_ 고등어, m/m 클래식
  S: ['S', 's'],         // 흰 반점 (공우성): ss/Ss/SS
  C: ['C', 'cb', 'cs'],  // C > cb >= cs, cb/cs 밍크
  L: ['L', 'l'],         // l/l 장모
  I: ['I', 'i'],         // I_ 실버/스모크
};
export const POLY = ['P1', 'P2', 'P3'];
export const LOCI = ['B', 'D', 'A', 'T', 'S', 'C', 'L', 'I', 'O', 'P1', 'P2', 'P3'];

// 창업(시작/샵) 개체군 대립유전자 빈도 [제안]
export const FREQ = {
  B: { B: 0.70, b: 0.20, bl: 0.10 },
  D: { D: 0.70, d: 0.30 },
  A: { A: 0.60, a: 0.40 },
  T: { M: 0.60, m: 0.40 },
  S: { S: 0.28, s: 0.72 },
  C: { C: 0.80, cb: 0.10, cs: 0.10 },
  L: { L: 0.70, l: 0.30 },
  I: { I: 0.12, i: 0.88 },
  O: { O: 0.25, o: 0.75 },
};

export function drawAllele(rng, table) {
  let r = rng.next();
  const keys = Object.keys(table);
  for (const k of keys) { r -= table[k]; if (r < 0) return k; }
  return keys[keys.length - 1];
}
