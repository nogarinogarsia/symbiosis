import { test } from 'node:test';
import assert from 'node:assert/strict';
import { G, newGame, save, load, exportSave, importSave, skipTime, sell, checkBreed, care, now, refreshShop, loadIssue, reset } from '../js/game.js';
import { applyCare, personalityOdds } from '../js/personality.js';
import { comfort, dailyCare } from '../js/wellbeing.js';

const memory = new Map();
globalThis.localStorage = { setItem: (k, v) => memory.set(k, v), getItem: k => memory.get(k) ?? null, removeItem: k => memory.delete(k) };

test('save round trip preserves cats and progress', () => {
  newGame(); const before = exportSave(); const ids = [...G.mine];
  G.coins = 0; importSave(before);
  assert.deepEqual(G.mine, ids); assert.ok(G.coins > 0); assert.equal(load(), true);
});
test('invalid import is atomic', () => {
  newGame(); const coins = G.coins, ids = [...G.mine];
  const data = JSON.parse(exportSave()); data.coins = 9999; data.mine.push('missing');
  assert.throws(() => importSave(JSON.stringify(data)));
  assert.equal(G.coins, coins); assert.deepEqual(G.mine, ids);
});
test('empty household remains a valid save', () => {
  newGame(); for (const id of [...G.mine]) sell(id);
  assert.equal(load(), true); assert.equal(G.mine.length, 0);
});
test('new game resets skipped time', () => {
  skipTime(86400e3); newGame(); assert.equal(G.offset, 0);
});
test('sold cat cannot be used as a breeding parent', () => {
  newGame(); const father = G.cats[G.mine[0]], mother = G.cats[G.mine[1]];
  sell(father.id); assert.ok(checkBreed(father, mother));
  assert.ok(checkBreed(undefined, mother));
});
test('care rejects missing cats, invalid actions and non-owned cats', () => {
  newGame(); assert.equal(care(G.shop[0], 'feed').ok, false);
  assert.equal(applyCare(undefined, 'feed', now()).ok, false);
  assert.equal(applyCare(G.cats[G.mine[0]], 'bad', now()).ok, false);
});
test('daily care works for adults without changing personality and observes cooldown', () => {
  newGame(); const c = G.cats[G.mine[0]], p = c.personality, t = now();
  assert.equal(dailyCare(c, 'clean', t).ok, true);
  assert.equal(comfort(c, t).find(x => x.id === 'clean').value, 100);
  assert.equal(dailyCare(c, 'clean', t + 1).ok, false);
  assert.equal(dailyCare(c, 'clean', t + 60e3).ok, true);
  assert.equal(c.personality, p);
});
test('personality odds remain finite for large scores', () => {
  const c = { birthTime: 0, care: { scores: Array(8).fill(10000), last: {}, log: [] } };
  const odds = personalityOdds(c);
  assert.ok(odds.every(Number.isFinite)); assert.ok(Math.abs(odds.reduce((a,b)=>a+b,0)-1) < 1e-10);
});
test('storage quota failure is observable', () => {
  const original = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('quota'); };
  assert.equal(save(), false); localStorage.setItem = original;
});
test('shop refresh preserves history and rejects old stock as a parent', () => {
  newGame(); const previous = [...G.shop], deadline = G.shopRefreshAt;
  assert.equal(refreshShop(deadline - 1), false);
  assert.equal(refreshShop(deadline), true);
  assert.equal(G.shop.length, 8); assert.ok(G.shop.every(id => !previous.includes(id)));
  assert.ok(previous.every(id => G.cats[id]));
  assert.equal(refreshShop(deadline + 1), false);
  const f = G.cats[G.mine[0]], old = previous.map(id => G.cats[id]).find(c => c.sex === 'F');
  if (old) assert.ok(checkBreed(f, old));
});
test('legacy save gets an initial shop refresh deadline', () => {
  newGame(); const data = JSON.parse(exportSave()); delete data.shopRefreshAt;
  importSave(JSON.stringify(data)); assert.ok(G.shopRefreshAt > now());
});
test('unsafe imported names and broken ancestors cannot replace progress', () => {
  newGame(); const data = JSON.parse(exportSave());
  data.cats[data.mine[0]].name = '<img onerror=alert(1)>';
  assert.throws(() => importSave(JSON.stringify(data)));
  data.cats[data.mine[0]].name = '모찌'; data.cats[data.mine[0]].fatherId = '__proto__';
  assert.throws(() => importSave(JSON.stringify(data)));
});
test('corrupt automatic save is preserved until explicit recovery', () => {
  newGame(); const valid = exportSave();
  for (const invalid of ['', '{broken', JSON.stringify({ version: 99 })]) {
    memory.set('catgene-save-v1', invalid);
    assert.equal(load(), false); assert.equal(loadIssue.raw, invalid);
    assert.equal(save(), false); assert.equal(memory.get('catgene-save-v1'), invalid);
    assert.throws(() => importSave('{invalid'));
    assert.equal(save(), false);
    importSave(valid); assert.equal(loadIssue, null); assert.equal(load(), true);
  }
});
test('unavailable storage does not masquerade as a missing save', () => {
  const get = localStorage.getItem;
  localStorage.getItem = () => { throw new Error('SecurityError'); };
  assert.equal(load(), false); assert.equal(loadIssue.raw, null);
  assert.equal(save(), false);
  localStorage.getItem = get;
  reset(); assert.equal(loadIssue, null); assert.equal(save(), true);
});
