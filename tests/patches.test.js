import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {barrMask} from '../js/patches.js';
import {createFounder,refreshCat,breed} from '../js/engine.js';

test('Barr mask remains byte-identical to the pre-refactor layout',()=>{
  assert.equal(createHash('sha256').update(barrMask('body','barr-known')).digest('hex'),'1e55997d329db2552b51187fb0785cd0de756ec85f5acce14447f7d649adffe8');
});
test('same individual and part reproduce the same binary patch mask',()=>{
  const a=barrMask('head','saved-cat'),b=barrMask('head','saved-cat');
  assert.deepEqual(a,b);assert.ok(a.every(value=>value===0||value===1));
  assert.ok(a.includes(0)&&a.includes(1));
  assert.notDeepEqual(a,barrMask('head','different-cat'));
  assert.notDeepEqual(a,barrMask('body','saved-cat'));
});
test('patch seeds do not inflate the phenotype catalog',()=>{
  const a=createFounder('same-genotype',{sex:'F',specialChance:0});
  a.genome.O=['O','o'];const first=refreshCat(a),second=refreshCat({...a,seed:'another-individual'});
  assert.equal(first.catalogId,second.catalogId);assert.equal(first.grade,second.grade);
  assert.notDeepEqual(barrMask('body',first.seed),barrMask('body',second.seed));
});
test('offspring patch layout uses its own seed and is not copied from a parent',()=>{
  const f=createFounder('patch-father',{sex:'M',specialChance:0});
  const m=createFounder('patch-mother',{sex:'F',specialChance:0});
  f.genome.O=['O'];m.genome.O=['o','o'];
  let kitten;
  for(let i=0;i<30;i++){const k=breed(f,m,`patch-child-${i}`,0);if(k.sex==='F'){kitten=k;break;}}
  assert.ok(kitten?.ph.tortie);
  assert.notDeepEqual(barrMask('body',kitten.seed),barrMask('body',m.seed));
  assert.notDeepEqual(barrMask('body',kitten.seed),barrMask('body',f.seed));
  const restored=JSON.parse(JSON.stringify(kitten));
  assert.deepEqual(barrMask('body',kitten.seed),barrMask('body',restored.seed));
});
