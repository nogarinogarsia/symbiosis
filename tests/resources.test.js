import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ResourcePool} from '../js/resource-pool.js';

test('shared resources stay alive until their last user releases them',()=>{
  const disposed=[],pool=new ResourcePool(0,value=>disposed.push(value));
  const a=pool.acquire('same',()=>({id:'a'}));
  const b=pool.acquire('same',()=>{throw Error('must reuse');});
  assert.equal(a,b); assert.equal(pool.stats().refs,2);
  pool.release(a); assert.equal(disposed.length,0);
  pool.release(b); assert.deepEqual(disposed,[a]); assert.equal(pool.stats().entries,0);
  pool.release(a); assert.equal(disposed.length,1);
});
test('idle LRU eviction never discards live resources',()=>{
  const disposed=[],pool=new ResourcePool(2,value=>disposed.push(value.id));
  const live=pool.acquire('live',()=>({id:'live'}));
  for(const id of ['a','b','c','d']){const value=pool.acquire(id,()=>({id}));pool.release(value);}
  assert.deepEqual(disposed,['a','b']); assert.deepEqual(pool.stats(),{entries:3,active:1,idle:2,refs:1});
  assert.equal(pool.acquire('live',()=>{throw Error('lost live resource');}),live);
  pool.trim(0); assert.deepEqual(disposed,['a','b','c','d']); assert.equal(pool.stats().active,1);
});
test('live resource count can exceed idle budget without invalidating a model',()=>{
  let disposals=0;const pool=new ResourcePool(1,()=>disposals++);
  const live=Array.from({length:100},(_,i)=>pool.acquire(i,()=>({i})));
  assert.equal(pool.stats().active,100);assert.equal(disposals,0);
  live.forEach(value=>pool.release(value));assert.equal(pool.stats().idle,1);assert.equal(disposals,99);
  pool.trim(0);assert.equal(disposals,100);
});
test('failed resource creation does not leave a cache entry',()=>{
  const pool=new ResourcePool(2,()=>{});
  assert.throws(()=>pool.acquire('broken',()=>{throw Error('failed');}));
  assert.equal(pool.stats().entries,0);
});
