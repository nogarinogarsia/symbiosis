import {test} from 'node:test';
import assert from 'node:assert/strict';
import {G,newGame,penStatus,upgradePen,exportSave,importSave,doBreed,skipTime,sell,trade} from '../js/game.js';
import {PARAMS} from '../js/params.js';
globalThis.localStorage={setItem(){},getItem(){return null;},removeItem(){}};

test('first pen starts with room for two babies and every upgrade adds two or three places',()=>{
  newGame();assert.equal(penStatus().capacity,6);assert.equal(penStatus().count,4);assert.equal(G.penLevel,1);
  for(let i=1;i<PARAMS.penLevels.length;i++)assert.ok([2,3].includes(PARAMS.penLevels[i].capacity-PARAMS.penLevels[i-1].capacity));
  assert.equal(penStatus().next.cost,240);assert.equal(upgradePen().ok,false);assert.equal(G.coins,200);
});
test('upgrades charge exactly once, persist and reject stale confirmations',()=>{
  newGame();G.coins=1000;const result=upgradePen(1);assert.equal(result.ok,true);assert.equal(G.coins,760);assert.equal(penStatus().capacity,8);
  assert.equal(upgradePen(1).ok,false);assert.equal(G.coins,760);
  const raw=exportSave();G.penLevel=1;importSave(raw);assert.equal(G.penLevel,2);
  G.penLevel=PARAMS.penLevels.length;const before=G.coins;assert.equal(upgradePen().ok,false);assert.equal(G.coins,before);
});
test('legacy saves keep every cat and migrate to level one without free upgrades',()=>{
  newGame();const raw=JSON.parse(exportSave());delete raw.penLevel;
  for(const npc of raw.npcs)raw.mine.push(...npc.cats.splice(0,1));
  importSave(JSON.stringify(raw));assert.equal(G.penLevel,1);assert.equal(G.mine.length,9);assert.equal(penStatus().over,3);
  for(const level of [-1,0,1.5,99,'2']){const invalid={...raw,penLevel:level};assert.throws(()=>importSave(JSON.stringify(invalid)));assert.equal(G.mine.length,9);}
});
test('one overflow baby is protected, further breeding is atomic until selling or upgrading',()=>{
  newGame();const [father,mother]=G.mine;G.coins=9999;
  for(let i=0;i<3;i++){skipTime(86400e3);assert.ok(doBreed(father,mother).kitten);}
  assert.equal(G.mine.length,7);assert.equal(penStatus().over,1);
  skipTime(86400e3);const before=JSON.stringify(G);assert.ok(doBreed(father,mother).error);assert.equal(JSON.stringify(G),before);
  assert.equal(trade(G.mine[0],G.npcs[0].id,G.npcs[0].cats[0]),false);
  const baby=G.mine.at(-1);assert.ok(sell(baby)>0);assert.equal(penStatus().over,0);
  assert.ok(doBreed(father,mother).kitten);assert.equal(penStatus().over,1);
  assert.equal(upgradePen().ok,true);assert.equal(penStatus().over,0);assert.equal(G.mine.length,7);
});
