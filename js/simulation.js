import { AUTOSOMAL, POLY } from './genes.js';
import { breed, createFounder, refreshCat } from './engine.js';

export const alleleOptions = { ...AUTOSOMAL, O: ['O', 'o'], ...Object.fromEntries(POLY.map(k => [k, [0, 1]])) };
export function experimentParent(seed, sex, genome) {
  if (typeof seed !== 'string' || !seed.trim() || seed.length > 120 || !['M', 'F'].includes(sex)) throw new Error('seed와 성별을 확인해 주세요');
  const parent = createFounder(`${seed}:${sex}`, { sex, specialChance: 0 });
  if (genome) {
    for (const [locus, options] of Object.entries(alleleOptions)) {
      const pair = genome[locus];
      if (!Array.isArray(pair) || pair.length !== (locus === 'O' && sex === 'M' ? 1 : 2) || pair.some(a => !options.includes(a))) throw new Error(`${locus} 유전자형을 확인해 주세요`);
    }
    parent.genome = structuredClone(genome);
  }
  return refreshCat(parent);
}
export function parseExperiment(raw) {
  const config = JSON.parse(raw);
  if (config.version !== 1 || ![100, 1000, 10000].includes(config.count)) throw new Error('지원하지 않는 실험 파일이에요');
  const father = experimentParent(config.seed, 'M', config.father);
  const mother = experimentParent(config.seed, 'F', config.mother);
  return { config, father, mother };
}
export function createReport() {
  return { total: 0, sexes: { M: 0, F: 0 }, grades: Array(7).fill(0), special: 0, fantasy: 0, costume: 0,
    traits: { dilute: 0, long: 0, tortie: 0, point: 0, mink: 0 }, catalog: {}, samples: [], loci: {} };
}
export function addOffspring(report, child) {
  report.total++; report.sexes[child.sex]++;
  if (child.special) report.special++; else report.grades[child.baseGrade]++;
  if (child.fantasy) report.fantasy++; if (child.costume) report.costume++;
  for (const [key, value] of Object.entries({ dilute: child.genome.D.every(a => a === 'd'), long: child.ph.long,
    tortie: child.ph.tortie, point: child.ph.tyr === 'point', mink: child.ph.tyr === 'mink' })) if (value) report.traits[key]++;
  report.catalog[child.catalogId] = (report.catalog[child.catalogId] ?? 0) + 1;
  for (const [locus, pair] of Object.entries(child.genome)) {
    const key = [...pair].sort().join('/');
    report.loci[locus] ??= {};
    report.loci[locus][key] = (report.loci[locus][key] ?? 0) + 1;
  }
  if (report.samples.length < 8) report.samples.push(child);
}
export function simulateBatch(father, mother, seed, start, count, report) {
  for (let i = start; i < start + count; i++) addOffspring(report, breed(father, mother, `${seed}:offspring:${i}`, 0));
  return report;
}
