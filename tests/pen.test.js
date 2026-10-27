import {test} from 'node:test';
import assert from 'node:assert/strict';
import {G,newGame,penStatus,upgradePen,exportSave,importSave,doBreed,skipTime,sell,trade} from '../js/game.js';
import {PARAMS} from '../js/params.js';
globalThis.localStorage={setItem(){},getItem(){return null;},removeItem(){}};

test('first pen starts with room for two babies and every upgrade adds one or two places',()=>{
  newGame();assert.equal(penStatus().capacity,6);assert.equal(penStatus().count,4);assert.equal(G.penLevel,1);
  for(let i=1;i<PARAMS.penLevels.length;i++)assert.ok([1,2].includes(PARAMS.penLevels[i].capacity-PARAMS.penLevels[i-1].capacity));
  assert.equal(penStatus().next.cost,240);assert.equal(upgradePen().ok,false);assert.equal(G.coins,200);
});
test('upgrades charge exactly once, persist and reject stale confirmations',()=>{
  newGame();G.coins=1000;const result=upgradePen(1);assert.equal(result.ok,true);assert.equal(G.coins,760);assert.equal(penStatus().capacity,7);
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
test('full pen blocks births without changing coins, cooldowns, shop or dex; selling opens one place',()=>{
  newGame();const [father,mother]=G.mine;G.coins=9999;
  for(let i=0;i<2;i++){skipTime(86400e3);assert.ok(doBreed(father,mother).kitten);}
  assert.equal(G.mine.length,6);skipTime(86400e3);
  const before=JSON.stringify(G);assert.match(doBreed(father,mother).error,/정원/);assert.equal(JSON.stringify(G),before);
  assert.ok(sell(G.mine.at(-1))>0);assert.ok(doBreed(father,mother).kitten);assert.equal(G.mine.length,6);
  skipTime(86400e3);assert.equal(upgradePen().ok,true);assert.ok(doBreed(father,mother).kitten);assert.equal(G.mine.length,7);
});
test('existing overcapacity saves preserve cats and block breeding until space exists',()=>{
  newGame();const raw=JSON.parse(exportSave());
  for(const npc of raw.npcs)raw.mine.push(...npc.cats.splice(0,1));
  importSave(JSON.stringify(raw));const [father,mother]=G.mine;
  assert.equal(G.mine.length,9);const before=JSON.stringify(G);
  assert.match(doBreed(father,mother).error,/정원/);assert.equal(JSON.stringify(G),before);
  assert.equal(trade(G.mine[0],G.npcs[0].id,G.npcs[0].cats[0]),false);
  while(G.mine.length>6)sell(G.mine.at(-1));assert.match(doBreed(father,mother).error,/정원/);
  sell(G.mine.at(-1));assert.ok(doBreed(father,mother).kitten);assert.equal(G.mine.length,6);
});
