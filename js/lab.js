import { experimentParent, alleleOptions, parseExperiment, createReport, simulateBatch } from './simulation.js';
import { phenotypeName, gradeLabel } from './engine.js';
import { GRADES } from './params.js';

const $ = s => document.querySelector(s);
const labels = { B: '갈색', D: '희석', A: '아구티', T: '태비', S: '흰반점', C: '색소제한', L: '털길이', I: '실버', O: '오렌지 (X)', P1: '농도 1', P2: '농도 2', P3: '농도 3' };
let father, mother, running = false, cancelled = false, revision = 0;
let thumbnail = null;
try { ({ thumbnail } = await import('./stage.js')); } catch { /* Text statistics also work without the CDN. */ }
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function picture(cat) {
  if (!thumbnail) return '<span aria-hidden="true" style="font-size:60px">🐱</span>';
  try { return `<img src="${thumbnail(cat, 130)}" alt="${esc(phenotypeName(cat.ph))}">`; }
  catch { return '<span aria-hidden="true" style="font-size:60px">🐱</span>'; }
}
function renderParent(key, parent, title) {
  $(`#${key}`).innerHTML = `<h2>${title}</h2><div class="parent-preview">${picture(parent)}<div><b>${gradeLabel(parent)}</b><p>${phenotypeName(parent.ph)}</p></div></div><table><thead><tr><th scope="col">유전자좌</th><th scope="col">대립유전자</th></tr></thead><tbody>` + Object.entries(alleleOptions).map(([locus, options]) => `<tr><th scope="row">${labels[locus]} (${locus})</th><td>` + parent.genome[locus].map((allele, i) => `<select data-parent="${key}" data-locus="${locus}" data-index="${i}" aria-label="${title} ${labels[locus]} 대립유전자 ${i + 1}">` + options.map(a => `<option value="${a}" ${a === allele ? 'selected' : ''}>${a}</option>`).join('') + '</select>').join('') + '</td></tr>').join('') + '</tbody></table>';
}
function renderParents() {
  renderParent('father', father, '♂ 아빠'); renderParent('mother', mother, '♀ 엄마');
}
function config() { return { version: 1, seed: $('#seed').value.trim(), count: +$('#count').value, father: father.genome, mother: mother.genome }; }
function invalidate() {
  revision++; $('#results').hidden = true; $('#progress').hidden = true;
  $('#status').textContent = '설정이 바뀌었어요. 교배 실험을 시작해 주세요.';
}
function randomize() {
  const seed = $('#seed').value.trim();
  try { father = experimentParent(seed, 'M'); mother = experimentParent(seed, 'F'); renderParents(); invalidate(); }
  catch (err) { $('#status').textContent = err.message; }
}
$('#randomize').onclick = randomize;
$('.parents').addEventListener('change', e => {
  const { parent, locus, index } = e.target.dataset;
  if (!parent) return;
  const genome = structuredClone((parent === 'father' ? father : mother).genome);
  genome[locus][+index] = locus.startsWith('P') ? +e.target.value : e.target.value;
  try {
    const updated = experimentParent($('#seed').value.trim(), parent === 'father' ? 'M' : 'F', genome);
    if (parent === 'father') father = updated; else mother = updated;
    renderParent(parent, updated, parent === 'father' ? '♂ 아빠' : '♀ 엄마'); invalidate();
  } catch (err) { $('#status').textContent = err.message; }
});
$('#seed').addEventListener('change', invalidate); $('#count').addEventListener('change', invalidate);
$('.presets').addEventListener('click', e => {
  const preset = e.target.dataset.preset; if (!preset) return;
  try {
    const seed = $('#seed').value.trim();
    let f = experimentParent(seed, 'M'), m = experimentParent(seed, 'F');
    if (preset === 'dilute') { f.genome.D = ['D', 'd']; m.genome.D = ['D', 'd']; }
    if (preset === 'long') { f.genome.L = ['L', 'l']; m.genome.L = ['L', 'l']; }
    if (preset === 'orange') { f.genome.O = ['O']; m.genome.O = ['o', 'o']; }
    if (preset === 'mink') { f.genome.C = ['cb', 'cb']; m.genome.C = ['cs', 'cs']; }
    father = experimentParent(seed, 'M', f.genome); mother = experimentParent(seed, 'F', m.genome);
    renderParents(); invalidate();
  } catch (err) { $('#status').textContent = err.message; }
});
const pct = (n, total) => `${(100 * n / total).toFixed(1)}%`;
function histogram(label, n, total) { return `<div class="hist-row"><span>${esc(label)}</span><div class="hist-track"><div class="hist-fill" style="width:${100 * n / total}%"></div></div><span>${n.toLocaleString()} · ${pct(n, total)}</span></div>`; }
function showResults(report, seed, complete) {
  const n = report.total;
  const largest = Math.max(...Object.values(report.catalog));
  $('#results').innerHTML = `<h2>${complete ? '실험 결과' : '중지한 실험 결과'}</h2><p class="muted">seed: ${esc(seed)} · 고정된 부모 쌍의 독립 교배 ${n.toLocaleString()}회 · 표본 비율이며 확정 확률은 아닙니다.</p><div class="metrics">` + [['교배 표본', n.toLocaleString()], ['발견 외형', Object.keys(report.catalog).length], ['암컷 / 수컷', `${report.sexes.F} / ${report.sexes.M}`], ['최다 외형 비율', pct(largest, n)]].map(([label, value]) => `<div class="metric">${label}<strong>${value}</strong></div>`).join('') + '</div><h3>주요 형질</h3>' + Object.entries({ '희석': report.traits.dilute, '장모': report.traits.long, '토티 (전체 표본)': report.traits.tortie, '포인트': report.traits.point, '밍크': report.traits.mink }).map(([label, value]) => histogram(label, value, n)).join('') + '<h3>등급과 별도 추첨</h3>' + report.grades.map((v, i) => histogram(GRADES[i], v, n)).join('') + histogram('SPECIAL', report.special, n) + histogram('판타지', report.fantasy, n) + histogram('의상', report.costume, n) + '<p class="muted">등급 + SPECIAL은 전체 표본입니다. 판타지·의상은 해당 표본과 중복 집계합니다. 토티는 암컷에서만 나옵니다.</p><h3>처음 태어난 아기 8마리</h3><div class="samples">' + report.samples.map(c => `<div class="sample">${picture(c)}<b>${c.sex === 'M' ? '♂' : '♀'} ${gradeLabel(c)}</b><div>${phenotypeName(c.ph)}</div></div>`).join('') + '</div><details><summary>좌위별 자손 유전자형 분포</summary><table><thead><tr><th>좌위</th><th>유전자형</th><th>횟수</th><th>비율</th></tr></thead><tbody>' + Object.entries(report.loci).flatMap(([locus, values]) => Object.entries(values).map(([genotype, value]) => `<tr><td>${locus}</td><td>${esc(genotype)}</td><td>${value}</td><td>${pct(value, n)}</td></tr>`)).join('') + '</tbody></table></details>';
  $('#results').hidden = false;
}
function setRunning(value) {
  running = value;
  document.querySelectorAll('.controls input,.controls select,.controls button,.presets button,.parents select,.file-controls button').forEach(el => { el.disabled = value; });
  $('#cancel').disabled = false; $('#cancel').hidden = !value;
}
$('#cancel').onclick = () => { cancelled = true; };
$('#run').onclick = async () => {
  if (running) return;
  try {
    const current = config();
    const validated = parseExperiment(JSON.stringify(current));
    father = validated.father; mother = validated.mother; renderParents();
    const report = createReport(), expectedRevision = revision;
    cancelled = false; setRunning(true); $('#progress').hidden = false; $('#progress').value = 0; $('#results').hidden = true;
    for (let start = 0; start < current.count && !cancelled; start += 100) {
      simulateBatch(father, mother, current.seed, start, Math.min(100, current.count - start), report);
      $('#progress').value = report.total / current.count * 100;
      $('#status').textContent = `교배 중… ${report.total.toLocaleString()} / ${current.count.toLocaleString()}`;
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    if (revision === expectedRevision && report.total) showResults(report, current.seed, !cancelled);
    $('#status').textContent = cancelled ? `${report.total.toLocaleString()}회에서 중지했어요. 부분 결과를 표시합니다.` : `${report.total.toLocaleString()}회 실험 완료. 같은 설정과 seed는 같은 유전 결과를 만듭니다.`;
  } catch (err) { $('#status').textContent = `실험 오류: ${err.message}`; }
  finally { setRunning(false); }
};
$('#export').onclick = () => {
  try {
    const data = config(); parseExperiment(JSON.stringify(data));
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = '냥냥-유전실험.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) { $('#status').textContent = err.message; }
};
$('#import').onclick = () => $('#experimentFile').click();
$('#experimentFile').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (file.size > 100000) throw new Error('100KB 이하의 실험 설정을 골라 주세요');
    const parsed = parseExperiment(await file.text());
    father = parsed.father; mother = parsed.mother;
    $('#seed').value = parsed.config.seed; $('#count').value = parsed.config.count;
    renderParents(); invalidate(); $('#status').textContent = '실험 설정을 불러왔어요.';
  } catch (err) { $('#status').textContent = err.message; }
  finally { e.target.value = ''; }
};
randomize();
