import { RNG } from './rng.js';
import { createFounder, breed, refreshCat, isForbiddenPair, canBreed, gradeThresholds, phenotype } from './engine.js';
import { enumerateCatalog, gradeHistogram } from './catalog.js';
import { PARAMS, GRADES } from './params.js';

const out = document.getElementById('out');
const results = [];
function log(html, cls = '') { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; out.appendChild(d); }
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  log(`${ok ? '✅' : '❌'} ${name} <small>${detail}</small>`, ok ? 'ok' : 'bad');
}
const near = (v, t, tol) => Math.abs(v - t) <= tol;

function parents(over = {}, fOver = {}, mOver = {}) {
  const f = createFounder('F' + JSON.stringify(over) + JSON.stringify(fOver), { sex: 'M', specialChance: 0 });
  const m = createFounder('M' + JSON.stringify(over) + JSON.stringify(mOver), { sex: 'F', specialChance: 0 });
  Object.assign(f.genome, over, fOver); Object.assign(m.genome, over, mOver);
  return [refreshCat(f), refreshCat(m)];
}
function sample(f, m, n, tag) {
  const kids = [];
  for (let i = 0; i < n; i++) kids.push(breed(f, m, `${tag}-${i}`, 0));
  return kids;
}
const frac = (kids, pred) => kids.filter(pred).length / kids.length;

const N = 20000;
// 1. 멘델 1:2:1 (Dd × Dd)
{
  const [f, m] = parents({ D: ['D', 'd'] });
  const k = sample(f, m, N, 'mendel');
  const dd = frac(k, (c) => c.genome.D.join('') === 'dd');
  const hh = frac(k, (c) => c.genome.D.join('') === 'DD');
  const he = frac(k, (c) => c.genome.D[0] !== c.genome.D[1]);
  check('Dd×Dd → DD:Dd:dd = 1:2:1', near(dd, 0.25, 0.012) && near(hh, 0.25, 0.012) && near(he, 0.5, 0.015),
    `DD ${(hh * 100).toFixed(1)}% / Dd ${(he * 100).toFixed(1)}% / dd ${(dd * 100).toFixed(1)}%`);
}
// 2. 장모 Ll × Ll
{
  const [f, m] = parents({ L: ['L', 'l'] });
  const k = sample(f, m, N, 'long');
  const p = frac(k, (c) => c.ph.long);
  check('Ll×Ll → 장모 25%', near(p, 0.25, 0.012), `${(p * 100).toFixed(1)}%`);
}
// 3. X연관 오렌지
{
  const [f, m] = parents({}, { O: ['o'] }, { O: ['O', 'o'] });
  const k = sample(f, m, N, 'xo1');
  const sons = k.filter((c) => c.sex === 'M'), daus = k.filter((c) => c.sex === 'F');
  const sonO = frac(sons, (c) => c.genome.O[0] === 'O');
  const dauT = frac(daus, (c) => c.ph.tortie);
  check('X연관: 어미 O/o × 아비 o → 아들 오렌지 50%', near(sonO, 0.5, 0.02), `${(sonO * 100).toFixed(1)}%`);
  check('X연관: 어미 O/o × 아비 o → 딸 토티 50%', near(dauT, 0.5, 0.02), `${(dauT * 100).toFixed(1)}%`);
  check('성별 비율 ≈ 50:50', near(sons.length / k.length, 0.5, 0.015), `${(sons.length / k.length * 100).toFixed(1)}% 수컷`);
}
{
  const [f, m] = parents({}, { O: ['O'] }, { O: ['o', 'o'] });
  const k = sample(f, m, 4000, 'xo2');
  const sonsNon = k.filter((c) => c.sex === 'M').every((c) => c.genome.O[0] === 'o');
  const dausTortie = k.filter((c) => c.sex === 'F').every((c) => c.ph.tortie);
  check('X연관: 어미 o/o × 아비 O → 아들 전원 비오렌지, 딸 전원 토티', sonsNon && dausTortie);
}
// 4. 밍크
{
  const [f, m] = parents({}, { C: ['cb', 'cb'] }, { C: ['cs', 'cs'] });
  const k = sample(f, m, 2000, 'mink');
  check('cb/cb × cs/cs → 자손 전원 cb/cs 밍크', k.every((c) => c.ph.tyr === 'mink'));
}
// 5. 토티는 암컷만 (랜덤 풀 50000)
{
  const rng = new RNG('tortie-pool');
  let maleTortie = 0, fem = 0, femTortie = 0;
  for (let i = 0; i < 30000; i++) {
    const c = createFounder('t' + i, { specialChance: 0 });
    if (c.sex === 'M' && c.ph.tortie) maleTortie++;
    if (c.sex === 'F') { fem++; if (c.ph.tortie) femTortie++; }
  }
  const p = 0.25, expect = 2 * p * (1 - p);
  check('수컷 토티 0마리', maleTortie === 0, `${maleTortie}`);
  check('암컷 토티 비율 ≈ 2p(1-p)=0.375', near(femTortie / fem, expect, 0.015), `${(femTortie / fem * 100).toFixed(1)}%`);
  void rng;
}
// 6. 재현성
{
  const [f, m] = parents({ D: ['D', 'd'] });
  const a = breed(f, m, 'same-seed', 0), b = breed(f, m, 'same-seed', 0);
  check('같은 seed → 같은 자손 유전자형', JSON.stringify(a.genome) === JSON.stringify(b.genome) && a.sex === b.sex);
}
// 7. 근친 규칙
{
  const [f, m] = parents({});
  const kid = breed(f, m, 'inb1', 0), kid2 = breed(f, m, 'inb2', 0);
  const [f2] = parents({}, { A: ['A', 'a'] });
  const half = { ...f2, id: 'half', fatherId: f.id, motherId: 'other' };
  const grand = { ...f2, id: 'grand', fatherId: kid.id, motherId: 'x' };
  const uncleKid = { ...f2, id: 'cous', fatherId: 'y', motherId: 'z' };
  check('부모↔자식 불가', !!isForbiddenPair(f, kid) && !!isForbiddenPair(kid, m));
  check('형제자매 불가', !!isForbiddenPair(kid, kid2));
  check('이복형제 불가', !!isForbiddenPair(kid, half));
  check('조부모↔손자 가능', !isForbiddenPair(f, grand));
  check('무관한 개체 가능', !isForbiddenPair(kid, uncleKid));
  const nowBad = canBreed(f, m, 1e12);
  check('쿨다운 없을 때 교배 가능(성별 일치)', nowBad === null || nowBad === undefined, String(nowBad));
  const cd = { ...f, lastBreedAt: 1e12 };
  check('쿨다운 24h 중 교배 불가', !!canBreed(cd, m, 1e12 + 3600e3));
  check('쿨다운 24h 이후 가능', canBreed(cd, m, 1e12 + 25 * 3600e3) === null);
}
// 8. SPECIAL: 확률 ≈ 0.5%, 부모가 스페셜이어도 영향 없음
{
  const [f, m] = parents({});
  const normal = sample(f, m, 100000, 'sp');
  const f2 = refreshCat({ ...f, special: 'sphynx' }), m2 = refreshCat({ ...m, special: 'manx' });
  const fromSpecial = sample(f2, m2, 100000, 'sp2');
  const r1 = frac(normal, (c) => !!c.special), r2 = frac(fromSpecial, (c) => !!c.special);
  check(`SPECIAL ≈ ${(PARAMS.specialChance * 100).toFixed(1)}% (일반 부모)`, near(r1, PARAMS.specialChance, 0.0015), `${(r1 * 100).toFixed(2)}%`);
  check('SPECIAL 부모에서도 확률 동일(비유전)', near(r2, PARAMS.specialChance, 0.0015), `${(r2 * 100).toFixed(2)}%`);
  check('SPECIAL 종류 4종 모두 출현', new Set(normal.filter((c) => c.special).map((c) => c.special)).size === 4);
}
// 9. 의상: 같은 등급만
{
  const [f, m] = parents({});
  let diff = 0, same = 0, sameN = 0;
  for (let g = 0; g < 7; g++) {
    const fa = { ...f, grade: g }, mo = { ...m, grade: g };
    const k = sample(fa, mo, 6000, 'cg' + g);
    const r = frac(k, (c) => !!c.costume);
    same += r; sameN++;
    check(`의상 확률: 같은 ${GRADES[g]} 부모 ≈ ${(PARAMS.costumeChanceByGrade[g] * 100)}%`, near(r, PARAMS.costumeChanceByGrade[g], 0.012), `${(r * 100).toFixed(2)}%`);
    const mo2 = { ...m, grade: (g + 1) % 7 };
    diff += sample(fa, mo2, 1500, 'cd' + g).filter((c) => c.costume).length;
  }
  check('서로 다른 등급 부모 → 의상 0건', diff === 0, `${diff}건`);
  void same; void sameN;
}
// 10. 판타지색: 미시컬에서만
{
  const rng = new RNG('fantasy');
  let violation = 0, fantasyCount = 0, mythical = 0;
  let pool = [];
  for (let i = 0; i < 400; i++) pool.push(createFounder('fp' + i, { specialChance: 0 }));
  const males = pool.filter((c) => c.sex === 'M'), fems = pool.filter((c) => c.sex === 'F');
  for (let i = 0; i < 60000; i++) {
    const f = rng.pick(males), m = rng.pick(fems);
    const k = breed(f, m, 'fk' + i, 0);
    if (k.baseGrade === 6) mythical++;
    if (k.fantasy) { fantasyCount++; if (k.baseGrade !== 6) violation++; }
  }
  check('판타지색은 미시컬 개체에서만 출현', violation === 0, `미시컬 ${mythical}마리 중 판타지 ${fantasyCount}마리`);
}
// 11. 도감: 1,000종 이상
const cat = enumerateCatalog();
{
  const h = gradeHistogram(cat.sigs);
  log(`<b>도감 검증</b>: 유전자형 클래스 ${cat.genomeClasses.toLocaleString()}개 → 표현형 서명(도감 ID) <b>${cat.distinctPhenotypes.toLocaleString()}</b>종 / 육안 구분 가능한 렌더(색 양자화 기준) <b>${cat.distinctRenders.toLocaleString()}</b>종 + SPECIAL ${cat.special}종 + 판타지 ${cat.fantasy}종<br>
  설계상 독립 곱 ${cat.theoreticalProduct.toLocaleString()} → 상호작용(오렌지 태비·토티 등)으로 합쳐지는 조합 제거 후 실제 수치. 등급별 도감 분포: ${h.map((v, i) => GRADES[i] + ' ' + v).join(' / ')}`);
  check('도감 외형 1,000종 이상 (표현형 서명)', cat.distinctPhenotypes >= 1000, `${cat.distinctPhenotypes}`);
  check('도감 외형 1,000종 이상 (렌더 서명, 육안 구분 기준)', cat.distinctRenders >= 1000, `${cat.distinctRenders}`);
  check('Barr body 패치 seed는 도감 수에 미반영 (서명에 seed 없음)', !cat.sigs.keys().next().value.includes('seed'));
}
// 12. 1,000회 시뮬레이션: 다양성·수렴 방지
{
  const rng = new RNG('sim1000');
  let pool = [];
  for (let i = 0; i < 30; i++) pool.push(createFounder('sp' + i, { specialChance: 0 }));
  const seen = new Map();
  let g = 0;
  for (let i = 0; i < 1000; i++) {
    const males = pool.filter((c) => c.sex === 'M'), fems = pool.filter((c) => c.sex === 'F');
    const f = rng.pick(males), m = rng.pick(fems);
    if (isForbiddenPair(f, m)) continue;
    const k = breed(f, m, 'sim' + i, 0);
    seen.set(k.catalogId, (seen.get(k.catalogId) || 0) + 1);
    pool.push(k);
    if (pool.length > 60) pool.splice(rng.int(30), 1); // 오래된 개체 일부 퇴장
    g++;
  }
  const top = Math.max(...seen.values()) / g;
  check('1,000회 교배 시뮬레이션: 서로 다른 외형 200종 이상', seen.size >= 200, `${seen.size}종 / ${g}회`);
  check('특정 외형이 전체의 10%를 넘지 않음(수렴 방지)', top < 0.10, `최다 ${(top * 100).toFixed(1)}%`);
  const finalSigs = new Set(pool.slice(-40).map((c) => c.catalogId));
  check('최근 40마리 중 서로 다른 외형 20종 이상', finalSigs.size >= 20, `${finalSigs.size}종`);
}
// 13. 등급 분포 캘리브레이션
{
  const cuts = gradeThresholds();
  const h = new Array(7).fill(0);
  const n = 20000;
  for (let i = 0; i < n; i++) h[createFounder('gr' + i, { specialChance: 0 }).baseGrade]++;
  const pct = h.map((v) => v / n);
  log(`<b>창업 풀 등급 분포</b>(목표 ${PARAMS.gradeTargets.map((x) => (x * 100).toFixed(1)).join('/')}%): ` + pct.map((v, i) => `${GRADES[i]} ${(v * 100).toFixed(1)}%`).join(' / ') + ` · 점수 컷 ${cuts.join(',')}`);
  check('미시컬 존재(0.1%~3%)', pct[6] > 0.001 && pct[6] < 0.03, `${(pct[6] * 100).toFixed(2)}%`);
  check('7등급 모두 출현', pct.every((v) => v > 0), '');
}

const fails = results.filter((r) => !r.ok).length;
log(`<h3>${fails === 0 ? '전체 통과' : fails + '개 실패'} (${results.length}개 검사)</h3>`, fails ? 'bad' : 'ok');
window.__results = { total: results.length, fails, results };
void phenotype;
