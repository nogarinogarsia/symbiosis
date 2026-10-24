import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crossDistribution,expectedCross} from '../js/expectation.js';
import {experimentParent,simulateBatch,createReport} from '../js/simulation.js';
const parents=()=>[experimentParent('exact-cross','M'),experimentParent('exact-cross','F')];
test('heterozygous crosses give exact 1:2:1 and all locus probabilities sum to one',()=>{
  assert.deepEqual(crossDistribution(['D','d'],['D','d']),{'D/D':.25,'D/d':.5,'d/d':.25});
  const [f,m]=parents();f.genome.D=m.genome.D=['D','d'];f.genome.L=m.genome.L=['L','l'];
  const before=JSON.stringify([f,m]),expected=expectedCross(f,m);
  assert.equal(expected.traits.dilute,.25);assert.equal(expected.traits.long,.25);
  for(const dist of [...Object.values(expected.loci),expected.sons,expected.daughters])assert.equal(Object.values(dist).reduce((a,b)=>a+b,0),1);
  assert.equal(JSON.stringify([f,m]),before);
});
test('X-linked predictions separate sons, daughters and whole-population tortie odds',()=>{
  const [f,m]=parents();f.genome.O=['O'];m.genome.O=['o','o'];
  const first=expectedCross(f,m);assert.deepEqual(first.daughters,{'O/o':1});assert.deepEqual(first.sons,{o:1});assert.equal(first.traits.tortie,.5);
  m.genome.O=['O','o'];assert.equal(expectedCross(f,m).traits.tortie,.25);
  f.genome.O=['o'];m.genome.O=['O','O'];assert.equal(expectedCross(f,m).traits.tortie,.5);
  m.genome.O=['o','o'];assert.equal(expectedCross(f,m).traits.tortie,0);
});
test('TYR compound alleles predict mink, point and sepia without treating them as one recessive',()=>{
  const [f,m]=parents();f.genome.C=['cb','cb'];m.genome.C=['cs','cs'];assert.equal(expectedCross(f,m).traits.mink,1);
  f.genome.C=m.genome.C=['cb','cs'];const traits=expectedCross(f,m).traits;
  assert.equal(traits.mink,.5);assert.equal(traits.point,.25);assert.equal(traits.sepia,.25);
  f.genome.C=['C','C'];assert.equal(expectedCross(f,m).traits.mink,0);assert.equal(expectedCross(f,m).traits.point,0);
});
test('seeded sampled crosses converge near exact probabilities',()=>{
  const [f,m]=parents();f.genome.D=m.genome.D=['D','d'];f.genome.L=m.genome.L=['L','l'];f.genome.C=m.genome.C=['cb','cs'];f.genome.O=['O'];m.genome.O=['O','o'];
  const expected=expectedCross(f,m),actual=simulateBatch(f,m,'prediction-check',0,10000,createReport());
  for(const key of Object.keys(actual.traits))assert.ok(Math.abs(actual.traits[key]/actual.total-expected.traits[key])<.025,`${key} sampled probability`);
});
test('predictions reject invalid parent sexes and allele arrays',()=>{
  const [f,m]=parents();assert.throws(()=>expectedCross(m,f));
  m.genome.C=['C','unsupported'];assert.throws(()=>expectedCross(f,m));
});
