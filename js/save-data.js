// Validate a complete snapshot before it can replace the live game.
import { AUTOSOMAL, POLY } from './genes.js';
import { SPECIALS, FANTASY, COSTUMES } from './engine.js';

export function validateSave(data) {
  const fail = () => { throw new Error('올바른 냥냥 유전 하우스 저장 파일이 아니에요'); };
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail();
  if (data.version != null && data.version !== 1) fail();
  if (!Number.isFinite(data.coins) || data.coins < 0 || !Number.isFinite(data.offset) || !Number.isFinite(data.lastCollect)) fail();
  if (!data.cats || typeof data.cats !== 'object' || Array.isArray(data.cats)) fail();
  if (!Array.isArray(data.mine) || !Array.isArray(data.shop) || !Array.isArray(data.npcs) || !data.dex || typeof data.dex !== 'object' || Array.isArray(data.dex)) fail();
  const has = id => typeof id === 'string' && Object.hasOwn(data.cats, id);
  for (const [id, c] of Object.entries(data.cats)) {
    if (!c || c.id !== id || typeof c.name !== 'string' || c.name.length > 80 || /[<>&"']/.test(c.name) || !/^[\w-]+$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id) || typeof c.seed !== 'string' || !['M', 'F'].includes(c.sex)) fail();
    if (c.special != null && !Object.hasOwn(SPECIALS, c.special) || c.fantasy != null && !Object.hasOwn(FANTASY, c.fantasy) || c.costume != null && !COSTUMES.some(x => x.id === c.costume)) fail();
    if (!Number.isFinite(c.birthTime) || !(c.lastBreedAt === null || Number.isFinite(c.lastBreedAt))) fail();
    if (c.incomeSince != null && !Number.isFinite(c.incomeSince)) fail();
    if (c.fatherId != null && !has(c.fatherId) || c.motherId != null && !has(c.motherId)) fail();
    if (!(c.personality == null || Number.isInteger(c.personality) && c.personality >= 0 && c.personality < 8)) fail();
    const loci = { ...AUTOSOMAL, O: ['O', 'o'], ...Object.fromEntries(POLY.map(k => [k, [0, 1]])) };
    for (const [locus, alleles] of Object.entries(loci)) {
      const pair = c.genome?.[locus];
      if (!Array.isArray(pair) || pair.length !== (locus === 'O' && c.sex === 'M' ? 1 : 2) || pair.some(a => !alleles.includes(a))) fail();
    }
    if (!c.body || ['whisker', 'ear', 'face', 'bulk'].some(k => !Number.isFinite(c.body[k]) || c.body[k] < 0 || c.body[k] > 1)) fail();
    if (c.care && (!Array.isArray(c.care.scores) || c.care.scores.length !== 8 || c.care.scores.some(s => !Number.isFinite(s)) || !c.care.last || Object.values(c.care.last).some(t => !Number.isFinite(t)) || c.care.log && (!Array.isArray(c.care.log) || c.care.log.some(t => !Number.isFinite(t))))) fail();
    if (c.wellbeing && (typeof c.wellbeing !== 'object' || Object.values(c.wellbeing).some(t => !Number.isFinite(t)))) fail();
  }
  const assigned = [...data.mine, ...data.shop];
  if (data.npcs.length !== 5) fail();
  for (const [i, n] of data.npcs.entries()) {
    if (!n || n.id !== `n${i + 1}` || typeof n.name !== 'string' || /[<>&"']/.test(n.name) || typeof n.icon !== 'string' || /[<>&"']/.test(n.icon) || !Array.isArray(n.cats)) fail();
    assigned.push(...n.cats);
  }
  if (assigned.some(id => !has(id)) || new Set(assigned).size !== assigned.length) fail();
  if (Object.values(data.dex).some(e => !e || !has(e.catId) || !Number.isFinite(e.first))) fail();
  return data;
}
