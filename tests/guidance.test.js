import {test} from 'node:test';import assert from 'node:assert/strict';
import {nextStep} from '../js/next-step.js';
import {destinationName,mapPoint,villageMap} from '../js/village-map.js';
const initial={pen:{count:4,capacity:6,over:0,next:{capacity:7,cost:240}},coins:200,pending:0,babyId:null,readyToBreed:true};
test('guidance resolves overcrowding before recommending more kittens',()=>{
  const full={...initial,pen:{...initial.pen,over:1,count:7},babyId:'baby'};
  assert.equal(nextStep(full).zone,'shop');assert.equal(nextStep({...full,coins:300}).act,'upgradepen');
  assert.equal(nextStep({...full,pen:{...full.pen,next:null}}).zone,'shop');
  assert.equal(nextStep({...initial,pen:{count:19,capacity:19,over:0,next:null}}).zone,'shop');
});
test('guidance distinguishes available cash, uncollected income, baby care and breeding',()=>{
  assert.equal(nextStep({...initial,coins:240}).act,'upgradepen');
  assert.equal(nextStep({...initial,pending:40}).act,'income');
  assert.equal(nextStep({...initial,babyId:'first'}).id,'first');
  assert.equal(nextStep(initial).zone,'breed');
  assert.equal(nextStep({...initial,readyToBreed:false,pending:10}).act,'income');
  assert.equal(nextStep({...initial,readyToBreed:false}).zone,'npc:n1');
  assert.equal(nextStep({...initial,pen:{...initial.pen,count:0}}).act,'backup');
});
test('map includes the full walkable world and gives each neighbor its own name',()=>{
  for(const p of [{x:-36,z:-26},{x:36,z:22}]){const mapped=mapPoint(p);assert.ok(mapped.x>0&&mapped.x<600&&mapped.y>0&&mapped.y<370);}
  assert.equal(destinationName('npc:n2',[{id:'n2',name:'하늘이',icon:'☁️'}]),'☁️ 하늘이의 집');
  assert.match(destinationName('shop',[]),/동물샵/);assert.equal(destinationName('unknown',[]),'마을');
});
test('map escapes labels while plotting actual pen dimensions and the current player',()=>{
  const pens={mine:{id:'mine',cx:-9,cz:2,w:12,d:9}};
  const svg=villageMap(pens,[{id:'npc:n1',x:-20,z:-10}],{x:0,z:13},[{id:'n1',icon:'🐱',name:'<script>'}]);
  assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('현재 위치'));assert.ok(svg.includes('role="img"'));
});
