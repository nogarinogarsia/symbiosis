import { test } from 'node:test';
import assert from 'node:assert/strict';
import { experimentParent, parseExperiment, createReport, simulateBatch } from '../js/simulation.js';

function parents() { return [experimentParent('lab-test', 'M'), experimentParent('lab-test', 'F')]; }
test('simulation is reproducible across chunk sizes', () => {
  const [f, m] = parents();
  const a = simulateBatch(f, m, 'same-seed', 0, 1000, createReport());
  const b = createReport();
  for (let start = 0; start < 1000; start += 100) simulateBatch(f, m, 'same-seed', start, 100, b);
  const summary = r => ({ ...r, samples: r.samples.map(c => ({ genome: c.genome, body: c.body, sex: c.sex, special: c.special, fantasy: c.fantasy, costume: c.costume })) });
  assert.deepEqual(summary(a), summary(b));
  assert.equal(a.grades.reduce((a,b)=>a+b,0) + a.special, 1000);
});
test('experiment round trip preserves parent genomes', () => {
  const [f, m] = parents(); const input = {version:1,seed:'lab-test',count:1000,father:f.genome,mother:m.genome};
  const parsed = parseExperiment(JSON.stringify(input));
  assert.deepEqual(parsed.father.genome, f.genome); assert.deepEqual(parsed.mother.genome, m.genome);
  assert.deepEqual(parsed.father.body, f.body);
});
test('invalid experiment genomes and counts are rejected', () => {
  const [f, m] = parents();
  assert.throws(() => experimentParent('', 'M'));
  assert.throws(() => experimentParent('a', 'M', { ...f.genome, O: ['O','o'] }));
  assert.throws(() => parseExperiment(JSON.stringify({version:1,seed:'lab-test',count:999999,father:f.genome,mother:m.genome})));
});
test('orange example gives tortie daughters and non-orange sons', () => {
  const [f, m] = parents(); f.genome.O = ['O']; m.genome.O = ['o','o'];
  const report = simulateBatch(f, m, 'orange', 0, 1000, createReport());
  assert.equal(report.traits.tortie, report.sexes.F);
  assert.equal(report.loci.O.o, report.sexes.M);
});
test('mink example produces mink in every offspring', () => {
  const [f, m] = parents(); f.genome.C = ['cb','cb']; m.genome.C = ['cs','cs'];
  const report = simulateBatch(f, m, 'mink', 0, 1000, createReport());
  assert.equal(report.traits.mink, 1000);
});
