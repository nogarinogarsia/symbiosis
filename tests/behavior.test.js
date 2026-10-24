import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseActivity, socialTarget, canReceiveGreeting } from '../js/behavior.js';
import { RNG } from '../js/rng.js';

const pen = {minX:-4,maxX:4,minZ:-3,maxZ:3};
test('all personalities plan finite destinations inside their own pen', () => {
  const rng = new RNG('behavior-bounds');
  for (const personality of [null,0,1,2,3,4,5,6,7]) {
    for (let i=0;i<500;i++) {
      const plan = chooseActivity(personality,{x:0,z:0},[{x:3,z:2}],pen,()=>rng.next());
      assert.ok(Number.isFinite(plan.duration) && plan.duration > 0);
      if (plan.target) {
        assert.ok(Number.isFinite(plan.target.x) && Number.isFinite(plan.target.z));
        assert.ok(plan.target.x >= pen.minX && plan.target.x <= pen.maxX);
        assert.ok(plan.target.z >= pen.minZ && plan.target.z <= pen.maxZ);
      }
    }
  }
});
test('shy cats choose a corner away from the nearest neighbor', () => {
  const plan = chooseActivity(1,{x:0,z:0},[{x:3,z:2}],pen,()=>.1);
  assert.equal(plan.kind,'hide'); assert.deepEqual(plan.target,{x:-4,z:-3});
});
test('affectionate cats approach without targeting the same position as a friend', () => {
  const friend={x:2,z:0};
  const plan=chooseActivity(2,{x:0,z:0},[friend],pen,()=>.1);
  assert.equal(plan.kind,'rub'); assert.ok(Math.abs(Math.hypot(plan.target.x-friend.x,plan.target.z-friend.z)-.8)<1e-10);
  const vertical=chooseActivity(2,{x:0,z:0},[{x:0,z:.2}],pen,()=>.1);
  assert.equal(vertical.target.x,0); assert.ok(Math.abs(vertical.target.z + .6) < 1e-10);
});
test('lazy cats nap and sensitive cats notice close movement', () => {
  assert.equal(chooseActivity(5,{x:0,z:0},[],pen,()=>.9).kind,'nap');
  assert.equal(chooseActivity(7,{x:0,z:0},[{x:.5,z:0}],pen,()=>.1).kind,'alert');
});
test('social personalities can act alone and handle overlapping cats', () => {
  for (const personality of [2,6]) {
    const alone=chooseActivity(personality,{x:0,z:0},[],pen,()=>.1);
    assert.equal(alone.kind,'roam');
    const together=chooseActivity(personality,{x:0,z:0},[{x:0,z:0}],pen,()=>.1);
    assert.ok(Number.isFinite(together.target.x) && Number.isFinite(together.target.z));
  }
});

test('shy cats use the quietest available shelter and do not mutate the shelter list', () => {
  const shelters=[{id:'near',x:3,z:2},{id:'far',x:-3,z:-2}];
  const plan=chooseActivity(1,{x:0,z:0},[{x:3,z:2}],pen,()=>.9,shelters);
  assert.equal(plan.kind,'shelter');assert.equal(plan.shelterId,'far');
  assert.deepEqual(plan.target,{x:-3,z:-2});assert.equal(shelters[0].id,'near');
  assert.equal(chooseActivity(1,{x:0,z:0},[],pen,()=>.9,[]).kind,'hide');
});
test('social targets follow moving partners, clamp at fences, and keep partner identity', () => {
  const start={x:0,z:0}, friend={id:'friend',x:2,z:0};
  assert.equal(chooseActivity(2,start,[friend],pen,()=>.1).partnerId,'friend');
  assert.deepEqual(socialTarget(start,friend,pen),{x:1.2,z:0});
  assert.notDeepEqual(socialTarget(start,{...friend,z:2},pen),socialTarget(start,friend,pen));
  assert.deepEqual(socialTarget({x:10,z:3},{x:4,z:3},pen),{x:4,z:3});
  for(const activity of ['nap','hide','shelter','care','rub','pounce','greet']) assert.equal(canReceiveGreeting(activity),false);
  assert.equal(canReceiveGreeting('roam'),true);
});
