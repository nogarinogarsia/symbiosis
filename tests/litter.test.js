import { test } from 'node:test';
import assert from 'node:assert/strict';
import { litterState, dailyCare, LITTER_INTERVAL_MS } from '../js/wellbeing.js';

test('litter appears at four-hour boundaries and is capped per cat', () => {
  const cat={id:'a',seed:'a',birthTime:0};
  assert.equal(litterState([cat],LITTER_INTERVAL_MS-1).total,0);
  assert.equal(litterState([cat],LITTER_INTERVAL_MS).total,1);
  assert.equal(litterState([cat],LITTER_INTERVAL_MS*2).total,2);
  assert.equal(litterState([cat],LITTER_INTERVAL_MS*1000).total,3);
  assert.equal(litterState([cat],-1).total,0);
});
test('cleaning removes only that cat’s waste and survives JSON restoration', () => {
  const a={id:'a',seed:'a',birthTime:0}, b={id:'b',seed:'b',birthTime:0}, t=LITTER_INTERVAL_MS*3;
  assert.equal(litterState([a,b],t).total,6);
  assert.equal(dailyCare(a,'clean',t).ok,true);
  const restored=JSON.parse(JSON.stringify([a,b]));
  assert.equal(litterState(restored,t).total,3);
  assert.ok(litterState(restored,t).items.every(item=>item.catId==='b'));
  assert.equal(litterState(restored,t+LITTER_INTERVAL_MS).total,4);
});
test('rendered waste is bounded without hiding the total for large households', () => {
  const cats=Array.from({length:500},(_,i)=>({id:`c${i}`,seed:`seed${i}`,birthTime:0}));
  const state=litterState(cats,LITTER_INTERVAL_MS*3);
  assert.equal(state.total,1500); assert.equal(state.items.length,12);
  assert.deepEqual(state,litterState(cats,LITTER_INTERVAL_MS*3));
  assert.equal(litterState([],0).total,0);
});
