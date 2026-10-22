import {test} from 'node:test';
import assert from 'node:assert/strict';
import {G,newGame,collectIncome,pendingIncome,exportSave,importSave,sell,trade} from '../js/game.js';
import {incomePerHour,sellPrice} from '../js/engine.js';
globalThis.localStorage={setItem(){},getItem(){return null;},removeItem(){}};
function clock(action){
  const original=Date.now;let time=2000000000000;Date.now=()=>time;
  try{action(ms=>{time+=ms;});}finally{Date.now=original;}
}
test('frequent collections preserve fractional income instead of resetting it',()=>clock(advance=>{
  newGame();const rate=G.mine.reduce((sum,id)=>sum+incomePerHour(G.cats[id]),0),start=G.coins;
  for(let i=0;i<10;i++){advance(360000);collectIncome();}
  assert.equal(G.coins-start,rate);assert.ok(G.incomeRemainder<1e-10);
  assert.equal(collectIncome(),0);
}));
test('fractional carry survives saving and legacy saves default to zero',()=>clock(advance=>{
  newGame();advance(123456);collectIncome();const carry=G.incomeRemainder;
  assert.ok(carry>0&&carry<1);const snapshot=exportSave();G.incomeRemainder=0;
  importSave(snapshot);assert.equal(G.incomeRemainder,carry);
  const legacy=JSON.parse(snapshot);delete legacy.incomeRemainder;importSave(JSON.stringify(legacy));assert.equal(G.incomeRemainder,0);
  legacy.incomeRemainder=1;assert.throws(()=>importSave(JSON.stringify(legacy)));
  newGame();assert.equal(G.incomeRemainder,0);
}));
test('offline income remains capped at 24 hours',()=>clock(advance=>{
  newGame();const rate=G.mine.reduce((sum,id)=>sum+incomePerHour(G.cats[id]),0);
  advance(72*3600e3);assert.equal(pendingIncome(),rate*24);assert.equal(collectIncome(),rate*24);
}));
test('selling settles accrued income and preserves the fractional remainder',()=>clock(advance=>{
  newGame();const rate=G.mine.reduce((sum,id)=>sum+incomePerHour(G.cats[id]),0),id=G.mine[0],price=sellPrice(G.cats[id]),start=G.coins;
  advance(123456);sell(id);
  assert.ok(Math.abs((G.coins-start-price+G.incomeRemainder)-rate*123456/3600e3)<1e-10);
}));
test('a traded cat earns income only after joining the household',()=>clock(advance=>{
  newGame();advance(3600e3);const npc=G.npcs[0],incoming=npc.cats[0];
  assert.equal(trade(G.mine[0],npc.id,incoming),true);assert.equal(pendingIncome(),0);
  const rate=G.mine.reduce((sum,id)=>sum+incomePerHour(G.cats[id]),0);
  advance(3600e3);assert.equal(collectIncome(),rate);
}));
